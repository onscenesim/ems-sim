'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { detectWithConfirmation, detectAllAndRoll } = require('../src/engine/dice');

function medications(text) {
  return detectWithConfirmation(text).rolls.filter(r => r.procedure_id === 'medication_push');
}

test('explicit medication routes survive detection and confirmation as presentation metadata', () => {
  for (const [text, route] of [
    ['Give aspirin 324 mg PO.', 'PO'], ['Give aspirin by mouth.', 'PO'],
    ['Give oral aspirin.', 'PO'], ['Give aspirin orally.', 'PO'],
    ['Give aspirin 324 mg p.o.', 'PO'], ['Give chewable aspirin.', 'PO'],
    ['Give naloxone 2 mg IN.', 'IN'], ['Give naloxone intranasally.', 'IN'],
    ['Give IN naloxone.', 'IN'], ['Give naloxone 2 mg in.', 'IN'],
    ['Give naloxone via MAD.', 'IN'], ['Give naloxone via mad.', 'IN'],
    ['Give naloxone into each nostril.', 'IN'],
    ['Give epinephrine 0.3 mg IM.', 'IM'], ['Give epinephrine intramuscularly.', 'IM'],
    ['Give epinephrine 0.3 mg i.m.', 'IM'],
    ['Give morphine IV.', 'IV'], ['Give Narcan Intravenous.', 'IV'],
    ['Give aspirin Oral.', 'PO'], ['Give naloxone Intranasal.', 'IN'],
    ['Give epinephrine Intramuscular.', 'IM'], ['Give nitroglycerin sublingually.', 'SL'],
    ['Give albuterol nebulized.', 'NEB'], ['Give epinephrine through the IO.', 'IO'],
  ]) {
    const rolls = medications(text);
    assert.equal(rolls.length, 1, text);
    assert.equal(rolls[0].administration_route, route, text);
    assert.equal(rolls[0].dc, 4, 'route metadata must not change the administration DC');
    assert.equal(detectAllAndRoll(text).find(r=>r.procedure_id==='medication_push').administration_route, route, text);
  }
});

test('mixed-route orders keep each route attached to its own medication', () => {
  for (const text of [
    'Give aspirin PO and naloxone IN and epinephrine IM.',
    'Give aspirin PO, naloxone IN, epinephrine IM.',
    'Give aspirin PO. Give naloxone IN. Give epinephrine IM.',
    'Give PO aspirin; give IN naloxone; give IM epinephrine.',
  ]) {
    const routes = Object.fromEntries(medications(text).map(r=>[r.matched_drug.replace(/^give /,''),r.administration_route]));
    assert.deepEqual(routes,{aspirin:'PO',naloxone:'IN',epinephrine:'IM'},text);
  }
});

test('ordinary prose, unsupported routes and drug identity do not invent a new route', () => {
  for (const text of [
    'Give aspirin.', 'Give naloxone.', 'Give morphine in the ambulance.',
    'GIVE MORPHINE IN AMBULANCE.', 'Give naloxone in 2 minutes.',
    'Give morphine after oral airway placement.', 'Give midazolam to the mad patient.',
    'Give aspirin not orally.',
    'Give naloxone IN or IM.',
  ]) {
    for (const r of medications(text)) assert.equal(r.administration_route,undefined,text);
  }
  assert.equal(medications('Give epinephrine IM not IV.')[0].administration_route,'IM');
  assert.equal(medications('Give aspirin PO and give morphine.').find(r=>r.matched_drug==='morphine').administration_route,undefined);
});

test('route metadata does not bypass negation or denied medication orders', () => {
  assert.equal(medications('Do not give aspirin PO.').length,0);
  assert.equal(detectWithConfirmation('Give aspirin PO.', {}, 'NORMAL', {deny:['medication_push|aspirin']}).rolls.length,0);
});

