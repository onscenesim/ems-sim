'use strict';

const express = require('express');
const router  = express.Router();
const { randomUUID } = require('node:crypto');

const { createSession, getSession, restoreSession, deleteSession } = require('../sessionStore');
const persistence = require('../persistence');
const { CREW } = require('../../data/crew');
const { REGIONS } = require('../../data/regions');
const { DIFFICULTY_POOL } = require('../../data/config');
const { PLAYER_SELECTABLE_CATEGORIES, isMultiPatientSeed } = require('../../engine/roller');
const { detectAllProcedures } = require('../../engine/dice');
const { LOAD_REQUEST_RE, LOAD_QUESTION_RE } = require('../../engine/session');

const { operationsFor } = require('../../engine/operations');
const { currentPlayer } = require('./auth');
const { recordScenarioStarted, recordScenarioCompleted, recordDebriefGenerated } = require('../playerStore');

const COOKIE_NAME = 'ems_sid';
const OWNER_COOKIE_NAME = 'ems_owner';
const COOKIE_MAX_AGE = 30 * 24 * 3600; // 30 days in seconds

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    if (part.slice(0, eq).trim() === name) {
      try { return decodeURIComponent(part.slice(eq + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

function cookieValue(name, value) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}${secure}`;
}

function setSessionCookies(res, id, ownerId) {
  res.setHeader('Set-Cookie', [
    cookieValue(COOKIE_NAME, id),
    cookieValue(OWNER_COOKIE_NAME, ownerId),
  ]);
}

function buildSnapshot(id, session, { userId, tier, meta, crew }) {
  return {
    id,
    debriefed: false,
    ownerId: session.ownerId,
    userId,
    playerId: session.playerId || null,
    completionCredited: session.completionCredited || false,
    debriefCredited: session.debriefCredited || false,
    tier,
    seed:        session.seed,
    messages:    session.messages,
    lastVitals:  session.lastVitals,
    sceneMinute: session.sceneMinute,
    closed:      session.closed,
    turns:       session.turns,
    hasLoaded:   session.hasLoaded,
    moving:      session.moving,
    arrivedAtHospital: session.arrivedAtHospital,
    backupStatus:        session.backupStatus,
    backupArrivalMinute: session.backupArrivalMinute,
    crewStatus:          session.crewStatus,
    transportEtaMin:     session.transportEtaMin,
    transportDest:       session.transportDest,
    departSceneMinute:   session.departSceneMinute,
    access:               session.access,
    contextFlags:         session.contextFlags,
    lastReplyHadTime:     session.lastReplyHadTime,
    demo_source:          session.demoSource,
    second_patient:       session.secondPatientFound,
    debriefText:          session.debriefText || null,
    operationResults:     operationsFor(session).snapshot(),
    meta,
    crew,
  };
}

function crewRecord(name) {
  if (!name) return null;
  return CREW.find(c => c.name === name) || null;
}

function validCrewSelection(name, role, providerLevel) {
  if (name === null) return true;
  const record = crewRecord(name);
  if (!record || !record.role.startsWith(role)) return false;
  return providerLevel !== 'BLS' || record.role === `${role}_BLS`;
}

function ownedSession(req, res) {
  let session = getSession(req.params.id);
  if (!session) {
    const snapshot = persistence.load(req.params.id);
    if (snapshot) session = restoreSession(snapshot);
  }
  if (!session) {
    res.status(404).json({ error: 'session_not_found', message: 'Session not found or expired.' });
    return null;
  }
  if (!session.ownerId || getCookie(req, OWNER_COOKIE_NAME) !== session.ownerId) {
    res.status(403).json({ error: 'session_forbidden', message: 'This session belongs to a different browser.' });
    return null;
  }
  return session;
}
const { getClientIP } = require('../middleware/authStub');

router.get('/status', (_req, res) => {
  res.json({ scenarios_remaining: null, free_daily_limit: null });
});

function validOperationId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(id);
}

function persistSession(id, session) {
  persistence.update(id, {
    seed: session.seed,
    ownerId: session.ownerId,
    messages: session.messages, lastVitals: session.lastVitals,
    sceneMinute: session.sceneMinute, closed: session.closed, turns: session.turns,
    hasLoaded: session.hasLoaded, moving: session.moving,
    arrivedAtHospital: session.arrivedAtHospital,
    demo_source: session.demoSource, second_patient: session.secondPatientFound,
    backupStatus: session.backupStatus, backupArrivalMinute: session.backupArrivalMinute,
    crewStatus: session.crewStatus, transportEtaMin: session.transportEtaMin,
    transportDest: session.transportDest, departSceneMinute: session.departSceneMinute,
    access: session.access, contextFlags: session.contextFlags,
    lastReplyHadTime: session.lastReplyHadTime,
    debriefText: session.debriefText || null,
    playerId: session.playerId || null,
    completionCredited: session.completionCredited || false,
    debriefCredited: session.debriefCredited || false,
    operationResults: operationsFor(session).snapshot(),
  });
}

function sendOperationError(res, err) {
  return res.status(err.status || 500).json({ error: err.code || 'api_error', message: err.message });
}

// STOP is acknowledged only after cancellation/rollback, or with the result if
// the operation committed first. It deliberately does not abort the browser's
// original fetch, so the UI can reconcile a completion racing with STOP.
router.post('/:id/operations/:operationId/cancel', async (req, res) => {
  const session = ownedSession(req, res);
  if (!session) return;
  if (!validOperationId(req.params.operationId)) return res.status(400).json({ error: 'invalid_operation_id' });
  const result = await operationsFor(session).cancel(req.params.operationId);
  persistSession(req.params.id, session);
  res.json(result);
});

// ---------------------------------------------------------------------------
// GET /api/scenario/resume
// Returns the saved session for the browser's ems_sid cookie, if any.
// ---------------------------------------------------------------------------
router.get('/resume', (req, res) => {
  const sid = getCookie(req, COOKIE_NAME);
  if (!sid) return res.json({ session: null });

  const snapshot = persistence.load(sid);
  if (!snapshot || snapshot.debriefed) return res.json({ session: null });

  // Migrate pre-owner snapshots on first resume. New snapshots require the
  // stable browser-owner cookie, which supports multiple active tabs without
  // turning the session ID itself into an authorization token.
  let ownerId = getCookie(req, OWNER_COOKIE_NAME);
  if (snapshot.ownerId) {
    if (ownerId !== snapshot.ownerId) return res.json({ session: null });
  } else {
    ownerId = ownerId && /^[a-zA-Z0-9_-]{16,80}$/.test(ownerId) ? ownerId : randomUUID();
    snapshot.ownerId = ownerId;
    persistence.update(sid, { ownerId });
  }
  setSessionCookies(res, sid, ownerId);

  // Restore in-memory session if server was restarted
  if (!getSession(sid)) restoreSession(snapshot);

  return res.json({
    session: {
      session_id:   sid,
      savedAt:      snapshot.savedAt     || null,
      meta:         snapshot.meta,
      crew:         snapshot.crew,
      tier:         snapshot.tier,
      turns:        snapshot.turns       || [],
      lastVitals:   snapshot.lastVitals  || null,
      sceneMinute:  snapshot.sceneMinute || 0,
      closed:       snapshot.closed      || false,
      debriefed:    snapshot.debriefed   || false,
      hasLoaded:    snapshot.hasLoaded   || false,
      moving:       snapshot.moving      || false,
      arrivedAtHospital: snapshot.arrivedAtHospital || false,
      multi_patient:  snapshot.meta ? (snapshot.meta.multi_patient || false) : false,
      demo_source:    snapshot.demo_source   || null,
      second_patient: snapshot.second_patient || false,
      backup:         snapshot.backupStatus  || null,
      crewStatus:     snapshot.crewStatus    || null,
      transportDest:  snapshot.transportDest || null,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/scenario/new
// Rolls a scenario, creates a session, fires the dispatch turn, returns it all.
// ---------------------------------------------------------------------------
router.post('/new', async (req, res) => {
  const tier = 'free';
  const ip   = getClientIP(req);
  const player = currentPlayer(req);
  const userId = player ? `player:${player.id}` : ip;

  const { difficulty = 'NORMAL', provider_level = 'ALS', region_id = 'SUBURBAN', unit_name, partner_name = null, captain_name = null, category = null } = req.body;

  if (!Object.hasOwn(DIFFICULTY_POOL, difficulty) || !['BLS', 'ALS'].includes(provider_level)
      || !REGIONS.some(r => r.id === region_id)
      || (category !== null && !PLAYER_SELECTABLE_CATEGORIES.has(category))
      || !validCrewSelection(partner_name, 'partner', provider_level)
      || !validCrewSelection(captain_name, 'captain', provider_level)) {
    return res.status(400).json({ error: 'invalid_config', message: 'Choose a valid difficulty, provider level, region, and category.' });
  }

  // Sanitize unit name — strip control chars, cap at 16, fall back to default.
  const cleanUnitName = (typeof unit_name === 'string'
    ? unit_name.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 16)
    : '') || 'Medic 1';

  let createdId = null;
  try {
    const existingOwner = getCookie(req, OWNER_COOKIE_NAME);
    const ownerId = existingOwner && /^[a-zA-Z0-9_-]{16,80}$/.test(existingOwner)
      ? existingOwner : randomUUID();
    const { id, seed } = createSession({ difficulty, provider_level, region_id, unit_name: cleanUnitName, partner_name: partner_name || null, captain_name: captain_name || null, category: category || null }, userId, tier);
    createdId = id;
    const session = getSession(id);
    session.ownerId = ownerId;
    session.playerId = player?.id || null;
    session.completionCredited = false;
    session.debriefCredited = false;

    // Fire the dispatch turn
    const result = await session.send('begin');

    const partnerRec = crewRecord(seed.crew_partner);
    const captainRec = crewRecord(seed.crew_captain);
    const multiPatient = isMultiPatientSeed(seed);

    // Persist session so it survives server restarts and tab closures
    setSessionCookies(res, id, ownerId);
    persistence.save(buildSnapshot(id, session, {
      userId,
      tier,
      meta: {
        scenario_id:    seed.scenario_id,
        category:       seed.category,
        difficulty:     seed.difficulty,
        provider_level: seed.provider_level,
        region:         seed.region,
        patient: {
          name:        seed.patient_name,
          age:         seed.patient_age,
          age_display: seed.patient_age_display || null,
          sex:         seed.sex,
          age_group:   seed.age_group,
          comorbidity: seed.comorbidity_bundle || null,
        },
        unit_name:      seed.unit_name,
        multi_patient:  multiPatient,
        hospitals:      seed.hospitals || null,
      },
      crew: { partner: partnerRec, captain: captainRec },
    }));
    if (player) recordScenarioStarted(player.id);

    return res.json({
      session_id:          id,
      scenario_id:         seed.scenario_id,
      category:            seed.category,
      difficulty:          seed.difficulty,
      provider_level:      seed.provider_level,
      region:              seed.region,
      hospitals:           seed.hospitals || null,
      patient: {
        name:        seed.patient_name,
        age:         seed.patient_age,
        age_display: seed.patient_age_display || null,
        sex:         seed.sex,
        age_group:   seed.age_group,
        comorbidity: seed.comorbidity_bundle || null,
      },
      unit_name:           seed.unit_name,
      crew: {
        partner: partnerRec,
        captain: captainRec,
      },
      tier,
      reply:               result.reply,
      rolls:               result.rolls || [],
      vitals:              result.vitals || null,
      backup:              result.backup     || null,
      crewStatus:          result.crewStatus || null,
      demo_source:         result.demoSource || null,
      second_patient:      result.secondPatient || false,
      scene_minute:        session.sceneMinute,
      closed:              result.closed,
      multi_patient:       multiPatient,
    });
  } catch (err) {
    if (createdId) deleteSession(createdId);
    console.error('[scenario/new]', err.message);
    return sendOperationError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/scenario/:id/turn
// ---------------------------------------------------------------------------
router.post('/:id/turn', async (req, res) => {
  const session = ownedSession(req, res);
  if (!session) return;

  const { message, report_mode, skip_mode, proc_allow, proc_deny, procs_resolved, operation_id } = req.body;
  if (!validOperationId(operation_id)) return res.status(400).json({ error: 'invalid_operation_id', message: 'A unique operation_id is required.' });
  if (!message || typeof message !== 'string' || !message.trim() || message.length > 8000) {
    return res.status(400).json({ error: 'invalid_input', message: '`message` must contain 1–8000 characters.' });
  }

  const VALID_SKIP_MODES = ['to_ambulance', 'to_hospital', 'to_arrival'];
  const skipMode = VALID_SKIP_MODES.includes(skip_mode) ? skip_mode : null;

  // Confirm-dice pre-check: EVERY detected dice-rolling skill bounces back for a
  // ✓/✗ before the turn runs — a fixed structural beat, so nothing rolls that the
  // player didn't mean. Routine no-roll actions (pulse check, O2, vitals) pass
  // through, as do pre-charge suppressions (deterministically not a shock).
  // No model call, no clock, no state change.
  if (!skipMode && report_mode !== true && procs_resolved !== true) {
    const msg = message.trim();
    const items = detectAllProcedures(msg)
      .filter(e => !e.proc.no_roll && !e.precharge)
      .map(e => ({
        key:          e.key,
        procedure_id: e.proc.id,
        matched:      e.matchedKey,
        reason:       e.reason,       // null = confident detection
        sentence:     e.sentence,
      }));
    // Loading the patient is a state-changing event worth the same ✓/✗ beat as a
    // dice skill: surface a LOAD PATIENT row whenever the wording orders the
    // patient into the rig and the unit isn't already loaded or moving. The key
    // 'load_patient|' round-trips through proc_allow/proc_deny like any other.
    if (LOAD_REQUEST_RE.test(msg) && !LOAD_QUESTION_RE.test(msg) && !session.hasLoaded && !session.moving) {
      items.push({
        key:          'load_patient|',
        procedure_id: 'load_patient',
        matched:      null,
        reason:       null,
        sentence:     (msg.match(LOAD_REQUEST_RE) || [''])[0],
      });
    }
    if (items.length > 0) return res.json({ needs_confirmation: items });
  }

  try {
    const wasClosed = session.closed;
    const payload = await operationsFor(session).run(operation_id, JSON.stringify({
      message: message.trim(), report_mode: report_mode === true, skipMode,
      proc_allow: proc_allow || [], proc_deny: proc_deny || [],
    }), async signal => {
      const result = await session.send(message.trim(), report_mode === true, skipMode, {
        allow: Array.isArray(proc_allow) ? proc_allow : [],
        deny:  Array.isArray(proc_deny)  ? proc_deny  : [],
      }, { signal });

      return {
        operation_id,
        reply:          result.reply,
        loading:        result.loading  || false,
        departing:          result.enRoute         || false,
        transport_eta_min:  result.transportEtaMin ?? null,
        transport_dest:     result.transportDest   || null,
        rolls:          result.rolls || [],
        suppressed:     result.suppressed || [],
        vitals:         result.vitals || null,
        baseContact:    result.baseContact || false,
        backup:         result.backup     || null,
        crewStatus:     result.crewStatus || null,
        demo_source:    result.demoSource   || null,
        second_patient: result.secondPatient || false,
        arrived:        result.arrived || false,
        closed:         result.closed,
        scene_minute:   session.sceneMinute,
        decompensating: session.seed.decompensation_clock !== null &&
                        session.sceneMinute >= session.seed.decompensation_clock,
      };
    });
    if (!wasClosed && session.closed && session.playerId && !session.completionCredited) {
      recordScenarioCompleted(session.playerId, session.seed);
      session.completionCredited = true;
    }
    persistSession(req.params.id, session);
    return res.json(payload);
  } catch (err) {
    console.error('[scenario/turn]', err.message);
    return sendOperationError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/scenario/:id/debrief
// ---------------------------------------------------------------------------
router.post('/:id/debrief', async (req, res) => {
  const session = ownedSession(req, res);
  if (!session) return;

  const { operation_id } = req.body;
  if (!validOperationId(operation_id)) return res.status(400).json({ error: 'invalid_operation_id', message: 'A unique operation_id is required.' });

  if (!session.closed) {
    return res.status(400).json({
      error: 'scenario_not_closed',
      message: 'Scenario is still active. Use "end scenario" or transfer of care first.',
    });
  }

  try {
    const payload = await operationsFor(session).run(operation_id, 'debrief', async signal => ({
      operation_id, debrief: await session.debrief({ signal }),
    }));
    if (session.playerId && !session.debriefCredited) {
      recordDebriefGenerated(session.playerId);
      session.debriefCredited = true;
    }
    persistSession(req.params.id, session);
    persistence.markDebriefed(req.params.id);
    return res.json(payload);
  } catch (err) {
    console.error('[scenario/debrief]', err.message);
    return sendOperationError(res, err);
  }
});


// ---------------------------------------------------------------------------
// GET /api/scenario/:id/transcript
// Returns the full session data (seed, messages, debrief) for export.
// ---------------------------------------------------------------------------
router.get('/:id/transcript', (req, res) => {
  const session = ownedSession(req, res);
  if (!session) return;
  return res.json(session.getTranscriptData());
});

module.exports = router;
