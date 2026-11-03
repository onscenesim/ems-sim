'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');

test('a batch of transcript updates scrolls once to the final height and later updates still scroll',()=>{
  const frames=[];
  let height=0, reads=0;
  const output={scrollTop:0,get scrollHeight(){reads++;return height;}};
  const c=vm.createContext({output,requestAnimationFrame:fn=>{frames.push(fn);return frames.length;}});
  vm.runInContext(source.slice(source.indexOf('let outputScrollFrame ='),source.indexOf('// ── API helpers')),c);
  for(let i=0;i<80;i++){height+=20;c.scrollBottom();}
  assert.equal(reads,0);
  assert.equal(frames.length,1);
  frames.shift()();
  assert.equal(reads,1);
  assert.equal(output.scrollTop,1600);
  height+=100;c.scrollBottom();frames.shift()();
  assert.equal(output.scrollTop,1700);
});

test('monitor frames reuse size until layout, visibility, or device pixel ratio changes',()=>{
  let reads=0,width=240,height=70,resize;
  const canvas={width:0,height:0,getContext(){return {};},
    get clientWidth(){reads++;return width;},get clientHeight(){reads++;return height;}};
  const c=vm.createContext({document:{getElementById:()=>canvas},window:{devicePixelRatio:1},
    TwelveLead:require('../public/twelve-lead'),
    ResizeObserver:class{constructor(fn){resize=fn;}observe(){}},stripIdle(){}});
  vm.runInContext(source.slice(source.indexOf('const RHYTHM_RATE_DEFAULT ='),source.indexOf('/* Schedule QRS')),c);
  assert.equal(c.stripSizeCanvas(),true);
  for(let i=0;i<120;i++)c.stripSizeCanvas();
  assert.equal(reads,2,'only one width/height read across 120 monitor frames');
  width=320;resize();c.stripSizeCanvas();assert.equal(canvas.width,320);
  width=0;height=0;resize();assert.equal(c.stripSizeCanvas(),false);
  width=240;height=70;resize();assert.equal(c.stripSizeCanvas(),true);
  c.window.devicePixelRatio=2;c.stripSizeCanvas();
  assert.equal(canvas.width,480);assert.equal(canvas.height,140);
});

test('scene reply repair uses the remaining turn deadline and preserves request options',async()=>{
  const calls=[];
  const apiPath=require.resolve('../src/engine/api');
  require.cache[apiPath]={exports:{sendTurn:async(_prompt,_messages,options)=>{
    calls.push(options);
    if(calls.length===1){await new Promise(resolve=>setTimeout(resolve,20));return "She's stable. Call a report to the hospital";}
    return 'The patient looks toward you and nods.\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[VITALS: HR=80 RR=18]\n[TIME: 1:00]';
  },sendDebrief:async()=>''}};
  const {Session}=require('../src/engine/session');
  const {rollScenario}=require('../src/engine/roller');
  const session=new Session(rollScenario({random_seed:'performance-test'}));
  const signal=new AbortController().signal;
  await session.send('Ask how the patient feels.',false,null,{}, {timeoutMs:1000,signal,ecgInk:'#123456'});
  assert.equal(calls.length,2);
  assert.equal(calls[0].timeoutMs,1000);
  assert.ok(calls[1].timeoutMs>0&&calls[1].timeoutMs<=990);
  assert.equal(calls[1].signal,signal);assert.equal(calls[1].ecgInk,'#123456');
  assert.equal(session.turns.length,1);
});
