'use strict';

const { CREW } = require('../data/crew');
const { captainPresent } = require('./prompts/transport');
const { logEvent } = require('./logger');

const CATASTROPHE_RATES = Object.freeze({ EASY: 0, NORMAL: 0, HARD: 0.01, BLACK_CLOUD: 0.10 });
const CATASTROPHES = Object.freeze([
  { id: 'ambulance_wont_start', title: 'Ambulance will not start', stage: 'depart', recovery: 'replacement_transport',
    consequence: 'The engine will not start. Repeated ignition, jump starts and troubleshooting cannot restore this ambulance during the call. Request another transport unit; continue patient care.' },
  { id: 'cot_wont_load', title: 'Cot cannot load', stage: 'load', recovery: 'replacement_transport',
    consequence: 'The cot/loading mechanism is irreparably jammed. It will not go into this ambulance no matter how often it is retried. Do not grant a successful packaging roll a mechanical repair. Arrange a compatible replacement cot and transport unit; never transport an unsecured patient.' },
  { id: 'patient_dropped', title: 'Patient dropped during movement', stage: 'load', recovery: 'safe_reload',
    consequence: 'During the ordered move the patient falls from the cot to the ground. Stop movement, describe the fall and observable injury, and allow reassessment and safe repackaging. This is a separate unavoidable incident, not proof of an unsuccessful procedure or provider negligence. Do not automatically kill the patient or silently reload them.' },
  { id: 'road_blocked', title: 'Transport trapped indefinitely', stage: 'transport', recovery: 'alternate_transport',
    consequence: 'The ambulance is trapped by a completely blocked road with no easy escape. In storm/flood weather use an impassable flooded road; otherwise use a giant pileup boxing in the ambulance. No predictable clearance ETA. Waiting or a routine time-skip cannot clear it; an actually arranged alternative transport/extrication plan is needed. Do not invent a convenient side street or drive through floodwater.' },
  { id: 'er_overcrowding', title: 'ER has no bed', stage: 'arrival',
    consequence: 'The receiving ER gave NO warning, including during a call-ahead report. Only on actual arrival does staff reveal that there is no bed, space or receiving team available. The ambulance crew retains responsibility and must continue care for approximately 40 minutes awaiting a bed, regardless of how critical the patient is. No instant resuscitation-bay exception, automatic handoff, or acuity-based shortcut. Existing care continues; deterioration is possible, but delay alone does not prove provider error.' },
  { id: 'ambulance_crash_no_injuries', title: 'Ambulance crash — no injuries', stage: 'transport', recovery: 'replacement_transport',
    consequence: 'The ambulance is involved in a collision and cannot continue. Nobody is injured: neither the original patient, crew, nor others sustain crash injuries. Stop, secure the scene and arrange replacement transport. Do not add a second catastrophe or blame unrecorded driving decisions.' },
  { id: 'ambulance_crash_severe_injuries', title: 'Ambulance crash — others severely injured', stage: 'transport', recovery: 'replacement_transport',
    consequence: 'The ambulance is involved in a collision and cannot continue. Other road users are severely injured, creating additional patients while the original patient still needs care. Describe observable injuries, request resources and permit triage; use separate patient IDs and never overwrite the original patient’s vitals. Do not assume the provider caused the crash.' },
  { id: 'crew_medical_event', title: 'Crew member incapacitated', stage: 'crew', recovery: 'replacement_crew',
    consequence: 'The selected crew member suffers their seeded medical event and is out of commission for the REST OF THE CALL, even if treatment improves symptoms. They cannot drive, assist, coach or resume duties. They become a separate patient with their own patient ID and findings; never put their findings in the original patient’s vitals. Request replacement personnel and care for both patients within available resources.' },
  { id: 'backup_crash', title: 'Backup crashes on arrival', stage: 'backup', recovery: 'replacement_backup',
    consequence: 'The responding captain crashes the backup vehicle on final approach to the scene. The vehicle and captain are unavailable for this call; do not mark them on scene or let them assist or drive. Narrate the crash at arrival, not at dispatch. Request a different resource; do not automatically add severe injuries.' },
]);

