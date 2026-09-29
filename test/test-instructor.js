'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
process.env.EMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-instructor-test-'));
after(() => fs.rmSync(process.env.EMS_DATA_DIR, { recursive: true, force: true }));
const apiPath = require.resolve('../src/engine/api');
require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: {
  sendTurn: async () => 'Instructor test dispatch. [TIME: 1:00]',
  sendDebrief: async () => 'Private automated debrief.\n[PATIENT_OUTCOME: Discharged home on September 26, 2026]',
} };
const { catalog, prepareInstructor, REVIEW_NOTICE } = require('../src/engine/instructor');
const { rollScenario } = require('../src/engine/roller');
const { assembleSeedBlock } = require('../src/engine/assembler');
const { restoreSession, getSession, deleteSession } = require('../src/server/sessionStore');
const persistence = require('../src/server/persistence');
const router = require('../src/server/routes/scenario');
const players = require('../src/server/playerStore');
async function route(routePath, { method = 'get', body = {}, params = {}, query = {}, cookie = '' } = {}) {
  const layer = router.stack.find(e => e.route?.path === routePath && e.route.methods[method]);
  let status = 200, payload; const headers = {};
  const res = { status(v) { status = v; return this; }, json(v) { payload = v; return this; }, setHeader(k, v) { headers[k] = v; } };
  await layer.route.stack[0].handle({ body, params, query, headers: { cookie }, ip: 'instructor-test' }, res);
  return { status, body: payload, headers };
}
test('every catalog scenario is selectable regardless of normal difficulty, history, region, or season gates', () => {
  const entries = catalog();
  assert.equal(new Set(entries.map(e => e.category)).size, 12);
  for (const entry of entries) {
    const seed = rollScenario({ difficulty: 'EASY', region_id: 'TROPICAL_ISLAND', instructor: prepareInstructor({ case_id: entry.case_id, seed: { season: 'summer', random_seed: 'all-instructor-cases' } }), history: { presentations: [entry.presentation], categories: [entry.category], total_count: 1, doa_positions: [0], zoo_positions: [0] } });
    assert.equal(seed.case_id, entry.case_id);
    assert.equal(seed.category, entry.category);
    assert.equal(seed.instructor_mode, true);
  }
});
test('run overrides drive the prompt and never mutate catalog entries or later runs', () => {
  const entry = catalog().find(e => e.category === 'arrest');
  const before = catalog();
  const instructor = prepareInstructor({ case_id: entry.case_id, scenario: { reversible_cause_hint: 'Curriculum case key', special_flags: 'structured_narrative', rhythm: 'Asystole', 'compatibility.seasons': ['summer'] }, seed: { patient_age: 42, season: 'winter', weather_id: 'clear', trajectory: 'stable', backup_present_on_arrival: false, random_seed: 'curriculum' }, hide_debrief: true });
  const seed = rollScenario({ instructor });
  assert.equal(seed.hint, 'Curriculum case key');
  assert.equal(seed.arrest_rhythm, 'Asystole');
  assert.equal(seed.special_flags, 'structured_narrative');
  assert.equal(seed.patient_age, 42);
  assert.equal(seed.age_group, 'middle_aged');
  assert.equal(seed.patient_age_display, '42 years old');
  assert.equal(seed.weather, null);
  assert.equal(seed.decompensation_clock, null);
  assert.equal(seed.hide_debrief, true);
  assert.match(assembleSeedBlock(seed), /Curriculum case key/);
  assert.deepEqual(catalog(), before);
  const next = rollScenario({ instructor: prepareInstructor({ case_id: entry.case_id }) });
  assert.equal(next.hint, entry.reversible_cause_hint);
  assert.equal(next.hide_debrief, false);
  const complication = rollScenario({ difficulty: 'EASY', instructor: prepareInstructor({ case_id: entry.case_id, seed: { complication_type: 'equipment_failure', sex: 'male', comorbidity_bundle: 'otherwise_healthy' } }) });
  assert.match(assembleSeedBlock(complication), /Complication type: equipment_failure/);
  assert.equal(complication.sex, 'male');
});
test('instructor input cannot overwrite identity, runtime state, or provide malformed parameters', () => {
  const case_id = catalog()[0].case_id;
  for (const seed of [{ events: [] }, { user_id: 'another-player' }, { patient_age: -1 }, { patient_age: null }, { random_seed: '' }, { season: 'invalid' }, { backup_present_on_arrival: 'false' }]) assert.throws(() => prepareInstructor({ case_id, seed }));
  assert.throws(() => prepareInstructor({ case_id: 'missing' }));
  assert.throws(() => prepareInstructor({ case_id, scenario: { case_id: 'different' } }));
  assert.throws(() => prepareInstructor({ case_id, scenario: { age_override: [''] } }));
});
test('instructor settings survive save, resume, library, and replay; student review hides debrief while debug retains it', async () => {
  const { player, token } = await players.signup('Instructor Test', '2468');
  const cookie = `ems_player=${token}`;
  const entry = catalog().find(e => e.category === 'doa');
  const created = await route('/new', { method: 'post', cookie, body: { instructor: { case_id: entry.case_id, hide_debrief: true, scenario: { hint: 'Temporary hint' } } } });
  assert.equal(created.status, 200);
  assert.equal(created.body.instructor_mode, true);
  const id = created.body.session_id;
  const session = getSession(id); session.close();
  const debrief = await route('/:id/debrief', { method: 'post', cookie, params: { id }, body: { operation_id: randomUUID() } });
  assert.equal(debrief.body.debrief, REVIEW_NOTICE);
  assert.equal(debrief.body.learning.hideDebrief, true);
  assert.doesNotMatch(JSON.stringify(debrief.body), /Private automated debrief/);
  assert.ok(debrief.body.patientOutcome);
  deleteSession(id);
  const restored = restoreSession(persistence.load(id));
  assert.equal(restored.seed.instructor_mode, true);
  assert.equal(restored.seed.hint, 'Temporary hint');
  assert.equal(restored.playerId, player.id);
  for (const endpoint of ['/runs/:runId', '/runs/:runId/transcript']) {
    const run = await route(endpoint, { cookie, params: { runId: id } });
    assert.equal(run.body.instructorMode, true);
    assert.equal(run.body.learning.hideDebrief, true);
    assert.equal(run.body.debrief, REVIEW_NOTICE);
    assert.doesNotMatch(JSON.stringify(run.body), /Private automated debrief/);
  }
  const debug = await route('/:id/transcript', { cookie, params: { id } });
  assert.equal(debug.body.debriefText, 'Private automated debrief.');
  assert.equal(debug.body.learningReview.debriefText, REVIEW_NOTICE);
  const replay = await route('/new', { method: 'post', cookie, body: { replay_of: id } });
  assert.equal(replay.body.instructor_mode, true);
  assert.equal(getSession(replay.body.session_id).seed.hide_debrief, true);
  assert.equal(catalog().find(e => e.case_id === entry.case_id).hint, entry.hint);
  const invalid = await route('/new', { method: 'post', cookie, body: { instructor: { case_id: 'unknown' } } });
  assert.equal(invalid.status, 400);
});
test('default exports contain review, timeline, vitals, and outcome, while backend logs require debug export', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/practice.js'), 'utf8'), context);
  const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  vm.runInContext(app.slice(app.indexOf('function formatBackendSection('), app.indexOf('function downloadFile(')), context);
  context.input = { meta: { category: 'doa', instructor_mode: true }, turns: [{ user: 'Assess', assistant: 'Observed findings.', scene_minute: 2 }] };
  context.backend = { turns: [{ user: 'begin', assistant: 'Dispatch from complete server record.', sceneMinute: 1 }], seed: { scenario_id: 'private-id', hint: 'PRIVATE KEY', events: [] }, systemPrompt: 'INTERNAL PROMPT', messages: [{ role: 'system', content: 'PRIVATE MESSAGES' }], debriefText: 'PRIVATE DEBRIEF', patientOutcome: 'Discharged home', learningReview: { hideDebrief: true, debriefText: 'PRIVATE DEBRIEF', timeline: [{ turn: 1, minute: 2, action: 'Assess', scene: 'Observed findings.', vitals: { HR: 100 }, procedures: [{ id: 'iv_access', intervention: true, roll: 18, dc: 10, outcome: 'SUCCESS' }] }] } };
  const clean = vm.runInContext('formatTranscript(input, backend)', context);
  assert.match(clean, /Instructor mode/);
  assert.match(clean, /Dispatch from complete server record/);
  assert.match(clean, /Turn in this call/);
  assert.match(clean, /TIMELINE/);
  assert.match(clean, /VITALS/);
  assert.match(clean, /HR: 100/);
  assert.match(clean, /Discharged home/);
  assert.doesNotMatch(clean, /PRIVATE|INTERNAL|BACKEND|d20|DC 10/);
  const debug = vm.runInContext('formatTranscript(input, backend, {debug: true})', context);
  assert.match(debug, /PRIVATE KEY/);
  assert.match(debug, /INTERNAL PROMPT/);
  assert.match(debug, /PRIVATE MESSAGES/);
  assert.match(debug, /PRIVATE DEBRIEF/);
  assert.match(debug, /d20/);
});

