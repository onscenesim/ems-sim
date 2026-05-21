'use strict';

// ── DOM refs ────────────────────────────────────────────────────────────

const startScreen  = document.getElementById('start-screen');
const terminal     = document.getElementById('terminal');
const output       = document.getElementById('output');
const userInput    = document.getElementById('user-input');
const sendBtn      = document.getElementById('send-btn');
const startBtn     = document.getElementById('start-btn');
const endBtn       = document.getElementById('end-btn');
const crewBtn      = document.getElementById('crew-btn');
const tierMsg      = document.getElementById('tier-msg');
const accessInput  = document.getElementById('access-code');
const accessApply  = document.getElementById('access-apply');

const badgeTier    = document.getElementById('badge-tier');
const badgeDiff    = document.getElementById('badge-diff');
const badgeProv    = document.getElementById('badge-prov');
const badgeRgn     = document.getElementById('badge-rgn');

// ── State ────────────────────────────────────────────────────────────────

let sessionId       = null;
let isClosed        = false;
let waitingDebrief  = false;
let localTranscript = null;   // built client-side so export never hits the server
let clockInterval   = null;   // setInterval handle for the scene clock
let scenarioStartTime = null; // Date.now() when the current scenario started

// ── Input history (↑ / ↓ arrow keys) ───────────────────────────────────

const history = [];
let histIdx   = -1;
let savedLine = '';

function addHistory(msg) {
  if (history[history.length - 1] !== msg) {
    history.push(msg);
    if (history.length > 80) history.shift();
  }
  histIdx   = -1;
  savedLine = '';
}

userInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!history.length) return;
    if (histIdx === -1) { savedLine = userInput.value; histIdx = history.length - 1; }
    else if (histIdx > 0) histIdx--;
    userInput.value = history[histIdx];
    moveCursorToEnd();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (histIdx === -1) return;
    histIdx++;
    userInput.value = histIdx < history.length ? history[histIdx] : savedLine;
    if (histIdx >= history.length) histIdx = -1;
    moveCursorToEnd();
  }
});

function moveCursorToEnd() {
  const len = userInput.value.length;
  userInput.setSelectionRange(len, len);
}

// ── Rendering ────────────────────────────────────────────────────────────

function print(text, cls = 'narrative') {
  if (text === '') { appendLine('', 'blank'); return; }
  for (const line of String(text).split('\n')) {
    appendLine(line, line === '' ? 'blank' : cls);
  }
  scrollBottom();
}

function appendLine(text, cls) {
  const el = document.createElement('div');
  el.className = 'line ' + cls;
  el.textContent = text;
  output.appendChild(el);
}

function printHr() {
  appendLine('─'.repeat(72), 'hr');
  scrollBottom();
}

function printReply(text) {
  const lines = String(text).split('\n');
  for (const line of lines) {
    const cls = line.startsWith('DISPATCH:') ? 'dispatch' : 'narrative';
    appendLine(line, cls);
  }
  scrollBottom();
}

function printRoll(roll) {
  if (!roll || roll.no_roll) return;
  if (roll.multi_roll) {
    const parts = roll.rolls.map(r => `d20=${r.roll} vs DC ${r.dc} → ${r.outcome}`);
    print(`[ROLL: ${roll.procedure_id} — ${parts.join(' | ')}]`, 'roll');
  } else {
    print(`[ROLL: ${roll.procedure_id} — d20=${roll.roll} vs DC ${roll.dc} → ${roll.outcome}]`, 'roll');
  }
}

function scrollBottom() {
  output.scrollTop = output.scrollHeight;
}

// ── API helpers ──────────────────────────────────────────────────────────

function authHeaders() {
  const token = localStorage.getItem('ems_token');
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = 'Bearer ' + token;
  return h;
}

async function apiPost(path, body) {
  const res  = await fetch(path, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.message || `HTTP ${res.status}`), { code: data.error });
  return data;
}

