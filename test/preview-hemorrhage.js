'use strict';

// Local-only live model checks using the real catalog and Session engine.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.EMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-hemorrhage-preview-'));
require('dotenv').config({ quiet: true });
const express = require('express');
const { catalog, prepareInstructor } = require('../src/engine/instructor');
const { rollScenario } = require('../src/engine/roller');
const { Session } = require('../src/engine/session');
const app = express();
app.use(express.json());
const checks = {
  checkpoint: {title:'Controlled pressure checkpoint (staged)',prefix:'Scalp laceration after',staged:true,actions:[
    'Quinn, keep holding direct pressure on the scalp wound.',
    'Check whether the pressure dressing on the scalp wound is still dry.',
    'Load the patient and depart for the nearest hospital. Quinn drives our standard two-person ambulance; I remain in the back.',
    'I press a towel firmly into the scalp wound.',
    'I apply a pressure dressing to the scalp wound.',
    'Reassess the scalp wound and bleeding without changing the treatment.'
  ]},
  scalp: { title: 'Scalp bleeding', prefix: 'Scalp laceration after', actions: [
    'Confirm safe access. Explain the exam, expose the scalp through the matted hair, inspect for skull injury, assess airway, breathing, circulation, pupils, neurologic status and other injuries. My partner obtains manual pulse, BP and respiratory rate and asks about mechanism, medications and anticoagulants. What do we find?',
    'I press a towel firmly into the scalp wound.',
    'Keep holding direct pressure on the scalp wound.',
    'Check whether the pressure dressing on the scalp wound is still dry.'
  ] },
  genital: { title: 'Genital gunshot', prefix: 'Gunshot wound to the external genitalia', actions: [
    'Confirm with police that safe access and secured weapons are established. Explain necessary exposure, shield the patient from bystanders, and examine lower abdomen, groins, external genitalia, perineum and accessible buttocks for bleeding and additional wounds without probing. Assess ABCs while my partner obtains manual pulse, BP and respiratory rate. What do we find?',
    'Apply sustained direct pressure with sterile dressings to the accessible genital bleeding source. Protect exposed tissue, prevent heat loss and reassess bleeding and perfusion. Arrange rapid trauma-center transport and notify them of the genital/perineal gunshot and blood loss. What happens?'
  ] },
  axillary: { title: 'Two-patient knife fight', prefix: 'Knife fight with two injured adults', actions: [
    'Police confirm knives secured and both patients separated. Begin rapid primary assessments of both patients; my partner starts with the loudly intoxicated patient and checks airway, breathing, skin, manual pulse, BP, glucose and neurologic status while exposing and examining for injuries, including head, front, back and both axillae. I assess the quieter seated patient the same way, carefully lifting the arm to inspect the axilla and checking distal circulation, sensation and movement. Control any life-threatening bleeding immediately with pressure as it is found. What does each exam reveal and what is the second ambulance ETA?',
    'Pack the left armpit wound tightly with hemostatic gauze and hold pressure on that wound.',
    'Keep holding pressure on the left armpit wound.',
    'Check bleeding at the left armpit wound.',
    'Apply direct pressure to the second patient left forearm wound.'
  ] }
};
const jobs = new Map();
app.get('/hemorrhage-preview', (_req, res) => res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trauma hemorrhage scenarios</title><style>
body{margin:24px auto;padding:0 20px;max-width:1000px;background:#111e29;color:#e7edf3;font:16px/1.6 system-ui}h1{font-size:28px}h2{font-size:22px}h3{font-size:18px}button{font:inherit;background:#285340;color:white;padding:10px 14px;border:1px solid #7ba28c;border-radius:6px;margin:6px 8px 6px 0;cursor:pointer}button:disabled{opacity:.5}article{padding:20px;border:1px solid #526e81;background:#1b3040;border-radius:8px;margin:18px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:16px/1.65 system-ui}summary{cursor:pointer;color:#add5f4}#status{color:#a1e6bb}</style></head>
<body><h1>Trauma hemorrhage scenarios</h1><p>Persistent wound care: new attempts roll; continued care and examination preserve the recorded result. Live cases start with dispatch. The explicitly staged checkpoint starts after successful pressure control by the partner, then tests maintenance, assessment, driving, and new treatment. All responses use the real simulator with temporary data.</p><nav>${Object.entries(checks).map(([id,c])=>`<button data-check="${id}">${c.title}</button>`).join('')}</nav><p id="status">Choose a case to inspect its starting scene and response to care.</p><main id="results"></main><script>
const make=(tag,t)=>{const e=document.createElement(tag);e.textContent=t;return e;};
document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{b.disabled=true;const card=make('article','');card.append(make('h2',b.textContent));const output=make('div','Generating live dispatch…');card.append(output);document.querySelector('#results').prepend(card);try{const job=await(await fetch('/hemorrhage-preview/run/'+b.dataset.check,{method:'POST'})).json();async function poll(){const d=await(await fetch('/hemorrhage-preview/result/'+job.id)).json();output.replaceChildren();for(const t of d.turns||[]){output.append(make('h3',t.label));if(t.action){const details=document.createElement('details');details.append(make('summary','Provider action'),make('pre',t.action));output.append(details);}output.append(make('pre',t.reply));if(t.rolls)output.append(make('p','Dice: '+(t.rolls.filter(r=>!r.no_roll).map(r=>[r.procedure_id,r.target,r.roll+' vs '+r.dc,r.outcome].filter(Boolean).join(' · ')).join('; ')||'No new dice roll')));if(t.wounds?.length)output.append(make('pre',t.wounds.map(w=>w.site+': '+w.status+' · '+(w.method||'untreated')+' · holder '+(w.holder||'none')+' · attempts '+w.attempts).join(String.fromCharCode(10))));}document.querySelector('#status').textContent=d.state==='running'?'Generating live response…':d.error||'Live check complete.';if(d.state==='running'){setTimeout(poll,1000);return;}b.disabled=false;}poll();}catch(e){output.textContent=e.message;b.disabled=false;}});
</script></body></html>`));
app.post('/hemorrhage-preview/run/:check', (req,res) => {
  const check=checks[req.params.check];
  if (!check) return res.sendStatus(404);
  const id=`${req.params.check}-${Date.now()}`;
  const job={state:'running',turns:[]}; jobs.set(id,job); res.json({id});
  (async()=>{
    const entry=catalog().find(e=>e.presentation?.startsWith(check.prefix));
    const seed=rollScenario({ provider_level:'ALS',difficulty:entry.difficulty,random_seed:`hemorrhage-${req.params.check}`,partner_name:'Quinn Abernathy',
      instructor:prepareInstructor({case_id:entry.case_id,seed:{complication_type:'none',comorbidity_bundle:'otherwise_healthy'}}) });
    const session=new Session(seed);
    if(check.staged){
      session.sceneMinute=2;
      Object.assign(session.wounds[0],{discovered:true,status:'controlled_pressure',method:'pressure',holder:'partner',attempts:1});
      session.messages=[{role:'user',content:'Checkpoint setup.'},{role:'assistant',content:'STAGED CHECKPOINT: An examined scalp laceration without skull fracture is controlled while Quinn holds direct pressure. The patient is awake, pale and awaiting transport. No other crew are present.\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[PATIENT_FOCUS: patient_1 | Scalp injury]\n[VITALS: GCS=15 Pain=5]\n[TIME: 2:00]'}];
      job.turns.push({label:'Starting state — staged, not a live application roll',reply:session.messages[1].content,wounds:structuredClone(session.wounds)});
    }else{
      const opening=await session.send('begin');
      job.turns.push({label:'Starting scene',reply:opening.reply,wounds:structuredClone(session.wounds.filter(w=>w.discovered))});
    }
    for(const [i,action] of check.actions.entries()){
      const r=await session.send(action);
      job.turns.push({label:'Step '+(i+1),action,reply:r.reply,backup:r.backup,rolls:r.rolls,wounds:structuredClone(session.wounds.filter(w=>w.discovered)),events:session.turns.at(-1)?.woundEvents});
    }
    job.state='complete';
    fs.writeFileSync(path.join(process.env.EMS_DATA_DIR,`${id}.json`),JSON.stringify({seed,...job},null,2));
  })().catch(e=>{job.state='failed';job.error=e.message;});
});
app.get('/hemorrhage-preview/result/:id',(req,res)=>res.json(jobs.get(req.params.id)||{state:'missing'}));
app.listen(Number(process.env.PREVIEW_PORT||3134),'127.0.0.1',()=>console.log('Hemorrhage preview: http://127.0.0.1:3134/hemorrhage-preview'));
