'use strict';

const express = require('express');
const router  = express.Router();

const { createSession, getSession, restoreSession } = require('../sessionStore');
const persistence = require('../persistence');
const { CREW } = require('../../data/crew');
const { detectAllProcedures } = require('../../engine/dice');

const COOKIE_NAME = 'ems_sid';
const COOKIE_MAX_AGE = 30 * 24 * 3600; // 30 days in seconds

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function setSessionCookie(res, id) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}`);
}

function buildSnapshot(id, session, { userId, tier, meta, crew }) {
  return {
    id,
    debriefed: false,
    userId,
    tier,
    seed:        session.seed,
    messages:    session.messages,
    lastVitals:  session.lastVitals,
    sceneMinute: session.sceneMinute,
    closed:      session.closed,
    turns:       session.turns,
    hasLoaded:   session.hasLoaded,
    moving:      session.moving,
    backupStatus:        session.backupStatus,
    backupArrivalMinute: session.backupArrivalMinute,
    crewStatus:          session.crewStatus,
    transportEtaMin:     session.transportEtaMin,
    departSceneMinute:   session.departSceneMinute,
    meta,
    crew,
  };
}

function crewRecord(name) {
  if (!name) return null;
  return CREW.find(c => c.name === name) || null;
}
const {
  detectTier,
  getClientIP,
  checkFreeLimit,
  incrementFreeUsage,
  getFreeUsageCount,
  FREE_DAILY_LIMIT,
} = require('../middleware/authStub');

// ---------------------------------------------------------------------------
// GET /api/scenario/status
// Returns the caller's tier and free usage count. Used to prime the start screen.
// ---------------------------------------------------------------------------
router.get('/status', (req, res) => {
  const tier = detectTier(req);
  const ip   = getClientIP(req);
  res.json({
    tier,
    scenarios_used:      tier === 'free' ? getFreeUsageCount(ip) : null,
    scenarios_remaining: tier === 'free' ? Math.max(0, FREE_DAILY_LIMIT - getFreeUsageCount(ip)) : null,
    free_daily_limit:    FREE_DAILY_LIMIT,
  });
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
  const tier = detectTier(req);
  const ip   = getClientIP(req);

  if (tier === 'free' && !checkFreeLimit(ip)) {
    return res.status(429).json({
      error: 'free_limit_reached',
      message: `You've reached today's limit of ${FREE_DAILY_LIMIT} scenarios. It resets tomorrow.`,
    });
  }

  if (tier === 'free') incrementFreeUsage(ip);

  const { difficulty = 'NORMAL', provider_level = 'ALS', region_id = 'SUBURBAN', unit_name, partner_name = null, captain_name = null, category = null } = req.body;

  // Sanitize unit name — strip control chars, cap at 16, fall back to default.
  const cleanUnitName = (typeof unit_name === 'string'
    ? unit_name.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 16)
    : '') || 'Medic 1';

  try {
    const { id, seed } = createSession({ difficulty, provider_level, region_id, unit_name: cleanUnitName, partner_name: partner_name || null, captain_name: captain_name || null, category: category || null }, ip, tier);
    const session = getSession(id);

    // Fire the dispatch turn
    const result = await session.send('begin');

    const partnerRec = crewRecord(seed.crew_partner);
    const captainRec = crewRecord(seed.crew_captain);
    const multiPatient = seed.special_flags ? /two_patients/i.test(seed.special_flags) : false;

    // Persist session so it survives server restarts and tab closures
    setSessionCookie(res, id);
    persistence.save(buildSnapshot(id, session, {
      userId: ip,
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
      scenarios_used:      tier === 'free' ? getFreeUsageCount(ip) : null,
      scenarios_remaining: tier === 'free' ? Math.max(0, FREE_DAILY_LIMIT - getFreeUsageCount(ip)) : null,
      reply:               result.reply,
      rolls:               result.rolls || [],
      vitals:              result.vitals || null,
      backup:              result.backup     || null,
      crewStatus:          result.crewStatus || null,
      scene_minute:        session.sceneMinute,
      closed:              result.closed,
      multi_patient:       multiPatient,
    });
  } catch (err) {
    console.error('[scenario/new]', err.message);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scenario/:id/turn
// ---------------------------------------------------------------------------
router.post('/:id/turn', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found', message: 'Session not found or expired (30 min timeout).' });
  }

  const { message, report_mode, skip_mode, proc_allow, proc_deny, procs_resolved } = req.body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'invalid_input', message: '`message` is required.' });
  }

  const VALID_SKIP_MODES = ['to_ambulance', 'to_hospital', 'to_arrival'];
  const skipMode = VALID_SKIP_MODES.includes(skip_mode) ? skip_mode : null;

  // Confirm-dice pre-check: EVERY detected dice-rolling skill bounces back for a
  // ✓/✗ before the turn runs — a fixed structural beat, so nothing rolls that the
  // player didn't mean. Routine no-roll actions (pulse check, O2, vitals) pass
  // through, as do pre-charge suppressions (deterministically not a shock).
  // No model call, no clock, no state change.
  if (!skipMode && report_mode !== true && procs_resolved !== true) {
    const pending = detectAllProcedures(message.trim()).filter(e => !e.proc.no_roll && !e.precharge);
    if (pending.length > 0) {
      return res.json({
        needs_confirmation: pending.map(e => ({
          key:          e.key,
          procedure_id: e.proc.id,
          matched:      e.matchedKey,
          reason:       e.reason,       // null = confident detection
          sentence:     e.sentence,
        })),
      });
    }
  }

  try {
    const result = await session.send(message.trim(), report_mode === true, skipMode, {
      allow: Array.isArray(proc_allow) ? proc_allow : [],
      deny:  Array.isArray(proc_deny)  ? proc_deny  : [],
    });

    // Update persisted snapshot after every turn
    persistence.update(req.params.id, {
      messages:          session.messages,
      lastVitals:        session.lastVitals,
      sceneMinute:       session.sceneMinute,
      closed:            session.closed,
      turns:             session.turns,
      hasLoaded:         session.hasLoaded,
      moving:            session.moving,
      arrivedAtHospital: session.arrivedAtHospital || false,
      demo_source:       session.demoSource       || null,
      second_patient:    session.secondPatientFound || false,
      backupStatus:        session.backupStatus        || null,
      backupArrivalMinute: session.backupArrivalMinute ?? null,
      crewStatus:          session.crewStatus          || null,
      transportEtaMin:     session.transportEtaMin     ?? null,
      transportDest:       session.transportDest       ?? null,
      departSceneMinute:   session.departSceneMinute   ?? null,
      access:              session.access              || [],
    });

    return res.json({
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
    });
  } catch (err) {
    console.error('[scenario/turn]', err.message);
    return res.status(500).json({ error: 'api_error', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scenario/:id/debrief
// ---------------------------------------------------------------------------
router.post('/:id/debrief', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found', message: 'Session not found or expired.' });
  }

  if (!session.closed) {
    return res.status(400).json({
      error: 'scenario_not_closed',
      message: 'Scenario is still active. Use "end scenario" or transfer of care first.',
    });
  }

  try {
    const debrief = await session.debrief();
    persistence.markDebriefed(req.params.id);
    return res.json({ debrief });
  } catch (err) {
    console.error('[scenario/debrief]', err.message);
    return res.status(500).json({ error: 'api_error', message: err.message });
  }
});


// ---------------------------------------------------------------------------
// GET /api/scenario/:id/transcript
// Returns the full session data (seed, messages, debrief) for export.
// ---------------------------------------------------------------------------
router.get('/:id/transcript', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found', message: 'Session not found or expired.' });
  }
  return res.json(session.getTranscriptData());
});

module.exports = router;
