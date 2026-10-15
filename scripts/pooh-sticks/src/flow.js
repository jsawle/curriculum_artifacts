/* Flow engine: our own flow direction from an elevation model, and a downstream trace.
   - Elevation: Web Mercator tiles of 256 x 256 cells (Esri TopoBathy3D in the app).
   - Each step moves the stick to the steepest-downhill of its 8 neighbours (D8).
   - When the stick is in a hollow or on a flat (a pit, a lake, a reservoir behind a dam), a
     priority-flood search fills the hollow from its lowest point until the water finds a way
     out (the spill point), then the stick carries on from there.
   - Cell size starts fine near the stick and grows with distance travelled (never coarser than
     the "walk" floor); coarser cells are used only to get across very large lakes or flats.
   - The water stops when it reaches the sea (Natural Earth marine areas, or sea-floor cells
     near the coast), when it reaches a lake with no outlet, or when escaping a hollow would
     mean flooding a large area of dry land (an inland basin).
   Pure JavaScript, no SDK, so it can be unit-tested in Node. */
(function (root) {
  'use strict';

  const VERSION = { flow: '1.1', inland: '1.0' };
  const ORIGIN = 20037508.342787;
  const RES0 = 156543.03392800014;
  const TS = 256;
  const res = L => RES0 / Math.pow(2, L);
  // neighbour order: E, SE, S, SW, W, NW, N, NE (gy grows southwards)
  const DX = [1, 1, 0, -1, -1, -1, 0, 1];
  const DY = [0, 1, 1, 1, 0, -1, -1, -1];
  const DL = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];

  function toLonLat(x, y) {
    return [x / 6378137 * 180 / Math.PI, (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI];
  }
  function toMerc(lon, lat) {
    const la = Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180;
    return [lon * Math.PI / 180 * 6378137, 6378137 * Math.log(Math.tan(Math.PI / 4 + la / 2))];
  }
  const cellOf = (x, y, L) => { const r = res(L); return [Math.floor((x + ORIGIN) / r), Math.floor((ORIGIN - y) / r)]; };
  const centreOf = (gx, gy, L) => { const r = res(L); return [(gx + 0.5) * r - ORIGIN, ORIGIN - (gy + 0.5) * r]; };
  const latOfRow = (gy, L) => toLonLat(0, ORIGIN - (gy + 0.5) * res(L))[1];
  // ground length of one cell (metres) at a row
  const groundRes = (gy, L) => res(L) * Math.cos(latOfRow(gy, L) * Math.PI / 180);

  // ------------------------------------------------------------- features
  /** Prepare Natural Earth polygons for rasterising: rings in normalised Web Mercator (0..1). */
  function prepareFeatures(list) {
    return list.map((f, i) => {
      const rings = [];
      let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
      f.polys.forEach(poly => poly.forEach(flat => {
        const ring = new Float64Array(flat.length);
        for (let k = 0; k < flat.length; k += 2) {
          const m = toMerc(flat[k], flat[k + 1]);
          const u = (m[0] + ORIGIN) / (2 * ORIGIN), v = (ORIGIN - m[1]) / (2 * ORIGIN);
          ring[k] = u; ring[k + 1] = v;
          if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
        }
        rings.push(ring);
      }));
      return { idx: i + 1, name: f.name, kind: f.kind, rings, box: [u0, v0, u1, v1] };
    });
  }

  /** Rasterise features into one tile: cell value = feature idx (later features win). Even-odd fill. */
  function rasterizeTile(features, L, tx, ty) {
    const out = new Uint16Array(TS * TS);
    const n = TS * Math.pow(2, L);
    const tu0 = tx * TS / n, tu1 = (tx + 1) * TS / n, tv0 = ty * TS / n, tv1 = (ty + 1) * TS / n;
    const xs = [];
    for (const f of features) {
      const b = f.box;
      if (b[2] < tu0 || b[0] > tu1 || b[3] < tv0 || b[1] > tv1) continue;
      // gather edges overlapping the tile's rows, in tile pixel units
      const edges = [];
      for (const ring of f.rings) {
        const m = ring.length;
        for (let k = 0; k < m; k += 2) {
          const k2 = (k + 2) % m;
          const ya = ring[k + 1] * n - ty * TS, yb = ring[k2 + 1] * n - ty * TS;
          if ((ya < 0 && yb < 0) || (ya > TS && yb > TS) || ya === yb) continue;
          edges.push(ring[k] * n - tx * TS, ya, ring[k2] * n - tx * TS, yb);
        }
      }
      if (!edges.length) continue;
      for (let j = 0; j < TS; j++) {
        const yc = j + 0.5;
        xs.length = 0;
        for (let e = 0; e < edges.length; e += 4) {
          const xa = edges[e], ya = edges[e + 1], xb = edges[e + 2], yb = edges[e + 3];
          if ((ya <= yc) !== (yb <= yc)) xs.push(xa + (yc - ya) * (xb - xa) / (yb - ya));
        }
        if (xs.length < 2) continue;
        xs.sort((a, b) => a - b);
        for (let p = 0; p + 1 < xs.length; p += 2) {
          const i0 = Math.max(0, Math.ceil(xs[p] - 0.5)), i1 = Math.min(TS - 1, Math.floor(xs[p + 1] - 0.5));
          for (let i = i0; i <= i1; i++) out[j * TS + i] = f.idx;
        }
      }
    }
    return out;
  }

  // ------------------------------------------------------------- tile store
  /**
   * Elevation tiles for ONE stick. The app makes a new store for every stick and closes the old one,
   * so nothing (cached tiles, failed tiles, queued downloads) carries over from one go to the next.
   * Downloads use the store's own abort signal, never a trace's, so a cancelled trace can't poison a tile
   * that another trace is waiting for. Tiles the trace needs now jump ahead of look-ahead prefetches,
   * and only the most recent prefetches are kept waiting.
   */
  class TileStore {
    /** fetchElev(L, tx, ty, signal) → Promise<Float32Array(65536) | null>; NaN = no data */
    constructor(fetchElev, features, opts) {
      this.fetchElev = fetchElev;
      this.features = features;
      this.tiles = new Map();
      this.pending = new Map();     // key → { promise, task }
      this.maxConcurrent = (opts && opts.maxConcurrent) || 6;
      this.maxPrefetchQueue = (opts && opts.maxPrefetchQueue) || 24;
      this.active = 0;
      this.urgent = [];             // tiles a trace is waiting for
      this.later = [];              // look-ahead prefetches, newest last
      this.fetched = 0;
      this.closed = false;
      this.ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    }
    static key(L, tx, ty) { return L + '/' + tx + '/' + ty; }
    wrap(L, tx) { const n = Math.pow(2, L); return ((tx % n) + n) % n; }
    tile(L, tx, ty) { return this.tiles.get(TileStore.key(L, this.wrap(L, tx), ty)); }
    static aborted() { const e = new Error('cancelled'); e.name = 'AbortError'; return e; }
    /** stop everything: queued downloads are dropped, running ones aborted, waiting traces get AbortError */
    close() {
      if (this.closed) return;
      this.closed = true;
      for (const t of this.urgent.concat(this.later)) t.reject(TileStore.aborted());
      this.urgent = []; this.later = [];
      if (this.ctl) this.ctl.abort();
    }
    _next() {
      while (this.active < this.maxConcurrent && !this.closed) {
        const t = this.urgent.shift() || this.later.pop();   // newest prefetch first: it's nearest the front
        if (!t) return;
        t.start();
      }
    }
    ensure(L, tx, ty, signal, urgent = true) {
      tx = this.wrap(L, tx);
      const n = Math.pow(2, L);
      const k = TileStore.key(L, tx, ty);
      if (this.tiles.has(k)) return Promise.resolve(this.tiles.get(k));
      if (ty < 0 || ty >= n) { const t = { z: null, m: null }; this.tiles.set(k, t); return Promise.resolve(t); }
      if (this.closed) return Promise.reject(TileStore.aborted());
      const p0 = this.pending.get(k);
      if (p0) {
        if (urgent && !p0.task.started) {   // a prefetch the trace now needs: move it to the front
          const i = this.later.indexOf(p0.task);
          if (i >= 0) { this.later.splice(i, 1); this.urgent.push(p0.task); this._next(); }
        }
        return p0.promise;
      }
      const task = { started: false };
      const promise = new Promise((resolve, reject) => {
        task.reject = e => { this.pending.delete(k); reject(e); };
        task.start = () => {
          task.started = true;
          this.active++;
          Promise.resolve(this.fetchElev(L, tx, ty, this.ctl ? this.ctl.signal : undefined)).then(z => {
            if (this.closed) throw TileStore.aborted();
            const t = { z: z || null, m: rasterizeTile(this.features, L, tx, ty) };
            this.tiles.set(k, t);
            this.fetched++;
            resolve(t);
          }).catch(reject).finally(() => {
            this.pending.delete(k);
            this.active--;
            this._next();
          });
        };
      });
      this.pending.set(k, { promise, task });
      if (urgent) this.urgent.push(task);
      else {
        this.later.push(task);
        if (this.later.length > this.maxPrefetchQueue) this.later.shift().reject(TileStore.aborted());   // drop the oldest look-ahead
      }
      this._next();
      return promise;
    }
    prefetch(L, tx, ty) { this.ensure(L, tx, ty, undefined, false).catch(() => {}); }
    /** undefined = tile not loaded yet; NaN = no data */
    z(L, gx, gy) {
      const n = TS << L;
      if (gy < 0 || gy >= n) return NaN;
      gx = ((gx % n) + n) % n;
      const t = this.tiles.get(TileStore.key(L, gx >> 8, gy >> 8));
      if (!t) return undefined;
      if (!t.z) return NaN;
      return t.z[((gy & 255) << 8) | (gx & 255)];
    }
    feature(L, gx, gy) {
      const n = TS << L;
      if (gy < 0 || gy >= n) return null;
      gx = ((gx % n) + n) % n;
      const t = this.tiles.get(TileStore.key(L, gx >> 8, gy >> 8));
      if (!t || !t.m) return null;
      const id = t.m[((gy & 255) << 8) | (gx & 255)];
      return id ? this.features[id - 1] : null;
    }
    async need(L, gx, gy, signal) {
      if (this.z(L, gx, gy) === undefined) await this.ensure(L, gx >> 8, gy >> 8, signal);
    }
  }

  // ------------------------------------------------------------- min-heap (elevation, then first-in)
  class Heap {
    constructor() { this.n = 0; this.cap = 1024; this.e = new Float64Array(this.cap); this.s = new Float64Array(this.cap); this.x = new Int32Array(this.cap); this.y = new Int32Array(this.cap); this.seq = 0; }
    grow() {
      this.cap *= 2;
      const g = (A, T) => { const b = new T(this.cap); b.set(A); return b; };
      this.e = g(this.e, Float64Array); this.s = g(this.s, Float64Array); this.x = g(this.x, Int32Array); this.y = g(this.y, Int32Array);
    }
    less(i, j) { return this.e[i] < this.e[j] || (this.e[i] === this.e[j] && this.s[i] < this.s[j]); }
    swap(i, j) {
      let t = this.e[i]; this.e[i] = this.e[j]; this.e[j] = t;
      t = this.s[i]; this.s[i] = this.s[j]; this.s[j] = t;
      t = this.x[i]; this.x[i] = this.x[j]; this.x[j] = t;
      t = this.y[i]; this.y[i] = this.y[j]; this.y[j] = t;
    }
    push(x, y, e) {
      if (this.n === this.cap) this.grow();
      let i = this.n++;
      this.e[i] = e; this.s[i] = this.seq++; this.x[i] = x; this.y[i] = y;
      while (i > 0) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; this.swap(i, p); i = p; }
    }
    pop() {
      const out = { x: this.x[0], y: this.y[0], e: this.e[0] };
      this.n--;
      if (this.n > 0) {
        this.e[0] = this.e[this.n]; this.s[0] = this.s[this.n]; this.x[0] = this.x[this.n]; this.y[0] = this.y[this.n];
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < this.n && this.less(l, m)) m = l;
          if (r < this.n && this.less(r, m)) m = r;
          if (m === i) break;
          this.swap(i, m); i = m;
        }
      }
      return out;
    }
  }

  // visited marks for one search: per tile Uint8Array; 0 = new, 1..8 = came in via direction k-1, 9 = start
  class Marks {
    constructor(L) { this.L = L; this.t = new Map(); this.n = TS << L; }
    _arr(gx, gy, make) {
      const k = (gx >> 8) * 65536 + (gy >> 8);
      let a = this.t.get(k);
      if (!a && make) { a = new Uint8Array(TS * TS); this.t.set(k, a); }
      return a;
    }
    get(gx, gy) { gx = ((gx % this.n) + this.n) % this.n; const a = this._arr(gx, gy, false); return a ? a[((gy & 255) << 8) | (gx & 255)] : 0; }
    set(gx, gy, v) { gx = ((gx % this.n) + this.n) % this.n; this._arr(gx, gy, true)[((gy & 255) << 8) | (gx & 255)] = v; }
  }

  // ------------------------------------------------------------- the trace
  const DEFAULTS = {
    schedule: [[2, 13], [6, 12], [15, 11], [40, 10], [Infinity, 9]], // [up to km travelled, level]
    minEscapeLevel: 7,      // coarsest cells, only for crossing very large lakes / flats
    maxLevel: 13,
    snapCells: 3,           // look this many cells around the drop for the lowest point (the stream bed)
    cap: 600000,            // cells per fill search
    dryKm2: 3000,           // to get out, the water would flood more dry land than this...
    dryRise: 15,            // ...and rise more than this many metres: an inland basin
    seaDepth: -2,           // cells this far below sea level count as sea when they are near the coast...
    seaNearKm: 10,          // ...within this distance of a mapped sea
    maxKm: 20000,
    maxMs: 120000,
    stickyKm: 40,
    gorgeKm: 25,
    gorgeDrop: 10
  };

  /** Per-cell numbers for one search (distance along the path), per tile. */
  class CellFloats {
    constructor(L) { this.t = new Map(); this.n = TS << L; }
    _arr(gx, gy, make) {
      const k = (gx >> 8) * 65536 + (gy >> 8);
      let a = this.t.get(k);
      if (!a && make) { a = new Float32Array(TS * TS); this.t.set(k, a); }
      return a;
    }
    get(gx, gy) { gx = ((gx % this.n) + this.n) % this.n; const a = this._arr(gx, gy, false); return a ? a[((gy & 255) << 8) | (gx & 255)] : 0; }
    set(gx, gy, v) { gx = ((gx % this.n) + this.n) % this.n; this._arr(gx, gy, true)[((gy & 255) << 8) | (gx & 255)] = v; }
  }

  /**
   * Trace downstream from a point (Web Mercator metres).
   * The route is found stretch by stretch. In each stretch a priority-flood spreads from the start
   * cell, always taking the lowest cell on its edge next: on a slope that means going straight
   * downhill; in a hollow it means filling the hollow until it overflows. When the water has
   * travelled far enough for this cell size, the stretch ends and the next one starts with
   * bigger cells.
   * nearSeaKm(lon, lat) → km to the nearest mapped sea (used only for cells below sea level).
   * Returns { coords:[[x,y]...], km, end:{type:'sea'|'terminal'|'inland'|'lost', feature, x, y}, stats }.
   */
  async function trace(store, start, nearSeaKm, options, onProgress, signal) {
    const o = Object.assign({}, DEFAULTS, options || {});
    const t0 = Date.now();
    const check = () => {
      if (signal && signal.aborted) { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; }
    };
    const stats = { stretches: 0, cells: 0, escalations: 0, gorgeRetries: 0, levels: new Set() };
    const coords = [];
    let km = 0;
    const levelFor = d => { for (const [lim, L] of o.schedule) if (d < lim) return L; return o.schedule[o.schedule.length - 1][1]; };
    const nextLimit = d => { for (const [lim] of o.schedule) if (d < lim) return lim; return Infinity; };
    const seaMemo = new Map();

    const zLoad = async (L, gx, gy) => {
      let z = store.z(L, gx, gy);
      if (z === undefined) { await store.need(L, gx, gy, signal); z = store.z(L, gx, gy); }
      return z;
    };
    const isSeaCell = (L, gx, gy, z) => {
      const f = store.feature(L, gx, gy);
      if (f && (f.kind === 'sea' || f.kind === 'river')) return { type: 'sea', feature: f };
      if (f && f.kind === 'terminal') return { type: 'terminal', feature: f };
      if (z < o.seaDepth && nearSeaKm) {
        const key = L + ':' + (gx >> 2) + ':' + (gy >> 2);
        let near = seaMemo.get(key);
        if (near === undefined) { const c = centreOf(gx, gy, L), ll = toLonLat(c[0], c[1]); near = nearSeaKm(ll[0], ll[1]) <= o.seaNearKm; seaMemo.set(key, near); }
        if (near) return { type: 'sea', feature: null };
      }
      return null;
    };
    const push = (gx, gy, L) => {
      const c = centreOf(gx, gy, L);
      if (coords.length) {
        const p = coords[coords.length - 1];
        const lat = toLonLat(c[0], c[1])[1];
        km += Math.hypot(c[0] - p[0], c[1] - p[1]) * Math.cos(lat * Math.PI / 180) / 1000;
      }
      coords.push(c);
    };

    /**
     * One stretch: priority-flood from (gx0, gy0) at level L.
     * Ends with 'handoff' (travelled stretchKm and going downhill), 'sea', 'terminal',
     * 'dry' (an inland basin), 'capped' (too many cells) or 'timeout'.
     */
    async function stretch(L, gx0, gy0, stretchKm) {
      stats.stretches++; stats.levels.add(L);
      const marks = new Marks(L), dist = new CellFloats(L), heap = new Heap();
      const z0 = await zLoad(L, gx0, gy0);
      marks.set(gx0, gy0, 9);
      heap.push(gx0, gy0, z0);
      const EPS = 1e-3;
      let level = z0 + 2 * EPS;              // current water level
      // a "hollow" runs from the lowest ground the water has reached (base) until it finds lower ground;
      // the beds of mapped lakes don't count as ground, so a deep lake still drains normally
      let base = z0 + 2 * EPS, top = z0, epPops = 0, epDry = 0, epX = gx0, epY = gy0, total = 0;
      let lastTile = '';
      const back = (gx, gy) => {
        const cells = [];
        let x = gx, y = gy, guard = 0;
        for (;;) {
          cells.push([x, y]);
          const m = marks.get(x, y);
          if (m === 9 || m === 0 || ++guard > 1e7) break;
          x -= DX[m - 1]; y -= DY[m - 1];
        }
        return cells.reverse();
      };
      while (heap.n) {
        const c = heap.pop();
        const d = dist.get(c.x, c.y);
        const s = isSeaCell(L, c.x, c.y, c.e);
        if (s) return Object.assign({ gx: c.x, gy: c.y, path: back(c.x, c.y) }, s);
        const f = store.feature(L, c.x, c.y);
        const inLake = !!(f && f.kind === 'lake');
        if (c.e < level - EPS) level = c.e; else if (c.e > level) level = c.e;
        if (!inLake && c.e < base - EPS) {
          // new lowest ground: real progress downstream
          base = c.e; top = c.e; epPops = 0; epDry = 0; epX = c.x; epY = c.y;
          if (d >= stretchKm) return { type: 'handoff', gx: c.x, gy: c.y, z: c.e, path: back(c.x, c.y) };
          const tk = (c.x >> 8) + '/' + (c.y >> 8);
          if (tk !== lastTile) {   // fetch the tiles around the front before we need them
            lastTile = tk;
            for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) store.prefetch(L, (c.x >> 8) + a, (c.y >> 8) + b);
          }
        } else {
          if (level > top) top = level;
          epPops++;
          if (!inLake) epDry++;
          const cellKm2 = Math.pow(groundRes(c.y, L) / 1000, 2);
          if (epDry * cellKm2 > o.dryKm2 && top - base > o.dryRise) return { type: 'dry', gx: epX, gy: epY, z: base, path: back(epX, epY), dryKm2: epDry * cellKm2, rise: top - base };
        }
        total++; stats.cells++;
        if (epPops > o.cap || total > o.cap * 3) return { type: 'capped', gx: epX, gy: epY, z: base, path: back(epX, epY) };
        if ((total & 2047) === 0) {
          check();
          if (Date.now() - t0 > o.maxMs) return { type: 'timeout' };
          if (onProgress) onProgress({ km: km + d, level: L, tiles: store.fetched });
        }
        const glat = groundRes(c.y, L) / 1000;
        for (let k = 0; k < 8; k++) {
          const nx = c.x + DX[k], ny = c.y + DY[k];
          if (marks.get(nx, ny)) continue;
          const z = await zLoad(L, nx, ny);
          if (Number.isNaN(z)) continue;
          marks.set(nx, ny, k + 1);
          dist.set(nx, ny, d + DL[k] * glat);
          heap.push(nx, ny, z);
        }
      }
      return { type: 'capped', gx: epX, gy: epY, z: base, path: back(epX, epY) };
    }

    // ---- start: the lowest cell close to the drop (the stream bed)
    let L = levelFor(0);
    let [gx, gy] = cellOf(start[0], start[1], L);
    {
      let best = null;
      for (let dy = -o.snapCells; dy <= o.snapCells; dy++) for (let dx = -o.snapCells; dx <= o.snapCells; dx++) {
        if (dx * dx + dy * dy > o.snapCells * o.snapCells) continue;
        const z = await zLoad(L, gx + dx, gy + dy);
        if (Number.isNaN(z)) continue;
        if (!best || z < best.z) best = { gx: gx + dx, gy: gy + dy, z };
      }
      if (!best) return finish({ type: 'lost', reason: 'no elevation here' });
      coords.push(start.slice());
      gx = best.gx; gy = best.gy;
      stats.startZ = best.z;
    }
    push(gx, gy, L);

    let forced = null;          // {level, km}: a temporary cell size after a big lake or a gorge
    const triedFiner = new Set();
    const addPath = (path, lev) => { for (let i = 1; i < path.length; i++) push(path[i][0], path[i][1], lev); };

    for (;;) {
      check();
      if (Date.now() - t0 > o.maxMs) return finish({ type: 'lost', reason: 'took too long' });
      if (km > o.maxKm) return finish({ type: 'lost', reason: 'too far' });
      let want = levelFor(km), limit = nextLimit(km);
      if (forced) { want = forced.level; limit = forced.untilKm; }
      if (want !== L) { const c = centreOf(gx, gy, L); L = want; [gx, gy] = cellOf(c[0], c[1], L); }
      const r = await stretch(L, gx, gy, Math.max(0.5, limit - km));
      if (r.type === 'timeout') return finish({ type: 'lost', reason: 'took too long' });
      if (r.path) addPath(r.path, L);
      if (r.gx !== undefined) { gx = r.gx; gy = r.gy; }
      if (r.type === 'sea' || r.type === 'terminal') return finish({ type: r.type, feature: r.feature, gx, gy, L });
      if (r.type === 'handoff') {
        if (forced && km >= forced.untilKm && !(r.z >= forced.untilBelow)) forced = null;
        if (onProgress) onProgress({ km, level: L, tiles: store.fetched });
        continue;
      }

      // 'dry' or 'capped': stuck in a very big lake/flat, a closed basin, or behind a gorge we can't see
      let escaped = false;
      for (let L2 = L - 1; L2 >= o.minEscapeLevel && !escaped; L2--) {
        stats.escalations++;
        const c = centreOf(gx, gy, L), [cx, cy] = cellOf(c[0], c[1], L2);
        const r2 = await stretch(L2, cx, cy, o.stickyKm);
        if (r2.type === 'timeout') return finish({ type: 'lost', reason: 'took too long' });
        if (r2.type === 'handoff' || r2.type === 'sea' || r2.type === 'terminal') {
          addPath(r2.path, L2);
          L = L2; gx = r2.gx; gy = r2.gy;
          if (r2.type !== 'handoff') return finish({ type: r2.type, feature: r2.feature, gx, gy, L });
          forced = { level: L2, untilKm: km + 5 };
          escaped = true;
        }
      }
      if (escaped) continue;
      const c = centreOf(gx, gy, L), ll = toLonLat(c[0], c[1]);
      const spot = Math.round(ll[0] * 20) + ':' + Math.round(ll[1] * 20);
      if (!triedFiner.has(spot) && L < o.maxLevel) {
        triedFiner.add(spot);
        stats.gorgeRetries++;
        const Lf = Math.min(o.maxLevel, L + 2);
        // stay on the smaller cells until the water is clearly below where it got stuck
        forced = { level: Lf, untilKm: km + o.gorgeKm, untilBelow: (r.z !== undefined ? r.z : Infinity) - o.gorgeDrop };
        continue;
      }
      return finish({ type: 'inland', gx, gy, L, dryKm2: r.dryKm2 });
    }

    function finish(end) {
      if (end.gx !== undefined) {
        const c = centreOf(end.gx, end.gy, end.L);
        end.x = c[0]; end.y = c[1];
        delete end.gx; delete end.gy; delete end.L;
      } else if (coords.length) {
        end.x = coords[coords.length - 1][0]; end.y = coords[coords.length - 1][1];
      }
      stats.levels = [...stats.levels].sort((a, b) => a - b);
      stats.ms = Date.now() - t0;
      stats.tiles = store.fetched;
      return { coords, km, end, stats };
    }
  }

  /** Douglas-Peucker in place-friendly form (returns new array). */
  function simplify(coords, tol) {
    if (coords.length < 3) return coords.slice();
    const keep = new Uint8Array(coords.length);
    keep[0] = keep[coords.length - 1] = 1;
    const stack = [[0, coords.length - 1]];
    const t2 = tol * tol;
    while (stack.length) {
      const [a, b] = stack.pop();
      const [ax, ay] = coords[a], [bx, by] = coords[b];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      let md = -1, mi = -1;
      for (let i = a + 1; i < b; i++) {
        const [px, py] = coords[i];
        let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        const ex = ax + t * dx - px, ey = ay + t * dy - py, d = ex * ex + ey * ey;
        if (d > md) { md = d; mi = i; }
      }
      if (md > t2) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    return coords.filter((_, i) => keep[i]);
  }

  const api = { VERSION, ORIGIN, RES0, TS, res, toLonLat, toMerc, cellOf, centreOf, prepareFeatures, rasterizeTile, TileStore, Heap, trace, simplify, DEFAULTS };
  root.FlowEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
