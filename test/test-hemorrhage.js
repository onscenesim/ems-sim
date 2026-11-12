'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.EMS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'ems-wound-test-'));
after(()=>fs.rmSync(process.env.EMS_DATA_DIR,{recursive:true,force:true}));
const H=require('../src/engine/hemorrhage');
const {rollProcedure,detectWithConfirmation}=require('../src/engine/dice');
const {catalog,prepareInstructor}=require('../src/engine/instructor');
const {rollScenario}=require('../src/engine/roller');
const seed=()=>rollScenario({difficulty:'HARD',random_seed:'wound-test',instructor:prepareInstructor({
  case_id:catalog().find(e=>e.presentation.startsWith('Knife fight with two injured adults')).case_id,
  seed:{complication_type:'none',comorbidity_bundle:'otherwise_healthy'} })});
const wounds=()=>H.initialWounds(seed()).map(w=>({...w,discovered:true}));
const plan=(w,text,opts={})=>H.planActions(w,H.parseActions(text),{focus:'patient_1',records:[],seed:seed(),...opts});
const success=(id,context)=>({procedure_id:id,outcome:'SUCCESS',roll:20,dc:context.junctional?14:12,no_roll:false});

test('natural pressure and packing orders are detected; exams, history, negation and unrelated skills are not applications',()=>{
  for(const text of ['I press a towel firmly into the cut','Pack the armpit tightly with gauze','Quinn, keep your hand on that wound']){
    assert.equal(H.parseActions(text).length,1,text);
    assert.ok(detectWithConfirmation(text).rolls.some(r=>r.procedure_id==='bleeding_control'),text);
  }
  assert.equal(H.parseActions('Check whether the pressure dressing is still dry')[0].kind,'assess');
  assert.equal(H.parseActions('Apply direct pressure with a sterile dressing')[0].method,'pressure');
  assert.equal(H.parseActions('Apply a pressure dressing')[0].method,'dressing');
  assert.ok(!detectWithConfirmation('Check whether the pressure dressing is still dry').rolls.some(r=>r.procedure_id==='bleeding_control'));
  for(const text of ['Do not pack the wound','No wound packing','We already applied direct pressure','If bleeding worsens, pack the wound','Never remove the dressing','Press play','Push the head up','Check blood pressure','Apply a chest seal']) assert.equal(H.parseActions(text).length,0,text);
});

test('all authored profiles reach ordinary/instructor seeds without disclosing wounds',()=>{
  const s=seed(); assert.equal(s.hemorrhage_wounds.length,3);
  assert.ok(H.initialWounds(s).every(w=>!w.discovered));
  const hidden=plan(H.initialWounds(s),'Pack the armpit tightly with gauze');
  assert.equal(hidden.plan.length,0); assert.match(hidden.notes[0],/revealed/);
});

test('observations need a known site, correct patient, positive exact evidence; they cannot set control state',()=>{
  const w=H.initialWounds(seed());
  const evidence='Blood wells from a deep left axillary wound.';
  const tag=o=>'[WOUND_FOUND: '+JSON.stringify(o)+']';
  const base={patientId:'patient_1',site:'left axilla',evidence,status:'controlled_secured'};
  H.discoverWounds(w,evidence+' '+tag(base),seed());
  assert.equal(w[0].discovered,true); assert.equal(w[0].status,'uncontrolled');
  for(const o of [{...base,patientId:'patient_2'},{...base,evidence:'There is no left axillary wound.'},{...base,site:'scalp'}]){
    const fresh=H.initialWounds(seed()); H.discoverWounds(fresh,evidence+' '+tag(o),seed());
    assert.ok(fresh.every(x=>!x.discovered));
  }
  const legacy=[]; H.discoverWounds(legacy,evidence+' '+tag(base),{});
  assert.equal(legacy[0].junctional,true);
  assert.equal(H.discoverWounds([],evidence+' '+tag(base),{}).includes('WOUND_FOUND'),false);
});

test('a successful application persists through maintenance and reassessment without extra dice',()=>{
  const w=wounds();let dice=0;
  const resolve=text=>H.resolvePlan(plan(w,text).plan,(...a)=>{dice++;return success(...a);},{},'HARD',1);
  resolve('I press a towel firmly into the left axillary wound');
  assert.equal(w[0].status,'controlled_pressure');assert.equal(w[0].holder,'provider');
  resolve('Keep holding direct pressure on the wound');
  resolve('Check whether the pressure dressing is still dry');
  resolve('I do bleeding control');
  assert.equal(dice,1);assert.equal(w[0].attempts,1);
  assert.equal(w[1].status,'uncontrolled');
});

