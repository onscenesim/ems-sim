'use strict';
// Real UI, routes, dice and Session; synthetic model and isolated temporary data.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const express=require('express');
process.env.EMS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'ems-performance-'));
const apiPath=require.resolve('../src/engine/api');
require.cache[apiPath]={id:apiPath,filename:apiPath,loaded:true,exports:{
  sendTurn:async(_prompt,messages)=>{
    const previous=messages.filter(m=>m.role==='assistant').at(-1)?.content||'';
    const time=previous.match(/\[TIME: (\d+):(\d+)\]/);
    const minute=time?Number(time[1])+1:0;
    return `${time?'SYNTHETIC PREVIEW: Your requested care is recorded. The patient answers your questions.':'DISPATCH: Synthetic performance check. No live model is connected.'}\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[PATIENT_FOCUS: patient_1 | Preview patient]\n[VITALS: HR=80 BP=120/80 SpO2=98 RR=18 Rhythm=sinus GCS=15]\n[TIME: ${minute}:00]`;
  },sendDebrief:async()=>'Synthetic preview; no clinical evaluation generated.',
}};
const production=require('../src/server/app');
const app=express();
app.get('/',(_req,res)=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  res.type('html').send(html.replace('</body>',`<details id="perf-qa" style="position:fixed;right:8px;top:8px;z-index:20000;max-width:340px;padding:8px;background:#f3f1e8;color:#182b39;border:1px solid #596b77;font:14px system-ui">
    <summary>Performance preview · synthetic model</summary>
    <p>Begin a scenario, then enter care normally. Model calls and saved calls use an isolated fixture.</p>
    <button id="qa-repeat">Check 30 repeated ECG updates</button>
    <button id="qa-history">Add 60 transcript turns</button>
    <button id="qa-dice">Play dice with a delayed tick</button>
    <p id="qa-result" role="status">No checks run.</p>
  </details><script>
  const qaResult=document.getElementById('qa-result');
  document.getElementById('qa-repeat').onclick=async()=>{
    if(!sessionId){qaResult.textContent='Begin a scenario first.';return;}
    const record=TwelveLead.create({id:'qa-paper',patientId:'patient_1',minute:2,vitals:{HR:80,Rhythm:'sinus'}});
    ecgViewer.setPatient('patient_1');ecgViewer.update([record]);
    await new Promise(requestAnimationFrame);
    let replacements=0;
    const observer=new MutationObserver(changes=>{replacements+=changes.filter(c=>c.type==='childList').length;});
    observer.observe(document.getElementById('ecg-thumbnail'),{childList:true});
    const start=performance.now();
    for(let i=0;i<30;i++){ecgViewer.update([JSON.parse(JSON.stringify(record))]);ecgViewer.setPatient('patient_1');}
    await new Promise(requestAnimationFrame);observer.disconnect();
    qaResult.textContent='30 repeated updates: '+replacements+' SVG replacements · '+Math.round(performance.now()-start)+' ms including next frame.';
  };
  document.getElementById('qa-history').onclick=()=>{
    if(!sessionId){qaResult.textContent='Begin a scenario first.';return;}
    const start=performance.now();
    for(let i=0;i<60;i++){print('> Synthetic history '+(i+1),'user');printReply('Preview patient remains awake.\\nPartner: "Ready for your next order."');printHr();}
    requestAnimationFrame(()=>{qaResult.textContent='60 synthetic turns appended in '+Math.round(performance.now()-start)+' ms. Transcript scrolled to latest turn.';});
  };
  document.getElementById('qa-dice').onclick=async()=>{
    if(!sessionId||sendingTurn){qaResult.textContent='Begin a scenario and wait for the current turn.';return;}
    qaResult.textContent='Playing a real dice roll; deliberately blocking the first 800 ms to simulate a stall.';
    const start=performance.now();
    const done=animateDiceRoll('peripheral_iv',18,12,'SUCCESS');
    while(performance.now()-start<800){} // Local QA only: reproduce a missed interval.
    await done;
    qaResult.textContent='Delayed dice finished in '+Math.round(performance.now()-start)+' ms; result landed at the first tick after the stall.';
  };
  </script></body>`));
});
app.use(production);
const port=Number(process.env.PREVIEW_PORT||3132);
app.listen(port,'127.0.0.1',()=>console.log('Performance preview: http://127.0.0.1:'+port));
