"""Build data/helene-rivers.json for helene-2024.html: main rivers (flow direction) and USGS river flow.

Run by .github/workflows/helene-rivers.yml, or by hand:
  python scripts/fetch_helene_rivers.py              # fetch from the services
  python scripts/fetch_helene_rivers.py --from DIR   # reuse a saved probe (rivers.json, usgs-iv.json, usgs-peaks.json)
  ... --out PATH                                     # write somewhere else (the rivers lab reads data/helene-rivers-lab.json)
Standard library only.

Sources
  NHDPlus V2.1 flowlines, hosted by Esri (services.arcgis.com/P3ePLMYs2RVChkJx .../NHDPlusV21/FeatureServer/2).
    Lines are drawn upstream to downstream (checked: 4,845 of 4,894 reach ends meet the start of the next reach).
    QE_MA = NHDPlus mean annual flow estimate (cfs), used only to share a gauge's flow along its river.
  USGS 15-minute discharge (00060, cfs) and stage (00065, ft), approved data, waterservices.usgs.gov (legacy service,
    retiring early 2027; this snapshot does not depend on it once saved).
  USGS annual peak-flow file: Helene peak and the highest peak before Helene.
"""
import json, math, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

T0 = datetime(2024, 9, 24, 12, tzinfo=timezone.utc)
HOURS = 108
BBOX = (-83.35, 34.95, -81.55, 36.25)        # the part of the study area the map shows
UA = {"User-Agent": "helene-rivers (education app; github.com/jsawle/curriculum_artifacts)"}
NHD = "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/NHDPlusV21/FeatureServer/2"
RIVERS = ["French Broad River", "Swannanoa River", "Mills River", "Nolichucky River", "Toe River", "North Toe River",
          "South Toe River", "Pigeon River", "West Fork Pigeon River", "Catawba River", "Linville River", "Johns River",
          "Broad River", "Watauga River", "Cane River", "Ivy Creek", "Hominy Creek", "Doe River", "Tuckasegee River",
          "Rocky Broad River", "Green River"]
# smaller rivers fetched down to stream order 3 (everything else from order 4)
LOW_ORDER = ["South Toe River", "North Toe River", "Toe River", "Cane River", "Rocky Broad River", "Ivy Creek", "Hominy Creek", "Swannanoa River"]
# rivers drawn even where no flow gauge fits: shown for direction only (grey, steady arrows), never with a guessed flow
DIRECTION_ONLY = {"North Toe River", "Toe River", "Cane River", "Rocky Broad River", "Green River"}
# NHDPlus name -> other names the USGS uses for the same river
ALIASES = {"Ivy Creek": ["Ivy River"]}
MAXF = 3          # a gauge's flow is shared only along stretches whose mean annual flow is within 3x of the gauge's
# the river-gauge columns in the app (they also need stage)
COLUMNS = ["03439000", "03443000", "03446000", "03447687", "03451000", "03451500", "03453000", "03455000",
           "03461500", "03465500", "02137727"]

def get(url, params=None, timeout=180):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            if i == 2:
                raise
            time.sleep(4 * (i + 1))

def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%MZ")

# ------------------------------------------------------------------ fetch (or load) the three inputs
def fetch_lines():
    q = lambda ns: ",".join("'" + n.replace("'", "''") + "'" for n in ns)
    where = f"(StreamOrde >= 4 AND GNIS_NAME IN ({q(RIVERS)})) OR (StreamOrde >= 3 AND GNIS_NAME IN ({q(LOW_ORDER)}))"
    out, off = [], 0
    while True:
        d = json.loads(get(NHD + "/query", {"f": "json", "where": where,
            "geometry": ",".join(map(str, BBOX)), "geometryType": "esriGeometryEnvelope", "inSR": 4326, "outSR": 4326,
            "spatialRel": "esriSpatialRelIntersects", "outFields": "COMID,GNIS_NAME,StreamOrde,QE_MA", "returnGeometry": "true",
            "maxAllowableOffset": 0.0008, "geometryPrecision": 5, "resultOffset": off, "resultRecordCount": 2000}))
        if "error" in d:
            raise RuntimeError(d["error"])
        fs = d.get("features", [])
        for f in fs:
            a = f["attributes"]; p = f.get("geometry", {}).get("paths")
            if p:
                out.append({"comid": a["COMID"], "name": a["GNIS_NAME"], "order": a["StreamOrde"], "qma": a["QE_MA"], "paths": p})
        if not fs or not d.get("exceededTransferLimit"):
            return out
        off += len(fs)