test('custom partners replace catalog behavior, survive route snapshots, and retain transport identity', async () => {
  const custom_partner = { name: 'Marcus Webb', description: 'A classmate who asks careful questions and jokes when nervous.' };
  const instructor = { case_id: catalog()[0].case_id, custom_partner };
  const seed = rollScenario({ provider_level: 'BLS', instructor: prepareInstructor(instructor) });
  assert.equal(seed.crew_partner, custom_partner.name);
  assert.equal(seed.crew_transport_driver, custom_partner.name);
  assert.equal(seed.custom_partner.role, 'partner_BLS');
  assert.equal(seed.custom_partner.competency, undefined);
  const partnerBlock = assembleSeedBlock(seed).split('Partner: ')[1].split('Captain:')[0];
  assert.match(partnerBlock, /A classmate who asks careful questions/);
  assert.doesNotMatch(partnerBlock, /Competency:|Trigger behaviors:|undefined/);
  const result = await route('/new', { method: 'post', body: { instructor } });
  assert.equal(result.status, 200);
  assert.equal(result.body.crew.partner.custom, true);
  assert.equal(result.body.crew.partner.personality_notes, custom_partner.description);
  assert.equal(result.body.crew.partner.enthusiasm, undefined);
  const snapshot = persistence.load(result.body.session_id);
  assert.deepEqual(snapshot.crew.partner, snapshot.seed.custom_partner);
  deleteSession(result.body.session_id);
  assert.equal(rollScenario().custom_partner, undefined);
});

