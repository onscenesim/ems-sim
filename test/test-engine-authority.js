'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
let responses = [], requests = [];
require.cache[require.resolve('../src/engine/api')] = { exports: {
  sendTurn: async (_prompt, messages) => {
    requests.push(messages.at(-1).content);
    return responses.length > 1 ? responses.shift() : responses[0];
  }, sendDebrief: async () => '',
} };
require.cache[require.resolve('../src/engine/logger')] = { exports: { logEvent() {}, closeScenario() {} } };
require.cache[require.resolve('../src/server/adminLogger')] = { exports: { logRun() {}, updateRunDebrief() {} } };
const { Session } = require('../src/engine/session');
const { rollScenario } = require('../src/engine/roller');
const { detectAllProcedures, detectWithConfirmation } = require('../src/engine/dice');
const { ongoingCareFor } = require('../src/engine/ongoing-care');
const { departureOrdered } = require('../src/engine/command-intent');
const { applyCapnography } = require('../src/engine/capnography');
const { assembleSeedBlock } = require('../src/engine/assembler');

const scene = (text = 'The crew observes the patient.', patient = 1, minute = 1, tags = '') =>
  `${text}\n${tags}\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[PATIENT_FOCUS: patient_${patient} | Patient ${patient}]\n[VITALS: GCS=15 Pain=0]\n[TIME: ${minute}:00]`;
function session(patch = {}) {
  responses = [scene()]; requests = [];
  return new Session({ ...rollScenario({ random_seed: 'engine-authority', provider_level: 'ALS', category: 'medical' }),
    complication_type: 'none', catastrophe: null, routine_er_divert: false, backup_present_on_arrival: false, ...patch });
}
async function dice(face, work) {
  const original = Math.random;
  Math.random = () => face;
  try { return await work(); } finally { Math.random = original; }
}
const medicationRolls = result => result.rolls.filter(r => r.procedure_id === 'medication_push');

test('claims of an established gauge-sized line cannot become a placement or authorize fluid delivery', async () => {
  for (const order of [
    'I push a liter of normal saline through the established 18 gauge IV',
    'Give normal saline through the established 18g IV',
    'Give normal saline through the existing patent IV',
    'I have an IV. Give a liter of normal saline.',
    'Give normal saline', 'Transfuse PRBCs', 'Push epinephrine IV', 'Give epinephrine IV or IO',
  ]) {
    const s = session();
    assert.equal(detectAllProcedures(order).some(e => e.proc.id === 'peripheral_iv'), false, order);
    responses = [scene('No usable access is recorded. The vascular medication or fluid order is held.')];
    const random = Math.random;
    Math.random = () => { throw Error('A held treatment consumed a die'); };
    try {
      const result = await s.send(order);
      assert.equal(medicationRolls(result).length, 0, order);
      assert.ok(result.suppressed.some(item => item.vascular && item.held), order);
      assert.deepEqual(s.access, []);
      assert.match(requests[0], /No IV\/IO access is recorded/);
    } finally { Math.random = random; }
  }
});

test('vascular delivery requires the selected patient, route and recorded usable line', async () => {
  for (const access of [[], [{kind:'IV',status:'blown'}], [{kind:'IV',status:'removed'}],
    [{kind:'IO',status:'patent'}], [{kind:'IV',status:'patent',patient:'patient_2'}]]) {
    const s = session(); s.access = access;
    responses = [scene('Normal saline is held because no usable IV access exists for patient 1.')];
    const result = await s.send('Give normal saline IV to patient 1');
    assert.equal(medicationRolls(result).length, 0);
    assert.ok(result.suppressed.some(item => item.vascular));
  }
  for (const status of ['patent', 'marginal']) {
    const s = session(); s.access = [{kind:'IO',status,patient:'patient_2'}];
    responses = [scene('Normal saline runs through the recorded IO.', 2)];
    const result = await dice(.99, () => s.send('Give normal saline IO to patient 2'));
    assert.equal(medicationRolls(result).length, 1);
    assert.equal(medicationRolls(result)[0].patient, 'patient_2');
  }
});

test('nonvascular care still executes alongside a held vascular order', async () => {
  const s = session();
  responses = [scene('Normal saline is held: no IV access exists. Aspirin is given by mouth.')];
  const result = await dice(.99, () => s.send('Give normal saline IV. Give aspirin 324 mg PO.'));
  assert.deepEqual(medicationRolls(result).map(r => r.medication_name), ['Aspirin']);
  for (const order of ['Give glucagon', 'Give naloxone IN', 'Give epinephrine IM']) {
    responses = [scene('The ordered nonvascular treatment is given.')];
    assert.equal(medicationRolls(await dice(.99, () => s.send(order))).length, 1, order);
  }
});

