'use strict';

// ---------------------------------------------------------------------------
// In-memory run log.
//
// Every scenario that reaches a natural close (transfer of care, end scenario,
// or force-close) gets appended here. The debrief text is patched in when the
// user requests it.
//
// MAX_RUNS entries are kept (oldest evicted first). On server restart the
// store is empty — migrate to Supabase in Session 4 for persistence.
// ---------------------------------------------------------------------------

const MAX_RUNS = 500;
const runs = [];   // { session_id, ..., conversation, events, debrief? }

/**
 * Record a completed scenario.
 *
 * @param {string} sessionId
 * @param {object} seed       Full scenario seed (includes events[])
 * @param {Array}  messages   Full conversation as sent to Claude (includes [SYSTEM ROLL:] lines)
 */
function logRun(sessionId, seed, messages) {
  // Evict oldest if over cap
  if (runs.length >= MAX_RUNS) runs.shift();

  const run = {
    session_id:        sessionId,
    scenario_id:       seed.scenario_id,
    logged_at:         new Date().toISOString(),
    timestamp_start:   seed.timestamp_start,
    timestamp_end:     seed.timestamp_end || null,
    total_scene_minutes: seed.total_scene_minutes || null,

    // Scenario setup
    category:          seed.category,
    presentation:      seed.presentation,
    true_diagnosis:    seed.true_diagnosis || null,
    difficulty:        seed.difficulty,
    provider_level:    seed.provider_level,
    region:            seed.region,

    // Patient
    patient: {
      name:            seed.patient_name,
      age:             seed.patient_age,
      sex:             seed.sex,
      age_group:       seed.age_group,
      comorbidity:     seed.comorbidity_bundle || 'otherwise_healthy',
    },

    // Scenario modifiers
    trajectory:            seed.trajectory,
    decompensation_clock:  seed.decompensation_clock,
    complication_type:     seed.complication_type,
    special_flags:         seed.special_flags || null,
    crew_partner:          seed.crew_partner,
    crew_captain:          seed.crew_captain,
    time_of_day:           seed.time_of_day,
    weather:               seed.weather || null,

    // Procedure log
    events: seed.events || [],

    // Full conversation (user turns include [SYSTEM ROLL:] injections)
    conversation: messages,

    // Filled in later if the user runs debrief
    debrief: null,
  };

  runs.push(run);

  // Write a one-line summary to stdout (captured by Render / Railway logs)
  const procEvents = (seed.events || []).filter(e => e.event_type === 'procedure' && e.outcome !== 'NO_ROLL');
  console.log(JSON.stringify({
    event:          'SCENARIO_COMPLETE',
    session_id:     sessionId,
    scenario_id:    seed.scenario_id,
    category:       seed.category,
    difficulty:     seed.difficulty,
    provider_level: seed.provider_level,
    patient_age:    seed.patient_age,
    patient_sex:    seed.sex,
    total_mins:     seed.total_scene_minutes || null,
    rolls:          procEvents.length,
    complications:  procEvents.filter(e => e.outcome === 'COMPLICATION').length,
    timestamp:      run.logged_at,
  }));
}

/**
 * Patch the debrief text onto an existing run.
 */
function updateRunDebrief(sessionId, debriefText) {
  const run = runs.find(r => r.session_id === sessionId);
  if (run) {
    run.debrief = debriefText;
    console.log(JSON.stringify({
      event:      'DEBRIEF_COMPLETE',
      session_id: sessionId,
      timestamp:  new Date().toISOString(),
    }));
  }
}

/**
 * Return all runs, newest first.
 */
function getRuns() {
  return [...runs].reverse();
}

/**
 * Return a single run by session ID, or null.
 */
function getRunById(sessionId) {
  return runs.find(r => r.session_id === sessionId) || null;
}

module.exports = { logRun, updateRunDebrief, getRuns, getRunById };
