"""Second imagery probe: NOAA tile addressing and zoom levels, NOAA download index, Sentinel-2 scene search by time."""
import io, json, os, re, time, urllib.parse, urllib.request
from datetime import datetime, timezone
OUT = "data/imagery-probe"; os.makedirs(OUT + "/tiles", exist_ok=True)
UA = {"User-Agent": "helene-imagery-probe (education app)", "Origin": "https://jsawle.github.io"}
rep = []
def log(*a): s = " ".join(map(str, a)); print(s, flush=True); rep.append(s)
def get(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read(), {k.lower(): v for k, v in r.headers.items()}, r.status
import math
def tile(lat, lon, z):
    x = int((lon + 180) / 360 * 2 ** z); r = math.radians(lat)
    return x, int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** z)
def fill(b):
    from PIL import Image
    im = Image.open(io.BytesIO(b)); mode = im.mode; im = im.convert("RGBA"); px = list(im.getdata())
    real = sum(1 for p in px if p[3] > 10 and not (min(p[:3]) > 245) and not (max(p[:3]) < 8))
    return round(real / len(px), 2), mode, im.size

log("# Imagery probe 2", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%MZ"))
# WMTS capabilities: exact ResourceURL and TileMatrix range for the inland layers
try:
    b, h, st = get("https://storms.ngs.noaa.gov/storms/helene/services/WMTSCapabilities.xml")
    x = b.decode("utf-8", "replace"); open(OUT + "/noaa_wmts.xml", "w").write(x)
    for L in ["20241005a-rgb", "20241006a-rgb", "20241007a-rgb"]:
        i = x.find(f"<ows:Identifier>{L}</ows:Identifier>")
        blk = x[max(0, i - 600): i + 2500]
        res = re.findall(r'template="([^"]+)"', blk); tms = re.findall(r"<TileMatrixSet>([^<]+)</TileMatrixSet>", blk)
        lim = re.findall(r"<TileMatrix>([^<]+)</TileMatrix>", blk)
        log(f"- {L}: ResourceURL {res[:2]} TileMatrixSet {tms[:2]} limits {lim[:3]}..{lim[-2:]}")
    zs = re.findall(r"<ows:Identifier>(\d+)</ows:Identifier>\s*<ScaleDenominator>", x)
    log("TileMatrix identifiers in GoogleMapsCompatible:", (zs[:3], zs[-3:]) if zs else "none found")
except Exception as e: log("WMTS failed", e)

# Tiles: several zooms and both row conventions at three towns
TOWNS = {"Chimney Rock": (35.4393, -82.2468), "Swannanoa": (35.5980, -82.3990), "Biltmore Village": (35.5680, -82.5440), "Marshall": (35.7973, -82.6843)}
log("\n| town | layer | z | xyz fill | tms fill | content-type | bytes |"); log("|---|---|---|---|---|---|---|")
for t, (la, lo) in TOWNS.items():
    for L in ["20241005a-rgb", "20241006a-rgb", "20241007a-rgb"]:
        for z in (12, 14, 16, 18):
            x, y = tile(la, lo, z); out = []
            for yy in (y, 2 ** z - 1 - y):
                try:
                    b, h, st = get(f"https://stormscdn.ngs.noaa.gov/{L}/{z}/{x}/{yy}", 30)
                    f, mode, size = fill(b); out.append((f, h.get("content-type"), len(b)))
                    if f > 0.2 and z >= 16: open(f"{OUT}/tiles/{t.replace(' ', '_')}_{L}_{z}.png", "wb").write(b)
                except Exception as e: out.append((None, str(e)[:40], 0))
                time.sleep(0.05)
            log(f"| {t} | {L} | {z} | {out[0][0]} | {out[1][0]} | {out[0][1]} | {out[0][2]} |")

# NOAA download index (which areas the inland flights really covered)
try:
    b, h, st = get("https://noaa-eri-pds.s3.amazonaws.com/?list-type=2&prefix=2024_Hurricane_Helene/downloads/&max-keys=200")
    keys = re.findall(r"<Key>([^<]+)</Key>", b.decode()); log("\nNOAA downloads folder:", keys[:60])
    for L in ["20241005a", "20241006a", "20241007a", "20241008a", "20241005b", "20241006b"]:
        b, h, st = get(f"https://noaa-eri-pds.s3.amazonaws.com/?list-type=2&prefix=2024_Hurricane_Helene/{L}_RGB/&max-keys=1000")
        ks = re.findall(r"<Key>([^<]+)</Key>", b.decode())
        cells = sorted({re.sub(r"^.*C(\d{7})w(\d{6})n\.tif$", r"\1w \2n", k.split('/')[-1]) for k in ks if k.endswith(".tif")})
        log(f"- {L}: {len(ks)} files; image cells (lon w / lat n, ddmmss): {cells[:400]}")
except Exception as e: log("S3 listing failed", e)

# Sentinel-2 scenes by time parameter
try:
    base = "https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer/query?"
    t0 = int(datetime(2024, 8, 15, tzinfo=timezone.utc).timestamp() * 1000); t1 = int(datetime(2024, 10, 31, tzinfo=timezone.utc).timestamp() * 1000)
    p = {"f": "json", "where": "1=1", "time": f"{t0},{t1}", "geometry": "-82.6,35.4,-82.2,35.7", "geometryType": "esriGeometryEnvelope",
         "inSR": 4326, "spatialRel": "esriSpatialRelIntersects", "outFields": "objectid,acquisitiondate,cloudcover,name,tile_id,category",
         "returnGeometry": "false", "resultRecordCount": 200}
    b, h, st = get(base + urllib.parse.urlencode(p)); j = json.loads(b)
    if "error" in j: log("S2 error", j["error"])
    fs = sorted(j.get("features", []), key=lambda f: f["attributes"].get("acquisitiondate") or 0)
    log(f"\nSentinel-2 scenes over Asheville–Chimney Rock, 15 Aug–31 Oct 2024: {len(fs)}")
    for f in fs:
        a = f["attributes"]; d = a.get("acquisitiondate")
        log(f"- {datetime.fromtimestamp(d/1000, timezone.utc):%Y-%m-%d %H:%M} cloud {a.get('cloudcover')} oid {a.get('objectid')} {a.get('name')} cat {a.get('category')}")
except Exception as e: log("S2 failed", e)
open(OUT + "/report2.md", "w").write("\n".join(rep) + "\n")