async function apiGet(path) {
  const res  = await fetch(path, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

// ── Access code UI ───────────────────────────────────────────────────────

// Pre-populate from localStorage on load
if (localStorage.getItem('ems_token')) {
  accessInput.value = localStorage.getItem('ems_token');
}

async function applyAccessCode() {
  const code = accessInput.value.trim();
  if (code) {
    localStorage.setItem('ems_token', code);
  } else {
    localStorage.removeItem('ems_token');
  }
  await refreshStatus();
}

accessApply.addEventListener('click', applyAccessCode);
accessInput.addEventListener('keydown', e => { if (e.key === 'Enter') applyAccessCode(); });

// ── Status check ─────────────────────────────────────────────────────────

async function refreshStatus() {
  try {
    const s = await apiGet('/api/scenario/status');
    if (s.tier === 'paid') {
      tierMsg.textContent = '✓ Beta access active — unlimited scenarios';
      tierMsg.classList.add('active');
    } else if (s.scenarios_remaining !== null) {
      tierMsg.textContent =
        s.scenarios_remaining > 0
          ? `Free tier — ${s.scenarios_remaining} of ${s.free_daily_limit} scenarios remaining today`
          : `Free tier — daily limit reached`;
      tierMsg.classList.remove('active');
    }
  } catch (_) { /* ignore */ }
}

refreshStatus();

// ── Start scenario ────────────────────────────────────────────────────────

startBtn.addEventListener('click', startScenario);

async function startScenario() {
  const difficulty    = document.getElementById('cfg-difficulty').value;
  const provider_level = document.getElementById('cfg-provider').value;
  const region_id     = document.getElementById('cfg-region').value;

  startBtn.disabled = true;
  startBtn.textContent = 'CONNECTING...';

  try {
    const data = await apiPost('/api/scenario/new', { difficulty, provider_level, region_id });

    sessionId      = data.session_id;
    isClosed       = false;
    waitingDebrief = false;
    localTranscript = {
      meta: {
        scenario_id:    data.scenario_id,
        category:       data.category,
        difficulty:     data.difficulty,
        provider_level: data.provider_level,
        region:         data.region,
        patient:        data.patient || null,
      },
      turns:      [],
      debriefText: null,
    };
    output.innerHTML = '';

    // Update header badges
    badgeTier.textContent = data.tier === 'paid' ? 'PAID' : 'FREE';
    if (data.tier === 'paid') badgeTier.classList.add('paid'); else badgeTier.classList.remove('paid');
    badgeDiff.textContent = data.difficulty;
    badgeProv.textContent = data.provider_level;
    badgeRgn.textContent  = data.region || region_id;

    endBtn.disabled = false;

    // Start scene clock
    clearInterval(clockInterval);
    scenarioStartTime = Date.now();
    sceneClock.textContent = 'T+0:00';
    sceneClock.className   = 'active';
    clockInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - scenarioStartTime) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      sceneClock.textContent = `T+${m}:${String(s).padStart(2, '0')}`;
    }, 1000);

    // Switch to terminal
    startScreen.style.display = 'none';
    terminal.style.display    = 'flex';

    print(`Scenario ID: ${data.scenario_id}`, 'system');
    print('TIP: Use an action verb when ordering meds or procedures — "give morphine," "push TXA," "hang dopamine," "intubate." That triggers the dice roll.', 'system');
    print('');
    printHr();
    // Show dispatch flash before the text appears
    if (/DISPATCH:/i.test(data.reply)) await animateDispatch();
    printReply(data.reply);
    printHr();
    for (const r of (data.rolls || [])) printRoll(r);

    // Crew card pops at scenario start
    if (data.crew) {
      populateCrewPanel(data.crew);
      showCrewPanel();
    }

    // Initial vitals (likely empty/sparse until equipment is placed)
    if (typeof data.scene_minute === 'number') currentSceneMinute = data.scene_minute;
    applyVitals(data.vitals || null);

    setLoading(false);
    userInput.focus();

    // Update tier msg for next visit to start screen
    if (data.tier === 'free' && data.scenarios_remaining !== null) {
      tierMsg.textContent =
        data.scenarios_remaining > 0
          ? `Free tier — ${data.scenarios_remaining} of ${data.free_daily_limit || 3} scenarios remaining today`
          : `Free tier — daily limit reached`;
    }

  } catch (err) {
    startBtn.disabled = false;
    startBtn.textContent = 'BEGIN SCENARIO';
    if (err.code === 'free_limit_reached') {
      tierMsg.textContent = `Daily limit reached (${err.message})`;
    } else {
      tierMsg.textContent = `Error: ${err.message}`;
    }
  }
}

