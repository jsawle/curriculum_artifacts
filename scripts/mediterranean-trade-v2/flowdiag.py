"""Flow diagnostics per sea lane: sharpest turn (over ~3 km), number of sharp corners (>35 deg), and back-tracking (km moving away from the destination)."""
import sys, numpy as np, geopandas as gpd
from pyproj import Transformer
fwd=Transformer.from_crs(4326,"+proj=laea +lat_0=40 +lon_0=20",always_xy=True)
def resample(xy,step):
    d=np.r_[0,np.cumsum(np.hypot(*np.diff(xy,axis=0).T))]; n=max(3,int(d[-1]/step)+1); t=np.linspace(0,d[-1],n)
    return np.c_[np.interp(t,d,xy[:,0]),np.interp(t,d,xy[:,1])]
def metrics(g):
    ll=np.array(g.coords); xy=np.c_[fwd.transform(ll[:,0],ll[:,1])]; P=resample(xy,1000)
    if len(P)<8: return 0,0,0
    h=np.unwrap(np.arctan2(np.diff(P[:,1]),np.diff(P[:,0])))
    turn=np.degrees(np.abs(h[3:]-h[:-3]))          # heading change over 3 km
    sharp=0; i=0
    while i<len(turn):
        if turn[i]>35: sharp+=1; i+=6
        else: i+=1
    dest=P[-1]; dd=np.hypot(*(P-dest).T); back=np.clip(np.diff(dd),0,None).sum()/1000
    t1=np.degrees(np.abs(np.diff(h)))[3:-3]           # heading change over 1 km, harbour ends excluded
    global JIT; JIT.append(((t1>20).sum(), len(t1)))
    return turn.max(), sharp, back
JIT=[]
if __name__=="__main__":
    G=gpd.read_file(sys.argv[1]); G=G[G['mode']=='sea']
    rows=[(r['name'],*metrics(r.geometry)) for _,r in G.iterrows()]
    T=np.array([r[1] for r in rows]); S=np.array([r[2] for r in rows]); B=np.array([r[3] for r in rows])
    j=np.array(JIT); print(f"kinks (heading change >20 deg within 1 km): {j[:,0].sum()} at {j[:,0].sum()/j[:,1].sum()*1000:.1f} per 1000 km; lanes with any kink: {(j[:,0]>0).sum()}")
    print(f"{len(rows)} lanes | lanes with a turn >35deg in 3 km: {(T>35).sum()} | sharp corners total: {S.sum()} | lanes back-tracking >5 km: {(B>5).sum()} (total {B.sum():.0f} km)")
    for r in sorted(rows,key=lambda r:-(r[2]*10+r[3]))[:int(sys.argv[2]) if len(sys.argv)>2 else 12]: print(f"   max turn {r[1]:5.0f} | sharp {r[2]:2d} | back {r[3]:6.1f} km | {r[0]}")
