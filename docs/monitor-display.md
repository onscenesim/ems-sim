# Monitor display and opening cue

The numeric face is bundled Inter at weight 700, with Helvetica-like proportions,
lining/tabular digits and its genuine OpenType slashed-zero glyph. A light
0.55px same-color shadow softens the LCD edge. It is not an OEM firmware font.
The 1, 6 and 9 use authored outlines in `EMSMonitorDigits.woff2`, selected by
Unicode range so font-feature substitutions cannot reintroduce the footed 1.
The 1 has a broad top hook and no foot; 6 and 9 have upright sides, short
flat-cut terminals and rounded rectangular counters. Rebuild with
`scripts/generate-monitor-digits.py` (fonttools and brotli required). Main
readouts are 46px (38px on mobile), with a 95% horizontal scale for the narrower
LP15 proportions. BP uses the same face, weight and size as HR, SpO₂ and CO₂.
The font is distributed
under the included SIL Open Font License (`public/fonts/OFL-Inter.txt`).
Font source and feature reference: https://rsms.me/inter/
Visual reference:
https://www.stryker.com/us/en/emergency-care/products/lifepak-15.html

The blue vertical pulse bar beside each SpO₂ readout uses the pleth renderer's
current sample and clock, including its perfusion/artifact amplitude. The bars
continue updating when the compact waveform is hidden, and empty immediately
when the probe is removed or the peripheral pulse is absent.

`public/sounds/MonitorOpen.wav` is the three ending beeps from the user-provided
`Defiboutsideambulance.mp4` recording, 6.875–7.570 seconds. The charge and shock
are excluded. The mono PCM excerpt has a 140 ms cosine fade over the last
beep and tail, and plays at 0.2 gain on the first Monitor opening in each call.
Subsequent openings use the supplied `interface-dialogpanel-out-02-03.wav`.
Opening again stops any previous monitor cue, so rapid reopening cannot layer
sounds. A new call resets the first-opening state. Both cues respect the shared
mute/background handling. Audio is not looped or tied to the patient's pulse.

The supplied dice clips begin with the spinning die. The number and outcome
appear at their first drop (success 0.85 s, failure 0.87 s), following the audio
clock after playback actually starts. The entire result tail ends before the
next procedure starts. Outcome feedback without a die starts at the drop and
also finishes before its procedure. Oral/sublingual/buccal medication uses
`pyrholidon-pickup-01.wav`; even a delayed decode must finish before the scene
releases the next action. New cue gains match active RMS near −27 dBFS,
excluding quiet tails, while retaining the recordings' dynamics.
