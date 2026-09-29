'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const ECG=require('../public/twelve-lead');
const {acquireTwelveLeads}=require('../src/engine/twelve-lead');
const make=(presentation,Rhythm='sinus',HR=80,outcome='SUCCESS')=>ECG.create({seed:{presentation},vitals:{Rhythm,HR},outcome,id:'test'});

test('all monitor rhythms render twelve finite lead signals at captured rates',()=>{
  for(const [Rhythm,rate] of Object.entries(ECG.rates)){
    const e=make('Inferior STEMI',Rhythm,rate);
    assert.equal(e.rhythm,Rhythm);assert.equal(e.rate,rate);assert.equal(Object.keys(e.leads).length,12);
    for(const lead of ECG.names) for(let t=0;t<10;t+=.037)assert.ok(Number.isFinite(ECG.sample(e,lead,t)),`${Rhythm} ${lead}`);
    const paper=ECG.svg(e);assert.ok(!/NaN|undefined/.test(paper));assert.ok(paper.includes('II · 10 s'));
  }
});
test('regional injury distributions and reciprocal depression follow case identity, not hint differentials',()=>{
  const cases=require('../src/data/scenarios/cardiac');
  // Module exports are a roster; check the actual shipped location descriptions.
  const list=Array.isArray(cases)?cases:Object.values(cases).find(Array.isArray);
  for(const [prefix,lead,reciprocal] of [['Anteroseptal','V3','III'],['Inferior','III','aVL'],['Lateral','V5','III']]){
    const seed=list.find(s=>s.presentation.startsWith(prefix+' STEMI'));const e=ECG.create({seed,vitals:{HR:80,Rhythm:'sinus'}});
    assert.ok(e.leads[lead].st>=.1,prefix);assert.ok(e.leads[reciprocal].st<0,prefix);
  }
  const post=make('Posterior STEMI');assert.ok(post.leads.V2.st<0&&post.leads.V2.r>post.leads.V2.s);
  assert.equal(ECG.selectPattern({presentation:'Myocarditis, no STEMI pattern',hint:'Consider anterior STEMI'},.2),'normal');
  assert.equal(ECG.selectPattern({presentation:'Panic attack',hint:'Exclude STEMI, Brugada and long QT'},.2),'normal');
});
test('tachyarrhythmia and pacing supersede primary injury, bradycardia preserves it',()=>{
  for(const rhythm of ['vt','torsades','vf','asystole','svt','paced','afib','aflutter']){
    const e=make('Anteroseptal STEMI',rhythm,ECG.rates[rhythm]);assert.ok(e.leads.V3.st<.1,rhythm);
  }
  for(const rhythm of ['sinus_brad','av_block_1','av_block_2_i','av_block_2_ii','av_block_3','junctional'])assert.ok(make('Inferior STEMI',rhythm,45).leads.III.st>.2,rhythm);
  assert.ok(make('Inferior STEMI','afib',45).leads.III.st>.2);
  const wpw=make('Pre-excited atrial fibrillation (WPW with AFib)','vt',230);
  assert.ok(wpw.preexcited);assert.notEqual(wpw.beats[2].width,wpw.beats[3].width);
});
test('OMI, ischemia and noncardiac patterns remain anatomically distinct',()=>{
  const winter=make('De Winter OMI');assert.ok(winter.leads.V3.st<0&&winter.leads.V3.t>.7&&winter.leads.aVR.st>0);
  const aslanger=make('Aslanger pattern');assert.ok(aslanger.leads.III.st>0&&aslanger.leads.II.st<=0&&aslanger.leads.V5.st<0&&aslanger.leads.V2.st===0);
  const brain=make('Subarachnoid hemorrhage');assert.ok(brain.leads.V4.t<-.6&&brain.qtScale>1);
  const cold=make('Hypothermia','sinus_brad',38);assert.ok(cold.leads.V4.j>.2&&cold.leads.V1.j<0&&cold.qtScale>1);
  const wellens=make('Wellens syndrome');assert.ok(wellens.leads.V3.t<0&&wellens.leads.V3.st===0);
  const nstemi=make('NSTEMI');assert.ok(nstemi.leads.V5.st<0||nstemi.leads.V5.t<0);
});
test('snapshot survives persistence, rates change beat density, artifact increases with worse rolls',()=>{
  const e=make('Inferior STEMI');const frozen=ECG.svg(e);
  assert.equal(ECG.svg(JSON.parse(JSON.stringify(e))),frozen);
  assert.ok(make('Inferior STEMI','sinus',140).beats.length>make('Inferior STEMI','sinus',45).beats.length);
  let previous=0;
  for(const quality of ['SUCCESS','MARGINAL','FAILURE','COMPLICATION']){const e=make('Inferior STEMI','sinus',80,quality);assert.ok(e.noise>previous);previous=e.noise;}
  assert.equal(ECG.svg(e),frozen);
  for(const rhythm of ['av_block_2_i','av_block_2_ii']){
    const e=make('',rhythm,48);const count=e.beats.filter(b=>!b.dropped&&b.t>=0&&b.t<10).length;
    assert.ok(Math.abs(count-8)<=1,`${rhythm}: ${count} ventricular beats in 10 seconds`);
  }
});
test('only performed acquisitions are filed and another patient never inherits primary pathology',()=>{
  const request={seed:{presentation:'Inferior STEMI'},vitals:{HR:75,Rhythm:'sinus'},minute:4,turn:2};
  assert.deepEqual(acquireTwelveLeads({...request,rolls:[{procedure_id:'cardiac_monitor',no_roll:true}]}),[]);
  const rolls=[{procedure_id:'twelve_lead',outcome:'MARGINAL'}];
  const first=acquireTwelveLeads({...request,rolls})[0];assert.equal(first.patientId,'patient_1');assert.ok(first.leads.III.st>0);
  const second=acquireTwelveLeads({...request,rolls,patientId:'patient_2'})[0];assert.equal(second.leads.III.st,0);
  assert.deepEqual(acquireTwelveLeads({...request,rolls})[0],first);
});

