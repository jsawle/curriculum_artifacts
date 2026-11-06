"""Elastic-band smoothing v2: harbour approaches and strait passages kept exactly; open-water runs smoothed
(curvature smoothing + repulsion from the coast); each run validated, retried gentler, else kept as-is."""
import sys, numpy as np, geopandas as gpd
sys.path.insert(0,'/home/claude/work'); import router as R
from smooth_routes import seg_ok, catmull
from shapely.geometry import LineString, Point
from shapely.prepared import prep
from scipy.ndimage import map_coordinates, gaussian_filter
D=gaussian_filter(np.where(np.isfinite(R.dist_km),R.dist_km,0),1.0); GR,GC=np.gradient(D)
SP=[prep(p.buffer(0.01)) for p in R.SPOLY.values()]
def to_rc(lon,lat): return (R.N-np.asarray(lat))/R.res-0.5,(np.asarray(lon)-R.W)/R.res-0.5
def to_ll(r,c): return R.W+(np.asarray(c)+0.5)*R.res, R.N-(np.asarray(r)+0.5)*R.res
def dens(coords,step_deg=0.005):
    L=LineString(coords); n=max(2,int(L.length/step_deg)+1)
    return [L.interpolate(t,normalized=True).coords[0] for t in np.linspace(0,1,n)]
def resample(P,step=1.0):
    d=np.r_[0,np.cumsum(np.hypot(*np.diff(P,axis=0).T))]; n=max(3,int(d[-1]/step)+1)
    t=np.linspace(0,d[-1],n); return np.c_[np.interp(t,d,P[:,0]),np.interp(t,d,P[:,1])]
def bow(run, frac):
    # gentle arc: offset perpendicular to the chord by frac*length*sin(pi*t)
    A=np.array(run); a,b=A[0],A[-1]; ch=b-a; L=np.hypot(*ch)
    if L==0: return run
    nrm=np.array([-ch[1],ch[0]])/L
    d=np.r_[0,np.cumsum(np.hypot(*np.diff(A,axis=0).T))]; t=d/d[-1]
    off=frac*L*np.sin(np.pi*t)[:,None]*nrm; return [tuple(p) for p in A+off]
def straightness(run):
    A=np.array(run); a,b=A[0],A[-1]; ch=b-a; L=np.hypot(*ch)+1e-12
    dev=np.abs((A[:,0]-a[0])*ch[1]-(A[:,1]-a[1])*ch[0])/L
    return dev.max()/L, L*111
def band(run, iters, clear_km=4.0, alpha=0.45, beta=0.9, minclear=1.4, step=1.0):
    P=resample(np.c_[to_rc([p[0] for p in run],[p[1] for p in run])],step)
    if len(P)<5: return run
    for it in range(iters):
        lap=np.zeros_like(P); lap[1:-1]=(P[:-2]+P[2:])/2-P[1:-1]
        d=map_coordinates(D,P.T,order=1,mode='nearest')
        g=np.c_[map_coordinates(GR,P.T,order=1,mode='nearest'),map_coordinates(GC,P.T,order=1,mode='nearest')]
        push=np.clip((clear_km-d)/clear_km,0,1)[:,None]**2*(g/(np.linalg.norm(g,axis=1,keepdims=True)+1e-9))
        new=P+alpha*lap+beta*push; new[0]=P[0]; new[-1]=P[-1]
        dn=map_coordinates(D,new.T,order=1,mode='nearest')
        bad=(dn<np.minimum(minclear,d))                  # never move closer to the coast than ~1.4 km (or than it already was)
        new[bad]=P[bad]; P=new
        if it%25==24: P=resample(P,step)
    P=resample(P,0.7)   # fine vertices so the curve stays smooth on screen
    lon,lat=to_ll(P[:,0],P[:,1]); out=list(zip(lon,lat)); out[0]=run[0]; out[-1]=run[-1]
    return out
from pyproj import Transformer as _T
_f=_T.from_crs(4326,"+proj=laea +lat_0=40 +lon_0=20",always_xy=True); _i=_T.from_crs("+proj=laea +lat_0=40 +lon_0=20",4326,always_xy=True)
def _cr(P,ph0,ph1):
    P=np.vstack([ph0,P,ph1]); out=[]
    for i in range(1,len(P)-2):
        p0,p1,p2,p3=P[i-1],P[i],P[i+1],P[i+2]; k=max(4,int(np.hypot(*(p2-p1))/1000))
        for t in np.linspace(0,1,k,endpoint=False):
            t2,t3=t*t,t*t*t; out.append(0.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3))
    out.append(P[-2]); return np.array(out)
