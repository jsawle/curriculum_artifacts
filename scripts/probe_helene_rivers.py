"""Probe: what river data exists for Hurricane Helene (flow direction and volumes)?

Run by .github/workflows/helene-rivers-probe.yml on the river-data-probe branch.
Writes data/rivers-probe/: report.md plus the raw pulls so we can judge them before building.

  usgs-iv.json     USGS 15-minute discharge (00060, cfs) and stage (00065, ft), every site in the box
  usgs-peaks.json  USGS annual peak-flow file rows for September 2024 (final or provisional peaks)
  rivers.json      NHDPlus V2.1 flowlines, stream order >= 4, with flow direction check
  nwm.json         NOAA National Water Model v3 analysis streamflow (m3/s), hourly, for those reaches

Sources: waterservices.usgs.gov (legacy, retiring early 2027), nwis.waterdata.usgs.gov peak file,
USGS NLDI, Esri-hosted NHDPlusV21 FeatureServer, Google Cloud public bucket national-water-model.
Every step is wrapped so a failure is written to the report instead of stopping the run.
"""
import concurrent.futures as cf
import io, json, os, sys, time, traceback, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

OUT = "data/rivers-probe"
BBOX = (-84.3, 34.6, -81.0, 36.6)            # W, S, E, N: western NC, upstate SC, east Tennessee
T0 = datetime(2024, 9, 24, 12, tzinfo=timezone.utc)
HOURS = 108
CFS = 35.3147                                 # cubic feet per cubic metre
UA = {"User-Agent": "helene-rivers-probe (education app; github.com/jsawle/curriculum_artifacts)"}
report = []

def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True)
    report.append(s)

def get(url, params=None, timeout=120, raw=False, tries=3):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                b = r.read()
                return b if raw else b.decode("utf-8", "replace")
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(3 * (i + 1))

