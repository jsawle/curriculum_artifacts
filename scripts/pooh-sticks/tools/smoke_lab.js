// Lab page test: dist/pooh-sticks-lab.html in jsdom, with a stand-in for Esri's Trace Downstream REST service.
// Checks: a working key traces via the service; a refused key, a failed job and no key all fall back to our model and say why.
const assert = require('assert');
const { load, wait, until, FE } = require('./smoke_ui.js');

// stand-in service: answers like hydro.arcgis.com .../TraceDownstream (submitJob → job status → results)
function fakeHydro(win, mode) {
  win.__hydro = [];
  win.fetch = async (url, opts) => {
    const u = new URL(url), q = opts && opts.body ? new URLSearchParams(opts.body.toString()) : u.searchParams;
    win.__hydro.push(u.pathname.split('/').slice(-2).join('/') + (q.get('DataSourceResolution') ? ' res=' + q.get('DataSourceResolution') : ''));
    assert.ok(u.href.startsWith('https://hydro.arcgis.com/arcgis/rest/services/Tools/Hydrology/GPServer/TraceDownstream'), u.href);
    const json = o => ({ ok: true, status: 200, json: async () => o });
    if (q.get('token') !== 'GOODKEY' || mode === 'refused') return json({ error: { code: 498, message: 'Invalid token.' } });
    if (u.pathname.endsWith('/submitJob')) {
      const pts = JSON.parse(q.get('InputPoints'));
      win.__input = pts.features[0].geometry;
      return json({ jobId: 'j1', jobStatus: 'esriJobSubmitted' });
    }
    if (u.pathname.endsWith('/jobs/j1')) return json({ jobId: 'j1', jobStatus: mode === 'failed' ? 'esriJobFailed' : 'esriJobSucceeded', messages: mode === 'failed' ? [{ type: 'esriJobMessageTypeError', description: 'Point is outside the data.' }] : [] });
    if (u.pathname.endsWith('/results/OutputTraceLine')) {
      // a line due south from the drop to the English Channel, in Web Mercator as asked for
      const a = FE.toMerc(win.__input.x, win.__input.y), b = FE.toMerc(win.__input.x, 50.65);
      return json({ paramName: 'OutputTraceLine', value: { spatialReference: { wkid: 102100, latestWkid: 3857 }, features: [{ attributes: { PointID: 1, LengthKm: 48.1 }, geometry: { paths: [[a, [a[0] + 300, (a[1] + b[1]) / 2], b]] } }] } });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

async function dropAndReveal(win, $, label) {
  const pb = FE.toMerc(0.097407, 51.084674);
  win.__view.handlers.click({ mapPoint: new win.__Point({ x: pb[0], y: pb[1] }) });
  await until(() => !$('#stepPredict').hidden || !$('#readyMsg').hidden, 'predict ' + label);
  assert.ok($('#readyMsg').hidden, label + ': ' + $('#readyMsg').textContent);
  const labs = [...win.document.querySelectorAll('#choices label')].map(l => l.textContent);
  const r = [...win.document.querySelectorAll('#choices input')][labs.indexOf('English Channel')];
  r.checked = true; r.dispatchEvent(new win.Event('change', { bubbles: true }));
  $('#goBtn').click();
  await until(() => !$('#stepReveal').hidden, 'reveal ' + label);
  return { note: $('#labNote').textContent, result: $('#resultBox').textContent, facts: $('#facts').textContent, how: $('#howList').textContent };
}

(async () => {
  // 1. a working key: the route comes from the service
  let { win, $, errors } = load(true, 'pooh-sticks-lab.html', w => { fakeHydro(w, 'ok'); w.localStorage.setItem('poohSticks.lab.apiKey', 'GOODKEY'); });
  await until(() => win.__view, 'view');
  await wait(50);
  assert.ok(!$('#labBox').hidden, 'lab panel shows on the lab page');
  assert.ok(win.document.title.endsWith('(lab)') && $('#foot').textContent.includes('lab 0.1'));
  assert.ok($('#labKeyState').textContent.includes('saved in this browser'));
  assert.ok(win.document.querySelector('input[name="engine"][value="esri"]').checked, 'Esri engine is the lab default');
  let out = await dropAndReveal(win, $, 'esri');
  console.log('esri:', out.note, '|', out.result.slice(0, 90));
  assert.ok(out.note.startsWith('Traced by Esri Trace Downstream in'), out.note);
  assert.ok(out.facts.includes('Traced byEsri Trace Downstream'), out.facts);
  assert.ok(out.how.includes('Esri Trace Downstream (lab)') && out.how.includes('USGS data in the US'), out.how);
  assert.ok(out.result.includes('English Channel'));
  assert.ok(win.__hydro.some(h => h.includes('submitJob res=FINEST')), win.__hydro.join(' | '));
  assert.ok(Math.abs(win.__input.x - 0.097407) < 1e-6, 'the drop point is what was sent');
  $('#aboutBtn').click();
  assert.ok($('#aboutBody').textContent.includes('Esri Trace Downstream (lab)') && $('#aboutBody').textContent.includes('Lab version'));
  $('#aboutClose').click();
  assert.strictEqual(errors.length, 0, errors.join(' | '));
  win.close();

  // 2. a refused key, 3. a failed job: both fall back to our model and say why
  for (const [mode, expect] of [['refused', 'Invalid token.'], ['failed', 'Point is outside the data.']]) {
    ({ win, $, errors } = load(true, 'pooh-sticks-lab.html', w => { fakeHydro(w, mode); w.localStorage.setItem('poohSticks.lab.apiKey', 'GOODKEY'); }));
    await until(() => win.__view, 'view ' + mode);
    await wait(50);
    out = await dropAndReveal(win, $, mode);
    console.log(mode + ':', out.note);
    assert.ok(out.note.includes('didn\'t work') && out.note.includes(expect) && out.note.includes('Our flow model traced this stick instead') && /Our model took [\d.]+ s/.test(out.note), out.note);
    assert.ok(out.facts.includes('Map squares used') && !out.facts.includes('Traced by'), 'our model did the tracing');
    assert.ok(!$('#labLast').hidden && $('#labLast').textContent === out.note, 'the lab panel shows the same note');
    win.close();
  }

  // 4. no key yet: our model, and the page says so; saving a key from the panel works
  ({ win, $, errors } = load(true, 'pooh-sticks-lab.html', w => fakeHydro(w, 'ok')));
  await until(() => win.__view, 'view nokey');
  await wait(50);
  assert.ok($('#labKeyState').textContent.includes('No key saved'));
  out = await dropAndReveal(win, $, 'nokey');
  console.log('no key:', out.note);
  assert.ok(out.note.startsWith('No API key saved'), out.note);
  $('#labKey').value = 'GOODKEY'; $('#labSave').click();
  assert.ok($('#labKeyState').textContent.includes('saved in this browser') && $('#labKey').value === '', 'key saved and the box cleared');
  assert.strictEqual(win.localStorage.getItem('poohSticks.lab.apiKey'), 'GOODKEY');
  $('#againBtn').click(); await wait(20);
  out = await dropAndReveal(win, $, 'after saving');
  assert.ok(out.note.startsWith('Traced by Esri Trace Downstream'), out.note);
  $('#labForget').click();
  assert.strictEqual(win.localStorage.getItem('poohSticks.lab.apiKey'), null, 'forget removes the key');
  assert.strictEqual(errors.length, 0, errors.join(' | '));
  win.close();

  // 5. the main page has no lab panel and never calls the service
  ({ win, $, errors } = load(true, 'pooh-sticks.html', w => fakeHydro(w, 'ok')));
  await until(() => win.__view, 'view main');
  await wait(50);
  assert.ok($('#labBox').hidden, 'no lab panel on the main page');
  out = await dropAndReveal(win, $, 'main');
  assert.strictEqual(win.__hydro.length, 0, 'main page never calls Trace Downstream');
  assert.ok($('#labNote').hidden);
  win.close();
  console.log('LAB SMOKE TEST PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
