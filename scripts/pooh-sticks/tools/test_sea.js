// Sea finder checks (node tools/test_sea.js): river mouths, wide river polygons, and little-known waters named by the sea they open into.
const assert = require('assert');
const L = require('../src/logic.js');
const idx = L.buildSeaIndex(require('../src/seas.json'));
const find = (lon, lat) => L.findSea(idx, lon, lat, { coastKm: 150 });
const cases = [
  // [what, lon, lat, expected sea, expected river polygon or null]
  ['Amazon stick that stopped near Gurupá (v1.1 said Canal do Norte)', -52.2, -1.7, 'Atlantic Ocean', 'Amazon'],
  ['Orinoco main mouth (Boca Grande)', -60.6, 8.6, 'Atlantic Ocean', null],
  ['Oder into the Szczecin Lagoon', 14.4, 53.75, 'Baltic Sea', null],
  ['Thames Estuary', 0.9, 51.5, 'North Sea', null],
  ['Rhine at Hook of Holland', 4.1, 51.98, 'North Sea', null],
  ['Columbia mouth', -124.05, 46.25, 'Pacific Ocean', null],
  ['Columbia estuary, upstream end', -123.25, 46.2, 'Pacific Ocean', 'Columbia River'],
  ['Yangtze mouth', 121.9, 31.4, 'East China Sea', 'Yangtze'],
  ['St Lawrence at Quebec', -71.0, 46.9, 'Gulf of Saint Lawrence', 'Saint Lawrence River'],
  ['Mississippi delta', -89.25, 29.1, 'Gulf of Mexico', null],
  ['Nile delta', 31.0, 31.55, 'Mediterranean Sea', null],
  ['Tocantins into Marajó Bay (a known bay, kept)', -48.6, -1.3, 'Marajó Bay', null],
  ['San Francisco Bay (kept)', -122.35, 37.95, 'San Francisco Bay', null],
  ['Delaware Bay (kept)', -75.2, 39.1, 'Delaware Bay', null]
];
for (const [what, lon, lat, sea, via] of cases) {
  const r = find(lon, lat);
  assert.ok(!r.inland, what + ': should reach the sea');
  assert.strictEqual(r.sea.name, sea, what);
  assert.strictEqual(r.via ? r.via.name : null, via, what + ' (river polygon)');
  console.log('ok  ', what.padEnd(64), '→', r.sea.name + (r.via ? ' via ' + r.via.name : ''));
}
// no answer is ever a little-known water (Natural Earth scalerank 8-9) or a "Boca"
for (const s of idx) {
  if (s.isRiver) continue;
  const ring = s.polys[0][0];
  const r = find(ring[0], ring[1]);
  if (!r.inland) assert.ok(r.sea.rank < 8 && !/^Bocas? /.test(r.sea.name), s.name + ' → ' + r.sea.name);
}
// the Amazon stick gets choices a child can work with
const opts = L.pickOptions(idx, find(-52.2, -1.7).sea, -75.5, -9.5, () => 0.3).map(o => o.label);
assert.ok(opts.includes('Atlantic Ocean') && opts.includes('Pacific Ocean'), opts.join(' | '));
console.log('ok   Amazon choices:', opts.join(' | '));
console.log('SEA FINDER TESTS PASSED (v' + L.MODEL_VERSIONS.sea.version + ')');
