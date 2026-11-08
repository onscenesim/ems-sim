'use strict';
const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(),'ems-low-acuity-test-'));
process.env.EMS_DATA_DIR = dataDir;
after(()=>fs.rmSync(dataDir,{recursive:true,force:true}));
const {LOW_ACUITY_CALLS, LOW_ACUITY_CONTRACT} = require('../src/data/scenarios/low-acuity');
const {catalog, prepareInstructor} = require('../src/engine/instructor');
const {rollScenario} = require('../src/engine/roller');
const {assembleSeedBlock, buildDebriefContext} = require('../src/engine/assembler');
const {rollCatastrophe} = require('../src/engine/catastrophes');
const {referredTwelveLeads} = require('../src/engine/twelve-lead');
const ECG = require('../public/twelve-lead');
const seedFor = (entry, difficulty='NORMAL', provider_level='ALS', i=0) => rollScenario({difficulty, provider_level,
  random_seed:`low-acuity-${i}`, instructor:prepareInstructor({case_id:entry.case_id})});

test('all nine standalone cases are selectable and retain distinct dispatch, scene and history', () => {
  assert.equal(LOW_ACUITY_CALLS.length, 9);
  assert.equal(catalog().filter(e=>e.low_acuity_call).length, 9);
  assert.equal(new Set(LOW_ACUITY_CALLS.map(e=>e.case_id)).size, 9);
  const before = structuredClone(LOW_ACUITY_CALLS);
  for (const entry of LOW_ACUITY_CALLS) for (const level of ['ALS','BLS']) {
    const seed = seedFor(entry, 'NORMAL', level);
    const prompt = assembleSeedBlock(seed), debrief = buildDebriefContext(seed, []);
    assert.ok(prompt.includes(LOW_ACUITY_CONTRACT));
    for (const field of ['dispatch','opening','history','behavior']) assert.ok(prompt.includes(entry.low_acuity_call[field]));
    assert.ok(debrief.includes(entry.low_acuity_call.history));
    assert.ok(debrief.includes(entry.low_acuity_call.behavior));
    assert.match(debrief, /no hidden emergency or deterioration/);
    assert.doesNotMatch(prompt, /Bundle: otherwise_healthy|PAIRED FREQUENT CALLER|CALL-SPECIFIC CREW REACTIONS — mandatory/);
    assert.equal(seed.comorbidity_bundle, null);
    assert.equal(seed.special_circumstance, null);
    seed.low_acuity_call.history = 'changed during play';
  }
  assert.deepEqual(LOW_ACUITY_CALLS, before);
});

test('no ordinary difficulty rolls an occult illness, deterioration clock or catastrophe into these calls', () => {
  for (const entry of LOW_ACUITY_CALLS) for (const difficulty of ['EASY','NORMAL','HARD']) for (let i=0;i<80;i++) {
    const seed = seedFor(entry, difficulty, 'ALS', i);
    assert.equal(seed.trajectory, 'stable');
    assert.equal(seed.decompensation_clock, null);
    assert.equal(seed.catastrophe, undefined);
    assert.ok(!['clinical_curveball','all','catastrophic'].includes(seed.complication_type));
    seed.complication_type = 'equipment_failure';
    rollCatastrophe(seed, ()=>0);
    assert.equal(seed.catastrophe, undefined);
  }
});

test('Black Cloud retains its deterioration and disaster mechanics without corrupting the authored scene', () => {
  for (const entry of LOW_ACUITY_CALLS) {
    const seed = seedFor(entry, 'BLACK_CLOUD');
    assert.notEqual(seed.trajectory, 'stable');
    assert.ok(seed.decompensation_clock > 0);
    assert.deepEqual(seed.low_acuity_call, entry.low_acuity_call);
    seed.complication_type = 'all';
    rollCatastrophe(seed, ()=>0);
    assert.equal(seed.complication_type, 'catastrophic');
    assert.ok(seed.catastrophe);
    assert.match(assembleSeedBlock(seed), /BLACK CLOUD MODE — THE UNIVERSE HAS DECIDED/);
  }
});