test('a secured dressing or tourniquet only protects its own wound from repeat rolls', () => {
  for (const treatment of ['pressure dressing', 'tourniquet']) {
    const w = ['left forearm', 'right forearm'].map((site, index) => ({
      id: `wound-${index}`, patientId: 'patient_1', site, discovered: true,
      status: 'uncontrolled', holder: null, method: null, attempts: 0,
    }));
    const resolve = (site, roll) => H.resolvePlan(
      plan(w, `Apply a ${treatment} to the ${site} wound.`).plan, roll, {}, 'NORMAL', 1,
    );
    assert.equal(resolve('left forearm', success).rolls.length, 1);
    assert.equal(resolve('left forearm', () => assert.fail('Secured wound rerolled')).events[0].action, 'maintain');
    assert.equal(resolve('right forearm', success).rolls.length, 1);
    assert.deepEqual(w.map(wound => [wound.status, wound.attempts]), [
      ['controlled_secured', 1], ['controlled_secured', 1],
    ]);
  }
});

test('retries, adjustments and meaningful method changes roll; failed securing retains existing pressure',()=>{
  const w=wounds();
  H.resolvePlan(plan(w,'Apply direct pressure').plan,success,{},'HARD',1);
  const attempt=plan(w,'Apply a pressure dressing');
  const r=H.resolvePlan(attempt.plan,id=>({procedure_id:id,outcome:'FAILURE',no_roll:false}),{},'HARD',2);
  assert.equal(r.rolls.length,1);assert.equal(w[0].status,'controlled_pressure');assert.equal(w[0].holder,'provider');
  H.resolvePlan(plan(w,'Apply a pressure dressing').plan,id=>({procedure_id:id,outcome:'MARGINAL',no_roll:false}),{},'HARD',2);
  assert.equal(w[0].status,'controlled_pressure');assert.equal(w[0].holder,'provider');
  H.resolvePlan(plan(w,'Retry the pressure dressing').plan,success,{},'HARD',3);
  assert.equal(w[0].status,'controlled_secured');assert.equal(w[0].holder,null);
  assert.equal(H.pressureInterruptions(w,true).length,0);
});

test('junctional DC comes from the selected wound even when the order omits anatomy',()=>{
  const w=wounds();
  const r=H.resolvePlan(plan(w,'Apply direct pressure').plan,rollProcedure,{},'HARD',1);
  assert.equal(r.rolls[0].base_dc,14);assert.equal(r.rolls[0].dc,16);
  assert.equal(r.rolls[0].wound_id,'axilla');assert.equal(r.rolls[0].patient,'patient_1');
  const second=H.resolvePlan(plan(w,'Partner, apply direct pressure to the second patient left forearm').plan,rollProcedure,{},'HARD',2);
  assert.equal(second.rolls[0].base_dc,12);assert.equal(second.rolls[0].patient,'patient_2');
});

test('ambiguous multisite care asks; incompatible anatomy and denied attempts never roll',()=>{
  const w=wounds();
  assert.equal(plan(w,'I do bleeding control',{focus:'patient_2'}).plan.length,0);
  assert.equal(plan(w,'Apply a tourniquet to the axilla').plan.length,0);
  const p=plan(w,'Pack the axillary wound');assert.equal(p.plan.length,1);
  assert.equal(plan(w,'Pack the axillary wound',{deny:[p.plan[0].key]}).plan.length,0);
  assert.equal(plan(w,'Pack the axillary wound',{deny:['bleeding_control|wound packing']}).plan.length,0);
  assert.equal(plan(w,'Captain, apply direct pressure').plan.length,0);
  assert.equal(plan(w,'Partner, apply direct pressure',{moving:true,crewStatus:{partner:'driving'}}).plan.length,0);
});

test('packing plus sustained pressure is one attempt; repetitions in one message cannot fish for outcomes',()=>{
  const w=wounds();
  const r=H.resolvePlan(plan(w,'Pack the armpit tightly with gauze and hold pressure on the wound; pack the armpit tightly with gauze').plan,success,{},'HARD',1);
  assert.equal(r.rolls.length,1);assert.equal(w[0].method,'packing');
  const maintained=H.resolvePlan(plan(w,'Keep holding pressure on the left armpit wound').plan,success,{},'HARD',2);
  assert.equal(maintained.rolls.length,0);assert.equal(w[0].method,'packing');assert.equal(w[0].attempts,1);
});