function crewMedicalProfile(seed, role) {
  const member = seed['custom_' + role] || CREW.find(c => c.name === seed['crew_' + role]);
  if (member?.medical_predisposition) return { name: member.name, condition: member.medical_predisposition };
  // A custom character keeps the same predisposition across runs, without
  // interpreting age, race or competence as a diagnosis.
  const name = seed['crew_' + role] || role;
  const conditions = ['acute_stroke', 'pulmonary_embolism', 'seizure', 'carotid_dissection', 'panic_attack'];
  const hash = [...name].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
  return { name, condition: conditions[hash % conditions.length] };
}

function rollCatastrophe(seed, random) {
  if (!CATASTROPHE_RATES[seed.difficulty] || seed.complication_type === 'none') return;
  // Fixed-truth scenes retain their clinical and scene contracts.
  if (seed.scene_challenge || seed.chemical_exposure || seed.frequent_caller?.variant === 'stable') return;
  if (random() >= CATASTROPHE_RATES[seed.difficulty]) return;
  const event = CATASTROPHES[Math.floor(random() * CATASTROPHES.length)];
  seed.complication_type = 'catastrophic';
  seed.catastrophe = { id: event.id, ...(event.id === 'crew_medical_event' ? { role: random() < 0.75 ? 'partner' : 'captain' } : {}) };
}

const ROUTINE_DIVERSION_CONTRACT = 'ROUTINE ER DIVERSION — PRIVATE: The initially selected ER is on divert. Reveal it only during an actual call-ahead report to that hospital, or at physical arrival if no report was called. Destination selection and generic radio traffic do not disclose it. Keep the patient in crew care until an alternate receiving destination is arranged. This is a standard complication, not a 40-minute bed hold. Await SYSTEM INCIDENT ACTIVE.';

function complicationContract(seed) {
  const event = CATASTROPHES.find(c => c.id === seed.catastrophe?.id);
  if (seed.complication_type === 'catastrophic' && event) return [
    'CATASTROPHIC COMPLICATION — PRIVATE, SERVER-STAGED:',
    `${event.title}: ${event.consequence}`,
    'Exactly this one catastrophe replaces the usual complication(s). Do not invent any other catastrophe from equipment failure, a natural 1, dramatic license or difficulty alone. Wait for SYSTEM INCIDENT ACTIVE before revealing or triggering it. If its relevant stage never occurs, it never fires. Do not reveal it in dispatch.',
    event.id === 'crew_medical_event' ? `Selected role: ${seed.catastrophe.role}. Private predisposition: ${JSON.stringify(crewMedicalProfile(seed, seed.catastrophe.role))}. Reveal symptoms first, not an automatic diagnosis. A panic attack does not imply a PE or dissection; portray only the seeded condition.` : '',
  ].filter(Boolean).join('\n');
  if (seed.complication_type === 'er_divert') return ROUTINE_DIVERSION_CONTRACT;
  if (seed.routine_er_divert) return ROUTINE_DIVERSION_CONTRACT + '\nCATASTROPHE LIMIT: No catastrophic incident is seeded.';
  return 'CATASTROPHE LIMIT: No catastrophic incident is seeded. Ordinary complications and procedure rolls cannot invent an ambulance that permanently will not start, an irreparably jammed cot, a patient drop, an indefinite road blockade, a crash, crew incapacitation, or a 40-minute ER bed hold.';
}

const DEPART_RE = /\b(?:depart|drive|transport|head|go|leave|take (?:him|her|them|the patient))\b.{0,65}\b(?:hospital|er|ed|trauma|facility)\b|\b(?:load and go|scoop and (?:run|go))\b/i;
const RECOVERY_TAG = /\s*\[INCIDENT_RECOVERY:\s*(\w+)\s*\]\s*/gi;

function bedHoldAdvance(userText, skipMode) {
  if (skipMode) return 5;
  const wait = /\b(?:wait|continue|monitor|care)\b.*?\b(\d+)\s*(?:minutes?|min)\b/i.exec(userText);
  return wait ? Math.max(1, Math.min(40, Number(wait[1]))) : 2;
}

