/* Shared by the live debrief and saved call library. All run text is plain text. */
'use strict';
const PracticeUI = (() => {
  let reviewSerial = 0;
  const debriefNote = 'Debrief is experimental. Check its clinical claims against your local protocols.';
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, action, className) {
    const node = el('button', text, className);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function time(minute) {
    if (!Number.isFinite(minute)) return 'Time unavailable';
    const seconds = Math.max(0, Math.round(minute * 60));
    return `T+${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function patientName(id) { return String(id || 'Patient').replace(/^patient_(\d+)$/, 'Patient $1'); }
  function valueText(value) {
    if (value === undefined || value === null) return '—';
    if (typeof value === 'object') return value.value !== undefined ? String(value.value) : JSON.stringify(value);
    return String(value);
  }
  function vitalsLine(vitals) {
    return Object.entries(vitals || {}).map(([key, value]) => `${key}: ${valueText(value)}`).join(' · ');
  }
  function debriefContent(value) {
    const container = el('div', undefined, 'review-debrief-text');
    const lines = String(value || '').split(/\r?\n/);
    let paragraph = [], list = null;
    const flushParagraph = () => {
      if (paragraph.length) container.append(el('p', paragraph.join(' ')));
      paragraph = [];
    };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { flushParagraph(); list = null; continue; }
      const heading = line.match(/^#{1,6}\s+(.+)$/);
      if (heading) { flushParagraph(); list = null; container.append(el('h3', heading[1])); continue; }
      const bullet = line.match(/^\*\s+(.+)$/);
      if (bullet) {
        flushParagraph();
        if (!list) { list = el('ul'); container.append(list); }
        const item = el('li');
        const lead = bullet[1].match(/^\*\*(.+?)\*\*\s*(.*)$/);
        if (lead) item.append(el('strong', lead[1]), document.createTextNode(lead[2] ? ` ${lead[2]}` : ''));
        else item.textContent = bullet[1];
        list.append(item);
        continue;
      }
      list = null;
      paragraph.push(line);
    }
    flushParagraph();
    return container;
  }
  function procedureName(procedure) {
    if (procedure.id === 'medication_push' && procedure.matchedDrug) return procedure.matchedDrug;
    const names = {
      cpr: 'CPR', peripheral_iv: 'Peripheral IV', io_access: 'IO access',
      twelve_lead: '12-lead ECG', bvm: 'BVM', cpap: 'CPAP',
      vitals_manual: 'Manual vitals', vitals_monitor: 'Monitor vitals',
    };
    if (names[procedure.id]) return names[procedure.id];
    return String(procedure.id || 'Recorded procedure').replaceAll('_', ' ');
  }
  function titleCase(value) {
    return String(value || '').replace(/\b[a-z]/g, letter => letter.toUpperCase());
  }
  function procedureMeta(procedure) {
    const parts = [];
    if (procedure.id === 'medication_push') parts.push('Medication');
    if (procedure.administrationRoute) parts.push(`Route ${procedure.administrationRoute}`);
    if (procedure.noRoll) parts.push('No skill check');
    else if (procedure.attempts?.length) {
      parts.push(procedure.attempts.map((attempt, index) => `Check ${index + 1}: d20 ${valueText(attempt.roll)} vs DC ${valueText(attempt.dc)} · ${attempt.outcome || 'outcome not recorded'}`).join(' | '));
    } else if (procedure.roll !== null && procedure.roll !== undefined) {
      parts.push(`d20 ${procedure.roll} vs DC ${Array.isArray(procedure.dc) ? procedure.dc.join('/') : valueText(procedure.dc)}`);
    }
    if (procedure.disadvantage) parts.push('Disadvantage');
    return parts.join(' · ');
  }
  function procedureList(procedures, intervention) {
    const relevant = procedures.filter(procedure => !!procedure.intervention === intervention);
    if (!relevant.length) return null;
    const section = el('section', undefined, intervention ? 'review-procedure-group is-intervention' : 'review-procedure-group is-assessment');
    section.append(el('h4', intervention ? `INTERVENTION${relevant.length === 1 ? '' : 'S'}` : 'ASSESSMENT / MONITORING'));
    const list = el('ul', undefined, 'review-attempts');
    relevant.forEach(procedure => {
      const item = el('li', undefined, 'review-procedure');
      const heading = el('div', undefined, 'review-procedure-heading');
      heading.append(el('strong', titleCase(procedureName(procedure))));
      if (!procedure.noRoll && procedure.outcome) heading.append(el('span', procedure.outcome, `review-outcome is-${String(procedure.outcome).toLowerCase()}`));
      item.append(heading, el('p', patientName(procedure.patient), 'review-procedure-patient'));
      const meta = procedureMeta(procedure);
      if (meta) item.append(el('p', meta, 'review-procedure-meta'));
      list.append(item);
    });
    section.append(list);
    return section;
  }
  function moment(t, onOpen) {
    const card = el('li', undefined, 'practice-moment');
    const interventions = (t.procedures || []).filter(procedure => procedure.intervention);
    if (interventions.length) card.classList.add('has-intervention');
    const heading = el('div', undefined, 'practice-moment-heading');
    heading.append(el('strong', time(t.minute)), el('span', `Turn ${t.turn} · ${patientName(t.patient)}`));
    if (t.report || t.skip) heading.append(el('span', t.report ? 'Report' : 'Time skip', 'review-badge'));
    if (interventions.length) heading.append(el('span', `${interventions.length} INTERVENTION${interventions.length === 1 ? '' : 'S'}`, 'review-intervention-badge'));
    card.append(heading);
    const action = el('div', undefined, 'review-action');
    action.append(el('span', 'PLAYER ACTION'), el('p', t.action || 'No player action recorded.'));
    card.append(action);
    const interventionList = procedureList(t.procedures || [], true);
    const assessmentList = procedureList(t.procedures || [], false);
    if (interventionList) card.append(interventionList);
    if (assessmentList) card.append(assessmentList);
    card.append(el('p', vitalsLine(t.vitals) || 'No vitals recorded in this turn.', 'review-observation'));
    if (t.priorObservation) card.append(el('p', `Earlier observation · ${time(t.priorObservation.minute)} · Turn ${t.priorObservation.turn}\n${vitalsLine(t.priorObservation.vitals)}`, 'review-earlier'));
    if (t.precedingIntervention) {
      card.append(el('p', `Preceding intervention · Turn ${t.precedingIntervention.turn}: ${t.precedingIntervention.action}`, 'review-context'));
      if (t.elapsedMinutes !== null) card.append(el('p', `${t.elapsedMinutes} min between recorded turns. This interval does not establish clinical timeliness.`, 'review-context'));
    }
    if (t.scene && interventions.length) {
      const response = el('section', undefined, 'review-intervention-response');
      response.append(el('h4', 'SIMULATION RESPONSE'), el('p', t.scene));
      card.append(response);
    } else if (t.scene) {
      const scene = el('details', undefined, 'review-scene');
      scene.append(el('summary', 'Scene response at this moment'), el('p', t.scene));
      card.append(scene);
    }
    if (onOpen) card.append(button('View in timeline →', () => onOpen(t.turn), 'review-evidence-link'));
    return card;
  }
  function timeline(turns, label = 'Decision timeline') {
    const section = el('section', undefined, 'practice-timeline');
    section.append(el('h3', label));
    const list = el('ol', undefined, 'review-moments');
    turns.forEach(t => list.append(moment(t)));
    if (!turns.length) section.append(el('p', 'No decisions recorded.', 'review-empty'));
    section.append(list);
    return section;
  }
  function learning(data) {
    const id = `learning-${++reviewSerial}`;
    const allTurns = data.timeline || [];
    const section = el('section', undefined, 'practice-review learning-window');
    section.setAttribute('aria-label', 'Learning review');
    const titlebar = el('header', undefined, 'review-titlebar');
    const title = el('h2', 'LEARNING REVIEW');
    const icon = el('span', '▤', 'review-window-icon');
    icon.setAttribute('aria-hidden', 'true');
    title.prepend(icon);
    const body = el('div', undefined, 'review-window-body');
    body.id = `${id}-body`;
    const collapse = button('−', () => {
      body.hidden = !body.hidden;
      collapse.textContent = body.hidden ? '+' : '−';
      collapse.setAttribute('aria-expanded', String(!body.hidden));
      collapse.setAttribute('aria-label', body.hidden ? 'Expand learning review' : 'Collapse learning review');
    }, 'review-window-control');
    collapse.setAttribute('aria-controls', body.id);
    collapse.setAttribute('aria-expanded', 'true');
    collapse.setAttribute('aria-label', 'Collapse learning review');
    titlebar.append(title, collapse);
    section.append(titlebar, body);

    const toolbar = el('div', undefined, 'review-toolbar');
    toolbar.append(el('span', 'After-call workspace', 'review-workspace-label'));
    const patientLabel = el('label', 'Patient ');
    const patientSelect = el('select');
    patientSelect.setAttribute('aria-label', 'Review patient');
    patientSelect.append(new Option('All patients', ''));
    const patients = [...new Set(allTurns.map(t => t.patient).filter(Boolean))];
    patients.forEach(patient => patientSelect.append(new Option(patientName(patient), patient)));
    patientLabel.append(patientSelect);
    toolbar.append(patientLabel);
    body.append(toolbar);
    const stats = el('div', undefined, 'review-summary');
    body.append(stats);
    const tabs = el('div', undefined, 'review-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Learning review views');
    body.append(tabs);
    const panels = {}, tabButtons = {};
    const reviewTab = data.hideDebrief ? 'Instructor review' : 'Debrief';
    let active = reviewTab, selectedTurn = null, filter = 'all';
    const status = el('footer', undefined, 'review-status');
    status.append(el('strong', 'UNSCORED RECORD'), el('span', 'Procedure outcomes are simulation results, not a grade.'));
    const rows = () => allTurns.filter(t => !patientSelect.value || t.patient === patientSelect.value);
    function activate(name, focus = false) {
      active = name;
      Object.keys(panels).forEach(key => {
        panels[key].hidden = key !== name;
        tabButtons[key].setAttribute('aria-selected', String(key === name));
        tabButtons[key].tabIndex = key === name ? 0 : -1;
      });
      if (focus) tabButtons[name].focus();
    }
    const names = [reviewTab, 'Timeline', 'Vitals'];
    names.forEach((name, index) => {
      const tab = button(name, () => activate(name), 'review-tab');
      tab.id = `${id}-${name}-tab`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `${id}-${name}-panel`);
      tab.addEventListener('keydown', event => {
        const target = event.key === 'ArrowRight' ? (index + 1) % names.length
          : event.key === 'ArrowLeft' ? (index + names.length - 1) % names.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? names.length - 1 : null;
        if (target !== null) { event.preventDefault(); activate(names[target], true); }
      });
      const panel = el('div', undefined, 'review-panel');
      panel.id = `${id}-${name}-panel`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.tabIndex = 0;
      panels[name] = panel;
      tabButtons[name] = tab;
      tabs.append(tab);
      body.append(panel);
    });
    body.append(status);
    function openMoment(turn) {
      filter = 'all'; selectedTurn = turn;
      renderTimeline(); activate('Timeline');
      const target = panels.Timeline.querySelector(`[data-turn="${Number(turn)}"]`);
      if (target) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }
    }
    function renderDebrief() {
      const panel = panels[reviewTab];
      panel.replaceChildren();
      if (data.hideDebrief) { panel.append(el('p', 'Turn in this call to your instructor for review.', 'review-intro')); return; }
      if (patientSelect.value) panel.append(el('p', 'The debrief covers the whole call, including every patient.', 'review-intro'));
      if (data.debriefText) panel.append(el('p', debriefNote, 'review-intro'));
      panel.append(debriefContent(data.debriefText || 'No debrief has been generated for this call.'));
    }
    function renderTimeline() {
      const panel = panels.Timeline;
      panel.replaceChildren();
      const label = el('label', 'Show ');
      const select = el('select');
      select.setAttribute('aria-label', 'Timeline entries');
      [['all', 'All entries'], ['interventions', 'Interventions'], ['assessments', 'Assessment / monitoring'], ['vitals', 'With observations'], ['reports', 'Reports']].forEach(([value, text]) => select.append(new Option(text, value)));
      select.value = filter;
      select.addEventListener('change', () => { filter = select.value; selectedTurn = null; renderTimeline(); panels.Timeline.querySelector('select').focus(); });
      label.append(select);
      panel.append(label, el('p', 'Follow your actions, the scene responses, and recorded attempts. Select a patient above to focus the record.', 'review-intro'));
      const entries = rows().filter(t => filter === 'all'
        || (filter === 'interventions' && t.procedures?.some(procedure => procedure.intervention))
        || (filter === 'assessments' && t.procedures?.some(procedure => !procedure.intervention))
        || (filter === 'vitals' && Object.keys(t.vitals || {}).length)
        || (filter === 'reports' && t.report));
      const list = el('ol', undefined, 'review-moments');
      entries.forEach(t => {
        const card = moment(t);
        card.dataset.turn = t.turn;
        card.tabIndex = -1;
        if (t.turn === selectedTurn) card.classList.add('is-selected');
        list.append(card);
      });
      panel.append(list);
      if (!entries.length) panel.append(el('p', 'No entries match this filter.', 'review-empty'));
    }
    function renderVitals() {
      const panel = panels.Vitals;
      panel.replaceChildren(el('p', 'Recorded observations only. A dash means no value was logged in that turn; values are never carried forward. Compare each patient separately.', 'review-intro'));
      const observations = rows().filter(t => Object.keys(t.vitals || {}).length);
      const groups = [...new Set(observations.map(t => t.patient))];
      groups.forEach(patient => {
        const entries = observations.filter(t => t.patient === patient);
        const fields = [...new Set(entries.flatMap(t => Object.keys(t.vitals)))];
        const wrap = el('div', undefined, 'review-table-scroll');
        wrap.tabIndex = 0;
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', `${patientName(patient)} recorded vitals`);
        const table = el('table', undefined, 'review-vitals-table');
        table.append(el('caption', `${patientName(patient)} · ${entries.length} observation${entries.length === 1 ? '' : 's'}`));
        const head = el('thead'), headRow = el('tr');
        ['Moment', ...fields].forEach(field => { const th = el('th', field); th.scope = 'col'; headRow.append(th); });
        head.append(headRow); table.append(head);
        const tbody = el('tbody');
        entries.forEach(t => {
          const row = el('tr'), label = el('th'); label.scope = 'row';
          label.append(button(`${time(t.minute)} · #${t.turn}`, () => openMoment(t.turn), 'review-evidence-link'));
          row.append(label);
          fields.forEach(field => row.append(el('td', valueText(t.vitals[field]))));
          tbody.append(row);
        });
        table.append(tbody); wrap.append(table); panel.append(wrap);
      });
      if (!observations.length) panel.append(el('p', 'No vitals were recorded for this selection. Review the transcript for any assessment described in words.', 'review-empty'));
    }
    function render() {
      stats.replaceChildren();
      const interventionCount = rows().reduce((count, turn) => count + (turn.procedures || []).filter(procedure => procedure.intervention).length, 0);
      [[interventionCount, 'Interventions'], [rows().length, 'Logged moments']].forEach(([value, label]) => {
        const cell = el('div'); cell.append(el('strong', String(value)), el('span', label)); stats.append(cell);
      });
      renderDebrief(); renderTimeline(); renderVitals(); activate(active);
    }
    patientSelect.addEventListener('change', () => { selectedTurn = null; render(); });
    render();
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
  function exportText(data, { debug = false } = {}) {
    const turns = data?.timeline || [];
    const interventionCount = turns.reduce((count, turn) => count + (turn.procedures || []).filter(procedure => procedure.intervention).length, 0);
    const lines = ['LEARNING REVIEW', '═'.repeat(60), '', 'After-call workspace',
      `${interventionCount} Interventions · ${turns.length} Logged moments`, '',
      data?.hideDebrief ? 'INSTRUCTOR REVIEW' : 'DEBRIEF', '─'.repeat(60),
      ...(data?.debriefText && !data.hideDebrief ? [debriefNote, ''] : []),
      (data?.hideDebrief ? 'Turn in this call to your instructor for review.' : data?.debriefText) || 'No debrief has been generated for this call.', ''];
    lines.push('TIMELINE', '─'.repeat(60), 'Follow your actions, the scene responses, and recorded attempts.');
    if (!turns.length) lines.push('No entries recorded.');
    for (const turn of turns) {
      const labels = [time(turn.minute), `Turn ${turn.turn}`, patientName(turn.patient)];
      if (turn.report) labels.push('Report');
      if (turn.skip) labels.push('Time skip');
      lines.push('', labels.join(' · '), `PLAYER ACTION: ${turn.action || 'No player action recorded.'}`);
      for (const [intervention, heading] of [[true, 'INTERVENTIONS'], [false, 'ASSESSMENT / MONITORING']]) {
        const procedures = (turn.procedures || []).filter(procedure => !!procedure.intervention === intervention);
        if (!procedures.length) continue;
        lines.push(heading);
        for (const procedure of procedures) {
          const name = titleCase(procedureName(procedure));
          const result = !procedure.noRoll && procedure.outcome ? ` · ${procedure.outcome}` : '';
          const meta = debug ? procedureMeta(procedure) : (procedure.administrationRoute ? `Route ${procedure.administrationRoute}` : '');
          lines.push(`  ${name}${result} · ${patientName(procedure.patient)}${meta ? ` · ${meta}` : ''}`);
        }
      }
      lines.push(`RECORDED VITALS: ${vitalsLine(turn.vitals) || 'No vitals recorded in this turn.'}`);
      if (turn.priorObservation) lines.push(`EARLIER OBSERVATION: ${time(turn.priorObservation.minute)} · Turn ${turn.priorObservation.turn} · ${vitalsLine(turn.priorObservation.vitals)}`);
      if (turn.precedingIntervention) lines.push(`PRECEDING INTERVENTION: Turn ${turn.precedingIntervention.turn}: ${turn.precedingIntervention.action}`);
      if (turn.elapsedMinutes !== null && turn.elapsedMinutes !== undefined) lines.push(`${turn.elapsedMinutes} min between recorded turns. This interval does not establish clinical timeliness.`);
      if (turn.scene) lines.push(`SIMULATION RESPONSE: ${turn.scene}`);
    }
    lines.push('', 'VITALS', '─'.repeat(60), 'Recorded observations only. A dash means no value was logged in that turn; values are never carried forward.');
    const observations = turns.filter(turn => Object.keys(turn.vitals || {}).length);
    if (!observations.length) lines.push('No vitals were recorded.');
    for (const patient of [...new Set(observations.map(turn => turn.patient))]) {
      const entries = observations.filter(turn => turn.patient === patient);
      const fields = [...new Set(entries.flatMap(turn => Object.keys(turn.vitals)))];
      lines.push('', `${patientName(patient)} · ${entries.length} observation${entries.length === 1 ? '' : 's'}`);
      for (const turn of entries) {
        lines.push(`${time(turn.minute)} · #${turn.turn} · ${fields.map(field => `${field}: ${valueText(turn.vitals[field])}`).join(' · ')}`);
      }
    }
    lines.push('', 'UNSCORED RECORD · Procedure outcomes are simulation results, not a grade.',
      (data?.hideDebrief ? 'Turn in this call to your instructor for review.' : data?.notice) || 'Times mark the end of a turn, not the exact intervention time.');
    return lines.join('\n');
  }
  return { el, learning, timeline, comparison, exportText };
})();