test('placement must occur before delivery, and a different patient cannot lend access', async () => {
  for (const [order, face, expected] of [
    ['Start an IV. Give normal saline IV.', .99, 1],
    ['Start an IV. Give normal saline IV.', .01, 0],
    ['Give normal saline IV. Start an IV.', .99, 0],
    ['Start an IV in patient 2. Give normal saline IV to patient 1.', .99, 0],
  ]) {
    const s = session();
    responses = [scene(expected ? 'Normal saline runs through the new IV.' : 'Normal saline is held. The crew resolves the access attempt.')];
    const result = await dice(face, () => s.send(order));
    assert.equal(medicationRolls(result).length, expected, order);
    if (/patient 2/.test(order)) assert.equal(s.access[0].patient, 'patient_2');
  }
  const s = session();
  responses = [scene('The IV is declined. Normal saline is held.')];
  assert.equal(medicationRolls(await dice(.99, () => s.send('Start an IV. Give normal saline IV.'))).length, 0);
  assert.deepEqual(s.access, []);
});

test('line removal is patient-specific, persists, and prevents later delivery without new placement', async () => {
  const s = session(); s.access = [{kind:'IV',status:'patent',patient:'patient_1'}, {kind:'IV',status:'patent',patient:'patient_2'}];
  responses = [scene('The IV is removed from patient 1.')];
  await s.send('Remove the IV from patient 1.');
  assert.deepEqual(s.access.map(a => a.status), ['removed', 'patent']);
  responses = [scene('Normal saline is held for patient 1.')];
  assert.equal(medicationRolls(await s.send('Give normal saline IV to patient 1.')).length, 0);
  responses = [scene('Normal saline runs through patient 2’s recorded IV.', 2)];
  assert.equal(medicationRolls(await dice(.99, () => s.send('Give normal saline IV to patient 2.'))).length, 1);
  responses = [scene('The crew checks the patient.')];
  await s.send('Do not remove the IV from patient 2.');
  assert.equal(s.access[1].status, 'patent');
});

test('a fresh setup is required after removal, interruption, observed fault or an explicit replacement', async () => {
  for (const [initial, stop, restart, id] of [
    ['Intubate.', 'Remove the endotracheal tube.', 'Intubate.', 'intubation'],
    ['Intubate.', 'Remove the endotracheal tube.', 'Reintubate.', 'intubation'],
    ['Apply oxygen.', 'Stop oxygen.', 'Apply oxygen.', 'oxygen'],
    ['Apply LUCAS.', 'Stop the LUCAS.', 'Restart the LUCAS.', 'lucas'],
    ['Apply CPAP.', 'Remove the CPAP mask.', 'Apply CPAP.', 'cpap'],
    ['Apply BiPAP.', 'Disconnect BiPAP.', 'Apply BiPAP.', 'bipap'],
  ]) {
    const s = session();
    await dice(.99, () => s.send(initial));
    responses = [scene('The ordered device is removed or stopped.')];
    await s.send(stop);
    responses = [scene('The crew performs the new attempt.')];
    const result = await dice(.01, () => s.send(restart));
    assert.ok(result.rolls.some(r => r.procedure_id === id && !r.continued && r.roll === 1), restart);
  }
  const s = session(); await dice(.99, () => s.send('Apply LUCAS.'));
  responses = [scene('The LUCAS stops; no compressions are delivered.')]; await s.send('Observe the patient.');
  responses = [scene('The crew attempts to restart the device.')];
  assert.equal((await dice(.01, () => s.send('Restart LUCAS.'))).rolls[0].roll, 1);
  const restored = JSON.parse(JSON.stringify(s.turns));
  assert.equal(ongoingCareFor(restored, 'Continue LUCAS.', 'patient_1', [])(detectAllProcedures('Continue LUCAS.')[0]).continued, false);
});

test('questions, negation, conditional plans and quotations do not close or depart', async () => {
  for (const order of ['Do not terminate resuscitation. Continue CPR.', 'When should we transfer care?',
    'If we arrive, transfer care.', 'Discuss when to end the call.', 'The patient says "end the call".',
    'Do not end the call and do not drive to the hospital.']) {
    const s = session();
    const result = await dice(.99, () => s.send(order));
    assert.equal(result.closed, false, order);
    assert.equal(s.moving, false, order);
  }
  for (const order of ['Do not drive to the hospital.', 'Should we depart for the hospital?', 'If stable, drive to the hospital.', 'Discuss driving to the hospital.']) assert.equal(departureOrdered(order), false, order);
  for (const order of ['Drive to the hospital.', 'Load and go.', 'Head out.', 'Redirect to the major hospital.']) assert.equal(departureOrdered(order), true, order);
  for (const order of ['End call.', 'Transfer care to the ED nurse.', 'Terminate resuscitation.']) {
    const s = session(); assert.equal((await s.send(order)).closed, true, order);
  }
});

