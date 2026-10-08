// Subduction Zones Lab — the maths for slicing the Earth through a place and fitting a sinking plate to its earthquakes.
// No ArcGIS code here, so it can be tested on its own (node) and shared by other apps later.
// Distances are in km on a sphere of radius R (the globe radius the ArcGIS global scene uses).

export const R = 6378.137;
const RAD = Math.PI / 180;

// ---------- points on the globe ----------
// The point distDeg of arc from `from` along a bearing (degrees clockwise from north).
export function fromAnchor(from, bearingDeg, distDeg) {
  const lat1 = from.latitude * RAD, th = bearingDeg * RAD, d = distDeg * RAD;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(th));
  const lon2 = from.longitude * RAD + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { longitude: ((lon2 / RAD + 540) % 360) - 180, latitude: lat2 / RAD };
}
export function bearingTo(a, b) {
  const p1 = a.latitude * RAD, p2 = b.latitude * RAD, dl = (b.longitude - a.longitude) * RAD;
  return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD + 360) % 360;
}
export function ecefKm(lon, lat, rKm) {
  const cl = Math.cos(lat * RAD);
  return [rKm * cl * Math.cos(lon * RAD), rKm * cl * Math.sin(lon * RAD), rKm * Math.sin(lat * RAD)];
}
export const unitV = (v) => { const l = Math.hypot(...v); return v.map(x => x / l); };
export const dotV = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const lonLatR = (v) => { const r = Math.hypot(...v); return { longitude: Math.atan2(v[1], v[0]) / RAD, latitude: Math.asin(v[2] / r) / RAD, r }; };

// ---------- the cut ----------
// The Earth is cut in half on the great circle through q that runs along bearing `along`. The anchor is the point 90° from q
// at right angles to that circle: the cut plane faces it, and the half of the Earth around it is removed.
// Its heading points at q, so q is at the top of the cut face.
export function anchorThrough(q, along) {
  const a = fromAnchor(q, along + 90, 90);
  return { longitude: a.longitude, latitude: a.latitude, heading: bearingTo(a, q) };
}
// A frame on the cut: n faces the anchor, qv points up through q, wv points west along the cut.
export function makeFrame(anchor, q) {
  const n = ecefKm(anchor.longitude, anchor.latitude, 1), qv = ecefKm(q.longitude, q.latitude, 1);
  let wv = unitV(crossV(n, qv));
  const t = lonLatR(qv.map((x, i) => x * Math.cos(0.05) + wv[i] * Math.sin(0.05)));
  if (((t.longitude - q.longitude + 540) % 360) - 180 > 0) wv = wv.map(x => -x);
  return { anchor, q, n, qv, wv };
}
// Positions on the cut: thW = degrees round the cut west of q, depth in km (negative = above the surface),
// front = km in front of the cut face (towards the removed half), so things drawn on the cut are not hidden by it.
export const secVec = (F, thW, depth, front = 0) => { const a = thW * RAD, r = R - depth;
  return F.qv.map((x, i) => r * (x * Math.cos(a) + F.wv[i] * Math.sin(a)) + front * F.n[i]); };
export const secCoords = (F, thW, depth, front = 0) => { const p = lonLatR(secVec(F, thW, depth, front)); return [p.longitude, p.latitude, (p.r - R) * 1000]; };
// A place's position on the cut (degrees west of q) and its distance from the cut in km (positive = on the removed side).
export const onSection = (F, lon, lat, depth = 0) => { const v = ecefKm(lon, lat, R - depth);
  return { thW: Math.atan2(dotV(v, F.wv), dotV(v, F.qv)) / RAD, dist: dotV(v, F.n) }; };
// A point on the surface along the cut line (for drawing the line on the map).
export const surfaceAlong = (F, thW) => { const p = lonLatR(secVec(F, thW, 0)); return { longitude: p.longitude, latitude: p.latitude }; };

// 2D coordinates on the cut (km): x towards the west, y up through q.
export const toXY = (p) => { const a = p.thW * RAD, r = R - p.depth; return [r * Math.sin(a), r * Math.cos(a)]; };
export const fromXY = ([x, y]) => ({ thW: Math.atan2(x, y) / RAD, depth: R - Math.hypot(x, y) });

// A camera distKm in front of the cut, looking at the point (thW, depth) on it. Returns lon/lat/height (m) and heading/tilt.
export function cameraLookingAt(F, thW, depth, distKm) {
  const target = secVec(F, thW, depth), c = target.map((x, i) => x + distKm * F.n[i]);
  const p = lonLatR(c), lo = p.longitude * RAD, la = p.latitude * RAD;
  const east = [-Math.sin(lo), Math.cos(lo), 0], north = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const up = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const d = unitV(target.map((x, i) => x - c[i]));
  return { longitude: p.longitude, latitude: p.latitude, z: (p.r - R) * 1000,
    heading: (Math.atan2(dotV(d, east), dotV(d, north)) / RAD + 360) % 360, tilt: Math.acos(Math.max(-1, Math.min(1, -dotV(d, up)))) / RAD };
}
// How squarely the camera (lon, lat, height m) faces the cut: 1 = face-on, 0 = edge-on, below 0 = from behind.
export function faceCos(F, cam) {
  const c = ecefKm(cam.longitude, cam.latitude, R + (cam.z || 0) / 1000);
  return dotV(c, F.n) / Math.hypot(...c);
}

