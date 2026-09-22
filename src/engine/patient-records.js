'use strict';

const PATIENT_ID = /^patient_[1-9]\d{0,3}$/;
const text = (value, max = 160) => typeof value === 'string' && value.trim()
  ? value.replace(/[\x00-\x1f]/g, ' ').trim().slice(0, max) : null;

// Only revealed demographics belong in this roster; the seed remains hidden until obtained.
function initialPatientRecords(seed = {}, source = null) {
  const record = { id: 'patient_1', label: 'Primary patient' };
  if (source) Object.assign(record, {
    name: seed.patient_name, age: seed.patient_age, age_display: seed.patient_age_display,
    sex: seed.sex, comorbidity: seed.comorbidity_bundle, source,
  });
  return [record];
}

function ensurePatientRecord(records, id, label) {
  if (!PATIENT_ID.test(id)) return null;
  let record = records.find(patient => patient.id === id);
  if (!record) {
    record = { id, label: `Patient ${id.slice(8)}` };
    records.push(record);
  }
  if (text(label, 80)) record.label = text(label, 80);
  return record;
}

function parsePatientRecords(reply) {
  const patches = [];
  // JSON allows multi-word names/history and more than one patient in a single reply.
  const cleanedReply = reply.replace(/\[PATIENT_DEMO:\s*(\{[^\n]*?\})\s*\]/gi, (_, json) => {
    try {
      const value = JSON.parse(json);
      if (PATIENT_ID.test(value.id)) patches.push(value);
    } catch { /* A malformed update must not discard earlier records or fail the turn. */ }
    return '';
  }).replace(/\[PATIENT_DEMO:[^\]\n]*\]/gi, '').trim();
  return { cleanedReply, patches };
}

function updatePatientRecords(records, patches) {
  for (const patch of patches) {
    const record = ensurePatientRecord(records, patch.id, patch.label);
    if (!record) continue;
    const source = text(patch.source);
    if (!source) continue; // Identifying a patient alone does not reveal demographics.
    record.source = source;
    for (const field of ['name', 'age_display', 'sex', 'comorbidity']) {
      const value = text(patch[field], field === 'comorbidity' ? 500 : 160);
      if (value) record[field] = value;
    }
    if (typeof patch.age === 'number' && Number.isFinite(patch.age) && patch.age >= 0 && patch.age <= 130) {
      record.age = patch.age;
      // A corrected numeric age replaces an old formatted age unless explicitly supplied.
      if (!text(patch.age_display)) delete record.age_display;
    }
  }
  return records;
}

module.exports = { initialPatientRecords, ensurePatientRecord, parsePatientRecords, updatePatientRecords };
