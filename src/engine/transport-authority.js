'use strict';

const { roadNetwork, origin, travelSeconds, orderedDestination, hospitalArrival } = require('./transport');

function numericTimes(text) {
  const ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60 };
  return text.replace(/\b(twenty|thirty|forty|fifty|sixty)(?:[ -](one|two|three|four|five|six|seven|eight|nine))?\b/gi,
    (_m, ten, one) => String(tens[ten.toLowerCase()] + (one ? ones.indexOf(one.toLowerCase()) : 0)))
    .replace(new RegExp(`\\b(${ones.join('|')})\\b`, 'gi'), word => String(ones.indexOf(word.toLowerCase())));
}

function transportNarrationIssues(session, reply, { position = session.transportPosition,
  rerouteDest = null, elapsedMinutes = 0, blocked = false, arriving = false } = {}) {
  if (!session.transportDest || !position) return [];
  const issues = [];
  const prose = reply.replace(/\[[^\]]*\]/g, '');
  const network = roadNetwork(session.seed);
  const dest = rerouteDest || session.transportDest;
  if (session.incident?.id === 'er_divert' && blocked && !rerouteDest
      && prose.split(/[.!?\n]/).some(sentence => !/\b(?:not|never|cannot|can't|waiting|await|before|once|if|until)\b/i.test(sentence)
        && /\bshifts? into drive\b|\b(?:ambulance|rig|unit|medic\s*\d+)\b.{0,80}\b(?:departs?|redirects?|pulls? away|rolls?|heads?|eases?)\b/i.test(sentence))) {
    issues.push('The diversion has no acknowledged usable reroute. Keep the ambulance at its recorded position; do not narrate departure to the wrong or unavailable hospital.');
  }
  if (blocked && !rerouteDest && prose.split(/[.!?\n]/).some(sentence =>
    !/\b(?:no|not|cannot|can't|before|await|waiting|refus\w*|declin\w*)\b/i.test(sentence)
    && /\b(?:handoff (?:is )?complete|(?:accepts?|accepted|completes?|completed) (?:the )?(?:handoff|transfer of care)|(?:receiving|hospital|ed) team takes over|patient (?:is )?transferred (?:to|onto) (?:the )?(?:hospital|ed) bed)\b/i.test(sentence))) {
    issues.push('The receiving incident is unresolved. The crew retains care; do not narrate an accepted handoff or transfer to hospital care.');
  }
  if (rerouteDest && hospitalArrival(session.seed, reply)
      && elapsedMinutes * 60 + 1 < travelSeconds(network, position, rerouteDest)) {
    issues.push('A reroute starts at the recorded location. Depart for the alternate hospital; do not teleport there or complete its handoff this turn.');
  }
  // Check spoken travel estimates, including spelled-out numbers. The allowed
  // range covers travel during the turn and ordinary rounding, not new roads.
  const clauses = numericTimes(prose).split(/[.!?\n;]|,|\b(?:whereas|but)\b/i);
  for (const clause of clauses) {
    for (const match of clause.matchAll(/\b(\d+)(?:\s*(?:[-–—]|to|or)\s*(\d+))?\s*(?:minutes?|mins?)\b/gi)) {
      const before = clause.slice(0, match.index);
      const after = clause.slice(match.index + match[0].length);
      if (!/\bETA\b/i.test(before) && !/^\s*(?:out|away|from|to|until)\b/i.test(after)) continue;
      const named = orderedDestination(session.seed, before) || orderedDestination(session.seed, clause);
      const target = named || dest;
      if (!network.ground[target]) continue;
      const seconds = travelSeconds(network, position || origin(), target);
      const driven = !blocked && !rerouteDest && session.moving && target === session.transportDest
        ? Math.max(0, elapsedMinutes) * 60 : 0;
      const low = Number(match[1]) * 60;
      const high = Number(match[2] || match[1]) * 60;
      if (high < Math.max(0, seconds - driven) - 90 || low > seconds + 90) {
        issues.push(`The stated ETA contradicts CAD. ${target} is ${Math.ceil(seconds / 60)} minutes from the recorded position before this turn's driving. Use the supplied route times, including hospital-to-hospital backtracking.`);
      }
    }
  }
  if (blocked && !rerouteDest && !arriving && hospitalArrival(session.seed, reply)) {
    const target = orderedDestination(session.seed, prose);
    if (target && target !== session.transportDest) issues.push('The ambulance is still stopped at the recorded diversion location; an alternate journey has not been authorized and completed.');
  }
  return [...new Set(issues)];
}

module.exports = { transportNarrationIssues };
