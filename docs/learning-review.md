# Clinical review gate

All objectives in `src/data/learningObjectives.js` are draft, version 1. Every case currently receives three observation objectives; category-specific observation prompts are not required-treatment checklists. No objective contributes to a score or XP. Completion XP retains its existing meaning.

Before enabling any clinical score, a qualified clinical reviewer must review each objective against the individual cases and local provider scopes, define indication and exclusion criteria, validate timestamps and patient attribution, and review false-positive/false-negative examples. Record reviewer identity, date, objective version, approved scope/protocol reference, and signed review in source control. A model response, browser request, or test fixture is not approval. Scoring requires a separately reviewed implementation; setting a status field alone cannot activate it.

Evidence is limited to structured recorded attempts, report-mode turns, and displayed vitals. Missing evidence is not failure. Dice outcomes do not determine decision quality. Turn times are end-of-turn timestamps, not exact action onset. Reassessment evidence associates a later vitals snapshot with an earlier intervention on that patient; it does not prove that the provider recognized or acted on a change. Full transcripts should resolve ambiguity.
