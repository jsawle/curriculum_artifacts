"""v2 routes from open data: foundation links (Pleiades) + modelled coastal network + overland corridors."""
import json, sys, numpy as np, geopandas as gpd
sys.path.insert(0,'/home/claude/work'); import router as R
from shapely.geometry import LineString, Point
from scipy.sparse.csgraph import minimum_spanning_tree
from pyproj import Geod
G=Geod(ellps='WGS84')
d=json.load(open('/home/claude/v2src/v2_points.json')); pts=d['points']; links=d['links']
for n,p in pts.items(): R.COORDS[n]=(p['lon'],p['lat'])
R.HARB["Phocaea"]=(26.722,38.663,"Phocaea harbour")
def coast_km(n): return Point(R.COORDS[n]).distance(R.COAST)*111
coastal={n for n in pts if coast_km(n)<=15}
def side(a,b):
    if a!='Corinth': return None
    return 'W' if R.COORDS[b][0]<22.5 or R.COORDS[b][1]>39.5 and R.COORDS[b][0]<23 else 'E'
routes=[]; used={}; seen=set()
def add_sea(a,b,net,link_type,source):
    key=tuple(sorted([a,b]))
    if key in seen: 
        for r in routes:
            if r.get('_key')==key and link_type=='foundation': r.update(link_type='foundation',source=source)
        return
    seen.add(key)
    (ha,na),(hb,nb)=R.harbour(a,side(a,b)),R.harbour(b,side(b,a))
    used[(a,side(a,b))]=(ha,na); used[(b,side(b,a))]=(hb,nb)
    g=R.sea_path(ha,hb)
    routes.append(dict(_key=key,name=f"{a} – {b}",network=net,link_type=link_type,mode='sea',from_harbour=na,to_harbour=nb,certainty='indicative' if link_type=='foundation' else 'modelled',source=source,geometry=g))
# 1) foundation links (founder -> colony)
for l in links:
    a,b=l['founder'],l['colony']; net='Phoenician-Punic' if a in ('Tyre',) else 'Hellenic'
    add_sea(a,b,net,'foundation',l['source'])
# 2) modelled coastal network: minimum spanning tree + 2 nearest neighbours, per culture, coastal places only
def network(names,net,k=2,maxkm=1200):
    names=sorted(names); n=len(names); D=np.zeros((n,n))
    for i in range(n):
        for j in range(i+1,n):
            a,b=R.COORDS[names[i]],R.COORDS[names[j]]; D[i,j]=D[j,i]=G.inv(a[0],a[1],b[0],b[1])[2]/1000
    T=minimum_spanning_tree(D).toarray(); E=set()
    for i,j in zip(*np.nonzero(T)): E.add(tuple(sorted((i,j))))
    for i in range(n):
        for j in np.argsort(D[i])[1:k+1]:
            if D[i,j]<=maxkm: E.add(tuple(sorted((i,j))))
    for i,j in sorted(E):
        if D[i,j]<15: continue          # same harbour area (e.g. Athens and Phaleron)
        add_sea(names[i],names[j],net,'coastal',"Modelled: each place joined to its two nearest same-culture ports (plus a minimum spanning tree so the network connects); distances as the crow flies, lanes then routed at sea")
PH={n for n,p in pts.items() if p['network']=='Phoenician-Punic'}&coastal
HE={n for n,p in pts.items() if p['network']=='Hellenic'}&coastal
print('coastal Phoenician',len(PH),'Hellenic',len(HE))
network(PH,'Phoenician-Punic'); network(HE,'Hellenic')
# 3) port links for places whose harbour is away from the place
for (n,sd),(h,note) in used.items():
    if n=="Ictis (Cornwall)": continue
    if Point(R.COORDS[n]).distance(Point(h))*111>1.5 and n!='Naukratis':
        nm=f"{n} to its port"+(" (west)" if sd=='W' else " (east)" if sd=='E' else "")
        if any(r['name']==nm for r in routes): continue
        routes.append(dict(name=nm,network='Port link',link_type='port',mode='river' if n=='Tyras' else 'port',certainty='indicative',source=note,geometry=LineString([R.COORDS[n],h])))
