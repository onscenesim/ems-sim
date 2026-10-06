'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { derivePulseOx, applyPulseOx } = require('../src/engine/pulse-ox');
const PlethWaveform = require('../public/pleth');
const normal = { HR: 80, SpO2: 98, BP: { value: '120/80', t: 'T+1:00' }, Rhythm: 'sinus' };
const equipment = { complication_type: 'equipment_failure' };

test('explicit central pulse findings reconcile missing perfusion without changing ordinary retention', () => {
  const before = applyPulseOx({ ...normal, SpO2: 91, Perfusion: 'poor' });
  for (const narrative of [
    'Palpation at the carotid and femoral sites reveals no palpable pulse, despite the organized rhythm continuing on the monitor screen.',
    'No central pulses are palpable during a five-second compressor pause.',
    'Femoral pulse checks confirm pulselessness.',
    'The monitor remains organized, but no spontaneous pulse is present at the femoral or carotid sites.',
  ]) {
    const arrest = applyPulseOx({ HR: 138, Rhythm: 'sinus_tach', ETCO2: 12 }, before, {}, narrative);
    assert.equal(arrest.SpO2, undefined, narrative);
    assert.equal(arrest.PulseOx.quality, 'absent');
    assert.equal(arrest.PulseOx.trueSpO2, 91);
    assert.equal(arrest.HR, 138); assert.equal(arrest.Rhythm, 'sinus_tach');
    const continued = applyPulseOx({ HR: 42, Rhythm: 'idioventricular', BP: normal.BP }, JSON.parse(JSON.stringify(arrest)), {});
    assert.equal(continued.SpO2, undefined); assert.equal(continued.BP, undefined, 'stale BP cannot revive perfusion');
    assert.equal(applyPulseOx({ HR: 42, Rhythm: 'idioventricular' }, continued, {}, 'Carotid pulses are palpable with LUCAS compressions.').SpO2, undefined, 'compression-generated pulses are not ROSC');
    const rosc = applyPulseOx({ HR: 80, Rhythm: 'sinus', TrueSpO2: 96, Perfusion: 'normal' }, continued, {});
    assert.equal(rosc.SpO2, 96); assert.equal(rosc.PulseOx.quality, 'good');
    const narratedRosc = applyPulseOx({ HR: 80, Rhythm: 'sinus', TrueSpO2: 95 }, continued, {}, 'The carotid pulse returns.');
    assert.equal(narratedRosc.SpO2, 95); assert.equal(narratedRosc.PulseOx.perfusion, 'poor');
  }
  for (const narrative of [
    '', 'His radial pulses are now barely perceptible.', 'No radial pulse is palpable.',
    'Start CPR and get the LUCAS.', 'If no carotid pulse is palpable, begin CPR.',
    'Earlier, no central pulses were palpable.', 'There is no loss of carotid pulse.',
    'Are no central pulses palpable?', 'Check whether no femoral pulses are palpable.',
    'Partner: "No carotid pulse is palpable."', 'No central pulse deficit is present.',
  ]) {
    const retained = applyPulseOx({ HR: 42, Rhythm: 'idioventricular', ETCO2: 13 }, before, {}, narrative);
    assert.equal(retained.SpO2, 91, narrative);
  }
  assert.equal(applyPulseOx({ ...normal, Perfusion: 'normal' }, before, {}, 'No central pulses are palpable.').SpO2, 98, 'explicit structured perfusion remains authoritative');
  assert.equal(applyPulseOx(normal, null, {}, 'The carotid pulse is palpable.').PulseOx.quality, 'good', 'normal pulse narration does not weaken a good signal');
  assert.equal(applyPulseOx(null, before, {}, 'No central pulses are palpable.'), null, 'no vitals snapshot preserves existing semantics');
});

test('PI varies within the waveform bands, with intermittent missing garbage PI', () => {
  const readings = quality => Array.from({ length: 240 }, (_, t) => PlethWaveform.perfusionIndex({ quality, pulseRate: 104 }, t * 1.5));
  assert.ok(readings('good').every(pi => pi > 1));
  assert.ok(readings('poor').every(pi => pi >= 0.3 && pi <= 1));
  const garbage = readings('unreliable');
  assert.ok(garbage.some(pi => pi === null));
  assert.ok(garbage.some(pi => pi !== null));
  assert.ok(garbage.every(pi => pi === null || (pi >= 0 && pi < 0.3)));
  assert.ok(readings('absent').every(pi => pi === null));
  for (const quality of ['good', 'poor', 'unreliable']) assert.ok(new Set(readings(quality)).size > 10);
  assert.equal(PlethWaveform.description({ quality: 'good' }), '');
  assert.equal(PlethWaveform.description({ quality: 'poor' }), '');
  assert.equal(PlethWaveform.description({ quality: 'unreliable' }), 'searching for pulse');
  assert.equal(PlethWaveform.description({ quality: 'absent', reason: 'disconnected' }), 'check probe');
  assert.equal(PlethWaveform.description({ quality: 'absent', reason: 'sensor_dropout' }), 'check probe');
  assert.equal(PlethWaveform.description(null), '');
});