test('real session acquisition captures final rhythm once and retains earlier paper across serial turns and restore',async()=>{
  let response='';
  require.cache[require.resolve('../src/engine/api')]={exports:{sendTurn:async()=>response,sendDebrief:async()=>''}};
  require.cache[require.resolve('../src/server/adminLogger')]={exports:{logRun(){},updateRunDebrief(){}}};
  require.cache[require.resolve('../src/engine/logger')]={exports:{logEvent(){},closeScenario(){}}};
  const {Session}=require('../src/engine/session');
  const {rollScenario}=require('../src/engine/roller');
  const seed={...rollScenario({random_seed:'ecg-integration'}),presentation:'Inferior STEMI',provider_level:'ALS'};
  const session=new Session(seed,'ecg-session');
  response='The monitor is attached. [VITALS: HR=42 Rhythm=sinus_brad] [TIME: 1:00]';
  await session.send('Place the cardiac monitor');
  assert.equal(session.turns.flatMap(t=>t.twelveLeads||[]).length,0);
  response='The ECG paper is filed in More Vitals. The 12-lead shows ST elevation in II, III and aVF. [VITALS: HR=42 Rhythm=sinus_brad] [TIME: 2:00]';
  await session.send('Obtain a 12 lead ECG');
  assert.ok(!session.turns.at(-1).assistant.includes('ST elevation'));
  const first=session.turns.at(-1).twelveLeads[0];assert.ok(first);assert.equal(first.rate,42);assert.equal(first.minute,2);assert.ok(first.leads.III.st>0);
  const original=ECG.svg(first);
  response='Another ECG paper is filed in More Vitals. [VITALS: HR=70 Rhythm=paced] [TIME: 4:00]';
  await session.send('Obtain a 12 lead ECG');
  const next=session.turns.at(-1).twelveLeads[0];assert.equal(next.rhythm,'paced');assert.notEqual(next.id,first.id);
  response='The patient answers. [VITALS: HR=90 Rhythm=sinus] [TIME: 5:00]';
  await session.send('Ask about allergies');assert.equal(session.turns.at(-1).twelveLeads.length,0);
  const restored=new Session(seed);restored.turns=JSON.parse(JSON.stringify(session.turns));
  const filed=restored.turns.flatMap(t=>t.twelveLeads||[]);assert.equal(filed.length,2);assert.equal(ECG.svg(filed[0]),original);
});

