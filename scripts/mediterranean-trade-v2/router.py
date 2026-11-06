"""v1.1 routing: sea lanes kept off land with clearance, strait centrelines, harbour endpoints, port links."""
import numpy as np, sys, json
sys.path.insert(0,'work'); from sites import SITES
import geopandas as gpd
from shapely.geometry import Point, LineString, box, MultiLineString
from shapely.ops import nearest_points, unary_union
from shapely.prepared import prep
from rasterio import features
from rasterio.transform import from_origin
from skimage.graph import MCP_Geometric
from scipy.ndimage import distance_transform_edt
P="+proj=laea +lat_0=40 +lon_0=20"
landg=gpd.read_file('/home/claude/ne/land.geojson').clip(box(-16,22,52,57)); landg['geometry']=landg.make_valid()
LAND=unary_union(list(landg.geometry))
COAST=LAND.boundary
# ---- strait centrelines (lon,lat); corridors are carved as water and exempt from the clearance test
STRAITS=json.load(open("/home/claude/work/straits.json"))  # centrelines computed from the coastline (work/straits.py)
CORR=unary_union([LineString(c).buffer(0.004) for c in STRAITS.values()])
# ---- harbours: where the sea lane meets the coast. Default = nearest coast point to the hub.
HARB={ # name: (lon,lat, note)
 "Athens":(23.675,37.925,"Phaleron bay, the port of Athens (Piraeus from the 5th century BCE)"),
 "Corinth W":(22.885,37.937,"Lechaion, Corinth's port on the Gulf of Corinth"),
 "Corinth E":(22.995,37.884,"Kenchreai, Corinth's port on the Saronic Gulf"),
 "Sparta":(22.566,36.755,"Gytheion, the port of Sparta"),
 "Delphi":(22.446,38.428,"Kirrha, the port of Delphi"),
 "Cyrene":(21.972,32.905,"Apollonia, the port of Cyrene"),
 "Naukratis":(30.07,31.32,"Canopic mouth of the Nile (Abu Qir bay)"),
 "Tyras":(30.47,46.07,"Mouth of the Dniester estuary"),
 "Tanais":(39.18,47.14,"Mouth of the Don delta"),
 "Miletos":(27.16,37.525,"Off the Büyük Menderes delta; Miletus's ancient harbours have silted up and now lie about 8 km inland"),
 "Atria":(12.353,45.103,"Off the Po delta; ancient Atria (Adria) was a port, but the delta has since grown about 25 km seaward"),
 "Olbia":(31.927,46.651,"In the Bug estuary off Olbia"),
 "Motya":(12.399,37.871,"Outside the Stagnone lagoon; Motya lies on a small island inside it"),
 "Utica":(10.25,37.05,"Off the Medjerda coast; ancient Utica's harbour has silted up"),
 "Tartessos":(-6.99,37.13,"Mouth of the Tinto–Odiel estuary at Huelva (Tartessos location debated)"),
}
SILTED={"Ephesus","Miletos","Utica","Spina","Atria","Tarsos","Istros"}  # note added to harbour
COORDS={}
def hub_ll(n):
    if n in COORDS: return COORDS[n]
    v=SITES[n]; return (v[2],v[1])
def harbour(n, side=None):
    key = f"{n} {side}" if side else n
    if key in HARB: return HARB[key][:2], HARB[key][2]
    if n=="Ictis (Cornwall)": return (-5.478,50.112),"St Michael's Mount (proposed site of Ictis)"
    p=Point(hub_ll(n)); q=nearest_points(p,COAST)[1]
    note="Nearest point on today's coast" + ("; the ancient shoreline was closer (silted since)" if n in SILTED else "")
    return (q.x,q.y), note
