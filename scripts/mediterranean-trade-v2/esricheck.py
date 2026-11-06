"""Check layers against the coastline the user actually sees: Esri World Terrain Base tiles (z10)."""
import math, requests, io, os, sys, numpy as np, geopandas as gpd
from PIL import Image
from concurrent.futures import ThreadPoolExecutor
from shapely.geometry import Point
Z=9; URL="https://services.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}"
os.makedirs('tiles/z9',exist_ok=True)
def tilexy(lon,lat):
    n=2**Z; fx=(lon+180)/360*n; fy=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n
    return int(fx),int(fy),int((fx%1)*256),int((fy%1)*256)
cache={}
def get(xy):
    x,y=xy; f=f'tiles/z9/{x}_{y}.jpg'
    if not os.path.exists(f):
        import time
        for t in range(4):
            try:
                r=requests.get(URL.format(z=Z,x=x,y=y),timeout=30); r.raise_for_status(); open(f,'wb').write(r.content); break
            except Exception:
                if t==3: raise
                time.sleep(2+3*t)
    return xy, np.array(Image.open(f).convert('RGB')).astype(int)
def is_sea(pts):
    need={tilexy(*p)[:2] for p in pts}-set(cache)
    with ThreadPoolExecutor(16) as ex:
        for xy,a in ex.map(get,need): cache[xy]=a
    out=[]
    for p in pts:
        x,y,px,py=tilexy(*p); a=cache[(x,y)]
        win=a[max(py-1,0):py+2,max(px-1,0):px+2].reshape(-1,3).mean(0)   # 3x3 px (~400 m) window
        out.append(win[1]-win[0]>15)
    return np.array(out)
def sample_line(g,step_km=0.5):
    from pyproj import Geod; G=Geod(ellps='WGS84'); pts=[]
    cs=list(g.coords)
    for a,b in zip(cs[:-1],cs[1:]):
        d=G.inv(a[0],a[1],b[0],b[1])[2]/1000; n=max(1,int(d/step_km))
        for i in range(n): t=i/n; pts.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
    pts.append(cs[-1]); return pts
if __name__=="__main__":
    R=gpd.read_file(sys.argv[1]); R=R[R['mode']=='sea']
    tot=0; landpts=0; rows=[]
    for _,r in R.iterrows():
        pts=sample_line(r.geometry); pts=pts[3:-3] if len(pts)>8 else pts   # skip 1.5 km harbour approaches
        sea=is_sea(pts); tot+=len(sea); landpts+=(~sea).sum()
        run=0; mx=0
        for s in sea: run=0 if s else run+1; mx=max(mx,run)
        if (~sea).sum(): rows.append(((~sea).sum()*0.5, mx*0.5, r['name']))
    print(f"{len(R)} sea routes, {tot} samples every 0.5 km; on Esri land: {landpts} ({100*landpts/tot:.2f}%)")
    for a,b,n in sorted(rows,reverse=True)[:25]: print(f"  {a:5.1f} km on land, longest run {b:4.1f} km | {n}")
