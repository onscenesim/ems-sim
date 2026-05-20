'use strict';

const CALLER_BEHAVIORS = [
  { text: "panicked spouse, screaming, dropping the phone, poor historian", requires: null },
  { text: "calm and precise — gives name, address, and chief complaint without prompting", requires: null },
  { text: "aggressive and uncooperative, blocking access, demanding answers", requires: null },
  { text: "non-English speaking, no interpreter available, communication through gestures only", requires: null },
  { text: "child caller — parent or guardian incapacitated, unclear age of caller", requires: "only when patient is not pediatric" },
  { text: "third party caller — drove past the scene, not present on arrival", requires: null },
  { text: "silent open line — heavy breathing audible, no verbal response", requires: null },
  { text: "intoxicated caller, slurred speech, inconsistent history, belligerent", requires: null },
  { text: "elderly caller, hard of hearing, repeatedly losing track of conversation", requires: null },
  { text: "caller has hung up — no further contact, information limited to initial dispatch", requires: null },
  { text: "neighbor who called — does not know patient, providing secondhand information", requires: null },
  { text: "bystander performing CPR, phone on speaker, unable to give history", requires: "only on cardiac arrest calls" },
  { text: "coworker caller — witnessed collapse, panicked, no medical history available", requires: null },
  { text: "caller is the patient — self-called, lucid but deteriorating", requires: "only when patient status is normal, not DOA" },
  { text: "caller is the patient — self-called, confused, unable to give full address", requires: "only when patient status is normal, not DOA" },
  { text: "family member, calm but withholding information — story does not add up", requires: null },
  { text: "family member insisting patient is fine, resisting EMS response", requires: null },
  { text: "caregiver caller — knows patient well, excellent historian, detailed medical history", requires: null },
  { text: "healthcare worker on scene — nurse or EMT giving clinical handoff over phone", requires: null },
  { text: "hysterical teenager, caller is a minor witness, unreliable and emotional", requires: null },
  { text: "multiple callers from same scene — conflicting information received by dispatch", requires: null },
  { text: "interpreter on the line — significant delay between questions and answers", requires: null }
];

const WEATHER = [
  { text: "extreme cold — patient and crew risk, hypothermia factor on any outdoor scene", requires: "not in southern US or tropical regions" },
  { text: "ice and snow — extended extrication likely, helicopter unavailable", requires: "not in southern US, tropical, or desert southwest" },
  { text: "extreme heat — patient and crew risk, heat as complicating factor", requires: "not in northern Canada or pacific northwest" },
  { text: "heavy rain — limited visibility, helicopter unavailable", requires: "not in desert southwest or arctic" },
  { text: "high winds — helicopter unavailable", requires: null },
  { text: "fog — delayed response, helicopter unavailable", requires: "not in desert southwest" },
  { text: "wildfire smoke — air quality critical, respiratory risk for patient and crew", requires: "not in eastern US or tropical regions" },
  { text: "flooding — road access compromised, water rescue possible", requires: "not in desert southwest or arctic" },
  { text: "tornado warning active — shelter in place considerations", requires: "not in pacific coast or arctic" },
  { text: "blizzard conditions — extended response time, crew exposure risk", requires: "not in southern US or tropical regions" },
  { text: "humid heat — heat index significantly above air temperature", requires: "not in arctic, northern Canada, or pacific northwest" },
  { text: "black ice — invisible road hazard, extended response time", requires: "not in southern US or tropical regions" },
  { text: "dust storm — near zero visibility", requires: "not in eastern US, pacific northwest, or arctic" }
];

