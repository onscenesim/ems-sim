'use strict';

(() => {
  const { pens, stickers, normalize, validate } = CosmeticsCatalog;
  const dialog = document.getElementById('cosmetics-dialog');
  const select = document.getElementById('scratch-pen');
  const status = document.getElementById('cosmetics-status');
  const apply = document.getElementById('cosmetics-apply');
  const noteInput = document.getElementById('cosmetics-note');
  let draft = null;
  let drawerOwner = null;
  let saving = false;
  const xp = () => currentPlayer?.stats?.xp || (!currentPlayer ? guestProgressStats().xp : 0);
  const completed = () => (currentPlayer?.stats || guestProgressStats()).scenariosCompleted || 0;
  const unlocked = item => item.xp <= allowance() && (currentPlayer?.cosmeticsUnlocked === true || completed() >= (item.runs || 0));
  const requirement = item => `${item.xp} XP${item.runs ? ` + ${item.runs} completed scenarios` : ''}`;
  const owner = () => currentPlayer?.id || 'guest';
  const allowance = () => currentPlayer?.cosmeticsUnlocked === true ? Infinity : xp();
  function selection() {
    let saved = currentPlayer?.cosmetics;
    if (!currentPlayer) {
      try { saved = JSON.parse(localStorage.getItem('ems_guest_cosmetics') || '{}'); } catch { saved = {}; }
    }
    return normalize(saved, xp(), currentPlayer?.cosmeticsUnlocked === true, completed());
  }

  function noteImage(message) {
    // User text is inserted into SVG text nodes, never interpolated as markup.
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 240 180');
    const paper = document.createElementNS(ns, 'path');
    paper.setAttribute('d', 'M30 8h180v142l-24 23H30z');
    paper.setAttribute('fill', '#e8d57d');
    paper.setAttribute('stroke', '#faf0ca');
    paper.setAttribute('stroke-width', '6');
    svg.appendChild(paper);
    const fold = document.createElementNS(ns, 'path');
    fold.setAttribute('d', 'm186 173 1-24h23');
    fold.setAttribute('fill', '#fbebb0');
    svg.appendChild(fold);
    const text = (value, y, size) => {
      const node = document.createElementNS(ns, 'text');
      node.setAttribute('x', '120'); node.setAttribute('y', y);
      node.setAttribute('text-anchor', 'middle'); node.setAttribute('font-family', 'monospace');
      node.setAttribute('font-size', size); node.setAttribute('fill', '#354452');
      node.textContent = value;
      svg.appendChild(node);
    };
    text('NOTE TO SELF', 31, 10);
    const words = (message || 'Your note here.').match(/.{1,19}(?:\s|$)|.{1,19}/g) || [];
    words.slice(0, 5).forEach((line, index) => text(line.trim(), 57 + index * 20, 13));
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  }

  function picture(sticker, note) {
    const image = document.createElement('img');
    image.className = `sticker-art sticker-art-${sticker.id}`;
    image.alt = sticker.id === 'custom-note' ? `Post-it: ${note || 'Your note here.'}` : sticker.name;
    image.src = sticker.id === 'custom-note' ? noteImage(note) : sticker.src;
    image.width = 240;
    image.height = 180;
    image.draggable = false;
    return image;
  }

  function refresh() {
    const selected = selection();
    const availableXP = allowance();
    select.replaceChildren(...pens.map(pen => {
      const option = document.createElement('option');
      option.value = pen.id;
      option.textContent = pen.xp > availableXP ? `${pen.name} · ${pen.xp} XP` : pen.name;
      option.disabled = pen.xp > availableXP;
      return option;
    }));
    select.value = selected.pen;
    select.style.setProperty('--ink-color', pens.find(pen => pen.id === selected.pen).color);
    select.disabled = saving;
    const notebook = document.getElementById('notepad-stickers');
    notebook.replaceChildren();
    selected.stickers.forEach(id => {
      const sticker = stickers.find(item => item.id === id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'notepad-sticker';
      button.setAttribute('aria-label', `Change sticker: ${sticker.name}`);
      button.setAttribute('aria-haspopup', 'dialog');
      button.title = id === 'custom-note' ? selected.note : sticker.name;
      button.appendChild(picture(sticker, selected.note));
      button.addEventListener('click', open);
      notebook.appendChild(button);
    });
    const count = stickers.filter(item => unlocked(item)).length + pens.filter(item => unlocked(item)).length;
    document.getElementById('cosmetics-unlocked-count').textContent = `${count} / ${pens.length + stickers.length} unlocked`;
    document.getElementById('notepad-personalization').classList.toggle('has-stickers', selected.stickers.length > 0);
    if (dialog.open && drawerOwner !== owner()) {
      dialog.close();
    } else if (dialog.open && !saving) renderDrawer();
  }

  function renderDrawer() {
    const availableXP = allowance();
    document.getElementById('cosmetics-xp').textContent = currentPlayer?.cosmeticsUnlocked ? 'ADMIN · ALL COSMETICS UNLOCKED' : `${xp()} LIFETIME XP`;
    document.getElementById('cosmetics-slot-count').textContent = `${draft.stickers.length} / 2 stickers`;
    const upcoming = [...pens, ...stickers].filter(item => !unlocked(item)).sort((a, b) => a.xp - b.xp)[0];
    document.getElementById('cosmetics-next-unlock').textContent = upcoming ? `Next: ${requirement(upcoming)}` : 'Collection complete';
    const penCase = document.getElementById('cosmetics-pens');
    if (!penCase.children.length) {
      pens.forEach(pen => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'cosmetic-pen'; button.dataset.pen = pen.id;
        const swatch = document.createElement('span');
        swatch.className = 'cosmetic-ink'; swatch.style.background = pen.color;
        button.appendChild(swatch);
        const label = document.createElement('span'); label.textContent = pen.name;
        button.appendChild(label);
        const cost = document.createElement('small'); cost.className = 'cosmetic-cost'; button.appendChild(cost);
        button.addEventListener('click', () => { draft.pen = pen.id; status.textContent = ''; renderDrawer(); });
        penCase.appendChild(button);
      });
    }
    for (const pen of pens) {
      const button = penCase.querySelector(`[data-pen="${pen.id}"]`);
      button.disabled = saving || pen.xp > availableXP;
      button.setAttribute('aria-pressed', String(draft.pen === pen.id));
      button.querySelector('small').textContent = pen.xp > availableXP ? `${pen.xp} XP` : draft.pen === pen.id ? 'Selected' : 'Unlocked';
    }
    const grid = document.getElementById('cosmetics-sticker-grid');
    if (!grid.children.length) {
      stickers.forEach(sticker => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'cosmetic-sticker'; button.dataset.sticker = sticker.id;
        button.appendChild(picture(sticker, draft.note));
        const name = document.createElement('strong'); name.textContent = sticker.name;
        const cost = document.createElement('span'); cost.className = 'cosmetic-cost';
        button.append(name, cost);
        button.addEventListener('click', () => {
          if (draft.stickers.includes(sticker.id)) draft.stickers = draft.stickers.filter(id => id !== sticker.id);
          else if (draft.stickers.length === 2) { status.textContent = 'Two stickers fit. Deselect one to make room.'; return; }
          else draft.stickers.push(sticker.id);
          status.textContent = '';
          renderDrawer();
          if (sticker.id === 'custom-note' && draft.stickers.includes('custom-note')) {
            document.getElementById('cosmetics-note-editor').scrollIntoView({ block: 'nearest' });
            noteInput.focus({ preventScroll: true });
          }
        });
        grid.appendChild(button);
      });
    }
    for (const sticker of stickers) {
      const button = grid.querySelector(`[data-sticker="${sticker.id}"]`);
      const selected = draft.stickers.includes(sticker.id);
      const locked = !unlocked(sticker);
      button.disabled = saving || locked;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('is-locked', locked);
      button.querySelector('.cosmetic-cost').textContent = locked ? requirement(sticker) : selected ? '✓ Equipped on apply' : 'Unlocked · select';
      if (sticker.id === 'custom-note') {
        const image = button.querySelector('img');
        image.src = noteImage(draft.note); image.alt = `Post-it: ${draft.note}`;
      }
    }
    document.getElementById('cosmetics-note-editor').hidden = !draft.stickers.includes('custom-note');
    document.getElementById('cosmetics-note-count').textContent = `${draft.note.length} / 80`;
    apply.disabled = saving;
    noteInput.disabled = saving;
  }

  function open() {
    if (dialog.open || saving) return;
    draft = selection();
    drawerOwner = owner();
    noteInput.value = draft.note;
    status.textContent = '';
    renderDrawer();
    dialog.showModal();
    dialog.querySelector('.cosmetics-scroll').scrollTop = 0;
  }

  async function save(next) {
    const valid = validate(next, xp(), currentPlayer?.cosmeticsUnlocked === true, completed());
    const savingFor = owner();
    saving = true;
    select.disabled = true;
    if (dialog.open) renderDrawer();
    try {
      if (currentPlayer) {
        const data = await apiPost('/api/auth/cosmetics', valid);
        if (owner() !== savingFor) throw new Error('The player changed. Reopen the drawer for this player.');
        // Do not replace unrelated progress with an older cosmetics response.
        currentPlayer.cosmetics = data.player.cosmetics;
      } else {
        localStorage.setItem('ems_guest_cosmetics', JSON.stringify(valid));
      }
    } finally {
      saving = false;
      refresh();
    }
  }

  select.addEventListener('change', async () => {
    const message = document.getElementById('scratch-pen-status');
    message.textContent = 'Saving ink…';
    try { await save({ ...selection(), pen: select.value }); message.textContent = ''; }
    catch (error) { message.textContent = error.message; }
  });
  noteInput.addEventListener('input', () => { draft.note = noteInput.value; renderDrawer(); });
  apply.addEventListener('click', async () => {
    status.textContent = 'Saving your kit…';
    try { await save(draft); dialog.close(); }
    catch (error) { status.textContent = error.message; }
  });
  document.getElementById('cosmetics-close').addEventListener('click', () => dialog.close());
  document.getElementById('progress-cosmetics').addEventListener('click', open);
  document.getElementById('notepad-stickers-edit').addEventListener('click', open);
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  window.addEventListener('storage', event => {
    if (!currentPlayer && ['ems_guest_cosmetics', 'ems_guest_progress'].includes(event.key)) refresh();
  });
  window.EMSCosmetics = { refresh, ink: () => pens.find(pen => pen.id === selection().pen).color };
  refresh();
})();
