"""v2.2 lane drawing: least-cost sea path (no strait splicing), then adaptive Gaussian smoothing whose strength varies
gradually along the lane: as strong as possible while the lane keeps >= min(1 km, 80% of the raw lane's own clearance)
from land, and never crosses land outside the 2.5 km harbour approaches."""
import sys, numpy as np
sys.path.insert(0,'/home/claude/work'); import router as R
from shapely.geometry import LineString, Point
from shapely.prepared import prep
from scipy.ndimage import gaussian_filter1d, map_coordinates, minimum_filter1d
from pyproj import Transformer
fwd=Transformer.from_crs(4326,"+proj=laea +lat_0=40 +lon_0=20",always_xy=True); inv=Transformer.from_crs("+proj=laea +lat_0=40 +lon_0=20",4326,always_xy=True)
LANDP=prep(R.LAND)
D=np.where(np.isfinite(R.dist_km),R.dist_km,0.0)
SIG=np.array([0,1,2,3,5,7,10,14,20,28,40,60,90,130],float)     # km (samples are 1 km apart)
def rc(lon,lat): return np.vstack([(R.N-np.asarray(lat))/R.res-0.5,(np.asarray(lon)-R.W)/R.res-0.5])
def dist_at(lon,lat): return map_coordinates(D,rc(lon,lat),order=1,mode='nearest')
def resample(xy,step=1000.0):
    d=np.r_[0,np.cumsum(np.hypot(*np.diff(xy,axis=0).T))]; n=max(3,int(d[-1]/step)+1); t=np.linspace(0,d[-1],n)
    return np.c_[np.interp(t,d,xy[:,0]),np.interp(t,d,xy[:,1])]
CL={k:LineString(v) for k,v in R.STRAITS.items()}
CLP={k:prep(LineString(v).buffer(0.02)) for k,v in R.STRAITS.items()}
def raw_lane(ha,hb):
    raw=[ha]+R.raw_path(ha,hb)+[hb]
    # inside a strait, sit exactly on its centreline (worked out from the coastline)
    from shapely.ops import nearest_points
    out=[]
    for k,p in enumerate(raw):
        q=Point(p)
        if 0<k<len(raw)-1:
            for n_,pp in CLP.items():
                if pp.contains(q): q=nearest_points(q,CL[n_])[1]; break
        out.append((q.x,q.y))
    return out