// ── Send turn ────────────────────────────────────────────────────────────

async function sendTurn(msg) {
  if (!sessionId) return;

  addHistory(msg);
  print(`> ${msg}`, 'user');
  setLoading(true);

  // Post-close: waiting for y/n on debrief
  if (waitingDebrief) {
    if (msg.trim().toLowerCase().startsWith('y')) {
      waitingDebrief = false;
      print('[generating debrief...]', 'system');
      try {
        const data = await apiPost(`/api/scenario/${sessionId}/debrief`, {});
        if (localTranscript) localTranscript.debriefText = data.debrief;
        printHr();
        print(data.debrief, 'debrief');
        printHr();
      } catch (err) {
        print(`[Debrief error: ${err.message}]`, 'error');
      }
    } else {
      print('Scenario ended.', 'system');
    }
    showNewScenarioBtn();
    setLoading(false);
    setInputEnabled(false);
    return;
  }

  try {
    const data = await apiPost(`/api/scenario/${sessionId}/turn`, { message: msg });

    // Trigger decompensation pulse on the scene clock if the server says the patient is going south
    if (data.decompensating) sceneClock.classList.add('decompensating');

    // Animate each real single roll in sequence, then print all to the log
    for (const r of (data.rolls || [])) {
      if (!r.no_roll && !r.multi_roll) {
        const dc = Array.isArray(r.dc) ? r.dc[0] : r.dc;
        await animateDiceRoll(r.procedure_id, r.roll, dc, r.outcome);
        if (r.procedure_id === 'medication_push' && r.matched_drug) {
          showDrugPanel(r.matched_drug);
        }
      }
    }
    for (const r of (data.rolls || [])) printRoll(r);
    printHr();
    printReply(data.reply);
    printHr();

    // Vitals update on every turn
    if (typeof data.scene_minute === 'number') currentSceneMinute = data.scene_minute;
    applyVitals(data.vitals || null);

    // Save turn client-side for transcript export
    if (localTranscript) {
      localTranscript.turns.push({ user: msg, assistant: data.reply, rolls: data.rolls || [] });
    }

    if (data.closed) {
      isClosed       = true;
      waitingDebrief = true;
      endBtn.disabled = true;
      print('');
      print('Scenario closed. Want the full debrief?  (y / n)', 'system');
      showCrewPanel();   // re-surface crew at scenario end
      setLoading(false);
      return;
    }
  } catch (err) {
    print(`[Error: ${err.message}]`, 'error');
  }

  setLoading(false);
}

// ── End scenario button ───────────────────────────────────────────────────

endBtn.addEventListener('click', () => {
  if (isClosed || waitingDebrief) return;
  if (confirm('End this scenario now and proceed to debrief?')) {
    endCallAndDebrief();
  }
});

// Closes the scenario and immediately generates the debrief without a y/n prompt.
async function endCallAndDebrief() {
  if (!sessionId) return;
  endBtn.disabled = true;
  setLoading(true);

  print('> end scenario', 'user');
  addHistory('end scenario');

  try {
    // Step 1: close the scenario
    const turnData = await apiPost(`/api/scenario/${sessionId}/turn`, { message: 'end scenario' });

    for (const r of (turnData.rolls || [])) {
      if (!r.no_roll && !r.multi_roll) {
        const dc = Array.isArray(r.dc) ? r.dc[0] : r.dc;
        await animateDiceRoll(r.procedure_id, r.roll, dc, r.outcome);
        if (r.procedure_id === 'medication_push' && r.matched_drug) {
          showDrugPanel(r.matched_drug);
        }
      }
    }
    if (turnData.decompensating) sceneClock.classList.add('decompensating');

    for (const r of (turnData.rolls || [])) printRoll(r);
    printHr();
    printReply(turnData.reply);
    printHr();

    if (localTranscript) {
      localTranscript.turns.push({ user: 'end scenario', assistant: turnData.reply, rolls: turnData.rolls || [] });
    }

    // Step 2: auto-generate debrief
    isClosed = true;
    print('[generating debrief...]', 'system');
    const debriefData = await apiPost(`/api/scenario/${sessionId}/debrief`, {});
    if (localTranscript) localTranscript.debriefText = debriefData.debrief;
    printHr();
    print(debriefData.debrief, 'debrief');
    printHr();

  } catch (err) {
    print(`[Error: ${err.message}]`, 'error');
  }

  showNewScenarioBtn();
  setLoading(false);
  setInputEnabled(false);
}

