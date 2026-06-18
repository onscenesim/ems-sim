'use strict';

// ── DOM refs ────────────────────────────────────────────────────────────
// ── Audio ──────────────────────────────────────────────────────────────
// ── Sound effects ─────────────────────────────────────────────────────────────────────────
const SOUNDS = {
  defib_outside: new Audio('/sounds/Defiboutsideambulance.m4a'),
  defib_amb:     new Audio('/sounds/Defibinambulance.m4a'),
  fail:     new Audio('/sounds/Diceroll_fail.m4a'),
  success:  new Audio('/sounds/Diceroll_success.m4a'),
  io:       new Audio('/sounds/IODrillSoundEffect.m4a'),
  kitopen:  new Audio('/sounds/KitOpen.m4a'),
  lucas:    new Audio('/sounds/LUCAS.m4a'),
  lifepak:  new Audio('/sounds/LifepakStartup.m4a'),
  radio:    new Audio('/sounds/RadioCrackle.m4a'),
  surgical:         new Audio('/sounds/SurgicalIncision.m4a'),
  dispatch:         new Audio('/sounds/incident_assigned.m4a'),
  bvm_fail:         new Audio('/sounds/BVM_fail.m4a'),
  bvm_success:      new Audio('/sounds/BVM_success.m4a'),
  cpr_amb:          new Audio('/sounds/CPR_ambulance.m4a'),
  cpr_outside:      new Audio('/sounds/CPR_outside.m4a'),
  cpr_bls_amb:      new Audio('/sounds/CPR_bls_ambulance.m4a'),
  cpr_bls_outside:  new Audio('/sounds/CPR_bls_outside.m4a'),
  thump:            new Audio('/sounds/PrecordialThumpSuccess.m4a'),
  // Regional dispatch tones
  dispatch_dense:   new Audio('/sounds/DenseUrba.m4a'),
  dispatch_sprawl:  new Audio('/sounds/UrbanSprawl.m4a'),
  dispatch_sub:     new Audio('/sounds/Suburban.m4a'),
  dispatch_rural:   new Audio('/sounds/Rural.m4a'),
  dispatch_ca:      new Audio('/sounds/California.m4a'),
  dispatch_intl:    new Audio('/sounds/International.m4a'),
  // California base-hospital hold music
  base_contact:     new Audio('/sounds/CaliforniaElevatorMusic.m4a'),
  // Placeholder slots — drop in audio files to activate:
  backup_arrive:    new Audio('/sounds/BackupFINAL.m4a'),
  sfx_loading_als:  new Audio('/sounds/ALSStretcher.m4a'),
  sfx_loading_bls:  new Audio('/sounds/BLSStretcher.m4a'),
  sfx_depart:       new Audio('/sounds/AmbulanceDeparting.m4a'),
};
Object.values(SOUNDS).forEach(a => { if (a) a.preload = 'auto'; });

// Nearest-hospital transit time by region (minutes, midpoint of documented range)
const REGION_TRANSPORT_MIN = {
  URBAN_DENSE:              7.5,  // 5-10 min
  URBAN_SPRAWL:             15,   // 10-20 min
  SUBURBAN:                 12.5, // 10-15 min
  RURAL_TEMPERATE:          40,   // 30-50 min
  RURAL_REMOTE:             90,   // 60-120 min
  NORTHERN_URBAN:           15,   // 10-20 min
  TROPICAL_ISLAND:          27.5, // 15-40 min
  INTERNATIONAL_DEVELOPING: 60,   // 30-90 min
  CALIFORNIA_Urban:         11.5, // 8-15 min
};
function getDispatchSound(regionId) {
  const map = {
    URBAN_DENSE:              'dispatch_dense',
    URBAN_SPRAWL:             'dispatch_sprawl',
    SUBURBAN:                 'dispatch_sub',
    NORTHERN_URBAN:           'dispatch_sub',
    RURAL_TEMPERATE:          'dispatch_rural',
    RURAL_REMOTE:             'dispatch_rural',
    CALIFORNIA_Urban:         'dispatch_ca',
    TROPICAL_ISLAND:          'dispatch_ca',
    INTERNATIONAL_DEVELOPING: 'dispatch_intl',
  };
  return map[regionId] || 'dispatch';
}

function playSound(name) {
  if (!soundEnabled) return;
  if (document.hidden) return;   // don't queue sounds while backgrounded — iOS flushes on return
  const s = SOUNDS[name];
  if (s === undefined) { console.warn('[sound] unknown:', name); return; }
  if (s === null) return;  // known slot — file not yet assigned
  console.log('[sound] playing:', name);
  s.muted = false;  // ensure not silenced from unlock phase
  s.currentTime = 0;
  s.play().catch(err => console.warn('[sound] play error:', name, err.message));
}
function playDefibSound() { playSound('defib'); } // legacy wrapper
const SURGICAL_PROCS = new Set(['cricothyrotomy', 'needle_decompression',
  'finger_thoracostomy', 'resuscitative_thoracotomy', 'perimortem_csection']);
// Subset that triggers the scalpel animation — excludes NCD (needle decompression)
const SCALPEL_PROCS = new Set(['cricothyrotomy', 'finger_thoracostomy',
  'resuscitative_thoracotomy', 'perimortem_csection']);
// Triggers the laryngoscope animation with pass/fail outcome
const LARYNGOSCOPE_PROCS = new Set(['intubation', 'rsi']);
// Triggers the defib/cardioversion animation
const DEFIB_PROCS = new Set(['defibrillation', 'cardioversion']);
const THUMP_PROCS  = new Set(['precordial_thump']);
function getProcedureSound(id, outcome) {
  if (id === 'defibrillation' || id === 'cardioversion')
    return window._isMoving ? 'defib_amb' : 'defib_outside';
  if (id === 'io_access') return 'io';
  if (id === 'lucas') return (outcome === 'SUCCESS' || outcome === 'MARGINAL') ? 'lucas' : 'fail';
  if (id === 'precordial_thump') return (outcome === 'SUCCESS' || outcome === 'MARGINAL') ? 'thump' : 'fail';
  if (SURGICAL_PROCS.has(id)) return 'surgical';
  if (id === 'bvm') return (outcome === 'SUCCESS' || outcome === 'MARGINAL') ? 'bvm_success' : 'bvm_fail';
  if (id === 'cpr') {
    const bls = localTranscript?.meta?.provider_level === 'BLS';
    return window._isMoving
      ? (bls ? 'cpr_bls_amb'     : 'cpr_amb')
      : (bls ? 'cpr_bls_outside' : 'cpr_outside');
  }
  return (outcome === 'SUCCESS' || outcome === 'MARGINAL') ? 'success' : 'fail';
}

// ── Mobile audio unlock ─────────────────────────────────────────────────────
// iOS Safari blocks programmatic audio until a user gesture has played each
// Audio element once. Silently play+pause every sound on the first interaction.
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  // iOS requires every HTMLAudioElement to be .play()'d during a user gesture.
  // We mute them first, then immediately pause+reset in .then() so each element
  // ends up in a clean "paused at 0, unlocked" state for future non-gesture calls.
  // Guard: if playSound() already grabbed the element (s.muted === false), skip the
  // pause so we don't clobber a real sound that's already playing.
  Object.values(SOUNDS).forEach(s => {
    if (!s) return;
    s.muted = true;
    const p = s.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        if (s.muted) { s.pause(); s.currentTime = 0; s.muted = false; }
      }).catch(() => { s.muted = false; });
    }
  });
}
// touchend (not touchstart) avoids the iOS native <select> picker false-trigger.
document.addEventListener('click',    unlockAudio);
document.addEventListener('touchend', unlockAudio);

// Stop all sounds when the page is backgrounded so iOS doesn't queue pending
// play() calls and flush them all when the user tabs back in.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    Object.values(SOUNDS).forEach(s => {
      if (s && !s.paused) { s.pause(); s.currentTime = 0; }
    });
  }
});


const startScreen  = document.getElementById('start-screen');
const terminal     = document.getElementById('terminal');
const output       = document.getElementById('output');
const userInput    = document.getElementById('user-input');
const sendBtn      = document.getElementById('send-btn');
const startBtn      = document.getElementById('start-btn');
// Apply saved theme immediately — before any rendering
if (localStorage.getItem('ems_theme') === 'light') document.body.classList.add('light-mode');

