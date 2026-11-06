# Mediterranean Trade Networks c. 700–350 BCE: extracted feature layers

Dataset version: **v1.1** (6 Nov 2026). Trade routes and zones are v1.1; the other layers are v1.0. All layers: GeoJSON, WGS84 (EPSG:4326).

Source image: Simeon Netchev, *Map of the Mediterranean Trade Networks, c. 700–350 BCE*, World History Encyclopedia (image 14421). Licence shown on WHE: **CC BY-NC-ND**. See "Licence caution" below.

## Layers

| Layer | Version | Type | Features | How it was made |
|---|---|---|---|---|
| trading_hubs.geojson | v1.0 | Point | 78 | Names read from the map. Positions are the **real** site/town coordinates, not traced from the image |
| trade_routes.geojson | v1.1 | Line | 95 | The connections were read from the map. Sea lanes are computed at sea against the Natural Earth 10m coastline and end at harbours (see v1.1 fixes). Port links join inland places to their harbour. Overland legs go through hand-placed waypoints |
| zones_of_influence.geojson | v1.1 | Polygon | 5 | **Extracted from the image** by pixel colour/texture classification, warped with a 2nd-order polynomial, then fitted to the real coastline (see v1.1 fixes) |
| trade_goods.geojson | v1.0 | Point | 14 | Commodity labels from the map, placed at a point that stands for the real source region (e.g. Laurion silver, Cornish tin) |
| exchange_zones.geojson | v1.0 | Point | 7 | The map's text panels (Steppe, Caucasus, Persian frontier, Incense Route, Trans-Saharan, Pyrenean, Alpine), with the goods in each flow direction |
| peoples_and_polities.geojson | v1.0 | Point | 15 | The map's group/region labels, placed at representative points |

Also included: `trading_hubs.csv` (lat/lon columns), `qa_raw_zones.geojson` (zones as first extracted, before coastline snapping) and `qa_control_points.geojson` (the 60 georeferencing control points with leave-one-out error and image pixel positions).

Viewer: [mediterranean-trade.html](https://jsawle.github.io/curriculum_artifacts/mediterranean-trade.html) (app v1.0.0; lab copy: `mediterranean-trade-test.html`). Built with ArcGIS Maps SDK for JavaScript 5.1.

## v1.1 coastline fixes
- **Sea lanes**: routed on a 0.01° grid against Natural Earth 10m land, kept about 4 km offshore where the sea allows, and straightened only where the straight line keeps 1 km clear of land. Through the Bosporus, Dardanelles, Strait of Messina, Rion straits, Kerch Strait and Strait of Gibraltar they follow centrelines worked out from the coastline. Each lane ends at a harbour (fields `from_harbour` and `to_harbour`), not at the town centre.
- **Port links** (`mode = port`): join inland or silted places to their harbour, e.g. Sparta to Gytheion, Delphi to Kirrha, Cyrene to Apollonia, and Miletus, Ephesus, Utica, Atria and Spina to today's coast. The Corinth isthmus is no longer crossed: there was no canal until 1893, and Corinth's western routes use Lechaion. Tyras and Tanais connect by estuary.
- **Check against the basemap**: every sea lane was sampled every 500 m against the Esri World Terrain Base basemap at zoom 9. v1.0: 3.8% of the samples (about 845 km) on land. v1.1: 2 of 45,630 samples, both at harbour approaches. The Esri basemap was used only to check the result and to place four harbour points and the strait centrelines. No basemap geometry is stored in the data.
- **Zones**: the Phoenician and Hellenic zones are rebuilt as bands along the real coast. They take in the coast within 25 km of the extracted zone and run 30 km inland, plus the extracted inland extent. All zones are clipped last, so they stop at the coastline. Against the basemap, about 7% of the 3 km strip inside each coastal zone's edge still falls on sea (v1.0: about 20%). About 95% of that lies within 1.5 km of the Natural Earth coast, which is the difference between the 1:10m coastline and the more detailed basemap coastline.
- **Basemap zoom**: World Terrain Base has sea tiles only to zoom 9 and World Physical Map only to zoom 8, so the viewer now caps zoom for each basemap.

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

## Openly licensed sources (for a publishable version)
| Layer | Source | Licence | Notes |
|---|---|---|---|
| Hubs (coordinates, IDs) | Pleiades gazetteer (pleiades.stoa.org; isawnyu/pleiades.datasets) | CC BY 3.0 | Attribution required |
| Phoenician settlements | Zenodo record 17141060, cleaned from Manzano-Agugliaro et al. 2025 (Journal of Maps) | CC BY 4.0 | Covers the origins to the 7th century BCE only |
| Persian Empire extent | AWMC geodata, political_shading/persian_extent | ODbL 1.0 | Includes Egypt, the Levant and Thrace; share-alike for derived databases |
| Ancient coastlines (archaic, classical) | AWMC geodata, open_water_awmc_work | ODbL 1.0 | Shows ancient harbours on the ancient coast |
| Empires and cultures c. 500 BCE (Achaemenid, Carthaginian, Greek city-states, Etruscans) | aourednik/historical-basemaps, world_bc500 | GPL-3.0 | Copyleft; approximate borders |
| Coastline used here | Natural Earth 10m | Public domain | Already used |
| Greek and Phoenician colonies map | Wikimedia Commons, "Griechischen und phönizischen Kolonien" | CC BY-SA 3.0 | Tracing allowed under share-alike |
| Sea routes | Computed here from the coastline and attested connections | Own work | ORBIS covers the Roman world c. 200 CE, not this period |

## Licence caution
Hubs, goods and peoples are facts (place names and locations) that were re-located independently. **zones_of_influence.geojson is traced from the image and is likely a derivative work under the ND (No Derivatives) term.** Routes follow the map's choice of connections. Check with WHE before publishing either layer in MapMaker. Natural Earth (public domain) was used for the coastline.

## Field notes
- `certainty`: `indicative` or `interpretive`, because these are reconstructions
- `network`: Phoenician-Punic / Hellenic / Persian / Local or other / Overland
- `method`, `loc_source`, `placement`: provenance for each feature
