'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { derivePulseOx, applyPulseOx } = require('../src/engine/pulse-ox');
const PlethWaveform = require('../public/pleth');
const normal = { HR: 80, SpO2: 98, BP: { value: '120/80', t: 'T+1:00' }, Rhythm: 'sinus' };
const equipment = { complication_type: 'equipment_failure' };

test('normal, poor, and recovering perfusion change quality independently of saturation', () => {
  const good = derivePulseOx(normal);
  assert.equal(good.quality, 'good'); assert.equal(good.reliable, true);
  assert.equal(good.trueSpO2, 98); assert.equal(good.displayedSpO2, 98);
  const poor = derivePulseOx({ ...normal, BP: '74/42' }, good);
  assert.equal(poor.quality, 'poor'); assert.equal(poor.reliable, false);
  assert.equal(poor.trueSpO2, 98); assert.equal(poor.displayedSpO2, 98);
  assert.deepEqual(derivePulseOx(normal, poor), good);
  assert.equal(derivePulseOx({ ...normal, Perfusion: 'poor' }).quality, 'poor');
  assert.equal(derivePulseOx({ ...normal, BP: '74/42', Perfusion: 'normal' }).quality, 'good', 'explicit current perfusion supersedes old cuff');
  assert.equal(derivePulseOx({ ...normal, SpO2: 82 }).quality, 'good', 'hypoxemia alone is not a bad signal');
  assert.equal(derivePulseOx({ ...normal, BP: '80/50' }, null, { patient_age: 0.5 }).quality, 'good');
});

test('only relevant complication roles can introduce false readings, without altering true oxygenation', () => {
  for (const role of ['equipment_failure', 'clinical_curveball', 'all', 'none', 'unreliable_bystander']) {
    const allowed = ['equipment_failure', 'clinical_curveball', 'all'].includes(role);
    for (const artifact of ['false_low', 'false_high', 'dropout']) {
      const ox = derivePulseOx({ ...normal, TrueSpO2: 88, PulseOxArtifact: artifact }, null, { complication_type: role });
      assert.equal(ox.trueSpO2, 88);
      assert.equal(ox.displayedSpO2, !allowed ? 88 : artifact === 'false_low' ? 76 : artifact === 'false_high' ? 100 : null);
      assert.equal(ox.reliable, !allowed);
      assert.equal(ox.quality, !allowed ? 'good' : artifact === 'dropout' ? 'absent' : 'unreliable');
    }
  }
  assert.equal(derivePulseOx({ ...normal, TrueSpO2: 5, PulseOxArtifact: 'false_low' }, null, equipment).displayedSpO2, 0);
  assert.equal(derivePulseOx(normal, null, equipment).quality, 'good', 'role alone does not activate a fault');
});

test('artifact persistence, disconnection, reconnection and resolution survive serialized snapshots', () => {
  const bad = applyPulseOx({ ...normal, PulseOxArtifact: 'false_low' }, null, equipment);
  const persisted = JSON.parse(JSON.stringify(bad));
  const continued = applyPulseOx(normal, persisted, equipment);
  assert.equal(continued.SpO2, 86); assert.equal(continued.PulseOx.trueSpO2, 98);
  const disconnected = applyPulseOx({ ...normal, PulseOxProbe: 'disconnected' }, continued, equipment);
  assert.equal(disconnected.SpO2, undefined); assert.equal(disconnected.PulseOx.reason, 'disconnected');
  assert.equal(applyPulseOx(normal, disconnected, equipment).PulseOx.reason, 'disconnected');
  const fixed = applyPulseOx({ ...normal, PulseOxProbe: 'connected', PulseOxArtifact: 'none' }, disconnected, equipment);
  assert.equal(fixed.SpO2, 98); assert.equal(fixed.PulseOx.quality, 'good');
  const stillPoor = applyPulseOx({ ...normal, Perfusion: 'poor', PulseOxArtifact: 'none' }, bad, equipment);
  assert.equal(stillPoor.PulseOx.quality, 'poor', 'fixing probe does not restore perfusion');
});