def lane(ha,hb):
    A=np.array(raw_lane(ha,hb)); xy=resample(np.c_[fwd.transform(A[:,0],A[:,1])]); n=len(xy)
    lo,la=inv.transform(xy[:,0],xy[:,1]); d_raw=dist_at(lo,la)
    i=np.arange(n); from_end=np.minimum(i,n-1-i).astype(float)
    need=np.minimum(1.0,0.8*d_raw); need[from_end<2.5]=0.0
    def curve(sig):                       # variable-strength Gaussian: blend precomputed levels by local sigma
        out=np.empty_like(xy)
        k1=np.searchsorted(SIG,sig).clip(1,len(SIG)-1); k0=k1-1; f=((sig-SIG[k0])/(SIG[k1]-SIG[k0])).clip(0,1)
        return C[k0,i]*(1-f)[:,None]+C[k1,i]*f[:,None]
    C=[]
    for s_ in SIG:
        if s_==0: C.append(xy.copy()); continue
        sm=np.c_[gaussian_filter1d(xy[:,0],s_,mode='nearest'),gaussian_filter1d(xy[:,1],s_,mode='nearest')]
        w=np.clip(from_end/(2.0*s_),0,1)[:,None]**2; C.append(xy+(sm-xy)*w)
    C=np.array(C)
    # strongest valid sigma at each point (valid over a +-3 km window)
    smax=np.zeros(n)
    for k,s_ in enumerate(SIG):
        lo_,la_=inv.transform(C[k][:,0],C[k][:,1]); okk=dist_at(lo_,la_)>=need-1e-6
        good=minimum_filter1d(okk.astype(int),7)==1; smax[good]=s_
    def envelope(sv,slope=0.5):          # sigma may change by at most `slope` km per km along the lane
        e=sv.copy()
        for j in range(1,n): e[j]=min(e[j],e[j-1]+slope)
        for j in range(n-2,-1,-1): e[j]=min(e[j],e[j+1]+slope)
        return e
    sig=envelope(smax)
    for it in range(6):
        out=curve(sig); lo,la=inv.transform(out[:,0],out[:,1]); pts=list(zip(lo,la))
        bad=dist_at(lo,la)<need-1e-6
        for j in range(n-1):
            if from_end[j]>=2.5 and from_end[j+1]>=2.5 and LANDP.intersects(LineString([pts[j],pts[j+1]])): bad[j]=bad[j+1]=True
        if not bad.any(): break
        for j in np.nonzero(bad)[0]: smax[max(j-3,0):j+4]=np.minimum(smax[max(j-3,0):j+4],sig[j]*0.5)
        sig=envelope(smax)
    safe=curve(sig).copy()          # passed the exact land test in the loop above
    # push any point still too close to land straight away from the coast (instead of falling back to the grid path)
    out=curve(sig)
    GR,GC=np.gradient(D)
    for it in range(40):
        lo,la=inv.transform(out[:,0],out[:,1]); dd=dist_at(lo,la); bad=(dd<need-1e-6)&(from_end>=2.5)
        if not bad.any(): break
        r_,c_=rc(lo,la); gr=map_coordinates(GR,[r_,c_],order=1); gc=map_coordinates(GC,[r_,c_],order=1); nrm=np.hypot(gr,gc)+1e-9
        r_[bad]+=0.25*gr[bad]/nrm[bad]; c_[bad]+=0.25*gc[bad]/nrm[bad]
        lo2=R.W+(c_+0.5)*R.res; la2=R.N-(r_+0.5)*R.res; xx,yy=fwd.transform(lo2,la2); out=np.c_[xx,yy]
        if it%8==7:
            sm=np.c_[gaussian_filter1d(out[:,0],1.0,mode='nearest'),gaussian_filter1d(out[:,1],1.0,mode='nearest')]; out[from_end>=2.5]=sm[from_end>=2.5]
    # final de-jitter: local Laplacian smoothing, rejecting any move that breaks the clearance rule
    for it in range(120):
        lap=np.zeros_like(out); lap[1:-1]=(out[:-2]+out[2:])/2-out[1:-1]
        cand=out+0.5*lap; cand[from_end<2.5]=out[from_end<2.5]
        lo_,la_=inv.transform(cand[:,0],cand[:,1]); okc=dist_at(lo_,la_)>=need-1e-6
        out[okc]=cand[okc]
    # exact coastline test; failing stretches go back to the last land-checked version
    for it in range(8):
        lo,la=inv.transform(out[:,0],out[:,1]); pts=list(zip(lo,la)); badj=[]
        for j in range(n-1):
            if from_end[j]>=2.5 and from_end[j+1]>=2.5 and LANDP.intersects(LineString([pts[j],pts[j+1]])): badj.append(j)
        if not badj: break
        for j in badj:
            a,b=max(j-4-2*it,0),min(j+5+2*it,n); out[a:b]=safe[a:b]
    lo,la=inv.transform(out[:,0],out[:,1]); pts=list(zip(lo,la))
    pts[0]=tuple(ha); pts[-1]=tuple(hb)
    g=LineString(pts); s2=g.simplify(0.0004)
    def landfree(G):
        for a,b in zip(list(G.coords)[:-1],list(G.coords)[1:]):
            seg=LineString([a,b]).difference(Point(ha).buffer(0.025)).difference(Point(hb).buffer(0.025))
            if not seg.is_empty and LANDP.intersects(seg): return False
        return True
    return s2 if landfree(s2) else g
