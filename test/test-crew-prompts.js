'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CREW } = require('../src/data/crew');
const { rollScenario } = require('../src/engine/roller');
const { assembleSeedBlock, buildDebriefContext } = require('../src/engine/assembler');
const { CREW_BEHAVIOR_CONTRACT } = require('../src/engine/prompts/crew');
const { buildDebriefPrompt } = require('../src/engine/prompts/debrief');

// Capture the actual outgoing API configurations without a network request.
let request;
let response = 'Test response.';
let responseQueue = [];
let requests = [];
const sdkPath = require.resolve('@google/genai');
const sdk = require(sdkPath);
require.cache[sdkPath].exports = { ...sdk, GoogleGenAI: class {
  constructor() {
    this.models = { generateContent: async params => {
      request = params;
      requests.push(params);
      return { text: responseQueue.length ? responseQueue.shift() : response };
    } };
  }
} };
const { sendTurn, sendDebrief } = require('../src/engine/api');

test('debrief repairs unsupported hospital guarantees before returning feedback', async () => {
  const original = 'Recorded handoff only; no hospital treatment is documented.';
  const corrected = 'Timely transfer supported evaluation; definitive treatment remained unrecorded.\n[PATIENT_OUTCOME: Likely discharged on October 12, 2026]';
  requests = [];
  responseQueue = ['Routing to this hospital ensures definitive hemorrhage control.', corrected];
  try {
    assert.equal(await sendDebrief(original, 'BLS', { timeoutMs: 2000 }), corrected);
    assert.equal(requests.length, 2);
    const repair = requests[1];
    assert.equal(repair.contents[0].parts[0].text, original);
    assert.match(repair.contents.at(-1).parts[0].text, /Rewrite the complete five-section debrief/);
    assert.equal(repair.contents[1].role, 'model');
    assert.ok(repair.config.httpOptions.timeout > 0 && repair.config.httpOptions.timeout <= 2000);
  } finally { responseQueue = []; }
});

test('a debrief still making guarantees after repair fails instead of returning saved feedback', async () => {
  requests = [];
  responseQueue = ['Transport ensured survival.', 'The handoff guaranteed recovery.'];
  try {
    await assert.rejects(sendDebrief('No outcome recorded.', 'ALS'), error => error.code === 'invalid_debrief_evidence');
    assert.equal(requests.length, 2, 'one repair attempt only');
  } finally { responseQueue = []; }
});

test('each catalog character retains its behavior under one gameplay contract in every difficulty', () => {
  for (const member of CREW) for (const difficulty of ['EASY', 'NORMAL', 'HARD', 'BLACK_CLOUD']) {
    const seed = rollScenario({ random_seed: 'crew-prompt-audit', difficulty,
      provider_level: member.role.endsWith('_BLS') ? 'BLS' : 'ALS',
      [member.role.startsWith('captain') ? 'captain_name' : 'partner_name']: member.name });
    const prompt = assembleSeedBlock(seed);
    assert.equal(prompt.split(CREW_BEHAVIOR_CONTRACT).length - 1, 1);
    assert.ok(prompt.includes(member.trigger_behaviors), member.name);
    assert.doesNotMatch(prompt, /ZERO GUIDANCE POLICY|PARTNER COMPETENCE: Partner executes perfectly|Your partner does exactly what they are told and nothing more/);
    assert.match(prompt, /Server rolls and runtime state control procedural outcomes/);
  }
});

test('outgoing gameplay wrapper permits the crew exception rather than reinstating its blanket ban', async () => {
  const seed = rollScenario({ random_seed: 'crew-wrapper', difficulty: 'HARD', partner_name: 'Destiny Okafor' });
  await sendTurn(assembleSeedBlock(seed), [{ role: 'user', content: 'I approach the patient.' }]);
  const instruction = request.config.systemInstruction;
  assert.ok(instruction.includes(CREW_BEHAVIOR_CONTRACT));
  assert.match(instruction, /named crew follow the CREW BEHAVIOR CONTRACT/);
  assert.doesNotMatch(instruction, /Never provide suggestions or information I did not ask for/);
});

