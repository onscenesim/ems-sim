'use strict';
const ECG = require('../../public/twelve-lead');
// Store snapshots with the turn: existing persistence, rollback and resume paths
// already serialize turns. Reading an old acquisition never regenerates it.
function acquireTwelveLeads({seed, vitals, rolls, patientId='patient_1', minute=0, turn=0, sessionId='', patientRecords=[],ink}) {
  return (rolls||[]).filter(r=>Object.hasOwn(ECG.catalog.procedureViews,r.procedure_id) && !r.no_roll).map((r,i)=> ECG.create({
    view:ECG.catalog.procedureViews[r.procedure_id],ink,seed:patientId==='patient_1'?seed:{}, vitals:vitals||{}, outcome:r.outcome,
    patientId, minute, patient:patientRecords.find(p=>p.id===patientId)||{}, id:`${sessionId}:${turn}:${i}:${patientId}`,
  }));
}
const isECGProcedure=id=>Object.hasOwn(ECG.catalog.procedureViews,id);
module.exports = {acquireTwelveLeads,isECGProcedure};

// Bridge omitted model metadata only from current affirmative observations.
// Do not turn historical/differential mentions into an electrical finding.
function applyEctopy(vitals, previous, narration='', seed={}) {
  if(!vitals?.Rhythm)return vitals;
  const value=v=>v&&typeof v==='object'?v.value:v;
  let mode=ECG.ectopyFromText(vitals.Ectopy)??ECG.ectopyFromText(vitals.Rhythm);
  if(mode==null) {
    for(const sentence of narration.replace(/\[[^\]]*\]/g,'').split(/[.!?\n]+/)) {
      if(/\b(?:history|previously|earlier|risk|watch|monitor for|if|may|might|could|denies|reports|says|other patient|patient_[2-9])\b/i.test(sentence))continue;
      if(!/\b(?:monitor|strip|rhythm|tracing|ectopy|pvcs?|bigeminy|trigeminy)\b/i.test(sentence))continue;
      const observed=ECG.ectopyFromText(sentence);
      if(observed!=null)mode=observed;
    }
  }
  // Retain an established modifier on partial updates of the same rhythm;
  // Ectopy=none explicitly clears it. Seed defaults apply only on first monitor.
  if(mode==null&&ECG.normalizeRhythm(value(vitals.Rhythm))===ECG.normalizeRhythm(value(previous?.Rhythm)))mode=previous?.Ectopy;
  if(mode==null&&!previous?.Rhythm)mode=seed.ecg_ectopy;
  return {...vitals,Ectopy:ECG.resolveEctopy(mode,value(vitals.Rhythm))};
}
module.exports.applyEctopy=applyEctopy;

/** Keep ECG interpretation on paper even if model prose ignores the prompt.
 * Preserve clinical observations and procedural acknowledgments/refusals. Never
 * run on debriefs, where explaining the tracing is part of the learning review.
 */
function stripTwelveLeadNarration(reply, acquired=false) {
  const ecgContext=/\b(?:12[ -]?lead|twelve[ -]?lead|ecg|ekg|tracing|printout|v[1-6]r|v[789]|posterior leads?|right[ -]sided leads?)\b/i;
  const finding=/\b(?:st[ -]?(?:segment|elevat\w*|depress\w*|changes?)|t[ -]?waves?|q[ -]?waves?|qrs|qtc?|pr interval|reciprocal|dagger|(?:st[ -]?)?elevat\w*|(?:st[ -]?)?depress\w*|wide[ -]complex|narrow[ -]complex|j[ -]?waves?|osborn|coved|biphasic|stemi|nstemi|infarct\w*|ischemi\w*|ischaemi\w*|brugada|wellens|de winter|aslanger|lvh|lbbb|bundle.branch|sinus rhythm|paced rhythm|atrial fibrillation|ventricular tachycardia|sokolow|normal (?:ecg|ekg)|nonspecific|non-specific)\b/i;
  const explanation=/\b(?:shows?|demonstrates?|reveals?|reads?|indicates?|suggests?|consistent with|interprets?|interpretation|looks? normal|looks? abnormal|unremarkable|normal|abnormal)\b/i;
  const acknowledgment=/\b(?:acquir\w*|obtain\w*|fil(?:e|ed|ing)|print(?:ed|ing)?|connect\w*|plac\w*|attach\w*|perform\w*|complet\w*|defer\w*|declin\w*|refus\w*|ready|available|not indicated)\b/i;
  const result=String(reply||'').split('\n').map(paragraph=>{
    const context=acquired||ecgContext.test(paragraph);
    return paragraph.split(/(?<=[.!?])\s+/).filter(sentence=> {
      // Keep history obtained from the patient, even on the acquisition turn.
      if(!ecgContext.test(sentence)&&/\b(?:patient|family|wife|husband)\b.*\b(?:states|says|reports)\b|\bhistory of\b/i.test(sentence))return true;
      return !(context&&(finding.test(sentence)||(ecgContext.test(sentence)&&(explanation.test(sentence)||!acknowledgment.test(sentence)))));
    }).join(' ');
  }).filter(line=>line.trim()).join('\n').trim();
  return result || (acquired?'12-lead printout filed in More Vitals.':'');
}
module.exports.stripTwelveLeadNarration=stripTwelveLeadNarration;
