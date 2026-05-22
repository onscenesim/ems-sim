'use strict';

/**
 * Append an event to the scenario's event log.
 *
 * @param {object} seed       The active scenario seed object (mutated in place)
 * @param {object} event      { event_type, procedure_id?, dice_roll?, dc_value?, outcome?, detail? }
 * @param {number} sceneMin   Current scene clock in minutes
 */
function logEvent(seed, event, sceneMin) {
  const entry = {
    scene_minute: sceneMin,
    real_timestamp: new Date().toISOString(),
    event_type: event.event_type,
    procedure_id: event.procedure_id || null,
    patient: event.patient || 'primary',
    dice_roll: event.dice_roll ?? null,
    dc_value: event.dc_value ?? null,
    outcome: event.outcome || null,
    detail: event.detail || null,
  };
  seed.events.push(entry);
  return entry;
}

/**
 * Close a scenario (set end time and total scene minutes).
 */
function closeScenario(seed, sceneMin) {
  seed.timestamp_end = new Date().toISOString();
  seed.total_scene_minutes = sceneMin;
  return seed;
}

/**
 * Serialize the scenario log to a plain object suitable for storage or API calls.
 */
function serializeSeed(seed) {
  return { ...seed };
}

module.exports = { logEvent, closeScenario, serializeSeed };
