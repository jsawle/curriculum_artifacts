// Earthquake Location Lab — the maths: wave arrival times, model seismograms, and finding an earthquake
// from S − P gaps with circles (on the map) and spheres (underground).
// No ArcGIS or page code here, so it can be tested on its own (node) and shared by other apps later.
//
// The model world is a flat local frame around a centre point: x km east, y km north, depth km down.
// Over the ~100 km of each place this differs from the curved Earth by well under 1%, and because the
// arrival times, circles and spheres all use the same frame, the method lands exactly on the answer
// when the readings are exact.

export const R = 6378.137;          // km, the globe radius the ArcGIS global scene uses
export const VP = 6.0;              // km/s, P-wave speed (typical of the upper crust)
export const VS = 3.5;              // km/s, S-wave speed
export const KM_PER_S = 1 / (1 / VS - 1 / VP); // km of distance per second of S − P gap (8.4)
const RAD = Math.PI / 180;

// ---------- the local frame ----------
export function makeFrame(lon0, lat0) {
  const ky = R * RAD, kx = R * RAD * Math.cos(lat0 * RAD);
  return {
    lon0, lat0,
    toXY: (lon, lat) => [(lon - lon0) * kx, (lat - lat0) * ky],
    toLL: (x, y) => ({ longitude: lon0 + x / kx, latitude: lat0 + y / ky })
  };
}
export const hyp3 = (dx, dy, dz) => Math.sqrt(dx * dx + dy * dy + dz * dz);

// ---------- arrival times ----------
// Straight paths at steady speeds. Times are seconds after the rock broke.
export function arrivals(stations, hypo) {
  return stations.map(s => {
    const r = hyp3(s.x - hypo.x, s.y - hypo.y, hypo.depth);
    return { r, epi: Math.hypot(s.x - hypo.x, s.y - hypo.y), tP: r / VP, tS: r / VS };
  });
}
export const gapToKm = (gap) => gap * KM_PER_S;

// ---------- model seismograms ----------
// A small seeded random generator, so each station's trace looks the same every time.
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashStr = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// One combined trace of the shaking from t0 to t1 (s after the rock broke), `fs` samples a second, scaled so the biggest wobble is 1.
// Background noise, then the P-wave (small, fast wobbles that die away) and the S-wave (bigger, slower wobbles).
export function seismogram({ seed, tP, tS, t0, t1, fs = 100 }) {
  const n = Math.max(2, Math.round((t1 - t0) * fs)), out = new Float32Array(n), rand = rng(seed);
  // smoothed noise (two passes of a one-pole filter on white noise)
  let a1 = 0, a2 = 0;
  const noise = new Float32Array(n);
  for (let i = 0; i < n; i++) { a1 = 0.7 * a1 + 0.3 * (rand() * 2 - 1); a2 = 0.6 * a2 + 0.4 * a1; noise[i] = a2; }
  // a slowly changing "roughness" that makes the codas uneven, like real ones
  const wob = new Float32Array(n); let w = 0;
  for (let i = 0; i < n; i++) { w = 0.985 * w + 0.015 * (rand() * 2 - 1) * 6; wob[i] = 0.65 + 0.35 * Math.tanh(w); }
  const mk = (fLo, fHi, k) => Array.from({ length: k }, () => ({ f: fLo + (fHi - fLo) * rand(), ph: rand() * Math.PI * 2, a: 0.6 + 0.4 * rand() }));
  const pW = mk(4.5, 8, 4), sW = mk(1.8, 3.6, 4);
  const osc = (ws, t) => ws.reduce((acc, c) => acc + c.a * Math.sin(2 * Math.PI * c.f * t + c.ph), 0) / ws.length;
  for (let i = 0; i < n; i++) {
    const t = t0 + i / fs;
    let v = 0.035 * noise[i] / 0.35;
    const tp = t - tP, ts = t - tS;
    if (tp > 0) v += 0.32 * (1 - Math.exp(-tp / 0.04)) * (0.7 * Math.exp(-tp / 0.9) + 0.3 * Math.exp(-tp / 5)) * osc(pW, t) * wob[i] * 1.6;
    if (ts > 0) v += 1.0 * (1 - Math.exp(-ts / 0.12)) * (0.65 * Math.exp(-ts / 2.2) + 0.35 * Math.exp(-ts / 8)) * osc(sW, t) * wob[i] * 1.6;
    out[i] = v;
  }
  let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(out[i]));
  if (m > 0) for (let i = 0; i < n; i++) out[i] /= m;
  return out;
}

