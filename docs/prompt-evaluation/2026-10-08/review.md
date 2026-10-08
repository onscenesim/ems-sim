# Prompt functionality review — October 8, 2026

The revised prompts work for the intended crew behavior, response footer, ordinary loading/departure sequence, pediatric dose handling, and patient-specific measurements in the tested sequences. The separate debrief tests also behaved as intended. The system does **not** earn a clean functionality pass: live integration testing exposed equipment, destination, timing, and text-filter failures that the individual prompt checks did not catch.

No observed functional failure has been established as caused by this prompt revision. The most serious equipment failure reproduced with the preserved original gameplay prompt; several other failures trace to unchanged engine code. Two new prompt-hygiene concerns remain: increased length, and gameplay-specific imperatives included in the debrief through a shared policy string.

## What ran

- `npm test`: 221 Node tests passed, plus the existing roller/randomness scripts. No failures, cancellations, or skips.
- 24 live gameplay turns through real `Session.send`: 23 using the current gameplay prompt and one using both the original assembled gameplay prompt and original API wrapper as a comparison.
- Three separately generated debriefs using the current debrief prompt and input assembler. The first evidence debrief request timed out at the normal 90-second deadline; its retry succeeded. Other debrief requests succeeded on their first attempts.
- Side preview: inspected gameplay responses, engine state, and the production learning-review UI. Preview stays available at `http://127.0.0.1:3120/`.
- Synthetic patient fixtures and temporary storage. Production prompt/source hashes matched the initial evaluation snapshot afterward. All 26 files in the original prompt backup still matched their manifest hashes.

The evaluation runner and result artifacts were added; production prompts and engine behavior were not changed during this test.

## Gameplay results

| Behavior | Result |
| --- | --- |
| Proactive Okafor on HARD | Placed routine monitoring; did not perform unrolled oxygen or IV care. |
| Forced IV failure | Failed once; no functioning access or silent successful retry. |
| Recognized IV retry | `start an IV` produced the injected SUCCESS and a patent ledger entry. |
| Canonical response footer | Present in the correct order on all 24 live gameplay responses, including the original-prompt comparison. No repair request was needed. |
| Private key/dice secrecy and provider speech | No private fixture marker, dice result, fabricated SYSTEM ROLL, or provider dialogue line appeared in the visible replies. |
| Ordinary load and loading skip | Loaded without beginning driving or asking an unsolicited destination question. |
| Hospital report before departure | Stayed parked; report text did not execute procedures. |
| Explicit departure | Began driving with the actual partner driving; no unarrived captain appeared in the unit. |
| Arrival | Awaited handoff, but the engine incorrectly changed the stored destination. |
| BLS measurements | Manual pulse/BP and standalone pulse ox worked; current prompt omitted ECG rhythm and capnography fields. An explicit unavailable 12-lead request still bypassed the equipment restriction. |
| Pediatric arrest | Honored the explicitly ordered 100 mg dose in the 20 kg fixture rather than substituting an adult dose. This checks instruction adherence, not independent clinical protocol validation. |
| Failed moving CPR | Honored the injected failure and gave one pull-over offer; did not pull over without an order. Base DC 17 became DC 19 under HARD, correctly. |
| Mother/newborn focus | Equipment/readings did not transfer to the newborn. Returning to the mother preserved her original BP measurement time. |

## Gameplay failures and next actions

### 1. Unavailable BLS ECG acquisition still succeeds — high priority

`Acquire a 12-lead ECG.` generated a successful roll, narrated electrode placement, and filed a paper on a unit whose manifest explicitly has no monitor. This occurred twice with the current prompt and once with the complete original gameplay prompt/wrapper. The original comparison also introduced a Rhythm value; the current prompt prevented that particular display leak but did not prevent the acquisition.

The detector/roll path does not gate this procedure on unit equipment. `acquireTwelveLeads` files every retained ECG procedure roll. Relying on model refusal is insufficient. Next action: enforce equipment eligibility before rolling and filing the paper, while preserving whatever assistance an actually arrived and equipped crew can provide under the simulator's rules.

Evidence: `results.json`, cases `bls` turn 2, `bls-old`, and `bls-current`. Relevant code: `src/engine/session.js` procedure detection around line 637 and acquisition around line 1089; `src/engine/twelve-lead.js` line 6. Origin: reproduced with the original prompt; underlying gate is absent in existing engine code.

### 2. Arrival skip changes major destination to nearest — high priority

Both ALS and BLS sequences selected `major`, departed for the major hospital, and narrated arrival at University Medical Center. On the arrival skip, the engine stored `nearest` instead. The skip forces `enRoute=true`, then the destination update uses `transportDest || 'nearest'` even when this turn has no new EN_ROUTE tag. The associated ETA is also recalculated using the nearest destination.

Next action: preserve the previously committed destination/ETA when completing an existing transport. Apply the nearest default only when beginning a transport without an established destination.

Evidence: `als` turns 6–7 and `bls` turns 5–6. Relevant code: `src/engine/session.js` lines 960 and 1010–1015. Origin: both operative code fragments are identical in the original backup.

### 3. Report clock disagrees with the mandatory TIME footer

The ALS radio response emitted T+7:30 while the engine retained T+7:00. The BLS report emitted T+7:15 while the engine retained T+6:30. The final ALS handoff emitted T+34:00 but was recorded at T+33:00. The engine explicitly skips clock updates in report mode, while the prompt demands realistic time advancement and an authoritative TIME tag on every reply.