def fetch_iv():
    p = {"format": "json", "bBox": ",".join(map(str, BBOX)), "parameterCd": "00060,00065",
         "startDT": iso(T0 - timedelta(hours=6)), "endDT": iso(T0 + timedelta(hours=HOURS + 24)), "siteStatus": "all"}
    d = json.loads(get("https://waterservices.usgs.gov/nwis/iv/", p, timeout=300))
    sites = {}
    for ts in d["value"]["timeSeries"]:
        si = ts["sourceInfo"]; code = si["siteCode"][0]["value"]; var = ts["variable"]["variableCode"][0]["value"]
        s = sites.setdefault(code, {"name": si["siteName"], "lat": si["geoLocation"]["geogLocation"]["latitude"],
                                    "lon": si["geoLocation"]["geogLocation"]["longitude"]})
        pts = []
        for blk in ts["values"]:
            for v in blk["value"]:
                try:
                    x = float(v["value"])
                except ValueError:
                    continue
                if x <= -999999:
                    continue
                t = datetime.fromisoformat(v["dateTime"]).astimezone(timezone.utc)
                pts.append([int((t - T0).total_seconds() // 60), x, ",".join(v.get("qualifiers", []))])
        s["q" if var == "00060" else "h"] = sorted(pts)
    return sites

def fetch_peaks(site_ids):
    out = []
    for sid in site_ids:
        try:
            txt = get("https://nwis.waterdata.usgs.gov/nwis/peak", {"site_no": sid, "agency_cd": "USGS", "format": "rdb"}, timeout=60)
        except Exception:
            continue
        lines = [l for l in txt.splitlines() if l and not l.startswith("#")]
        if len(lines) < 3:
            continue
        hdr = lines[0].split("\t"); recs = [dict(zip(hdr, l.split("\t"))) for l in lines[2:]]
        num = lambda x: float(x) if x not in (None, "") else None
        prior = [x for x in recs if not x.get("peak_dt", "").startswith(("2024-09", "2024-10")) and num(x.get("peak_va"))]
        pmax = max(prior, key=lambda x: num(x["peak_va"])) if prior else None
        for x in recs:
            if x.get("peak_dt", "").startswith("2024-09"):
                out.append({"site": sid, "cfs": num(x.get("peak_va")), "cfs_codes": x.get("peak_cd"),
                            "prev_max_cfs": num(pmax["peak_va"]) if pmax else None, "prev_max_date": pmax["peak_dt"] if pmax else None})
        time.sleep(0.3)
    return out

# ------------------------------------------------------------------ build
def km(a, b):
    return math.hypot((a[0] - b[0]) * 111.32 * math.cos(math.radians(35.6)), (a[1] - b[1]) * 110.57)

def same_river(site_name, river):
    norm = lambda s: s.upper().replace(" RIVER", " R").replace(" NR ", " NEAR ")
    return norm(site_name).startswith(norm(river) + " ")

def ranges(flags):
    """[[first, last], ...] index ranges where flags is true"""
    out = []
    for i, f in enumerate(flags):
        if f and out and out[-1][1] == i - 1:
            out[-1][1] = i
        elif f:
            out.append([i, i])
    return out

def build(lines, sites, peaks):
    W, S, E, N = BBOX
    lines = [l for l in lines if l["name"] in RIVERS and any(W <= p[0] <= E and S <= p[1] <= N for p in l["paths"][0])]
    key = lambda p: (round(p[0], 4), round(p[1], 4))
    # 1. chain the reaches of each river, upstream to downstream
    chains = []
    for name in RIVERS:
        rs = [l for l in lines if l["name"] == name]
        nxt = {}
        for l in rs:
            nxt.setdefault(key(l["paths"][0][0]), []).append(l)
        ends = {key(l["paths"][0][-1]) for l in rs}
        used = set()
        heads = sorted([l for l in rs if key(l["paths"][0][0]) not in ends], key=lambda l: l["qma"] or 0)
        for h in heads + rs:                     # heads first; anything left over (loops, braids) after
            if h["comid"] in used:
                continue
            pts, runs, cur = [], [], h
            while cur and cur["comid"] not in used:
                used.add(cur["comid"])
                seg = cur["paths"][0]
                if pts:
                    seg = seg[1:]
                runs.append([len(pts), cur["qma"] or 0, cur["order"]])
                pts += [[round(x, 4), round(y, 4)] for x, y in seg]
                cand = [c for c in nxt.get(key(cur["paths"][0][-1]), []) if c["comid"] not in used]
                cur = max(cand, key=lambda c: c["qma"] or 0) if cand else None
            if len(pts) >= 2 and sum(km(a, b) for a, b in zip(pts, pts[1:])) > 3:
                chains.append({"n": name, "p": pts, "runs": runs})
    # 2. river gauges: same river, flow covering the step-5 window (42 h to 96 h)
    def covers(q):
        return q and q[0][0] <= 42 * 60 and q[-1][0] >= 96 * 60
    gauges = {}
    for sid, s in sites.items():
        for c in chains:
            if any(same_river(s["name"], n) for n in [c["n"]] + ALIASES.get(c["n"], [])) and covers(s.get("q")):
                d, i = min((km([s["lon"], s["lat"]], p), i) for i, p in enumerate(c["p"]))
                if d < 1.5 and (sid not in gauges or d < gauges[sid]["d"]):
                    run = max(r for r in c["runs"] if r[0] <= i)
                    gauges[sid] = {"d": d, "chain": c, "i": i, "qmaG": run[1]}
    # 3. each run takes the nearest gauge along its own chain (or the shared one)
    def along(c):
        a = [0.0]
        for p, q in zip(c["p"], c["p"][1:]):
            a.append(a[-1] + km(p, q))
        return a
    used_g = set()
    for c in chains:
        A = along(c); mine = [(sid, g) for sid, g in gauges.items() if g["chain"] is c]
        for r in c["runs"]:
            # nearest gauge along the river whose mean annual flow is within 3x of this stretch's;
            # stretches with no such gauge are left out rather than guessed
            ok = [(sid, g) for sid, g in mine if g["qmaG"] and 1 / MAXF <= r[1] / g["qmaG"] <= MAXF]
            sid = min(ok, key=lambda sg: abs(A[sg[1]["i"]] - A[r[0]]))[0] if ok else None
            r.append(sid)
            r.append(1 if not sid and c["n"] in DIRECTION_ONLY else 0)     # 1 = draw for direction only
            if sid:
                used_g.add(sid)
        c["runs"] = [r for k, r in enumerate(c["runs"]) if k == 0 or r[3] != c["runs"][k - 1][3] or r[4] != c["runs"][k - 1][4]
                     or abs(r[1] - c["runs"][k - 1][1]) > 0.1 * max(1, c["runs"][k - 1][1])]
    chains = [c for c in chains if any(r[3] or r[4] for r in c["runs"])]
    # 4. gauge series
    pk = {p["site"]: p for p in peaks}
    out_g = {}
    for sid in sorted(used_g | set(COLUMNS)):
        s = sites.get(sid)
        if not s:
            continue
        q = s.get("q", []); h = s.get("h", [])
        g = {"name": s["name"], "lat": round(s["lat"], 5), "lon": round(s["lon"], 5),
             "qmaG": round(gauges[sid]["qmaG"], 1) if sid in gauges else None,
             "qt": [r[0] for r in q], "q": [round(r[1]) for r in q], "qe": ranges([("e" in r[2]) for r in q]),
             "approved": all(r[2].startswith("A") for r in q + h) if q + h else False}
        if sid in COLUMNS and h:                 # stage is only drawn for the gauge columns
            ht = [r[0] for r in h]
            if ht != g["qt"]:
                g["ht"] = ht
            g["h"] = [round(r[1] * 100) for r in h]
        p = pk.get(sid)
        if p:
            yr = (p["prev_max_date"] or "")[:4]
            g |= {"peakQ": p["cfs"], "peakCodes": p["cfs_codes"], "prevQ": p["prev_max_cfs"], "prevYear": int(yr) if yr.isdigit() else None}
        out_g[sid] = g
    out_c = [{"n": c["n"], "p": c["p"], "r": [[r[0], round(r[1], 1), r[3] or ""] + ([1] if r[4] else []) for r in c["runs"]]} for c in chains]
    return {"note": "Main rivers (NHDPlus V2.1, drawn upstream to downstream) and USGS river flow for Hurricane Helene. "
                    "Chains: p = [lon, lat] points downstream; r = runs [first point, NHDPlus mean annual flow cfs, gauge id or '', 1 if drawn for direction only]. "
                    "Gauges: qt minutes after t0; q cfs; qe = index ranges of USGS estimated values; h stage in hundredths of a foot at ht (or qt if ht is absent); "
                    "qmaG = NHDPlus mean annual flow at the gauge; peakQ / prevQ from the USGS annual peak-flow file.",
            "t0": int(T0.timestamp() * 1000), "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "source": "NHDPlus V2.1 (Esri-hosted); USGS waterservices IV (approved); USGS peak-flow file",
            "chains": out_c, "gauges": out_g}

def main():
    if "--from" in sys.argv:
        d = sys.argv[sys.argv.index("--from") + 1]
        lines = json.load(open(os.path.join(d, "rivers.json")))["lines"]
        sites = {k: {**v, "q": v.get("q", []), "h": v.get("h", [])} for k, v in json.load(open(os.path.join(d, "usgs-iv.json")))["sites"].items()}
        peaks = json.load(open(os.path.join(d, "usgs-peaks.json")))
    else:
        lines = fetch_lines(); sites = fetch_iv()
        peaks = fetch_peaks(sorted({s for s in sites}))
    out = build(lines, sites, peaks)
    n_c, n_g = len(out["chains"]), len(out["gauges"])
    print(f"{n_c} river chains, {sum(len(c['p']) for c in out['chains'])} points, {n_g} gauges")
    for c in out["chains"]:
        print(f"  {c['n']}: {len(c['p'])} pts, gauges {sorted({r[2] for r in c['r'] if r[2]})}{' + direction-only stretches' if any(len(r) > 3 for r in c['r']) else ''}")
    if n_c < 8 or n_g < 15:
        sys.exit("Too little data; not writing the file.")
    path = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "data/helene-rivers.json"
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print("wrote", path, os.path.getsize(path) // 1024, "KB")

if __name__ == "__main__":
    main()
