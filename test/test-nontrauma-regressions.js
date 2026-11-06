'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.EMS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'ems-nontrauma-regression-'));
after(()=>fs.rmSync(process.env.EMS_DATA_DIR,{recursive:true,force:true}));
const H=require('../src/engine/hemorrhage');
const {detectAllProcedures,detectWithConfirmation}=require('../src/engine/dice');
const {catalog,prepareInstructor}=require('../src/engine/instructor');
const {rollScenario}=require('../src/engine/roller');

const nonWoundOrders=[
  'Hold cricoid pressure during intubation', 'Apply CPAP at 10 pressure',
  'Maintain CPAP pressure at 10', 'Increase PEEP pressure to 8',
  'Give positive pressure ventilation with the BVM', 'Hold the mask firmly for positive pressure ventilation',
  'Apply suprapubic pressure', 'Apply fundal pressure', 'Keep pressure off the prolapsed cord',
  'Manually elevate the presenting fetal part', 'Perform bimanual uterine compression',
  'Massage the uterus to control the bleeding', 'Apply uterine massage for postpartum hemorrhage',
  'Wrap the newborn in a towel', 'Keep the newborn covered with a dry towel',
  'Dry the baby with a towel and wrap the newborn in a towel', 'Support the fetal head with a towel',
  'Place a rolled towel beneath the infant shoulders', 'Put an ice pack on the forehead',
  'Apply a cold pack to the neck', 'Wrap a cool towel around the neck',
  'Hold a towel under the chin while suctioning blood', 'Use gauze to wipe saliva off the chin',
  'Suction blood from the mouth', 'Put pressure on the carotid sinus',
  'Place a pressure bag around the saline', 'Hang blood using a pressure bag',
  'Apply pressure to the IV site after removing the cannula', 'Apply a dressing to the dialysis catheter',
  'Check manual blood pressure', 'Get bilateral blood pressures',
  'Give aspirin for chest pressure', 'Ask about pressure in the chest',
  'Pack the patient belongings', 'Place the blood pressure cuff on the left arm',
  'Get a CAT scan', 'Cover the umbilical cord with moist gauze', 'Protect the eyes with gauze',
  'Apply a sterile dressing to the chemical burn', 'Apply a clean dressing to the burn wound',
  'I hold the gauze while my partner draws blood', 'Place gauze beneath the tracheostomy flange',
  'Change the dressing on the central line', 'Place a towel under the vomiting patient chin',
  'Wrap the patient in a thermal blanket', 'Ask about bleeding while checking glucose',
  'Apply a sterile dressing to the surgical site', 'Wrap a sprained ankle in an elastic bandage',
  'Place a dressing over the rash', 'Apply a clean dressing to the pressure ulcer',
];
const activeWound=()=>[{id:'fistula',patientId:'patient_1',site:'left forearm',discovered:true,
  status:'controlled_pressure',method:'pressure',holder:'provider',attempts:1,junctional:false}];

test('non-trauma pressure, towel, blood and packing meanings never become wound care, with or without an active wound',()=>{
  for(const text of nonWoundOrders){
    assert.deepEqual(H.parseActions(text),[],text);
    assert.equal(H.needsInterpretation(text,[],activeWound()),false,text);
    assert.ok(!detectAllProcedures(text).some(e=>['bleeding_control','tourniquet'].includes(e.proc.id)),text);
  }
});

test('specialized non-trauma procedures retain their own intervention identities',()=>{
  assert.equal(H.parseActions('Apply a CAT to the left leg')[0].method,'tourniquet');
  for(const [text,id] of [
    ['Apply CPAP at 10 pressure','cpap'],['Apply suprapubic pressure','shoulder_dystocia_maneuvers'],
    ['Perform bimanual uterine compression','fundal_massage'],['Massage the uterus to control the bleeding','fundal_massage'],
    ['Keep pressure off the prolapsed cord and elevate the presenting part','cord_prolapse_management'],
    ['Pack the nose with gauze','epistaxis_control'],['Apply direct pressure to the nose','epistaxis_control'],
    ['Dry and stimulate the newborn and wrap the newborn in a towel','newborn_resuscitation'],
    ['Start CPR and push epinephrine','cpr'],['Apply a chest seal','chest_seal'],
  ]){
    const ids=detectAllProcedures(text).map(e=>e.proc.id);
    assert.ok(ids.includes(id),text);assert.ok(!ids.includes('bleeding_control'),text);
  }
});

test('mixed wound/medical orders are separated without suppressing either real intervention',()=>{
  for(const text of [
    'Apply direct pressure with gauze to the bleeding fistula and start CPAP at 10 pressure',
    'Apply direct pressure to the fistula wound; apply suprapubic pressure',
    'Wrap the newborn in a towel and apply direct pressure to the bleeding forearm wound',
  ]){
    const actions=H.parseActions(text);assert.equal(actions.length,1,text);
    assert.equal(actions[0].kind,'treat');assert.equal(actions[0].method,'pressure');
    assert.equal(detectAllProcedures(text).filter(e=>e.proc.id==='bleeding_control').length,1,text);
  }
  const ids=detectAllProcedures('Apply direct pressure with gauze to the bleeding fistula and start CPAP at 10 pressure').map(e=>e.proc.id);
  assert.ok(ids.includes('cpap'));assert.ok(ids.includes('bleeding_control'));
  const bilateral=detectWithConfirmation('Apply direct pressure to both arms and start CPAP at 10 pressure').rolls.filter(r=>r.procedure_id==='bleeding_control');
  assert.equal(bilateral.length,2);assert.deepEqual(bilateral.map(r=>r.target).sort(),['left arm','right arm']);
});

