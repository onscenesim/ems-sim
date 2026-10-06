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

  // Reproduce the debug transcript: the model claimed to file paper, but bare
  // hyphenated orders had no engine roll and therefore no recording or animation.
  const replay=new Session({...seed,presentation:'Acute angle-closure glaucoma'},'ecg-order-replay');
  replay.moving=true;
  response='The 12-lead electrodes are attached and the acquisition is completed. 12-lead printout filed in More Vitals. [VITALS: HR=80 Rhythm=sinus] [TIME: 14:30]';
  const result=await replay.send("Do a 12-Lead, and I can cover Billy's eye with an approprote cover");
  assert.deepEqual(result.rolls.map(r=>r.procedure_id),['twelve_lead']);
  assert.match(replay.messages.at(-2).content,/SYSTEM ROLL: twelve_lead/);
  assert.equal(replay.turns.at(-1).twelveLeads.length,1);
  const paper=ECG.svg(replay.turns.at(-1).twelveLeads[0]);
  response='The 12-lead printout is available for inspection under More Vitals. [TIME: 15:00]';
  assert.deepEqual((await replay.send('What do i see on the 12-lead?')).rolls,[]);
  assert.equal(replay.turns.at(-1).twelveLeads.length,0);
  for(const order of ['obtain a 12-lead','Repeat 12-;ead']) {
    response='A fresh 12-lead acquisition is run. 12-lead printout filed in More Vitals. [VITALS: HR=78 Rhythm=sinus] [TIME: 16:00]';
    assert.deepEqual((await replay.send(order)).rolls.map(r=>r.procedure_id),['twelve_lead']);
    assert.equal(replay.turns.at(-1).twelveLeads.length,1);
  }
  const recordings=replay.turns.flatMap(t=>t.twelveLeads);
  assert.equal(new Set(recordings.map(r=>r.id)).size,3);
  assert.equal(ECG.svg(recordings[0]),paper);
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
  assert.equal(strip('V4R shows ST elevation. The patient remains pale.'),'The patient remains pale.');
  assert.equal(strip('V7 shows posterior ST elevation.'),'');
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