test('client selects explicit or default route scenes and retains outcomes and reference panel', async () => {
  const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
  const helper=source.slice(source.indexOf('async function animateMedicationAdministration('),source.indexOf('function animateRouteMedication('));
  const calls=[];
  const infusion={dataset:{}};
  const header={textContent:''};
  const context=vm.createContext({
    document:{getElementById:id=>id==='infusion-overlay'?infusion:header},
    animateRouteMedication:async(...args)=>calls.push(['route',...args]),
    animateMedPush:async (...args)=>calls.push(['push',...args]),
    showDrugPanel:drug=>calls.push(['card',drug]),
  });
  vm.runInContext(helper,context);
  for(const [route,id] of [['PO','oralmed'],['SL','oralmed'],['IN','inmed'],['IM','immed'],['NEB','nebmed']]) {
    calls.length=0;
    await context.animateMedicationAdministration({administration_route:route,outcome:'MARGINAL',matched_drug:'test-drug'});
    assert.equal(calls[0][0],'route'); assert.equal(calls[0][1],id); assert.equal(calls[0][2],'MARGINAL');
    assert.deepEqual(calls[1],['card','test-drug']);
  }
  for(const route of [undefined,'IV','constructor']) {
    calls.length=0;
    await context.animateMedicationAdministration({administration_route:route,outcome:'FAILURE'});
    assert.deepEqual(calls,[['push','FAILURE']]);
  }
  calls.length=0;
  await context.animateMedicationAdministration({administration_route:'IO',outcome:'SUCCESS'});
  assert.deepEqual(calls,[['push','SUCCESS','IO','MEDICATION']]);
  for (const kind of ['fluid','blood']) {
    for (const route of ['IO','IV']) {
      calls.length=0;
      await context.animateMedicationAdministration({administration_route:route,medication_kind:kind,medication_name:'Test product',outcome:'SUCCESS'});
      assert.deepEqual(calls,[['route','infusion','SUCCESS',3200]], 'fluids and blood always use their bag');
      assert.equal(infusion.dataset.route,route, 'replaying IV after IO must remove the pressure sleeve and marrow');
      assert.equal(infusion.dataset.fluid,kind);
      assert.equal(header.textContent,route==='IO'?'IO · Test product · PRESSURE INFUSION':'Test product');
    }
  }
  for (const [route,id] of [['PO','oralmed'],['IN','inmed'],['NEB','nebmed']]) {
    calls.length=0;
    await context.animateMedicationAdministration({medication_animation_route:route,outcome:'COMPLICATION'});
    assert.equal(calls[0][1],id); assert.equal(calls[0][2],'COMPLICATION');
  }
  calls.length=0;
  await context.animateMedicationAdministration({administration_route:'IV',medication_animation_route:'IN',outcome:'SUCCESS'});
  assert.deepEqual(calls,[['push','SUCCESS']]);
  calls.length=0;
  await context.animateMedicationAdministration({administration_route:'PO',no_roll:true});
  assert.equal(calls[0][1],'oralmed'); assert.equal(calls[0][2],'SUCCESS');
});


test('drug and formulation defaults select artwork without prescribing a route', () => {
  for (const [drug,route] of [
    ['nitro','PO'],['nitroglycerin','PO'],['aspirin','PO'],['ASA','PO'],
    ['Narcan','IN'],['naloxone','IN'],['oral glucose','PO'],
    ['activated charcoal','PO'],['charcoal','PO'],['Actidose','PO'],
    ['albuterol','NEB'],['DuoNeb','NEB'],['levalbuterol','NEB'],['racemic epi','NEB'],
    ['versed','IM'],['midazolam','IM'],['haldol','IM'],['haloperidol','IM'],
    ['ketamine','IM'],['B52','IM'],['b-52 cocktail','IM'],
  ]) {
    const text=`Give ${drug}.`;
    for (const rolls of [medications(text),detectAllAndRoll(text).filter(r=>r.procedure_id==='medication_push')]) {
      assert.equal(rolls.length,1,text);
      assert.equal(rolls[0].medication_animation_route,route,text);
      if(drug!=='oral glucose') assert.equal(rolls[0].administration_route,undefined,text);
    }
  }
});

