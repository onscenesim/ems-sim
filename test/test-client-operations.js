'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const helperSource = source.slice(source.indexOf('function newOperationId()'), source.indexOf('async function apiGet('));
const deferred = () => { let resolve; const promise=new Promise(r=>{resolve=r;}); return {promise,resolve}; };
function client(apiPost) {
  const context=vm.createContext({apiPost,sessionId:'test-session',sendBtn:{},crypto:require('node:crypto'), print(){}});
  vm.runInContext('let currentOperation = null;\n'+helperSource+'\nthis.activeOperation = () => currentOperation;',context);
  return context;
}

test('client repeats the same operation and confirmation payload after a dropped response', async () => {
  const requests=[];
  const c=client(async(path,body)=>{
    requests.push({path,body});
    if(requests.length===1)throw Object.assign(Error('connection dropped'),{code:'network_error'});
    return {reply:'processed once'};
  });
  const result=await c.apiOperation('/turn',{message:'epi',proc_allow:['medication_push|epi'],procs_resolved:true},'client-operation-001');
  assert.equal(result.reply,'processed once');assert.equal(requests.length,2);
  assert.deepEqual(requests[0],requests[1]);assert.equal(requests[1].body.operation_id,'client-operation-001');
  assert.equal(c.activeOperation(),null);
});

test('STOP requests server cancellation and handles its acknowledgement without browser abort', async () => {
  const paths=[];
  const c=client(async(path)=>{
    paths.push(path);
    if(path.endsWith('/cancel'))return {status:'cancelled'};
    return new Promise(()=>{});
  });
  const request=c.apiOperation('/turn',{message:'epi'},'client-operation-002');
  const rejected=assert.rejects(request,{code:'operation_cancelled'});
  await c.stopCurrentOperation();await rejected;
  assert.equal(paths[1],'/api/scenario/test-session/operations/client-operation-002/cancel');
  assert.equal(c.activeOperation(),null);
});

test('a completed turn racing with STOP is returned rather than discarded', async () => {
  const original=deferred();
  const c=client(async(path)=>path.endsWith('/cancel')?{status:'completed',result:{reply:'already committed'}}:original.promise);
  const request=c.apiOperation('/turn',{},'client-operation-003');
  await c.stopCurrentOperation();
  assert.equal((await request).reply,'already committed');
  original.resolve({reply:'already committed'});
  assert.equal(c.activeOperation(),null);
});

test('a failed STOP request leaves the original operation active', async () => {
  const original=deferred();
  const c=client(async(path)=>{
    if(path.endsWith('/cancel'))throw Error('offline');
    return original.promise;
  });
  const request=c.apiOperation('/turn',{},'client-operation-004');
  await c.stopCurrentOperation();
  assert.equal(c.activeOperation().id,'client-operation-004');assert.equal(c.activeOperation().stopping,false);
  original.resolve({reply:'finished'});assert.equal((await request).reply,'finished');
});

test('browser loads the shared aliases before drug cards, without Node globals', () => {
  const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8');
  assert.ok(html.indexOf('src="medication-aliases.js"')<html.indexOf('src="drug-cards.js"'));
  const c=vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../public/medication-aliases'),'utf8'),c);
  vm.runInContext(fs.readFileSync(require.resolve('../public/drug-cards'),'utf8'),c);
  assert.equal(c.lookupDrug('epi').name,'Epinephrine');
});

function ecgHelpers() {
  const start=source.indexOf('const RHYTHM_RATE_DEFAULT =');
  const end=source.indexOf('function stripFrame(ts)');
  const context=vm.createContext({
    document:{getElementById(){return null;}},
    Math,
    TwelveLead: require('../public/twelve-lead'),
  });
  vm.runInContext(source.slice(start,end)+'\nthis.ecg={normalizeRhythm,stripY,stripSchedule,stripArtifactY,stripHeartRateReadout,refreshStripHeartRate,rhythmStrip};',context);
  return context.ecg;
}

test('ECG recognizes torsades aliases before generic VT', () => {
  const {normalizeRhythm}=ecgHelpers();
  for (const token of ['torsades','Torsades de Pointes','TdP','polymorphic VT','polymorphic ventricular tachycardia']) {
    assert.equal(normalizeRhythm(token),'torsades',token);
  }
  assert.equal(normalizeRhythm('monomorphic VT'),'vt');
  assert.equal(normalizeRhythm('ventricular fibrillation'),'vf');
});

test('live strip uses shared flutter, terminal hyperkalemia and toxic conduction signals',()=>{
  const ECG=require('../public/twelve-lead');
  for(const [type,rate] of [['aflutter',150],['aflutter',100],['hyperk_sine',90],['sodium_blockade',120]]) {
    const {stripY,stripSchedule,rhythmStrip:s}=ecgHelpers();
    Object.assign(s,{type,rate,beats:[],horizon:.2,clock:0,ectopy:'none',ectopyCount:0,flutterOrigin:.2+60/rate});
    stripSchedule(5);
    const beat=s.beats.find(b=>b.t>1);
    if(type==='aflutter')assert.ok(s.beats.every(b=>b.flutter&&!b.p));
    if(type==='sodium_blockade')assert.ok(s.beats.every(b=>b.sodiumBlockade&&!b.p));
    for(let t=1;t<4;t+=.003)assert.ok(Number.isFinite(stripY(t)));
    if(type==='hyperk_sine')assert.equal(stripY(2.123),ECG.sineSignal('II',2.123,rate,s.flutterOrigin));
    if(type==='sodium_blockade')assert.ok(stripY(beat.t+.04)>.6,'broad positive toxic complex');
  }
});

test('torsades twists across the baseline while VF remains aperiodic', () => {
  const {stripY,stripSchedule,rhythmStrip}=ecgHelpers();
  rhythmStrip.waveSeed=12.345;
  rhythmStrip.rate=220;
  rhythmStrip.type='torsades';
  stripSchedule(8);
  assert.equal(rhythmStrip.beats.length,0,'torsades should not receive monomorphic QRS overlays');
  const windowRms=[];
  for(let start=0;start<6;start+=0.25){
    let power=0;
    for(let i=0;i<50;i++){const y=stripY(start+i/200);power+=y*y;}
    windowRms.push(Math.sqrt(power/50));
  }
  assert.ok(Math.max(...windowRms)>Math.min(...windowRms)*2.5,'torsades should wax and wane');

  rhythmStrip.type='vf';
  const segment=(start)=>Array.from({length:200},(_,i)=>stripY(start+i/100));
  const a=segment(0),b=segment(2),c=segment(4);
  const meanDifference=(x,y)=>x.reduce((sum,v,i)=>sum+Math.abs(v-y[i]),0)/x.length;
  assert.ok(meanDifference(a,b)>0.20,'VF repeated after two seconds');
  assert.ok(meanDifference(a,c)>0.20,'VF repeated after four seconds');
});

test('live strip schedules PVCs with early wide beats, no P, and compensatory pauses',()=>{
  const {stripY,stripSchedule,rhythmStrip:s}=ecgHelpers();
  s.type='sinus';s.rate=80;s.ectopy='frequent';
  stripSchedule(10);
  const index=s.beats.findIndex(b=>b.pvc),b=s.beats[index];
  assert.ok(b.wide&&!b.p);assert.ok(index>0);
  assert.ok(Math.abs(s.beats[index+1].t-s.beats[index-1].t-1.5)<1e-9);
  assert.ok(stripY(b.t)<-.8);
  assert.ok(s.beats.filter(b=>b.pvc).length>=2);
});


test('server-rejected arrivals and interrupted transport override optimistic skip and sound state', () => {
  const helper = source.slice(source.indexOf('function applyAuthoritativeTransportState('), source.indexOf('// ── END CALL button'));
  const c = vm.createContext({ window: {} });
  vm.runInContext('let arrivedAtHospital=true, hasPlayedDepart=true, hasPlayedLoading=true;\n' + helper
    + '\nthis.state=()=>({arrived:arrivedAtHospital,moving:hasPlayedDepart,loaded:hasPlayedLoading,sound:window._isMoving});', c);
  c.applyAuthoritativeTransportState({ arrived:false, moving:false, hasLoaded:false }, 'to_arrival');
  assert.equal(c.state().arrived, false);
  assert.equal(c.state().moving, false);
  assert.equal(c.state().loaded, false);
  assert.equal(c.state().sound, false);
  c.applyAuthoritativeTransportState({ arrived:false, moving:true, hasLoaded:true });
  assert.equal(c.state().moving, true);
  assert.equal(c.state().sound, true);
  c.applyAuthoritativeTransportState({ arrived:true, moving:false, hasLoaded:true });
  assert.equal(c.state().arrived, true);
});

test('cosmetic 3-lead texture is intermittent on scene and stronger in transport without changing the rhythm',()=>{
  const {stripY,stripArtifactY,stripSchedule,rhythmStrip:s}=ecgHelpers();
  Object.assign(s,{type:'sinus',rate:80,motionSeed:17,motionMix:0});stripSchedule(10);
  const beats=JSON.stringify(s.beats),clean=Array.from({length:1000},(_,i)=>stripY(i/100));
  const rms=mode=>{let power=0;for(let t=0;t<180;t+=.02){const a=stripArtifactY(t,mode);assert.ok(Number.isFinite(a)&&Math.abs(a)<.14);power+=a*a;}return Math.sqrt(power/9000);};
  assert.equal(rms('clean'),0);assert.ok(rms('transport')>rms('auto')*1.5);
  const levels=Array.from({length:180},(_,t)=>Math.abs(stripArtifactY(t,'auto')));
  assert.ok(levels.some(a=>a===0),'quiet stretches stay exactly clean');assert.ok(levels.some(a=>a>.005),'scene episodes are visible');
  assert.equal(JSON.stringify(s.beats),beats,'artifact never schedules ectopy');
  assert.deepEqual(Array.from({length:1000},(_,i)=>stripY(i/100)),clean,'intrinsic waveform is unchanged');
  const frozen=Array.from({length:500},(_,i)=>stripArtifactY(i/100,'transport'));
  assert.deepEqual(frozen,Array.from({length:500},(_,i)=>stripArtifactY(i/100,'transport')));
  s.motionSeed=73;assert.notDeepEqual(frozen,Array.from({length:500},(_,i)=>stripArtifactY(i/100,'transport')),'different calls have different texture');
  s.type='asystole';assert.ok(Array.from({length:500},(_,i)=>Math.abs(stripArtifactY(i/100,'transport'))).every(a=>a<.025),'flat traces cannot acquire VF-sized artifact');
});

test('on-scene artifact is absent in most episode windows and transport mix is continuous',()=>{
  const {stripArtifactY,rhythmStrip:s}=ecgHelpers();Object.assign(s,{type:'sinus',motionSeed:17});
  let active=0;
  for(let block=0;block<100;block++){if(Array.from({length:28},(_,n)=>stripArtifactY(block*28+n,'auto',0)).some(v=>v!==0))active++;}
  assert.ok(active>15&&active<45,`${active}% of eligible scene windows had texture`);
  let cleanCalls=0;
  for(let seed=0;seed<40;seed++){s.motionSeed=seed;let noisy=false;for(let t=0;t<560;t+=2)if(stripArtifactY(t,'auto',0)!==0)noisy=true;if(!noisy)cleanCalls++;}
  assert.ok(cleanCalls>8&&cleanCalls<30,`${cleanCalls}/40 calls stayed clean on scene`);
  s.motionSeed=17;
  for(let t=1;t<10;t+=.11){const scene=stripArtifactY(t,'auto',0),travel=stripArtifactY(t,'auto',1);assert.ok(Math.abs(stripArtifactY(t,'auto',.5)-(scene+travel)/2)<1e-10);}
});

test('live HR readout follows completed AFib intervals without looking ahead or changing clinical HR',()=>{
  const {stripHeartRateReadout,rhythmStrip:s}=ecgHelpers();
  Object.assign(s,{type:'afib',rate:100,waveSeed:17,hrBeats:[],hrLastBeat:-Infinity,
    beats:[.2,.8,1.20,2.00,2.42,3.20,3.63,4.42,4.85,5.65,6.05,6.85].map(t=>({t}))});
  assert.equal(stripHeartRateReadout(s,.1),100);
  const fast=stripHeartRateReadout(s,1.21),slow=stripHeartRateReadout(s,2.01);
  assert.ok(fast>130,`short RR: ${fast}`);assert.ok(slow<90,`long RR: ${slow}`);
  assert.ok(fast-slow>40,'AFib readout varies substantially within a turn');
  assert.ok(s.hrBeats.every(t=>t<=2.01),'future scheduled QRS cannot affect the current rate');
  assert.equal(s.rate,100,'the patient’s clinical HR remains unchanged');
  assert.equal(s.beats.length,12,'readout never reschedules the strip');
  assert.equal(s.hrLastBeat,2);
});

test('organized rhythms fluctuate only a couple bpm, and unorganized/zero-rate rhythms never acquire a false HR',()=>{
  for(const [type,rate] of [['sinus',80],['sinus_brad',42],['sinus_tach',130],['aflutter',150],['paced',70],['vt',185],['torsades',220],['pea',45]]) {
    const {stripHeartRateReadout,rhythmStrip:s}=ecgHelpers();Object.assign(s,{type,rate,waveSeed:17});
    const readings=Array.from({length:60},(_,i)=>stripHeartRateReadout(s,i*.9));
    assert.ok(readings.every(n=>Math.abs(n-rate)<=2),type);assert.ok(new Set(readings).size>=3,type+' has visible readout variation');
    assert.equal(s.rate,rate);
  }
  for(const [type,rate] of [['vf',0],['asystole',0],['vf',180],['sinus',0]]) {
    const {stripHeartRateReadout,rhythmStrip:s}=ecgHelpers();Object.assign(s,{type,rate});
    for(const t of [0,1,20])assert.equal(stripHeartRateReadout(s,t),0);
  }
  const {stripHeartRateReadout,rhythmStrip:s}=ecgHelpers();s.type=null;assert.equal(stripHeartRateReadout(s,5),null);
});

test('dropped atrial impulses do not contaminate AFib ventricular intervals and slow AFib retains prior completed beats',()=>{
  const {stripHeartRateReadout,rhythmStrip:s}=ecgHelpers();
  Object.assign(s,{type:'afib',rate:40,waveSeed:17,beats:[{t:0},{t:.5,dropped:true},{t:1.8}]});
  const first=stripHeartRateReadout(s,1.81);assert.ok(first>=32&&first<=35);
  s.beats=[{t:1.8},{t:3}]; // Scheduler pruned old beats, as it does on the live strip.
  const next=stripHeartRateReadout(s,3.01);assert.ok(next>=45&&next<=48);
  assert.deepEqual(Array.from(s.hrBeats),[0,1.8,3]);
});

test('HR DOM updates use one cadence and restore the live reading after a same-rhythm turn refresh',()=>{
  const attrs={textContent:'100'},sourceStart=source.indexOf('const RHYTHM_RATE_DEFAULT ='),sourceEnd=source.indexOf('/* Dim dashed baseline');
  const c=vm.createContext({document:{getElementById:()=>null,querySelectorAll:()=>[attrs]},Math,
    TwelveLead:require('../public/twelve-lead')});
  vm.runInContext(source.slice(sourceStart,sourceEnd)+'\nthis.s=rhythmStrip;',c);
  Object.assign(c.s,{active:true,type:'afib',rate:100,waveSeed:17,clock:1.21,beats:[{t:.2},{t:.8},{t:1.2}]});
  c.refreshStripHeartRate();const first=attrs.textContent;assert.ok(Number(first)>130);
  c.s.clock=1.3;attrs.textContent='100';c.refreshStripHeartRate(true);
  assert.equal(attrs.textContent,first,'a new turn cannot pin the readout back to the base HR');
  assert.equal(c.s.hrNextUpdate,6.21,'a same-rhythm turn cannot postpone the next scheduled reading');
  c.s.clock=1.4;c.s.beats.push({t:1.4});c.refreshStripHeartRate();assert.equal(attrs.textContent,first,'not updated on every animation frame');
  for(const t of [2.2,3,3.8,4.6]) {
    c.s.clock=t+.01;c.s.beats=[{t}];c.refreshStripHeartRate();
  }
  assert.deepEqual(Array.from(c.s.hrBeats),[2.2,3,3.8,4.6],'completed beats remain tracked while the number is held and old drawing beats are removed');
  c.s.clock=5;c.refreshStripHeartRate();assert.equal(attrs.textContent,first,'reading held for five seconds');
  c.s.clock=6.21;c.refreshStripHeartRate();assert.notEqual(attrs.textContent,first);
  assert.ok(Number(attrs.textContent)>=74&&Number(attrs.textContent)<=76,'the new value uses recent intervals rather than the full display hold');
  c.s.active=false;attrs.textContent='72';c.s.clock=10;c.refreshStripHeartRate(true);assert.equal(attrs.textContent,'72','manual HR stays measured rather than fluctuating without a monitor');
});
