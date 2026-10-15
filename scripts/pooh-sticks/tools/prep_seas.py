"""Simplify Natural Earth 10m marine polygons into a compact JSON for embedding.
Natural Earth is public domain. Output: [{n,c,r,p}] where p = list of polygons,
each polygon = list of rings, each ring = flat [lon,lat,lon,lat,...] rounded to 3 dp."""
import json, sys
from shapely.geometry import shape, mapping
src, out, tol = sys.argv[1], sys.argv[2], float(sys.argv[3])
d = json.load(open(src))
res = []
for f in d['features']:
    p = f['properties']
    name = (p.get('name_en') or p.get('name') or '').strip()
    if not name:
        continue
    g = shape(f['geometry']).simplify(tol, preserve_topology=True)
    if g.is_empty:
        continue
    polys = [g] if g.geom_type == 'Polygon' else list(g.geoms)
    pp = []
    for poly in polys:
        rings = [poly.exterior] + list(poly.interiors)
        rr = []
        for ring in rings:
            flat = []
            for x, y in ring.coords:
                flat += [round(x, 3), round(y, 3)]
            if len(flat) >= 8:
                rr.append(flat)
        if rr:
            pp.append(rr)
    if pp:
        res.append({'n': name, 'c': p.get('featurecla'), 'r': p.get('scalerank'), 'p': pp})
json.dump(res, open(out, 'w'), separators=(',', ':'))
print(len(res), 'features')
