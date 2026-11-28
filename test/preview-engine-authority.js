'use strict';
// Real Session/routes/UI, disposable storage and deterministic synthetic replies.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.EMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-authority-preview-'));
require('dotenv').config({quiet:true});
let replies = null;
require.cache[require.resolve('../src/engine/api')] = {exports:{
  sendDebrief:async()=> 'Synthetic preview; no clinical evaluation generated.',
  sendTurn:async (_prompt,messages)=> {
    if (replies?.length) return replies.length > 1 ? replies.shift() : replies[0];
    const message=messages.at(-1).content, order=message.split('\n')[0];
    const last=messages.filter(m=>m.role==='assistant').at(-1)?.content||'';
    const clock=last.match(/\[TIME: (\d+):(\d+)\]/);
    const minute=clock?Number(clock[1])+Number(clock[2])/60+1:0;
    const patient=/patient[ _]2|second patient/i.test(order)?2:/patient[ _]1|first patient/i.test(order)?1:Number(last.match(/PATIENT_FOCUS: patient_(\d+)/)?.[1]||1);
    let text='SYNTHETIC PREVIEW: The patient is awake and answers the assessment.';
    if (/SYSTEM ROLL: peripheral_iv.*(?:SUCCESS|MARGINAL)/.test(message)) text='The IV is placed in the ordered patient.';
    if (/SYSTEM ROLL: medication_push/.test(message)) text='Normal saline is delivered through the recorded usable line.';
    if (/SYSTEM NOTE: .* held:/.test(message)) text='The vascular treatment is held: no usable access exists for this patient and route.';
    if (/^(?:Remove|Discontinue).*\bIV\b/i.test(order)) text='The selected IV is removed.';
    if (/SYSTEM ROLL: (?:intubation|cpap|bipap|ventilator|lucas)/.test(message)) text='The ordered device setup is attempted using the injected outcome.';
    if (/^(?:Remove|Disconnect|Stop) /i.test(order)&&!/IV/i.test(order)) text='The ordered device is removed or stopped.';
    if (/ESTABLISHED CARE/.test(message)) text='Existing care continues without another placement attempt.';
    let tags='';
    if (/^(?:Transport|Drive|Depart|Head out|Load and go)/i.test(order)) {text='The ambulance departs for the nearest hospital.';tags='[LOADING]\n[EN_ROUTE:nearest]';}
    return scene(text,patient,minute,tags);
  }
}};
const express=require('express');
const {Session}=require('../src/engine/session');
const {rollScenario}=require('../src/engine/roller');
const app=express();app.use(express.json());
function scene(text,patient=1,minute=1,tags='') {return `${text}\n${tags}\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[PATIENT_FOCUS: patient_${patient} | Patient ${patient}]\n[VITALS: GCS=15 Pain=0]\n[TIME: ${Math.floor(minute)}:${String(Math.round(minute%1*60)).padStart(2,'0')}]`;}
function session(patch={}) {return new Session({...rollScenario({random_seed:'authority-preview',provider_level:'ALS',category:'medical'}),complication_type:'none',catastrophe:null,routine_er_divert:false,backup_present_on_arrival:false,...patch});}
app.post('/qa/check/:name',async(req,res,next)=>{
 const random=Math.random;Math.random=()=>.99;
 try {
  const s=session(),steps=[];
  async function send(order){const r=await s.send(order);steps.push({order,reply:r.reply,rolls:r.rolls.map(x=>({procedure:x.procedure_id,patient:x.patient,outcome:x.outcome,continued:!!x.continued,die:x.roll})),held:r.suppressed.filter(x=>x.held).map(x=>x.reason),access:structuredClone(s.access),closed:r.closed,moving:s.moving});return r;}
  let pass=false;
  switch(req.params.name){
   case 'phantom': {const r=await send('I push a liter of normal saline through the established 18 gauge IV.');pass=!r.rolls.length&&r.suppressed.some(x=>x.vascular)&&!s.access.length;break;}
   case 'patients': {await send('Start an IV in patient 1.');const held=await send('Give normal saline IV to patient 2.');const given=await send('Give normal saline IV to patient 1.');await send('Remove the IV from patient 1.');const removed=await send('Give normal saline IV to patient 1.');pass=!held.rolls.length&&given.rolls.some(x=>x.procedure_id==='medication_push')&&!removed.rolls.length&&s.access[0].status==='removed';break;}
   case 'restart': {await send('Intubate.');await send('Remove the endotracheal tube.');Math.random=()=>.01;const r=await send('Intubate.');pass=r.rolls.some(x=>x.procedure_id==='intubation'&&x.roll===1&&!x.continued);break;}
   case 'close': {await send('Do not terminate resuscitation. Continue CPR.');pass=!s.closed;await send('End call.');pass&&=s.closed;break;}
   case 'transport': {replies=[scene('The rig pulls away.',1,1,'[EN_ROUTE:major]'),scene('The patient answers. The ambulance remains parked.')];await send('Ask the patient about allergies.');pass=!s.moving&&!s.hasLoaded;break;}
   case 'respiratory': {for(const order of ['Apply CPAP.','Apply BiPAP.','Connect the transport ventilator.'])await send(order);pass=steps.map(x=>x.rolls[0]?.procedure).join(',')==='cpap,bipap,ventilator';break;}
   case 'backup': {const a=session({category:'arrest'});replies=[scene('Dispatch acknowledges.',1,0),scene('Observation continues.',1,9)];await a.send('Begin the scenario.');const before=structuredClone(a.backupStatus);await a.send('Observe for nine minutes.');steps.push({before,after:a.backupStatus,crew:a.crewStatus});pass=before.status==='en_route'&&a.backupStatus.status==='on_scene';break;}
   default:return res.status(404).end();
  }
  res.json({check:req.params.name,pass,steps});
 }catch(error){next(error);}finally{Math.random=random;replies=null;}
});
app.get('/qa',(_req,res)=>res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Engine authority checks</title><style>body{margin:0;background:#111b23;color:#e7edf0;font:17px system-ui;line-height:1.55}main{max-width:1050px;margin:auto;padding:32px}h1{font-size:30px}button,a{font:inherit;padding:10px 14px;border:1px solid #738b9b;border-radius:6px;background:#263b4b;color:#e9f4fc;margin:5px;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#091219;border:1px solid #425563;padding:20px;border-radius:8px;font:14px ui-monospace;line-height:1.5}.pass{color:#8fe0b1}.fail{color:#ff9f99}#status{margin:20px 0;font-weight:600}</style></head><body><main><h1>Engine authority checks</h1><p>Current engine, real routes and playable interface. Synthetic replies and temporary storage; no live AI calls.</p><a href="/">Open interactive simulator</a><button id="all">Run all checks</button><div id="checks"></div><p id="status">Ready.</p><pre id="result">Choose a check.</pre></main><script>
const names={phantom:'Invented IV claim',patients:'Patient-specific access and removal',restart:'Removed airway needs a new attempt',close:'Negated end-call command',transport:'Unordered departure',respiratory:'CPAP, BiPAP and ventilator',backup:'Backup without model tags'};const buttons=[];const result=document.querySelector('#result'),status=document.querySelector('#status');async function run(name){const r=await fetch('/qa/check/'+name,{method:'POST'});if(!r.ok)throw Error(await r.text());return r.json();}for(const [name,label] of Object.entries(names)){const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{b.disabled=true;try{const d=await run(name);status.className=d.pass?'pass':'fail';status.textContent=(d.pass?'PASS — ':'FAIL — ')+label;result.textContent=JSON.stringify(d,null,2);}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};buttons.push(b);document.querySelector('#checks').append(b);}document.querySelector('#all').onclick=async()=>{buttons.forEach(b=>b.disabled=true);const all=[];try{for(const name of Object.keys(names))all.push(await run(name));status.className=all.every(x=>x.pass)?'pass':'fail';status.textContent=all.filter(x=>x.pass).length+' / '+all.length+' checks passed';result.textContent=JSON.stringify(all,null,2);}catch(e){status.textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}};
</script></body></html>`));
app.use(require('../src/server/app'));
app.listen(3132,'127.0.0.1',()=>console.log('Authority preview: http://127.0.0.1:3132/qa'));
