'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-transport-state-'));
process.env.EMS_DATA_DIR = dataDir;
let drafts = [], requests = [];
require.cache[require.resolve('../src/engine/api')] = { exports: {
  sendTurn: async (_system, messages) => {
    requests.push(structuredClone(messages));
    assert.ok(drafts.length, 'Unexpected extra model request');
    return drafts.shift();
  }, sendDebrief: async () => '',
} };
require.cache[require.resolve('../src/server/adminLogger')] = { exports: { logRun() {}, updateRunDebrief() {} } };
const { Session } = require('../src/engine/session');
const { rollScenario } = require('../src/engine/roller');
const { roadNetwork, origin, drive, travelSeconds, orderedDestination } = require('../src/engine/transport');
const { restoreSession, deleteSession } = require('../src/server/sessionStore');
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

function scene(text, minute, tags = '', partner = 'on_scene') {
  const whole = Math.round(minute * 60);
  return `${text}\n${tags}\n[CREW_STATUS: partner=${partner} captain=not_on_scene]\n[PATIENT_FOCUS: patient_1 | Patient]\n[VITALS: GCS=15]\n[TIME: ${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}]`;
}
function session(difficulty = 'NORMAL', atHospital = true) {
  const seed = rollScenario({ random_seed: 'transport-state-replay', region_id: 'SUBURBAN', provider_level: 'ALS', category: 'medical', difficulty });
  Object.assign(seed, { weather_id: 'snow', complication_type: 'er_divert', routine_er_divert: false,
    catastrophe: null, backup_present_on_arrival: false, crew_partner: 'Darnell Hughes', crew_transport_driver: 'Darnell Hughes' });
  const s = new Session(seed);
  s.sceneMinute = atHospital ? 53 + 13 / 60 : 5;
  s.transportDest = 'major'; s.hasLoaded = true;
  s.transportPosition = atHospital ? drive(roadNetwork(seed), origin(), 'major', 1000) : origin();
  s.moving = !atHospital; s.departSceneMinute = 5;
  s.crewStatus = { partner: atHospital ? 'on_scene' : 'driving', captain: 'not_on_scene', driver: null };
  if (atHospital) s.incident = { id: 'er_divert', divertedDest: 'major', startedMinute: s.sceneMinute, resolved: false };
  s.messages = [{ role: 'user', content: 'Continue transport.' },
    { role: 'assistant', content: scene(atHospital ? 'University is on diversion. The crew retains care.' : 'The rig is driving toward University.', s.sceneMinute, '', s.crewStatus.partner) }];
  s.turns = [{ user: 'Continue transport.', assistant: 'Care continues.', sceneMinute: s.sceneMinute }];
  drafts = []; requests = [];
  return s;
}

test('a missing recovery/route tag cannot strand an acknowledged reroute in any difficulty', async () => {
  for (const difficulty of ['EASY', 'NORMAL', 'HARD', 'BLACK_CLOUD']) {
    const s = session(difficulty);
    const eta = travelSeconds(roadNetwork(s.seed), s.transportPosition, 'nearest');
    drafts = [scene('Hughes shifts into drive. The rig rolls toward Lakeview.', 54)];
    const result = await s.send('i meant to type lakeview disregard last turn');
    assert.equal(s.incident.resolved, true, difficulty);
    assert.equal(result.transportDest, 'nearest');
    assert.equal(s.transportStatus().phase, 'en_route');
    assert.equal(s.transportStatus().eta_seconds, eta);
    assert.equal(eta, 1962, 'hospital-to-hospital drive includes backtracking in snow');
    assert.equal(s.crewStatus.partner, 'driving', 'a stale parked footer cannot silently stop the resumed drive');
    assert.match(s.messages.at(-1).content, /\[EN_ROUTE:nearest\]/);
    assert.match(requests[0][0].content, /Continue transport/);
    assert.match(requests[0].at(-1).content, /Lakeview Community Hospital: 32:42/);

    const id = randomUUID();
    const resumed = restoreSession({ ...structuredClone(s), id });
    assert.deepEqual(resumed.transportStatus(), s.transportStatus());
    drafts = [scene('The blood pressure cuff completes its cycle.', 55)];
    await resumed.send('Cycle NIBP');
    assert.equal(resumed.transportStatus().eta_seconds, eta - 60);
    drafts = [scene('The ambulance reaches Lakeview Community Hospital ambulance bay.', 56)];
    const arrival = await resumed.send('Continue monitoring until arrival.');
    assert.equal(arrival.arrived, true);
    assert.equal(resumed.transportStatus().phase, 'arrived');
    assert.equal(resumed.sceneMinute, 55 + (eta - 60) / 60);
    assert.equal(resumed.closed, false);
    drafts = [scene('The receiving team accepts the handoff. Handoff complete.', resumed.sceneMinute + .5)];
    assert.equal((await resumed.send('Transfer care.', true)).closed, true);
    assert.equal(resumed.seed.events.filter(e => e.detail === 'er_divert: alternate_destination completed').length, 1);
    deleteSession(id);
  }
});

test('call-ahead intent triggers the selected ER diversion without requiring the REPORT switch', async () => {
  for (const [order, reportMode] of [['Call ahead to University Medical Center.', false], ['Call ahead to uni.', false], ['Patient report: adult, awake, stable.', true]]) {
    const s = session('NORMAL', false);
    drafts = [scene('University Medical Center is on diversion. Select another destination.', 6)];
    await s.send(order, reportMode);
    assert.equal(s.incident.divertedDest, 'major', order);
    assert.equal(s.transportStatus().phase, 'diverted');
    assert.match(requests[0].at(-1).content, /SYSTEM INCIDENT ACTIVE: er_divert/);
  }
});

