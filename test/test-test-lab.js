'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const app = require('../dev/test-lab/server');
const { CREW } = require('../src/data/crew');
const html = fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const source = fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
function fixture(overrides={}) {
  const node = () => ({style:{},setAttribute(){},append(){}});
  const context = vm.createContext({
    window:{setTimeout,setInterval,parent:{dispatchEvent(){}}},
    document:{createElement:node,head:{append(){}},querySelectorAll:()=>[]},
    performance:{now:()=>0}, PatientPrivacy:{start:()=>()=>{}},
    eightball:node(),eightballResponse:node(),terminal:node(),
    soundEnabled:false,cancelActiveShock:null,DRUG_CARDS:[],TwelveLead:require('../public/twelve-lead'),Event:class {},
    clearTimeout,clearInterval,...overrides,
  });
  vm.runInContext(source.slice(source.indexOf('const SOUNDS ='),source.indexOf('// One gesture-unlocked')),context);
  vm.runInContext(source.slice(source.indexOf('const SCALPEL_PROCS'),source.indexOf('// Triggers the laryngoscope')),context);
  vm.runInContext(source.slice(source.indexOf('const TRANSPORT_TIMING ='),source.indexOf('function animateTransportScene')),context);
  vm.runInContext(source.slice(source.indexOf('const PROCEDURE_TIMING ='),source.indexOf('const PROCEDURE_FADE_MS')),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dev/test-lab/frame.js'),'utf8'),context);
  return context.window.EMSTestLab;
}
test('lab registers every production animation overlay, with unique IDs and real scene timing',()=>{
  const api=fixture(), registered=new Set(api.scenes.map(s=>s.overlay));
  const overlays=[...html.matchAll(/id="([a-z_]+)-overlay"/g)].map(m=>m[1]).filter(id=>!['auth','progress'].includes(id));
  assert.deepEqual(overlays.filter(id=>!registered.has(id)),[]);
  assert.equal(new Set(api.scenes.map(s=>s.id)).size,api.scenes.length);
  for(const scene of api.scenes)assert.ok(scene.duration>0,scene.id);
  for(const id of ['cardioversion','rsi','medpush_io','blood_IO','fluid_IV'])assert.ok(api.scenes.some(s=>s.id===id));
  assert.equal(api.scenes.find(s=>s.id==='lateral_canthotomy')?.overlay,'scalpel');
  for(const cue of api.sounds)assert.ok(fs.existsSync(path.join(__dirname,'../public',cue.src)),cue.src);
});
test('lab quality control reaches the production paper independently of pleth quality',()=>{
  let vitals;
  const api=fixture({
    document:{createElement:()=>({style:{},setAttribute(){},append(){}}),head:{append(){}},body:{classList:{add(){},remove(){}}},getAnimations:()=>[],querySelectorAll:()=>[]},
    stopAllSounds(){},stopRhythmStrip(){},updateCapnography(){},plethStrip:{update(){}},applyVitals(v){vitals=v;},
  });
  for(const [ecgQuality,definition] of Object.entries(api.catalog.qualities)) {
    const paper=api.monitor({rhythm:'sinus',rate:80,pattern:'brugada',view:'standard',quality:'good',ecgQuality});
    assert.ok(paper.includes(definition.label));
    assert.equal(vitals.PulseOx.quality,'good');assert.equal(vitals.HR,80);
    assert.equal(paper.includes('quality prevents further interpretation'),ecgQuality!=='SUCCESS');
  }
});
test('frame preferences stay in memory, independent of existing player storage',()=>{
  const window={localStorage:{getItem:()=> 'real saved progress'}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dev/test-lab/isolate.js'),'utf8'),{window,Map,Object,String});
  assert.equal(window.localStorage.getItem('ems_guest_progress'),null);
  window.localStorage.setItem('example',123);
  assert.equal(window.localStorage.getItem('example'),'123');
  window.localStorage.clear();assert.equal(window.localStorage.length,0);
});
test('loopback presentation server serves real assets and blocks gameplay writes',async()=>{
  const server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.on('error',reject);});
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const frame=await(await fetch(base+'/lab/frame')).text();
    assert.ok(frame.includes('app.js?v='));assert.ok(frame.includes('/lab/frame.js'));
    assert.ok(frame.indexOf('/lab/isolate.js')<frame.indexOf('app.js?v='));
    assert.doesNotMatch(frame,/<script[^>]+src="\/?analytics/);
    const crew=await(await fetch(base+'/lab/crew')).json();
    assert.deepEqual(crew.filter(c=>!c.custom),CREW);
    assert.equal(crew.filter(c=>c.custom).length,2);
    for(const route of ['/api/scenario/new','/api/auth/cosmetics','/api/auth/login']) {
      assert.equal((await fetch(base+route,{method:'POST'})).status,403);
    }
    assert.deepEqual(await(await fetch(base+'/api/scenario/resume')).json(),{session:null});
    assert.match(await(await fetch(base+'/')).text(),/EMS Test Lab/);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
