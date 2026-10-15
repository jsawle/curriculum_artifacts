/* “I wonder where my stick goes,” said Pooh — app wiring (ArcGIS Maps SDK for JavaScript 4.34). */
(function () {
  'use strict';

  // ------------------------------------------------------------------ settings
  const APP_VERSION = '0.2.0';
  const APP_TITLE = '“I wonder where my stick goes,” said Pooh';
  const INTRO_HTML =
    '<p>In <cite>The House at Pooh Corner</cite> (1928), Pooh drops a fir-cone off a bridge and watches it float out ' +
    'the other side, and the game of Poohsticks begins. But where would the stick go after that?</p>' +
    '<p>Drop a stick in any stream in the world and follow the water downhill, all the way to where it ends.</p>';
  const TOPOBATHY_URL = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/TopoBathy3D/ImageServer';
  const BASEMAP_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer';
  const MAX_CACHED_TILES = 350;

  const FE = window.FlowEngine;
  const L = window.RiverLogic;
  const MV = L.MODEL_VERSIONS;
  const PLACES = window.PLACES_DATA;
  const marineRaw = window.SEAS_DATA;
  const SEA_INDEX = L.buildSeaIndex(marineRaw.filter(s => s.n !== 'Caspian Sea'));
  const RIVERISH = /\briver\b|^amazon$|^yangtze$/i;
  // What the water can reach: seas (and river-mouth estuaries), the Caspian and other lakes with no outlet, other lakes
  const FEATURES = FE.prepareFeatures([
    ...marineRaw.map(s => ({ name: s.n, kind: s.n === 'Caspian Sea' ? 'terminal' : (s.c === 'river' || RIVERISH.test(s.n)) ? 'river' : 'sea', polys: s.p })),
    ...window.LAKES_DATA.map(l => ({ name: l.n, kind: l.k, polys: l.p }))
  ]);
  const MODELS = [
    { name: 'Flow model', version: FE.VERSION.flow, what: 'Our own flow direction from Esri TopoBathy3D elevation. The stick steps to the lowest of the 8 squares around it; hollows, lakes and reservoirs are filled until they overflow. Squares are about 20 m across near the stick and grow to about 300 m on long rivers (bigger only to cross very large lakes).' },
    { name: 'Inland ending rule', version: FE.VERSION.inland, what: 'The water stops in a lake with no outlet (from Natural Earth), or when getting out would mean the water rising more than 15 m over more than 3,000 km² of dry land.' },
    { name: MV.sea.name, version: MV.sea.version, what: MV.sea.what },
    { name: MV.options.name, version: MV.options.version, what: MV.options.what }
  ];
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const $ = s => document.querySelector(s);
  const fmtKm = k => (k < 10 ? (Math.round(k * 10) / 10).toString() : nf0.format(k));
  const the = name => (/^(Lake|Lago|Lac|Ozero|Laguna) /.test(name) ? name : 'the ' + name);
  const kmBetween = (a, b) => Math.hypot((a[0] - b[0]) * 111.32 * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180), (a[1] - b[1]) * 110.57);
  const nearSeaKm = (lon, lat) => {
    let best = Infinity;
    for (const s of SEA_INDEX) { const d = L.distToSeaKm(s, lon, lat, Math.min(best, 60)); if (d < best) best = d; if (best === 0) break; }
    return best;
  };

  const STICK_SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" +
    "<path d='M8 40 56 24' stroke='#fff' stroke-width='12' stroke-linecap='round'/>" +
    "<path d='M34 32l9 9' stroke='#fff' stroke-width='7' stroke-linecap='round'/>" +
    "<path d='M8 40 56 24' stroke='#4a2f17' stroke-width='7' stroke-linecap='round'/>" +
    "<path d='M8 40 56 24' stroke='#a8733f' stroke-width='4' stroke-linecap='round'/>" +
    "<path d='M34 32l9 9' stroke='#7a5230' stroke-width='3' stroke-linecap='round'/>" +
    "<ellipse cx='45' cy='43' rx='5' ry='3' fill='#4f8a3a' stroke='#fff' stroke-width='1.5' transform='rotate(35 45 43)'/></svg>";
  const STICK_URL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(STICK_SVG);

  // -------------------------------------------------------------------- text
  document.title = APP_TITLE;
  $('#appTitle').textContent = APP_TITLE;
  $('#intro').innerHTML = INTRO_HTML;
  $('#foot').textContent = 'Version ' + APP_VERSION;
  {
    const sel = $('#placeSelect');
    const first = document.createElement('option'); first.value = ''; first.textContent = 'Choose a place…'; sel.appendChild(first);
    const groups = new Map();
    PLACES.forEach((p, i) => {
      if (!groups.has(p.group)) { const g = document.createElement('optgroup'); g.label = p.group; groups.set(p.group, g); sel.appendChild(g); }
      const o = document.createElement('option'); o.value = String(i); o.textContent = p.label; groups.get(p.group).appendChild(o);
    });
  }

  // -------------------------------------------------------------------- score
  const SCORE_KEY = 'poohSticks.score.v1';
  let score = { right: 0, played: 0 };
  try { const s = JSON.parse(localStorage.getItem(SCORE_KEY) || 'null'); if (s && typeof s.right === 'number') score = s; } catch (e) { /* storage unavailable */ }
  const showScore = () => { $('#score').textContent = 'Score: ' + score.right + ' / ' + score.played; };
  const saveScore = () => { try { localStorage.setItem(SCORE_KEY, JSON.stringify(score)); } catch (e) { /* ignore */ } showScore(); };
  showScore();

  // ------------------------------------------------------------- announcements
  let srTimer = null;
  function announce(msg) {
    const el = $('#sr');
    el.textContent = '';
    clearTimeout(srTimer);
    srTimer = setTimeout(() => { el.textContent = msg; }, 60);
  }

  // -------------------------------------------------------------- step switch
  const STEPS = ['Ready', 'Tracing', 'Predict', 'Journey', 'Reveal'];
  let state = 'Ready';
  function show(step, focusHeading) {
    state = step;
    STEPS.forEach(s => { $('#step' + s).hidden = s !== step; });
    if (focusHeading) { const h = $('#step' + step + ' h2'); if (h) h.focus({ preventScroll: false }); }
  }
  function readyMessage(msg) {
    const el = $('#readyMsg');
    if (msg) { el.textContent = msg; el.hidden = false; announce(msg); } else { el.hidden = true; el.textContent = ''; }
  }

  // ------------------------------------------------------------- About dialog
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  $('#aboutBody').innerHTML =
    `<p>Drop a virtual stick into any stream in the world. The app works out which way water would flow from that spot, downhill over the real shape of the land, and follows it until it reaches the sea or a lake it can never leave. You can guess where it will end up first.</p>` +
    `<h3>Versions</h3><table><thead><tr><th scope="col">Part</th><th scope="col">Version</th><th scope="col">What it does</th></tr></thead><tbody>` +
    `<tr><td>App</td><td>v${APP_VERSION}</td><td>The whole app.</td></tr>` +
    MODELS.map(m => `<tr><td>${esc(m.name)}</td><td>v${esc(m.version)}</td><td>${esc(m.what)}</td></tr>`).join('') + `</tbody></table>` +
    `<h3>Data</h3><table><thead><tr><th scope="col">What</th><th scope="col">Source</th></tr></thead><tbody>` +
    `<tr><td>Elevation (land and sea floor)</td><td>Esri World Elevation TopoBathy3D, with its data partners</td></tr>` +
    `<tr><td>Seas, oceans, lakes, and the real rivers in the start list</td><td>Made with Natural Earth (public domain)</td></tr>` +
    `<tr><td>Basemap</td><td>Esri World Topographic Map and its contributors</td></tr></tbody></table>` +
    `<h3>Good to know</h3><ul>` +
    `<li>This is a model. It follows the shape of the land only, so it knows nothing about dams, canals, pumps or water taken out for farms and cities. Very flat land and narrow gorges are the hardest places, and sometimes the model takes a different way from the real river. When you start from the list, the app tells you where the real river goes.</li>` +
    `<li>Distances follow the model's path. Real rivers wiggle more, so they are longer.</li>` +
    `<li>"Use my location" keeps your location on your device. The app only asks Esri for elevation and map tiles around that spot.</li>` +
    `<li>Keyboard: Tab to the map, use the arrow keys to move and + / &minus; to zoom, then press "Drop at the +".</li></ul>` +
    `<p>Created by Jason Sawle</p>`;
  const dlg = $('#aboutDlg');
  $('#aboutBtn').addEventListener('click', () => { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); $('#aboutClose').focus(); });
  $('#aboutClose').addEventListener('click', () => { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); $('#aboutBtn').focus(); });

  // ------------------------------------------------------------------- map
  require([
    'esri/config', 'esri/Map', 'esri/views/MapView', 'esri/Basemap', 'esri/layers/TileLayer', 'esri/layers/ElevationLayer',
    'esri/layers/GraphicsLayer', 'esri/Graphic', 'esri/geometry/Polyline', 'esri/geometry/Polygon', 'esri/geometry/Point',
    'esri/geometry/Extent', 'esri/Viewpoint'
  ], function (esriConfig, EsriMap, MapView, Basemap, TileLayer, ElevationLayer, GraphicsLayer, Graphic, Polyline, Polygon, Point, Extent, Viewpoint) {
    const SR = { wkid: 102100 };
    const topo = new TileLayer({ url: BASEMAP_URL });
    const map = new EsriMap({ basemap: new Basemap({ baseLayers: [topo], title: 'Topographic' }) });
    topo.load().catch(() => { map.basemap = 'topo-vector'; });

    // elevation tiles (the same service as the elevation profile tool's "world-topobathymetry" ground)
    const elevLayer = new ElevationLayer({ url: TOPOBATHY_URL });
    const elevReady = elevLayer.load();
    async function fetchElev(Lv, tx, ty, signal) {
      await elevReady;
      try {
        const d = await elevLayer.fetchTile(Lv, ty, tx, { noDataValue: -99999, signal });
        const out = new Float32Array(65536), w = d.width;
        for (let j = 0; j < 256; j++) {
          const row = j * w;
          for (let i = 0; i < 256; i++) { const v = d.values[row + i]; out[j * 256 + i] = (v === d.noDataValue || v <= -99998) ? NaN : v; }
        }
        return out;
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        console.warn('elevation tile', Lv, tx, ty, e);
        return null;
      }
    }
    let store = new FE.TileStore(fetchElev, FEATURES);

    const seaLayer = new GraphicsLayer({ title: 'Where it ended' });
    const routeLayer = new GraphicsLayer({ title: 'Route' });
    const stickLayer = new GraphicsLayer({ title: 'Stick' });
    map.addMany([seaLayer, routeLayer, stickLayer]);

    const view = new MapView({
      container: 'viewDiv', map, center: [0.097407, 51.084674], zoom: 14,
      constraints: { minZoom: 2, rotationEnabled: false, snapToZoom: false },
      popupEnabled: false
    });
    view.ui.components = ['zoom', 'attribution'];
    view.ui.move('zoom', 'top-right');

    const casingG = new Graphic({ symbol: { type: 'simple-line', color: [255, 255, 255, 0.95], width: 7, cap: 'round', join: 'round' } });
    const routeG = new Graphic({ symbol: { type: 'simple-line', color: [13, 74, 122, 1], width: 3.5, cap: 'round', join: 'round' } });
    const stickG = new Graphic({ symbol: { type: 'picture-marker', url: STICK_URL, width: 42, height: 42, angle: 0 } });
    const startG = new Graphic({ symbol: { type: 'simple-marker', style: 'circle', size: 12, color: [242, 183, 5, 1], outline: { color: [30, 42, 34, 1], width: 2 } } });
    const rippleG = new Graphic({ symbol: { type: 'simple-marker', style: 'circle', size: 10, color: [0, 0, 0, 0], outline: { color: [27, 106, 165, 1], width: 2 } } });

    let current = null;            // the game in progress
    let abortCtl = null;
    let chosenPlace = PLACES[0];   // set when a place from the list is used (the map opens on Poohsticks Bridge)
    let rafId = null, skipAnim = false;

    function clearMap() {
      if (rafId) cancelAnimationFrame(rafId);
      seaLayer.removeAll(); routeLayer.removeAll(); stickLayer.removeAll();
      casingG.geometry = null; routeG.geometry = null;
    }
    const pt = (x, y) => new Point({ x, y, spatialReference: SR });

    // ------------------------------------------------------------- dropping
    view.on('click', e => { if (state === 'Ready' || state === 'Reveal') dropAt(e.mapPoint); });
    $('#dropCentreBtn').addEventListener('click', () => dropAt(view.center));
    $('#cancelBtn').addEventListener('click', () => {
      if (abortCtl) abortCtl.abort();
      clearMap(); show('Ready', true); readyMessage('Cancelled. Drop your stick somewhere else whenever you like.');
    });
    $('#locateBtn').addEventListener('click', () => {
      if (!navigator.geolocation) { readyMessage('Sorry, this device can\'t share its location. Find your spot on the map instead.'); return; }
      readyMessage('Finding where you are…');
      navigator.geolocation.getCurrentPosition(pos => {
        readyMessage('');
        const p = new Point({ longitude: pos.coords.longitude, latitude: pos.coords.latitude });
        view.goTo({ target: p, zoom: 15 }, { animate: !reduceMotion }).catch(() => {}).then(() => dropAt(view.center));
      }, () => readyMessage('We couldn\'t get your location. You can still find your spot on the map and click on the stream.'), { enableHighAccuracy: true, timeout: 15000 });
    });

    function splash(p) {
      if (reduceMotion) return;
      rippleG.geometry = p;
      stickLayer.add(rippleG);
      const t0 = performance.now();
      const step = now => {
        const f = Math.min(1, (now - t0) / 700);
        rippleG.symbol = { type: 'simple-marker', style: 'circle', size: 10 + 50 * f, color: [0, 0, 0, 0], outline: { color: [27, 106, 165, 1 - f], width: 2 } };
        stickG.symbol = { type: 'picture-marker', url: STICK_URL, width: 64 - 22 * f, height: 64 - 22 * f, angle: 0 };
        if (f < 1) requestAnimationFrame(step); else { stickLayer.remove(rippleG); stickG.symbol = { type: 'picture-marker', url: STICK_URL, width: 42, height: 42, angle: 0 }; }
      };
      requestAnimationFrame(step);
    }

    function inTheSea(lon, lat) {
      for (const s of SEA_INDEX) if (!s.isRiver && L.distToSeaKm(s, lon, lat, 0.5) === 0) return true;
      return false;
    }

    async function dropAt(mapPoint) {
      if (!mapPoint) return;
      const lon = mapPoint.longitude, lat = mapPoint.latitude;
      const m = FE.toMerc(lon, lat);
      readyMessage('');
      if (inTheSea(lon, lat)) {
        show('Ready', false);
        readyMessage('That spot is already the sea! Drop your stick on land, in a river or stream.');
        return;
      }
      if (chosenPlace && kmBetween([lon, lat], [chosenPlace.lon, chosenPlace.lat]) > 25) chosenPlace = null;
      clearMap();
      if (abortCtl) abortCtl.abort();
      abortCtl = new AbortController();
      const signal = abortCtl.signal;
      if (store.tiles.size > MAX_CACHED_TILES) store = new FE.TileStore(fetchElev, FEATURES);
      const dropPt = pt(m[0], m[1]);
      stickG.geometry = dropPt; startG.geometry = dropPt.clone();
      stickLayer.addMany([startG, stickG]);
      splash(dropPt);
      show('Tracing', true);
      $('#traceStatus').textContent = 'Reading the land…';
      announce('Splash! Your stick is in the water. Working out where the water flows.');
      let lastSaid = Date.now();
      try {
        const route = await FE.trace(store, m, nearSeaKm, {}, p => {
          $('#traceStatus').textContent = 'The water has flowed about ' + fmtKm(p.km) + ' km so far…';
          if (Date.now() - lastSaid > 8000) { lastSaid = Date.now(); announce('About ' + nf0.format(p.km) + ' kilometres so far.'); }
        }, signal);
        if (route.coords.length < 3 || route.km < 0.05) {
          clearMap(); show('Ready', true);
          readyMessage(route.end.type === 'lost' ? 'We couldn\'t read the land at that spot. Try somewhere else.' : 'The water doesn\'t go anywhere from that spot. Try clicking right on a stream.');
          return;
        }
        const endLL = FE.toLonLat(route.end.x, route.end.y);
        let ending;
        if (route.end.type === 'sea') {
          const s = L.findSea(SEA_INDEX, endLL[0], endLL[1], { coastKm: 150 });
          ending = s.inland ? { kind: 'sea', sea: null, name: 'the sea' } : { kind: 'sea', sea: s.sea, name: s.sea.name };
        } else if (route.end.type === 'terminal') ending = { kind: 'terminal', name: route.end.feature.name };
        else if (route.end.type === 'inland') ending = { kind: 'inland', name: null };
        else ending = { kind: 'lost', reason: route.end.reason };

        current = { route, ending, drop: [lon, lat], place: chosenPlace, endLL };
        if (ending.kind === 'lost' || (ending.kind === 'sea' && !ending.sea)) { startJourney(); return; }
        current.options = L.pickOptions(SEA_INDEX, ending.kind === 'sea' ? ending.sea : null, lon, lat);
        renderChoices(current.options);
        show('Predict', true);
        announce('We know where the water goes. Make your guess: four choices.');
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.error(err);
        clearMap(); show('Ready', true);
        readyMessage('Sorry, we couldn\'t load the elevation data just now. Check your internet connection and try again.');
      }
    }

    // ------------------------------------------------------------- predict
    function renderChoices(options) {
      const box = $('#choices');
      box.replaceChildren();
      options.forEach((o, i) => {
        const lab = document.createElement('label');
        lab.className = 'choice';
        const inp = document.createElement('input');
        inp.type = 'radio'; inp.name = 'choice'; inp.value = String(i);
        inp.addEventListener('change', () => { $('#lockBtn').disabled = false; });
        const span = document.createElement('span');
        span.textContent = o.label;
        lab.append(inp, span);
        box.appendChild(lab);
      });
      $('#lockBtn').disabled = true;
    }
    $('#predictForm').addEventListener('submit', e => {
      e.preventDefault();
      const sel = document.querySelector('input[name="choice"]:checked');
      if (!sel || !current) return;
      current.choice = current.options[Number(sel.value)];
      score.played += 1;
      if (current.choice.correct) score.right += 1;
      saveScore();
      startJourney();
    });
    $('#skipGuessBtn').addEventListener('click', () => { if (current) { current.choice = null; startJourney(); } });

    // ------------------------------------------------------------- journey
    function startJourney() {
      const r = current.route;
      const coords = FE.simplify(r.coords, 12);
      const cum = [0];
      for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]));
      const total = cum[cum.length - 1];
      current.coords = coords;
      skipAnim = false;
      show('Journey', true);
      announce('Off it goes! Your stick is floating downstream.');
      routeLayer.removeAll(); seaLayer.removeAll();
      routeLayer.addMany([casingG, routeG]);
      if (!stickLayer.graphics.includes(stickG)) stickLayer.add(stickG);

      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      coords.forEach(c => { if (c[0] < x0) x0 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[0] > x1) x1 = c[0]; if (c[1] > y1) y1 = c[1]; });
      const pad = Math.max(1500, (x1 - x0) * 0.12, (y1 - y0) * 0.12);
      const ext = new Extent({ xmin: x0 - pad, ymin: y0 - pad, xmax: x1 + pad, ymax: y1 + pad, spatialReference: SR });
      current.extent = ext;
      const vw = Math.max(200, view.width - (view.width > 700 ? 400 : 0)), vh = Math.max(200, view.height * (view.width > 700 ? 1 : 0.5));
      const PX = 96 / 0.0254;                                   // scale = metres per pixel × this
      const sFit = Math.max((ext.xmax - ext.xmin) / vw, (ext.ymax - ext.ymin) / vh) * PX;
      const s0 = Math.min(view.scale, Math.max(20000, sFit / 50));
      const fitCentre = [(ext.xmin + ext.xmax) / 2, (ext.ymin + ext.ymax) / 2];

      const at = d => {
        let lo = 0, hi = cum.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid - 1; }
        const i = lo;
        let p = coords[i], dir = [1, 0];
        if (i < coords.length - 1 && cum[i + 1] > cum[i]) {
          const f = (d - cum[i]) / (cum[i + 1] - cum[i]);
          p = [coords[i][0] + f * (coords[i + 1][0] - coords[i][0]), coords[i][1] + f * (coords[i + 1][1] - coords[i][1])];
          dir = [coords[i + 1][0] - coords[i][0], coords[i + 1][1] - coords[i][1]];
        }
        return { i, p, dir };
      };
      const draw = (d, wobble) => {
        const a = at(d);
        const part = coords.slice(0, a.i + 1); part.push(a.p);
        const line = new Polyline({ paths: [part], spatialReference: SR });
        casingG.geometry = line; routeG.geometry = line;
        stickG.geometry = pt(a.p[0], a.p[1]);
        const ang = -Math.atan2(a.dir[1], a.dir[0]) * 180 / Math.PI + 18 + (wobble || 0);
        stickG.symbol = { type: 'picture-marker', url: STICK_URL, width: 42, height: 42, angle: ang };
        return a.p;
      };
      const finish = () => { draw(total, 0); reveal(); };
      if (reduceMotion || total === 0) { view.goTo(ext, { animate: false }).catch(() => {}); finish(); return; }

      const km = r.km;
      const dur = Math.min(16000, Math.max(5000, 4000 + 2200 * Math.log2(1 + km / 3)));
      const d0 = 250, a = Math.log(1 + total / d0);
      const pxM = s0 / PX;                                       // metres per pixel at the start
      const t0 = performance.now();
      let last = 0;
      const frame = now => {
        if (skipAnim) { view.goTo(ext, { animate: false }).catch(() => {}); return finish(); }
        const u = Math.min(1, (now - t0) / dur);
        const d = u >= 1 ? total : d0 * (Math.exp(a * u) - 1);
        if (now - last > 33 || u === 1) {
          last = now;
          const p = draw(d, Math.sin(now / 180) * 8);
          // zoom out as the stick travels, keeping it on screen, then settle on the whole route
          const s = Math.min(sFit, Math.max(s0, s0 * (1 + d / (pxM * 260))));
          const t = Math.max(0, Math.min(1, (s / sFit - 0.55) / 0.45));
          const c = [p[0] + (fitCentre[0] - p[0]) * t, p[1] + (fitCentre[1] - p[1]) * t];
          view.viewpoint = new Viewpoint({ targetGeometry: pt(c[0], c[1]), scale: s });
          const kmNow = km * (d / total);
          $('#journeyStatus').textContent = 'Floating downstream… about ' + fmtKm(kmNow) + ' km so far';
        }
        if (u < 1) rafId = requestAnimationFrame(frame);
        else { view.goTo(ext, { animate: true, duration: 800 }).catch(() => {}); finish(); }
      };
      view.goTo({ target: pt(coords[0][0], coords[0][1]), scale: s0 }, { animate: false }).catch(() => {}).then(() => { rafId = requestAnimationFrame(frame); });
    }
    $('#skipBtn').addEventListener('click', () => { skipAnim = true; });

    // ------------------------------------------------------------- reveal
    function ringsOf(sea) {
      const rings = [];
      sea.polys.forEach(poly => poly.forEach(flat => {
        const ring = [];
        for (let i = 0; i < flat.length; i += 2) ring.push([flat[i], flat[i + 1]]);
        rings.push(ring);
      }));
      return rings;
    }
    function reveal() {
      if (rafId) cancelAnimationFrame(rafId);
      const c = current, r = c.route, e = c.ending;
      const endPt = pt(r.end.x, r.end.y);
      if (e.kind === 'sea' && e.sea) {
        seaLayer.add(new Graphic({
          geometry: new Polygon({ rings: ringsOf(e.sea), spatialReference: { wkid: 4326 } }),
          symbol: { type: 'simple-fill', color: [27, 106, 165, 0.16], outline: { color: [13, 74, 122, 0.9], width: 1.5 } }
        }));
      }
      const label = e.kind === 'sea' ? e.name : e.kind === 'terminal' ? e.name : e.kind === 'inland' ? 'Water ends here' : 'We lost the stick here';
      if (c.endLabel) stickLayer.remove(c.endLabel);
      c.endLabel = new Graphic({
        geometry: endPt,
        symbol: { type: 'text', text: label, color: [30, 42, 34, 1], haloColor: [255, 255, 255, 1], haloSize: 2, yoffset: -28, font: { size: 13, weight: 'bold', family: 'sans-serif' } }
      });
      stickLayer.add(c.endLabel);

      const guessed = !!c.choice, right = guessed && c.choice.correct;
      const box = $('#resultBox');
      box.className = 'result' + (guessed ? (right ? ' ok' : ' no') : '');
      $('#revealTitle').textContent = !guessed ? 'Here\'s where it went' : right ? '✓ You got it!' : '✗ Not this time';
      const p1 = document.createElement('p');
      const km = r.km;
      if (e.kind === 'sea') {
        p1.append('Your stick floated about ' + fmtKm(km) + ' km and reached the ');
        const b = document.createElement('strong'); b.textContent = e.name; p1.append(b, '.');
      } else if (e.kind === 'terminal') {
        p1.append('Your stick floated about ' + fmtKm(km) + ' km and ended in ' + (the(e.name) === e.name ? '' : 'the '));
        const b = document.createElement('strong'); b.textContent = e.name; p1.append(b, ', a lake with no way out to the sea. The water just dries up in the sun.');
      } else if (e.kind === 'inland') {
        p1.textContent = 'Your stick floated about ' + fmtKm(km) + ' km and never reached the sea. The water collects in a low inland basin, where it soaks away or dries up.';
      } else {
        p1.textContent = 'We lost track of the stick after about ' + fmtKm(km) + ' km (' + (e.reason || 'the trail went cold') + '). Try another spot.';
      }
      const parts = [p1];
      if (guessed) { const p2 = document.createElement('p'); p2.textContent = 'You guessed: ' + c.choice.label + '.'; parts.push(p2); }
      $('#resultText').replaceChildren(...parts);

      // compare with the real river, when the stick started from the list
      const rb = $('#realBox');
      if (c.place && c.place.real) {
        const real = c.place.real;
        const realName = real.name || 'an inland basin';
        const realText = real.name ? the(realName) : realName;
        const modelName = e.kind === 'sea' ? e.name : e.kind === 'terminal' ? e.name : null;
        const same = (real.type === 'sea' && e.kind === 'sea' && e.name === real.name) || (real.type === 'inland' && (e.kind === 'terminal' || e.kind === 'inland') && (!real.name || real.name === modelName || e.kind === 'inland'));
        const via = real.via ? ', by way of ' + real.via : '';
        rb.textContent = same
          ? 'In real life, water from ' + c.place.label + ' also ends up in ' + realText + via + '.'
          : 'In real life, water from ' + c.place.label + ' ends up in ' + realText + via + '. Our model only follows the shape of the land, and here it took a different way.';
        rb.hidden = false;
      } else rb.hidden = true;

      const startZ = r.stats.startZ;
      const lat0 = c.drop[1];
      const sizes = (r.stats.levels || []).map(Lv => FE.res(Lv) * Math.cos(lat0 * Math.PI / 180));
      const facts = [['Distance floated', 'about ' + fmtKm(km) + ' km (' + fmtKm(km * 0.621371) + ' miles)']];
      if (isFinite(startZ)) facts.push(['Starting height', nf0.format(startZ) + ' m (' + nf0.format(startZ * 3.28084) + ' ft) above sea level']);
      if (km > 1) facts.push(['At walking pace', 'floating non-stop at 5 km/h, the trip would take about ' + (km / 5 < 48 ? nf0.format(km / 5) + ' hours' : nf0.format(km / 120) + ' days')]);
      if (sizes.length) facts.push(['Map squares used', 'about ' + nf0.format(Math.min(...sizes)) + ' m to ' + nf0.format(Math.max(...sizes)) + ' m across']);
      const dl = $('#facts');
      dl.replaceChildren();
      facts.forEach(([k, v]) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); });

      const hl = $('#howList');
      hl.replaceChildren();
      const items = [
        [MODELS[0], 'From the drop, the water stepped downhill square by square, filling ' + (r.stats.stretches > 1 ? 'hollows and lakes' : 'any hollows') + ' until they overflowed.'],
        [MODELS[1], e.kind === 'terminal' ? 'The water reached ' + e.name + ', which has no outlet.' : e.kind === 'inland' ? 'Getting out would have flooded a large area of dry land, so this counts as an inland basin.' : 'Not needed this time: the water found a way out.'],
        [MODELS[2], e.kind === 'sea' ? 'The end point was matched to the nearest named sea or ocean.' : 'No sea was reached.'],
        [MODELS[3], 'The choices were the seas nearest to your stick, plus "never reaches the sea".']
      ];
      items.forEach(([m, txt]) => {
        const li = document.createElement('li');
        const b = document.createElement('strong'); b.textContent = m.name;
        const v = document.createElement('span'); v.className = 'ver'; v.textContent = 'v' + m.version;
        li.append(b, ' ', v, ': ', txt);
        hl.appendChild(li);
      });
      const src = document.createElement('li');
      src.textContent = 'Data: Esri World Elevation TopoBathy3D; seas, lakes and rivers made with Natural Earth.';
      hl.appendChild(src);

      show('Reveal', true);
      announce((guessed ? (right ? 'You got it! ' : 'Not this time. ') : '') + p1.textContent);
    }

    $('#againBtn').addEventListener('click', () => { clearMap(); current = null; readyMessage(''); show('Ready', true); });
    $('#replayBtn').addEventListener('click', () => { if (current) startJourney(); });
    $('#toStartBtn').addEventListener('click', () => {
      if (current) { const m = FE.toMerc(current.drop[0], current.drop[1]); view.goTo({ target: pt(m[0], m[1]), zoom: 14 }).catch(() => {}); }
    });
    $('#toEndBtn').addEventListener('click', () => { if (current) view.goTo({ target: pt(current.route.end.x, current.route.end.y), zoom: 9 }).catch(() => {}); });

    // ------------------------------------------------------------- places
    $('#placeGo').addEventListener('click', () => {
      const v = $('#placeSelect').value;
      if (v === '') { readyMessage('Choose a place from the list first.'); return; }
      const p = PLACES[Number(v)];
      chosenPlace = p;
      readyMessage('');
      view.goTo({ center: [p.lon, p.lat], zoom: p.zoom }, { animate: !reduceMotion }).catch(() => {});
      announce('Map moved to ' + p.label + '. Click on the river, or press Drop at the +.');
    });

    view.when(() => { show('Ready', false); }).catch(err => {
      console.error(err);
      readyMessage('The map could not load. Please refresh the page.');
    });
  });
})();
