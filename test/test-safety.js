'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { INTERVENTIONS } = require('../src/data/interventions');
const { normalizeForDetection, detectAllProcedures, detectWithConfirmation, rollProcedure } = require('../src/engine/dice');
const { lookupDrug } = require('../public/drug-cards');
const { MEDICATION_ALIASES } = require('../public/medication-aliases');
const { OperationQueue } = require('../src/engine/operations');
const { requestModel } = require('../src/engine/modelRequest');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };

test('every exact procedure ID and alias retains its registered intervention', () => {
  let count = 0;
  for (const proc of INTERVENTIONS) for (const alias of [proc.id, ...proc.synonyms]) {
    assert.equal(normalizeForDetection(alias), alias, `rewrote ${alias}`);
    const matches = detectAllProcedures(alias);
    assert.ok(matches.some(m => m.proc.id === proc.id), `${alias} missed ${proc.id}`);
    assert.deepEqual([...new Set(matches.map(m => m.proc.id))], [proc.id], `${alias} produced extra interventions`);
    count++;
  }
  assert.ok(count > 1700);
});

test('known dangerous misroutes and rhythm analysis are corrected', () => {
  for (const [phrase, id] of [['wound packing','bleeding_control'], ['perimortem c-section','perimortem_csection'], ['nasal packing','epistaxis_control'], ['AED analyze','rhythm_check'], ['check glucose','glucometry']]) {
    assert.deepEqual(detectAllProcedures(phrase).map(e=>e.proc.id), [id]);
  }
  assert.equal(detectWithConfirmation('AED analyze').rolls[0].no_roll, true);
});

test('defibrillation complications worsen physiology without fabricating a safety lapse', () => {
  const originalRandom = Math.random;
  Math.random = () => 0; // natural 1
  try {
    for (const difficulty of ['EASY', 'NORMAL', 'HARD', 'BLACK_CLOUD']) {
      const shock = rollProcedure('defibrillation', {}, difficulty);
      assert.equal(shock.roll, 1, difficulty);
      assert.equal(shock.outcome, 'COMPLICATION', difficulty);
    }
  } finally {
    Math.random = originalRandom;
  }
});

test('natural direct-pressure orders trigger bleeding control', () => {
  for (const phrase of [
    'put pressure on the wound',
    'apply pressure to the wound',
    'hold direct pressure',
    'maintain pressure on the wound',
    'compress the wound',
  ]) {
    assert.deepEqual(detectAllProcedures(phrase).map(e => e.proc.id), ['bleeding_control'], phrase);
  }
});

test('retry is treated as a procedure action verb', () => {
  for (const phrase of ['retry intubation', 'retry tourniquet', 'retry bleeding control']) {
    assert.ok(detectAllProcedures(phrase).some(e => e.proc.id === phrase.replace('retry ', '').replace(' ', '_')), phrase);
  }
});

test('pace and rate-qualified pacing orders are detected', () => {
  assert.deepEqual(detectAllProcedures('Pace at 80').map(e => e.proc.id), ['pacing']);
  assert.deepEqual(detectAllProcedures('pace').map(e => e.proc.id), ['pacing']);
});

test('bleeding control and junctional packing variants use one intervention', () => {
  for (const phrase of [
    'bleeding control', 'hemorrhage control', 'junctional tourniquet', 'XStat',
    'wound packing groin', 'pelvic wound packing', 'axillary packing',
    'neck packing', 'zone one hemorrhage', 'zone three hemorrhage'
  ]) {
    assert.deepEqual(detectAllProcedures(phrase).map(e => e.proc.id), ['bleeding_control'], phrase);
  }
  assert.equal(INTERVENTIONS.some(p => p.id === 'wound_packing_junctional'), false);
});

test('common field abbreviations and intervention misspellings still trigger the intended procedure', () => {
  for (const [phrase, id] of [
    ['TQ', 'tourniquet'], ['apply a TQ', 'tourniquet'], ['TQ time', 'tourniquet_time'], ['tourniquet time', 'tourniquet_time'],
    ['tourniquet to the left leg', 'tourniquet'],
    ['tourniqet to the left leg', 'tourniquet'], ['tournquet', 'tourniquet'],
    ['CPR', 'cpr'], ['EZIO', 'io_access'], ['ET tube', 'intubation'],
    ['12L', 'twelve_lead'], ['FSBG', 'glucometry'], ['med control', 'radio_contact'],
  ]) {
    assert.deepEqual(detectAllProcedures(phrase).map(e => e.proc.id), [id], phrase);
  }
  assert.equal(rollProcedure('tourniquet').dc, 5);
  assert.equal(rollProcedure('bleeding_control').dc, 12);
});

