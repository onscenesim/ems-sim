// Local-only controls over the production animation and audio functions.
(() => {
  for (const id of ['cpr','thump','lucas','ncd','ncric','bvm','pacing','npa','obstruction','scalpel','ekg','iv','dice','oralmed','immed','defib','io','suction','oxygen','nebmed','niv','laryngoscope','chest_seal','sga','opa','bleeding_control','tourniquet','infusion','inmed','medpush']) {
    const scene=document.getElementById(id+'-overlay');if(scene)document.body.append(scene);
  }
  const panel = document.createElement('section');
  panel.style.cssText='position:fixed;z-index:20000;inset:8px 8px auto;background:#17222c;color:#d9e6f0;padding:12px;font:18px monospace;border:1px solid #91b7d3;max-height:28vh;overflow:auto';
  panel.innerHTML='<label>Preview scene <select id="qa-scene"><option value="chest_seal">Chest seal</option><option value="sga">i-gel</option><option value="opa">OPA</option><option value="laryngoscope">Intubation</option><option value="oxygen">Oxygen</option><option value="nebmed">Nebulizer</option><option value="niv">CPAP</option><option value="iv">IV start</option><option value="medpush">IV medication</option><option value="iomed">IO medication</option><option value="iofluid">IO fluid</option><option value="ioblood">IO blood</option><option value="oralmed">Oral / sublingual medication</option><option value="immed">IM medication</option><option value="defib">Defibrillation</option><option value="cardioversion">Cardioversion</option><option value="thump">Precordial thump</option><option value="lucas">LUCAS</option><option value="ncd">Needle decompression</option><option value="ncric">Needle cric</option><option value="cpr">CPR</option><option value="bvm">BVM</option><option value="pacing">Pacing</option><option value="npa">NPA</option><option value="obstruction">Obstruction removal</option><option value="scalpel">Surgical cric</option><option value="ekg">12-lead ECG</option><option value="io">IO access</option><option value="infusion">IV fluid</option><option value="blood">Blood product</option><option value="suction">Suction</option><option value="bleeding_control">Bleeding control</option><option value="tourniquet">Tourniquet</option><option value="inmed">Intranasal medication</option></select></label> <label>Outcome <select id="qa-outcome"><option>SUCCESS</option><option>FAILURE</option><option>COMPLICATION</option></select></label> <button id="qa-play">Play scene</button> <button data-push-frame="0">Start frame</button> <button data-push-frame="1150">Flow frame</button> <button data-push-frame="2800">End frame</button> <button id="qa-all">Play medication sequence</button> <button id="qa-procedures">Audit procedure sounds</button> <button id="qa-cpr">Audit CPR variants</button> <label>Provider <select id="qa-provider"><option>ALS</option><option>BLS</option></select></label> <label><input id="qa-moving" type="checkbox"> In ambulance</label> <button id="qa-levels">Inspect audio levels</button> <a href="/" style="color:#a5deee">Simulator</a><pre id="qa-log" style="white-space:pre-wrap;margin:8px 0 0;font:12px monospace" aria-live="polite">Ready. Uses the production animation and sound player.</pre>';
  document.body.append(panel);
  const output=panel.querySelector('#qa-log');
  let epoch=performance.now(), busy=false;
  const log=text=>{output.textContent+='\n'+((performance.now()-epoch)/1000).toFixed(2)+'s '+text;panel.scrollTop=panel.scrollHeight;};
  let runVoices = [];
  const original=playSound;
  playSound=function(name){
    const voice=original(name);
    if(voice){
      runVoices.push(voice);
      const playing=()=>log(name+' PLAYING · gain '+voice.volume+' · duration '+voice.duration.toFixed(3)+'s');
      const ended=()=>{log(name+' ENDED');cleanup();};
      const paused=()=>{log(name+' STOPPED at '+voice.currentTime.toFixed(3)+'s');cleanup();};
      const error=()=>{log(name+' ERROR');cleanup();};
      const cleanup=()=>{voice.removeEventListener('playing',playing);voice.removeEventListener('ended',ended);voice.removeEventListener('pause',paused);voice.removeEventListener('error',error);};
      voice.addEventListener('playing',playing);voice.addEventListener('ended',ended);voice.addEventListener('pause',paused);voice.addEventListener('error',error);
    } else log(name+' SILENT (muted/hidden)');
    return voice;
  };
  async function run(id,outcome){
    // Use the production capture listener; no preview-only audio unlocking.
    runVoices = [];
    localTranscript = {meta:{provider_level:panel.querySelector('#qa-provider').value}};
    window._isMoving = panel.querySelector('#qa-moving').checked;
    log(id+' DICE · '+localTranscript.meta.provider_level+' · '+(window._isMoving?'ambulance':'outside'));
    if(id==='defib'||id==='cardioversion') playSound(getOutcomeSound(outcome));
    else await animateDiceRoll(id,outcome==='SUCCESS'?18:3,12,outcome);
    log(id+' ANIMATION');
    if(id==='iv') await animateIV(outcome);
    else if(id==='io') await animateDrill(outcome);
    else if(id==='defib'||id==='cardioversion') await animateDefib(id==='defib'?'defibrillation':'cardioversion',outcome);
    else if(id==='thump') await animateThorsHammer(outcome);
    else if(id==='cpr') await animateCPR(outcome);
    else if(id==='lucas') await animateLUCAS(outcome);
    else if(id==='ncd'||id==='ncric') await animateNCD(outcome,id==='ncd'?'needle_decompression':'needle_cricothyrotomy');
    else if(id==='ekg') await animateTwelveLead(outcome);
    else if(id==='oralmed'||id==='immed') await animateRouteMedication(id,outcome,2600);
    else if(id==='oxygen') await animateRouteMedication('oxygen',outcome==='FAILURE'?'COMPLICATION':outcome,3200);
    else if(id==='infusion'||id==='blood') await animateMedicationAdministration({medication_kind:id==='blood'?'blood':'fluid',medication_name:id==='blood'?'Packed Red Blood Cells':'Normal Saline',outcome});
    else if(id==='inmed') await animateRouteMedication(id,outcome,2300);
    else if(['iomed','iofluid','ioblood'].includes(id)) await animateMedicationAdministration({administration_route:'IO',medication_kind:({iomed:'medication',iofluid:'fluid',ioblood:'blood'})[id],outcome});
    else if(id==='medpush') await animateMedPush(outcome);
    else if(id==='nebmed') await animateRouteMedication(id,outcome,2800);
    else if(id==='niv') await animateRouteMedication(id,outcome,3200);
    else await animateProcedureScene(id,({laryngoscope:'intubation',npa:'nasopharyngeal_airway',obstruction:'foreign_body_removal',scalpel:'cricothyrotomy',sga:'supraglottic_airway',opa:'oropharyngeal_airway'})[id]||id,outcome);
    log(id+' OVERLAY FINISHED');
    // Audit mode waits for natural endings so one recording cannot mask the next.
    await Promise.all(runVoices.map(voice=>new Promise(resolve=>{
      if(voice.ended||voice.paused){resolve();return;}
      const done=()=>{voice.removeEventListener('ended',done);voice.removeEventListener('pause',done);voice.removeEventListener('error',done);resolve();};
      voice.addEventListener('ended',done);voice.addEventListener('pause',done);voice.addEventListener('error',done);
    })));
    log(id+' AUDIO COMPLETE');
  }
  async function play(ids){if(busy)return;['medpush','infusion'].forEach(id=>document.getElementById(id+'-overlay').classList.remove('visible'));busy=true;epoch=performance.now();output.textContent='Playing production scenes';try{for(const entry of ids){const id=typeof entry==='string'?entry:entry.id;if(typeof entry!=='string'){panel.querySelector('#qa-provider').value=entry.provider;panel.querySelector('#qa-moving').checked=entry.moving;}await run(id,panel.querySelector('#qa-outcome').value);}}catch(e){log('ERROR '+e.message);}finally{busy=false;}}
  // Freeze the production push or infusion scene for connection/flow inspection. Timers
  // are suppressed only during this synchronous setup; normal playback is unchanged.
  for (const button of panel.querySelectorAll('[data-push-frame]')) button.onclick=()=>{
    if(busy)return;
    const id=panel.querySelector('#qa-scene').value;
    ['medpush','infusion'].forEach(id=>document.getElementById(id+'-overlay').classList.remove('visible'));
    const kind=({iofluid:'fluid',ioblood:'blood',infusion:'fluid',blood:'blood'})[id];
    const timer=window.setTimeout;
    try {
      window.setTimeout=()=>0;
      animateMedicationAdministration({administration_route:id.startsWith('io')?'IO':'IV',
        medication_kind:kind,outcome:panel.querySelector('#qa-outcome').value});
    } finally { window.setTimeout=timer; }
    const overlay=document.getElementById((kind?'infusion':'medpush')+'-overlay');
    overlay.style.transition='none';
    overlay.getAnimations({subtree:true}).forEach(animation=>{animation.pause();animation.currentTime=Number(button.dataset.pushFrame);});
    output.textContent='Production delivery frame at '+button.dataset.pushFrame+'ms (silent). Play scene to resume normal playback.';
  };
  panel.querySelector('#qa-play').onclick=()=>{['medpush','infusion'].forEach(id=>document.getElementById(id+'-overlay').style.transition='');play([panel.querySelector('#qa-scene').value]);};
  panel.querySelector('#qa-all').onclick=()=>play(['oralmed','immed','medpush','inmed','nebmed','infusion','blood','defib','io','chest_seal','sga','opa','laryngoscope','oxygen','niv']);
  panel.querySelector('#qa-procedures').onclick=()=>play(['cpr','lucas','thump','defib','cardioversion','chest_seal','bleeding_control','tourniquet','ncd','ncric','bvm','pacing','npa','obstruction','scalpel','ekg']);
  panel.querySelector('#qa-cpr').onclick=()=>play([{id:'cpr',provider:'ALS',moving:false},{id:'cpr',provider:'ALS',moving:true},{id:'cpr',provider:'BLS',moving:false},{id:'cpr',provider:'BLS',moving:true},{id:'defib',provider:'ALS',moving:true},{id:'cardioversion',provider:'ALS',moving:true}]);
  panel.querySelector('#qa-levels').onclick=async()=>{
    const ctx=new AudioContext();await ctx.resume();
    let decoded=0,failed=0;
    for(const [name,url] of Object.entries(SOUNDS)){
      try{const response=await fetch(url);const audio=await ctx.decodeAudioData(await response.arrayBuffer());decoded++;const data=audio.getChannelData(0);let sum=0,peak=0,first=-1,last=0;for(let i=0;i<data.length;i++){const a=Math.abs(data[i]);sum+=a*a;peak=Math.max(peak,a);if(a>.015){if(first<0)first=i;last=i;}}log(name+': duration '+audio.duration.toFixed(3)+'s, RMS '+(20*Math.log10(Math.sqrt(sum/data.length))).toFixed(1)+' dBFS, peak '+(20*Math.log10(peak)).toFixed(1)+' dBFS, active '+(first/audio.sampleRate).toFixed(2)+'–'+(last/audio.sampleRate).toFixed(2)+'s');}catch(e){failed++;log(name+' DECODE ERROR '+e.message);}
    }log('Audio inventory: '+decoded+' decoded; '+failed+' failed');await ctx.close();
  };
})();
