'use strict';

const { createRandom } = require('./random');

const NO_CATH = 'ED stabilization · no cath lab';
const MONITORING = 'Cardiac monitoring · no cath lab';
const PCI = 'Cath lab · 24/7 primary PCI';
const NO_STROKE = 'No stroke designation';
const PRIMARY = 'Primary stroke center';
const COMPREHENSIVE = 'Comprehensive stroke center';
const NO_TRAUMA = 'Not designated';

// Roll complete profiles so the services a hospital offers make sense together.
const COMMUNITY = [
  { stroke: NO_STROKE, cardiac: NO_CATH, icu: 'No ICU', trauma: NO_TRAUMA },
  { stroke: 'Acute stroke ready', cardiac: NO_CATH, icu: 'No ICU', trauma: 'Level IV' },
  { stroke: PRIMARY, cardiac: MONITORING, icu: 'General ICU', trauma: NO_TRAUMA },
  { stroke: PRIMARY, cardiac: MONITORING, icu: 'General ICU', trauma: 'Level III' },
];
const REFERRAL = [
  { stroke: 'Acute stroke ready', cardiac: MONITORING, icu: 'General ICU', trauma: 'Level III' },
  { stroke: PRIMARY, cardiac: MONITORING, icu: 'General ICU', trauma: 'Level II' },
  { stroke: PRIMARY, cardiac: PCI, icu: 'General and cardiac ICUs', trauma: 'Level II' },
  { stroke: COMPREHENSIVE, cardiac: PCI, icu: 'Trauma, cardiac and neuro ICUs', trauma: 'Level I' },
];
const NETWORKS = {
  metro: { nearest: [1, 2, 3], major: [1, 2, 3, 3] },
  regional: { nearest: [0, 1, 2, 3], major: [0, 1, 2, 3] },
  limited: { nearest: [0, 1], major: [0, 1, 2] },
  remote: { nearest: [0, 0, 1], major: [0, 1, 2] },
};

function rollHospitals(region, seed) {
  if (!region?.hospitals) return null;
  // An independent stream keeps other case rolls stable when profiles change.
  const random = createRandom(JSON.stringify(['hospitals', region.id, seed]));
  const network = NETWORKS[region.hospital_network || 'regional'];
  const roll = (key, profiles) => {
    const pool = network[key];
    return { ...region.hospitals[key], capabilities: { ...profiles[pool[Math.floor(random() * pool.length)]] } };
  };
  return { nearest: roll('nearest', COMMUNITY), major: roll('major', REFERRAL) };
}

function describeHospital(hospital) {
  const caps = hospital.capabilities;
  const services = caps
    ? [`Stroke: ${caps.stroke}`, `Cardiac: ${caps.cardiac}`, `ICU: ${caps.icu}`, `Trauma: ${caps.trauma}`]
    : [hospital.type, 'No structured capability record'];
  return [hospital.name, ...services, hospital.eta && `Baseline ETA: ${hospital.eta}`].filter(Boolean).join(' | ');
}

module.exports = { rollHospitals, describeHospital };
