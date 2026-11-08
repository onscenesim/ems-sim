(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MonitorUI = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const BP_INTERVALS = [0, 1, 2, 3, 5, 10, 15];
  function createBPSchedule() {
    const patients = new Map();
    const state = id => patients.get(id) || { interval: 0, nextAt: null, pending: false };
    function set(id, interval, minute) {
      if (!BP_INTERVALS.includes(interval) || !Number.isFinite(minute)) return false;
      patients.set(id, { interval, nextAt: interval ? minute + interval : null, pending: false });
      return true;
    }
    return {
      state: id => ({ ...state(id) }), set, clear: () => patients.clear(),
      rearm(id, minute) { const s = patients.get(id); if (s?.interval && !s.pending) s.nextAt = minute + s.interval; },
      claim(id, minute) {
        const s = patients.get(id);
        if (!s?.interval || s.pending || minute < s.nextAt) return null;
        s.pending = true;
        return { id, state: s };
      },
      complete(token, minute, success) {
        if (patients.get(token.id) !== token.state) return;
        const s = token.state;
        s.pending = false;
        if (success) s.nextAt = minute + s.interval; // One cycle after a time jump; no catch-up burst.
        else { s.interval = 0; s.nextAt = null; s.error = 'Schedule stopped: BP cycle did not complete.'; }
      },
      snapshot: () => [...patients].filter(([, s]) => s.interval).map(([id, s]) => ({ id, interval: s.interval, nextAt: s.nextAt })),
      restore(entries) {
        patients.clear();
        for (const s of entries || []) if (typeof s.id === 'string' && BP_INTERVALS.includes(s.interval) && s.interval > 0 && Number.isFinite(s.nextAt)) {
          patients.set(s.id, { interval: s.interval, nextAt: s.nextAt, pending: false });
        }
      },
    };
  }
  function createBPHistory() {
    const patients = new Map();
    function record(vitals, { patientId = 'patient_1', minute = 0 } = {}) {
      const raw = vitals?.BP;
      const value = raw && typeof raw === 'object' ? raw.value : raw;
      const match = String(value ?? '').match(/^\s*(\d{1,3})\s*\/\s*(\d{1,3})(?:\s*mmHg)?\s*$/i);
      if (!match) return;
      const systolic = Number(match[1]), diastolic = Number(match[2]);
      if (systolic > 400 || diastolic > systolic) return;
      const stamped = raw && typeof raw === 'object' && (raw.t != null || raw.tMin != null);
      const timeMatch = String(raw?.t || '').match(/(?:T\+)?(\d+):(\d{2})/);
      const time = Number.isFinite(raw?.tMin) ? raw.tMin : timeMatch ? Number(timeMatch[1]) + Number(timeMatch[2]) / 60 : minute;
      const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
      const readings = patients.get(patientId) || [];
      const key = `${safeTime}|${systolic}/${diastolic}`;
      if (stamped ? readings.some(r => r.key === key) : readings.at(-1)?.value === value) return;
      const seconds = Math.round(safeTime * 60);
      readings.push({ key, value, systolic, diastolic, minute: safeTime, label: `T+${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` });
      readings.sort((a, b) => a.minute - b.minute);
      patients.set(patientId, readings);
    }
    return {
      record, readings: (id = 'patient_1') => [...(patients.get(id) || [])], clear: () => patients.clear(),
      restore(turns) {
        patients.clear();
        for (const turn of turns || []) record(turn.vitals, {
          patientId: turn.patientFocus?.id || turn.patient_focus?.id || 'patient_1',
          minute: turn.sceneMinute ?? turn.scene_minute ?? 0,
        });
      },
    };
  }

  function trendSVG(readings) {
    if (!readings.length) return '';
    const low = Math.max(0, Math.floor((Math.min(...readings.map(r => r.diastolic)) - 10) / 20) * 20);
    const high = Math.max(low + 40, Math.ceil((Math.max(...readings.map(r => r.systolic)) + 10) / 20) * 20);
    const first = readings[0].minute, span = readings.at(-1).minute - first;
    const x = (r, i) => span ? 42 + (r.minute - first) / span * 470 : readings.length === 1 ? 277 : 42 + i / (readings.length - 1) * 470;
    const y = value => 122 - (value - low) / (high - low) * 96;
    const series = (field, color) => `<polyline points="${readings.map((r, i) => `${x(r, i)},${y(r[field])}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>` +
      readings.map((r, i) => `<circle cx="${x(r, i)}" cy="${y(r[field])}" r="3" fill="${color}"/>`).join('');
    return `<svg viewBox="0 0 560 156" role="img" aria-label="Blood pressure trend. Systolic in white, diastolic in cyan. Exact readings are in the table below.">
      <g font-family="MonitorReferenceDigits,MonitorNumerals,Arial,sans-serif" font-size="11" font-weight="600" fill="#9ba9ad">
        ${[low, (low + high) / 2, high].map(v => `<path d="M42 ${y(v)}H520" stroke="#263237"/><text x="4" y="${y(v) + 4}">${v}</text>`).join('')}
        <text x="42" y="149">${readings[0].label}</text><text x="520" y="149" text-anchor="end">${readings.at(-1).label}</text>
        <text x="320" y="13" fill="#f1f4ef">● Systolic</text><text x="430" y="13" fill="#77c9e3">● Diastolic</text>
      </g>${series('systolic', '#f1f4ef')}${series('diastolic', '#77c9e3')}</svg>`;
  }

  function mount(doc, { getPatient, getSelection, canSelectCapno, selectWaveform, beforeOpen, resize, cycleBP, canCycleBP,
    getMinute, getSessionId, canScheduleBP, canAutoCycleBP, onOpen = () => {} }) {
    const el = id => doc.getElementById(id);
    const dialog = el('monitor-dialog'), picker = el('waveform-picker'), toggle = el('waveform-toggle');
    const history = createBPHistory();
    const schedule = createBPSchedule();
    const scheduleMenu = el('monitor-bp-schedule'), scheduleToggle = el('monitor-bp-schedule-toggle');
    let autoCycling = false, manualCycling = false, checkQueued = false;
    let hasOpened = false;
    const scheduleKey = () => getSessionId() ? 'ems_bp_schedule:' + getSessionId() : null;
    function saveSchedule() {
      try { const key = scheduleKey(); if (key) doc.defaultView.sessionStorage.setItem(key, JSON.stringify(schedule.snapshot())); } catch (_) { /* In-memory schedule remains usable. */ }
    }
    function renderSchedule() {
      const s = schedule.state(getPatient().id);
      scheduleToggle.disabled = !canScheduleBP();
      scheduleToggle.dataset.active = String(s.interval > 0);
      scheduleToggle.title = s.interval ? `BP schedule: every ${s.interval} in-game min` : 'Set BP schedule';
      for (const button of scheduleMenu.querySelectorAll('button')) button.setAttribute('aria-checked', String(Number(button.dataset.bpInterval) === s.interval));
      if (scheduleToggle.disabled) closeScheduleMenu();
      const seconds = Math.round((s.nextAt || 0) * 60);
      el('monitor-bp-schedule-status').textContent = !canScheduleBP() ? 'Auto NIBP unavailable.' :
        s.pending ? 'Cuff cycling…' : s.error || (!s.interval ? 'Manual cycles only.' :
          getMinute() >= s.nextAt ? 'BP due — waiting for the current action to finish.' :
          `Every ${s.interval} min · next T+${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} (in-game time)`);
    }
    function checkSchedule() {
      if (checkQueued) return;
      checkQueued = true;
      Promise.resolve().then(async () => {
        checkQueued = false;
        if (autoCycling || manualCycling || !canAutoCycleBP()) return;
        const token = schedule.claim(getPatient().id, getMinute());
        if (!token) return;
        autoCycling = true;
        if (dialog.open) renderSchedule();
        let success = false;
        try { success = (await cycleBP()) === true; } catch (_) { /* Stop this schedule after a failed cycle. */ } finally {
          schedule.complete(token, getMinute(), success);
          autoCycling = false; saveSchedule();
          if (dialog.open) renderHistory();
        }
      });
    }
    function closeScheduleMenu(focus = false) {
      scheduleMenu.hidden = true;
      scheduleToggle.setAttribute('aria-expanded', 'false');
      if (focus) scheduleToggle.focus({ preventScroll: true });
    }
    function openScheduleMenu() {
      if (!canScheduleBP()) return;
      renderSchedule();
      scheduleMenu.hidden = false;
      scheduleToggle.setAttribute('aria-expanded', 'true');
      const rect = scheduleToggle.getBoundingClientRect();
      const width = doc.defaultView.innerWidth, height = doc.defaultView.innerHeight;
      const below = height - rect.bottom - 8, above = rect.top - 8;
      const down = below >= 270 || below >= above;
      scheduleMenu.style.maxHeight = `${Math.max(60, down ? below : above)}px`;
      const menu = scheduleMenu.getBoundingClientRect();
      scheduleMenu.style.left = `${Math.max(8, Math.min(rect.right - menu.width, width - menu.width - 8))}px`;
      scheduleMenu.style.top = `${down ? rect.bottom + 4 : Math.max(8, rect.top - menu.height - 4)}px`;
      scheduleMenu.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
    }
    scheduleToggle.addEventListener('click', () => { if (scheduleMenu.hidden) openScheduleMenu(); else closeScheduleMenu(); });
    scheduleToggle.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); openScheduleMenu(); } });
    for (const button of scheduleMenu.querySelectorAll('button')) button.addEventListener('click', () => {
      if (canScheduleBP()) { schedule.set(getPatient().id, Number(button.dataset.bpInterval), getMinute()); saveSchedule(); }
      renderSchedule(); closeScheduleMenu(true);
    });
    scheduleMenu.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...scheduleMenu.querySelectorAll('button')];
      const index = buttons.indexOf(doc.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
        (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    });
    doc.addEventListener('click', event => { if (!scheduleMenu.contains(event.target) && !scheduleToggle.contains(event.target)) closeScheduleMenu(); });
    doc.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !scheduleMenu.hidden) { event.preventDefault(); closeScheduleMenu(true); }
    });
    dialog.querySelector('.monitor-body').addEventListener('scroll', () => closeScheduleMenu());
    doc.defaultView.addEventListener('resize', () => closeScheduleMenu());
    const traces = ['ecg-waveform', 'pleth-waveform', 'capno-waveform'].map(id => {
      const node = el(id), anchor = doc.createComment(id + ' home');
      node.before(anchor);
      return { node, anchor, host: dialog.querySelector(`[data-monitor-trace="${id}"]`) };
    });
    function closePicker(focus = false) {
      picker.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (focus) toggle.focus({ preventScroll: true });
    }
    toggle.addEventListener('click', () => {
      const open = picker.hidden;
      picker.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      for (const button of picker.querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(button.dataset.waveformSelect === getSelection()));
        button.disabled = button.dataset.waveformSelect === 'capno' && !canSelectCapno();
      }
      if (open) picker.querySelector('button[aria-pressed="true"]')?.focus({ preventScroll: true });
    });
    for (const node of doc.querySelectorAll('[data-waveform-select]')) {
      const choose = () => { selectWaveform(node.dataset.waveformSelect); closePicker(picker.contains(node)); };
      node.addEventListener('click', choose);
      if (node.tagName !== 'BUTTON') node.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); }
      });
    }
    doc.addEventListener('click', event => { if (!picker.contains(event.target) && !toggle.contains(event.target)) closePicker(); });
    doc.addEventListener('keydown', event => { if (event.key === 'Escape' && !picker.hidden) { event.preventDefault(); closePicker(true); } });

    function renderHistory() {
      const patient = getPatient();
      el('monitor-patient').textContent = patient.label;
      const readings = history.readings(patient.id);
      el('monitor-bp-empty').hidden = !!readings.length;
      el('monitor-bp-table').hidden = !readings.length;
      el('monitor-bp-chart').innerHTML = trendSVG(readings);
      el('monitor-bp-readings').replaceChildren(...readings.slice().reverse().map(reading => {
        const row = doc.createElement('tr');
        for (const text of [reading.label, reading.systolic, reading.diastolic]) {
          const cell = doc.createElement('td'); cell.textContent = String(text); row.append(cell);
        }
        return row;
      }));
      el('monitor-cycle-bp').disabled = !canCycleBP();
      renderSchedule();
    }
    function restoreTraces() { closeScheduleMenu(); for (const { node, anchor } of traces) anchor.after(node); resize(); }
    function open() {
      if (dialog.open) return;
      beforeOpen(); closePicker();
      for (const { node, host } of traces) host.append(node);
      renderHistory(); dialog.showModal();
      dialog.querySelector('.monitor-body').scrollTop = 0;
      el('monitor-close').focus({ preventScroll: true });
      resize();
      onOpen(!hasOpened);
      hasOpened = true;
    }
    function close() { if (dialog.open) dialog.close(); restoreTraces(); }
    el('monitor-btn').addEventListener('click', open);
    el('monitor-close').addEventListener('click', close);
    dialog.addEventListener('close', restoreTraces);
    dialog.addEventListener('click', event => { if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
    } });
    el('monitor-cycle-bp').addEventListener('click', async () => {
      if (manualCycling || !canCycleBP()) return;
      const id = getPatient().id;
      manualCycling = true;
      try { if (await cycleBP()) schedule.rearm(id, getMinute()); } finally {
        manualCycling = false; saveSchedule(); if (dialog.open) renderHistory();
      }
    });
    return {
      open, close, closePicker,
      update(vitals, minute) {
        const id = getPatient().id, count = history.readings(id).length;
        history.record(vitals, { patientId: id, minute });
        if (history.readings(id).length > count) { schedule.rearm(id, minute); saveSchedule(); }
        if (dialog.open) renderHistory();
      },
      refresh() { if (dialog.open) renderHistory(); checkSchedule(); },
      tick() { if (dialog.open) renderSchedule(); checkSchedule(); },
      reset() { close(); closePicker(); history.clear(); schedule.clear(); hasOpened = false; },
      restore(turns) {
        history.restore(turns);
        try { const key = scheduleKey(); if (key) schedule.restore(JSON.parse(doc.defaultView.sessionStorage.getItem(key) || '[]')); } catch (_) { /* Ignore malformed saved controls. */ }
      },
    };
  }
  return { createBPHistory, createBPSchedule, trendSVG, mount };
});