const soundToggleBtn = document.getElementById('sound-toggle');
const reportBtn    = document.getElementById('report-btn');
const skipBtn      = document.getElementById('skip-btn');
const crewBtn      = document.getElementById('crew-btn');
const tierMsg      = document.getElementById('tier-msg');
const accessInput  = document.getElementById('access-code');
const accessApply  = document.getElementById('access-apply');

const badgeUnit    = document.getElementById('badge-unit');
const unitNameInput = document.getElementById('cfg-unit-name');
const splashEl     = document.getElementById('splash');

// ── State ────────────────────────────────────────────────────────────────

let sessionId       = null;
let isClosed        = false;
let waitingDebrief  = false;
let hasPlayedLoading      = false;
let hasPlayedDepart       = false;
let arrivedAtHospital     = false;   // true after a skip-to-hospital/bay arrives — button becomes END
let prevBackupStatus  = null;   // tracks last backup status for arrival sound
let firstVitalsPlayed = false;
let soundEnabled      = localStorage.getItem('ems_sound') !== 'off';
let lightMode         = localStorage.getItem('ems_theme') === 'light';
let reportMode        = false;  // true = next send is a report, skips dice
let localTranscript = null;   // built client-side so export never hits the server
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

// Matches: Name: "dialogue" — speaker name up to 30 chars, colon, space, opening quote
const DIALOGUE_RE = /^[A-Z][A-Za-z\s\-']{0,28}:\s*"/;

function printReply(text) {
  const lines = String(text).split('\n');
  for (const line of lines) {
    let cls = 'narrative';
    if (line.startsWith('DISPATCH:')) cls = 'dispatch';
    else if (DIALOGUE_RE.test(line)) cls = 'dialogue';
    appendLine(line, cls);
  }
  scrollBottom();
}

function printRoll(roll) {
  if (!roll || roll.no_roll) return;
  const disSuffix = roll.disadvantage ? ' (dis)' : '';
  function fmtRoll(r) {
    if (r.both_rolls && r.both_rolls.length === 2) {
      return `d20=${r.both_rolls[0]}↓${r.both_rolls[1]}=${r.roll} vs DC ${r.dc} → ${r.outcome}`;
    }
    return `d20=${r.roll} vs DC ${r.dc} → ${r.outcome}`;
  }
  if (roll.multi_roll) {
    const parts = roll.rolls.map(r => fmtRoll(r));
    print(`[ROLL: ${roll.procedure_id}${disSuffix} — ${parts.join(' | ')}]`, 'roll');
  } else {
    const both = roll.both_rolls;
    const rollStr = (both && both.length === 2)
      ? `d20=${both[0]}↓${both[1]}=${roll.roll}`
      : `d20=${roll.roll}`;
    print(`[ROLL: ${roll.procedure_id}${disSuffix} — ${rollStr} vs DC ${roll.dc} → ${roll.outcome}]`, 'roll');
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

// Tracks the AbortController for the current in-flight turn or debrief request.
// Allows the user to cancel a stuck request via the STOP button.
let currentAbortController = null;

async function apiPost(path, body, signal = null) {
  const res  = await fetch(path, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body), signal });
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

// ── Unit name (custom medic identifier) ──────────────────────────────────────

const DEFAULT_UNIT_NAME = 'Medic 1';
const savedUnit = localStorage.getItem('ems_unit_name');
if (savedUnit) unitNameInput.value = savedUnit;

// Persist on every change so the user never has to retype
unitNameInput.addEventListener('input', () => {
  const v = unitNameInput.value.trim();
  if (v) localStorage.setItem('ems_unit_name', v);
  else localStorage.removeItem('ems_unit_name');
});

function getUnitName() {
  return (unitNameInput.value.trim() || DEFAULT_UNIT_NAME);
}

// -- Partner selection -------------------------------------------------------
const partnerSelect  = document.getElementById('cfg-partner');
const providerSelect = document.getElementById('cfg-provider');

const ALS_PARTNERS = [
  'Marcus Webb', 'Destiny Okafor', 'Ray Kowalski', 'Priya Nair', 'Darnell Hughes',
  'Brianna Solis', 'Tyler Beaumont', 'Amara Diallo', 'Jorge Medina', 'Quinn Abernathy'
];
const BLS_PARTNERS = [
  'Danny Kowalczyk', 'Keisha Tremblay', 'Walt Garside', 'Fatima Al-Rashid', 'Bo Hendricks'
];

function rebuildPartnerOptions(providerLevel) {
  const saved = partnerSelect.value;
  const list = providerLevel === 'BLS' ? BLS_PARTNERS : [...ALS_PARTNERS, ...BLS_PARTNERS];
  // Clear all options except Random
  while (partnerSelect.options.length > 1) partnerSelect.remove(1);
  list.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    partnerSelect.appendChild(opt);
  });
  // Restore saved if still valid for this provider level
  if (list.includes(saved)) partnerSelect.value = saved;
  else partnerSelect.value = '';
}

const savedPartner = localStorage.getItem('ems_partner');
if (savedPartner) partnerSelect.value = savedPartner;

rebuildPartnerOptions(providerSelect.value);

providerSelect.addEventListener('change', () => {
  rebuildPartnerOptions(providerSelect.value);
  rebuildCaptainOptions(providerSelect.value);
});

partnerSelect.addEventListener('change', () => {
  const v = partnerSelect.value;
  if (v) localStorage.setItem('ems_partner', v);
  else localStorage.removeItem('ems_partner');
});

// -- Captain selection -------------------------------------------------------
const captainSelect = document.getElementById('cfg-captain');

const ALS_CAPTAINS = [
  'Captain Sandra Okonkwo', 'Captain Frank Delucci',
  'Captain Yolanda Ferris', 'Captain Dennis Holt'
];
const BLS_CAPTAINS = [
  'Captain Ruth Callahan', 'Captain Gord Beaulieu'
];

function rebuildCaptainOptions(providerLevel) {
  const saved = captainSelect.value;
  const list = providerLevel === 'BLS' ? BLS_CAPTAINS : [...ALS_CAPTAINS, ...BLS_CAPTAINS];
  while (captainSelect.options.length > 1) captainSelect.remove(1);
  list.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    captainSelect.appendChild(opt);
  });
  if (list.includes(saved)) captainSelect.value = saved;
  else captainSelect.value = '';
}

const savedCaptain = localStorage.getItem('ems_captain');
if (savedCaptain) captainSelect.value = savedCaptain;

rebuildCaptainOptions(providerSelect.value);

captainSelect.addEventListener('change', () => {
  const v = captainSelect.value;
  if (v) localStorage.setItem('ems_captain', v);
  else localStorage.removeItem('ems_captain');
});