test('another hospital contact, a question, a quoted order and a hypothetical do not trigger or resolve the wrong diversion', async () => {
  const s = session('NORMAL', false);
  drafts = [scene('Lakeview can receive your report.', 6)];
  await s.send('Call Lakeview Community Hospital.');
  assert.equal(s.incident, null, 'contacting an alternative does not divert the committed destination');
  for (const order of ['How far is Lakeview?', 'Should we redirect to Lakeview?', 'Do not redirect to Lakeview.', 'Tell Frank "redirect to Lakeview".']) {
    const blocked = session();
    drafts = [scene('University remains on diversion. The crew continues care in the parked ambulance.', 54)];
    await blocked.send(order);
    assert.equal(blocked.incident.resolved, false, order);
    assert.equal(blocked.transportDest, 'major');
    assert.equal(blocked.moving, false);
  }
  assert.equal(orderedDestination(s.seed, 'Lakeviewer is not a hospital.'), null);
});

test('a fabricated short ETA is repaired before it enters the story or saved history', async () => {
  for (const time of ['10', 'twelve']) {
    const s = session();
    drafts = [scene(`Hughes: "Lakeview is ${time} minutes away."`, 54),
      scene('Hughes: "Lakeview is about thirty-three minutes away on these roads."', 54)];
    const result = await s.send('How far away is Lakeview?');
    assert.equal(requests.length, 2);
    assert.match(requests[1].at(-1).content, /ETA contradicts CAD/);
    assert.match(result.reply, /thirty-three/);
    assert.doesNotMatch(s.messages.at(-1).content, /(?:10|twelve) minutes/);
    assert.equal(s.transportStatus().phase, 'diverted');
  }
});

test('two contradictory drafts leave the saved route, clock and incident untouched', async () => {
  const s = session();
  const before = structuredClone(s);
  drafts = [scene('Hughes: "Lakeview is ten minutes away."', 54), scene('Hughes: "Lakeview is ten minutes away."', 54)];
  await assert.rejects(s.send('How far is Lakeview?'), /No changes were saved/);
  assert.deepEqual(structuredClone(s), before);
});

test('a road refusal cannot resolve a diversion even with invented recovery and movement tags', async () => {
  const s = session();
  const refusal = scene('Lakeview is inaccessible because its approach road is blocked. The crew stays parked.', 54,
    '[INCIDENT_RECOVERY: alternate_destination]');
  drafts = [refusal];
  await s.send('Redirect transport to Lakeview.');
  assert.equal(s.incident.resolved, false);
  assert.equal(s.moving, false);
});

test('a conflicting destination draft is repaired rather than silently retagged to the ordered hospital', async () => {
  for (const tags of ['', '[EN_ROUTE:major]\n[INCIDENT_RECOVERY: alternate_destination]']) {
    const s = session();
    drafts = [scene('The ambulance rolls toward University Medical Center.', 54, tags),
      scene('The ambulance rolls toward Lakeview Community Hospital.', 54)];
    const result = await s.send('Redirect transport to Lakeview.');
    assert.equal(requests.length, 2);
    assert.match(result.reply, /Lakeview/);
    assert.doesNotMatch(result.reply, /University/);
    assert.equal(s.transportDest, 'nearest');
    assert.equal(s.incident.resolved, true);
  }
});

test('hospital-to-hospital estimates name the target correctly and permit rounded ranges', async () => {
  const s = session();
  drafts = [scene('Hughes: "Lakeview is 32–34 minutes from University Medical Center."', 54)];
  const result = await s.send('How far is Lakeview from here?');
  assert.match(result.reply, /32–34/);
  assert.equal(requests.length, 1);
});

test('an ordinary care turn reaching a diverted hospital repairs the welcome before committing arrival', async () => {
  const s = session('BLACK_CLOUD', false);
  s.sceneMinute = 37.75;
  s.transportPosition = drive(roadNetwork(s.seed), origin(), 'major', 23);
  const arrivalMinute = s.sceneMinute + travelSeconds(roadNetwork(s.seed), s.transportPosition, 'major') / 60;
  drafts = [scene('The ambulance reaches University Medical Center. The receiving team accepts the handoff. Handoff complete.', arrivalMinute),
    scene('University Medical Center is on diversion. The ambulance stops at the ED and the crew retains care.', arrivalMinute)];
  const result = await s.send('Continue current care and monitoring.');
  assert.equal(requests.length, 2);
  assert.doesNotMatch(result.reply, /Handoff complete/);
  assert.equal(result.arrived, false);
  assert.equal(s.sceneMinute, arrivalMinute);
  assert.equal(s.incident.startedMinute, arrivalMinute);
  assert.equal(s.seed.events.find(e => e.detail === 'er_divert triggered').scene_minute, arrivalMinute);
  assert.equal(travelSeconds(roadNetwork(s.seed), s.transportPosition, 'major'), 0);
  assert.equal(travelSeconds(roadNetwork(s.seed), s.transportPosition, 'nearest'), 1962);
});

test('a blocked handoff cannot close the call or transfer care in the narration', async () => {
  for (const reportMode of [false, true]) {
    const s = session();
    drafts = [scene('The receiving team accepts the handoff. Handoff complete.', 54),
      scene('University remains on diversion. The crew retains care in the ambulance.', 54)];
    const result = await s.send('Transfer care.', reportMode);
    assert.equal(result.closed, false);
    assert.equal(result.arrived, false);
    assert.equal(s.incident.resolved, false);
    assert.doesNotMatch(result.reply, /Handoff complete/);
  }
});