test('a provider cannot maintain pressure on one patient while treating another without a handoff',()=>{
  const w=wounds();
  H.resolvePlan(plan(w,'Apply direct pressure to the left axillary wound').plan,success,{},'HARD',1);
  const conflicting=plan(w,'Apply direct pressure to the second patient left forearm wound');
  assert.equal(conflicting.plan.length,0);assert.match(conflicting.notes[0],/handoff/);
  const delegated=plan(w,'Partner, apply direct pressure to the second patient left forearm wound');
  assert.equal(delegated.plan.length,1);
  H.resolvePlan(delegated.plan,success,{},'HARD',2);
  assert.equal(w[0].holder,'provider');assert.equal(w[1].holder,'partner');
});

test('releasing pressure or assigning its holder to drive is a real one-time interruption; takeover is a new attempt',()=>{
  const w=wounds();
  H.resolvePlan(plan(w,'Partner, apply direct pressure').plan,success,{},'HARD',1);
  assert.equal(w[0].holder,'partner');
  const takeover=H.resolvePlan(plan(w,'I take over pressure from my partner').plan,success,{},'HARD',2);
  assert.equal(takeover.rolls.length,1);assert.equal(w[0].holder,'provider');
  assert.equal(H.pressureInterruptions(w,true).length,0);
  H.resolvePlan(plan(w,'Release pressure on the wound').plan,success,{},'HARD',3);
  assert.equal(w[0].status,'uncontrolled');
  H.resolvePlan(plan(w,'Partner, apply direct pressure').plan,success,{},'HARD',4);
  assert.equal(H.pressureInterruptions(w,true).length,1);
  assert.equal(H.pressureInterruptions(w,true).length,0);
});

test('semantic fallback accepts only quoted intentions against discovered known wounds',()=>{
  const w=wounds(),text='Mash that towel into the wound.';
  const a={kind:'treat',method:'pressure',woundId:'axilla',source:text};
  assert.equal(H.needsInterpretation(text,H.parseActions(text),w),true);
  assert.equal(H.validateInterpretation([a],text,w).length,1);
  for(const bad of [{...a,woundId:'invented'},{...a,source:'Apply direct pressure'},{...a,method:'surgery'}]) assert.equal(H.validateInterpretation([bad],text,w).length,0);
  assert.equal(H.validateInterpretation([a],text,w.map(x=>({...x,discovered:false}))).length,0);
});

test('contradictory narration cannot turn partial control into success or silently release pressure',()=>{
  const w=wounds();w[0].status='partially_controlled';
  assert.equal(H.narrationIssues('No fresh blood escapes the left axillary wound.',w).length,1);
  w[0].status='controlled_pressure';w[0].holder='provider';
  assert.equal(H.narrationIssues('Active bleeding resumes from the left axillary wound.',w).length,1);
  assert.equal(H.narrationIssues('The left forearm has active bleeding continuing.',w).length,0);
  assert.equal(H.narrationIssues('The left axillary packing remains in place under pressure.',w).length,0);
});

test('a legacy call adopts its already rolled treatment when its first wound is discovered',()=>{
  const w=[wounds()[0]],rolls=[success('bleeding_control',{junctional:true})];
  const events=H.adoptExistingRolls(w,H.parseActions('Pack the armpit tightly with gauze'),rolls,
    {focus:'patient_1',records:[],seed:seed()},1);
  assert.equal(events.length,1);assert.equal(w[0].attempts,1);assert.equal(w[0].status,'controlled_pressure');
  assert.equal(rolls.length,1);assert.equal(rolls[0].wound_id,'axilla');
});

let reply='',sent='',reject=false,interpretation=[],inferenceCalls=0,replies=[];
require.cache[require.resolve('../src/engine/api')]={exports:{sendTurn:async(_prompt,messages)=>{
  sent=messages.at(-1).content;if(reject)throw new Error('model failed');return replies.length?replies.shift():reply;
},sendDebrief:async()=>'',inferHemorrhageActions:async()=>{inferenceCalls++;return interpretation;}}};
const {Session}=require('../src/engine/session');
const {restoreSession,deleteSession}=require('../src/server/sessionStore');
const {buildDebriefContext}=require('../src/engine/assembler');
test('session applies wound state transactionally and resumes/debriefs the recorded state',async()=>{
  const s=new Session(seed(),'wound-persistence-test'); s.wounds=wounds();
  reply='Pressure is applied. [PATIENT_FOCUS: patient_1 | Quiet patient] [TIME: 0:10]';
  const original=Math.random;Math.random=()=>.975;
  try{
    const r=await s.send('Apply direct pressure');
    assert.equal(r.rolls.filter(r=>r.hemorrhage_managed).length,1);
    assert.equal(s.wounds[0].status,'controlled_pressure');assert.ok(s.sceneMinute>=.5);
    const maintained=await s.send('Keep holding direct pressure');
    assert.equal(maintained.rolls.filter(r=>r.procedure_id==='bleeding_control').length,0);
    const before=structuredClone(s);reject=true;
    await assert.rejects(s.send('Apply a pressure dressing'),/model failed/);
    assert.deepEqual(s.wounds,before.wounds);assert.deepEqual(s.turns,before.turns);reject=false;
    const restored=restoreSession({...JSON.parse(JSON.stringify(s)),id:'wound-persistence-test'});
    assert.deepEqual(restored.wounds,s.wounds);
    assert.match(buildDebriefContext(s.seed,s.turns),/Wound care events/);
    deleteSession('wound-persistence-test');
    assert.match(sent,/HEMORRHAGE STATE/);
  }finally{Math.random=original;reject=false;}
});

