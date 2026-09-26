'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { detectWithConfirmation, detectAllAndRoll, rollProcedure } = require('../src/engine/dice');
const { MEDICATION_ALIASES, FLUID_MEDICATIONS, BLOOD_PRODUCT_MEDICATIONS } = require('../public/medication-aliases');
const { applyCapillaryRefill } = require('../src/engine/capillary-refill');
const { decisionTimeline } = require('../src/engine/learning');
const { lookupDrug } = require('../public/drug-cards');
const meds = text => detectWithConfirmation(text).rolls.filter(r => r.procedure_id === 'medication_push');

test('each fluid and blood-component alias selects its own canonical medication and bag', () => {
  for (const name of FLUID_MEDICATIONS) for (const alias of MEDICATION_ALIASES[name]) {
    const rolls = meds(`Give ${alias}`);
    assert.equal(rolls.length, 1, alias);
    assert.equal(rolls[0].medication_name, name, alias);
    assert.equal(rolls[0].medication_kind, BLOOD_PRODUCT_MEDICATIONS.has(name) ? 'blood' : 'fluid', alias);
    assert.equal(rolls[0].no_roll, false, alias);
    assert.equal(rolls[0].dc, 4, alias);
    assert.ok(lookupDrug(alias), alias);
  }
  assert.equal(meds('Give D50')[0].medication_name, 'Dextrose');
  assert.equal(meds('Give D5W')[0].medication_name, 'Dextrose 5% in Water (D5W)');
});

test('generic fluid wording does not duplicate a named bag, while components stay distinct', () => {
  for (const text of ['Hang a bag of normal saline', 'Give a fluid bolus of LR', 'Transfuse blood products: PRBCs']) assert.equal(meds(text).length, 1, text);
  const rolls = meds('Transfuse PRBCs and FFP and cryo and platelets');
  assert.deepEqual(rolls.map(r => r.medication_name).sort(), ['Packed Red Blood Cells', 'Fresh Frozen Plasma', 'Cryoprecipitate', 'Platelets'].sort());
  assert.equal(meds('Give PRBCs and packed red blood cells').length, 1);
  assert.equal(meds('Do not give whole blood').length, 0);
  for (const text of ['Check platelet count', 'Check plasma glucose', 'Check albumin level', 'Check fibrinogen level']) assert.equal(meds(text).length, 0, text);
  assert.equal(detectAllAndRoll('Give LR IV')[0].medication_kind, 'fluid');
});

test('oxygen administration recognizes devices and spelling variants but excludes assessments', () => {
  for (const text of ['Give oxygen', 'Start O2 at 15 lpm via NRB', 'Apply a non-rebreather', 'Place nasal canula', 'Give oxgyen', 'Give oxigen', 'Apply O₂', 'Give supplemental oxygen']) {
    assert.equal(detectWithConfirmation(text).rolls.filter(r => r.procedure_id === 'oxygen').length, 1, text);
  }
  for (const text of ['Oxygen level', 'check oxygen', 'Check O2 saturation', 'Recheck oxygen sats', 'Is oxygen flowing?', 'What is his oxygen level?', 'Check the NRB mask', 'Do not give oxygen', 'Check oxygen supply']) {
    assert.equal(detectWithConfirmation(text).rolls.filter(r => r.procedure_id === 'oxygen').length, 0, text);
  }
  assert.equal(detectWithConfirmation('Check oxygen then give oxygen').rolls.filter(r => r.procedure_id === 'oxygen').length, 1);
});

test('oxygen has a single natural-one-only delivery check at every difficulty', () => {
  const original = Math.random;
  try {
    for (const difficulty of ['EASY','NORMAL','HARD','BLACK_CLOUD']) for (let die=1; die<=20; die++) {
      let calls=0;
      Math.random=()=>{ calls++; return (die-0.5)/20; };
      const roll=rollProcedure('oxygen', { moving:true }, difficulty);
      assert.equal(roll.roll, die); assert.equal(calls, 1);
      assert.equal(roll.outcome, die===1?'COMPLICATION':'SUCCESS', `${difficulty} ${die}`);
      assert.equal(roll.dc, 2);
    }
  } finally { Math.random=original; }
});