test('catalog personalities no longer demand unrolled procedures or unconditional outcomes', () => {
  for (const member of CREW) {
    assert.doesNotMatch(member.trigger_behaviors,
      /MUST fail or perform them poorly|MUST perform them incorrectly|performs ordered tasks perfectly|executing perfectly|confidently incorrect data|physically intervene and take over the intervention|MUST attempt one intervention that is slightly outside/,
      member.name);
  }
  const okafor = CREW.find(m => m.name === 'Destiny Okafor').trigger_behaviors;
  assert.match(okafor, /proactively start routine baseline monitoring/);
  assert.match(okafor, /waits for the provider order and injected roll/);
  assert.match(CREW.find(m => m.name === 'Tyler Beaumont').trigger_behaviors, /MUST push back/);
  assert.match(CREW.find(m => m.name === 'Priya Nair').trigger_behaviors, /MUST report measured values accurately/);
});

test('custom crew retain their description while the shared contract outranks claims of guaranteed success', () => {
  const seed = rollScenario({ random_seed: 'crew-custom' });
  seed.custom_partner = { name: 'Alex', custom: true, role: 'partner',
    personality_notes: 'Offers careful questions; claims every IV succeeds.' };
  seed.crew_partner = 'Alex';
  const prompt = assembleSeedBlock(seed);
  assert.ok(prompt.includes(CREW_BEHAVIOR_CONTRACT));
  assert.match(prompt, /Offers careful questions; claims every IV succeeds/);
  assert.match(prompt, /They outrank every personality or competency description/);
  const card = prompt.split('Partner: Alex')[1].split('Captain:')[0];
  assert.doesNotMatch(card, /Competency:|Trigger behaviors:/);
});

test('the debrief request stays in its independent evaluator scope', async () => {
  for (const level of ['ALS', 'BLS']) {
    const seed = rollScenario({ random_seed: 'crew-debrief-separation', provider_level: level });
    const context = buildDebriefContext(seed, []);
    await sendDebrief(context, level);
    assert.equal(request.config.systemInstruction, buildDebriefPrompt(level));
    assert.doesNotMatch(request.config.systemInstruction, /CREW BEHAVIOR CONTRACT|DEFAULT NO-GUIDANCE/);
    assert.equal(request.contents[0].parts[0].text, context);
    assert.doesNotMatch(context, /CREW BEHAVIOR CONTRACT/);
  }
});


test('stroke and CPR mandates use the shared precedence instead of overriding secrecy or difficulty', () => {
  for (const difficulty of ['EASY', 'NORMAL', 'HARD', 'BLACK_CLOUD']) {
    for (const provider_level of ['ALS', 'BLS']) {
      const seed = rollScenario({ random_seed: 'policy-matrix', difficulty, provider_level });
      for (const [category, presentation] of [['neuro', 'Acute ischemic stroke'], ['arrest', 'Medical cardiac arrest']]) {
        const prompt = assembleSeedBlock({ ...seed, category, presentation });
        assert.match(prompt, /server rolls\/runtime state, equipment and provider scope, private-case secrecy and narrator factuality > the event permissions below > explicit named-card\/custom character behavior > difficulty defaults/);
        assert.match(prompt, /Event permissions override even an explicitly passive card/);
        assert.match(prompt, /Only after the provider suspects stroke\/TIA or visible focal neurologic findings/);
        assert.match(prompt, /EASY and NORMAL require the partner to give one last-known-well prompt/);
        assert.match(prompt, /HARD and BLACK_CLOUD add no automatic stroke coaching/);
        assert.match(prompt, /A stroke label in the hidden seed alone never triggers a cue/);
        assert.match(prompt, /mechanical CPR only if the unit carries it/);
        assert.doesNotMatch(prompt, /must be prompted to obtain LAST KNOWN WELL|partner explicitly calling out unnecessary delay|encourage pulling over or deploying LUCAS|NOT prompt the student to call ahead under any circumstances/);
        if (category === 'neuro') assert.match(prompt, /follow ONLY the STROKE event permissions by difficulty/);
        if (category === 'arrest') {
          assert.doesNotMatch(prompt, /I am available to help|PARTNER CLOCK CALLS/);
          assert.match(prompt, /in transport, use the partner if in back, otherwise the captain if in back/);
          assert.match(prompt, /announce the observed stoppage once as a fault alert, without a checkpoint call/);
          assert.match(prompt, /No checkpoint cue while compressions are stopped; count the next cycle from actual resumption/);
        }
      }
    }
  }
});

