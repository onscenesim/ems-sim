/* Synthetic educational capnography. Units: seconds, breaths/min and mmHg.
 * Shapes overlap in practice; these are signal features, not diagnoses. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.Capnography=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const shapes={normal:'Rounded plateau',obstructive:'Sloping expiration',cleft:'Notched plateau',rebreathing:'Elevated baseline',irregular:'Irregular breathing',low_flow:'Low-amplitude expiration',apnea:'No detected breaths'};
  const sources={nasal:'Nasal sampling',airway:'Inline airway',mask:'Mask sampling',unknown:'Source unspecified'};
  const qualities={clean:'Good capture',variable:'Variable capture',poor:'Poor capture'};
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const value=x=>x&&typeof x==='object'?x.value:x;
  function numeric(x,max){x=value(x);if(x==null||x==='')return null;const n=Number(x);return Number.isFinite(n)&&n>=0&&n<=max?n:null;}
  const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
  const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
  function noise(t,hz,seed){const x=t*hz,n=Math.floor(x),f=smooth(x-n);return (2*hash(n+seed)-1)*(1-f)+(2*hash(n+1+seed)-1)*f;}
  function normalize(raw){
    if(!raw)return null;
    const source=Object.hasOwn(sources,raw.source)?raw.source:'unknown';
    return {source,status:['connected','disconnected','unplaced'].includes(raw.status)?raw.status:'connected',
      quality:Object.hasOwn(qualities,raw.quality)?raw.quality:source==='airway'?'clean':'variable',
      shape:Object.hasOwn(shapes,raw.shape)?raw.shape:'normal',rate:numeric(raw.rate,100),etco2:numeric(raw.etco2,150),
      ...(['manual','mechanical','paused','spontaneous'].includes(raw.ventilation)?{ventilation:raw.ventilation}:{}),
      seed:Number.isFinite(raw.seed)?raw.seed:1};
  }
  function fromVitals(v){
    if(v?.Capnography)return normalize(v.Capnography);
    const etco2=numeric(v?.ETCO2,150);
    // Old saves did not record a source. Never present those as a clean inline trace.
    return etco2==null?null:normalize({source:'unknown',etco2,rate:numeric(v?.RR,100)});
  }
  function description(raw){const s=normalize(raw);if(!s||s.status==='unplaced')return 'Not connected';
    if(s.status==='disconnected')return 'Sampling disconnected';
    if(s.source==='nasal')return 'Nasal · variable capture; verify sampling';
    if(s.source==='unknown')return 'Sampling source unspecified';
    if(s.quality==='poor')return 'Poor capture · check sampling';
    if(s.rate===0||s.shape==='apnea')return 'No breaths detected';
    if(s.rate==null)return 'Respiratory rate unavailable';
    return sources[s.source]+(s.quality==='variable'?' · variable capture':'');
  }
  const scale=s=>s?.shape==='low_flow'&&s.etco2>0&&s.etco2<=16?20:80;
  function sample(t,raw,phaseOverride){
    const s=raw;
    if(!s||s.status!=='connected'||s.rate==null||!s.etco2||s.rate===0||s.shape==='apnea')return 0;
    const seed=s.seed||1,rate=clamp(s.rate,1,100);
    // Continuous time warp alters cadence without phase resets or discontinuities.
    const irregular=s.shape==='irregular';
    const cycles=phaseOverride??(t*rate/60+(irregular?Math.min(1,rate/12)*(.085*Math.sin(t*.61+seed)+.035*Math.sin(t*1.17)):.008*Math.sin(t*.43+seed)));
    const beat=Math.floor(cycles),p=cycles-beat;
    const rand=n=>hash(seed+beat*13.7+n);
    const obstruct=s.shape==='obstructive',cleft=s.shape==='cleft';
    const rise=.06+(obstruct?.13+rand(2)*.20:rand(2)*.025);
    const start=.06,fall=.60+rand(3)*.10,down=.045+rand(4)*.025;
    const up=smooth((p-start)/rise),off=1-smooth((p-fall)/down);
    const ramp=obstruct?.25+.75*clamp((p-start)/(fall-start),0,1):.91+.09*clamp((p-start-rise)/(fall-start-rise),0,1);
    let contour=up*off*ramp;
    if(cleft)contour*=1-(.17+rand(5)*.53)*Math.exp(-(((p-(.38+rand(6)*.14))/(.023+rand(7)*.026))**2));
    // Slow exhalations may show cardiogenic oscillation, with variable intensity.
    if(rate<9&&p>start+rise)contour+=.025*Math.sin(t*(7+rand(10)*2))*up*off;
    const baseline=s.shape==='rebreathing'?Math.min(s.etco2*.4,5+hash(seed+3)*5)*(1-.14*Math.sin(t*.2)):0;
    let y=baseline+(s.etco2-baseline)*contour*(.95+rand(1)*.08);
    const nasal=s.source==='nasal',uncertain=s.source==='unknown'||s.source==='mask';
    const severity=s.quality==='poor'?1:s.quality==='variable'?.5:0;
    if(nasal||uncertain||severity){
      const capture=nasal?.32+rand(11)*.67:uncertain?.65+rand(11)*.3:1;
      const assisted=s.ventilation==='manual'||s.ventilation==='mechanical';
      const inlineBreath=s.source==='airway'||(s.source==='mask'&&assisted);
      const dropout=(nasal&&rand(12)<.27)||(s.quality==='poor'&&!inlineBreath&&rand(12)<.40);
      const withinBreath=1-(nasal?.55:.25)*Math.max(0,noise(t,1.2,seed+17));
      y*=dropout?.025:capture*withinBreath;
      const disturbance=inlineBreath&&s.shape==='low_flow'
        ? Math.min(s.etco2*.25,1+severity*7) : (nasal?7:uncertain?3:1)+severity*7;
      y+=disturbance*(.45*noise(t,9.7,seed+40)+.35*noise(t,24.3,seed+51)+.35*noise(t,.73,seed+60));
      if(nasal)y+=7*Math.max(0,noise(t,3.1,seed+83))**4;
    }else y+=.25*noise(t,12,seed);
    return clamp(y,-4,145);
  }
  function createStrip(canvas,{windowSeconds=12}={}){
    const ctx=canvas?.getContext('2d');
    let signal=null,raf=null,lastTs=null,clock=0,phase=0,x=0,pen=null,w=0,h=0,dpr=1,dirty=true;
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>{dirty=true;if(raf===null)idle();}):null;
    if(canvas)observer?.observe(canvas);
    function size(){if(!canvas||!ctx)return false;
      if(!observer||dpr!==(window.devicePixelRatio||1))dirty=true;
      if(dirty){w=canvas.clientWidth;h=canvas.clientHeight;dpr=window.devicePixelRatio||1;dirty=false;
        if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);x=0;pen=null;}}
      return w>0&&h>0;
    }
    function idle(){if(!size())return;ctx.save();ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);ctx.strokeStyle='#e5c25355';ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(0,h*.88);ctx.lineTo(w,h*.88);ctx.stroke();ctx.restore();}
    function frame(ts){raf=requestAnimationFrame(frame);if(!size()){lastTs=null;return;}
      if(lastTs===null){lastTs=ts;return;}const dt=Math.min(.25,Math.max(0,(ts-lastTs)/1000));lastTs=ts;if(!dt)return;
      const ceiling=scale(signal);
      const speed=w/windowSeconds,target=x+speed*dt,baseline=h*.88,gain=h*.74/ceiling,rate=(signal?.rate||0)/60;
      ctx.save();ctx.scale(dpr,dpr);ctx.strokeStyle='#f4cd55';ctx.lineWidth=1.5;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,pen??baseline);
      let prev=x;
      for(let next=x+.5;;next+=.5){next=Math.min(next,target);const offset=(next-x)/speed,drawX=next%w;
        const wobble=signal?.shape==='irregular'?Math.min(1,(signal.rate||0)/12)*(.075*Math.sin((clock+offset)*.61+(signal.seed||1))+.03*Math.sin((clock+offset)*1.17)):.008*Math.sin((clock+offset)*.43+(signal?.seed||1));
        const y=clamp(baseline-gain*Math.min(ceiling,sample(clock+offset,signal,phase+offset*rate+wobble)),2,h-2);
        if(drawX<prev)ctx.moveTo(drawX,y);else ctx.lineTo(drawX,y);prev=drawX;pen=y;if(next>=target)break;
      }
      ctx.stroke();const gap=8,gapX=target%w;ctx.clearRect(gapX+1,0,gap,h);if(gapX+gap+1>w)ctx.clearRect(0,0,gapX+gap+1-w,h);ctx.restore();
      clock+=dt;phase+=dt*rate;x=target%w;
    }
    function update(next){const normalized=normalize(next);
      // Preserve phase and displayed history across rate/morphology changes.
      // Unplacing or changing patient/source clears the previous trace.
      const reset=!normalized||!signal||normalized.seed!==signal.seed||normalized.source!==signal.source;
      const scaleChanged=scale(normalized)!==scale(signal);
      signal=normalized;
      if(reset){clock=0;phase=0;x=0;pen=null;lastTs=null;if(ctx)ctx.clearRect(0,0,canvas.width,canvas.height);}
      else if(scaleChanged){x=0;pen=null;if(ctx)ctx.clearRect(0,0,canvas.width,canvas.height);}
      if(signal&&signal.status==='connected') {if(raf===null)raf=requestAnimationFrame(frame);}
      else {if(raf!==null)cancelAnimationFrame(raf);raf=null;lastTs=null;idle();}
      const label=!signal||signal.status==='unplaced'?'not connected':
        signal.status==='disconnected'?'disconnected':({nasal:'Nasal',airway:'Inline',mask:'Mask',unknown:''})[signal.source];
      canvas?.setAttribute('aria-label','CO₂ waveform'+(label?': '+label:''));
    }
    return {update,resize(){dirty=true;if(raf===null)idle();},dispose(){if(raf!==null)cancelAnimationFrame(raf);raf=null;observer?.disconnect();}};
  }
  return {shapes,sources,qualities,normalize,fromVitals,description,scale,sample,createStrip};
});
