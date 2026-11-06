'use strict';
// Live model, real Session, synthetic cases, isolated temporary storage.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.EMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-catastrophe-preview-'));
require('dotenv').config({ quiet: true });
const express = require('express');
const { Session } = require('../src/engine/session');
const { rollScenario } = require('../src/engine/roller');
const { CATASTROPHES } = require('../src/engine/catastrophes');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
let session, busy = false, lastReply;
function reset(id) {
  const seed = rollScenario({ random_seed: 'catastrophe-live-preview', category: 'medical', difficulty: 'BLACK_CLOUD', partner_name: 'Priya Nair', captain_name: 'Captain Frank Delucci' });
  Object.assign(seed, { presentation: 'Adult with nausea, alert, seated on a sofa, speaking normally', hint: 'Stable nausea without shock. Use only established findings.', true_diagnosis: null, trajectory: 'stable', decompensation_clock: null,
    special_flags: null, special_circumstance: null, comorbidity_bundle: null, backup_present_on_arrival: false,
    complication_type: id === 'er_divert' ? 'er_divert' : 'catastrophic', complication_roll: 1,
    catastrophe: id === 'er_divert' ? undefined : { id, role: 'partner' } });
  session = new Session(seed);
  session.sceneMinute = 3;
  session.crewStatus = { partner: 'on_scene', captain: 'not_on_scene', driver: null };
  session.turns = [{ user: 'Assess the patient.', assistant: 'The patient is alert and speaking normally.', sceneMinute: 3 }];
  if (['road_blocked', 'ambulance_crash_no_injuries', 'ambulance_crash_severe_injuries', 'er_overcrowding', 'er_divert'].includes(id)) {
    session.hasLoaded = true;
    session.moving = true;
    session.transportDest = 'nearest';
    session.transportEtaMin = 12;
    session.departSceneMinute = 3;
    session.crewStatus.partner = 'driving';
  }
  if (id === 'backup_crash') {
    session.backupStatus = { status: 'en_route', eta: 0 };
    session.backupArrivalMinute = 3;
  }
  lastReply = session.moving ? 'Patient is loaded. Priya is driving to the nearest hospital; the provider is caring for the patient in the back.' : 'Patient on scene. Priya is available to assist; the captain is off scene.';
  session.messages = [{ role: 'user', content: 'We have assessed the patient and are continuing care.' },
    { role: 'assistant', content: lastReply + `\n[CREW_STATUS: partner=${session.crewStatus.partner} captain=not_on_scene]\n[PATIENT_FOCUS: patient_1 | Original patient]\n[VITALS: GCS=15 Pain=0]\n[TIME: 3:00]` }];
}
reset('cot_wont_load');
function state() {
  return { reply: lastReply, id: session.seed.catastrophe?.id || 'er_divert', minute: session.sceneMinute,
    loaded: session.hasLoaded, moving: session.moving, arrived: session.arrivedAtHospital, closed: session.closed,
    crew: session.crewStatus, incident: session.incident, events: session.seed.events.filter(e => e.event_type === 'complication') };
}
app.get('/preview/state', (_req, res) => res.json({ busy, ...state() }));
app.post('/preview/reset', (req, res) => {
  if (busy) return res.status(409).json({ error: 'A live response is running.' });
  if (![...CATASTROPHES.map(e => e.id), 'er_divert'].includes(req.body.id)) return res.sendStatus(400);
  reset(req.body.id); res.json(state());
});
app.post('/preview/step', (req, res) => {
  if (busy) return res.status(409).json({ error: 'A live response is running.' });
  const actions = {
    load: ['Load the patient into the ambulance.'], depart: ['Depart for the nearest hospital.'],
    report: ['Call a report to the receiving hospital: adult with nausea, alert and speaking normally; transporting for evaluation.', true],
    skip: ['Skip ahead to hospital while maintaining monitoring and existing care.', false, 'to_arrival'],
    reassess: ['Reassess breathing, pulse, mental status and pain; continue monitoring and supportive care.'],
    replace: ['Request a compatible replacement ambulance and replacement crew. Continue caring for all patients while waiting for them to arrive, then safely transfer the original patient.'],
    redirect: ['Call the major hospital with a report and redirect transport there.'],
  };
  const action = req.body.text ? [String(req.body.text).slice(0, 1500)] : actions[req.body.action];
  if (!action) return res.sendStatus(400);
  busy = true;
  res.json({ busy });
  session.send(...action).then(r => { lastReply = r.reply; })
    .catch(e => { lastReply = 'Live response failed: ' + e.message; })
    .finally(() => { busy = false; });
});
app.get('/catastrophe-preview', (_req, res) => res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rare failures — live simulator preview</title><link rel="stylesheet" href="/style.css"><style>
body{display:block;height:auto;min-height:100vh;margin:0;background:#101923;color:#e1eaf0;font:16px/1.5 system-ui}main{max-width:1000px;margin:auto;padding:24px}h1{font-size:27px;margin-bottom:8px}p{color:#c2ced8}button,select,input{font:inherit;padding:10px;border:1px solid #577588;border-radius:6px;background:#1c3443;color:#eff7ff;margin:4px}button{cursor:pointer}button:disabled{opacity:.4}.panel{padding:18px;background:#182a38;border:1px solid #304d61;border-radius:9px;margin:18px 0}#reply{white-space:pre-wrap;min-height:150px;font:17px/1.7 system-ui}#phase{font-weight:700;color:#f3d588}#status{color:#a3ddb6}.crew-status-badge{display:inline-block;padding:6px 12px;font:14px system-ui}input{width:min(68%,650px)}pre{white-space:pre-wrap}label{display:block}</style></head><body><main>
<h1>Rare failures</h1><p>Live model through the simulator engine · isolated synthetic cases<br>Hard: <strong>1%</strong> · Black Cloud: <strong>10%</strong> · At most one catastrophic incident per call.</p>
<label for="event">Preview event</label><select id="event">${CATASTROPHES.map(e => `<option value="${e.id}" ${e.id === 'cot_wont_load' ? 'selected' : ''}>${e.title}</option>`).join('')}<option value="er_divert">Routine ER diversion</option></select><button id="reset">Reset scene</button>
<div class="panel"><div id="phase"></div><span id="partner" class="crew-status-badge"></span> <span id="captain" class="crew-status-badge"></span><div id="incident"></div></div>
<nav><button data-action="load">Load patient</button><button data-action="depart">Depart</button><button data-action="report">Call hospital report</button><button data-action="skip">Skip toward hospital</button><button data-action="reassess">Reassess and continue care</button><button data-action="replace">Request replacement resources</button><button data-action="redirect">Redirect to major hospital</button></nav>
<form id="order-form"><input id="order" aria-label="Provider order" placeholder="Or enter a provider order"><button>Send order</button></form><p id="status">Ready.</p><div id="reply" class="panel"></div><details><summary>Engine state and incident log</summary><pre id="state"></pre></details>
<script>
function render(d){document.querySelector('#phase').textContent='T+'+d.minute.toFixed(1)+' · '+(d.arrived?'At hospital · handoff available':d.incident?.bedAvailableMinute?'At hospital · crew retains care':d.moving?'Transport underway':d.loaded?'Loaded · parked':'On scene');for(const role of ['partner','captain']){const el=document.querySelector('#'+role),v=d.crew[role];el.textContent=role.toUpperCase()+': '+v.replaceAll('_',' ').toUpperCase();el.className='crew-status-badge crew-status-'+v.replaceAll('_','-');}document.querySelector('#incident').textContent=d.incident?(d.incident.resolved?'Response complete':'Incident active')+(d.incident.bedAvailableMinute?' · Bed unavailable until T+'+d.incident.bedAvailableMinute:''):'Incident has not fired';document.querySelector('#reply').textContent=d.reply;document.querySelector('#state').textContent=JSON.stringify(d,null,2);document.querySelectorAll('button,select,input').forEach(e=>e.disabled=!!d.busy);document.querySelector('#status').textContent=d.busy?'Generating live scene response…':'Ready.';}
async function poll(){const d=await(await fetch('/preview/state')).json();render(d);if(d.busy)setTimeout(poll,1000);}
async function step(body){document.querySelectorAll('button,select,input').forEach(e=>e.disabled=true);await fetch('/preview/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});poll();}
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>step({action:b.dataset.action}));document.querySelector('#reset').onclick=async()=>render(await(await fetch('/preview/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:document.querySelector('#event').value})})).json());document.querySelector('#order-form').onsubmit=e=>{e.preventDefault();step({text:document.querySelector('#order').value});};poll();
</script></main></body></html>`));
const port = Number(process.env.PORT || 3139);
app.listen(port, '127.0.0.1', () => console.log(`Catastrophe preview: http://127.0.0.1:${port}/catastrophe-preview`));