test('natural draws reach every low-acuity call and the hangover never rolls an elderly patient or young child', () => {
  const wanted = new Set(LOW_ACUITY_CALLS.map(e=>e.low_acuity_call.id));
  for (const category of new Set(LOW_ACUITY_CALLS.map(e=>e.category))) {
    for (let i=0;i<2500;i++) {
      const seed = rollScenario({category, difficulty:'NORMAL', random_seed:`natural-low-${category}-${i}`});
      if (!seed.low_acuity_call) continue;
      wanted.delete(seed.low_acuity_call.id);
      assert.equal(seed.trajectory, 'stable');
      assert.equal(seed.instructor_mode, undefined);
      if (seed.low_acuity_call.id === 'first-hangover') assert.ok(seed.patient_age >= 13 && seed.patient_age < 65);
    }
  }
  assert.equal(wanted.size, 0, [...wanted].join(', '));
});

test('urgent-care paper is normal, available on BLS without a roll, and filed once without changing later ECGs', () => {
  const entry = LOW_ACUITY_CALLS.find(e=>e.low_acuity_call.id==='urgent-care-stemi');
  for (const level of ['BLS','ALS']) {
    const seed = seedFor(entry,'NORMAL',level);
    assert.equal(ECG.selectPattern(seed), 'normal');
    assert.deepEqual(referredTwelveLeads({seed,userText:'begin',reply:'Dispatch: "STEMI at urgent care."'}), []);
    assert.equal(referredTwelveLeads({seed,userText:'begin',reply:'The doctor thrusts the 12-lead paper printout into your hands.'}).length,1);
    const records = referredTwelveLeads({seed,userText:'Review the EKG handed to us by urgent care.',minute:2,sessionId:'paper'});
    assert.equal(records.length, 1);
    const paper = records[0];
    assert.equal(paper.source,'urgent_care');
    assert.equal(paper.machine,null);
    assert.equal(paper.rate,76);
    assert.equal(paper.rhythm,'sinus');
    const qtc = Number(ECG.measurements(paper).qt.split(' / ')[1].split(' ')[0]);
    assert.ok(qtc >= 0.350 && qtc <= 0.450, `Normal referral QTc: ${qtc}`);
    for (const lead of Object.values(paper.leads)) assert.equal(lead.st,0);
    assert.deepEqual(referredTwelveLeads({seed,userText:'Review the EKG again.',turns:[{twelveLeads:records}]}), []);
    assert.equal(ECG.svg(paper),ECG.svg(JSON.parse(JSON.stringify(paper))));
  }
  assert.deepEqual(referredTwelveLeads({seed:seedFor(LOW_ACUITY_CALLS[0]),userText:'Review the EKG.'}), []);
});

test('real session files the referral paper and preserves case metadata through snapshot restore', async () => {
  require.cache[require.resolve('../src/engine/api')] = {exports:{sendTurn:async()=>
    'The provider hands you the ECG printout. Patient: "I felt fine before they scared me." [VITALS: GCS=15] [TIME: 1:00]',sendDebrief:async()=>''}};
  require.cache[require.resolve('../src/server/adminLogger')] = {exports:{logRun(){},updateRunDebrief(){}}};
  const {Session} = require('../src/engine/session');
  const entry = LOW_ACUITY_CALLS.find(e=>e.low_acuity_call.id==='urgent-care-stemi');
  const session = new Session(seedFor(entry,'NORMAL','BLS'),'referral-integration');
  await session.send('We arrive and review the EKG supplied by urgent care.');
  assert.equal(session.turns[0].twelveLeads.length,1);
  assert.ok(!session.turns[0].rolls.some(r=>r.procedure_id==='twelve_lead'));
  const {restoreSession, deleteSession} = require('../src/server/sessionStore');
  const restored = restoreSession(JSON.parse(JSON.stringify({id:'referral-integration', ...session.getTranscriptData(),
    sceneMinute:session.sceneMinute, lastVitals:session.lastVitals, patientRecords:session.patientRecords})));
  assert.deepEqual(restored.seed.low_acuity_call,session.seed.low_acuity_call);
  assert.deepEqual(restored.turns[0].twelveLeads,JSON.parse(JSON.stringify(session.turns[0].twelveLeads)));
  await restored.send('Ask the provider which leads concern them.');
  assert.equal(restored.turns.flatMap(t=>t.twelveLeads).length,1);
  deleteSession('referral-integration');
});
