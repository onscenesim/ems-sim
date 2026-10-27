'use strict';

// Real Session/model checks with temporary data. Only the explicitly labeled
// collapse check stages a timeline; other checks start with live dispatch.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.EMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-inhalant-withdrawal-'));
require('dotenv').config({ quiet: true });
const express = require('express');
const { catalog, prepareInstructor } = require('../src/engine/instructor');
const { rollScenario } = require('../src/engine/roller');
const { Session } = require('../src/engine/session');
const app = express();
app.use(express.json());
const checks = {
  inhalant: { title: 'Intentional inhalant poisoning', id: 'intentional_inhalant',
    action: 'We approach calmly only once access is safe and keep the patient away from further fumes without unnecessary exertion. Assess responsiveness, airway, breathing, carotid/radial pulses, glucose and vitals; apply our ECG monitor and ask the friend what happened and what product was involved. Check the can label only if safe. Ask about co-ingestions and intent without assuming a suicide attempt. Request poison-control guidance and urgent transport. What do we find?' },
  collapse: { title: 'Inhalant poisoning — staged collapse checkpoint', id: 'intentional_inhalant', staged: true,
    action: 'The patient just slumped further. Check responsiveness, breathing and a carotid pulse immediately, and look at the already-connected monitor. What do we find?' },
  delirium: { title: 'Severe alcohol withdrawal / DTs — BLS', prefix: 'Alcohol withdrawal delirium', level: 'BLS',
    action: 'Assess ABCs, mental status, glucose, manual pulse, blood pressure, temperature if available and other causes including injury or infection. Ask family about daily drinking, last drink or reduction and previous withdrawal seizures. Request ALS assistance, support airway as needed within BLS scope, reduce stimulation and arrange prompt transport. We have no IV/IM sedatives on this unit. What do the exam and history reveal?' },
  seizure: { title: 'Alcohol withdrawal seizure — ALS', prefix: 'Acute alcohol withdrawal seizure followed',
    action: 'Protect the patient from injury, assess airway and breathing, check glucose, and give midazolam 5 mg IM under our adult active-seizure protocol. Monitor ventilation and circulation after the dose, request additional resources and arrange urgent transport. Ask the family about last alcohol use, prior withdrawal seizures, trauma and other substances. What happens during this action window?' },
  early: { title: 'Early alcohol withdrawal — independent assessment', prefix: 'Alcohol withdrawal — early stage',
    action: 'Assess ABCs, mentation, glucose and vital signs. Ask about usual intake, last drink or recent reduction, previous withdrawal seizures or delirium, medications and other causes of tremor. Obtain medical-control guidance for treatment and transport within scope. What do we find?' },
};
const jobs = new Map();