test('absent perfusion suppresses SpO2 and BP but preserves electrical ECG and hidden saturation', () => {
  for (const Rhythm of ['VF', 'v_fib', 'v_fibrillation', 'ventricular_fibrillation', 'asystole', 'PEA', 'pulseless_electrical_activity', 'fine_vf']) {
    const v = applyPulseOx({ ...normal, Rhythm, PulseOxArtifact: 'false_high' }, null, equipment);
    assert.equal(v.PulseOx.quality, 'absent', Rhythm);
    assert.equal(v.SpO2, undefined); assert.equal(v.BP, undefined);
    assert.equal(v.HR, 80); assert.equal(v.Rhythm, Rhythm);
    assert.equal(v.PulseOx.trueSpO2, 98);
  }
  for (const Rhythm of ['VT', 'torsades', 'sinus']) {
    assert.equal(derivePulseOx({ ...normal, Rhythm }).quality, 'good');
    assert.equal(derivePulseOx({ ...normal, Rhythm, Perfusion: 'absent' }).quality, 'absent');
  }
  const arrest = derivePulseOx({ ...normal, Rhythm: 'PEA' });
  assert.equal(derivePulseOx({ ...normal, Perfusion: 'normal' }, arrest).quality, 'good');
});

test('unplaced, missing and invalid measurements never invent a displayed number', () => {
  assert.equal(derivePulseOx({}).reason, 'unplaced');
  const good = derivePulseOx(normal);
  for (const SpO2 of [undefined, null, '', NaN, Infinity, 'pending', -1, 101]) {
    const ox = derivePulseOx({ SpO2 }, good);
    assert.equal(ox.displayedSpO2, null, String(SpO2));
    assert.equal(ox.trueSpO2, 98); assert.equal(ox.quality, 'absent');
  }
  const ox = derivePulseOx({ TrueSpO2: 98, PulseOxProbe: 'unplaced' });
  assert.equal(ox.displayedSpO2, null); assert.equal(ox.trueSpO2, 98);
  assert.equal(derivePulseOx({ ...normal, PulseRate: 62 }).pulseRate, 62);
  assert.equal(derivePulseOx({ ...normal, PulseRate: 0 }).quality, 'absent', 'zero peripheral pulse must not become a default 75 bpm pleth');
});

test('renderer lifecycle depends on signal quality and pulse rate, not saturation or ECG', () => {
  let started = 0, cancelled = 0;
  const canvas = { clientWidth: 200, clientHeight: 30, width: 200, height: 30,
    getContext: () => new Proxy({}, { get: () => () => {} }) };
  const browser = vm.createContext({
    window: { devicePixelRatio: 1 }, requestAnimationFrame() { return ++started; },
    cancelAnimationFrame() { cancelled++; }, canvas,
  });
  vm.runInContext(fs.readFileSync(require.resolve('../public/pleth'), 'utf8'), browser);
  vm.runInContext('this.strip = PlethWaveform.createStrip(canvas)', browser);
  browser.strip.update({ quality: 'good', pulseRate: 80, trueSpO2: 98 });
  browser.strip.update({ quality: 'good', pulseRate: 80, trueSpO2: 82, Rhythm: 'VT' });
  assert.equal(started, 1); assert.equal(cancelled, 0);
  browser.strip.update({ quality: 'poor', pulseRate: 80 });
  assert.equal(started, 2); assert.equal(cancelled, 1);
  browser.strip.update({ quality: 'absent', pulseRate: 0 });
  assert.equal(started, 2); assert.equal(cancelled, 2);
  browser.strip.update({ quality: 'good', pulseRate: 80 });
  assert.equal(started, 3);
  browser.strip.update(null);
  assert.equal(cancelled, 3);
});

test('pleth samples are deterministic, rounded, weakened/noisy and absent as appropriate', () => {
  const samples = quality => Array.from({ length: 1200 }, (_, i) => PlethWaveform.sample(i / 200, { quality, pulseRate: 80 }));
  const good = samples('good'), poor = samples('poor'), bad = samples('unreliable');
  assert.deepEqual(samples('unreliable'), bad);
  assert.ok(samples('absent').every(y => y === 0));
  assert.ok(Math.max(...poor) < Math.max(...good) * 0.4, 'poor pulse amplitude is visibly weaker');
  assert.ok(poor.some(y => y < -0.02), 'poor signal has baseline noise');
  assert.ok(bad.some(y => y < -0.1), 'artifact has visible irregular noise');
  assert.ok(Math.max(...good.map((v, i) => i ? Math.abs(v - good[i - 1]) : 0)) < 0.06, 'rounded upstroke, not a QRS spike');
  assert.ok([...good, ...poor, ...bad].every(Number.isFinite));
  assert.notDeepEqual(bad.slice(0, 150), bad.slice(150, 300), 'irregular beats do not repeat every pulse');
});

