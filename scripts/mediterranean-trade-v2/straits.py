"""Compute strait centrelines from the coastline: fine raster, path that maximises distance from both shores."""
import numpy as np, json, geopandas as gpd
from shapely.geometry import box, LineString
from rasterio import features
from rasterio.transform import from_origin
from scipy.ndimage import distance_transform_edt
from skimage.graph import MCP_Geometric
# name: bbox (W,S,E,N), start (lon,lat) and end in open water
SP={"Bosporus":((28.90,40.93,29.25,41.30),(29.14,41.27),(28.97,40.96)),
    "Dardanelles":((26.10,39.95,27.00,40.55),(26.12,39.99),(26.95,40.52)),
    "Strait of Messina":((15.45,37.90,15.80,38.35),(15.68,38.32),(15.50,37.95)),
    "Rion straits":((21.55,38.20,22.05,38.45),(22.00,38.36),(21.60,38.27)),
    "Kerch Strait":((36.30,44.95,36.85,45.55),(36.70,45.50),(36.40,45.00)),
    "Gulf of Izmit (Hersek narrows)":((29.15,40.62,29.95,40.85),(29.20,40.70),(29.90,40.76)),
    "Strait of Gibraltar":((-6.2,35.75,-5.2,36.25),(-6.15,35.95),(-5.25,36.05))}
land=gpd.read_file('ne/land.geojson',bbox=(15,35,40,46)); land2=gpd.read_file('ne/land.geojson',bbox=(-7,35,-5,37))
land=gpd.GeoDataFrame(geometry=list(land.geometry)+list(land2.geometry),crs=4326); land['geometry']=land.make_valid()
out={}
for n,(bb,a,b) in SP.items():
    res=0.001; W,S,E,N=bb; nx,ny=int((E-W)/res),int((N-S)/res); tr=from_origin(W,N,res,res)
    L=features.rasterize(land.clip(box(*bb)).geometry,out_shape=(ny,nx),transform=tr,fill=0,default_value=1,all_touched=True).astype(bool)
    # also respect the Esri basemap coastline (z9), if a water path still exists
    import sys; sys.path.insert(0,'/home/claude'); from esrimask import mask
    em,elo,ela=mask(W,S,E,N,0.002)
    rr=np.clip(((N-(np.arange(ny)+.5)*res)-ela[0])/-0.002,0,len(ela)-1).astype(int); cc=np.clip(((W+(np.arange(nx)+.5)*res)-elo[0])/0.002,0,len(elo)-1).astype(int)
    EL=~em[np.ix_(rr,cc)]
    from skimage.graph import MCP_Geometric as _M
    LL=L|EL; rc0=lambda lo,la:(int((N-la)/res),int((lo-W)/res))
    c2=np.where(LL,np.inf,1.0); m2=_M(c2); cum2,_=m2.find_costs([rc0(*a)],[rc0(*b)])
    if not LL[rc0(*a)] and not LL[rc0(*b)] and np.isfinite(cum2[rc0(*b)]): L=LL; print(n,'using NE + Esri coastline')
    else: print(n,'Esri mask closes the strait at z9; NE only')
    d=distance_transform_edt(~L)*res*111*0.78
    cost=np.where(L,np.inf,1/(d+0.05)**2)
    rc=lambda lo,la:(int((N-la)/res),int((lo-W)/res))
    s,t=rc(*a),rc(*b)
    if L[s] or L[t]: print(n,"endpoint on land!",L[s],L[t])
    m=MCP_Geometric(cost); cum,_=m.find_costs([s],[t])
    if not np.isfinite(cum[t]): print(n,"NO WATER PATH at 0.001 deg"); continue
    p=m.traceback(t); pts=[(W+(c+.5)*res,N-(r+.5)*res) for r,c in p]
    ln=LineString(pts).simplify(0.002); mind=min(d[r,c] for r,c in p)
    out[n]=list(ln.coords); print(f"{n}: {len(ln.coords)} pts, narrowest clearance {mind:.2f} km")
json.dump(out,open('work/straits.json','w'))
