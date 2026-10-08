'use strict';

// Real prompt/model/Session checks with synthetic scenes and temporary storage.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.EMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-policy-preview-'));
require('dotenv').config({ quiet: true });
const express = require('express');
const { rollScenario } = require('../src/engine/roller');
const { Session } = require('../src/engine/session');
const { CREW_BEHAVIOR_CONTRACT } = require('../src/engine/prompts/crew');
const { ARREST } = require('../src/data/scenarios/arrest');
const { ARREST_TRANSPORT_DOCTRINE } = require('../src/engine/prompts/arrest');
const { DESTINATION_DIALOGUE_POLICY } = require('../src/engine/prompts/transport');
const { buildDebriefContext } = require('../src/engine/assembler');
const { sendDebrief } = require('../src/engine/api');
const app = express();
const results = new Map();
let busy = false;
const checks = {
  bls_arrest: { level: 'BLS', caseMatch: /Opioid overdose progressing/, order: 'Check the pulse and continue CPR.', expectation: 'Manual pulse confirms HR=0; absent perfusion clears pulse ox and BP, with no electrical HR, Rhythm or ETCO2.' },
  bls_vitals: { level: 'BLS', order: 'Get a full set of vitals.', expectation: 'Manual HR, RR and BP plus standalone pulse ox; no ECG, NIBP, Rhythm or ETCO2.' },
  als_vitals: { level: 'ALS', order: 'Get a full set of vitals.', expectation: 'ALS monitor and pulse ox are placed; HR/Rhythm and saturation appear, with BP gated on a cuff measurement.' },
  bls_bp: { level: 'BLS', order: 'Cycle NIBP', expectation: 'The legacy UI shortcut obtains a manual BP on a BLS unit.' },
  load_normal: { order: 'Load the patient into the ambulance.', expectation: 'Patient loads; partner does not ask about hospitals; unit stays parked.' },
  load_skip: { order: 'Skip ahead to loading the patient.', skip: 'to_ambulance', expectation: 'Same destination dialogue policy during a loading skip; unit stays parked.' },
  pediatric_dose: { caseMatch: /Pediatric congenital/, order: 'Administer amiodarone per PALS for this 20 kg child with refractory VF.', expectation: 'Weight-based dose is 100 mg (5 mg/kg), with no fixed adult 300 mg sequence.' },
  torsades: { caseMatch: /Torsades de pointes/, order: 'Give amiodarone 300 mg IV.', expectation: 'No default amiodarone after three shocks; discussion uses revealed long-QT/torsades findings.' },
  tca: { caseMatch: /TCA overdose/, order: 'Give amiodarone 300 mg IV.', expectation: 'No default amiodarone for the observed TCA-associated wide-complex PEA.' },
  maternal_transport: { caseMatch: /visibly pregnant/, order: 'Load her and drive to the major hospital under our maternal-arrest transport protocol.', expectation: 'Established maternal pathway permits transport during ongoing CPR, without the generic stay-on-scene concern.' },
  maternal_debrief: { caseMatch: /visibly pregnant/, debrief: true, order: 'Evaluate the synthetic maternal-arrest transport fixture.', expectation: 'Evaluation recognizes the established maternal transport exception and credits continuity of CPR/displacement.' },
};
function makeSession(check) {
  const seed = rollScenario({ random_seed: 'clinical-policy-preview', difficulty: 'NORMAL',
    provider_level: check.level || 'ALS', category: check.caseMatch ? 'arrest' : 'medical' });
  Object.assign(seed, { crew_partner: 'Quinn', presentation: 'Adult with ankle pain after a minor trip; awake and comfortable',
    hint: 'PRIVATE_PREVIEW_KEY: Never disclose the case key.', true_diagnosis: null,
    arrest_rhythm: null, amiodarone_contraindicated: false, trajectory: 'stable', decompensation_clock: null,
    complication_type: 'none', complication_roll: null, special_flags: null,
    special_circumstance: null, comorbidity_bundle: null, backup_present_on_arrival: false,
    patient_age: 45, age_group: 'middle_aged', patient_age_display: '45 years old',
    custom_partner: { name: 'Quinn', role: 'partner', custom: true,
      personality_notes: 'Passive. Executes direct orders and answers requested clinical questions briefly using observed findings. Does not initiate guidance.' } });
  const maternal = /maternal/.test(check.order);
  let scene = 'The adult sits on a chair with ankle pain. No measurements or monitoring have been obtained. Quinn is on scene with the bags.';
  let vitals = 'GCS=15 Pain=3';
  if (check.caseMatch) {
    const entry = ARREST.find(c => check.caseMatch.test(c.presentation));
    Object.assign(seed, { category: 'arrest', presentation: entry.presentation, hint: entry.reversible_cause_hint,
      special_flags: entry.special_flags, arrest_rhythm: entry.rhythm,
      amiodarone_contraindicated: entry.amiodarone_contraindicated === true });
    scene = 'No palpable pulse was confirmed. The ALS monitor is attached. CPR is ongoing. No antiarrhythmic has been given.';
    vitals = 'GCS=3 Pain=0 Perfusion=absent PulseRate=0';
    if (/Pediatric/.test(entry.presentation)) {
      Object.assign(seed, { patient_age: 6, patient_age_display: '6 years old', age_group: 'pediatric' });
      scene += ' The parents confirm a measured weight of 20 kg. VF persists after three delivered shocks. A patent IV is established.';
      vitals += ' HR=0 Rhythm=VF';
    } else if (/Torsades/.test(entry.presentation)) {
      scene += ' The monitor shows polymorphic complexes twisting around the baseline at 200/min. A prior monitored QTc was 560 ms before collapse. The family reports a new QT-prolonging medication. Three shocks have been delivered.';
      vitals += ' HR=200 Rhythm=torsades';
    } else if (/TCA overdose/.test(entry.presentation)) {
      scene += ' The family confirms ingestion of amitriptyline, with empty labeled bottles on scene. The organized monitor complexes are markedly wide at 80/min, with no pulse; this is PEA, not VF.';
      vitals += ' HR=80 Rhythm=VT';
    } else {
      scene += ` Pregnancy at 32 weeks is confirmed with the uterus visibly above the umbilicus. ${seed.crew_captain} is physically on scene and maintaining manual left uterine displacement. The local maternal-arrest protocol calls for immediate hospital resuscitative hysterotomy; the major hospital has confirmed OB capability and accepts the pathway. Existing CPR continues throughout.`;
      vitals += ' HR=60 Rhythm=sinus_brad';
      seed.backup_present_on_arrival = true;
    }
  }
  if (check.level === 'BLS' && check.caseMatch) {
    scene = 'No palpable carotid pulse was confirmed. CPR is ongoing. The BLS unit has an AED and a standalone pulse ox, with no ECG monitor or capnography.';
    vitals = 'GCS=3 Pain=0 HR=0 Perfusion=absent PulseRate=0';
  }
  const session = new Session(seed);
  session.sceneMinute = 6;
  if (check.caseMatch && check.level !== 'BLS') session.access = [{ kind: 'IV', status: 'patent' }];
  if (maternal) session.crewStatus = { partner: 'on_scene', captain: 'on_scene', driver: null };
  session.messages = [{ role: 'user', content: 'We have assessed the patient.' }, { role: 'assistant', content:
    scene + '\n[CREW_STATUS: partner=on_scene captain=' + (maternal ? 'on_scene' : 'not_on_scene') + ']\n[PATIENT_FOCUS: patient_1 | Primary patient]\n[VITALS: ' + vitals + ']\n[TIME: 6:00]' }];
  return session;
}
app.get('/', (_req, res) => res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Response policy preview</title>
<style>body{margin:28px;background:#101923;color:#e3edf5;font:16px system-ui;max-width:1100px}p{line-height:1.6}button{padding:12px;margin:4px;background:#244735;color:#fff;border:1px solid #658b76;border-radius:8px;cursor:pointer}button:disabled{opacity:.5}pre{white-space:pre-wrap;line-height:1.55;background:#172737;padding:18px;border-radius:8px}#status{color:#9ee0ad}</style></head><body>
<h1>Equipment, loading and arrest policy</h1><p>Live model through the current Session path. Synthetic scenes, a passive partner, and isolated temporary data. Each result shows the exact raw footer and the scene after parsing.</p>
${Object.entries(checks).map(([id]) => `<button data-check="${id}">${id.replaceAll('_',' ')}</button>`).join('')}
<p id="status">Choose a check.</p><p id="expectation"></p><pre id="result">No check has run.</pre>
<details><summary>Shared loading and arrest transport rules</summary><pre>${DESTINATION_DIALOGUE_POLICY}\n\n${ARREST_TRANSPORT_DOCTRINE}</pre></details>
<script>
const expectations=${JSON.stringify(Object.fromEntries(Object.entries(checks).map(([id,c]) => [id,c.expectation])))};
async function poll(id){const d=await(await fetch('/result/'+id)).json();if(d.state==='running'){setTimeout(()=>poll(id),1000);return;}document.querySelectorAll('button').forEach(b=>b.disabled=false);document.querySelector('#status').textContent=d.error?'Check failed.':'Live check complete.';document.querySelector('#result').textContent=d.error||['Provider: '+d.order,'RAW MODEL RESPONSE',d.raw,'PARSED SCENE',d.reply,'Footer valid: '+d.footerValid,'Engine state: '+JSON.stringify(d.engine,null,2)].join(String.fromCharCode(10,10));}
document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{document.querySelectorAll('button').forEach(x=>x.disabled=true);document.querySelector('#status').textContent='Generating live response…';document.querySelector('#expectation').textContent=expectations[b.dataset.check];const d=await(await fetch('/run/'+b.dataset.check,{method:'POST'})).json();if(d.error){document.querySelector('#status').textContent=d.error;document.querySelectorAll('button').forEach(x=>x.disabled=false);return;}poll(d.id);});
</script></body></html>`));
app.post('/run/:check', (req, res) => {
  const check = checks[req.params.check];
  if (!check) return res.status(404).json({ error: 'Unknown check.' });
  if (busy) return res.status(409).json({ error: 'A check is already running.' });
  busy = true;
  const id = String(Date.now());
  results.set(id, { state: 'running' });
  res.json({ id });
  (async () => {
    const session = makeSession(check);
    const order = check.order;
    if (check.debrief) {
      const turns = [
        { user: 'Confirm pulse and pregnancy; obtain local maternal-arrest pathway acceptance.', assistant: session.messages.at(-1).content, sceneMinute: 1, vitals: { HR: 60, Rhythm: 'sinus_brad', GCS: 3 } },
        { user: 'Load and transport to the OB-capable major hospital under the accepted maternal-arrest pathway. Continue CPR and left uterine displacement.', assistant: 'The patient is loaded and transported with continuous high-quality CPR by the provider and left uterine displacement by the captain. Partner drives. OB was pre-alerted.', sceneMinute: 4, vitals: { GCS: 3, ETCO2: 20 } },
        { user: 'Give handoff and transfer care to the waiting OB resuscitation team.', assistant: 'The receiving team accepts bedside care and begins the hospital resuscitative hysterotomy pathway.', sceneMinute: 12, vitals: { GCS: 3, ETCO2: 20 } },
      ];
      const raw = await sendDebrief(buildDebriefContext(session.seed, turns, 4), 'ALS');
      results.set(id, { state: 'complete', order, raw, reply: raw, footerValid: 'debrief format', engine: { fixture: 'maternal pathway, continuous CPR, displacement, OB acceptance' } });
      return;
    }
    const previousRandom = Math.random;
    let pending;
    try {
      Math.random = () => 0.99;
      pending = session.send(order, false, check.skip || null);
    } finally { Math.random = previousRandom; }
    const result = await pending;
    const raw = session.messages.at(-1).content;
    const footerValid = /\[CREW_STATUS: [^\]]+\]\n\[PATIENT_FOCUS: [^\]]+\]\n\[VITALS: [^\]]+\]\n\[TIME: \d+:\d{2}\]\s*$/.test(raw)
      && ['CREW_STATUS', 'PATIENT_FOCUS', 'VITALS', 'TIME'].every(tag => raw.split('[' + tag + ':').length === 2);
    results.set(id, { state: 'complete', order, raw, reply: result.reply, footerValid,
      engine: { sceneMinute: session.sceneMinute, focus: session.patientFocus, crew: result.crewStatus,
        vitals: result.vitals, rolls: result.rolls, loading: result.loading, enRoute: result.enRoute } });
  })().catch(error => results.set(id, { state: 'failed', error: error.message })).finally(() => { busy = false; });
});
app.get('/result/:id', (req, res) => res.json(results.get(req.params.id) || { state: 'missing' }));
app.listen(Number(process.env.PORT) || 0, '127.0.0.1', function (error) { if (error) throw error; console.log(`Response policy preview: http://127.0.0.1:${this.address().port}`); });
