'use strict';

(() => {
  const { resolve } = GloveboxCatalog;
  const button = document.getElementById('glovebox-btn');
  const dialog = document.getElementById('glovebox-dialog');
  const tray = document.getElementById('glovebox-tray');
  const tooltip = document.getElementById('glovebox-tooltip');
  const feedback = document.getElementById('glovebox-feedback');
  const dropZones = [...dialog.querySelectorAll('[data-destination]')];
  let callId = null;
  let view = null;
  let selected = null;
  let pending = false;
  let generation = 0;
  let layer = 0;
  let cancelDrag = null;
  let positions = {};
  const clamp = (value, max) => Math.max(0, Math.min(value, max));

  function revealLore() {
    const body = dialog.querySelector('.glovebox-body');
    const caption = dialog.querySelector('.glovebox-caption');
    const overflow = caption.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom;
    if (overflow > 0) body.scrollTop += overflow;
  }

  function savePositions() {
    try { sessionStorage.setItem(`ems_glovebox_positions:${callId}`, JSON.stringify(positions)); } catch { /* optional layout memory */ }
  }

  function place(node, x, y) {
    const maxX = Math.max(0, tray.clientWidth - node.offsetWidth);
    const maxY = Math.max(0, tray.clientHeight - node.offsetHeight);
    const left = clamp(x, maxX);
    const top = clamp(y, maxY);
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    positions[node.dataset.item] = { x: maxX ? left / maxX : 0, y: maxY ? top / maxY : 0 };
  }

  function inspect(node, item, audible = true) {
    if (audible) playSound('rummage');
    selected = item.id;
    tray.querySelectorAll('[aria-describedby]').forEach(other => other.removeAttribute('aria-describedby'));
    tray.querySelectorAll('.is-selected').forEach(other => other.classList.remove('is-selected'));
    document.getElementById('glovebox-empty').hidden = true;
    document.getElementById('glovebox-item-name').textContent = item.name;
    document.getElementById('glovebox-item-lore').textContent = item.lore;
    tooltip.hidden = false;
    node.setAttribute('aria-describedby', tooltip.id);
    node.classList.add('is-selected');
    node.style.zIndex = ++layer;
    node.classList.remove('is-jittering');
    void node.offsetWidth;
    if (audible) node.classList.add('is-jittering');
    dropZones.forEach(zone => { zone.disabled = pending; });
    if (audible) revealLore();
  }

  function destinationAt(x, y) {
    return dropZones.find(zone => {
      const box = zone.getBoundingClientRect();
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    });
  }

  async function sort(itemId, destination) {
    if (pending || !view?.active.includes(itemId)) return;
    pending = true;
    dropZones.forEach(zone => { zone.disabled = true; });
    const requestCall = callId;
    const requestGeneration = generation;
    const oldCount = view.active.length;
    feedback.textContent = destination === 'pocket' ? 'Tucking it away…' : 'Clearing it out…';
    try {
      const data = await apiPost(`/api/scenario/${encodeURIComponent(requestCall)}/glovebox`, { item: itemId, destination });
      updateProgress(data, requestCall);
      if (requestGeneration !== generation || requestCall !== callId) return;
      playSound(destination === 'pocket' ? 'pocket' : 'trash');
      selected = null;
      applyView(data.glovebox);
      const emerged = view.active.length >= oldCount;
      feedback.textContent = data.duplicate ? 'Already sorted. No double-dipping.' : `${data.awarded ? `+${data.awarded}` : '0'} XP · ${destination === 'pocket' ? 'Pocketed.' : 'Tossed.'}${emerged ? ' Something else slid out of the back.' : ''}`;
      dropZones.find(zone => zone.dataset.destination === destination).classList.add('just-sorted');
    } catch (error) {
      if (requestGeneration === generation) feedback.textContent = `${error.message} The item stays here; you can try again.`;
    } finally {
      if (requestGeneration === generation) {
        pending = false;
        dropZones.forEach(zone => { zone.disabled = !selected; });
      }
    }
  }

  function updateProgress(data, requestCall) {
    if (data.player && currentPlayer?.id === data.player.id) {
      currentPlayer = data.player;
      renderPlayer();
    } else if (data.progressScope === 'guest') {
      recordGuestProgress(requestCall, { gloveboxXP: data.glovebox.xp, pocket: data.glovebox.pocket.length, trash: data.glovebox.trash.length });
    }
  }

  function makeItem(item) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'glovebox-item';
    node.dataset.item = item.id;
    node.setAttribute('aria-label', item.name);
    node.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight');
    const tilt = [...item.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 21 - 10;
    node.style.setProperty('--tilt', `${tilt}deg`);
    node.innerHTML = `<svg viewBox="0 0 96 80" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${item.art}</svg>`;
    let drag = null;
    let dragged = false;
    let ghost = null;
    const finish = () => {
      if (drag && node.hasPointerCapture(drag.id)) node.releasePointerCapture(drag.id);
      drag = null;
      ghost?.remove();
      ghost = null;
      node.classList.remove('is-dragging');
      dropZones.forEach(zone => zone.classList.remove('is-over'));
      cancelDrag = null;
      savePositions();
    };
    node.addEventListener('pointerdown', event => {
      if (pending || !event.isPrimary || event.button !== 0) return;
      cancelDrag?.();
      dragged = false;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: node.offsetLeft, top: node.offsetTop };
      node.style.zIndex = ++layer;
      node.setPointerCapture(event.pointerId);
      cancelDrag = finish;
    });
    node.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!dragged && Math.hypot(dx, dy) > 6) {
        dragged = true;
        playSound('rummage');
        inspect(node, item, false);
        ghost = document.createElement('div');
        ghost.className = 'glovebox-drag-ghost';
        ghost.setAttribute('aria-hidden', 'true');
        ghost.innerHTML = node.innerHTML;
        dialog.appendChild(ghost);
        node.classList.add('is-dragging');
        node.classList.remove('is-jittering');
      }
      if (!dragged) return;
      ghost.style.left = `${event.clientX - 44}px`;
      ghost.style.top = `${event.clientY - 40}px`;
      place(node, drag.left + dx, drag.top + dy);
      const target = destinationAt(event.clientX, event.clientY);
      dropZones.forEach(zone => zone.classList.toggle('is-over', zone === target));
    });
    node.addEventListener('pointerup', event => {
      if (!drag) return;
      const target = dragged && destinationAt(event.clientX, event.clientY);
      finish();
      if (target) sort(item.id, target.dataset.destination);
    });
    node.addEventListener('pointercancel', () => { dragged = true; finish(); });
    node.addEventListener('lostpointercapture', () => { if (drag) finish(); });
    node.addEventListener('click', event => {
      if (pending || (dragged && event.detail !== 0)) return;
      inspect(node, item);
    });
    node.addEventListener('keydown', event => {
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!direction || pending) return;
      event.preventDefault();
      place(node, node.offsetLeft + direction[0] * 12, node.offsetTop + direction[1] * 12);
      savePositions();
    });
    node.addEventListener('animationend', () => node.classList.remove('is-jittering'));
    return node;
  }

  function applyView(next) {
    view = next;
    const focusedItem = document.activeElement?.classList.contains('glovebox-item');
    for (const node of tray.querySelectorAll('.glovebox-item')) {
      if (!view.active.includes(node.dataset.item)) node.remove();
    }
    const slots = view.active.length === 2 ? [[.08, .05], [.85, .88]] : [[.02, .02], [.97, .06], [.49, .95]];
    view.active.forEach((id, index) => {
      let node = tray.querySelector(`[data-item="${id}"]`);
      if (!node) {
        node = makeItem(resolve(id, view.note));
        node.classList.add('is-emerging');
        tray.appendChild(node);
      }
      const position = positions[id] || { x: slots[index]?.[0] || .5, y: slots[index]?.[1] || .5 };
      place(node, position.x * (tray.clientWidth - node.offsetWidth), position.y * (tray.clientHeight - node.offsetHeight));
    });
    if (!selected || !view.active.includes(selected)) {
      selected = null;
      tooltip.hidden = true;
      const empty = document.getElementById('glovebox-empty');
      empty.hidden = false;
      empty.textContent = view.active.length ? '' : 'Just crumbs now.';
    }
    document.getElementById('glovebox-xp').textContent = `${view.xp} XP`;
    document.getElementById('glovebox-pocket-count').textContent = `${view.pocket.length} kept`;
    document.getElementById('glovebox-trash-count').textContent = `${view.trash.length} tossed`;
    const list = document.getElementById('glovebox-inventory-list');
    list.replaceChildren();
    for (const id of view.pocket) {
      const item = resolve(id, view.note);
      const li = document.createElement('li');
      const inspectButton = document.createElement('button');
      inspectButton.type = 'button';
      inspectButton.className = 'glovebox-kept';
      inspectButton.innerHTML = `<svg viewBox="0 0 96 80" aria-hidden="true">${item.art}</svg>`;
      const name = document.createElement('span');
      name.textContent = item.name;
      inspectButton.appendChild(name);
      inspectButton.addEventListener('click', () => {
        playSound('rummage');
        selected = null;
        document.getElementById('glovebox-empty').hidden = true;
        document.getElementById('glovebox-item-name').textContent = item.name;
        document.getElementById('glovebox-item-lore').textContent = item.lore;
        tooltip.hidden = false;
        dropZones.forEach(zone => { zone.disabled = true; });
        revealLore();
      });
      li.appendChild(inspectButton);
      list.appendChild(li);
    }
    if (!view.pocket.length) {
      const li = document.createElement('li');
      li.textContent = 'Empty pockets. For once.';
      list.appendChild(li);
    }
    dropZones.forEach(zone => { zone.disabled = pending || !selected; });
    if (focusedItem && !document.activeElement?.classList.contains('glovebox-item')) (tray.querySelector('button') || document.getElementById('glovebox-close')).focus({ preventScroll: true });
    savePositions();
  }

  button.addEventListener('click', async () => {
    if (dialog.open) return;
    if (!sessionId) return;
    playSound('glovebox');
    const requestGeneration = ++generation;
    pending = false;
    if (callId !== sessionId) {
      callId = sessionId;
      view = null;
      selected = null;
      positions = {};
      try { positions = JSON.parse(sessionStorage.getItem(`ems_glovebox_positions:${callId}`)) || {}; } catch { /* default placement */ }
      tray.replaceChildren();
      document.getElementById('glovebox-inventory').open = false;
      document.getElementById('glovebox-inventory-list').replaceChildren();
      document.getElementById('glovebox-pocket-count').textContent = '0 kept';
      document.getElementById('glovebox-trash-count').textContent = '0 tossed';
      document.getElementById('glovebox-xp').textContent = '0 XP';
    }
    tooltip.hidden = true;
    selected = null;
    dropZones.forEach(zone => { zone.disabled = true; });
    document.getElementById('glovebox-empty').hidden = false;
    document.getElementById('glovebox-empty').textContent = 'Opening the compartment…';
    feedback.textContent = '';
    dialog.showModal();
    if (view) applyView(view);
    const requestCall = callId;
    try {
      const data = await apiGet(`/api/scenario/${encodeURIComponent(requestCall)}/glovebox`);
      if (requestGeneration !== generation || !dialog.open) return;
      if (!data.glovebox) throw new Error('Could not load this call’s glovebox. Close it and try again.');
      updateProgress(data, requestCall);
      applyView(data.glovebox);
    } catch (error) {
      if (requestGeneration === generation) {
        feedback.textContent = error.message;
        if (!view) document.getElementById('glovebox-empty').textContent = 'The compartment is stuck. Close it and try again.';
      }
    }
  });
  dropZones.forEach(zone => {
    zone.addEventListener('click', () => { if (selected) sort(selected, zone.dataset.destination); });
    zone.addEventListener('animationend', () => zone.classList.remove('just-sorted'));
  });
  document.getElementById('glovebox-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { cancelDrag?.(); savePositions(); button.focus({ preventScroll: true }); });
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  new ResizeObserver(() => {
    if (!dialog.open) return;
    tray.querySelectorAll('.glovebox-item').forEach(node => {
      const position = positions[node.dataset.item];
      if (position) place(node, position.x * (tray.clientWidth - node.offsetWidth), position.y * (tray.clientHeight - node.offsetHeight));
    });
  }).observe(tray);
})();