test('popup and thumbnail SVGs own separate grid definitions with identical paper content',()=>{
  const record=ECG.create({seed:{presentation:'LBBB'},id:'same-record'});
  const thumb=ECG.svg(record,{idPrefix:'ecg-thumbnail'}),paper=ECG.svg(record,{idPrefix:'ecg-paper'});
  const ids=markup=>[...markup.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  assert.ok(ids(thumb).every(id=>!ids(paper).includes(id)),'hidden thumbnail cannot own popup paint servers');
  for(const markup of [thumb,paper])for(const [,ref] of markup.matchAll(/url\(#([^)]+)\)/g))assert.ok(ids(markup).includes(ref));
  assert.equal(thumb.replaceAll('ecg-thumbnail','surface'),paper.replaceAll('ecg-paper','surface'));
});

test('extended ECG orders select a single placement, including separate views in the same turn',()=>{
  const {detectWithConfirmation}=require('../src/engine/dice');
  for(const [view,texts] of Object.entries({posterior:['Obtain a posterior ECG','Get posterior 12-lead EKG','Run ECG with posterior leads','Acquire V7-V9'],
    right:['Get a right sided 12 lead','Obtain a right-sided EKG','Right sided ECGs'],v4r:['V4R','Obtain V4R ECG','Get ECG with V4R']})){
    for(const text of texts){const rolls=detectWithConfirmation(text).rolls;assert.deepEqual(rolls.map(r=>r.procedure_id),[ECG.catalog.views[view].procedure],text);}
  }
  const rolls=detectWithConfirmation('Obtain posterior leads and right-sided ECG').rolls;
  const recordings=acquireTwelveLeads({seed:{ecg_pattern:'posterior'},vitals:{HR:80,Rhythm:'sinus'},rolls,ink:'#71378b'});
  assert.deepEqual(recordings.map(e=>e.view).sort(),['posterior','right']);assert.equal(new Set(recordings.map(e=>e.id)).size,2);
  for(const text of ['Do not obtain a posterior ECG','Check right sided breath sounds','Palpate posterior ribs'])
    assert.equal(detectWithConfirmation(text).rolls.filter(r=>Object.hasOwn(ECG.catalog.procedureViews,r.procedure_id)).length,0,text);
});

test('all catalog pathologies inherit every placement and quality without altering unrelocated leads',()=>{
  for(const ecg_pattern of Object.keys(ECG.catalog.patterns))for(const outcome of Object.keys(ECG.catalog.qualities)){
    const opts={seed:{ecg_pattern},vitals:{Rhythm:'sinus',HR:75},entropy:77,outcome};
    const standard=ECG.create(opts),right=ECG.create({...opts,view:'right'});
    for(const view of ['posterior','right','v4r']){
      const e=view==='right'?right:ECG.create({...opts,view});
      assert.equal(e.noise,standard.noise);assert.deepEqual(e.beats,standard.beats);
      for(const lead of ECG.names){
        if(!ECG.catalog.views[view].leads[lead])assert.deepEqual(e.leads[lead],standard.leads[lead],`${ecg_pattern} ${view} ${lead}`);
        for(let t=0;t<10;t+=.237)assert.ok(Number.isFinite(ECG.sample(e,lead,t)),`${ecg_pattern} ${view} ${outcome}`);
      }
      if(view==='v4r')assert.deepEqual(e.leads.V4,right.leads.V4,'V4R must reuse the full right-sided V4 signal');
      assert.deepEqual(JSON.parse(JSON.stringify(e)).leads,e.leads);
    }
  }
  for(const Rhythm of ['vt','torsades','vf','asystole','paced','svt','afib','aflutter','junctional','idioventricular','av_block_3']){
    const opts={vitals:{Rhythm,HR:ECG.rates[Rhythm]},id:'rhythm-reuse'};
    const standard=ECG.create(opts);
    for(const view of ['right','posterior','v4r'])assert.deepEqual(ECG.create({...opts,view}).leads,standard.leads,Rhythm);
  }
});

test('posterior occlusion, RV infarction, diffuse subendocardial ischemia and mimics have distinct supplemental signals',()=>{
  const makeView=(ecg_pattern,view)=>ECG.create({seed:{ecg_pattern},view,vitals:{Rhythm:'sinus',HR:75},ink:'#71378b',id:'extended'});
  const post=makeView('posterior','posterior');
  for(const lead of ['V4','V5','V6'])assert.ok(post.leads[lead].st>.05,'V7–V9 elevation');
  const rv=makeView('rv_infarct','right');assert.ok(rv.leads.V4.st>.15);assert.ok(rv.leads.III.st>0);
  const sub=makeView('subendocardial','posterior');
  assert.ok(sub.leads.aVR.st>0);for(const lead of ['I','II','V4','V5','V6'])assert.ok(sub.leads[lead].st<0,'diffuse depression remains depression posteriorly');
  assert.equal(ECG.selectPattern({presentation:'Sub-endocardial ischemia'},.5),'subendocardial');
  const hcm=makeView('hcm','posterior');assert.ok(hcm.leads.V4.q>.3&&hcm.leads.V4.qWidth<.01);
  const lbbb=makeView('lbbb','right');assert.ok(lbbb.leads.V4.lbbb&&lbbb.leads.V4.st>0);
  assert.ok(makeView('normal','right').leads.V4.st===0);assert.ok(makeView('normal','posterior').leads.V4.st===0);
  assert.equal(makeView('normal','right').leads.V4.st,0,'unnecessary supplemental studies do not manufacture infarcts');
  const svg=ECG.svg(post);assert.equal((svg.match(/class="ecg-pen-annotation"/g)||[]).length,3);
  for(const lead of ['V7','V8','V9'])assert.ok(svg.includes(`data-lead="${lead}" fill="#71378b"`));
  const v4r=ECG.svg(makeView('rv_infarct','v4r'));assert.equal((v4r.match(/class="ecg-pen-annotation"/g)||[]).length,1);assert.ok(v4r.includes('data-lead="V4R"'));
  assert.equal(ECG.svg(JSON.parse(JSON.stringify(post))),svg,'ink, labels, and waveform persist');
  assert.equal(ECG.create({ink:'url(unsafe)'}).ink,'#283a57');
});

test('live sessions file extended views with captured ink and preserve them through subsequent acquisitions',async()=>{
  let response='';
  require.cache[require.resolve('../src/engine/api')]={exports:{sendTurn:async()=>response,sendDebrief:async()=>''}};
  // The earlier session test loaded this module with its own stub. Reload only
  // the session module so this test owns its API fixture.
  delete require.cache[require.resolve('../src/engine/session')];
  const {Session}=require('../src/engine/session');
  const {rollScenario}=require('../src/engine/roller');
  const seed={...rollScenario({random_seed:'additional-ecg'}),ecg_pattern:'posterior'};
  const session=new Session(seed,'extended-integration');
  response='The posterior ECG is filed. [VITALS: HR=75 Rhythm=sinus] [TIME: 2:00]';
  await session.send('Obtain posterior ECG',false,null,{}, {ecgInk:'#71378b'});
  const first=session.turns.at(-1).twelveLeads[0];assert.equal(first.view,'posterior');assert.equal(first.ink,'#71378b');
  assert.ok(first.leads.V4.st>.05);const saved=ECG.svg(first);
  response='The right-sided ECG is filed. [VITALS: HR=75 Rhythm=sinus] [TIME: 4:00]';
  await session.send('Obtain right-sided ECG',false,null,{}, {ecgInk:'#a52c37'});
  const next=session.turns.at(-1).twelveLeads[0];assert.equal(next.view,'right');assert.equal(next.ink,'#a52c37');
  assert.equal(ECG.svg(first),saved);
});

test('PVC aliases and modifiers preserve the underlying rhythm and reject incompatible rhythms',()=>{
  for(const raw of ['PVC','PVCs','VPCs','premature ventricular contractions','ventricular ectopy']) {
    assert.equal(ECG.normalizeRhythm(raw),'pvc',raw);
    assert.equal(ECG.create({vitals:{Rhythm:raw}}).ectopy,'frequent');
  }
  assert.equal(ECG.normalizeRhythm('sinus tach with frequent PVCs'),'sinus_tach');
  assert.equal(ECG.resolveEctopy(undefined,'sinus tach with frequent PVCs'),'frequent');
  assert.equal(ECG.resolveEctopy('none','pvc'),'none');
  for(const raw of ['no PVCs','without ventricular ectopy','ectopy resolved','frequent atrial ectopy','PACs'])
    assert.equal(ECG.resolveEctopy(raw,'sinus'),'none',raw);
  for(const Rhythm of ['vf','vt','torsades','asystole','paced','afib','svt','av_block_3']) {
    const e=ECG.create({vitals:{Rhythm,Ectopy:'frequent'}});
    assert.equal(e.ectopy,'none');assert.ok(e.beats.every(b=>!b.pvc));
  }
});

test('PVCs are premature wide complexes without a preceding P and have a compensatory pause',()=>{
  for(const Ectopy of ['occasional','frequent','bigeminy','trigeminy']) {
    const e=ECG.create({vitals:{Rhythm:'sinus',HR:80,Ectopy}}),rr=60/80;
    const pvcs=e.beats.filter(b=>b.pvc&&b.t>=0&&b.t<10);
    assert.ok(pvcs.length>0,Ectopy);
    if(Ectopy==='frequent')assert.ok(pvcs.length>=2);
    for(const b of pvcs) {
      const index=e.beats.indexOf(b),previous=e.beats[index-1],next=e.beats[index+1];
      assert.ok(b.width>=.12);assert.ok(b.t-previous.t<rr*.7);
      assert.ok(Math.abs(next.t-previous.t-2*rr)<1e-9,'full compensatory pause');
      const isolated={...e,noise:0,beats:[b]};
      assert.ok(Math.abs(ECG.sample(isolated,'II',b.t-b.pr))<.005,'no preceding sinus P wave');
      assert.ok(ECG.sample(isolated,'II',b.t)<-.8,'broad ventricular deflection');
      assert.ok(ECG.sample(isolated,'II',b.t+.32)>.3,'discordant T wave');
    }
    if(Ectopy==='bigeminy')assert.ok(e.beats.every((b,i)=>!!b.pvc===(i%2===1)));
    if(Ectopy==='trigeminy')assert.ok(e.beats.every((b,i)=>!!b.pvc===(i%3===2)));
  }
});

test('every pathology has ectopy variants across every placement and acquisition quality',()=>{
  for(const ecg_pattern of Object.keys(ECG.catalog.patterns))for(const view of Object.keys(ECG.catalog.views)) {
    const options={seed:{ecg_pattern},view,id:'ectopy-catalog',vitals:{Rhythm:'sinus',HR:80}};
    const base=ECG.create(options);
    for(const Ectopy of ['occasional','frequent','bigeminy','trigeminy'])for(const outcome of Object.keys(ECG.catalog.qualities)) {
      const e=ECG.create({...options,outcome,vitals:{...options.vitals,Ectopy}});
      assert.deepEqual(e.leads,base.leads,'PVCs must preserve primary morphology');
      assert.ok(e.beats.some(b=>b.pvc));assert.equal(e.ectopy,Ectopy);
      const restored=JSON.parse(JSON.stringify(e));
      for(const lead of ECG.names)for(let t=0;t<10;t+=.137){
        const y=ECG.sample(e,lead,t);assert.ok(Number.isFinite(y));assert.equal(ECG.sample(restored,lead,t),y);
      }
      assert.equal(e.noise,ECG.catalog.qualities[outcome].noise);
    }
  }
  const legacy=make('Inferior STEMI');delete legacy.ectopy;
  assert.equal(ECG.svg(legacy),ECG.svg(JSON.parse(JSON.stringify(legacy))));
});

test('narrated ectopy populates monitor metadata without using historical or hypothetical mentions',()=>{
  const {applyEctopy}=require('../src/engine/twelve-lead');
  const v={HR:80,Rhythm:'sinus'};
  assert.equal(applyEctopy(v,null,'The monitor shows frequent ectopy.').Ectopy,'frequent');
  assert.equal(applyEctopy(v,null,'Occasional PVCs appear on the strip.').Ectopy,'occasional');
  assert.equal(applyEctopy(v,null,'No chest pain, frequent ectopy persists on the monitor.').Ectopy,'frequent');
  for(const text of ['History of frequent PVCs.','Watch for frequent ectopy.','The patient reports frequent PVCs.','The monitor shows no PVCs.','Frequent atrial ectopy.'])
    assert.equal(applyEctopy(v,null,text).Ectopy,'none',text);
  assert.equal(applyEctopy({GCS:15},null,'Frequent ectopy.').Ectopy,undefined,'monitor gating');
  assert.equal(applyEctopy(v,{...v,Ectopy:'frequent'},'Patient answers.').Ectopy,'frequent');
  assert.equal(applyEctopy({...v,Ectopy:'none'},{...v,Ectopy:'frequent'}).Ectopy,'none');
  assert.equal(applyEctopy(v,{...v,Ectopy:'frequent'},'The ectopy has resolved.').Ectopy,'none');
  assert.equal(applyEctopy(v,null,'',{ecg_ectopy:'frequent'}).Ectopy,'frequent');
  assert.equal(applyEctopy(v,{...v,Ectopy:'none'},'',{ecg_ectopy:'frequent'}).Ectopy,'none');
});

test('live ectopy narration reaches acquisition, clears explicitly, and remains patient-specific',async()=>{
  let response='';
  require.cache[require.resolve('../src/engine/api')]={exports:{sendTurn:async()=>response,sendDebrief:async()=>''}};
  delete require.cache[require.resolve('../src/engine/session')];
  const {Session}=require('../src/engine/session');
  const {rollScenario}=require('../src/engine/roller');
  const session=new Session({...rollScenario({random_seed:'pvc-integration'}),ecg_pattern:'inferior',provider_level:'ALS'},'pvc-session');
  response='The monitor shows frequent ectopy. [PATIENT_FOCUS: patient_1 | Primary] [VITALS: HR=80 Rhythm=sinus] [TIME: 1:00]';
  const first=await session.send('Place the cardiac monitor');assert.equal(first.vitals.Ectopy,'frequent');
  response='Paper filed. [PATIENT_FOCUS: patient_1 | Primary] [VITALS: HR=80 Rhythm=sinus] [TIME: 2:00]';
  await session.send('Obtain a 12 lead ECG');
  const paper=session.turns.at(-1).twelveLeads[0];assert.equal(paper.ectopy,'frequent');assert.ok(paper.beats.some(b=>b.pvc));assert.ok(paper.leads.III.st>.2);
  const saved=ECG.svg(paper);
  response='The passenger is monitored. [PATIENT_FOCUS: patient_2 | Passenger] [VITALS: HR=80 Rhythm=sinus] [TIME: 3:00]';
  const other=await session.send('Focus on the passenger and place the monitor');assert.equal(other.vitals.Ectopy,'none');
  response='The primary patient is reassessed. [PATIENT_FOCUS: patient_1 | Primary] [VITALS: HR=80 Rhythm=sinus Ectopy=none] [TIME: 4:00]';
  const cleared=await session.send('Reassess the primary patient');assert.equal(cleared.vitals.Ectopy,'none');
  response='Paper filed. [VITALS: HR=80 Rhythm=sinus Ectopy=none] [TIME: 5:00]';
  await session.send('Obtain another 12 lead ECG');
  assert.ok(session.turns.at(-1).twelveLeads[0].beats.every(b=>!b.pvc));
  assert.equal(ECG.svg(JSON.parse(JSON.stringify(paper))),saved);
});