function prepareIncident(session, userText, reportMode, skipMode, wantsLoad) {
  const event = session.seed.complication_type === 'catastrophic'
    ? CATASTROPHES.find(c => c.id === session.seed.catastrophe?.id)
    : (session.seed.complication_type === 'er_divert' || session.seed.routine_er_divert)
      ? { id: 'er_divert', stage: 'diversion', recovery: 'alternate_destination', title: 'ER diversion', consequence: complicationContract(session.seed) } : null;
  if (!event) return { skipMode, note: '' };
  let state = session.incident;
  const wasActive = !!state;
  const advanceLimit = bedHoldAdvance(userText, skipMode);
  const arrival = ['to_hospital', 'to_arrival'].includes(skipMode)
    || (session.moving && session.departSceneMinute !== null && session.sceneMinute >= session.departSceneMinute + session._transportEtaEstimate())
    || (session.moving && /\b(?:arriv\w*|reach\w*|pull\w* into)\b.{0,45}\b(?:hospital|er|ed|bay)\b/i.test(userText));
  const departure = !reportMode && (DEPART_RE.test(userText) || ['to_hospital', 'to_arrival'].includes(skipMode));
  const backupDue = session.backupStatus?.status === 'en_route'
    && session.backupArrivalMinute !== null && session.sceneMinute >= session.backupArrivalMinute;
  const captainHere = captainPresent(session.seed, session.backupStatus, session.crewStatus);
  const eligible = !session.arrivedAtHospital && (
    (event.stage === 'load' && !reportMode && (wantsLoad || !!skipMode || departure) && !session.hasLoaded)
    || (event.stage === 'depart' && departure)
    || (event.stage === 'transport' && !reportMode && (session.moving || departure))
    || (event.stage === 'arrival' && arrival)
    || (event.stage === 'diversion' && ((reportMode && (session.moving || session.hasLoaded) && !/medical control|backup|dispatch/i.test(userText)) || arrival))
    || (event.stage === 'crew' && !reportMode && session.turns.length > 0 && session.sceneMinute >= 2
      && (session.seed.catastrophe.role === 'partner' || captainHere || backupDue))
    || (event.stage === 'backup' && (backupDue || (session.seed.backup_present_on_arrival && session.turns.length > 0)))
  );
  if (!state && eligible) {
    state = session.incident = { id: event.id, startedMinute: session.sceneMinute, resolved: false };
    if (event.id === 'er_overcrowding') {
      // The journey happens before the bed hold starts; never consume travel
      // time as part of the forty minutes spent waiting at the hospital.
      const elapsed = session.departSceneMinute === null ? 0 : Math.max(0, session.sceneMinute - session.departSceneMinute);
      state.startedMinute += Math.max(0, session._transportEtaEstimate() - elapsed);
      state.bedAvailableMinute = state.startedMinute + 40;
    }
    if (event.id === 'er_divert') {
      const hospitals = session.seed.hospitals;
      const majorName = hospitals?.major?.name;
      state.divertedDest = session.transportDest || (/\bmajor|trauma center\b/i.test(userText) || (majorName && userText.includes(majorName)) ? 'major' : 'nearest');
    }
    logEvent(session.seed, { event_type: 'complication', detail: `${event.id} triggered` }, session.sceneMinute);
  }
  if (!state) return { skipMode, note: '' };
  if (state.bedAvailableMinute && session.sceneMinute >= state.bedAvailableMinute) state.resolved = true;
  const blocked = !state.resolved;
  let note = `[SYSTEM INCIDENT ${blocked ? 'ACTIVE' : 'AFTERMATH'}: ${event.id}. This server incident takes precedence over generic loading, transport, backup, crew and skip directives. ${event.consequence}`;
  if (event.id === 'crew_medical_event') note += ` Incapacitated role=${session.seed.catastrophe.role}; ${JSON.stringify(crewMedicalProfile(session.seed, session.seed.catastrophe.role))}. This person remains incapacitated even after replacement help arrives.`;
  if (event.id === 'er_divert') note += ` Diverted destination=${state.divertedDest}. A different destination must be explicitly ordered and accepted before normal transport resumes.`;
  if (blocked) {
    note += ' Do NOT complete transport or handoff. Interrupt time-skips at the incident. Keep care with the crew; never narrate the problem fixed merely because the provider retries or waits.';
    if (event.id === 'er_overcrowding') note += ` Hospital bed hold: arrival at T+${state.startedMinute}; a bed is unavailable until T+${state.bedAvailableMinute} minutes. ${wasActive ? 'Advance this turn by its realistic duration, at most ' + bedHoldAdvance(userText, skipMode) + ' minutes of continued existing care. An explicitly requested monitoring interval continues existing care throughout; invent no new treatment.' : 'This turn ends at physical arrival, when the wait begins; advance TIME only to that arrival time.'} Do not emit a recovery tag before that deadline.`;
    else note += ` Only after an actually completed, provider-directed response emit [INCIDENT_RECOVERY: ${event.recovery}]. ${event.recovery === 'replacement_transport' ? 'This means another compatible ambulance has actually arrived and the patient is safely secured in it, not merely requested or en route.' : event.recovery === 'replacement_crew' ? 'A replacement crew member has actually arrived; the original member remains a patient.' : event.recovery === 'replacement_backup' ? 'A different backup crew has actually arrived; the original captain stays unavailable.' : event.recovery === 'safe_reload' ? 'The patient has actually been reassessed and safely repackaged after the fall.' : 'The alternate plan has actually been arranged and is usable.'} No recovery on the trigger turn.`;
    skipMode = null;
    session.moving = false;
    session.arrivedAtHospital = false;
  }
  if (state.resolved) note += ' Recovery is already established. Do not retrigger this incident; normal care and transport with the replacement resources may continue. Original unavailable or incapacitated crew never resume duties.';
  note += ']';
  return { skipMode, note, event, wasActive, blocked, advanceLimit };
}

