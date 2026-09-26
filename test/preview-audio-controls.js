// Local-only controls over the production animation and audio functions.
(() => {
  for (const id of ['suction','oxygen','nebmed','niv','laryngoscope','bleeding_control','tourniquet','infusion','inmed','medpush']) {
    const scene=document.getElementById(id+'-overlay');if(scene)document.body.append(scene);
  }
  const panel = document.createElement('section');
  panel.style.cssText='position:fixed;z-index:20000;inset:8px 8px auto;background:#17222c;color:#d9e6f0;padding:12px;font:18px monospace;border:1px solid #91b7d3;max-height:28vh;overflow:auto';
  panel.innerHTML='<label>Preview scene <select id="qa-scene"><option value="suction">Suction</option><option value="oxygen">Oxygen</option><option value="nebmed">Nebulizer</option><option value="niv">CPAP</option><option value="laryngoscope">Intubation</option><option value="bleeding_control">Bleeding control</option><option value="tourniquet">Tourniquet</option><option value="infusion">IV fluid</option><option value="blood">Blood product</option><option value="inmed">Intranasal medication</option></select></label> <label>Outcome <select id="qa-outcome"><option>SUCCESS</option><option>FAILURE</option><option>COMPLICATION</option></select></label> <button id="qa-play">Play scene</button> <button id="qa-all">Play requested sequence</button> <button id="qa-levels">Inspect audio levels</button> <a href="/" style="color:#a5deee">Simulator</a><pre id="qa-log" style="white-space:pre-wrap;margin:8px 0 0;font:12px monospace" aria-live="polite">Ready. Uses the production animation and sound player.</pre>';
  document.body.append(panel);
  const output=panel.querySelector('#qa-log');
  let epoch=performance.now(), busy=false;
  const log=text=>{output.textContent+='\n'+((performance.now()-epoch)/1000).toFixed(2)+'s '+text;panel.scrollTop=panel.scrollHeight;};
  const original=playSound;
  playSound=function(name){
    const voice=original(name);
    if(voice){
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
    log(id+' START');
    if(id==='oxygen') await animateRouteMedication('oxygen',outcome==='FAILURE'?'COMPLICATION':outcome,3200);
    else if(id==='infusion'||id==='blood') await animateMedicationAdministration({medication_kind:id==='blood'?'blood':'fluid',medication_name:id==='blood'?'Packed Red Blood Cells':'Normal Saline',outcome});
    else if(id==='inmed') await animateRouteMedication(id,outcome,2300);
    else if(id==='nebmed') await animateRouteMedication(id,outcome,2800);
    else if(id==='niv') await animateRouteMedication(id,outcome,3200);
    else await animateProcedureScene(id,id==='laryngoscope'?'intubation':id,outcome);
    log(id+' FINISHED');
  }
  async function play(ids){if(busy)return;busy=true;epoch=performance.now();output.textContent='Playing production scenes';try{for(const id of ids)await run(id,panel.querySelector('#qa-outcome').value);}catch(e){log('ERROR '+e.message);}finally{busy=false;}}
  panel.querySelector('#qa-play').onclick=()=>play([panel.querySelector('#qa-scene').value]);
  panel.querySelector('#qa-all').onclick=()=>play(['suction','oxygen','laryngoscope','bleeding_control','tourniquet']);
  panel.querySelector('#qa-levels').onclick=async()=>{
    const ctx=new AudioContext();await ctx.resume();
    for(const [name,file] of [['Intubation','Intubation.mp3'],['Suction','Suction.wav'],['Oxygen','OxygenFlow.wav'],['Squelch','WoundCompression.wav'],['Success','Diceroll_success.m4a'],['Failure','Diceroll_fail.m4a']]){
      try{const response=await fetch('/sounds/'+file);const audio=await ctx.decodeAudioData(await response.arrayBuffer());const data=audio.getChannelData(0);let sum=0,peak=0,first=-1,last=0;for(let i=0;i<data.length;i++){const a=Math.abs(data[i]);sum+=a*a;peak=Math.max(peak,a);if(a>.015){if(first<0)first=i;last=i;}}log(name+': duration '+audio.duration.toFixed(3)+'s, RMS '+(20*Math.log10(Math.sqrt(sum/data.length))).toFixed(1)+' dBFS, peak '+(20*Math.log10(peak)).toFixed(1)+' dBFS, active '+(first/audio.sampleRate).toFixed(2)+'–'+(last/audio.sampleRate).toFixed(2)+'s');}catch(e){log(name+' DECODE ERROR '+e.message);}
    }await ctx.close();
  };
})();
