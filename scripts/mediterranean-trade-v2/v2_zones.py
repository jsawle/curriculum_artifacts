"""v2 zones from open data only: coastal bands around Pleiades-attested sites (CC BY 3.0); Persian extent from AWMC (ODbL 1.0)."""
import json, pandas as pd, geopandas as gpd
from shapely.geometry import box, Point, MultiPolygon
from shapely.ops import unary_union
P="+proj=laea +lat_0=40 +lon_0=20"
L=gpd.read_file('/home/claude/ne/land.geojson').clip(box(-20,15,65,60)).to_crs(P); L['geometry']=L.make_valid(); land=unary_union(list(L.geometry)); coast=land.boundary
E=pd.read_csv('/home/claude/v2src/evidence_sites.csv')
NOISE={'Damascus','Zancle/Messana','Laodicea',"Kuntillat 'Ajrud",'Col. Tarraco','Myriand(r)os'}   # descriptions mention the culture for later periods or in passing
E=E[~E.title.isin(NOISE)]
pts=json.load(open('/home/claude/v2src/v2_points.json'))['points']
def pt(lon,lat): return gpd.GeoSeries([Point(lon,lat)],crs=4326).to_crs(P).iloc[0]
def sites(culture,network):
    s=[(r.title,pt(r.lon,r.lat),'Pleiades description',r.uri) for r in E[E.culture==culture].itertuples()]
    s+=[(n,pt(p['lon'],p['lat']),'Trading hub / colony',p.get('pleiades_uri','')) for n,p in pts.items() if p['network']==network]
    return s
def parts(g,mn):
    return MultiPolygon([p for p in getattr(g,'geoms',[g]) if p.geom_type=='Polygon' and p.area/1e6>=mn])
def coastal_zone(S, reach_km=40, band_km=25, site_km=15, max_coast_km=30):
    S=[s for s in S if s[1].distance(coast)/1000<=max_coast_km]
    near=coast.intersection(unary_union([s[1].buffer(reach_km*1000) for s in S]))
    g=unary_union([near.buffer(band_km*1000), unary_union([s[1].buffer(site_km*1000) for s in S])]).intersection(land)
    g=g.buffer(4000).buffer(-4000).simplify(500).intersection(land)
    return parts(g,50), S
def land_zone(S, site_km=20, close_km=15):
    g=unary_union([s[1].buffer(site_km*1000) for s in S]).buffer(close_km*1000).buffer(-close_km*1000).simplify(800).intersection(land)
    return parts(g,100), S
rows=[]
for name,cult,net,fn,desc in [
  ("Phoenician-Punic settlement zone","Phoenician-Punic","Phoenician-Punic",coastal_zone,"Coast within 40 km of a Phoenician or Punic site of 700–350 BCE, 25 km inland"),
  ("Greek settlement zone","Greek","Hellenic",coastal_zone,"Coast within 40 km of a Greek site of 700–350 BCE, 25 km inland"),
  ("Etruscan zone","Etruscan","Etruscan",land_zone,"Land within 20 km of an Etruscan site of 700–350 BCE, gaps under 30 km closed")]:
    g,S=fn(sites(cult,net))
    rows.append(dict(name=name,culture=cult,period="c. 700-350 BCE",method=desc,evidence_sites=len(S),
        evidence_list='; '.join(sorted({s[0] for s in S}))[:4000],
        source="Sites: Pleiades gazetteer (CC BY 3.0), culture from Pleiades descriptions, dated by Pleiades locations overlapping 700–350 BCE; coastline: Natural Earth 10m (public domain)",
        licence="CC BY 3.0 (Pleiades) - attribution required",certainty="modelled",geometry=g))
Z=gpd.GeoDataFrame(rows,crs=P); Z['area_km2']=Z.area.div(1e6).round(0); Z.to_crs(4326).to_file('/home/claude/out_v2/zones_of_settlement.geojson',driver='GeoJSON')
print(Z[['name','evidence_sites','area_km2']])
# Persian extent: AWMC (ODbL), clipped to the same coastline
A=gpd.read_file('/home/claude/lic/awmc/Cultural-Data/political_shading/persian_extent/extent_of_the_persian_empire.geojson').to_crs(P)
A['geometry']=A.make_valid(); a=unary_union(list(A.geometry)).buffer(2000).buffer(-2000).intersection(land.union(box(*land.bounds).difference(land).intersection(unary_union(list(A.geometry)).buffer(0)) if False else land))
a=parts(a.simplify(800).intersection(land),200)
Pz=gpd.GeoDataFrame([dict(name="Achaemenid Persian Empire (maximum extent)",period="c. 500 BCE",
  source="Ancient World Mapping Center, AWMC geodata: political_shading/persian_extent (ODbL 1.0); clipped to the Natural Earth 10m coastline",
  licence="ODbL 1.0 - attribution and share-alike; this file is released under ODbL",certainty="as published by AWMC",geometry=a)],crs=P)
Pz['area_km2']=Pz.area.div(1e6).round(0); Pz.to_crs(4326).to_file('/home/claude/out_v2/persian_empire.geojson',driver='GeoJSON'); print('Persian',Pz.area_km2.iloc[0])
