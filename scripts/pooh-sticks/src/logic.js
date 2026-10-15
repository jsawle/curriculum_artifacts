/* River-to-sea logic: snapping, downstream tracing, sea finding, answer options.
   Pure JavaScript (no ArcGIS SDK) so it can be unit-tested in Node.
   Geometry from the river service is Web Mercator (wkid 102100, metres).
   Sea polygons are lon/lat (Natural Earth, public domain). */
(function (root) {
  'use strict';

  const MODEL_VERSIONS = {
    snap:    { name: 'Stream snap',      version: '1.0', what: 'Finds the stream nearest to where the stick was dropped.' },
    trace:   { name: 'Downstream trace', version: '1.0', what: 'Follows each river section to the next one downstream until the water stops.' },
    sea:     { name: 'Sea finder',       version: '1.1', what: 'Names the sea or ocean at the river mouth, or flags an inland ending. v1.1 fixes distances to seas on the far side of the globe.' },
    options: { name: 'Answer options',   version: '1.0', what: 'Picks the correct answer plus nearby seas as the other choices.' }
  };

  // ---------------------------------------------------------------- geometry
  const R = 6378137;
  function toLonLat(x, y) {
    return [x / R * 180 / Math.PI, (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI];
  }
  function toMerc(lon, lat) {
    const la = Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180;
    return [lon * Math.PI / 180 * R, R * Math.log(Math.tan(Math.PI / 4 + la / 2))];
  }
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    const x = ax + t * dx, y = ay + t * dy;
    return { d: Math.hypot(px - x, py - y), t, x, y };
  }
  /** Nearest location on a polyline's paths to (x,y). */
  function nearestOnPaths(paths, x, y) {
    let best = null;
    paths.forEach((p, pi) => {
      for (let i = 0; i < p.length - 1; i++) {
        const r = segDist(x, y, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
        if (!best || r.d < best.d) best = { d: r.d, pathIdx: pi, segIdx: i, t: r.t, x: r.x, y: r.y };
      }
      if (p.length === 1) {
        const d = Math.hypot(x - p[0][0], y - p[0][1]);
        if (!best || d < best.d) best = { d, pathIdx: pi, segIdx: 0, t: 0, x: p[0][0], y: p[0][1] };
      }
    });
    return best;
  }
  function lineLength(coords) {
    let s = 0;
    for (let i = 1; i < coords.length; i++) s += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    return s;
  }
  function flatten(paths) {
    const out = [];
    paths.forEach(p => p.forEach(c => out.push([c[0], c[1]])));
    return out;
  }

  /** Pick the feature closest to (x,y). features: [{attributes, geometry:{paths}}] */
  function chooseNearest(features, x, y) {
    let best = null;
    for (const f of features) {
      if (!f.geometry || !f.geometry.paths) continue;
      const n = nearestOnPaths(f.geometry.paths, x, y);
      if (n && (!best || n.d < best.near.d)) best = { feature: f, near: n };
    }
    return best;
  }

  // --------------------------------------------------------------- sea finder
  const RIVERISH = /\briver\b|^amazon$|^yangtze$/i;

  function buildSeaIndex(raw) {
    const byName = new Map();
    for (const s of raw) {
      let e = byName.get(s.n);
      if (!e) {
        e = { name: s.n, cls: s.c, rank: s.r, polys: [], bbox: [Infinity, Infinity, -Infinity, -Infinity] };
        byName.set(s.n, e);
      }
      e.rank = Math.min(e.rank, s.r);
      for (const poly of s.p) {
        e.polys.push(poly);
        const ring = poly[0];
        for (let i = 0; i < ring.length; i += 2) {
          if (ring[i] < e.bbox[0]) e.bbox[0] = ring[i];
          if (ring[i + 1] < e.bbox[1]) e.bbox[1] = ring[i + 1];
          if (ring[i] > e.bbox[2]) e.bbox[2] = ring[i];
          if (ring[i + 1] > e.bbox[3]) e.bbox[3] = ring[i + 1];
        }
      }
    }
    const list = [...byName.values()];
    list.forEach(e => {
      e.isOcean = e.cls === 'ocean';
      e.isRiver = e.cls === 'river' || RIVERISH.test(e.name);
    });
    return list;
  }

  function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // Local equirectangular km projection around (lon0, lat0); fine for the short distances we care about.
  function kmXY(lon, lat, lon0, lat0) {
    let dl = lon - lon0;
    if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
    return [dl * 111.32 * Math.cos(lat0 * Math.PI / 180), (lat - lat0) * 110.57];
  }
  function bboxDistKm(b, lon, lat) {
    const cl = Math.max(b[0], Math.min(b[2], lon)), ca = Math.max(b[1], Math.min(b[3], lat));
    const p = kmXY(cl, ca, lon, lat);
    return Math.hypot(p[0], p[1]);
  }
  function distToSeaKm(sea, lon, lat, cutoff) {
    if (bboxDistKm(sea.bbox, lon, lat) > cutoff) return Infinity;
    let best = Infinity;
    for (const poly of sea.polys) {
      if (pointInRing(lon, lat, poly[0])) {
        let inHole = false;
        for (let h = 1; h < poly.length; h++) if (pointInRing(lon, lat, poly[h])) { inHole = true; break; }
        if (!inHole) return 0;
      }
      const kx = 111.32 * Math.cos(lat * Math.PI / 180);
      for (const ring of poly) {
        for (let i = 2; i < ring.length; i += 2) {
          // wrap each segment as a whole (never vertex by vertex), so a segment near the far side of the
          // globe is not split and drawn straight through the point
          let da = ring[i - 2] - lon, db = ring[i] - lon;
          const mid = (da + db) / 2, k = mid > 180 ? -360 : mid < -180 ? 360 : 0;
          da += k; db += k;
          const r = segDist(0, 0, da * kx, (ring[i - 1] - lat) * 110.57, db * kx, (ring[i + 1] - lat) * 110.57);
          if (r.d < best) best = r.d;
        }
      }
    }
    return best;
  }

  /**
   * Which sea/ocean is at this river mouth?
   * - nearest named marine polygon within `coastKm` wins;
   * - if that is a river-mouth polygon (e.g. "Amazon", "Saint Lawrence River"), keep going to the
   *   nearest proper sea within `estuaryKm`;
   * - nothing within `coastKm` → inland ending (the water never reaches the sea).
   */
  function findSea(index, lon, lat, opts) {
    const coastKm = (opts && opts.coastKm) || 100;
    const estuaryKm = (opts && opts.estuaryKm) || 800;
    const scored = index.map(s => ({ s, d: distToSeaKm(s, lon, lat, estuaryKm) }))
      .filter(x => isFinite(x.d)).sort((a, b) => a.d - b.d);
    if (!scored.length || scored[0].d > coastKm) return { inland: true, nearest: scored[0] ? scored[0].s : null, distKm: scored[0] ? scored[0].d : null };
    if (!scored[0].s.isRiver) return { inland: false, sea: scored[0].s, distKm: scored[0].d };
    // The mouth is inside a river-shaped polygon: use the sea that this polygon opens into
    // (the proper sea closest to any of its vertices), not the sea nearest the outlet itself.
    const river = scored[0].s;
    const verts = [];
    river.polys.forEach(p => { const ring = p[0]; for (let i = 0; i < ring.length; i += 2) verts.push([ring[i], ring[i + 1]]); });
    let best = null;
    for (const cand of index) {
      if (cand.isRiver) continue;
      let d = Infinity;
      for (const v of verts) {
        const dv = distToSeaKm(cand, v[0], v[1], d === Infinity ? 50 : d);
        if (dv < d) d = dv;
        if (d === 0) break;
      }
      if (d > 50) continue;
      const fromMouth = (scored.find(x => x.s === cand) || { d: Infinity }).d;
      if (!best || d < best.d - 0.5 || (Math.abs(d - best.d) <= 0.5 && fromMouth < best.fromMouth)) best = { s: cand, d, fromMouth };
    }
    if (best) return { inland: false, sea: best.s, distKm: scored[0].d, via: river };
    return { inland: true, nearest: river, distKm: scored[0].d };
  }

  const INLAND_LABEL = 'It never reaches the sea (it ends in an inland lake or basin)';

  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Four choices: the answer, nearby seas as distractors, and always the "never reaches the sea" option.
   * If the answer is a sea/gulf/bay (not an ocean), oceans are left out of the distractors because they
   * would also be "sort of right" (the Gulf of Mexico is part of the Atlantic, for example).
   */
  function pickOptions(index, answerSea, dropLon, dropLat, rng) {
    rng = rng || Math.random;
    const okClass = s => ['ocean', 'sea', 'gulf', 'bay'].includes(s.cls) || (['channel', 'strait'].includes(s.cls) && s.rank <= 3);
    let pool = index.filter(s => !s.isRiver && okClass(s) && s.rank <= 4 && (!answerSea || s.name !== answerSea.name));
    if (answerSea && !answerSea.isOcean) pool = pool.filter(s => !s.isOcean);
    const ranked = pool.map(s => ({ s, d: distToSeaKm(s, dropLon, dropLat, 25000) }))
      .sort((a, b) => a.d - b.d);
    const want = answerSea ? 2 : 3;
    const distractors = ranked.slice(0, want).map(x => ({ label: x.s.name, correct: false, sea: x.s }));
    const seas = answerSea ? [{ label: answerSea.name, correct: true, sea: answerSea }, ...distractors] : distractors;
    const opts = shuffle(seas, rng);
    opts.push({ label: INLAND_LABEL, correct: !answerSea, inland: true });
    return opts;
  }

  // -------------------------------------------------------------------- trace
  async function pool(tasks, n) {
    const out = new Array(tasks.length);
    let i = 0;
    async function worker() {
      while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); }
    }
    await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
    return out;
  }

  function layerForOrder(net, order) {
    return net.layers.find(l => order >= l.min && order <= l.max) || net.layers[0];
  }
  function layersFromOrder(net, order) {
    return net.layers.filter(l => l.max >= order);
  }
  function halfWindow(net, order) {
    const w = net.windows;
    for (const [maxOrder, half] of w) if (order <= maxOrder) return half;
    return w[w.length - 1][1];
  }

  /**
   * Follow the river from `start` (a feature with attributes + geometry) to where the water stops.
   * q(layerId, params, signal) → ArcGIS REST query JSON.
   * snap: {pathIdx, segIdx, x, y} position on the start feature where the stick went in.
   */
  async function trace(net, start, snap, q, onProgress, signal) {
    const F = net.fields;
    const recs = new Map();
    const fieldList = [F.id, F.dn, F.order, F.basin, F.len, F.area].concat(F.endo ? [F.endo] : []).join(',');
    const add = f => {
      const a = f.attributes, id = a[F.id];
      let r = recs.get(id);
      if (!r) {
        r = { id, dn: a[F.dn], order: a[F.order], basin: a[F.basin], len: a[F.len], area: a[F.area], endo: F.endo ? a[F.endo] : null, geom: null };
        recs.set(id, r);
      }
      if (f.geometry && f.geometry.paths && f.geometry.paths.length && !r.geom) r.geom = f.geometry.paths;
      return r;
    };
    const check = () => { if (signal && signal.aborted) { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; } };
    let requests = 0;
    const query = async (layerId, params) => { check(); requests++; const j = await q(layerId, params, signal); check(); return j; };

    async function pagedQuery(layerId, params, maxPages) {
      const all = [];
      for (let page = 0; page < (maxPages || 10); page++) {
        const j = await query(layerId, Object.assign({}, params, { resultOffset: page * net.pageSize, resultRecordCount: net.pageSize, orderByFields: net.oidField }));
        (j.features || []).forEach(f => all.push(f));
        if (!j.exceededTransferLimit) break;
      }
      return all;
    }

    async function fetchWindow(cx, cy, order, basin) {
      const h = halfWindow(net, order);
      const env = { xmin: cx - h, ymin: cy - h, xmax: cx + h, ymax: cy + h, spatialReference: { wkid: 102100 } };
      const where = `${F.basin}=${Number(basin)} AND ${F.order}>=${Number(order)}`;
      const tasks = layersFromOrder(net, order).map(l => () => pagedQuery(l.id, {
        where, geometry: JSON.stringify(env), geometryType: 'esriGeometryEnvelope', inSR: 102100,
        spatialRel: 'esriSpatialRelIntersects', outFields: fieldList, returnGeometry: true,
        outSR: 102100, maxAllowableOffset: l.off, geometryPrecision: 0
      }, 8));
      const res = await pool(tasks, 6);
      res.forEach(fs => fs.forEach(add));
    }

    async function bulkBasin(basin, order) {
      const where = `${F.basin}=${Number(basin)} AND ${F.order}>=${Number(order)}`;
      for (const l of layersFromOrder(net, order)) {
        const c = await query(l.id, { where, returnCountOnly: true });
        const n = c.count || 0;
        if (n > net.bulkMax) return false; // too big: fall back to windows
        const pages = Math.ceil(n / net.pageSize);
        const tasks = Array.from({ length: pages }, (_, p) => () => query(l.id, {
          where, outFields: fieldList, returnGeometry: false,
          resultOffset: p * net.pageSize, resultRecordCount: net.pageSize, orderByFields: net.oidField
        }));
        const res = await pool(tasks, 6);
        res.forEach(j => (j.features || []).forEach(add));
      }
      return true;
    }

    async function fetchById(id, order) {
      const tasks = layersFromOrder(net, Math.max(1, order)).map(l => () => query(l.id, {
        where: `${F.id}=${Number(id)}`, outFields: fieldList, returnGeometry: true,
        outSR: 102100, maxAllowableOffset: l.off, geometryPrecision: 0
      }));
      const res = await pool(tasks, 6);
      res.forEach(j => (j.features || []).forEach(add));
      return recs.get(id) || null;
    }

    async function fillGeometry(path) {
      const missing = path.filter(r => !r.geom);
      const groups = new Map();
      missing.forEach(r => {
        const l = layerForOrder(net, r.order);
        if (!groups.has(l.id)) groups.set(l.id, { l, ids: [] });
        groups.get(l.id).ids.push(r.id);
      });
      const tasks = [];
      groups.forEach(({ l, ids }) => {
        for (let i = 0; i < ids.length; i += net.idChunk) {
          const chunk = ids.slice(i, i + net.idChunk);
          tasks.push(() => query(l.id, {
            where: `${F.id} IN (${chunk.map(Number).join(',')})`, outFields: F.id, returnGeometry: true,
            outSR: 102100, maxAllowableOffset: l.off, geometryPrecision: 0, resultRecordCount: net.pageSize
          }));
        }
      });
      const res = await pool(tasks, 6);
      res.forEach(j => (j.features || []).forEach(f => {
        const r = recs.get(f.attributes[F.id]);
        if (r && !r.geom && f.geometry) r.geom = f.geometry.paths;
      }));
    }

    const endPoint = r => { const p = r.geom[r.geom.length - 1]; return p[p.length - 1]; };

    const first = add(start);
    const path = [first];
    const seen = new Set([first.id]);
    const windowsDone = new Set();
    let bulkTried = false, singleLookups = 0;
    let cur = first, lastWithGeom = first, reason = 'outlet';

    while (true) {
      check();
      if (net.isOutlet(cur.dn)) { reason = 'outlet'; break; }
      let nx = recs.get(cur.dn);
      if (!nx && cur.order >= net.bulkFromOrder && !bulkTried) {
        bulkTried = true;
        await bulkBasin(cur.basin, cur.order);
        nx = recs.get(cur.dn);
      }
      if (!nx && lastWithGeom.geom) {
        const e = endPoint(lastWithGeom);
        const key = `${Math.round(e[0] / 500)}:${Math.round(e[1] / 500)}:${cur.order}`;
        if (!windowsDone.has(key)) {
          windowsDone.add(key);
          await fetchWindow(e[0], e[1], cur.order, cur.basin);
          nx = recs.get(cur.dn);
        }
      }
      if (!nx) {
        if (++singleLookups > 150) { reason = 'missing'; break; } // don't crawl one section at a time forever
        nx = await fetchById(cur.dn, cur.order);
      }
      if (!nx) { reason = 'missing'; break; }
      if (seen.has(nx.id)) { reason = 'loop'; break; }
      seen.add(nx.id);
      path.push(nx);
      cur = nx;
      if (nx.geom) lastWithGeom = nx;
      if (onProgress && path.length % 25 === 0) onProgress({ sections: path.length, requests });
      if (path.length >= net.maxSections) { reason = 'limit'; break; }
    }

    await fillGeometry(path);
    if (onProgress) onProgress({ sections: path.length, requests, done: true });
    return Object.assign(buildRoute(path, snap), { reason, requests });
  }

  /** Join section geometries into one downstream line, starting at the snap point. */
  function buildRoute(path, snap) {
    const lines = path.map(r => (r.geom ? flatten(r.geom) : []));
    // Orient each line so it flows on from the previous one.
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (L.length < 2) continue;
      let ref = null;
      if (i > 0) { for (let k = i - 1; k >= 0; k--) if (lines[k].length) { ref = lines[k][lines[k].length - 1]; break; } }
      if (ref) {
        const dFirst = Math.hypot(L[0][0] - ref[0], L[0][1] - ref[1]);
        const dLast = Math.hypot(L[L.length - 1][0] - ref[0], L[L.length - 1][1] - ref[1]);
        if (dLast < dFirst) L.reverse();
      } else {
        const nxt = lines.slice(i + 1).find(n => n.length);
        if (nxt) {
          const near = (p) => Math.min(Math.hypot(p[0] - nxt[0][0], p[1] - nxt[0][1]), Math.hypot(p[0] - nxt[nxt.length - 1][0], p[1] - nxt[nxt.length - 1][1]));
          if (near(L[0]) < near(L[L.length - 1])) { L.reverse(); lines[i].reversedFirst = true; }
        }
      }
    }
    // Trim the first section so the route starts where the stick went in.
    const firstLine = lines[0] || [];
    let startCoords = firstLine;
    let firstFraction = 1;
    if (snap && firstLine.length >= 2) {
      const n = nearestOnPaths([firstLine], snap.x, snap.y);
      startCoords = [[n.x, n.y]].concat(firstLine.slice(n.segIdx + 1));
      const total = lineLength(firstLine);
      firstFraction = total > 0 ? lineLength(startCoords) / total : 1;
    }
    const coords = startCoords.slice();
    for (let i = 1; i < lines.length; i++) {
      const L = lines[i];
      if (!L.length) continue;
      const last = coords[coords.length - 1];
      const startAt = last && L[0][0] === last[0] && L[0][1] === last[1] ? 1 : 0;
      for (let k = startAt; k < L.length; k++) coords.push(L[k]);
    }
    let km = (path[0].len || 0) * firstFraction;
    for (let i = 1; i < path.length; i++) km += path[i].len || 0;
    const last = path[path.length - 1];
    return {
      coords,
      lengthKm: km,
      sections: path.length,
      startOrder: path[0].order,
      endOrder: path.reduce((m, r) => Math.max(m, r.order || 0), 0),
      mouthAreaKm2: last.area,
      endorheicFlag: last.endo,
      mouth: coords.length ? coords[coords.length - 1] : null,
      missingGeometry: path.filter(r => !r.geom).length
    };
  }

  const api = {
    MODEL_VERSIONS, toLonLat, toMerc, nearestOnPaths, lineLength, chooseNearest,
    buildSeaIndex, findSea, distToSeaKm, pickOptions, INLAND_LABEL, trace, buildRoute,
    layerForOrder, layersFromOrder, pool
  };
  root.RiverLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