app.get('/inhalant-withdrawal-preview', (_req, res) => res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Inhalant poisoning and alcohol withdrawal</title><style>body{margin:24px auto;padding:0 20px;max-width:1050px;background:#111e29;color:#e7edf3;font:17px/1.6 system-ui}h1{font-size:28px}p{color:#bfd0df}button{font:inherit;background:#285340;color:white;padding:11px 15px;border:1px solid #7ba28c;border-radius:6px;margin:6px 8px 6px 0;cursor:pointer}button:disabled{opacity:.5}.card{padding:18px;border:1px solid #526e81;background:#1b3040;border-radius:8px;margin:18px 0}.card h2{font-size:21px;margin-top:0}pre{white-space:pre-wrap;font:16px/1.65 system-ui}summary{cursor:pointer;color:#add5f4}#status{color:#a1e6bb}</style></head><body><h1>Inhalant poisoning & alcohol withdrawal</h1><p>One new intentional spray-paint inhalant case; the existing alcohol withdrawal cases remain separate from intoxication. Live checks use the real simulator. The collapse check stages known worsening at T+10; all others start with live dispatch. All runs use temporary data.</p><nav>${Object.entries(checks).map(([id,c])=>`<button data-check="${id}">${c.title}</button>`).join('')}</nav><p id="status">Choose a live check.</p><main id="results"></main><script>
const make=(tag,value)=>{const e=document.createElement(tag);e.textContent=value;return e;};
document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{b.disabled=true;const card=make('article','');card.className='card';card.append(make('h2',b.textContent));const reply=make('pre','Generating live reply…');card.append(reply);document.querySelector('#results').prepend(card);document.querySelector('#status').textContent='Generating live scene…';try{const d=await(await fetch('/inhalant-withdrawal-preview/run/'+b.dataset.check,{method:'POST'})).json();async function poll(){const r=await(await fetch('/inhalant-withdrawal-preview/result/'+d.id)).json();if(r.state==='running'){setTimeout(poll,1000);return;}reply.textContent=r.error||r.reply;const details=document.createElement('details');details.append(make('summary','Starting state, provider action and engine rolls'),make('pre',[r.start,r.action,JSON.stringify({rolls:r.rolls,measurements:r.measurements},null,2)].join(String.fromCharCode(10,10))));card.append(details);b.disabled=false;document.querySelector('#status').textContent=r.state==='complete'?'Live response received.':'Live check failed.';}poll();}catch(e){reply.textContent=e.message;b.disabled=false;}});
</script></body></html>`));

app.post('/inhalant-withdrawal-preview/run/:check', (req, res) => {
  const check = checks[req.params.check];
  if (!check) return res.status(404).end();
  const id = `${req.params.check}-${Date.now()}`;
  jobs.set(id, { state: 'running' });
  res.json({ id });
  (async () => {
    const entry = catalog().find(e => check.id ? e.chemical_exposure?.id === check.id : e.presentation?.startsWith(check.prefix));
    const seed = rollScenario({ provider_level: check.level || 'ALS', difficulty: 'HARD', partner_name: check.level === 'BLS' ? 'Walt Garside' : 'Quinn Abernathy',
      random_seed: `inhalant-withdrawal-${req.params.check}`,
      instructor: prepareInstructor({ case_id: entry.case_id, seed: { complication_type: 'none', backup_present_on_arrival: false, comorbidity_bundle: 'otherwise_healthy' } }),
    });
    const session = new Session(seed);
    let start;
    if (check.staged) {
      session.sceneMinute = 10;
      start = 'STAGED AT T+10: A friend confirmed intentional spray-paint inhalation. The patient was removed to safe air, but remains obtunded with shallow irregular breaths and frequent ventricular ectopy on the attached monitor. No oxygen, ventilation assistance or other treatment has been performed. No toxin or electrolyte assay is available. The friend has just reported the patient slumping further; current pulse status has not yet been checked.';
      session.messages = [{ role: 'user', content: 'We are in the safe care area.' }, { role: 'assistant', content: `${start}\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[PATIENT_FOCUS: patient_1 | Primary patient]\n[VITALS: GCS=8 Pain=0 HR=140 Rhythm=sinus_tach Ectopy=PVC]\n[TIME: 10:00]` }];
    } else start = (await session.send('begin')).reply;
    const result = await session.send(check.action);
    const record = { state: 'complete', start, action: check.action, reply: result.reply, rolls: result.rolls.map(r=>({ procedure:r.procedure_id, outcome:r.outcome, drug:r.matched_drug })), measurements: Object.fromEntries(Object.entries(result.vitals || {}).filter(([key])=>['HR','Rhythm','Ectopy','RR','BP','SpO2','Glucose','GCS'].includes(key))) };
    jobs.set(id, record);
    fs.writeFileSync(path.join(process.env.EMS_DATA_DIR, `${id}.json`), JSON.stringify({ seed, ...record },null,2));
  })().catch(error => jobs.set(id, { state: 'failed', error: error.message }));
});
app.get('/inhalant-withdrawal-preview/result/:id', (req,res)=>res.json(jobs.get(req.params.id)||{ state:'missing' }));
app.listen(Number(process.env.PREVIEW_PORT || 3134), '127.0.0.1', ()=>console.log('Inhalant / withdrawal preview: http://127.0.0.1:3134/inhalant-withdrawal-preview'));