const TIME_OF_DAY = [
  { text: "0000 — midnight, reduced visibility, minimal civilian help available", requires: null },
  { text: "0100 — dead of night, minimal traffic, reduced staffing", requires: null },
  { text: "0200 — lowest alertness window, crew fatigue factor", requires: null },
  { text: "0300 — middle of night shift, hospital skeleton crew", requires: null },
  { text: "0400 — pre-dawn, poor visibility, quiet streets", requires: null },
  { text: "0500 — early morning, shift change approaching", requires: null },
  { text: "0600 — shift change, handoff fatigue, incoming crew unfamiliar with area", requires: null },
  { text: "0700 — morning rush beginning, traffic moderate", requires: null },
  { text: "0800 — full morning rush, delayed response possible", requires: null },
  { text: "0900 — mid-morning, full staffing, good visibility", requires: null },
  { text: "1000 — mid-morning, routine activity", requires: null },
  { text: "1100 — late morning, high bystander presence", requires: null },
  { text: "1200 — midday, maximum traffic, lunch hour", requires: null },
  { text: "1300 — early afternoon, hot if summer", requires: null },
  { text: "1400 — mid-afternoon, heat peak if applicable", requires: null },
  { text: "1500 — school dismissal, heavy pedestrian and vehicle traffic", requires: null },
  { text: "1600 — afternoon rush beginning", requires: null },
  { text: "1700 — peak rush hour, significant response delay possible", requires: null },
  { text: "1800 — evening rush tapering, shift change approaching", requires: null },
  { text: "1900 — early evening, bars and restaurants filling", requires: null },
  { text: "2000 — evening, reduced staffing in some systems", requires: null },
  { text: "2100 — night beginning, alcohol and recreational drug factor increasing", requires: null },
  { text: "2200 — late evening, bar crowd active", requires: null },
  { text: "2300 — late night, intoxicated bystanders likely", requires: null }
];

const SPECIAL_CIRCUMSTANCES = [
  { text: "patient has a DNR — family is contesting it aggressively", requires: "only on DOA or cardiac arrest calls" },
  { text: "patient has a DNR — staff at care facility are unaware or ignoring it", requires: "only on DOA or cardiac arrest calls" },
  { text: "patient refuses transport — decision-making capacity is questionable", requires: null },
  { text: "patient is a healthcare worker who is self-treating and resisting EMS assessment", requires: null },
  { text: "family member is also a medic or nurse and is actively interfering with care", requires: null },
  { text: "law enforcement on scene with a conflicting account of events", requires: null },
  { text: "media present or arriving — cameras rolling before care is complete", requires: null },
  { text: "language barrier — no interpreter available, communication by gesture only", requires: null },
  { text: "patient is a minor or non-independent adult with no guardian present", requires: "only when age group is pediatric or young adult" },
  { text: "suspected abuse — mandatory reporting situation, perpetrator may be on scene", requires: null },
  { text: "patient is a known frequent flyer with a complex and disputed history", requires: null },
  { text: "bystander performing CPR incorrectly — must be corrected without stopping resuscitation", requires: "only on cardiac arrest calls" },
  { text: "scene is a potential crime scene — law enforcement has not yet arrived", requires: null },
  { text: "patient has a pet they are more worried about than their own condition", requires: "only when patient status is normal, not arrest or DOA" },
  { text: "patient regains pulse spontaneously during packaging — now requires full reassessment", requires: "only on cardiac arrest calls with rapidly deteriorating trajectory" },
  { text: "bystander administered naloxone before EMS arrival — unknown dose and timing", requires: "only on opioid overdose calls" },
  { text: "patient is a prisoner — corrections officer present and interfering with access", requires: null },
  { text: "patient is unaccompanied and unable to communicate — identity unknown", requires: null },
  { text: "scene has a large crowd of distressed bystanders blocking access", requires: null },
  { text: "responding to a location with a known history of violence toward EMS", requires: null },
  { text: "off-duty police officer on scene attempting to manage the patient before EMS", requires: null },
  { text: "patient's own physician is present on scene and giving contradictory orders", requires: null },
  { text: "caller reported one patient — there are actually two or more patients on arrival", requires: null },
  { text: "elevator or stairwell access only — significant delay in reaching the patient", requires: null },
  { text: "patient if responsive is refusing to let you contact family or next of kin", requires: null }
];

module.exports = { CALLER_BEHAVIORS, WEATHER, TIME_OF_DAY, SPECIAL_CIRCUMSTANCES };
