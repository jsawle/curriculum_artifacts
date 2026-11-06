"""Esri World Terrain Base z9 sea mask for a bbox, as a lon/lat raster (True = sea)."""
import math, numpy as np
from esricheck import get, cache
Z=9
def mask(W,S,E,N,res=0.002):
    lons=np.arange(W+res/2,E,res); lats=np.arange(N-res/2,S,-res)
    LO,LA=np.meshgrid(lons,lats); n=2**Z
    fx=(LO+180)/360*n; fy=(1-np.arcsinh(np.tan(np.radians(LA)))/np.pi)/2*n
    tx,ty=fx.astype(int),fy.astype(int); px,py=((fx%1)*256).astype(int),((fy%1)*256).astype(int)
    need={(a,b) for a,b in zip(tx.ravel(),ty.ravel())}-set(cache)
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(16) as ex:
        for xy,a in ex.map(get,need): cache[xy]=a
    out=np.zeros(LO.shape,bool)
    for (a,b) in {(a,b) for a,b in zip(tx.ravel(),ty.ravel())}:
        sel=(tx==a)&(ty==b); t=cache[(a,b)]; v=t[py[sel],px[sel]]; out[sel]=(v[:,1]-v[:,0])>15
    return out,lons,lats
def best_sea_point(lon,lat,min_km=1.0,search=0.15):
    from scipy.ndimage import distance_transform_edt
    m,lons,lats=mask(lon-search,lat-search,lon+search,lat+search)
    d=distance_transform_edt(m)*0.002*111*math.cos(math.radians(lat))
    ok=np.argwhere(d>=min_km)
    if not len(ok): return None
    LO=lons[ok[:,1]]; LA=lats[ok[:,0]]; i=np.argmin((LO-lon)**2+(LA-lat)**2); return (round(float(LO[i]),3),round(float(LA[i]),3))
if __name__=="__main__":
    for n,(lo,la,mk) in {"Atria":(12.30,45.05,1.5),"Olbia":(31.93,46.67,0.6),"Spina":(12.25,44.71,1.0)}.items():
        print(n, best_sea_point(lo,la,mk,0.25))
