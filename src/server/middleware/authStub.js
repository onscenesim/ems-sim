'use strict';

// Use Express's configured proxy trust boundary, not a caller-controlled
// leftmost X-Forwarded-For value. There are no account tiers or daily caps.
function getClientIP(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

module.exports = { getClientIP };
