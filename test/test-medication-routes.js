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
    ['Give morphine IV.', 'IV'], ['Give epinephrine through the IO.', 'IO'],
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
    'Give nitroglycerin sublingually.', 'Give aspirin not orally.',
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

test('client selects PO, IN and IM scenes and retains the existing default and reference panel', async () => {
  const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
  const helper=source.slice(source.indexOf('async function animateMedicationAdministration('),source.indexOf('function animateRouteMedication('));
  const calls=[];
  const context=vm.createContext({
    animateRouteMedication:async(...args)=>calls.push(['route',...args]),
    animateMedPush:async outcome=>calls.push(['iv',outcome]),
    showDrugPanel:drug=>calls.push(['card',drug]),
  });
  vm.runInContext(helper,context);
  for(const [route,id] of [['PO','oralmed'],['IN','inmed'],['IM','immed']]) {
    calls.length=0;
    await context.animateMedicationAdministration({administration_route:route,outcome:'MARGINAL',matched_drug:'test-drug'});
    assert.equal(calls[0][0],'route'); assert.equal(calls[0][1],id); assert.equal(calls[0][2],'MARGINAL');
    assert.deepEqual(calls[1],['card','test-drug']);
  }
  for(const route of [undefined,'IV','IO','SL','constructor']) {
    calls.length=0;
    await context.animateMedicationAdministration({administration_route:route,outcome:'FAILURE'});
    assert.deepEqual(calls,[['iv','FAILURE']]);
  }
  calls.length=0;
  await context.animateMedicationAdministration({administration_route:'PO',no_roll:true});
  assert.equal(calls[0][1],'oralmed'); assert.equal(calls[0][2],'SUCCESS');
});
