# Persistent external hemorrhage control

The server now owns a wound ledger in `Session.wounds`. Each wound has a stable
ID, patient ID, anatomical site, discovery flag, control state, treatment history,
current method, pressure holder and attempt count. The three new scalp, genital
gunshot and two-patient knife-fight cases have authored private profiles. Other
calls can register observed external wounds through validated `WOUND_FOUND` tags.
Hidden profiles are never returned as a player-facing wound list.

External wound discovery requires quoted evidence of both an actual external
lesion/source and active bleeding. Blood in the airway, GI bleeding and uterine
bleeding do not create compressible wound records. Airway/CPAP pressure, obstetric
maneuvers, newborn towels, routine access dressings and nonbleeding skin care are
excluded from both wound-action parsing and its interpretation fallback. Nasal
packing stays with the separate epistaxis procedure. Mixed care orders retain
their real wound attempts and anatomical targets alongside the other procedure.

An initial application, explicit retry, adjustment, method change or pressure
handoff gets an actual server roll. Anatomy sets junctional difficulty even when
the order omits the site. Continuing pressure over existing packing maintains
that application. Inspections and maintained care preserve the result without
another treatment roll. A failed securing attempt retains existing manual
pressure. A successful dressing or tourniquet can secure control; pressure and
packing need their recorded holder. Successful methods remain in the history.

An ambiguous generic command asks for a method or target. Unfamiliar descriptions
can use a constrained interpretation request that receives only discovered wound
IDs, validates exact source quotations and cannot create outcomes. Failure to
interpret asks for clarification. The confirmation panel previews the same wound
attempts, and a declined attempt cannot improve control. Negated, historical and
conditional orders are excluded. The interpreter may add a model request for
unfamiliar wording; ordinary recognized actions do not need it.

Pressure is not released merely by changing focus. One rescuer cannot treat a
different patient while maintaining the first patient's pressure without an
explicit release or handoff. A partner who actually starts driving loses their
pressure assignment once, causing an observable interruption. Routine moving,
reassessment and chat message count do not randomly undo secured control.

Wound state and events survive save/resume, cancellation uses the session draft
rollback, and the debrief receives the recorded before/after events. A bounded
narration repair rejects recognizable claims of full control for uncontrolled or
partial wounds, and uncommanded loss of recorded control. This check supplements
the model contract; it is not a general natural-language proof of every scene
sentence. Patient physiology, accumulated blood loss and shock remain narrated,
not a new quantitative hemorrhage model.

Run `node --test test/test-hemorrhage.js` for focused regression checks, or
`npm test` for the suite. Run `node test/preview-hemorrhage.js` and open
`http://127.0.0.1:3134/hemorrhage-preview` for live case checks. The separately
labeled staged checkpoint starts with successful partner-held pressure, then
exercises maintenance, assessment, transport interruption and new attempts.
