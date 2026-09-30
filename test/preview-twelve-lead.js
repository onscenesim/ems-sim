'use strict';
// Focused preview with production app, acquisition service and notebook viewer.
// No model requests or persisted patient data.
const express=require('express');
const path=require('node:path');
const fs=require('node:fs');
const {acquireTwelveLeads}=require('../src/engine/twelve-lead');
const app=express();app.use(express.json());
app.get('/api/auth/me',(_req,res)=>res.json({player:null}));
app.get('/api/scenario/current',(_req,res)=>res.json({session:null}));
app.post('/preview/acquire',(req,res)=>res.json(acquireTwelveLeads({seed:{presentation:req.body.pathology,comorbidity_bundle:req.body.history,ecg_pattern:req.body.pathology,ecg_rhythm_variant:req.body.rhythmVariant},vitals:{HR:req.body.rate,Rhythm:req.body.rhythm},rolls:[{procedure_id:req.body.procedure||'twelve_lead',outcome:req.body.outcome}],ink:req.body.ink,patientId:req.body.patient,minute:req.body.minute,turn:req.body.turn,sessionId:'preview'})));
app.get('/',(_req,res)=>{
  let html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  html=html.replace('</body>',`<style>#preview-controls{position:fixed;top:0;left:0;right:0;z-index:9999;background:#17374b;color:white;padding:10px;font:16px sans-serif;display:flex;gap:8px;flex-wrap:wrap}#preview-controls input{width:60px}#preview-controls select,#preview-controls button{font:inherit}#terminal{margin-top:100px;height:calc(100dvh - 110px)} #vitals-panel{max-height:48dvh}</style>
  <div id="preview-controls"><label>Case <select id="qa-pathology">${['Inferior STEMI','Anteroseptal STEMI','Lateral STEMI','Posterior STEMI','De Winter OMI','Wellens syndrome','Aslanger pattern','NSTEMI','Subarachnoid hemorrhage','Hypothermia','Hyperkalemia','Pericarditis','Brugada syndrome','Hypertrophic obstructive cardiomyopathy','Long QT syndrome','LVH','LBBB','Normal'].map(p=>'<option>'+p+'</option>').join('')}</select></label><label>Rhythm <select id="qa-rhythm"></select></label><label>Rate <input id="qa-rate" value="80" type="number"></label><label>Placement <select id="qa-view"><option value="twelve_lead">Standard</option><option value="posterior_ecg">Posterior</option><option value="right_sided_ecg">Right-sided</option><option value="v4r_ecg">V4R</option></select></label><label>Quality <select id="qa-outcome"><option>SUCCESS</option><option>MARGINAL</option><option>FAILURE</option><option>COMPLICATION</option></select></label><label>Asystole <select id="qa-variant"><option value="">Automatic</option><option value="flat">Flat line</option><option value="wander">Wandering baseline</option></select></label><button id="qa-options">Options</button><button id="qa-acquire">Obtain 12-lead ECG</button><button id="qa-switch">Switch patient</button><button id="qa-restore">Restore saved recordings</button><span id="qa-status">No ECG obtained</span></div>
  <script>
  document.body.appendChild(document.getElementById('options-dialog'));
  startScreen.style.display='none';terminal.style.display='flex';
  let qaRecords=[],qaPatient='patient_1',qaCount=0;
  const qaGet=id=>document.getElementById(id);
  for(const [type,rate] of Object.entries(TwelveLead.rates)){const o=document.createElement('option');o.value=type;o.textContent=type;qaGet('qa-rhythm').appendChild(o);}
  qaGet('qa-rhythm').value='sinus';
  for(const key of Object.keys(TwelveLead.catalog.patterns)){const o=document.createElement('option');o.value=key;o.textContent='Catalog: '+key;qaGet('qa-pathology').appendChild(o);}
  qaGet('qa-options').onclick=()=>document.getElementById('options-dialog').showModal();
  qaGet('qa-rhythm').onchange=()=>qaGet('qa-rate').value=TwelveLead.rates[qaGet('qa-rhythm').value];
  function qaApply(openNew=false){ecgViewer.setPatient(qaPatient);ecgViewer.update(qaRecords,{openNew});applyVitals({HR:Number(qaGet('qa-rate').value),Rhythm:qaGet('qa-rhythm').value});}
  qaGet('qa-acquire').onclick=async()=>{qaGet('qa-acquire').disabled=true;const r=await fetch('/preview/acquire',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pathology:qaGet('qa-pathology').value,procedure:qaGet('qa-view').value,ink:window.EMSCosmetics?.ink(),rhythm:qaGet('qa-rhythm').value,rhythmVariant:qaGet('qa-rhythm').value==='asystole'?(qaGet('qa-variant').value||undefined):undefined,rate:Number(qaGet('qa-rate').value),outcome:qaGet('qa-outcome').value,patient:qaPatient,minute:++qaCount*2,turn:qaCount})});const records=await r.json();await animateTwelveLead(qaGet('qa-outcome').value);qaRecords.push(...records);qaApply(true);qaGet('qa-status').textContent='Filed '+qaRecords.length+' recording(s)';qaGet('qa-acquire').disabled=false;};
  qaGet('qa-switch').onclick=()=>{qaPatient=qaPatient==='patient_1'?'patient_2':'patient_1';qaApply();qaGet('qa-status').textContent=qaPatient;};
  qaGet('qa-restore').onclick=()=>{const saved=JSON.stringify(qaRecords);ecgViewer.update([]);qaRecords=JSON.parse(saved);qaApply();qaGet('qa-status').textContent='Restored '+qaRecords.length+' unchanged recording(s)';};
  setVitalsPanelOpen(true);qaApply();
  </script></body>`);res.type('html').send(html);
});
app.use(express.static(path.join(__dirname,'../public')));
app.listen(3013,'127.0.0.1',()=>console.log('ECG preview: http://127.0.0.1:3013'));