test('compound-order stress probes keep one real wound attempt alongside unrelated non-trauma care',()=>{
  const wound='Apply direct pressure to the bleeding forearm wound';
  for(const text of nonWoundOrders){
    for(const compound of [wound+'; '+text,text+'; '+wound,wound+' and '+text,text+' and '+wound]){
      const actions=H.parseActions(compound).filter(a=>['treat','maintain'].includes(a.kind));
      assert.equal(actions.length,1,compound);assert.equal(actions[0].method,'pressure',compound);
    }
  }
  assert.equal(H.parseActions(wound+' and my partner obtains manual blood pressure').length,1);
});

test('conditional and negated wound orders cannot be revived by clause splitting',()=>{
  for(const text of ['If needed, apply direct pressure','If bleeding returns, start oxygen and pack the wound',
    'Consider packing the wound and then apply direct pressure','Do not pack the wound',
    'We already applied direct pressure']){
    assert.equal(H.parseActions(text).length,0,text);
    assert.ok(!detectWithConfirmation(text).rolls.some(r=>r.procedure_id==='bleeding_control'),text);
  }
});

test('multi-measurement blood pressure, glucose and lab wording cannot become blood administration',()=>{
  for(const text of ['Obtain manual pulse, blood pressure and respiratory rate',
    'Assess airway and breathing. Get manual blood pressure, pulse, respiratory rate and pulse oximetry',
    'Check glucose and get arterial blood gas', 'Obtain blood cultures', 'Get blood alcohol level',
    'Get blood pressure and start oxygen', 'Check glucose, blood pressure, pulse and respiratory rate']){
    assert.ok(!detectAllProcedures(text).some(e=>e.proc.id==='medication_push'),text);
  }
  for(const text of ['Transfuse whole blood and obtain manual pulse, blood pressure and respiratory rate',
    'Give PRBCs; check blood pressure', 'Give blood products']){
    assert.equal(detectAllProcedures(text).filter(e=>e.proc.id==='medication_push').length,1,text);
  }
});

test('skin decontamination rolls when ordered, and its later mention does not repeat it',()=>{
  const action='Remove contaminated clothing and irrigate the affected skin with water according to our decontamination protocol';
  assert.equal(detectWithConfirmation(action).rolls.filter(r=>r.procedure_id==='decontamination').length,1);
  for(const text of ['Apply a clean sterile dressing to the chemical burn after decontamination, without pressure',
    'Cover the skin following successful decontamination']){
    assert.equal(detectWithConfirmation(text).rolls.filter(r=>!r.no_roll).length,0,text);
  }
  assert.equal(detectWithConfirmation('Repeat decontamination').rolls.filter(r=>r.procedure_id==='decontamination').length,1);
});

test('systemic, airway, GI, obstetric and nasal bleeding cannot register a compressible external wound',()=>{
  for(const [site,evidence] of [
    ['neck','Blood from the mouth runs down the neck.'],
    ['chest','The patient vomits blood onto the chest.'],
    ['perineum','Blood flows from the vagina across the perineum.'],
    ['groin','The abdomen is rigid with suspected internal bleeding near the groin.'],
    ['scalp','There is no scalp wound or bleeding.'],
    ['forearm','Old blood stains the forearm after a previous injection.'],
    ['scalp','A superficial scalp burn wound is red and dry.'],
  ]){
    const wounds=[];
    H.discoverWounds(wounds,evidence+'\n[WOUND_FOUND: '+JSON.stringify({patientId:'patient_1',site,evidence})+']',{});
    assert.equal(wounds.length,0,evidence);
  }
  const evidence='Blood spurts from the needle puncture in the left forearm fistula.';
  const wounds=[];H.discoverWounds(wounds,evidence+'\n[WOUND_FOUND: '+JSON.stringify({patientId:'patient_1',site:'left forearm',evidence})+']',{});
  assert.equal(wounds.length,1);assert.equal(wounds[0].site,'left forearm');
});

let response='Assessment recorded. [TIME: 1:00]',seen='',inferenceCalls=0;
require.cache[require.resolve('../src/engine/api')]={exports:{
  sendTurn:async(_prompt,messages)=>{seen=messages.at(-1).content;return response;},
  sendDebrief:async()=>'',inferHemorrhageActions:async()=>{inferenceCalls++;return [];},
}};
const {Session}=require('../src/engine/session');