test('cardiac comorbidities generate stable non-infarct LVH and LBBB mimics',()=>{
  const seed={presentation:'Lightheadedness after standing',comorbidity_bundle:'compensated_cardiac_history'};
  assert.equal(ECG.selectPattern(seed,.1),'lbbb');assert.equal(ECG.selectPattern(seed,.8),'lvh');
  assert.equal(ECG.selectPattern({...seed,comorbidity_bundle:'metabolic_syndrome'},.8),'lvh');
  assert.equal(ECG.selectPattern({...seed,presentation:'Inferior STEMI'},.1),'inferior');
  assert.equal(ECG.selectPattern({...seed,comorbidity_bundle:'otherwise_healthy'},.1),'normal');
  const lvh=make('LVH'),lbbb=make('LBBB');
  assert.ok(lvh.leads.V1.s+lvh.leads.V5.r>=3.5);
  assert.ok(lvh.leads.V1.st>0&&lvh.leads.V5.st<0&&lvh.leads.V5.t<0);
  assert.ok(lbbb.beats.every(b=>b.width>=.12));assert.equal(lbbb.leads.V5.q,0);
  assert.ok(lbbb.leads.V1.s>lbbb.leads.V1.r&&lbbb.leads.V5.lbbb);
  for(const e of [lvh,lbbb]){assert.equal(e.machine.headline,'*** ACUTE MI SUSPECTED ***');assert.ok(ECG.svg(e).includes('font-size="23" font-weight="bold">*** ACUTE MI SUSPECTED ***'));}
});
test('HCM dagger Q waves, Brugada coved ST and long QT are actual waveform features',()=>{
  const hcm=make('Hypertrophic obstructive cardiomyopathy');
  for(const lead of ['I','aVL','V5','V6']){assert.ok(hcm.leads[lead].q>.5);assert.ok(hcm.leads[lead].qWidth<.01);}
  const brugada=make('Brugada syndrome');assert.ok(brugada.leads.V1.coved&&brugada.leads.V1.st>=.2&&brugada.leads.V1.t<0);
  const long=make('Prolonged QT syndrome'),normal=make('Normal');
  assert.ok(long.qtScale>normal.qtScale);
  // T wave peak shifts right in the drawn waveform, not just in metadata.
  const peak=e=>{const b=e.beats.find(b=>b.t>1);let at=0,max=-Infinity;for(let d=.18;d<.55;d+=.002){const y=ECG.sample(e,'II',b.t+d);if(y>max){max=y;at=d;}}return at;};
  assert.ok(peak(long)-peak(normal)>.06);
});
test('auto interpretation is stable, optional, and intentionally misleading with quality/pacing exceptions',()=>{
  const normal=make('Normal');assert.ok(normal.machine.lines.some(l=>/infarct/.test(l)));
  assert.ok(ECG.svg(normal).includes('Abnormal ECG'));
  assert.ok(!ECG.svg(normal,{autoInterpret:false}).includes('Abnormal ECG'));
  assert.deepEqual(ECG.create({id:'same'}).machine,ECG.create({id:'same'}).machine);
  for(const outcome of ['MARGINAL','FAILURE','COMPLICATION'])assert.deepEqual(make('Normal','sinus',80,outcome).machine.lines,['12 lead quality prevents further interpretation.']);
  for(const outcome of ['SUCCESS','MARGINAL'])assert.deepEqual(make('Inferior STEMI','paced',70,outcome).machine.lines,['Paced Rhythm: No further interpretation.']);
  let normalSinus=0;
  for(let i=0;i<100;i++){const e=ECG.create({id:String(i)});if(e.machine.lines.includes('Normal Sinus Rhythm'))normalSinus++;assert.ok(e.machine.lines.some(l=>/infarct/.test(l)));}
  assert.ok(normalSinus<15);
  const unannotated=ECG.svg(normal,{autoInterpret:false});
  const paths=s=>[...s.matchAll(/<path d="([^"]+)" fill="none" stroke="#272524"/g)].filter(m=>m[1].includes(',')).map(m=>m[1].replace(/,\d+(?:\.\d+)?/g,',Y'));
  assert.deepEqual(paths(ECG.svg(normal)),paths(unannotated),'option does not alter waveform timing');
});
test('narration removes printed ECG findings while preserving patient and procedure observations',()=>{
  const {stripTwelveLeadNarration:strip}=require('../src/engine/twelve-lead');
  assert.equal(strip('Patient remains pale. The 12-lead shows ST elevation in II, III and aVF. The paper is filed. BP is 90/60.',true),'Patient remains pale. The paper is filed. BP is 90/60.');
  assert.equal(strip('The ECG suggests an inferior infarct. Reciprocal ST depression is present in aVL.',true),'12-lead printout filed in More Vitals.');
  assert.equal(strip('The 12-lead looks normal.'),'');
  assert.equal(strip('12-lead: 2 mm elevation in the inferior leads.',true),'12-lead printout filed in More Vitals.');
  assert.equal(strip('The patient states they had an infarct in 2014.'),'The patient states they had an infarct in 2014.');
  assert.equal(strip('12-lead deferred while you ventilate the patient.'),'12-lead deferred while you ventilate the patient.');
});

