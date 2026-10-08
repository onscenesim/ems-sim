'use strict';

// Opt-in live integration evaluation. Uses the real Session/API path, synthetic
// patients and temporary storage. Does not modify the production prompts.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const reviewFile = process.env.EMS_REVIEW_JSON || (process.argv.includes('--followup') || process.argv.includes('--review') ? process.argv[3] : null);
const previousResult = reviewFile ? JSON.parse(fs.readFileSync(reviewFile)) : null;
const directory = previousResult?.directory || fs.mkdtempSync(path.join(os.tmpdir(), 'ems-prompt-functionality-'));
process.env.EMS_DATA_DIR = path.join(directory, 'data');
require('dotenv').config({ quiet: true });
const express = require('express');
const api = require('../src/engine/api');
let capture = null;
let oldTurnDelegate = null;
for (const name of ['sendTurn', 'sendDebrief']) {
  const original = api[name];
  api[name] = async (...args) => {
    if (name === 'sendTurn' && oldTurnDelegate) return oldTurnDelegate(...args);
    const started = Date.now();
    const raw = await original(...args);
    capture?.push({ type: name, raw, elapsedMs: Date.now() - started });
    return raw;
  };
}
const { Session } = require('../src/engine/session');
const { rollScenario } = require('../src/engine/roller');
const { buildDebriefContext } = require('../src/engine/assembler');
const { parseDebriefResponse, buildDebriefPrompt } = require('../src/engine/prompts/debrief');
const { evidenceFixture } = require('./fixtures/debrief-evidence');
const { evaluateObjectives } = require('../src/engine/learning');
const result = previousResult || { started: new Date().toISOString(), directory, state: 'running', cases: [] };
const save = () => fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(result, null, 2));
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const sources = ['src/engine/assembler.js', 'src/engine/api.js', 'src/engine/session.js', 'src/engine/prompts/crew.js', 'src/engine/prompts/debrief.js', 'src/engine/prompts/transport.js', 'src/engine/prompts/arrest.js', 'src/data/crew.js', 'src/data/scenarios/arrest.js'];
result.sourceHashes = Object.fromEntries(sources.map(file => [file, hash(fs.readFileSync(path.join(__dirname, '..', file)))]));

