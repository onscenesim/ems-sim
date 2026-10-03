/* A local, scripted lesson using the live game's controls. Never creates a run. */
'use strict';
window.EMSTutorial = (() => {
  const $ = id => document.getElementById(id);
  let active = false, offering = false, page = 0, busy = false, preferenceKey;
  let highlights = [], savedInert = [], note, next, hint, resizeObserver;
  const key = () => `ems_tutorial_v1_${currentPlayer?.id || 'guest'}`;
  const read = () => { try { return localStorage.getItem(key()) !== 'off'; } catch { return true; } };
  function save(enabled, storageKey = key()) {
    try { localStorage.setItem(storageKey, enabled ? 'on' : 'off'); }
    catch { $('tutorial-save-status').textContent = 'This browser could not save the tutorial preference.'; }
  }
  function renderPreference() { $('tutorial-toggle').checked = read(); }
  $('tutorial-toggle').addEventListener('change', () => save($('tutorial-toggle').checked));
  renderPreference();

  const pages = [
    { title: 'Its your first shift! You’ve got this.', text: 'Meet Alex, a practice patient who felt lightheaded. Your partner has already attached the monitor. This call is scripted: try the controls, make a roll, and see the debrief.', target: '#output' },
    { title: 'First, look up ↑', text: 'The vital signs live here: heart rate, blood pressure, oxygen saturation, and more. Readings appear after you examine the patient or attach equipment. Click BP button to re-cycle it without passing time.', target: '#vitals-bar' },
    { title: 'Your pocket notebook', text: 'Tap MORE VITALS — the notebook icon — to open your field notes. Extra observations, the patient record, saved ECGs, and a scratch pad live inside.', target: '#vitals-expand', wait: 'Open the notebook above ↑' },
    { title: 'A place to keep your bearings', text: 'Here’s Alex’s demographics and the rest of the readings. Scroll through, and try the scratch pad. In a real call, ask the patient or your crew for missing details.', target: '#vitals-panel' },
    { title: 'You have a partner', text: 'Tap CREW. Your partner’s personality and skill affect how the call feels. Give clear jobs in the action box, like “Partner, check the patient’s blood pressure.”', target: '#crew-btn', wait: 'Open CREW above ↑' },
    { title: 'Meet your crew', text: 'Read your partner’s card. You lead the call, but you don’t have to do everything yourself. The crew badges show who is actually on scene; the captain may still be off scene. Make sure to call for backup on scary calls!', target: '#crew-panel' },
    { title: 'A little luck, a lot of judgment', text: 'Skill checks roll a 20-sided die. Higher is better. DC means difficulty class: the number you need to meet. For this Normal-mode example, DC is 10.', html: '<div class="tutorial-dice-key"><span><b>1</b> Complication</span><span><b>2–6</b> Failure</span><span><b>7–9</b> Marginal</span><span><b>10–20</b> Success</span></div><p class="tutorial-small">Generally: meet DC = success; miss by 1–3 = marginal; miss by more = failure. A 1 is always a complication. Easy mode succeeds on 2–20.</p>', target: '#output' },
    { title: 'Say what you want to do', text: 'There’s no menu of allowed moves: describe just about any procedure, exam, or drug in plain English. For drugs, include dose and route. To try a skill check, send “I place an IV.”', target: '#input-row', wait: 'Type the practice order, then press SEND ↑', command: 'I place an IV.' },
    { title: 'Check it. Then commit.', text: 'The game detected an IV order. ✓ DO IT means perform it now; ✗ JUST TALK means you were only talking about the procedure or drug. Confirm the checked IV to activate the roll. No separate dice button needed.', target: '#proc-confirm', wait: 'Keep ✓ DO IT selected and click CONFIRM ↑' },
    { title: '14 beats 10. Nice work.', text: 'Our teaching roll is fixed at 14: success against DC 10. Real rolls vary. Some patients raise the DC - small or difficult veins, for example. A moving ambulance raises the difficulty of fine motor procedures and makes a clean 12-lead harder to acquire.', target: '#output' },
    { title: 'The clock moves with your care', text: 'Each exam and procedure takes time. The IV advanced this practice call from T+0 to T+2. Don’t keep typing “wait”: “I monitor” fast-forwards to the next significant event, if nothing is going on. Try it now; we’ll jump to arrival.', target: '#input-row', wait: 'Send “I monitor” to move time forward ↑', command: 'I monitor.' },
    { title: 'At the doors. Wrap it up.', text: 'T+8: you’ve arrived and Alex is stable. In a real call, give your handoff with REPORT enabled so completed care isn’t treated as a new order. This practice handoff is done. Click END CALL.', target: '#skip-btn', wait: 'Click END CALL ↑' },
    { title: 'Every call is a chance to learn', text: 'This is your debrief. Review the timeline and vital signs, and read the debrief, which critiques your performance. Take it with a grain of salt.', target: '.learning-window', label: 'One last note →' },
    { title: 'You’re ready for the next call.', text: 'Re-enable this tutorial any time in OPTIONS. Visit the CALL LIBRARY for saved calls and patient outcomes, and click the progress bar for bonus features. Everything is unlocked right now — try the pens and stickers!', target: '#options-open, #player-library, #player-progress', label: 'Back to my setup →' },
  ];

  function clearHighlights() {
    highlights.forEach(el => el.classList.remove('tutorial-highlight'));
    highlights = [];
    savedInert.forEach(([el, inert]) => { el.inert = inert; });
    savedInert = [];
  }
  function focusTargets(selector) {
    clearHighlights();
    highlights = [...document.querySelectorAll(selector)];
    highlights.forEach(el => el.classList.add('tutorial-highlight'));
    // Keep unrelated controls out of the lesson, including keyboard navigation.
    document.querySelectorAll('#terminal button, #terminal input, #terminal select, #start-screen button').forEach(el => {
      const allowed = (page !== 13 && highlights.some(target => target === el || target.contains(el)) && !['report-btn', 'notepad-stickers-edit'].includes(el.id)) || el.id === 'sound-toggle-hdr';
      if (!allowed) { savedInert.push([el, el.inert]); el.inert = true; }
    });
    if (page === 13) { savedInert.push([startScreen, startScreen.inert]); startScreen.inert = true; }
  }
  function layout() {
    if (!active || !note) return;
    document.body.style.setProperty('--tutorial-height', `${Math.ceil(note.getBoundingClientRect().height) + 16}px`);
  }
  function showPage(index) {
    page = index;
    const step = pages[page];
    hideCrewPanel();
    setVitalsPanelOpen(false);
    if (page === 3) setVitalsPanelOpen(true);
    if (page === 5) showCrewPanel();
    if (page === 13) {
      resetToStart(false);
      document.querySelector('.start-content').scrollTop = 0;
    }
    note.innerHTML = `<div class="tutorial-topline"><span>FIELD GUIDE · ${page + 1} / ${pages.length}</span><span>TRAINING CALL</span></div><h2 tabindex="-1" id="tutorial-heading"></h2><p class="tutorial-copy"></p>${step.html || ''}<div class="tutorial-hint" role="status"></div><div class="tutorial-nav"><button type="button" class="tutorial-leave">← Leave lesson</button><button type="button" class="tutorial-next"></button></div>`;
    $('tutorial-heading').textContent = step.title;
    note.querySelector('.tutorial-copy').textContent = step.text;
    next = note.querySelector('.tutorial-next');
    hint = note.querySelector('.tutorial-hint');
    hint.textContent = step.wait || '';
    next.textContent = step.wait ? 'Try it above ↑' : (step.label || 'Continue →');
    next.disabled = !!step.wait;
    next.addEventListener('click', advance);
    note.querySelector('.tutorial-leave').addEventListener('click', () => finish(false));
    if (step.command) {
      const fill = document.createElement('button');
      fill.type = 'button'; fill.className = 'tutorial-fill'; fill.textContent = 'Use practice text ↗';
      fill.addEventListener('click', () => { userInput.value = step.command; focusActionInput(true); });
      hint.append(' ', fill);
    }
    setInputEnabled(page === 7 || page === 10);
    skipBtn.disabled = page !== 11;
    if (page === 11) skipBtn.style.display = '';
    focusTargets(step.target);
    note.classList.remove('tutorial-flip');
    void note.offsetWidth;
    note.classList.add('tutorial-flip');
    layout();
    $('tutorial-heading').focus({ preventScroll: true });
    if (page === 8 || page === 9) scrollBottom();
    if (page === 12) output.scrollTop = 0;
  }
  function advance() {
    if (busy) return;
    playSound('paper');
    if (page === pages.length - 1) finish(true);
    else showPage(page + 1);
  }
  function begin() {
    preferenceKey = key();
    resetToStart(false);
    active = true;
    document.body.classList.add('tutorial-active');
    startScreen.style.display = 'none'; terminal.style.display = 'flex';
    // A null session ID is intentional: no practice action can reach a live run.
    print('TRAINING CALL · SCRIPTED PRACTICE · T+0', 'system');
    printReply('DISPATCH: A patient felt lightheaded at work. Your unit is on scene.\nAlex: "I’m feeling a little better. What happens next?"\nYour partner has attached the monitor and obtained an initial set of vitals.');
    applyVitals({ Rhythm: { value: 'sinus' }, HR: { value: 88 }, BP: { value: '124/78', tMin: 0 }, SpO2: { value: 98 }, RR: { value: 16 }, Temp: { value: 98.6, tMin: 0 } });
    applyPatientRecords([{ id: 'patient_1', name: 'Alex Morgan', age: 38, sex: 'female', comorbidity: 'None reported', source: 'your patient' }]);
    populateCrewPanel({ partner: { role: 'partner', name: 'Destiny Okafor', competency: 'high', enthusiasm: 'high', confrontation: 'low', personality_notes: 'Your partner for this practice call. Ready when you are.' } });
    applyCrewStatus({ partner: 'on_scene', captain: 'not_on_scene' });
    note = document.createElement('section'); note.id = 'tutorial-note';
    note.className = 'tutorial-paper'; note.setAttribute('aria-labelledby', 'tutorial-heading');
    document.body.append(note);
    resizeObserver = new ResizeObserver(layout); resizeObserver.observe(note);
    showPage(0);
  }
  function finish(completed) {
    if (busy) return;
    clearHighlights();
    active = false;
    resizeObserver?.disconnect(); note?.remove(); note = null;
    $('proc-confirm')?.remove();
    document.body.classList.remove('tutorial-active');
    document.body.style.removeProperty('--tutorial-height');
    userInput.value = '';
    populateCrewPanel(null);
    clearVitalsScratch();
    resetToStart(false);
    // An interrupted lesson stays enabled so the next BEGIN offers it again.
    if (completed) save(false, preferenceKey);
    renderPreference();
    startBtn.focus({ preventScroll: true });
  }
  async function offer() {
    if (active || offering || startBtn.disabled) return;
    offering = true;
    await initialPlayerReady;
    if (!read()) { offering = false; return startScenario(); }
    const dialog = document.createElement('dialog');
    dialog.className = 'tutorial-paper tutorial-invite';
    dialog.setAttribute('aria-labelledby', 'tutorial-invite-title');
    dialog.innerHTML = '<div class="tutorial-topline">A NOTE FROM YOUR PARTNER</div><h2 id="tutorial-invite-title">First shift?</h2><p class="tutorial-copy">Take the quick tutorial first. <strong>Strongly recommended for new players.</strong> Learn the controls, try a dice roll, and finish a practice call in about 3 minutes.</p><p class="tutorial-small">Your selected scenario will wait. This practice call uses no AI requests and adds no score.</p><div class="tutorial-nav"><button type="button" id="tutorial-skip">Skip & begin scenario</button><button type="button" id="tutorial-start" autofocus>Show me the ropes →</button></div>';
    document.body.append(dialog);
    dialog.addEventListener('close', () => { offering = false; dialog.remove(); startBtn.focus({ preventScroll: true }); });
    $('tutorial-start').addEventListener('click', () => { offering = false; dialog.close(); playSound('paper'); begin(); });
    $('tutorial-skip').addEventListener('click', () => { save(false); renderPreference(); dialog.close(); startScenario(); });
    dialog.showModal();
  }
  $('vitals-expand').addEventListener('click', () => { if (active && page === 2) showPage(3); });
  $('crew-btn').addEventListener('click', () => { if (active && page === 4) advance(); });

  async function send(msg, opts = {}) {
    if (busy) return;
    if (page === 7) {
      if (!/\biv\b/i.test(msg) || /\b(no|not|don't|avoid)\b/i.test(msg)) {
        hint.firstChild.textContent = 'For this scripted practice, send “I place an IV.” ';
        return;
      }
      print(`> ${msg}`, 'user');
      showProcConfirm(msg, {}, [{ key: 'tutorial-iv', procedure_id: 'peripheral_iv', matched: 'IV' }]);
      advance();
    } else if (page === 8 && opts.resolved) {
      if (!opts.procAllow?.includes('tutorial-iv')) {
        print('Just talk — no procedure, no roll. Try the practice IV order again.', 'system');
        playSound('paper'); showPage(7); return;
      }
      busy = true;
      note.inert = true;
      hint.textContent = 'Rolling the teaching die…';
      clearHighlights();
      setInputEnabled(false);
      await animateDiceRoll('peripheral_iv', 14, 10, 'SUCCESS');
      busy = false; note.inert = false;
      currentSceneMinute = 2;
      printRoll({ procedure_id: 'peripheral_iv', intervention: true, roll: 14, dc: 10, outcome: 'SUCCESS' });
      print('T+2 · Practice IV placed successfully. The crew loads Alex and begins transport.', 'narrative');
      advance();
    } else if (page === 10) {
      if (!/\b(monitor|wait|observe)\b/i.test(msg)) {
        hint.firstChild.textContent = 'Try “I monitor” for this time jump. '; return;
      }
      print(`> ${msg}`, 'user'); currentSceneMinute = 8;
      print('T+8 · Next significant event: arrival at the hospital. Alex remains stable. Your practice handoff is complete.', 'narrative');
      advance();
    }
  }
  // EDIT MESSAGE in the shared confirmation UI returns to the guided composer.
  document.addEventListener('click', event => {
    if (active && page === 8 && event.target.closest('.proc-confirm-cancel')) { playSound('paper'); showPage(7); }
  });
  function endCall() {
    if (page !== 11 || busy) return;
    isClosed = true; skipBtn.style.display = 'none';
    output.replaceChildren();
    print('PRACTICE COMPLETE · SAMPLE DEBRIEF', 'system');
    output.append(PracticeUI.learning({
      debriefText: '# What went well\nYou located the vital signs, consulted your notebook and crew, and confirmed an order before the skill check.\n# The teaching roll\nPeripheral IV: 14 against DC 10 — SUCCESS. This is a fixed example, not a grade of your clinical skill.\n# Take this into your next call\nReassess after interventions. Use clear orders, watch the time, and give a handoff before ending the call.\n# Patient outcome\nAlex arrived stable and care was transferred to the hospital. This outcome is scripted for the tutorial.',
      timeline: [
        { turn: 1, patient: 'patient_1', minute: 0, action: 'Review initial findings', scene: 'Partner obtained initial vitals.', vitals: { HR: 88, BP: '124/78', SpO2: 98 }, procedures: [] },
        { turn: 2, patient: 'patient_1', minute: 2, action: 'I place an IV.', scene: 'Practice IV placed successfully.', procedures: [{ id: 'peripheral_iv', intervention: true, roll: 14, dc: 10, outcome: 'SUCCESS' }] },
        { turn: 3, patient: 'patient_1', skip: true, minute: 8, action: 'I monitor.', scene: 'Arrived stable. Handoff complete.', procedures: [] },
      ],
    }));
    advance();
  }
  return { get active() { return active; }, offer, send, endCall, renderPreference };
})();
