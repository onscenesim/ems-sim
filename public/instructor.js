/* Instructor drafts stay in memory; only setup preferences may be saved. */
const InstructorUI = (() => {
  const panel = document.getElementById('instructor-panel');
  const toggle = document.getElementById('instructor-toggle');
  const storageKey = 'ems_instructor_settings';
  const configIds = ['cfg-difficulty', 'cfg-provider', 'cfg-region', 'cfg-partner', 'cfg-captain'];
  let catalog = null, selected = '', scenario = {}, seed = {}, hideDebrief = false, save = false;
  let category = '', search = '', advanced = false, restoredConfig = null;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved?.save) {
      ({ selected = '', seed = {}, hideDebrief = false, category = '' } = saved);
      save = true; toggle.checked = !!saved.enabled; restoredConfig = saved.config;
    }
  } catch (_) { /* Unavailable or outdated local preferences. */ }
  const el = PracticeUI.el;
  const labelText = key => ({ hint: 'Hint / curriculum narrative', special_flags: 'Scenario tags / special flags',
    reversible_cause_hint: 'Reversible cause hint', age_override: 'Age groups (comma separated)',
    decompensation_clock: 'Deterioration threshold (minutes)', random_seed: 'Random seed',
    difficulty: 'Catalog difficulty tag' }[key] || key.replaceAll('.', ' · ').replaceAll('_', ' ').replace(/^./, c => c.toUpperCase()));
  function persist() {
    try {
      if (save) localStorage.setItem(storageKey, JSON.stringify({ save, enabled: toggle.checked, selected, seed, hideDebrief, category,
        config: Object.fromEntries(configIds.map(id => [id, document.getElementById(id)?.value])) }));
      else localStorage.removeItem(storageKey);
    } catch (_) { /* Settings still work for this run. */ }
  }
  function field(key, type, value, onChange, optional = false) {
    const label = el('label', labelText(key));
    let input;
    if (Array.isArray(type) || type === 'boolean') {
      input = el('select');
      input.append(new Option(optional ? 'Automatic' : 'None', ''));
      const values = type === 'boolean' ? ['true', 'false'] : [...new Set(type)];
      values.forEach(v => input.append(new Option(v.replaceAll('_', ' '), v)));
      input.value = value == null ? '' : String(value);
    } else {
      input = el(type === 'text' && key !== 'random_seed' ? 'textarea' : 'input');
      if (input.tagName === 'INPUT') input.type = type === 'number' ? 'number' : 'text';
      input.value = Array.isArray(value) ? value.join(', ') : value ?? '';
      if (type === 'number') { input.min = 0; input.max = key === 'patient_age' ? 120 : 1440; }
      if (input.tagName === 'TEXTAREA') input.rows = ['hint', 'presentation', 'surface_presentation', 'reversible_cause_hint'].includes(key) ? 4 : 2;
      input.placeholder = optional ? 'Automatic' : 'None';
      input.maxLength = key === 'random_seed' ? 128 : 8000;
    }
    input.dataset.field = key;
    input.addEventListener('input', () => {
      let v = input.value;
      if (optional && v === '') v = undefined;
      else if (type === 'boolean') v = v === '' ? null : v === 'true';
      else if (type === 'number') v = v === '' ? null : Number(v);
      else if (type === 'list') v = v.split(',').map(s => s.trim()).filter(Boolean);
      else if (Array.isArray(type) && v === '') v = null;
      onChange(v); persist();
    });
    label.append(input);
    return label;
  }
  function checkbox(text, checked, change) {
    const label = el('label', undefined, 'instructor-check');
    const input = el('input'); input.type = 'checkbox'; input.checked = checked;
    input.addEventListener('change', () => { change(input.checked); persist(); });
    label.append(input, document.createTextNode(text)); return label;
  }
  function render() {
    panel.hidden = !toggle.checked;
    document.getElementById('cfg-category').disabled = toggle.checked;
    if (!toggle.checked || !catalog) return;
    panel.replaceChildren(el('h2', 'INSTRUCTOR MODE'));
    panel.firstChild.id = 'instructor-title';
    panel.append(el('p', 'Choose any catalog case. Scenario details and hints below are visible to the instructor.'));
    const filters = el('div', undefined, 'instructor-grid');
    const catLabel = el('label', 'Category'); const cat = el('select');
    cat.append(new Option('All categories', ''));
    [...new Set(catalog.scenarios.map(e => e.category))].forEach(c => cat.append(new Option(c === 'doa' ? 'DOA' : c === 'ob' ? 'OB / Childbirth' : labelText(c), c)));
    cat.value = category;
    cat.addEventListener('change', () => { category = cat.value; persist(); updateResults(); });
    catLabel.append(cat);
    const searchLabel = el('label', 'Search scenarios, hints, or tags'); const query = el('input');
    query.type = 'search'; query.value = search;
    query.addEventListener('input', () => { search = query.value; updateResults(); }); searchLabel.append(query);
    filters.append(catLabel, searchLabel); panel.append(filters);
    const selectLabel = el('label', 'Scenario'); const select = el('select'); select.id = 'instructor-case';
    const count = el('p', '', 'instructor-count'); count.setAttribute('role', 'status');
    function updateResults() {
      const entries = catalog.scenarios.filter(e => (!category || e.category === category) && JSON.stringify(e).toLowerCase().includes(search.toLowerCase()));
      select.replaceChildren(new Option('Choose a scenario…', ''));
      entries.forEach(e => select.append(new Option(e.presentation || e.surface_presentation, e.case_id)));
      // A search filters choices without silently changing the selected case.
      if (selected && !entries.some(e => e.case_id === selected)) {
        const current = catalog.scenarios.find(e => e.case_id === selected);
        if (current) select.append(new Option(`Selected: ${current.presentation || current.surface_presentation}`, selected));
      }
      select.value = selected; count.textContent = `${entries.length} matching scenarios`;
    }
    select.addEventListener('change', () => { selected = select.value; scenario = {}; persist(); render(); });
    updateResults(); selectLabel.append(select); panel.append(selectLabel, count);
    const entry = catalog.scenarios.find(e => e.case_id === selected);
    if (entry) {
      const details = el('details'); details.open = true;
      details.append(el('summary', 'Full scenario details · instructor only'));
      const dl = el('dl', undefined, 'instructor-details');
      for (const [key, value] of Object.entries({ ...entry, ...scenario })) {
        dl.append(el('dt', labelText(key)), el('dd', Array.isArray(value) ? value.join(', ') : value && typeof value === 'object'
          ? Object.entries(value).map(([k, v]) => `${labelText(k)}: ${Array.isArray(v) ? v.join(', ') : v}`).join('\n') : String(value ?? 'None')));
      }
      details.append(dl); panel.append(details);
    }
    const advancedBtn = el('button', advanced ? 'Close advanced settings' : 'Advanced settings');
    advancedBtn.type = 'button'; advancedBtn.setAttribute('aria-expanded', String(advanced));
    advancedBtn.addEventListener('click', () => { advanced = !advanced; render(); }); panel.append(advancedBtn);
    if (advanced) {
      const editor = el('div', undefined, 'instructor-advanced');
      editor.append(el('h3', 'Run setup'), el('p', 'Difficulty, provider level, region, and crew use the menu choices above. Automatic fields are rolled for each call. Explicit instructor choices may override the catalog’s usual setting restrictions.'));
      const fields = el('div', undefined, 'instructor-grid');
      for (const [key, type] of Object.entries(catalog.seedFields)) fields.append(field(key, type, seed[key], v => { if (v === undefined) delete seed[key]; else seed[key] = v; }, true));
      editor.append(fields);
      if (entry) {
        editor.append(el('h3', 'Customize this scenario for this run'), el('p', 'Edits to the narrative, hint, and tags apply only to the next run. They always clear after starting a call, even when settings are saved. The catalog is never changed.'));
        const custom = el('div', undefined, 'instructor-grid');
        for (const [key, type] of Object.entries(catalog.scenarioFields)) {
          // Show the appropriate presentation and hint names for each sheet.
          if (['presentation', 'surface_presentation', 'hint', 'reversible_cause_hint'].includes(key) && !(key in entry)) continue;
          custom.append(field(key, type, key in scenario ? scenario[key] : key.startsWith('compatibility.') ? entry.compatibility?.[key.split('.')[1]] : entry[key], v => { scenario[key] = v; }));
        }
        const reset = el('button', 'Reset scenario edits'); reset.type = 'button';
        reset.addEventListener('click', () => { scenario = {}; render(); }); editor.append(custom, reset);
      }
      editor.append(checkbox('Hide debrief · ask the student to turn in the call to the instructor for review', hideDebrief, v => { hideDebrief = v; }),
        checkbox('Save settings between runs', save, v => { save = v; }),
        el('p', 'Saved on this device: scenario selection, run setup, and review preference. Scenario edits are never saved as preferences.'));
      panel.append(editor);
    }
  }
  async function load() {
    panel.hidden = !toggle.checked;
    if (!toggle.checked) { render(); return; }
    if (!catalog) {
      panel.replaceChildren(el('p', 'Loading instructor scenarios…'));
      try {
        const response = await fetch('/api/scenario/instructor/catalog');
        if (!response.ok) throw new Error('Catalog unavailable');
        catalog = await response.json();
      } catch (_) {
        const retry = el('button', 'Retry loading scenarios'); retry.addEventListener('click', load);
        panel.replaceChildren(el('p', 'Could not load instructor scenarios.'), retry); return;
      }
    }
    render();
  }
  toggle.addEventListener('change', () => { persist(); load(); });
  window.addEventListener('DOMContentLoaded', () => {
    if (restoredConfig) for (const id of configIds) {
      const input = document.getElementById(id);
      if (input && [...input.options].some(o => o.value === restoredConfig[id])) { input.value = restoredConfig[id]; input.dispatchEvent(new Event('change')); }
    }
    configIds.forEach(id => document.getElementById(id)?.addEventListener('change', persist));
    load();
  });
  return {
    request() {
      if (!toggle.checked) return {};
      if (!catalog || !catalog.scenarios.some(e => e.case_id === selected)) throw new Error('Choose a scenario in Instructor mode before beginning.');
      return { instructor: { case_id: selected, scenario: structuredClone(scenario), seed: structuredClone(seed), hide_debrief: hideDebrief } };
    },
    started() {
      scenario = {};
      if (!save) { selected = ''; seed = {}; hideDebrief = false; category = ''; search = ''; }
      persist(); render();
    },
  };
})();
