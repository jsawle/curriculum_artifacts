// Synthetic-terrain tests for src/flow.js.
const assert = require('assert');
const F = require('../src/flow.js');

const LAT0 = 45, LON0 = 0;
const KX = 1 / Math.cos(LAT0 * Math.PI / 180);           // merc metres per ground metre at LAT0
const [MX0, MY0] = F.toMerc(LON0, LAT0);
const toXY = (x, y) => [(x - MX0) / KX / 1000, (y - MY0) / KX / 1000];   // merc → local km
const toM = (X, Y) => [MX0 + X * 1000 * KX, MY0 + Y * 1000 * KX];          // local km → merc
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// Scenario builders return elevation functions of local km (X east, Y north)
function valleyBase(X, Y) {
  if (X > 300) return -40 - (X - 300) * 2;                  // sea floor
  const base = 4 * (300 - X);                               // 4 m per km down to the coast
  const side = 25 * Math.abs(Y);                            // valley sides, 25 m per km
  const noise = 3 * hash(Math.floor(X * 10), Math.floor(Y * 10));   // small pits every ~100 m
  return base + side + noise;
}
const scenarios = {
  valley: (X, Y) => valleyBase(X, Y),
  lake: (X, Y) => {
    let z = valleyBase(X, Y);
    const r = Math.hypot(X - 155, Y);
    if (r < 12 && X <= 300) z = Math.min(z, 4 * (300 - 155) - 80 * (1 - r / 12)); // bowl 80 m deep below the inflow level
    return z;
  },
  twohollows: (X, Y) => {
    let z = valleyBase(X, Y);
    const rA = Math.hypot(X - 100, Y), rB = Math.hypot(X - 104, Y);
    if (rA < 3) z = Math.min(z, 4 * 200 - 40 * (1 - rA / 3));
    if (rB < 3) z = Math.min(z, 4 * 196 - 30 * (1 - rB / 3));
    if (X > 101.8 && X < 102.2 && Math.abs(Y) < 3) z = Math.max(z, 4 * 198 + 12);  // ridge between the two hollows
    return z;
  },
  gorge: (X, Y) => {
    // wide, very gently sloping plain upstream of a ridge cut by a 120 m-wide gorge
    if (X > 300) return -40;
    let z;
    if (X < 200) z = 4 * 100 + 0.2 * (200 - X) + 0.5 * Math.abs(Y) + 1 * hash(Math.floor(X * 5), Math.floor(Y * 5));
    else z = 4 * (300 - X) + 25 * Math.abs(Y);
    if (X > 196 && X < 206) {
      const ridge = 4 * 100 + 250;                 // ridge 250 m above the plain
      if (Math.abs(Y) > 0.06) z = Math.max(z, ridge);
      else z = Math.min(z, 4 * 100 - (X - 196) * 1.5);   // the gorge floor keeps going down
    }
    return z;
  },
  basin: (X, Y) => {
    const r = Math.hypot(X - 100, Y);
    if (X > 300) return -40;
    if (r < 60) return 900 + 350 * Math.pow(r / 60, 2) + 2 * hash(Math.floor(X * 10), Math.floor(Y * 10)); // closed bowl, rim 1250 m
    return Math.max(4 * (300 - X), 1250 - (r - 60) * 3);
  },
  terminal: (X, Y) => {
    const r = Math.hypot(X - 100, Y);
    if (X > 300) return -40;
    if (r < 40) return 600 + 400 * Math.pow(r / 40, 2);
    return Math.max(4 * (300 - X), 1000 - (r - 40) * 3);
  }
};

function circle(X, Y, R, n = 64) {
  const ring = [];
  for (let i = 0; i <= n; i++) { const a = i / n * 2 * Math.PI; const m = toM(X + R * Math.cos(a), Y + R * Math.sin(a)); const ll = F.toLonLat(m[0], m[1]); ring.push(ll[0], ll[1]); }
  return [ring];
}
function rect(X0, Y0, X1, Y1) {
  const pts = [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1], [X0, Y0]];
  return [pts.flatMap(([X, Y]) => { const m = toM(X, Y); return F.toLonLat(m[0], m[1]); })];
}
const seaFeature = { name: 'Test Sea', kind: 'sea', polys: [rect(302, -400, 900, 400)] };

function makeStore(fn, features, sub = 3) {
  return new F.TileStore(async (L, tx, ty) => {
    const z = new Float32Array(65536), r = F.res(L);
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
      let s = 0;
      for (let a = 0; a < sub; a++) for (let b = 0; b < sub; b++) {
        const x = (tx * 256 + i + (a + 0.5) / sub) * r - F.ORIGIN, y = F.ORIGIN - (ty * 256 + j + (b + 0.5) / sub) * r;
        const [X, Y] = toXY(x, y);
        s += fn(X, Y);
      }
      z[j * 256 + i] = s / (sub * sub);
    }
    return z;
  }, F.prepareFeatures(features));
}
const nearSea = (lon, lat) => { const m = F.toMerc(lon, lat); const [X] = toXY(m[0], m[1]); return Math.max(0, 302 - X); };