// -- Tile descriptions -------------------------------------------------------
const TILE_DESCS = {
  difficulty: {
    'NORMAL':      "Realistic acuity. Mistakes have consequences.",
    'EASY':        "Stable patients. Forgiving margins. Good for learning.",
    'HARD':        "Complex presentations. Tight windows. No slack.",
    'BLACK_CLOUD': "Every call is your worst. Full crew. No breaks.",
  },
  provider: {
    'ALS': "Full paramedic scope — IVs, drips, advanced airway.",
    'BLS': "EMT-Basic scope. No IV meds. ALS as backup only.",
  },
  region: {
    'SUBURBAN':                "Mixed career/volunteer. Standard scope. ~12 min to hospital.",
    'URBAN_DENSE':             "Chicago, NYC. High volume, fast ALS, protocol-driven.",
    'URBAN_SPRAWL':            "Houston, Phoenix. Full scope. Longer transport.",
    'RURAL_TEMPERATE':         "Rural PA/Ontario. Long transport. Often BLS only.",
    'RURAL_REMOTE':            "Northern Alberta, Montana. Air medical. 60-120 min out.",
    'NORTHERN_URBAN':          "Winnipeg, Anchorage. Urban resources. Extreme cold.",
    'TROPICAL_ISLAND':         "Hawaii, Caribbean. Heat, humidity. Restricted ALS scope.",
    'CALIFORNIA_Urban':        "LA, SF. Heavy restrictions. Base contact required.",
    'INTERNATIONAL_DEVELOPING':"Rural Mexico/Central America. Resource-limited. Improvise.",
  },
  partner: {
    '':                "Drawn at random from the full roster.",
    'Marcus Webb':     "19-year medic. Technically flawless, completely checked out.",
    'Destiny Okafor':  "Second-year. Loves the job, reads journals for fun.",
    'Ray Kowalski':    "Eight years in. Competent and opinionated. Will argue.",
    'Priya Nair':      "Six months out. Eager, undertrained, confidently wrong.",
    'Darnell Hughes':  "Former 68-W. Calm under pressure. Expects competence.",
    'Brianna Solis':   "Twelve years in, three from retirement. Functional, disengaged.",
    'Tyler Beaumont':  "Mediocre skills, bad attitude. Does the minimum. Argues.",
    'Amara Diallo':    "Flight medic on ground rotation. Hard to be below.",
    'Jorge Medina':    "Clinically average, socially exceptional. Great with families.",
    'Quinn Abernathy': "Seven years. Reliable average. No opinions, no surprises.",
    'Danny Kowalczyk': "Eight-year EMT-B. Knows his scope cold. No apologies.",
    'Keisha Tremblay':  "Two years in, paramedic school nights. Occasionally oversteps.",
    'Walt Garside':    "Sixteen years. Fully checked out. Slow. Minimum effort.",
    'Fatima Al-Rashid':"Five years. Steady, drama-free. Speaks three languages.",
    'Bo Hendricks':    "Three years in, thinks he's the best. Argues corrections.",
  },
  captain: {
    '':                       "Drawn at random from the full roster.",
    'Captain Sandra Okonkwo': "24-year veteran. Hands-off, backs her crew publicly.",
    'Captain Frank Delucci':  "Old school. Thinks medicine peaked in 2003.",
    'Captain Yolanda Ferris': "Former flight medic. High standards, direct feedback.",
    'Captain Dennis Holt':    "Well-meaning, clinically dangerous. Never realizes it.",
    'Captain Ruth Callahan':  "22-year rural supervisor. Knows every road and family.",
    'Captain Gord Beaulieu':  "Volunteer captain, farmer by trade. Skeptical of everything.",
  },
};

function updateTileDesc(id, value) {
  const el = document.getElementById('desc-' + id);
  if (!el) return;
  const map = TILE_DESCS[id];
  el.textContent = map ? (map[value] ?? '') : '';
}

// Wire desc updates to all config selects
document.getElementById('cfg-difficulty').addEventListener('change', e => updateTileDesc('difficulty', e.target.value));
document.getElementById('cfg-region').addEventListener('change', e => updateTileDesc('region', e.target.value));
// Provider change: update provider desc + re-sync partner/captain descs after their lists rebuild
providerSelect.addEventListener('change', () => {
  updateTileDesc('provider', providerSelect.value);
  // rebuildPartner/CaptainOptions already fired in the earlier listener; re-read current values
  updateTileDesc('partner', partnerSelect.value);
  updateTileDesc('captain', captainSelect.value);
});
partnerSelect.addEventListener('change', () => updateTileDesc('partner', partnerSelect.value));
captainSelect.addEventListener('change', () => updateTileDesc('captain', captainSelect.value));

// Initial descriptions on page load
updateTileDesc('difficulty', document.getElementById('cfg-difficulty').value);
updateTileDesc('provider', providerSelect.value);
updateTileDesc('region', document.getElementById('cfg-region').value);
updateTileDesc('partner', partnerSelect.value);
updateTileDesc('captain', captainSelect.value);

// ── Splash text (Minecraft-style, random per page load) ─────────────────────

if (splashEl && typeof getRandomSplash === 'function') {
  splashEl.textContent = getRandomSplash();
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

// ── Sound toggle ─────────────────────────────────────��────────────────────
// ── Report mode toggle ──────────────────────────────────────────────────────
function updateReportBtn() {
  if (reportMode) {
    reportBtn.textContent = '\u25cf  REPORTING';
    reportBtn.classList.add('report-active');
    document.getElementById('input-row').classList.add('report-mode');
    userInput.placeholder = 'Give your radio report or handoff...';
  } else {
    reportBtn.textContent = 'REPORT';
    reportBtn.classList.remove('report-active');
    document.getElementById('input-row').classList.remove('report-mode');
    userInput.placeholder = 'Type your action or order...';
  }
}
reportBtn.addEventListener('click', () => {
  reportMode = !reportMode;
  updateReportBtn();
});
updateReportBtn();

function updateSoundToggle() {
  soundToggleBtn.textContent = soundEnabled ? '\u25cf  SOUND: ON' : '\u25cb  SOUND: OFF';
  soundToggleBtn.classList.toggle('sound-off', !soundEnabled);
}
soundToggleBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem('ems_sound', soundEnabled ? 'on' : 'off');
  updateSoundToggle();
  if (soundEnabled) playSound('radio'); // confirmation crackle on enable
});
updateSoundToggle();

// ── Theme (light / dark) toggle ──────────────────────────────────────────
const themeToggleHdr   = document.getElementById('theme-toggle-hdr');
const themeToggleStart = document.getElementById('theme-toggle-start');

function applyTheme() {
  const isLight = document.body.classList.contains('light-mode');
  const label = isLight ? '☽ DARK MODE' : '☀ LIGHT MODE';
  const hdrLabel = isLight ? '☽' : '☀';
  if (themeToggleHdr)   themeToggleHdr.textContent   = hdrLabel;
  if (themeToggleStart) themeToggleStart.textContent  = label;
}

function toggleTheme() {
  lightMode = !lightMode;
  document.body.classList.toggle('light-mode', lightMode);
  localStorage.setItem('ems_theme', lightMode ? 'light' : 'dark');
  applyTheme();
}

if (themeToggleHdr)   themeToggleHdr.addEventListener('click',   toggleTheme);
if (themeToggleStart) themeToggleStart.addEventListener('click', toggleTheme);
applyTheme();

refreshStatus();
checkResume();

// ── Start scenario ────────────────────────────────────────────────────────

startBtn.addEventListener('click', startScenario);

