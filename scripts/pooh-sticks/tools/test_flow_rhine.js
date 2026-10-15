// Real-terrain test: the Rhine basin (MERIT DEM 30", from the pyflwdir examples) served as Web Mercator tiles,
// traced with src/flow.js and compared with the MERIT Hydro D8 flow-direction grid.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const F = require('../src/flow.js');
const DIR = process.argv[2];
const hdr = JSON.parse(fs.readFileSync(path.join(DIR, 'hdr.json')));
const elv = new Float32Array(fs.readFileSync(path.join(DIR, 'elv.f32')).buffer.slice(0));
const d8 = new Uint8Array(fs.readFileSync(path.join(DIR, 'd8.u8')));
const OUT = [4.045833, 51.829167];
const kmBetween = (a, b) => Math.hypot((a[0] - b[0]) * 111.32 * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180), (a[1] - b[1]) * 110.57);

function rawAt(i, j) { if (i < 0 || j < 0 || i >= hdr.W || j >= hdr.H) return NaN; return elv[j * hdr.W + i]; }
function sample(lon, lat) {
  const fx = (lon - hdr.x0) / hdr.dx - 0.5, fy = (lat - hdr.y0) / hdr.dy - 0.5;
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const a = rawAt(i, j), b = rawAt(i + 1, j), c = rawAt(i, j + 1), d = rawAt(i + 1, j + 1);
  const w = [[a, (1 - u) * (1 - v)], [b, u * (1 - v)], [c, (1 - u) * v], [d, u * v]].filter(p => !Number.isNaN(p[0]));
  if (!w.length) return NaN;
  const ws = w.reduce((s, p) => s + p[1], 0);
  return ws > 0 ? w.reduce((s, p) => s + p[0] * p[1], 0) / ws : w[0][0];
}
function makeStore(features) {
  return new F.TileStore(async (L, tx, ty) => {
    const z = new Float32Array(65536), r = F.res(L);
    // average a few samples per cell so coarse cells behave like averaged elevation tiles
    const sub = Math.max(1, Math.min(4, Math.round(r / 900)));
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
      let s = 0, n = 0;
      for (let a = 0; a < sub; a++) for (let b = 0; b < sub; b++) {
        const x = (tx * 256 + i + (a + 0.5) / sub) * r - F.ORIGIN, y = F.ORIGIN - (ty * 256 + j + (b + 0.5) / sub) * r;
        const [lon, lat] = F.toLonLat(x, y);
        let e = sample(lon, lat);
        if (Number.isNaN(e) && kmBetween([lon, lat], OUT) < 25) e = -10;   // the sea beyond the delta
        if (!Number.isNaN(e)) { s += e; n++; }
      }
      z[j * 256 + i] = n ? s / n : NaN;
    }
    return z;
  }, F.prepareFeatures(features));
}
function circle(lon, lat, km, n = 48) {
  const ring = [];
  for (let k = 0; k <= n; k++) { const a = k / n * 2 * Math.PI; ring.push(lon + km * Math.cos(a) / (111.32 * Math.cos(lat * Math.PI / 180)), lat + km * Math.sin(a) / 110.57); }
  return [ring];
}
// Natural Earth lakes inside the basin box, as 'lake'
const ne = JSON.parse(fs.readFileSync(path.join(DIR, '..', '..', 'ne', 'ne_10m_lakes.geojson')));
const lakes = [];
for (const f of ne.features) {
  const g = f.geometry; const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const inBox = polys.some(p => p[0].some(([x, y]) => x > 3.5 && x < 12 && y > 46.3 && y < 52));
  if (!inBox) continue;
  lakes.push({ name: f.properties.name, kind: f.properties.featurecla === 'Alkaline Lake' ? 'terminal' : 'lake', polys: polys.map(p => p.map(r => r.flat())) });
}
const features = [{ name: 'North Sea (test)', kind: 'sea', polys: [circle(OUT[0], OUT[1], 12)] }, ...lakes];

function refTrace(lon, lat) {
  let i = Math.floor((lon - hdr.x0) / hdr.dx), j = Math.floor((lat - hdr.y0) / hdr.dy);
  const pts = [];
  const D = { 1: [1, 0], 2: [1, 1], 4: [0, 1], 8: [-1, 1], 16: [-1, 0], 32: [-1, -1], 64: [0, -1], 128: [1, -1] };
  for (let k = 0; k < 100000; k++) {
    pts.push([hdr.x0 + (i + 0.5) * hdr.dx, hdr.y0 + (j + 0.5) * hdr.dy]);
    const v = d8[j * hdr.W + i];
    if (!D[v]) break;
    i += D[v][0]; j += D[v][1];
  }
  return pts;
}
function nearestKm(pts, p) {
  let best = Infinity;
  for (const q of pts) { const d = kmBetween(p, q); if (d < best) best = d; }
  return best;
}

const starts = [
  ['Rhine source (Lake Toma)', 8.672, 46.633],
  ['Aare at Bern', 7.447, 46.949],
  ['Lake Constance', 9.40, 47.62],
  ['Neckar at Stuttgart', 9.185, 48.79],
  ['Red Main near Bayreuth', 11.58, 49.94],
  ['Moselle in the Vosges', 6.90, 47.95],
  ['Kinzig, Black Forest', 8.30, 48.30],
  ['Lahn at Marburg', 8.77, 50.80]
];
const opts = { schedule: [[3, 9], [30, 8], [Infinity, 7]], minEscapeLevel: 5, maxLevel: 10, maxMs: 300000 };
const nearSea = (lon, lat) => Math.max(0, kmBetween([lon, lat], OUT) - 12);

(async () => {
  let pass = 0;
  for (const [name, lon, lat] of starts) {
    const store = makeStore(features);
    const t = Date.now();
    const r = await F.trace(store, F.toMerc(lon, lat), nearSea, opts);
    const ll = r.coords.map(c => F.toLonLat(c[0], c[1]));
    const ref = refTrace(lon, lat);
    const refEnd = ref[ref.length - 1];
    const step = Math.max(1, Math.floor(ll.length / 400));
    let w2 = 0, w5 = 0, n = 0;
    for (let k = 0; k < ll.length; k += step) { const d = nearestKm(ref, ll[k]); n++; if (d <= 2) w2++; if (d <= 5) w5++; }
    const endLL = F.toLonLat(r.end.x, r.end.y);
    const ok = r.end.type === 'sea' && kmBetween(endLL, OUT) < 20;
    if (ok) pass++;
    console.log(`${ok ? 'OK ' : 'BAD'} ${name.padEnd(26)} ${r.end.type.padEnd(8)} end ${kmBetween(endLL, OUT).toFixed(0).padStart(4)} km from mouth | ours ${r.km.toFixed(0).padStart(4)} km, ref ${(ref.length * 0.9).toFixed(0).padStart(4)}~km to (${refEnd.map(v => v.toFixed(2))}) | on ref path ≤2 km ${(100 * w2 / n).toFixed(0)}%, ≤5 km ${(100 * w5 / n).toFixed(0)}% | stretches ${r.stats.stretches} esc ${r.stats.escalations} gorge ${r.stats.gorgeRetries} levels ${r.stats.levels} | ${Date.now() - t} ms`);
  }
  console.log(`${pass}/${starts.length} reached the Rhine mouth`);
  assert.ok(pass >= 7, 'most starts should reach the mouth');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
