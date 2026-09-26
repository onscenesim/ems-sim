'use strict';
// Local visual QA using production markup, styling, animation helpers and detection.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { detectWithConfirmation } = require('../src/engine/dice');
const { applyCapillaryRefill } = require('../src/engine/capillary-refill');
const app = express();
app.use(express.json());
app.post('/detect', (req, res) => res.json(detectWithConfirmation(String(req.body.text || ''))));
app.get('/', (_req, res) => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const access = html.match(/<g id="medpush-access">[\s\S]*?<\/g>/)[0];
  const face = html.match(/<g id="patient-face-profile"[\s\S]*?<\/g>/)[0];
  const scenes = html.slice(html.indexOf('    <!-- Fluids and blood products'), html.indexOf('    <!-- Route-specific medication administration: oral medication.'));
  const audio = source.slice(0, source.indexOf('// ── Mobile audio unlock'));
  const scheduler = source.slice(source.indexOf('function scheduleSceneAudio('), source.indexOf('function animateProcedureScene('));
  const helpers = source.slice(source.indexOf('async function animateMedicationAdministration('), source.indexOf('function animateNCD('));
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Treatment animation preview</title><link rel="stylesheet" href="/style.css"><style>
  body{margin:0;padding:24px;background:#101820;color:#c5d6e6;font-family:var(--font-xp);font-size:20px;height:100vh;box-sizing:border-box} .qa{position:relative;z-index:10000;max-width:850px;margin:auto} .controls{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0} button,select,input{font:inherit;padding:8px} input{min-width:300px} h1{font-size:26px;margin:0} #status{position:fixed;bottom:16px;left:24px;right:24px;z-index:10000;font-size:18px} .cap{position:fixed;bottom:90px;z-index:10000;background:#17222c;padding:10px} .route-med-overlay{padding-top:80px} a{color:#a5deee}
  </style></head><body><div class="qa"><h1>Treatment animation preview</h1><div class="controls"><label>Scene <select id="scene"><option value="fluid">IV fluid</option><option value="blood">Blood product</option><option value="oxygen">Oxygen</option></select></label><label>Outcome <select id="outcome"><option>SUCCESS</option><option>COMPLICATION</option><option>MARGINAL</option><option>FAILURE</option></select></label><button id="play">Play animation</button><button data-frame="250">Start frame</button><button data-frame="1200">Flow frame</button><button data-frame="2800">End frame</button></div><div class="controls"><input id="order" aria-label="Order" value="Transfuse PRBCs"><button id="detect">Test order</button><a href="http://127.0.0.1:3011/">Return to simulator</a></div></div><svg width="0" height="0" style="position:absolute"><defs>${access}${face}</defs></svg>${scenes}<div class="cap">Capillary refill: <span id="cap-value">—</span><div class="controls"><button id="generic">Get vitals</button><button id="assess">Check cap refill</button><button id="next">Next turn</button><button id="patient">Switch patient</button></div></div><output id="status">Production scenes and detection. Synthetic measurements; no model calls.</output><script>
  const soundEnabled=true,localTranscript=null;
  ${audio}
  ${scheduler}
  ${helpers}
  function showDrugPanel(drug) { document.querySelector('#status').textContent += ' · Reference: ' + drug; }
  function animateMedPush() { return Promise.resolve(); }
  ${applyCapillaryRefill.toString()}
  let busy=false, patient=0, minute=1, snapshots={};
  const status=document.querySelector('#status');
  function settings() { const kind=document.querySelector('#scene').value; let outcome=document.querySelector('#outcome').value; if(kind==='oxygen' && outcome!=='COMPLICATION') outcome='SUCCESS'; return {kind,outcome,id:kind==='oxygen'?'oxygen':'infusion'}; }
  function reset() { document.querySelectorAll('.route-med-overlay').forEach(e=>{ e.getAnimations({subtree:true}).forEach(a=>a.cancel());e.className='route-med-overlay'; }); }
  function prepare() { reset(); const s=settings();const el=document.getElementById(s.id+'-overlay');el.dataset.fluid=s.kind;document.querySelector('#infusion-header').textContent=s.kind==='blood'?'PACKED RED BLOOD CELLS':'NORMAL SALINE (0.9%)';return {...s,el}; }
  document.querySelector('#play').onclick=async()=>{if(busy)return;busy=true;const s=prepare();status.textContent='Playing '+s.kind+' · '+s.outcome;await animateRouteMedication(s.id,s.outcome,3200);status.textContent='Animation finished; overlay cleared.';busy=false;};
  document.querySelectorAll('[data-frame]').forEach(button=>button.onclick=()=>{if(busy)return;const s=prepare();void s.el.offsetWidth;document.getElementById(s.id+'-label').textContent=s.outcome;s.el.classList.add('visible','outcome-'+s.outcome);s.el.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=Number(button.dataset.frame);});status.textContent=s.kind+' · '+s.outcome+' · '+button.dataset.frame+' ms';});
  document.querySelector('#detect').onclick=async()=>{if(busy)return;busy=true;reset();const response=await fetch('/detect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:document.querySelector('#order').value})});const result=await response.json();status.textContent=JSON.stringify(result);for(const r of result.rolls){if(r.medication_kind)await animateMedicationAdministration(r);else if(r.procedure_id==='oxygen')await animateRouteMedication('oxygen',r.outcome,3200);}busy=false;};
  function reading(assessed){snapshots[patient]=applyCapillaryRefill({CapRefill:3},snapshots[patient],assessed,minute++);const c=snapshots[patient]?.CapRefill;document.querySelector('#cap-value').textContent=c?c.value+' s · '+c.t:'—';status.textContent='Patient '+(patient+1)+' · '+(assessed?'Explicit assessment':'No capillary-refill assessment');}
  document.querySelector('#generic').onclick=()=>reading(false);document.querySelector('#assess').onclick=()=>reading(true);document.querySelector('#next').onclick=()=>reading(false);document.querySelector('#patient').onclick=()=>{patient=1-patient;reading(false);};
  </script></body></html>`);
});
app.use(express.static(path.join(__dirname, '../public')));
app.listen(Number(process.env.PREVIEW_PORT || 3012), '127.0.0.1', () => console.log('Treatment preview: http://127.0.0.1:'+(process.env.PREVIEW_PORT || 3012)));