test('every non-trauma catalog case retains routine assessment/report/skip behavior without phantom wounds or dice',async()=>{
  const entries=catalog().filter(e=>e.category!=='trauma' && e.category_override!=='trauma');
  assert.ok(entries.length>400);
  for(const entry of entries){
    const s=new Session(rollScenario({random_seed:'nontrauma-catalog-probe',
      instructor:prepareInstructor({case_id:entry.case_id,seed:{complication_type:'none'}})}));
    for(const [text,report,skip] of [['Obtain manual pulse, blood pressure and respiratory rate',false,null],
      ['Check glucose',false,null],['We applied direct pressure and gave epinephrine',true,null],
      ['Skip ahead to the hospital',false,'to_hospital']]){
      const r=await s.send(text,report,skip);
      assert.equal(s.wounds.length,0,entry.case_id+' '+text);
      assert.ok(!r.rolls.some(r=>r.hemorrhage_managed || r.procedure_id==='bleeding_control'),entry.case_id+' '+text);
      if(report || skip)assert.equal(r.rolls.length,0,entry.case_id+' report/skip');
      else assert.ok(!r.rolls.some(r=>r.procedure_id==='medication_push'),entry.case_id+' assessment cannot administer a drug');
    }
  }
  assert.equal(inferenceCalls,0);
});

test('non-trauma procedures cannot mutate an existing fistula wound or ask spurious wound questions',async()=>{
  const entry=catalog().find(e=>e.presentation.startsWith('Hemodialysis patient with arteriovenous fistula hemorrhage'));
  for(const text of nonWoundOrders){
    const s=new Session(rollScenario({instructor:prepareInstructor({case_id:entry.case_id})}));
    s.wounds=activeWound();const before=structuredClone(s.wounds);
    const r=await s.send(text);
    assert.deepEqual(s.wounds,before,text);
    assert.ok(!r.rolls.some(r=>r.hemorrhage_managed || r.procedure_id==='bleeding_control'),text);
    assert.ok(!s.turns.at(-1).woundEvents.length,text);
    assert.doesNotMatch(seen,/Ask which revealed wound|could not be safely interpreted/,text);
  }
  assert.equal(inferenceCalls,0);
});

test('reports, transport skips and restart retain non-trauma wound control and keep procedures out of reports',async()=>{
  const entry=catalog().find(e=>e.presentation.startsWith('Hemodialysis patient with arteriovenous fistula hemorrhage'));
  const s=new Session(rollScenario({instructor:prepareInstructor({case_id:entry.case_id})}));
  s.wounds=activeWound();
  for(const [text,report,skip] of [['We packed the wound, started CPR and gave epinephrine',true,null],
    ['Skip ahead to the hospital',false,'to_hospital']]){
    const r=await s.send(text,report,skip);
    assert.equal(r.rolls.length,0);assert.equal(s.wounds[0].status,'controlled_pressure');
    assert.equal(s.wounds[0].holder,'provider');
  }
});

test('HTTP confirmation distinguishes CPAP, newborn wrapping and fundal massage from hemorrhage attempts',async()=>{
  const {restoreSession,deleteSession}=require('../src/server/sessionStore');
  const persistence=require('../src/server/persistence');
  const router=require('../src/server/routes/scenario');
  const layer=router.stack.find(l=>l.route?.path==='/:id/turn'&&l.route.methods.post);
  async function call(s,body){
    let status=200,payload;
    const res={status(n){status=n;return this;},json(d){payload=d;return this;},setHeader(){}};
    await layer.route.stack[0].handle({body,params:{id:s.sessionId},headers:{cookie:'ems_owner=nontrauma-browser'},ip:'127.0.0.1',socket:{}},res);
    assert.equal(status,200);return payload;
  }
  const cases=[
    {prefix:'Hemodialysis patient with arteriovenous fistula hemorrhage',text:'Apply CPAP at 10 pressure',wound:true,confirm:'cpap'},
    {prefix:'Newborn requiring resuscitation after',text:'Wrap the newborn in a towel'},
    {prefix:'Postpartum hemorrhage —',text:'Massage the uterus to control the bleeding'},
  ];
  for(const [i,c]of cases.entries()){
    const entry=catalog().find(e=>e.presentation.startsWith(c.prefix));
    const snapshot={id:'nontrauma-route-'+i,seed:rollScenario({instructor:prepareInstructor({case_id:entry.case_id})}),ownerId:'nontrauma-browser'};
    const s=restoreSession(snapshot);if(c.wound)s.wounds=activeWound();
    persistence.save({...snapshot,wounds:s.wounds});
    try{
      const before=structuredClone(s.wounds);
      const result=await call(s,{message:c.text,operation_id:'nontrauma-route-operation-'+i});
      if(c.confirm){
        assert.deepEqual(result.needs_confirmation.map(e=>e.procedure_id),[c.confirm]);
        const denied=await call(s,{message:c.text,operation_id:'nontrauma-route-operation-'+i,
          procs_resolved:true,proc_deny:result.needs_confirmation.map(e=>e.key)});
        assert.equal(denied.rolls.filter(r=>!r.no_roll).length,0);
      }else{
        assert.equal(result.needs_confirmation,undefined);
        assert.equal(result.rolls.filter(r=>!r.no_roll).length,0);
      }
      assert.deepEqual(s.wounds,before,c.text);
    }finally{deleteSession(s.sessionId);}
  }
});