test('same-turn suction lowers intubation DC and mainstem obstruction gets its own roll', () => {
  const dryIntubation = detectWithConfirmation('intubate').rolls.find(r => r.procedure_id === 'intubation');
  const suctionedIntubation = detectWithConfirmation('suction and intubate').rolls.find(r => r.procedure_id === 'intubation');
  const suction = detectWithConfirmation('suction and intubate').rolls.find(r => r.procedure_id === 'suction');
  assert.equal(dryIntubation.dc, 10);
  assert.equal(suctionedIntubation.dc, 8);
  assert.equal(suction.procedure_id, 'suction');

  for (const phrase of ['right mainstem', 'left main stem', 'tube too deep']) {
    assert.deepEqual(detectWithConfirmation(phrase).rolls.map(r => r.procedure_id), ['foreign_body_removal'], phrase);
  }
  assert.equal(rollProcedure('intubation', { suction_assisted: true }).dc, 8);
});

test('ongoing and pronoun suction orders trigger suctioning', () => {
  for (const phrase of [
    'Continue suctioning.', 'continue suction', 'keep suctioning the airway',
    'suction them', 'suction her mouth', 'suction him',
  ]) {
    assert.deepEqual(detectWithConfirmation(phrase).rolls.map(r => r.procedure_id), ['suction'], phrase);
  }
});

test('singular and plural needle decompression orders trigger one NCD roll', () => {
  for (const phrase of [
    'Perform needle decompression', 'Perform needle decompressions',
    'Perform bilateral needle decompression', 'Perform bilateral needle decompressions',
  ]) {
    assert.deepEqual(detectWithConfirmation(phrase).rolls.map(r => r.procedure_id), ['needle_decompression'], phrase);
  }
});

test('typos still work and context survives consumption of longer matches', () => {
  assert.equal(normalizeForDetection('give epinephrin'), 'give epinephrine');
  for (const phrase of ['No wound packing.', 'If needed, give epi.', 'We gave epinephrine.', 'Stop CPR.']) {
    assert.equal(detectAllProcedures(phrase).length, 0, phrase);
  }
  const entries = detectAllProcedures('Give epinephrine. No pacing. Place an IV.');
  assert.deepEqual(new Set(entries.map(e=>e.proc.id)), new Set(['medication_push','peripheral_iv']));
  assert.deepEqual(detectAllProcedures('give epi through the IO').map(e=>e.proc.id), ['medication_push']);
  assert.deepEqual(detectAllProcedures('No IV yet. Try IV.').map(e=>e.proc.id), ['peripheral_iv']);
});

test('all medication aliases open the intended reference, with formulations separate', () => {
  for (const [name, aliases] of Object.entries(MEDICATION_ALIASES)) {
    for (const alias of aliases) assert.equal(lookupDrug(` ${alias.toUpperCase()} `)?.name, name, alias);
  }
  assert.equal(lookupDrug('epi').name, 'Epinephrine');
  assert.equal(lookupDrug('calcium gluconate').name, 'Calcium Gluconate');
  assert.equal(lookupDrug('calcium chloride').name, 'Calcium Chloride');
  assert.equal(lookupDrug('nitro paste').name, 'Nitroglycerin Paste');
  assert.ok(lookupDrug('propofol').referenceNote);
  assert.equal(lookupDrug('not a medicine'), null);
});

test('brand and generic names for one drug do not create two administrations', () => {
  const entries = detectAllProcedures('give epi epinephrine and amio amiodarone');
  assert.equal(entries.filter(e => e.proc.id === 'medication_push').length, 2);
});

test('queue serializes turns, replays duplicates, and rejects changed payloads', async () => {
  const q = new OperationQueue(), gate = deferred(), order = [];
  const work = async () => { order.push('start1'); await gate.promise; order.push('end1'); return { reply:'one' }; };
  const a = q.run('one','a',work), duplicate=q.run('one','a',()=>assert.fail('duplicate ran'));
  const b = q.run('two','b', async () => { order.push('start2'); return { reply:'two' }; });
  await tick(); assert.deepEqual(order, ['start1']);
  gate.resolve(); assert.deepEqual(await a, await duplicate); await b;
  assert.deepEqual(order, ['start1','end1','start2']);
  await assert.rejects(q.run('one','changed', work), {code:'operation_conflict'});
  const restored = new OperationQueue(q.snapshot());
  assert.deepEqual(await restored.run('one','a',()=>assert.fail('replayed after restart')), {reply:'one'});
});

