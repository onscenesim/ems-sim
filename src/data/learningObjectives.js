'use strict';

// Draft observation objectives. Clinical approval must be a reviewed source
// change with reviewer identity, date, scope and objective version. No client
// request or generated debrief can approve an objective or award points.
const OBJECTIVES = {
  initial_approach: { label: 'Review your initial approach', kind: 'initial_approach' },
  interventions: { label: 'Review your intervention decisions', kind: 'intervention' },
  handoff: { label: 'Communicate the assessment and care in a handoff', kind: 'handoff' },
  cardiac_observation: { label: 'Review recorded ECG assessment decisions', kind: 'procedure', procedures: ['twelve_lead', 'cardiac_monitor'] },
  breathing_support: { label: 'Review recorded breathing-support decisions', kind: 'procedure', procedures: ['oxygen', 'bvm', 'cpap', 'supraglottic_airway', 'intubation'] },
  hemorrhage: { label: 'Review recorded bleeding-control decisions when indicated', kind: 'procedure', procedures: ['tourniquet', 'bleeding_control'] },
  resuscitation: { label: 'Review recorded resuscitation decisions', kind: 'procedure', procedures: ['cpr', 'defibrillation'] },
};
for (const [id, objective] of Object.entries(OBJECTIVES)) {
  Object.assign(objective, { id, version: 4, review: { status: 'draft', reviewer: null, date: null } });
}
function objectivesForCase() {
  return ['initial_approach', 'interventions', 'handoff'];
}
module.exports = { OBJECTIVES, objectivesForCase };
