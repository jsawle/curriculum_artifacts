"""Probe: which post-Helene imagery and damage layers can the app use? (run by .github/workflows/helene-imagery-probe.yml)
Writes data/imagery-probe/report.md and probe.json. Standard library plus Pillow (to check that tiles are not blank)."""
import io, json, os, time, traceback, urllib.parse, urllib.request
from datetime import datetime, timezone

OUT = "data/imagery-probe"; os.makedirs(OUT, exist_ok=True)
ORIGIN = "https://jsawle.github.io"
UA = {"User-Agent": "helene-imagery-probe (education app)", "Origin": ORIGIN}
report, probe = [], {}
def log(*a):
    s = " ".join(str(x) for x in a); print(s, flush=True); report.append(s)
def get(url, params=None, timeout=60, raw=False):
    if params: url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        b = r.read(); h = {k.lower(): v for k, v in r.headers.items()}
        return (b, h, r.status) if raw else json.loads(b.decode("utf-8", "replace"))
def safe(name, fn):
    try: return fn()
    except Exception as e:
        log(f"**{name} failed**: {e}"); return None

TOWNS = {"Chimney Rock": (35.4393, -82.2468), "Swannanoa": (35.5980, -82.3990), "Biltmore Village": (35.5680, -82.5440),
         "Marshall": (35.7973, -82.6843), "Spruce Pine": (35.9154, -82.0646), "Erwin TN": (36.1451, -82.4168),
         "Hot Springs": (35.8929, -82.8279), "Old Fort": (35.6290, -82.1790), "Black Mountain": (35.6179, -82.3212),
         "Lake Lure": (35.4276, -82.2051), "Bat Cave": (35.4515, -82.2855), "Newport TN": (35.9670, -83.1877)}
NOAA = ["20241005a-rgb", "20241005b-rgb", "20241006a-rgb", "20241006b-rgb", "20241007a-rgb", "20241008a-rgb"]

def tile(lat, lon, z):
    import math
    x = int((lon + 180) / 360 * 2 ** z); r = math.radians(lat)
    y = int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** z); return x, y

def fill(b):
    from PIL import Image
    im = Image.open(io.BytesIO(b)).convert("RGBA"); px = im.getdata(); n = len(px)
    real = sum(1 for p in px if p[3] > 10 and not (p[0] > 245 and p[1] > 245 and p[2] > 245) and not (p[0] < 8 and p[1] < 8 and p[2] < 8))
    return round(real / n, 2), im.size