function reconcileIncident(session, rawReply, context, transportDest, userText, timeMinutes) {
  const tags = [...rawReply.matchAll(RECOVERY_TAG)].map(m => m[1]);
  const state = session.incident;
  const event = context.event;
  if (state && event && !state.resolved && context.wasActive) {
    if (state.bedAvailableMinute) {
      // A model cannot grant itself forty minutes in a one-minute care turn.
      const limit = session.sceneMinute + context.advanceLimit;
      if (Math.min(timeMinutes ?? session.sceneMinute, limit) >= state.bedAvailableMinute) state.resolved = true;
    } else if (tags.includes(event.recovery)) {
      const providerResponse = /\b(?:request|call|arrange|send|wait|transfer|reassess|repackage|reload|reroute|redirect|divert|depart|transport|drive|go|head|continue)\b/i.test(userText);
      if (providerResponse && (event.id !== 'er_divert' || (transportDest && transportDest !== state.divertedDest))) {
        state.resolved = true;
        logEvent(session.seed, { event_type: 'complication', detail: `${state.id}: ${event.recovery} completed` }, session.sceneMinute);
      }
    }
  }
  return rawReply.replace(RECOVERY_TAG, ' ');
}

function enforceIncidentState(session) {
  const state = session.incident;
  if (!state) return;
  if (!state.resolved) {
    session.moving = false;
    session.arrivedAtHospital = false;
    if (['cot_wont_load', 'patient_dropped'].includes(state.id)) session.hasLoaded = false;
  }
  session.crewStatus = { partner: 'on_scene', captain: 'not_on_scene', ...session.crewStatus };
  if (!state.resolved && session.crewStatus.partner === 'driving') session.crewStatus.partner = 'on_scene';
  if (state.id === 'crew_medical_event') {
    session.crewStatus[session.seed.catastrophe.role] = 'incapacitated';
    if (session.seed.catastrophe.role === 'partner') session.crewStatus.driver = state.resolved ? 'anonymous' : null;
  }
  if (state.id === 'backup_crash') {
    session.crewStatus.captain = 'unavailable';
    session.backupStatus = { status: state.resolved ? 'on_scene' : 'unavailable', eta: null };
    session.backupArrivalMinute = null;
  }
  if (state.bedAvailableMinute) {
    session.hasLoaded = true;
    session.moving = false;
    session.arrivedAtHospital = state.resolved;
  }
}

module.exports = { CATASTROPHE_RATES, CATASTROPHES, crewMedicalProfile, rollCatastrophe, complicationContract,
  prepareIncident, reconcileIncident, enforceIncidentState };
