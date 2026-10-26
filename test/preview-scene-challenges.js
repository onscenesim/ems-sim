'use strict';

// Focused preview with real model replies through Session. Timelines are staged
// explicitly so exposure boundaries can be checked without thirty minutes of CPR.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.EMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-scene-preview-'));
require('dotenv').config({ quiet: true });
const express = require('express');
const { catalog, prepareInstructor } = require('../src/engine/instructor');
const { rollScenario } = require('../src/engine/roller');
const { Session } = require('../src/engine/session');
const app = express();
app.use(express.json());
const checks = {
  police_webb: { label: 'Police · skeptical partner', scene: 'police_transport_pretext', partner: 'Marcus Webb',
    prior: 'On arrival, an alert adult denies any complaint and does not want hospital care. Independent assessment finds normal breathing, perfusion, orientation, glucose and vital signs, with no injury or illness. Officer: "He seemed confused. Just take him in."',
    action: 'Officer, what exactly did you observe and when? Did anyone see a collapse? Why does this person need an ambulance? I ask the patient privately what happened and whether they want to go.' },
  police_nair: { label: 'Police · optimistic partner', scene: 'police_transport_pretext', partner: 'Priya Nair',
    prior: 'On arrival, an alert adult denies any complaint and does not want hospital care. Independent assessment finds normal breathing, perfusion, orientation, glucose and vital signs, with no injury or illness. Officer: "He seemed confused. Just take him in."',
    action: 'Officer, tell us why you called and what you actually saw. Priya, what do you think of his request?' },
  police_redirect: { label: 'Police · redirect optimistic partner', scene: 'police_transport_pretext', partner: 'Priya Nair',
    prior: 'Independent assessment of the alert adult finds no medical complaint, illness, injury or intoxication. The capable patient declines hospital care. Officers first alleged confusion, then fainting, then admitted nobody saw a collapse. Officer: "Just get him out of here, the hospital can check him." Priya: "A hospital check sounds safe; we can take him in!" No loading or transport has occurred.',
    action: 'Priya, those stories conflict and our assessment is normal. He has capacity and declines transport. We should respect that and document the independent findings and the conflicting officer accounts. Do you understand? Officer, what authority are you claiming? We can contact our supervisor to clarify; we are not loading him against his will on a vague medical pretext.' },
  co_dispatch: { label: 'CO · dispatch', scene: 'occult_co_arrest', dispatch: true, action: 'begin' },
  co_arrival: { label: 'CO · initial assessment', scene: 'occult_co_arrest',
    prior: 'Dispatch sent us for an unconscious person found by a family member who returned minutes ago. We have just entered the house. An adult lies motionless on the floor. The family member seems distracted and slow to answer. No other assessment or search has been performed.',
    action: 'Assess responsiveness, breathing and a carotid pulse. Ask the family member when they got home and how they feel.' },
  co_search: { label: 'CO · inspect for clues', scene: 'occult_co_arrest',
    action: 'Look around the house for clues to what caused the collapse. What do I find?' },
  co_crew: { label: 'CO · 14 minutes inside', scene: 'occult_co_arrest', minute: 12,
    action: 'Continue the current resuscitation in this room for the next two-minute CPR cycle. We remain indoors.' },
  co_late: { label: 'CO · 30 minutes inside', scene: 'occult_co_arrest', minute: 28,
    action: 'Continue the current resuscitation in this room for another two-minute CPR cycle. Everyone remains indoors.' },
  co_evacuated: { label: 'CO · 30 minutes after evacuation', scene: 'occult_co_arrest', minute: 28, outside: true,
    action: 'Continue the next two-minute CPR cycle here in the safe fresh-air resuscitation area. Reassess the family member and crew; nobody re-enters the house.' },
};
const jobs = new Map();
app.get('/scene-preview', (_req, res) => res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>New calls — live scene preview</title>
<style>body{background:#101b24;color:#e6edf2;font:17px system-ui;max-width:1080px;margin:30px auto;padding:0 20px}h1{font-size:28px}p{line-height:1.6;color:#becedb}button{font:inherit;background:#244c3c;color:white;padding:12px 15px;margin:6px;border:1px solid #709a87;border-radius:7px;cursor:pointer}button:disabled{opacity:.5}pre{white-space:pre-wrap;line-height:1.65;padding:20px;background:#172b3a;border-radius:9px}a{color:#a4d3f5}#status{color:#a6e0b8}</style></head><body>
<h1>New calls — live scene preview</h1><p>Real model replies through the simulator's Session and current case rules. Each check stages a documented starting state; the 14- and 30-minute checks start at T+12 and T+28 respectively. These are synthetic training cases in temporary storage.</p>
<nav>${Object.entries(checks).map(([id, c]) => `<button data-check="${id}">${c.label}</button>`).join('')}</nav>
<p id="status">Choose a scene check.</p><div id="results"></div><p><a href="http://127.0.0.1:3000/">Open the full simulator</a></p>
<script>document.querySelectorAll('button').forEach(button=>button.onclick=async()=>{button.disabled=true;const section=document.createElement('section'),heading=document.createElement('h2'),output=document.createElement('pre');heading.textContent=button.textContent;output.textContent='Generating live response…';section.append(heading,output);document.querySelector('#results').prepend(section);document.querySelector('#status').textContent='Generating live scene…';try{const start=await(await fetch('/scene-preview/run/'+button.dataset.check,{method:'POST'})).json();async function poll(){const d=await(await fetch('/scene-preview/result/'+start.id)).json();output.textContent=d.text||d.error||'Generating live response…';if(d.state==='running'){setTimeout(poll,1000);return;}button.disabled=false;document.querySelector('#status').textContent=d.state==='complete'?'Live response received.':'Check failed.';}poll();}catch(e){output.textContent=e.message;button.disabled=false;}});</script></body></html>`));

app.post('/scene-preview/run/:check', (req, res) => {
  const check = checks[req.params.check];
  if (!check) return res.status(404).end();
  const id = `${req.params.check}-${Date.now()}`;
  jobs.set(id, { state: 'running' });
  res.json({ id });
  (async () => {
    const entry = catalog().find(e => e.scene_challenge === check.scene);
    const seed = rollScenario({ difficulty: 'HARD', partner_name: check.partner || 'Quinn Abernathy',
      instructor: prepareInstructor({ case_id: entry.case_id, seed: { complication_type: 'none', backup_present_on_arrival: false } }), random_seed: 'scene-preview' });
    const session = new Session(seed);
    const minute = check.minute || 0;
    const base = 'The adult is unresponsive, apneic and has no carotid pulse. CPR is ongoing. ALS monitoring shows organized electrical activity at 36 with no pulse. The family member returned home just before calling and has seemed distracted and slow to answer. No scene search has been performed; the cause is unknown.';
    const symptoms = minute >= 28 ? ' Quinn has developed nausea, headache and confused speech during the prolonged indoor resuscitation. The family member is increasingly drowsy but still conscious.' : '';
    const outside = ' At T+4, after suspecting an environmental exposure, fire/rescue with respiratory protection removed the patient, all crew and the family member to a safe fresh-air area. Nobody has re-entered. The family member is alert with a lingering mild headache; the crew is asymptomatic. CPR continues outside.';
    const prior = check.prior || base + (check.outside ? outside : symptoms + ' Everyone has remained inside since T+0 without respiratory protection.');
    if (!check.dispatch) {
      session.sceneMinute = minute;
      session.messages = [{ role: 'user', content: 'We arrive and assess.' }, { role: 'assistant', content: `${prior}\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[PATIENT_FOCUS: patient_1 | Primary patient]\n[VITALS: GCS=${check.scene === 'occult_co_arrest' ? 3 : 15} Pain=0]\n[TIME: ${minute}:00]` }];
    }
    const result = await session.send(check.action);
    const text = `STAGED STARTING STATE (T+${minute}:00)\n${check.dispatch ? 'No scene information has been revealed; dispatch begins.' : prior}\n\nPROVIDER ACTION\n${check.action}\n\nLIVE SCENE RESPONSE\n${result.reply}`;
    jobs.set(id, { state: 'complete', text });
    fs.writeFileSync(path.join(process.env.EMS_DATA_DIR, `${id}.json`), JSON.stringify({ check, seed, result }, null, 2));
  })().catch(error => jobs.set(id, { state: 'failed', error: error.message }));
});
app.get('/scene-preview/result/:id', (req, res) => res.json(jobs.get(req.params.id) || { state: 'missing' }));
app.listen(Number(process.env.PREVIEW_PORT || 3132), '127.0.0.1', () => console.log('Scene preview: http://127.0.0.1:3132/scene-preview'));
