'use strict';

// Live model integration probes; isolated data, no production player state.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.EMS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'ems-nontrauma-live-'));
require('dotenv').config({quiet:true});
const express=require('express');
const {catalog,prepareInstructor}=require('../src/engine/instructor');
const {rollScenario}=require('../src/engine/roller');
const {Session}=require('../src/engine/session');
const {hasCardiacMonitor}=require('../src/engine/equipment');
const app=express();app.use(express.json());
const checks={
  chemical:{title:'Toxicology — chemical skin exposure and dressing',category:'toxicology',match:'^Mechanic has a solvent-soaked sleeve',actions:[
    'Confirm safe access and identify the product from its container or safety information. Assess ABCs and examine the exposed forearm skin, asking about duration and route of exposure. Protect the crew from contamination.',
    'Remove contaminated clothing and irrigate the affected skin with water according to our decontamination protocol. Contact poison control for product-specific guidance.',
    'Apply a clean sterile dressing to the chemical burn after decontamination, without pressure. Reassess skin findings and vital signs and arrange transport.'
  ]},
  cardiac:{title:'Cardiac — ACS and chest pressure',category:'cardiac',match:'^Anteroseptal STEMI',actions:[
    'Assess airway, breathing, circulation and skin. My partner obtains manual blood pressure, pulse, respiratory rate and pulse oximetry. Ask about chest pressure, onset, medications and allergies. Apply our cardiac monitor and obtain a 12-lead ECG.',
    'Obtain a right-sided ECG. Ask about the chest pressure and reassess blood pressure while preparing transport to the PCI-capable center.'
  ]},
  respiratory:{title:'Respiratory — COPD and CPAP pressure',category:'respiratory',match:'^COPD exacerbation — no clear',actions:[
    'Assess airway, breathing, circulation, lung sounds, work of breathing and mental status. Get manual blood pressure, pulse, respiratory rate and pulse oximetry, and ask about usual respiratory treatment.',
    'Apply CPAP at 10 pressure under our protocol after checking the observed findings for contraindications. Reassess mask seal, respiratory effort, blood pressure and oxygen saturation.'
  ]},
  stroke:{title:'Neuro — stroke assessment',category:'neuro',match:'^Anterior ischemic stroke — MCA territory, classic',actions:[
    'Assess airway, breathing and circulation. Perform a focused stroke exam, check glucose and manual blood pressure, and ask witnesses for the exact last-known-well time and baseline function.',
    'Reassess neurologic status and blood pressure. Explain the concern and arrange prompt transport to the appropriate stroke center with early notification.'
  ]},
  glucose:{title:'Medical — BLS hypoglycemia',category:'medical',match:'^Hypoglycemia — mild to moderate',level:'BLS',actions:[
    'Assess ABCs, mental status, ability to swallow and glucose. Obtain manual pulse, blood pressure and respiratory rate. Ask about diabetes medications, last meal and symptom onset.',
    'Give oral glucose according to our BLS protocol after confirming the patient can swallow safely. Reassess mentation and recheck glucose after the appropriate interval.'
  ]},
  fistula:{title:'Medical — fistula hemorrhage and routine measurements',category:'medical',match:'^Hemodialysis patient with arteriovenous fistula hemorrhage',wound:true,actions:[
    'Assess ABCs, skin and mental status. Expose the dialysis access to identify the exact bleeding source and its location; obtain manual pulse and blood pressure on the other arm. Ask staff what happened and what pressure or dressings have already been used.',
    'Apply direct pressure with sterile gauze to the identified bleeding fistula puncture. Reassess bleeding and distal circulation; arrange prompt transport.',
    'Check manual blood pressure on the other arm and maintain current oxygen delivery. Continue existing wound care without changing treatment.'
  ]},
  epistaxis:{title:'Medical — epistaxis uses its own procedure',category:'medical',match:'^Severe posterior epistaxis',actions:[
    'Assess airway, breathing, circulation and blood loss. Sit the patient forward as tolerated, have suction ready, obtain manual pulse and blood pressure, and inspect the nose and mouth without probing.',
    'Pack the nose with gauze according to our local epistaxis protocol. Reassess airway contamination, ongoing bleeding and perfusion; arrange prompt transport.'
  ]},
  opioid:{title:'Toxicology — BLS opioid overdose',category:'toxicology',match:'(?:Heroin|Opioid|Fentanyl) overdose',level:'BLS',actions:[
    'Confirm scene safety. Assess responsiveness, breathing and a carotid pulse. Check glucose and manually assess vital signs. Support inadequate breathing with an appropriately sized BVM and oxygen.',
    'Give naloxone 2 mg intranasally under our adult protocol. Continue assisted ventilation as needed and reassess breathing, pulse and mentation. Arrange transport.'
  ]},
  behavioral:{title:'Behavioral — panic and reassurance',category:'behavioral',match:'^Panic attack — first episode',actions:[
    'Introduce ourselves calmly, assess ABCs and mental status, obtain manual vital signs and glucose, and ask about onset, substances and other symptoms. Let the patient describe their chest pressure without assuming a psychiatric cause.',
    'Speak calmly, offer a dry towel for comfort, reassess symptoms and vital signs, and discuss transport without coercion.'
  ]},
  pediatric:{title:'Pediatric — seizure and towel padding',category:'pediatric',match:'^Simple febrile seizure',actions:[
    'Assess airway, breathing, circulation, responsiveness, glucose and temperature. Ask the caregiver about seizure duration, recovery, fever, medications and possible ingestion.',
    'Place a folded towel beside the head as protective padding without restraining the child. Reassess breathing and responsiveness and prepare transport with the caregiver.'
  ]},
  postpartum:{title:'OB — uterine hemorrhage is not a packable wound',category:'ob',match:'^Postpartum hemorrhage —',actions:[
    'Assess maternal ABCs, perfusion, manual vital signs, blood loss and uterine tone. Ask when delivery occurred and whether the placenta has delivered. Confirm the newborn is safe and assessed separately.',
    'Perform fundal massage to address the boggy uterus under our obstetric protocol. Reassess uterine tone, vaginal bleeding and maternal perfusion, prevent heat loss and arrange urgent obstetric transport.'
  ]},
  newborn:{title:'OB — neonatal resuscitation and towel wrapping',category:'ob',match:'^Newborn requiring resuscitation after',actions:[
    'Assess both patients. Focus on the newborn: assess breathing, tone and heart rate while my partner checks maternal ABCs, uterine tone and bleeding. Use separate patient records.',
    'Dry and stimulate the newborn and wrap the newborn in a dry towel. Provide positive pressure ventilation with an appropriately sized neonatal BVM under our protocol and reassess heart rate and ventilation. My partner continues monitoring the mother.'
  ]},
  arrest:{title:'Arrest — CPR, shock and pulse checkpoint',category:'arrest',match:'^Anterior STEMI progressing to cardiac arrest',actions:[
    'Confirm unresponsiveness, absent normal breathing and no carotid pulse. Start CPR, request backup and place the cardiac monitor and defibrillator pads while my partner prepares BVM ventilation with oxygen.',
    'Check the rhythm and defibrillate at 200 joules under our adult protocol for the displayed shockable rhythm, with visual and verbal clearance. Resume CPR immediately.',
    'Pulse check and rhythm check.'
  ]},
  doa:{title:'DOA — assessment and family communication',category:'doa',match:'^Found in bed — apparent cardiac death',actions:[
    'Assess the scene and patient directly for responsiveness, breathing, pulse and objective signs of irreversible death, following our local protocol. Ask family when the patient was last known alive.',
    'Explain the observed findings compassionately to the family, offer a blanket for dignity and a dry towel to a tearful relative, and arrange the appropriate notifications according to protocol.'
  ]},
  curveball:{title:'Curveball — apparent stroke with medical mimic',category:'curveballs',match:'',diagnosis:'hypoglyc',actions:[
    'Assess ABCs, glucose, manual blood pressure and a focused stroke exam. Ask about exact onset, last known well, baseline neurologic function and diabetes medications.',
    'Recheck glucose and neurologic findings. Continue indicated care within scope and arrange transport based on the findings actually obtained.'
  ]},
};
const jobs=new Map(),queue=[];let running=0;
function enqueue(key){
  const id=key+'-'+Date.now(),job={id,key,title:checks[key].title,state:'queued',turns:[],alerts:[]};
  jobs.set(id,job);queue.push(job);drain();return id;
}
function drain(){while(running<3&&queue.length){const job=queue.shift();running++;run(job).catch(e=>{job.state='failed';job.error=e.message;}).finally(()=>{running--;fs.writeFileSync(path.join(process.env.EMS_DATA_DIR,job.id+'.json'),JSON.stringify(job,null,2));drain();});}}
async function run(job){
  job.state='running';const c=checks[job.key];
  const entry=catalog().find(e=>e.category===c.category && (c.diagnosis?new RegExp(c.diagnosis,'i').test(e.true_diagnosis||''):new RegExp(c.match,'i').test(e.presentation||'')));
  if(!entry)throw new Error('No matching catalog case: '+job.key);
  const seed=rollScenario({provider_level:c.level||'ALS',difficulty:'NORMAL',random_seed:'nontrauma-live-'+job.key,partner_name:'Quinn Abernathy',
    instructor:prepareInstructor({case_id:entry.case_id,seed:{complication_type:'none',comorbidity_bundle:'otherwise_healthy',backup_present_on_arrival:false}})});
  job.case_id=seed.case_id;job.category=seed.category;job.level=seed.provider_level;
  const session=new Session(seed);
  async function step(action,label){
    const r=await session.send(action);
    const wounds=structuredClone(session.wounds.filter(w=>w.discovered));
    job.turns.push({label,action,reply:r.reply,rolls:r.rolls,wounds,vitals:r.vitals,minute:session.sceneMinute,patient:session.patientFocus});
    if(!c.wound&&(wounds.length||r.rolls.some(r=>r.procedure_id==='bleeding_control'||r.hemorrhage_managed)))job.alerts.push(label+': unexpected external wound/hemorrhage roll');
    if(label==='Action 1' && r.rolls.some(r=>r.procedure_id==='medication_push'))job.alerts.push(label+': assessment generated medication administration');
    if(c.level==='BLS'&&!hasCardiacMonitor(seed,r.backup)&&['Rhythm','Ectopy','ETCO2'].some(k=>r.vitals?.[k]!=null))job.alerts.push(label+': ALS-only readings on unequipped BLS unit');
    if(/Ask which revealed wound|could not be safely interpreted/i.test(r.reply))job.alerts.push(label+': spurious wound clarification');
  }
  await step('begin','Starting scene');
  for(const [i,action]of c.actions.entries())await step(action,'Action '+(i+1));
  job.state='complete';
}
app.post('/nontrauma-preview/run-all',(_req,res)=>res.json({ids:Object.keys(checks).map(enqueue)}));
app.post('/nontrauma-preview/run/:key',(req,res)=>checks[req.params.key]?res.json({ids:[enqueue(req.params.key)]}):res.sendStatus(404));
app.get('/nontrauma-preview/results',(_req,res)=>res.json([...jobs.values()]));
app.get('/nontrauma-preview',(_req,res)=>res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Non-trauma regression probes</title><style>
body{margin:24px auto;max-width:1100px;padding:0 22px;background:#111e29;color:#e7edf3;font:16px/1.6 system-ui}h1{font-size:27px}h2{font-size:21px}h3{font-size:18px}button{font:inherit;background:#285340;color:white;padding:9px 13px;border:1px solid #7ba28c;border-radius:6px;margin:5px;cursor:pointer}article{padding:18px;border:1px solid #526e81;background:#1b3040;border-radius:8px;margin:16px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.65 system-ui}summary{cursor:pointer;color:#add5f4}.alert{color:#ffbc93}.state{color:#a4e9c0}#summary{position:sticky;top:0;padding:12px;background:#152b37;z-index:2}nav{display:flex;flex-wrap:wrap}details{margin-top:12px}</style></head><body><h1>Non-trauma regression probes</h1><p>15 real catalog calls through the live Session engine. Three run concurrently, with isolated temporary data. Checks focus on unintended hemorrhage rolls, wound enrollment, normal procedures and patient separation. Alerts are mechanical checks; clinical narration is reviewed separately.</p><button id="all">Run all 15 live checks</button><nav>${Object.entries(checks).map(([key,c])=>`<button data-key="${key}">${c.title}</button>`).join('')}</nav><p id="summary">No probes started.</p><main id="results"></main><script>
const make=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};const seen=new Map();let polling=false;
async function refresh(){const jobs=await(await fetch('/nontrauma-preview/results')).json();let completed=0,failed=0,alerts=0;
for(const j of jobs){completed+=j.state==='complete';failed+=j.state==='failed';alerts+=j.alerts.length;let card=seen.get(j.id);if(!card){card=make('article','');seen.set(j.id,card);document.querySelector('#results').append(card);}card.replaceChildren(make('h2',j.title),make('p',j.state.toUpperCase()+(j.level?' · '+j.level+' · '+j.category:'')));if(j.error)card.append(make('p',j.error));if(j.alerts.length){const a=make('p',j.alerts.join('; '));a.className='alert';card.append(a);}for(const t of j.turns){const details=document.createElement('details');const sum=make('summary',t.label+' · '+t.minute+' min · '+(t.rolls.filter(r=>!r.no_roll).map(r=>r.procedure_id).join(', ')||'No dice skill'));details.append(sum,make('pre',t.action),make('pre',t.reply),make('pre',JSON.stringify({rolls:t.rolls.map(r=>({procedure:r.procedure_id,target:r.target,outcome:r.outcome,dc:r.dc})),wounds:t.wounds,patient:t.patient},null,2)));card.append(details);}}
document.querySelector('#summary').textContent=jobs.length?completed+'/'+jobs.length+' complete · '+failed+' failed · '+alerts+' mechanical alerts':'No probes started.';if(jobs.some(j=>['queued','running'].includes(j.state))){setTimeout(refresh,2000);}else polling=false;}
async function start(url){await fetch(url,{method:'POST'});if(!polling){polling=true;refresh();}}
document.querySelector('#all').onclick=()=>start('/nontrauma-preview/run-all');document.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>start('/nontrauma-preview/run/'+b.dataset.key));refresh();
</script></body></html>`));
app.listen(Number(process.env.PREVIEW_PORT||3135),'127.0.0.1',()=>console.log('Non-trauma live preview: http://127.0.0.1:3135/nontrauma-preview'));
