# Twelve-lead recordings

A reconciled `twelve_lead` procedure files a recording on its session turn. The
snapshot contains the acquisition time, patient ID, captured rhythm and rate,
lead morphology, beat schedule, and deterministic artifact seed. Existing turn
persistence and cancellation rollback cover it; opening or resuming never
rerolls an old recording. Legacy sessions start with no printouts.

More Vitals lists recordings for the selected patient. Open paper shows the
standard I/aVR/V1/V4, II/aVL/V2/V5, III/aVF/V3/V6 layout plus a ten-second lead II rhythm strip.
Columns represent sequential 2.5-second windows. Grid geometry is 25 mm/s and
10 mm/mV, with a 1 mV calibration pulse. Fit view scales the entire paper;
Actual size permits horizontal scrolling.

All 19 monitor rhythm tokens use the shared normalizer. Ventricular rhythms,
pacing and active tachyarrhythmias suppress primary injury overlays; bradycardia
and AV blocks retain appropriate ST-T changes. Sinus tachycardia still permits
pathology morphology. Rates drive beat spacing, including irregular AF and
blocked atrial impulses. Poorer procedure outcomes increase baseline artifact.

These are original synthetic teaching traces, not copied clinical recordings.
Case identity selects pathology; notes only supply a missing infarct location.
Stable case variation avoids changing infarct territory on each acquisition.
The morphology is simplified: it is not a continuous electrophysiology or
reperfusion model, does not establish an NSTEMI diagnosis, and supplemental leads are simplified spatial projections with regional overrides. A missing rate uses a visibly marked estimated rate.
Secondary patients receive their own rhythm snapshot without inheriting the
primary patient's hidden diagnosis. Narration acknowledges acquisition without explaining the ECG. A server filter
also removes narrated waveform findings before display. Options → Monitor Auto
Interprets 12 leads is on by default and saved on the device, like sound/theme.
It controls only the paper's unconfirmed machine interpretation, never the
underlying tracing. This deliberately unreliable training feature always
suggests pathology on clean tracings, including false ACUTE MI SUSPECTED headlines for LVH
and LBBB. Artifact stops interpretation; pacing has its own no-interpretation
message. Canned suggestions are frozen with each acquisition.

Cardiac comorbidity profiles can generate LVH strain or LBBB when no acute
pathology pattern has already been selected. HCM produces deep narrow
inferolateral Q waves; Brugada produces coved V1–V2 ST elevation and T inversion;
long QT cases delay the T wave. Active tachyarrhythmia/pacing still takes priority.

Reference patterns consulted:

- [LITFL ECG Library](https://litfl.com/ecg-library/)
- [Inferior STEMI](https://litfl.com/inferior-stemi-ecg-library/)
- [Posterior infarction](https://litfl.com/posterior-myocardial-infarction-ecg-library/)
- [De Winter](https://litfl.com/de-winter-t-wave/)
- [Wellens](https://litfl.com/wellens-syndrome-ecg-library/)
- [Aslanger](https://litfl.com/aslanger-pattern/)
- [Myocardial ischemia](https://litfl.com/myocardial-ischaemia-ecg-library/)
- [Hypothermia](https://litfl.com/hypothermia-ecg-library/)
- [LVH](https://litfl.com/left-ventricular-hypertrophy-lvh-ecg-library/)
- [LBBB](https://litfl.com/left-bundle-branch-block-lbbb-ecg-library/)
- [HCM](https://litfl.com/hypertrophic-cardiomyopathy-hcm-ecg-library/)
- [Brugada](https://litfl.com/brugada-syndrome-ecg-library/)
- [QT interval](https://litfl.com/qt-interval-ecg-library/)
- [Raised intracranial pressure](https://litfl.com/raised-intracranial-pressure-ecg-library/)

Run `npm test` for waveform, clinical distribution, acquisition and persistence
checks. Run `node test/preview-twelve-lead.js` and open
http://127.0.0.1:3013 for the production notebook/animation preview with synthetic
cases and no model calls. It offers rhythm, pathology, rate, quality, patient
switching, serial acquisition and saved-recording restoration controls.

The top readout follows the supplied monitor-printout reference with three
header columns. The original 3 × 4 waveform layout and long lead II strip remain. The header uses only revealed
patient demographics; interval and axis values are synthetic estimates.

## Adding ECGs without changing the renderer

`public/ecg-catalog.js` is the shared browser/server catalog. For a new pathology,
add one entry to `patterns`, then set `ecg_pattern: 'your_key'` on its scenario.
An optional `match` regex also recognizes case names; matching is ordered and
uses affirmative case identity, never differential hints. Example definition:

```js
teaching_variant: {
  extends: ['lvh'],                 // optional; parent overlays run first
  overlays: [['II III aVF', {q: .25, qWidth: .008}]],
}
```

Lead properties use mV (`r`, `s`, `q`, `p`, `t`, `st`, `j`, `pr`, `u`) and seconds
(`qWidth`, `tWidth`). `biphasic`, `upsloping`, `coved`, and `lbbb` select existing
shape features. `st('II III aVF', .15)` applies stable per-case ST scaling;
ordinary overlays use exact values. Pattern options include `qrs`, `pr`,
`qtScale`, `delta`, `afterBroad`, and `mimic` (the intentionally false MI headline).
`choose(variant)` can select among catalog keys using stable patient variation.
Inherited overlays are additive; child values win on overlapping lead fields.

For a new rhythm preset, add a `rhythms` entry using an existing waveform family:

```js
teaching_escape: {waveform: 'idioventricular', rate: 32, aliases: /teaching_escape/},
```

It inherits broad complexes, rhythm priority, and other family behavior. Both
3-lead and 12-lead share the catalog's aliases, default rates and waveform family.
Exact rhythm tokens always win; put specific aliases before broad aliases. Use
`pattern` for a fixed morphology, `priority` to suppress primary injury, or
`priorityAt` for a rate threshold. The 3-lead uses the family waveform; the
12-lead additionally renders the regional pathology. The allowed model rhythm tokens update automatically from the catalog. Add an
optional `prompt` string on a rhythm to explain when the model should emit it.
An entirely new electrical timing/shape family still needs a focused handler in
`twelve-lead.js` and the monitor's scheduling/signal functions in `app.js`; it
does not require changes to acquisition, storage, quality, or paper layout.

**Low quality is automatic for every entry.** `sample()` always adds the shared
acquisition artifact after generating the electrical signal. SUCCESS, MARGINAL,
FAILURE and COMPLICATION have progressively stronger artifact; entries cannot
opt out. The catalog-wide contract test checks every pattern at slow/normal/fast
rates and every rhythm/variant across all four qualities, including persistence.
No separately drawn low-quality assets or extra model calls are needed. Run
`node --test test/test-twelve-lead.js test/test-client-operations.js`, then use the
side preview; its catalog selectors automatically include new entries.

Asystole selects `flat` or `wander` deterministically per acquisition. Both have
zero heart rate and no P/QRS/T complexes. Clean flat is exactly flat; clean wander
is slow, at most 0.025 mV (0.25 mm at standard gain). Poor-quality recordings of
both get the same shared artifact as every other ECG. A scenario may pin
`ecg_rhythm_variant: 'flat'` or `'wander'`; the focused preview exposes both.
Variant, signal family and P-wave behavior are stored with version 2 recordings,
so viewing/restoring cannot reroll them. Version 1 snapshots remain supported.

The header background is now the paper border's off-white (`#fff9f2`); the grid
begins below the readout. Header text, columns and waveform layout are retained.

New live acquisitions automatically open the latest paper in fit view after the
procedure animations finish. Closing leaves it filed in More Vitals. Restoring a
session, switching patients and receiving the same response again do not reopen
old papers. The popup shows the acquired patient even when the notebook is
viewing another patient.


## Posterior, right-sided and V4R acquisitions

The shared catalog `views` defines placements and procedure names:

| Order | Procedure | Replaced slots |
| --- | --- | --- |
| Obtain posterior ECG / posterior leads | `posterior_ecg` | V4 → V7, V5 → V8, V6 → V9 |
| Obtain right-sided ECG | `right_sided_ecg` | V1–V6 → V1R–V6R (full mirrored placement) |
| Obtain V4R | `v4r_ecg` | V4 → V4R only |

These share the standard acquisition roll and all four quality outcomes. Each
files its own paper and opens automatically. Limb leads, timing and all unmoved
leads retain their morphology. V4R uses exactly the same V4R coefficients as the
full right-sided view. Active arrhythmias/pacing reuse the standard signals;
changing placement does not invent additional findings in those rhythms.

Posterior paper has the printed V4/V5/V6 labels crossed out, with V7/V8/V9 written
beside them. Right-sided paper adds a handwritten R beside each relocated label.
The browser captures the selected cosmetics pen ink when the order starts and
sends it through the operation/confirmation flow. Version 3 snapshots store the
view, lead-label map and validated ink color alongside the waveform, so later pen
changes and restoring sessions cannot recolor old paper. Older snapshots display
as standard recordings. The notebook selector names each placement.

All new patterns automatically inherit right-sided, V4R and posterior variants
from `supplementalLeads()` and the mandatory artifact layer. No additional SVGs
or per-quality assets are required. Generic projections attenuate posterior
voltage and change right precordial progression; a normal case can yield an
unremarkable supplemental study. Refine a cardiac pattern with optional
`supplemental: {posterior: [...], right: [...]}` overlays using the same
`[lead names, properties]` shape as standard overlays. Use actual supplemental
names (V7–V9 or V1R–V6R). Parent supplemental overlays run before child overrides;
V4R automatically selects the right-sided V4R result. The catalog's `supplements`
table supplies these regional refinements for the existing roster.

`posteriorChance` and `rvChance` configure stable case-level involvement (0–1),
not a new random finding per acquisition. Explicit posterior and RV-infarct cases
use 1; generic inferior/lateral cases can have involvement or a nondiagnostic
supplemental view. Posterior infarction produces V7–V9 elevation, while diffuse
subendocardial ischemia preserves posterior depression with aVR elevation on the
standard leads. Dedicated subendocardial and RV-infarct cases are in the cardiac
roster. LVH/LBBB, HCM and other existing patterns retain appropriate simplified
supplemental morphology. These are teaching approximations, not validated
clinical reconstructions or a diagnostic algorithm.

The catalog-wide test checks every placement and quality, unchanged unmoved
leads, V4R/full-right identity, rhythm reuse, valid samples and persistence.
The focused preview offers placement, quality, catalog pattern and the real
scratch-pad pen selector for visual checks.

Additional references:

- [LITFL lead positioning](https://litfl.com/ecg-lead-positioning/)
- [LITFL right ventricular infarction](https://litfl.com/right-ventricular-infarction-ecg-library/)
- [LITFL myocardial ischemia](https://litfl.com/myocardial-ischaemia-ecg-library/)