test('cancellation handles queued, active, before-arrival, and committed operations', async () => {
  const q = new OperationQueue();
  await q.cancel('early');
  const restored = new OperationQueue(q.snapshot());
  await assert.rejects(restored.run('early','x',()=>assert.fail('restored cancelled request ran')), {code:'operation_cancelled'});
  await assert.rejects(q.run('early','x',()=>assert.fail('cancelled request ran')), {code:'operation_cancelled'});
  const a = q.run('active','a',signal => requestModel(()=>new Promise(()=>{}), {}, {signal, timeoutMs:1000}));
  const b = q.run('queued','b',()=>assert.fail('queued request ran'));
  const rejectA=assert.rejects(a,{code:'operation_cancelled'}), rejectB=assert.rejects(b,{code:'operation_cancelled'});
  await tick(); const cancelB=q.cancel('queued');
  assert.equal((await q.cancel('active')).status,'cancelled');
  await cancelB; await rejectA; await rejectB;
  await q.run('committed','c',async()=>({reply:'done'}));
  assert.deepEqual((await q.cancel('committed')).result,{reply:'done'});
});

test('model deadline aborts SDK transport, bounds retries, and releases ignored aborts', async () => {
  let sdkSignal, calls=0;
  await assert.rejects(requestModel(params=>{sdkSignal=params.config.abortSignal; return new Promise(()=>{});}, {}, {timeoutMs:15}),{code:'model_timeout'});
  assert.equal(sdkSignal.aborted,true);
  await assert.rejects(requestModel(()=>{calls++; throw Error('429');}, {}, {timeoutMs:15}),{code:'model_timeout'});
  assert.equal(calls,1); // deadline includes retry backoff
  const controller = new AbortController(); controller.abort(Error('already cancelled'));
  await assert.rejects(requestModel(()=>assert.fail('called despite cancellation'),{}, {signal:controller.signal}), /already cancelled/);
});

// Exercise actual Session and route handlers without a paid model call, a live
// listener, real user histories, or session files. Only the provider boundary
// and storage are faked; detection, state transitions, and queues remain real.
let generate = async () => ({text:'Dispatch ready. [TIME: 0:00]'});
require.cache[require.resolve('../src/engine/api')] = { exports: {
  sendTurn: async (_system,messages,options) => (await requestModel(params=>generate(messages,params.config.abortSignal),{}, {...options,timeoutMs:40})).text,
  sendDebrief: async (_context,_level,options) => (await requestModel(params=>generate([],params.config.abortSignal),{}, {...options,timeoutMs:40})).text,
} };
require.cache[require.resolve('../src/server/adminLogger')] = { exports: { logRun(){}, updateRunDebrief(){} } };
const { Session, buildContextFlags, buildTurnContextFlags } = require('../src/engine/session');
const { rollScenario, isMultiPatientSeed } = require('../src/engine/roller');
const sessions = new Map(), snapshots = new Map();
let seq=0;
require.cache[require.resolve('../src/server/sessionStore')] = { exports: {
  getSession:id=>sessions.get(id),
  createSession:opts=>{const seed=rollScenario(opts),id=`session-${++seq}`;sessions.set(id,new Session(seed,id));return {id,seed};},
  restoreSession:snapshot=>{
    const session=new Session(snapshot.seed,snapshot.id);
    Object.assign(session,snapshot);
    session.sessionId=snapshot.id;
    sessions.set(snapshot.id,session);
    return session;
  },
  deleteSession:id=>sessions.delete(id),
} };
require.cache[require.resolve('../src/server/persistence')] = { exports: {
  save:snapshot=>snapshots.set(snapshot.id,structuredClone(snapshot)),
  load:id=>snapshots.get(id),
  update:(id,patch)=>snapshots.set(id,{...snapshots.get(id),...structuredClone(patch)}),
  markDebriefed:id=>Object.assign(snapshots.get(id),{debriefed:true}),
} };
const router=require('../src/server/routes/scenario');
async function route(path,body={},params={},headers={}) {
  const layer=router.stack.find(l=>l.route?.path===path);
  let status=200,payload;
  const res={status(n){status=n;return this;},json(data){payload=data;return this;},setHeader(){}};
  const requestHeaders = { ...headers };
  if (params.id && requestHeaders.cookie === undefined) {
    const ownerId = sessions.get(params.id)?.ownerId || 'test-browser-owner';
    requestHeaders.cookie = `ems_sid=${params.id}; ems_owner=${ownerId}`;
  }
  await layer.route.stack[0].handle({body,params,headers:requestHeaders,ip:'127.0.0.1',socket:{}},res);
  return {status,body:payload};
}
function sessionFixture() {
  const id=`fixture-${++seq}`, s=new Session(rollScenario(),id);
  s.ownerId='test-browser-owner';
  sessions.set(id,s); snapshots.set(id,{id,seed:s.seed,ownerId:s.ownerId});return s;
}

