'use strict';
// Real Session/model, synthetic cases, isolated temporary storage.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.EMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-low-acuity-preview-'));
require('dotenv').config({quiet:true});
const express = require('express');
const {LOW_ACUITY_CALLS} = require('../src/data/scenarios/low-acuity');
const {catalog, prepareInstructor} = require('../src/engine/instructor');
const {rollScenario} = require('../src/engine/roller');
const {Session} = require('../src/engine/session');
const {CREW} = require('../src/data/crew');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname,'../public')));
let session = null, busy = false, error = null;
const actions = {
  arrive:'We arrive, look at the scene and approach only as scene safety permits. What do we see and hear?',
  assess:'Ask the patient what changed today, assess mental status, breathing, perfusion and focused symptoms; obtain a set of vital signs and glucose. Ask family or staff for baseline and relevant history. Review any ECG supplied by the referring facility.',
  wait:'Continue the conversation calmly for twenty minutes without performing more tests or treatment. What does the patient do?',
  partner:'Partner, what do you think we should do, and what actually supports that approach?',
  paper:'Review the EKG printout handed to us by urgent care. Ask the patient about any symptoms today and ask the referring provider which leads concern them.',
};
function state() {
  return {busy,error, minute:session?.sceneMinute || 0, closed:session?.closed || false,
    partner:session?.seed.crew_partner, difficulty:session?.seed.difficulty,
    turns:session?.turns.map(t=>({user:t.user,reply:t.assistant,minute:t.sceneMinute,vitals:t.vitals,papers:t.twelveLeads||[]})) || []};
}
function run(work) {
  busy=true; error=null;
  Promise.resolve().then(work).catch(e=>{error=e.message;}).finally(()=>{busy=false;});
}
app.get('/preview/state',(_req,res)=>res.json(state()));
app.post('/preview/start',(req,res)=>{
  if(busy)return res.status(409).json({error:'A reply is still running.'});
  const entry=catalog().find(e=>e.low_acuity_call?.id===req.body.id);
  if(!entry)return res.sendStatus(400);
  session=new Session(rollScenario({difficulty:req.body.difficulty || 'NORMAL', partner_name:req.body.partner || 'Marcus Webb',
    instructor:prepareInstructor({case_id:entry.case_id,seed:{backup_present_on_arrival:false}}),random_seed:'low-acuity-live-preview'}));
  run(()=>session.send('begin')); res.json({busy});
});
app.post('/preview/step',(req,res)=>{
  if(busy || !session)return res.status(409).json({error:'Start a call or wait for the reply.'});
  const text=actions[req.body.action] || String(req.body.text || '').slice(0,4000);
  if(!text)return res.sendStatus(400);
  run(()=>session.send(text)); res.json({busy});
});
app.get('/low-acuity-preview',(_req,res)=>res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Low-acuity calls — live preview</title>
<style>body{margin:0;background:#101b24;color:#e7eef4;font:16px/1.6 system-ui}main{max-width:1050px;margin:auto;padding:24px}h1{font-size:27px;margin:0}p{color:#bccdda}button,input,select{font:inherit;color:inherit;background:#20394a;border:1px solid #668395;border-radius:6px;padding:9px;margin:4px}button{cursor:pointer}button:disabled{opacity:.45}label{display:inline-block}select{max-width:95vw}.turn{background:#172b38;border:1px solid #36566a;border-radius:8px;padding:18px;margin:16px 0;white-space:pre-wrap}.order{color:#b8c8d4;font-size:14px;margin-bottom:12px}#status{color:#a9e5ba;position:sticky;top:0;background:#101b24;padding:8px}#order{width:min(70%,700px)}.paper{background:#fff;color:#111;overflow:auto;padding:8px;margin:12px 0}.paper svg{width:100%;min-width:750px}summary{cursor:pointer}</style></head><body><main>
<h1>Low-acuity calls</h1><p>Nine standalone scenarios · real simulator engine and live model replies · temporary synthetic runs.<br>Ordinary modes preserve the benign medical course. Black Cloud keeps its usual influence.</p>
<label>Call <select id="case">${LOW_ACUITY_CALLS.map(e=>`<option value="${e.low_acuity_call.id}" ${e.low_acuity_call.id==='urgent-care-stemi'?'selected':''}>${e.presentation.replace('Low-acuity call — ','')}</option>`).join('')}</select></label>
<label>Partner <select id="partner">${CREW.filter(e=>e.role==='partner'||e.role==='partner_BLS').map(e=>`<option>${e.name}</option>`).join('')}</select></label>
<label>Difficulty <select id="difficulty"><option>NORMAL</option><option>EASY</option><option>HARD</option><option>BLACK_CLOUD</option></select></label><button id="start">Start call</button>
<nav><button data-action="arrive">Arrive and approach</button><button data-action="assess">Basic workup</button><button data-action="paper">Review referral ECG</button><button data-action="partner">Ask partner's opinion</button><button data-action="wait">Conversation only · 20 minutes</button></nav>
<form id="form"><input id="order" aria-label="Provider order" placeholder="Enter a provider action or dialogue"><button>Send order</button></form><div id="status" role="status">Choose a call and partner, then start.</div><div id="turns"></div>
<script src="/ecg-catalog.js"></script><script src="/twelve-lead.js"></script><script>
let rendered='';
function render(d){document.querySelectorAll('button,input,select').forEach(e=>e.disabled=d.busy);document.querySelector('#status').textContent=d.error?'Live response failed: '+d.error:d.busy?'Generating live response…':d.partner?d.partner+' · '+d.difficulty+' · T+'+d.minute.toFixed(1)+' · Ready':'Choose a call and partner, then start.';const key=JSON.stringify(d.turns);if(key===rendered)return;rendered=key;const root=document.querySelector('#turns');root.replaceChildren();for(const t of d.turns){const section=document.createElement('section');section.className='turn';const order=document.createElement('div');order.className='order';order.textContent='T+'+t.minute.toFixed(1)+' · '+t.user;const reply=document.createElement('div');reply.textContent=t.reply;section.append(order,reply);if(t.vitals){const vitals=document.createElement('div');vitals.className='order';vitals.textContent='Measured: '+Object.entries(t.vitals).map(([k,v])=>k+' '+(v&&typeof v==='object'?(v.value??JSON.stringify(v)):v)).join(' · ');section.append(vitals);}for(const record of t.papers){const detail=document.createElement('details');detail.open=true;const summary=document.createElement('summary');summary.textContent=record.source==='urgent_care'?'Referral ECG · urgent-care paper':'Acquired 12-lead ECG';const paper=document.createElement('div');paper.className='paper';paper.innerHTML=TwelveLead.svg(record);detail.append(summary,paper);section.append(detail);}root.prepend(section);}}
async function poll(){try{const d=await(await fetch('/preview/state')).json();render(d);if(d.busy)setTimeout(poll,1000);}catch(e){document.querySelector('#status').textContent=e.message;}}
async function post(url,body){document.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);try{await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});poll();}catch(e){document.querySelector('#status').textContent=e.message;}}
document.querySelector('#start').onclick=()=>post('/preview/start',{id:document.querySelector('#case').value,partner:document.querySelector('#partner').value,difficulty:document.querySelector('#difficulty').value});document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>post('/preview/step',{action:b.dataset.action}));document.querySelector('#form').onsubmit=e=>{e.preventDefault();post('/preview/step',{text:document.querySelector('#order').value});};poll();
</script></main></body></html>`));
const port=Number(process.env.PREVIEW_PORT || 3146);
app.listen(port,'127.0.0.1',error=>{
  if(error)throw error;
  console.log(`Low-acuity preview: http://127.0.0.1:${port}/low-acuity-preview`);
});
