"""Static palaeo-landscape drape (Web Mercator JPEG) and present-day land mask for the app grid."""
import sys, os, json, gzip, math
import numpy as np, netCDF4 as nc
from pyproj import Transformer
from scipy.ndimage import map_coordinates, distance_transform_edt
from matplotlib.path import Path
from PIL import Image

SCR = sys.argv[1]
G = os.path.join(SCR, "dl", "icesheet", "global")
OUT = os.path.join(SCR, "build", "ice-age-europe", "data")
LON0, LON1, LAT0, LAT1 = -16.0, 35.0, 45.0, 73.5
R = 6378137.0
mx = lambda lon: R * np.radians(lon)
my = lambda lat: R * np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))
x0, x1, y0, y1 = mx(LON0), mx(LON1), my(LAT0), my(LAT1)
PW = 2200
PH = int(round(PW * (y1 - y0) / (x1 - x0)))
xs = x0 + (np.arange(PW) + 0.5) * (x1 - x0) / PW
ys = y1 - (np.arange(PH) + 0.5) * (y1 - y0) / PH   # top row = north
XX, YY = np.meshgrid(xs, ys)
LON = np.degrees(XX / R)
LAT = np.degrees(2 * np.arctan(np.exp(YY / R)) - np.pi / 2)

laea = Transformer.from_crs("EPSG:4326", "+proj=laea +lat_0=90 +lon_0=0 +ellps=WGS84", always_xy=True)
d = nc.Dataset(os.path.join(G, "Eurasia", "topo", "Eurasia.nc"))
ex, ey, ez = d["x"][:].data, d["y"][:].data, d["z"][:].data.astype(np.float64)
X0, Y0 = laea.transform(-12.0, 47.0)
gx, gy = laea.transform(LON, LAT)
fi = (gx - X0 - ex[0]) / (ex[1] - ex[0]); fj = (gy - Y0 - ey[0]) / (ey[1] - ey[0])
inside = (fi >= 0) & (fi <= len(ex) - 1) & (fj >= 0) & (fj <= len(ey) - 1)
z5 = map_coordinates(ez, [fj, fi], order=1, mode="nearest")
g25 = nc.Dataset(os.path.join(G, "global_grid", "Rtopo-2", "filtered_bed_topo_0.25.nc"))
glon, glat, gz = g25["lon"][:].data, g25["lat"][:].data, g25["z"][:].data.astype(np.float64)
z25 = map_coordinates(gz, [(LAT - glat[0]) / (glat[1] - glat[0]), (LON - glon[0]) / (glon[1] - glon[0])], order=3)
w = np.clip(distance_transform_edt(inside) / 12.0, 0, 1)
z = np.where(inside, w * z5 + (1 - w) * z25, z25)

# muted height tint: one palette for land and for sea floor that was dry land when sea level was low.
# Colours only show height (a drawing, not a record of what covered the ground).
stops = [(-6000, (34, 52, 70)), (-400, (44, 66, 86)), (-160, (70, 90, 96)), (-130, (104, 120, 92)), (0, (122, 140, 100)),
         (250, (140, 152, 106)), (700, (166, 160, 122)), (1300, (190, 180, 158)), (2200, (222, 218, 210)), (3500, (240, 238, 234))]
se = np.array([s[0] for s in stops], float); sc = np.array([s[1] for s in stops], float)
rgb = np.stack([np.interp(z, se, sc[:, k]) for k in range(3)], -1)
# light hillshade (the 3D ground adds its own lighting)
pxm = (x1 - x0) / PW * np.cos(np.radians(LAT))
dzdx = np.gradient(z, axis=1) / pxm; dzdy = -np.gradient(z, axis=0) / pxm
az, alt = math.radians(315), math.radians(45)
lx, ly, lz = math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)
n = np.sqrt(dzdx ** 2 + dzdy ** 2 + 1)
shade = np.clip((-dzdx * lx - dzdy * ly + lz) / n, 0, 1)
f = 0.72 + 0.4 * shade
rgb = np.clip(rgb * f[..., None], 0, 255).astype(np.uint8)
Image.fromarray(rgb).save(os.path.join(OUT, "drape.jpg"), quality=86, optimize=True, progressive=True)
json.dump({"crs": "EPSG:3857", "xmin": x0, "xmax": x1, "ymin": y0, "ymax": y1, "W": PW, "H": PH,
           "source": "RTopo-2 bed topography (Schaffer et al. 2016, CC BY 4.0) as filtered and projected in Gowan's ICESHEET 2.0 repository; 0.25 degree RTopo-2 outside its area"},
          open(os.path.join(OUT, "drape.json"), "w"), indent=1)
print("drape", PW, PH, os.path.getsize(os.path.join(OUT, "drape.jpg")))

# present-day land mask on the app grid (Natural Earth 50 m), used so present land below sea level (polders) is not flooded
DLON, DLAT = 0.16, 0.08
lons = np.arange(LON0, LON1 + 1e-9, DLON); lats = np.arange(LAT0, LAT1 + 1e-9, DLAT)
GL, GT = np.meshgrid(lons, lats)
pts = np.column_stack([GL.ravel(), GT.ravel()])
coast = json.load(open(os.path.join(OUT, "coast.json")))
land = np.zeros(len(pts), bool)
for ring in coast["land"]:
    land |= Path(np.array(ring)).contains_points(pts)
with gzip.open(os.path.join(OUT, "land.u8.gz"), "wb", 9) as fz:
    fz.write(land.astype(np.uint8).tobytes())
print("land cells", land.sum(), "of", len(pts))
