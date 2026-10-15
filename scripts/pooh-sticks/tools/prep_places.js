// Build src/places.json: the "start somewhere" list.
// Rivers come from Natural Earth 10m river centrelines (public domain). For each river the parts are chained,
// the mouth is the end nearest a sea (or a lake with no outlet), and the start point is a short way downstream
// of the other end, so the stick starts inside the river's own valley.
const fs = require('fs');
const path = require('path');
const L = require('../src/logic.js');
const NE = process.argv[2];
const rivers = JSON.parse(fs.readFileSync(path.join(NE, 'ne_10m_rivers_lake_centerlines.geojson')));
const marine = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/seas.json')));
const lakes = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/lakes.json')));
const seaIndexAll = L.buildSeaIndex(marine);                                   // includes the Caspian (for finding the mouth end)
const seaIndex = L.buildSeaIndex(marine.filter(s => s.n !== 'Caspian Sea'));    // what the app names
const terminal = L.buildSeaIndex(lakes.filter(l => l.k === 'terminal').map(l => ({ n: l.n, c: 'lake', r: 1, p: l.p })));
const caspian = L.buildSeaIndex(marine.filter(s => s.n === 'Caspian Sea'));
const km = (a, b) => Math.hypot((a[0] - b[0]) * 111.32 * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180), (a[1] - b[1]) * 110.57);

const SPECS = [
  // [group, label, Natural Earth names, km downstream of the source for the start, options]
  // options:
  //          from = start from the end of the line nearest this point (when the sea test can't tell which end is the source)
  //          real = where the real river ends, when the line stops before the sea
  ['Europe', 'River Thames (England)', ['Thames'], 8],
  ['Europe', 'Rhine (Switzerland)', ['Rhein', 'Rhine'], 15],
  ['Europe', 'Danube (Germany)', ['Danube'], 15],
  ['Europe', 'Rhône (Lake Geneva)', ['Rhône'], 15],
  ['Europe', 'Elbe (Czechia)', ['Elbe'], 20],
  ['Europe', 'Loire (France)', ['Loire'], 20],
  ['Europe', 'Volga (Russia)', ['Volga'], 30],
  ['Africa', 'Nile (Kagera, Rwanda)', ['Kagera'], 30, { from: [29.59, -2.98], real: { type: 'sea', name: 'Mediterranean Sea' } }],
  ['Africa', 'Congo (DR Congo)', ['Congo'], 30],
  ['Africa', 'Niger (Guinea)', ['Niger'], 30],
  ['Africa', 'Zambezi (Zambia)', ['Zambezi'], 30],
  ['Africa', 'Orange (Lesotho)', ['Orange'], 30],
  ['Africa', 'Okavango (Cubango, Angola)', ['Cubango'], 30, { from: [16.15, -12.65], real: { type: 'inland', name: 'Okavango Delta' } }],
  ['Asia', 'Yangtze (China)', ['Yangtze'], 40],
  ['Asia', 'Yellow River (Qinghai, China)', ['Huang'], 40],
  ['Asia', 'Mekong (Tibetan Plateau)', ['Mekong'], 40],
  ['Asia', 'Ganges (Himalaya, India)', ['Ganges'], 20],
  ['Asia', 'Indus (Tibet)', ['Indus'], 40],
  ['Asia', 'Brahmaputra (Assam, India)', ['Brahmaputra'], 20],
  ['Asia', 'Lena (Siberia)', ['Lena'], 40],
  ['Asia', 'Amur (China–Russia border)', ['Amur'], 30],
  ['North America', 'Mississippi (Minnesota)', ['Mississippi'], 10],
  ['North America', 'Missouri (Montana)', ['Missouri'], 30, { from: [-111.52, 46.36], real: { type: 'sea', name: 'Gulf of Mexico' } }],
  ['North America', 'Colorado (Colorado)', ['Colorado'], 20],
  ['North America', 'Columbia (British Columbia)', ['Columbia'], 20],
  ['North America', 'Rio Grande (Colorado)', ['Rio Grande'], 20],
  ['North America', 'Hudson (New York)', ['Hudson'], 15],
  ['North America', 'Yukon (Canada)', ['Yukon'], 30],
  ['South America', 'Amazon (Ucayali, Peru)', ['Ucayali'], 40, { from: [-71.67, -15.34], real: { type: 'sea', name: 'Atlantic Ocean' } }],
  ['South America', 'Paraná (Paranaíba, Brazil)', ['Paranaíba'], 30, { from: [-46.31, -19.17], real: { type: 'sea', name: 'Río de la Plata' } }],
  // the Natural Earth line ends in a western delta channel by the Gulf of Paria; the river's mouth is the Atlantic Ocean (Wikipedia, Orinoco)
  ['South America', 'Orinoco (Venezuela)', ['Orinoco'], 30, { real: { type: 'sea', name: 'Atlantic Ocean' } }],
  ['Oceania', 'Murray (Australia)', ['Murray'], 20]
];

