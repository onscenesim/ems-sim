'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createBPHistory, createBPSchedule, trendSVG } = require('../public/monitor');

test('monitor startup cue is first-open only, repeated opens are silent while visible, and a new call resets it', () => {
  const nodes = new Map(), opens = [];
  const node = () => ({
    open: false, hidden: true, dataset: {}, style: {},
    addEventListener() {}, setAttribute() {}, append() {}, before() {}, after() {}, focus() {}, replaceChildren() {},
    querySelector: () => node(), querySelectorAll: () => [],
    showModal() { this.open = true; }, close() { this.open = false; },
  });
  const doc = {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); },
    createComment: () => node(), querySelectorAll: () => [], addEventListener() {},
    defaultView: { addEventListener() {} },
  };
  const view = require('../public/monitor').mount(doc, {
    getPatient: () => ({ id: 'patient_1', label: 'Preview patient' }), getSessionId: () => null,
    canCycleBP: () => false, canScheduleBP: () => false, getMinute: () => 0,
    beforeOpen() {}, resize() {}, onOpen: first => opens.push(first),
  });
  view.open(); view.open();
  assert.deepEqual(opens, [true]);
  view.close(); view.open(); view.close(); view.open();
  assert.deepEqual(opens, [true, false, false]);
  view.reset(); view.open();
  assert.deepEqual(opens, [true, false, false, true]);
});

test('BP schedules become due only when in-game minutes reach the interval', () => {
  const schedule = createBPSchedule();
  assert.equal(schedule.set('patient_1', 3, 6), true);
  assert.equal(schedule.state('patient_1').nextAt, 9);
  assert.equal(schedule.claim('patient_1', 6), null, 'real time passing cannot advance an unchanged game clock');
  assert.equal(schedule.claim('patient_1', 8.99), null);
  assert.ok(schedule.claim('patient_1', 9));
  const source = fs.readFileSync(require.resolve('../public/app'), 'utf8');
  assert.match(source, /getMinute: \(\) => monitorSceneMinute/);
});

test('a simulation time jump creates one BP cycle without overlapping requests or catch-up bursts', () => {
  const schedule = createBPSchedule();
  schedule.set('patient_1', 5, 0);
  const token = schedule.claim('patient_1', 30);
  assert.ok(token);
  assert.equal(schedule.claim('patient_1', 30), null);
  schedule.complete(token, 30.5, true);
  assert.equal(schedule.state('patient_1').nextAt, 35.5);
  assert.equal(schedule.claim('patient_1', 30.5), null);
});

test('schedules stay per patient and switching Off cancels future cycles even during an in-flight cycle', () => {
  const schedule = createBPSchedule();
  schedule.set('patient_1', 2, 0);
  assert.equal(schedule.claim('patient_2', 100), null);
  const token = schedule.claim('patient_1', 2);
  schedule.set('patient_1', 0, 2);
  schedule.complete(token, 3, true);
  assert.equal(schedule.state('patient_1').interval, 0);
  assert.equal(schedule.claim('patient_1', 100), null);
});

test('manual readings rearm the selected schedule and saved controls restore without pending requests', () => {
  const schedule = createBPSchedule();
  schedule.set('patient_1', 5, 1);
  schedule.rearm('patient_1', 4);
  assert.equal(schedule.state('patient_1').nextAt, 9);
  schedule.claim('patient_1', 9);
  const restored = createBPSchedule();
  restored.restore(schedule.snapshot());
  assert.equal(restored.state('patient_1').pending, false);
  assert.ok(restored.claim('patient_1', 9));
  assert.equal(restored.set('patient_1', 999, 1), false);
  restored.clear(); assert.equal(restored.state('patient_1').interval, 0);
});

test('a failed scheduled BP cycle stops the schedule rather than repeatedly retrying', () => {
  const schedule = createBPSchedule();
  schedule.set('patient_1', 1, 0);
  schedule.complete(schedule.claim('patient_1', 1), 1, false);
  assert.equal(schedule.state('patient_1').interval, 0);
  assert.match(schedule.state('patient_1').error, /did not complete/);
  assert.equal(schedule.claim('patient_1', 100), null);
});