test('all seed branches share one response example and one footer ordering rule', () => {
  for (const difficulty of ['EASY', 'NORMAL', 'HARD', 'BLACK_CLOUD']) {
    const seed = rollScenario({ random_seed: 'footer-matrix', difficulty });
    const prompt = assembleSeedBlock({ ...seed, special_flags: 'two_patients', backup_present_on_arrival: true });
    assert.equal(prompt.split('CANONICAL RESPONSE FORMAT').length - 1, 1);
    assert.match(prompt, /CREW_STATUS, PATIENT_FOCUS, VITALS, TIME/);
    assert.match(prompt, /including dispatch, report, dialogue-only and close turns/);
    assert.doesNotMatch(prompt, /nothing follows it|immediately before (?:VITALS|the \[VITALS:)/i);
    const example = prompt.split('Canonical example (no equipment placed, no backup):\n')[1].split('\n  PATIENT FOCUS')[0];
    assert.match(example, /\[CREW_STATUS: [^\]]+\]\n\[PATIENT_FOCUS: [^\]]+\]\n\[VITALS: GCS=15 Pain=7\]\n\[TIME: 0:30\]$/);
  }
});

test('the canonical footer parses into crew, patient, vitals and time without leaking tags into scene text', async () => {
  require.cache[require.resolve('../src/engine/logger')] = { exports: { logEvent() {}, closeScenario() {} } };
  require.cache[require.resolve('../src/server/adminLogger')] = { exports: { logRun() {}, updateRunDebrief() {} } };
  const { Session } = require('../src/engine/session');
  const seed = rollScenario({ random_seed: 'canonical-footer', provider_level: 'ALS' });
  const session = new Session(seed);
  try {
    response = assembleSeedBlock(seed).split('Canonical example (no equipment placed, no backup):\n')[1].split('\n  PATIENT FOCUS')[0];
    let result = await session.send('I approach the patient.');
    assert.deepEqual(result.crewStatus, { partner: 'on_scene', captain: 'not_on_scene', driver: null });
    assert.equal(session.patientFocus.id, 'patient_1');
    assert.equal(result.vitals.GCS, 15);
    assert.equal(result.vitals.Pain, 7);
    assert.equal(session.sceneMinute, 0.5);
    assert.doesNotMatch(result.reply, /\[(?:CREW_STATUS|PATIENT_FOCUS|VITALS|TIME):/);

    response = 'The driver answers from the second vehicle.\n[SECOND_PATIENT]\n[PATIENT_DEMO: {"id":"patient_2","label":"Driver"}]\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[PATIENT_FOCUS: patient_2 | Driver]\n[VITALS: GCS=14 Pain=3]\n[TIME: 1:45]';
    result = await session.send('Focus on the driver.');
    assert.equal(session.patientFocus.id, 'patient_2');
    assert.equal(result.secondPatient, true);
    assert.equal(result.vitals.GCS, 14);
    assert.equal(session.sceneMinute, 1.75);
    assert.doesNotMatch(result.reply, /\[(?:CREW_STATUS|PATIENT_FOCUS|VITALS|TIME|PATIENT_DEMO|SECOND_PATIENT)/);
  } finally { response = 'Test response.'; }
});

test('BLS measurement prompts omit positive ALS monitor instructions while ALS retains them', () => {
  for (const difficulty of ['EASY', 'NORMAL', 'HARD', 'BLACK_CLOUD']) {
    const base = rollScenario({ random_seed: 'level-vitals', difficulty, category: 'arrest' });
    const bls = assembleSeedBlock({ ...base, provider_level: 'BLS' });
    assert.match(bls, /HR → manually palpated pulse rate/);
    assert.match(bls, /BLS PULSELESS STATE:[^\n]+Perfusion=absent PulseRate=0/);
    assert.match(bls, /BP → manual cuff \+ stethoscope reading/);
    assert.match(bls, /BLS "get vitals"[\s\S]*obtain manual BP and place the standalone pulse ox/);
    assert.doesNotMatch(bls, /HR \+ Rhythm → monitor placed|simultaneously places the pulse ox and monitor|Rhythm values:|VENTRICULAR ECTOPY:|WIDE-COMPLEX TACHYCARDIA — USE|ETCO2 = VENTILATION|AMIODARONE: 300 mg|EPINEPHRINE INTERVALS:/);
    const als = assembleSeedBlock({ ...base, provider_level: 'ALS' });
    assert.match(als, /HR \+ Rhythm → monitor placed/);
    assert.match(als, /completed cycle OR manual cuff \+ stethoscope reading/);
    assert.match(als, /simultaneously places the pulse ox and monitor/);
    assert.match(als, /Rhythm values:/);
  }
});

test('arrest dosing branches on scope, age and shipped case contraindications', () => {
  const { ARREST } = require('../src/data/scenarios/arrest');
  const { buildArrestMedicationRules, amiodaroneContraindicated, isPediatricArrest } = require('../src/engine/prompts/arrest');
  const base = rollScenario({ random_seed: 'arrest-dosing', category: 'arrest', provider_level: 'ALS' });
  for (const entry of ARREST) {
    const pediatric = entry.age_override?.includes('pediatric');
    const seed = { ...base, presentation: entry.presentation, hint: entry.reversible_cause_hint,
      special_flags: entry.special_flags, arrest_rhythm: entry.rhythm, patient_age: pediatric ? 6 : 45,
      age_group: pediatric ? 'pediatric' : 'middle_aged', amiodarone_contraindicated: entry.amiodarone_contraindicated === true };
    const rules = buildArrestMedicationRules(seed);
    if (entry.amiodarone_contraindicated) {
      assert.match(rules, /Amiodarone is contraindicated in this case/);
      assert.doesNotMatch(rules, /ADULT AMIODARONE:|PEDIATRIC AMIODARONE:/);
      assert.equal(amiodaroneContraindicated({ ...seed, amiodarone_contraindicated: undefined }), true, 'legacy seed');
    } else if (pediatric) {
      assert.match(rules, /5 mg\/kg initially/);
      assert.doesNotMatch(rules, /ADULT AMIODARONE:/);
    } else {
      assert.match(rules, /Only while eligible shock-refractory VF\/pulseless VT persists/);
    }
    assert.ok(assembleSeedBlock(seed).includes(rules));
    assert.doesNotMatch(buildArrestMedicationRules({ ...seed, provider_level: 'BLS' }), /EPINEPHRINE INTERVALS:|ADULT AMIODARONE:|PEDIATRIC AMIODARONE:/);
  }
  assert.equal(isPediatricArrest({ patient_age: 0 }), true);
  assert.equal(isPediatricArrest({ patient_age: 17 }), true);
  assert.equal(isPediatricArrest({ patient_age: 18, age_group: 'pediatric' }), false);
  assert.equal(isPediatricArrest({ age_group: 'infant' }), true);
  assert.equal(amiodaroneContraindicated({ presentation: 'Adult VF', hint: 'No evidence of TCA overdose; amiodarone is reasonable.' }), false);
  for (const entry of ARREST.filter(e => e.amiodarone_contraindicated)) {
    const seed = rollScenario({ instructor: { entry: { ...entry, category: 'arrest' }, seed: { patient_age: 45 } } });
    assert.equal(seed.amiodarone_contraindicated, true);
  }
});

test('gameplay and debrief share the identical arrest transport default and all four exceptions', () => {
  const { ARREST_TRANSPORT_PRINCIPLES, ARREST_TRANSPORT_DOCTRINE, ARREST_TRANSPORT_REVIEW } = require('../src/engine/prompts/arrest');
  for (const level of ['ALS', 'BLS']) {
    const seed = rollScenario({ random_seed: 'arrest-transport', category: 'arrest', provider_level: level });
    const game = assembleSeedBlock(seed);
    const evaluation = buildDebriefPrompt(level);
    assert.equal(game.split(ARREST_TRANSPORT_DOCTRINE).length - 1, 1);
    assert.equal(evaluation.split(ARREST_TRANSPORT_REVIEW).length - 1, 1);
    assert.ok(game.includes(ARREST_TRANSPORT_PRINCIPLES));
    assert.ok(evaluation.includes(ARREST_TRANSPORT_PRINCIPLES));
    assert.doesNotMatch(evaluation, /crew concern is voiced once|crew complies|automatic loading\/departure orders/);
    assert.match(evaluation, /TRAUMATIC[\s\S]*HYPOTHERMIC[\s\S]*MATERNAL[\s\S]*ECPR/);
    assert.doesNotMatch(evaluation, /Never fault a student for refusing to transport an active medical arrest/);
  }
});

test('normal loading and loading skips receive the same destination policy and remain parked', async () => {
  const { DESTINATION_DIALOGUE_POLICY } = require('../src/engine/prompts/transport');
  const { Session } = require('../src/engine/session');
  const seed = rollScenario({ random_seed: 'loading-dialogue' });
  assert.ok(assembleSeedBlock(seed).includes(DESTINATION_DIALOGUE_POLICY));
  try {
    response = 'The patient is secured inside the parked ambulance.\n[LOADING]\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[PATIENT_FOCUS: patient_1 | Primary patient]\n[VITALS: GCS=15 Pain=0]\n[TIME: 2:00]';
    for (const skip of [null, 'to_ambulance']) {
      const session = new Session(seed);
      const result = await session.send('Load the patient into the ambulance.', false, skip);
      const instruction = request.contents.at(-1).parts[0].text;
      assert.ok(instruction.includes(DESTINATION_DIALOGUE_POLICY));
      assert.doesNotMatch(instruction, /the partner asks once which hospital/);
      assert.equal(result.loading, true);
      assert.equal(result.enRoute, false);
      assert.equal(session.moving, false);
      assert.equal(session.transportDest, null);
    }
  } finally { response = 'Test response.'; }
});

test('the BP UI shortcut requests a manual measurement for BLS and an NIBP cycle for ALS', async () => {
  const { Session } = require('../src/engine/session');
  try {
    response = 'BP is 118/76.\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[PATIENT_FOCUS: patient_1 | Primary patient]\n[VITALS: BP=118/76@T+1:00 GCS=15 Pain=0]\n[TIME: 1:00]';
    for (const provider_level of ['BLS', 'ALS']) {
      const session = new Session(rollScenario({ random_seed: 'bp-shortcut', provider_level }));
      const result = await session.send('Cycle NIBP');
      const instruction = request.contents.at(-1).parts[0].text;
      assert.match(instruction, provider_level === 'BLS' ? /Manual BP reassessment only/ : /NIBP cycle only/);
      if (provider_level === 'BLS') assert.doesNotMatch(instruction, /acknowledging the cuff is cycling/);
      assert.equal(result.vitals.BP.value, '118/76');
      assert.equal(result.vitals.BP.tMin, 1);
    }
  } finally { response = 'Test response.'; }
});

test('arrived backup joins normal and skipped transport despite stale or missing crew tags', async () => {
  const { Session } = require('../src/engine/session');
  const { BACKUP_TRANSPORT_POLICY } = require('../src/engine/prompts/transport');
  const seed = { ...rollScenario({ random_seed: 'backup-transport' }), backup_present_on_arrival: false };
  assert.ok(assembleSeedBlock(seed).includes(BACKUP_TRANSPORT_POLICY));
  try {
    for (const skip of [null, 'to_hospital', 'to_arrival']) {
      for (const crewTag of ['', '[CREW_STATUS: partner=driving captain=on_scene]', '[CREW_STATUS: partner=driving captain=not_on_scene]']) {
        const session = new Session(seed);
        session.backupStatus = { status: 'on_scene', eta: 0 };
        session.crewStatus = { partner: 'on_scene', captain: 'on_scene', driver: null };
        response = `The ambulance heads to the hospital with the captain assisting in back.\n${crewTag}\n${skip ? '' : '[EN_ROUTE:nearest]'}\n[TIME: 4:00]`;
        const result = await session.send('Depart for the nearest hospital.', false, skip);
        assert.equal(result.crewStatus.captain, 'in_back');
        assert.equal(session.hasLoaded, true);
        assert.equal(session.moving, true);
        assert.match(session.messages.at(-1).content, /captain=in_back/);
        const instruction = request.contents.at(-1).parts[0].text;
        assert.ok(instruction.includes(BACKUP_TRANSPORT_POLICY));
        if (skip) assert.match(instruction, /Emit exactly \[CREW_STATUS: partner=driving captain=in_back\]/);

        response = 'The captain continues assisting.\n[CREW_STATUS: partner=driving captain=not_on_scene]\n[TIME: 5:00]';
        const next = await session.send('Continue monitoring.');
        assert.equal(next.crewStatus.captain, 'in_back', 'backup remains available on subsequent turns');
      }
    }
  } finally { response = 'Test response.'; }
});

test('loading keeps arrived backup on scene and honors separate transport drivers', async () => {
  const { Session } = require('../src/engine/session');
  try {
    for (const driver of [null, 'anonymous', 'seed']) {
      const seed = { ...rollScenario({ random_seed: 'backup-loading' }), backup_present_on_arrival: true };
      if (driver === 'seed') seed.crew_transport_driver = 'Separate driver';
      else seed.crew_transport_driver = seed.crew_partner;
      const session = new Session(seed);
      response = 'The crew loads the patient into the parked ambulance.\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[TIME: 2:00]';
      const loaded = await session.send('Load the patient into the ambulance.', false, 'to_ambulance');
      assert.equal(loaded.crewStatus.captain, 'on_scene', 'seeded backup is physically present even if its tag was omitted');
      assert.equal(session.moving, false);
      if (driver === 'anonymous') session.crewStatus.driver = 'anonymous';
      response = `The ambulance reaches the ED bay.\n[CREW_STATUS: partner=${driver ? 'in_back' : 'driving'} captain=on_scene${driver === 'anonymous' ? ' driver=anonymous' : ''}]\n[TIME: 20:00]`;
      const result = await session.send('Transport to hospital.', false, 'to_hospital');
      assert.equal(result.crewStatus.captain, 'in_back');
      assert.equal(result.crewStatus.partner, driver ? 'in_back' : 'driving');
      assert.equal(result.crewStatus.driver, driver === 'anonymous' ? 'anonymous' : null);
    }
  } finally { response = 'Test response.'; }
});

test('transport never summons absent backup and respects an explicit release', async () => {
  const { Session } = require('../src/engine/session');
  try {
    for (const status of [null, 'en_route', 'cancelled', 'on_scene']) {
      const seed = { ...rollScenario({ random_seed: 'absent-backup' }), backup_present_on_arrival: false };
      const session = new Session(seed);
      session.backupStatus = status ? { status, eta: status === 'en_route' ? 8 : 0 } : null;
      session.crewStatus = { partner: 'on_scene', captain: status === 'on_scene' ? 'on_scene' : 'not_on_scene' };
      response = `The ambulance departs.\n${status === 'on_scene' ? '[BACKUP: cancelled]' : ''}\n[CREW_STATUS: partner=driving captain=not_on_scene]\n[EN_ROUTE:nearest]\n[TIME: 3:00]`;
      const result = await session.send(status === 'on_scene' ? 'Captain, you can clear. Depart for the nearest hospital.' : 'Depart for the nearest hospital.');
      assert.equal(result.crewStatus.captain, 'not_on_scene');
    }
  } finally { response = 'Test response.'; }
});
