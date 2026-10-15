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
    goTo(t) { if (t && t.center) { const m = FE.toMerc(t.center[0], t.center[1]); this.center = new Point({ x: m[0], y: m[1] }); } return Promise.resolve(); }
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

function load(reduce) {
  const html = fs.readFileSync(path.join(__dirname, '../dist/pooh-sticks.html'), 'utf8').replace('<script src="https://js.arcgis.com/4.34/"></script>', '');
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/pooh/',
    beforeParse(win) {
      fakeSDK(win);
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

(async () => {
  // ---- 1. Poohsticks Bridge (map opens there), reduced motion
  let { win, $, errors } = load(true);
  await until(() => win.__view, 'view');
  await wait(50);
  assert.ok($('#appTitle').textContent.includes('I wonder where my stick goes'));
  assert.ok(!$('#stepReady').hidden);
  assert.ok($('#foot').textContent.includes('0.2.0'));
  const opts = [...win.document.querySelectorAll('#placeSelect option')].map(o => o.textContent);
  assert.ok(opts.some(o => o.includes('Poohsticks Bridge')) && opts.some(o => o.includes('Volga')));
  $('#dropCentreBtn').click();
  await until(() => !$('#stepPredict').hidden || !$('#readyMsg').hidden || !$('#stepReveal').hidden, 'predict');
  assert.ok($('#readyMsg').hidden, 'no error: ' + $('#readyMsg').textContent);
  const labels = [...win.document.querySelectorAll('#choices label')].map(l => l.textContent);
  console.log('choices:', labels.join(' | '));
  assert.strictEqual(labels.length, 4);
  assert.ok(labels.includes('English Channel'), 'the synthetic slope runs south to the English Channel');
  const radios = [...win.document.querySelectorAll('#choices input')];
  const r = radios[labels.indexOf('English Channel')];
  r.checked = true; r.dispatchEvent(new win.Event('change', { bubbles: true }));
  $('#predictForm').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
  await until(() => !$('#stepReveal').hidden, 'reveal');
  console.log('result:', $('#resultBox').textContent);
  console.log('real:', $('#realBox').textContent);
  console.log('facts:', $('#facts').textContent);
  assert.ok($('#resultBox').textContent.includes('You got it') && $('#resultBox').textContent.includes('English Channel'));
  assert.ok(!$('#realBox').hidden && $('#realBox').textContent.includes('North Sea') && $('#realBox').textContent.includes('different way'));
  assert.strictEqual($('#score').textContent, 'Score: 1 / 1');
  assert.ok($('#howList').textContent.includes('Flow model') && $('#howList').textContent.includes('v1.0'));
  assert.strictEqual(win.document.activeElement.id, 'revealTitle');

  // ---- 2. Great Salt Lake area via a click: closed lake, "never reaches the sea", skip the guess
  $('#againBtn').click();
  const m = FE.toMerc(-112.0, 41.6);
  win.__view.handlers.click({ mapPoint: new win.__Point({ x: m[0], y: m[1] }) });
  await until(() => !$('#stepPredict').hidden || !$('#readyMsg').hidden, 'predict 2');
  assert.ok($('#readyMsg').hidden, $('#readyMsg').textContent);
  const labels2 = [...win.document.querySelectorAll('#choices label')].map(l => l.textContent);
  console.log('choices 2:', labels2.join(' | '));
  $('#skipGuessBtn').click();
  await until(() => !$('#stepReveal').hidden, 'reveal 2');
  console.log('result 2:', $('#resultBox').textContent);
  assert.ok($('#resultBox').textContent.includes('Great Salt Lake'));
  assert.ok($('#realBox').hidden, 'no real-river note away from the chosen place');
  assert.strictEqual($('#score').textContent, 'Score: 1 / 1', 'skipping does not score');

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
  assert.ok(about.includes('Flow model') && about.includes('Inland ending rule') && about.includes('v0.2.0') && about.includes('TopoBathy3D'));
  assert.ok(!/©|Copyright/i.test(about), 'no copyright line');
  $('#aboutClose').click();
  const sel = $('#placeSelect');
  sel.value = String([...sel.querySelectorAll('option')].findIndex(o => o.textContent.startsWith('Volga')) - 1);
  $('#placeGo').click();
  await wait(50);
  console.log('after Go, centre:', FE.toLonLat(win.__view.center.x, win.__view.center.y).map(v => v.toFixed(3)).join(','));
  assert.ok(Math.abs(win.__view.center.longitude - 32.674) < 0.01);
  assert.ok($('.credit-tag').textContent === 'Created by Jason Sawle');
  assert.strictEqual(errors.length, 0, 'page errors: ' + errors.join(' | '));
  win.close();

  // ---- 4. animated journey (no reduced motion): the camera moves, then skip
  ({ win, $, errors } = load(false));
  await until(() => win.__view, 'view b');
  await wait(50);
  $('#dropCentreBtn').click();
  await until(() => !$('#stepPredict').hidden, 'predict b');
  $('#skipGuessBtn').click();
  await until(() => !$('#stepJourney').hidden, 'journey');
  await wait(800);
  const vp = win.__viewpoints || 0;
  console.log('viewpoint updates during 0.8 s of journey:', vp, '| status:', $('#journeyStatus').textContent);
  assert.ok(vp > 5, 'camera follows the stick');
  $('#skipBtn').click();
  await until(() => !$('#stepReveal').hidden, 'reveal b');
  $('#replayBtn').click();
  await until(() => !$('#stepJourney').hidden, 'replay');
  $('#skipBtn').click();
  await until(() => !$('#stepReveal').hidden, 'reveal c');
  assert.strictEqual(errors.length, 0, 'page errors: ' + errors.join(' | '));
  console.log(`UI SMOKE TEST PASSED (${win.__tiles} elevation tiles)`);
  win.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
