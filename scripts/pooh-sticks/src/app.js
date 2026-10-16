/* “I wonder where my stick goes,” said Pooh — app wiring (ArcGIS Maps SDK for JavaScript 4.34). */
(function () {
  'use strict';

  // ------------------------------------------------------------------ settings
  const APP_VERSION = '0.6.9';
  const APP_TITLE = '“I wonder where my stick goes,” said Pooh';
  const INTRO_HTML =
    '<p>In <cite>The House at Pooh Corner</cite> (1928), Pooh drops a fir-cone off a bridge and watches it float out ' +
    'the other side, and the game of Poohsticks begins. But where would the stick go after that?</p>' +
    '<p>Drop a stick in any stream in the world and follow the water downhill, all the way to where it ends.</p>';
  const TOPOBATHY_URL = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/TopoBathy3D/ImageServer';
  const BASEMAP_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer';
  // Lab page only (built with --lab): try Esri's ready-to-use Trace Downstream service, with an API key the tester pastes in
  const LAB = !!window.POOH_LAB;
  const LAB_VERSION = '0.9';
  const TRACE_URL = 'https://hydro.arcgis.com/arcgis/rest/services/Tools/Hydrology/GPServer/TraceDownstream';

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
    { name: 'Flow model', version: FE.VERSION.flow, what: 'Our own flow direction from Esri TopoBathy3D elevation. The stick steps to the lowest of the 8 squares around it; hollows, lakes and reservoirs are filled until they overflow. Squares are about 20 m across near the stick and grow to about 300 m on long rivers (bigger only to cross very large lakes). v1.1: every stick starts with fresh map squares, and a square that fails to download is tried again instead of being treated as a hole.' },
    { name: 'Inland ending rule', version: FE.VERSION.inland, what: 'The water stops in a lake with no outlet (from Natural Earth), or when getting out would mean the water rising more than 15 m over more than 3,000 km² of dry land.' },
    { name: MV.sea.name, version: MV.sea.version, what: MV.sea.what },
    { name: MV.options.name, version: MV.options.version, what: MV.options.what }
  ];
  if (LAB) MODELS.push({ name: 'Esri Trace Downstream (lab)', version: LAB_VERSION, what: 'Esri\'s ready-to-use Trace Downstream service (hydro.arcgis.com) traces the water to the sea on hydrologically corrected elevation: USGS 10 m and 30 m data in the US, 90 m data from WWF elsewhere. It needs an ArcGIS access token; if it can\'t be used, the stick falls back to our flow model. v0.3 builds the route as one path from the drop to the furthest point downstream, however the line comes back (mouth-first, in pieces, or with stretches repeated).' });
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const $ = s => document.querySelector(s);
  const fmtKm = k => (k < 10 ? (Math.round(k * 10) / 10).toString() : nf0.format(k < 100 ? k : k < 1000 ? Math.round(k / 10) * 10 : Math.round(k / 100) * 100));
  const the = name => (/^(Lake|Lago|Lac|Ozero|Laguna) /.test(name) ? name : 'the ' + name);
  const kmBetween = (a, b) => Math.hypot((a[0] - b[0]) * 111.32 * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180), (a[1] - b[1]) * 110.57);
  const nearSeaKm = (lon, lat) => {
    let best = Infinity;
    for (const s of SEA_INDEX) { const d = L.distToSeaKm(s, lon, lat, Math.min(best, 60)); if (d < best) best = d; if (best === 0) break; }
    return best;
  };

  // a twig with two little leaves (drawn for this app); the white edge keeps it visible on any map
  const STICK_SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'> <g fill='none' stroke-linecap='round' stroke-linejoin='round'> <path d='M5 49C15 45 24 41 31 37S45 29 55 23' stroke='#fff' stroke-width='11'/> <path d='M31 37C34 42 37 46 40 49' stroke='#fff' stroke-width='8'/> <path d='M43 31C44 26 45 22 47 19' stroke='#fff' stroke-width='7.5'/> <path d='M5 49C15 45 24 41 31 37S45 29 55 23' stroke='#3b2412' stroke-width='7.5'/> <path d='M31 37C34 42 37 46 40 49' stroke='#3b2412' stroke-width='5'/> <path d='M43 31C44 26 45 22 47 19' stroke='#3b2412' stroke-width='4.5'/> <path d='M5 49C15 45 24 41 31 37S45 29 55 23' stroke='#a8713c' stroke-width='4.6'/> <path d='M31 37C34 42 37 46 40 49' stroke='#a8713c' stroke-width='2.4'/> <path d='M43 31C44 26 45 22 47 19' stroke='#a8713c' stroke-width='2'/> <path d='M8 46.6C16 43.4 23 40.4 29.5 36' stroke='#dcaa70' stroke-width='1.2'/> <path d='M36 33.2C42 30.2 47 27.4 52 24.6' stroke='#dcaa70' stroke-width='1'/> </g> <ellipse cx='20' cy='43.4' rx='1.7' ry='1.1' fill='#5a3518' transform='rotate(-22 20 43.4)'/> <ellipse cx='40' cy='33.6' rx='1.3' ry='.9' fill='#5a3518' transform='rotate(-25 40 33.6)'/> <path d='M47 19C43 10 50 1.5 62 1.5C63 11 57 19 47 19Z' fill='#fff' stroke='#fff' stroke-width='4.5' stroke-linejoin='round'/> <path d='M47 19C43 10 50 1.5 62 1.5C63 11 57 19 47 19Z' fill='#6cc04a' stroke='#2f6d1f' stroke-width='1.5' stroke-linejoin='round'/> <path d='M48.5 17.5C52.5 12.5 56.5 7.5 61 2.6' fill='none' stroke='#2f6d1f' stroke-width='1.1' stroke-linecap='round'/> <path d='M52.6 12.4l4 .6M51 14.4l-.6-4M55.6 8.6l3.4.4' fill='none' stroke='#2f6d1f' stroke-width='.8' stroke-linecap='round'/> <path d='M40 49C35 54 38 62 46 63C48 56 46 51 40 49Z' fill='#fff' stroke='#fff' stroke-width='4.5' stroke-linejoin='round'/> <path d='M40 49C35 54 38 62 46 63C48 56 46 51 40 49Z' fill='#8fd16a' stroke='#2f6d1f' stroke-width='1.4' stroke-linejoin='round'/> <path d='M40.8 50.4C42.4 54.4 44.2 58.4 45.6 62' fill='none' stroke='#2f6d1f' stroke-width='.9' stroke-linecap='round'/> </svg>";
  const STICK_URL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(STICK_SVG);
  const STICK_PX = 56;
  const STICK_AXIS = 27.5;   // the twig is drawn pointing up and to the right at this angle
  $('#titleTwig').src = STICK_URL;
  $('#tipTwig').src = STICK_URL;

  // the mouse pointer becomes the twig over the map; its tip (bottom left, like a pencil) is the spot that gets clicked
  const CURSOR_PX = 48, CURSOR_HOT = [4, 37];
  (function makeStickCursor() {
    const svg = STICK_SVG.replace('<svg ', "<svg width='" + CURSOR_PX + "' height='" + CURSOR_PX + "' ");
    const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    const set = url => document.documentElement.style.setProperty('--stick-cursor', 'url("' + url + '") ' + CURSOR_HOT.join(' ') + ', pointer');
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = CURSOR_PX;
        c.getContext('2d').drawImage(img, 0, 0, CURSOR_PX, CURSOR_PX);
        set(c.toDataURL('image/png'));   // PNG cursors work in every browser
      } catch (e) { set(src); }
    };
    img.onerror = () => set(src);
    img.src = src;
  })();

  // "Drop me in a stream!" beside the twig for 10 seconds at the start of each turn
  const TIP_MS = 10000;
  const tip = $('#dropTip');
  const canHover = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  let tipArmed = false, tipUntil = 0, tipTimer = null;
  function endTip() { tipArmed = false; tipUntil = 0; clearTimeout(tipTimer); tip.hidden = true; }
  function startTipClock() { tipUntil = Date.now() + TIP_MS; clearTimeout(tipTimer); tipTimer = setTimeout(endTip, TIP_MS); }
  function placeTip(x, y) {
    const w = tip.offsetWidth, h = tip.offsetHeight;
    // beside the leaf at the top right of the twig cursor, as if the twig is talking
    let left = x + 50, top = y - 36 - h / 2;
    const flip = left + w > window.innerWidth - 8;
    if (flip) left = x - w - 14;
    tip.classList.toggle('flip', flip);
    if (top < 8) top = y + 20;
    tip.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
  }
  function armTip() {
    endTip(); tipArmed = true; tip.classList.toggle('static', !canHover);
    if (!canHover) {   // touch screens have no pointer to follow: show it over the middle of the map
      const r = $('#viewDiv').getBoundingClientRect();
      const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')) || r.top;
      tip.hidden = false;
      const x = r.left + r.width / 2 - tip.offsetWidth / 2, y = top + (r.bottom - top) / 2 - tip.offsetHeight / 2;
      tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
      startTipClock();
    }
  }
  $('#viewDiv').addEventListener('pointermove', e => {
    if (!tipArmed || e.pointerType === 'touch' || !canHover) return;
    if (!tipUntil) startTipClock();
    tip.hidden = false; placeTip(e.clientX, e.clientY);
  }, true);
  $('#viewDiv').addEventListener('pointerleave', () => { if (canHover) tip.hidden = true; });
  $('#viewDiv').addEventListener('pointerdown', () => { if (!canHover) endTip(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') endTip(); });

  // ---- lab: a honey pot with bees at the left of the title bar. The bees fly for 5 s when the page opens
  // and 4 s after each right answer, then land on the pot and stay still (moving content stops within 5 s).
  // With reduced motion they just sit on the pot. Decorative only (hidden from screen readers).
  const honey = (function () {
    const svg = $('#honeyScene');
    if (!LAB || !svg) return { buzz() {} };
    svg.removeAttribute('hidden');   // an <svg> has no .hidden property, so use the attribute
    const bees = [...svg.querySelectorAll('.bee')];
    const rest = [[37, 21, 1], [66, 19, -1], [77, 75, -1]];          // where they land (clear of the label): x, y, facing
    const fly = [                                                    // looping paths around and beside the pot
      { cx: 70, cy: 44, ax: 52, ay: 26, w: 1.0, p: 0.0, q: 1.1 },      // slow, lazy loops
      { cx: 92, cy: 40, ax: 72, ay: 22, w: 0.8, p: 2.1, q: 0.3 },
      { cx: 80, cy: 50, ax: 60, ay: 30, w: 1.2, p: 4.2, q: 2.0 }
    ];
    const place = (b, x, y, face, tilt) => b.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') scale(' + (face * 0.95) + ' 0.95) rotate(' + (tilt || 0).toFixed(1) + ')');
    bees.forEach((b, i) => place(b, rest[i][0], rest[i][1], rest[i][2]));
    let raf = 0, until = 0, t0 = 0;
    function frame(now) {
      const t = (now - t0) / 1000, left = (until - now) / 1000;
      const settle = Math.max(0, Math.min(1, 1 - left / 0.7));       // glide in to land over the last 0.7 s
      bees.forEach((b, i) => {
        const f = fly[i];
        const x = f.cx + f.ax * Math.sin(f.w * t + f.p), y = f.cy + f.ay * Math.sin(2 * f.w * t + f.q) + 1.5 * Math.sin(t * 12 + i);
        const dx = f.ax * f.w * Math.cos(f.w * t + f.p);
        const e = settle * settle * (3 - 2 * settle);
        place(b, x + (rest[i][0] - x) * e, y + (rest[i][1] - y) * e, e > 0.5 ? rest[i][2] : (dx >= 0 ? 1 : -1), (1 - e) * 8 * Math.sin(t * 3 + i));
      });
      if (now < until) raf = requestAnimationFrame(frame);
      else { svg.classList.remove('flying'); bees.forEach((b, i) => place(b, rest[i][0], rest[i][1], rest[i][2])); raf = 0; }
    }
    function buzz(ms) {
      if (reduceMotion) return;
      const now = performance.now();
      if (!raf) t0 = now;
      until = now + ms;
      svg.classList.add('flying');
      if (!raf) raf = requestAnimationFrame(frame);
    }
    buzz(5000);
    window.__honey = { flying: () => svg.classList.contains('flying') };
    return { buzz };
  })();
  // the twig in the title bobs once when the page opens; it bobs again with the bees after a right answer
  function bobTwig() {
    const tw = $('#titleTwig');
    tw.classList.remove('bob-again'); void tw.offsetWidth; tw.classList.add('bob-again');
  }

  // the centred title needs equal space on both sides, as wide as the score and About buttons
  function sizeBar() {
    const w = Math.ceil($('.bar-actions').getBoundingClientRect().width);
    if (w) document.documentElement.style.setProperty('--side', w + 'px');
  }
  window.addEventListener('resize', sizeBar);
  if (window.ResizeObserver) new ResizeObserver(sizeBar).observe($('.bar-actions'));

  // -------------------------------------------------------------------- text
  document.title = APP_TITLE + (LAB ? ' (lab)' : '');
  $('#appTitle').textContent = APP_TITLE;
  $('#intro').innerHTML = INTRO_HTML;
  $('#foot').textContent = 'Version ' + APP_VERSION + (LAB ? ', lab ' + LAB_VERSION : '');
  if (LAB) $('#appTag').textContent = 'Lab version: testing Esri Trace Downstream';
  // the famous places list appears at the start and again when a turn ends
  ['#placeSelect', '#placeSelect2'].forEach(id => {
    const sel = $(id);
    const first = document.createElement('option'); first.value = ''; first.textContent = 'Choose a place…'; sel.appendChild(first);
    const groups = new Map();
    PLACES.forEach((p, i) => {
      if (!groups.has(p.group)) { const g = document.createElement('optgroup'); g.label = p.group; groups.set(p.group, g); sel.appendChild(g); }
      const o = document.createElement('option'); o.value = String(i); o.textContent = p.label; groups.get(p.group).appendChild(o);
    });
  });

  // -------------------------------------------------------------------- score
  // the score starts at 0 every time the app opens or is refreshed; nothing is saved
  let score = { right: 0, played: 0 };
  try { localStorage.removeItem('poohSticks.score.v1'); } catch (e) { /* tidy away the score older versions saved */ }
  const POINTS = 100;   // for each right guess
  const showScore = () => { $('#score').textContent = 'Score: ' + nf0.format(score.right * POINTS) + ' points'; $('#score').title = score.right + ' right out of ' + score.played; };
  showScore();
  sizeBar();

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
    document.body.classList.toggle('can-drop', step === 'Ready' || step === 'Reveal');
    if (step === 'Ready') armTip(); else endTip();
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
    `<tr><td>App</td><td>v${APP_VERSION}${LAB ? ' (lab ' + LAB_VERSION + ')' : ''}</td><td>The whole app.</td></tr>` +
    MODELS.map(m => `<tr><td>${esc(m.name)}</td><td>v${esc(m.version)}</td><td>${esc(m.what)}</td></tr>`).join('') + `</tbody></table>` +
    `<h3>Data</h3><table><thead><tr><th scope="col">What</th><th scope="col">Source</th></tr></thead><tbody>` +
    `<tr><td>Elevation (land and sea floor)</td><td>Esri World Elevation TopoBathy3D, with its data partners</td></tr>` +
    `<tr><td>Seas, oceans, lakes, and the real rivers in the start list</td><td>Made with Natural Earth (public domain)</td></tr>` +
    `<tr><td>Basemap</td><td>Esri World Topographic Map and its contributors</td></tr></tbody></table>` +
    `<h3>Good to know</h3><ul>` +
    `<li>This is a model. It follows the shape of the land only, so it knows nothing about dams, canals, pumps or water taken out for farms and cities. Very flat land and narrow gorges are the hardest places, and sometimes the model takes a different way from the real river. When you start from the list, the app tells you where the real river goes.</li>` +
    `<li>Your stick may not follow every bend of the blue stream on the map. It is steered by an elevation model: a grid of squares, each with a height, that tells the stick which way is downhill. Most squares are about 10 to 300 metres across (bigger over wide lakes and very flat land), and a little stream can be narrower than one square. The blue lines on the map and the heights were also made separately, so they don't always line up. Think of the stick's path as the way the land leads the water: usually right about the big journey, a bit rough on the small wiggles. After each journey, "Map squares used" shows how big the squares were for your stick.</li>` +
    `<li>Distances follow the model's path. Real rivers wiggle more, so they are longer.</li>` +
    `<li>Each right guess scores 100 points. The score starts at 0 each time the app opens.</li>` +
    `<li>"Use my location" keeps your location on your device. The app only asks Esri for elevation and map tiles around that spot.</li>` +
    `<li>Keyboard: Tab to the map and a cross appears in the middle. Use the arrow keys to move and + / &minus; to zoom, then press Enter to drop your stick at the cross. Press Escape to skip to the end of a journey.</li></ul>` +
    (LAB ? `<h3>Lab version</h3><p>This page tests Esri's Trace Downstream service. Paste an ArcGIS API key in the Lab panel; it is kept only in this browser. Without a key, or if the service says no, the stick uses our own flow model and the page tells you why. The lab also tries a splash sound when the stick lands in the water (a pebble plop; the speaker button at the top turns it off), and a honey pot whose bees fly for a few seconds when the page opens and after each right answer.</p>` : '') +
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
    // One elevation tile. A download that fails for a moment (network blip, busy server, timeout) is tried
    // again twice; only a tile that really isn't there (404/400) or keeps failing counts as "no data".
    const wait = ms => new Promise(r => setTimeout(r, ms));
    async function fetchElev(Lv, tx, ty, signal) {
      await elevReady;
      for (let attempt = 0; ; attempt++) {
        try {
          const d = await elevLayer.fetchTile(Lv, ty, tx, { noDataValue: -99999, signal });
          const out = new Float32Array(65536), w = d.width;
          for (let j = 0; j < 256; j++) {
            const row = j * w;
            for (let i = 0; i < 256; i++) { const v = d.values[row + i]; out[j * 256 + i] = (v === d.noDataValue || v <= -99998) ? NaN : v; }
          }
          return out;
        } catch (e) {
          if ((e && e.name === 'AbortError') || (signal && signal.aborted)) throw e;
          const status = e && e.details && e.details.httpStatus;
          if (attempt >= 2 || status === 404 || status === 400) { console.warn('elevation tile', Lv, tx, ty, e); return null; }
          await wait(attempt ? 1200 : 400);
        }
      }
    }
    // a new store for every stick: each go starts fresh, like the first one
    let store = new FE.TileStore(fetchElev, FEATURES);
    function freshStore() { store.close(); store = new FE.TileStore(fetchElev, FEATURES); }

    const seaLayer = new GraphicsLayer({ title: 'Where it ended' });
    const routeLayer = new GraphicsLayer({ title: 'Route' });
    const stickLayer = new GraphicsLayer({ title: 'Stick' });
    map.addMany([seaLayer, routeLayer, stickLayer]);

    const view = new MapView({
      container: 'viewDiv', map, center: [0.097407, 51.084674], zoom: 14,
      constraints: { minZoom: 2, rotationEnabled: false, snapToZoom: false },
      popupEnabled: false
    });
    view.ui.components = ['attribution'];
    $('#zoomIn').addEventListener('click', () => view.goTo({ zoom: Math.round(view.zoom) + 1 }).catch(() => {}));
    $('#zoomOut').addEventListener('click', () => view.goTo({ zoom: Math.max(2, Math.round(view.zoom) - 1) }).catch(() => {}));

    // keep the map's centre (and the stick) clear of the floating panels
    function layout() {
      const bar = $('#titleBar').getBoundingClientRect();
      const barH = Math.round(bar.bottom + 12);
      document.documentElement.style.setProperty('--bar-h', barH + 'px');
      const wide = window.innerWidth > 700;
      view.padding = { top: barH, left: wide ? 394 : 0, right: wide ? 64 : 0, bottom: 0 };
      placeCross();
    }
    function placeCross() {
      const pad = view.padding || { top: 0, left: 0, right: 0, bottom: 0 };
      const ch = $('#crosshair');
      ch.style.left = (pad.left + (view.width - pad.left - pad.right) / 2) + 'px';
      ch.style.top = (pad.top + (view.height - pad.top - pad.bottom) / 2) + 'px';
    }
    window.addEventListener('resize', () => layout());
    if (window.ResizeObserver) new ResizeObserver(() => layout()).observe($('#titleBar'));

    // Keyboard: the cross shows only while the map has keyboard focus; Enter drops the stick there
    let keyboardUser = false;
    document.addEventListener('keydown', e => { if (e.key === 'Tab') keyboardUser = true; }, true);
    document.addEventListener('pointerdown', () => { keyboardUser = false; $('#crosshair').classList.remove('show'); }, true);
    $('#viewDiv').addEventListener('focusin', () => { if (keyboardUser) { placeCross(); $('#crosshair').classList.add('show'); } });
    $('#viewDiv').addEventListener('focusout', () => $('#crosshair').classList.remove('show'));
    view.on('key-down', e => {
      if ((e.key === 'Enter' || e.key === ' ') && (state === 'Ready' || state === 'Reveal')) {
        if (e.stopPropagation) e.stopPropagation();
        dropAt(view.center);
      }
    });

    const casingG = new Graphic({ symbol: { type: 'simple-line', color: [255, 255, 255, 0.95], width: 7, cap: 'round', join: 'round' } });
    const routeG = new Graphic({ symbol: { type: 'simple-line', color: [13, 74, 122, 1], width: 3.5, cap: 'round', join: 'round' } });
    const stickG = new Graphic({ symbol: { type: 'picture-marker', url: STICK_URL, width: STICK_PX, height: STICK_PX, angle: 0 } });
    const startG = new Graphic({ symbol: { type: 'simple-marker', style: 'circle', size: 12, color: [242, 183, 5, 1], outline: { color: [30, 42, 34, 1], width: 2 } } });

    let current = null;            // the game in progress
    let abortCtl = null;
    let chosenPlace = PLACES[0];   // set when a place from the list is used (the map opens on Poohsticks Bridge)
    let rafId = null, skipAnim = false;
    let lastDrop = null;           // where the last stick went in, and how far the map was zoomed in then
    let settledView = null;        // the map once the whole route was shown

    function clearMap() {
      if (rafId) cancelAnimationFrame(rafId);
      seaLayer.removeAll(); routeLayer.removeAll(); stickLayer.removeAll();
      casingG.geometry = null; routeG.geometry = null;
    }
    const pt = (x, y) => new Point({ x, y, spatialReference: SR });

    // ------------------------------------------------------------- lab: Esri Trace Downstream
    const KEY_STORE = 'poohSticks.lab.apiKey', ENGINE_STORE = 'poohSticks.lab.engine';
    let labKey = '', engine = 'ours', lastReply = null;
    const TERMINAL_INDEX = L.buildSeaIndex([
      ...window.LAKES_DATA.filter(l => l.k === 'terminal').map(l => ({ n: l.n, c: 'lake', r: 9, p: l.p })),
      ...marineRaw.filter(x => x.n === 'Caspian Sea')
    ]);
    function labSay(msg) { const el = $('#labLast'); el.textContent = msg; el.hidden = !msg; }
    function keyState() { $('#labKeyState').textContent = labKey ? 'A key is saved in this browser (only here, nowhere else).' : 'No key saved yet.'; }
    if (LAB) {
      try { labKey = localStorage.getItem(KEY_STORE) || ''; engine = localStorage.getItem(ENGINE_STORE) || 'esri'; } catch (e) { engine = 'esri'; }
      $('#labBox').hidden = false;
      document.querySelectorAll('input[name="engine"]').forEach(r => {
        r.checked = r.value === engine;
        r.addEventListener('change', () => { engine = r.value; try { localStorage.setItem(ENGINE_STORE, engine); } catch (e) { /* this browser only */ } });
      });
      keyState();
      $('#labSave').addEventListener('click', () => {
        labKey = $('#labKey').value.trim(); $('#labKey').value = '';
        try { if (labKey) localStorage.setItem(KEY_STORE, labKey); } catch (e) { /* kept for this visit only */ }
        keyState(); announce(labKey ? 'Key saved.' : 'No key entered.');
      });
      $('#labSaveReply').addEventListener('click', () => {   // download Esri's last reply as a JSON file, to check what it sent
        if (!lastReply) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(lastReply, null, 1)], { type: 'application/json' }));
        a.download = 'trace-downstream-reply.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      });
      $('#labForget').addEventListener('click', () => { labKey = ''; try { localStorage.removeItem(KEY_STORE); } catch (e) { /* ignore */ } keyState(); announce('Key forgotten.'); });
    }
    // Esri's trace line can come back mouth-first (the Great Stour), in pieces, and with the same stretch of river
    // more than once (the Okavango came back about five times over). So the pieces are treated as one network:
    // every vertex is a node, pieces are joined where their ends meet (within GAP_M), and the route is the single
    // shortest path from the node nearest the drop to the node furthest downstream (furthest along the network).
    const GAP_M = 300;
    function routeFromPieces(paths, drop) {
      const parts = paths.filter(p => p.length >= 2);
      if (!parts.length) return { line: [], piecesKm: 0 };
      const idOf = new Map(), xy = [], adj = [];
      const node = p => {
        const k = Math.round(p[0] * 2) + ':' + Math.round(p[1] * 2);   // same point to within half a metre
        let id = idOf.get(k);
        if (id === undefined) { id = xy.length; idOf.set(k, id); xy.push([p[0], p[1]]); adj.push([]); }
        return id;
      };
      const dist = (a, b) => Math.hypot(xy[a][0] - xy[b][0], xy[a][1] - xy[b][1]);
      const link = (a, b) => { if (a !== b) { const w = dist(a, b); adj[a].push([b, w]); adj[b].push([a, w]); } };
      let piecesKm = 0;
      const ends = [];
      for (const p of parts) {
        let prev = node(p[0]);
        ends.push(prev);
        for (let i = 1; i < p.length; i++) {
          const n = node(p[i]);
          piecesKm += dist(prev, n) * Math.cos(FE.toLonLat(xy[n][0], xy[n][1])[1] * Math.PI / 180) / 1000;   // map metres to ground km
          link(prev, n); prev = n;
        }
        ends.push(prev);
      }
      // bridge small gaps: each piece end to the nearest node of the network that isn't its own neighbour
      for (const e of ends) {
        let best = -1, bd = GAP_M;
        for (let n = 0; n < xy.length; n++) {
          if (n === e || adj[e].some(([m]) => m === n)) continue;
          const d = dist(e, n);
          if (d < bd) { bd = d; best = n; }
        }
        if (best >= 0) link(e, best);
      }
      let start = 0, sd = Infinity;
      for (let n = 0; n < xy.length; n++) { const d = Math.hypot(xy[n][0] - drop[0], xy[n][1] - drop[1]); if (d < sd) { sd = d; start = n; } }
      // Dijkstra from the start
      const D = new Float64Array(xy.length).fill(Infinity), from = new Int32Array(xy.length).fill(-1), heap = new FE.Heap();
      D[start] = 0; heap.push(start, 0, 0);
      while (heap.n) {
        const c = heap.pop(), u = c.x;
        if (c.e > D[u]) continue;
        for (const [v, w] of adj[u]) if (D[u] + w < D[v]) { D[v] = D[u] + w; from[v] = u; heap.push(v, 0, D[v]); }
      }
      let far = start;
      for (let n = 0; n < xy.length; n++) if (isFinite(D[n]) && D[n] > D[far]) far = n;
      const line = [];
      for (let n = far; n !== -1; n = from[n]) line.push(xy[n]);
      line.reverse();
      return { line, piecesKm };
    }
    const labError = (msg, code) => { const e = new Error(msg); e.code = code; return e; };
    const sleep = (ms, signal) => new Promise((res, rej) => {
      const t = setTimeout(res, ms);
      if (signal) signal.addEventListener('abort', () => { clearTimeout(t); const e = new Error('cancelled'); e.name = 'AbortError'; rej(e); }, { once: true });
    });
    async function esriCall(path, params, signal, post) {
      const q = new URLSearchParams(Object.assign({ f: 'json', token: labKey }, params || {}));
      const res = post ? await fetch(TRACE_URL + path, { method: 'POST', body: q, signal })
                       : await fetch(TRACE_URL + path + '?' + q.toString(), { signal });
      if (!res.ok) throw labError('the service answered HTTP ' + res.status, res.status);
      const j = await res.json();
      if (j.error) throw labError((j.error.message || 'error') + (j.error.code ? ' (code ' + j.error.code + ')' : ''), j.error.code);
      return j;
    }
    // Ask Trace Downstream for the route from the drop point; returns a route shaped like FE.trace's
    async function traceWithEsri(m, lon, lat, signal) {
      const t0 = Date.now();
      const tick = setInterval(() => { $('#traceStatus').textContent = 'Asking Esri\'s Trace Downstream service… ' + Math.round((Date.now() - t0) / 1000) + ' s'; }, 1000);
      try {
        const points = JSON.stringify({
          geometryType: 'esriGeometryPoint', spatialReference: { wkid: 4326 },
          fields: [{ name: 'PointID', type: 'esriFieldTypeInteger', alias: 'PointID' }],
          features: [{ geometry: { x: lon, y: lat, spatialReference: { wkid: 4326 } }, attributes: { PointID: 1 } }]
        });
        const base = { InputPoints: points, Generalize: 'false', 'env:outSR': '102100' };
        let job;
        try { job = await esriCall('/submitJob', Object.assign({ DataSourceResolution: 'FINEST' }, base), signal, true); }
        catch (e) {
          if (e.name === 'AbortError' || [401, 403, 498, 499].includes(e.code)) throw e;
          job = await esriCall('/submitJob', base, signal, true);   // try once more with the service's default data
        }
        if (!job.jobId) throw labError('no trace job was started');
        let st = job.jobStatus || '', msgs = [];
        while (!/Succeeded|Failed|TimedOut|Cancelled|Deleted/i.test(st)) {
          await sleep(1500, signal);
          const j = await esriCall('/jobs/' + job.jobId, {}, signal, false);
          st = j.jobStatus || ''; msgs = j.messages || msgs;
        }
        if (!/Succeeded/i.test(st)) {
          const why = msgs.filter(x => /Error/i.test(x.type)).map(x => x.description).join(' ');
          throw labError('the trace job ' + st.replace(/^esriJob/i, '').toLowerCase() + (why ? ': ' + why : ''));
        }
        const out = await esriCall('/jobs/' + job.jobId + '/results/OutputTraceLine', {}, signal, false);
        lastReply = { when: new Date().toISOString(), drop: [lon, lat], jobId: job.jobId, result: out };
        $('#labSaveReply').hidden = false;
        const v = out.value || out, f = (v.features || [])[0];
        if (!f || !f.geometry || !f.geometry.paths || !f.geometry.paths.length) throw labError('no trace came back for this spot (it may be outside the service\'s data)');
        const sr = v.spatialReference || (f.geometry.spatialReference) || {};
        const wkid = sr.latestWkid || sr.wkid || 102100;
        let paths = f.geometry.paths.map(path => path.map(p => [p[0], p[1]]));
        if (wkid === 4326 || wkid === 4269) paths = paths.map(path => path.map(p => FE.toMerc(p[0], p[1])));
        const built = routeFromPieces(paths, [m[0], m[1]]);
        const coords = built.line;
        coords.unshift([m[0], m[1]]);
        let km = 0;
        for (let i = 1; i < coords.length; i++) {
          const lat = FE.toLonLat(coords[i][0], coords[i][1])[1];
          km += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]) * Math.cos(lat * Math.PI / 180) / 1000;
        }
        const last = coords[coords.length - 1], endLL = FE.toLonLat(last[0], last[1]);
        // where it ended: a lake with no outlet, the sea, or an inland basin
        let end;
        const lakes = TERMINAL_INDEX.map(x => ({ x, d: L.distToSeaKm(x, endLL[0], endLL[1], 15) })).filter(o => isFinite(o.d)).sort((a, b) => a.d - b.d);
        if (lakes.length) end = { type: 'terminal', feature: { name: lakes[0].x.name } };
        else if (!L.findSea(SEA_INDEX, endLL[0], endLL[1], { coastKm: 150 }).inland) end = { type: 'sea' };
        else end = { type: 'inland' };
        end.x = last[0]; end.y = last[1];
        let startZ = NaN;
        try { const [gx, gy] = FE.cellOf(m[0], m[1], 13); await store.need(13, gx, gy); startZ = store.z(13, gx, gy); } catch (e) { /* height is a nice-to-have */ }
        // what Esri sent, for the lab note (and the "save the reply" link)
        const reply = { pieces: paths.length, piecesKm: built.piecesKm, esriKm: f.attributes && isFinite(+f.attributes.LengthKm) ? +f.attributes.LengthKm : null, features: (v.features || []).length };
        return { coords, km, end, stats: { engine: 'esri', ms: Date.now() - t0, startZ, levels: [], attrs: f.attributes || {}, reply } };
      } finally { clearInterval(tick); }
    }

    // ------------------------------------------------------------- dropping
    view.on('click', e => { if (state === 'Ready' || state === 'Reveal') dropAt(e.mapPoint); });
    $('#cancelBtn').addEventListener('click', () => {
      if (abortCtl) abortCtl.abort();
      freshStore();
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

    // ---- splash sound (lab): a low "bloop" as the stick goes in, a burst of watery hiss, then droplets plinking
    // back down. Made in the browser with Web Audio, so there's no sound file. Off with the Sound switch.
    const SOUND_STORE = 'poohSticks.sound';
    let soundOn = true, actx = null;
    try { soundOn = localStorage.getItem(SOUND_STORE) !== 'off'; } catch (e) { /* default on */ }
    function audio() {
      try {
        if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; actx = new C(); }
        if (actx.state === 'suspended' && actx.resume) actx.resume();
        return actx;
      } catch (e) { return null; }
    }
    if (LAB) {
      // browsers only allow sound after the person has touched the page, so wake the audio on their first touch,
      // click or key (iPhones and iPads only allow it when the finger lifts, hence pointerup, touchend and click)
      ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (soundOn) audio(); }, true));
      const sb = $('#soundBtn');
      const showSound = () => { sb.title = soundOn ? 'Sound on' : 'Sound off'; sb.setAttribute('aria-pressed', String(soundOn)); };
      sb.hidden = false; showSound();
      sb.addEventListener('click', () => { soundOn = !soundOn; try { localStorage.setItem(SOUND_STORE, soundOn ? 'on' : 'off'); } catch (e) { /* this visit only */ } showSound(); announce(soundOn ? 'Sound on' : 'Sound off'); });
    }
    // helpers for making the sound
    function soundKit(ctx, dest, level) {
      const out = ctx.createGain(); out.gain.value = level; out.connect(dest);
      const env = (g, t0, peak, attack, release) => { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + release); };
      const chirp = (t0, f0, f1, sweep, peak, release, type) => {     // a tone sliding from f0 to f1: a bubble or a plink
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + sweep);
        env(g, t0, peak, 0.005, release); o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + release + 0.03);
      };
      const hiss = (t0, secs, type, f0, f1, q, peak, attack, release) => {   // filtered noise: spray and splash
        const len = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        n.buffer = b; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t0 + secs * 0.9);
        env(g, t0, peak, attack, release); n.connect(f); f.connect(g); g.connect(out); n.start(t0); n.stop(t0 + secs);
      };
      return { chirp, hiss };
    }
    // a pebble into a pond: one round "plop", a smaller bubble after it, a soft splash and a few drips
    function plopSplash(ctx, dest, t) {
      const { chirp, hiss } = soundKit(ctx, dest, 0.9);
      chirp(t, 240, 780, 0.08, 0.75, 0.17);
      chirp(t + 0.07, 420, 1150, 0.05, 0.32, 0.1);
      hiss(t, 0.35, 'lowpass', 2200, 900, 0.7, 0.18, 0.01, 0.28);
      for (const [dt, f] of [[0.32, 1300], [0.47, 1700], [0.66, 1100]]) chirp(t + dt, f, f * 1.7, 0.04, 0.16, 0.07);
    }
    function splashSound(ctx, dest, t) { plopSplash(ctx, dest, t); }   // Pebble plop, chosen from four tried in lab 0.8
    window.__splashSound = splashSound;   // lets a test render the sound offline
    function playSplash() {
      if (!LAB || !soundOn) return;
      const ctx = audio();
      if (!ctx) return;
      try { splashSound(ctx, ctx.destination, ctx.currentTime + 0.01); } catch (e) { /* no sound is fine */ }
    }

    // The stick drops in: it falls (big to normal size), hits the water with a splash, then bobs.
    let splashToken = 0;
    const stickSym = (size, angle) => ({ type: 'picture-marker', url: STICK_URL, width: size, height: size, angle });
    function splash(p, keepStick) {
      if (reduceMotion) { if (!keepStick) playSplash(); return; }   // no movement, but the sound still plays
      if (keepStick) { endSplash(p); return; }
      const token = ++splashToken, t0 = performance.now(), FALL = 320, BOB = 1000;
      let hit = false;
      const step = now => {
        if (token !== splashToken) return;              // a newer drop has taken over
        const t = now - t0;
        if (t < FALL) {
          const f = t / FALL;
          stickG.symbol = stickSym(STICK_PX * (2.4 - 1.4 * f * f), -28 * (1 - f));
        } else {
          if (!hit) { hit = true; playSplash(); waterSplash(p); }
          const f = Math.min(1, (t - FALL) / BOB);
          stickG.symbol = stickSym(STICK_PX, Math.sin(f * 15) * 13 * (1 - f));
        }
        if (t < FALL + BOB) requestAnimationFrame(step); else stickG.symbol = stickSym(STICK_PX, 0);
      };
      requestAnimationFrame(step);
    }

    // Water splash drawn on a small canvas over the map: a crown of water, flying droplets
    // that make little rings where they land, and ripples spreading out.
    function waterSplash(p) {
      let sp = null;
      try { sp = view.toScreen(p); } catch (e) { /* view not ready */ }
      if (!sp) return;
      const box = $('#viewDiv').getBoundingClientRect();
      const W = 300, H = 230, cx = W / 2, cy = 160;           // impact point inside the canvas
      const cv = document.createElement('canvas');
      cv.className = 'splash-fx'; cv.setAttribute('aria-hidden', 'true');
      let ctx = null;
      try { ctx = cv.getContext('2d'); } catch (e) { /* no canvas */ }
      if (!ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
      cv.style.left = Math.round(box.left + sp.x - cx) + 'px'; cv.style.top = Math.round(box.top + sp.y - cy) + 'px';
      document.body.appendChild(cv);
      ctx.scale(dpr, dpr);
      const rnd = (a, b) => a + Math.random() * (b - a);
      const drops = Array.from({ length: 22 }, () => {
        const a = -Math.PI / 2 + rnd(-1.05, 1.05), v = rnd(200, 380);
        return { x: cx + Math.cos(a) * 6, y: cy - 2, vx: Math.cos(a) * v * 0.8, vy: Math.sin(a) * v, r: rnd(2.8, 5.8), land: cy + rnd(-8, 10), done: false };
      });
      const rings = [{ x: cx, y: cy, t0: 0, dur: 1100, max: 70, w: 1 }, { x: cx, y: cy, t0: 150, dur: 1100, max: 96, w: 1 }, { x: cx, y: cy, t0: 320, dur: 1050, max: 120, w: 0.85 }];
      const ellipse = (x, y, rx, ry) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); };
      const drawDrop = (x, y, r, vx, vy) => {
        const ang = Math.atan2(vy, vx) + Math.PI / 2;        // a teardrop pointing the way it moves
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(0, -r * 1.9);
        ctx.bezierCurveTo(r * 0.9, -r * 0.6, r, r * 0.9, 0, r);
        ctx.bezierCurveTo(-r, r * 0.9, -r * 0.9, -r * 0.6, 0, -r * 1.9);
        ctx.fillStyle = '#5fb4ec'; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(13,74,122,.85)'; ctx.stroke();
        ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.1, r * 0.32, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fill();
        ctx.restore();
      };
      const t0 = performance.now();
      let last = t0;
      const frame = now => {
        const t = now - t0, dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        ctx.clearRect(0, 0, W, H);
        // ripples (white with a blue edge, so they show on any map colour)
        for (const g of rings) {
          const f = (t - g.t0) / g.dur;
          if (f < 0 || f > 1) continue;
          const rx = 4 + g.max * (1 - (1 - f) * (1 - f)), ry = rx * 0.42;
          ctx.globalAlpha = (1 - f) * g.w;
          ellipse(g.x, g.y, rx, ry); ctx.lineWidth = 4.5; ctx.strokeStyle = 'rgba(13,74,122,.6)'; ctx.stroke();
          ellipse(g.x, g.y, rx, ry); ctx.lineWidth = 2.2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // a white burst of foam right where the stick goes in
        const ff = t / 280;
        if (ff < 1) {
          const rx = 8 + 30 * ff;
          ellipse(cx, cy, rx, rx * 0.45); ctx.fillStyle = 'rgba(255,255,255,' + (0.95 * (1 - ff)) + ')'; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(13,74,122,' + (0.7 * (1 - ff)) + ')'; ctx.stroke();
        }
        // the crown of water thrown up where the stick went in
        const fc = t / 500;
        if (fc < 1) {
          const h = 46 * Math.sin(Math.PI * Math.min(1, fc * 1.15)), rx = 9 + 20 * fc, ry = rx * 0.42, n = 12;
          const spikes = [];
          for (let k = 0; k < n; k++) { const th = (k / n) * Math.PI * 2 + 0.3; spikes.push({ th, s: Math.sin(th) }); }
          spikes.sort((a, b) => a.s - b.s);                    // back ones first
          ctx.globalAlpha = fc > 0.7 ? (1 - fc) / 0.3 : 1;
          for (const sk of spikes) {
            const bx = cx + rx * Math.cos(sk.th), by = cy + ry * sk.s;
            const tall = h * (0.75 + 0.25 * Math.abs(Math.cos(sk.th * 2)));
            const tx = cx + (rx * 1.35) * Math.cos(sk.th), ty = by - tall;
            ctx.beginPath(); ctx.moveTo(bx - 4.5, by); ctx.quadraticCurveTo(tx, by - tall * 0.45, tx, ty); ctx.quadraticCurveTo(tx, by - tall * 0.45, bx + 4.5, by); ctx.closePath();
            ctx.fillStyle = sk.s < 0 ? '#9fd6f7' : '#7cc5f2'; ctx.fill();
            ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(13,74,122,.7)'; ctx.stroke();
            ctx.beginPath(); ctx.arc(tx, ty, 3.2, 0, Math.PI * 2); ctx.fillStyle = '#e9f6ff'; ctx.fill(); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        // droplets fly up and fall back, each making a little ring where it lands
        for (const d of drops) {
          if (d.done) continue;
          if (t < 60) { drawDrop(d.x, d.y, d.r * 0.6, d.vx, d.vy); continue; }
          d.vy += 820 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
          if (d.vy > 0 && d.y >= d.land) { d.done = true; rings.push({ x: d.x, y: d.land, t0: t, dur: 520, max: 9 + d.r * 1.6, w: 0.9 }); continue; }
          drawDrop(d.x, d.y, d.r, d.vx, d.vy);
        }
        if (t < 1500) requestAnimationFrame(frame); else cv.remove();
      };
      requestAnimationFrame(frame);
    }

    // a few rings spreading out where the stick reaches the end
    function endSplash(p) {
      const rings = [0, 1, 2].map(() => new Graphic({ geometry: p, symbol: { type: 'simple-marker', size: 0, color: [0, 0, 0, 0], outline: { color: [27, 106, 165, 0], width: 2.5 } } }));
      stickLayer.addMany(rings);
      const t0 = performance.now();
      const step = now => {
        const t = (now - t0) / 1600;
        rings.forEach((g, i) => {
          const f = Math.max(0, Math.min(1, t * 1.6 - i * 0.3));
          g.symbol = { type: 'simple-marker', size: 8 + 70 * f, color: [0, 0, 0, 0], outline: { color: [27, 106, 165, f > 0 ? 1 - f : 0], width: 2.5 } };
        });
        if (t < 1.4) requestAnimationFrame(step); else rings.forEach(g => stickLayer.remove(g));
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
      freshStore();
      lastDrop = { x: m[0], y: m[1], scale: view.scale };
      const dropPt = pt(m[0], m[1]);
      stickG.geometry = dropPt; startG.geometry = dropPt.clone();
      stickLayer.addMany([startG, stickG]);
      splash(dropPt);
      show('Tracing', true);
      $('#traceStatus').textContent = 'Reading the land…';
      announce('Splash! Your stick is in the water. Working out where the water flows.');
      let lastSaid = Date.now();
      try {
        let route = null, labNote = '';
        if (LAB && engine === 'esri') {
          if (!labKey) labNote = 'No API key saved, so our flow model traced this stick.';
          else {
            try {
              route = await traceWithEsri(m, lon, lat, signal);
              labNote = 'Traced by Esri Trace Downstream in ' + (route.stats.ms / 1000).toFixed(1) + ' s.';
              const rp = route.stats.reply;
              labNote += ' Esri sent ' + (rp.pieces === 1 ? 'one line' : 'a line in ' + rp.pieces + ' pieces') +
                (rp.features > 1 ? ' (and ' + (rp.features - 1) + ' more trace' + (rp.features > 2 ? 's' : '') + ', not used)' : '') +
                ' adding up to ' + fmtKm(rp.piecesKm) + ' km' + (rp.esriKm !== null ? '; Esri gives the trace as ' + fmtKm(rp.esriKm) + ' km' : '') +
                '. The stick\'s route is ' + fmtKm(route.km) + ' km.';
            } catch (err) {
              if ((err && err.name === 'AbortError') || signal.aborted) throw err;
              labNote = 'Esri Trace Downstream didn\'t work: ' + String(err.message).replace(/[.\s]+$/, '') + '. Our flow model traced this stick instead.';
              console.warn('Trace Downstream', err);
            }
          }
        } else if (LAB) labNote = 'Traced by our flow model (chosen in the Lab panel).';
        if (!route) {
          const t0 = Date.now();
          route = await FE.trace(store, m, nearSeaKm, {}, p => {
            $('#traceStatus').textContent = 'The water has flowed about ' + fmtKm(p.km) + ' km so far…';
            if (Date.now() - lastSaid > 8000) { lastSaid = Date.now(); announce('About ' + nf0.format(p.km) + ' kilometres so far.'); }
          }, signal);
          if (LAB && route.end.type !== 'lost') labNote += (labNote ? ' ' : '') + 'Our model took ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s.';
        }
        if (LAB) { labSay(labNote); route.labNote = labNote; }
        if (signal.aborted) return;        // a newer stick (or Cancel) has taken over
        if (route.coords.length < 3 || route.km < 0.05) {
          clearMap(); show('Ready', true);
          readyMessage(route.end.type === 'lost' ? 'We couldn\'t read the land at that spot. Try somewhere else.' : 'The water doesn\'t go anywhere from that spot. Try clicking right on a stream.');
          return;
        }
        const endLL = FE.toLonLat(route.end.x, route.end.y);
        let ending;
        if (route.end.type === 'sea') {
          const s = L.findSea(SEA_INDEX, endLL[0], endLL[1], { coastKm: 150 });
          ending = s.inland ? { kind: 'sea', sea: null, name: 'the sea' } : { kind: 'sea', sea: s.sea, name: s.sea.name, via: s.via ? s.via.name : null };
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
        if ((err && err.name === 'AbortError') || signal.aborted) return;
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
        inp.addEventListener('change', () => { $('#nudge').hidden = true; });
        const span = document.createElement('span');
        span.textContent = o.label;
        lab.append(inp, span);
        box.appendChild(lab);
      });
      $('#nudge').hidden = true;
    }
    $('#predictForm').addEventListener('submit', e => {
      e.preventDefault();
      const sel = document.querySelector('input[name="choice"]:checked');
      if (!current) return;
      if (!sel) { $('#nudge').hidden = false; announce('Pick one first!'); const first = document.querySelector('input[name="choice"]'); if (first) first.focus(); return; }
      current.choice = current.options[Number(sel.value)];
      score.played += 1;
      if (current.choice.correct) score.right += 1;
      showScore();
      startJourney();
    });

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
      const vp = view.padding || { top: 0, left: 0, right: 0, bottom: 0 };
      const vw = Math.max(200, view.width - vp.left - vp.right), vh = Math.max(200, view.height - vp.top - vp.bottom);
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
        const ang = STICK_AXIS - Math.atan2(a.dir[1], a.dir[0]) * 180 / Math.PI + (wobble || 0);
        stickG.symbol = { type: 'picture-marker', url: STICK_URL, width: STICK_PX, height: STICK_PX, angle: ang };
        return a.p;
      };
      const finish = () => { draw(total, 0); reveal(); };
      // remember how the map looks once the whole route is shown, to tell later whether it was moved
      const fit = animate => { settledView = null; view.goTo(ext, animate ? { animate: true, duration: 800 } : { animate: false }).catch(() => {}).then(() => { settledView = { x: view.center.x, y: view.center.y, scale: view.scale }; }); };
      if (reduceMotion || total === 0) { fit(false); finish(); return; }

      const km = r.km;
      const dur = Math.min(16000, Math.max(5000, 4000 + 2200 * Math.log2(1 + km / 3)));
      const d0 = 250, a = Math.log(1 + total / d0);
      const pxM = s0 / PX;                                       // metres per pixel at the start
      const t0 = performance.now();
      let last = 0;
      const frame = now => {
        if (skipAnim) { fit(false); return finish(); }
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
        else { fit(true); finish(); }
      };
      view.goTo({ target: pt(coords[0][0], coords[0][1]), scale: s0 }, { animate: false }).catch(() => {}).then(() => { rafId = requestAnimationFrame(frame); });
    }
    // no Skip button on screen; Escape still skips to the end, for keyboard and screen-reader users
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && state === 'Journey') skipAnim = true; });

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
      if (e.kind !== 'lost') splash(endPt, true);
      if (e.kind === 'sea' && e.sea) {
        seaLayer.add(new Graphic({
          geometry: new Polygon({ rings: ringsOf(e.sea), spatialReference: { wkid: 4326 } }),
          symbol: { type: 'simple-fill', color: [27, 106, 165, 0.16], outline: { color: [13, 74, 122, 0.9], width: 1.5 } }
        }));
      }
      const label = e.kind === 'sea' ? (e.via ? 'Mouth of ' + the(e.via) : e.name) : e.kind === 'terminal' ? e.name : e.kind === 'inland' ? 'Water ends here' : 'We lost the stick here';
      if (c.endLabel) stickLayer.remove(c.endLabel);
      c.endLabel = new Graphic({
        geometry: endPt,
        symbol: { type: 'text', text: label, color: [30, 42, 34, 1], haloColor: [255, 255, 255, 1], haloSize: 2, yoffset: -28, font: { size: 13, weight: 'bold', family: 'sans-serif' } }
      });
      stickLayer.add(c.endLabel);

      const guessed = !!c.choice, right = guessed && c.choice.correct;
      if (right && LAB) { honey.buzz(4000); bobTwig(); }   // a little celebration (lab try-out)
      const box = $('#resultBox');
      box.className = 'result' + (guessed ? (right ? ' ok' : ' no') : '');
      $('#revealTitle').textContent = !guessed ? 'Here\'s where it went' : right ? '✓ You got it!' : '✗ Not this time';
      const p1 = document.createElement('p');
      const km = r.km;
      if (e.kind === 'sea') {
        // a river so wide that the map draws it as open water (the Amazon, Yangtze, Columbia, St Lawrence)
        p1.append('Your stick floated about ' + fmtKm(km) + ' km ' + (e.via ? 'into the wide mouth of ' + the(e.via) + ', which opens into the ' : 'and reached the '));
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
      if (guessed) {
        const p2 = document.createElement('p'); p2.textContent = 'You guessed: ' + c.choice.label + '.'; parts.push(p2);
        const p3 = document.createElement('p');
        p3.className = right ? 'points' : 'points none';
        p3.textContent = right ? '+' + POINTS + ' points!' : 'No points this time. Drop another stick and try again!';
        parts.push(p3);
      }
      $('#resultText').replaceChildren(...parts);

      // compare with the real river, when the stick started from the list
      const rb = $('#realBox');
      if (c.place && c.place.real) {
        const real = c.place.real;
        const realName = real.name || 'an inland basin';
        const realText = real.name ? the(realName) : realName;
        const base = c.place.label.split(' (')[0];
        const from = c.place.group === 'Pooh Sticks' ? 'water from ' + base : 'the ' + base.replace(/^River /, 'River ');
        const modelName = e.kind === 'sea' ? e.name : e.kind === 'terminal' ? e.name : null;
        const same = (real.type === 'sea' && e.kind === 'sea' && e.name === real.name) || (real.type === 'inland' && (e.kind === 'terminal' || e.kind === 'inland') && (!real.name || real.name === modelName || e.kind === 'inland'));
        const via = real.via ? ', by way of ' + real.via : '';
        rb.textContent = same
          ? 'In real life, ' + from + ' also ends up in ' + realText + via + '.'
          : 'In real life, ' + from + ' ends up in ' + realText + via + '. Our model only follows the shape of the land, and here it took a different way.';
        rb.hidden = false;
      } else rb.hidden = true;

      const startZ = r.stats.startZ;
      const lat0 = c.drop[1];
      const sizes = (r.stats.levels || []).map(Lv => FE.res(Lv) * Math.cos(lat0 * Math.PI / 180));
      const facts = [['Distance floated', 'about ' + fmtKm(km) + ' km (' + fmtKm(km * 0.621371) + ' miles)']];
      if (isFinite(startZ)) facts.push(['Starting height', nf0.format(startZ) + ' m (' + nf0.format(startZ * 3.28084) + ' ft) above sea level']);
      if (km > 1) facts.push(['At walking pace', 'floating non-stop at 5 km/h, the trip would take about ' + (km / 5 < 48 ? nf0.format(km / 5) + ' hours' : nf0.format(km / 120) + ' days')]);
      if (r.stats.engine === 'esri') facts.push(['Traced by', 'Esri Trace Downstream, in ' + (r.stats.ms / 1000).toFixed(1) + ' s']);
      if (sizes.length) facts.push(['Map squares used', 'about ' + nf0.format(Math.min(...sizes)) + ' m to ' + nf0.format(Math.max(...sizes)) + ' m across']);
      const dl = $('#facts');
      dl.replaceChildren();
      facts.forEach(([k, v]) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); });

      const hl = $('#howList');
      hl.replaceChildren();
      const esri = r.stats.engine === 'esri';
      const items = [
        esri ? [MODELS[4], 'Esri\'s service traced the water downhill to where it ends.']
             : [MODELS[0], 'From the drop, the water stepped downhill square by square, filling ' + (r.stats.stretches > 1 ? 'hollows and lakes' : 'any hollows') + ' until they overflowed.'],
        [MODELS[1], esri && e.kind === 'inland' ? 'The trace ended away from any sea or lake with no outlet, so this counts as an inland basin.' : e.kind === 'terminal' ? 'The water reached ' + e.name + ', which has no outlet.' : e.kind === 'inland' ? 'Getting out would have flooded a large area of dry land, so this counts as an inland basin.' : 'Not needed this time: the water found a way out.'],
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
      src.textContent = esri ? 'Data: Esri Trace Downstream (USGS data in the US, WWF data elsewhere); seas, lakes and rivers made with Natural Earth.'
                             : 'Data: Esri World Elevation TopoBathy3D; seas, lakes and rivers made with Natural Earth.';
      const ln = $('#labNote'); ln.textContent = r.labNote || ''; ln.hidden = !r.labNote;
      hl.appendChild(src);

      show('Reveal', true);
      announce((guessed ? (right ? 'You got it! Plus ' + POINTS + ' points. ' : 'Not this time. ') : '') + p1.textContent);
    }

    // A fresh go: everything from the last stick is cleared except the score, and the map goes back to
    // where that stick went in, zoomed in as it was, ready for the next drop.
    function freshGo() {
      if (abortCtl) abortCtl.abort();
      freshStore();
      splashToken++; skipAnim = false;
      clearMap();
      stickG.symbol = stickSym(STICK_PX, 0);
      current = null;
      readyMessage('');
      show('Ready', true);
    }
    $('#againBtn').addEventListener('click', () => {
      // if the map is still as the result left it, go back to where the last stick went in;
      // if it has been moved (to find the next stream), leave it where it is
      const moved = settledView && (Math.abs(view.scale - settledView.scale) / settledView.scale > 0.01 ||
        Math.hypot(view.center.x - settledView.x, view.center.y - settledView.y) > 10 * view.scale * 0.0254 / 96);
      freshGo();
      if (lastDrop && !moved) view.goTo({ target: pt(lastDrop.x, lastDrop.y), scale: lastDrop.scale }, { animate: !reduceMotion }).catch(() => {});
    });
    $('#replayBtn').addEventListener('click', () => { if (current) startJourney(); });
    $('#toStartBtn').addEventListener('click', () => {
      if (current) { const m = FE.toMerc(current.drop[0], current.drop[1]); view.goTo({ target: pt(m[0], m[1]), zoom: 14 }).catch(() => {}); }
    });
    $('#toEndBtn').addEventListener('click', () => { if (current) view.goTo({ target: pt(current.route.end.x, current.route.end.y), zoom: 9 }).catch(() => {}); });

    // ------------------------------------------------------------- places
    function goToPlace(selectId) {
      const v = $(selectId).value;
      if (v === '') { readyMessage('Choose a place from the list first.'); if (state !== 'Ready') announce('Choose a place from the list first.'); return; }
      const p = PLACES[Number(v)];
      chosenPlace = p;
      if (state !== 'Ready') { freshGo(); $('#placeSelect').value = v; }
      readyMessage('');
      view.goTo({ center: [p.lon, p.lat], zoom: p.zoom }, { animate: !reduceMotion }).catch(() => {});
      announce('Map moved to ' + p.label + '. Click on the river to drop your stick, or Tab to the map and press Enter.');
    }
    $('#placeGo').addEventListener('click', () => goToPlace('#placeSelect'));
    $('#placeGo2').addEventListener('click', () => goToPlace('#placeSelect2'));

    view.when(() => { layout(); show('Ready', false); }).catch(err => {
      console.error(err);
      readyMessage('The map could not load. Please refresh the page.');
    });
  });
})();