test('clinical state and order wording activate context-sensitive procedure DCs', () => {
  const seed={
    patient_age:45, age_group:'middle_aged', presentation:'Breech preterm delivery with airway angioedema',
    hint:null, special_flags:null, comorbidity_bundle:'metabolic obesity',
  };
  const base=buildContextFlags(seed);
  assert.equal(base.difficult_airway,true);
  assert.equal(base.complicated_delivery,true);
  assert.equal(base.preterm_newborn,true);
  const turn=buildTurnContextFlags(seed,base,{BP:{value:'78/44'}},
    'Use two-hand BVM, pack the groin wound, then PPV for the newborn with cold water immersion',true);
  assert.equal(turn.hypotensive,true);
  assert.equal(turn.junctional,true);
  assert.equal(turn.resuscitative_steps,true);
  assert.equal(turn.two_hand_bvm,true);
  assert.equal(turn.cold_water_immersion,true);
  assert.equal(turn.moving,true);

  assert.equal(rollProcedure('peripheral_iv',turn).dc,16,'hard IV plus moving penalty');
  assert.equal(rollProcedure('intubation',{...turn,moving:false}).dc,14);
  assert.equal(rollProcedure('supraglottic_airway',{...turn,moving:false}).dc,8);
  assert.equal(rollProcedure('bvm',{...turn,moving:false}).dc,5);
  assert.equal(rollProcedure('bleeding_control',{...turn,moving:false}).dc,14);
  assert.equal(rollProcedure('emergency_delivery',{...turn,moving:false}).dc,14);
  assert.equal(rollProcedure('newborn_resuscitation',{...turn,moving:false}).dc,15);
  assert.equal(rollProcedure('active_cooling',{...turn,moving:false}).dc,4);

  const recovered=buildTurnContextFlags(seed,base,{BP:{value:'118/72'}},'Start an IV',false);
  assert.equal(recovered.hypotensive,false);
});

test('failed/timeout turns preserve messages, seed events, access, arrival, and backup state', async () => {
  const session=sessionFixture(), before=structuredClone(session);
  generate=async()=>{throw Error('offline');};
  await assert.rejects(session.send('call for backup',false,'to_hospital'),/offline/);
  assert.deepEqual({...session},before);
  generate=()=>new Promise(()=>{});
  await assert.rejects(session.send('give epi'),{code:'model_timeout'});
  assert.deepEqual({...session},before);
});

test('real turn route confirms procedures without state changes and requires operation IDs', async () => {
  const session=sessionFixture();
  assert.equal((await route('/:id/turn',{message:'epi'},{id:session.sessionId})).status,400);
  const before=structuredClone(session);
  const response=await route('/:id/turn',{message:'wound packing',operation_id:'preview-operation-001'},{id:session.sessionId});
  assert.equal(response.body.needs_confirmation[0].procedure_id,'bleeding_control');
  assert.deepEqual({...session},before);
});