test('every catalog pattern and rhythm automatically gets increasingly noisy quality variants',()=>{
  const catalog=ECG.catalog;
  for(const [key,definition] of Object.entries(catalog.patterns)){
    const resolved=catalog.resolvePattern(key);
    for(const [list,properties] of resolved.overlays){
      for(const lead of list.split(' '))assert.ok(ECG.names.includes(lead),`${key}: invalid lead ${lead}`);
      for(const v of Object.values(properties))assert.ok(typeof v==='boolean'||Number.isFinite(v),key);
    }
    if(definition.choose)for(const v of [0,.49,.51,.99])assert.ok(catalog.patterns[definition.choose(v)]);
  }
  const scenarios=[...Object.keys(catalog.patterns).flatMap(key=>[40,80,140].map(HR=>({seed:{ecg_pattern:key},vitals:{Rhythm:'sinus',HR}}))),
    ...Object.entries(catalog.rhythms).flatMap(([Rhythm,r])=>(r.variants||[undefined]).map(rhythmVariant=>({vitals:{Rhythm,HR:r.rate},rhythmVariant})))];
  for(const scenario of scenarios){
    let previous=-1;
    for(const outcome of Object.keys(catalog.qualities)){
      const record=ECG.create({...scenario,id:'quality-contract',outcome});
      let error=0;
      for(const lead of ECG.names)for(let t=0;t<10;t+=.071){
        const actual=ECG.sample(record,lead,t),clean=ECG.sample({...record,noise:0},lead,t);
        assert.ok(Number.isFinite(actual));error+=(actual-clean)**2;
      }
      assert.ok(error>previous,`${JSON.stringify(scenario)} ${outcome}: artifact must increase`);previous=error;
      assert.equal(ECG.sample(JSON.parse(JSON.stringify(record)),'II',2.123),ECG.sample(record,'II',2.123));
    }
  }
});

test('asystole has flat and gently wandering baselines, no complexes, and shared poor-quality variants',()=>{
  const variants=new Set();
  for(let i=0;i<40;i++)variants.add(ECG.create({id:String(i),vitals:{Rhythm:'asystole'}}).rhythmVariant);
  assert.deepEqual([...variants].sort(),['flat','wander']);
  for(const rhythmVariant of variants){
    const options={vitals:{Rhythm:'asystole',HR:80},rhythmVariant,id:'asystole'};
    const clean=ECG.create(options),poor=ECG.create({...options,outcome:'FAILURE'});
    assert.equal(clean.rate,0);assert.deepEqual(clean.beats,[]);assert.equal(ECG.measurements(clean).qrs,'—');
    let max=0;
    for(const lead of ECG.names)for(let t=0;t<10;t+=.01){const y=ECG.sample(clean,lead,t);max=Math.max(max,Math.abs(y));if(rhythmVariant==='flat')assert.equal(y,0);}
    if(rhythmVariant==='wander')assert.ok(max>.01&&max<=.025,'submillimetre baseline wander');
    assert.ok(poor.noise>=.14);assert.notEqual(ECG.sample(clean,'II',2),ECG.sample(poor,'II',2));
    assert.equal(ECG.svg(clean),ECG.svg(JSON.parse(JSON.stringify(clean))));
  }
  assert.throws(()=>ECG.create({vitals:{Rhythm:'asystole'},rhythmVariant:'typo'}),/Unknown ECG rhythm variant/);
  const old=ECG.create({vitals:{Rhythm:'asystole'},rhythmVariant:'flat'});
  delete old.rhythmVariant;delete old.waveform;delete old.pWaves;old.version=1;old.noise=.008;
  assert.ok(Number.isFinite(ECG.sample(old,'II',1)),'existing saved recordings remain readable');
});

