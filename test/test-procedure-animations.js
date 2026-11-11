'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
const transportPatient = require('../public/transport-patient');
const sounds = source.slice(source.indexOf('const SURGICAL_PROCS'), source.indexOf('// ── Mobile audio unlock'));
const scenes = source.slice(source.indexOf('const PROCEDURE_TIMING'), source.indexOf('function animateDefib'));
function fixture({ reduced = false, missing = false } = {}) {
  let now = 0;
  const timers = [], played = [], elements = new Map();
  for (const scene of ['cpr', 'bvm', 'lucas', 'scalpel', 'laryngoscope', 'goose', 'npa', 'obstruction', 'sga', 'opa', 'suction', 'ncd', 'bleeding_control', 'tourniquet', 'chest_seal', 'pacing', 'defib', 'ekg']) {
    for (const suffix of ['overlay', 'label', 'header']) {
      const classes = new Set(), properties = {}, attributes = {};
      elements.set(`${scene}-${suffix}`, {
        textContent: '', offsetWidth: 100, properties, attributes, querySelectorAll: () => [],
        setAttribute: (key, value) => { attributes[key] = value; },
        set className(value) { classes.clear(); value.split(' ').filter(Boolean).forEach(c => classes.add(c)); },
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
        style: { setProperty: (key, value) => { properties[key] = value; } },
      });
    }
  }
  const context = vm.createContext({
    TwelveLead:require('../public/twelve-lead'),
    window: { matchMedia: () => ({ matches: reduced }) }, localTranscript: null,
    document: { getElementById: id => missing ? null : elements.get(id) },
    playSound: sound => { played.push({ sound, time: now }); },
    waitForSound: async () => {},
    setTimeout: (fn, ms) => { const timer = { fn, at: now + ms }; timers.push(timer); return timer; },
    clearTimeout: timer => { const i = timers.indexOf(timer); if (i >= 0) timers.splice(i, 1); },
  });
  vm.runInContext(sounds + scenes + '\nthis.timing = PROCEDURE_TIMING;', context);
  function advance(ms) {
    const end = now + ms;
    while (true) {
      timers.sort((a, b) => a.at - b.at);
      if (!timers.length || timers[0].at > end) break;
      const timer = timers.shift(); now = timer.at; timer.fn();
    }
    now = end;
  }
  return { context, elements, played, timers, advance };
}

test('transport patient variants honor the under-4 and under-14 boundaries, including newborn age zero', () => {
  for (const sex of ['male', 'female']) {
    for (const age of [0, 0.5, 3, 3.99]) assert.equal(transportPatient.variantFor({ age, sex }), 'baby');
    for (const age of [4, 6, 13, 13.99]) assert.equal(transportPatient.variantFor({ age, sex }), 'child');
    assert.equal(transportPatient.variantFor({ age: 14, sex }), sex === 'female' ? 'female' : 'adult');
  }
  for (const age of [undefined, null, '', NaN, Infinity, -1]) {
    assert.equal(transportPatient.variantFor({ age }), 'adult');
  }
  assert.equal(transportPatient.variantFor(null), 'adult');
});

test('airway profiles follow the focused patient and reset when demographics are unknown', () => {
  const f = fixture();
  f.context.window.TransportPatient = transportPatient;
  const previous = { patient: { sex: 'male' }, patients: [{ id: 'patient_2', sex: 'female' }] };
  for (const [current, expected] of [
    [{ patient_focus: { id: 'patient_2' } }, 'female'],
    [{ patient_focus: { id: 'patient_1' } }, 'male'],
    [{ patient_focus: { id: 'patient_3' } }, 'male'],
  ]) {
    f.context.configureAirwayPatient(transportPatient.patientFor(current, previous));
    for (const id of ['laryngoscope', 'sga', 'opa', 'suction', 'npa', 'obstruction']) {
      assert.equal(f.elements.get(`${id}-overlay`).attributes['data-airway-profile'], expected);
    }
  }
});

test('airway pediatric profiles use the loading age boundaries and share one infant profile', () => {
  const f = fixture();
  f.context.window.TransportPatient = transportPatient;
  for (const sex of ['male', 'female']) {
    for (const [age, expected] of [
      [0, 'baby'], [0.5, 'baby'], [3.99, 'baby'],
      [4, `child-${sex}`], [9, `child-${sex}`], [13.99, `child-${sex}`],
      [14, sex], [35, sex], [undefined, sex], [-1, sex], [NaN, sex],
    ]) {
      f.context.configureAirwayPatient({ age, sex });
      for (const id of ['laryngoscope', 'sga', 'opa', 'suction', 'npa', 'obstruction']) {
        assert.equal(f.elements.get(`${id}-overlay`).attributes['data-airway-profile'], expected, `${age}/${sex}`);
      }
    }
  }
});

test('chest scenes share patient profiles, with child artwork as the infant LUCAS fallback', () => {
  const f = fixture();
  f.context.window.TransportPatient = transportPatient;
  for (const [patient, profile] of [
    [{age:35,sex:'female'}, 'female'], [{age:9,sex:'female'}, 'child-female'],
    [{age:9,sex:'male'}, 'child-male'], [{age:0,sex:'female'}, 'baby'],
    [{age:2,sex:'male'}, 'baby'], [{age:35,sex:'male'}, 'male'], [{}, 'male'],
  ]) {
    f.context.configureAirwayPatient(patient);
    for (const id of ['cpr', 'bvm', 'lucas', 'chest_seal', 'defib', 'pacing', 'ekg']) {
      const expected = id === 'lucas' && profile === 'baby' ? 'child-male' : profile;
      assert.equal(f.elements.get(`${id}-overlay`).attributes['data-patient-profile'], expected, id);
      assert.equal(f.elements.get(`${id}-overlay`).attributes['data-airway-profile'], expected, id);
    }
  }
});