test('real routes cancel a turn without mutation, then accept a safe retry once', async () => {
  const session=sessionFixture(),before=structuredClone(session);
  const late = deferred();
  generate=()=>late.promise;
  const body={message:'check vitals',operation_id:'cancel-operation-001',procs_resolved:true};
  const active=route('/:id/turn',body,{id:session.sessionId}); await tick();
  const cancel=await route('/:id/operations/:operationId/cancel',{}, {id:session.sessionId,operationId:body.operation_id});
  assert.equal(cancel.body.status,'cancelled');
  assert.equal((await active).body.error,'operation_cancelled');
  assert.deepEqual({...session},before);
  let calls=0;generate=async()=>{calls++;return {text:'Vitals checked. [TIME: 1:00]'};};
  body.operation_id='retry-operation-0001';
  const first=await route('/:id/turn',body,{id:session.sessionId});
  const again=await route('/:id/turn',body,{id:session.sessionId});
  assert.equal(first.status,200); assert.deepEqual(first,again); assert.equal(calls,1);
  late.resolve({text:'Stale response. [TIME: 99:00]'}); await tick();
  assert.equal(session.sceneMinute,1);
  assert.equal(session.turns.length,1);assert.equal(session.messages.length,2);
  assert.equal(snapshots.get(session.sessionId).operationResults.length,2);
  const committedCancel=await route('/:id/operations/:operationId/cancel',{}, {id:session.sessionId,operationId:body.operation_id});
  assert.deepEqual(committedCancel.body.result,first.body);
});

test('new scenarios have no daily quota and malformed cookies do not throw', async () => {
  generate=async()=>({text:'Dispatch ready. [TIME: 0:00]'});
  for(let i=0;i<51;i++)assert.equal((await route('/new')).status,200);
  assert.equal((await route('/status')).body.scenarios_remaining,null);
  assert.deepEqual((await route('/resume',{}, {},{cookie:'ems_sid=%invalid'})).body,{session:null});
});

test('debriefs share the session queue and repeated requests reuse the completed result', async () => {
  const session=sessionFixture();session.closed=true;
  let calls=0;generate=async()=>{calls++;return {text:'Debrief complete.'};};
  const first=await route('/:id/debrief',{operation_id:'debrief-operation-001'},{id:session.sessionId});
  const second=await route('/:id/debrief',{operation_id:'debrief-operation-002'},{id:session.sessionId});
  assert.equal(first.body.debrief,'Debrief complete.');assert.equal(second.body.debrief,first.body.debrief);assert.equal(calls,1);
});

test('invalid scenario config is rejected before a model call', async () => {
  generate = () => assert.fail('invalid config called the model');
  assert.equal((await route('/new', {difficulty:'INVALID'})).status,400);
  assert.equal((await route('/new', {category:'doa'})).status,400);
  assert.equal((await route('/new', {category:'curveballs'})).status,400);
  assert.equal((await route('/new', {partner_name:'Captain Dennis Holt'})).status,400);
  assert.equal((await route('/new', {captain_name:'Marcus Webb'})).status,400);
  assert.equal((await route('/new', {provider_level:'BLS',partner_name:'Marcus Webb'})).status,400);
});

test('session mutation and transcript routes require the matching browser cookie', async () => {
  const session=sessionFixture();
  const denied=await route('/:id/turn',{
    message:'check vitals',operation_id:'forbidden-operation-001',procs_resolved:true,
  },{id:session.sessionId},{cookie:`ems_sid=${session.sessionId}; ems_owner=someone-else-000`});
  assert.equal(denied.status,403);assert.equal(denied.body.error,'session_forbidden');
  const transcript=await route('/:id/transcript',{}, {id:session.sessionId},{cookie:`ems_sid=${session.sessionId}; ems_owner=someone-else-000`});
  assert.equal(transcript.status,403);
  assert.equal(session.turns.length,0);
});

test('one browser owner can keep multiple scenario tabs active', async () => {
  const first=sessionFixture();
  const second=sessionFixture();
  const response=await route('/:id/transcript',{}, {id:first.sessionId},{
    cookie:`ems_sid=${second.sessionId}; ems_owner=${first.ownerId}`,
  });
  assert.equal(response.status,200);
  assert.equal(response.body.seed.scenario_id,first.seed.scenario_id);
});

test('owned sessions restore on demand after an in-memory restart', async () => {
  const session=sessionFixture();
  sessions.delete(session.sessionId);
  const response=await route('/:id/transcript',{}, {id:session.sessionId},{
    cookie:`ems_sid=${session.sessionId}; ems_owner=${session.ownerId}`,
  });
  assert.equal(response.status,200);
  assert.equal(response.body.seed.scenario_id,session.seed.scenario_id);
  assert.ok(sessions.has(session.sessionId));
});