# 4) river and overland corridors (named routes from the historical record)
routes.append(dict(name="Canopic Nile mouth – Naukratis – Memphis",network='River',link_type='corridor',mode='river',certainty='indicative',source="Along the Canopic branch of the Nile to Naukratis and Memphis (Pleiades: Naucratis lay on the Canopic branch)",geometry=LineString([R.HARB["Naukratis"][:2],(30.25,31.15),(30.45,31.02),R.COORDS['Naukratis'],(30.85,30.6),(31.08,30.2),(31.2,30.0),R.COORDS['Memphis']])))
routes.append(dict(name="Channel crossing (tin route)",network='Other',link_type='corridor',mode='sea',certainty='indicative',source="Britain to the Seine mouth; Diodorus (5.22) describes tin carried from Britain across to Gaul and overland to the Mediterranean",geometry=R.sea_path((-1.75,50.715),(0.15,49.46))))
CORR=[("Tin route via Gaul","Seine valley to Mont Lassois (indicative), after Diodorus 5.22",[(0.15,49.46),(1.09,49.44),(2.35,48.86),(4.08,48.30),R.COORDS['Vix / Mont Lassois']]),
 ("Amber Road","Baltic amber corridor to the head of the Adriatic (indicative; later Roman places used as waypoints)",[(20.1,54.9),(18.6,54.35),(18.1,51.76),(17.0,49.6),(16.86,48.11),(16.62,47.23),(14.51,46.05),(13.37,45.77),R.COORDS['Atria']]),
 ("Rhône–Saône route","Massalia up the Rhône and Saône to Mont Lassois (indicative)",[R.COORDS['Massilia'],(4.63,43.68),(4.83,45.76),(4.85,46.78),R.COORDS['Vix / Mont Lassois']]),
 ("Alpine passes route","Po valley to the upper Danube across the Alps (indicative)",[R.COORDS['Spina'],(11.34,44.49),(9.08,45.81),(9.02,46.19),(9.17,46.50),(9.53,46.85),(9.5,47.5),R.COORDS['Heuneburg']]),
 ("Pyrenean route","Emporion across the eastern Pyrenees into Gaul (indicative)",[R.COORDS['Emporion'],(2.9,42.7),(2.35,43.21),(1.44,43.6),(-0.55,44.84)]),
 ("Persian Royal Road","Sardis to Susa, broadly as described by Herodotus (5.52–54); line approximate",[R.COORDS['Sardis'],(31.99,39.65),(32.86,39.93),(35.63,38.85),(38.31,38.35),(40.23,37.91),(43.15,36.36),(44.01,36.19),(45.4,34.6),(47.3,33.2),R.COORDS['Susa']]),
 ("Incense Road","Petra south along western Arabia towards south Arabia (indicative)",[R.COORDS['Petra'],(36.5,28.4),(37.92,26.62),(39.61,24.47),(41.5,21.4),(44.13,17.49),(45.34,15.42)]),
 ("Sardis – Ephesus road","Inland road from the Lydian capital to its Ionian port (indicative)",[R.COORDS['Sardis'],(27.75,38.25),R.COORDS['Ephesus']])]
for n,src,c in CORR:
    routes.append(dict(name=n,network='Overland',link_type='corridor',mode='land',certainty='indicative',source=src,geometry=LineString(c)))
for r in routes: r.pop('_key',None)
gdf=gpd.GeoDataFrame(routes,crs=4326); gdf['length_km']=gdf.to_crs("+proj=laea +lat_0=40 +lon_0=20").length.div(1000).round(0)
gdf.to_file('/home/claude/out_v2/trade_routes.geojson',driver='GeoJSON')
print(len(gdf),'routes',gdf.groupby(['link_type','network']).size().to_dict())