async function startScenario() {
  const difficulty    = document.getElementById('cfg-difficulty').value;
  const provider_level = document.getElementById('cfg-provider').value;
  const region_id     = document.getElementById('cfg-region').value;
  const unit_name     = getUnitName();

  startBtn.disabled = true;
  startBtn.textContent = 'CONNECTING...';

  try {
    const partner_name = partnerSelect ? (partnerSelect.value || null) : null;
    const captain_name = captainSelect ? (captainSelect.value || null) : null;
    const data = await apiPost('/api/scenario/new', { difficulty, provider_level, region_id, unit_name, partner_name, captain_name });

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
    badgeUnit.textContent = (data.unit_name || unit_name).toUpperCase();

    skipBtn.disabled = false;
    updateSkipBtn();

    scenarioStartTime = Date.now(); // for vitals staleness

    // Switch to terminal
    startScreen.style.display = 'none';
    terminal.style.display    = 'flex';

    playSound(getDispatchSound(data.region));
    print(`Scenario ID: ${data.scenario_id}`, 'system');
    print('TIPS FOR THIS SIMULATOR:', 'system');
    print('  \u2022 MEDS & PROCEDURES: Use an action verb to trigger a dice roll \u2014 "give morphine," "push TXA," "hang a dopamine drip," "intubate," "establish an IO." Passive phrasing may not register.', 'system');
    print('  \u2022 MOVING THE PATIENT: Say "move to the ambulance," "load the patient," or "take her to the rig" to package and load. No destination needed.', 'system');
    print('  \u2022 GOING EN ROUTE: Say "go en route to [hospital]" or "transport to [hospital]" to start driving. Your partner will not move the unit until you name a destination.', 'system');
    print('  • RADIO REPORTS: When giving a pre-arrival or handoff, use past tense for procedures already done — "we cardioverted," "patient was intubated" — so the system does not re-roll them.', 'system');
    print('  • SKIP AHEAD: When the active part of the call is over, use the » button to fast-forward — load the patient, transport, and arrive. No further treatment is applied during a skip. To end on scene (death, refusal), type "end scenario".', 'system');
    print('  • IF THE AI GETS STUCK: Click the STOP button to cancel the request and try again.', 'system');
    print('', 'system');
    printHr();
    // Show dispatch flash before the text appears
    if (/DISPATCH:/i.test(data.reply)) await animateDispatch();
    printReply(data.reply);
    printHr();
    for (const r of (data.rolls || [])) printRoll(r);

    // Patient card — starts in pending state
    patientDemoSource      = null;
    secondPatientConfirmed = false;
    if (data.patient) {
      populatePatientPanel(data.patient, data.scenario_id);
      patientBtn.style.display = '';
    }

    // Crew card pops at scenario start
    if (data.crew) {
      populateCrewPanel(data.crew);
      showCrewPanel();
      applyCrewStatus({
        partner: 'on_scene',
        captain: data.crew.captain ? 'on_scene' : 'not_on_scene',
      });
    }

    // Initial vitals (likely empty/sparse until equipment is placed)
    if (typeof data.scene_minute === 'number') {
      currentSceneMinute = data.scene_minute;
    }
    if (data.multi_patient) {
      setMultiPatientVitalsNotice(true);
    } else {
      setMultiPatientVitalsNotice(false);
      applyVitals(data.vitals || null);
    }
    applyBackupStatus(data.backup || { status: 'not_called', eta: null });
    if (data.crewStatus) applyCrewStatus(data.crewStatus);
    if (data.demo_source && !patientDemoSource) {
      patientDemoSource = data.demo_source;
      refreshPatientCard();
    }
    if (data.second_patient && !secondPatientConfirmed) {
      secondPatientConfirmed = true;
      refreshPatientCard();
    }

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

async function sendTurn(msg, opts = {}) {
  if (!sessionId) return;
  const skipMode = opts.skipMode || null;

  addHistory(msg);
  print(`> ${msg}`, 'user');
  setLoading(true);
  showLoadingDots();

  currentAbortController = new AbortController();
  try {
    // A time-skip is never also a radio report.
    const isReport = reportMode && !skipMode;
    if (reportMode) { reportMode = false; updateReportBtn(); }
    const data = await apiPost(`/api/scenario/${sessionId}/turn`, { message: msg, report_mode: isReport, skip_mode: skipMode }, currentAbortController.signal);

    // decompensating flag intentionally not shown to student — Claude fires it internally

    // Animate each real single roll in sequence, then print all to the log
    for (const r of (data.rolls || [])) {
      if (r.no_roll) continue;
      const procSound = getProcedureSound(r.procedure_id, r.outcome);
      console.log('[roll]', r.procedure_id, r.outcome, '→ sound:', procSound);
      if (r.multi_roll) {
        playSound(procSound);
        if (DEFIB_PROCS.has(r.procedure_id)) await animateDefib(r.procedure_id, r.outcome);
        continue;
      }
      playSound(procSound);
      const dc = Array.isArray(r.dc) ? r.dc[0] : r.dc;
      await animateDiceRoll(r.procedure_id, r.roll, dc, r.outcome);
      if (SCALPEL_PROCS.has(r.procedure_id)) await animateScalpel(r.procedure_id, r.outcome);
      if (LARYNGOSCOPE_PROCS.has(r.procedure_id)) await animateLaryngoscope(r.procedure_id, r.outcome);
      if (THUMP_PROCS.has(r.procedure_id) && (r.outcome === 'SUCCESS' || r.outcome === 'MARGINAL')) await animateThorsHammer(r.outcome);
      if (r.procedure_id === 'io_access') await animateDrill(r.outcome);
      if (r.procedure_id === 'cpr') await animateCPR(r.outcome);
      if (r.procedure_id === 'bvm') await animateBVM(r.outcome);
      if (r.procedure_id === 'lucas') await animateLUCAS(r.outcome);
      if (r.procedure_id === 'suction') await animateSuction(r.outcome);
      if (r.procedure_id === 'medication_push' && r.matched_drug) {
        showDrugPanel(r.matched_drug);
      }
    }
    for (const r of (data.rolls || [])) printRoll(r);
    printHr();

    // Contextual animations — server signals exactly when these events occur
    if (!hasPlayedLoading && data.loading) {
      hasPlayedLoading = true;
      const _isALS = localTranscript?.meta?.provider_level !== 'BLS';
      playSound(_isALS ? 'sfx_loading_als' : 'sfx_loading_bls');
      await animateLoading();
    }
    if (!hasPlayedDepart && data.departing) {
      hasPlayedDepart = true;
      window._isMoving = true; // ambulance en route — CPR sound switches
      playSound('sfx_depart');
      await animateDepart();
    }
    // A terminal skip (to the hospital / bay) has now arrived — the call isn't over
    // yet (handoff comes next), but the button should offer END from here on.
    if (skipMode === 'to_hospital' || skipMode === 'to_arrival') arrivedAtHospital = true;
    // Relabel the skip button to match the new transport phase.
    updateSkipBtn();

    // California base-hospital hold music
    // Fires on [BASE_CONTACT] tag OR if Claude narrates the words "elevator music" (tag fallback)
    if (data.baseContact || /elevator music/i.test(data.reply || '')) {
      const _bc = SOUNDS.base_contact;
      if (_bc && _bc.paused) {
        playSound('base_contact');
        setTimeout(() => { if (_bc) { _bc.pause(); _bc.currentTime = 0; } }, 7000);
      }
    }

    hideLoadingDots();
    // Radio crackle when the reply mentions the radio
    if (/\bradio\b/i.test(data.reply)) playSound('radio');
    printReply(data.reply);
    printHr();

    // Vitals update on every turn
    if (typeof data.scene_minute === 'number') {
      currentSceneMinute = data.scene_minute;
    }
    if (!vitalsBar.dataset.multiPatient) applyVitals(data.vitals || null);
    // Fire startup sound the first time the player asks for vitals,
    // or when CPR begins.
    if (!firstVitalsPlayed) {
      const askedForVitals = /\bvitals?\b/i.test(msg);
      const cprStarted     = (data.rolls || []).some(r => r.procedure_id === 'cpr' && !r.no_roll);
      if (askedForVitals || cprStarted) {
        firstVitalsPlayed = true;
        const monitorSound = localTranscript?.meta?.provider_level === 'BLS' ? 'kitopen' : 'lifepak';
        playSound(monitorSound);
        setTimeout(() => { const s = SOUNDS[monitorSound]; if (s) { s.pause(); s.currentTime = 0; } }, 4000);
      }
    }
    if (data.backup) applyBackupStatus(data.backup);
    if (data.crewStatus) applyCrewStatus(data.crewStatus);
    if (data.demo_source && !patientDemoSource) {
      patientDemoSource = data.demo_source;
      refreshPatientCard();
    }
    if (data.second_patient && !secondPatientConfirmed) {
      secondPatientConfirmed = true;
      refreshPatientCard();
    }

    // Save turn client-side for transcript export
    if (localTranscript) {
      localTranscript.turns.push({ user: msg, assistant: data.reply, rolls: data.rolls || [] });
    }

    if (data.closed) {
      isClosed = true;
      skipBtn.disabled = true;
      showCrewPanel();
      showDebriefCTA();
      setLoading(false);
      currentAbortController = null;
      return;
    }
  } catch (err) {
    hideLoadingDots();
    if (err.name === 'AbortError') {
      print('[Cancelled by user. The server may still finish the request in the background — if you re-send, your previous message may also have been processed.]', 'system');
    } else {
      print(`[Error: ${err.message}]`, 'error');
    }
  } finally {
    currentAbortController = null;
  }

  setLoading(false);
}

// ── End scenario button ───────────────────────────────────────────────────

// ── Sign-off animation — plays when debrief generation starts ────────────────

function showSignoffAnimation() {
  let overlay = document.getElementById('signoff-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'signoff-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div id="signoff-header">TRANSMISSION ENDED</div>
      <svg id="signoff-svg" viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg">
        <line x1="26" y1="83" x2="74" y2="83" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="26" y1="83" x2="50" y2="54" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="74" y1="83" x2="50" y2="54" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="50" y1="54" x2="50" y2="36" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="41" y1="47" x2="59" y2="47" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="50" y1="36" x2="50" y2="31" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="50" cy="29" r="2.5" fill="currentColor"/>
        <path class="signoff-arc signoff-arc-3" d="M 23,29 A 27,27 0 0,1 77,29"/>
        <path class="signoff-arc signoff-arc-2" d="M 32,29 A 18,18 0 0,1 68,29"/>
        <path class="signoff-arc signoff-arc-1" d="M 40,29 A 10,10 0 0,1 60,29"/>
      </svg>
      <div id="signoff-label">CLEAR</div>`;
    document.body.appendChild(overlay);
  }
  overlay.classList.remove('fade-out');
  overlay.classList.add('visible');
  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.classList.remove('visible', 'fade-out'), 350);
  }, 2200);
}

// ── Debrief CTA — injected into output when scenario closes naturally ────────

function showDebriefCTA() {
  const cta = document.createElement('div');
  cta.className = 'debrief-cta';
  cta.id = 'debrief-cta';

  const btn = document.createElement('button');
  btn.id = 'gen-debrief-btn';
  btn.textContent = 'GENERATE DEBRIEF';

  const hint = document.createElement('span');
  hint.className = 'debrief-cta-hint';
  hint.textContent = 'Scenario complete. Run a full medical director debrief.';

  cta.appendChild(btn);
  cta.appendChild(hint);
  output.appendChild(cta);
  scrollBottom();

  btn.addEventListener('click', async () => {
    showSignoffAnimation();
    btn.disabled = true;
    btn.textContent = 'generating...';
    hint.textContent = 'This takes a few seconds — reviewing the full call.';
    setLoading(true);
    currentAbortController = new AbortController();
    try {
      const data = await apiPost(`/api/scenario/${sessionId}/debrief`, {}, currentAbortController.signal);
      if (localTranscript) localTranscript.debriefText = data.debrief;
      cta.remove();
      printHr();
      print('Note: Debrief is experimental. Take what it says with a grain of salt.', 'system');
      print(data.debrief, 'debrief');
      printHr();
    } catch (err) {
      if (err.name === 'AbortError') {
        btn.disabled = false;
        btn.textContent = 'GENERATE DEBRIEF';
        hint.textContent = 'Cancelled. Click to try again.';
      } else {
        hint.textContent = `Error: ${err.message}`;
      }
    } finally {
      currentAbortController = null;
      setLoading(false);
    }
    showNewScenarioBtn();
    setInputEnabled(false);
  });
}

// ── Skip-ahead button (context-aware time-skip through transport) ───────────
// Replaces the old END button. Fast-forwards the tedious parts of a call with
// NO further player treatment. Phase is derived from the transport flags:
//   on scene (not loaded) → load the patient into the ambulance  (intermediate)
//   loaded, parked        → transport to hospital + arrive       (ends scenario)
//   en route              → skip remaining drive to the bay       (ends scenario)
// To end on scene (death, refusal, TOR) the student types a close phrase such
// as "end scenario" or "terminate resuscitation".
const SKIP_PHASES = {
  to_ambulance: {
    label: '» LOAD',
    title: 'Skip ahead — load the patient into the ambulance',
    userMsg: '[Skip ahead — load the patient]',
    confirmTitle: 'SKIP TO AMBULANCE?',
    confirmBody: 'The crew packages and loads the patient. No further treatment is rendered during the time skip.',
    confirmLabel: 'LOAD & SKIP',
  },
  to_hospital: {
    label: '» HOSP',
    title: 'Skip ahead — transport to the hospital and arrive at the bay',
    userMsg: '[Skip ahead — transport to the hospital]',
    confirmTitle: 'SKIP TO HOSPITAL?',
    confirmBody: 'The unit transports and arrives at the ED bay, where the team is ready for your handoff. No further treatment is rendered during the time skip — and you still give your report before ending.',
    confirmLabel: 'TRANSPORT & SKIP',
  },
  to_arrival: {
    label: '» BAY',
    title: 'Skip ahead — finish the drive and arrive at the bay',
    userMsg: '[Skip ahead — arrive at the hospital]',
    confirmTitle: 'SKIP TO BAY DOORS?',
    confirmBody: 'The unit finishes the drive and arrives at the ED bay, where the team is ready for your handoff. No further treatment is rendered during the time skip — and you still give your report before ending.',
    confirmLabel: 'SKIP TO BAY',
  },
  end: {
    label: 'END',
    title: 'End the call and generate the debrief',
    confirmTitle: 'END SCENARIO?',
    confirmBody: 'Close the call and run the debrief. Do this once you have given your handoff report.',
    confirmLabel: 'END & DEBRIEF',
  },
};

function currentSkipMode() {
  if (arrivedAtHospital) return 'end';
  if (!hasPlayedLoading) return 'to_ambulance';
  if (!hasPlayedDepart)  return 'to_hospital';
  return 'to_arrival';
}

function updateSkipBtn() {
  const phase = SKIP_PHASES[currentSkipMode()];
  skipBtn.textContent = phase.label;
  skipBtn.title       = phase.title;
}

skipBtn.addEventListener('click', () => {
  if (isClosed || skipBtn.disabled) return;
  const mode  = currentSkipMode();
  const phase = SKIP_PHASES[mode];
  showConfirm({
    title:        phase.confirmTitle,
    body:         phase.confirmBody,
    confirmLabel: phase.confirmLabel,
    onConfirm:    () => {
      if (mode === 'end') sendTurn('end scenario');   // closes server-side → debrief CTA
      else sendTurn(phase.userMsg, { skipMode: mode });
    },
  });
});

// ── Confirm dialog ──────────────────────────────────────────────────────────
function showConfirm({ title, body, confirmLabel, onConfirm }) {
  const existing = document.getElementById('confirm-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'confirm-overlay';
  overlay.className = 'confirm-overlay';

  const box = document.createElement('div');
  box.className = 'confirm-box';

  const h = document.createElement('div');
  h.className = 'confirm-title';
  h.textContent = title;

  const p = document.createElement('div');
  p.className = 'confirm-body';
  p.textContent = body;

  const row = document.createElement('div');
  row.className = 'confirm-actions';

  const cancel = document.createElement('button');
  cancel.className = 'confirm-cancel';
  cancel.textContent = 'CANCEL';

  const ok = document.createElement('button');
  ok.className = 'confirm-ok';
  ok.textContent = confirmLabel || 'CONFIRM';

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => {
    if (e.key === 'Escape') { close(); }
    else if (e.key === 'Enter') { close(); onConfirm(); }
  };

  cancel.addEventListener('click', close);
  ok.addEventListener('click', () => { close(); onConfirm(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);

  row.appendChild(cancel);
  row.appendChild(ok);
  box.appendChild(h);
  box.appendChild(p);
  box.appendChild(row);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  ok.focus();
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
  hasPlayedLoading  = false;
  hasPlayedDepart   = false;
  arrivedAtHospital = false;
  updateSkipBtn();
  prevBackupStatus  = null;
  firstVitalsPlayed = false;
  localTranscript   = null;
  patientBtn.style.display  = 'none';
  patientDemoSource         = null;
  secondPatientConfirmed    = false;
  hidePatientPanel();
  patientPanelBody.innerHTML = '';
  output.innerHTML = '';

  scenarioStartTime = null;
  hideDrugPanel();
  hideCrewPanel();
  resetVitals();
  applyBackupStatus({ status: 'not_called', eta: null });
  resetCrewStatus();

  setHeaderCollapsed(false);
  terminal.style.display    = 'none';
  startScreen.style.display = 'flex';

  startBtn.disabled    = false;
  startBtn.textContent = 'BEGIN SCENARIO';
  setInputEnabled(true);
  setLoading(false);

  refreshStatus();
  checkResume();
}

// ── Input controls ────────────────────────────────────────────────────────

// ── Typing indicator (shows while waiting for AI response) ─────────────────
let loadingDotsEl = null;
function showLoadingDots() {
  hideLoadingDots();
  loadingDotsEl = document.createElement('div');
  loadingDotsEl.className = 'loading-dots';
  loadingDotsEl.innerHTML = '<span></span><span></span><span></span>';
  output.appendChild(loadingDotsEl);
  scrollBottom();
}
function hideLoadingDots() {
  if (loadingDotsEl) { loadingDotsEl.remove(); loadingDotsEl = null; }
}

function setLoading(loading) {
  // While loading, SEND morphs into STOP — clickable, aborts the in-flight request.
  // (Input stays disabled so the user can't queue a second send mid-flight.)
  sendBtn.disabled   = false;
  userInput.disabled = loading;
  const nibpCell = document.getElementById('nibp-cell');
  if (nibpCell) nibpCell.classList.toggle('nibp-loading', loading);
  if (loading) {
    skipBtn.disabled = true;                          // disable during any request
    sendBtn.textContent = 'STOP';
    sendBtn.classList.add('stop-mode');
  } else {
    if (!isClosed && !waitingDebrief) skipBtn.disabled = false;
    sendBtn.textContent = 'SEND';
    sendBtn.classList.remove('stop-mode');
  }
  if (!loading) userInput.focus();
}

function setInputEnabled(enabled) {
  sendBtn.disabled   = !enabled;
  userInput.disabled = !enabled;
}

// ── Transport progress bar ───────────────────────────────────────────────────
//

// ── Event handlers ────────────────────────────────────────────────────────

sendBtn.addEventListener('click', () => {
  // If a request is in flight, the SEND button is acting as STOP — abort it.
  if (currentAbortController) {
    currentAbortController.abort();
    return;
  }
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
// Queue of matched drug keys waiting to be displayed.
const drugCardQueue = [];

function renderDrugPanel(card) {
  drugPanelName.textContent = card.name;
  drugPanel.dataset.drugClass = card.drugClass || 'other';
  drugPanelBody.innerHTML = '';

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

  if (card.packaging) {
    const pkg = document.createElement('div');
    pkg.className = 'drug-packaging';
    pkg.textContent = card.packaging;
    drugPanelBody.appendChild(pkg);
  }

  // Show queue depth indicator when more cards are waiting
  const badge = drugPanel.querySelector('.drug-queue-badge') || (() => {
    const b = document.createElement('div');
    b.className = 'drug-queue-badge';
    drugPanel.appendChild(b);
    return b;
  })();
  if (drugCardQueue.length > 0) {
    badge.textContent = `+${drugCardQueue.length} more`;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }

  drugPanel.classList.add('open');
}

function showDrugPanel(matchedKey) {
  const card = lookupDrug(matchedKey);
  if (!card) return;
  if (drugPanel.classList.contains('open')) {
    // Panel already showing — queue this one for after close
    drugCardQueue.push(card);
  } else {
    renderDrugPanel(card);
  }
}

function hideDrugPanel() {
  drugPanel.classList.remove('open');
  if (drugCardQueue.length > 0) {
    // Small delay so the panel visibly closes before the next one opens
    setTimeout(() => renderDrugPanel(drugCardQueue.shift()), 220);
  }
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

  // Status badge (live-updated by applyCrewStatus)
  const statusBadge = document.createElement('div');
  const roleKey = (member.role && member.role.startsWith('captain')) ? 'captain' : 'partner';
  statusBadge.id = 'crew-card-status-' + roleKey;
  statusBadge.className = 'crew-status-badge crew-status-on-scene';
  statusBadge.textContent = '● ON SCENE';
  wrap.appendChild(statusBadge);

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
    hidePatientPanel();
    showCrewPanel();
  }
});

// ── Patient card panel ──────────────────────────────────────────────────────

const patientPanel      = document.getElementById('patient-panel');
const patientPanelBody  = document.getElementById('patient-panel-body');
const patientPanelClose = document.getElementById('patient-panel-close');
const patientBtn        = document.getElementById('patient-btn');

const COMORBIDITY_LABELS = {
  compensated_cardiac_history: 'Cardiac Hx — HTN, hyperlipidemia, prior MI',
  metabolic_syndrome:          'Metabolic syndrome — T2DM, HTN, obesity',
  chronic_respiratory:         'Chronic respiratory — COPD, home O₂',
  anticoagulated:              'Anticoagulated — A-fib, warfarin / DOAC',
  renal_failure:               'ESRD on hemodialysis',
  polysubstance:               'Polysubstance use disorder',
  immunocompromised:           'Immunocompromised',
  pediatric_complex:           'Pediatric complex medical history',
  frail_elderly:               'Frail elderly — polypharmacy, dementia possible',
  otherwise_healthy:           'No significant PMH',
};

// demoSource = null means pending; string = who obtained demographics
let patientDemoSource      = null;
let secondPatientConfirmed = false;

function buildPatientCard(patient, scenarioId) {
  const wrap = document.createElement('div');
  wrap.className = 'pcr-card';

  const incNum = scenarioId ? scenarioId.slice(-6).toUpperCase() : '------';
  const today  = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
  const hdr = document.createElement('div');
  hdr.className = 'pcr-hdr';
  hdr.innerHTML =
    '<div class="pcr-agency">EMS Terminal</div>' +
    '<div class="pcr-title">Pre-Hospital Patient Record</div>' +
    '<div class="pcr-incident-row">' +
      '<span>INC ' + incNum + '</span>' +
      '<span>' + today + '</span>' +
    '</div>';
  wrap.appendChild(hdr);

  function rule() {
    const d = document.createElement('div');
    d.className = 'pcr-section-rule';
    wrap.appendChild(d);
  }

  function field(label, value, tall) {
    const row = document.createElement('div');
    row.className = tall ? 'pcr-field pcr-field-top' : 'pcr-field';
    const lbl = document.createElement('span');
    lbl.className = 'pcr-label';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.className = 'pcr-value';
    val.textContent = value;
    row.appendChild(lbl);
    row.appendChild(val);
    wrap.appendChild(row);
  }

  if (!patientDemoSource) {
    rule();
    const pending = document.createElement('div');
    pending.className = 'pcr-pending';
    pending.textContent = 'Demographics not yet obtained. Identify the patient or ask a crew member.';
    wrap.appendChild(pending);
  } else {
    rule();
    const nameParts = (patient.name || '').split(' ');
    const nameFormatted = nameParts.length >= 2
      ? nameParts.slice(1).join(' ').toUpperCase() + ', ' + nameParts[0]
      : (patient.name || '—');
    field('NAME', nameFormatted);
    field('AGE', patient.age ? patient.age + ' years' : '—');
    field('SEX', patient.sex === 'male' ? 'Male' : patient.sex === 'female' ? 'Female' : '—');

    rule();
    const pmh = COMORBIDITY_LABELS[patient.comorbidity] || patient.comorbidity || 'None documented';
    field('PMH', pmh, true);

    rule();
    const src = document.createElement('div');
    src.className = 'pcr-source';
    src.textContent = 'Courtesy of ' + patientDemoSource + '.';
    wrap.appendChild(src);
  }

  if (secondPatientConfirmed) {
    rule();
    const notice = document.createElement('div');
    notice.className = 'pcr-multi-notice';
    notice.textContent = '⚠️  MULTI-PATIENT INCIDENT — Additional patients documented in narrative only.';
    wrap.appendChild(notice);
  }

  return wrap;
}

function populatePatientPanel(patient, scenarioId) {
  patientPanelBody.innerHTML = '';
  if (!patient) return;
  patientPanelBody.appendChild(buildPatientCard(patient, scenarioId));
}

function refreshPatientCard() {
  const patient    = localTranscript && localTranscript.meta && localTranscript.meta.patient;
  const scenarioId = localTranscript && localTranscript.meta && localTranscript.meta.scenario_id;
  if (patient) populatePatientPanel(patient, scenarioId);
}
function showPatientPanel() {
  patientPanel.classList.add('open');
}

function hidePatientPanel() {
  patientPanel.classList.remove('open');
}

patientPanelClose.addEventListener('click', hidePatientPanel);

patientBtn.addEventListener('click', () => {
  if (patientPanel.classList.contains('open')) {
    hidePatientPanel();
  } else {
    hideCrewPanel();
    showPatientPanel();
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


function animateLoading() {
  return new Promise(resolve => {
    const HOLD_MS = 2600;
    const FADE_MS = 220;
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) { resolve(); return; }
    overlay.classList.add('visible');
    setTimeout(() => {
      overlay.classList.remove('visible');
      setTimeout(resolve, FADE_MS);
    }, HOLD_MS);
  });
}

function animateDrill(outcome) {
  return new Promise(resolve => {
    const HOLD_MS = 1800;
    const FADE_MS = 180;
    const overlay = document.getElementById('io-overlay');
    const label   = document.getElementById('io-label');
    if (!overlay) { resolve(); return; }
    label.textContent = outcome;
    overlay.className = '';
    void overlay.offsetWidth;
    overlay.classList.add('visible');
    if (outcome) overlay.classList.add(`outcome-${outcome}`);
    setTimeout(() => {
      overlay.classList.remove('visible');
      setTimeout(resolve, FADE_MS);
    }, HOLD_MS);
  });
}

function animateScalpel(procedureId, outcome) {
  return new Promise(resolve => {
    const HOLD_MS = 1150;
    const FADE_MS = 220;
    const overlay = document.getElementById('scalpel-overlay');
    const label   = document.getElementById('scalpel-label');
    if (!overlay) { resolve(); return; }
    label.textContent = procedureId.replace(/_/g, ' ').toUpperCase();
    // Force CSS animation restart on repeated calls
    overlay.className = '';
    void overlay.offsetWidth;
    overlay.classList.add('visible');
    if (outcome) overlay.classList.add(`outcome-${outcome}`);
    setTimeout(() => {
      overlay.classList.remove('visible');
      setTimeout(resolve, FADE_MS);
    }, HOLD_MS);
  });
}

function animateDefib(procedureId, outcome) {
  return new Promise(resolve => {
    const HOLD_MS = 1550;
    const FADE_MS = 220;
    const overlay = document.getElementById('defib-overlay');
    const header  = document.getElementById('defib-header');
    const label   = document.getElementById('defib-label');
    if (!overlay) { resolve(); return; }
    header.textContent = procedureId === 'cardioversion' ? 'CARDIOVERSION' : 'DEFIBRILLATION';
    label.textContent  = outcome;
    overlay.className = '';
    void overlay.offsetWidth;
    overlay.classList.add('visible', `outcome-${outcome}`);
    if (procedureId === 'cardioversion') overlay.classList.add('is-cardioversion');
    setTimeout(() => {
      overlay.classList.remove('visible');
      setTimeout(resolve, FADE_MS);
    }, HOLD_MS);
  });
}

function animateThorsHammer(outcome) {
  return new Promise(resolve => {
    const HOLD_MS = 1700;
    const FADE_MS = 220;
    const overlay = document.getElementById('thump-overlay');
    const label   = document.getElementById('thump-label');
    if (!overlay) { resolve(); return; }
    label.textContent = outcome;
    overlay.className = '';
    void overlay.offsetWidth;
    overlay.classList.add('visible');
    setTimeout(() => {
      overlay.classList.remove('visible');
      setTimeout(resolve, FADE_MS);
    }, HOLD_MS);
  });
}

function animateCPR(outcome) {
  return new Promise(resolve => {
    const HOLD_MS = 1650;
    const FADE_MS = 220;
    const overlay = document.getElementById('cpr-overlay');
    const label   = document.getElementById('cpr-label');
    if (!overlay) { resolve(); return; }
    label.textContent = outcome || '';
    overlay.className = '';
    void overlay.offsetWidth;
    overlay.classList.add('visible');
    if (outcome) overlay.classList.add(`outcome-${outcome}`);
    setTimeout(() => {
      overlay.classList.remove('visible');
      setTimeout(resolve, FADE_MS);
    }, HOLD_MS);
  });
}

function animateBVM(outcome) {
  return new Promise(resolve => {
    const HOLD_MS = 1500;
    const FADE_MS = 220;
    const overlay = document.getElementById('bvm-overlay');
    const label   = document.getElementById('bvm-label');
    if (!overlay) { resolve(); return; }
    label.textContent = outcome || '';
    overlay.className = '';
    void overlay.offsetWidth;
    overlay.classList.add('visible');
    if (outcome) overlay.classList.add(`outcome-${outcome}`);
    setTimeout(() => {
      overlay.classList.remove('visible');
      setTimeout(resolve, FADE_MS);
    }, HOLD_MS);
  });
}

function animateLUCAS(outcome) {
  return new Promise(resolve => {
    const HOLD_MS = 1900;
    const FADE_MS = 220;
    const overlay = document.getElementById('lucas-overlay');
    const label   = document.getElementById('lucas-label');
    if (!overlay) { resolve(); return; }
    label.textContent = outcome || '';
    overlay.className = '';
    void overlay.offsetWidth;
    overlay.classList.add('visible');
    if (outcome) overlay.classList.add(`outcome-${outcome}`);
    setTimeout(() => {
      overlay.classList.remove('visible');
      setTimeout(resolve, FADE_MS);
    }, HOLD_MS);
  });
}

function animateSuction(outcome) {
  return new Promise(resolve => {
    const HOLD_MS = 1600;
    const FADE_MS = 220;
    const overlay = document.getElementById('suction-overlay');
    const label   = document.getElementById('suction-label');
    if (!overlay) { resolve(); return; }
    label.textContent = outcome || '';
    overlay.className = '';
    void overlay.offsetWidth;
    overlay.classList.add('visible');
    if (outcome) overlay.classList.add(`outcome-${outcome}`);
    setTimeout(() => {
      overlay.classList.remove('visible');
      setTimeout(resolve, FADE_MS);
    }, HOLD_MS);
  });
}

function animateLaryngoscope(procedureId, outcome) {
  return new Promise(resolve => {
    const HOLD_MS = 1500;
    const FADE_MS = 220;
    const overlay = document.getElementById('laryngoscope-overlay');
    const header  = document.getElementById('laryngoscope-header');
    const label   = document.getElementById('laryngoscope-label');
    if (!overlay) { resolve(); return; }
    header.textContent = procedureId.replace(/_/g, ' ').toUpperCase();
    label.textContent  = outcome;
    // Reset all outcome classes and force animation restart
    overlay.className = '';
    void overlay.offsetWidth;
    overlay.classList.add('visible', `outcome-${outcome}`);
    setTimeout(() => {
      overlay.classList.remove('visible');
      setTimeout(resolve, FADE_MS);
    }, HOLD_MS);
  });
}

function animateDepart() {
  return new Promise(resolve => {
    const DRIVE_DELAY = 700;
    const DRIVE_MS    = 1100;
    const FADE_MS     = 250;
    let overlay = document.getElementById('depart-overlay');
    if (!overlay) { resolve(); return; }
    overlay.classList.add('visible');
    setTimeout(() => {
      overlay.classList.add('driving');
    }, DRIVE_DELAY);
    const total = DRIVE_DELAY + DRIVE_MS;
    setTimeout(() => {
      overlay.classList.remove('visible', 'driving');
      setTimeout(resolve, FADE_MS);
    }, total);
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


// ── Session resume ────────────────────────────────────────────────────────────

async function checkResume() {
  try {
    const data = await apiGet('/api/scenario/resume');
    updateResumeTile(data.session || null);
  } catch (_) {
    updateResumeTile(null);
  }
}

function updateResumeTile(snap) {
  const tile = document.getElementById('resume-tile');
  const body = document.getElementById('resume-tile-body');
  if (!tile || !body) return;

  if (!snap) {
    tile.classList.remove('resume-active');
    tile.onclick = null;
    body.textContent = '— NO RECENT RUN —';
    return;
  }

  const m = snap.meta || {};
  const minutesAgo = snap.savedAt ? Math.round((Date.now() - snap.savedAt) / 60000) : null;
  const timeLabel = minutesAgo !== null
    ? (minutesAgo < 2 ? 'just now' : minutesAgo < 60 ? `${minutesAgo}m ago` : `${Math.round(minutesAgo / 60)}h ago`)
    : '';
  const parts = [
    m.category       ? m.category.toUpperCase() : null,
    m.difficulty     || null,
    m.provider_level || null,
    snap.turns && snap.turns.length ? `${snap.turns.length} turns` : null,
    timeLabel        || null,
  ].filter(Boolean);

  body.textContent = parts.join(' · ');
  tile.classList.add('resume-active');
  tile.onclick = () => resumeFromSnapshot(snap);
}

async function resumeFromSnapshot(snap) {
  sessionId       = snap.session_id;
  isClosed        = snap.closed || false;
  waitingDebrief  = false;
  // Restore transport phase so the skip button reflects where the call left off.
  hasPlayedLoading = snap.hasLoaded || false;
  hasPlayedDepart  = snap.moving    || false;
  arrivedAtHospital = false;
  window._isMoving = hasPlayedDepart; // keeps CPR/defib transport sounds correct

  localTranscript = {
    meta:        snap.meta || {},
    turns:       (snap.turns || []).map(t => ({ user: t.user, assistant: t.assistant, rolls: t.rolls || [] })),
    debriefText: null,
  };

  output.innerHTML = '';

  const m = snap.meta || {};
  badgeUnit.textContent = (m.unit_name || 'Medic 1').toUpperCase();

  skipBtn.disabled = isClosed;
  updateSkipBtn();

  scenarioStartTime = Date.now() - (snap.sceneMinute || 0) * 60 * 1000;

  startScreen.style.display = 'none';
  terminal.style.display    = 'flex';

  print('[Session restored]', 'system');
  if (m.scenario_id) print(`Scenario ID: ${m.scenario_id}`, 'system');
  printHr();

  for (const turn of (snap.turns || [])) {
    print(`> ${turn.user}`, 'user');
    for (const r of (turn.rolls || [])) printRoll(r);
    if (turn.rolls && turn.rolls.length) printHr();
    printReply(turn.assistant);
    printHr();
  }

  if (snap.multi_patient) {
    setMultiPatientVitalsNotice(true);
  } else {
    setMultiPatientVitalsNotice(false);
    applyVitals(snap.lastVitals || null);
  }

  if (snap.crew) populateCrewPanel(snap.crew);

  if (snap.meta && snap.meta.patient) {
    patientDemoSource      = snap.demo_source   || null;
    secondPatientConfirmed = snap.second_patient || false;
    populatePatientPanel(snap.meta.patient, snap.meta.scenario_id);
    patientBtn.style.display = '';
  }

  if (isClosed) {
    setInputEnabled(false);
    showDebriefCTA();
  } else {
    setLoading(false);
    userInput.focus();
  }
}

// ── Vitals monitor strip ─────────────────────────────────────────────────────

const vitalsBar       = document.getElementById('vitals-bar');
const vitalsPanel     = document.getElementById('vitals-panel');
const vitalsExpand    = document.getElementById('vitals-expand');
const hdrCollapse     = document.getElementById('hdr-collapse');
const headerReveal    = document.getElementById('header-reveal');
const headerEl        = document.getElementById('header');

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
    // Mark BP cell as active (tappable) once first reading exists
    // Only update the state when BP is explicitly present in THIS vitals update —
    // if BP is absent from the update (Claude omitted it), keep whatever state we had.
    if (name === 'BP' && vitals && Object.prototype.hasOwnProperty.call(vitals, 'BP')) {
      const nibpCell = document.getElementById('nibp-cell');
      if (nibpCell) nibpCell.classList.toggle('nibp-active', display !== null);
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
 * currentSceneMinute as real time advances.
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

function applyBackupStatus(backup) {
  const badge = document.getElementById('badge-backup');
  if (!badge) return;
  if (!backup || !backup.status) return;
  // Play arrival sound on transition to on_scene
  if (backup.status === 'on_scene' && prevBackupStatus !== 'on_scene') {
    playSound('backup_arrive');
  }
  prevBackupStatus = backup.status;
  const labels = { called: 'BACKUP: CALLED', en_route: 'BACKUP: EN ROUTE', on_scene: 'BACKUP: ON SCENE', cancelled: 'BACKUP: CANCELLED', not_called: 'NO BACKUP EN ROUTE' };
  const label = labels[backup.status];
  if (!label) {
    badge.textContent = '';
    badge.style.display = 'none';
    return;
  }
  badge.textContent = backup.eta ? `${label} ~${backup.eta}m` : label;
  badge.style.display = '';
  badge.className = 'badge badge-backup badge-backup-' + backup.status.replace('_', '-');
}

// ── Crew status ──────────────────────────────────────────────────────────────
const CREW_STATUS_LABELS = {
  on_scene:     'On Scene',
  driving:      'Driving',
  in_back:      'In the Back',
  not_on_scene: 'Not on Scene',
  en_route:     'En Route',
  anonymous:    'Non-Roster Driver',
};
let currentCrewStatus = { partner: null, captain: null, driver: null };

function applyCrewStatus(status) {
  if (status) {
    if (status.partner != null) currentCrewStatus.partner = status.partner;
    if (status.captain != null) currentCrewStatus.captain = status.captain;
    if (status.driver  != null) currentCrewStatus.driver  = status.driver;
    // Clear anonymous driver once no longer driving
    if (status.driver === null && status.partner === 'driving') currentCrewStatus.driver = null;
  }
  for (const role of ['partner', 'captain']) {
    const val = currentCrewStatus[role];
    const label = CREW_STATUS_LABELS[val] || (val ? val.replace(/_/g, ' ') : '');
    const cssKey = val ? val.replace(/_/g, '-') : 'on-scene';
    // Header chip
    const chipEl = document.querySelector(`[data-crew-role="${role}"]`);
    if (chipEl) {
      if (val && val !== 'not_on_scene') {
        const prefix = role === 'partner' ? 'P: ' : 'C: ';
        chipEl.textContent = prefix + label.toUpperCase();
        chipEl.className = 'badge badge-crew badge-crew-' + cssKey;
        chipEl.style.display = '';
      } else {
        chipEl.style.display = 'none';
      }
    }
    // Crew-panel card badge
    const cardBadge = document.getElementById('crew-card-status-' + role);
    if (cardBadge) {
      cardBadge.textContent = '● ' + label.toUpperCase();
      cardBadge.className = 'crew-status-badge crew-status-' + cssKey;
    }
  }
  // Anonymous driver chip
  const driverChip = document.querySelector('[data-crew-role="driver"]');
  if (driverChip) {
    const driverVal = currentCrewStatus.driver;
    if (driverVal === 'anonymous') {
      driverChip.textContent = 'DRV: NON-ROSTER';
      driverChip.className = 'badge badge-crew badge-crew-driving';
      driverChip.style.display = '';
    } else {
      driverChip.style.display = 'none';
    }
  }
}

function resetCrewStatus() {
  currentCrewStatus = { partner: null, captain: null, driver: null };
  document.querySelectorAll('[data-crew-role]').forEach(el => { el.style.display = 'none'; });
  document.querySelectorAll('.crew-status-badge').forEach(el => {
    el.textContent = '';
    el.className = 'crew-status-badge';
  });
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
  const nibpCell = document.getElementById('nibp-cell');
  if (nibpCell) nibpCell.classList.remove('nibp-active', 'nibp-loading');
}

vitalsExpand.addEventListener('click', () => {
  const willOpen = !vitalsPanel.classList.contains('open');
  vitalsPanel.classList.toggle('open', willOpen);
  vitalsExpand.classList.toggle('open', willOpen);
  vitalsPanel.setAttribute('aria-hidden', willOpen ? 'false' : 'true');
});

// ── Mobile: fix iOS keyboard covering the input field ─────────────────────
// On iOS, opening the virtual keyboard shrinks the visual viewport but NOT
// the CSS viewport (100vh/dvh can lag or be unsupported). We use the
// visualViewport API to explicitly set the terminal height to the visible
// area, keeping the input row above the keyboard at all times.
// We also scroll the window back to 0,0 to prevent the header from being
// pushed off screen.
function adjustForViewport() {
  if (!terminal || terminal.style.display === 'none') return;
  const vvh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  terminal.style.height = vvh + 'px';
  window.scrollTo(0, 0);
}

function resetTerminalHeight() {
  if (terminal) terminal.style.height = '';
}

window.addEventListener('scroll', () => {
  if (terminal && terminal.style.display !== 'none') window.scrollTo(0, 0);
}, { passive: true });

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', adjustForViewport);
  window.visualViewport.addEventListener('scroll', adjustForViewport);
}

// ── Mobile: collapsible header ──────────────────────────────────────────
function setHeaderCollapsed(collapse) {
  if (!headerEl) return;
  headerEl.classList.toggle('hdr-collapsed', collapse);
  vitalsBar.classList.toggle('hdr-collapsed', collapse);
  if (headerReveal) headerReveal.classList.toggle('visible', collapse);
  if (hdrCollapse) {
    hdrCollapse.textContent = collapse ? '▼' : '▲';
    hdrCollapse.setAttribute('aria-label', collapse ? 'Show header' : 'Hide header');
    hdrCollapse.title = collapse ? 'Show header' : 'Hide header';
  }
}

if (hdrCollapse) {
  hdrCollapse.addEventListener('click', () => {
    setHeaderCollapsed(!headerEl.classList.contains('hdr-collapsed'));
  });
}
if (headerReveal) {
  headerReveal.addEventListener('click', () => setHeaderCollapsed(false));
}

document.addEventListener('click', e => {
  const cell = e.target && e.target.closest('#nibp-cell');
  if (cell && cell.classList.contains('nibp-active') && !cell.classList.contains('nibp-loading')) {
    if (!sessionId || isClosed) return;
    sendTurn('Cycle NIBP');
  }
});

function setMultiPatientVitalsNotice(active) {
  if (active) {
    vitalsBar.dataset.multiPatient = '1';
    vitalsBar.innerHTML = '<span id="multi-patient-notice">Multiple patients on scene — vitals unavailable</span>';
    vitalsExpand.style.display = 'none';
  } else {
    delete vitalsBar.dataset.multiPatient;
    vitalsExpand.style.display = '';
  }
}

// Tick staleness every 5s while the page is alive
stalenessInterval = setInterval(tickStaleness, 5000);
