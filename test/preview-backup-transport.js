'use strict';

// Focused live-model preview. All runs use isolated temporary storage.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.EMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-backup-preview-'));
require('dotenv').config({ quiet: true });
const express = require('express');
const { Session } = require('../src/engine/session');
const { rollScenario } = require('../src/engine/roller');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
let session;
let busy = false;
function reset() {
  const seed = rollScenario({ random_seed: 'backup-transport-preview', category: 'medical',
    difficulty: 'HARD', captain_name: 'Captain Sandra Okonkwo' });
  Object.assign(seed, { backup_present_on_arrival: true, trajectory: 'stable',
    presentation: 'Alert adult with nausea, seated on a sofa, speaking normally',
    true_diagnosis: null, special_flags: null, special_circumstance: null,
    complication_type: 'none', comorbidity_bundle: null });
  session = new Session(seed);
  session.sceneMinute = 2;
  session.backupStatus = { status: 'on_scene', eta: 0 };
  session.crewStatus = { partner: 'on_scene', captain: 'on_scene', driver: null };
  session.messages = [{ role: 'user', content: 'We arrive and assess the patient.' },
    { role: 'assistant', content: `${seed.crew_captain} greets you by the sofa and joins the crew. The patient is alert and speaking normally.\n[BACKUP: on_scene ETA=0]\n[CREW_STATUS: partner=on_scene captain=on_scene]\n[PATIENT_FOCUS: patient_1 | Primary patient]\n[VITALS: GCS=15 Pain=0]\n[TIME: 2:00]` }];
}
reset();
function state(reply = 'Backup is on scene and available. Load the patient, then depart, or skip directly to hospital.') {
  return { reply, captain: session.seed.crew_captain, crewStatus: session.crewStatus,
    moving: session.moving, loaded: session.hasLoaded, arrived: session.arrivedAtHospital };
}
app.get('/state', (_req, res) => res.json(state()));
app.post('/step/:step', async (req, res) => {
  if (busy) return res.status(409).json({ error: 'A preview turn is running.' });
  const actions = { load: ['Load the patient into the ambulance.'],
    depart: ['Depart for the nearest hospital.'],
    skip: ['Skip ahead to the hospital.', false, 'to_hospital'],
    assist: ['Captain, please reassess the patient with me in the back.'] };
  if (req.params.step === 'reset') { reset(); return res.json(state()); }
  if (!actions[req.params.step]) return res.sendStatus(404);
  busy = true;
  try {
    const result = await session.send(...actions[req.params.step]);
    res.json(state(result.reply));
  } catch (error) { res.status(500).json({ error: error.message }); }
  finally { busy = false; }
});
app.get('/backup-preview', (_req, res) => res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Backup transport check</title><link rel="stylesheet" href="/style.css">
<style>body{display:block;height:auto;min-height:100vh;padding:24px;background:#111c27;color:#e6edf5;font:16px system-ui}main{max-width:850px;margin:auto}h1{font-size:26px}p{line-height:1.6}.card,pre{background:#1b2c3d;padding:20px;border-radius:8px;margin:18px 0}pre{white-space:pre-wrap;font:16px/1.7 system-ui}button{padding:12px;margin:6px 6px 6px 0;background:#234735;color:#f4fff6;border:1px solid #648e72;border-radius:6px;cursor:pointer}button:disabled{opacity:.45}.crew-status-badge{display:inline-block;margin:12px 0;font-size:14px}</style>
</head><body><main><h1>Backup accompanies transport</h1><p>Live model through the real Session engine, with temporary preview data. Start with backup present, then load and depart. Reset to check the direct transport skip.</p>
<div class="card"><strong id="captain"></strong><br><span id="badge" class="crew-status-badge"></span><div id="phase"></div></div>
<nav><button data-step="reset">Reset on scene</button><button data-step="load">Load patient</button><button data-step="depart">Depart for hospital</button><button data-step="assist">Ask captain to assist</button><button data-step="skip">Skip to hospital</button></nav>
<p id="status">Ready.</p><pre id="reply"></pre><details><summary>Engine state</summary><pre id="state"></pre></details>
<script>
function render(d){if(d.error){document.querySelector('#status').textContent=d.error;return;}document.querySelector('#captain').textContent=d.captain;const b=document.querySelector('#badge');b.textContent=d.crewStatus.captain.replaceAll('_',' ').toUpperCase();b.className='crew-status-badge crew-status-'+d.crewStatus.captain.replaceAll('_','-');document.querySelector('#phase').textContent=d.arrived?'At hospital':d.moving?'Transport underway':d.loaded?'Loaded · parked':'On scene';document.querySelector('#reply').textContent=d.reply;document.querySelector('#state').textContent=JSON.stringify(d,null,2);}
document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{document.querySelectorAll('button').forEach(x=>x.disabled=true);document.querySelector('#status').textContent='Generating live scene response…';try{render(await(await fetch('/step/'+b.dataset.step,{method:'POST'})).json());document.querySelector('#status').textContent='Live response received.';}catch(e){document.querySelector('#status').textContent=e.message;}finally{document.querySelectorAll('button').forEach(x=>x.disabled=false);}});
fetch('/state').then(r=>r.json()).then(render);
</script></main></body></html>`));
const port = Number(process.env.PORT || 3134);
app.listen(port, '127.0.0.1', () => console.log(`Backup preview: http://127.0.0.1:${port}/backup-preview`));