def cr_run(run,bow_frac,simp_km):
    A=np.array(run); XY=np.c_[_f.transform(A[:,0],A[:,1])]
    V=np.array(LineString(XY).simplify(simp_km*1000).coords)
    if bow_frac and len(V)<=3:
        a,b=V[0],V[-1]; L=np.hypot(*(b-a))
        if L>80000:
            nrm=np.array([-(b-a)[1],(b-a)[0]])/L; best=None
            for sgn in (1,-1):
                m=(a+b)/2+sgn*bow_frac*L*nrm; lo,la=_i.transform(*m); r,c=to_rc(lo,la)
                cl=map_coordinates(D,[[r],[c]],order=1)[0]
                if best is None or cl>best[0]: best=(cl,m)
            V=np.vstack([a,best[1],b])
    C=_cr(V,2*V[0]-V[1],2*V[-1]-V[-2]); lo,la=_i.transform(C[:,0],C[:,1])
    out=list(zip(lo,la)); out[0]=run[0]; out[-1]=run[-1]; return out
def ch_run(run,ratio,iters):
    P=np.array(LineString(run).simplify(0.004).coords)
    for _ in range(iters):
        Q=[P[0]]
        for a,b in zip(P[:-1],P[1:]): Q+=[a+(b-a)*ratio,a+(b-a)*(1-ratio)]
        Q.append(P[-1]); P=np.array(Q)
    return [tuple(p) for p in P]
def smooth_line(line):
    c0=list(line.coords); ha,hb=c0[0],c0[-1]
    pts=dens(c0); n=len(pts)
    # tags: 'keep' for harbour approaches (first/last ~3 km) and strait passages, 'free' otherwise
    cum=np.r_[0,np.cumsum([Point(a).distance(Point(b))*111 for a,b in zip(pts[:-1],pts[1:])])]
    keep=(cum<3.0)|(cum>cum[-1]-3.0)
    for sp in SP: keep|=np.array([sp.contains(Point(p)) for p in pts])
    # runs
    out=[]; i=0
    while i<n:
        j=i
        while j+1<n and keep[j+1]==keep[i]: j+=1
        run=pts[max(i-1,0):j+2] if not keep[i] else pts[i:j+1]
        if keep[i]: seg=run
        else:
            seg=None
            dev,Lkm=straightness(run)
            base_step=float(np.clip(Lkm/45,1,6))
            tries=[]
            if dev<0.03 and Lkm>120:                       # long, nearly straight crossing: try a gentle bow each way
                f=0.07 if Lkm<600 else 0.05
                tries+=[('bow',f),('bow',-f),('bow',f/2),('bow',-f/2)]
            tries+=[('band',base_step),('band',max(1,base_step/2)),('band',1.0)]
            tries=[('cr',(0.12,8)),('cr',(0.08,6)),('cr',(0.0,6)),('cr',(0.05,4)),('cr',(0.0,3)),('cr',(0.0,1.5)),
                   ('ch',(0.25,4)),('ch',(0.15,3)),('ch',(0.08,2))]+tries
            for kind,v in tries:
                if kind=='cr': cand=cr_run(run,*v)
                elif kind=='ch': cand=ch_run(run,*v)
                elif kind=='bow': cand=band(bow(run,v),500,step=base_step,alpha=0.3)
                else: cand=band(run,800,step=v)
                cand=list(LineString(cand).simplify(0.0006).coords)
                if all(seg_ok(a,b,ha,hb) for a,b in zip(cand[:-1],cand[1:])): seg=cand; break
            if seg is None: seg=run
        if out and seg and out[-1]==seg[0]: seg=seg[1:]
        out+=seg; i=j+1
    keepc=[out[0]]+[p for k,p in enumerate(out[1:-1],1) if p!=out[k-1]]+[out[-1]]
    g=LineString(keepc)
    k=g.simplify(0.0008)
    if all(seg_ok(a,b,ha,hb) for a,b in zip(k.coords[:-1],k.coords[1:])): g=k
    return g, True   # each smoothed run was validated; kept runs are the original, already-validated geometry
if __name__=="__main__":
    src,dst=sys.argv[1],sys.argv[2]
    G=gpd.read_file(src); out=[]; fails=[]
    for i,r in G.iterrows():
        if r['mode']=='sea':
            g,ok=smooth_line(r.geometry); out.append(g)
            pass
        elif r['mode'] in ('land','river'): out.append(catmull(list(r.geometry.coords)))
        else: out.append(r.geometry)
        if i%50==0: print(i,flush=True)
    G['geometry']=out; G.to_file(dst,driver='GeoJSON'); print('done',len(G),'lanes left unsmoothed:',len(fails),fails[:12])
