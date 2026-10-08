'use strict';

// Shared by the seed and both runtime loading paths.
const DESTINATION_DIALOGUE_POLICY = 'DESTINATION DIALOGUE: The system CAD presents destination options when the patient is loaded. The partner never initiates a destination question, lists hospitals, or asks which hospital, including during a loading time-skip. If the provider raises a destination, the partner may briefly acknowledge it without asking a follow-up destination question. Destination discussion or selection alone never starts driving; await an explicit departure order.';

module.exports = { DESTINATION_DIALOGUE_POLICY };
