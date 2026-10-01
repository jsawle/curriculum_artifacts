"""Fetch the Hurricane Helene data used by helene-2024.html and save it as small static files.

Run by .github/workflows/helene-data.yml (or by hand: python scripts/fetch_helene_data.py).
Writes data/helene-rain.json and data/helene-gauges.json. Standard library only.

Sources (public ArcGIS Online services from NOAA's "Helene in Southern Appalachia" dashboard):
  Lhhs2_location   town and gauge points
  Lhhs2_mrms_data  hourly MRMS radar rainfall (cumulative and 1-hour, inches)
  Lhhs2_gauge_data USGS 15-minute river stage with NWS flood levels (feet)
  Lhhs2_historic_data  historic crests (feet)
The processing matches the live code in helene-2024.html, so the page behaves the same either way.
"""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

NOAA = "https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/"
T0 = int(datetime(2024, 9, 24, 12, tzinfo=timezone.utc).timestamp() * 1000)   # 8 am EDT 24 Sep
HOURS = 108
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
HR = 3600_000
GAUGES = ["03439000", "03443000", "03446000", "03447687", "03451000", "03451500",
          "03453000", "03455000", "03461500", "03465500", "02137727"]

def sql_time(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

def q(layer, params, tries=4):
    body = urllib.parse.urlencode({"f": "json", "returnGeometry": "false", **params}).encode()
    for k in range(tries):
        try:
            req = urllib.request.Request(NOAA + layer + "/FeatureServer/0/query", data=body, headers={"User-Agent": "helene-snapshot"})
            with urllib.request.urlopen(req, timeout=90) as r:
                j = json.load(r)
            if "error" in j:
                raise RuntimeError(j["error"])
            return j
        except Exception as e:
            if k == tries - 1:
                raise
            print("retrying", layer, e, file=sys.stderr); time.sleep(3 * (k + 1))

def query_all(layer, params, page=1000):
    count = q(layer, {**params, "returnCountOnly": "true"})["count"]
    rows = []
    for off in range(0, count, page):
        j = q(layer, {**params, "orderByFields": "ObjectId", "resultOffset": off, "resultRecordCount": page})
        rows += [f["attributes"] for f in j["features"]]
    print(layer, "rows:", len(rows), "of", count)
    return rows

def main():
    out_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    os.makedirs(out_dir, exist_ok=True)
    locs = {r["id"]: r for r in query_all("Lhhs2_location", {"where": "1=1", "outFields": "id,name,state,ishape,latitude,longitude"})}

    # ---- radar rain: total since T0 and rate, hourly, in hundredths of an inch
    rows = query_all("Lhhs2_mrms_data", {"where": f"datetime >= TIMESTAMP '{sql_time(T0 - HR)}' AND datetime <= TIMESTAMP '{sql_time(T0 + HOURS * HR)}'",
                                         "outFields": "id,datetime,F1hour_inch,cum_inch"})
    by_id = {}
    for r in rows:
        i = round((r["datetime"] - T0) / HR)
        if i < -1 or i > HOURS:
            continue
        s = by_id.setdefault(r["id"], {"cum": [None] * (HOURS + 2), "rate": [0.0] * (HOURS + 2)})
        s["cum"][i + 1] = r["cum_inch"]; s["rate"][i + 1] = r["F1hour_inch"] or 0
    places = []
    for pid, s in by_id.items():
        loc = locs.get(pid)
        if not loc:
            continue
        last = None
        for k in range(len(s["cum"])):
            if s["cum"][k] is None: s["cum"][k] = last
            else: last = s["cum"][k]
        base = s["cum"][1] if s["cum"][1] is not None else next((v for v in s["cum"] if v is not None), 0)
        r = [max(0, (s["cum"][i + 1] if s["cum"][i + 1] is not None else base) - base) for i in range(HOURS + 1)]
        h = [s["rate"][i + 1] or 0 for i in range(HOURS + 1)]
        places.append({"id": pid, "name": loc["name"], "state": loc["state"], "kind": loc["ishape"],
                       "lat": round(loc["latitude"], 5), "lon": round(loc["longitude"], 5),
                       "r": [round(v * 100) for v in r], "h": [round(v * 100) for v in h]})
    places.sort(key=lambda p: p["id"])
    rain = {"note": "Hurricane Helene radar rainfall (NOAA MRMS) since 2024-09-24 12:00 UTC, hourly. r = total so far, h = rain in that hour; both in hundredths of an inch.",
            "source": NOAA + "Lhhs2_mrms_data", "t0": T0, "hours": HOURS, "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "places": places}

    # ---- river gauges
    ids = ",".join(f"'{g}'" for g in GAUGES)
    obs = query_all("Lhhs2_gauge_data", {"where": f"id IN ({ids}) AND datetime >= TIMESTAMP '{sql_time(T0 - 6 * HR)}' AND datetime <= TIMESTAMP '{sql_time(T0 + HOURS * HR + 6 * HR)}'",
                                         "outFields": "id,datetime,stage,minor,moderate,major"})
    hist = query_all("Lhhs2_historic_data", {"where": f"id IN ({ids})", "outFields": "id,datetime,stage"})
    cutoff = int(datetime(2024, 9, 1, tzinfo=timezone.utc).timestamp() * 1000)
    gauges = []
    for gid in GAUGES:
        loc = locs.get(gid)
        rs = sorted([o for o in obs if o["id"] == gid and o["stage"] is not None], key=lambda o: o["datetime"])
        if not loc or not rs:
            continue
        thr = lambda k: next((o[k] for o in obs if o["id"] == gid and o[k] is not None), None)
        before = sorted([x for x in hist if x["id"] == gid and x["datetime"] < cutoff and x["stage"] is not None], key=lambda x: -x["stage"])
        gauges.append({"id": gid, "name": loc["name"], "lat": round(loc["latitude"], 5), "lon": round(loc["longitude"], 5),
                       "minor": thr("minor"), "moderate": thr("moderate"), "major": thr("major"),
                       "rec": before[0]["stage"] if before else None,
                       "recYear": (EPOCH + timedelta(milliseconds=before[0]["datetime"])).year if before else None,   # works for dates before 1970
                       "t": [round((o["datetime"] - T0) / 60000) for o in rs], "s": [o["stage"] for o in rs]})
    gauge_out = {"note": "USGS river stage (feet) every 15 minutes; t = minutes after 2024-09-24 12:00 UTC. rec/recYear = highest stage before September 2024 from NOAA's crest table; minor/moderate/major = NWS flood levels.",
                 "source": NOAA + "Lhhs2_gauge_data", "t0": T0, "generated": rain["generated"], "gauges": gauges}

    if len(places) < 300 or len(gauges) < 8:
        sys.exit(f"Too little data ({len(places)} places, {len(gauges)} gauges); not writing files.")
    for name, obj in (("helene-rain.json", rain), ("helene-gauges.json", gauge_out)):
        with open(os.path.join(out_dir, name), "w") as f:
            json.dump(obj, f, separators=(",", ":"))
        print("wrote", name, os.path.getsize(os.path.join(out_dir, name)), "bytes")

if __name__ == "__main__":
    main()
