/* Ice Age engine, TEST COPY, used by ice-age-ks3-test.html and ice-age-gcse-test.html.
   Changes are tried here before they go into ice-age-engine.js (the live pages' engine).
   Data, models, map and controls live here; each page supplies its own story steps, map-key layers and teacher notes.
   Versions: each page sets its app version; the models below carry their own numbers.
   Bump a model's number when its maths or data handling changes, and the page's app version on every release. */

export const SHARED_MODELS = [
  ["Ice outlines", "1.0", "Gowan et al. 2021 Eurasian margins every 2.5 ka, 0–80 ka (DATED-1 based 25–10 ka); between outlines the edge moves by blending each outline's signed distance to its edge, thickness blended in a straight line and tapered near the moving edge (1.5 × flat-bed Nye profile)"],
  ["Ice thickness", "1.1", "Perfectly plastic ice (Nye) built outwards from the margin over RTopo-2 bed, Gowan's basal shear stress domains (15–195 kPa), flotation thickness at marine margins, no isostatic sinking; 0.16° × 0.08° grid. 1.1: the 3D ice is cut along a smoothed ice edge (marching squares on the blended edge distance after two 3 × 3 box blurs) and tapers to the bed there, instead of stepping cell by cell; display only, readouts use the unsmoothed ice"],
  ["Sea level", "1.1", "North Sea relative sea level: −50 m at 11 ka and −15 m at 8 ka (Hijma et al. 2025); from 7.5 ka to today the northern Netherlands curve of Meijles et al. 2018, counted back from today's level with their rates (about −10.8 m at 7.5 ka, −5.5 m at 6 ka, −3.1 m at 4.5 ka, −1.5 m at 2.5 ka); Spratt & Lisiecki 2016 stack (1 ka steps) from 13 ka back; straight lines between; one value for the whole map. 1.1: replaces the 1.0 straight line from −15 m at 8 ka to today, which kept Dogger Bank dry until about 6.9 ka"],
  ["Sea surface", "1.1", "Water where the bed is below sea level and joined to the open sea (priority flood), widened 2 cells so the 3D ground draws the shoreline; today's land below sea level (polders) kept dry. 1.1: the widening may run under the ice edge, so no gap shows at ice fronts"],
  ["Lakes", "1.1", "Priority flood with the ice as a barrier; lakes over 2,000 km² touching the ice, and any lake over 25,000 km², filled to their overflow level; no isostatic sinking. 1.1: the lake surface may run one cell under the ice edge, so no gap shows against the ice"],
  ["Terrain", "1.0", "Esri TopoBathy 3D × 1, 5, 10 or 20; ground colour is an RTopo-2 height tint (a drawing, not past vegetation)"],
  ["Climate chart", "1.0", "GISP2 δ¹⁸O 0–80 ka; stage bands: Dimlington 31–14.7 ka, Windermere 14.692–12.896 ka, Loch Lomond 12.896–11.703 ka (GICC05), MIS boundaries 71, 57, 29, 14 ka (LR04)"],
  ["BRITICE layers", "1.2", "Live University of Sheffield BRITICE v2 services (OGL v2) and Esri UK Education's Loch Lomond Readvance layer (from BRITICE, Clark et al. 2004); landforms drawn below 1:5,000,000. 1.1: adds cirques, crag and tails, erratic pathways and streamlined bedrock (pages choose which to offer). 1.2: moraines also drawn as areas (BRITICE moraine areas and large moraines), erratics with their source-rock areas; the drumlin and lineation lines are replaced by Drumlin fields and ice flow, and streamlined bedrock is folded into its flow lines"],
  ["Drumlin fields and ice flow", "1.0", "New in 1.7 test. Worked out in the browser from the BRITICE generalised lines. Drumlin fields: subglacial lineations counted in a 0.05° × 0.03° grid (about 3 km), widened 2 cells and shrunk 1, groups of fewer than 4 lineations dropped, edges smoothed (3 × 3 blur, contour at 0.5). Ice-flow lines: the length-weighted mean direction (doubled-angle average) of lineations, streamlined bedrock and crag and tails in 0.3° × 0.18° squares (about 20 km) with at least 3 lines that agree (R ≥ 0.45), drawn 12 km long. A line shows the axis the ice flowed along, not which way along it"],
  ["Place check", "1.0", "New in 1.2. Reads the app's own grid at the clicked or chosen place (nearest 0.16° × 0.08° cell): ice thickness, sea depth, lake depth or height above the sea of that time, and today's ground height (RTopo-2)"],
  ["Dry North Sea floor", "1.0", "New in 1.2. Area of grid cells that are North Sea floor today (below 0 m in RTopo-2, not Natural Earth 50 m land, joined to the central North Sea, 4° W–9.5° E and 50.8–58.5° N) but dry, ice-free and not lake at the time shown"]
];

const PLACES = [["London", -0.13, 51.51], ["Dublin", -6.26, 53.35], ["Edinburgh", -3.19, 55.95], ["Amsterdam", 4.9, 52.37], ["Copenhagen", 12.57, 55.68],
  ["Oslo", 10.75, 59.91], ["Stockholm", 18.07, 59.33], ["Helsinki", 24.94, 60.17], ["Dogger Bank", 2.0, 54.8, true], ["Mount Billingen", 13.75, 58.4, true]];
const CHECK_PLACES = [["Dogger Bank (middle of the North Sea)", 2.0, 54.8], ["Off the Norfolk coast", 2.0, 53.2], ["Brown Bank (between Norfolk and the Netherlands)", 3.3, 52.6],
  ["London", -0.13, 51.51], ["York", -1.08, 53.96], ["Lake District", -3.05, 54.5], ["Snowdonia", -3.95, 53.07], ["Edinburgh", -3.19, 55.95], ["Ben Nevis", -5.0, 56.8],
  ["Dublin", -6.26, 53.35], ["Amsterdam", 4.9, 52.37], ["Oslo", 10.75, 59.91], ["Stockholm", 18.07, 59.33], ["Gotland Deep (Baltic Sea)", 20.0, 57.3]];

const BRIT = "https://services2.arcgis.com/Dn40vzt2R38VJsSS/arcgis/rest/services/Gneralised_BRITICE/FeatureServer/";
const LANDFORM_MIN_SCALE = 5000000;
// BRITICE generalised layers: 0 cirques, 1 crag and tails, 2 erratic pathways, 3 eskers, 4 streamlined bedrock, 5 lake dams, 6 meltwater channels,
// 7 moraine lines, 8 subglacial lineations (drumlins), 11 erratic source areas, 12 lake areas, 13 moraine areas, 14 large moraines (polygons)
// lines: line layers drawn as they are; areas: polygon layers drawn under them; derived: worked out in the browser (drumlin fields and ice flow)
const LAYER_DEFS = {
  britExtent: { label: "Furthest extent of the last ice sheet", sw: "background:rgba(245,158,11,.55)", desc: "the BRITICE furthest ice extent (orange)" },
  llr: { label: "Loch Lomond Readvance ice", sw: "background:rgba(244,114,182,.55);border:2px solid #f472b6;box-sizing:border-box", desc: "the Loch Lomond Readvance (pink)" },
  britLakes: { label: "Glacial lakes and ice dams", sw: "background:rgba(56,189,248,.6);border:2px solid #0ea5e9;box-sizing:border-box", desc: "BRITICE glacial lakes (blue)" },
  moraines: { label: "Moraines", sw: "background:rgba(251,146,60,.4);border:2px solid #fb923c;box-sizing:border-box", line: [251, 146, 60, 1], width: 2, lines: [7], areas: [13, 14], fill: [251, 146, 60, 0.38], desc: "moraines (orange lines and areas)" },
  eskers: { label: "Eskers", sw: "background:#a3e635;height:3px;margin-top:5px", line: [163, 230, 53, 1], width: 2, lines: [3], desc: "eskers (green)" },
  meltwater: { label: "Meltwater channels", sw: "background:#22d3ee;height:3px;margin-top:5px", line: [34, 211, 238, 1], width: 1.6, lines: [6], desc: "meltwater channels (cyan)" },
  drumlins: { label: "Drumlin fields and ice flow", sw: "background:rgba(196,181,253,.45);border:2px solid #c4b5fd;box-sizing:border-box", derived: true, desc: "drumlin fields (lilac areas) and ice-flow lines (white)" },
  cirques: { label: "Cirques (corries)", sw: "background:#d08ae0;height:3px;margin-top:5px", line: [208, 138, 224, 1], width: 2, lines: [0], desc: "cirques (mauve)" },
  cragTails: { label: "Crag and tails", sw: "background:#ffaa00;height:3px;margin-top:5px", line: [255, 170, 0, 1], width: 2, lines: [1], desc: "crag and tails (amber)" },
  erratics: { label: "Erratics: source rock and pathways", sw: "background:rgba(74,222,128,.35);border:2px solid #4ade80;box-sizing:border-box", line: [74, 222, 128, 1], width: 1.6, lines: [2], areas: [11], fill: [74, 222, 128, 0.3], desc: "erratics (green source-rock areas and pathways)" },
  streamlined: { label: "Glacially streamlined bedrock", sw: "background:#cbd5e1;height:3px;margin-top:5px", line: [203, 213, 225, 0.9], width: 1, lines: [4], desc: "streamlined bedrock" }
};
const LANDFORM_KEYS = Object.keys(LAYER_DEFS).filter(k => LAYER_DEFS[k].lines || LAYER_DEFS[k].derived);
const FLOW_SOURCES = [8, 4, 1];   // lineations, streamlined bedrock, crag and tails: all lie along the ice flow
const FIELD_SOURCE = 8;           // drumlin fields come from the lineations only