test('catalog and generator load in the browser and new presets inherit their family physiology',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const context=vm.createContext({});
  let catalog=fs.readFileSync(require.resolve('../public/ecg-catalog'),'utf8');
  catalog=catalog.replace('const rhythms={',"const rhythms={ teaching_escape:{waveform:'idioventricular',rate:32},");
  catalog=catalog.replace('const patterns={',"const patterns={ teaching_pattern:{extends:['lvh'],overlays:[['II',{q:.4}]]},");
  vm.runInContext(catalog,context);vm.runInContext(fs.readFileSync(require.resolve('../public/twelve-lead'),'utf8'),context);
  const runtime=context.TwelveLead;
  const record=runtime.create({vitals:{Rhythm:'teaching_escape'},seed:{ecg_pattern:'teaching_pattern'},outcome:'FAILURE'});
  assert.equal(record.rhythm,'teaching_escape');assert.equal(record.waveform,'idioventricular');assert.equal(record.rate,32);
  assert.ok(record.beats.every(b=>b.width===.16));assert.equal(record.leads.II.q,.4);assert.equal(record.leads.V5.r,2);
  assert.ok(record.noise>=.14);assert.ok(Number.isFinite(runtime.sample(record,'II',2)));
});

test('new acquisitions pop up once; restore stays quiet and notebook patient does not hide another patient’s new paper',()=>{
  const vm=require('node:vm'),fs=require('node:fs');
  const nodes=new Map();
  function element(){
    const handlers={};return {value:'',open:false,innerHTML:'',textContent:'',hidden:false,children:[],
      classList:{remove(){},toggle(){return true;}},setAttribute(){},
      addEventListener(name,callback){handlers[name]=callback;},fire(name){handlers[name]?.();},
      replaceChildren(){this.children=[];this.value='';},appendChild(o){this.children.push(o);},
      showModal(){this.open=true;this.opens=(this.opens||0)+1;},close(){this.open=false;this.fire('close');}};
  }
  const doc={getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element};
  const context=vm.createContext({TwelveLead:{svg:e=>e.id}});
  vm.runInContext(fs.readFileSync(require.resolve('../public/twelve-lead-viewer'),'utf8'),context);
  const viewer=context.TwelveLeadViewer.mount(doc),dialog=doc.getElementById('ecg-dialog'),paper=doc.getElementById('ecg-paper');
  const first={id:'first',patientId:'patient_1',minute:2,quality:'Standard'};
  viewer.update([first]);assert.equal(dialog.open,false,'restore must not open');
  const next={...first,id:'second'};
  viewer.update([first,next],{openNew:true});assert.equal(dialog.open,true);assert.equal(paper.innerHTML,'second');
  viewer.close();viewer.update([first,next],{openNew:true});assert.equal(dialog.open,false,'duplicate response must not reopen');
  const other={...first,id:'other-patient',patientId:'patient_2'};
  viewer.update([first,next,other],{openNew:true});assert.equal(paper.innerHTML,'other-patient');
  viewer.setPatient('patient_1');viewer.setAutoInterpret(false);assert.equal(paper.innerHTML,'other-patient','notebook updates preserve acquired paper');
  viewer.close();doc.getElementById('ecg-open').fire('click');assert.equal(paper.innerHTML,'second','notebook can reopen latest selected patient paper');
  assert.equal(dialog.opens,3);
});

test('scenario catalog ECG pins survive rolling and reach the acquired recording',()=>{
  const {catalog,prepareInstructor}=require('../src/engine/instructor');
  const {rollScenario}=require('../src/engine/roller');
  const instructor=prepareInstructor({case_id:catalog().find(e=>e.category==='cardiac').case_id});
  instructor.entry={...instructor.entry,ecg_pattern:'brugada',ecg_rhythm_variant:'wander'};
  const seed=rollScenario({instructor});
  assert.equal(seed.ecg_pattern,'brugada');assert.equal(seed.ecg_rhythm_variant,'wander');
  const record=acquireTwelveLeads({seed,vitals:{Rhythm:'asystole',HR:0},rolls:[{procedure_id:'twelve_lead',outcome:'MARGINAL'}]})[0];
  assert.equal(record.rhythmVariant,'wander');assert.ok(record.noise>.012);
  const sinus=ECG.create({seed,vitals:{Rhythm:'sinus',HR:80}});
  assert.ok(sinus.leads.V1.coved);
});
