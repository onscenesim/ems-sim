'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { segments, withSpeakers } = require('../public/dialogue-colors');
const context = {crew: {partner:{name:'Marcus Webb'}, captain:{name:'José O’Neil'}}, patients:[{name:'Alex Jones'}, {name:'Maria Lopez'}]};
function roleAt(text, fragment, player = false) {
  const pos = text.indexOf(fragment);
  let offset = 0;
  for (const part of segments(text, context, player)) {
    if (pos >= offset && pos < offset + part.text.length) return part.role;
    offset += part.text.length;
  }
}
test('speaker names and quoted dialogue use their role; action beats stay descriptive', () => {
  for (const [name,role] of [['Marcus','crew'],['Captain Priya','crew'],['Webb','crew'],['José O’Neil','crew'],['Alex','patient'],['Maria Lopez','patient'],['Patient 2','patient'],['Wife','bystander'],['Unknown Visitor','bystander']]) {
    const text = `${name}: “I feel dizzy.” The bag is open.`;
    assert.equal(roleAt(text,name),role,text);
    assert.equal(roleAt(text,'I feel'),role,text);
    assert.equal(roleAt(text,'The bag'),'description',text);
    assert.equal(segments(text,context).map(p=>p.text).join(''),text);
  }
});
test('inline names, attribution, player text and clinical terms retain separate categories', () => {
  const text = 'Marcus checks Alex. Wife says, “He feels ill.”';
  assert.equal(roleAt(text,'Marcus'),'crew');
  assert.equal(roleAt(text,'Alex'),'patient');
  assert.equal(roleAt(text,'checks'),'description');
  assert.equal(roleAt(text,'He feels'),'bystander');
  assert.equal(roleAt('“I feel ill,” Alex says.','I feel'),'patient');
  for (const term of ['Zyprexa','Suboxone','CPR','IV access','12-lead ECG','needle decompression','Haldol']) {
    const line = `Marcus: "Prepare ${term}."`;
    assert.equal(roleAt(line,term),'care');
    assert.equal(roleAt(`Give ${term}`,term,true),'care');
    assert.equal(roleAt(`Give ${term}`,'Give',true),'player');
  }
});
test('matching preserves text, avoids partial words, and handles shared first names', () => {
  const text = '<img src=x onerror=alert(1)> Epinephrine and a saline bag beside a cabin.';
  assert.equal(segments(text,context).map(p=>p.text).join(''),text);
  assert.equal(roleAt('Aspirin in a cabin.','cabin'),'description');
  assert.equal(roleAt('Wife: "He has been pacing all evening."','pacing'),'bystander');
  assert.equal(segments('Alex: "Hello."',{crew:{partner:{name:'Alex Smith'}},patients:[{name:'Alex Jones'}]})[0].role,'bystander');
});


test('named bystanders retain their role in narration without overriding known speakers', () => {
  const updated = withSpeakers('Sarah: “I called.”\nMarcus: “Thank you.”', context);
  assert.deepEqual(updated.bystanders, ['Sarah']);
  assert.equal(segments('Sarah stands beside Marcus.', updated)[0].role, 'bystander');
  assert.equal(segments('Marcus: “Thank you.”', updated)[0].role, 'crew');
});