// ---------- drumlin fields and ice-flow lines: pure functions, so they can be tested without the map ----------
// segs: array of [lon1, lat1, lon2, lat2] (each BRITICE line reduced to its two ends)
export const FIELD_GRID = { lon0: -11, lat0: 49.8, dlon: 0.05, dlat: 0.03, W: 281, H: 381 };
export function drumlinFieldRings(segs, g = FIELD_GRID, minLines = 4) {
  const { lon0, lat0, dlon, dlat, W, H } = g, N = W * H;
  const cnt = new Uint16Array(N);
  for (const [a, b, c, d] of segs) {
    const i = Math.round(((a + c) / 2 - lon0) / dlon), j = Math.round(((b + d) / 2 - lat0) / dlat);
    if (i > 1 && i < W - 2 && j > 1 && j < H - 2) cnt[j * W + i]++;
  }
  const grow = (src, keepIf) => {   // one ring of 8-neighbour dilation (keepIf true) or erosion (keepIf false)
    const out = new Uint8Array(N);
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) { const c = j * W + i; let any = false, all = true;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const v = src[c + dj * W + di]; if (v) any = true; else all = false; }
      out[c] = keepIf ? (any ? 1 : 0) : (all ? 1 : 0); }
    return out;
  };
  let m = new Uint8Array(N); for (let c = 0; c < N; c++) m[c] = cnt[c] ? 1 : 0;
  m = grow(grow(grow(m, true), true), false);   // within about 6 km of a lineation, then trimmed back about 3 km
  // drop groups with fewer than minLines lineations
  const seen = new Uint8Array(N), stack = [];
  for (let c0 = 0; c0 < N; c0++) {
    if (!m[c0] || seen[c0]) continue;
    const members = []; let lines = 0; stack.push(c0); seen[c0] = 1;
    while (stack.length) { const c = stack.pop(); members.push(c); lines += cnt[c];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const q = c + dj * W + di; if (q >= 0 && q < N && m[q] && !seen[q]) { seen[q] = 1; stack.push(q); } } }
    if (lines < minLines) for (const c of members) m[c] = 0;
  }
  // smooth the edge: 3 × 3 blur, then trace the 0.5 contour with marching squares
  const v = new Float32Array(N);
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) { const c = j * W + i; let s = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) s += m[c + dj * W + di];
    v[c] = s / 9; }
  for (let i = 0; i < W; i++) { v[i] = 0; v[(H - 1) * W + i] = 0; }
  for (let j = 0; j < H; j++) { v[j * W] = 0; v[j * W + W - 1] = 0; }
  return contourRings(v, g, 0.5);
}
// closed rings (lon/lat) round the cells of v that are >= level; outer rings clockwise, holes anticlockwise (ArcGIS polygon rule)
export function contourRings(v, g, level) {
  const { lon0, lat0, dlon, dlat, W, H } = g;
  const pts = new Map(), adj = new Map();
  const at = (p, q) => {   // crossing on the grid edge between points p and q
    const key = p < q ? p + "_" + q : q + "_" + p;
    if (!pts.has(key)) { const t = (level - v[p]) / (v[q] - v[p]), jp = (p / W) | 0, ip = p - jp * W, jq = (q / W) | 0, iq = q - jq * W;
      pts.set(key, [lon0 + (ip + (iq - ip) * t) * dlon, lat0 + (jp + (jq - jp) * t) * dlat]); }
    return key;
  };
  const link = (k1, k2) => { (adj.get(k1) || adj.set(k1, []).get(k1)).push(k2); (adj.get(k2) || adj.set(k2, []).get(k2)).push(k1); };
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = j * W + i, b = a + 1, d = a + W, c = d + 1;   // a bottom-left, b bottom-right, c top-right, d top-left
    const ia = v[a] >= level, ib = v[b] >= level, ic = v[c] >= level, id = v[d] >= level;
    const k = (ia ? 1 : 0) | (ib ? 2 : 0) | (ic ? 4 : 0) | (id ? 8 : 0);
    if (k === 0 || k === 15) continue;
    const B = () => at(a, b), R = () => at(b, c), T = () => at(d, c), L = () => at(a, d);
    const mid = (v[a] + v[b] + v[c] + v[d]) / 4 >= level;
    switch (k) {
      case 1: case 14: link(L(), B()); break;
      case 2: case 13: link(B(), R()); break;
      case 3: case 12: link(L(), R()); break;
      case 4: case 11: link(R(), T()); break;
      case 6: case 9: link(B(), T()); break;
      case 7: case 8: link(T(), L()); break;
      case 5: if (mid) { link(B(), R()); link(T(), L()); } else { link(L(), B()); link(R(), T()); } break;
      case 10: if (mid) { link(L(), B()); link(R(), T()); } else { link(B(), R()); link(T(), L()); } break;
    }
  }
  const rings = [], used = new Set();
  for (const start of adj.keys()) {
    if (used.has(start)) continue;
    const ring = []; let prev = null, cur = start;
    while (cur && !used.has(cur)) { used.add(cur); ring.push(pts.get(cur)); const nb = adj.get(cur); const nxt = nb[0] !== prev ? nb[0] : nb[1]; prev = cur; cur = nxt; }
    if (ring.length >= 3) { ring.push(ring[0]); rings.push(ring); }
  }
  const area = (r) => { let s = 0; for (let n = 0; n < r.length - 1; n++) s += r[n][0] * r[n + 1][1] - r[n + 1][0] * r[n][1]; return s / 2; };
  const inside = (pt, r) => { let k = false; for (let n = 0, m = r.length - 1; n < r.length; m = n++) { const [xi, yi] = r[n], [xj, yj] = r[m];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) k = !k; } return k; };
  return rings.map((r, n) => {
    const depth = rings.reduce((s, o, m) => s + (m !== n && inside(r[0], o) ? 1 : 0), 0);
    const cw = area(r) < 0, wantCw = depth % 2 === 0;
    return cw === wantCw ? r : r.slice().reverse();
  });
}
// one line per 0.3° × 0.18° square: the length-weighted mean axis of the lines in it (axes have no head or tail, so angles are doubled)
export function flowLines(segs, sq = { dlon: 0.3, dlat: 0.18 }, minN = 3, minR = 0.45, halfKm = 6) {
  const cells = new Map(), rad = Math.PI / 180;
  for (const [a, b, c, d] of segs) {
    const latm = (b + d) / 2, dx = (c - a) * 111.32 * Math.cos(latm * rad), dy = (d - b) * 111.32, len = Math.hypot(dx, dy);
    if (!len) continue;
    const th = Math.atan2(dy, dx), key = Math.floor((a + c) / 2 / sq.dlon) + ":" + Math.floor(latm / sq.dlat);
    let s = cells.get(key); if (!s) cells.set(key, s = { C: 0, S: 0, w: 0, x: 0, y: 0, n: 0 });
    s.C += len * Math.cos(2 * th); s.S += len * Math.sin(2 * th); s.w += len; s.x += len * (a + c) / 2; s.y += len * latm; s.n++;
  }
  const out = [];
  for (const s of cells.values()) {
    if (s.n < minN || Math.hypot(s.C, s.S) / s.w < minR) continue;
    const th = Math.atan2(s.S, s.C) / 2, x = s.x / s.w, y = s.y / s.w;
    const ddx = halfKm * Math.cos(th) / (111.32 * Math.cos(y * rad)), ddy = halfKm * Math.sin(th) / 111.32;
    out.push([[x - ddx, y - ddy], [x + ddx, y + ddy]]);
  }
  return out;
}
// every feature of a BRITICE line layer, reduced to [lon1, lat1, lon2, lat2] per path (the service pages 2,000 at a time)
async function fetchSegments(layerId) {
  const url = BRIT + layerId + "/query";
  const cj = await (await fetch(`${url}?where=1%3D1&returnCountOnly=true&f=json`)).json();
  if (!cj || typeof cj.count !== "number") throw new Error("BRITICE count failed for layer " + layerId);
  const offsets = []; for (let o = 0; o < cj.count; o += 2000) offsets.push(o);
  const segs = [];
  for (let n = 0; n < offsets.length; n += 3) {
    const pages = await Promise.all(offsets.slice(n, n + 3).map(o =>
      fetch(`${url}?where=1%3D1&outFields=OBJECTID&returnGeometry=true&outSR=4326&maxAllowableOffset=0.005&geometryPrecision=4&resultOffset=${o}&resultRecordCount=2000&f=json`).then(r => r.json())));
    for (const pj of pages) {
      if (pj.error) throw new Error("BRITICE query failed for layer " + layerId);
      for (const f of pj.features || []) for (const p of (f.geometry && f.geometry.paths) || []) if (p.length >= 2) segs.push([p[0][0], p[0][1], p[p.length - 1][0], p[p.length - 1][1]]);
    }
  }
  return segs;
}

const CAM = {
  // the opening camera (over 6° E, 38° N, 2,600 km up, looking north): keeps all of Britain, the North Sea and Scandinavia in view
  europe: { position: { type: "point", x: 6, y: 38, z: 2600000, spatialReference: { wkid: 4326 } }, heading: 0, tilt: 35 },
  scand: { center: [14, 61], zoom: 4.8, tilt: 45, heading: 0 },
  northsea: { center: [3, 57], zoom: 5.1, tilt: 50, heading: 0 },
  britain: { center: [-3.5, 55], zoom: 5.5, tilt: 45, heading: 0 },
  // zoom 7.3 and closer keeps the view scale under 1:5,000,000, so BRITICE landforms draw
  northEngland: { center: [-2.8, 54.7], zoom: 7.3, tilt: 50, heading: 0 },
  scotland: { center: [-4.7, 56.7], zoom: 6.7, tilt: 50, heading: 0 },
  highlands: { center: [-4.9, 56.8], zoom: 7.3, tilt: 50, heading: 0 },
  lakeDistrict: { center: [-3.1, 54.5], zoom: 8.6, tilt: 55, heading: 0 },
  baltic: { center: [18, 58.5], zoom: 5.0, tilt: 45, heading: 0 },
  dogger: { center: [3, 54.6], zoom: 6.0, tilt: 55, heading: 0 }
};

// what each 2.5 ka outline is based on (from the notes in Gowan's margin files)
const OUTLINE_BASIS = { 0: "today's glaciers", 2.5: "today's glaciers", 5: "today's glaciers", 7.5: "today's glaciers",
  10: "DATED-1 time slice", 12.5: "between DATED-1 slices (Younger Dryas)", 15: "DATED-1 time slice", 17.5: "between DATED-1 slices",
  20: "DATED-1 time slice", 22.5: "between DATED-1 slices", 25: "DATED-1 time slice", 27.5: "between DATED-1 slices", 30: "between DATED-1 slices",
  32.5: "drawn by Gowan", 35: "DATED-1 range (largest)", 37.5: "drawn between outlines", 40: "DATED-1 range (smallest)", 42.5: "drawn between outlines",
  45: "drawn by Gowan (Heinrich event 4 advance)", 47.5: "drawn between outlines", 50: "other studies (Helmens 2014)", 52.5: "drawn by Gowan",
  55: "other studies (Ingólfsson & Landvik 2013)", 57.5: "drawn by Gowan", 60: "other studies (Ingólfsson & Landvik 2013; Helmens 2014)", 62.5: "drawn by Gowan",
  65: "other studies (Ingólfsson & Landvik 2013)", 67.5: "drawn between outlines", 70: "other studies (Ingólfsson & Landvik 2013)", 72.5: "drawn between outlines",
  75: "drawn by Gowan", 77.5: "drawn between outlines", 80: "DATED-1 range (smallest)" };

export function stageAt(t) {
  if (t < 11.703) return { name: "Holocene (today's warm period)", kind: "warm" };
  if (t < 12.896) return { name: "Loch Lomond Stadial · GS-1 · Younger Dryas", kind: "cold" };
  if (t < 14.692) return { name: "Windermere Interstadial · GI-1 · Bølling–Allerød", kind: "warm" };
  if (t < 29) return { name: "Dimlington Stadial · Late Devensian (MIS 2)", kind: "cold" };
  if (t < 31) return { name: "Dimlington Stadial begins · Middle Devensian (MIS 3)", kind: "cold" };
  if (t < 57) return { name: "Middle Devensian (MIS 3): swinging stadials and interstadials", kind: "mixed" };
  if (t < 71) return { name: "Early Devensian (MIS 4): a cold stage", kind: "cold" };
  return { name: "Early Devensian (MIS 5)", kind: "mixed" };
}
export const fmtAgo = (t) => t < 0.05 ? "Today" : `${Math.round(t * 1000 / (t < 20 ? 100 : 500)) * (t < 20 ? 100 : 500)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " years ago";
const ft = (m) => Math.round(m * 3.28084).toLocaleString("en-US");
const nf = (x) => Math.round(x).toLocaleString("en-US");

// ---------- shared teacher-note sections ----------
const TEACH_VIEW = `<details><summary>What the 3D view shows</summary>
  <ul>
    <li><b>Ice sheets.</b> The outlines come from Gowan et al. (2021), who drew the edge of the Eurasian ice sheets every 2,500 years for the last 80,000 years. From 25,000 to 10,000 years ago they follow the DATED-1 reconstruction (Hughes et al. 2016), which is built from more than 5,000 dates. Older outlines come from other studies or are drawn between them, so they are less certain; the card says which kind each outline is. Between outlines, the app blends the ice in a straight line, so the edge moves smoothly but not exactly as it did.</li>
    <li><b>Ice thickness.</b> Worked out by this app, not measured. It uses the "perfectly plastic" ice-sheet method also used by Gowan et al.: ice spreads under its own weight, so the surface rises from the edge towards the middle at a rate set by how easily the ice slides over the ground beneath (soft sediment lets it slide, giving thinner ice; hard rock gives thicker ice). The slipperiness values are Gowan's. The method ignores the earth sinking under the weight of the ice, so heights above sea level are too high in the middle of the ice sheets.</li>
    <li><b>Sea level.</b> One value for the whole map at each moment. For the last 11,000 years it follows sea level measured around the southern North Sea: about 50 m below today 11,000 years ago and about 15 m below 8,000 years ago (Hijma et al. 2025), then the curve from the northern Netherlands coast (Meijles et al. 2018), which rises fast to about 7,500 years ago and slowly after that. Before 13,000 years ago it follows a world-wide average (Spratt &amp; Lisiecki 2016). These North Sea numbers include the region's own slow sinking. In reality the land rose and sank by different amounts in different places (most near the ice), so coastlines near the ice are less reliable than in the southern North Sea.</li>
    <li><b>Lakes.</b> Worked out by this app: water fills hollows that the ice or the land blocks from draining, up to the lowest point where it could spill over. Lakes over 2,000 km² that touch the ice are drawn, plus any lake over 25,000 km² (such as the Baltic basin when it was cut off from the sea). The BRITICE glacial lakes layer shows lakes mapped from their deposits in Britain.</li>
    <li><b>Check a place and dry North Sea floor.</b> Both read the app's own 9 km grid, so they give the model's answer for that grid cell, not a measurement at that exact spot. The answer for a checked place shows next to the yellow pin on the map, changes as the time changes, and is also written in the story card; ✕ on the label removes the pin.</li>
    <li><b>BRITICE layers.</b> Mapped evidence of the last British–Irish Ice Sheet from the University of Sheffield's BRITICE Glacial Map, version 2 (Clark et al. 2018), shown live from ArcGIS Online. The furthest extent was not all reached at the same time. The Loch Lomond Readvance outline is a layer from Esri UK Education, drawn from the first BRITICE map (Clark et al. 2004). Mapped cirques are hollows carved over many glaciations, not only in the last one. Moraines are drawn as lines, and as areas where BRITICE maps large moraines or many ridges close together; erratics are drawn with the outcrops their boulders came from.</li>
    <li><b>Drumlin fields and ice flow.</b> Worked out by this app from BRITICE's mapped lines, to replace thousands of short lines with something easier to read. The lilac areas are drumlin fields: places within a few kilometres of mapped drumlins and other streamlined ridges. The white lines show the average direction of the drumlins, streamlined bedrock and crag and tails in squares about 20 km across, drawn only where they agree. A line shows the direction the ice moved along, not which way it was going. If the BRITICE service cannot be reached, the original lines are shown instead.</li>
    <li><b>Chart.</b> The orange line is oxygen isotopes (δ¹⁸O) in the GISP2 Greenland ice core: higher means warmer. Its fast jumps are the interstadials. The blue line is the app's sea level. Shaded bands mark the named warm and cold stages used in Britain; the last warm band is the Holocene, today's interglacial, not an interstadial.</li>
  </ul>
