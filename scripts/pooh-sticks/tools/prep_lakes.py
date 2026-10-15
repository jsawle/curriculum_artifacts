"""Natural Earth 10m lakes → compact JSON for the flow model.
k = 'terminal' for lakes with no outlet to the sea (NE 'Alkaline Lake' plus a few named closed lakes), else 'lake'."""
import json, sys
from shapely.geometry import shape
src, out, tol, maxrank, marine = sys.argv[1], sys.argv[2], float(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
from shapely.ops import unary_union
from shapely.strtree import STRtree
m = json.load(open(marine))
sea_geoms = [shape(f['geometry']).buffer(0) for f in m['features'] if (f['properties'].get('name') or '') != 'Caspian Sea']
tree = STRtree(sea_geoms)
def near_sea(g, deg=0.2):
    for i in tree.query(g.buffer(deg)):
        if sea_geoms[i].distance(g) < deg: return True
    return False
CLOSED = {'North Aral Sea', 'South Aral Sea', 'Lake Chad', 'Lake Balkhash'}
OPEN = {'Great Bitter Lake', 'Lake Hammar'}   # tagged alkaline but connected to the sea
d = json.load(open(src))
res = []
for f in d['features']:
    p = f['properties']
    name = (p.get('name') or p.get('name_en') or '').strip()
    terminal = (p.get('featurecla') == 'Alkaline Lake' or name in CLOSED) and name not in OPEN
    if terminal and name not in CLOSED and near_sea(shape(f['geometry'])):
        terminal = False   # coastal lagoons (IJsselmeer, Vistula Lagoon...) connect to the sea
    if not terminal and (p.get('scalerank') is None or p['scalerank'] > maxrank):
        continue
    g = shape(f['geometry']).simplify(tol, preserve_topology=True)
    if g.is_empty: continue
    polys = [g] if g.geom_type == 'Polygon' else list(g.geoms)
    pp = []
    for poly in polys:
        rr = []
        for ring in [poly.exterior] + list(poly.interiors):
            flat = [v for xy in ring.coords for v in (round(xy[0], 3), round(xy[1], 3))]
            if len(flat) >= 8: rr.append(flat)
        if rr: pp.append(rr)
    if pp: res.append({'n': name or 'a lake', 'k': 'terminal' if terminal else 'lake', 'p': pp})
json.dump(res, open(out, 'w'), separators=(',', ':'))
print(len(res), 'lakes;', sum(1 for r in res if r['k'] == 'terminal'), 'terminal')