function linesOf(name) {
  const out = [];
  for (const f of rivers.features) {
    const p = f.properties;
    if ((p.name_en || p.name) !== name && p.name !== name) continue;
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'LineString') out.push(g.coordinates.map(c => c.slice(0, 2)));
    else if (g.type === 'MultiLineString') g.coordinates.forEach(l => out.push(l.map(c => c.slice(0, 2))));
  }
  return out;
}
function chain(parts) {
  // greedily join parts end to end (within 3 km), keep the longest chain
  const segs = parts.map(p => p.slice());
  let best = [];
  for (let s = 0; s < segs.length; s++) {
    let line = segs[s].slice();
    const used = new Set([s]);
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < segs.length; i++) {
        if (used.has(i)) continue;
        const a = segs[i], h = line[0], t = line[line.length - 1];
        if (km(t, a[0]) < 3) { line = line.concat(a.slice(1)); used.add(i); grew = true; }
        else if (km(t, a[a.length - 1]) < 3) { line = line.concat(a.slice(0, -1).reverse()); used.add(i); grew = true; }
        else if (km(h, a[a.length - 1]) < 3) { line = a.slice(0, -1).concat(line); used.add(i); grew = true; }
        else if (km(h, a[0]) < 3) { line = a.slice(1).reverse().concat(line); used.add(i); grew = true; }
      }
    }
    if (lengthKm(line) > lengthKm(best)) best = line;
  }
  return best;
}
function lengthKm(line) { let s = 0; for (let i = 1; i < line.length; i++) s += km(line[i - 1], line[i]); return s; }
function along(line, d) {
  let s = 0;
  for (let i = 1; i < line.length; i++) {
    const seg = km(line[i - 1], line[i]);
    if (s + seg >= d) { const t = (d - s) / seg; return [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])]; }
    s += seg;
  }
  return line[line.length - 1];
}
const nearestDist = (index, p) => Math.min(...index.map(s => L.distToSeaKm(s, p[0], p[1], 3000)));

if (process.argv[3] === 'inspect') {
  for (const n of process.argv.slice(4)) {
    const line = chain(linesOf(n));
    if (line.length < 2) { console.log(n, 'none'); continue; }
    const a = line[0], b = line[line.length - 1];
    console.log(n.padEnd(14), lengthKm(line).toFixed(0).padStart(5), 'km  ends', a.map(v => v.toFixed(2)).join(','), '|', b.map(v => v.toFixed(2)).join(','), '| parts', linesOf(n).length);
  }
  process.exit(0);
}
const out = [
  { id: 'poohsticks-bridge', group: 'Pooh Sticks', label: 'Poohsticks Bridge, Ashdown Forest (England)', lon: 0.097407, lat: 51.084674, zoom: 15,
    real: { type: 'sea', name: 'North Sea', via: 'Mill Brook, the River Medway and the Thames Estuary' } },
  { id: 'sandford-lock', group: 'Pooh Sticks', label: 'World Poohsticks Championships, Sandford Lock (River Thames)', lon: -1.233104, lat: 51.708048, zoom: 15,
    real: { type: 'sea', name: 'North Sea', via: 'the River Thames' } }
];
for (const [group, label, names, startKm, opt = {}] of SPECS) {
  const ne = names[0];
  const line = chain(names.flatMap(linesOf));
  if (line.length < 2) { console.log('MISSING', ne); continue; }
  const a = line[0], b = line[line.length - 1];
  const da = Math.min(nearestDist(seaIndexAll, a), nearestDist(terminal, a));
  const db = Math.min(nearestDist(seaIndexAll, b), nearestDist(terminal, b));
  let ordered = da < db ? line.slice().reverse() : line;            // source first
  if (opt.from) ordered = km(line[0], opt.from) <= km(line[line.length - 1], opt.from) ? line : line.slice().reverse();
  const mouth = ordered[ordered.length - 1], len = lengthKm(ordered);
  const start = along(ordered, Math.min(startKm, len * 0.05));
  let real;
  const t = nearestDist(terminal, mouth), c = nearestDist(caspian, mouth);
  const s = L.findSea(seaIndex, mouth[0], mouth[1]);
  if (c < 60) real = { type: 'inland', name: 'Caspian Sea' };
  else if (t < 30) real = { type: 'inland', name: terminal.find(x => L.distToSeaKm(x, mouth[0], mouth[1], 60) < 30).name };
  else if (!s.inland) real = { type: 'sea', name: s.sea.name };
  else real = { type: 'inland', name: null };
  if (opt.real) real = opt.real;
  out.push({ id: ne.toLowerCase().replace(/[^a-z]+/g, '-'), group, label, lon: +start[0].toFixed(5), lat: +start[1].toFixed(5), zoom: 12, real });
  console.log(`${label.padEnd(30)} line ${len.toFixed(0).padStart(5)} km | start ${start.map(v => v.toFixed(3))} | source end ${ordered[0].map(v => v.toFixed(2))} | mouth ${mouth.map(v => v.toFixed(2))} → ${real.type} ${real.name}`);
}
fs.writeFileSync(path.join(__dirname, '../src/places.json'), JSON.stringify(out));
console.log(out.length, 'places');