# 1. NOAA tiles: coverage at each town (z15 and z17) and CORS
log("# Helene imagery probe", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%MZ"))
log("\n## 1. NOAA emergency response imagery tiles (stormscdn.ngs.noaa.gov)")
noaa = {}
log("| town | " + " | ".join(NOAA) + " |"); log("|---|" + "---|" * len(NOAA))
cors_seen = None
for t, (la, lo) in TOWNS.items():
    row = []
    for L in NOAA:
        x, y = tile(la, lo, 16)
        try:
            b, h, st = get(f"https://stormscdn.ngs.noaa.gov/{L}/16/{x}/{y}", raw=True, timeout=30)
            f, size = fill(b) if h.get("content-type", "").startswith("image") else (0, None)
            cors_seen = cors_seen or h.get("access-control-allow-origin")
            row.append(f"{int(f * 100)}%"); noaa.setdefault(t, {})[L] = f
        except Exception as e:
            row.append("–"); noaa.setdefault(t, {})[L] = None
        time.sleep(0.1)
    log(f"| {t} | " + " | ".join(row) + " |")
log(f"\nPercent = share of the z16 tile at the town centre that has imagery (not blank). CORS header on tiles: {cors_seen!r}")
probe["noaa"] = noaa; probe["noaa_cors"] = cors_seen

# 2. ArcGIS items: url, access and whether the service answers
log("\n## 2. Layers on ArcGIS Online")
ITEMS = {"nconemap_2025": "892b6918ea7446ea97ce5fe65f32d73a", "ncdot_asheville_0929": "7e02244645cf47a9ae24129acad5e9fa",
         "ncdot_i40_i26_0929": "89b33a0fa0c8463ca35cb7b09ea5731b", "ncdot_lakelure_0929": "18d49055db544e9fa14a47f0b9236029",
         "ncdot_us74_gerton_lakelure_1017": "83abfa2bb9f545eeac0013014b970b63", "ncdot_yancey_mitchell_n": "9bc42618a16a40438f0cd8746ce45733",
         "ncdot_yancey_mitchell_s": "b022e7e46c604b6dacfb14dea2efe0e8", "ncdot_avery_1007": "096163b7a48743358a908405eb097fb3",
         "ncdot_watauga_1009": "0c791af318a644e8a7710e61cfef171f", "ncdot_haywood": "933fb3252fb5491db7a64a8a7ea1e673",
         "unca_post_helene": "505e4adf671a44228d22c47444974bd7", "usfs_forest_impacts": "5b9f5cf87a4b4ab8a1765e91ab419f4a",
         "usfs_ndvi_all_lands": "e738710729aa4e28b57894207d686d9e", "nc_landslides": "10209ea129584a548c957b7ad1a02249",
         "ncdot_structures": "096b6f792f1b49edaec4454522009553", "sentinel2_views": "fd61b9e0c69c4e14bebd50a9a968348c",
         "noaa_wmts_fdep_0928a": "1c88ebfeb8ba415bb07165889a986110"}
items = {}
for k, iid in ITEMS.items():
    def one():
        it = get(f"https://www.arcgis.com/sharing/rest/content/items/{iid}", {"f": "json"})
        rec = {"title": it.get("title"), "type": it.get("type"), "url": it.get("url"), "access": it.get("access"),
               "owner": it.get("owner"), "extent": it.get("extent"), "license": (it.get("licenseInfo") or "")[:300],
               "credit": it.get("accessInformation"), "typeKeywords": it.get("typeKeywords")}
        if rec["url"] and "error" not in it:
            try:
                s = get(rec["url"], {"f": "json"})
                rec["service_error"] = s.get("error")
                rec["service"] = {kk: s.get(kk) for kk in ("name", "serviceDescription", "maxImageWidth", "singleFusedMapCache", "spatialReference", "fullExtent", "extent", "layers", "capabilities", "pixelType", "bandCount") if kk in s}
                if "layers" in s: rec["service"]["layers"] = [{"id": l["id"], "name": l["name"]} for l in s["layers"]][:20]
                if "tileInfo" in s: rec["service"]["tiled"] = True; rec["service"]["lods"] = len(s["tileInfo"].get("lods", []))
            except Exception as e:
                rec["service_error"] = str(e)
        items[k] = rec
        log(f"- **{k}**: {rec['title']} ({rec['type']}, {rec['access']}) {rec['url']} → {'OK' if not rec.get('service_error') else 'ERROR ' + str(rec['service_error'])[:120]}")
    safe(k, one)
probe["items"] = items

# 3. Sentinel-2 scenes over the mountains, late Aug to Oct 2024
log("\n## 3. Sentinel-2 scenes (Esri Living Atlas Sentinel-2 Views)")
def s2():
    url = (items.get("sentinel2_views") or {}).get("url") or "https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer"
    meta = get(url, {"f": "json"}); fields = [f["name"] for f in meta.get("fields", [])]
    log("Fields: " + ", ".join(fields[:40]))
    dfield = next((f for f in fields if f.lower() in ("acquisitiondate", "acquisition_date", "acquisitiondatetime")), None)
    cfield = next((f for f in fields if "cloud" in f.lower()), None)
    q = get(url + "/query", {"f": "json", "where": f"{dfield} >= DATE '2024-08-15' AND {dfield} <= DATE '2024-10-31'",
             "geometry": "-82.9,35.3,-82.0,35.95", "geometryType": "esriGeometryEnvelope", "inSR": 4326, "spatialRel": "esriSpatialRelIntersects",
             "outFields": "*", "returnGeometry": "false", "orderByFields": dfield, "resultRecordCount": 200})
    rows = []
    for f in q.get("features", []):
        a = f["attributes"]; d = a.get(dfield)
        rows.append({"oid": a.get("objectid") or a.get("OBJECTID"), "date": datetime.fromtimestamp(d / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M") if d else None,
                     "cloud": a.get(cfield), "name": a.get("name") or a.get("Name"), "tile": a.get("tileid") or a.get("mgrs")})
    for r in rows: log(f"- {r['date']} cloud {r['cloud']} oid {r['oid']} {r['name']} {r['tile']}")
    if q.get("error"): log("error " + json.dumps(q["error"]))
    return {"url": url, "date_field": dfield, "cloud_field": cfield, "scenes": rows}
probe["sentinel2"] = safe("sentinel2", s2)

# 4. Wayback: which release shows each town before Helene, and does any later release show it after?
log("\n## 4. World Imagery Wayback: capture date at each town, per release (2023–2026)")
def wb():
    cfg = get("https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json")
    rel = []
    for num, r in cfg.items():
        title = r.get("itemTitle", ""); d = title.split("Wayback ")[-1].rstrip(")") if "Wayback" in title else ""
        if d[:4] in ("2023", "2024", "2025", "2026"):
            rel.append({"num": int(num), "date": d, "itemURL": r.get("itemURL"), "meta": r.get("metadataLayerUrl"), "itemID": r.get("itemID")})
    rel.sort(key=lambda r: r["date"])
    log(f"{len(rel)} releases from 2023 on: " + ", ".join(f"{r['date']}({r['num']})" for r in rel))
    out = {}
    for r in rel:
        for t, (la, lo) in TOWNS.items():
            try:
                res = get(r["meta"] + "/identify", {"f": "json", "geometry": f"{lo},{la}", "geometryType": "esriGeometryPoint", "sr": 4326,
                          "layers": "all", "tolerance": 0, "mapExtent": f"{lo-0.01},{la-0.01},{lo+0.01},{la+0.01}", "imageDisplay": "800,600,96", "returnGeometry": "false"})
                best = None
                for x in res.get("results", []):
                    a = x.get("attributes", {})
                    d = a.get("SRC_DATE2") or a.get("SRC_DATE") or a.get("Source Date")
                    res_m = a.get("SRC_RES") or a.get("Resolution (m)")
                    if d and (best is None or float(res_m or 99) < float(best[1] or 99)): best = (d, res_m, a.get("NICE_NAME") or a.get("SRC_DESC") or a.get("Source"))
                out.setdefault(t, {})[r["date"]] = best
            except Exception as e:
                out.setdefault(t, {})[r["date"]] = f"err {e}"
            time.sleep(0.05)
    for t in TOWNS:
        changes, last = [], None
        for r in rel:
            v = out[t].get(r["date"]); key = v[0] if isinstance(v, tuple) and v else str(v)
            if key != last: changes.append(f"{r['date']}: {v}"); last = key
        log(f"- **{t}**: " + " → ".join(changes))
    return {"releases": rel, "capture": out}
probe["wayback"] = safe("wayback", wb)

with open(f"{OUT}/probe.json", "w") as f: json.dump(probe, f, indent=1, default=str)
with open(f"{OUT}/report.md", "w") as f: f.write("\n".join(report) + "\n")