function makeSession(id, overrides, scene, readings = 'GCS=15 Pain=3') {
  const seed = rollScenario({ random_seed: 'integration-' + id, partner_name: 'Quinn Abernathy', captain_name: 'Captain Sandra Okonkwo', ...overrides });
  Object.assign(seed, { presentation: 'Adult with ankle pain, awake and comfortable', hint: 'PRIVATE_INTEGRATION_KEY: Never disclose hidden case details.',
    true_diagnosis: null, trajectory: 'stable', decompensation_clock: null, complication_type: 'none', complication_roll: null,
    special_flags: null, special_circumstance: null, comorbidity_bundle: null, backup_present_on_arrival: false,
    patient_age: 45, patient_age_display: '45 years old', age_group: 'middle_aged', arrest_rhythm: null, ...overrides });
  const session = new Session(seed, 'integration-' + id);
  session.sceneMinute = 1;
  session.patientFocus = { id: 'patient_1', label: 'Primary patient' };
  session.crewStatus = { partner: 'on_scene', captain: 'not_on_scene' };
  session.messages = [{ role: 'user', content: 'We arrive and approach.' }, { role: 'assistant', content: scene + '\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[PATIENT_FOCUS: patient_1 | Primary patient]\n[VITALS: ' + readings + ']\n[TIME: 1:00]' }];
  return session;
}
function state(session) {
  return { minute: session.sceneMinute, crew: session.crewStatus, focus: session.patientFocus, vitals: session.lastVitals,
    access: structuredClone(session.access), loaded: session.hasLoaded, moving: session.moving, arrived: session.arrivedAtHospital,
    closed: session.closed, destination: session.transportDest, departureMinute: session.departSceneMinute };
}
function footerValid(raw) {
  return /\[CREW_STATUS: [^\]]+\]\n\[PATIENT_FOCUS: [^\]]+\]\n\[VITALS: [^\]]+\]\n\[TIME: \d+:\d{2}\]\s*$/.test(raw)
    && ['CREW_STATUS', 'PATIENT_FOCUS', 'VITALS', 'TIME'].every(tag => raw.split('[' + tag + ':').length === 2);
}
async function gameplay(id, label, session, orders) {
  const item = { id, label, type: 'gameplay', systemPrompt: session.systemPrompt, seed: session.seed, steps: [], checks: [] };
  result.cases.push(item); save();
  for (const order of orders) {
    capture = [];
    const before = state(session);
    const previousRandom = Math.random;
    let pending;
    try {
      if (order.random !== undefined) Math.random = () => order.random;
      pending = session.send(order.text, order.report || false, order.skip || null);
    } finally { Math.random = previousRandom; }
    const response = await pending;
    const raw = session.messages.at(-1).content;
    const after = state(session);
    const time = raw.match(/\[TIME: (\d+):(\d{2})\]/);
    const checks = [
      { label: 'Canonical footer', pass: footerValid(raw) },
      { label: 'Clock never goes backwards', pass: after.minute >= before.minute },
      { label: 'Engine clock matches emitted TIME', pass: !!time && Math.abs(after.minute - (Number(time[1]) + Number(time[2]) / 60)) < .001 },
      { label: 'No hidden key or server roll leak', pass: !/PRIVATE_INTEGRATION_KEY|\[SYSTEM ROLL|\bd20=|\bDC\s*\d/i.test(response.reply) },
      { label: 'Provider is not voiced by model', pass: !/^\s*(?:You|Provider):\s*"/m.test(raw) },
    ];
    if (order.skip === 'to_arrival' && before.destination) checks.push({ label: 'Arrival preserves chosen destination', pass: after.destination === before.destination });
    if (order.check) checks.push(...order.check({ before, after, response, raw, session }));
    const step = { order: order.text, expectation: order.expectation, report: !!order.report, skip: order.skip || null,
      before, after, raw, reply: response.reply, rolls: response.rolls, api: capture, checks };
    item.steps.push(step); save();
    console.log(`${id} ${item.steps.length}/${orders.length}: ${checks.every(c => c.pass) ? 'structural checks pass' : 'CHECK FAILED'}`);
  }
  item.turns = session.turns;
  item.completed = true; save();
  return session;
}
async function debrief(id, label, seed, turns, depart) {
  const context = buildDebriefContext(seed, turns, depart);
  const existing = result.cases.find(c => c.id === id);
  if (existing?.completed) return;
  const item = existing || { id, label, type: 'debrief', context, prompt: buildDebriefPrompt(seed.provider_level), seed, turns };
  if (!existing) result.cases.push(item);
  item.attempts ||= [];
  if (existing && !item.attempts.length) item.attempts.push({ error: result.error || 'Previous attempt incomplete' });
  save(); capture = [];
  let raw;
  try { raw = await api.sendDebrief(context, seed.provider_level); }
  catch (error) { item.attempts.push({ error: error.message }); item.error = error.message; save(); console.log(`${id}: ${error.message}`); return; }
  const parsed = parseDebriefResponse(raw, seed.timestamp_start);
  item.attempts.push({ success: true }); delete item.error;
  Object.assign(item, parsed, { raw, api: capture, completed: true,
    review: { ...evaluateObjectives(seed, turns), debriefText: parsed.debrief }, checks: [
      { label: 'Five visible sections', pass: [1, 2, 3, 4, 5].every(n => new RegExp('(?:^|\\n)\\s*(?:#{1,6}\\s*)?(?:\\*\\*)?' + n + '\\.', 'm').test(raw)) },
      { label: 'Outcome present with calendar date', pass: !!parsed.patientOutcome && /\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\b/.test(parsed.patientOutcome) },
      { label: 'Gameplay crew contract excluded', pass: !item.prompt.includes('CREW BEHAVIOR CONTRACT') },
    ] });
  save(); console.log(`${id}: debrief complete`);
}
const ck = (label, pass) => ({ label, pass });
async function run() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY required');
  const cardiac = makeSession('als', { provider_level: 'ALS', category: 'cardiac', difficulty: 'HARD', crew_partner: 'Destiny Okafor',
    presentation: 'Adult with chest pressure; alert and speaking clearly', hint: 'PRIVATE_INTEGRATION_KEY: Possible acute coronary syndrome; preserve observed findings.' },
    'An adult sits on the sofa with chest pressure. Okafor is here with the bags. No measurements or care yet.');
  await gameplay('als', 'ALS: initiative → failed and successful IV → loading → report → drive → arrival', cardiac, [
    { text: 'I introduce myself and ask what happened.', expectation: 'Routine crew initiative; no unrolled oxygen or IV.' },
    { text: 'Okafor, start an IV in the right arm.', random: .06, check: ({ after }) => [ck('Failed IV did not establish access', !after.access.some(a => a.status === 'patent'))] },
    { text: 'Okafor, start an IV in the left arm.', random: .99, check: ({ after }) => [ck('Successful IV patent', after.access.some(a => a.status === 'patent'))] },
    { text: 'Load the patient into the ambulance.', check: ({ after }) => [ck('Loaded and parked', after.loaded && !after.moving), ck('Captain has not appeared', after.crew.captain === 'not_on_scene')] },
    { text: 'Major hospital, radio report: adult with chest pressure, alert, monitor attached, IV established. We are still parked and will depart shortly.', report: true,
      check: ({ after, response }) => [ck('Hospital report does not start driving', !after.moving), ck('No procedures from report', response.rolls.length === 0)] },
    { text: 'Drive to the major hospital now.', check: ({ after }) => [ck('Explicit departure starts driving', after.moving && after.crew.partner === 'driving')] },
    { text: '[Skip ahead to arrival]', skip: 'to_arrival', check: ({ after }) => [ck('Arrival does not transfer care', after.arrived && !after.closed)] },
    { text: 'Transfer care: adult with chest pressure, vital trends and IV given in report. Receiving team, you have the patient.', report: true,
      check: ({ after }) => [ck('Handoff closes call', after.closed)] },
  ]);
  const bls = makeSession('bls', { provider_level: 'BLS', category: 'neuro', difficulty: 'NORMAL', crew_partner: 'Quinn Abernathy (BLS)',
    presentation: 'Acute ischemic stroke', custom_partner: { name: 'Quinn', role: 'partner', custom: true, personality_notes: 'Passive; no initiative or advice outside explicit event permissions.' } },
    'Patient awake, with newly revealed right facial weakness, right arm drift and slurred speech. Glucose is 102. Last-known-well and notification unknown. No monitor is available on this BLS unit.');
  await gameplay('bls', 'BLS: stroke cues → manual vitals → out-of-scope order → parked loading → transport', bls, [
    { text: 'Get a full set of vitals and ask family when the patient was last at baseline.', check: ({ after }) => [ck('BLS excludes ECG and capnography', !after.vitals?.Rhythm && !after.vitals?.ETCO2), ck('Manual BP and pulse obtained', !!after.vitals?.BP && after.vitals?.HR !== undefined)] },
    { text: 'Acquire a 12-lead ECG.', random: .99, expectation: 'Declines unavailable procedure without inventing a monitor or paper.', check: ({ after, session }) => [ck('No unavailable 12-lead filed', !session.turns.at(-1).twelveLeads?.length), ck('No ECG rhythm', !after.vitals?.Rhythm)] },
    { text: '[Skip ahead to loading the patient]', skip: 'to_ambulance', check: ({ after }) => [ck('Loading skip stays parked', after.loaded && !after.moving)] },
    { text: 'Major hospital, stroke alert: facial weakness, arm drift, dysarthria, glucose 102, last-known-well as provided by family. Preparing departure.', report: true, check: ({ after }) => [ck('Report stays parked', !after.moving)] },
    { text: 'Drive to the major hospital now.', check: ({ after }) => [ck('BLS partner drives; no invented captain', after.crew.partner === 'driving' && after.crew.captain === 'not_on_scene')] },
    { text: '[Skip ahead to arrival]', skip: 'to_arrival', check: ({ after }) => [ck('Arrival remains open for handoff', after.arrived && !after.closed)] },
  ]);
  const arrest = makeSession('pediatric', { provider_level: 'ALS', difficulty: 'HARD', category: 'arrest', crew_partner: 'Marcus Webb',
    patient_age: 6, patient_age_display: '6 years old', age_group: 'pediatric', presentation: 'Pediatric congenital heart disease with refractory VF', arrest_rhythm: 'VF', trajectory: 'arrest' },
    'Child age 6, measured weight 20 kg, pulseless VF on the attached monitor after three shocks. CPR ongoing. One patent IV. Webb is here. No antiarrhythmic given.', 'GCS=3 Pain=0 HR=0 Rhythm=VF Perfusion=absent PulseRate=0');
  arrest.access = [{ kind: 'IV', status: 'patent' }];
  await gameplay('pediatric', 'Pediatric arrest: weight-based dose → checkpoint → transport → failed moving CPR', arrest, [
    { text: 'Give amiodarone 100 mg IV for this 20 kg child with refractory VF.', random: .99, expectation: 'Honors explicit pediatric dose without adult dose substitution.' },
    { text: 'Check pulse and rhythm.', expectation: 'Check at the next active-cycle checkpoint without inventing a second intervention.' },
    { text: 'Load the patient and drive to the major hospital now while existing CPR continues.', expectation: 'One medical-arrest transport concern then obeys explicit order; no unarrived captain.' },
    { text: 'Continue CPR.', random: .06, expectation: 'Failed moving CPR honored; one corrective cue; no automatic pulling over.', check: ({ after, response }) => [ck('Moving CPR base DC17 before difficulty modifier', response.rolls.some(r => r.procedure_id === 'cpr' && r.base_dc === 17)), ck('No unsolicited stop', after.moving)] },
  ]);
  const multi = makeSession('multi', { provider_level: 'ALS', category: 'obstetric', difficulty: 'HARD',
    presentation: 'Mother and newborn following an uncomplicated delivery', special_flags: 'two_patients' },
    'Mother alert after delivery, no active heavy bleeding. Newborn breathing and crying. Both are confirmed patients: patient_1 Mother, patient_2 Newborn. Partner here with bags; captain not here. Mother has no monitoring attached.');
  await gameplay('multi', 'Two patients: measurements and equipment remain patient-specific', multi, [
    { text: 'Focus on the mother, attach the monitor and pulse ox and measure her BP.', check: ({ after }) => [ck('Mother retains patient_1', after.focus.id === 'patient_1')] },
    { text: 'Focus on the newborn. Visually assess breathing and color only. Do not place or move equipment.', check: ({ after }) => [ck('Newborn is patient_2', after.focus.id === 'patient_2'), ck('No maternal readings copied', !after.vitals?.BP && !after.vitals?.SpO2 && !after.vitals?.Rhythm)] },
    { text: 'Return focus to the mother. Ask her name; do not remeasure her BP.', check: ({ after }) => [ck('Mother returns to patient_1', after.focus.id === 'patient_1')] },
  ]);
  await runDebriefs();
  result.state = 'complete'; result.completed = new Date().toISOString(); save();
  console.log(`RESULTS: ${directory}/results.json`);
}

async function runDebriefs() {
  // Debrief evaluation is a separate set of calls with its own system prompt.
  const fixture = evidenceFixture();
  await debrief('evidence', 'Debrief: long scene DNR, monitor-only evidence, ECG paper and continued-care skip', fixture.seed, fixture.turns, 4);
  const careSeed = { scenario_id: 'integration-debrief', timestamp_start: '2026-10-08T12:00:00Z', provider_level: 'BLS', difficulty: 'HARD', category: 'medical', region: 'SUBURBAN', patient_age: 72, sex: 'male', presentation: 'Abdominal pain with shock from internal hemorrhage', hint: 'Hidden source: ruptured abdominal aortic aneurysm requiring hospital surgical care.', trajectory: 'progressive shock', complication_type: 'none', total_scene_minutes: 14 };
  const initial = { user: 'Assess ABCs, glucose and vital signs.', assistant: 'Pale, clammy, patent airway, adequate breathing, weak radial pulse, diffuse abdominal pain. Nearby hospital has emergency surgery. ALS intercept cannot arrive sooner.', sceneMinute: 2, vitals: { HR: 124, BP: '82/50', SpO2: 96, RR: 24, Glucose: 112, GCS: 15 } };
  const care = [initial, { user: 'I suspect sepsis but recognize shock of uncertain cause. Keep warm and depart promptly for the surgical-capable hospital; pre-notify with findings and uncertainty.', assistant: 'Warm and secured, departing now; receiving team acknowledges shock report.', sceneMinute: 4 }, { user: '[Skip ahead to arrival]', skip: true, assistant: 'Existing care and monitoring continue; the patient remains awake at arrival.', sceneMinute: 14, vitals: { HR: 128, BP: '80/48', GCS: 15 } }];
  await debrief('sound-care', 'Debrief: incorrect label with sound BLS care and transport skip', careSeed, care, 4);
  const delay = [initial, { user: 'The low BP does not concern me. Wait on scene for twenty minutes to see whether the pain resolves.', assistant: 'Twenty minutes later, now confused, still pale and clammy with weak pulse.', sceneMinute: 22, vitals: { HR: 140, BP: '66/40', GCS: 13 } }, { user: 'Now load and drive to the surgical-capable hospital.', assistant: 'Transport begins.', sceneMinute: 24 }, { user: '[Skip ahead to arrival]', skip: true, assistant: 'Arrival with ongoing care continuing.', sceneMinute: 34 }];
  await debrief('care-gap', 'Debrief control: visible shock ignored with consequential scene delay', { ...careSeed, total_scene_minutes: 34 }, delay, 24);
}

async function followup() {
  result.state = 'running'; save();
  // Additional invariants found during manual review, applied to preserved raw
  // outputs. Keep the original mistaken assertion for auditability.
  for (const item of result.cases) for (const step of item.steps || []) {
    const time = step.raw.match(/\[TIME: (\d+):(\d{2})\]/);
    if (!step.checks.some(c => c.label === 'Engine clock matches emitted TIME')) step.checks.push(ck('Engine clock matches emitted TIME', !!time && Math.abs(step.after.minute - (Number(time[1]) + Number(time[2]) / 60)) < .001));
    if (step.skip === 'to_arrival' && step.before.destination) step.checks.push(ck('Arrival preserves chosen destination', step.after.destination === step.before.destination));
    const cpr = step.checks.find(c => c.label === 'Moving CPR rolls at DC17');
    if (cpr) {
      step.originalAssertion = structuredClone(cpr);
      cpr.label = 'Moving CPR base DC17 before difficulty modifier';
      cpr.pass = step.rolls.some(r => r.procedure_id === 'cpr' && r.base_dc === 17);
    }
  }
  // Replay the actual failure context with a supported retry phrase.
  const als = result.cases.find(c => c.id === 'als');
  const retry = makeSession('iv-retry', als.seed, 'Adult with chest pressure; Okafor present. The prior right-arm IV failed. No access established.');
  retry.sceneMinute = als.steps[1].after.minute;
  retry.messages.push(...als.steps.slice(0, 2).flatMap(s => [{ role: 'user', content: s.order }, { role: 'assistant', content: s.raw }]));
  await gameplay('iv-retry', 'Follow-up: recognized IV retry after the actual failed attempt', retry, [
    { text: 'Okafor, start an IV in the left arm.', random: .99, check: ({ after, response }) => [ck('Retry rolled and established patent access', response.rolls.some(r => r.procedure_id === 'peripheral_iv' && r.outcome === 'SUCCESS') && after.access.some(a => a.status === 'patent'))] },
  ]);
  const bls = result.cases.find(c => c.id === 'bls');
  for (const version of ['old', 'current']) {
    const session = makeSession('bls-' + version, bls.seed, 'Adult with observed facial weakness and arm drift; BLS unit has no ECG monitor. Quinn here.');
    session.sceneMinute = bls.steps[0].after.minute;
    session.messages.push({ role: 'user', content: bls.steps[0].order }, { role: 'assistant', content: bls.steps[0].raw });
    if (version === 'old') {
      // Use the preserved API wrapper as well as the preserved assembled prompt.
      const { createRequire } = require('node:module');
      const vm = require('node:vm');
      const backupRoot = path.join(__dirname, '../backups/prompts/2026-10-08-before-review/sources');
      const oldPath = path.join(backupRoot, 'src/engine/api.js');
      const oldRequire = createRequire(oldPath);
      const oldModule = { exports: {} };
      vm.runInNewContext(fs.readFileSync(oldPath, 'utf8'), { module: oldModule, exports: oldModule.exports, process, console,
        require: name => name === './modelRequest' ? require('../src/engine/modelRequest') : oldRequire(name) }, { filename: oldPath });
      const oldSend = oldModule.exports.sendTurn;
      const currentSend = api.sendTurn;
      api.sendTurn = async (...args) => { const raw = await oldSend(...args); capture?.push({ type: 'sendTurn', raw, promptVersion: 'original-backup' }); return raw; };
      // Session captures sendTurn on import, so replace that captured wrapper's
      // delegate for this case through the routing hook below instead.
      oldTurnDelegate = api.sendTurn;
      api.sendTurn = currentSend;
      session.systemPrompt = require(path.join(backupRoot, 'src/engine/assembler')).assembleSeedBlock(session.seed);
    }
    try {
      await gameplay('bls-' + version, 'Follow-up: BLS 12-lead with ' + version + ' complete gameplay prompt', session, [
        { text: 'Acquire a 12-lead ECG.', random: .99, expectation: 'No unavailable ECG equipment or paper.', check: ({ session }) => [ck('No unavailable 12-lead filed', !session.turns.at(-1).twelveLeads?.length)] },
      ]);
    } finally { oldTurnDelegate = null; }
  }
  await runDebriefs();
  result.state = result.cases.some(c => c.error) ? 'complete with errors' : 'complete';
  delete result.error; result.completed = new Date().toISOString(); save();
  console.log(`FOLLOW-UP RESULTS: ${directory}/results.json`);
}

const app = express();
app.use('/public', express.static(path.join(__dirname, '../public')));
app.get('/results.json', (_req, res) => res.json(result));
app.get('/', (_req, res) => res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Prompt integration evaluation</title>
<link rel="stylesheet" href="/public/style.css"><link rel="stylesheet" href="/public/practice.css">
<style>body{margin:24px;background:#17232b;color:#e6eef4;font:16px system-ui;max-width:1100px}p{line-height:1.5}select,button{padding:10px;margin:6px;background:#2b424f;color:white}pre{white-space:pre-wrap;line-height:1.6;background:#20323e;padding:18px;border-radius:8px}.pass{color:#9cdda6}.fail{color:#ffac92}details{margin:16px 0}</style>
<h1>Prompt integration evaluation</h1><p>Live results through the real simulator. Gameplay and debrief are evaluated separately. Synthetic patients; production prompts unchanged.</p>
<p id="status">Loading results…</p><label>Scenario <select id="scenario"></select></label><label id="step-label">Turn <select id="step"></select></label><button id="refresh">Refresh results</button><main id="view"></main>
<script src="/public/practice.js"></script><script>
let data;const scenario=document.querySelector('#scenario'),step=document.querySelector('#step'),view=document.querySelector('#view');
const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
function details(label,text){const d=document.createElement('details');d.append(el('summary',label),el('pre',text));return d;}
function render(){view.replaceChildren();const c=data.cases[scenario.value];if(!c)return;document.querySelector('#step-label').hidden=c.type!=='gameplay';const s=c.type==='gameplay'?c.steps[step.value]:c;if(!s){view.append(el('p','Case is running…'));return;}view.append(el('h2',c.label));if(s.order)view.append(el('p','Provider: '+s.order));if(s.expectation)view.append(el('p','Expected: '+s.expectation));for(const check of s.checks||[]){const p=el('p',(check.pass?'PASS: ':'FAIL: ')+check.label);p.className=check.pass?'pass':'fail';view.append(p);}if(c.type==='debrief')view.append(PracticeUI.learning(c.review));else view.append(el('pre',s.reply),details('Engine state and rolls',JSON.stringify({before:s.before,after:s.after,rolls:s.rolls},null,2)));view.append(details('Raw model response',s.raw||''),details(c.type==='debrief'?'Exact debrief input':'Exact gameplay system prompt',c.context||c.systemPrompt||''));}
function steps(){step.replaceChildren();const c=data.cases[scenario.value];(c?.steps||[]).forEach((s,i)=>step.add(new Option((i+1)+'. '+s.order,i)));render();}
async function refresh(){const prior=scenario.value,turn=step.value;data=await(await fetch('/results.json')).json();document.querySelector('#status').textContent=data.state+' · '+data.cases.filter(c=>c.completed).length+' completed cases · '+data.cases.reduce((n,c)=>n+(c.steps?.length||0),0)+' gameplay turns';scenario.replaceChildren();data.cases.forEach((c,i)=>scenario.add(new Option(c.label,i)));if(prior&&data.cases[prior])scenario.value=prior;steps();if(turn&&step.options[turn]){step.value=turn;render();}}
scenario.onchange=steps;step.onchange=render;document.querySelector('#refresh').onclick=refresh;refresh();setInterval(()=>{if(data?.state==='running')refresh();},10000);
</script></html>`));
app.listen(Number(process.env.PORT) || 3120, '127.0.0.1', function () {
  console.log(`PREVIEW: http://127.0.0.1:${this.address().port}/`);
  console.log(`ARTIFACTS: ${directory}`);
  const task = process.argv.includes('--followup') ? followup() : previousResult ? Promise.resolve() : run();
  task.catch(error => { result.state = 'failed'; result.error = error.stack; save(); console.error(error); });
});