def save(name, obj):
    with open(os.path.join(OUT, name), "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    log(f"- saved {name} ({os.path.getsize(os.path.join(OUT, name)) // 1024} KB)")

def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%MZ")

# ---------------------------------------------------------------- USGS instantaneous values
def usgs_iv():
    log("\n## 1. USGS 15-minute discharge and stage (legacy waterservices)")
    p = {"format": "json", "bBox": ",".join(map(str, BBOX)), "parameterCd": "00060,00065",
         "startDT": iso(T0), "endDT": iso(T0 + timedelta(hours=HOURS + 24)), "siteStatus": "all"}
    d = json.loads(get("https://waterservices.usgs.gov/nwis/iv/", p, timeout=300))
    sites = {}
    for ts in d["value"]["timeSeries"]:
        si = ts["sourceInfo"]; code = si["siteCode"][0]["value"]
        var = ts["variable"]["variableCode"][0]["value"]
        nod = ts["variable"].get("noDataValue", -999999)
        s = sites.setdefault(code, {"name": si["siteName"],
                                    "lat": si["geoLocation"]["geogLocation"]["latitude"],
                                    "lon": si["geoLocation"]["geogLocation"]["longitude"]})
        pts = []
        for blk in ts["values"]:
            for v in blk["value"]:
                try:
                    x = float(v["value"])
                except ValueError:
                    continue
                if x == nod:
                    continue
                t = datetime.fromisoformat(v["dateTime"]).astimezone(timezone.utc)
                pts.append([int((t - T0).total_seconds() // 60), x, ",".join(v.get("qualifiers", []))])
        pts.sort()
        s["q" if var == "00060" else "h"] = pts
    rows = []
    for code, s in sites.items():
        q, h = s.get("q", []), s.get("h", [])
        def peak(a):
            return max(a, key=lambda r: r[1]) if a else None
        def biggest_gap(a):   # minutes, within the flood window 26 Sep 12Z to 28 Sep 12Z
            ts_ = [r[0] for r in a if 48 * 60 <= r[0] <= 96 * 60]
            if len(ts_) < 2:
                return None
            return max(b - a_ for a_, b in zip(ts_, ts_[1:]))
        pq, ph = peak(q), peak(h)
        rows.append({"site": code, "name": s["name"], "lat": s["lat"], "lon": s["lon"],
                     "nq": len(q), "nh": len(h),
                     "qpeak": pq[1] if pq else None, "qpeak_t": pq[0] if pq else None, "qpeak_qual": pq[2] if pq else None,
                     "hpeak": ph[1] if ph else None, "hpeak_t": ph[0] if ph else None,
                     "qgap": biggest_gap(q), "hgap": biggest_gap(h),
                     "qlast": q[-1][0] if q else None, "hlast": h[-1][0] if h else None,
                     "quals": sorted({r[2] for r in q})})
    rows.sort(key=lambda r: -(r["qpeak"] or 0))
    log(f"Sites returned: {len(sites)}; with discharge: {sum(1 for r in rows if r['nq'])}; with stage: {sum(1 for r in rows if r['nh'])}")
    def tt(m):
        return "" if m is None else (T0 + timedelta(minutes=m)).strftime("%d %H:%MZ")
    log("\n| site | name | peak cfs | at | qualifiers | peak stage ft | at | biggest gap in flow (min) | flow ends |")
    log("|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        if r["nq"] or r["nh"]:
            log(f"| {r['site']} | {r['name']} | {'' if r['qpeak'] is None else round(r['qpeak'])} | {tt(r['qpeak_t'])} | "
                f"{' '.join(r['quals'])} | {'' if r['hpeak'] is None else r['hpeak']} | {tt(r['hpeak_t'])} | "
                f"{r['qgap'] or ''} | {tt(r['qlast'])} |")
    save("usgs-iv.json", {"note": "USGS IV, t = minutes after 2024-09-24 12:00 UTC; q cfs, h ft; [t, value, qualifiers]",
                          "summary": rows, "sites": sites})
    return rows

# ---------------------------------------------------------------- USGS annual peak file
def usgs_peaks(rows):
    log("\n## 2. USGS annual peak-flow file (September 2024 rows)")
    out = []
    for r in rows:
        try:
            txt = get("https://nwis.waterdata.usgs.gov/nwis/peak", {"site_no": r["site"], "agency_cd": "USGS", "format": "rdb"}, timeout=60, tries=2)
        except Exception as e:
            continue
        lines = [l for l in txt.splitlines() if l and not l.startswith("#")]
        if len(lines) < 3:
            continue
        hdr = lines[0].split("\t")
        recs = [dict(zip(hdr, l.split("\t"))) for l in lines[2:]]
        def num(x):
            try: return float(x)
            except: return None
        prior = [x for x in recs if not x.get("peak_dt", "").startswith(("2024-09", "2024-10"))]
        pmax = max(prior, key=lambda x: num(x.get("peak_va")) or -1) if prior else None
        for x in recs:
            if x.get("peak_dt", "").startswith("2024-09"):
                out.append({"site": r["site"], "name": r["name"], "date": x.get("peak_dt"), "time": x.get("peak_tm"),
                            "cfs": num(x.get("peak_va")), "cfs_codes": x.get("peak_cd"),
                            "stage": num(x.get("gage_ht")), "stage_codes": x.get("gage_ht_cd"),
                            "prev_max_cfs": num(pmax.get("peak_va")) if pmax else None,
                            "prev_max_date": pmax.get("peak_dt") if pmax else None,
                            "years": len(recs)})
        time.sleep(0.3)
    out.sort(key=lambda x: -(x["cfs"] or 0))
    log(f"Sites with a September 2024 peak in the file: {len(out)}")
    log("\n| site | name | date | peak cfs | codes | stage ft | previous max cfs (date) | years |")
    log("|---|---|---|---|---|---|---|---|")
    for x in out:
        log(f"| {x['site']} | {x['name']} | {x['date']} {x['time'] or ''} | {x['cfs'] or ''} | {x['cfs_codes'] or ''} | "
            f"{x['stage'] or ''} | {x['prev_max_cfs'] or ''} ({x['prev_max_date'] or ''}) | {x['years']} |")
    save("usgs-peaks.json", out)
    return out

# ---------------------------------------------------------------- gauge -> NHDPlus COMID
def gauge_comids(rows):
    log("\n## 3. Gauge to river-reach links (USGS NLDI)")
    m = {}
    for r in rows:
        if not r["nq"]:
            continue
        for base in ("https://api.water.usgs.gov/nldi/linked-data/nwissite/",
                     "https://labs.waterdata.usgs.gov/api/nldi/linked-data/nwissite/"):
            try:
                d = json.loads(get(base + "USGS-" + r["site"], timeout=30, tries=1))
                c = d["features"][0]["properties"].get("comid")
                if c:
                    m[r["site"]] = int(c)
                    break
            except Exception:
                pass
    log(f"Linked {len(m)} of {sum(1 for r in rows if r['nq'])} discharge gauges to a reach")
    return m

# ---------------------------------------------------------------- NHDPlus flowlines
def flowlines():
    log("\n## 4. NHDPlus V2.1 flowlines (Esri-hosted)")
    base = "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/NHDPlusV21/FeatureServer"
    svc = json.loads(get(base + "?f=json"))
    layers = svc.get("layers", [])
    log("Layers: " + ", ".join(f"{l['id']}={l['name']}" for l in layers))
    lyr = next((l for l in layers if "flowline" in l["name"].lower()), None)
    if not lyr:
        raise RuntimeError("no flowline layer")
    meta = json.loads(get(f"{base}/{lyr['id']}?f=json"))
    fields = [f["name"] for f in meta["fields"]]
    log(f"Flowline layer {lyr['id']} '{lyr['name']}', maxRecordCount {meta.get('maxRecordCount')}")
    log("Fields: " + ", ".join(fields))
    def find(*cands):
        low = {f.lower(): f for f in fields}
        for c in cands:
            if c.lower() in low:
                return low[c.lower()]
        return None
    F = {k: find(*v) for k, v in {
        "comid": ["COMID", "FEATUREID", "NHDPlusID"], "name": ["GNIS_NAME", "GNIS_Name"],
        "order": ["StreamOrde", "StreamOrder", "STREAMORDE"], "qma": ["QE_MA", "QA_MA", "Q0001E"],
        "hs": ["Hydroseq", "HYDROSEQ"], "dn": ["DnHydroseq", "DNHYDROSEQ"], "ftype": ["FTYPE", "FType"],
        "flowdir": ["FLOWDIR", "FlowDir"], "km": ["LENGTHKM", "LengthKM"],
        "maxel": ["MAXELEVSMO", "MaxElevSmo"], "minel": ["MINELEVSMO", "MinElevSmo"]}.items()}
    log("Matched fields: " + json.dumps(F))
    if not F["comid"] or not F["order"]:
        raise RuntimeError("missing COMID or stream order field")
    out_fields = ",".join(v for v in F.values() if v)
    feats, off, page = [], 0, meta.get("maxRecordCount") or 1000
    while True:
        p = {"f": "json", "where": f"{F['order']} >= 4", "geometry": ",".join(map(str, BBOX)),
             "geometryType": "esriGeometryEnvelope", "inSR": 4326, "outSR": 4326,
             "spatialRel": "esriSpatialRelIntersects", "outFields": out_fields, "returnGeometry": "true",
             "maxAllowableOffset": 0.0008, "geometryPrecision": 5, "resultOffset": off, "resultRecordCount": page}
        d = json.loads(get(base + f"/{lyr['id']}/query", p, timeout=180))
        if "error" in d:
            raise RuntimeError(json.dumps(d["error"]))
        fs = d.get("features", [])
        feats += fs
        if not fs or not d.get("exceededTransferLimit"):
            break
        off += len(fs)
    log(f"Flowlines with stream order >= 4 in box: {len(feats)}")
    lines = []
    for f in feats:
        a = f["attributes"]; paths = f.get("geometry", {}).get("paths", [])
        if not paths:
            continue
        lines.append({k: a.get(v) for k, v in F.items() if v} | {"paths": paths})
    # Flow direction check 1: does each line END where its downstream neighbour STARTS?
    if F["hs"] and F["dn"]:
        by_hs = {l["hs"]: l for l in lines}
        ok = tot = 0
        for l in lines:
            d_ = by_hs.get(l["dn"])
            if not d_:
                continue
            tot += 1
            e = l["paths"][-1][-1]; s = d_["paths"][0][0]
            if abs(e[0] - s[0]) < 1e-4 and abs(e[1] - s[1]) < 1e-4:
                ok += 1
        log(f"Direction check (end of reach meets start of downstream reach): {ok} of {tot}")
    # Flow direction check 2: smoothed elevation falls along the digitised direction
    if F["maxel"] and F["minel"]:
        n = sum(1 for l in lines if l.get("maxel") is not None and l.get("minel") is not None and l["maxel"] >= l["minel"])
        log(f"Reaches with max elevation >= min elevation: {n} of {len(lines)} (NHDPlus stores elevation in cm)")
    named = {}
    for l in lines:
        if l.get("name"):
            named.setdefault(l["name"], [0, 0])
            named[l["name"]][0] += 1
            named[l["name"]][1] = max(named[l["name"]][1], l.get("order") or 0)
    top = sorted(named.items(), key=lambda kv: -kv[1][1])[:25]
    log("Largest named rivers (reaches, max order): " + "; ".join(f"{k} ({v[0]}, {v[1]})" for k, v in top))
    save("rivers.json", {"note": "NHDPlus V2.1 flowlines, order>=4, paths digitised upstream to downstream if the checks pass",
                         "fields": F, "lines": lines})
    return lines

# ---------------------------------------------------------------- National Water Model
def nwm(comids, gauge_map):
    log("\n## 5. National Water Model v3 analysis streamflow (Google Cloud archive)")
    import numpy as np, netCDF4
    bucket = "https://storage.googleapis.com/national-water-model/"
    def url(t):
        return f"{bucket}nwm.{t:%Y%m%d}/analysis_assim/nwm.t{t:%H}z.analysis_assim.channel_rt.tm00.conus.nc"
    # what is in the bucket for one day
    try:
        lst = json.loads(get("https://storage.googleapis.com/storage/v1/b/national-water-model/o",
                             {"prefix": "nwm.20240927/analysis_assim/nwm.t12z.analysis_assim.channel_rt", "fields": "items(name,size)"}))
        for it in lst.get("items", []):
            log(f"- {it['name']}  {int(it['size']) // 1024 // 1024} MB")
    except Exception as e:
        log(f"Bucket listing failed: {e}")
    want = np.array(sorted(set(comids) | set(gauge_map.values())), dtype=np.int64)
    idx = None
    series = {int(c): [None] * (HOURS + 1) for c in want}
    def fetch(h):
        t = T0 + timedelta(hours=h)
        return h, get(url(t), timeout=300, raw=True)
    meta_logged = False
    fails = []
    with cf.ThreadPoolExecutor(6) as ex:
        for fut in cf.as_completed([ex.submit(fetch, h) for h in range(HOURS + 1)]):
            try:
                h, b = fut.result()
            except Exception as e:
                fails.append(str(e)); continue
            ds = netCDF4.Dataset("mem", memory=b)
            fid = ds.variables["feature_id"][:].astype(np.int64)
            if idx is None:
                order = np.argsort(fid)
                pos = np.searchsorted(fid[order], want)
                pos[pos >= len(fid)] = 0
                hit = fid[order][pos] == want
                idx = np.where(hit, order[pos], -1)
                log(f"File size {len(b) // 1024 // 1024} MB; reaches in file {len(fid)}; requested {len(want)}; found {int(hit.sum())}")
            if not meta_logged:
                v = ds.variables["streamflow"]
                log(f"streamflow units: {getattr(v, 'units', '?')}; model version: {getattr(ds, 'NWM_version_number', getattr(ds, 'model_version', '?'))}")
                meta_logged = True
            q = ds.variables["streamflow"][:]
            for c, i in zip(want, idx):
                if i >= 0:
                    x = q[i]
                    series[int(c)][h] = None if np.ma.is_masked(x) else round(float(x), 2)
            ds.close()
    log(f"Hourly files read: {HOURS + 1 - len(fails)} of {HOURS + 1}" + (f"; first failure: {fails[0]}" if fails else ""))
    save("nwm.json", {"note": "NWM v3 analysis_assim tm00 streamflow m3/s, index = hours after 2024-09-24 12:00 UTC",
                      "gauge_comid": gauge_map, "q": series})
    return series

def compare(rows, peaks, gauge_map, series):
    log("\n## 6. Model versus measured peak flow at gauges")
    pk = {p["site"]: p for p in peaks}
    log("| site | name | USGS 15-min peak cfs | USGS peak file cfs (codes) | NWM peak cfs | NWM / best measured |")
    log("|---|---|---|---|---|---|")
    for r in rows:
        c = gauge_map.get(r["site"])
        if not c or c not in series:
            continue
        s = [x for x in series[c] if x is not None]
        if not s:
            continue
        m = max(s) * CFS
        meas = (pk.get(r["site"], {}).get("cfs")) or r["qpeak"]
        ratio = f"{m / meas:.2f}" if meas else ""
        p = pk.get(r["site"])
        log(f"| {r['site']} | {r['name']} | {'' if r['qpeak'] is None else round(r['qpeak'])} | "
            f"{(str(p['cfs']) + ' (' + (p['cfs_codes'] or '') + ')') if p else ''} | {round(m)} | {ratio} |")

def main():
    os.makedirs(OUT, exist_ok=True)
    log(f"# Helene river data probe, run {datetime.now(timezone.utc):%Y-%m-%d %H:%MZ}")
    log(f"Box W,S,E,N = {BBOX}; window {iso(T0)} + {HOURS} h")
    rows = peaks = lines = []; gmap = {}; series = {}
    for name, fn in [("usgs_iv", lambda: usgs_iv()), ("peaks", lambda: usgs_peaks(rows)),
                     ("comids", lambda: gauge_comids(rows)), ("flowlines", lambda: flowlines()),
                     ("nwm", lambda: nwm([l["comid"] for l in lines if l.get("comid")], gmap))]:
        try:
            res = fn()
            if name == "usgs_iv": rows = res
            elif name == "peaks": peaks = res
            elif name == "comids": gmap = res
            elif name == "flowlines": lines = res
            elif name == "nwm": series = res
        except Exception as e:
            log(f"\n**{name} FAILED**: {e}\n```\n{traceback.format_exc()[-1500:]}\n```")
    try:
        if series:
            compare(rows, peaks, gmap, series)
    except Exception as e:
        log(f"compare failed: {e}")
    with open(os.path.join(OUT, "report.md"), "w") as f:
        f.write("\n".join(report) + "\n")

if __name__ == "__main__":
    main()
