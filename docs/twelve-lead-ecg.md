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
reperfusion model, does not establish an NSTEMI diagnosis, and does not include
supplemental V4R/V7–V9. A missing rate uses a visibly marked estimated rate.
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