test('custom partner rejects blank, oversized, and trait-based input', () => {
  for (const custom_partner of [{}, { name: 'Alex', description: ' ' }, { name: 'x'.repeat(81), description: 'Calm' },
    { name: 'Alex', description: 'x'.repeat(4001) }, { name: 'Alex', description: 'Calm', competency: 'high' }]) {
    assert.throws(() => prepareInstructor({ case_id: catalog()[0].case_id, custom_partner }), /Custom partner/);
  }
});

test('custom captain works independently and with a custom partner', async () => {
  for (const withPartner of [false, true]) {
    const instructor = { case_id: catalog()[0].case_id, custom_captain: { name: 'Captain Sam', description: 'Quiet, patient supervisor who asks for a plan.' },
      ...(withPartner ? { custom_partner: { name: 'Alex', description: 'Asks careful questions.' } } : {}) };
    const result = await route('/new', { method: 'post', body: { instructor, provider_level: 'BLS' } });
    assert.equal(result.status, 200);
    assert.equal(result.body.crew.captain.name, 'Captain Sam');
    assert.equal(result.body.crew.captain.role, 'captain_BLS');
    assert.equal(result.body.crew.captain.competency, undefined);
    assert.equal(!!result.body.crew.partner.custom, withPartner);
    const snapshot = persistence.load(result.body.session_id);
    assert.deepEqual(snapshot.crew.captain, snapshot.seed.custom_captain);
    const prompt = assembleSeedBlock(snapshot.seed);
    assert.match(prompt, /Quiet, patient supervisor/);
    assert.doesNotMatch(prompt.split('Captain: Captain Sam')[1].split('BACKUP')[0], /Competency: undefined/);
    assert.notEqual(snapshot.seed.crew_transport_driver, 'Captain Sam');
    deleteSession(result.body.session_id);
  }
  assert.throws(() => prepareInstructor({ case_id: catalog()[0].case_id, custom_captain: { name: 'Sam', description: '' } }), /Custom captain/);
});

test('saved roster partners work on ordinary calls and reject malformed descriptions', async () => {
  const custom_partner = { name: 'Roster Alex', description: 'Careful and quiet.' };
  const result = await route('/new', { method: 'post', body: { custom_partner } });
  assert.equal(result.status, 200);
  assert.equal(result.body.crew.partner.name, 'Roster Alex');
  assert.equal(result.body.crew.partner.custom, true);
  const snapshot = persistence.load(result.body.session_id);
  assert.equal(snapshot.seed.instructor_mode, undefined);
  assert.equal(snapshot.seed.crew_transport_driver, 'Roster Alex');
  assert.match(assembleSeedBlock(snapshot.seed), /Careful and quiet/);
  deleteSession(result.body.session_id);
  const invalid = await route('/new', { method: 'post', body: { custom_partner: { name: 'Alex', description: '' } } });
  assert.equal(invalid.status, 400);
});

test('saved roster captains work on ordinary calls and reject malformed descriptions', async () => {
  const custom_captain = { name: 'Captain Alex', description: 'Careful and quiet.' };
  const result = await route('/new', { method: 'post', body: { custom_captain } });
  assert.equal(result.status, 200);
  assert.equal(result.body.crew.captain.name, 'Captain Alex');
  assert.equal(result.body.crew.captain.custom, true);
  const snapshot = persistence.load(result.body.session_id);
  assert.equal(snapshot.seed.instructor_mode, undefined);
  assert.notEqual(snapshot.seed.crew_transport_driver, 'Captain Alex');
  assert.match(assembleSeedBlock(snapshot.seed), /Careful and quiet/);
  deleteSession(result.body.session_id);
  const invalid = await route('/new', { method: 'post', body: { custom_captain: { name: 'Alex', description: '' } } });
  assert.equal(invalid.status, 400);
});
