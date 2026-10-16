// End-to-end UI test: dist/pooh-sticks.html in jsdom with a fake ArcGIS SDK whose ElevationLayer serves synthetic terrain.
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');
const FE = require('../src/flow.js');

// Synthetic terrain (lon/lat): south-east England slopes south to the English Channel, with a valley and small bumps;
// around the Great Salt Lake a closed bowl.
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
function elevAt(lon, lat) {
  if (lon > -123.6 && lon < -122.4 && lat > 45.9 && lat < 46.6) {   // a slope down to the Columbia's wide estuary (a river polygon)
    return 5 + 3 * (lon + 123.6) * 76.9 + 0.5 * Math.abs(lat - 46.22) * 111 + 2 * hash(Math.floor(lon * 500), Math.floor(lat * 500));
  }
  if (lon > -114 && lon < -111 && lat > 40 && lat < 42.5) {
    const r = Math.hypot((lon + 112.55) * 84, (lat - 41.1) * 111);
    return 1280 + 0.03 * r * r + 2 * hash(Math.floor(lon * 300), Math.floor(lat * 300));
  }
  const kmN = (lat - 50.70) * 111;                 // km north of a line near the coast
  if (kmN < 0) return -20 + kmN;                   // the sea
  const valley = 12 * Math.abs((lon - 0.10) * 70);  // a valley running north-south through lon 0.10
  return 3 * kmN + valley + 2 * hash(Math.floor(lon * 500), Math.floor(lat * 500));
}

function fakeSDK(win) {
  class Base { constructor(o) { Object.assign(this, o || {}); } }
  class SpatialRef { constructor(o) { Object.assign(this, o); } get isWebMercator() { return this.wkid === 102100 || this.wkid === 3857; } }
  class Point extends Base {
    constructor(o) {
      super(o);
      if (o && o.longitude !== undefined && o.x === undefined) { const m = FE.toMerc(o.longitude, o.latitude); this.x = m[0]; this.y = m[1]; delete this.longitude; delete this.latitude; }
      this.spatialReference = new SpatialRef((o && o.spatialReference) || { wkid: 102100 });
    }
    get longitude() { return FE.toLonLat(this.x, this.y)[0]; }
    get latitude() { return FE.toLonLat(this.x, this.y)[1]; }
    clone() { return new Point({ x: this.x, y: this.y, spatialReference: { wkid: 102100 } }); }
  }
  class Collection { constructor() { this.items = []; } includes(g) { return this.items.includes(g); } get length() { return this.items.length; } }
  class GraphicsLayer extends Base {
    constructor(o) { super(o); this.graphics = new Collection(); }
    add(g) { this.graphics.items.push(g); } addMany(gs) { gs.forEach(g => this.add(g)); }
    remove(g) { this.graphics.items = this.graphics.items.filter(x => x !== g); } removeAll() { this.graphics.items = []; }
  }
  class Layer extends Base { load() { return Promise.resolve(this); } }
  class ElevationLayer extends Layer {
    fetchTile(level, row, col) {
      win.__tiles = (win.__tiles || 0) + 1;
      if (win.__flaky) {   // every tile fails once (a busy server), then works: the app must try again
        const k = level + '/' + row + '/' + col;
        win.__failedOnce = win.__failedOnce || new Set();
        if (!win.__failedOnce.has(k)) { win.__failedOnce.add(k); const e = new Error('busy'); e.details = { httpStatus: 503 }; return Promise.reject(e); }
      }
      const W = 257, v = new Float32Array(W * W), r = FE.res(level);
      for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
        const x = (col * 256 + i + 0.5) * r - FE.ORIGIN, y = FE.ORIGIN - (row * 256 + j + 0.5) * r;
        const [lon, lat] = FE.toLonLat(x, y);
        v[j * W + i] = elevAt(lon, lat);
      }
      return Promise.resolve({ values: v, width: W, height: W, noDataValue: -99999 });
    }
  }
  class EsriMap extends Base { constructor(o) { super(o); this.layers = []; } add(l) { this.layers.push(l); } addMany(ls) { ls.forEach(l => this.add(l)); } }
  class MapView extends Base {
    constructor(o) {
      super(o); this.handlers = {}; this.ui = { components: [], move() {} }; this.zoom = 14; this.scale = 36000; this.width = 1200; this.height = 800;
      const m = FE.toMerc(o.center[0], o.center[1]);
      this.center = new Point({ x: m[0], y: m[1] });
      win.__view = this;
    }
    on(ev, fn) { this.handlers[ev] = fn; return { remove() {} }; }
    toScreen() { win.__toScreen = (win.__toScreen || 0) + 1; return { x: 600, y: 400 }; }
    goTo(t) { if (t && t.target && t.target.x !== undefined) this.center = t.target; if (t && t.scale) this.scale = t.scale; if (t && t.center) { const m = FE.toMerc(t.center[0], t.center[1]); this.center = new Point({ x: m[0], y: m[1] }); } if (t && t.zoom !== undefined) this.zoom = t.zoom; return Promise.resolve(); }
    when(fn) { return Promise.resolve().then(fn); }
    set viewpoint(vp) { this._vp = vp; win.__viewpoints = (win.__viewpoints || 0) + 1; }
    get viewpoint() { return this._vp; }
  }
  const mods = {
    'esri/config': {}, 'esri/Map': EsriMap, 'esri/views/MapView': MapView, 'esri/Basemap': Base, 'esri/layers/TileLayer': Layer,
    'esri/layers/ElevationLayer': ElevationLayer, 'esri/layers/GraphicsLayer': GraphicsLayer, 'esri/Graphic': Base,
    'esri/geometry/Polyline': Base, 'esri/geometry/Polygon': Base, 'esri/geometry/Point': Point, 'esri/geometry/Extent': Base, 'esri/Viewpoint': Base
  };
  win.require = (names, cb) => setTimeout(() => cb(...names.map(n => { if (!(n in mods)) throw new Error('missing module ' + n); return mods[n]; })), 0);
  win.__Point = Point;
}