test('transport uses the latest focused patient, retains saved demographics, and does not borrow another patient\'s age', () => {
  const previous = { patient: { age: 30, sex: 'female' }, patient_focus: { id: 'patient_1' },
    patients: [{ id: 'patient_2', age: 8, sex: 'male' }] };
  assert.equal(transportPatient.variantFor(transportPatient.patientFor({}, previous)), 'female');
  assert.equal(transportPatient.variantFor(transportPatient.patientFor({ patient_focus: { id: 'patient_2' } }, previous)), 'child');
  assert.equal(transportPatient.variantFor(transportPatient.patientFor({ patient_focus: { id: 'patient_2' },
    patients: [{ id: 'patient_2', age: 2 }] }, previous)), 'baby');
  assert.equal(transportPatient.variantFor(transportPatient.patientFor({ patient_focus: { id: 'patient_3' } }, previous)), 'adult');
});

test('ECG scenes reuse the CPR torso and include the standard and posterior chest leads', () => {
  const ekg = html.slice(html.indexOf('<div id="ekg-overlay"'), html.indexOf('<!-- OPA', html.indexOf('<div id="ekg-overlay"')));
  assert.match(ekg, /<use href="#procedure-torso"\/>/);
  const [front, back] = ekg.split('id="ekg-back"');
  assert.deepEqual([...front.matchAll(/data-lead="([^"]+)"/g)].map(m => m[1]), ['V1', 'V2', 'V3', 'V4', 'V5', 'V6']);
  assert.deepEqual([...back.matchAll(/data-lead="([^"]+)"/g)].map(m => m[1]), ['V7', 'V8', 'V9']);
  assert.doesNotMatch(ekg, /Bare torso|trapezius|costal margin hint/);
});

for (const id of ['bvm', 'lucas', 'scalpel', 'laryngoscope', 'npa', 'obstruction', 'sga', 'opa', 'suction', 'ncd', 'bleeding_control', 'tourniquet', 'chest_seal', 'defib']) {
  test(`${id}: action sound fires once, result timing is shared with CSS, and cleanup resolves after fade`, async () => {
    const f = fixture();
    const procedure = id === 'scalpel' ? 'cricothyrotomy' : id === 'laryngoscope' ? 'intubation' : id === 'sga' ? 'supraglottic_airway' : id === 'opa' ? 'oropharyngeal_airway' : id === 'ncd' ? 'needle_decompression' : id === 'npa' ? 'nasopharyngeal_airway' : id === 'obstruction' ? 'foreign_body_removal' : id === 'defib' ? 'defibrillation' : id;
    const t = f.context.timing[id];
    let complete = false;
    const promise = f.context.animateProcedureScene(id, procedure, 'SUCCESS').then(() => { complete = true; });
    const overlay = f.elements.get(`${id}-overlay`);
    assert.equal(overlay.classList.contains('visible'), true);
    assert.equal(overlay.classList.contains('outcome-SUCCESS'), true);
    assert.equal(overlay.properties['--procedure-cycle'], `${t.cycle}ms`);
    assert.equal(overlay.properties['--procedure-result'], `${t.result}ms`);
    assert.ok(t.result + 180 <= t.hold, 'result is readable before fade');
    if (t.sound === 0) {
      f.advance(0);
      assert.deepEqual(f.played, [{ sound: f.context.getProcedureSound(procedure, 'SUCCESS'), time: 0 }]);
    } else {
    f.advance(99); assert.equal(f.played.length, t.action && t.actionAt === 0 ? 1 : 0);
    f.advance(t.sound - 100);
    assert.deepEqual(f.played, t.action ? [{ sound: t.action, time: t.actionAt ?? 100 }] : []);
    f.advance(1); assert.deepEqual(f.played, [{ sound: t.action || f.context.getProcedureSound(procedure, 'SUCCESS'), time: t.action ? t.actionAt ?? 100 : t.sound }]);
    }
    f.advance(t.hold - t.sound);
    assert.equal(overlay.classList.contains('visible'), true, 'keep final CSS pose throughout the fade');
    assert.equal(overlay.classList.contains('is-fading'), true);
    await Promise.resolve(); assert.equal(complete, false);
    f.advance(219); await Promise.resolve(); assert.equal(complete, false);
    f.advance(1); await promise; assert.equal(complete, true); assert.equal(f.timers.length, 0);
    assert.equal(overlay.classList.contains('visible'), false);
    assert.equal(overlay.classList.contains('is-fading'), false);
  });
}

test('replaying scenes clears previous outcomes and preserves all sound mappings', async () => {
  for (const id of ['bvm', 'lucas', 'scalpel', 'laryngoscope', 'npa', 'obstruction', 'sga', 'opa', 'suction', 'ncd', 'bleeding_control', 'tourniquet', 'chest_seal', 'defib']) {
    const f = fixture();
    const proc = id === 'scalpel' ? 'finger_thoracostomy' : id === 'laryngoscope' ? 'rsi' : id === 'sga' ? 'supraglottic_airway' : id === 'opa' ? 'oropharyngeal_airway' : id === 'ncd' ? 'needle_decompression' : id === 'npa' ? 'nasopharyngeal_airway' : id === 'obstruction' ? 'foreign_body_removal' : id === 'defib' ? 'defibrillation' : id;
    for (const outcome of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION', 'SUCCESS']) {
      const p = f.context.animateProcedureScene(id, proc, outcome);
      const overlay = f.elements.get(`${id}-overlay`);
      for (const possible of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION']) {
        assert.equal(overlay.classList.contains(`outcome-${possible}`), outcome === possible);
      }
      f.advance(f.context.timing[id].hold + 220); await p;
      const good = outcome === 'SUCCESS' || outcome === 'MARGINAL';
      assert.equal(f.played.at(-1).sound, f.context.timing[id].action || f.context.getProcedureSound(proc, outcome));
    }
    assert.equal(f.played.length, 5);
  }
});

test('reduced motion and missing scenes retain sounds and always release the turn', async () => {
  for (const id of ['bvm', 'lucas', 'scalpel', 'laryngoscope', 'npa', 'obstruction', 'sga', 'opa', 'suction', 'ncd', 'bleeding_control', 'tourniquet', 'chest_seal', 'defib']) {
    const procedure = id === 'scalpel' ? 'resuscitative_thoracotomy' : id === 'laryngoscope' ? 'intubation' : id === 'sga' ? 'supraglottic_airway' : id === 'opa' ? 'oropharyngeal_airway' : id === 'ncd' ? 'needle_decompression' : id === 'npa' ? 'nasopharyngeal_airway' : id === 'obstruction' ? 'foreign_body_removal' : id === 'defib' ? 'defibrillation' : id;
    for (const options of [{ reduced: true }, { missing: true }]) {
      const f = fixture(options);
      const p = f.context.animateProcedureScene(id, procedure, 'FAILURE');
      const hasAction = Boolean(f.context.timing[id].action);
      assert.equal(f.played.length, options.missing ? 1 : 0);
      f.advance(f.context.timing[id].hold + 220); await p;
      assert.deepEqual(f.played, [{ sound: f.context.timing[id].action || f.context.getProcedureSound(procedure, 'FAILURE'), time: 0 }]);
      assert.equal(f.timers.length, 0);
    }
  }
});

test('the real roll loop defers only scene-owned sounds and waits for animations before continuing', async () => {
  const events = [];
  let release, entered;
  const started = new Promise(r => { entered = r; });
  const c = fixture().context;
  Object.assign(c, {
    console: { log() {} },
    playSound: sound => events.push(sound),
    waitForSound: async () => {},
    animateDiceRoll: async id => events.push(`dice:${id}`),
    animateBVM: async () => { events.push('bvm'); entered(); await new Promise(r => { release = r; }); },
    animateLUCAS: async () => events.push('lucas'),
    animateScalpel: async id => events.push(id),
    animateLaryngoscope: async id => events.push(id),
    animateDefib: async () => events.push('defib'),
    animateCPR: async () => events.push('cpr'),
    animateSGA: async () => events.push('sga'),
    animateOPA: async () => events.push('opa'),
    animateSuction: async () => events.push('suction'),
    animateProcedureScene: async id => events.push(id),
    animateNCD: async (outcome, id) => events.push(id),
  });
  const a = source.indexOf('    for (const r of (data.rolls || [])) {');
  const b = source.indexOf('    for (const r of (data.rolls || [])) printRoll', a);
  vm.runInContext('async function rolls(data) {\n' + source.slice(a, b) + '\n}', c);
  const p = c.rolls({ rolls: ['bvm', 'lucas', 'cricothyrotomy', 'resuscitative_thoracotomy', 'lateral_canthotomy', 'intubation', 'rsi', 'nasopharyngeal_airway', 'foreign_body_removal', 'abdominal_thrusts', 'supraglottic_airway', 'oropharyngeal_airway', 'suction', 'needle_decompression', 'needle_cricothyrotomy', 'bleeding_control', 'tourniquet', 'chest_seal', 'pacing', 'cpr', 'defibrillation'].map(procedure_id => ({ procedure_id, outcome: 'SUCCESS', roll: 18, dc: 12 })) });
  await started;
  assert.deepEqual(events, ['dice:bvm', 'bvm']);
  release(); await p;
  assert.deepEqual(events, ['dice:bvm', 'bvm', 'dice:lucas', 'lucas', 'dice:cricothyrotomy', 'cricothyrotomy', 'dice:resuscitative_thoracotomy', 'resuscitative_thoracotomy', 'dice:lateral_canthotomy', 'lateral_canthotomy', 'dice:intubation', 'intubation', 'dice:rsi', 'rsi', 'dice:nasopharyngeal_airway', 'npa', 'dice:foreign_body_removal', 'obstruction', 'dice:abdominal_thrusts', 'obstruction', 'dice:supraglottic_airway', 'sga', 'dice:oropharyngeal_airway', 'opa', 'dice:suction', 'suction', 'dice:needle_decompression', 'needle_decompression', 'dice:needle_cricothyrotomy', 'needle_cricothyrotomy', 'dice:bleeding_control', 'bleeding_control', 'dice:tourniquet', 'tourniquet', 'dice:chest_seal', 'chest_seal', 'dice:pacing', 'pacing', 'dice:cpr', 'cpr', 'dice:defibrillation', 'defib']);
  events.length = 0;
  await c.rolls({ rolls: [{ procedure_id: 'lucas', outcome: 'FAILURE', multi_roll: true }, { procedure_id: 'bvm', no_roll: true }] });
  assert.deepEqual(events, ['fail', 'lucas'], 'legacy multi-roll keeps feedback and action; no-roll has no dice cue');
});


test('the goose follows esophageal placement after the intubation or RSI scene fades', async () => {
  const f = fixture();
  f.context.loadSoundBuffer = () => {};
  vm.runInContext(source.slice(source.indexOf('async function animateLaryngoscope('), source.indexOf('function animateDepart(')), f.context);
  const goose = f.elements.get('goose-overlay');
  for (const procedure of ['intubation', 'rsi']) {
    for (const [outcome, caption] of [['SUCCESS', 'TUBE THROUGH THE CORDS'], ['MARGINAL', 'TRACHEAL PLACEMENT'], ['FAILURE', 'TUBE WITHDRAWN'], ['COMPLICATION', 'ESOPHAGEAL PLACEMENT']]) {
      const promise = f.context.animateLaryngoscope(procedure, outcome);
      assert.equal(f.elements.get('laryngoscope-header').textContent, procedure.toUpperCase());
      assert.equal(f.elements.get('laryngoscope-label').textContent, `${outcome} · ${caption}`);
      f.advance(f.context.timing.laryngoscope.sound);
      assert.equal(f.played.at(-1).sound, 'intubation');
      assert.equal(f.elements.get('laryngoscope-overlay').classList.contains('visible'), true);
      f.advance(f.context.timing.laryngoscope.hold - f.context.timing.laryngoscope.sound + 219);
      assert.equal(goose.classList.contains('visible'), false);
      f.advance(1);
      await Promise.resolve();
      assert.equal(f.elements.get('laryngoscope-overlay').classList.contains('visible'), false);
      assert.equal(goose.classList.contains('visible'), outcome === 'COMPLICATION');
      if (outcome === 'COMPLICATION') {
        f.advance(f.context.timing.goose.sound - 1);
        assert.equal(f.played.at(-1).sound, 'intubation');
        f.advance(1);
        assert.equal(f.played.at(-1).sound, 'goose_honk');
        f.advance(f.context.timing.goose.hold - f.context.timing.goose.sound + 220);
      }
      await promise;
      assert.equal(goose.classList.contains('visible'), false);
    }
  }
  assert.equal(f.played.filter(cue => cue.sound === 'goose_honk').length, 2);
});


test('SGA, OPA and suction wrappers preserve outcomes and use the shared sound/result lifecycle', async () => {
  const f = fixture();
  for (const [fn, id, captions] of [
    ['animateSuction', 'suction', ['AIRWAY CLEARED', 'PARTIAL CLEARANCE', 'MINIMAL CLEARANCE', 'SUCTION JAMMED']],
    ['animateSGA', 'sga', ['CUFF SEATED', 'SHALLOW SEAT', 'NOT SEATED', 'CUFF MISALIGNED']],
    ['animateOPA', 'opa', ['TONGUE SUPPORTED', 'SHORT OF POSITION', 'AIRWAY WITHDRAWN', 'AIRWAY WITHDRAWN']],
  ]) {
    vm.runInContext(source.match(new RegExp('function ' + fn + '\\(outcome\\) \\{[\\s\\S]*?\\n\\}'))[0], f.context);
    for (const [i, outcome] of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION'].entries()) {
      const p = f.context[fn](outcome);
      assert.equal(f.elements.get(`${id}-label`).textContent, `${outcome} · ${captions[i]}`);
      f.advance(f.context.timing[id].hold + 220); await p;
      assert.equal(f.played.at(-1).sound, id === 'suction' ? 'suction' : 'airway_gulp');
      assert.equal(f.elements.get(`${id}-overlay`).classList.contains('visible'), false);
    }
  }
  assert.equal(f.played.length, 12);
});

function transportFixture(options) {
  const f = fixture(options);
  for (const id of ['loading', 'depart']) {
    const classes = new Set(), properties = {};
    f.elements.set(`${id}-overlay`, {
      offsetWidth: 100, properties,
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
      style: { setProperty: (key, value) => { properties[key] = value; } },
    });
  }
  vm.runInContext(source.slice(source.indexOf('const TRANSPORT_TIMING'), source.indexOf('function animateDrill')) + source.slice(source.indexOf('function animateDepart()'), source.indexOf('/**', source.indexOf('function animateDepart()'))) + '\nthis.transportTiming = TRANSPORT_TIMING;', f.context);
  return f;
}
for (const [id, fn, hold, fade] of [['loading', 'animateLoading', 2600, 220], ['depart', 'animateDepart', 1800, 250]]) {
  test(`${id}: preserves event lifetime, replay and final pose through fade without duplicating caller-owned sound`, async () => {
    for (const reduced of [false, true]) {
      const f = transportFixture({ reduced });
      const overlay = f.elements.get(`${id}-overlay`);
      for (let replay = 0; replay < 2; replay++) {
        let complete = false;
        const p = f.context[fn]().then(() => { complete = true; });
        assert.equal(overlay.classList.contains('visible'), true);
        assert.equal(overlay.classList.contains('is-fading'), false);
        assert.equal(overlay.properties['--transport-start'], `${f.context.transportTiming[id].start}ms`);
        assert.equal(overlay.properties['--transport-travel'], `${f.context.transportTiming[id].travel}ms`);
        f.advance(hold - 1); assert.equal(overlay.classList.contains('is-fading'), false);
        f.advance(1); assert.equal(overlay.classList.contains('is-fading'), true);
        assert.equal(overlay.classList.contains('visible'), true);
        f.advance(fade - 1); await Promise.resolve(); assert.equal(complete, false);
        f.advance(1); await p;
        assert.equal(overlay.classList.contains('visible'), false);
        assert.equal(overlay.classList.contains('is-fading'), false);
      }
      assert.equal(f.played.length, 0); assert.equal(f.timers.length, 0);
    }
    const absent = transportFixture({ missing: true });
    await absent.context[fn](); assert.equal(absent.timers.length, 0);
  });
}

test('server transport flags still gate one-time loading/departure sounds, destination lock and moving state', async () => {
  for (const provider of ['ALS', 'BLS']) {
    const f = fixture(), events = [], releases = [];
    let enteredDepart;
    const departStarted = new Promise(r => { enteredDepart = r; });
    Object.assign(f.context, {
      hasPlayedLoading: false, hasPlayedDepart: false,
      localTranscript: { meta: { provider_level: provider } },
      playSound: sound => events.push(sound),
    waitForSound: async () => {},
      lockDestinationPanel: dest => events.push(`lock:${dest}`),
      animateLoading: () => { events.push('loading'); return new Promise(r => releases.push(r)); },
      animateDepart: () => { events.push('depart'); enteredDepart(); return new Promise(r => releases.push(r)); },
    });
    const start = source.indexOf('    // Contextual animations');
    const end = source.indexOf('    // A terminal skip', start);
    vm.runInContext('async function transportEvents(data) {\n' + source.slice(start, end) + '\n}', f.context);
    await f.context.transportEvents({}); assert.equal(events.length, 0);
    let done = false;
    const p = f.context.transportEvents({ loading: true, departing: true, transport_dest: 'hospital' }).then(() => { done = true; });
    assert.deepEqual(events, [provider === 'BLS' ? 'sfx_loading_bls' : 'sfx_loading_als', 'loading']);
    releases.shift()(); await departStarted;
    assert.equal(f.context.window._isMoving, true);
    assert.deepEqual(events.slice(2), ['lock:hospital', 'sfx_depart', 'depart']);
    assert.equal(done, false); releases.shift()(); await p;
    await f.context.transportEvents({ loading: true, departing: true, transport_dest: 'hospital' });
    assert.equal(events.length, 5, 'repeated server flags do not replay transport');
  }
});


test('NCD routes to the chest scene while needle cric synchronizes its existing scene and sound', async () => {
  const f = fixture();
  vm.runInContext(source.slice(source.indexOf('function animateNCD('), source.indexOf('function animateOPA(')), f.context);
  const p = f.context.animateNCD('SUCCESS');
  assert.equal(f.elements.get('ncd-label').textContent, 'SUCCESS · AIR RELEASED');
  f.advance(f.context.timing.ncd.sound - 1); assert.equal(f.played.length, 0);
  f.advance(1); assert.equal(f.played[0].sound, 'hiss');
  f.advance(f.context.timing.ncd.hold + 220); await p;
  for (const suffix of ['overlay', 'header', 'label']) f.elements.set(`ncric-${suffix}`, f.elements.get(`bvm-${suffix}`));
  const legacy = f.context.animateNCD('MARGINAL', 'needle_cricothyrotomy');
  assert.equal(f.elements.get('ncric-header').textContent, 'NEEDLE CRICOTHYROTOMY');
  assert.equal(f.context.hasProcedureAnimationSound('needle_cricothyrotomy'), true);
  f.advance(1099);assert.equal(f.played.length,1);f.advance(1);assert.equal(f.played.at(-1).sound,'hiss');
  f.advance(1720); await legacy;
  assert.equal(f.played.length, 2, 'needle cric owns its action cue');
});

// Shock modes share the lifecycle and own their sound at the shock, including legacy multi-rolls.
test('cardioversion and defibrillation use identical animation clocks and sound, retaining their headers', async () => {
  const f = fixture();
  const traces = new Map();
  vm.runInContext(source.slice(source.indexOf('function animateDefib('), source.indexOf('function animateThorsHammer(')), f.context);
  for (const procedure of ['cardioversion', 'defibrillation']) {
    for (const outcome of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION']) {
      const before = f.played.length;
      const p = f.context.animateDefib(procedure, outcome);
      const overlay = f.elements.get('defib-overlay');
      assert.equal(overlay.classList.contains('is-cardioversion'), false);
      const trace = { properties: {...overlay.properties}, label: f.elements.get('defib-label').textContent };
      if (traces.has(outcome)) assert.deepEqual(trace, traces.get(outcome));
      else traces.set(outcome, trace);
      assert.equal(f.elements.get('defib-header').textContent, procedure === 'cardioversion' ? 'SYNCHRONIZED CARDIOVERSION' : 'DEFIBRILLATION');
      f.advance(0); assert.equal(f.played.at(-1).sound, 'defib_outside');
      f.advance(9646); await p;
      assert.equal(f.played.length, before + 1);
    }
  }
});

test('manual shocks wait for input and automatic shocks fire at full charge with the correct SYNC state', async () => {
  const f = fixture();
  const makeControl = () => ({
    disabled: false, attributes: {}, focus() {},
    setAttribute(key, value) { this.attributes[key] = value; },
  });
  for (const suffix of ['shock', 'sync', 'charge', 'charge-status', 'current-energy']) {
    f.elements.set(`defib-${suffix}`, makeControl());
  }
  const overlay = f.elements.get('defib-overlay');
  overlay.contains = () => false;
  const shock = f.elements.get('defib-shock');
  const sync = f.elements.get('defib-sync');
  const label = f.elements.get('defib-label');
  const cues = [];
  f.context.performance = { now: () => 0 };
  f.context.soundEnabled = true;
  f.context.playSound = (name, options) => {
    const voice = { name, options, paused: false, pause() { this.paused = true; } };
    cues.push(voice);
    return voice;
  };
  f.context.setInterval = (fn, delay) => {
    const interval = {};
    const tick = () => { interval.timer = f.context.setTimeout(tick, delay); fn(); };
    interval.timer = f.context.setTimeout(tick, delay);
    return interval;
  };
  f.context.clearInterval = interval => f.context.clearTimeout(interval?.timer);
  vm.runInContext(source.slice(source.indexOf('function animateDefib('), source.indexOf('function animateThorsHammer(')), f.context);
  for (const [procedure, enableSync] of [['defibrillation', false], ['cardioversion', false], ['cardioversion', true]]) {
    cues.length = 0;
    const done = f.context.animateDefib(procedure, 'SUCCESS', 150);
    assert.equal(shock.disabled, true);
    assert.equal(sync.disabled, procedure === 'defibrillation');
    shock.onclick();
    f.advance(18000);
    assert.equal(shock.disabled, false);
    assert.equal(overlay.classList.contains('shock-wait'), true);
    assert.equal(f.elements.get('defib-charge').value, 150);
    const [readyTone, ...extraTones] = cues.filter(cue => cue.name === 'defib_ready');
    assert.equal(readyTone.options.loop, true);
    assert.equal(extraTones.length, 0, 'one continuous source plays throughout the wait');
    if (enableSync) sync.onclick();
    shock.onclick();
    const cueCount = cues.length;
    assert.equal(cues.at(-1).name, 'defib_outside');
    assert.equal(cues.at(-2).paused, true);
    assert.equal(overlay.classList.contains('shock-wait'), false);
    if (procedure === 'cardioversion' && !enableSync) assert.match(label.textContent, /AUTOMATIC d20 = 1/);
    else assert.equal(label.textContent, 'SUCCESS');
    f.advance(10000);
    assert.equal(await done, enableSync);
    assert.equal(cues.length, cueCount);
    assert.equal(f.timers.length, 0);
  }
  for (const procedure of ['cardioversion', 'defibrillation']) {
    cues.length = 0;
    const synchronized = procedure === 'cardioversion';
    const done = f.context.animateDefib(procedure, 'SUCCESS', 150, 1, false);
    assert.equal(sync.attributes['aria-pressed'], String(synchronized));
    assert.equal(sync.disabled, true);
    assert.equal(shock.disabled, true);
    assert.equal(overlay.classList.contains('visible'), true);
    f.advance(2799);
    assert.equal(overlay.classList.contains('shock-wait'), true);
    f.advance(1);
    assert.equal(f.elements.get('defib-charge').value, 150);
    assert.equal(overlay.classList.contains('shock-wait'), false);
    assert.equal(label.textContent, 'SUCCESS');
    assert.equal(shock.disabled, true);
    assert.deepEqual(cues.map(cue => cue.name), ['defib_charge', 'defib_outside']);
    f.advance(10000);
    assert.equal(await done, synchronized);
    assert.equal(f.timers.length, 0);
  }
});

test('fluid, blood, oxygen and ECG orders reach their scenes through the production roll loop', async () => {
  const { detectWithConfirmation } = require('../src/engine/dice');
  const f=fixture(),events=[];
  f.elements.set('infusion-overlay',{dataset:{}});
  f.elements.set('infusion-header',{textContent:''});
  Object.assign(f.context,{
    console:{log(){}},
    animateDiceRoll:async id=>events.push(['dice',id]),
    animateRouteMedication:async(id,outcome)=>events.push(['scene',id,outcome]),
    animateTwelveLead:async (outcome,procedure)=>events.push(['scene',procedure,outcome]),
    animateMedPush:async()=>events.push(['wrong-scene']),
    showDrugPanel:()=>{},
  });
  vm.runInContext(source.slice(source.indexOf('async function animateMedicationAdministration('),source.indexOf('function animateRouteMedication(')),f.context);
  const start=source.indexOf('    for (const r of (data.rolls || [])) {');
  const end=source.indexOf('    for (const r of (data.rolls || [])) printRoll',start);
  vm.runInContext('async function runOrders(data) {\n'+source.slice(start,end)+'\n}',f.context);
  for(const [order,scene,kind] of [['Give LR IV','infusion','fluid'],['Transfuse FFP','infusion','blood'],['Give oxygen via NRB','oxygen',null],['Once nebulizer is finished, switch to nonrebreather at 10','oxygen',null],['Obtain posterior ECG','posterior_ecg',null],['Obtain right sided ECG','right_sided_ecg',null],['Obtain V4R','v4r_ecg',null]]){
    events.length=0;
    const detected=detectWithConfirmation(order);
    await f.context.runOrders(detected);
    assert.equal(events[0][0],'dice',order);
    assert.deepEqual(events[1],['scene',scene,detected.rolls[0].outcome],order);
    assert.equal(f.played.length,0,'scene owns sound; no premature cue before dice');
    if(kind)assert.equal(f.elements.get('infusion-overlay').dataset.fluid,kind);
  }
  events.length=0;
  await f.context.runOrders(detectWithConfirmation('ETCO2 NC'));
  assert.deepEqual(events,[],'sampling cannula does not play an oxygen scene or roll dice');
});

test('legacy and route scenes align their sound to the action or result instead of the dice', async () => {
  for(const [fn,id,delay,proc] of [['animateIV','iv',100,'peripheral_iv'],['animateTwelveLead','ekg',1500,'twelve_lead'],['animateDrill','io',0,'io_access'],['animateCPR','cpr',0,'cpr']]){
    const f=fixture();
    for(const suffix of ['overlay','label']) f.elements.set(`${id}-${suffix}`,f.elements.get(`sga-${suffix}`));
    vm.runInContext(source.match(new RegExp('function '+fn+'\\(outcome[^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0],f.context);
    const done=f.context[fn]('SUCCESS');
    assert.equal(f.played.length,0);
    if(delay) {f.advance(delay-1);assert.equal(f.played.length,0);f.advance(1);}else f.advance(0);
    assert.equal(f.played.length,1);assert.equal(f.played[0].time,delay);
    assert.equal(f.played[0].sound,f.context.getProcedureSound(proc,'SUCCESS'));
    f.advance(4000);await done;assert.equal(f.timers.length,0);
  }
  for(const [id,delay] of [['oralmed',1900],['immed',1900],['inmed',1550],['nebmed',2100],['niv',2550],['infusion',1900],['oxygen',1900]]){
    for (const outcome of ['SUCCESS', 'FAILURE']) {
      const f=fixture();
      for(const suffix of ['overlay','label']) f.elements.set(`${id}-${suffix}`,f.elements.get(`sga-${suffix}`));
      if (id === 'infusion') f.elements.get(`${id}-overlay`).dataset = { fluid: 'fluid' };
      vm.runInContext(source.slice(source.indexOf('function animateRouteMedication('),source.indexOf('function animateNIV(')),f.context);
      const done=f.context.animateRouteMedication(id,outcome,3200);
      f.advance(delay-1);
      assert.deepEqual(['oxygen', 'nebmed', 'niv'].includes(id) ? [{sound:'oxygen_flow',time:100}] : [{sound:({oralmed:'med_oral_action',immed:'med_im_action',inmed:'med_in_action'})[id] || 'healing',time:100}], f.played);
      f.advance(1);assert.equal(f.played.length, 1, 'no duplicate outcome cue during the scene');
      assert.equal(f.elements.get(`${id}-overlay`).properties['--route-result-delay'],`${delay}ms`);
      f.advance(4000);await done;assert.equal(f.timers.length,0);
    }
  }
});

test('medication push and blood keep the healing cue without repeating dice feedback', async () => {
  const push = fixture();
  for (const suffix of ['overlay', 'label']) push.elements.set(`medpush-${suffix}`, push.elements.get(`sga-${suffix}`));
  vm.runInContext(source.slice(source.indexOf('function animateMedPush('), source.indexOf('// Explicit routes take precedence')), push.context);
  const pushDone = push.context.animateMedPush('FAILURE');
  push.advance(1800);
  assert.deepEqual(push.played, [{ sound: 'healing', time: 100 }]);
  push.advance(920); await pushDone;

  const blood = fixture();
  for (const suffix of ['overlay', 'label']) blood.elements.set(`infusion-${suffix}`, blood.elements.get(`sga-${suffix}`));
  blood.elements.get('infusion-overlay').dataset = { fluid: 'blood' };
  vm.runInContext(source.slice(source.indexOf('function animateRouteMedication('), source.indexOf('function animateNIV(')), blood.context);
  const bloodDone = blood.context.animateRouteMedication('infusion', 'SUCCESS', 3200);
  blood.advance(1900);
  assert.deepEqual(blood.played, [{ sound: 'healing', time: 100 }]);
  blood.advance(1520); await bloodDone;
});

test('all medication routes keep their original action cue, including no-roll, reduced motion and missing overlays', async () => {
  const cases = [
    ['PO', 'oralmed', 'med_oral_action'], ['SL', 'oralmed', 'med_oral_action'],
    ['IM', 'immed', 'med_im_action'], ['IN', 'inmed', 'med_in_action'],
    ['IV', 'medpush', 'healing'], ['IO', 'medpush', 'healing'],
    ['NEB', 'nebmed', 'oxygen_flow'],
  ];
  for (const [route, scene, cue] of cases) {
    for (const options of [{}, { reduced: true }, { missing: true }]) {
      for (const noRoll of [false, true]) {
        const f = fixture(options);
        for (const suffix of ['overlay', 'label']) f.elements.set(`${scene}-${suffix}`, f.elements.get(`sga-${suffix}`));
        vm.runInContext(source.slice(source.indexOf('function animateMedPush('), source.indexOf('function animateNIV(')), f.context);
        const done = f.context.animateMedicationAdministration({ administration_route: route, outcome: 'FAILURE', no_roll: noRoll });
        f.advance(4000); await done;
        assert.deepEqual(f.played.map(event => event.sound), [cue], `${route}: noRoll=${noRoll}, ${JSON.stringify(options)}`);
        assert.equal(f.timers.length, 0);
      }
    }
  }
});

test('procedure sound audit keeps explicit recordings for every outcome and ambulance/provider variant', () => {
  const f = fixture();
  const expected = {
    defibrillation: 'defib_outside', cardioversion: 'defib_outside',
    chest_seal: 'chest_slap', bleeding_control: 'squelch', tourniquet: 'squelch',
    precordial_thump: 'thump', lucas: 'lucas', needle_decompression: 'hiss', needle_cricothyrotomy: 'hiss',
    cpr: 'cpr_outside', io_access: 'io', medication_push: 'healing', peripheral_iv: 'healing',
    cricothyrotomy: 'sword', finger_thoracostomy: 'sword', resuscitative_thoracotomy: 'surgical', perimortem_csection: 'surgical',
    lateral_canthotomy: 'surgical',
    intubation: 'intubation', rsi: 'intubation', suction: 'suction',
    oropharyngeal_airway: 'airway_gulp', supraglottic_airway: 'airway_gulp', nasopharyngeal_airway: 'airway_gulp',
    foreign_body_removal: 'airway_gulp', abdominal_thrusts: 'airway_gulp',
    oxygen: 'oxygen_flow', cpap: 'oxygen_flow', pacing: 'pacing_beep', twelve_lead: 'lifepak',
  };
  for (const [id, sound] of Object.entries(expected)) {
    for (const outcome of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION']) {
      assert.equal(f.context.getProcedureSound(id, outcome), sound, `${id} ${outcome}`);
      assert.equal(f.context.hasProcedureAnimationSound(id), true, `${id} owns its cue`);
    }
  }
  for (const provider of ['ALS', 'BLS']) {
    f.context.localTranscript = { meta: { provider_level: provider } };
    for (const moving of [false, true]) {
      f.context.window._isMoving = moving;
      assert.equal(f.context.getProcedureSound('cpr', 'FAILURE'), `cpr_${provider === 'BLS' ? 'bls_' : ''}${moving ? 'amb' : 'outside'}`);
      for (const id of ['defibrillation', 'cardioversion']) assert.equal(f.context.getProcedureSound(id, 'FAILURE'), moving ? 'defib_amb' : 'defib_outside');
    }
  }
});

test('CPR, LUCAS, shock and thump recordings survive their shorter overlays', async () => {
  for (const [fn, scene, args, sound, duration] of [
    ['animateCPR', 'cpr', ['SUCCESS'], 'cpr_outside', 8.052],
    ['animateLUCAS', 'lucas', ['FAILURE'], 'lucas', 5.604],
    ['animateDefib', 'defib', ['defibrillation', 'SUCCESS'], 'defib_outside', 9.426],
    ['animateDefib', 'defib', ['cardioversion', 'FAILURE'], 'defib_outside', 9.426],
    ['animateThorsHammer', 'thump', ['FAILURE'], 'thump', 14.420],
  ]) {
    const f = fixture(), nodes = [];
    for (const suffix of ['overlay', 'label']) if (!f.elements.has(`${scene}-${suffix}`)) f.elements.set(`${scene}-${suffix}`, f.elements.get(`sga-${suffix}`));
    f.context.window.AudioContext = function () { return {
      state: 'running', currentTime: 0, destination: {},
      decodeAudioData: async () => ({ duration }),
      createBufferSource() { const node = { connect() { return { connect() {} }; }, start() { this.started = true; }, stop() { this.stopped = true; }, disconnect() {} }; nodes.push(node); return node; },
      createGain: () => ({ gain: {}, disconnect() {} }),
    }; };
    Object.assign(f.context, { EventTarget, Event, soundEnabled: true, fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }) });
    vm.runInContext(source.slice(0, source.indexOf('const SURGICAL_PROCS')), f.context);
    vm.runInContext(source.slice(source.indexOf('function animateDefib('), source.indexOf('function animateIV(')), f.context);
    const done = f.context[fn](...args);
    f.advance(10000); await new Promise(resolve => setImmediate(resolve)); await done;
    assert.equal(f.context.getProcedureSound(scene === 'thump' ? 'precordial_thump' : scene === 'defib' ? args[0] : scene, args.at(-1)), sound);
    assert.equal(nodes.length, 1, `${fn}: one physical recording`);
    assert.equal(nodes[0].buffer.duration, duration);
    assert.equal(nodes[0].started, true);
    assert.ok(!nodes[0].stopped, `${fn}: overlay cleanup must not truncate audio`);
    nodes[0].onended();
    assert.equal(vm.runInContext('ACTIVE_SOUND_VOICES.size', f.context), 0);
  }
});

test('multi-roll pacing waits for the outcome tail before starting its scene', async () => {
  const f = fixture(), events = [];
  let finishFeedback;
  Object.assign(f.context, {
    console: { log() {} },
    playSound: sound => events.push(sound),
    waitForSound: () => new Promise(resolve => { finishFeedback = resolve; }),
    animateDiceRoll: async () => events.push('unexpected dice'),
    animateProcedureScene: async (scene, id, outcome) => events.push([scene, id, outcome]),
  });
  const start = source.indexOf('    for (const r of (data.rolls || [])) {');
  const end = source.indexOf('    for (const r of (data.rolls || [])) printRoll', start);
  vm.runInContext('async function runOrders(data) {\n' + source.slice(start, end) + '\n}', f.context);
  const done = f.context.runOrders({ rolls: [{ procedure_id: 'pacing', outcome: 'FAILURE', multi_roll: true, dc: [10, 12] }] });
  assert.deepEqual(events, ['fail'], 'no physical cue during the result tail');
  finishFeedback(); await done;
  assert.deepEqual(events, ['fail', ['pacing', 'pacing', 'FAILURE']]);
});


test('a delayed oral pickup finishes before the scene releases the next action', async () => {
  const f = fixture();
  for (const suffix of ['overlay', 'label']) f.elements.set(`oralmed-${suffix}`, f.elements.get(`sga-${suffix}`));
  const voice = {}, finished = new Promise(resolve => { voice.finish = resolve; });
  f.context.playSound = () => voice;
  f.context.waitForSound = played => { assert.equal(played, voice); return finished; };
  vm.runInContext(source.slice(source.indexOf('function animateRouteMedication('), source.indexOf('function animateNIV(')), f.context);
  let complete = false;
  const done = f.context.animateRouteMedication('oralmed', 'SUCCESS', 2600).then(() => { complete = true; });
  f.advance(3000);
  assert.equal(complete, false);
  assert.equal(f.elements.get('oralmed-overlay').classList.contains('visible'), true);
  voice.finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.elements.get('oralmed-overlay').classList.contains('visible'), false);
  f.advance(220); await done;
  assert.equal(complete, true);
});


test('pacing tones follow capture or slow intrinsic failure beats, with silent complications', async () => {
  for (const [outcome, expected] of [
    ['SUCCESS', [1800, 2400, 3000, 3600, 4200, 4800]],
    ['MARGINAL', [1800, 3000, 4200]], ['FAILURE', [1800, 4800]], ['COMPLICATION', []],
  ]) {
    for (const reduced of [false, true]) {
      const f = fixture({ reduced });
      const done = f.context.animateProcedureScene('pacing', 'pacing', outcome);
      f.advance(1799);
      assert.equal(f.played.length, 0, 'no monitor tone before capture');
      f.advance(3621); await done;
      assert.deepEqual(f.played, expected.map(time => ({ sound: 'pacing_beep', time })));
      const overlay = f.elements.get('pacing-overlay');
      assert.equal(overlay.properties['--pacing-captures'], expected.length);
      assert.equal(overlay.classList.contains('visible'), false);
      assert.equal(f.timers.length, 0);
    }
  }
});

test('backgrounding pacing cancels future capture tones', () => {
  const f = fixture();
  let onVisibility;
  f.context.document.addEventListener = (_name, listener) => { onVisibility = listener; };
  f.context.document.removeEventListener = () => {};
  f.context.animateProcedureScene('pacing', 'pacing', 'SUCCESS');
  f.advance(1800);
  f.context.document.hidden = true;
  onVisibility();
  f.context.document.hidden = false;
  f.advance(4000);
  assert.deepEqual(f.played, [{ sound: 'pacing_beep', time: 1800 }]);
});

// The full blade/soft-tissue collision audit lives in browser-laryngoscope.js.
test('rebuilt intubation routes use the oral opening and separate descending lumens', () => {
  const routes = ['tracheal', 'esophageal', 'failed'].map(name => {
    const d = html.match(new RegExp('id="lx-' + name + '-route"[^>]*d="([^\"]+)"'))[1];
    const values = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    return { start: values.slice(0, 2), end: values.slice(-2) };
  });
  assert.deepEqual(routes[0].start, routes[1].start, 'both outcomes enter through the same mouth');
  assert.ok(routes[0].end[0] > 400 && routes[0].end[1] > 330, 'tube descends with the neck');
  assert.ok(routes[1].end[1] - routes[0].end[1] > 25, 'esophageal tube remains posterior to the tracheal tube');
  assert.ok(routes[2].end[0] < 280, 'failed pass stops before the cords');
});
