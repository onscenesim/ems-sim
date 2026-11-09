# EMS Test Lab

From the project folder, run `npm run lab`, then open http://127.0.0.1:3140.
Keep the terminal running; Ctrl+C stops the server. Restart with the same command any time.
If that port is occupied, run `PORT=3141 npm run lab` and use the printed URL.

The server binds only to this computer. It does not load .env, the simulation engine,
accounts, saved calls, or model clients. Gameplay API requests are blocked. The animation
frame uses in-memory preferences; the lab does not equip cosmetics or change player progress.

- Animations: every production overlay, plus procedure and medication variants. Choose an
  outcome, hold the start/action/end pose, replay at normal or quarter speed, or loop. Choose ALS/BLS,
  parked/transport for sound variants, and adult male/female, child or baby for patient loading.
  Airway and resuscitation scenes have adult male/female, child male/female, and one shared baby profile.
  Baby LUCAS uses the child artwork. Infant CPR uses encircling thumbs; infant BVM uses the neonatal bag.
  Action pose holds peak BVM ventilation, LUCAS/CPR compression, or the midpoint of other scenes.
  Still poses are silent. Stop cancels pending scene timers and audio.
- Character cards: every crew member and both custom portrait examples, rendered by the game.
- Pens: all eight real mechanisms. Click their controls to retract, uncap, or shake them.
- Stickers: the entire shared catalog, with editable sample Post-it text.
- Glovebox: every item with the existing production drag/sort fixture. Reopening resets the tray.
- Medication cards: all cards through the game's actual renderer.
- Monitors & ECG: live ECG/pleth, all rhythm and ECG pattern presets, and lead views.
  The 12-lead quality selector previews all four acquisition outcomes independently
  of pleth signal quality. Rhythm presets load a suggested, editable heart rate,
  including 2:1 flutter at 150 and 3:1 at 100. Try hypothermia, Brugada, terminal
  hyperkalemic sine wave, sodium channel blockade, and either LBBB MI pattern;
  select AFib with a regional pattern to check both together.
- Live HR: the numeric monitor reading updates between turns. Select AFib to
  see larger R–R-driven swings, or a regular rhythm to see small (up to 2 bpm)
  fluctuations. The heart-rate input remains the underlying clinical rate.
- 3-lead texture: compare a clean trace, forced scene/transport texture, or natural
  intermittent on-scene and transport modes during the live sweep. This fine
  motion/contact grain is cosmetic, has no failure event or corrective action,
  and never changes beat scheduling, vitals or paper acquisition quality.
- Capnography: change inline/nasal/mask sampling, respiratory rate, EtCO₂, waveform
  feature, capture quality and connection while the 12-second sweep runs. New
  variation changes breath contours and nasal artifact. Both sources show RR in
  the production monitor. See [capnography notes](../../docs/capnography.md).
- Sound library: all game cue mappings at the configured levels. Audio is off by default.

Search each collection; use Appearance to compare light and dark. Bookmark the page to keep
its collection and animation, e.g. /#tab=animations&scene=laryngoscope.

## For future changes

The lab reads public/index.html and runs the current public/app.js inside its preview frame.
Artwork and catalogs are shared. No copies of animation SVGs or character data are maintained.
Add an adapter to frame.js for a new animation or a new meaningful variant. The overlay coverage
check reports unregistered overlays, and `npm run test:lab` checks coverage and
server isolation. Preview changed visuals and transitions here before handing work back.