function load(reduce, page, extra) {
  const html = fs.readFileSync(path.join(__dirname, '../dist/' + (page || 'pooh-sticks.html')), 'utf8').replace('<script src="https://js.arcgis.com/4.34/"></script>', '');
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/pooh/',
    beforeParse(win) {
      fakeSDK(win);
      win.fetch = () => Promise.reject(new TypeError('Failed to fetch'));   // Esri's service unreachable: our model takes over
      if (extra) extra(win);
      win.localStorage.setItem('poohSticks.score.v1', JSON.stringify({ right: 7, played: 9 }));   // a score an older version saved
      win.HTMLCanvasElement.prototype.getContext = () => null;   // jsdom has no canvas; the page skips the splash drawing
      win.matchMedia = q => ({ matches: reduce && q.includes('reduce'), addEventListener() {} });
      win.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
      win.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
      win.console.error = (...a) => { errors.push(a.join(' ')); console.log('[page error]', ...a); };
      win.addEventListener('error', e => errors.push(e.message));
    }
  });
  return { dom, win: dom.window, $: s => dom.window.document.querySelector(s), errors };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, label, ms = 60000) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout: ' + label); await wait(25); } }

async function main() {
  // ---- 1. Poohsticks Bridge (map opens there), reduced motion
  let { win, $, errors } = load(true);
  await until(() => win.__view, 'view');
  await wait(50);
  assert.ok($('#appTitle').textContent.includes('I wonder where my stick goes'));
  assert.ok(!$('#stepReady').hidden);
  assert.strictEqual($('#readyTitle').textContent, 'Let’s play Pooh Sticks!');
  assert.ok($('#foot').textContent.includes('0.7.0'));
  assert.strictEqual($('#score').textContent, 'Score: 0 points', 'the score starts at 0, whatever an older version saved');
  assert.strictEqual(win.localStorage.getItem('poohSticks.score.v1'), null, 'the old saved score is cleared');
  assert.strictEqual($('#appTag').textContent, 'Celebrating 100 years of Winnie the Pooh');
  assert.ok(win.document.body.classList.contains('can-drop'), 'twig cursor on while a stick can be dropped');
  assert.ok(!$('#dropTip').hidden && $('#dropTip').textContent.includes('Drop me in a stream!'), 'drop-me tip shows at the start of a turn');
  assert.ok(!$('#skipGuessBtn') && !$('#lockBtn'), 'no Just show me / Lock in buttons');
  assert.ok($('#titleTwig').src.startsWith('data:image/svg+xml'), 'twig in the title');
  assert.ok(!$('#crosshair').classList.contains('show'), 'no cross unless using the keyboard');
  const opts = [...win.document.querySelectorAll('#placeSelect option')].map(o => o.textContent);
  assert.ok(opts.some(o => o.includes('Poohsticks Bridge')) && opts.some(o => o.includes('Volga')));
  assert.ok(!$('#dropCentreBtn'), 'no drop-at-the-cross button any more');
  win.__view.handlers['key-down']({ key: 'Enter', stopPropagation() {} });
  await until(() => !$('#stepPredict').hidden || !$('#readyMsg').hidden || !$('#stepReveal').hidden, 'predict');
  assert.ok($('#readyMsg').hidden, 'no error: ' + $('#readyMsg').textContent);
  const labels = [...win.document.querySelectorAll('#choices label')].map(l => l.textContent);
  console.log('choices:', labels.join(' | '));
  assert.strictEqual(labels.length, 4);
  assert.ok(labels.includes('English Channel'), 'the synthetic slope runs south to the English Channel');
  assert.ok($('#dropTip').hidden, 'tip goes once the stick is dropped');
  assert.ok(!win.document.body.classList.contains('can-drop'), 'no twig cursor while guessing');
  assert.strictEqual($('#goBtn').textContent, 'Go!');
  $('#predictForm').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
  await wait(20);
  assert.ok(!$('#nudge').hidden && !$('#stepPredict').hidden, 'Go! with nothing picked asks for a pick');
  const radios = [...win.document.querySelectorAll('#choices input')];
  const r = radios[labels.indexOf('English Channel')];
  r.checked = true; r.dispatchEvent(new win.Event('change', { bubbles: true }));
  $('#predictForm').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
  await until(() => !$('#stepReveal').hidden, 'reveal');
  console.log('result:', $('#resultBox').textContent);
  const firstGo = $('#resultBox').textContent.match(/floated about [\d.,]+ km and reached the [A-Za-z ]+/)[0];
  console.log('real:', $('#realBox').textContent);
  console.log('facts:', $('#facts').textContent);
  assert.ok($('#resultBox').textContent.includes('You got it') && $('#resultBox').textContent.includes('English Channel'));
  assert.ok(!$('#realBox').hidden && $('#realBox').textContent.includes('North Sea') && $('#realBox').textContent.includes('different way'));
  assert.ok($('#realBox').textContent.startsWith('In real life, water from Poohsticks Bridge, Ashdown Forest ends up'));
  const z0 = win.__view.zoom; $('#zoomIn').click(); await wait(20);
  assert.ok(win.__view.zoom === Math.round(z0) + 1, 'zoom in button');
  assert.strictEqual($('#score').textContent, 'Score: 100 points');
  assert.ok($('#resultBox').textContent.includes('+100 points!'));
  assert.ok($('#howList').textContent.includes('Flow model') && $('#howList').textContent.includes('v1.1'));
  assert.ok($('#howList').textContent.includes('Esri\'s Trace Downstream couldn\'t be used this time (Failed to fetch), so our own model traced the stick.'), $('#howList').textContent);
  assert.ok($('#labNote').hidden && !$('#facts').textContent.includes('Traced by'), 'no lab note or timing on the main page');
  assert.strictEqual(win.document.activeElement.id, 'revealTitle');

  // ---- 2. Great Salt Lake area via a click: closed lake, "never reaches the sea", skip the guess
  $('#againBtn').click();
  const m = FE.toMerc(-112.0, 41.6);
  win.__view.handlers.click({ mapPoint: new win.__Point({ x: m[0], y: m[1] }) });
  await until(() => !$('#stepPredict').hidden || !$('#readyMsg').hidden, 'predict 2');
  assert.ok($('#readyMsg').hidden, $('#readyMsg').textContent);
  const labels2 = [...win.document.querySelectorAll('#choices label')].map(l => l.textContent);
  console.log('choices 2:', labels2.join(' | '));
  const wrong = [...win.document.querySelectorAll('#choices input')][labels2.findIndex(l => !l.includes('never reaches'))];
  wrong.checked = true; wrong.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.ok($('#nudge').hidden);
  $('#goBtn').click();
  await until(() => !$('#stepReveal').hidden, 'reveal 2');
  assert.ok($('#resultBox').textContent.includes('No points this time'));
  console.log('result 2:', $('#resultBox').textContent);
  assert.ok($('#resultBox').textContent.includes('Great Salt Lake'));
  assert.ok($('#realBox').hidden, 'no real-river note away from the chosen place');
  assert.strictEqual($('#score').textContent, 'Score: 100 points', 'a wrong guess does not score');
  // the famous-places list is on the results panel too
  const sel2 = $('#placeSelect2');
  sel2.value = String([...sel2.querySelectorAll('option')].findIndex(o => o.textContent.startsWith('Nile')) - 1);
  $('#placeGo2').click();
  await wait(30);
  assert.ok(!$('#stepReady').hidden, 'back to the start panel');
  assert.ok(Math.abs(win.__view.center.longitude - 29.83) < 0.05, 'zoomed to the Nile headwaters');
  console.log('reveal list → Nile:', FE.toLonLat(win.__view.center.x, win.__view.center.y).map(v => v.toFixed(2)).join(','));

  // ---- 3. a sea click is refused; About dialog; place list
  $('#againBtn').click();
  const s = FE.toMerc(-30, 40);
  win.__view.handlers.click({ mapPoint: new win.__Point({ x: s[0], y: s[1] }) });
  await until(() => !$('#readyMsg').hidden, 'sea msg');
  console.log('sea:', $('#readyMsg').textContent);
  assert.ok($('#readyMsg').textContent.includes('already the sea'));
  $('#aboutBtn').click();
  assert.ok($('#aboutDlg').hasAttribute('open'));
  const about = $('#aboutBody').textContent;
  assert.ok(about.includes('Flow model') && about.includes('Inland ending rule') && about.includes('v0.7.0') && about.includes('Esri Trace Downstream') && about.includes('The route to the sea') && about.includes('v1.1') && about.includes('starts at 0') && about.includes('v1.2') && about.includes('may not follow every bend') && about.includes('100 points') && about.includes('TopoBathy3D'));
  assert.ok(!/©|Copyright/i.test(about), 'no copyright line');
  $('#aboutClose').click();
  const sel = $('#placeSelect');
  sel.value = String([...sel.querySelectorAll('option')].findIndex(o => o.textContent.startsWith('Volga')) - 1);
  $('#placeGo').click();
  await wait(50);
  console.log('after Go, centre:', FE.toLonLat(win.__view.center.x, win.__view.center.y).map(v => v.toFixed(3)).join(','));
  assert.ok(Math.abs(win.__view.center.longitude - 32.674) < 0.01);
  // a stick that floats into a river so wide the map draws it as water: named by the sea it opens into
  const col = FE.toMerc(-122.8, 46.22);
  win.__view.handlers.click({ mapPoint: new win.__Point({ x: col[0], y: col[1] }) });
  await until(() => !$('#stepPredict').hidden || !$('#readyMsg').hidden, 'predict columbia');
  assert.ok($('#readyMsg').hidden, $('#readyMsg').textContent);
  const labels3 = [...win.document.querySelectorAll('#choices label')].map(l => l.textContent);
  console.log('choices 3:', labels3.join(' | '));
  const pac = [...win.document.querySelectorAll('#choices input')][labels3.indexOf('Pacific Ocean')];
  pac.checked = true; pac.dispatchEvent(new win.Event('change', { bubbles: true }));
  $('#goBtn').click();
  await until(() => !$('#stepReveal').hidden, 'reveal columbia');
  console.log('result 3:', $('#resultBox').textContent);
  assert.ok($('#resultBox').textContent.includes('into the wide mouth of the Columbia River, which opens into the Pacific Ocean.'));
  assert.ok($('#resultBox').textContent.includes('You got it'));
  // "Drop another stick" is a fresh go: back where the last stick went in, nothing carried over but the score
  const scoreBefore = $('#score').textContent;
  await wait(20);                                       // the route has been fitted on the map
  $('#againBtn').click();                               // map not moved since the result: back to the last drop
  await wait(20);
  assert.ok(Math.abs(win.__view.center.longitude + 122.8) < 1e-6, 'back to where the last stick went in');
  assert.strictEqual($('#score').textContent, scoreBefore, 'score kept');
  // cancel straight after a drop, then drop again: must not get stuck
  const gs = FE.toMerc(-112.0, 41.6);
  win.__view.handlers.click({ mapPoint: new win.__Point({ x: gs[0], y: gs[1] }) });
  $('#cancelBtn').click();
  assert.ok(!$('#stepReady').hidden, 'cancel goes back to the start');
  // the same drop as the very first go must give exactly the same answer now (fresh go, nothing cumulative)
  const pb = FE.toMerc(0.097407, 51.084674);
  win.__view.handlers.click({ mapPoint: new win.__Point({ x: pb[0], y: pb[1] }) });
  await until(() => !$('#stepPredict').hidden || !$('#readyMsg').hidden, 'predict again');
  assert.ok($('#readyMsg').hidden, $('#readyMsg').textContent);
  const ec = [...win.document.querySelectorAll('#choices input')][[...win.document.querySelectorAll('#choices label')].map(l => l.textContent).indexOf('English Channel')];
  ec.checked = true; ec.dispatchEvent(new win.Event('change', { bubbles: true }));
  $('#goBtn').click();
  await until(() => !$('#stepReveal').hidden, 'reveal again');
  const laterGo = $('#resultBox').textContent.match(/floated about [\d.,]+ km and reached the [A-Za-z ]+/)[0];
  console.log('first go:', firstGo, '| fifth go, same spot:', laterGo);
  assert.strictEqual(laterGo, firstGo, 'same drop, same result, however many goes before it');
  // after the result, pan somewhere else to find the next stream: Drop another stick must leave the map there
  await wait(20);
  const away = FE.toMerc(-3.2, 55.95);
  win.__view.center = new win.__Point({ x: away[0], y: away[1] });
  $('#againBtn').click();
  await wait(20);
  assert.ok(Math.abs(win.__view.center.longitude + 3.2) < 1e-6 && !$('#stepReady').hidden, 'map stays where it was panned to');
  assert.ok($('.credit-tag').textContent === 'Created by Jason Sawle');
  assert.strictEqual(errors.length, 0, 'page errors: ' + errors.join(' | '));
  win.close();

  // ---- 4. animated journey (no reduced motion): the camera moves, then skip
  ({ win, $, errors } = load(false));
  win.__flaky = true;
  await until(() => win.__view, 'view b');
  await wait(50);
  assert.strictEqual($('#score').textContent, 'Score: 0 points', 'back to 0 after a refresh');
  win.__view.handlers.click({ mapPoint: win.__view.center });
  await until(() => !$('#stepPredict').hidden, 'predict b');
  const any = win.document.querySelector('#choices input'); any.checked = true; any.dispatchEvent(new win.Event('change', { bubbles: true }));
  $('#goBtn').click();
  await until(() => !$('#stepJourney').hidden, 'journey');
  await wait(800);
  assert.ok(win.__toScreen > 0, 'the splash found where the stick hit the water');
  assert.ok(win.__failedOnce.size > 0, 'every tile failed once and was fetched again');
  const vp = win.__viewpoints || 0;
  console.log('viewpoint updates during 0.8 s of journey:', vp, '| status:', $('#journeyStatus').textContent);
  assert.ok(vp > 5, 'camera follows the stick');
  assert.ok(!$('#skipBtn'), 'no Skip button any more');
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));   // Escape still skips
  await until(() => !$('#stepReveal').hidden, 'reveal b');
  $('#replayBtn').click();
  await until(() => !$('#stepJourney').hidden, 'replay');
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => !$('#stepReveal').hidden, 'reveal c');
  assert.strictEqual(errors.length, 0, 'page errors: ' + errors.join(' | '));
  console.log(`UI SMOKE TEST PASSED (${win.__tiles} elevation tiles)`);
  win.close();
}
module.exports = { load, wait, until, FE };
if (require.main === module) main().catch(e => { console.error('FAIL', e); process.exit(1); });