test('explicit routes override defaults and unsupported or ambiguous routes block them', () => {
  for (const [text,route] of [
    ['Give Narcan Intravenous.','IV'], ['Give naloxone Intramuscular.','IM'],
    ['Give nitro IV.','IV'], ['Give nitro SL.','SL'], ['Give albuterol Intranasal.','IN'],
  ]) {
    const [roll]=medications(text);
    assert.equal(roll.administration_route,route,text);
    assert.equal(roll.medication_animation_route,route,text);
  }
  for (const text of ['Give nitro paste.','Give albuterol MDI.','Give epinephrine.',
    'Give aspirin not orally.','Give naloxone IN or IM.','Give morphine.']) {
    const [roll]=medications(text);
    assert.ok(roll,text);
    assert.equal(roll.medication_animation_route,undefined,text);
  }
  const mixed=medications('Give aspirin and Narcan Intravenous and albuterol.');
  assert.deepEqual(Object.fromEntries(mixed.map(r=>[r.matched_drug.toLowerCase(),r.medication_animation_route])),{aspirin:'PO',narcan:'IV',albuterol:'NEB'});
});

test('explicit routes override IM animation defaults', () => {
  for (const [text, route] of [
    ['Give Versed IV.', 'IV'], ['Give Haldol PO.', 'PO'],
    ['Give ketamine IN.', 'IN'], ['Give B52 IV.', 'IV'],
  ]) {
    const [roll] = medications(text);
    assert.equal(roll.administration_route, route, text);
    assert.equal(roll.medication_animation_route, route, text);
  }
});


test('tracked access selects unspecified vascular animations without overriding routes or formulations', () => {
  const { applyAccessAnimationRoutes } = require('../src/engine/medication-route');
  for (const text of ['Give epinephrine', 'Give normal saline', 'Transfuse PRBCs']) {
    for (const [access, expected] of [
      [[{kind:'IO',status:'patent'}], 'IO'],
      [[{kind:'IV',status:'blown'},{kind:'IO',status:'patent'}], 'IO'],
      [[{kind:'IV',status:'marginal'},{kind:'IO',status:'patent'}], 'IO'],
      [[{kind:'IO',status:'marginal'},{kind:'IV',status:'patent'}], 'IV'],
      [[{kind:'IO',status:'marginal'}], 'IO'],
      [[{kind:'IO',status:'blown'}], undefined],
      [[], undefined],
    ]) {
      const rolls=medications(text);
      applyAccessAnimationRoutes(rolls,access);
      assert.equal(rolls[0].medication_animation_route,expected,text);
      assert.equal(rolls[0].administration_route,undefined,'presentation must not invent an explicit order');
    }
  }
  for (const text of ['Give epinephrine IV','Give aspirin','Give naloxone IN','Give epinephrine IM',
    'Give nitro paste','Give epinephrine not IO','Give naloxone IN or IM','Give albuterol MDI']) {
    const rolls=medications(text), before=structuredClone(rolls);
    applyAccessAnimationRoutes(rolls,[{kind:'IO',status:'patent'}]);
    assert.deepEqual(rolls,before,text);
  }
});

test('IO administration phrases do not roll placement, while separate placement orders still do', () => {
  const { detectAllProcedures }=require('../src/engine/dice');
  for (const text of ['IO push','Through the IO','Give epinephrine IO push',
    'Give epinephrine through the IO','Give normal saline through the IO','Transfuse PRBCs through the IO']) {
    assert.equal(detectAllProcedures(text).some(r=>r.proc.id==='io_access'),false,text);
    assert.equal(detectWithConfirmation(text,{},'NORMAL',{allow:['io_access']}).rolls.some(r=>r.procedure_id==='io_access'),false,text);
    assert.equal(detectAllAndRoll(text).some(r=>r.procedure_id==='io_access'),false,text);
  }
  for (const text of ['IO','Place IO','Drill the tibia','IO push epinephrine; place IO',
    'Give epinephrine through the IO. Place another IO.']) {
    assert.equal(detectAllProcedures(text).filter(r=>r.proc.id==='io_access').length,1,text);
  }
});
