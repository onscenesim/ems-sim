# Waveform capnography

The monitor shows a yellow 12-second sweep, a measured EtCO₂, a capnographic
respiratory rate, and the sampling source. Capnography remains visible beneath
either compact ECG/pleth selection. Manual RR alone never connects capnography.
Both nasal sampling and inline airway sampling provide RR. A sampling disconnect
clears EtCO₂ and capnographic RR; any manually counted RR remains independent.

The model reports measured signal metadata with the VITALS tag:

```
ETCO2=38 RR=12 CapnoSource=airway CapnoStatus=connected CapnoQuality=clean CapnoShape=normal CapnoVentilation=manual
```

- `CapnoSource`: `nasal`, `airway` (inline ETT/SGA/cric), `mask`, or `unknown`.
- `CapnoStatus`: `connected`, `disconnected`, `unplaced`.
- `CapnoQuality`: `clean`, `variable`, `poor`.
- `CapnoShape`: `normal`, `obstructive`, `cleft`, `rebreathing`, `irregular`,
  `low_flow`, `apnea`. These describe signal features, not confirmed diagnoses.
- `CapnoVentilation` tracks manual, mechanical, paused, or spontaneous breathing.
  RR reflects the measured breathing or delivered ventilation rate. During
  assisted ventilation, the engine uses the prior assisted cadence or an
  age-based simulation cadence when the current rate is missing or zero. An
  explicit pause suppresses breaths and a measured zero CO₂ remains flat.

`src/engine/capnography.js` validates metadata and stores a `Capnography` object
per patient with a stable case/patient seed. A connected sensor retains its last
measurement across omitted fields; placeholder text never becomes a number.
Disconnection requires an explicit reconnect; reconnect without new measurements
cannot restore a stale number. Patient switches never inherit another patient's
source, rate or shape. State survives the existing turn/snapshot persistence.
Older recordings with an unspecified sampling source are explicitly marked as
such and rendered with uncertain capture, rather than assumed to be inline.

`public/capnography.js` supplies the shared pure signal and live canvas renderer.
Rate controls breath density and expiration/inspiration durations. EtCO₂ controls
amplitude on a 0–80 mmHg display scale. Low-flow readings of 1–16 mmHg use a
labeled 0–20 mmHg scale so small breaths are visible. The sweep clears when
the scale changes.
Breath-to-breath upstroke, plateau slope, expiratory duration, cleft location and
depth vary deterministically with seed and cycle. Slow breathing can have small
oscillations. Irregular breathing warps timing continuously. Low-flow cases use
the measured low EtCO₂ rather than an unrelated full-height waveform template.

Nasal sampling always adds variable dilution, irregular capture, occasional lost
breaths and aperiodic artifact, even with the best capture setting. Poor capture
increases distortion for every source. Some nasal breaths remain usable; noise
is not treated as a real respiratory rate. The source and sampling warning stay
visible, without giving the player a diagnosis. Several causes may produce a
similar shape; these are educational synthetic signals, not a calibrated gas
analyzer or a diagnostic classifier.

The canvas preserves phase and existing history across rate/morphology updates.
Changing patient or source clears the old trace. Disconnect/unplace cancels the
animation; reconnect starts it again. Dimensions are cached with ResizeObserver.

In `npm run lab` → **Monitors & ECG**, use the capnography panel to change source,
RR, EtCO₂, shape, capture and connection during the sweep. **New variation**
changes the seed. The enlarged strip uses the production renderer. The apnea
preset sets RR/EtCO₂ to zero; low amplitude sets EtCO₂ to 12. Rates and values
remain editable. Test with `node --test test/test-capnography.js` and inspect the
side preview before handoff.

Morphology and sampling references:

- [Medtronic capnography waveform guide](https://www.medtronic.com/content/dam/medtronic-wide/public/united-states/products/patient-monitoring/capnostream-20p-bedside-capnography-monitor-use-in-procedural-sedation-quick-reference-chart.pdf)
- [Medtronic sampling-line accuracy bench study](https://www.medtronic.com/content/dam/medtronic-wide/public/united-states/products/patient-monitoring/capnography-monitoring/microstream-capnography-bench-test-summary-white-paper.pdf)
- [Masimo capnography waveform quick reference](https://masimosafetynetalert.masimo.com/siteassets/us/documents/pdf/plm-11098b-quick-reference-guide-capnography-waveforms-global.pdf)