// ── New scenario button (appears inline in output) ────────────────────────

function showNewScenarioBtn() {
  const wrap = document.createElement('div');
  wrap.className = 'end-actions';

  const newBtn = document.createElement('button');
  newBtn.className = 'new-scenario-btn';
  newBtn.textContent = '── NEW SCENARIO ──';
  newBtn.addEventListener('click', resetToStart);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'export-btn';
  exportBtn.textContent = 'EXPORT TRANSCRIPT';
  exportBtn.addEventListener('click', exportTranscript);

  wrap.appendChild(newBtn);
  wrap.appendChild(exportBtn);
  output.appendChild(wrap);
  scrollBottom();
}

function resetToStart() {
  sessionId       = null;
  isClosed        = false;
  waitingDebrief  = false;
  localTranscript = null;
  output.innerHTML = '';

  // Reset scene clock
  clearInterval(clockInterval);
  clockInterval     = null;
  scenarioStartTime = null;
  sceneClock.textContent = '';
  sceneClock.className   = '';
  hideDrugPanel();
  hideCrewPanel();
  resetVitals();

  terminal.style.display    = 'none';
  startScreen.style.display = 'flex';

  startBtn.disabled    = false;
  startBtn.textContent = 'BEGIN SCENARIO';
  setInputEnabled(true);
  setLoading(false);

  refreshStatus();
}

// ── Input controls ────────────────────────────────────────────────────────

function setLoading(loading) {
  sendBtn.disabled   = loading;
  userInput.disabled = loading;
  if (loading) {
    endBtn.disabled = true;                          // disable during any request
  } else if (!isClosed && !waitingDebrief) {
    endBtn.disabled = false;                         // re-enable when scenario is still active
  }
  sendBtn.textContent = loading ? '···' : 'SEND';
  if (!loading) userInput.focus();
}

function setInputEnabled(enabled) {
  sendBtn.disabled   = !enabled;
  userInput.disabled = !enabled;
}

// ── Event handlers ────────────────────────────────────────────────────────

sendBtn.addEventListener('click', () => {
  const msg = userInput.value.trim();
  if (!msg) return;
  userInput.value = '';
  sendTurn(msg);
});

userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const msg = userInput.value.trim();
    if (!msg) return;
    userInput.value = '';
    sendTurn(msg);
  }
});


// ── Dice roll animation ───────────────────────────────────────────────────────

const dispatchOverlay = document.getElementById('dispatch-overlay');
const diceOverlay     = document.getElementById('dice-overlay');
const sceneClock      = document.getElementById('scene-clock');
const drugPanel       = document.getElementById('drug-panel');
const drugPanelName   = document.getElementById('drug-panel-name');
const drugPanelBody   = document.getElementById('drug-panel-body');
const drugPanelClose  = document.getElementById('drug-panel-close');
const diceProcEl      = document.getElementById('dice-proc');
const diceSvgEl       = document.getElementById('dice-svg');
const diceNumberEl    = document.getElementById('dice-number');
const diceDCEl        = document.getElementById('dice-dc-label');
const diceOutcomeEl   = document.getElementById('dice-outcome-label');

// ── Drug reference panel ─────────────────────────────────────────────────────

/**
 * Populate and slide in the drug reference panel.
 * @param {string} matchedKey  roll.matched_drug from the server (lowercase synonym)
 */