// ---------- finding the earthquake ----------
// Where two circles on the map cross (0, 1 or 2 points). Circles: { x, y, r } in km.
export function circleCross(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d === 0 || d > a.r + b.r || d < Math.abs(a.r - b.r)) return [];
  const m = (d * d + a.r * a.r - b.r * b.r) / (2 * d), h = Math.sqrt(Math.max(0, a.r * a.r - m * m));
  const px = a.x + m * dx / d, py = a.y + m * dy / d;
  if (h < 1e-9) return [{ x: px, y: py }];
  return [{ x: px - h * dy / d, y: py + h * dx / d }, { x: px + h * dy / d, y: py - h * dx / d }];
}

// The epicentre and depth from three (or more) stations and their distances.
// Taking one sphere's equation from another's removes the unknown depth and leaves a straight line on the map
// (it runs through the two points where those circles cross). The lines meet at the epicentre.
// Depth: each station's distance and its distance across the map make a right-angled triangle (Pythagoras).
export function locate(circles) {
  const c = circles.filter(k => k && isFinite(k.r) && k.r > 0);
  if (c.length < 3) return null;
  // least squares on the lines from (station 0, station i)
  let sxx = 0, sxy = 0, syy = 0, sxb = 0, syb = 0;
  const lines = [];
  for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) {
    const a = 2 * (c[j].x - c[i].x), b = 2 * (c[j].y - c[i].y);
    const rhs = c[i].r ** 2 - c[j].r ** 2 + c[j].x ** 2 - c[i].x ** 2 + c[j].y ** 2 - c[i].y ** 2;
    lines.push({ i, j, a, b, rhs });
    sxx += a * a; sxy += a * b; syy += b * b; sxb += a * rhs; syb += b * rhs;
  }
  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1e-9) return null; // stations in a straight line
  const x = (syy * sxb - sxy * syb) / det, y = (sxx * syb - sxy * sxb) / det;
  const h2s = c.map(k => k.r ** 2 - ((k.x - x) ** 2 + (k.y - y) ** 2));
  const h2 = h2s.reduce((s, v) => s + v, 0) / h2s.length;
  // how well the circles agree: the biggest miss between a station's distance and the found hypocentre
  const depth = Math.sqrt(Math.max(0, h2));
  const misfit = Math.max(...c.map(k => Math.abs(hyp3(k.x - x, k.y - y, depth) - k.r)));
  return { x, y, depth, h2, misfit, lines };
}

// How the circles look around the epicentre: for each pair, the crossing point nearest the found epicentre.
// spread = how far those points are from it (0 when the circles all cross at one point, as for a surface earthquake).
export function crossingSpread(circles, epi) {
  const pts = [];
  let missing = 0;
  for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++) {
    const p = circleCross(circles[i], circles[j]);
    if (!p.length) { missing++; continue; }
    p.sort((u, v) => Math.hypot(u.x - epi.x, u.y - epi.y) - Math.hypot(v.x - epi.x, v.y - epi.y));
    pts.push(p[0]);
  }
  const spread = pts.length ? Math.max(...pts.map(p => Math.hypot(p.x - epi.x, p.y - epi.y))) : Infinity;
  return { pts, spread, missing };
}

// The circle where two spheres (centred on the surface) meet. It stands upright, above the straight line through
// the two crossing points on the map. Returns points on its underground half: [x, y, depth] (depth km, down positive).
export function sphereMeet(a, b, n = 48) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d === 0 || d > a.r + b.r || d < Math.abs(a.r - b.r)) return null;
  const m = (d * d + a.r * a.r - b.r * b.r) / (2 * d), rho = Math.sqrt(Math.max(0, a.r * a.r - m * m));
  const cx = a.x + m * dx / d, cy = a.y + m * dy / d, wx = -dy / d, wy = dx / d;
  return Array.from({ length: n + 1 }, (_, k) => { const ang = Math.PI * k / n; // 0..π, underground half
    return [cx + rho * Math.cos(ang) * wx, cy + rho * Math.cos(ang) * wy, rho * Math.sin(ang)]; });
}

// ---------- shapes for drawing ----------
// Points round a circle in the frame (km), as [x, y].
export const ringXY = (cx, cy, r, n = 128) => Array.from({ length: n + 1 }, (_, k) => { const a = 2 * Math.PI * k / n; return [cx + r * Math.sin(a), cy + r * Math.cos(a)]; });

