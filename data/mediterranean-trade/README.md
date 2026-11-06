# Mediterranean Trade Networks c. 700–350 BCE: extracted feature layers

Dataset version: **v1.0** (6 Nov 2026). All layers: GeoJSON, WGS84 (EPSG:4326).

Source image: Simeon Netchev, *Map of the Mediterranean Trade Networks, c. 700–350 BCE*, World History Encyclopedia (image 14421). Licence shown on WHE: **CC BY-NC-ND**. See "Licence caution" below.

## Layers

| Layer | Version | Type | Features | How it was made |
|---|---|---|---|---|
| trading_hubs.geojson | v1.0 | Point | 78 | Names read from the map. Positions are the **real** site/town coordinates, not traced from the image |
| trade_routes.geojson | v1.0 | Line | 68 | The connections were read from the map. Sea legs are the shortest path at sea against the Natural Earth 10m coastline, then straightened by line-of-sight. Overland legs go through hand-placed waypoints |
| zones_of_influence.geojson | v1.0 | Polygon | 5 | **Extracted from the image** by pixel colour/texture classification, warped with a 2nd-order polynomial, then snapped to the real coastline |
| trade_goods.geojson | v1.0 | Point | 14 | Commodity labels from the map, placed at a point that stands for the real source region (e.g. Laurion silver, Cornish tin) |
| exchange_zones.geojson | v1.0 | Point | 7 | The map's text panels (Steppe, Caucasus, Persian frontier, Incense Route, Trans-Saharan, Pyrenean, Alpine), with the goods in each flow direction |
| peoples_and_polities.geojson | v1.0 | Point | 15 | The map's group/region labels, placed at representative points |

Also included: `trading_hubs.csv` (lat/lon columns), `qa_raw_zones.geojson` (zones as first extracted, before coastline snapping) and `qa_control_points.geojson` (the 60 georeferencing control points with leave-one-out error and image pixel positions).

Viewer: [mediterranean-trade.html](https://jsawle.github.io/curriculum_artifacts/mediterranean-trade.html) (app v1.0.0; lab copy: `mediterranean-trade-test.html`). Built with ArcGIS Maps SDK for JavaScript 5.1.

## Georeferencing accuracy
- 60 control points: map dots matched to known site coordinates (two-stage: seeded, then auto-snapped)
- Leave-one-out error: **median 21 km, 90th percentile 47 km**. Worst errors are at the map's eastern edge (Susa, Babylon), where the fit extrapolates
- Phaleron and Cartenna were excluded. The map draws them about 30 px and 20 px from their real positions, a cartographic displacement made for legibility
- What this means: anything traced from the image (the zone edges) is good to about ±20–50 km. The hubs and routes don't inherit that error

## Known limitations
- **Persian Empire polygon**: this is the map's hatching, which covers Anatolia, the Caucasus edge, Mesopotamia and Iran, plus part of Thrace. It does **not** include Egypt or the Levant, though both were Achaemenid c. 500 BCE. The map's frame clips the eastern edge
- **Etruscan polygon**: this is the map's green patch, which sits on the Po plain and not on core Etruria (Tuscany/N. Lazio)
- **Zones** are bands of settlement density, as the source map itself says, not borders. Faint parts of the zones (e.g. Massilia) were not detected
- **Routes** are indicative. The sea paths are plausible lanes, not attested courses. Overland waypoints use later (often Roman) place names to locate corridors
- Tartessos location is debated (the Huelva area is used). The map's Vix and Mont Lassois are one site

## Licence caution
Hubs, goods and peoples are facts (place names and locations) that were re-located independently. **zones_of_influence.geojson is traced from the image and is likely a derivative work under the ND (No Derivatives) term.** Routes follow the map's choice of connections. Check with WHE before publishing either layer in MapMaker. Natural Earth (public domain) was used for the coastline.

## Field notes
- `certainty`: `indicative` or `interpretive`, because these are reconstructions
- `network`: Phoenician-Punic / Hellenic / Persian / Local or other / Overland
- `method`, `loc_source`, `placement`: provenance for each feature
