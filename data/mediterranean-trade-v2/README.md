# Mediterranean Trade Networks c. 700–350 BCE: v2 open-data layers

Dataset version **v2.2** (6 Nov 2026). Trade routes are v2.2; the other layers are v2.0. GeoJSON, WGS84 (EPSG:4326). Viewer: [mediterranean-trade-test.html](https://jsawle.github.io/curriculum_artifacts/mediterranean-trade-test.html) (lab copy, app v2.0.0).

v2 uses no geometry, text or zone outlines from the map image used for v1 (`data/mediterranean-trade/`). Every layer is built from the open sources below.

## Layers

| File | Version | Type | Features | How it is made | Licence |
|---|---|---|---|---|---|
| places.geojson | v2.0 | Point | 123 | 77 trading hubs at Pleiades positions with Pleiades IDs, plus 46 colonies and founding cities linked in Pleiades. Mogador is not in Pleiades, so it uses the island's position. Tanais is left out because Pleiades dates the city to the 3rd century BCE | Pleiades, CC BY 3.0 |
| trade_routes.geojson | v2.2 | Line | 219 | 56 foundation links (Pleiades "founded by" connections, or founder statements in Pleiades descriptions, dated before 330 BCE). 115 modelled coastal links (each port to its two nearest same-culture ports, plus a minimum spanning tree). 9 overland and river corridors and 1 Channel crossing. 36 port links | Links from Pleiades (CC BY 3.0); lanes are own work |
| zones_of_settlement.geojson | v2.0 | Polygon | 3 | Phoenician-Punic and Greek: the coast within 40 km of a site, running 25 km inland, plus 15 km around each site. Etruscan: land within 20 km of Etruscan sites. A site counts if Pleiades describes it by culture and its Pleiades location dates overlap 700–350 BCE. Hub affiliations are added. Each feature lists the sites used | Pleiades, CC BY 3.0 |
| persian_empire.geojson | v2.0 | Polygon | 1 | AWMC "extent of the Persian Empire", clipped to the Natural Earth coastline | **ODbL 1.0** (see below) |
| trade_goods.geojson | v2.0 | Point | 14 | Commodity points at representative source regions | Own work |
| peoples.geojson | v2.0 | Point | 14 | Group labels at representative points | Own work |

## Method notes
- **Sea lanes**: routed on a 0.01° grid against Natural Earth 10m land, kept about 4 km offshore where the sea allows, and straightened only where the straight line keeps 1 km clear of land. They follow strait centrelines worked out from the coastline: Bosporus, Dardanelles, Messina, Rion, Kerch, Gibraltar and the Gulf of Izmit. Each lane ends at a harbour; inland or silted places get a port link.
- **Flow lanes (v2.2)**, `scripts/mediterranean-trade-v2/flowlane.py`: each lane starts from the least-cost path at sea, with no spliced-in strait vertices. Inside a strait, the path sits on the computed centreline. The path is then smoothed with a variable-strength Gaussian whose strength is the largest that keeps the lane at least min(1 km, 80% of the raw path's own clearance) from land. Smoothing ranges from 1 km to 130 km on open water, and its strength can change by at most 0.5 km per km along the lane, which removes sudden corners. A constrained de-jitter pass follows, and an exact Natural Earth land test; failing stretches revert to the last land-checked version. Corinth (Lechaion or Kenchreai) and Chalcis (north or south of the Euripus) use whichever harbour gives the shorter voyage. Compared with v2.1: kinks (more than 20° within 1 km) fell from 882 to 124, and back-tracking from 2,661 km to 1,385 km. The remainder is real detours, such as around Euboea or through the Bosporus.
- **Checks**: sea lanes cross Natural Earth land by 0.00 km. Sampled every 500 m against the Esri World Terrain Base basemap at zoom 9, 0.08% of samples fall on land, in 1–2 km stretches in very narrow channels (e.g. the Preveza strait) and at island harbour approaches, where the basemap coastline differs from Natural Earth. Zone edges: about 7% of the 3 km strip inside each coastal zone's edge falls on the basemap's sea. That is the difference between the Natural Earth 1:10m coastline and the basemap's more detailed one.
- **Hub selection**: the 77 trading hubs are the major ports and settlements of the period that v1 used. Their positions, IDs and descriptions now come from Pleiades.

## Limitations
- Zone coverage follows where Pleiades describes sites by culture, so it is uneven. For example, the Phoenician homeland and Cyprus have few such descriptions.
- There is no Hallstatt zone. No openly licensed extent was found, so the Hallstatt world is shown by its princely seats.
- The coastal networks are a model, not attested voyages. The foundation links are as recorded in Pleiades, which is incomplete (for example, many Milesian Black Sea foundations are not linked).

## Attribution (required)
- Pleiades: "Pleiades: A Gazetteer of Past Places", https://pleiades.stoa.org, licensed CC BY 3.0. Place IDs are in `pleiades_id` and `pleiades_uri`.
- Ancient World Mapping Center (UNC Chapel Hill), AWMC geodata, https://github.com/AWMC/geodata, ODC Open Database License 1.0.
- Natural Earth, public domain.

## ODbL notice for persian_empire.geojson
This file is a derived database of the AWMC geodata "extent_of_the_persian_empire". It is made available under the Open Database License: https://opendatacommons.org/licenses/odbl/1.0/. Any rights in individual contents of the database are licensed under the Database Contents License: https://opendatacommons.org/licenses/dbcl/1.0/. If you share a modified version of this file, it must also be shared under ODbL.