</details>`;
const TEACH_LIMITS = `<details><summary>Limitations</summary>
  <ul>
    <li>Ice outlines before 25,000 years ago, and especially before 45,000 years ago, are hypotheses with few dates behind them; scientists still disagree about them. The outline for about 60,000 years ago (MIS 4) covers much of Britain and Ireland and joins the Scandinavian ice; Toucanne et al. (2023) argue the British–Irish ice was smaller then and did not join it.</li>
    <li>The ground and sea floor are today's. Sand and mud laid down since the ice age, and erosion, mean some parts of Doggerland flooded earlier or later than shown (Hoebe et al. 2024 found today's sea floor makes the flooding look too late in places). In this app the last of Dogger Bank goes under the sea about 7,800 years ago; Hoebe et al. model between about 8,000 and 7,500 years ago.</li>
    <li>No isostatic adjustment (the earth sinking under ice and rising after) in the ice, sea or lake models.</li>
    <li>After the Baltic Ice Lake drained about 11,700 years ago, the Baltic was joined to the ocean through central Sweden for a time. That land has risen since, so the model cannot find that route: it keeps the Baltic as a lake until the sea rises over the Danish straits, later than really happened.</li>
    <li>The grid behind the models is 0.16° by 0.08° (about 9 km), so small glaciers, valleys and lakes do not show. The ice outlines do not include the separate Alpine ice.</li>
    <li>The app covers the last 80,000 years only. It does not show glacial processes (erosion, transport, deposition) as they happen, or the causes of ice ages.</li>
    <li>The time scale is "years ago"; dates from ice cores are counted from AD 2000 and radiocarbon dates from AD 1950, a 50-year difference that does not matter at this scale.</li>
  </ul>
</details>`;
const TEACH_SOURCES = `<details><summary>Sources</summary>
  <ul>
    <li><a href="https://doi.org/10.1038/s41467-021-21469-w" target="_blank" rel="noopener">Gowan et al. 2021, A new global ice sheet reconstruction for the past 80000 years (Nature Communications)</a>; margins and shear stress from <a href="https://github.com/evangowan/icesheet" target="_blank" rel="noopener">ICESHEET 2.0 (GitHub)</a></li>
    <li><a href="https://doi.org/10.1111/bor.12142" target="_blank" rel="noopener">Hughes et al. 2016, The last Eurasian ice sheets: DATED-1 (Boreas)</a></li>
    <li><a href="https://doi.org/10.1594/PANGAEA.856844" target="_blank" rel="noopener">RTopo-2 bed topography (Schaffer et al. 2016), CC BY 4.0</a></li>
    <li><a href="https://doi.org/10.5194/cp-12-1079-2016" target="_blank" rel="noopener">Spratt &amp; Lisiecki 2016, A Late Pleistocene sea level stack (Climate of the Past)</a></li>
    <li><a href="https://www.nature.com/articles/s41586-025-08769-7" target="_blank" rel="noopener">Hijma et al. 2025, Global sea-level rise in the early Holocene revealed from North Sea peats (Nature)</a></li>
    <li><a href="https://doi.org/10.1002/jqs.3068" target="_blank" rel="noopener">Meijles et al. 2018, Holocene relative mean sea-level changes in the Wadden Sea area, northern Netherlands (Journal of Quaternary Science)</a></li>
    <li><a href="https://doi.org/10.1016/j.quaint.2024.05.006" target="_blank" rel="noopener">Hoebe et al. 2024, Early Holocene inundation of Doggerland and its impact on hunter-gatherers (Quaternary International)</a></li>
    <li><a href="https://onlinelibrary.wiley.com/doi/10.1111/bor.12594" target="_blank" rel="noopener">Clark et al. 2022, BRITICE-CHRONO reconstruction of the last British–Irish Ice Sheet (Boreas)</a></li>
    <li><a href="https://onlinelibrary.wiley.com/doi/10.1111/bor.12273" target="_blank" rel="noopener">Clark et al. 2018, BRITICE Glacial Map version 2 (Boreas)</a>; layers from the University of Sheffield on <a href="https://shefuni.maps.arcgis.com/apps/webappviewer/index.html?id=fd78b03a74bb477c906c5d4e0ba9abaf" target="_blank" rel="noopener">ArcGIS Online</a> (Open Government Licence v2)</li>
    <li><a href="https://www.arcgis.com/home/item.html?id=7a27d1101aa2492796503c70908d5a5f" target="_blank" rel="noopener">Loch Lomond Readvance layer, Esri UK Education (ArcGIS Online)</a>, drawn from <a href="https://doi.org/10.1111/j.1502-3885.2004.tb01246.x" target="_blank" rel="noopener">Clark et al. 2004, Map and GIS database of glacial landforms and features related to the last British Ice Sheet (Boreas)</a></li>
    <li><a href="https://sro.sussex.ac.uk/id/eprint/11852/" target="_blank" rel="noopener">Murton &amp; Murton 2012, Middle and Late Pleistocene glacial lakes of lowland Britain and the southern North Sea Basin (Quaternary International)</a></li>
    <li><a href="https://www.nature.com/articles/s41467-019-11601-2" target="_blank" rel="noopener">Batchelor et al. 2019, The configuration of Northern Hemisphere ice sheets through the Quaternary</a></li>
    <li><a href="https://esploro.umontpellier.fr/esploro/outputs/journalArticle/Marine-Isotope-Stage-4-7157ka-on/99146425809311" target="_blank" rel="noopener">Toucanne et al. 2023, Marine Isotope Stage 4 (71–57 ka) on the Western European margin (Global and Planetary Change)</a></li>
    <li><a href="https://ui.adsabs.harvard.edu/abs/2014QSRv..106...14R/abstract" target="_blank" rel="noopener">Rasmussen et al. 2014, Greenland stadials and interstadials (INTIMATE event stratigraphy)</a>; GI-1/GS-1 ages from <a href="https://scarf.scot/national/palaeolithic-mesolithic-panel-report/3-environment/3-1-climate-changes-in-scotland-from-the-last-glacial-maximum-c-16000-yrs-bp-to-c-6000-bp/" target="_blank" rel="noopener">ScARF</a></li>
    <li><a href="https://www.sciencedirect.com/science/article/abs/pii/S0921818107000094" target="_blank" rel="noopener">Jakobsson et al. 2007, Reconstructing the Younger Dryas ice dammed lake in the Baltic Basin</a></li>
    <li><a href="https://www.frontiersin.org/journals/earth-science/articles/10.3389/feart.2026.1720151/full" target="_blank" rel="noopener">Hansen et al. 2026, Late Glacial to Holocene environmental development near an oil-producing platform in the Danish North Sea (Frontiers in Earth Science)</a>: Storegga tsunami date and the isolation of Dogger Bank</li>
    <li><a href="https://www.ipcc.ch/report/ar6/wg1/chapter/summary-for-policymakers/" target="_blank" rel="noopener">IPCC AR6 WG1 Summary for Policymakers (A.1.7: sea level rose 3.7 mm a year in 2006–2018)</a></li>
    <li>GISP2 δ¹⁸O from NOAA Paleoclimatology (study 17796), as packaged in pyleoclim · Marine Isotope Stage boundaries from Lisiecki &amp; Raymo 2005 · Natural Earth coastline · Esri TopoBathy 3D and World Imagery</li>
  </ul>
</details>`;
const TEACH_A11Y = `<details><summary>Accessibility</summary>
  <ul>
    <li>The page is being built towards <b>WCAG 2.1 level AA</b>, the standard US public schools must meet under the ADA Title II web rule. It has not been independently audited.</li>
    <li>Everything can be used with a keyboard: Tab to move, the arrow keys on the timeline, Space to play or pause when the map or page has focus (on a button, link or the story text, Space does its usual job), and the ‹ › buttons (or Page Up / Page Down outside the story text) for steps. <b>Check a place</b> has a list of places as well as clicking the map. <b>Describe the map</b>, in the story card, gives a written description of what the 3D map shows; screen readers hear it when a step changes or the timeline stops.</li>
    <li>Nothing moves on its own. If the device is set to reduce motion, camera moves jump instead of flying.</li>
    <li>On a phone, <b>Expand</b> in the story card gives the text the whole screen; <b>Show map</b> shrinks it again. Playing the timeline shrinks it so the map can be seen.</li>
    <li>Colours are never the only clue: the card and the description give the same information in words.</li>
    <li>Known gaps: the 3D map itself cannot be explored by a screen reader beyond the written description and Check a place; the chart has no data table yet.</li>
  </ul>
