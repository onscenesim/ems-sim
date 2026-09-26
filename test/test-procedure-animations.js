'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
const sounds = source.slice(source.indexOf('const SURGICAL_PROCS'), source.indexOf('// ── Mobile audio unlock'));
const scenes = source.slice(source.indexOf('const PROCEDURE_TIMING'), source.indexOf('function animateDefib'));
function fixture({ reduced = false, missing = false } = {}) {
  let now = 0;
  const timers = [], played = [], elements = new Map();
  for (const scene of ['bvm', 'lucas', 'scalpel', 'laryngoscope', 'npa', 'obstruction', 'sga', 'opa', 'suction', 'ncd', 'bleeding_control', 'tourniquet', 'chest_seal', 'pacing', 'defib']) {
    for (const suffix of ['overlay', 'label', 'header']) {
      const classes = new Set(), properties = {};
      elements.set(`${scene}-${suffix}`, {
        textContent: '', offsetWidth: 100, properties,
        set className(value) { classes.clear(); value.split(' ').filter(Boolean).forEach(c => classes.add(c)); },
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
        style: { setProperty: (key, value) => { properties[key] = value; } },
      });
    }
  }
  const context = vm.createContext({
    window: { matchMedia: () => ({ matches: reduced }) }, localTranscript: null,
    document: { getElementById: id => missing ? null : elements.get(id) },
    playSound: sound => played.push({ sound, time: now }),
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

test('12-lead EKG reuses the CPR torso model with all six precordial leads', () => {
  const ekg = html.slice(html.indexOf('<div id="ekg-overlay"'), html.indexOf('<!-- OPA', html.indexOf('<div id="ekg-overlay"')));
  assert.match(ekg, /<use href="#procedure-torso"\/>/);
  assert.equal((ekg.match(/class="ekg-lead"/g) || []).length, 6);
  assert.doesNotMatch(ekg, /Bare torso|trapezius|costal margin hint/);
});

for (const id of ['bvm', 'lucas', 'scalpel', 'laryngoscope', 'npa', 'obstruction', 'sga', 'opa', 'suction', 'ncd', 'bleeding_control', 'tourniquet', 'chest_seal', 'pacing', 'defib']) {
  test(`${id}: action sound fires once, result timing is shared with CSS, and cleanup resolves after fade`, async () => {
    const f = fixture();
    const procedure = id === 'scalpel' ? 'cricothyrotomy' : id === 'laryngoscope' ? 'intubation' : id === 'sga' ? 'supraglottic_airway' : id === 'opa' ? 'oropharyngeal_airway' : id === 'ncd' ? 'needle_decompression' : id;
    const t = f.context.timing[id];
    let complete = false;
    const promise = f.context.animateProcedureScene(id, procedure, 'SUCCESS').then(() => { complete = true; });
    const overlay = f.elements.get(`${id}-overlay`);
    assert.equal(overlay.classList.contains('visible'), true);
    assert.equal(overlay.classList.contains('outcome-SUCCESS'), true);
    assert.equal(overlay.properties['--procedure-cycle'], `${t.cycle}ms`);
    assert.equal(overlay.properties['--procedure-result'], `${t.result}ms`);
    assert.ok(t.result + 180 <= t.hold, 'result is readable before fade');
    f.advance(99); assert.equal(f.played.length, 0);
    f.advance(t.sound - 100);
    assert.deepEqual(f.played, t.action ? [{ sound: t.action, time: 100 }] : []);
    f.advance(1); assert.deepEqual(f.played.slice(t.action ? 1 : 0), [{ sound: id === 'bvm' ? 'bvm_success' : id === 'lucas' ? 'lucas' : id === 'ncd' ? 'hiss' : ['laryngoscope', 'npa', 'obstruction', 'sga', 'opa', 'suction', 'bleeding_control', 'tourniquet', 'chest_seal', 'pacing', 'defib'].includes(id) ? 'success' : 'sword', time: t.sound }]);
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
  for (const id of ['bvm', 'lucas', 'scalpel', 'laryngoscope', 'npa', 'obstruction', 'sga', 'opa', 'suction', 'ncd', 'bleeding_control', 'tourniquet', 'chest_seal', 'pacing', 'defib']) {
    const f = fixture();
    const proc = id === 'scalpel' ? 'finger_thoracostomy' : id === 'laryngoscope' ? 'rsi' : id === 'sga' ? 'supraglottic_airway' : id === 'opa' ? 'oropharyngeal_airway' : id === 'ncd' ? 'needle_decompression' : id;
    for (const outcome of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION', 'SUCCESS']) {
      const p = f.context.animateProcedureScene(id, proc, outcome);
      const overlay = f.elements.get(`${id}-overlay`);
      for (const possible of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION']) {
        assert.equal(overlay.classList.contains(`outcome-${possible}`), outcome === possible);
      }
      f.advance(f.context.timing[id].hold + 220); await p;
      const good = outcome === 'SUCCESS' || outcome === 'MARGINAL';
      assert.equal(f.played.at(-1).sound, id === 'scalpel' ? 'sword' : id === 'ncd' ? good ? 'hiss' : 'fail' : ['laryngoscope', 'npa', 'obstruction', 'sga', 'opa', 'suction', 'bleeding_control', 'tourniquet', 'chest_seal', 'pacing', 'defib'].includes(id) ? good ? 'success' : 'fail' : id === 'bvm' ? good ? 'bvm_success' : 'bvm_fail' : good ? 'lucas' : 'fail');
    }
    assert.equal(f.played.length, f.context.timing[id].action ? 10 : 5);
  }
});

test('reduced motion and missing scenes retain sounds and always release the turn', async () => {
  for (const id of ['bvm', 'lucas', 'scalpel', 'laryngoscope', 'npa', 'obstruction', 'sga', 'opa', 'suction', 'ncd', 'bleeding_control', 'tourniquet', 'chest_seal', 'pacing', 'defib']) {
    const procedure = id === 'scalpel' ? 'resuscitative_thoracotomy' : id === 'laryngoscope' ? 'intubation' : id === 'sga' ? 'supraglottic_airway' : id === 'opa' ? 'oropharyngeal_airway' : id === 'ncd' ? 'needle_decompression' : id;
    for (const options of [{ reduced: true }, { missing: true }]) {
      const f = fixture(options);
      const p = f.context.animateProcedureScene(id, procedure, 'FAILURE');
      assert.equal(f.played.length, 1); assert.equal(f.played[0].time, 0);
      f.advance(f.context.timing[id].hold + 220); await p;
      assert.equal(f.played.length, 1); assert.equal(f.timers.length, 0);
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
  const p = c.rolls({ rolls: ['bvm', 'lucas', 'cricothyrotomy', 'resuscitative_thoracotomy', 'intubation', 'rsi', 'nasopharyngeal_airway', 'foreign_body_removal', 'abdominal_thrusts', 'supraglottic_airway', 'oropharyngeal_airway', 'suction', 'needle_decompression', 'needle_cricothyrotomy', 'bleeding_control', 'tourniquet', 'chest_seal', 'pacing', 'cpr', 'defibrillation'].map(procedure_id => ({ procedure_id, outcome: 'SUCCESS', roll: 18, dc: 12 })) });
  await started;
  assert.deepEqual(events, ['dice:bvm', 'bvm']);
  release(); await p;
  assert.deepEqual(events, ['dice:bvm', 'bvm', 'dice:lucas', 'lucas', 'dice:cricothyrotomy', 'cricothyrotomy', 'dice:resuscitative_thoracotomy', 'resuscitative_thoracotomy', 'dice:intubation', 'intubation', 'dice:rsi', 'rsi', 'dice:nasopharyngeal_airway', 'npa', 'dice:foreign_body_removal', 'obstruction', 'dice:abdominal_thrusts', 'obstruction', 'dice:supraglottic_airway', 'sga', 'dice:oropharyngeal_airway', 'opa', 'dice:suction', 'suction', 'dice:needle_decompression', 'needle_decompression', 'dice:needle_cricothyrotomy', 'needle_cricothyrotomy', 'dice:bleeding_control', 'bleeding_control', 'dice:tourniquet', 'tourniquet', 'dice:chest_seal', 'chest_seal', 'dice:pacing', 'pacing', 'dice:cpr', 'cpr', 'defib']);
  events.length = 0;
  await c.rolls({ rolls: [{ procedure_id: 'lucas', outcome: 'FAILURE', multi_roll: true }, { procedure_id: 'bvm', no_roll: true }] });
  assert.deepEqual(events, ['fail'], 'legacy multi/no-roll routing remains unchanged');
});


test('intubation and RSI use the same anatomical scene with distinct outcome captions', async () => {
  const f = fixture();
  vm.runInContext(source.slice(source.indexOf('function animateLaryngoscope('), source.indexOf('function animateDepart(')), f.context);
  for (const procedure of ['intubation', 'rsi']) {
    for (const [outcome, caption] of [['SUCCESS', 'TUBE THROUGH THE CORDS'], ['MARGINAL', 'TRACHEAL PLACEMENT'], ['FAILURE', 'TUBE WITHDRAWN'], ['COMPLICATION', 'ESOPHAGEAL PLACEMENT']]) {
      const promise = f.context.animateLaryngoscope(procedure, outcome);
      assert.equal(f.elements.get('laryngoscope-header').textContent, procedure.toUpperCase());
      assert.equal(f.elements.get('laryngoscope-label').textContent, `${outcome} · ${caption}`);
      f.advance(f.context.timing.laryngoscope.sound);
      assert.equal(f.played.at(-1).sound, outcome === 'SUCCESS' || outcome === 'MARGINAL' ? 'success' : 'fail');
      assert.equal(f.elements.get('laryngoscope-overlay').classList.contains('visible'), true);
      f.advance(f.context.timing.laryngoscope.hold - f.context.timing.laryngoscope.sound + 220); await promise;
      assert.equal(f.elements.get('laryngoscope-overlay').classList.contains('visible'), false);
    }
  }
  assert.equal(f.played.length, 16);
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
      assert.equal(f.played.at(-1).sound, i < 2 ? 'success' : 'fail');
      assert.equal(f.elements.get(`${id}-overlay`).classList.contains('visible'), false);
    }
  }
  assert.equal(f.played.length, 16);
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
test('electrical shock modes preserve headers, sync state, and one timed sound', async () => {
  const f = fixture();
  vm.runInContext(source.slice(source.indexOf('function animateDefib('), source.indexOf('function animateThorsHammer(')), f.context);
  for (const procedure of ['cardioversion', 'defibrillation']) {
    for (const outcome of ['SUCCESS', 'MARGINAL', 'FAILURE', 'COMPLICATION']) {
      const before = f.played.length;
      const p = f.context.animateDefib(procedure, outcome);
      const overlay = f.elements.get('defib-overlay');
      assert.equal(overlay.classList.contains('is-cardioversion'), procedure === 'cardioversion');
      assert.equal(f.elements.get('defib-header').textContent, procedure === 'cardioversion' ? 'SYNCHRONIZED CARDIOVERSION' : 'DEFIBRILLATION');
      f.advance(1399); assert.equal(f.played.length, before);
      f.advance(1); assert.equal(f.played.at(-1).sound, 'defib_outside');
      f.advance(3220); await p;
      assert.equal(f.played.length, before + 1);
    }
  }
});

test('real fluid, blood and oxygen detection reaches the correct scene through the production roll loop', async () => {
  const { detectWithConfirmation } = require('../src/engine/dice');
  const f=fixture(),events=[];
  f.elements.set('infusion-overlay',{dataset:{}});
  f.elements.set('infusion-header',{textContent:''});
  Object.assign(f.context,{
    console:{log(){}},
    animateDiceRoll:async id=>events.push(['dice',id]),
    animateRouteMedication:async(id,outcome)=>events.push(['scene',id,outcome]),
    animateMedPush:async()=>events.push(['wrong-scene']),
    showDrugPanel:()=>{},
  });
  vm.runInContext(source.slice(source.indexOf('async function animateMedicationAdministration('),source.indexOf('function animateRouteMedication(')),f.context);
  const start=source.indexOf('    for (const r of (data.rolls || [])) {');
  const end=source.indexOf('    for (const r of (data.rolls || [])) printRoll',start);
  vm.runInContext('async function runOrders(data) {\n'+source.slice(start,end)+'\n}',f.context);
  for(const [order,scene,kind] of [['Give LR IV','infusion','fluid'],['Transfuse FFP','infusion','blood'],['Give oxygen via NRB','oxygen',null]]){
    events.length=0;
    const detected=detectWithConfirmation(order);
    await f.context.runOrders(detected);
    assert.equal(events[0][0],'dice',order);
    assert.deepEqual(events[1],['scene',scene,detected.rolls[0].outcome],order);
    assert.equal(f.played.length,0,'scene owns sound; no premature cue before dice');
    if(kind)assert.equal(f.elements.get('infusion-overlay').dataset.fluid,kind);
  }
});

test('legacy and route scenes align their sound to the action or result instead of the dice', async () => {
  for(const [fn,id,delay,proc] of [['animateIV','iv',1800,'peripheral_iv'],['animateTwelveLead','ekg',1500,'twelve_lead'],['animateDrill','io',0,'io_access'],['animateCPR','cpr',0,'cpr']]){
    const f=fixture();
    for(const suffix of ['overlay','label']) f.elements.set(`${id}-${suffix}`,f.elements.get(`sga-${suffix}`));
    vm.runInContext(source.match(new RegExp('function '+fn+'\\(outcome\\) \\{[\\s\\S]*?\\n\\}'))[0],f.context);
    const done=f.context[fn]('SUCCESS');
    assert.equal(f.played.length,0);
    if(delay) {f.advance(delay-1);assert.equal(f.played.length,0);f.advance(1);}else f.advance(0);
    assert.equal(f.played.length,1);assert.equal(f.played[0].time,delay);
    assert.equal(f.played[0].sound,f.context.getProcedureSound(proc,'SUCCESS'));
    f.advance(4000);await done;assert.equal(f.timers.length,0);
  }
  for(const [id,delay] of [['oralmed',1900],['inmed',1550],['nebmed',2100],['niv',2550],['infusion',1900],['oxygen',1900]]){
    for (const outcome of ['SUCCESS', 'FAILURE']) {
      const f=fixture();
      for(const suffix of ['overlay','label']) f.elements.set(`${id}-${suffix}`,f.elements.get(`sga-${suffix}`));
      vm.runInContext(source.slice(source.indexOf('function animateRouteMedication('),source.indexOf('function animateNIV(')),f.context);
      const done=f.context.animateRouteMedication(id,outcome,3200);
      f.advance(delay-1);
      assert.deepEqual(['oxygen', 'nebmed', 'niv'].includes(id) ? [{sound:'oxygen_flow',time:100}] : [], f.played);
      f.advance(1);assert.deepEqual(f.played.at(-1),{sound:outcome === 'SUCCESS' ? 'success' : 'fail',time:delay});
      assert.equal(f.elements.get(`${id}-overlay`).properties['--route-result-delay'],`${delay}ms`);
      f.advance(4000);await done;assert.equal(f.timers.length,0);
    }
  }
});