function showDrugPanel(matchedKey) {
  const card = lookupDrug(matchedKey);
  if (!card) return;

  drugPanelName.textContent = card.name;
  drugPanel.dataset.drugClass = card.drugClass || 'other';
  drugPanelBody.innerHTML = '';

  // Dose rows
  for (const d of card.doses) {
    const row = document.createElement('div');
    row.className = 'drug-dose-row';

    const ind = document.createElement('div');
    ind.className = 'drug-indication';
    ind.textContent = d.indication;
    row.appendChild(ind);

    const dose = document.createElement('div');
    dose.className = 'drug-dose';
    dose.textContent = d.dose;
    row.appendChild(dose);

    const route = document.createElement('div');
    route.className = 'drug-route';
    route.textContent = d.route;
    row.appendChild(route);

    if (d.notes) {
      const notes = document.createElement('div');
      notes.className = 'drug-notes';
      notes.textContent = d.notes;
      row.appendChild(notes);
    }

    drugPanelBody.appendChild(row);
  }

  // Packaging line
  if (card.packaging) {
    const pkg = document.createElement('div');
    pkg.className = 'drug-packaging';
    pkg.textContent = card.packaging;
    drugPanelBody.appendChild(pkg);
  }

  drugPanel.classList.add('open');
}

function hideDrugPanel() {
  drugPanel.classList.remove('open');
}

drugPanelClose.addEventListener('click', hideDrugPanel);

// ── Crew reference panel ─────────────────────────────────────────────────────

const crewPanel       = document.getElementById('crew-panel');
const crewPanelBody   = document.getElementById('crew-panel-body');
const crewPanelClose  = document.getElementById('crew-panel-close');

const ROLE_LABEL = {
  partner:      'Partner — Paramedic',
  captain:      'Captain — Paramedic',
  partner_BLS:  'Partner — EMT-B',
  captain_BLS:  'Captain — EMT-B',
};

function buildCrewMemberCard(member) {
  const wrap = document.createElement('div');
  wrap.className = 'crew-member';

  const role = document.createElement('div');
  role.className = 'crew-role-tag';
  role.textContent = ROLE_LABEL[member.role] || member.role || 'Crew';
  wrap.appendChild(role);

  const name = document.createElement('div');
  name.className = 'crew-name';
  name.textContent = member.name;
  wrap.appendChild(name);

  // Stat grid: competency / enthusiasm / confrontation
  const grid = document.createElement('div');
  grid.className = 'crew-stats';
  const STATS = [
    ['Competency',    member.competency],
    ['Enthusiasm',    member.enthusiasm],
    ['Confrontation', member.confrontation],
  ];
  for (const [label, value] of STATS) {
    if (!value) continue;
    const l = document.createElement('span');
    l.className = 'crew-stat-label';
    l.textContent = label;
    grid.appendChild(l);
    const v = document.createElement('span');
    v.className = 'crew-stat-value ' + value;
    v.textContent = value;
    grid.appendChild(v);
  }
  wrap.appendChild(grid);

  if (member.personality_notes) {
    const lbl = document.createElement('div');
    lbl.className = 'crew-section-label';
    lbl.textContent = 'Personality';
    wrap.appendChild(lbl);
    const txt = document.createElement('div');
    txt.className = 'crew-notes';
    txt.textContent = member.personality_notes;
    wrap.appendChild(txt);
  }

  if (member.trigger_behaviors) {
    const lbl = document.createElement('div');
    lbl.className = 'crew-section-label';
    lbl.textContent = 'On-scene tendencies';
    wrap.appendChild(lbl);
    const txt = document.createElement('div');
    txt.className = 'crew-triggers';
    txt.textContent = member.trigger_behaviors;
    wrap.appendChild(txt);
  }

  return wrap;
}

let crewIsLoaded = false;

function populateCrewPanel(crew) {
  crewPanelBody.innerHTML = '';
  if (!crew) { crewIsLoaded = false; return; }

  if (crew.partner) crewPanelBody.appendChild(buildCrewMemberCard(crew.partner));
  if (crew.captain) crewPanelBody.appendChild(buildCrewMemberCard(crew.captain));

  crewIsLoaded = !!(crew.partner || crew.captain);
}

