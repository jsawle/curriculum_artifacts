"""
Build app-ready grids for the Ice Age Europe app (v1).

Inputs (all downloaded into ../dl, treated as data only):
  - Gowan ICESHEET 2.0 repo (github.com/evangowan/icesheet, GPL-3.0):
      global/Eurasia/margins/<yr>.gmt      ice margins, 2.5 ka steps, 0-80 ka (PaleoMIST 1.0 / Gowan et al. 2021)
      global/Eurasia/topo/Eurasia.nc       RTopo-2 bed topography, 5 km median filtered, polar LAEA (WGS84)
      global/Eurasia/shear_stress/shear_stress_domains.gmt  basal shear stress domains (Pa)
      global/global_grid/Rtopo-2/filtered_bed_topo_0.25.nc  RTopo-2 global 0.25 deg (fallback outside Eurasia.nc)
  - gsloid repo (Spratt & Lisiecki 2016 sea level stack, NOAA file)
  - pyleoclim wheel: GISP2 d18O
  - Natural Earth 50m land + coastline (public domain)

Outputs to ../build/data
"""
import json, gzip, math, os, sys, heapq
import numpy as np
import netCDF4 as nc
from pyproj import Transformer
from scipy.ndimage import map_coordinates, distance_transform_edt
from matplotlib.path import Path
from shapely.geometry import shape, box, mapping, Polygon, MultiPolygon, LineString, MultiLineString
from shapely.ops import unary_union
import numba

SCR = sys.argv[1]  # scratchpad root
DL = os.path.join(SCR, "dl")
OUT = os.path.join(SCR, "build", "ice-age-europe", "data")
os.makedirs(OUT, exist_ok=True)
G = os.path.join(DL, "icesheet", "global")

# ---------------- target grid (regular lon/lat) ----------------
LON0, LON1, LAT0, LAT1 = -16.0, 35.0, 45.0, 73.5
DLON, DLAT = 0.16, 0.08
lons = np.arange(LON0, LON1 + 1e-9, DLON)
lats = np.arange(LAT0, LAT1 + 1e-9, DLAT)
W, H = len(lons), len(lats)
LON, LAT = np.meshgrid(lons, lats)  # row j = lat index (south -> north)
print("grid", W, H, W * H)

# ---------------- bed topography ----------------
laea = Transformer.from_crs("EPSG:4326", "+proj=laea +lat_0=90 +lon_0=0 +ellps=WGS84", always_xy=True)
d = nc.Dataset(os.path.join(G, "Eurasia", "topo", "Eurasia.nc"))
ex, ey, ez = d["x"][:].data, d["y"][:].data, d["z"][:].data.astype(np.float64)
X0, Y0 = laea.transform(-12.0, 47.0)  # GMT -Fe grid: coordinates relative to the region's lower-left corner
gx, gy = laea.transform(LON, LAT)
fi = (gx - X0 - ex[0]) / (ex[1] - ex[0])
fj = (gy - Y0 - ey[0]) / (ey[1] - ey[0])
inside = (fi >= 0) & (fi <= len(ex) - 1) & (fj >= 0) & (fj <= len(ey) - 1)
bed5 = map_coordinates(ez, [fj, fi], order=1, mode="nearest")
g25 = nc.Dataset(os.path.join(G, "global_grid", "Rtopo-2", "filtered_bed_topo_0.25.nc"))
glon, glat, gz = g25["lon"][:].data, g25["lat"][:].data, g25["z"][:].data.astype(np.float64)
bed25 = map_coordinates(gz, [(LAT - glat[0]) / (glat[1] - glat[0]), (LON - glon[0]) / (glon[1] - glon[0])], order=1)
# blend into the 0.25 deg grid over ~4 cells near the edge of Eurasia.nc coverage
dist_in = distance_transform_edt(inside)
w = np.clip(dist_in / 4.0, 0, 1)
bed = np.where(inside, w * bed5 + (1 - w) * bed25, bed25)
print("bed range", bed.min(), bed.max(), "fraction from 5 km grid", inside.mean())

def at(lon, lat):
    i = int(round((lon - LON0) / DLON)); j = int(round((lat - LAT0) / DLAT)); return bed[j, i]
