# Pooh sticks: sources and tests

`pooh-sticks.html` (repo root) is built from these files. It is one self-contained page.

- `src/flow.js`: the flow model. It computes our own flow direction from Esri TopoBathy3D elevation tiles (no sign-in) and traces downstream with steepest-downhill steps and a priority-flood that fills hollows, lakes and reservoirs until they overflow.
- `src/logic.js`: sea naming and answer options (shared with `race-to-the-sea.html`).
- `src/app.js`, `src/template.html`: the page.
- `src/seas.json`, `src/lakes.json`, `src/places.json`: Natural Earth marine areas, lakes (with lakes that have no outlet flagged) and the start list, all public domain.

Build: `python3 tools/build.py ../../pooh-sticks.html`

Tests (Node 22):
- `node tools/test_flow_synth.js`: synthetic valleys, deep lakes, side-by-side hollows, a narrow gorge, a closed basin and a salt lake.
- `node tools/test_flow_rhine.js <dir>`: the Rhine basin (MERIT 30" DEM from the `pyflwdir` 0.5.12 source package, exported as `elv.f32`, `d8.u8` and `hdr.json`) compared with the MERIT Hydro D8 flow direction. All 8 starts reach the mouth, with about 93% of each route within 2 km of the reference.
- `node tools/test_tilestore.js`: elevation tiles for one stick: needed tiles jump ahead of look-ahead prefetches, the prefetch queue is capped, and closing a store (a new stick, or Cancel) stops its downloads and wakes any waiting trace.
- `node tools/test_sea.js`: the sea finder at real river mouths, wide river polygons (Amazon, Columbia, Yangtze, St Lawrence), and little-known channels, lagoons and "Boca" waters named by the sea they open into.
- `JSDOM_PATH=... node tools/smoke_lab.js`: the lab page (`pooh-sticks-lab.html`, built with `python3 tools/build.py --lab`) against a stand-in for Esri's Trace Downstream service: a working key, a refused key, a failed job and no key (the last three fall back to our flow model and say why).
- `JSDOM_PATH=... node tools/smoke_ui.js`: the whole page in jsdom with a stand-in SDK and synthetic terrain.

Data prep (needs the Natural Earth GeoJSON from github.com/nvkelso/natural-earth-vector): `prep_seas.py`, `prep_lakes.py`, `prep_places.js`.

## Tracing engine (v0.7.0)

The page asks Esri's ready-to-use Trace Downstream service (hydro.arcgis.com) for the route first, with a
public-application ArcGIS API key built into `src/app.js` (`ESRI_KEY`). The key is meant to be public: it is
limited to this site by referrer, has no item access and expires (renew it before then). Esri's ArcGIS Online
help says Trace Downstream uses no credits. If the service doesn't answer within 20 seconds, refuses the key or
fails, the app's own flow model (`src/flow.js`) traces the stick and "How the app worked this out" says why.
