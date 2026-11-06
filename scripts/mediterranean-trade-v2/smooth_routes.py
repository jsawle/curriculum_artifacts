"""Smooth route lines into curves. Sea lanes: Gaussian smoothing along the line with the largest
strength that keeps 1 km clear of land (falls back per point near coasts/straits). Corridors: Catmull-Rom splines."""
import sys, numpy as np, geopandas as gpd
sys.path.insert(0,'/home/claude/work'); import router as R
from shapely.geometry import LineString, Point
from shapely.prepared import prep
from scipy.ndimage import gaussian_filter1d
from pyproj import Transformer
fwd=Transformer.from_crs(4326,"+proj=laea +lat_0=40 +lon_0=20",always_xy=True); inv=Transformer.from_crs("+proj=laea +lat_0=40 +lon_0=20",4326,always_xy=True)
LANDP=prep(R.LAND)
SIGMAS_KM=[40,25,15,9,5,3,1.5]
def seg_ok(a,b,ha,hb):
    seg=LineString([a,b])
    for h in (ha,hb): seg=seg.difference(Point(h).buffer(0.025))
    if seg.is_empty: return True
    return not R.CLEAR.intersects(seg) and not LANDP.intersects(seg)
def resample(xy,step=1000):
    d=np.r_[0,np.cumsum(np.hypot(*np.diff(xy,axis=0).T))]; n=max(2,int(d[-1]/step)+1)
    t=np.linspace(0,d[-1],n); return np.c_[np.interp(t,d,xy[:,0]),np.interp(t,d,xy[:,1])]
def smooth_sea(line):
    ll=np.array(line.coords); ha,hb=tuple(ll[0]),tuple(ll[-1])
    xy=resample(np.c_[fwd.transform(ll[:,0],ll[:,1])]); n=len(xy)
    if n<6: return line
    cands=[]
    for s in SIGMAS_KM:
        sg=s  # samples are 1 km apart
        sm=np.c_[gaussian_filter1d(xy[:,0],sg,mode='nearest'),gaussian_filter1d(xy[:,1],sg,mode='nearest')]
        i=np.arange(n); w=np.clip(np.minimum(i,n-1-i)/(2.5*sg),0,1)[:,None]   # ease in/out so the harbour ends stay put
        sm=xy+(sm-xy)*w
        cands.append(np.c_[inv.transform(sm[:,0],sm[:,1])])
    base=np.c_[inv.transform(xy[:,0],xy[:,1])]; cands.append(base)
    # per point: strongest smoothing whose adjacent segments are clear
    choice=np.full(n,len(cands)-1)
    for k in range(len(cands)-1,-1,-1):
        c=cands[k]
        ok=np.array([seg_ok(tuple(c[max(i-1,0)]),tuple(c[i]),ha,hb) and seg_ok(tuple(c[i]),tuple(c[min(i+1,n-1)]),ha,hb) for i in range(n)])
        # a point may take level k only if a small neighbourhood is also clear (avoids kinks)
        okw=np.convolve(ok.astype(float),np.ones(9)/9,mode='same')>0.999
        choice[okw]=k
    # blend levels smoothly: smooth the chosen level index, then take the stronger-clear of neighbours
    out=np.array([cands[choice[i]][i] for i in range(n)])
    # final check; any bad segment -> use the unsmoothed base locally
    for it in range(3):
        bad=[i for i in range(n-1) if not seg_ok(tuple(out[i]),tuple(out[i+1]),ha,hb)]
        if not bad: break
        for i in bad:
            for j in range(max(i-6,0),min(i+7,n)): out[j]=base[j]
    g=LineString([ha]+[tuple(p) for p in out[1:-1]]+[hb])
    s=g.simplify(0.0015)
    if all(seg_ok(a,b,ha,hb) for a,b in zip(s.coords[:-1],s.coords[1:])): g=s
    return g
def catmull(coords,per=24):
    P=np.array(coords,float)
    if len(P)<3: return LineString(P)
    P=np.vstack([P[0]*2-P[1],P,P[-1]*2-P[-2]]); out=[]
    for i in range(1,len(P)-2):
        p0,p1,p2,p3=P[i-1],P[i],P[i+1],P[i+2]
        for t in np.linspace(0,1,per,endpoint=False):
            t2,t3=t*t,t*t*t
            out.append(0.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3))
    out.append(P[-2]); return LineString(out).simplify(0.002)
if __name__=="__main__":
    src,dst=sys.argv[1],sys.argv[2]
    G=gpd.read_file(src)
    geoms=[]
    for i,r in G.iterrows():
        if r['mode']=='sea': geoms.append(smooth_sea(r.geometry))
        elif r['mode'] in ('land','river'): geoms.append(catmull(list(r.geometry.coords)))
        else: geoms.append(r.geometry)
        if i%40==0: print(i,flush=True)
    G['geometry']=geoms; G.to_file(dst,driver='GeoJSON'); print('done',len(G))