// ---------- fitting the sinking plate ----------
export const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// Going down in `step` km steps, the median position of the earthquakes in each step. Only earthquakes within 1° east or
// 3° west of the step above count (3° more for each empty step in between), so earthquakes elsewhere (for example behind the
// volcanoes) are left out. Steps with fewer than `minCount` earthquakes are skipped. pts: [{ thW, depth }].
export function fitSlab(pts, { step = 40, maxDepth = 720, minCount = 3 } = {}) {
  const out = [];
  let prev = { thW: 0, depth: 0 }, gap = 0;
  for (let d0 = 0; d0 < maxDepth; d0 += step) {
    const inBin = pts.filter(p => p.depth >= d0 && p.depth < d0 + step && p.thW > prev.thW - 1 && p.thW < prev.thW + 3 * (gap + 1));
    if (inBin.length < minCount) { if (out.length) gap++; continue; }
    prev = { thW: median(inBin.map(p => p.thW)), depth: median(inBin.map(p => p.depth)), count: inBin.length };
    out.push(prev); gap = 0;
  }
  return out;
}
// The plate's middle line: the ocean plate arriving from the east (at depth `above`, so its top is at the surface), then down
// through the fitted steps; resampled every 15 km and smoothed. Each point has its position (xy), the direction of the plate's
// underside, and the distance along the line (len, km).
export function plateLine(bins, { above = 35, eastDeg = 12 } = {}) {
  const raw = [{ thW: -eastDeg, depth: above }, { thW: -0.8, depth: above },
    ...bins.filter(b => b.thW > -0.5).map(b => ({ thW: b.thW, depth: Math.max(b.depth, above) }))];
  // resample in angle and depth (not straight lines), so the plate follows the Earth's curve instead of cutting under it
  const pts = [toXY(raw[0])];
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1], b = raw[i], [ax, ay] = toXY(a), [bx, by] = toXY(b), n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 15));
    for (let k = 1; k <= n; k++) pts.push(toXY({ thW: a.thW + (b.thW - a.thW) * k / n, depth: a.depth + (b.depth - a.depth) * k / n }));
  }
  let sm = pts;
  for (let pass = 0; pass < 3; pass++) sm = sm.map((p, i) => {
    if (i < 2 || i > sm.length - 3) return p;
    const w = sm.slice(i - 2, i + 3); return [w.reduce((t, q) => t + q[0], 0) / 5, w.reduce((t, q) => t + q[1], 0) / 5];
  });
  let len = 0;
  return sm.map((p, i) => {
    const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1;
    if (i > 0) len += Math.hypot(p[0] - sm[i - 1][0], p[1] - sm[i - 1][1]);
    return { xy: p, under: [dy / dl, -dx / dl], len };
  });
}
// A point offset from the middle line towards the top (k < 0) or underside (k > 0) of the plate, in km.
export const offsetAt = (p, k) => fromXY([p.xy[0] + k * p.under[0], p.xy[1] + k * p.under[1]]);
// The depth of the plate's top (`above` km over the middle line) under a point thW degrees west of q, or null.
export function plateTopAt(line, thW, above = 35) {
  const tops = line.map(p => offsetAt(p, -above));
  for (let i = 1; i < tops.length; i++) {
    const a = tops[i - 1], b = tops[i];
    if ((a.thW - thW) * (b.thW - thW) <= 0 && a.thW !== b.thW) return a.depth + (thW - a.thW) / (b.thW - a.thW) * (b.depth - a.depth);
  }
  return null;
}
// The plate's average slope (degrees below horizontal) between two depths on the middle line, or null if it doesn't reach them.
export function dipBetween(line, d1 = 60, d2 = 200) {
  const at = (d) => { for (let i = 1; i < line.length; i++) { const a = fromXY(line[i - 1].xy), b = fromXY(line[i].xy);
    if (a.depth <= d && b.depth >= d && b.depth > a.depth) return a.thW + (d - a.depth) / (b.depth - a.depth) * (b.thW - a.thW); } return null; };
  const t1 = at(d1), t2 = at(d2);
  if (t1 == null || t2 == null) return null;
  const across = Math.abs(t2 - t1) * RAD * (R - (d1 + d2) / 2);
  return Math.atan2(d2 - d1, across) / RAD;
}
// a point at distance s (km) along the middle line
export function alongLine(line, s) {
  let i = 1; while (i < line.length - 1 && line[i].len < s) i++;
  const a = line[i - 1], b = line[i], f = b.len > a.len ? Math.min(1, Math.max(0, (s - a.len) / (b.len - a.len))) : 0;
  return fromXY([a.xy[0] + f * (b.xy[0] - a.xy[0]), a.xy[1] + f * (b.xy[1] - a.xy[1])]);
}

// ---------- earthquakes ----------
// the same three depth classes as Earth Structure Lab
export const QUAKE_CLASSES = [[-100, 70, "#66e3ff", "0–70 km"], [70, 300, "#3b82f6", "70–300 km"], [300, 1000, "#a78bfa", "300 km and deeper"]];
export const quakeColor = (depth) => (QUAKE_CLASSES.find(([a, b]) => depth >= a && depth < b) || QUAKE_CLASSES[2])[2];