for name, lo, la in [("Ben Nevis area", -5.0, 56.8), ("Dogger Bank", 2.0, 54.8), ("Norwegian Trench", 4.5, 58.6),
                     ("Gotland Deep", 20.0, 57.3), ("London", -0.1, 51.5), ("Galdhopiggen area", 8.3, 61.6)]:
    print(f"  check {name}: {at(lo, la):.0f} m")

# ---------------- margins ----------------
def read_gmt_rings(fn):
    rings, cur, kind = [], [], "P"
    for line in open(fn):
        s = line.strip()
        if not s:
            continue
        if s.startswith(">"):
            if cur: rings.append((kind, cur)); cur = []
            kind = "P"; continue
        if s.startswith("# @P"):
            if cur: rings.append((kind, cur)); cur = []
            kind = "P"; continue
        if s.startswith("# @H"):
            if cur: rings.append((kind, cur)); cur = []
            kind = "H"; continue
        if s.startswith("#"):
            continue
        a = s.split()
        cur.append((float(a[0]), float(a[1])))
    if cur: rings.append((kind, cur))
    return rings

pts = np.column_stack([LON.ravel(), LAT.ravel()])
def rasterise(rings):
    mask = np.zeros(W * H, bool)
    outer = None
    for kind, ring in rings:
        if len(ring) < 3: continue
        r = np.array(ring)
        if r[:, 0].max() < LON0 or r[:, 0].min() > LON1 or r[:, 1].max() < LAT0 or r[:, 1].min() > LAT1:
            inside_r = None
        else:
            inside_r = Path(r).contains_points(pts)
        if kind == "P":
            if outer is not None: mask |= outer
            outer = inside_r.copy() if inside_r is not None else np.zeros(W * H, bool)
        else:
            if inside_r is not None and outer is not None: outer &= ~inside_r
    if outer is not None: mask |= outer
    return mask.reshape(H, W)

TIMES = list(range(0, 80001, 2500))
masks = {}
for t in TIMES:
    masks[t] = rasterise(read_gmt_rings(os.path.join(G, "Eurasia", "margins", f"{t}.gmt")))
    print("margin", t, "ice cells", int(masks[t].sum()))

# ---------------- basal shear stress (Gowan domains, Pa) ----------------
def read_domains(fn):
    feats, cur, val = [], [], None
    for line in open(fn):
        s = line.strip()
        if s.startswith(">"):
            if cur and val is not None: feats.append((val, cur))
            cur = []; continue
        if s.startswith("# @D"):
            f = s[4:].split("|"); val = float(f[2]); continue
        if s.startswith("#") or not s: continue
        a = s.split(); cur.append((float(a[0]), float(a[1])))
    if cur and val is not None: feats.append((val, cur))
    return feats
doms = read_domains(os.path.join(G, "Eurasia", "shear_stress", "shear_stress_domains.gmt"))
gpts = np.column_stack([gx.ravel(), gy.ravel()])  # true LAEA coords (domains are not offset)
tau = np.full(W * H, np.nan)
for val, ring in doms:
    tau[Path(np.array(ring)).contains_points(gpts)] = val
tau = tau.reshape(H, W)
print("tau domains:", len(doms), "coverage", np.isfinite(tau).mean(), "range", np.nanmin(tau), np.nanmax(tau))
# outside all domains: nearest domain value
idx = distance_transform_edt(~np.isfinite(tau), return_distances=False, return_indices=True)
tau = tau[idx[0], idx[1]]

# ---------------- sea level curve ----------------
sl = []
for line in open(os.path.join(DL, "gsloid", "data-raw", "spratt2016.txt"), encoding="latin-1"):
    a = line.split("\t")
    if len(a) > 2 and a[0].strip().replace(".", "", 1).isdigit():
        sl.append((float(a[0]), float(a[1])))
sl = dict(sl)
# North Sea relative sea level from Hijma et al. 2025 for the Holocene (two stated anchors), Spratt & Lisiecki 2016 before 13 ka
curve = [(0.0, 0.0), (8.0, -15.0), (11.0, -50.0)]
curve += [(float(k), sl[k]) for k in sorted(sl) if 13 <= k <= 82]
curve.sort()
def sea_level(ka):
    xs = [c[0] for c in curve]; ys = [c[1] for c in curve]
    return float(np.interp(ka, xs, ys))
print("sea level at 20,15,12,11,10,9,8 ka:", [round(sea_level(k), 1) for k in (20, 15, 12, 11, 10, 9, 8)])