</details>`;

const offeredHas = (cfg, k) => cfg.legendLayers.includes(k);
function chromeHTML(cfg) {
  const key = (k) => { const d = LAYER_DEFS[k]; return `<button class="k" data-l="${k}" aria-pressed="false"><span class="tick"></span><span class="sw" style="${d.sw}"></span><span>${d.label}${d.derived ? ` <span class="mv" data-mv="Drumlin fields and ice flow"></span><span class="knote"></span>` : ""}</span></button>`; };
  const hasLandforms = cfg.legendLayers.some(k => LANDFORM_KEYS.includes(k));
  return `
  <section id="mapwrap" aria-label="3D map of Britain, the North Sea and Scandinavia during the last ice age. A written description is under Describe the map, in the story card.">
    <arcgis-scene basemap="satellite" camera-position="6, 38, 2600000" camera-heading="0" camera-tilt="35">
      <arcgis-zoom slot="top-right"></arcgis-zoom>
      <arcgis-navigation-toggle slot="top-right"></arcgis-navigation-toggle>
      <arcgis-compass slot="top-right"></arcgis-compass>
    </arcgis-scene>
    <div id="loading" class="glass" role="status">Loading the ice sheets…</div>
    <div id="pinLabel" class="glass" hidden><div class="pl-text" aria-hidden="true"></div><button id="pinClose" aria-label="Remove the checked place" title="Remove the checked place">✕</button></div>
    <div id="exag" class="glass" role="group" aria-label="Height exaggeration">Heights <span class="mv" data-mv="Terrain"></span> <button data-x="1" aria-pressed="false" aria-label="1× (true scale)" title="True scale: no exaggeration">1×</button><button data-x="5" aria-pressed="false">5×</button><button data-x="10" aria-pressed="true">10×</button><button data-x="20" aria-pressed="false">20×</button></div>
    <div id="legend" class="glass" role="group" aria-labelledby="legendTitle">
      <button class="t" id="legendTitle" aria-expanded="true">Map key</button>
      <h3>This app's models</h3>
      <button class="k" data-l="ice" aria-pressed="true"><span class="tick"></span>Ice sheets <span class="mv" data-mv="Ice thickness"></span></button>
      <div class="band" aria-hidden="true"><i style="background:#f5f8fa"></i><i style="background:#dbe7f0"></i><i style="background:#c4d6e5"></i><i style="background:#a8c4da"></i></div>
      <div class="bandlbl"><span>thin</span><span>2.5 km thick</span></div>
      <button class="k" data-l="seeThrough" aria-pressed="false"><span class="tick"></span>See-through ice</button>
      <button class="k" data-l="sea" aria-pressed="true"><span class="tick"></span><span class="sw" style="background:var(--sea)"></span>Sea at that time <span class="mv" data-mv="Sea level"></span></button>
      <div class="sub">Modelled sea area <span class="mv" data-mv="Sea surface"></span></div>
      <button class="k" data-l="lakes" aria-pressed="true"><span class="tick"></span><span class="sw" style="background:var(--lake)"></span>Lakes <span class="mv" data-mv="Lakes"></span></button>
      <div class="sub">Modelled: water trapped by ice or land, filled to its overflow</div>
      <button class="k" data-l="coast" aria-pressed="true"><span class="tick"></span><span class="sw" style="background:none;border-top:2px solid rgba(255,255,255,.8);height:0;margin-top:6px"></span>Today's coastline</button>
      <button class="k" data-l="labels" aria-pressed="true"><span class="tick"></span>Place names</button>
      <div class="kpin"><span class="pinsw" aria-hidden="true"></span>Checked place: click the map or use Check a place</div>
      <h3>BRITICE evidence (University of Sheffield) <span class="mv" data-mv="BRITICE layers"></span></h3>
      ${cfg.legendLayers.map(key).join("\n      ")}
      ${hasLandforms ? `<div class="sub">Landform lines show when zoomed in to Britain or Ireland${offeredHas(cfg, "drumlins") ? "; drumlin fields show at any distance" : ""}.</div>` : ""}
    </div>
    <div id="credit" class="glass"><b>Created by Jason Sawle</b></div>
    <section id="timebar" class="glass" aria-label="Timeline">
      <div class="trow">
        <div id="tLabel" aria-live="off">—</div>
        <div id="tStage"></div>
        <select id="speed" aria-label="Playback speed"><option value="0.5">slow</option><option value="1.5" selected>normal</option><option value="4">fast</option></select>
        <button id="tPlay" class="iconbtn" aria-label="Play the timeline" title="Play the timeline (space)">▶</button>
      </div>
      <svg id="chart" role="img" aria-labelledby="chartTitle" tabindex="-1"><title id="chartTitle">Chart of Greenland temperature (from ice cores) and sea level over the last 80,000 years. Click to jump to a time.</title></svg>
      <input id="tSlider" type="range" min="0" max="80" step="0.1" value="60" aria-label="Time" />
      <div class="ckey"><span aria-hidden="true"><i style="background:#fdba74"></i>Greenland temperature (ice core δ¹⁸O, warmer up)</span><span aria-hidden="true"><i style="background:#60a5fa"></i>Sea level</span><span class="kband" aria-hidden="true"><i style="background:rgba(253,186,116,.35);height:8px"></i>Warm stage</span><span class="kband" aria-hidden="true"><i style="background:rgba(147,197,253,.30);height:8px"></i>Cold stage</span><span class="kver"><span class="sr-only">Climate chart </span><span class="mv" data-mv="Climate chart"></span></span></div>
    </section>
  </section>
  <main id="card" class="glass" aria-label="Story and controls">
    <header>
      <div class="brand"><span class="kicker">Thinking Spatially</span><span class="levelchip">${cfg.levelLabel}</span>${cfg.test ? `<span class="testchip">Test</span>` : ""}<span id="verTop"></span><span class="sp"></span><button id="teachBtn" class="ghost" aria-haspopup="dialog">Teacher notes</button><button id="sizeBtn" class="ghost phone-only" aria-expanded="false" aria-controls="card">Expand ▴</button></div>
      <h1>${cfg.title}</h1>
      <p class="lede">${cfg.lede}</p>
    </header>
    <nav class="stepnav" aria-label="Steps in time order"><ol id="steps"></ol></nav>
    <section id="chapter" aria-labelledby="chTitle">
      <div class="stepof" id="stepOf"></div>
      <h2 id="chTitle"></h2>
      <div class="when" id="chWhen"></div>
      <div class="panes" id="panes" tabindex="0">
        <div id="story"></div>
        <dl id="nowBox" aria-label="At the time shown">
          <dt>Sea level</dt><dd id="nSea">—</dd>
          <dt>Ice</dt><dd id="nIce">—</dd>
          <dt>Ice outline <span class="mv" data-mv="Ice outlines"></span></dt><dd id="nOutline">—</dd>
          <dt>Lakes</dt><dd id="nLakes">—</dd>
          <dt>Dry North Sea floor <span class="mv" data-mv="Dry North Sea floor"></span></dt><dd id="nDry">—</dd>
        </dl>
        <div id="pointBox">
          <label for="placeSel">Check a place <span class="mv" data-mv="Place check"></span> (or click the map)</label>
          <select id="placeSel"><option value="">Choose a place…</option>${CHECK_PLACES.map(([n], i) => `<option value="${i}">${n}</option>`).join("")}</select>
          <p id="pointOut" role="status" aria-live="polite">Pick a place to see what it was like at the time shown.</p>
        </div>
        <details id="mapDescBox"><summary>Describe the map</summary><p id="mapDesc"></p></details>
      </div>
    </section>
    <footer class="cfoot">
      <div id="watch" hidden></div>
      <div class="actions">
        <button id="backBtn" class="iconbtn" aria-label="Previous step" title="Previous step">‹</button>
        <button id="goBtn" class="primary">▶ Play</button>
        <button id="nextBtn" class="iconbtn" aria-label="Next step" title="Next step">›</button>
      </div>
      <div id="status" role="status" aria-live="polite"></div>
    </footer>
    <div class="sr-only" aria-live="polite" id="liveDesc"></div>
  </main>`;
}

function teacherDialogHTML(cfg) {
  return `<dialog id="teachDlg" aria-labelledby="teachTitle">
  <div class="dlghead"><h2 id="teachTitle">For teachers · ${cfg.levelLabel}</h2><button id="teachClose" aria-label="Close">✕</button></div>
  ${cfg.teacherHtml}
  ${TEACH_VIEW}
  ${TEACH_LIMITS}
  ${TEACH_SOURCES}
  <details id="about"><summary>About and versions</summary><table class="ver" id="verTable"></table></details>
  ${TEACH_A11Y}