test('capillary refill stays absent until requested and preserves measurement per patient', () => {
  const unasked=applyCapillaryRefill({HR:80, CapRefill:3}, null, false, 1);
  assert.equal(unasked.CapRefill, undefined);
  for (const text of ['Get vitals', 'Check skin signs', 'Physical exam', 'Do not check capillary refill']) assert.ok(!detectWithConfirmation(text).rolls.some(r=>r.procedure_id==='capillary_refill'), text);
  for (const text of ['Check capillary refill', 'What is the cap refill?', 'Check CRT']) assert.ok(detectWithConfirmation(text).rolls.some(r=>r.procedure_id==='capillary_refill'), text);
  const measured=applyCapillaryRefill({CapRefill:{value:3,t:'T+0:00'}}, unasked, true, 2.5);
  assert.deepEqual(measured.CapRefill, {value:3,t:'T+2:30',tMin:2.5});
  const persisted=JSON.parse(JSON.stringify(measured));
  assert.deepEqual(applyCapillaryRefill({CapRefill:1},persisted,false,8).CapRefill, measured.CapRefill);
  assert.equal(applyCapillaryRefill(null,persisted,false,9),null);
  assert.equal(applyCapillaryRefill({HR:60,CapRefill:2},null,false,9).CapRefill,undefined,'another patient starts blank');
  assert.equal(applyCapillaryRefill({CapRefill:2},persisted,true,10).CapRefill.t,'T+10:00');
  for(const value of [null,undefined,'pending',NaN,Infinity,-1]) assert.equal(applyCapillaryRefill({CapRefill:value},null,true,1),null);
});

test('call review includes capillary refill and distinct blood-product names', () => {
  const timeline=decisionTimeline([{vitals:{CapRefill:{value:3,t:'T+2:30',tMin:2.5}},rolls:[...meds('Transfuse FFP'),{procedure_id:'capillary_refill',no_roll:true}]}]);
  assert.equal(timeline[0].vitals.CapRefill.value,3);
  assert.equal(timeline[0].procedures[0].matchedDrug,'Fresh Frozen Plasma');
  assert.equal(timeline[0].procedures[1].intervention,false);
});

test('fluid presentation dispatches the infusion scene and keeps blood color independent of outcome', async () => {
  const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
  const helper=source.slice(source.indexOf('async function animateMedicationAdministration('),source.indexOf('function animateRouteMedication('));
  const overlay={dataset:{}},header={textContent:''},calls=[];
  const context=vm.createContext({ document:{getElementById:id=>id==='infusion-overlay'?overlay:header},animateRouteMedication:async(...args)=>calls.push(args),showDrugPanel:()=>{} });
  vm.runInContext(helper,context);
  for(const kind of ['fluid','blood']) for(const outcome of ['SUCCESS','COMPLICATION']) {
    await context.animateMedicationAdministration({medication_kind:kind,medication_name:'Test component',outcome});
    assert.equal(overlay.dataset.fluid,kind); assert.equal(header.textContent,'Test component');
    assert.deepEqual(calls.pop(),['infusion',outcome,3200]);
  }
});

test('session gates unsolicited capillary refill and stores each patient’s last explicit reading', async () => {
  let response='';
  require.cache[require.resolve('../src/engine/api')]={exports:{sendTurn:async()=>response,sendDebrief:async()=>''}};
  require.cache[require.resolve('../src/server/adminLogger')]={exports:{logRun(){},updateRunDebrief(){}}};
  require.cache[require.resolve('../src/engine/logger')]={exports:{logEvent(){},closeScenario(){}}};
  const { Session }=require('../src/engine/session');
  const { rollScenario }=require('../src/engine/roller');
  const s=new Session(rollScenario({random_seed:'capillary-assessment-test'}));
  const reply=(patient,value,minute)=>`Observation recorded. [PATIENT_FOCUS: patient_${patient} | Patient ${patient}] [VITALS: GCS=15 CapRefill=${value}@T+0:00] [TIME: ${minute}:00]`;
  response=reply(1,3,1); await s.send('Get vitals'); assert.equal(s.lastVitals.CapRefill,undefined);
  response=reply(1,3,2); await s.send('Check capillary refill'); assert.equal(s.lastVitals.CapRefill.value,3);assert.equal(s.lastVitals.CapRefill.t,'T+2:00');
  response=reply(1,1,3); await s.send('Talk to the patient');assert.equal(s.lastVitals.CapRefill.value,3);assert.equal(s.lastVitals.CapRefill.t,'T+2:00');
  response='The patient answers your question. [TIME: 3:30]';await s.send('Ask their name');assert.equal(s.lastVitals.CapRefill.value,3);assert.equal(s.lastVitals.CapRefill.t,'T+2:00');
  response=reply(2,2,4); await s.send('Focus on the second patient');assert.equal(s.lastVitals.CapRefill,undefined);
  response=reply(2,2,5); await s.send('Check cap refill');assert.equal(s.lastVitals.CapRefill.value,2);
  response=reply(1,1,6); await s.send('Focus on the first patient');assert.equal(s.lastVitals.CapRefill.value,3);assert.equal(s.lastVitals.CapRefill.t,'T+2:00');
});
