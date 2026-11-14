'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Capno=require('../public/capnography');
const {applyCapnography}=require('../src/engine/capnography');
const signal=changes=>Capno.normalize({source:'airway',status:'connected',rate:12,etco2:40,shape:'normal',quality:'clean',seed:17,...changes});
const samples=s=>Array.from({length:6000},(_,i)=>Capno.sample(i/100,s));

test('capnography handles all sources, shapes, rates and capture qualities with finite bounded signals',()=>{
  for(const source of Object.keys(Capno.sources))for(const shape of Object.keys(Capno.shapes))for(const rate of [0,4,12,30,60,100])for(const quality of Object.keys(Capno.qualities)) {
    const s=signal({source,shape,rate,quality});
    for(let t=0;t<24;t+=.071){const y=Capno.sample(t,s);assert.ok(Number.isFinite(y)&&y>=-4&&y<=145);}
    if(rate===0||shape==='apnea')assert.equal(Capno.sample(1,s),0);
  }
  for(const status of ['unplaced','disconnected'])assert.equal(Capno.sample(3,signal({status})),0);
  assert.equal(Capno.sample(3,signal({rate:null})),0,'no invented respiratory rate');
});

test('breath density tracks RR while obstruction, notching and rebreathing alter actual phases',()=>{
  for(const rate of [4,12,30,60]) {
    const ys=samples(signal({rate}));let count=0;
    for(let i=1;i<ys.length;i++)if(ys[i-1]<20&&ys[i]>=20)count++;
    assert.ok(Math.abs(count-rate)<=1,`${rate}: ${count} breaths/min`);
  }
  // Fix phase to isolate contour from deterministic breath-to-breath variation.
  const at=(shape,p)=>Capno.sample(1,signal({shape}),p);
  assert.ok(at('normal',.2)>32);
  assert.ok(at('obstructive',.2)<at('normal',.2)*.7,'slower expiratory upstroke');
  assert.ok(at('obstructive',.56)>at('obstructive',.25),'sloping plateau');
  let largestCleft=0;
  for(let p=.3;p<.6;p+=.002)largestCleft=Math.max(largestCleft,at('normal',p)-at('cleft',p));
  assert.ok(largestCleft>6,'actual plateau notch');
  assert.ok(at('rebreathing',.01)>4,'inspired baseline stays above zero');
  assert.ok(Math.abs(at('normal',.01))<1);
  const low=samples(signal({shape:'low_flow',etco2:12}));
  assert.ok(Math.max(...low)<14,'low ETCO2 has lower amplitude, not the same full-height template');
});

test('nasal sampling adds aperiodic artifact, dilution and missing captures independent of respiratory rate',()=>{
  const nasal=signal({source:'nasal',quality:'variable'}),inline=signal();
  const a=samples(nasal),b=samples(inline);
  let noiseA=0,noiseB=0;
  for(let i=1;i<a.length;i++){noiseA+=Math.abs(a[i]-a[i-1]);noiseB+=Math.abs(b[i]-b[i-1]);}
  assert.ok(noiseA>noiseB*2,'noise clearly visible beyond clean airway breathing');
  const maxima=Array.from({length:12},(_,n)=>Math.max(...a.slice(n*500,(n+1)*500)));
  assert.ok(Math.min(...maxima)<15,'some breaths are nearly lost');assert.ok(Math.max(...maxima)>25,'some breaths remain usable');
  assert.notDeepEqual(a.slice(0,500),a.slice(500,1000));
  assert.notDeepEqual(a,samples(signal({...nasal,seed:31})),'new variation changes capture');
  assert.deepEqual(a,samples(JSON.parse(JSON.stringify(nasal))),'seed persists through save/restore');
  assert.match(Capno.description(nasal),/Nasal.*verify sampling/);
  assert.equal(Capno.fromVitals({ETCO2:38,RR:12}).source,'unknown','legacy saves cannot silently become inline');
});

