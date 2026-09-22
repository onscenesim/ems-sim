'use strict';

(() => {
  // Tiny hand-drawn sprites share a 96 × 80 canvas. All markup is local artwork.
  const paper = (inside) => `<path d="M23 5h43l9 12-3 56-51-2 3-30-5-14z" fill="#ddd8bd"/><path d="m66 5-1 14 10-2M24 41l20-7 28 11M44 34l-4 35" fill="none" stroke="#b6b197"/>${inside}`;
  const lines = '<path d="M30 37h28M30 43h33M30 49h25M30 60h19" stroke="#868c89" stroke-width="2"/>';
  const packet = (color, inside) => `<path d="m26 10 5 3 5-3 5 3 5-3 5 3 5-3 5 3 6-3-2 60-5-3-5 3-5-3-5 3-5-3-5 3-5-3-6 3z" fill="${color}"/><path d="M29 19h34M27 61h34" stroke="#ffffff55"/>${inside}`;
  const label = (text, x, y, size = 8, color = '#344047') => `<text x="${x}" y="${y}" fill="${color}" stroke="none" font-family="monospace" font-weight="bold" font-size="${size}" text-anchor="middle">${text}</text>`;
  const items = [
    {
      id: 'shears', name: "Captain Holt’s off-brand folding Raptor shears",
      lore: 'The logo says “RAPTURE.” The hinge says otherwise. These could only be Captain Holt’s.',
      art: '<path d="m40 44 30-32 8-2-5 12-26 29M43 43 5-33 6 7-3 36" fill="#a5b7ba"/><path d="m40 40 10 13M39 47l-8 8" stroke="#56686c" stroke-width="7"/><path d="M31 47c-19-6-25 18-9 23 14 4 23-16 9-23zM52 48c17-10 32 10 18 20-12 8-28-11-18-20z" fill="#b27838"/><path d="M28 54c-8-3-13 9-5 11 7 2 13-8 5-11zM56 54c8-4 16 5 9 9-7 4-16-5-9-9z" fill="#1b2325"/><circle cx="44" cy="45" r="4" fill="#d9dddd"/>',
    },
    {
      id: 'napkins', name: 'A stack of napkins',
      lore: 'From at least four different drive-throughs. The closest thing this truck has to a linen service.',
      art: '<path d="m15 25 57-8 10 43-59 9z" fill="#a99d7b"/><path d="m12 19 59-6 10 43-61 9z" fill="#d3c7a4"/><path d="m15 15 58-5 7 41-60 8z" fill="#e4dbbe"/><path d="m19 22 51-5 5 30-50 7zM44 18l5 34" fill="none" stroke="#c2b694" stroke-dasharray="2 2"/>',
    },
    {
      id: 'glove', name: 'One extra-small glove',
      lore: 'Fatima brings these from home. Apparently “one size fits all” is a promise the supply room can’t keep.',
      art: '<path d="m35 67-7-21-11-13q-3-8 4-7l12 11-6-24q0-8 6-5l9 23-2-27q3-7 7-1l5 26 3-24q4-6 7 1l-1 27 6-15q6-4 7 3l-5 27-12 17 2 8z" fill="#9bafd6"/><path d="m36 62 23-3M38 42l13 10 11-16" stroke="#6e80ab" fill="none"/>',
    },
    {
      id: 'coins', name: 'Some crusty coins',
      lore: 'Eighty-seven cents, a little verdigris, and something that used to be a mint. Your retirement fund.',
      art: '<g stroke="#66563b" stroke-width="2"><ellipse cx="32" cy="49" rx="17" ry="13" fill="#aa8650"/><ellipse cx="59" cy="52" rx="16" ry="12" fill="#999c90"/><ellipse cx="48" cy="31" rx="16" ry="13" fill="#bd9b65"/></g><g fill="none" stroke="#d1b581"><ellipse cx="32" cy="47" rx="12" ry="8"/><ellipse cx="48" cy="29" rx="11" ry="8"/></g><path d="m21 45 5-3 4 5-6 4M50 22l8 3-3 6-6-2M61 49l8 2-3 5" fill="#75866b"/>',
    },
    {
      id: 'ekg', name: 'A crumpled 12-lead EKG',
      lore: 'Flawless baseline. Every patient field filled in. Even the time is correct. This can only be Captain Yolanda Ferris’s work.',
      art: '<path d="m5 21 23-8 22 8 23-6 16 6-5 42-20-5-20 8-20-8-17 5z" fill="#efdbce"/><path d="M10 32h74M9 42h76M9 52h75M20 21v37M30 21v40M40 23v38M50 23v40M60 22v38M70 21v38M80 24v34" stroke="#d5aba4" stroke-width=".6"/><path d="M11 38h10l3-4 3 5 3-15 3 24 3-10h11l3-4 3 5 3-15 3 24 3-10h19M10 53h14l3-4 3 4 3-9 3 16 3-7h17l3-4 3 4 3-9 3 16 3-7h9" stroke="#565052" fill="none" stroke-width="1.2"/><path d="m28 13-4 44M50 21l-6 45M73 15l-9 43" stroke="#b7a494" fill="none"/>' + label('FERRIS / 12:04', 49, 19, 5),
    },
    {
      id: 'eightball', name: 'A magic 8-ball',
      lore: '“Ask again after shift change.” Finally, a second opinion everyone can agree on.',
      art: '<circle cx="48" cy="40" r="30" fill="#101519" stroke="#434d56" stroke-width="2"/><path d="M26 30q4-15 19-16" stroke="#64717a" stroke-width="3" fill="none"/><circle cx="49" cy="36" r="15" fill="#e1e0ce"/>' + label('8', 49, 44, 24, '#192128'),
    },
    {
      id: 'granola', name: 'A granola bar',
      lore: 'Emergency rations. Compressed oats, chocolate chips, and the hope of getting a real meal before midnight.',
      art: '<path d="m9 26 6 3 4-5 5 3 55-6 7 30-6-2-3 5-5-2-56 7z" fill="#8d9c68"/><path d="m25 29 40-4 6 27-40 4z" fill="#ded4ac"/><path d="m30 43 8-7 8 4 8-6 10 9-5 7-25 2z" fill="#b58b52"/><path d="m39 40 3 3m8-3 3 4m4-1 3 3" stroke="#624631" stroke-width="3"/>' + label('OATS', 46, 34, 7),
    },
    {
      id: 'hot-sauce', name: 'A packet of hot sauce',
      lore: 'For station food, gas-station food, and anything else that needs to taste like a different decision.',
      art: packet('#b84e39', '<path d="M39 32q23-11 17 9-5 13-20 12 11-7 3-21" fill="#e9874b"/><path d="m43 31 8-7" stroke="#859866" stroke-width="3"/>' + label('HOT', 47, 59, 7, '#f2ddb2')),
    },
    {
      id: 'uncrustable', name: 'An empty Uncrustables bag',
      lore: 'Still smeared with peanut butter. Danny’s favorite snack, preserved here as a greasy little crime scene.',
      art: '<path d="m13 17 13 4 9-6 13 5 15-4 20 3-6 45-14-3-13 6-16-4-20 1z" fill="#b5c2c5" fill-opacity=".8"/><path d="m19 27 57-2-3 26-54 4z" fill="#607ba0"/><ellipse cx="47" cy="40" rx="19" ry="12" fill="#ddd8b5"/><path d="m25 54 19-4 9 5-9 7-17-3M61 28l11 5-3 9-8-4" fill="#a47445"/>' + label('PB &amp; J', 47, 42, 7),
    },
    {
      id: 'aux', name: 'A broken AUX cord',
      lore: 'It only works if you hold it at an angle. That angle has not been discovered.',
      art: '<path d="M24 28C3 63 44 76 51 47S87 25 76 59" fill="none" stroke="#111619" stroke-width="7"/><path d="M24 28C3 63 44 76 51 47S87 25 76 59" fill="none" stroke="#62656b" stroke-width="2"/><path d="m21 30 6-15 9 4-6 16zM68 55l13 1-1 10-13-1z" fill="#364048"/><path d="m29 15 3-9 5 2-3 9" fill="#c5b075"/><path d="m70 66-4 7m8-7 3 9" stroke="#be8a5b" stroke-width="2"/>',
    },
    {
      id: 'hazmat', name: '2012 hazardous materials book',
      lore: 'Orange cover. Fire diamond. Fourteen years of “we should probably replace that.” Somehow still holding the compartment shut.',
      art: '<path d="M23 10h52v61H23z" fill="#a84929"/><path d="M26 8h47v59H26z" fill="#dc8644"/><path d="M29 64h43v5H29z" fill="#d9d2ae"/><path d="M26 8v55" stroke="#f0ad61" stroke-width="3"/><path d="m50 27 13 13-13 13-13-13z" fill="#ece3c6"/><path d="m50 27 13 13H37z" fill="#b74435"/><path d="m37 40 13 13V27z" fill="#4d7eab"/><path d="m63 40-13 13V27z" fill="#d4b854"/><path d="m50 27 13 13-13 13-13-13zM37 40h26M50 27v26" fill="none" stroke="#493f34"/>' + label('HAZMAT', 50, 20, 8) + label('2012', 50, 60, 8),
    },
    {
      id: 'glasses', name: 'Destiny Okafor’s reading glasses',
      lore: 'Destiny has been looking for these all shift. She has checked on everyone else at least twice in the meantime.',
      art: '<path d="m14 36 7-19 13-2M79 36l-8-19-12-2" fill="none" stroke="#b08b73" stroke-width="4"/><path d="M11 34h30v20H15zM55 34h30l-4 20H55z" fill="#b1d2d5" fill-opacity=".25" stroke="#b8866b" stroke-width="4"/><path d="M41 38q7-7 14 0M19 40l10 9M62 40l10 9" stroke="#d5c5ac" stroke-width="2" fill="none"/>',
    },
    {
      id: 'divorce', name: 'Captain Frank Delucci’s divorce papers',
      lore: 'Folded, unfolded, and folded again. Delucci was never quite the same after the divorce.',
      art: paper(lines + label('DISSOLUTION', 47, 25, 6) + label('OF MARRIAGE', 47, 32, 6) + '<path d="m39 61 5-6 3 8 6-5 7 2" fill="none" stroke="#45577d"/>'),
    },
    {
      id: 'electrolytes', name: 'A flavored electrolyte packet',
      lore: '“Tropical rescue.” It tastes like someone described a mango to a bag of salt.',
      art: packet('#659c9d', '<path d="m49 23-12 19h10l-4 15 17-23H49l5-11z" fill="#e3d39a"/>' + label('HYDRATE', 47, 60, 6, '#edf0d3')),
    },
    {
      id: 'straw', name: 'A straw still in its wrapper',
      lore: 'Pristine. Unopened. The only thing in here that has its life together.',
      art: '<path d="m14 60 60-47 9 11-60 47z" fill="#e1dbc4"/><path d="m19 59 55-42 4 5-55 43z" fill="#bdc3b6"/><path d="m16 57 9 10M70 17l8 10" stroke="#aea993" stroke-dasharray="2 2"/>',
    },
    {
      id: 'stethoscope', name: 'Priya Nair’s Cardiology IV stethoscope',
      lore: 'Priya spent way too much on this. The acoustics are excellent. The monthly payments are less soothing.',
      art: '<path d="M27 35v13c0 28 43 28 43 4V40" fill="none" stroke="#9275a5" stroke-width="7"/><path d="M15 14v16q0 15 13 15t13-15V14" fill="none" stroke="#b9c4c7" stroke-width="4"/><path d="M15 13h6M35 13h6" stroke="#282d35" stroke-width="7" stroke-linecap="round"/><circle cx="70" cy="33" r="12" fill="#b9c4c7"/><circle cx="70" cy="33" r="8" fill="#55696f"/><path d="M64 29q7-5 11 2" stroke="#d1d9d6" stroke-width="2" fill="none"/>',
    },
    {
      id: 'vape', name: 'Tyler Beaumont’s vape',
      lore: 'He says it isn’t his. It is labeled “TYLER” in his handwriting.',
      art: '<path d="M40 9h17v13H40z" fill="#263337"/><rect x="33" y="21" width="32" height="47" rx="5" fill="#789e99"/><path d="M37 25v36" stroke="#aac0ac" stroke-width="3"/><rect x="41" y="45" width="16" height="10" fill="#d0ccb1"/>' + label('TYLER', 49, 52, 5) + '<circle cx="49" cy="32" r="3" fill="#d6e5bc"/>',
    },
    {
      id: 'pen', name: 'A dried-out ballpoint pen',
      lore: 'The entire crew has tried it, shaken it, and put it back. The cycle continues.',
      art: '<path d="m23 61 43-46 8 8-43 46z" fill="#c3ba9c"/><path d="m58 23 14-15 11 10-14 16z" fill="#476487"/><path d="m66 18 7 7-15 15" stroke="#91a4b7" stroke-width="2" fill="none"/><path d="m23 61-5 14 13-6z" fill="#899295"/><path d="m18 75 3-8 5 5z" fill="#272d34"/>',
    },
    {
      id: 'va-letter', name: 'Darnell Hughes’s VA benefits rejection',
      lore: 'Another rejection. Darnell folded it small enough to disappear under a pile of napkins. He hasn’t brought it up.',
      art: paper(lines + label('VA BENEFITS', 47, 22, 6) + '<path d="m27 27 38-2 1 12-38 2z" fill="none" stroke="#a35d4b"/>' + label('DENIED', 47, 34, 8, '#a35d4b')),
    },
    {
      id: 'photo', name: 'Walt and Frank, back on the line',
      lore: 'Walt Garside and Frank Delucci as happy line firemen. Arms around shoulders, grinning at the camera. Oh, how the mighty have fallen.',
      art: '<path d="m12 9 73 6-5 59-72-6z" fill="#dedac0"/><path d="m18 15 60 5-3 40-60-5z" fill="#879186"/><path d="M19 25h55v16H19z" fill="#985a45"/><path d="m22 53 1-16h20l3 18M48 55V39h19l5 18" fill="#b59a5f"/><path d="m24 45 18 1m8 1 18 1" stroke="#d9c796" stroke-width="3"/><circle cx="33" cy="32" r="8" fill="#c8a17b"/><circle cx="57" cy="34" r="8" fill="#d6b18b"/><path d="M23 28h21l-4-7H28zM47 30h21l-5-8H52z" fill="#d3bd74"/><path d="m29 34 4 2 4-2m16 2 4 2 4-2" fill="none" stroke="#735341"/>' + label('THE GOOD YEARS', 46, 65, 5),
    },
    {
      id: 'incident', name: 'A coffee-stained incident report',
      lore: 'Bo Hendricks started this. The coffee finished more of it than he did.',
      art: paper(label('INCIDENT REPORT', 47, 24, 5) + '<path d="M29 31h34v29H29zM29 39h34M29 48h34M40 31v29" stroke="#8e9590" fill="none"/><path d="m32 35 6-1 5 2" stroke="#4c6689" fill="none"/><circle cx="62" cy="53" r="14" fill="none" stroke="#a37b4c" stroke-width="4" opacity=".65"/><path d="m66 61 5 3-4 5-6-4z" fill="#a37b4c" opacity=".5"/>'),
    },
  ];

  const button = document.getElementById('glovebox-btn');
  const dialog = document.getElementById('glovebox-dialog');
  const tray = document.getElementById('glovebox-tray');
  const tooltip = document.getElementById('glovebox-tooltip');
  const hint = document.getElementById('glovebox-hint');
  let layer = 0;
  const positions = new Map();
  const clamp = (value, max) => Math.max(0, Math.min(value, max));

  function place(node, x, y) {
    const maxX = Math.max(0, tray.clientWidth - node.offsetWidth);
    const maxY = Math.max(0, tray.clientHeight - node.offsetHeight);
    const left = clamp(x, maxX);
    const top = clamp(y, maxY);
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    positions.set(node, { x: maxX ? left / maxX : 0, y: maxY ? top / maxY : 0 });
  }

  function inspect(node, item) {
    tray.querySelectorAll('[aria-describedby]').forEach(other => other.removeAttribute('aria-describedby'));
    document.getElementById('glovebox-empty').hidden = true;
    document.getElementById('glovebox-item-name').textContent = item.name;
    document.getElementById('glovebox-item-lore').textContent = item.lore;
    tooltip.hidden = false;
    node.setAttribute('aria-describedby', tooltip.id);
    node.style.zIndex = ++layer;
    node.classList.remove('is-jittering');
    void node.offsetWidth; // Restart the short animation on repeated inspection.
    node.classList.add('is-jittering');
  }

  function makeItem(item) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'glovebox-item';
    node.dataset.item = item.id;
    node.setAttribute('aria-label', item.name);
    node.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight');
    node.style.setProperty('--tilt', `${Math.round(Math.random() * 20 - 10)}deg`);
    node.innerHTML = `<svg viewBox="0 0 96 80" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${item.art}</svg>`;
    let drag = null;
    let dragged = false;
    node.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      dragged = false;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: node.offsetLeft, top: node.offsetTop };
      node.style.zIndex = ++layer;
      node.setPointerCapture(event.pointerId);
    });
    node.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 6) dragged = true;
      if (!dragged) return;
      node.classList.add('is-dragging');
      node.classList.remove('is-jittering');
      place(node, drag.left + dx, drag.top + dy);
    });
    const finishDrag = () => { drag = null; node.classList.remove('is-dragging'); };
    node.addEventListener('pointerup', finishDrag);
    node.addEventListener('pointercancel', () => { dragged = true; finishDrag(); });
    node.addEventListener('lostpointercapture', finishDrag);
    node.addEventListener('click', event => {
      if (dragged && event.detail !== 0) return;
      inspect(node, item);
    });
    node.addEventListener('keydown', event => {
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      place(node, node.offsetLeft + direction[0] * 12, node.offsetTop + direction[1] * 12);
    });
    node.addEventListener('animationend', () => node.classList.remove('is-jittering'));
    return node;
  }

  button.addEventListener('click', () => {
    if (dialog.open) return;
    playSound('glovebox');
    tooltip.hidden = true;
    document.getElementById('glovebox-empty').hidden = false;
    tray.replaceChildren();
    positions.clear();
    layer = 0;
    dialog.showModal();
    // Sample without replacement; a new assortment on every opening.
    const pool = [...items];
    const count = 2 + Math.floor(Math.random() * 2);
    const slots = count === 2 ? [[.17, .23], [.8, .68]] : [[.08, .14], [.91, .24], [.45, .94]];
    for (let i = 0; i < count; i++) {
      const item = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const node = makeItem(item);
      tray.appendChild(node);
      const [x, y] = slots[i];
      place(node, x * (tray.clientWidth - node.offsetWidth), y * (tray.clientHeight - node.offsetHeight));
    }
  });
  document.getElementById('glovebox-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => button.focus({ preventScroll: true }));
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Tab' || event.key.startsWith('Arrow')) hint.textContent = 'Enter to inspect · Arrow keys to move · Esc to close';
  });
  dialog.addEventListener('pointerdown', () => { hint.textContent = 'Tap to inspect · Hold and drag to rummage'; });
  new ResizeObserver(() => {
    if (!dialog.open) return;
    positions.forEach((position, node) => {
      place(node, position.x * (tray.clientWidth - node.offsetWidth), position.y * (tray.clientHeight - node.offsetHeight));
    });
  }).observe(tray);
})();