async function run(name, fn, features, startXY, opts) {
  const store = makeStore(fn, features);
  const t = Date.now();
  const r = await F.trace(store, toM(...startXY), nearSea, opts);
  const end = toXY(r.end.x, r.end.y);
  console.log(`${name.padEnd(11)} → ${r.end.type}${r.end.feature ? ' (' + r.end.feature.name + ')' : ''} at X=${end[0].toFixed(1)} Y=${end[1].toFixed(1)} | ${r.km.toFixed(1)} km | stretches ${r.stats.stretches} cells ${r.stats.cells} esc ${r.stats.escalations} gorge ${r.stats.gorgeRetries} | levels ${r.stats.levels.join(',')} | tiles ${r.stats.tiles} | ${Date.now() - t} ms`);
  return { r, end };
}

(async () => {
  // rasteriser sanity: a circle covers about the right number of cells
  {
    const feats = F.prepareFeatures([{ name: 'c', kind: 'lake', polys: [circle(0, 0, 5)] }]);
    const L = 10, m = toM(0, 0), [gx, gy] = F.cellOf(m[0], m[1], L);
    let n = 0;
    for (let ty = (gy >> 8) - 1; ty <= (gy >> 8) + 1; ty++) for (let tx = (gx >> 8) - 1; tx <= (gx >> 8) + 1; tx++) n += F.rasterizeTile(feats, L, tx, ty).reduce((a, v) => a + (v ? 1 : 0), 0);
    const cell = F.res(L) / KX / 1000;
    const want = Math.PI * 25 / (cell * cell);
    console.log(`rasterise circle: ${n} cells vs ${want.toFixed(0)} expected`);
    assert.ok(Math.abs(n - want) / want < 0.03);
  }
  // heap order
  { const h = new F.Heap(); [5, 1, 4, 1, 3, 9, 2].forEach((e, i) => h.push(i, 0, e)); const out = []; while (h.n) out.push(h.pop().e); assert.deepStrictEqual(out, [1, 1, 2, 3, 4, 5, 9]); }

  let res = await run('valley', scenarios.valley, [seaFeature], [20, 3]);
  assert.strictEqual(res.r.end.type, 'sea'); assert.ok(Math.abs(res.end[1]) < 1.5 && res.end[0] > 295, 'reaches the coast along the valley');
  assert.ok(Math.abs(res.r.km - 283) < 25, 'distance about right');

  res = await run('lake', scenarios.lake, [seaFeature, { name: 'Bowl Lake', kind: 'lake', polys: [circle(155, 0, 10)] }], [20, 3]);
  assert.strictEqual(res.r.end.type, 'sea'); assert.ok(res.end[0] > 295);

  res = await run('lake-nomask', scenarios.lake, [seaFeature], [20, 3]);
  assert.strictEqual(res.r.end.type, 'sea', 'a deep lake without a mapped outline still drains');

  res = await run('twohollows', scenarios.twohollows, [seaFeature], [20, 3]);
  assert.strictEqual(res.r.end.type, 'sea', 'no ping-pong between two hollows');

  res = await run('gorge', scenarios.gorge, [seaFeature], [20, 3]);
  assert.strictEqual(res.r.end.type, 'sea', 'finds the narrow gorge');
  assert.ok(Math.abs(res.end[1]) < 2);

  res = await run('basin', scenarios.basin, [seaFeature], [100, 30]);
  assert.strictEqual(res.r.end.type, 'inland', 'closed basin keeps its water');
  assert.ok(Math.hypot(res.end[0] - 100, res.end[1]) < 10);

  res = await run('terminal', scenarios.terminal, [seaFeature, { name: 'Salty Lake', kind: 'terminal', polys: [circle(100, 0, 15)] }], [100, 35]);
  assert.strictEqual(res.r.end.type, 'terminal'); assert.strictEqual(res.r.end.feature.name, 'Salty Lake');

  // abort
  const ac = new AbortController(); ac.abort();
  await assert.rejects(() => F.trace(makeStore(scenarios.valley, [seaFeature]), toM(20, 3), nearSea, {}, null, ac.signal), e => e.name === 'AbortError');

  // simplify keeps ends and reduces points
  const line = Array.from({ length: 1000 }, (_, i) => [i, Math.sin(i / 50) * 10 + (i % 2) * 0.01]);
  const s = F.simplify(line, 0.5);
  assert.ok(s.length < 200 && s[0] === line[0] && s[s.length - 1] === line[999]);
  console.log('SYNTHETIC FLOW TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
