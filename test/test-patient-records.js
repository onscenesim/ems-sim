'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initialPatientRecords, parsePatientRecords, updatePatientRecords } = require('../src/engine/patient-records');

const seed = {
  scenario_id: 'demographics-test', difficulty: 'NORMAL', provider_level: 'ALS',
  region: 'SUBURBAN', category: 'ob', patient_age: 30, age_group: 'young_adult',
  sex: 'female', patient_name: 'Jane Smith', presentation: 'Delivery',
  special_flags: 'two_patients', trajectory: 'stable', decompensation_clock: null,
  complication_type: 'none', complication_roll: 5, comorbidity_bundle: 'otherwise_healthy', events: [],
};
const tag = value => `[PATIENT_DEMO: ${JSON.stringify(value)}]`;

test('records merge only sourced fields, preserve newborn ages and keep patient histories separate', () => {
  const records = initialPatientRecords(seed);
  assert.deepEqual(records, [{ id: 'patient_1', label: 'Primary patient' }]);
  updatePatientRecords(records, [
    { id: 'patient_1', label: 'Mother', name: 'Jane Smith', age: 30, source: 'patient stated' },
    { id: 'patient_2', label: 'Newborn', age: 0, age_display: '10 minutes old', sex: 'female', source: 'Mother' },
    { id: 'patient_3', label: 'Bystander', name: 'Undisclosed name' },
  ]);
  updatePatientRecords(records, [{ id: 'patient_1', comorbidity: 'Asthma [childhood]', source: 'patient stated' }]);
  assert.equal(records[0].name, 'Jane Smith');
  assert.equal(records[0].comorbidity, 'Asthma [childhood]');
  assert.equal(records[1].age, 0);
  assert.equal(records[1].age_display, '10 minutes old');
  assert.equal(records[1].name, undefined);
  assert.equal(records[1].comorbidity, undefined);
  assert.equal(records[2].name, undefined);
  updatePatientRecords(records, [{ id: 'patient_2', age: -5, name: null, source: 'Mother' }]);
  assert.equal(records[1].age, 0);
});

test('multiple JSON tags are stripped and malformed demographic updates do not corrupt records', () => {
  const { cleanedReply, patches } = parsePatientRecords('Two patients. '
    + tag({ id: 'patient_1', comorbidity: 'Asthma [childhood]', source: 'patient stated' })
    + tag({ id: 'patient_2', label: 'Newborn' })
    + ' [PATIENT_DEMO: {broken}] [PATIENT_DEMO: not JSON]'
    + tag({ id: '__proto__', name: 'invalid', source: 'unknown' }));
  assert.equal(cleanedReply, 'Two patients.');
  assert.equal(patches.length, 2);
  const records = updatePatientRecords(initialPatientRecords(seed), patches);
  assert.equal(records[0].comorbidity, 'Asthma [childhood]');
  assert.deepEqual(records[1], { id: 'patient_2', label: 'Newborn' });
});

let reply = '';
require.cache[require.resolve('../src/engine/api')] = { exports: { sendTurn: async () => reply, sendDebrief: async () => '' } };
require.cache[require.resolve('../src/server/adminLogger')] = { exports: { logRun() {}, updateRunDebrief() {} } };
const { Session } = require('../src/engine/session');
const { restoreSession, deleteSession } = require('../src/server/sessionStore');

test('session logs discoveries for multiple patients without changing focus and resumes all records', async () => {
  let session = new Session(structuredClone(seed));
  reply = 'The mother gives her name; the crew assesses a newborn. '
    + tag({ id: 'patient_1', label: 'Mother', name: 'Jane Smith', source: 'patient stated' })
    + tag({ id: 'patient_2', label: 'Newborn', age: 0, age_display: '10 minutes old', source: 'crew' })
    + ' [PATIENT_FOCUS: patient_1 | Mother] [VITALS: GCS=15] [TIME: 1:00]';
  const result = await session.send('Observe', true);
  assert.ok(!result.reply.includes('PATIENT_DEMO'));
  assert.equal(session.patientFocus.id, 'patient_1');
  assert.equal(session.secondPatientFound, true);
  assert.equal(session.patientRecords[0].age, undefined, 'hidden seed age stays unknown');
  assert.equal(session.patientRecords[0].comorbidity, undefined, 'hidden history stays unknown');
  session = restoreSession(JSON.parse(JSON.stringify({ ...session, id: 'patient-records-restore' })));
  reply = 'The mother is 30. ' + tag({ id: 'patient_1', age: 30, source: 'patient stated' })
    + ' [PATIENT_FOCUS: patient_2 | Newborn] [VITALS: HR=140] [TIME: 2:00]';
  await session.send('Focus on the newborn', true);
  assert.equal(session.patientRecords[0].name, 'Jane Smith');
  assert.equal(session.patientRecords[0].age, 30);
  assert.equal(session.patientRecords[1].age, 0);
  assert.equal(session.patientRecords[1].name, undefined);
  assert.equal(session.patientFocus.id, 'patient_2');
  deleteSession('patient-records-restore');
});

test('legacy saves migrate primary demographics without copying them to the focused secondary patient', () => {
  const session = restoreSession({ id: 'legacy-patient-records', seed, demo_source: 'Crew',
    patientFocus: { id: 'patient_2', label: 'Newborn' }, second_patient: true });
  assert.equal(session.patientRecords[0].name, 'Jane Smith');
  assert.deepEqual(session.patientRecords[1], { id: 'patient_2', label: 'Newborn' });
  deleteSession('legacy-patient-records');
});
