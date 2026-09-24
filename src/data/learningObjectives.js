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
const REFLECTION = {
  initial_approach: {
    focus: 'Start with your first recorded decision for each patient, whether or not vitals had appeared yet.',
    questions: ['What information was available when you chose this approach?', 'What did you still need to learn before committing to treatment?'],
    practice: 'On your next attempt, make the reasoning behind your opening approach explicit.',
  },
  interventions: {
    focus: 'Review the treatments and procedures you chose. Automatically updated vitals are context, not evidence of a player-led reassessment.',
    questions: ['Which patient findings supported each intervention?', 'How did the simulation response affect your next decision?'],
    practice: 'On your next attempt, connect each intervention to the finding or concern it addresses.',
  },
  handoff: {
    focus: 'Review what you communicated and what the receiving team could infer from it.',
    questions: ['Did your report distinguish findings, actions, and response?', 'Which unresolved concerns needed to travel with the patient?'],
    practice: 'Try a concise handoff that includes the patient’s course and remaining uncertainty.',
  },
  cardiac_observation: {
    focus: 'Connect each recorded ECG assessment to the information available at that moment.',
    questions: ['What question were you trying to answer with this assessment?', 'How did the findings affect your next decision?'],
    practice: 'State what you learned from the assessment and how it changes your plan.',
  },
  breathing_support: {
    focus: 'Review the reasoning behind your recorded breathing-support attempts.',
    questions: ['Which observed findings led to your choice?', 'What did you use to reassess the patient’s response?'],
    practice: 'Link your choice and subsequent reassessment to the findings available to you.',
  },
  hemorrhage: {
    focus: 'Review the findings that led to a bleeding-control attempt, when applicable.',
    questions: ['What visible evidence made bleeding control relevant here?', 'What did the later observations tell you about the patient’s course?'],
    practice: 'Explain whether this objective applies to the case, then identify the evidence for your decision.',
  },
  resuscitation: {
    focus: 'Review your decision sequence separately from the simulated procedure outcomes.',
    questions: ['What information guided each action in the sequence?', 'Where did reassessment change what you did next?'],
    practice: 'Identify one decision point to revisit and the information you would use there.',
  },
};
for (const [id, objective] of Object.entries(OBJECTIVES)) {
  Object.assign(objective, { id, reflection: REFLECTION[id], version: 3, review: { status: 'draft', reviewer: null, date: null } });
}
function objectivesForCase() {
  return ['initial_approach', 'interventions', 'handoff'];
}
module.exports = { OBJECTIVES, objectivesForCase };