Next action: choose one coherent report-time policy and apply it in both prompt and engine. Otherwise the displayed/graded timeline contradicts the model's scene clock.

Evidence: `als` turns 5 and 8, `bls` turn 4. Relevant code: `src/engine/session.js` line 1045. Origin: report-mode clock exclusion predates these edits.

### 4. ECG text filter removes a valid receiving-nurse question

The raw ALS radio response asked, “What is his current 12-lead finding, and do you have an updated ETA once wheels roll?” The player-visible reply lost that question and its closing quotation mark. The ECG prose filter treats the mention of a 12-lead as prohibited interpretation, although this was an operational question.

Next action: preserve questions/requests and dialogue integrity while removing actual waveform interpretations. Keep debrief interpretation entirely separate from this gameplay filter.

Evidence: `als` turn 5, compare `raw` and `reply`. Relevant code: `src/engine/twelve-lead.js` line 40. Origin: this filter was not changed by the prompt revisions.

### 5. Ordinary retry phrasing can produce no roll

`Okafor, try one IV in the left arm.` was not detected. The model left the attempt unresolved and the access ledger stayed empty. That behavior honored the prompt's roll authority, but the intended retry was unusable. Replaying the failed-attempt context with `Okafor, start an IV in the left arm.` correctly produced a SUCCESS and patent access.

Next action: broaden the procedure detector's supported retry phrasing or surface unmatched intended procedures before submission. Do not solve this by letting the model invent success.

Evidence: `als` turn 3 and `iv-retry`. Relevant data: `src/data/interventions.js` peripheral-IV synonyms; `src/engine/dice.js` detection. Origin: detector and synonyms were unchanged.

An additional observation: the BLS response emitted patient name/age demographics attributed to the wife without those details appearing in her visible dialogue. This is a source-fidelity concern, not evidence that a hidden diagnosis leaked. It was not separately reproduced.

## Debrief results — evaluated independently

- **Evidence fixture:** Recognized the DNR located in the middle of a long scene reply, used monitor-only bradycardia/BP and stored ECG morphology, and did not treat the transport skip as interrupted care. The fixture deliberately omitted several care actions; the evaluator identified those omissions after the relevant evidence became available.
- **Sound care with incorrect label:** Credited recognition/management of shock and prompt BLS transport despite a sepsis impression. It did not convert the wrong diagnostic label or time-skip into a care failure or demand unavailable ALS treatment.
- **Consequential delay control:** Criticized the explicit twenty-minute delay after visible hypotension and worsening mental status. Criticism was tied to the revealed findings and decision, rather than failure to name the hidden aneurysm.
- All three outputs contained five visible sections, the required protocol line, and a separate calendar-dated outcome under 14 words. The production review UI rendered them. No gameplay crew contract or API wrapper was supplied to these debrief calls.

The sound-care debrief nevertheless overstated evidence: it said prompt transport “ensured” definitive operative intervention before collapse, although the fixture recorded arrival and did not establish hospital surgery. Reinforcement should explain plausible benefit without claiming an unrecorded hospital event or guaranteed counterfactual outcome. This observation is limited to one output; its origin is not established. The debrief's own clinical explanations require a separate clinical-content review; this functionality evaluation did not certify those explanations against current medical guidelines.

## New prompt-hygiene concerns

1. **Length increased.** Across the same 100 deterministic seeds, assembled gameplay text averaged 7,910.75 words with the original assembler and 8,675.01 with the current assembler: +9.7%. The separate ALS debrief system prompt increased from 1,294 to 1,670 words: +29.1%. These edits resolve contradictions but are not a bloat reduction. A single stored-ECG evidence fixture now creates a 9,446-character evaluator input; serial ECGs add further waveform payload. One timeout occurred, but this test does not establish that prompt length caused it.
2. **The debrief borrows gameplay imperatives.** `buildDebriefPrompt` inserts the shared `ARREST_TRANSPORT_DOCTRINE`, including “the permitted crew concern is voiced once, then the crew complies” and “never automatic loading/departure orders.” Those are NPC behavior instructions, not evaluation criteria. No role confusion was observed in these three outputs. Next action: keep shared clinical transport principles if useful, but have separate gameplay and debrief wording for execution versus evaluation.

## Reproduce and inspect

- Automated checks: `npm test`
- New live evaluation, with the configured model key: `node test/eval-prompt-functionality.js`
- Saved results, without model calls: `node test/eval-prompt-functionality.js --review docs/prompt-evaluation/2026-10-08/results.json`
- Original prompt comparison/retry plus pending debrief retries: `node test/eval-prompt-functionality.js --followup <results.json>`

`results.json` preserves raw model replies, player-visible replies, rolls, before/after engine state, original/current gameplay prompt text, separate debrief prompts/input, source hashes, and timeout history. Two initial test assertions were too narrow: moving CPR ignored the HARD modifier, and the five-section matcher rejected valid Markdown headings. They were corrected against the preserved raw evidence, with their original assertions retained for auditability. The initial unrecognized IV retry remains a recorded functionality failure rather than being hidden by the successful follow-up.

This is a finite set of synthetic live samples. It cannot establish reliability across every random scenario, model response, or protocol variation.
