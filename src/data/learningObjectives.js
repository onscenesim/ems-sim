'use strict';

// Draft observation objectives. Clinical approval must be a reviewed source
// change with reviewer identity, date, scope and objective version. No client
// request or generated debrief can approve an objective or award points.
const OBJECTIVES = {
  baseline: { label: 'Establish and document a baseline assessment', kind: 'baseline' },
  reassessment: { label: 'Reassess after a recorded intervention', kind: 'reassessment' },
  handoff: { label: 'Communicate the assessment and care in a handoff', kind: 'handoff' },
  cardiac_observation: { label: 'Review recorded ECG assessment decisions', kind: 'procedure', procedures: ['twelve_lead', 'cardiac_monitor'] },
  breathing_support: { label: 'Review recorded breathing-support decisions', kind: 'procedure', procedures: ['oxygen', 'bvm', 'cpap', 'supraglottic_airway', 'intubation'] },
  hemorrhage: { label: 'Review recorded bleeding-control decisions when indicated', kind: 'procedure', procedures: ['tourniquet', 'bleeding_control'] },
  resuscitation: { label: 'Review recorded resuscitation decisions', kind: 'procedure', procedures: ['cpr', 'defibrillation'] },
};
for (const [id, objective] of Object.entries(OBJECTIVES)) {
  Object.assign(objective, { id, version: 1, review: { status: 'draft', reviewer: null, date: null } });
}
const CATEGORY_OBJECTIVE = { cardiac: 'cardiac_observation', respiratory: 'breathing_support', trauma: 'hemorrhage', arrest: 'resuscitation' };
function objectivesForCase(category) {
  return ['baseline', CATEGORY_OBJECTIVE[category] || 'handoff', 'reassessment'];
}
module.exports = { OBJECTIVES, objectivesForCase };