test('invented departure or vascular delivery is repaired once, or rejected without saved changes', async () => {
  for (const [order, bad, good] of [
    ['Ask about allergies.', scene('The rig pulls away.', 1, 1, '[EN_ROUTE:major]'), scene('The patient answers. The unit remains parked.')],
    ['Give saline through the established 18 gauge IV.', scene('Normal saline flows through the patent IV.'), scene('Normal saline is held; no usable IV is recorded.')],
  ]) {
    let s = session(); responses = [bad, good];
    const result = await s.send(order);
    assert.equal(requests.length, 2);
    assert.equal(s.moving, false); assert.equal(s.hasLoaded, false); assert.deepEqual(s.access, []);
    assert.equal(medicationRolls(result).length, 0);
    s = session(); responses = [bad];
    const before = JSON.stringify(s);
    await assert.rejects(s.send(order), {code:'invalid_scene_reply'});
    assert.equal(JSON.stringify(s), before);
    assert.equal(requests.length, 2);
  }
});

test('backup initialization and arrival work without model tags and cannot be cancelled by a stray tag', async () => {
  const s = session({category:'arrest'});
  responses = [scene('Dispatch acknowledges.', 1, 0)];
  await s.send('Begin the scenario.');
  assert.equal(s.backupStatus.status, 'en_route'); assert.equal(s.backupArrivalMinute, 8);
  responses = [scene('Observation continues.', 1, 9, '[BACKUP: cancelled]')];
  await s.send('Observe for nine minutes.');
  assert.equal(s.backupStatus.status, 'on_scene'); assert.equal(s.crewStatus.captain, 'on_scene');
  responses = [scene('The captain clears.')]; await s.send('Release the captain as backup.');
  assert.equal(s.backupStatus.status, 'cancelled');
  assert.equal(s.crewStatus.captain, 'not_on_scene');
});

test('BiPAP and ventilator setup have separate outcomes and mechanical capnography state', async () => {
  for (const [order, id] of [['Apply CPAP','cpap'], ['Apply BiPAP','bipap'], ['Connect the transport ventilator','ventilator']]) {
    const s = session();
    const result = await dice(.99, () => s.send(order));
    assert.deepEqual(result.rolls.map(r => r.procedure_id), [id]);
    assert.equal(result.rolls[0].continued, undefined);
  }
  const s = session(); await dice(.99, () => s.send('Apply CPAP.'));
  assert.equal((await dice(.99, () => s.send('Apply BiPAP.'))).rolls[0].continued, undefined);
  const old = applyCapnography({ETCO2:38,RR:12,CapnoSource:'airway',CapnoVentilation:'manual'}, null, 'test');
  const next = applyCapnography({ETCO2:38,RR:14}, old, 'test', {rolls:[{procedure_id:'ventilator',outcome:'SUCCESS'}]});
  assert.equal(next.Capnography.ventilation, 'mechanical');
});

test('prompt retains core contracts while removing conflicting backup and detector folklore', () => {
  const prompt = assembleSeedBlock(session().seed);
  assert.match(prompt, /Only SUCCESS or MARGINAL placement rolls create usable IV\/IO access/);
  assert.doesNotMatch(prompt, /server rolls dice on bare infinitives|LINE STATUS IS ENGINE-CONTROLLED|your captain is.*starts every call NOT on scene/i);
  assert.equal(prompt.split('DESTINATION DIALOGUE:').length - 1, 1);
});

test('explicit IV infusions and IVP cannot silently borrow IO access', async () => {
  for (const order of ['Give normal saline IV infusion.', 'Give fentanyl IVP.', 'Give ketamine IV infusion.']) {
    const s=session();s.access=[{kind:'IO',status:'patent'}];
    responses=[scene('The requested IV medication or infusion is held.')];
    const result=await s.send(order);
    assert.equal(medicationRolls(result).length,0,order);
    assert.ok(result.suppressed.some(x=>x.vascular),order);
  }
});

test('two patients receive independent placement confirmation and access records', async () => {
  const order='Start an IV in patient 1. Start an IV in patient 2.';
  const entries=detectAllProcedures(order);
  assert.equal(new Set(entries.map(x=>x.key)).size,2);
  const s=session();
  const result=await dice(.99,()=>s.send(order,false,null,{deny:[entries[1].key]}));
  assert.deepEqual(result.rolls.map(x=>x.patient),['patient_1']);
  assert.deepEqual(s.access.map(x=>x.patient),['patient_1']);
});

test('a stray destination tag while driving cannot silently redirect transport', async () => {
  const s=session();responses=[scene('The ambulance departs.',1,1,'[EN_ROUTE:nearest]')];
  await s.send('Drive to the nearest hospital.');
  responses=[scene('Transport continues.',1,2,'[EN_ROUTE:major]'),scene('Observation continues on the existing route.',1,2)];
  await s.send('Check the patient.');
  assert.equal(requests.length,3);
  assert.equal(s.transportDest,'nearest');
});


test('an unspecified drug infusion still needs recorded vascular access', async () => {
  const s=session();responses=[scene('Ketamine infusion is held: no usable vascular access is recorded.')];
  const result=await s.send('Start a ketamine infusion.');
  assert.equal(medicationRolls(result).length,0);
  assert.ok(result.suppressed.some(x=>x.vascular));
});
