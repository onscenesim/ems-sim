# Learning review

The automatic Objectives view was removed in version 5. It produced generic questions and practice tasks from procedure names, dice outcomes, and adjacent vital snapshots. Those inputs cannot reliably identify the important decision in a call or establish that a problem remained unresolved. The case-specific debrief remains the place for clinical interpretation and actionable takeaways.

The Learning Review contains Debrief, Timeline, and Vitals tabs. The Debrief tab shows the full case-specific clinical debrief. Patient outcome remains separate from the Learning Review. The timeline records player actions, scene responses, procedure attempts and results, and report turns. The vitals table shows only observations logged on each turn. A missing value stays missing; it is not carried forward. Procedure outcomes are simulation results, not decision quality. Turn times mark the end of a turn, not the precise start of a procedure. The review assigns no score or XP.

Both the current-call transcript export and saved-call download include the complete Learning Review as plain text: full debrief, timeline (including procedure results and scene responses), and the vitals table. The patient outcome appears as a separate export section. The same review formatter serves both paths.

Saved reviews from earlier versions are rebuilt from their recorded turns on read. Legacy `learning_objectives` fields in old saved seeds are ignored. No clinical approval or hidden case data is used to construct new prompts.
