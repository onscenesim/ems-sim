'use strict';

// Real Session/road/incident/persistence code with deliberately inconsistent
// synthetic drafts. No live AI requests and no production run data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
process.env.EMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-transport-preview-'));
let session, action, attempt = 0, corrections = 0;
require.cache[require.resolve('../src/engine/api')] = { exports: {
  sendTurn: async () => {
    attempt++;
    if (attempt > 1) corrections++;
    const network = roadNetwork(session.seed);
    const near = travelSeconds(network, session.transportPosition, 'nearest');
    const remaining = travelSeconds(network, session.transportPosition, session.transportDest);
    let text, minute = session.sceneMinute + .75;
    if (action === 'university') {
      minute = session.sceneMinute + remaining / 60;
      text = attempt === 1
        ? 'The ambulance reaches University Medical Center. The receiving team accepts the handoff. Handoff complete.'
        : 'University Medical Center is on diversion. The crew stays with the patient in the ambulance at the ED entrance. An alternate destination is needed.';
    } else if (action === 'eta') {
      text = `Hughes: "Lakeview is about ${attempt === 1 ? 'twelve' : Math.ceil(near / 60)} minutes away on these roads."`;
    } else if (action === 'reroute') {
      text = `Hughes shifts into drive. The ambulance rolls toward Lakeview.\nHughes: "Lakeview is ${Math.ceil(near / 60)} minutes away. We're rolling."`;
    } else if (action === 'five') {
      minute = session.sceneMinute + 5;
      text = 'Care and monitoring continue as the ambulance drives toward Lakeview.';
    } else if (action === 'arrival') {
      minute = session.sceneMinute + remaining / 60;
      text = 'The ambulance reaches Lakeview Community Hospital ambulance bay. The crew brings the stretcher to the receiving team and awaits bedside report.';
    } else if (action === 'handoff') {
      text = 'The receiving team accepts the handoff. Handoff complete. Medic 8 is clear.';
    } else throw Error('Unknown preview action');
    const seconds = Math.round(minute * 60);
    // Omit recovery/route tags and leave a stale parked crew footer deliberately.
    return `${text}\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[PATIENT_FOCUS: patient_1 | Preview patient]\n[VITALS: GCS=15]\n[TIME: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}]`;
  }, sendDebrief: async () => '',
} };
const express = require('express');
const { Session } = require('../src/engine/session');
const { rollScenario } = require('../src/engine/roller');
const { roadNetwork, origin, drive, travelSeconds } = require('../src/engine/transport');
const { restoreSession } = require('../src/server/sessionStore');
const app = express();
app.use(express.json());
let story = [], restored = false;
function reset(difficulty = 'BLACK_CLOUD') {
  const seed = rollScenario({ random_seed: 'transport-state-preview', difficulty, region_id: 'SUBURBAN', category: 'medical' });
  Object.assign(seed, { weather_id: 'snow', complication_type: 'er_divert', routine_er_divert: false,
    catastrophe: null, backup_present_on_arrival: false, crew_partner: 'Darnell Hughes', crew_transport_driver: 'Darnell Hughes' });
  session = new Session(seed);
  session.sceneMinute = 37.75;
  session.hasLoaded = true; session.moving = true; session.transportDest = 'major'; session.departSceneMinute = 14.75;
  session.transportPosition = drive(roadNetwork(seed), origin(), 'major', 23);
  session.crewStatus = { partner: 'driving', captain: 'not_on_scene', driver: null };
  const opening = 'Medic 8 is transporting toward University in snow. Darnell is driving; existing patient care continues.';
  session.messages = [{ role: 'user', content: 'Continue transport.' }, { role: 'assistant', content: `${opening}\n[CREW_STATUS: partner=driving captain=not_on_scene]\n[PATIENT_FOCUS: patient_1 | Preview patient]\n[VITALS: GCS=15]\n[TIME: 37:45]` }];
  session.turns = [{ user: 'Continue transport.', assistant: opening, sceneMinute: 37.75 }];
  story = [{ order: 'Starting state', reply: opening }]; corrections = 0; restored = false;
}
reset();
function state() {
  const network = roadNetwork(session.seed);
  const sec = Math.round(session.sceneMinute * 60);
  return { difficulty: session.seed.difficulty, clock: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`,
    transport: session.transportStatus(), incident: session.incident, arrived: session.arrivedAtHospital,
    moving: session.moving, closed: session.closed, corrections, restored, story,
    alternatives: ['nearest', 'major'].map(key => ({ name: session.seed.hospitals[key].name,
      seconds: travelSeconds(network, session.transportPosition, key) })),
    crew: session.crewStatus, position: session.transportPosition };
}
app.get('/preview/state', (_req, res) => res.json(state()));
app.post('/preview/reset', (req, res) => {
  const difficulty = req.body.difficulty;
  if (!['EASY', 'NORMAL', 'HARD', 'BLACK_CLOUD'].includes(difficulty)) return res.sendStatus(400);
  reset(difficulty); res.json(state());
});
app.post('/preview/action', async (req, res) => {
  try {
    action = req.body.action; attempt = 0;
    if (action === 'restore') {
      session = restoreSession({ ...structuredClone(session), id: randomUUID() });
      restored = true;
      story.push({ order: 'Restore saved run', reply: 'Location, route, remaining travel time and incident state restored.' });
    } else {
      const orders = { university: 'Continue current care and monitoring.', eta: 'How far away is Lakeview?',
        reroute: 'i meant to type lakeview disregard last turn', five: 'Continue monitoring for five minutes.',
        arrival: 'Continue monitoring until arrival.', handoff: 'Transfer care.' };
      if (!orders[action]) return res.sendStatus(400);
      const result = await session.send(orders[action], action === 'handoff');
      story.push({ order: orders[action], reply: result.reply });
    }
    res.json(state());
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/transport-preview', (_req, res) => res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Transport consistency preview</title><style>
*{box-sizing:border-box}body{margin:0;background:#101923;color:#e5edf3;font:16px/1.6 system-ui}main{max-width:980px;margin:auto;padding:28px}h1{font-size:29px;margin:0}p{color:#b6c9d6}button,select{font:inherit;padding:10px 14px;background:#233d4e;color:#f5f9fc;border:1px solid #587788;border-radius:6px;margin:4px;cursor:pointer}button:disabled{opacity:.38;cursor:default}.panel{padding:20px;border:1px solid #3c5868;background:#182a37;border-radius:9px;margin:18px 0}#phase{font-size:22px;color:#9ee4c3}#routes{display:grid;grid-template-columns:1fr 1fr;gap:20px}.time{font-size:26px;font-weight:650}article{border-top:1px solid #3c5868;padding:18px 0}article b{color:#edcf91}article div{white-space:pre-wrap}pre{font-size:13px;white-space:pre-wrap}#status{color:#edcf91}label{display:inline-block}@media(max-width:650px){#routes{grid-template-columns:1fr}main{padding:18px}}</style></head><body><main>
<h1>One location. One timeline.</h1><p>Replay the University → Lakeview diversion through the current simulator engine.<br>Synthetic narration deliberately includes bad drafts and missing tags to exercise recovery. No live AI calls.</p>
<label for="difficulty">Difficulty</label> <select id="difficulty"><option>EASY</option><option>NORMAL</option><option>HARD</option><option selected>BLACK_CLOUD</option></select><button id="reset">Restart replay</button>
<section class="panel"><div id="phase"></div><div id="incident"></div><div id="meta"></div></section>
<section id="routes" class="panel"></section>
<nav><button data-action="university">Reach University</button><button data-action="eta">Ask about Lakeview</button><button data-action="reroute">Divert to Lakeview</button><button data-action="five">Monitor five minutes</button><button data-action="restore">Restore saved run</button><button data-action="arrival">Continue to arrival</button><button data-action="handoff">Give handoff</button></nav>
<p id="status" role="status">Ready.</p><section id="story" class="panel" aria-label="Call timeline"></section><details><summary>Recorded transport state</summary><pre id="record"></pre></details>
<script>
const $=s=>document.querySelector(s);function duration(s){return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}function render(d){$('#phase').textContent='T+'+d.clock+' · '+(d.closed?'Call complete':d.transport.phase.replaceAll('_',' '));$('#incident').textContent=d.incident?(d.incident.resolved?'Diversion resolved · alternate route recorded':'University diversion active · crew retains care'):'No active diversion';$('#meta').textContent='Narration corrections: '+d.corrections+' · Saved run restored: '+(d.restored?'yes':'no');$('#routes').replaceChildren(...d.alternatives.map(r=>{const el=document.createElement('div');const name=document.createElement('div');name.textContent=r.name;const time=document.createElement('div');time.className='time';time.textContent=duration(r.seconds);el.append(name,time);return el}));$('#story').replaceChildren(...d.story.map(s=>{const a=document.createElement('article'),b=document.createElement('b'),p=document.createElement('div');b.textContent=s.order;p.textContent=s.reply;a.append(b,p);return a}));$('#record').textContent=JSON.stringify(d,null,2);document.querySelectorAll('[data-action]').forEach(b=>{const a=b.dataset.action;b.disabled=d.closed||(a==='university'&&!!d.incident)||(a==='reroute'&&(!d.incident||d.incident.resolved))||(['five','arrival'].includes(a)&&(!d.moving||!!d.incident&&!d.incident.resolved))||(a==='handoff'&&!d.arrived)});$('#status').textContent='Ready.';}
async function post(url,body){$('#status').textContent='Running replay step…';document.querySelectorAll('button').forEach(b=>b.disabled=true);try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);document.querySelectorAll('button').forEach(b=>b.disabled=false);render(d)}catch(e){$('#status').textContent=e.message;$('#reset').disabled=false}}
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>post('/preview/action',{action:b.dataset.action}));$('#reset').onclick=()=>post('/preview/reset',{difficulty:$('#difficulty').value});fetch('/preview/state').then(r=>r.json()).then(render);
</script></main></body></html>`));
const port = Number(process.env.PORT || 3143);
app.listen(port, '127.0.0.1', () => console.log(`Transport preview: http://127.0.0.1:${port}/transport-preview`));
