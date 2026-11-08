'use strict';
// Production mobile UI with synthetic vitals and a visual-viewport keyboard probe.
// No model calls or saved player data. Run: node test/preview-mobile.js
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const lab = require('../dev/test-lab/server');
const app = express();
app.use(express.json());
app.post('/api/scenario/mobile-preview/turn', (req, res) => {
  const minute = Math.max(0, Number(req.body.preview_minute) || 0) + 0.5;
  const seconds = Math.round(minute * 60);
  res.json({
  reply: 'Priya acknowledges your action and reassesses the patient. The monitor remains connected.',
  scene_minute: minute, patient_focus: { id: 'patient_1', label: 'Primary patient' }, rolls: [],
  vitals: { HR: 95, BP: { value: '126/76', tMin: minute, t: 'T+' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') }, SpO2: 98, Rhythm: 'sinus', ETCO2: 41, RR: 14,
    Capnography: { source: 'nasal', status: 'connected', etco2: 41, rate: 14, quality: 'variable', shape: 'normal', seed: 17 } },
  });
});
app.get('/mobile-preview', (_req, res) => res.type('html').send(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mobile monitor and typing</title>
<style>body{margin:12px;background:#18232b;color:#e0e8ec;font:14px system-ui}h1{font-size:18px}nav{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}button,select{font:inherit;padding:7px}iframe{display:block;width:360px;max-width:100%;height:620px;border:1px solid #788892}output{display:block;margin:8px 0;font-size:12px}</style></head>
<body><h1>Mobile monitor and typing</h1><p>Synthetic fixture · production UI. Keyboard button simulates the visible viewport; native iPhone playback still requires a device.</p>
<nav><button data-state="before">Before ETCO₂</button><button data-state="nasal">Apply nasal</button><button data-state="airway">Inline</button><button data-state="lost">Disconnect</button><button data-state="trend">BP trend</button><button data-state="digits">Numerals · zeros</button><button data-state="reference">LP15 reference</button><button data-state="other">Second patient</button><button data-advance="1">+1 game min</button><button data-advance="5">+5 game min</button><button data-keyboard="open">Open keyboard</button><button data-keyboard="pan">Pan keyboard</button><button data-keyboard="close">Close keyboard</button><label><input id="preview-tap" type="checkbox"> Tap field opens keyboard (no resize events)</label><select aria-label="Preview width"><option>360</option><option>320</option><option>390</option><option>1024</option></select><label><input id="preview-sound" type="checkbox"> Sound</label></nav>
<output id="result">Ready</output><output id="audio-result">Sound is off</output><output id="keyboard-result">Keyboard closed</output><iframe title="Live mobile simulator" src="/mobile-preview/frame"></iframe>
<script>const frame=document.querySelector('iframe');document.querySelector('nav').onclick=e=>{if(e.target.dataset.state)frame.contentWindow.postMessage({state:e.target.dataset.state},location.origin);if(e.target.dataset.advance)frame.contentWindow.postMessage({advance:Number(e.target.dataset.advance)},location.origin);if(e.target.dataset.keyboard)frame.contentWindow.postMessage({keyboard:e.target.dataset.keyboard},location.origin);};document.getElementById('preview-tap').onchange=e=>frame.contentWindow.postMessage({tapKeyboard:e.target.checked},location.origin);document.getElementById('preview-sound').onchange=e=>frame.contentWindow.postMessage({sound:e.target.checked},location.origin);document.querySelector('select').onchange=e=>frame.style.width=e.target.value+'px';window.addEventListener('message',e=>{if(e.source===frame.contentWindow&&e.data.result)document.getElementById('result').textContent=e.data.result;if(e.source===frame.contentWindow&&e.data.audio)document.getElementById('audio-result').textContent=e.data.audio;if(e.source===frame.contentWindow&&e.data.keyboardResult)document.getElementById('keyboard-result').textContent=e.data.keyboardResult;});</script></body></html>`));
app.get('/mobile-preview/frame', (_req, res) => {
  let html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  html = html.replace(/<script[^>]+src="\/?analytics[^>]*><\/script>/g, '');
  html = html.replace('<head>', `<head><base href="/"><script src="/lab/isolate.js"></script><script>
    const previewViewport=new EventTarget();Object.assign(previewViewport,{height:620,offsetTop:0,scale:1});
    Object.defineProperty(window,'visualViewport',{value:previewViewport});
    const previewMatchMedia=window.matchMedia.bind(window);
    window.matchMedia=query=>{
      const result=previewMatchMedia(query);
      if(query==='(any-pointer: coarse)')Object.defineProperty(result,'matches',{value:true});
      return result;
    };
  </script>`);
  html = html.replace('</body>', `<div id="preview-pan-mask" style="position:fixed;top:0;left:0;right:0;height:0;z-index:100000;background:#18232b;pointer-events:none"></div><div id="preview-keyboard" hidden style="position:fixed;bottom:0;left:0;right:0;height:280px;z-index:100000;background:#b9bec5;color:#243342;overflow:hidden;text-align:center;font:16px system-ui"><p>Simulated keyboard area</p></div><script>
    startScreen.style.display='none';terminal.style.display='flex';soundEnabled=false;sessionId='mobile-preview';updateSkipBtn();
    const base={HR:95,BP:{value:'138/82',t:'T+0:00',tMin:0},SpO2:98,Rhythm:'sinus',PulseOx:{quality:'good',reliable:true,reason:'reliable',pulseRate:95,perfusionIndex:3.78}};
    let previewState='before';
    function setPreviewState(state){
      previewState=state;
      if(state==='other'){
        applyPatientFocus({id:'patient_2',label:'Second patient'},true);
        applyVitals({HR:88,RR:16,GCS:15});return;
      }
      applyPatientFocus({id:'patient_1',label:'Primary patient'});
      const capno=state==='before'?null:{source:state==='airway'?'airway':'nasal',status:state==='lost'?'disconnected':'connected',etco2:41,rate:14,quality:state==='airway'?'clean':'variable',shape:'normal',seed:17};
      const vitals={...base,ETCO2:capno&&state!=='lost'?41:undefined,RR:14,Capnography:capno};
      if(state==='reference'){
        applyVitals({...vitals,HR:69,SpO2:99,BP:{value:'107/70',tMin:monitorSceneMinute},ETCO2:38,RR:12,
          PulseOx:{...base.PulseOx,pulseRate:69},Capnography:{...capno,source:'airway',quality:'clean',rate:12,etco2:38}});return;
      }
      if(state==='digits'){
        applyVitals({...vitals,HR:100,SpO2:100,BP:{value:'180/100',tMin:monitorSceneMinute},ETCO2:40,RR:10,
          PulseOx:{...base.PulseOx,pulseRate:100},Capnography:{...capno,source:'airway',quality:'clean',rate:10,etco2:40}});return;
      }
      if(state==='trend'){
        for(const [i,value] of ['138/82','128/78','110/68','122/74'].entries()){
          currentSceneMinute=i*2;monitorSceneMinute=i*2;applyVitals({...vitals,BP:{value,tMin:i*2,t:'T+'+(i*2)+':00'}});
        }
      }else applyVitals(vitals);
    }
    for(let i=0;i<12;i++)print('Priya checks the monitor, reassesses the patient and secures the equipment. Breath sounds are clear bilaterally. The patient responds to your questions.');
    print('Latest update: The patient is ready for your next action.');
    const nativePreviewFetch=window.fetch.bind(window);
    window.fetch=(input,options)=>{
      if(typeof input==='string'&&input.endsWith('/api/scenario/mobile-preview/turn')){
        options={...options,body:JSON.stringify({...JSON.parse(options.body),preview_minute:monitorSceneMinute})};
      }
      return nativePreviewFetch(input,options);
    };
    const nativePreviewSound=playSound;
    playSound=name=>{
      const requested=performance.now(),voice=nativePreviewSound(name);
      if(name==='monitor_open'){
        if(!voice)parent.postMessage({audio:'Monitor opening cue muted'},location.origin);
        else{
          let start;
          voice.addEventListener('playing',()=>{start=performance.now();parent.postMessage({audio:'Monitor opening cue: playing · '+Math.round(start-requested)+' ms start · gain '+voice.volume+' · '+voice.duration.toFixed(3)+' s'},location.origin);});
          voice.addEventListener('ended',()=>parent.postMessage({audio:'Monitor opening cue: ended · '+Math.round(performance.now()-start)+' ms playback · gain '+voice.volume+' · '+voice.duration.toFixed(3)+' s clip'},location.origin));
          voice.addEventListener('error',()=>parent.postMessage({audio:'Monitor opening cue: playback error'},location.origin));
        }
      }
      return voice;
    };
    let keyboardAnimation=0,tapKeyboard=false,keyboardControlFocus=false;
    userInput.addEventListener('focus',()=>{if(tapKeyboard&&!keyboardControlFocus)animatePreviewKeyboard('silent',false);});
    userInput.addEventListener('blur',()=>{if(tapKeyboard&&!keyboardControlFocus)animatePreviewKeyboard('close',false);});
    function animatePreviewKeyboard(mode,focus=true){
      const silent=tapKeyboard||mode==='silent';
      const run=++keyboardAnimation,open=mode!=='close',fromHeight=previewViewport.height,fromTop=previewViewport.offsetTop,toHeight=open?340:620,toTop=mode==='pan'?60:0,started=performance.now();
      let maxDrift=0,steps=0;
      const keyboard=document.getElementById('preview-keyboard'),mask=document.getElementById('preview-pan-mask');
      parent.postMessage({keyboardResult:'Keyboard moving'},location.origin);
      if(focus){keyboardControlFocus=true;if(open)userInput.focus({preventScroll:true});else userInput.blur();keyboardControlFocus=false;}
      function step(now){
        if(run!==keyboardAnimation)return;
        const progress=Math.min(1,(now-started)/260),eased=1-Math.pow(1-progress,3);
        previewViewport.height=fromHeight+(toHeight-fromHeight)*eased;
        previewViewport.offsetTop=fromTop+(toTop-fromTop)*eased;
        const covered=Math.max(0,620-previewViewport.height-previewViewport.offsetTop);
        keyboard.hidden=covered<.1;keyboard.style.height=covered+'px';mask.style.height=previewViewport.offsetTop+'px';
        if(!silent){previewViewport.dispatchEvent(new Event('resize'));previewViewport.dispatchEvent(new Event('scroll'));}
        requestAnimationFrame(()=>{
          if(run!==keyboardAnimation)return;
          steps++;
          const bottom=document.getElementById('input-row').getBoundingClientRect().bottom;
          maxDrift=Math.max(maxDrift,Math.abs(bottom-previewViewport.height-previewViewport.offsetTop));
          report();
          if(progress<1)requestAnimationFrame(step);
          else parent.postMessage({keyboardResult:'Keyboard settled · '+steps+' frames · max typing-row drift '+maxDrift.toFixed(1)+'px · '+(silent?'no resize events · ':'')+(document.activeElement===userInput?'input focused':'input blurred')},location.origin);
        });
      }
      requestAnimationFrame(step);
    }
    function report(){const row=document.getElementById('input-row').getBoundingClientRect(),monitor=document.getElementById('vitals-bar').getBoundingClientRect();parent.postMessage({result:'Monitor '+Math.round(monitor.height)+'px · composer bottom '+Math.round(row.bottom)+'px · visible bottom '+Math.round(previewViewport.height+previewViewport.offsetTop)+'px · game T+'+monitorSceneMinute.toFixed(1)+' · '+previewState},location.origin);}
    window.addEventListener('message',e=>{if(e.origin!==location.origin)return;if(typeof e.data.tapKeyboard==='boolean')tapKeyboard=e.data.tapKeyboard;if(typeof e.data.sound==='boolean')soundEnabled=e.data.sound;if(e.data.state)setPreviewState(e.data.state);if(e.data.advance){monitorSceneMinute+=e.data.advance;currentSceneMinute=monitorSceneMinute;monitorView.tick();}if(e.data.keyboard)animatePreviewKeyboard(e.data.keyboard);requestAnimationFrame(()=>requestAnimationFrame(report));});
    setPreviewState('before');adjustForViewport();requestAnimationFrame(report);
  </script></body>`);
  res.type('html').send(html);
});
app.use(lab);
app.listen(Number(process.env.PREVIEW_PORT || 3142), '127.0.0.1', () => console.log('Mobile preview: http://127.0.0.1:' + (process.env.PREVIEW_PORT || 3142) + '/mobile-preview'));