test('new scenario returns and persists initial demographic machine state', async () => {
  generate=async()=>({text:'Crew has the patient. [DEMO: on-scene crew] [SECOND_PATIENT] [TIME: 0:00]'});
  const response=await route('/new');
  assert.equal(response.status,200);
  assert.equal(response.body.demo_source,'on-scene crew');
  assert.equal(response.body.second_patient,true);
  const saved=snapshots.get(response.body.session_id);
  assert.equal(saved.demo_source,'on-scene crew');
  assert.equal(saved.second_patient,true);
});

test('patient focus and separate vital snapshots flow through new, turn, persistence and resume', async () => {
  generate = async () => ({ text: 'Mother assessed. [PATIENT_DEMO: {"id":"patient_1","label":"Mother","name":"Jane Smith","age":30,"source":"patient stated"}] [PATIENT_FOCUS: patient_1 | Mother] [VITALS: HR=84 GCS=15] [TIME: 1:00]' });
  const created = await route('/new');
  const id = created.body.session_id;
  assert.deepEqual(created.body.patient_focus, { id: 'patient_1', label: 'Mother' });
  assert.equal(snapshots.get(id).patientVitals.patient_1.HR, 84);
  generate = async () => ({ text: 'Newborn assessed. [PATIENT_DEMO: {"id":"patient_2","label":"Newborn","age":0,"age_display":"10 minutes old","source":"crew"}] [PATIENT_FOCUS: patient_2 | Newborn] [VITALS: HR=140 RR=40] [TIME: 2:00]' });
  const changed = await route('/:id/turn', {
    message: 'Focus on the newborn', operation_id: 'multi-focus-operation-001', procs_resolved: true,
  }, { id });
  assert.equal(changed.status, 200);
  assert.deepEqual(changed.body.patient_focus, { id: 'patient_2', label: 'Newborn' });
  assert.equal(changed.body.vitals.HR, 140);
  const saved = snapshots.get(id);
  assert.equal(saved.patientVitals.patient_1.HR, 84);
  assert.equal(saved.patientVitals.patient_2.HR, 140);
  assert.equal(created.body.patients[0].name, 'Jane Smith');
  assert.deepEqual(saved.patientRecords, changed.body.patients);
  assert.equal(saved.patientRecords[1].age, 0);
  const resumed = await route('/resume', {}, {}, { cookie: `ems_sid=${id}; ems_owner=${saved.ownerId}` });
  assert.deepEqual(resumed.body.session.patient_focus, changed.body.patient_focus);
  assert.equal(resumed.body.session.lastVitals.HR, 140);
  assert.deepEqual(resumed.body.session.patients, saved.patientRecords);
});

test('multi-patient detection covers ordinary two-patient and MCI seeds', () => {
  assert.equal(isMultiPatientSeed({special_flags:'two_patients — mother and newborn'}),true);
  assert.equal(isMultiPatientSeed({special_flags:'mci. multiple_patients. incident_command'}),true);
  assert.equal(isMultiPatientSeed({special_flags:'two_large_bore_IVs'}),false);
});

test('standalone arrest checks advance to the scheduled CPR checkpoint', async () => {
  const seed = rollScenario({category:'arrest'});
  assert.match(new Session(seed).systemPrompt,
    /standalone request for a pulse check, rhythm check, or combined pulse\/rhythm check[\s\S]+fast-forward the scene clock/);

  let modelMessage = '';
  generate = async messages => {
    modelMessage = messages.at(-1).content;
    return {text:'The scheduled check is performed. [TIME: 2:00]'};
  };

  const checkOnly = new Session(seed);
  await checkOnly.send('Pulse check and rhythm check');
  assert.match(modelMessage, /SCHEDULED ARREST CHECK/);
  assert.match(modelMessage, /perform NO additional intervention/);
  assert.equal(checkOnly.sceneMinute, 2);

  const checkAndTreat = new Session(seed);
  await checkAndTreat.send('Check the rhythm and give epinephrine');
  assert.doesNotMatch(modelMessage, /SCHEDULED ARREST CHECK/,
    'multi-intervention orders must retain the normal one-action-window flow');
});


test('obstruction removal techniques share one roll, including combined attempts', () => {
  for (const phrase of ['back blows', 'chest thrusts', 'abdominal thrusts', 'Magill forceps', 'Macgill forceps', 'remove obstruction', 'push foreign body down the right mainstem', 'back blows and abdominal thrusts and Magill forceps']) {
    assert.deepEqual(detectWithConfirmation(phrase).rolls.map(r => r.procedure_id), ['foreign_body_removal'], phrase);
  }
});