test('PI readout updates color and status and clears its timer after signal loss', () => {
  const element = () => ({ dataset: {}, setAttribute() {} });
  const pi = element(), status = element(), detail = element();
  let started = 0, stopped = 0;
  const browser = vm.createContext({ performance: { now: () => 5000 },
    setInterval() { return ++started; }, clearInterval() { stopped++; }, pi, status, detail });
  vm.runInContext(fs.readFileSync(require.resolve('../public/pleth'), 'utf8'), browser);
  vm.runInContext('this.readout = PlethWaveform.createReadout({pi,status,detail})', browser);
  browser.readout.update({ quality: 'poor', pulseRate: 104 });
  assert.match(pi.textContent, /^PI 0\.\d{2}$/); assert.equal(pi.dataset.low, 'true');
  assert.equal(status.textContent, '');
  browser.readout.update({ quality: 'unreliable', pulseRate: 104 });
  assert.equal(status.textContent, 'searching for pulse'); assert.equal(pi.dataset.low, 'true');
  browser.readout.update({ quality: 'good', pulseRate: 104 });
  assert.equal(pi.dataset.low, 'false'); assert.equal(status.textContent, '');
  assert.equal(started, 1, 'updates reuse one refresh timer');
  browser.readout.update({ quality: 'absent', reason: 'disconnected' });
  assert.equal(pi.textContent, 'PI —'); assert.equal(status.textContent, 'check probe');
  assert.equal(stopped, 1);
  browser.readout.update(null);
  assert.equal(status.textContent, ''); assert.equal(detail.textContent, 'PI —');
});

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