test('unfamiliar wording is interpreted before narration and receives exactly one real roll',async()=>{
  const s=new Session(seed());s.wounds=wounds();
  const action='Mash that towel into the wound.';
  interpretation=[{kind:'treat',method:'pressure',woundId:'axilla',source:action}];inferenceCalls=0;
  reply='The towel is pressed into the left axillary wound. [TIME: 1:00]';
  const r=await s.send(action);
  assert.equal(inferenceCalls,1);assert.equal(r.rolls.filter(r=>r.hemorrhage_managed).length,1);
  const invalid=new Session(seed());invalid.wounds=wounds();interpretation=[{kind:'treat',method:'pressure',woundId:'invented',source:action}];
  const refused=await invalid.send(action);
  assert.equal(refused.rolls.filter(r=>r.hemorrhage_managed).length,0);
  assert.equal(invalid.wounds[0].attempts,0);assert.match(sent,/could not be safely interpreted/);
  interpretation=[];
});

test('a contradictory scene draft is repaired before committing the wound or timeline',async()=>{
  const s=new Session(seed());s.wounds=wounds();
  replies=['No fresh blood escapes the left axillary wound. [TIME: 1:00]',
    'Blood continues to well from the left axillary wound. [TIME: 1:00]'];
  const original=Math.random;Math.random=()=>.3;
  try{
    const r=await s.send('Apply direct pressure');
    assert.match(sent,/contradicted authoritative wound state/);
    assert.equal(r.rolls.filter(r=>r.hemorrhage_managed).length,1);
    assert.equal(s.wounds[0].status,'uncontrolled');assert.equal(s.turns.length,1);
    assert.doesNotMatch(s.messages.at(-1).content,/No fresh blood/);
  }finally{Math.random=original;replies=[];}
});

test('the real route confirms new wound attempts, preserves denials, persists state and skips maintenance confirmation',async()=>{
  const s=restoreSession({id:'wound-route-test',seed:seed(),wounds:wounds(),ownerId:'wound-browser-owner'});
  require('../src/server/persistence').save({id:s.sessionId,seed:s.seed,wounds:s.wounds,ownerId:s.ownerId});
  const router=require('../src/server/routes/scenario');
  const layer=router.stack.find(l=>l.route?.path==='/:id/turn' && l.route.methods.post);
  async function call(body){
    let status=200,payload;
    const res={status(n){status=n;return this;},json(d){payload=d;return this;},setHeader(){}};
    await layer.route.stack[0].handle({body,params:{id:s.sessionId},headers:{cookie:'ems_owner=wound-browser-owner'},ip:'127.0.0.1',socket:{}},res);
    assert.equal(status,200);return payload;
  }
  try{
    const before=structuredClone(s);
    const confirmation=await call({message:'Pack the armpit tightly with gauze',operation_id:'wound-route-operation-01'});
    assert.equal(confirmation.needs_confirmation[0].key,'hemorrhage|axilla|packing');
    assert.deepEqual({...s},before);
    reply='The wound has not been treated. [TIME: 1:00]';
    const denied=await call({message:'Pack the armpit tightly with gauze',operation_id:'wound-route-operation-01',procs_resolved:true,proc_deny:['hemorrhage|axilla|packing']});
    assert.equal(denied.rolls.filter(r=>r.hemorrhage_managed).length,0);assert.equal(s.wounds[0].attempts,0);
    Object.assign(s.wounds[0],{status:'controlled_pressure',method:'packing',holder:'provider'});
    reply='Pressure remains in place on the left axillary wound. [TIME: 2:00]';
    const maintained=await call({message:'Keep holding pressure on the left armpit wound',operation_id:'wound-route-operation-02'});
    assert.equal(maintained.needs_confirmation,undefined);
    assert.equal(maintained.rolls.filter(r=>r.hemorrhage_managed).length,0);
    const saved=require('../src/server/persistence').load(s.sessionId);
    assert.equal(saved.wounds[0].status,'controlled_pressure');
  }finally{deleteSession(s.sessionId);}
});
