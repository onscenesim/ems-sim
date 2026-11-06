# Non-trauma regression review — November 6, 2026

Extensive probing found real detection regressions and pre-existing collisions.
The fixes preserve separate non-trauma procedures rather than routing unrelated
uses of pressure, towels, gauze or blood through wound management.

## Findings and fixes

| Finding | Corrected behavior |
| --- | --- |
| Newborn wrapping, cricoid/CPAP pressure, obstetric maneuvers and comfort/padding could create hemorrhage actions | These meanings bypass both wound parsing and the semantic fallback, including when a fistula wound already exists |
| Routine access dressings, chemical burns and other nonbleeding dressings could become hemorrhage attempts | Wound actions require external hemorrhage intent; observed wound enrollment requires lesion/source evidence and active bleeding |
| Uterine/GI/airway bleeding could be mistaken for a compressible external wound | These sources retain their specialty care; blood alone cannot enroll a wound |
| Multi-vital-sign requests left an unmatched `blood` token and logged a transfusion | Blood-pressure/glucose/lab compound nouns cannot become blood administration; real transfusion orders still roll |
| `CAT scan` triggered a tourniquet | Imaging wording is excluded while actual CAT tourniquet orders remain recognized |
| Natural nose-packing orders used the general bleeding procedure | Nose-packing and nasal-pressure aliases resolve to `epistaxis_control` |
| Skin irrigation missed its roll, while `after decontamination` repeated it | Skin/clothing decontamination orders roll once; later background mentions do not repeat the procedure |
| Filtering mixed wound/medical sentences could lose genuine wound targets | Clauses are separated and independent anatomical targets retained, including bilateral pressure alongside CPAP |

## Automated coverage

- Full `npm test`: **326 passing tests**, plus the existing roller/randomness
  scripts in that command.
- Additional patient-record suite: **4 passing tests**.
- All **491 non-trauma catalog entries** exercised through mocked Session
  assessment, glucose, report and transport-skip turns: **1,964 turns**. This is
  engine/state coverage, not a live clinical evaluation of every catalog case.
- **50 non-wound phrases** checked with and without an active fistula wound,
  plus **200 compound wound/medical orders**.
- HTTP confirmation checks cover CPAP approval/denial, newborn wrapping,
  deterministic fundal massage and unchanged wound state.
- A one-off comparison of **6,556 phrases** against the checked-in dice parser
  (using the current shared alias registry) found only six reviewed, intended
  corrections: uterine massage, bilateral BP, multi-vital BP, blood-gas wording,
  CAT imaging and completed decontamination. No unexplained differences remained.

## Live preview verification

The final batch completed **15 representative catalog calls and 48 live model
turns**, covering all 11 non-trauma categories, with **zero mechanical alerts**.
Cases included ACS, COPD/CPAP, stroke, BLS hypoglycemia, fistula hemorrhage,
epistaxis, BLS opioid overdose, panic, pediatric seizure, postpartum hemorrhage,
neonatal resuscitation, VF arrest, DOA, a medical curveball and chemical skin
exposure. Checks include phantom medication/hemorrhage rolls, wound enrollment,
BLS monitor scope and patient separation. Scene narratives were also inspected.

Fresh production-detector UI checks confirmed that a multi-vital assessment
creates no medication roll, newborn wrapping creates no hemorrhage roll,
bilateral pressure plus CPAP retains two wound rolls and CPAP, and a genuine
PRBC order plus vital signs retains exactly one medication roll.

The live probes use temporary storage, with no production player data changed.
This is broad regression evidence, not proof that every possible wording or
model-generated clinical outcome is correct.

## Repeat the probes

```sh
npm test
node --test test/test-patient-records.js
node test/preview-nontrauma-regressions.js
```

Open `http://127.0.0.1:3135/nontrauma-preview` for the live batch. The focused
production treatment detector is available with `node test/preview-treatments.js`
at `http://127.0.0.1:3012/`.