</dialog>`;
}

export async function startIceAgeApp(cfg) {
  const root = document.getElementById("app");
  root.innerHTML = chromeHTML(cfg);
  document.body.insertAdjacentHTML("beforeend", teacherDialogHTML(cfg));
  const $ = (id) => document.getElementById(id);
  const CH = cfg.steps;
  const MODELS = [...SHARED_MODELS, cfg.storyModel];
  $("verTop").textContent = "v" + cfg.appVersion;
  document.title = `${cfg.title} · ${cfg.levelLabel} (v${cfg.appVersion}${cfg.test ? " test" : ""})`;
  $("verTable").innerHTML = `<caption>Versions of the app and its models</caption><thead><tr><th scope="col">Part</th><th scope="col">Version</th><th scope="col">How it works</th></tr></thead><tbody><tr><td>App (${cfg.levelLabel} page)</td><td class="v">${cfg.appVersion}</td><td>${cfg.appDate}. ${cfg.appNote || ""}</td></tr>` +
    MODELS.map(([n, v, d]) => `<tr><td>${n}</td><td class="v">${v}</td><td>${d}</td></tr>`).join("") + `</tbody>`;
  document.querySelectorAll("[data-mv]").forEach(el => { const m = MODELS.find(x => x[0] === el.dataset.mv); el.textContent = m ? "model " + m[1] : ""; });
  if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty("--tbh", $("timebar").offsetHeight + "px")).observe($("timebar"));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- SDK ----------
  const [Graphic, GraphicsLayer, FeatureLayer, TileLayer, ElevationLayer, BaseElevationLayer, Mesh, MeshComponent, MediaLayer, ImageElement, ExtentAndRotationGeoreference, Extent, reactiveUtils] = await $arcgis.import([
    "@arcgis/core/Graphic.js", "@arcgis/core/layers/GraphicsLayer.js", "@arcgis/core/layers/FeatureLayer.js", "@arcgis/core/layers/TileLayer.js",
    "@arcgis/core/layers/ElevationLayer.js", "@arcgis/core/layers/BaseElevationLayer.js",
    "@arcgis/core/geometry/Mesh.js", "@arcgis/core/geometry/support/MeshComponent.js",
    "@arcgis/core/layers/MediaLayer.js", "@arcgis/core/layers/support/ImageElement.js", "@arcgis/core/layers/support/ExtentAndRotationGeoreference.js",
    "@arcgis/core/geometry/Extent.js", "@arcgis/core/core/reactiveUtils.js"
  ]);
  const sceneEl = document.querySelector("arcgis-scene");
  await sceneEl.viewOnReady();
  const view = sceneEl.view, map = sceneEl.map;
  view.environment.atmosphereEnabled = true;
  function setPadding() {
    const tbTop = $("timebar").getBoundingClientRect().top;
    // phones: the map is the strip between the top controls and the time bar
    if (innerWidth <= 760) view.padding = { top: 96, bottom: Math.max(0, Math.round(innerHeight - tbTop + 6)), left: 0, right: 0 };
    else view.padding = { left: $("card").getBoundingClientRect().right + 10, bottom: innerHeight - tbTop + 10, top: 20, right: 300 };
  }
  setPadding(); addEventListener("resize", setPadding);
  if (window.ResizeObserver) new ResizeObserver(setPadding).observe($("timebar"));

  const TOPOBATHY_URL = "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/TopoBathy3D/ImageServer";
  const ExagElevation = BaseElevationLayer.createSubclass({
    properties: { factor: 10 },
    load() {
      this._base = new ElevationLayer({ url: TOPOBATHY_URL });
      this.addResolvingPromise(this._base.load().then(() => { this.tileInfo = this._base.tileInfo; this.spatialReference = this._base.spatialReference; this.fullExtent = this._base.fullExtent; }));
    },
    fetchTile(level, row, col, options) {
      return this._base.fetchTile(level, row, col, options).then((d) => {
        const f = this.factor, v = d.values, nd = d.noDataValue;
        for (let i = 0; i < v.length; i++) if (v[i] !== nd) v[i] *= f;
        return d;
      });
    }
  });
  let EXAG = 10;
  function setGround() {
    map.ground.layers.removeAll();
    map.ground.layers.add(EXAG === 1 ? new ElevationLayer({ url: TOPOBATHY_URL }) : new ExagElevation({ factor: EXAG }));
    map.ground.navigationConstraint = { type: "none" };
  }
  setGround();

  // ---------- data ----------
  const DATA = "data/ice-age-europe/";
  async function gunzip(url) {
    const r = await fetch(url); if (!r.ok) throw new Error(url + " " + r.status);
    if (!("DecompressionStream" in window)) throw new Error("This browser cannot unpack the data (DecompressionStream missing). Please update the browser.");
    return new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  const [meta, coast, drapeInfo, bedBuf, iceBuf, landBuf, tauBuf] = await Promise.all([
    fetch(DATA + "meta.json").then(r => r.json()), fetch(DATA + "coast.json").then(r => r.json()), fetch(DATA + "drape.json").then(r => r.json()),
    gunzip(DATA + "bed.i16.gz"), gunzip(DATA + "ice.u8.gz"), gunzip(DATA + "land.u8.gz"), gunzip(DATA + "tau.u8.gz")
  ]).catch((e) => { $("loading").textContent = "Could not load the data: " + e.message; throw e; });
  const { lon0, lat0, dlon, dlat, W, H } = meta.grid, N = W * H;
  const bed = new Int16Array(bedBuf), iceStack = new Uint8Array(iceBuf), land = new Uint8Array(landBuf), tau = new Uint8Array(tauBuf);   // tau in kPa
  const TIMES = meta.times, NT = TIMES.length, ICE_UNIT = meta.iceUnit;
  // Sea level 1.1: meta.json holds Hijma et al. 2025 (−15 m at 8 ka, −50 m at 11 ka) and the Spratt & Lisiecki stack before 13 ka.
  // From 7.5 ka to today use Meijles et al. 2018 (northern Netherlands), counted back from today's level with their rates:
  // 0.6 mm/yr back to 2.5 ka, 0.8 to 4.5 ka, 1.6 to 6 ka, 3.5 to 7.5 ka. Replaces 1.0's straight line from 8 ka to today.
  const HOLOCENE_SL = [[0, 0], [2.5, -1.5], [4.5, -3.1], [6, -5.5], [7.5, -10.75]];
  const SL = [...HOLOCENE_SL, ...meta.seaLevel.filter(([t]) => t >= 8)], GIS = meta.gisp2;
  const cellArea = new Float64Array(H);
  for (let j = 0; j < H; j++) cellArea[j] = dlon * 111.32 * Math.cos((lat0 + j * dlat) * Math.PI / 180) * dlat * 111.32;
  const seaLevelAt = (t) => { if (t <= SL[0][0]) return SL[0][1]; for (let k = 1; k < SL.length; k++) if (t <= SL[k][0]) { const [a, va] = SL[k - 1], [b, vb] = SL[k]; return va + (vb - va) * (t - a) / (b - a); } return SL[SL.length - 1][1]; };

  // ice between outlines: blend signed distance to each outline's edge; taper thickness near the moving edge
  const Hcur = new Float32Array(N), iceMask = new Uint8Array(N), fcur = new Float32Array(N);   // fcur: blended signed distance to the ice edge (km, + inside)
  const dxRow = new Float32Array(H); for (let j = 0; j < H; j++) dxRow[j] = dlon * 111.32 * Math.cos((lat0 + j * dlat) * Math.PI / 180);
  const DY = dlat * 111.32;
  const sdfCache = new Map();
  function chamfer(seedMask) {
    const d = new Float32Array(N).fill(1e9);
    for (let c = 0; c < N; c++) if (seedMask(c)) d[c] = 0;
    for (let j = 0; j < H; j++) { const dx = dxRow[j], dg = Math.hypot(dx, DY);
      for (let i = 0; i < W; i++) { const c = j * W + i; let v = d[c];
        if (i > 0 && d[c - 1] + dx < v) v = d[c - 1] + dx;
        if (j > 0) { const u = c - W; if (d[u] + DY < v) v = d[u] + DY; if (i > 0 && d[u - 1] + dg < v) v = d[u - 1] + dg; if (i < W - 1 && d[u + 1] + dg < v) v = d[u + 1] + dg; }
        d[c] = v; } }
    for (let j = H - 1; j >= 0; j--) { const dx = dxRow[j], dg = Math.hypot(dx, DY);
      for (let i = W - 1; i >= 0; i--) { const c = j * W + i; let v = d[c];
        if (i < W - 1 && d[c + 1] + dx < v) v = d[c + 1] + dx;
        if (j < H - 1) { const u = c + W; if (d[u] + DY < v) v = d[u] + DY; if (i < W - 1 && d[u + 1] + dg < v) v = d[u + 1] + dg; if (i > 0 && d[u - 1] + dg < v) v = d[u - 1] + dg; }
        d[c] = v; } }
    return d;
  }
  function sdfOf(k) {
    if (sdfCache.has(k)) return sdfCache.get(k);
    const o = k * N, inIce = (c) => iceStack[o + c] > 0;
    const dOut = chamfer((c) => inIce(c)), dIn = chamfer((c) => !inIce(c)), s = new Float32Array(N);
    for (let c = 0; c < N; c++) s[c] = inIce(c) ? dIn[c] : -dOut[c];
    sdfCache.set(k, s); return s;
  }
  const RHO_G = 917 * 9.81;
  function iceAt(t) {
    t = Math.max(0, Math.min(TIMES[NT - 1], t));
    let k = 0; while (k < NT - 2 && TIMES[k + 1] < t) k++;
    const w = (t - TIMES[k]) / (TIMES[k + 1] - TIMES[k]), a = k * N, b = (k + 1) * N;
    const sa = sdfOf(k), sb = sdfOf(k + 1);
    let area = 0, vmax = 0;
    for (let c = 0; c < N; c++) {
      const s = (1 - w) * sa[c] + w * sb[c];
      fcur[c] = s;
      if (s <= 0 || (sa[c] <= 0 && sb[c] <= 0)) { Hcur[c] = 0; iceMask[c] = 0; continue; }
      let h = ((1 - w) * iceStack[a + c] + w * iceStack[b + c]) * ICE_UNIT;
      const cap = 1.5 * Math.sqrt(2 * tau[c] * 1000 * s * 1000 / RHO_G);
      if (h > cap) h = cap;
      if (h < ICE_UNIT) h = ICE_UNIT;
      Hcur[c] = h; iceMask[c] = 1; area += cellArea[(c / W) | 0]; if (h > vmax) vmax = h;
    }
    return { area, vmax, k, w };
  }

  // priority flood with the ice as a barrier and the sea at level S
  const lvl = new Float32Array(N), closed = new Uint8Array(N), hk = new Float32Array(N), hi = new Int32Array(N);
  function flood(S) {
    let n = 0;
    const push = (c, key) => { let k = n++; hk[k] = key; hi[k] = c; while (k > 0) { const p = (k - 1) >> 1; if (hk[p] <= hk[k]) break; const tk = hk[p]; hk[p] = hk[k]; hk[k] = tk; const ti = hi[p]; hi[p] = hi[k]; hi[k] = ti; k = p; } };
    lvl.fill(Infinity); closed.fill(0);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (j !== 0 && j !== H - 1 && i !== 0 && i !== W - 1) continue;
      const c = j * W + i; if (iceMask[c]) continue;
      closed[c] = 1; lvl[c] = Math.max(bed[c], S); push(c, lvl[c]);
    }
    while (n > 0) {
      const c = hi[0], L = hk[0]; n--; hk[0] = hk[n]; hi[0] = hi[n];
      let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < n && hk[l] < hk[m]) m = l; if (r < n && hk[r] < hk[m]) m = r; if (m === k) break; const tk = hk[m]; hk[m] = hk[k]; hk[k] = tk; const ti = hi[m]; hi[m] = hi[k]; hi[k] = ti; k = m; }
      const j = (c / W) | 0, i = c - j * W;
      for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= H) continue;
        for (let di = -1; di <= 1; di++) { const ii = i + di; if (ii < 0 || ii >= W || (!di && !dj)) continue;
          const q = jj * W + ii; if (closed[q] || iceMask[q]) continue;
          closed[q] = 1; lvl[q] = Math.max(bed[q], L); push(q, lvl[q]); } }
    }
  }
  const water = new Uint8Array(N), comp = new Int32Array(N), queue = new Int32Array(N);
  let lakeStats = { n: 0, area: 0, dammed: 0, biggest: null };
  function classifyWater(S) {
    water.fill(0); comp.fill(0);
    for (let c = 0; c < N; c++) if (!iceMask[c] && bed[c] < S && lvl[c] <= S + 0.01 && !(land[c] && bed[c] < 0)) water[c] = 1;
    let id = 0; lakeStats = { n: 0, area: 0, dammed: 0, biggest: null };
    for (let c0 = 0; c0 < N; c0++) {
      if (comp[c0] || iceMask[c0] || !(lvl[c0] > bed[c0] + 2 && lvl[c0] > S + 0.5) || !isFinite(lvl[c0])) continue;
      id++; let qh = 0, qt = 0; queue[qt++] = c0; comp[c0] = id; let area = 0, touches = false, sx = 0, sy = 0, cnt = 0;
      while (qh < qt) { const c = queue[qh++], j = (c / W) | 0, i = c - j * W; area += cellArea[j]; sx += i; sy += j; cnt++;
        for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= H) continue;
          for (let di = -1; di <= 1; di++) { const ii = i + di; if (ii < 0 || ii >= W) continue; const q = jj * W + ii;
            if (iceMask[q]) { touches = true; continue; }
            if (!comp[q] && lvl[q] > bed[q] + 2 && lvl[q] > S + 0.5 && isFinite(lvl[q])) { comp[q] = id; queue[qt++] = q; } } } }
      if ((touches && area >= 2000) || area >= 25000) {
        for (let k = 0; k < qt; k++) water[queue[k]] = 2;
        lakeStats.n++; lakeStats.area += area; if (touches) lakeStats.dammed++;
        if (!lakeStats.biggest || area > lakeStats.biggest.area) lakeStats.biggest = { area, level: lvl[c0], lon: lon0 + (sx / cnt) * dlon, lat: lat0 + (sy / cnt) * dlat };
      }
    }
  }
  // dry North Sea floor: today's sea, but dry and ice-free at the time shown
  // North Sea mask: today's sea floor (below 0 m, not Natural Earth land) joined to the middle of the North Sea, inside the box;
  // the box edges cut the Channel and the Pentland Firth, so the Irish Sea is left out
  const NS_BOX = { i0: Math.round((-4 - lon0) / dlon), i1: Math.round((9.5 - lon0) / dlon), j0: Math.round((50.8 - lat0) / dlat), j1: Math.round((58.5 - lat0) / dlat) };
  const nsMask = new Uint8Array(N);
  {
    const ok = (i, j) => i >= NS_BOX.i0 && i <= NS_BOX.i1 && j >= NS_BOX.j0 && j <= NS_BOX.j1 && !land[j * W + i] && bed[j * W + i] < 0;
    const st = [Math.round((55.5 - lat0) / dlat) * W + Math.round((3 - lon0) / dlon)]; nsMask[st[0]] = 1;
    while (st.length) { const c = st.pop(), j = (c / W) | 0, i = c - j * W;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj, q = jj * W + ii; if (ok(ii, jj) && !nsMask[q]) { nsMask[q] = 1; st.push(q); } } }
  }
  function dryNorthSea() {
    let a = 0;
    for (let j = NS_BOX.j0; j <= NS_BOX.j1; j++) for (let i = NS_BOX.i0; i <= NS_BOX.i1; i++) { const c = j * W + i; if (nsMask[c] && !iceMask[c] && water[c] === 0) a += cellArea[j]; }
    return a;
  }

  // ---------- meshes ----------
  const meshLayer = new GraphicsLayer({ title: "Ice, sea and lakes", elevationInfo: { mode: "absolute-height" } });
  const iceG = new Graphic({ symbol: { type: "mesh-3d", symbolLayers: [{ type: "fill", material: { color: [255, 255, 255, 0.97], colorMixMode: "multiply" } }] } });
  const seaG = new Graphic({ symbol: { type: "mesh-3d", symbolLayers: [{ type: "fill", material: { color: [255, 255, 255, 0.93], colorMixMode: "multiply" } }] } });
  const lakeG = new Graphic({ symbol: { type: "mesh-3d", symbolLayers: [{ type: "fill", material: { color: [255, 255, 255, 0.92], colorMixMode: "multiply" } }] } });
  meshLayer.addMany([seaG, lakeG, iceG]);
  const vidx = new Int32Array(N), zbuf = new Float32Array(N);
  function gridMesh(colorOf) {
    let n = 0;
    for (let c = 0; c < N; c++) vidx[c] = isFinite(zbuf[c]) ? n++ : -1;
    if (n < 4) return null;
    const pos = new Float64Array(n * 3), col = new Uint8Array(n * 4);
    for (let c = 0; c < N; c++) { const m = vidx[c]; if (m < 0) continue; const j = (c / W) | 0, i = c - j * W;
      pos[m * 3] = lon0 + i * dlon; pos[m * 3 + 1] = lat0 + j * dlat; pos[m * 3 + 2] = zbuf[c] * EXAG; colorOf(c, col, m * 4); }
    const faces = [];
    for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) { const a = vidx[j * W + i], b = vidx[j * W + i + 1], c = vidx[(j + 1) * W + i], d = vidx[(j + 1) * W + i + 1];
      if (a < 0 || b < 0 || c < 0 || d < 0) continue; faces.push(a, b, c, b, d, c); }
    if (!faces.length) return null;
    return new Mesh({ spatialReference: { wkid: 4326 }, vertexAttributes: { position: pos, color: col }, components: [new MeshComponent({ faces: new Uint32Array(faces), material: { doubleSided: true } })] });
  }
  function dilate(src, rings, allow) {
    let cur = src.slice();
    for (let r = 0; r < rings; r++) { const nxt = cur.slice();
      for (let c = 0; c < N; c++) { if (cur[c]) continue; const j = (c / W) | 0, i = c - j * W;
        if (!allow(c)) continue;
        outer: for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= H) continue;
          for (let di = -1; di <= 1; di++) { const ii = i + di; if (ii < 0 || ii >= W) continue; if (cur[jj * W + ii]) { nxt[c] = 1; break outer; } } } }
      cur = nxt; }
    return cur;
  }
  const ICE_THIN = [245, 248, 250], ICE_THICK = [160, 192, 216];
  let seeThrough = false;
  // Ice mesh, cut along a smoothed ice edge with marching squares. The edge runs where a lightly blurred copy of the blended
  // signed distance (fsm, km) is zero, placed between grid points by linear interpolation, and the ice surface comes down to the bed
  // there. Near the edge the surface follows the same perfectly plastic taper as the thickness model. Display only: the readouts,
  // the lake and sea models and Check a place still use the unsmoothed ice. Replaces the 1.0 mesh, which stepped cell by cell.
  const fsm = new Float32Array(N), ftmp = new Float32Array(N), Hd = new Float32Array(N), insd = new Uint8Array(N);
  const edgeH = new Int32Array(N), edgeV = new Int32Array(N);
  const SMOOTH_PASSES = 2;   // passes of a 3 x 3 box blur (about 1 cell, 5–9 km)
  function smoothEdgeField() {
    fsm.set(fcur);
    for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
      for (let j = 0; j < H; j++) { const o = j * W;
        for (let i = 0; i < W; i++) { const l = i > 0 ? i - 1 : i, r = i < W - 1 ? i + 1 : i; ftmp[o + i] = (fsm[o + l] + fsm[o + i] + fsm[o + r]) / 3; } }
      for (let j = 0; j < H; j++) { const d = j > 0 ? j - 1 : j, u = j < H - 1 ? j + 1 : j;
        for (let i = 0; i < W; i++) fsm[j * W + i] = (ftmp[d * W + i] + ftmp[j * W + i] + ftmp[u * W + i]) / 3; }
    }
    for (let c = 0; c < N; c++) {
      if (fsm[c] <= 0) { insd[c] = 0; Hd[c] = 0; continue; }
      insd[c] = 1;
      const cap = 1.5 * Math.sqrt(2 * Math.max(tau[c], 15) * 1000 * fsm[c] * 1000 / RHO_G);
      Hd[c] = iceMask[c] ? Math.min(Hcur[c], cap) : Math.min(cap, 300);
    }
  }
  function buildIce() {
    smoothEdgeField();
    const a = seeThrough ? 140 : 255;
    let n = 0;
    for (let c = 0; c < N; c++) vidx[c] = insd[c] ? n++ : -1;
    const nGrid = n, ex = [], ey = [], ez = [];
    edgeH.fill(-1); edgeV.fill(-1);
    const edge = (p, q) => {   // vertex where the edge crosses the segment between grid points p < q (q = p + 1 or p + W)
      const map = q === p + 1 ? edgeH : edgeV;
      if (map[p] >= 0) return map[p];
      const t = Math.min(1, Math.max(0, fsm[p] / (fsm[p] - fsm[q])));
      const jp = (p / W) | 0, ip = p - jp * W, jq = (q / W) | 0, iq = q - jq * W;
      ex.push(lon0 + (ip + (iq - ip) * t) * dlon); ey.push(lat0 + (jp + (jq - jp) * t) * dlat); ez.push((bed[p] + (bed[q] - bed[p]) * t) * EXAG);
      return (map[p] = n++);
    };
    const seg = (p, q) => p < q ? edge(p, q) : edge(q, p);
    const faces = [], sq = [0, 0, 0, 0], ins = [false, false, false, false], poly = [];
    for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
      sq[0] = j * W + i; sq[1] = sq[0] + 1; sq[3] = sq[0] + W; sq[2] = sq[3] + 1;   // corners in order round the square
      let cnt = 0; for (let k = 0; k < 4; k++) { ins[k] = insd[sq[k]] === 1; if (ins[k]) cnt++; }
      if (!cnt) continue;
      if (cnt === 4) { const p0 = vidx[sq[0]], p1 = vidx[sq[1]], p2 = vidx[sq[2]], p3 = vidx[sq[3]]; faces.push(p0, p1, p2, p0, p2, p3); continue; }
      if (cnt === 2 && ins[0] === ins[2] && fsm[sq[0]] + fsm[sq[1]] + fsm[sq[2]] + fsm[sq[3]] <= 0) {   // saddle: two separate ice corners
        for (let k = 0; k < 4; k++) if (ins[k]) faces.push(seg(sq[(k + 3) % 4], sq[k]), vidx[sq[k]], seg(sq[k], sq[(k + 1) % 4]));
        continue;
      }
      poly.length = 0;   // corners inside the ice plus edge crossings, in order round the square: a convex polygon, fanned into triangles
      for (let k = 0; k < 4; k++) { const k1 = (k + 1) & 3;
        if (ins[k]) poly.push(vidx[sq[k]]);
        if (ins[k] !== ins[k1]) poly.push(seg(sq[k], sq[k1])); }
      for (let k = 1; k < poly.length - 1; k++) faces.push(poly[0], poly[k], poly[k + 1]);
    }
    if (!faces.length || n < 3) { iceG.geometry = null; return; }
    const pos = new Float64Array(n * 3), col = new Uint8Array(n * 4);
    for (let c = 0; c < N; c++) { const m = vidx[c]; if (m < 0) continue; const j = (c / W) | 0, i = c - j * W;
      pos[m * 3] = lon0 + i * dlon; pos[m * 3 + 1] = lat0 + j * dlat; pos[m * 3 + 2] = (bed[c] + Hd[c]) * EXAG;
      const f = Math.min(1, Hd[c] / 2500); for (let k = 0; k < 3; k++) col[m * 4 + k] = Math.round(ICE_THIN[k] + (ICE_THICK[k] - ICE_THIN[k]) * f); col[m * 4 + 3] = a; }
    for (let e = 0; e < ex.length; e++) { const m = nGrid + e;
      pos[m * 3] = ex[e]; pos[m * 3 + 1] = ey[e]; pos[m * 3 + 2] = ez[e];
      col[m * 4] = ICE_THIN[0]; col[m * 4 + 1] = ICE_THIN[1]; col[m * 4 + 2] = ICE_THIN[2]; col[m * 4 + 3] = a; }
    iceG.geometry = new Mesh({ spatialReference: { wkid: 4326 }, vertexAttributes: { position: pos, color: col }, components: [new MeshComponent({ faces: new Uint32Array(faces), material: { doubleSided: true } })] });
  }
  function buildSea(S) {
    const src = new Uint8Array(N); for (let c = 0; c < N; c++) src[c] = water[c] === 1 ? 1 : 0;
    const on = dilate(src, 2, (c) => water[c] !== 2 && !(land[c] && bed[c] < 0));   // may run under the ice edge, so no gap opens at the ice front
    for (let c = 0; c < N; c++) zbuf[c] = on[c] ? S : NaN;
    seaG.geometry = gridMesh((c, col, o) => { const d = Math.min(1, Math.max(0, (S - bed[c]) / 300)); col[o] = Math.round(70 - 40 * d); col[o + 1] = Math.round(140 - 70 * d); col[o + 2] = Math.round(190 - 60 * d); col[o + 3] = 235; });
  }
  function buildLakes() {
    const src = new Uint8Array(N); for (let c = 0; c < N; c++) src[c] = water[c] === 2 ? 1 : 0;
    const on = dilate(src, 1, (c) => water[c] !== 1);   // may run under the ice edge
    for (let c = 0; c < N; c++) {
      if (!on[c]) { zbuf[c] = NaN; continue; }
      if (src[c]) { zbuf[c] = lvl[c]; continue; }
      const j = (c / W) | 0, i = c - j * W; let z = -Infinity;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = j + dj, ii = i + di; if (jj < 0 || jj >= H || ii < 0 || ii >= W) continue; const q = jj * W + ii; if (src[q] && lvl[q] > z) z = lvl[q]; }
      zbuf[c] = isFinite(z) ? z : NaN;
    }
    lakeG.geometry = gridMesh((c, col, o) => { col[o] = 95; col[o + 1] = 180; col[o + 2] = 217; col[o + 3] = 235; });
  }

  // ---------- drape ----------
  const drapeImg = new Image(); drapeImg.crossOrigin = "anonymous"; drapeImg.src = DATA + "drape.jpg";
  await drapeImg.decode().catch(() => {});
  if (drapeImg.naturalWidth) {
    const cv = document.createElement("canvas"); cv.width = drapeImg.naturalWidth; cv.height = drapeImg.naturalHeight;
    const ctx = cv.getContext("2d"); ctx.drawImage(drapeImg, 0, 0);
    const img = ctx.getImageData(0, 0, cv.width, cv.height), px = img.data, fw = cv.width * 0.04, fh = cv.height * 0.04;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const e = Math.min(1, x / fw, (cv.width - 1 - x) / fw, y / fh, (cv.height - 1 - y) / fh);
      px[(y * cv.width + x) * 4 + 3] = Math.round(255 * Math.max(0, e) ** 0.7);
    }
    ctx.putImageData(img, 0, 0);
    map.add(new MediaLayer({ title: "Ground colour (height tint)", source: [new ImageElement({ image: cv, georeference: new ExtentAndRotationGeoreference({
      extent: new Extent({ xmin: drapeInfo.xmin, xmax: drapeInfo.xmax, ymin: drapeInfo.ymin, ymax: drapeInfo.ymax, spatialReference: { wkid: 3857 } }) }) })] }));
  }

  // ---------- BRITICE layers (only the ones this page offers) ----------
  // sets[key] holds every map layer behind one map-key entry; areas are added before lines so lines draw on top
  const line = (color, width) => ({ type: "simple", symbol: { type: "simple-line", color, width } });
  const fill = (color, outline, width = 1) => ({ type: "simple", symbol: { type: "simple-fill", color, outline: { color: outline, width } } });
  const sets = {}, areaLayers = [], lineLayers = [];
  const offered = new Set(cfg.legendLayers);
  if (offered.has("britExtent")) areaLayers.push(sets.britExtent = [new TileLayer({ url: "https://tiles.arcgis.com/tiles/Dn40vzt2R38VJsSS/arcgis/rest/services/extent1_tif/MapServer", title: "BRITICE: furthest ice extent", opacity: 0.55, visible: false })]);
  if (offered.has("llr")) areaLayers.push(sets.llr = [new FeatureLayer({ url: "https://services.arcgis.com/XSeYKQzfXnEgju9o/arcgis/rest/services/Loch_Lomond_Readvance/FeatureServer/0", title: "Loch Lomond Readvance", visible: false, elevationInfo: { mode: "on-the-ground" },
    renderer: fill([244, 114, 182, 0.45], [244, 114, 182, 1], 1.5) })]);
  if (offered.has("britLakes")) {
    areaLayers.push(sets.britLakes = [new FeatureLayer({ url: BRIT + "12", title: "BRITICE glacial lakes", visible: false, elevationInfo: { mode: "on-the-ground" }, renderer: fill([56, 189, 248, 0.5], [14, 165, 233, 1]) }),
      new FeatureLayer({ url: BRIT + "5", title: "BRITICE ice dams", visible: false, elevationInfo: { mode: "on-the-ground" }, renderer: line([14, 165, 233, 1], 2) })]);
  }
  for (const k of LANDFORM_KEYS) if (offered.has(k) && !LAYER_DEFS[k].derived) { const d = LAYER_DEFS[k], set = sets[k] = [];
    const common = { visible: false, minScale: LANDFORM_MIN_SCALE, maxScale: 0, elevationInfo: { mode: "on-the-ground" } };
    for (const id of d.areas || []) { const l = new FeatureLayer({ url: BRIT + id, title: "BRITICE " + d.label.toLowerCase() + " (areas)", renderer: fill(d.fill, d.line, 1), ...common }); set.push(l); areaLayers.push([l]); }
    for (const id of d.lines || []) { const l = new FeatureLayer({ url: BRIT + id, title: "BRITICE " + d.label.toLowerCase(), renderer: line(d.line, d.width), ...common }); set.push(l); lineLayers.push(l); }
  }
  // drumlin fields and ice flow: worked out here from the BRITICE lines when first needed (see drumlinFieldRings and flowLines)
  let flowLayer = null, flowState = "idle";
  if (offered.has("drumlins")) {
    flowLayer = new GraphicsLayer({ title: "Drumlin fields and ice flow (worked out from BRITICE)", visible: false, elevationInfo: { mode: "on-the-ground" } });
    sets.drumlins = [flowLayer];
  }
  async function loadFlow() {
    if (!flowLayer || flowState !== "idle") return;
    flowState = "loading"; flowNote();
    try {
      const bySource = await Promise.all(FLOW_SOURCES.map(id => fetchSegments(id)));
      const fieldSegs = bySource[FLOW_SOURCES.indexOf(FIELD_SOURCE)];
      const rings = drumlinFieldRings(fieldSegs), lines = flowLines(bySource.flat());
      if (rings.length) flowLayer.add(new Graphic({ geometry: { type: "polygon", rings, spatialReference: { wkid: 4326 } },
        symbol: { type: "simple-fill", color: [196, 181, 253, 0.32], outline: { color: [196, 181, 253, 0.95], width: 1.2 } } }));
      if (lines.length) {
        const g = { type: "polyline", paths: lines, spatialReference: { wkid: 4326 } };
        flowLayer.addMany([new Graphic({ geometry: g, symbol: { type: "simple-line", color: [15, 23, 42, 0.8], width: 4.5 } }),
          new Graphic({ geometry: g, symbol: { type: "simple-line", color: [255, 255, 255, 1], width: 2.2 } })]);
      }
      window.__flow = { segs: bySource.map(s => s.length), rings: rings.length, lines: lines.length };
      flowState = "ready";
    } catch (e) {
      // fall back to the plain lineation lines, so the drumlins still show
      console.warn("Drumlin fields could not be worked out:", e);
      const l = new FeatureLayer({ url: BRIT + FIELD_SOURCE, title: "BRITICE drumlins and lineations", visible: !!vis.drumlins, minScale: LANDFORM_MIN_SCALE, maxScale: 0,
        elevationInfo: { mode: "on-the-ground" }, renderer: line([233, 213, 255, 0.9], 1) });
      map.add(l); sets.drumlins.push(l);
      flowState = "failed";
    }
    flowNote();
  }
  function flowNote() {
    const el = document.querySelector('#legend button.k[data-l="drumlins"] .knote');
    if (el) el.textContent = flowState === "loading" ? " (loading…)" : flowState === "failed" ? " (showing the mapped lines)" : "";
  }
  map.addMany([...areaLayers.flat(), ...(flowLayer ? [flowLayer] : []), ...lineLayers]);

  // today's coastline, place names, checked-place marker
  const coastLayer = new GraphicsLayer({ title: "Today's coastline", elevationInfo: { mode: "on-the-ground" } });
  coastLayer.addMany(coast.coast.map(p => new Graphic({ geometry: { type: "polyline", paths: [p], spatialReference: { wkid: 4326 } }, symbol: { type: "simple-line", color: [255, 255, 255, 0.7], width: 1 } })));
  const labelLayer = new GraphicsLayer({ title: "Place names", elevationInfo: { mode: "absolute-height" } });
  const labelGraphics = PLACES.map(([name, lon, lat, feature]) => new Graphic({ geometry: { type: "point", x: lon, y: lat, z: 0, spatialReference: { wkid: 4326 } },
    symbol: { type: "point-3d", verticalOffset: { screenLength: 8 }, symbolLayers: [{ type: "text", text: name, size: feature ? 10.5 : 11, material: { color: feature ? [207, 227, 255] : [255, 255, 255] }, halo: { color: [10, 20, 35, 0.85], size: 1.2 }, font: { weight: feature ? "normal" : "bold", style: feature ? "italic" : "normal" } }] } }));
  labelLayer.addMany(labelGraphics);
  const markLayer = new GraphicsLayer({ title: "Checked place", elevationInfo: { mode: "absolute-height" } });
  const markG = new Graphic({ symbol: { type: "point-3d", verticalOffset: { screenLength: 30, maxWorldLength: 200000 }, callout: { type: "line", size: 1.5, color: [255, 255, 255, 0.9] },
    symbolLayers: [{ type: "icon", resource: { primitive: "circle" }, size: 12, material: { color: [250, 204, 21] }, outline: { color: [10, 20, 35], size: 1.5 } }] } });
  markLayer.add(markG);
  map.addMany([meshLayer, coastLayer, labelLayer, markLayer]);
  const cellOf = (lon, lat) => { const i = Math.round((lon - lon0) / dlon), j = Math.round((lat - lat0) / dlat); return (i < 0 || i >= W || j < 0 || j >= H) ? -1 : j * W + i; };
  const surfaceZ = (c, S) => Math.max(bed[c] + Hcur[c], S, bed[c], 0) * EXAG;
  function placeLabels(S) {
    labelGraphics.forEach((g, k) => { const [, lon, lat] = PLACES[k], c = cellOf(lon, lat);
      g.geometry = { type: "point", x: lon, y: lat, z: surfaceZ(c, S) + 400 * EXAG, spatialReference: { wkid: 4326 } }; });
  }

  // ---------- check a place ----------
  let checked = null;   // { lon, lat, name }
  function checkParts() {   // the model's answer at the checked place, in parts for the card text and the label on the pin
    const { lon, lat, name } = checked, c = cellOf(lon, lat);
    const where = name || `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}° ${lon < 0 ? "W" : "E"}`;
    if (c < 0) return { where, outside: true };
    const today = bed[c] >= 0 ? `the ground there is about ${nf(bed[c])} m above sea level` : `the sea floor there is about ${nf(-bed[c])} m deep`;
    let then, kind;
    if (iceMask[c]) { then = `under ice about ${nf(Math.round(Hcur[c] / 10) * 10)} m thick (modelled)`; kind = "ice"; }
    else if (water[c] === 1) { then = `under the sea, about ${nf(Math.max(1, Scur - bed[c]))} m deep`; kind = "sea"; }
    else if (water[c] === 2) { then = `under a lake (modelled), about ${nf(Math.max(1, lvl[c] - bed[c]))} m deep`; kind = "lake"; }
    else if (!land[c] && bed[c] < 0) { then = `dry land where the sea is today, about ${nf(bed[c] - Scur)} m above the sea of that time`; kind = "dry"; }
    else { then = `dry land, about ${nf(bed[c] - Scur)} m above the sea of that time`; kind = "land"; }
    return { where, then, today, kind };
  }
  function checkText() {
    if (!checked) return "Pick a place to see what it was like at the time shown.";
    const p = checkParts();
    if (p.outside) return `${p.where}: outside the area this app models.`;
    return `${p.where}, ${fmtAgo(T).toLowerCase()}: ${p.then}; today ${p.today}. (App's 9 km grid.)`;
  }
  // the label on the pin: same answer, short, kept next to the pin as the camera moves and the time changes
  const esc = (s) => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  function pinLabelHTML() {
    const p = checkParts(), cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    if (p.outside) return `<b>${esc(p.where)}</b><span class="pl-then">Outside the area this app models</span>`;
    return `<b>${esc(p.where)}</b><span class="pl-when">${fmtAgo(T)}</span><span class="pl-then pl-${p.kind}">${cap(p.then)}</span><span class="pl-today">Today ${p.today}</span>`;
  }
  let pinRaf = 0;
  function placePinLabel() {
    pinRaf = 0;
    const el = $("pinLabel"), g = markG.geometry;
    if (!checked || !g || !view.toScreen) { el.hidden = true; return; }
    const sp = view.toScreen(g), r = $("mapwrap").getBoundingClientRect();
    if (!sp || !isFinite(sp.x) || !isFinite(sp.y) || sp.x < 0 || sp.y < 0 || sp.x > r.width || sp.y > r.height) { el.hidden = true; return; }
    el.hidden = false;
    el.style.left = Math.round(sp.x) + "px"; el.style.top = Math.round(sp.y) + "px";   // the box sits above the pin (see the CSS)
  }
  const queuePinLabel = () => { if (!pinRaf) pinRaf = requestAnimationFrame(placePinLabel); };
  function updatePinLabel() {
    if (!checked) { $("pinLabel").hidden = true; return; }
    $("pinLabel").querySelector(".pl-text").innerHTML = pinLabelHTML();
    queuePinLabel();
  }
  if (reactiveUtils && reactiveUtils.watch) reactiveUtils.watch(() => view.camera, queuePinLabel);
  addEventListener("resize", queuePinLabel);
  function updateMark() {
    if (!checked) { markG.geometry = null; updatePinLabel(); return; }
    const c = cellOf(checked.lon, checked.lat);
    markG.geometry = { type: "point", x: checked.lon, y: checked.lat, z: c < 0 ? 0 : surfaceZ(c, Scur), spatialReference: { wkid: 4326 } };
    updatePinLabel();
  }
  function setChecked(p) { checked = p; $("pointOut").textContent = checkText(); updateMark(); }
  $("placeSel").addEventListener("change", (e) => { const v = e.target.value; if (v === "") { setChecked(null); return; } const [name, lon, lat] = CHECK_PLACES[+v]; setChecked({ lon, lat, name }); });
  $("pinClose").onclick = () => { $("placeSel").value = ""; setChecked(null); };
  if (view.on) view.on("click", (e) => { const p = e.mapPoint; if (!p || p.longitude == null) return; $("placeSel").value = ""; setChecked({ lon: p.longitude, lat: p.latitude }); });

  // ---------- state and redraw ----------
  let T = 60, lastBuild = { t: null, exag: null, see: null }, info = null, Scur = 0, dryArea = 0;
  const vis = { ice: true, sea: true, lakes: true, coast: true, labels: true, seeThrough: false };
  for (const k of cfg.legendLayers) vis[k] = false;
  function redraw(force) {
    if (!force && lastBuild.t === T && lastBuild.exag === EXAG && lastBuild.see === seeThrough) return;
    const t0 = performance.now();
    info = iceAt(T); Scur = seaLevelAt(T);
    flood(Scur); classifyWater(Scur); dryArea = dryNorthSea();
    buildIce(); buildSea(Scur); buildLakes(); placeLabels(Scur); updateMark();
    lastBuild = { t: T, exag: EXAG, see: seeThrough };
    updateReadout();
    window.__redrawMs = Math.round(performance.now() - t0);
  }
  let pending = false, lastDraw = 0;
  function requestRedraw() {
    if (pending) return; pending = true;
    requestAnimationFrame(function tick(now) { if (now - lastDraw < 110) { requestAnimationFrame(tick); return; } pending = false; lastDraw = now; redraw(false); });
  }
  function applyVis() {
    iceG.visible = vis.ice; seaG.visible = vis.sea; lakeG.visible = vis.lakes; coastLayer.visible = vis.coast; labelLayer.visible = vis.labels;
    for (const k of cfg.legendLayers) for (const l of sets[k] || []) l.visible = !!vis[k];
    if (vis.drumlins) loadFlow();
    if (seeThrough !== vis.seeThrough) { seeThrough = vis.seeThrough; requestRedraw(); }
    document.querySelectorAll("#legend button.k").forEach(b => b.setAttribute("aria-pressed", String(!!vis[b.dataset.l])));
  }

  // ---------- readout and description ----------
  function outlineText() {
    const { k, w } = info, a = TIMES[k], b = TIMES[k + 1];
    if (w < 0.02) return `${fmtAgo(a)}: ${OUTLINE_BASIS[a]}`;
    if (w > 0.98) return `${fmtAgo(b)}: ${OUTLINE_BASIS[b]}`;
    return `blended between the ${nf(a * 1000)} and ${nf(b * 1000)} year outlines`;
  }
  const seaText = () => Math.abs(Scur) < 0.5 ? "today's level" : `${Math.round(-Scur)} m (${ft(-Scur)} ft) lower than today`;
  const iceText = () => info.area < 20000 ? "only small glaciers and ice caps (too small to show well here)" : `${(info.area / 1e6).toFixed(2)} million km², up to ${(info.vmax / 1000).toFixed(1)} km thick`;
  const lakesText = () => lakeStats.n ? `${lakeStats.n} modelled${lakeStats.dammed ? `, ${lakeStats.dammed} against the ice` : ""}; ${nf(lakeStats.area)} km² in all` : "none large enough to show";
  const dryText = () => dryArea < 500 ? "none" : `about ${nf(Math.round(dryArea / 1000) * 1000)} km²`;
  // readouts a step can pin above the Play button (step option watch: ["dry", "sea"]), so they stay in view while the step plays
  const WATCH = { dry: ["Dry North Sea floor", dryText], sea: ["Sea level", seaText], ice: ["Ice", iceText], lakes: ["Lakes", lakesText] };
  function updateWatch() {
    const w = (CH[chapter] && CH[chapter].watch) || [];
    $("watch").hidden = !w.length;
    if (w.length) $("watch").innerHTML = w.filter(k => WATCH[k]).map(k => `<span><span class="wl">${WATCH[k][0]}</span> <b>${WATCH[k][1]()}</b></span>`).join("");
  }
  function updateReadout() {
    const st = stageAt(T);
    $("tLabel").textContent = fmtAgo(T);
    $("tStage").textContent = st.name;
    $("tSlider").value = String(80 - T);
    $("tSlider").setAttribute("aria-valuetext", `${fmtAgo(T)}. ${st.name}`);
    $("nSea").textContent = seaText();
    $("nIce").textContent = iceText();
    $("nOutline").textContent = outlineText();
    $("nLakes").textContent = lakesText();
    $("nDry").textContent = dryText();
    updateWatch();
    if (checked) $("pointOut").textContent = checkText();
    drawCursor();
    $("mapDesc").textContent = describe();
  }
  function describe() {
    const st = stageAt(T), parts = [`${fmtAgo(T)}, ${st.name}.`];
    parts.push(Math.abs(Scur) < 0.5 ? "Sea level is at today's level." : `Sea level is ${Math.round(-Scur)} metres lower than today${Scur < -40 ? ", so much of the North Sea floor between Britain and the continent is dry land" : Scur < -15 ? ", and Doggerland is shrinking as the sea rises" : ""}.`);
    if (info.area < 20000) parts.push("There are no ice sheets on the map, only small glaciers.");
    else {
      const has = (lon, lat) => iceMask[cellOf(lon, lat)] === 1;
      const where = [has(15, 63) && "Scandinavia", has(-4.5, 57) && "Scotland", has(-7.5, 53.5) && "Ireland", has(2, 58) && "the northern North Sea", has(-1.5, 54.5) && "northern England"].filter(Boolean);
      parts.push(`Ice covers ${(info.area / 1e6).toFixed(1)} million square kilometres${where.length ? ", including " + where.join(", ").replace(/, ([^,]*)$/, " and $1") : ""}, up to ${(info.vmax / 1000).toFixed(1)} km thick.`);
    }
    if (dryArea >= 500) parts.push(`About ${nf(Math.round(dryArea / 1000) * 1000)} square kilometres of today's North Sea floor is dry land.`);
    if (lakeStats.biggest) parts.push(`The lake model shows ${lakeStats.n} lake${lakeStats.n > 1 ? "s" : ""}${lakeStats.dammed ? `, ${lakeStats.dammed} against the ice` : ""}; the biggest covers about ${nf(lakeStats.biggest.area / 1000) + ",000"} km² near ${lakeStats.biggest.lat.toFixed(0)}° N, ${Math.abs(lakeStats.biggest.lon).toFixed(0)}° ${lakeStats.biggest.lon < 0 ? "W" : "E"}.`);
    const on = cfg.legendLayers.filter(k => vis[k]).map(k => LAYER_DEFS[k].desc);
    if (on.length) parts.push("Also shown: " + on.join(", ") + ".");
    return parts.join(" ");
  }
  const announce = () => { $("liveDesc").textContent = ""; setTimeout(() => { $("liveDesc").textContent = describe(); }, 60); };

  // ---------- chart ----------
  const svg = $("chart"), NS = "http://www.w3.org/2000/svg";
  let cursorLine = null;
  function drawChart() {
    const wpx = svg.clientWidth || 800, hpx = svg.clientHeight || 92;
    svg.setAttribute("viewBox", `0 0 ${wpx} ${hpx}`);
    [...svg.querySelectorAll(":not(title)")].forEach(e => e.remove());
    const X = (t) => (80 - t) / 80 * wpx;
    const add = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.appendChild(e); return e; };
    const bands = [[31, 14.692, "cold"], [14.692, 12.896, "warm"], [12.896, 11.703, "cold"], [11.703, 0, "warm"], [71, 57, "cold"]];
    for (const [a, b, kind] of bands) add("rect", { x: X(a), y: 0, width: X(b) - X(a), height: hpx, fill: kind === "warm" ? "rgba(253,186,116,0.13)" : "rgba(147,197,253,0.12)" });
    const gx = GIS.filter(g => g[0] <= 80), dmin = -44, dmax = -34;
    const gy = (d) => 4 + (1 - (d - dmin) / (dmax - dmin)) * (hpx * 0.5);
    add("path", { d: gx.map((g, k) => (k ? "L" : "M") + X(g[0]).toFixed(1) + " " + gy(g[1]).toFixed(1)).join(""), fill: "none", stroke: "#fdba74", "stroke-width": 1.3 });
    const sy = (s) => hpx * 0.56 + (-s / 135) * (hpx * 0.4);
    const slPts = []; for (let t = 0; t <= 80; t += 0.25) slPts.push([X(t), sy(seaLevelAt(t))]);
    add("path", { d: slPts.map((p, k) => (k ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(""), fill: "none", stroke: "#60a5fa", "stroke-width": 1.6 });
    const lbl = (x, y, txt, anchor = "start") => { const e = add("text", { x, y, fill: "#a8b6c9", "font-size": 10, "text-anchor": anchor }); e.textContent = txt; };
    const narrow = wpx < 560;   // phones: fewer ticks and no sea-level labels, so the labels do not run into each other
    for (const t of narrow ? [80, 60, 40, 20] : [80, 70, 60, 50, 40, 30, 20, 10]) { add("line", { x1: X(t), x2: X(t), y1: hpx - 10, y2: hpx, stroke: "rgba(255,255,255,0.25)" }); lbl(X(t) + 2, hpx - 1, `${t},000`); }
    lbl(wpx - 2, hpx - 1, "today", "end");
    lbl(X(22.8), 12, "Dimlington", "middle"); lbl(X(64), 12, "MIS 4", "middle");
    add("line", { x1: 0, x2: wpx, y1: sy(0), y2: sy(0), stroke: "rgba(96,165,250,0.35)", "stroke-dasharray": "3 4" });
    if (!narrow) { lbl(wpx - 40, sy(0) - 3, "sea level today", "end"); lbl(wpx - 40, sy(-120) - 3, "120 m lower", "end"); }
    add("line", { x1: 0, x2: wpx, y1: sy(-120), y2: sy(-120), stroke: "rgba(96,165,250,0.2)", "stroke-dasharray": "3 4" });
    cursorLine = add("line", { x1: 0, x2: 0, y1: 0, y2: hpx, stroke: "#fff", "stroke-width": 1.5 });
    drawCursor();
  }
  function drawCursor() { if (!cursorLine) return; const x = (80 - T) / 80 * (svg.clientWidth || 800); cursorLine.setAttribute("x1", x); cursorLine.setAttribute("x2", x); }
  function chartPick(e) { const r = svg.getBoundingClientRect(); setTime(Math.max(0, Math.min(80, 80 - (e.clientX - r.left) / r.width * 80))); }
  svg.addEventListener("pointerdown", (e) => { stopPlay(); svg.setPointerCapture(e.pointerId); chartPick(e); svg.onpointermove = chartPick; });
  svg.addEventListener("pointerup", () => { svg.onpointermove = null; announce(); });
  addEventListener("resize", drawChart);

  // ---------- time, playback, steps ----------
  function setTime(t) { T = Math.round(Math.max(0, Math.min(80, t)) * 100) / 100; requestRedraw(); $("tLabel").textContent = fmtAgo(T); drawCursor(); }
  let playing = null;
  // phones: the story card can be expanded to the whole screen for reading; playing shrinks it so the map shows
  function setCardSize(big) {
    $("card").classList.toggle("expanded", big);
    $("sizeBtn").setAttribute("aria-expanded", String(big));
    $("sizeBtn").textContent = big ? "Show map ▾" : "Expand ▴";
  }
  $("sizeBtn").onclick = () => setCardSize(!$("card").classList.contains("expanded"));
  function stopPlay() { if (!playing) return; cancelAnimationFrame(playing.raf); playing = null; $("tPlay").textContent = "▶"; $("tPlay").setAttribute("aria-label", "Play the timeline"); setGoLabel(); announce(); }
  function play(to, kaPerSec) {
    stopPlay();
    if ($("card").classList.contains("expanded")) setCardSize(false);
    const target = to ?? 0, dir = target < T ? -1 : 1; let last = performance.now();
    // keep the unrounded time here: setTime rounds T to 10 years, which used to swallow each frame's small step at 60 frames a second
    let cur = T;
    playing = { target };
    $("tPlay").textContent = "⏸"; $("tPlay").setAttribute("aria-label", "Pause the timeline"); setGoLabel();
    const step = (now) => { const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const rate = kaPerSec ?? +$("speed").value;
      let nt = cur + dir * rate * dt; if ((dir < 0 && nt <= target) || (dir > 0 && nt >= target)) nt = target;
      cur = nt;
      setTime(nt);
      if (nt === target) { stopPlay(); return; }
      playing.raf = requestAnimationFrame(step); };
    playing.raf = requestAnimationFrame(step);
  }
  let chapter = 0;
  function setGoLabel() {
    const c = CH[chapter];
    $("goBtn").textContent = playing ? "⏸ Pause" : c.play ? (c.play.label || "▶ Play") : chapter < CH.length - 1 ? "Next step ›" : "Start again";
  }
  function goChapter(k, fly = true) {
    stopPlay(); chapter = k; const c = CH[k];
    $("stepOf").textContent = `Step ${k + 1} of ${CH.length}`;
    $("chTitle").textContent = c.title;
    const st = stageAt(c.t);
    $("chWhen").innerHTML = `<span class="chip">${fmtAgo(c.t)}</span><span class="chip ${st.kind === "warm" ? "warm" : st.kind === "cold" ? "cold" : ""}">${st.name}</span>`;
    $("story").innerHTML = (c.spec && c.spec.length ? `<div class="spec" aria-label="Specification links">${c.spec.map(s => `<span>${s}</span>`).join("")}</div>` : "") + c.html;
    document.querySelectorAll("#steps button").forEach((b, i) => { b.setAttribute("aria-current", i === k ? "step" : "false"); b.classList.toggle("done", i < k); });
    { const ol = $("steps"), b = ol.children[k]; if (b && ol.scrollWidth > ol.clientWidth) ol.scrollLeft = b.offsetLeft - ol.offsetLeft - ol.clientWidth / 2 + b.offsetWidth / 2; }
    for (const key of cfg.legendLayers) vis[key] = !!(c.layers && c.layers[key]);
    vis.seeThrough = !!c.seeThrough;
    applyVis();
    setTime(c.t); redraw(true);
    view.goTo(CAM[c.cam], { duration: fly && !reduceMotion ? 2200 : 0, easing: "in-out-cubic" }).catch(() => {});
    $("backBtn").disabled = k === 0;
    $("nextBtn").disabled = k === CH.length - 1;
    setGoLabel();
    $("panes").scrollTop = 0;
    announce();
    const u = new URL(location); u.searchParams.set("step", k + 1); u.searchParams.delete("t"); history.replaceState(null, "", u);
  }
  $("steps").innerHTML = CH.map((c, i) => `<li><button aria-label="Step ${i + 1}: ${c.title}, ${fmtAgo(c.t)}" title="${c.title} (${fmtAgo(c.t)})">${i + 1}</button></li>`).join("");
  document.querySelectorAll("#steps button").forEach((b, i) => b.onclick = () => goChapter(i));
  $("backBtn").onclick = () => goChapter(Math.max(0, chapter - 1));
  $("nextBtn").onclick = () => goChapter(Math.min(CH.length - 1, chapter + 1));
  $("goBtn").onclick = () => {
    const c = CH[chapter];
    if (playing) { stopPlay(); return; }
    if (c.play) { if (T <= c.play.to + 0.01) setTime(c.t); play(c.play.to, c.play.speed); return; }
    goChapter(chapter < CH.length - 1 ? chapter + 1 : 0);
  };
  $("tPlay").onclick = () => { if (playing) stopPlay(); else play(T <= 0.01 ? 80 : 0); };
  $("tSlider").addEventListener("input", () => { stopPlay(); setTime(80 - +$("tSlider").value); });
  $("tSlider").addEventListener("change", announce);
  addEventListener("keydown", (e) => {
    const el = e.target;
    if (el.closest("input, select, dialog, textarea")) return;
    // Space plays or pauses only when the page or the map has focus; on buttons, links, "Describe the map" and the story text it does its usual job
    const onPageOrMap = el === document.body || el === document.documentElement || !!el.closest("arcgis-scene");
    if (e.code === "Space" && onPageOrMap) { e.preventDefault(); $("tPlay").click(); }
    if (el.closest("#panes")) return;   // Page Up / Page Down scroll the story text there
    if (e.key === "PageDown") { e.preventDefault(); $("nextBtn").click(); }
    if (e.key === "PageUp") { e.preventDefault(); $("backBtn").click(); }
  });
  document.querySelectorAll("#legend button.k").forEach(b => b.onclick = () => { vis[b.dataset.l] = !vis[b.dataset.l]; applyVis(); $("mapDesc").textContent = describe(); });
  $("legendTitle").onclick = () => { const c = $("legend").classList.toggle("collapsed"); $("legendTitle").setAttribute("aria-expanded", String(!c)); };
  if (innerWidth <= 1280 || innerHeight <= 780) { $("legend").classList.add("collapsed"); $("legendTitle").setAttribute("aria-expanded", "false"); }
  document.querySelectorAll("#exag button").forEach(b => b.onclick = () => { EXAG = +b.dataset.x; setGround(); document.querySelectorAll("#exag button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); redraw(true); });
  $("teachBtn").onclick = () => $("teachDlg").showModal();
  $("teachClose").onclick = () => $("teachDlg").close();

  // ---------- start ----------
  drawChart();
  $("loading").hidden = true;
  const q = new URLSearchParams(location.search);
  const qStep = +q.get("step"), qT = q.get("t");
  const stepOk = qStep >= 1 && qStep <= CH.length;
  const tq = qT !== null && qT.trim() !== "" && isFinite(+qT) ? Math.max(0, Math.min(80, +qT)) : null;
  let k0 = stepOk ? qStep - 1 : 0;
  if (tq !== null && !stepOk) {   // ?t= on its own: open the step nearest that time, so the story card matches the map
    CH.forEach((c, i) => { if (Math.abs(c.t - tq) < Math.abs(CH[k0].t - tq)) k0 = i; });
  }
  goChapter(k0, false);
  if (flowLayer) setTimeout(loadFlow, 2500);   // fetch the BRITICE lines early, so the drumlin step opens ready
  if (tq !== null) {   // keep the time in the address, so a reload or a shared link opens at the same time
    setTime(tq);
    const u = new URL(location); u.searchParams.set("t", String(tq)); history.replaceState(null, "", u);
  }
}
