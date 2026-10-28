'use strict';
// Focused local QA: production page, options, protocols, renderer and animations.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { detectWithConfirmation } = require('../src/engine/dice');
const app = express();
app.use(express.json());
app.post('/detect', (req,res) => res.json(detectWithConfirmation(String(req.body.text || ''))));
app.get('/api/auth/me', (_req,res) => res.json({player:null}));
app.get('/api/scenario/recent', (_req,res) => res.json({snapshot:null}));
app.get('/', (_req,res) => {
  const html = fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  res.type('html').send(html.replace('</body>', `<style>
  body{display:flex;flex-direction:column;height:100dvh;overflow:hidden}#qa-panel{flex-shrink:0;position:relative;z-index:5;padding:12px;background:#25323b;color:white;font:16px var(--font-xp);display:flex;gap:8px;flex-wrap:wrap;align-items:center}#qa-panel button{padding:6px;font:inherit}#qa-status{width:100%}#terminal{flex:1;min-height:0;position:relative!important;top:auto!important;height:auto!important}#output{min-height:250px}#drug-panel{z-index:10}
  </style><div id="qa-panel"><b>Text &amp; medication preview</b><button id="qa-options">Options</button><button id="qa-protocols">Protocols</button><button id="qa-zyprexa">Give Zyprexa</button><button id="qa-suboxone">Give Suboxone</button><button id="qa-buccal">Give Suboxone buccally</button><button id="qa-start">Oral start frame</button><button id="qa-end">Oral end frame</button><button id="qa-reset">Reset scene</button><label><input id="qa-light" type="checkbox"> Light mode</label><a href="http://127.0.0.1:3011/" style="color:#a5b4fc">Simulator</a><output id="qa-status">Synthetic scene using the production renderer and medication detection.</output></div><script>
  document.body.prepend(document.getElementById('qa-panel'));
  document.body.append(document.getElementById('options-dialog'),document.getElementById('protocol-dialog'));
  startScreen.style.display='none';terminal.style.display='flex';
  updateDialogueColors({crew:{partner:{name:'Marcus Webb'},captain:{name:'Priya Nair'}},patients:[{name:'Alex Jones'},{name:'Maria Lopez'}]},true);
  printReply('The living room is quiet. Marcus Webb stands beside Alex Jones. A medication bag rests nearby.\\nMarcus: "I have the blood pressure. We can prepare Zyprexa if ordered." He opens the bag.\\nAlex Jones: “I feel nervous. Please explain what is happening.”\\nWife: "He has been pacing all evening." She points to a chair.\\nPriya Nair: "I can set up IV access and the 12-lead ECG."\\nMaria Lopez: "I am his sister. I need help too."');
  print('> I explain the plan and give Zyprexa by mouth.','user');
  printReply('Olanzapine is ready. CPR, needle decompression, and Suboxone are also recognized care terms.');
  document.getElementById('qa-options').onclick=()=>document.getElementById('options-open').click();
  document.getElementById('qa-protocols').onclick=()=>document.getElementById('protocol-open').click();
  const status=document.getElementById('qa-status');
  let busy=false;
  async function give(text){if(busy)return;busy=true;const data=await fetch('/detect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})}).then(r=>r.json());const roll=data.rolls.find(r=>r.procedure_id==='medication_push');status.textContent=text+' → '+roll.medication_name+' → '+(roll.administration_route||roll.medication_animation_route)+' → oral animation';await animateMedicationAdministration({...roll,outcome:'SUCCESS'});status.textContent+=' · Complete; overlay cleared';busy=false;}
  document.getElementById('qa-zyprexa').onclick=()=>give('Give Zyprexa');
  document.getElementById('qa-suboxone').onclick=()=>give('Give Suboxone');
  document.getElementById('qa-buccal').onclick=()=>give('Give Suboxone buccally');
  function frame(ms){const el=document.getElementById('oralmed-overlay');el.className='route-med-overlay';void el.offsetWidth;el.classList.add('visible','outcome-SUCCESS');document.getElementById('oralmed-label').textContent='SUCCESS';el.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=ms;});status.textContent='Production oral animation at '+ms+' ms';}
  document.getElementById('qa-start').onclick=()=>frame(250);
  document.getElementById('qa-end').onclick=()=>frame(2100);
  document.getElementById('qa-reset').onclick=()=>{const el=document.getElementById('oralmed-overlay');el.getAnimations({subtree:true}).forEach(a=>a.cancel());el.className='route-med-overlay';hideDrugPanel();};
  document.getElementById('qa-light').onchange=e=>{document.body.classList.toggle('light-mode',e.target.checked);};
  </script></body>`));
});
app.use(express.static(path.join(__dirname,'../public')));
app.listen(3016,'127.0.0.1',()=>console.log('Text preview: http://127.0.0.1:3016'));