# ---------------- ice thickness: perfectly plastic (Nye) with bed, Dijkstra from the margin ----------------
RHO_I, RHO_W, GRAV = 917.0, 1028.0, 9.81
dyk = DLAT * 111320.0
dxk = DLON * 111320.0 * np.cos(np.radians(lats))  # per row

@numba.njit(cache=True)
def plastic(mask, bed, tau, dxrow, dy, S):
    Hh, Ww = mask.shape
    INF = 1e30
    E = np.full((Hh, Ww), INF)
    done = np.zeros((Hh, Ww), np.bool_)
    # heap as arrays (simple binary heap)
    cap = Hh * Ww * 8 + 16
    hk = np.empty(cap); hi = np.empty(cap, np.int64); n = 0
    for j in range(Hh):
        for i in range(Ww):
            if not mask[j, i]: continue
            edge = False
            for dj in (-1, 0, 1):
                for di in (-1, 0, 1):
                    jj, ii = j + dj, i + di
                    if jj < 0 or jj >= Hh or ii < 0 or ii >= Ww or not mask[jj, ii]:
                        edge = True
            if edge:
                b = bed[j, i]
                e0 = b
                if b < S:  # grounded marine margin: start at flotation thickness
                    e0 = b + (RHO_W / RHO_I) * (S - b)
                E[j, i] = e0
                # push
                k = n; n += 1; hk[k] = e0; hi[k] = j * Ww + i
                while k > 0:
                    p = (k - 1) // 2
                    if hk[p] <= hk[k]: break
                    hk[p], hk[k] = hk[k], hk[p]; hi[p], hi[k] = hi[k], hi[p]; k = p
    while n > 0:
        key = hk[0]; c = hi[0]
        n -= 1; hk[0] = hk[n]; hi[0] = hi[n]
        k = 0
        while True:
            l = 2 * k + 1; r = l + 1; m = k
            if l < n and hk[l] < hk[m]: m = l
            if r < n and hk[r] < hk[m]: m = r
            if m == k: break
            hk[m], hk[k] = hk[k], hk[m]; hi[m], hi[k] = hi[k], hi[m]; k = m
        j = c // Ww; i = c % Ww
        if done[j, i] or key > E[j, i]: continue
        done[j, i] = True
        Ec = E[j, i]; Hc = Ec - bed[j, i]
        if Hc < 0: Hc = 0.0
        for dj in (-1, 0, 1):
            for di in (-1, 0, 1):
                if dj == 0 and di == 0: continue
                jj, ii = j + dj, i + di
                if jj < 0 or jj >= Hh or ii < 0 or ii >= Ww: continue
                if not mask[jj, ii] or done[jj, ii]: continue
                dx = di * 0.5 * (dxrow[j] + dxrow[jj]); dyy = dj * dy
                ds = math.sqrt(dx * dx + dyy * dyy)
                kk = 0.5 * (tau[j, i] + tau[jj, ii]) * ds / (RHO_I * GRAV)
                Bn = bed[jj, ii]
                # (x - Ec) * (Hc + x - Bn) = 2 kk
                bq = Hc - Bn - Ec
                cq = -Ec * (Hc - Bn) - 2.0 * kk
                disc = bq * bq - 4.0 * cq
                x = (-bq + math.sqrt(max(disc, 0.0))) / 2.0
                if x < Bn: x = Bn
                if x < Ec: x = Ec if Ec > Bn else Bn  # surface does not fall inland
                if x < E[jj, ii]:
                    E[jj, ii] = x
                    k = n; n += 1; hk[k] = x; hi[k] = jj * Ww + ii
                    while k > 0:
                        p = (k - 1) // 2
                        if hk[p] <= hk[k]: break
                        hk[p], hk[k] = hk[k], hk[p]; hi[p], hi[k] = hi[k], hi[p]; k = p
    Hout = np.zeros((Hh, Ww))
    for j in range(Hh):
        for i in range(Ww):
            if mask[j, i] and E[j, i] < INF:
                h = E[j, i] - bed[j, i]
                Hout[j, i] = h if h > 0 else 0.0
    return Hout

thick = {}
for t in TIMES:
    S = sea_level(t / 1000.0)
    Hh = plastic(masks[t], bed, tau, dxk, dyk, S)
    thick[t] = Hh
    ice = masks[t]
    print(f"ice {t/1000:5.1f} ka  S={S:7.1f}  area={ice.sum()*0:.0f} max H={Hh.max():6.0f} m  mean H(ice)={Hh[ice].mean() if ice.any() else 0:6.0f} m")

