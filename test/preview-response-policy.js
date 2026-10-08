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
const app = express();
const results = new Map();
let busy = false;
const checks = {
  stroke_easy: { difficulty: 'EASY', expectation: 'Passive partner gives the applicable one-time stroke cues using revealed focal findings.' },
  stroke_normal: { difficulty: 'NORMAL', expectation: 'Passive partner gives the applicable one-time stroke cues using revealed focal findings.' },
  stroke_hard: { difficulty: 'HARD', expectation: 'Passive partner adds no stroke coaching.' },
  stroke_black: { difficulty: 'BLACK_CLOUD', expectation: 'Passive partner adds no stroke coaching.' },
  hidden_stroke: { difficulty: 'EASY', hidden: true, expectation: 'Hidden seed label alone must not cause stroke or last-known-well coaching.' },
  stroke_repeat: { difficulty: 'NORMAL', repeat: true, expectation: 'Previously delivered last-known-well, notification and delay cues are not repeated.' },
  cpr_hard_bls: { difficulty: 'HARD', arrest: true, level: 'BLS', expectation: 'A failed moving-ambulance CPR roll prompts pulling over despite passivity; no mechanical CPR on BLS.' },
  cpr_black_als: { difficulty: 'BLACK_CLOUD', arrest: true, level: 'ALS', expectation: 'A failed moving-ambulance CPR roll gives a corrective cue despite passivity; mechanical CPR may be offered, awaiting orders.' },
};
function makeSession(check) {
  const seed = rollScenario({ random_seed: 'policy-preview', difficulty: check.difficulty,
    provider_level: check.level || 'ALS', category: check.arrest ? 'arrest' : 'neuro',
    partner_name: check.level === 'BLS' ? 'Quinn Abernathy (BLS)' : 'Quinn Abernathy' });
  seed.custom_partner = { name: 'Quinn', role: 'partner', custom: true,
    personality_notes: 'Entirely passive. Never initiates an action or offers an opinion without a direct order. Answers requested questions briefly.' };
  Object.assign(seed, { crew_partner: 'Quinn', presentation: check.arrest ? 'Medical cardiac arrest' : 'Acute ischemic stroke',
    hint: 'PRIVATE_PREVIEW_KEY: Do not read this out or establish a diagnosis from it.', true_diagnosis: null,
    trajectory: check.arrest ? 'arrest' : 'stable', decompensation_clock: null, complication_type: 'none',
    complication_roll: null, special_flags: null, special_circumstance: null, comorbidity_bundle: null,
    backup_present_on_arrival: false });
  const session = new Session(seed);
  session.sceneMinute = 6;
  let scene = check.hidden ? 'The patient sits in a chair. No history or neurologic exam has been obtained.'
    : 'The patient is awake. Requested examination shows right arm drift, right facial weakness and slurred speech. Glucose measured 102. Last-known-well has not been obtained. No stroke alert or hospital notification has been initiated. Essential airway and glucose care are complete. Two nonessential repeat access attempts have delayed departure.';
  if (check.repeat) scene += '\nQuinn: "When was the patient last definitely at baseline?"\nQuinn: "We should initiate a stroke alert and notify the hospital early."\nQuinn: "These repeat attempts are delaying departure."';
  if (check.arrest) {
    scene = 'The patient has no palpable pulse. CPR is ongoing during provider-ordered transport. Quinn is driving and the provider is in the back. The concern about transporting a medical arrest was already voiced once. Compressions are visibly shallow as the rig moves.';
    session.moving = true;
    session.hasLoaded = true;
    session.transportDest = 'nearest';
    session.transportEtaMin = 12;
    session.departSceneMinute = 4;
    session.crewStatus = { partner: 'driving', captain: 'not_on_scene', driver: null };
  }
  session.messages = [{ role: 'user', content: 'We have assessed the patient.' }, { role: 'assistant', content:
    scene + '\n[CREW_STATUS: partner=' + (check.arrest ? 'driving' : 'on_scene') + ' captain=not_on_scene]\n[PATIENT_FOCUS: patient_1 | Primary patient]\n[VITALS: GCS=' + (check.arrest ? 3 : 14) + ' Pain=0]\n[TIME: 6:00]' }];
  return session;
}
app.get('/', (_req, res) => res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Response policy preview</title>
<style>body{margin:28px;background:#101923;color:#e3edf5;font:16px system-ui;max-width:1100px}p{line-height:1.6}button{padding:12px;margin:4px;background:#244735;color:#fff;border:1px solid #658b76;border-radius:8px;cursor:pointer}button:disabled{opacity:.5}pre{white-space:pre-wrap;line-height:1.55;background:#172737;padding:18px;border-radius:8px}#status{color:#9ee0ad}</style></head><body>
<h1>Coaching and response format</h1><p>Live model through the current Session path. Synthetic scenes, a passive partner, and isolated temporary data. Each result shows the exact raw footer and the scene after parsing.</p>
${Object.entries(checks).map(([id]) => `<button data-check="${id}">${id.replaceAll('_',' ')}</button>`).join('')}
<p id="status">Choose a check.</p><p id="expectation"></p><pre id="result">No check has run.</pre>
<details><summary>Current coaching precedence and permissions</summary><pre>${CREW_BEHAVIOR_CONTRACT}</pre></details>
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
    const order = check.arrest ? 'Continue CPR.' : check.hidden ? 'I introduce myself.' : 'I stay with the patient and wait.';
    const previousRandom = Math.random;
    let pending;
    try {
      if (check.arrest) Math.random = () => 0.06;
      pending = session.send(order);
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
