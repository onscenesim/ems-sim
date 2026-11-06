'use strict';

// Shared by the seed and both runtime loading paths.
const DESTINATION_DIALOGUE_POLICY = 'DESTINATION DIALOGUE: The system CAD presents destination options when the patient is loaded. The partner never initiates a destination question, lists hospitals, or asks which hospital, including during a loading time-skip. If the provider raises a destination, the partner may briefly acknowledge it without asking a follow-up destination question. Destination discussion or selection alone never starts driving; await an explicit departure order.';

const BACKUP_TRANSPORT_POLICY = 'BACKUP TRANSPORT: Once the named captain has arrived as backup, they accompany the patient by default, help load, and ride in the back to assist the provider during transport (captain=in_back). No separate invitation or repeated ride-along order is needed. Personality, rank, or reluctance never causes them to refuse transport, stay behind, follow in another vehicle, or disappear. Only an explicit provider instruction to release backup or assign them elsewhere changes this plan. The captain never drives. Backup that has not arrived cannot join transport.';

function captainPresent(seed, backup, crew) {
  if (!seed.crew_captain || ['cancelled', 'unavailable'].includes(backup?.status)
      || ['incapacitated', 'unavailable'].includes(crew?.captain)) return false;
  return backup?.status === 'on_scene'
    || ['on_scene', 'in_back'].includes(crew?.captain)
    || (!backup && seed.backup_present_on_arrival === true);
}

module.exports = { DESTINATION_DIALOGUE_POLICY, BACKUP_TRANSPORT_POLICY, captainPresent };
