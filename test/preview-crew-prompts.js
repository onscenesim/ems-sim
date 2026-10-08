'use strict';

// Live-model checks through the real Session path. All generated runs and data
// are temporary; the original prompt backup and real player runs are untouched.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.EMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-crew-preview-'));
require('dotenv').config({ quiet: true });
const express = require('express');
const { rollScenario } = require('../src/engine/roller');
const { Session } = require('../src/engine/session');
const { CREW_BEHAVIOR_CONTRACT } = require('../src/engine/prompts/crew');
const app = express();
app.use(express.json());
let busy = false;
const results = new Map();
const checks = {
  initiative: { partner: 'Destiny Okafor', difficulty: 'HARD',
    order: 'I approach the patient and introduce myself.',
    expectation: 'Okafor starts routine monitoring or preparation. Oxygen and IV placement await an order and roll.' },
  passive: { partner: 'Quinn Abernathy', difficulty: 'NORMAL',
    order: 'I approach the patient and introduce myself.',
    expectation: 'Abernathy stays available without initiating care or offering clinical advice.' },
  expert_failure: { partner: 'Marcus Webb', difficulty: 'NORMAL', rollRandom: 0.06,
    order: 'Marcus, start an IV in the right arm now.',
    expectation: 'The expert partner honors the forced IV FAILURE without a second attempt or working line.' },
  reluctant_success: { partner: 'Tyler Beaumont', difficulty: 'NORMAL', rollRandom: 0.99,
    order: 'Tyler, start an IV in the right arm now.',
    expectation: 'Beaumont keeps his attitude but honors the forced IV SUCCESS.' },
  challenge: { partner: 'Amara Diallo', difficulty: 'NORMAL',
    order: 'I am planning to give nitroglycerin for the chest pressure.',
    expectation: 'Diallo may challenge the plan using the already-visible low BP. A planning statement does not administer medication.' },
};

app.get('/crew-prompt-preview', (_req, res) => res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Crew behavior — live prompt checks</title>
<style>body{background:#101923;color:#e3edf5;font:16px system-ui;margin:28px;max-width:1050px}h1{font-size:26px}p{line-height:1.6;color:#bed0df}button{background:#244735;color:white;border:1px solid #658b76;border-radius:8px;padding:12px 16px;margin:6px 10px 10px 0;cursor:pointer}button:disabled{opacity:.45}pre{white-space:pre-wrap;line-height:1.65;padding:20px;background:#172737;border-radius:10px}#status{color:#9ee0ad}details{margin:18px 0}a{color:#9acaf0}</style>
</head><body><h1>Crew behavior: live prompt checks</h1>
<p>Gameplay only. Each check uses the current prompts and real model through Session. Debrief prompts are unchanged. Synthetic patient data and isolated temporary runs.</p>
<p>Forced rolls in the IV checks make outcome attribution reviewable. Other checks use normal engine behavior.</p>
${Object.entries(checks).map(([id,c]) => `<button data-check="${id}">${c.partner} — ${id.replaceAll('_',' ')}</button>`).join('')}
<p id="status">Select a check to generate the scene response.</p><p id="expectation"></p>
<pre id="result">No check has run yet.</pre><details><summary>Current gameplay crew contract</summary><pre>${CREW_BEHAVIOR_CONTRACT}</pre></details>
<p><a href="/">Open the simulator and its crew panel</a></p>
<script>
const expectations=${JSON.stringify(Object.fromEntries(Object.entries(checks).map(([id,c])=>[id,c.expectation])))};
let timer;
async function poll(id){const data=await(await fetch('/crew-prompt-preview/result/'+id)).json();if(data.state==='running'){timer=setTimeout(()=>poll(id),1000);return;}document.querySelectorAll('button').forEach(b=>b.disabled=false);document.getElementById('status').textContent=data.state==='complete'?'Live model response received.':'Live check could not complete.';document.getElementById('result').textContent=data.error||['Provider: '+data.order,'',data.reply,'','Engine rolls: '+JSON.stringify(data.rolls,null,2),'Access ledger: '+JSON.stringify(data.access),'Crew status: '+JSON.stringify(data.crewStatus)].join(String.fromCharCode(10));}
document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{document.querySelectorAll('button').forEach(x=>x.disabled=true);document.getElementById('expectation').textContent=expectations[b.dataset.check];document.getElementById('status').textContent='Generating a live scene response…';document.getElementById('result').textContent='Waiting for the model.';const data=await(await fetch('/crew-prompt-preview/run/'+b.dataset.check,{method:'POST'})).json();if(data.error){document.getElementById('status').textContent=data.error;document.querySelectorAll('button').forEach(x=>x.disabled=false);return;}poll(data.id);});
</script></body></html>`));

app.post('/crew-prompt-preview/run/:check', (req, res) => {
  const check = checks[req.params.check];
  if (!check) return res.status(404).json({ error: 'Unknown check.' });
  if (busy) return res.status(409).json({ error: 'A live check is already running.' });
  busy = true;
  const id = String(Date.now());
  results.set(id, { state: 'running' });
  res.json({ id });
  (async () => {
    const seed = rollScenario({ random_seed: 'crew-behavior-preview', category: 'cardiac',
      difficulty: check.difficulty, partner_name: check.partner, captain_name: 'Captain Sandra Okonkwo' });
    Object.assign(seed, { presentation: 'Adult with chest pressure, pale and sweaty, alert and speaking in full sentences',
      hint: 'Possible acute coronary syndrome; keep findings consistent without disclosing the case key.',
      true_diagnosis: null, trajectory: 'stable', decompensation_clock: null,
      complication_type: 'none', complication_roll: null, special_flags: null,
      special_circumstance: null, comorbidity_bundle: null, backup_present_on_arrival: false });
    const session = new Session(seed);
    session.sceneMinute = 1;
    const measured = check === checks.challenge;
    const scene = 'The call has already been dispatched. An adult sits on a living-room sofa, pale and sweaty, reporting chest pressure. The partner is present with the bags; no care has been initiated.';
    session.messages = [{ role: 'user', content: 'We arrive on scene.' }, { role: 'assistant', content:
      scene + (measured ? ' A manual BP just measured is 82/50; the patient reports dizziness.' : '')
      + '\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[PATIENT_FOCUS: patient_1 | Primary patient]\n[VITALS: GCS=15 Pain=7' + (measured ? ' BP=82/50@T+1:00' : '') + ']\n[TIME: 1:00]' }];
    if (measured) session.lastVitals = { GCS: 15, Pain: 7, BP: { value: '82/50', t: 'T+1:00', tMin: 1 } };
    const previousRandom = Math.random;
    let pending;
    try {
      if (check.rollRandom !== undefined) Math.random = () => check.rollRandom;
      // Procedure detection/rolling occurs synchronously before the model await.
      pending = session.send(check.order);
    } finally { Math.random = previousRandom; }
    const result = await pending;
    results.set(id, { state: 'complete', order: check.order, ...result, access: session.access,
      systemPrompt: session.systemPrompt });
  })().catch(error => results.set(id, { state: 'failed', error: error.message }))
    .finally(() => { busy = false; });
});
app.get('/crew-prompt-preview/result/:id', (req, res) => res.json(results.get(req.params.id) || { state: 'missing' }));
app.use(require('../src/server/app'));
const port = process.env.PORT || 3119;
app.listen(port, '127.0.0.1', () => console.log(`Crew prompt preview: http://127.0.0.1:${port}/crew-prompt-preview`));
