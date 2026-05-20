'use strict';

// ── DOM refs ────────────────────────────────────────────────────────────

const startScreen  = document.getElementById('start-screen');
const terminal     = document.getElementById('terminal');
const output       = document.getElementById('output');
const userInput    = document.getElementById('user-input');
const sendBtn      = document.getElementById('send-btn');
const startBtn     = document.getElementById('start-btn');
const endBtn       = document.getElementById('end-btn');
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
      tierMsg.style.color = 'var(--green)';
    } else if (s.scenarios_remaining !== null) {
      tierMsg.textContent =
        s.scenarios_remaining > 0
          ? `Free tier — ${s.scenarios_remaining} of ${s.free_daily_limit} scenarios remaining today`
          : `Free tier — daily limit reached`;
      tierMsg.style.color = '';
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
    output.innerHTML = '';

    // Update header badges
    badgeTier.textContent = data.tier === 'paid' ? 'PAID' : 'FREE';
    if (data.tier === 'paid') badgeTier.classList.add('paid'); else badgeTier.classList.remove('paid');
    badgeDiff.textContent = data.difficulty;
    badgeProv.textContent = data.provider_level;
    badgeRgn.textContent  = data.region || region_id;

    endBtn.disabled = false;

    // Switch to terminal
    startScreen.style.display = 'none';
    terminal.style.display    = 'flex';

    print(`Scenario: ${data.category.toUpperCase()} — ${data.scenario_id}`, 'system');
    print('');
    printHr();
    printReply(data.reply);
    printHr();
    if (data.roll) printRoll(data.roll);

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

    if (data.roll) printRoll(data.roll);
    printHr();
    printReply(data.reply);
    printHr();

    if (data.closed) {
      isClosed       = true;
      waitingDebrief = true;
      endBtn.disabled = true;
      print('');
      print('Scenario closed. Want the full debrief?  (y / n)', 'system');
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
    sendTurn('end scenario');
  }
});

// ── New scenario button (appears inline in output) ────────────────────────

function showNewScenarioBtn() {
  const btn = document.createElement('button');
  btn.className = 'new-scenario-btn';
  btn.textContent = '── NEW SCENARIO ──';
  btn.addEventListener('click', resetToStart);
  output.appendChild(btn);
  scrollBottom();
}

function resetToStart() {
  sessionId      = null;
  isClosed       = false;
  waitingDebrief = false;
  output.innerHTML = '';

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
