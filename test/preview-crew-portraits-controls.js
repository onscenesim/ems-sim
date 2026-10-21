'use strict';
(async () => {
  const roster = await fetch('/__preview/crew-data').then(response => response.json());
  const custom = { name: 'Custom crew member', role: 'partner', custom: true,
    personality_notes: 'A custom crew member keeps their own identity and behavior description.' };
  const controls = document.createElement('section');
  controls.style.cssText = 'padding:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;border-bottom:1px solid #607680;flex-shrink:0;font:16px var(--font-xp);color:var(--reference-text);background:var(--reference-bg)';
  const label = document.createElement('label');
  label.textContent = 'Portrait review ';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Preview crew member');
  select.style.cssText = 'max-width:100%;padding:8px;font:inherit';
  const members = [...roster, custom];
  for (const member of members) select.appendChild(new Option(member.name, member.name));
  label.appendChild(select);
  controls.appendChild(label);
  const theme = document.createElement('button');
  theme.textContent = 'Toggle light mode';
  theme.style.cssText = 'padding:8px;font:inherit';
  theme.onclick = () => document.body.classList.toggle('light-mode');
  controls.appendChild(theme);
  const shift = document.createElement('button');
  shift.textContent = 'Show full shift';
  shift.style.cssText = 'padding:8px;font:inherit';
  shift.onclick = () => {
    populateCrewPanel({
      partner: roster.find(person => person.role === 'partner'),
      captain: roster.find(person => person.role.startsWith('captain')),
    });
    crewPanelBody.scrollTop = 0;
    showCrewPanel();
  };
  controls.appendChild(shift);
  const mobile = document.createElement('a');
  mobile.textContent = '390px mobile preview';
  mobile.href = '/mobile';
  mobile.style.color = 'inherit';
  controls.appendChild(mobile);
  const gallery = document.createElement('a');
  gallery.textContent = 'All portraits';
  gallery.href = '/gallery';
  gallery.style.color = 'inherit';
  controls.appendChild(gallery);
  terminal.prepend(controls);
  startScreen.style.display = 'none';
  terminal.style.display = 'flex';
  userInput.disabled = true;
  document.getElementById('send-btn').disabled = true;
  const note = document.createElement('p');
  note.style.cssText = 'padding:24px;line-height:1.6;color:var(--reference-text)';
  note.textContent = 'Review all 21 identities using the selector, then close and reopen Crew using the real header control. Paramedics wear gold patches; EMTs wear white. Captains wear white shirts. No live call or player saves.';
  output.appendChild(note);
  function displayMember() {
    const member = members.find(person => person.name === select.value);
    populateCrewPanel(member.role.startsWith('captain') ? { captain: member } : { partner: member });
    crewPanelBody.scrollTop = 0;
    showCrewPanel();
  }
  select.addEventListener('change', displayMember);
  displayMember();
})();
