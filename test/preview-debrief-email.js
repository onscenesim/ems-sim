'use strict';

// Uses the real UI/routes with a simulated provider. Never sends actual email.
process.env.PREVIEW_PORT ||= '3011';
process.env.RESEND_API_KEY = 'local-preview-placeholder';
process.env.RESEND_FROM = 'Preview <debug@example.com>';
process.env.DEBRIEF_EMAIL_TO = 'local-preview@example.com';
const email = require('../src/server/debriefEmail');
const send = email.sendDebriefEmail;
email.sendDebriefEmail = args => send(args, {
  fetchImpl: async (_url, request) => {
    const payload = JSON.parse(request.body);
    if (payload.text.includes('[preview-fail]')) return { ok: false };
    await new Promise(resolve => setTimeout(resolve, 800));
    console.log(`Preview captured report with ${payload.attachments.length} attachment; no email sent.`);
    return { ok: true, json: async () => ({ id: 'local-preview-receipt' }) };
  },
});
require('./preview-practice');