// The underground part of a sphere: centre (cx, cy) on the map, centreDepth km down, radius r km, depths multiplied by `stretch`.
// Returns vertex positions (metres, x east, y north, z up, relative to the frame centre at sea level), normals and triangle indices.
export function bowl(cx, cy, centreDepth, r, stretch = 1, segAround = 48, segDown = 18) {
  // polar angle from straight down (0) up to where the sphere reaches the surface
  const top = r <= centreDepth ? Math.PI : Math.acos(Math.max(-1, Math.min(1, -centreDepth / r)));
  const pos = [], nrm = [], faces = [];
  for (let i = 0; i <= segDown; i++) {
    const ph = top * i / segDown, sp = Math.sin(ph), cp = Math.cos(ph);
    for (let j = 0; j <= segAround; j++) {
      const th = 2 * Math.PI * j / segAround, ux = sp * Math.cos(th), uy = sp * Math.sin(th);
      const depth = centreDepth + r * cp; // km down
      pos.push((cx + r * ux) * 1000, (cy + r * uy) * 1000, -Math.max(0, depth) * 1000 * stretch);
      const nz = -cp / stretch, l = Math.hypot(ux, uy, nz) || 1; nrm.push(ux / l, uy / l, nz / l); // stretched sphere's normal
    }
  }
  for (let i = 0; i < segDown; i++) for (let j = 0; j < segAround; j++) {
    const a = i * (segAround + 1) + j, b = a + segAround + 1;
    if (i === 0) faces.push(a, b, b + 1); else faces.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { pos, nrm, faces, surfaceR: r <= centreDepth ? 0 : Math.sqrt(r * r - centreDepth * centreDepth) };
}

// ---------- the time the rock broke ----------
// Each station: the P-wave arrival minus how long the P-wave took to travel its distance.
export const originFrom = (tPclock, distKm) => tPclock - distKm / VP;

// ---------- a mystery earthquake ----------
// Somewhere inside the triangle of stations (not too near an edge), 5–60 km deep.
export function mystery(stations, rand = Math.random) {
  let u = rand(), v = rand(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
  const w = 1 - u - v, k = 0.6, b = (1 - k) / 3; // shrink towards the middle so it is not right on an edge
  const [A, B, C] = stations;
  const x = (b + k * u) * A.x + (b + k * v) * B.x + (b + k * w) * C.x, y = (b + k * u) * A.y + (b + k * v) * B.y + (b + k * w) * C.y;
  return { x, y, depth: Math.round(5 + rand() * 55) };
}

// ================= the lifted block (used by the test copy) =================
// A box of ground (x0..x1 km east, y0..y1 km north of the frame centre, 0..d1 km deep) drawn lifted above where it came from.
// Inside the box, positions are frame km and depth km; the page lifts and stretches them.

// East-north-up at the frame centre, raised zM metres: the axes ArcGIS uses for a mesh whose local vertex space has its
// origin there. Points drawn with this line up exactly with such meshes. Returns [lon, lat, height m] on the scene's sphere.
export function enuToLLH(lon0, lat0, xKm, yKm, zM) {
  const lo = lon0 * RAD, la = lat0 * RAD, Rm = R * 1000;
  const up = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const east = [-Math.sin(lo), Math.cos(lo), 0];
  const north = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const P = [0, 1, 2].map(i => up[i] * (Rm + zM) + east[i] * xKm * 1000 + north[i] * yKm * 1000);
  const r = Math.hypot(P[0], P[1], P[2]);
  return [Math.atan2(P[1], P[0]) / RAD, Math.asin(P[2] / r) / RAD, r - Rm];
}

// The box: round the seismographs (and any extra points) with a margin, rounded out to whole 5 km.
export function blockBox(points, depthKm, marginKm) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y), r5 = (v, f) => f(v / 5) * 5;
  return { x0: r5(Math.min(...xs) - marginKm, Math.floor), x1: r5(Math.max(...xs) + marginKm, Math.ceil),
           y0: r5(Math.min(...ys) - marginKm, Math.floor), y1: r5(Math.max(...ys) + marginKm, Math.ceil), d1: depthKm };
}
const EPS = 1e-6;
export const inBox = (b, x, y, d) => x >= b.x0 - EPS && x <= b.x1 + EPS && y >= b.y0 - EPS && y <= b.y1 + EPS && d >= -EPS && d <= b.d1 + EPS;