test('BP trend counts measurements rather than repeated snapshots and retains repeat values at a new time', () => {
  const history = createBPHistory();
  const first = { BP: { value: '138/82', t: 'T+1:00', tMin: 1 } };
  history.record(first); history.record(first, { minute: 3 });
  history.record({ BP: { value: '138/82', tMin: 4 } });
  history.record({ BP: { value: '110/68', tMin: 8 } });
  assert.equal(history.readings().length, 3);
  assert.deepEqual(history.readings().map(r => r.label), ['T+1:00', 'T+4:00', 'T+8:00']);
});

test('BP trend keeps patients separate and restores their stamped readings from saved turns', () => {
  const history = createBPHistory();
  history.restore([
    { vitals: { BP: { value: '120/80', t: 'T+2:15' } }, sceneMinute: 3, patientFocus: { id: 'patient_1' } },
    { vitals: { BP: { value: '80/40', tMin: 4 } }, sceneMinute: 4, patientFocus: { id: 'patient_2' } },
    { vitals: { BP: { value: '120/80', t: 'T+2:15' } }, sceneMinute: 5, patientFocus: { id: 'patient_1' } },
  ]);
  assert.equal(history.readings('patient_1').length, 1);
  assert.equal(history.readings('patient_1')[0].minute, 2.25);
  assert.equal(history.readings('patient_2')[0].systolic, 80);
  assert.equal(history.readings('unknown').length, 0);
  history.clear(); assert.equal(history.readings('patient_2').length, 0);
});

test('legacy BP readings suppress carried-forward duplicates without inventing measurements', () => {
  const history = createBPHistory();
  history.record({ BP: '120/80' }, { minute: 1 });
  history.record({ BP: '120/80' }, { minute: 2 });
  history.record({ SpO2: 98 }, { minute: 3 });
  history.record({ BP: '100/60' }, { minute: 4 });
  assert.equal(history.readings().length, 2);
  assert.equal(history.readings()[1].minute, 4);
  for (const value of [undefined, 'unobtainable', '—', '80/120', '500/300', '<svg onload=alert(1)>']) history.record({ BP: value });
  assert.equal(history.readings().length, 2);
});

test('BP chart handles absent, single and repeated-time readings without invalid geometry', () => {
  assert.equal(trendSVG([]), '');
  const history = createBPHistory();
  history.record({ BP: '120/80' });
  const single = trendSVG(history.readings());
  assert.match(single, /<circle/); assert.doesNotMatch(single, /NaN|Infinity/);
  history.record({ BP: '100/60' });
  const chart = trendSVG(history.readings());
  assert.match(chart, /Systolic/); assert.match(chart, /Diastolic/);
  assert.doesNotMatch(chart, /NaN|Infinity/);
});

test('notebook has no pulse ox PI row, while the monitor toolbar and explicit trace choices are available', () => {
  const html = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
  assert.doesNotMatch(html.slice(html.indexOf('<div id="vitals-panel"'), html.indexOf('<!-- Dispatch incoming')), /PI|pulse-ox-status/);
  assert.match(html, /id="monitor-btn"/); assert.match(html, /id="monitor-dialog"/);
  for (const wave of ['ecg', 'pleth', 'capno']) assert.match(html, new RegExp(`data-waveform-select="${wave}"`));
  assert.ok(html.indexOf('src="monitor.js') < html.indexOf('src="app.js'));
  const monitor = html.slice(html.indexOf('<dialog id="monitor-dialog"'), html.indexOf('<script src="monitor.js'));
  for (const field of ['Temp', 'Glucose', 'CapRefill', 'GCS', 'Pain']) assert.doesNotMatch(monitor, new RegExp(`data-vital="${field}"`));
  assert.doesNotMatch(monitor, /data-vital="RR"/, 'manual RR is not a monitor channel');
  assert.match(monitor, /id="monitor-capno-rr"/, 'capnography supplies its own measured rate');
  assert.match(monitor, /id="monitor-bp-schedule"/);
  assert.match(monitor, /id="monitor-bp-schedule-toggle"[^>]+aria-label="Set BP schedule"/);
  assert.doesNotMatch(monitor, /<label[^>]+for="monitor-bp-schedule"/);
  assert.doesNotMatch(html.slice(0, html.indexOf('<dialog id="monitor-dialog"')), /id="monitor-bp-schedule"/, 'schedule controls exist only in the Monitor overlay');
});