function showCrewPanel() {
  if (!crewIsLoaded) return;
  crewPanel.classList.add('open');
}

function hideCrewPanel() {
  crewPanel.classList.remove('open');
}

crewPanelClose.addEventListener('click', hideCrewPanel);

crewBtn.addEventListener('click', () => {
  if (!crewIsLoaded) return;
  if (crewPanel.classList.contains('open')) {
    hideCrewPanel();
  } else {
    showCrewPanel();
  }
});

/**
 * Show the incoming-dispatch overlay before the first reply prints.
 * Resolves after the animation completes so the caller can await it.
 */
function animateDispatch() {
  return new Promise(resolve => {
    const HOLD_MS = 1700;   // how long the overlay stays fully visible
    const FADE_MS = 200;    // must match CSS transition duration

    dispatchOverlay.classList.add('visible');

    setTimeout(() => {
      dispatchOverlay.classList.remove('visible');
      setTimeout(resolve, FADE_MS);
    }, HOLD_MS);
  });
}

/**
 * Show a d20 roll animation, resolve when the overlay has faded out.
 * @param {string} procedureId   e.g. 'peripheral_iv'
 * @param {number} roll          the actual d20 result (1-20)
 * @param {number|number[]} dc   DC value(s)
 * @param {string} outcome       'SUCCESS' | 'MARGINAL' | 'FAILURE' | 'COMPLICATION'
 */
function animateDiceRoll(procedureId, roll, dc, outcome) {
  return new Promise(resolve => {
    const CYCLE_MS   = 48;   // time per random number during cycling
    const CYCLES     = 13;   // how many random numbers flash before landing
    const HOLD_MS    = 550;  // how long to show the result before fading
    const FADE_MS    = 200;  // CSS transition duration (matches --transition in CSS)

    // Populate static labels
    diceProcEl.textContent    = procedureId.replace(/_/g, ' ').toUpperCase();
    const dcLabel = Array.isArray(dc) ? dc.join(' / ') : dc;
    diceDCEl.textContent      = `DC ${dcLabel}`;
    diceOutcomeEl.textContent = '';
    diceOutcomeEl.className   = '';
    diceNumberEl.textContent  = '?';
    diceSvgEl.setAttribute('class', '');

    // Show overlay + trigger spin animation
    diceOverlay.classList.add('visible');
    // Force reflow so animation restarts cleanly — offsetWidth is HTMLElement-only;
    // getBoundingClientRect() is defined on SVGElement and triggers layout.
    void diceSvgEl.getBoundingClientRect();
    diceSvgEl.classList.add('rolling');

    // Cycle through random numbers
    let count = 0;
    const ticker = setInterval(() => {
      count++;
      if (count < CYCLES) {
        diceNumberEl.textContent = Math.floor(Math.random() * 20) + 1;
      } else {
        clearInterval(ticker);
        // Land on the real result
        diceNumberEl.textContent = roll;
        diceSvgEl.setAttribute('class', outcome);   // colours the number via CSS

        // Reveal outcome label
        setTimeout(() => {
          diceOutcomeEl.textContent = outcome;
          diceOutcomeEl.className   = `visible ${outcome}`;

          // Hold, then fade out
          setTimeout(() => {
            diceOverlay.classList.remove('visible');
            setTimeout(() => {
              diceOutcomeEl.className   = '';
              diceSvgEl.setAttribute('class', '');
              diceNumberEl.textContent  = '?';
              resolve();
            }, FADE_MS);
          }, HOLD_MS);
        }, 80);
      }
    }, CYCLE_MS);
  });
}

// ── Magic 8-ball easter egg ───────────────────────────────────────────────