# ---- sea grid
res=0.01; W,S,E,N=-14,24,46,51
nx,ny=int(round((E-W)/res)),int(round((N-S)/res)); tr=from_origin(W,N,res,res)
Lr=features.rasterize(landg.geometry,out_shape=(ny,nx),transform=tr,fill=0,default_value=1,all_touched=True).astype(bool)
Cr=features.rasterize([CORR],out_shape=(ny,nx),transform=tr,fill=0,default_value=1,all_touched=True).astype(bool)
Lr[Cr]=False
dist_km=distance_transform_edt(~Lr)*res*111*np.cos(np.deg2rad(38))
cost=1+6*np.clip((4-dist_km)/4,0,1)          # stay 4 km+ off the coast where the sea allows
cost[Cr]=1.0; cost[Lr]=np.inf
def rc(lo,la): return int((N-la)/res),int((lo-W)/res)
def ll(r,c): return (W+(c+0.5)*res, N-(r+0.5)*res)
seaidx=np.argwhere(~Lr)
from scipy.spatial import cKDTree; KD=cKDTree(seaidx)
def snap(lo,la,min_km=2.0):
    # nearest sea cell at least min_km from land (so the lane starts clear of the shore)
    r,c=rc(lo,la); ok=(~Lr)&(dist_km>=min_km)
    rr,cc=np.nonzero(ok[max(r-60,0):r+60,max(c-60,0):c+60])
    if len(rr)==0: _,i=KD.query([r,c]); return tuple(seaidx[i])
    rr=rr+max(r-60,0); cc=cc+max(c-60,0); i=np.argmin((rr-r)**2+(cc-c)**2); return (rr[i],cc[i])
CLEAR=prep(LAND.buffer(0.012).difference(CORR))   # ~1 km clearance test
def visible(a,b,ha,hb):
    seg=LineString([a,b])
    for h in (ha,hb):  # allow the approach within 2.5 km of a harbour
        seg=seg.difference(Point(h).buffer(0.025))
    return seg.is_empty or not CLEAR.intersects(seg)
def raw_path(ha,hb):
    s=snap(*ha); t=snap(*hb)
    r0,r1=sorted([s[0],t[0]]); c0,c1=sorted([s[1],t[1]])
    for m in (150,400,900,3000):
        R0,R1,C0,C1=max(r0-m,0),min(r1+m,ny),max(c0-m,0),min(c1+m,nx)
        sub=cost[R0:R1,C0:C1]; mcp=MCP_Geometric(sub)
        ss=(s[0]-R0,s[1]-C0); tt=(t[0]-R0,t[1]-C0)
        cum,_=mcp.find_costs([ss],[tt])
        if np.isfinite(cum[tt]): break
    return [ll(r+R0,c+C0) for r,c in mcp.traceback(tt)]
def pull(pts,ha,hb):
    out=[pts[0]]; i=0
    while i<len(pts)-1:
        j=min(len(pts)-1,i+400)
        while j>i+1 and not visible(pts[i],pts[j],ha,hb): j-= max(1,(j-i)//6)
        out.append(pts[j]); i=j
    return out
SPOLY={k:LineString(v).buffer(0.02) for k,v in STRAITS.items()}
def sea_path(ha,hb,depth=0):
    pts=[ha]+raw_path(ha,hb)+[hb]
    # does the lane use a strait? then route to its ends and splice in the exact centreline
    if depth<3:
        for k,poly in SPOLY.items():
            pp=prep(poly); inside=[i for i,p in enumerate(pts) if pp.contains(Point(p))]
            if len(inside)>15 and not pp.contains(Point(ha)) and not pp.contains(Point(hb)):
                c=STRAITS[k]; a0,a1=c[0],c[-1]
                if Point(ha).distance(Point(a0))>Point(ha).distance(Point(a1)): c=c[::-1]
                leg1=sea_path(ha,tuple(c[0]),depth+1); leg2=sea_path(tuple(c[-1]),hb,depth+1)
                return LineString(list(leg1.coords)+[tuple(x) for x in c[1:-1]]+list(leg2.coords))
            # one end lies inside the strait/gulf: follow its centreline from the open end
            ina,inb=pp.contains(Point(ha)),pp.contains(Point(hb))
            if ina!=inb and len(inside)>15:
                inner,outer=(ha,hb) if ina else (hb,ha)
                c=STRAITS[k]
                if Point(inner).distance(Point(c[0]))<Point(inner).distance(Point(c[-1])): c=c[::-1]   # c[-1] nearest the inner end
                cl=LineString(c); cut=cl.project(Point(inner)); from shapely.ops import substring
                part=list(substring(cl,0,cut).coords)
                leg=sea_path(outer,tuple(part[0]),depth+1)
                seq=list(leg.coords)+[tuple(x) for x in part[1:]]+[inner]
                if not ina: return LineString(seq)
                return LineString(seq[::-1])
    return LineString(pull(pts,ha,hb))
