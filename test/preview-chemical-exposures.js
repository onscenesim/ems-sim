'use strict';

// Live-model preview in isolated temporary storage. Care checks stage arrival
// in a safe care area; dispatch checks use an unstaged real Session opening.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.EMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-chemicals-preview-'));
require('dotenv').config({ quiet: true });
const express = require('express');
const { catalog, prepareInstructor } = require('../src/engine/instructor');
const { rollScenario } = require('../src/engine/roller');
const { Session } = require('../src/engine/session');
const entries = catalog().filter(e => e.chemical_exposure);
const app = express();
app.use(express.json());
let job = { state: 'idle', results: [], pending: 0 };

function careAction(entry) {
  const { id, route } = entry.chemical_exposure;
  if (route === 'ocular') return 'Begin copious gentle eye irrigation with available clean water now, holding the lids open and protecting the other eye from runoff. Remove easily removable contact lenses while irrigating. Brush loose dry powder off the surrounding face/clothing if present without rubbing the eye. While flushing continues, ask about the product and other routes of contact, inspect the label, and assess gross vision and the eye as feasible without delaying irrigation. Ask the partner about any agent-specific precautions. We have no pH paper available and will not invent a pH value or put any chemical neutralizer or skin gel in the eye. Contact poison control/medical direction for further care and urgent eye evaluation.';
  if (id === 'lead_worker' || id === 'lead_child') return 'Assess airway, breathing, circulation, neurologic status, glucose, focused history and vital signs. Ask about the job or home renovation, duration, household contacts and possible ingestion without assuming the cause. What do the assessment and history reveal? Arrange poison-center/medical-control consultation and appropriate hospital evaluation; no field lead level or chelation is available.';
  if (route === 'dermal') return 'With appropriate protection, remove the contaminated clothing, boots and jewelry as needed. Begin copious skin irrigation with safe runoff and protect the patient from cold; use mild soap if appropriate for the identified solvent. Check the label, exposure duration, skin findings, other routes of exposure and vital signs. Consult poison control; do not neutralize with another chemical. What do we find after starting care?';
  if (route === 'inhalation') return 'Keep all crew and the patient in this established safe area, request hazardous-materials assistance for the source, and do not re-enter or carry an open container into the rig. Assess ABCs, respiratory effort, lung sounds, mentation, vital signs and obtain ECG when available. Ask what products were used, whether anything was mixed or heated, and who else was exposed. Consult poison control. What do the history and assessments reveal?';
  return 'Assess airway, breathing, circulation, mental status, glucose and vital signs, and obtain ECG when equipment allows. Ask exactly what product, how much, when, and what happened afterward; inspect safely available label information. Ask about cough, choking, swallowing difficulty and vision changes. Consult poison control/medical direction and arrange timely transport. Do not induce vomiting. Do not give anything by mouth. Do not administer activated charcoal. What do the assessment and history reveal?';
}

async function run(entry, mode) {
  const seed = rollScenario({ difficulty: 'NORMAL', provider_level: 'ALS', partner_name: 'Quinn Abernathy',
    random_seed: `chemical-preview-${entry.chemical_exposure.id}`,
    instructor: prepareInstructor({ case_id: entry.case_id, seed: { complication_type: 'none', backup_present_on_arrival: false, comorbidity_bundle: 'otherwise_healthy' } }),
  });
  const session = new Session(seed);
  const prior = `STAGED ARRIVAL: ${entry.presentation}. The crew and patient are in a safe care area; for inhalation incidents, protected rescue has already extracted the patient and the source is not declared safe. No treatment, monitoring, product identification or detailed assessment has yet occurred. Available product information can be elicited without re-entering the hazard. No pH paper or toxin assay is available.`;
  const action = mode === 'dispatch' ? 'begin' : careAction(entry);
  if (mode !== 'dispatch') {
    session.messages = [{ role: 'user', content: 'We arrive at the safe care area.' }, { role: 'assistant', content: `${prior}\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[PATIENT_FOCUS: patient_1 | Primary patient]\n[VITALS: GCS=${/drowsy|sleepy|confusion/.test(entry.presentation) ? 14 : 15} Pain=4]\n[TIME: 0:00]` }];
  }
  const result = await session.send(action);
  const record = { id: entry.chemical_exposure.id, mode, title: entry.presentation,
    prior: mode === 'dispatch' ? 'Unstaged dispatch from the current case.' : prior,
    action, reply: result.reply, rolls: result.rolls.map(r => ({ procedure: r.procedure_id, outcome: r.outcome })) };
  fs.writeFileSync(path.join(process.env.EMS_DATA_DIR, `${record.id}-${mode}.json`), JSON.stringify({ seed, ...record }, null, 2));
  return record;
}

