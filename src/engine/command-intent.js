'use strict';

// Commands, rather than mentions in questions, reports or quotations, authorize
// state changes. Keep offsets so a stop followed by a restart stays ordered.
function commandClauses(text) {
  const source = String(text).replace(/"[^"\n]*"|“[^”\n]*”/g, match => ' '.repeat(match.length));
  const result = [];
  let sentenceStart = 0;
  for (const end of [...source.matchAll(/[;!?\n]|\.(?!\d)/g), { index: source.length, 0: '' }]) {
    const chunk = source.slice(sentenceStart, end.index);
    const offset = sentenceStart;
    sentenceStart = end.index + end[0].length;
    const conditional = /\b(?:if|unless|consider|might|would|could|should|shall|maybe|perhaps|plan to|planning to|going to discuss)\b/i.test(chunk);
    let start = 0;
    const boundaries = /\b(?:and then|and|then|but|while|also)\b/gi;
    for (const boundary of [...chunk.matchAll(boundaries), { index: chunk.length, 0: '' }]) {
        const clause = chunk.slice(start, boundary.index).trim();
        const index = offset + start;
        if (clause && !conditional && end[0] !== '?'
            && !/\b(?:no|not|never|don'?t|won'?t|without|avoid|hold off|do not|yet|later)\b/i.test(clause)
            && !/\b(?:already|previously|earlier|we did|we were|I did|I was|had been|was given|were given|patient says|patient reports|asks?|discuss\w*|explain\w*|history of)\b/i.test(clause)
            && !/^\s*(?:what|why|when|where|how|is|are|was|were|did|does|do we|do I|have we)\b/i.test(clause)) {
          result.push({ text: clause, index });
        }
        start = boundary.index + boundary[0].length;
      }
  }
  return result;
}

function ordered(text, pattern) {
  return commandClauses(text).some(clause => pattern.test(clause.text));
}

const DEPARTURE = /\b(?:redirect|reroute|divert|switch|change|depart|drive|transport|take (?:him|her|them|the patient)|head|go|leave|roll)\b[^;.!?]{0,90}\b(?:hospital|er|ed|trauma|facility|nearest|major|center|centre)\b|\b(?:load and go|scoop and (?:run|go)|head out|head off|roll out|depart now|start transport|begin transport|resume (?:transport|driving)|continue driving|keep driving|start driving|pull back out)\b/i;
function departureOrdered(text) {
  // Preserve idioms whose conjunction is part of a single command.
  const commands = String(text).replace(/\b(load and go|scoop and (?:run|go))\b/gi,
    match => match.replace(/ and /i, ' & '));
  return ordered(commands, DEPARTURE) || ordered(commands, /\b(?:load & go|scoop & (?:run|go))\b/i)
    || ordered(commands, /^(?:please\s+)?(?:let'?s\s+)?(?:go|roll|depart|drive)(?:\s+now)?$/i);
}

module.exports = { commandClauses, ordered, departureOrdered };