test('unplaced and invalid measurements never invent a displayed number; connected probes retain the prior reading', () => {
  assert.equal(derivePulseOx({}).reason, 'unplaced');
  const good = derivePulseOx(normal);
  for (const SpO2 of [undefined, null, '', NaN, Infinity, 'pending', -1, 101]) {
    const ox = derivePulseOx({ SpO2 }, good);
    assert.equal(ox.displayedSpO2, 98, String(SpO2));
    assert.equal(ox.trueSpO2, 98); assert.equal(ox.quality, 'good');
  }
  assert.equal(derivePulseOx({ HR: 80 }).displayedSpO2, null, 'no previous measurement remains unknown');
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
  assert.ok(Math.max(...bad) > Math.max(...poor) * 3, 'severe artifact is distinct from a small weak pulse');
  assert.ok(bad.every(y => y >= -0.18 && y <= 1.02), 'garbage trace stays inside the strip');
  assert.deepEqual(bad, Array.from({ length: 1200 }, (_, i) => PlethWaveform.sample(i / 200, { quality: 'unreliable', pulseRate: 140 })), 'garbage artifact cannot be used to infer pulse rate');
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
test('Session clears the stale saturation on the reported organized-rhythm arrest turn', async () => {
  const session = new Session({ scenario_id: 'organized-arrest-regression', difficulty: 'NORMAL',
    provider_level: 'ALS', region: 'SUBURBAN', category: 'medical', patient_age: 45,
    age_group: 'middle_aged', sex: 'male', patient_name: 'Test Patient', presentation: 'Weakness',
    trajectory: 'stable', decompensation_clock: null, complication_type: 'none', events: [] });
  reply = 'Weak pulses. [VITALS: HR=142 TrueSpO2=91 PulseOxProbe=connected Perfusion=poor PulseRate=142 PulseOxArtifact=none ETCO2=18 RR=10 Rhythm=sinus_tach BP=68/40@T+4:15 GCS=8] [TIME: 4:15]';
  assert.equal((await session.send('Observe', true)).vitals.SpO2, 91);
  reply = 'Palpation at the carotid and femoral sites reveals no palpable pulse, despite the organized rhythm continuing on the monitor screen. The pulse oximetry plethysmograph goes flat and the SpO2 reading disappears. [VITALS: HR=138 ETCO2=12 RR=4 Rhythm=sinus_tach GCS=3] [TIME: 5:30]';
  const arrest = (await session.send('Observe', true)).vitals;
  assert.equal(arrest.SpO2, undefined); assert.equal(arrest.PulseOx.quality, 'absent');
  assert.equal(arrest.HR, 138); assert.equal(arrest.Rhythm, 'sinus_tach');
  reply = 'Transport continues. [VITALS: HR=42 ETCO2=13 RR=10 Rhythm=idioventricular GCS=3] [TIME: 14:30]';
  assert.equal((await session.send('Observe', true)).vitals.SpO2, undefined);
  reply = 'Circulation returns. [VITALS: HR=90 TrueSpO2=96 Perfusion=poor PulseRate=90 Rhythm=sinus BP=92/60@T+16:00] [TIME: 16:00]';
  const rosc = (await session.send('Observe', true)).vitals;
  assert.equal(rosc.SpO2, 96); assert.equal(rosc.PulseOx.quality, 'poor');
  assert.equal(rosc.BP.value, '92/60');
});

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


test('multi-patient focus isolates readings and probe state across switches and restored sessions', async () => {
  const seed = {
    scenario_id: 'multi-patient-test', difficulty: 'NORMAL', provider_level: 'ALS',
    region: 'SUBURBAN', category: 'ob', patient_age: 30, age_group: 'young_adult',
    sex: 'female', patient_name: 'Test Patient', presentation: 'Delivery',
    special_flags: 'two_patients', trajectory: 'stable', decompensation_clock: null,
    complication_type: 'equipment_failure', complication_roll: 5, events: [],
  };
  let session = new Session(seed);
  assert.match(session.systemPrompt, /PATIENT FOCUS/);
  reply = 'Mother assessed. [PATIENT_FOCUS: patient_1 | Mother] [VITALS: HR=80 BP=110/70@T+1:00 TrueSpO2=98 PulseOxProbe=connected PulseOxArtifact=false_low] [TIME: 1:00]';
  const mother = await session.send('Focus on the mother', true);
  assert.equal(mother.vitals.SpO2, 86);
  assert.ok(!mother.reply.includes('PATIENT_FOCUS'));
  reply = 'Newborn assessed. [PATIENT_FOCUS: patient_2 | Newborn] [VITALS: HR=140 TrueSpO2=96 PulseOxProbe=connected] [TIME: 2:00]';
  const newborn = await session.send('Focus on the newborn', true);
  assert.equal(newborn.vitals.HR, 140);
  assert.equal(newborn.vitals.BP, undefined, 'mother BP must not follow focus');
  assert.equal(newborn.vitals.SpO2, 96, 'mother probe fault must not follow focus');
  assert.deepEqual(session.patientFocus, { id: 'patient_2', label: 'Newborn' });
  assert.equal(session.patientVitals.patient_1.HR, 80);
  const { restoreSession, deleteSession } = require('../src/server/sessionStore');
  session = restoreSession(JSON.parse(JSON.stringify({ ...session, id: 'multi-patient-restore-test' })));
  assert.deepEqual(session.patientFocus, { id: 'patient_2', label: 'Newborn' });
  assert.equal(session.lastVitals.HR, 140);
  reply = 'Back to the mother. [PATIENT_FOCUS: patient_1 | Mother] [VITALS: HR=84 BP=110/70@T+1:00 TrueSpO2=98 PulseOxProbe=connected] [TIME: 3:00]';
  const returned = await session.send('Focus on the mother', true);
  assert.equal(returned.vitals.HR, 84);
  assert.equal(returned.vitals.SpO2, 86, 'original probe fault survives resume');
  assert.equal(returned.vitals.BP.t, 'T+1:00', 'switching does not remeasure BP');
  const context = buildDebriefContext(seed, session.turns);
  assert.match(context, /Mother \(patient_1\): HR 80/);
  assert.match(context, /Newborn \(patient_2\): HR 140/);
  reply = 'Now with the newborn. [PATIENT_FOCUS: patient_2 | Newborn] [TIME: 4:00]';
  assert.equal((await session.send('Focus on the newborn', true)).vitals, null, 'missing snapshot on a switch clears the previous patient');
  reply = 'Probe removed. [PATIENT_FOCUS: patient_2 | Newborn] [VITALS: GCS=15 PulseOxProbe=disconnected] [TIME: 5:00]';
  assert.equal((await session.send('Observe', true)).vitals.SpO2, undefined);
  assert.equal(session.patientVitals.patient_1.HR, 84);
  deleteSession('multi-patient-restore-test');
});
