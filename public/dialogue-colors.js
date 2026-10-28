/* Text-only segmentation: the legacy line classes remain intact for opt-out. */
(function (root, factory) {
  const aliases = typeof module === 'object' && module.exports
    ? require('./medication-aliases').MEDICATION_ALIASES : MEDICATION_ALIASES;
  const api = factory(aliases);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EMSDialogueColors = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (aliases) {
  'use strict';
  const procedures = [
    'CPR', 'chest compressions', 'compressions', 'defibrillation', 'defibrillate', 'cardioversion', 'cardiovert',
    'intubation', 'intubate', 'laryngoscopy', 'RSI', 'cricothyrotomy', 'needle cric', 'surgical cric',
    'IV', 'IO', 'IV access', 'IO access', 'intravenous access', 'intraosseous access', 'IV start',
    'oxygen', 'O2', 'O₂', 'nasal cannula', 'non-rebreather', 'NRB', 'CPAP', 'BiPAP', 'BVM',
    'bag valve mask', 'bag-valve-mask', 'ventilation', 'suction', 'suctioning', 'OPA', 'NPA', 'SGA',
    'oropharyngeal airway', 'nasopharyngeal airway', 'supraglottic airway', 'i-gel', 'LMA',
    'needle decompression', 'finger thoracostomy', 'chest seal', 'tourniquet', 'bleeding control',
    'direct pressure', 'wound packing', 'pacing', 'transcutaneous pacing', 'LUCAS', 'mechanical CPR',
    '12-lead ECG', '12 lead', '12-lead', 'ECG', 'EKG', 'posterior ECG', 'right-sided ECG',
    'pulse oximetry', 'capnography', 'blood glucose', 'glucose check', 'BGL', 'pulse check',
    'capillary refill', 'blood pressure', 'vital signs', 'vitals', 'vagal maneuver', 'Valsalva',
    'carotid massage', 'Heimlich', 'abdominal thrusts', 'back blows', 'chest thrusts',
    'spinal motion restriction', 'cervical collar', 'splint', 'splinting', 'traction splint',
    'fluid bolus', 'blood transfusion', 'nebulizer', 'nebulized treatment', 'sedation',
    'log roll', 'pelvic binder', 'irrigation', 'cooling', 'cath lab activation', 'STEMI alert',
    'cardiac monitor', 'cardiac monitoring', 'rhythm check', 'physical exam', 'reassessment',
    'foreign body removal', 'epistaxis control', 'glucometry', 'resuscitative thoracotomy',
    'fetal assessment', 'perimortem C-section', 'perimortem cesarean', 'emergency delivery',
    'shoulder dystocia maneuvers', 'McRoberts maneuver', 'cord prolapse management', 'fundal massage',
    'newborn resuscitation', 'neonatal resuscitation', 'decontamination', 'active rewarming',
    'active cooling', 'REBOA', 'precordial thump', 'manual decompression', 'capnography confirmation',
    'V4R ECG', 'posterior leads', 'right-sided leads',
  ];
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function pattern(terms) {
    return new RegExp('(?<![\\p{L}\\p{N}_])(?:' + [...new Set(terms.filter(Boolean))]
      .sort((a,b) => b.length-a.length).map(escape).join('|') + ')(?![\\p{L}\\p{N}_])', 'giu');
  }
  const clinical = pattern([...Object.keys(aliases), ...Object.values(aliases).flat(), ...procedures]);
  const generic = {
    crew: ['Partner', 'Captain', 'Teammate', 'Crew', 'Medic', 'Paramedic', 'EMT', 'Firefighter', 'Dispatch'],
    patient: ['Patient', 'Primary patient', 'Second patient', 'Patient 1', 'Patient 2'],
    bystander: ['Bystander', 'Wife', 'Husband', 'Mother', 'Father', 'Mom', 'Dad', 'Daughter', 'Son', 'Neighbor', 'Officer', 'Witness', 'Caregiver', 'Nurse', 'Doctor'],
    player: ['You', 'Player', 'Provider'],
  };
  function roleTerms(context) {
    const terms = new Map();
    for (const [role, names] of Object.entries(generic)) for (const name of names) terms.set(name.toLowerCase(), role);
    const named = [];
    for (const member of Object.values(context.crew || {})) if (member?.name) named.push([member.name, 'crew']);
    for (const patient of context.patients || []) if (patient.name) named.push([patient.name, 'patient']);
    for (const name of context.bystanders || []) named.push([name, 'bystander']);
    for (const [name, role] of named) {
      terms.set(name.toLowerCase(), role);
      const parts = name.split(/\s+/);
      for (const alias of new Set([parts[0], parts.at(-1)])) {
        if (alias.length > 1 && named.filter(([other]) => other.split(/\s+/).some(part => part.toLowerCase() === alias.toLowerCase())).length === 1) terms.set(alias.toLowerCase(), role);
      }
    }
    return terms;
  }
  function withSpeakers(text, context = {}) {
    const known = roleTerms(context);
    const bystanders = new Set(context.bystanders || []);
    for (const match of String(text).matchAll(/^\s*([^:\n]{1,80}):\s*(?=["“‘])/gmu)) {
      const name = match[1].trim();
      if (!known.has(name.toLowerCase()) && !pattern([...known.keys()]).test(name)) bystanders.add(name);
    }
    return { ...context, bystanders: [...bystanders] };
  }
  function segments(text, context = {}, player = false) {
    text = String(text);
    const colors = Array(text.length).fill(player ? 'player' : 'description');
    const paint = (start, end, role) => colors.fill(role, start, end);
    if (!player) {
      const terms = roleTerms(context);
      const roles = [...text.matchAll(pattern([...terms.keys()]))];
      for (const m of roles) paint(m.index, m.index + m[0].length, terms.get(m[0].toLowerCase()));
      // A speaker label owns its name and quotes, while action beats stay descriptive.
      const label = text.match(/^\s*([^:]{1,80}):\s*(?=["“‘])/u);
      const labelledRole = label && roles.find(m => m.index < label[0].length);
      const speakerRole = label ? (terms.get(label[1].trim().toLowerCase())
        || (labelledRole && terms.get(labelledRole[0].toLowerCase())) || 'bystander') : null;
      if (label) paint(0, label[0].length, speakerRole);
      for (const quote of text.matchAll(/"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’/gu)) {
        const end = quote.index + quote[0].length;
        const before = roles.filter(m => m.index < quote.index).at(-1);
        const after = roles.find(m => m.index >= end);
        // Inline attribution: Marcus says, “...” or “...,” Marcus says.
        const attribution = before && !/[.!?]/.test(text.slice(before.index + before[0].length, quote.index))
          ? before : after && /^[\s,，.—-]*$/u.test(text.slice(end, after.index))
            && /\b(?:says|said|asks|asked|replies|replied|whispers|shouts)\b/i.test(text.slice(after.index, after.index + after[0].length + 24)) ? after : null;
        paint(quote.index, end, speakerRole || (attribution ? terms.get(attribution[0].toLowerCase()) : 'bystander'));
      }
    }
    // Care terms remain identifiable in every speaker's dialogue and in actions.
    for (const m of text.matchAll(clinical)) {
      // Walking around is not transcutaneous pacing.
      if (/^pacing$/i.test(m[0]) && /^\s+(?:around|back|all|the (?:room|floor))\b/i.test(text.slice(m.index + m[0].length))) continue;
      paint(m.index, m.index + m[0].length, 'care');
    }
    const result = [];
    for (let start = 0; start < text.length;) {
      let end = start + 1;
      while (end < text.length && colors[end] === colors[start]) end++;
      result.push({ text: text.slice(start, end), role: colors[start] });
      start = end;
    }
    return result;
  }
  function render(element, text, context, player) {
    const doc = element.ownerDocument;
    element.replaceChildren();
    for (const part of segments(text, context, player)) {
      const span = doc.createElement('span');
      span.className = 'text-' + part.role;
      span.textContent = part.text;
      element.appendChild(span);
    }
  }
  return { segments, render, withSpeakers };
});