# sanity check vs Patton et al. 2016 (Eurasian complex mean thickness ~1310 m at maximum, whole complex incl. Barents/Kara)
cell_area = (dxk[:, None] * dyk) * np.ones((1, W))
for t in (20000, 22500, 25000):
    ice = masks[t]
    a = (cell_area * ice).sum() / 1e6
    v = (cell_area * thick[t]).sum() / 1e9
    print(f"  {t} : area in region {a/1e6:.2f} M km2, volume {v/1e6:.2f} M km3, mean {1000*v/a if a else 0:.0f} m")

# ---------------- write binaries ----------------
def wgz(name, arr):
    raw = arr.tobytes()
    with gzip.open(os.path.join(OUT, name), "wb", compresslevel=9) as f:
        f.write(raw)
    print("wrote", name, len(raw), "->", os.path.getsize(os.path.join(OUT, name)))

wgz("bed.i16.gz", np.round(bed).astype("<i2"))
stack = np.stack([np.clip(np.round(thick[t] / 20.0), 0, 255).astype(np.uint8) for t in TIMES])
# cells inside the margin but with H rounding to 0 get 1 so the margin itself is kept
for k, t in enumerate(TIMES):
    s = stack[k]; s[(masks[t]) & (s == 0)] = 1
wgz("ice.u8.gz", stack)

# ---------------- Natural Earth land (for keeping present-day land dry) and coastline ----------------
NE = os.path.join(DL, "ne")
reg = box(LON0, LAT0, LON1, LAT1)
land = json.load(open(os.path.join(NE, "ne_50m_land.geojson")))
polys = []
for f in land["features"]:
    g = shape(f["geometry"]).intersection(reg)
    if g.is_empty: continue
    g = g.simplify(0.02, preserve_topology=True)
    for p in (g.geoms if hasattr(g, "geoms") else [g]):
        if isinstance(p, Polygon) and p.area > 0.02:
            polys.append([[round(x, 3), round(y, 3)] for x, y in p.exterior.coords])
coast = json.load(open(os.path.join(NE, "ne_50m_coastline.geojson")))
lines = []
for f in coast["features"]:
    g = shape(f["geometry"]).intersection(box(LON0 + 0.2, LAT0 + 0.2, LON1 - 0.2, LAT1 - 0.2))
    if g.is_empty: continue
    g = g.simplify(0.01)
    for l in (g.geoms if hasattr(g, "geoms") else [g]):
        if isinstance(l, LineString) and len(l.coords) > 2:
            lines.append([[round(x, 3), round(y, 3)] for x, y in l.coords])
json.dump({"land": polys, "coast": lines}, open(os.path.join(OUT, "coast.json"), "w"), separators=(",", ":"))
print("land rings", len(polys), "coast lines", len(lines), os.path.getsize(os.path.join(OUT, "coast.json")))

# ---------------- GISP2 d18O (0-82 ka) ----------------
gis = []
for line in open(os.path.join(DL, "pkgs", "py", "pyleoclim", "data", "GISP2_d18O.csv")).readlines()[1:]:
    dep, d18, age = line.strip().split(",")
    age = float(age)
    if 0 <= age <= 82000 and d18 not in ('', 'NaN', 'nan'):
        gis.append([round(age / 1000.0, 3), float(d18)])

meta = {
    "grid": {"lon0": LON0, "lat0": LAT0, "dlon": DLON, "dlat": DLAT, "W": W, "H": H, "rowOrder": "south-to-north"},
    "times": [t / 1000.0 for t in TIMES],
    "iceUnit": 20,
    "seaLevel": [[round(a, 3), round(b, 2)] for a, b in curve],
    "gisp2": gis,
}
json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"), separators=(",", ":"))
print("meta.json", os.path.getsize(os.path.join(OUT, "meta.json")))
np.save(os.path.join(SCR, "pipeline", "grids.npy"), {"bed": bed, "tau": tau, "thick": thick, "masks": masks}, allow_pickle=True)

# basal shear stress in kPa for the app (used to taper ice near a moving margin)
wgz("tau.u8.gz", np.clip(np.round(tau / 1000.0), 1, 255).astype(np.uint8))