const EIGHT_BALL = [
  'IT IS CERTAIN', 'IT IS DECIDEDLY SO', 'WITHOUT A DOUBT',
  'YES DEFINITELY', 'YOU MAY RELY ON IT', 'AS I SEE IT, YES',
  'MOST LIKELY', 'OUTLOOK GOOD', 'YES', 'SIGNS POINT TO YES',
  'REPLY HAZY', 'ASK AGAIN LATER', 'BETTER NOT TELL YOU NOW',
  'CANNOT PREDICT NOW', 'CONCENTRATE AND ASK AGAIN',
  "DON'T COUNT ON IT", 'MY REPLY IS NO', 'MY SOURCES SAY NO',
  'OUTLOOK NOT SO GOOD', 'VERY DOUBTFUL',
];

const eightball         = document.getElementById('eightball');
const eightballResponse = document.getElementById('eightball-response');
let   eightballTimer    = null;

eightball.addEventListener('click', () => {
  eightball.classList.remove('shaking');
  void eightball.offsetWidth; // restart animation
  eightball.classList.add('shaking');

  eightballResponse.textContent = EIGHT_BALL[Math.floor(Math.random() * EIGHT_BALL.length)];
  eightballResponse.classList.add('visible');

  clearTimeout(eightballTimer);
  eightballTimer = setTimeout(() => eightballResponse.classList.remove('visible'), 3000);
});

eightball.addEventListener('animationend', () => eightball.classList.remove('shaking'));


// ── Export transcript ─────────────────────────────────────────────────────

function exportTranscript() {
  if (!localTranscript) return;
  const text = formatTranscript(localTranscript);
  const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadFile(`ems-transcript-${ts}.txt`, text);
}

function formatTranscript(t) {
  const { meta, turns, debriefText } = t;
  const lines = [];

  // ── Header ──────────────────────────────────────────────────────────────
  lines.push('EMS TERMINAL — SCENARIO TRANSCRIPT');
  lines.push('═'.repeat(60));
  lines.push('');
  if (meta) {
    lines.push(`Category:       ${(meta.category || '').toUpperCase()}`);
    lines.push(`Difficulty:     ${meta.difficulty || ''}`);
    lines.push(`Provider Level: ${meta.provider_level || ''}`);
    lines.push(`Region:         ${typeof meta.region === 'object' ? meta.region.name || '' : meta.region || ''}`);
    if (meta.patient) {
      const p = meta.patient;
      lines.push(`Patient:        ${p.age || ''}yo ${p.sex || ''}`);
      if (p.weight_kg) lines.push(`Weight:         ${p.weight_kg} kg`);
      if (p.chief_complaint) lines.push(`Chief Complaint: ${p.chief_complaint}`);
    }
    lines.push(`Generated:      ${new Date().toLocaleString()}`);
  }
  lines.push('');

  // ── Conversation ─────────────────────────────────────────────────────────
  lines.push('CONVERSATION');
  lines.push('─'.repeat(60));
  lines.push('');

  if (Array.isArray(turns)) {
    for (const turn of turns) {
      lines.push('> ' + (turn.user || '').split('\n').join('\n  '));
      lines.push('');
      if (turn.assistant) {
        lines.push(turn.assistant);
        lines.push('');
      }
    }
  }

  // ── Debrief ──────────────────────────────────────────────────────────────
  if (debriefText) {
    lines.push('DEBRIEF');
    lines.push('─'.repeat(60));
    lines.push('');
    lines.push(debriefText);
    lines.push('');
  }

  lines.push('─'.repeat(60));
  lines.push('Generated by EMS TERMINAL  |  onscenesim.com');

  return lines.join('\n');
}

function downloadFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Vitals monitor strip ─────────────────────────────────────────────────────

const vitalsBar       = document.getElementById('vitals-bar');
const vitalsPanel     = document.getElementById('vitals-panel');
const vitalsExpand    = document.getElementById('vitals-expand');

// All possible field names we render from the [VITALS:] tag
const VITAL_FIELDS = ['HR', 'BP', 'SpO2', 'ETCO2', 'RR', 'Rhythm', 'Temp', 'Glucose', 'GCS', 'Pain'];

// Episodic fields carry a measurement timestamp and get staleness coloring
const VITAL_EPISODIC = new Set(['BP', 'Temp', 'Glucose']);

