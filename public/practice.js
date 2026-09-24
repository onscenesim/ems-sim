/* Shared by the live debrief and the saved call library. Text is never HTML. */
'use strict';
const PracticeUI = (() => {
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function moment(t) {
    const card = el('li', undefined, 'practice-moment');
    card.append(el('strong', `T+${t.minute ?? '?'} min · Turn ${t.turn} · ${t.patient}`), el('p', t.action));
    if (t.procedures.length) card.append(el('p', t.procedures.map(p => `${p.id.replaceAll('_', ' ')} (${p.patient}): ${p.outcome}`).join(' · ')));
    const observations = Object.entries(t.vitals).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
    card.append(el('small', observations.length ? observations.join(' · ') : 'No vitals recorded in this turn.'));
    return card;
  }
  function timeline(turns, label = 'Decision timeline') {
    const section = el('section', undefined, 'practice-timeline');
    section.append(el('h3', label));
    const list = el('ol');
    turns.forEach(t => list.append(moment(t)));
    if (!turns.length) section.append(el('p', 'No decisions recorded.'));
    section.append(list);
    return section;
  }
  function learning(data) {
    const section = el('section', undefined, 'practice-review');
    section.append(el('h2', 'Learning review'), el('p', data.notice, 'practice-note'));
    for (const finding of data.findings) {
      const detail = el('details');
      detail.append(el('summary', `${finding.label} — ${finding.evidence.length ? 'Evidence recorded' : 'Not observed'}`));
      detail.append(el('p', finding.feedback));
      const list = el('ol');
      finding.evidence.forEach(t => list.append(moment(t)));
      detail.append(list);
      section.append(detail);
    }
    const details = el('details');
    details.append(el('summary', 'Full decision timeline'), timeline(data.timeline));
    section.append(details);
    return section;
  }
  function comparison(data) {
    const section = el('section', undefined, 'practice-review');
    section.append(el('h2', 'Compare your decisions'), el('p', 'Same saved setup. Compare the order and timing of your decisions; differences in model narration and dice outcomes are not a measure of skill.'));
    const grid = el('div', undefined, 'practice-comparison');
    grid.append(timeline(data.previous, 'Previous attempt'), timeline(data.current, 'This attempt'));
    section.append(grid);
    return section;
  }
  return { el, learning, timeline, comparison };
})();