// The part of a sphere (centre cx, cy, cd km deep; radius r km) inside the box, as a mesh: positions in metres
// (x east, y north, z up from the top of the box, depths multiplied by `stretch`), normals and triangles.
// Triangles wholly inside are kept, wholly outside dropped, and those crossing a face are cut along it, so the
// edge of the shape lies exactly on the box's faces. Returns null if nothing is inside.
const PLANES = (b) => [[0, b.x0, 1], [0, b.x1, -1], [1, b.y0, 1], [1, b.y1, -1], [2, 0, 1], [2, b.d1, -1]]; // inside: sign × (p[axis] − value) ≥ 0
const lerp3 = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
export function sphereInBox(cx, cy, cd, r, box, stretch = 1, nA = 64, nD = 32) {
  const P = [], Nv = [], inside = [];
  for (let i = 0; i <= nD; i++) {
    const ph = Math.PI * i / nD, sp = Math.sin(ph), cp = Math.cos(ph); // ph = 0 points straight down
    for (let j = 0; j <= nA; j++) {
      const th = 2 * Math.PI * j / nA, u = [sp * Math.cos(th), sp * Math.sin(th), cp]; // [east, north, down]
      const p = [cx + r * u[0], cy + r * u[1], cd + r * u[2]];
      P.push(p); Nv.push(u); inside.push(inBox(box, p[0], p[1], p[2]));
    }
  }
  const pos = [], nrm = [], faces = [], idx = new Int32Array(P.length).fill(-1);
  const emit = (p, u) => { pos.push(p[0] * 1000, p[1] * 1000, -p[2] * 1000 * stretch);
    const nz = -u[2] / stretch, l = Math.hypot(u[0], u[1], nz) || 1; nrm.push(u[0] / l, u[1] / l, nz / l); return pos.length / 3 - 1; };
  const get = (i) => idx[i] >= 0 ? idx[i] : (idx[i] = emit(P[i], Nv[i]));
  const planes = PLANES(box), W = nA + 1;
  for (let i = 0; i < nD; i++) for (let j = 0; j < nA; j++) {
    const a = i * W + j, b = a + W, c = a + 1, e = b + 1;
    for (const tri of [[a, b, c], [c, b, e]]) {
      const n = tri.filter(k => inside[k]).length;
      if (n === 3) { faces.push(get(tri[0]), get(tri[1]), get(tri[2])); continue; }
      if (n === 0) continue;
      let poly = tri.map(k => ({ p: P[k], u: Nv[k] }));
      for (const [ax, val, sg] of planes) {
        const out = [];
        for (let k = 0; k < poly.length; k++) {
          const A = poly[k], B = poly[(k + 1) % poly.length], da = sg * (A.p[ax] - val), db = sg * (B.p[ax] - val);
          if (da >= 0) out.push(A);
          if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push({ p: lerp3(A.p, B.p, t), u: lerp3(A.u, B.u, t) }); }
        }
        poly = out;
        if (poly.length < 3) break;
      }
      if (poly.length < 3) continue;
      const ids = poly.map(v => emit(v.p, v.u));
      for (let k = 1; k < ids.length - 1; k++) faces.push(ids[0], ids[k], ids[k + 1]);
    }
  }
  return faces.length ? { pos, nrm, faces } : null;
}

// Split a line (points [x, y, depth]) into the runs that are inside the box.
export function runsInBox(pts, box) {
  const runs = []; let cur = [];
  for (const p of pts) { if (inBox(box, p[0], p[1], p[2])) cur.push(p); else { if (cur.length > 1) runs.push(cur); cur = []; } }
  if (cur.length > 1) runs.push(cur);
  return runs;
}

// Where a sphere meets the six faces of the box: circles on each face's plane, kept where they are on the face.
export function sphereOnFaces(cx, cy, cd, r, box, n = 180) {
  const out = [], circle = (fn) => runsInBox(Array.from({ length: n + 1 }, (_, k) => fn(2 * Math.PI * k / n)), box);
  for (const k of [0, box.d1]) { const rho2 = r * r - (k - cd) ** 2; if (rho2 > 0) { const rho = Math.sqrt(rho2); out.push(...circle(t => [cx + rho * Math.cos(t), cy + rho * Math.sin(t), k])); } }
  for (const X of [box.x0, box.x1]) { const rho2 = r * r - (X - cx) ** 2; if (rho2 > 0) { const rho = Math.sqrt(rho2); out.push(...circle(t => [X, cy + rho * Math.cos(t), cd + rho * Math.sin(t)])); } }
  for (const Y of [box.y0, box.y1]) { const rho2 = r * r - (Y - cy) ** 2; if (rho2 > 0) { const rho = Math.sqrt(rho2); out.push(...circle(t => [cx + rho * Math.cos(t), Y, cd + rho * Math.sin(t)])); } }
  return out;
}
