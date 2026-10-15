// Tile store checks (node tools/test_tilestore.js): needed tiles jump ahead of prefetches, the prefetch queue is
// capped, close() stops everything and wakes waiting traces with AbortError, and a new store starts empty.
const assert = require('assert');
const FE = require('../src/flow.js');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const started = [];
  let release = [];
  const fetchElev = (L, tx, ty, signal) => new Promise((resolve, reject) => {
    started.push(L + '/' + tx + '/' + ty);
    release.push(() => resolve(new Float32Array(65536)));
    if (signal) signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
  });
  const s = new FE.TileStore(fetchElev, [], { maxConcurrent: 2, maxPrefetchQueue: 5 });
  for (let i = 0; i < 12; i++) s.prefetch(10, 100 + i, 200);
  assert.strictEqual(started.length, 2, 'only 2 downloads at once');
  assert.strictEqual(s.later.length, 5, 'prefetch queue capped at 5 (oldest dropped)');
  const need = s.ensure(10, 500, 500);                 // the trace needs this one now
  release.shift()();                                   // one download finishes → the next to start must be the needed tile
  await wait(5);
  assert.strictEqual(started[2], '10/500/500', 'needed tile jumps ahead of prefetches: ' + started.join(' '));
  // a queued prefetch the trace then needs is promoted
  const queuedKey = s.later[0];
  const promoted = s.ensure(10, 107, 200);
  assert.ok(s.urgent.length === 1 || started.includes('10/107/200'), 'queued prefetch promoted');
  // close(): waiting traces get AbortError, nothing new starts
  const before = started.length;
  s.close();
  await assert.rejects(need, e => e.name === 'AbortError', 'trace waiting on a running download is woken');
  await assert.rejects(promoted, e => e.name === 'AbortError', 'trace waiting on a queued download is woken');
  release.forEach(f => f()); release = [];
  await wait(5);
  assert.strictEqual(started.length, before, 'nothing starts after close');
  await assert.rejects(s.ensure(10, 1, 1), e => e.name === 'AbortError', 'closed store refuses new work');
  // a new store starts empty, so the next stick never sees the last one's tiles or failures
  const s2 = new FE.TileStore(async () => null, []);
  assert.strictEqual(s2.tiles.size, 0);
  const t = await s2.ensure(10, 3, 3);
  assert.strictEqual(t.z, null, 'a tile that really has no data is no data');
  console.log('TILE STORE TESTS PASSED (flow v' + FE.VERSION.flow + ')');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
