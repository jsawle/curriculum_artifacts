"""Fetch the earthquakes used by subduction-lab-test.html and save them as a small static file.

Run by .github/workflows/subduction-quakes.yml (or by hand: python scripts/fetch_subduction_quakes.py).
Writes data/subduction/<place>.json. Standard library only.

Source: USGS earthquake catalogue, FDSN event service (https://earthquake.usgs.gov/fdsnws/event/1/),
magnitude 4.5 and above, past 5 years, within 1,300 km of the middle of each place's block.
Saved compactly as [longitude, latitude, depth km, magnitude] rows, so the page loads one small file
instead of a slow 5-year query for every student.
"""
import json, os, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

YEARS = 5
PLACES = {
    # middle of the block (see subduction-engine.js makeBlock); radius covers the whole block
    "tonga": {"latitude": -19.0560, "longitude": -177.1549, "maxradiuskm": 1300},
}
URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"

def fetch(params, tries=4):
    url = URL + "?" + urllib.parse.urlencode(params)
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return json.load(r)
        except Exception as e:  # network hiccups: wait and try again
            print("retry", k + 1, e)
            time.sleep(10 * (k + 1))
    raise SystemExit("USGS query failed: " + url)

def main():
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=round(YEARS * 365.25))).strftime("%Y-%m-%d")
    os.makedirs("data/subduction", exist_ok=True)
    for name, where in PLACES.items():
        params = {"format": "geojson", "minmagnitude": 4.5, "orderby": "magnitude-asc", "starttime": start, **where}
        gj = fetch(params)
        rows = []
        for f in gj["features"]:
            lon, lat, depth = f["geometry"]["coordinates"][:3]
            mag = f["properties"].get("mag") or 4.5
            rows.append([round(lon, 3), round(lat, 3), round(depth or 0, 1), round(mag, 1)])
        out = {"source": "USGS earthquake catalogue (FDSN event service)", "query": params,
               "fetched": now.strftime("%Y-%m-%d"), "fields": ["longitude", "latitude", "depth_km", "magnitude"], "quakes": rows}
        path = f"data/subduction/{name}.json"
        with open(path, "w") as fh:
            json.dump(out, fh, separators=(",", ":"))
        print(path, len(rows), "earthquakes")

if __name__ == "__main__":
    main()
