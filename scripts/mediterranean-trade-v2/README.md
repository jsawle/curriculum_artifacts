# Build scripts: Mediterranean trade v2 (open data)

These are the scripts that built `data/mediterranean-trade-v2/`. They were run in a Claude workspace, so the paths are absolute to it. Inputs:
- the Pleiades GIS tables from `isawnyu/pleiades.datasets` (`data/gis/*.csv`), CC BY 3.0
- AWMC `Cultural-Data/political_shading/persian_extent/extent_of_the_persian_empire.geojson`, ODbL 1.0
- Natural Earth `ne_10m_land.geojson` (public domain)

Order: `pleiades_match.py` (hubs to Pleiades), `v2_evidence.py` (dated culture sites), `v2_points.py` (places and foundation links), `straits.py` (strait centrelines), `v2_routes.py` (sea lanes via `router.py`), `v2_zones.py` (zones and Persian Empire).

`esricheck.py` and `esrimask.py` only check the results against the Esri basemap and pick a few harbour points. No basemap geometry is stored in the data.