test('sampling state persists per patient, preserves measured zero and requires explicit reconnection',()=>{
  assert.deepEqual(applyCapnography({RR:18},null),{RR:18},'manual RR never places capnography');
  const placed=applyCapnography({ETCO2:38,RR:12,CapnoSource:'nasal',CapnoQuality:'poor',CapnoShape:'obstructive'},null,'case|patient_1');
  assert.equal(placed.Capnography.source,'nasal');assert.equal(placed.Capnography.rate,12);assert.equal(placed.CapnoSource,undefined);
  const kept=applyCapnography({HR:80},JSON.parse(JSON.stringify(placed)));
  assert.equal(kept.ETCO2,38);assert.equal(kept.RR,12);assert.equal(kept.Capnography.shape,'obstructive');
  const zero=applyCapnography({ETCO2:0,RR:0},kept);assert.equal(zero.ETCO2,0);assert.equal(zero.RR,0);
  const lost=applyCapnography({CapnoStatus:'disconnected'},kept);assert.equal(lost.ETCO2,undefined);assert.equal(lost.Capnography.rate,null);
  assert.equal(applyCapnography({ETCO2:42,RR:10},lost).ETCO2,undefined);
  const back=applyCapnography({CapnoStatus:'connected',ETCO2:42,RR:10,CapnoSource:'airway'},lost);
  assert.equal(back.Capnography.source,'airway');assert.equal(back.Capnography.quality,'clean');assert.equal(back.ETCO2,42);
  assert.deepEqual(applyCapnography({GCS:15},null,'case|patient_2'),{GCS:15});
});

test('renderer keeps one frame loop, preserves sweep across RR changes and stops on disconnection',()=>{
  const frames=new Map();let id=0,fullClears=0,reads=0;
  const ctx=new Proxy({clearRect(x,y,w){if(w===300)fullClears++;}}, {get:(obj,key)=>obj[key]||(()=>{})});
  const canvas={width:0,height:0,getContext:()=>ctx,setAttribute(){},get clientWidth(){reads++;return 300;},get clientHeight(){reads++;return 60;}};
  const c=vm.createContext({window:{devicePixelRatio:1},ResizeObserver:class{observe(){}disconnect(){}},
    requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(n){frames.delete(n);}});
  vm.runInContext(fs.readFileSync(require.resolve('../public/capnography'),'utf8'),c);
  const strip=c.Capnography.createStrip(canvas);strip.update(signal());
  function tick(t){const [n,fn]=frames.entries().next().value;frames.delete(n);fn(t);}
  tick(0);for(let t=16;t<1000;t+=16)tick(t);
  const clears=fullClears;strip.update(signal({rate:30,shape:'obstructive'}));tick(1000);
  assert.equal(frames.size,1);assert.equal(fullClears,clears,'rate change keeps waveform history');assert.equal(reads,2,'size cached across frames');
  strip.update(signal({status:'disconnected'}));assert.equal(frames.size,0);
  strip.update(signal({source:'nasal'}));assert.equal(frames.size,1);assert.ok(fullClears>clears,'source change clears old trace');
  strip.dispose();assert.equal(frames.size,0);
});

test('assisted cadence drives low-flow breaths, with explicit pause and measured zero preserved', () => {
  const placement = { procedure_id: 'supraglottic_airway', outcome: 'SUCCESS' };
  const bvm = { procedure_id: 'bvm', outcome: 'SUCCESS' };
  const mask = applyCapnography({ ETCO2: 0, RR: 0, CapnoSource: 'mask', CapnoShape: 'apnea' });
  const breaths = applyCapnography({ ETCO2: 4, RR: 0, CapnoQuality: 'poor', CapnoShape: 'low_flow' }, mask, 'p1', { rolls: [bvm], age: 30 });
  assert.equal(breaths.Capnography.ventilation, 'manual');
  assert.equal(breaths.Capnography.rate, 10);
  assert.equal(Capno.scale(breaths.Capnography), 20);
  assert.ok(Capno.sample(1, breaths.Capnography, .3) > Capno.sample(1, breaths.Capnography, .02) + 1);
  const inline = applyCapnography({ ETCO2: 3, CapnoShape: 'low_flow' }, breaths, 'p1', { rolls: [placement], age: 6 });
  assert.equal(inline.Capnography.source, 'airway');
  assert.equal(inline.Capnography.rate, 20);
  const continued = applyCapnography({ RR: 0 }, inline, 'p1', { age: 6 });
  assert.equal(continued.Capnography.rate, 20);
  const paused = applyCapnography({ CapnoVentilation: 'paused', RR: 0 }, continued, 'p1', { age: 6 });
  assert.equal(paused.Capnography.rate, 0);
  const resumed = applyCapnography({ ETCO2: 0, CapnoVentilation: 'manual', CapnoQuality: 'poor' }, paused, 'p1', { age: 6 });
  assert.equal(resumed.Capnography.rate, 20);
  assert.equal(Capno.sample(1, resumed.Capnography, .3), 0);
  assert.equal(applyCapnography({ RR: 0 }, null, 'p1', { rolls: [bvm], age: 30 }).Capnography, undefined);
});

