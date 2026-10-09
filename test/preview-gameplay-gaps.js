'use strict';
// Local verification: real Session, routes and UI with synthetic gameplay.
// Only the explicitly clicked evidence-debrief check calls the configured model.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
process.env.EMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-gap-preview-'));
require('dotenv').config({ quiet: true });
const liveAPI = require('../src/engine/api');
const { buildDebriefContext } = require('../src/engine/assembler');
const { parseDebriefResponse } = require('../src/engine/prompts/debrief');
let scriptedReply = null;
const apiPath = require.resolve('../src/engine/api');
require.cache[apiPath] = { exports: {
  sendTurn: async (_prompt, messages) => {
    if (scriptedReply !== null) return scriptedReply;
    const action = messages.at(-1).content;
    const last = messages.filter(m => m.role === 'assistant').at(-1)?.content || '';
    const match = last.match(/\[TIME: (\d+):(\d+)\]/);
    let minute = match ? Number(match[1]) + Number(match[2]) / 60 : -2;
    minute += /\[REPORT MODE:/.test(action) ? 0.5 : 2;
    let text = 'SYNTHETIC PREVIEW: The patient is awake and answers your questions.', tag = '';
    if (/CANNOT be performed/.test(action)) text = 'The requested ECG cannot be acquired because no monitor is available.';
    else if (/\[REPORT MODE:/.test(action)) text = 'The receiving nurse asks, “What is his current 12-lead finding, and do you have an updated ETA once wheels roll?”';
    else if (/TIME-SKIP — COMPLETE TRANSPORT|TIME-SKIP — TRANSPORT TO HOSPITAL/.test(action)) { text = 'The ambulance reaches the ED bay doors. The receiving team awaits your handoff.'; minute += 20; }
    else if (/TIME-SKIP — LOAD|Load the patient into the ambulance/i.test(action)) { text = 'The patient is secured on the stretcher and loaded. The unit stays parked.'; tag = '[LOADING]'; }
    else if (/Depart|Head to the hospital|Start transport/i.test(action)) { text = 'The ambulance pulls away from the scene, heading to the major hospital.'; tag = '[EN_ROUTE:major]'; }
    else if (/SYSTEM ROLL: peripheral_iv/.test(action)) {
      const outcome = action.match(/SYSTEM ROLL: peripheral_iv[^\n]*— (SUCCESS|MARGINAL|FAILURE|COMPLICATION)/)?.[1];
      text = outcome === 'SUCCESS' ? 'A peripheral IV is seated and patent.' : outcome === 'MARGINAL' ? 'A peripheral IV is seated with sluggish flow.' : 'The peripheral IV attempt fails; no access is established.';
    } else if (/SYSTEM ROLL: (?:twelve_lead|posterior_ecg|right_sided_ecg|v4r_ecg)/.test(action)) text = 'The ECG paper is filed in More Vitals.';
    return `${text}\n${tag}\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[VITALS: HR=90 RR=18 BP=118/76 GCS=15]\n[TIME: ${Math.floor(minute)}:${String(Math.round(minute % 1 * 60)).padStart(2, '0')}]`;
  },
  sendDebrief: async () => 'LOCAL SYNTHETIC PREVIEW. No clinical evaluation was generated for this interactive fixture.',
} };
const { Session } = require('../src/engine/session');
const { rollScenario } = require('../src/engine/roller');
const { evaluateObjectives } = require('../src/engine/learning');
const productionApp = require('../src/server/app');
const wrapper = express();
wrapper.use(express.json());
function makeSession(level = 'ALS') {
  return new Session(rollScenario({ random_seed: 'gap-preview', provider_level: level, region: 'SUBURBAN', category: 'medical' }));
}
function response(text, time, extra = '') {
  scriptedReply = `${text}\n${extra}\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[TIME: ${time}]`;
}
wrapper.post('/qa/check/:name', async (req, res, next) => {
  try {
    const s = makeSession(req.params.name === 'bls' || req.params.name === 'backup' ? 'BLS' : 'ALS');
    let result, before;
    if (req.params.name === 'bls') {
      response('The ECG paper is filed.', '2:00');
      result = await s.send('Acquire a 12-lead ECG.');
    } else if (req.params.name === 'backup') {
      response('Named ALS backup arrives with its monitor.', '1:00', '[BACKUP: on_scene ETA=0 LEVEL=ALS MONITOR=available]');
      await s.send('Wait for requested backup.');
      response('The arrived ALS crew files the ECG paper.', '2:00');
      result = await s.send('Acquire a 12-lead ECG.');
    } else if (req.params.name === 'arrival') {
      response('The ambulance departs for the major hospital.', '4:00', '[EN_ROUTE:major]');
      await s.send('Depart for the major hospital.');
      before = { destination: s.transportDest, eta: s.transportEtaMin };
      response('The ambulance reaches the ED bay doors.', '34:00');
      result = await s.send('Skip ahead to arrival.', false, 'to_arrival');
    } else if (req.params.name === 'report') {
      s.sceneMinute = 7;
      before = { minute: s.sceneMinute };
      response('The receiving nurse asks, “What is his current 12-lead finding, and do you have an updated ETA once wheels roll?”', '7:30');
      result = await s.send('Radio report: assessment and care.', true);
    } else return res.status(404).end();
    res.json({ before, reply: result.reply, state: { destination: s.transportDest, eta: s.transportEtaMin,
      minute: s.sceneMinute, arrived: s.arrivedAtHospital, rolls: result.rolls.map(r => r.procedure_id),
      printouts: s.turns.flatMap(t => t.twelveLeads || []).length, backup: s.backupStatus } });
  } catch (error) { next(error); }
  finally { scriptedReply = null; }
});

let evidenceJob = { state: 'idle' };
wrapper.get('/qa/evidence', (_req, res) => res.json(evidenceJob));
wrapper.post('/qa/evidence', (_req, res) => {
  if (evidenceJob.state === 'running') return res.json(evidenceJob);
  evidenceJob = { state: 'running' };
  res.json(evidenceJob);
  const seed = { scenario_id: 'evidence-boundary-preview', timestamp_start: '2026-10-09T12:00:00Z',
    provider_level: 'BLS', category: 'medical', difficulty: 'NORMAL', region: 'SUBURBAN', patient_age: 68,
    patient_age_display: '68 years old', sex: 'male', presentation: 'Undifferentiated shock with abdominal pain',
    true_diagnosis: 'Ruptured abdominal aortic aneurysm', hint: 'Occult internal hemorrhage. No field diagnostic certainty required.',
    trajectory: 'rapidly_deteriorating', complication_type: 'none', total_scene_minutes: 18 };
  const turns = [
    { user: 'Assess ABCs, vitals, glucose, focused history and exam.', assistant: 'Awake, patent airway, adequate ventilation, pale and clammy, weak pulses. Sudden abdominal pain. Nearby hospital has emergency vascular surgery; ALS cannot intercept before arrival.', sceneMinute: 2, vitals: { HR: 124, BP: '82/50', RR: 24, Glucose: 112, GCS: 15 } },
    { user: 'I suspect sepsis but recognize shock of uncertain cause. Keep warm, monitor ABCs, load now and depart for the surgical-capable hospital. Pre-notify with shock findings and uncertainty.', assistant: 'Patient secured and warm; transport begins and the receiving team acknowledges the report.', sceneMinute: 4 },
    { user: '[Skip ahead to arrival]', skip: true, assistant: 'Existing care and monitoring continue. The patient remains awake on arrival.', sceneMinute: 17, vitals: { HR: 128, BP: '80/48', GCS: 15 } },
    { user: 'Transfer care with onset, vital trends, interventions and diagnostic uncertainty.', assistant: 'Hospital team accepts handoff and begins evaluation. No imaging, surgery or recovery is recorded.', sceneMinute: 18, report: true },
  ];
  liveAPI.sendDebrief(buildDebriefContext(seed, turns, 4), 'BLS').then(raw => {
    const parsed = parseDebriefResponse(raw, seed.timestamp_start);
    evidenceJob = { state: 'complete', review: { ...evaluateObjectives(seed, turns), debriefText: parsed.debrief }, patientOutcome: parsed.patientOutcome };
    fs.writeFileSync(path.join(process.env.EMS_DATA_DIR, 'evidence-review.json'), JSON.stringify(evidenceJob, null, 2));
    console.log(`Live debrief saved: ${path.join(process.env.EMS_DATA_DIR, 'evidence-review.json')}`);
  }).catch(error => { evidenceJob = { state: 'failed', error: error.message }; });
});
wrapper.get('/qa', (_req, res) => res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gameplay gap verification</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/practice.css"><style>body{display:block;height:auto;min-height:100vh;padding:24px;background:#17232e;color:#e7ecf0;font:18px system-ui}.qa{max-width:1050px;margin:auto}h1{font-size:28px}button,a{font:inherit;padding:10px;margin:5px;color:#dbeefa;background:#263c4c;border:1px solid #7c99ab;border-radius:4px;cursor:pointer}pre{white-space:pre-wrap;background:#10202c;padding:18px;line-height:1.55}#review{color:#18222b}#status{margin:18px 0}button:disabled{opacity:.5}</style></head><body><main class="qa"><h1>Gameplay gap verification</h1><p>Real Session and UI code. Gameplay uses synthetic replies in temporary storage. The evidence-debrief button calls the configured live model.</p><nav><a href="/">Open interactive simulator</a></nav><p>In the simulator, try “try one IV in the left arm,” then expand “Edit or add a missed action,” add “Acquire a 12-lead ECG,” and recheck before confirming.</p><div><button data-check="bls">BLS equipment gate</button><button data-check="backup">Equipped ALS backup</button><button data-check="arrival">Arrival at major hospital</button><button data-check="report">Report timing and dialogue</button></div><pre id="result">Choose a check to inspect its scene response and engine state.</pre><button id="evidence">Generate live evidence debrief</button><p id="status">No live model request has run.</p><div id="review"></div></main><script src="/practice.js"></script><script>
const result=document.querySelector('#result');document.querySelectorAll('[data-check]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await fetch('/qa/check/'+b.dataset.check,{method:'POST'});const d=await r.json();result.textContent=JSON.stringify(d,null,2);}finally{b.disabled=false;}});
const evidence=document.querySelector('#evidence');async function poll(){const d=await(await fetch('/qa/evidence')).json();document.querySelector('#status').textContent=d.state==='failed'?d.error:'Live evidence debrief: '+d.state;if(d.state==='running'){setTimeout(poll,1000);return;}evidence.disabled=false;if(d.review)document.querySelector('#review').replaceChildren(PracticeUI.learning(d.review));}
evidence.onclick=async()=>{evidence.disabled=true;await fetch('/qa/evidence',{method:'POST'});poll();};poll();
</script></body></html>`));
wrapper.use(productionApp);
const port = Number(process.env.PREVIEW_PORT || 3131);
wrapper.listen(port, '127.0.0.1', () => console.log(`Gameplay gap preview: http://127.0.0.1:${port}/qa`));