let currentVitals      = null;   // last parsed vitals object from server
let currentSceneMinute = 0;      // most recent server scene_minute
let stalenessInterval  = null;

function formatVitalDisplay(name, raw) {
  // raw is either a primitive (HR/SpO2/etc.) or { value, t, tMin } for episodic
  const value = (raw && typeof raw === 'object' && 'value' in raw) ? raw.value : raw;
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function formatStamp(raw) {
  if (raw && typeof raw === 'object' && raw.t) return raw.t;
  return '';
}

function vitalAgeMin(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.tMin !== 'number') return null;
  return Math.max(0, currentSceneMinute - raw.tMin);
}

function stalenessClass(ageMin) {
  if (ageMin === null) return '';
  if (ageMin > 10) return 'vital-stale-bad';
  if (ageMin > 5)  return 'vital-stale-warn';
  return '';
}

/**
 * Update the bar + panel from a vitals object (or clear if null).
 */
function applyVitals(vitals) {
  currentVitals = vitals || {};

  for (const name of VITAL_FIELDS) {
    const raw = currentVitals[name];
    const display = formatVitalDisplay(name, raw);
    const els = document.querySelectorAll(`[data-vital="${name}"]`);
    for (const el of els) {
      el.textContent = display !== null ? display : '\u2014\u2014';
      // Strip prior staleness classes then re-apply if episodic
      el.classList.remove('vital-stale-warn', 'vital-stale-bad');
      if (display !== null && VITAL_EPISODIC.has(name)) {
        const cls = stalenessClass(vitalAgeMin(raw));
        if (cls) el.classList.add(cls);
      }
    }
    // Timestamp footnote (BP under the value, Temp/Glucose in the panel row)
    const stampEls = document.querySelectorAll(`[data-vital-stamp="${name}"]`);
    for (const sEl of stampEls) {
      sEl.textContent = display !== null ? formatStamp(raw) : '';
    }
  }
}

/**
 * Re-evaluate staleness without a server round-trip — driven by the scene clock.
 * BP age advances as real time advances; we approximate by bumping
 * currentSceneMinute alongside the scene-clock interval.
 */
function tickStaleness() {
  if (!currentVitals) return;
  // Drift the scene minute forward in real time (~1:1) so BP ages visibly between turns.
  if (scenarioStartTime) {
    const elapsedRealMin = (Date.now() - scenarioStartTime) / 60000;
    // Use whichever is larger — the server-reported scene minute, or real-time drift past it.
    currentSceneMinute = Math.max(currentSceneMinute, elapsedRealMin);
  }
  // Only re-apply colors; don't touch text content
  for (const name of VITAL_EPISODIC) {
    const raw = currentVitals[name];
    if (!raw) continue;
    const cls = stalenessClass(vitalAgeMin(raw));
    const els = document.querySelectorAll(`[data-vital="${name}"]`);
    for (const el of els) {
      el.classList.remove('vital-stale-warn', 'vital-stale-bad');
      if (cls) el.classList.add(cls);
    }
  }
}

function resetVitals() {
  currentVitals = null;
  currentSceneMinute = 0;
  for (const name of VITAL_FIELDS) {
    for (const el of document.querySelectorAll(`[data-vital="${name}"]`)) {
      el.textContent = '\u2014\u2014';
      el.classList.remove('vital-stale-warn', 'vital-stale-bad');
    }
    for (const sEl of document.querySelectorAll(`[data-vital-stamp="${name}"]`)) {
      sEl.textContent = '';
    }
  }
  vitalsPanel.classList.remove('open');
  vitalsExpand.classList.remove('open');
  vitalsPanel.setAttribute('aria-hidden', 'true');
}

vitalsExpand.addEventListener('click', () => {
  const willOpen = !vitalsPanel.classList.contains('open');
  vitalsPanel.classList.toggle('open', willOpen);
  vitalsExpand.classList.toggle('open', willOpen);
  vitalsPanel.setAttribute('aria-hidden', willOpen ? 'false' : 'true');
});

// Tick staleness every 5s while the page is alive
stalenessInterval = setInterval(tickStaleness, 5000);
