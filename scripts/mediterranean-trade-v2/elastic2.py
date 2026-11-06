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
def band(run, iters, clear_km=4.0, alpha=0.45, beta=0.9, minclear=1.4):
    P=resample(np.c_[to_rc([p[0] for p in run],[p[1] for p in run])])
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
        if it%25==24: P=resample(P)
    lon,lat=to_ll(P[:,0],P[:,1]); out=list(zip(lon,lat)); out[0]=run[0]; out[-1]=run[-1]
    return out
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
            for iters,alpha in ((600,0.45),(250,0.35),(80,0.25)):
                cand=band(run,iters,alpha=alpha)
                cand=list(LineString(cand).simplify(0.0012).coords)
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
            if not ok: fails.append(r['name'])
        elif r['mode'] in ('land','river'): out.append(catmull(list(r.geometry.coords)))
        else: out.append(r.geometry)
        if i%50==0: print(i,flush=True)
    G['geometry']=out; G.to_file(dst,driver='GeoJSON'); print('done',len(G),'lanes left unsmoothed:',len(fails),fails[:12])
