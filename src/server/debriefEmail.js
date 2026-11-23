'use strict';

const { createHash } = require('node:crypto');

// Destination and credentials live only in private server configuration.
const MAX_MESSAGE_LENGTH = 5000;
const MAX_REPORT_BYTES = 10 * 1024 * 1024;

function emailError(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

function emailConfigured(env = process.env) {
  return !!(env.RESEND_API_KEY?.trim() && env.RESEND_FROM?.trim() && env.DEBRIEF_EMAIL_TO?.trim());
}

function reportFingerprint(message) {
  return createHash('sha256').update(message).digest('hex');
}

function debugReport(id, transcript) {
  const lines = ['EMS TERMINAL — DEBUG DEBRIEF', `Session: ${id}`, '',
    'DEVELOPER DEBRIEF', transcript.debriefText || '(No debrief recorded.)', '',
    'PATIENT OUTCOME', transcript.patientOutcome || '(No outcome recorded.)', '', 'CONVERSATION'];
  for (const turn of transcript.turns || []) {
    lines.push('', `T+${turn.sceneMinute ?? turn.scene_minute ?? '?'} min`,
      `YOU: ${turn.user || ''}`, `SCENE: ${turn.assistant || ''}`);
  }
  lines.push('', 'FULL DEBUG DATA — seed, prompts, messages, rolls, learning review, and render console',
    JSON.stringify(transcript, null, 2));
  return lines.join('\n');
}

async function sendDebriefEmail({ id, transcript, message }, { fetchImpl = fetch, env = process.env } = {}) {
  if (!emailConfigured(env)) {
    throw emailError('email_unavailable', 'Email reports are not available yet. You can still download the debug transcript.', 503);
  }
  const report = debugReport(id, transcript);
  if (Buffer.byteLength(report, 'utf8') > MAX_REPORT_BYTES) {
    throw emailError('report_too_large', 'This report is too large to email. Please download the debug transcript instead.', 413);
  }
  const payload = {
    from: env.RESEND_FROM.trim(),
    to: [env.DEBRIEF_EMAIL_TO.trim()],
    subject: `EMS Terminal debug debrief — ${id}`,
    text: `A player submitted a debug debrief.\n\nSession: ${id}\n\nPLAYER MESSAGE\n${message || '(No message provided.)'}\n\nThe full debug debrief is attached.`,
    attachments: [{ filename: `ems-debug-debrief-${id}.txt`, content: Buffer.from(report, 'utf8').toString('base64'), content_type: 'text/plain' }],
  };
  // Identical retries share a key; the body contains no changing timestamps.
  const key = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json', 'Idempotency-Key': `debrief/${key}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Email provider rejected the request.');
    const result = await response.json();
    if (typeof result.id !== 'string' || !result.id) throw new Error('Missing email receipt.');
    return { accepted: true };
  } catch {
    // Provider errors can include recipient addresses or account details.
    throw emailError('email_failed', 'Could not send the report. Please try again, or download the debug transcript.', 502);
  }
}

module.exports = { emailConfigured, sendDebriefEmail, debugReport, reportFingerprint, MAX_MESSAGE_LENGTH };