test('compact monitor selection updates the actual button state and defaults to ECG', () => {
  const source = fs.readFileSync(require.resolve('../public/app'), 'utf8');
  const attrs = { 'aria-pressed': 'false' }, listeners = {};
  const button = { setAttribute(k, v) { attrs[k] = v; }, getAttribute(k) { return attrs[k]; }, addEventListener(k, fn) { listeners[k] = fn; } };
  const cell = { dataset: {} };
  const c = vm.createContext({
    PlethWaveform: { ...PlethWaveform, createStrip: () => ({ resize() {} }) },
    document: { getElementById: id => id === 'waveform-toggle' ? button : cell },
    window: { addEventListener() {} }, rhythmStrip: { active: true }, stripIdle() {},
  });
  vm.runInContext(source.slice(source.indexOf('const plethStrip ='), source.indexOf('function updatePlethStrip(')), c);
  c.selectMonitorWaveform('invalid');
  assert.equal(cell.dataset.waveform, 'ecg'); assert.equal(attrs['aria-pressed'], 'false');
  listeners.click();
  assert.equal(cell.dataset.waveform, 'pleth'); assert.equal(attrs['aria-pressed'], 'true');
  assert.equal(attrs['aria-label'], 'Show ECG waveform');
  listeners.click();
  assert.equal(cell.dataset.waveform, 'ecg'); assert.equal(attrs['aria-label'], 'Show SpO₂ pleth waveform');
  const html = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
  assert.ok(html.indexOf('src="pleth.js') < html.indexOf('src="app.js'));
  const browser = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../public/pleth'), 'utf8'), browser);
  assert.equal(vm.runInContext('PlethWaveform.selection().selected', browser), 'ecg');
});

// Exercise the real tag parser, reducer, ledger and debrief without model calls.
let reply = '';
require.cache[require.resolve('../src/engine/api')] = { exports: { sendTurn: async () => reply, sendDebrief: async () => '' } };
require.cache[require.resolve('../src/server/adminLogger')] = { exports: { logRun() {}, updateRunDebrief() {} } };
const { Session } = require('../src/engine/session');
const { buildDebriefContext } = require('../src/engine/assembler');
test('Session parses signal tags, clears none, retains hidden truth and records both readings for debrief', async () => {
  const seed = {
    scenario_id: 'pulse-ox-test', difficulty: 'NORMAL', provider_level: 'ALS',
    region: 'SUBURBAN', category: 'medical', patient_age: 45, age_group: 'middle_aged',
    sex: 'female', patient_name: 'Test Patient', presentation: 'Generalized weakness',
    trajectory: 'stable', decompensation_clock: null, complication_type: 'equipment_failure',
    complication_roll: 5, events: [],
  };
  const session = new Session(seed);
  reply = 'The probe shows 86 with a poor signal. [VITALS: HR=80 TrueSpO2=98 PulseOxProbe=connected Perfusion=poor PulseOxArtifact=false_low] [TIME: 1:00]';
  const first = await session.send('Observe', true);
  assert.equal(first.vitals.SpO2, 86); assert.equal(first.vitals.PulseOx.trueSpO2, 98);
  assert.equal(first.vitals.TrueSpO2, undefined); assert.ok(!first.reply.includes('VITALS'));
  reply = 'No change. [TIME: 2:00]';
  assert.deepEqual((await session.send('Observe', true)).vitals, first.vitals);
  reply = 'Signal recovered. [VITALS: HR=80 TrueSpO2=98 PulseOxProbe=connected Perfusion=normal PulseOxArtifact=none] [TIME: 3:00]';
  const recovered = await session.send('Observe', true);
  assert.equal(recovered.vitals.SpO2, 98); assert.equal(recovered.vitals.PulseOx.reliable, true);
  const context = buildDebriefContext(seed, session.turns);
  assert.match(context, /true SpO2 98% \(hidden\), displayed SpO2 86, pleth unreliable/);
  reply = 'Probe removed. [VITALS: PulseOxProbe=disconnected GCS=15] [TIME: 4:00]';
  const removed = await session.send('Observe', true);
  assert.equal(removed.vitals.SpO2, undefined); assert.equal(removed.vitals.PulseOx.trueSpO2, 98);
  assert.equal(removed.vitals.PulseOx.reason, 'disconnected');
});
