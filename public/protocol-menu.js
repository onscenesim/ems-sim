(function () {
  'use strict';
  const provider = document.getElementById('cfg-provider');
  const region = document.getElementById('cfg-region');
  const dialog = document.getElementById('protocol-dialog');
  const list = document.getElementById('protocol-list');
  const summary = document.getElementById('protocol-summary');
  const storageKey = 'ems_protocol_preferences_v1';
  let preferences = {};
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) preferences = saved;
  } catch (_) { /* Defaults remain usable without storage. */ }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch (_) { /* Session-only preferences. */ }
  }
  function selection() {
    return EMSProtocols.resolve(provider.value, region.value, preferences[provider.value]);
  }
  function render() {
    const values = selection();
    const items = EMSProtocols.catalog(provider.value);
    const count = Object.values(values).filter(Boolean).length;
    summary.textContent = `${count} of ${items.length} included · ${provider.value}`;
    document.getElementById('protocol-context').textContent = `${provider.options[provider.selectedIndex].text} · ${region.options[region.selectedIndex].text}`;
    document.getElementById('protocol-region-note').textContent = region.value === 'CALIFORNIA_Urban'
      ? (provider.value === 'BLS' ? 'California preset: LUCAS is selectable. BGL measurement, Narcan and EpiPen require completed training modules and local LEMSA approval; enable each after training. These three default off.' : 'California preset: listed skill and medication additions are locked off. LUCAS remains selectable for ALS.')
      : region.value === 'INTERNATIONAL_DEVELOPING'
        ? (provider.value === 'BLS' ? 'International preset: EpiPen remains selectable; resource-dependent BLS additions are locked off.' : 'International preset: resource-dependent options are locked off. Epinephrine and other ALS skills remain selectable.')
        : 'No regional locks. Choose the capabilities in your protocols.';
    list.replaceChildren();
    for (const item of items) {
      const lock = EMSProtocols.lockReason(item, region.value);
      const dependency = !values.intubation && ['rsi', 'medication_intubation'].includes(item.id)
        ? 'Requires intubation to be included' : '';
      const label = document.createElement('label');
      label.className = `protocol-option${values[item.id] ? '' : ' crossed-off'}`;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `protocol-${item.id}`;
      checkbox.checked = values[item.id];
      checkbox.disabled = Boolean(lock || dependency);
      const text = document.createElement('span');
      const name = document.createElement('span');
      name.className = 'protocol-name';
      name.textContent = item.label;
      const status = document.createElement('small');
      status.textContent = lock || dependency || (EMSProtocols.requiresTraining(item, provider.value, region.value)
        ? (values[item.id] ? 'LEMSA Approved!' : 'Training module not completed!')
        : (values[item.id] ? 'Included in your protocols' : 'Excluded from omission feedback'));
      text.append(name, status);
      label.append(checkbox, text);
      checkbox.addEventListener('change', () => {
        preferences[provider.value] = { ...preferences[provider.value], [item.id]: checkbox.checked };
        save();
        render();
        document.getElementById(checkbox.id)?.focus();
      });
      list.append(label);
    }
  }
  document.getElementById('protocol-open').addEventListener('click', () => { render(); dialog.showModal(); });
  document.getElementById('protocol-close').addEventListener('click', () => dialog.close());
  document.getElementById('protocol-reset').addEventListener('click', () => {
    delete preferences[provider.value];
    save();
    render();
  });
  provider.addEventListener('change', render);
  region.addEventListener('change', render);
  window.ProtocolMenu = { selection };
  render();
})();
