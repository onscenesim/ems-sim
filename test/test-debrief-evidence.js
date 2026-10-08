'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ECG = require('../public/twelve-lead');
const { buildDebriefContext } = require('../src/engine/assembler');
const { buildDebriefPrompt } = require('../src/engine/prompts/debrief');
const { evidenceFixture } = require('./fixtures/debrief-evidence');

test('complete scene and provider evidence survives middle disclosures and closing turns', () => {
  const { seed, turns, disclosure } = evidenceFixture();
  const user = 'Continue assessment. '.repeat(40) + 'Honor the valid DNR and continue oxygen.';
  turns.push({ user, assistant: 'The receiving nurse accepts the DNR.', sceneMinute: 19 });
  turns.push({ user: 'end scenario', assistant: 'The daughter confirms the directive.', sceneMinute: 20 });
  const context = buildDebriefContext(seed, turns, 4);
  assert.ok(context.includes(turns[1].assistant.replace(/\s+/g, ' ').trim()));
  assert.ok(context.includes(disclosure));
  assert.ok(context.includes(user));
  assert.match(context, /Turn 6 — PROVIDER: \(scenario closed\).*\n\s*SCENE: The daughter confirms the directive/);
  assert.doesNotMatch(context, /\[\.\.\.\]/);
});

test('stored serial ECGs retain capture time, patient, lead placement, morphology and artifact after restore', () => {
  const { seed, turns } = evidenceFixture();
  const acquired = turns[1].twelveLeads[0];
  const original = ECG.svg(acquired);
  const second = ECG.create({ seed: { presentation: 'Posterior STEMI' }, vitals: { HR: 90, Rhythm: 'sinus' },
    outcome: 'FAILURE', view: 'posterior', patientId: 'patient_2', minute: 6, id: 'second-paper' });
  turns.push({ user: 'Acquire posterior leads for the second patient.', assistant: 'Printout filed.',
    sceneMinute: 6, patientFocus: { id: 'patient_2', label: 'Passenger' }, twelveLeads: [second] });
  // Changing the seed and later vitals must never regenerate an old recording.
  const context = buildDebriefContext({ ...seed, presentation: 'Panic attack' }, JSON.parse(JSON.stringify(turns)), 4);
  const papers = context.split('\n').filter(line => line.includes('ECG PRINTOUT:'));
  assert.equal(papers.length, 2);
  assert.match(papers[0], /T\+2min · patient_1 · 12-lead ECG/);
  assert.ok(papers[0].includes(JSON.stringify(acquired.leads)));
  assert.ok(papers[0].includes(JSON.stringify(acquired.beats)));
  assert.ok(papers[0].includes(JSON.stringify(ECG.measurements(acquired))));
  assert.match(papers[0], /UNCONFIRMED.*do not assume this annotation was shown or read/);
  assert.match(papers[1], /T\+6min · patient_2/);
  assert.ok(papers[1].includes(JSON.stringify(second.leadLabels)));
  assert.ok(papers[1].includes(second.quality));
  assert.match(papers[1], /parameters do not make an obscured finding visible/);
  assert.equal(ECG.svg(acquired), original);
});

test('monitor-only findings are timestamped evidence and hidden saturation is kept separate', () => {
  const { seed } = evidenceFixture();
  const context = buildDebriefContext(seed, [{ user: 'Attach monitor.', assistant: 'Attached.', sceneMinute: 3,
    vitals: { HR: 80, Rhythm: 'sinus', Ectopy: 'frequent', BP: { value: '90/60', tMin: 1 }, SpO2: 86,
      TrueSpO2: 98, PrivateFinding: 'SECRET', PulseOx: { trueSpO2: 98, displayedSpO2: 86,
        quality: 'unreliable', reliable: false, reason: 'artifact', pulseRate: 80 } } }]);
  const displayed = context.split('\n').find(line => line.includes('DISPLAYED VITALS:'));
  assert.match(displayed, /HR 80.*BP 90\/60 \(measured T\+1min\).*SpO2 86%.*Rhythm sinus.*Ectopy frequent/);
  assert.match(displayed, /pleth unreliable, pulse rate 80/);
  assert.doesNotMatch(displayed, /98|hidden|SECRET|\[object Object\]/i);
  assert.match(context, /HIDDEN PHYSIOLOGY \(not player knowledge\).*true SpO2 98% \(hidden\)/);
  assert.doesNotMatch(context, /SECRET|ONLY source of information/);
  for (const level of ['ALS', 'BLS']) {
    const prompt = buildDebriefPrompt(level);
    assert.match(prompt, /SCENE narration, DISPLAYED VITALS.*stored ECG PRINTOUTS/);
    assert.match(prompt, /after the corresponding turn's order/);
    assert.doesNotMatch(prompt, /ONLY on what was revealed in the SCENE text/);
  }
});

test('both skip encodings report continuity of monitoring and care without inventing new interventions', () => {
  const { seed } = evidenceFixture();
  for (const turn of [{ user: 'Fast forward.', skip: true }, { user: '[Skip ahead to hospital]' }]) {
    const context = buildDebriefContext(seed, [{ ...turn, sceneMinute: 18 }], 4);
    assert.match(context, /PROVIDER: \(time-skip - fast-forwarded transport, ongoing care continued; no new interventions ordered\)/);
    assert.match(context, /Monitoring and existing treatments continued throughout the skipped interval/);
    assert.doesNotMatch(context, /no treatment rendered/);
  }
  assert.match(buildDebriefPrompt('ALS'), /provider kept monitoring and continued existing care/);
});

test('flatline paper and legacy turns without recordings can still be reviewed', () => {
  const { seed } = evidenceFixture();
  const paper = ECG.create({ vitals: { HR: 0, Rhythm: 'asystole' }, minute: 2 });
  assert.doesNotThrow(() => buildDebriefContext(seed, [{ user: 'Obtain ECG.', sceneMinute: 2, twelveLeads: [paper] }]));
  assert.doesNotMatch(buildDebriefContext(seed, [{ user: 'Assess.', assistant: 'Awake.', sceneMinute: 1 }]), /ECG PRINTOUT:/);
});