let reply='';
require.cache[require.resolve('../src/engine/api')]={exports:{sendTurn:async()=>reply,sendDebrief:async()=>''}};
require.cache[require.resolve('../src/server/adminLogger')]={exports:{logRun(){},updateRunDebrief(){}}};
const {Session}=require('../src/engine/session');
const {assembleSeedBlock,buildDebriefContext}=require('../src/engine/assembler');
test('real session carries nasal/airway source, RR, transitions and patient isolation into saved turns',async()=>{
  const seed={...require('../src/engine/roller').rollScenario({random_seed:'capno-integration'}),scenario_id:'capno-integration',provider_level:'ALS',category:'medical',presentation:'Respiratory distress',patient_age:45,difficulty:'NORMAL',events:[]};
  const session=new Session(seed,'capno-test');
  reply='The sampling cannula is placed. [VITALS: ETCO2=52 RR=8 CapnoSource=nasal CapnoStatus=connected CapnoQuality=variable CapnoShape=obstructive] [TIME: 1:00]';
  const first=await session.send('Assess',true);
  assert.equal(first.vitals.Capnography.source,'nasal');assert.equal(first.vitals.RR,8);
  reply='Ventilation continues. [VITALS: ETCO2=38 RR=10 CapnoSource=airway CapnoStatus=connected CapnoQuality=clean CapnoShape=normal] [TIME: 2:00]';
  const next=await session.send('Assess',true);assert.equal(next.vitals.Capnography.source,'airway');
  reply='The sampling tubing is disconnected. [VITALS: CapnoStatus=disconnected] [TIME: 3:00]';
  const lost=await session.send('Assess',true);assert.equal(lost.vitals.ETCO2,undefined);assert.equal(lost.vitals.Capnography.status,'disconnected');
  reply='Second patient responds. [PATIENT_FOCUS: patient_2 | Second patient] [VITALS: GCS=15 RR=18] [TIME: 4:00]';
  assert.equal((await session.send('Assess',true)).vitals.Capnography,undefined);
  const saved=JSON.parse(JSON.stringify(session.turns));assert.equal(saved[0].vitals.Capnography.source,'nasal');assert.equal(saved[1].vitals.Capnography.rate,10);
  assert.match(buildDebriefContext(seed,session.turns),/Capnography display: source nasal/);
  const prompt=assembleSeedBlock(seed);assert.match(prompt,/ETCO2 and RR together/);assert.match(prompt,/CapnoSource=nasal\|airway\|mask/);
  assert.doesNotMatch(assembleSeedBlock({...seed,provider_level:'BLS'}),/CAPNOGRAPHY SIGNAL:/);
});

test('monitor displays source and RR for nasal and inline sampling and clears them after loss/reset',()=>{
  const nodes=new Map(),updates=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},textContent:'',hidden:false,setAttribute(){}});return nodes.get(id);};
  const context=vm.createContext({Capnography:{...Capno,createStrip:()=>({update:s=>updates.push(s),resize(){}})},
    document:{getElementById:node},window:{addEventListener(){},matchMedia:()=>({matches:true})},selectMonitorWaveform(){}});
  const source=fs.readFileSync(require.resolve('../public/app'),'utf8');
  vm.runInContext(source.slice(source.indexOf('const capnoStrip ='),source.indexOf('const plethStrip =')),context);
  for(const sampling of ['nasal','airway']) {
    context.updateCapnography({Capnography:signal({source:sampling,rate:18})});
    assert.equal(node('capno-rr').textContent,'18');assert.equal(node('capno-source').textContent,sampling==='nasal'?'Nasal':'Inline');
    assert.equal(node('capno-waveform').hidden,false);
    assert.equal(node('capno-status').textContent,sampling==='nasal'?'Nasal':'Inline');
    assert.equal(node('monitor-capno-rr').textContent,'18');
  }
  context.updateCapnography({Capnography:signal({status:'disconnected'})});
  assert.equal(node('capno-rr').textContent,'—');assert.equal(node('capno-status').textContent,'Inline');
  context.updateCapnography({Capnography:signal({source:'mask',quality:'poor'})});
  assert.equal(node('capno-status').textContent,'Mask','source only, without signal-quality coaching');
  context.updateCapnography({RR:18});assert.equal(node('capno-waveform').hidden,true);assert.equal(node('capno-source').textContent,'');
  assert.equal(node('monitor-capno-rr').textContent,'—','a manual respiratory rate never becomes a capnography reading');
  context.updateCapnography(null);assert.equal(updates.at(-1),null);
});