app.get('/chemical-preview', (_req, res) => res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Chemical exposure calls — live preview</title><style>
body{margin:26px auto;padding:0 24px;max-width:1100px;background:#111e29;color:#e7edf3;font:17px system-ui;line-height:1.55}h1{font-size:28px}p{color:#c5d3df}select{width:100%;padding:12px;font:inherit;background:#203444;color:#fff;border:1px solid #7892a7;border-radius:6px}button{font:inherit;padding:11px 16px;background:#285340;color:white;border:1px solid #7ca18c;border-radius:6px;margin:12px 10px 8px 0;cursor:pointer}button:disabled{opacity:.5}.card{margin:20px 0;border:1px solid #536c7e;border-radius:8px;background:#192d3d;padding:18px}.card h2{font-size:20px;margin-top:0}pre{white-space:pre-wrap;font:16px/1.65 system-ui}summary{cursor:pointer;color:#add5f4}#status{color:#9ee2b9}a{color:#add5f4}</style></head><body>
<h1>27 new chemical exposure calls</h1><p>12 eye exposures, cleaner fumes, skin contamination, fuel ingestion, solvents, methanol and heavy metals. Live replies use the real simulator and current case instructions. Care checks stage a safe arrival after protected rescue when required; dispatch checks start normally. Procedure outcomes use the engine's dice.</p>
<label for="case">Choose a call</label><select id="case">${entries.map(e => `<option value="${e.chemical_exposure.id}">${e.presentation.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</option>`).join('')}</select>
<button id="dispatch">Show selected dispatch</button><button id="care">Assess and give initial care</button><button id="all">Check all 27 care scenes</button><p id="status">No live check has run yet.</p><main id="results"></main>
<script>
const safe=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
async function poll(){const d=await(await fetch('/chemical-preview/result')).json();document.querySelector('#status').textContent=d.state==='running'?'Live checks: '+d.results.length+' complete, '+d.pending+' pending.':d.state==='idle'?'No live check has run yet.':'Live checks complete: '+d.results.length+' scenes.';document.querySelectorAll('button').forEach(b=>b.disabled=d.state==='running');const parent=document.querySelector('#results');for(const r of d.results){if(document.getElementById('result-'+r.id+'-'+r.mode))continue;const card=document.createElement('article');card.className='card';card.id='result-'+r.id+'-'+r.mode;card.append(safe('h2',r.title));if(r.error){card.append(safe('pre',r.error));}else{const details=document.createElement('details');details.append(safe('summary','Starting state and provider action'),safe('pre',[r.prior,r.action].join(String.fromCharCode(10,10))));card.append(details,safe('pre',r.reply),safe('p','Engine rolls: '+(r.rolls.map(x=>x.procedure+' '+x.outcome).join(', ')||'No rolled procedure')));}parent.append(card);}if(d.state==='running')setTimeout(poll,1000);}
async function start(mode){document.querySelectorAll('button').forEach(b=>b.disabled=true);const r=await fetch('/chemical-preview/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:document.querySelector('#case').value,mode})});if(!r.ok){document.querySelector('#status').textContent='Unable to start check.';return;}document.querySelector('#results').replaceChildren();poll();}
document.querySelector('#dispatch').onclick=()=>start('dispatch');document.querySelector('#care').onclick=()=>start('care');document.querySelector('#all').onclick=()=>start('all');poll();</script></body></html>`));

app.post('/chemical-preview/run', (req, res) => {
  if (job.state === 'running') return res.status(409).end();
  const entry = entries.find(e => e.chemical_exposure.id === req.body.id);
  if (!entry || !['all', 'care', 'dispatch'].includes(req.body.mode)) return res.status(400).end();
  const selected = req.body.mode === 'all' ? entries : [entry];
  job = { state: 'running', results: [], pending: selected.length };
  res.json({ state: 'running' });
  const queue = selected.slice();
  const worker = async () => {
    while (queue.length) {
      const next = queue.shift();
      try { job.results.push(await run(next, req.body.mode === 'dispatch' ? 'dispatch' : 'care')); }
      catch (error) { job.results.push({ id: next.chemical_exposure.id, mode: req.body.mode, title: next.presentation, error: error.message }); }
      job.pending--;
    }
  };
  Promise.all([worker(), worker(), worker()]).finally(() => { job.state = 'complete'; });
});
app.get('/chemical-preview/result', (_req, res) => res.json(job));
require('./preview-presentation-groups').mountDrawPreview(app);
app.listen(Number(process.env.PREVIEW_PORT || 3133), '127.0.0.1', () => console.log('Chemical preview: http://127.0.0.1:3133/chemical-preview'));
