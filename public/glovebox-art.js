'use strict';

// Local vector illustrations. Each object keeps its own material definitions so
// the same artwork works in the tray, drag ghost, inventory and study gallery.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GloveboxArt = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const art = {};
  const text = (value, x, y, size = 5, color = '#39424a', extra = '') => `<text x="${x}" y="${y}" ${extra.includes('font-family=') ? '' : 'font-family="Arial,sans-serif"'} font-size="${size}" font-weight="700" text-anchor="middle" fill="${color}" ${extra}>${value}</text>`;
  const path = (d, color = '#818b87', width = .65, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  const gradient = (id, colors, radial = false) => {
    const tag = radial ? 'radialGradient' : 'linearGradient';
    return `<${tag} id="${id}" ${radial ? 'cx="32%" cy="24%" r="78%"' : 'x1="0" y1="0" x2="1" y2=".3"'}>${colors.map((color, i) => `<stop offset="${i / (colors.length - 1)}" stop-color="${color}"/>`).join('')}</${tag}>`;
  };
  function draw(id, inside) {
    const materials = {
      steel: ['#5e6b73', '#e4ebea', '#87999e', '#d0d9d7', '#48575f'],
      dark: ['#11191e', '#455159', '#202a30', '#10171d'],
      paper: ['#e1d6ba', '#faf2dc', '#ded1b3'],
      glass: ['#8ba9b55c', '#e5f7f080', '#8aa8b524', '#d6f4ed80'],
      blue: ['#172c49', '#41658b', '#253f62', '#10273c'],
      pink: ['#904268', '#ecacca', '#c3709c', '#713650'],
      rubber: ['#5d4675', '#b797c9', '#85669c', '#513d65'],
      sphere: ['#6b7a87', '#19232c', '#03080e'],
    };
    const used = new Set();
    const body = inside(name => { used.add(name); return `url(#gb-${id}-${name})`; });
    const defs = [...used].map(name => gradient(`gb-${id}-${name}`, materials[name], name === 'sphere')).join('');
    art[id] = `<defs>${defs}</defs><g stroke-linejoin="round" stroke-linecap="round">${body}</g>`;
    return art[id];
  }
  const screw = (x, y, r = 1.5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#abb9bb" stroke="#45555d" stroke-width=".5"/>${path(`m${x - r * .55} ${y + r * .3} ${r * 1.1} ${-r * .6}`, '#46545a', .6)}`;
  const barcode = (x, y, width = 30, height = 7) => `<g fill="#3e494a">${Array.from({ length: 20 }, (_, i) => `<rect x="${x + i * width / 20}" y="${y}" width="${i % 3 === 0 ? 1 : .5}" height="${height}"/>`).join('')}</g>`;
  const print = (x, y, width = 30, rows = 4, color = '#9a9d90') => path(Array.from({ length: rows }, (_, i) => `M${x} ${y + i * 3}h${width - (i === rows - 1 ? 7 : i % 2 * 3)}`).join(''), color, .55);
  function paper(id, content, { fold = true, color } = {}) {
    return draw(id, r => `<path d="m22 7 46 1 7 10-3 53-49 1-3-28 2-18-3-6z" fill="#675e472e" transform="translate(1 2)"/><path d="m22 6 46 1 7 10-3 53-49 1-3-28 2-18-3-6z" fill="${color || r('paper')}" stroke="#b7ad94" stroke-width=".65"/>${path('m68 7-1 11 8-1', '#b7ad94')}${path('m67 18 7-1-6-9', '#fff7e4', .8)}${content}${fold ? `<path d="m21 43 26-6 26 6-26-2-24 6z" fill="#73664e12"/>${path('m22 43 25-4 26 4M47 10l-1 28 2 31', '#a69a7e', .45)}${path('m23 44 24-4 25 4M48 10l-1 28 2 30', '#fff9e4', .7)}` : ''}${path('m25 9 11 1M24 65l1 3 8-1m31 1 5-1 1-6', '#c8b99a', .55)}`);
  }
  function packet(id, colors, content) {
    return draw(id, r => `${gradient(`gb-${id}-foil`, colors)}<path d="m27 8 4 2 4-2 4 2 4-2 4 2 4-2 4 2 4-2 4 2 5-2-2 64-5-2-4 2-4-2-4 2-4-2-4 2-4-2-5 2z" fill="url(#gb-${id}-foil)" stroke="${colors[0]}" stroke-width=".7"/>${path('M29 15h36M28 64h35', '#ffffff65', .65)}${path('M30 17l-1 44m34-43-2 43', '#00000025', .8)}${path('m31 11 1 2m4-2 1 2m4-2 1 2m4-2 1 2m4-2 1 2m4-2 1 2m4-2 1 2M29 68l2 1m3-1 2 1m3-1 2 1m3-1 2 1m3-1 2 1m3-1 2 1', '#ffffff50', .6)}${content(r)}${path('m29 22 5 9-4 7m32 14-5 6 5 3', '#fff9d538', .7)}`);
  }

  // Folded rescue shears: one large handle ring and nested blades, like Holt's reference.
  draw('shears', r => `<g transform="rotate(-6 48 40)">
    <path d="m12 45 57-8 20 2 3 13-12 7-60 2-9-5z" fill="${r('steel')}" stroke="#68777d" stroke-width=".7"/>
    <path d="m22 52 50-7 13 1-5 10-58 3z" fill="#ccd5d4"/>
    ${path('m28 57 46-3 8-5M15 53l2 5 9 1', '#f5f7ed', .7)}
    ${text('DINOSAUR', 61, 56.5, 4.3, '#29363c', 'letter-spacing=".2"')}
    ${Array.from({length: 19}, (_,i) => path(`M${39+i*2} 59v-${i%5===0 ? 1.5 : .7}`, '#4f5b5f', .45)).join('')}
    <path d="M47 23 78 29q11-3 15 9l-1 11-10 4-35-11-8-12z" fill="${r('steel')}" stroke="#76848a" stroke-width=".8"/>
    <path d="m49 26 28 5-4 13-20-6z" fill="#f3f5ee"/>
    <path d="m49 29 9 3 6 8-8-2-3 5-4-3 4-4z" fill="#4d595d" stroke="#98a7ab" stroke-width=".65"/>
    <path d="m68 31 8 1-1 4-8-1z" fill="#536065" stroke="#e4ece7" stroke-width=".65"/>
    <path d="m42 39 13 3 25 5 7-1-2 6-8 1-34-9z" fill="${r('dark')}" stroke="#778389" stroke-width=".6"/>
    ${path('m49 41 30 10 5-1', '#b0b7b64d', .8)}
    <path d="M8 34q8-15 27-14l13 3 3 14-8 14-20 9H8l-4-9-3-5 1-8zM29 28c21-1 15 28-1 27-20 0-19-27 1-27z" fill="${r('dark')}" fill-rule="evenodd" stroke="#5a656b" stroke-width=".8"/>
    <path d="M31 19c-29-1-35 39-9 44 27 5 43-40 9-44zm-2 9c21-1 15 28-1 27-20 0-19-27 1-27z" fill="${r('dark')}" fill-rule="evenodd" stroke="#59656a" stroke-width=".8"/>
    ${path('M12 33q7-12 21-11M11 51q3 7 12 9M35 29q10 8 3 19', '#8b9598', .65)}
    <path d="m3 41-3 2 3 2z" fill="#b1bdbb"/>
    <circle cx="80" cy="39" r="7" fill="${r('steel')}" stroke="#a7b5b6" stroke-width=".7"/>
    ${screw(80,39,2.5)}${screw(72,51,3.6)}${screw(88,47,1.5)}
    ${path('m86 31 4 4m-1 3 2 4', '#fafaf0', .7)}
  </g>`);

  draw('napkins', r => `<path d="m13 23 60-9 9 44-62 12z" fill="#9e8d68"/><path d="m12 19 61-8 8 44-62 11z" fill="#c6b58e" stroke="#a99673" stroke-width=".5"/>${path('m17 62 62-10M17 59l62-10M15 55l62-10', '#dfcfa9', .7)}<path d="m14 14 59-7 7 43-61 12z" fill="${r('paper')}" stroke="#c4b697" stroke-width=".7"/><path d="m43 11 6 44-3 1-5-44z" fill="#b7a58233"/>${path('m44 12 6 41M20 18l48-6 5 33-49 9z', '#b9ac8e', .6, 'stroke-dasharray=".4 1.7"')}${path('m20 21 4 28M24 18l42-5M25 55l47-9', '#fff9e6', .8)}<ellipse cx="65" cy="41" rx="5" ry="3" fill="#b99e6120"/>${path('m21 39 10 1 5 5m24-25 6 2', '#c8b994', .4)}`);

  function glove(id, color, ink = '') {
    draw(id, r => `${gradient(`gb-${id}-latex`, color)}<path d="m35 66-6-20-12-15c-3-5 1-9 5-5l11 10-6-22c-2-7 4-10 7-3l8 20-2-25c0-7 7-7 8-1l4 25 3-23c1-6 7-5 7 1l-1 27 6-15c3-6 8-3 6 3l-5 25-11 16 2 9-25 3z" fill="url(#gb-${id}-latex)" stroke="${color[0]}" stroke-width=".65"/>${path('m35 65 21-4m-20 7 21-4M33 39l7 6 4 8m17-16-5 12-8 8m-9-17 5 2m4-5 5 2m-18 9 4 6', color[0], .7)}${path('m30 15 6 18m8-25 3 23m12-20-2 23M20 30l10 11m8 23 16-4', '#e9f5ff80', .9)}<path d="m37 69 21-5 1 6-20 4z" fill="#f3edff22"/>${ink}`);
  }
  glove('glove', ['#5e7eac', '#c1d4f1', '#95b3de', '#7593c1']);
  glove('phone-glove', ['#457d96', '#a4d5e4', '#74aabe', '#5489a4'], `${text('555–0142', 47, 51, 4.7, '#31475e', 'transform="rotate(-8 47 51)" font-style="italic"')}${path('M48 58c-7-9-12 0 0 6 12-6 7-15 0-6', '#334b69', 1.3)}`);

  draw('coins', () => {
    // Three quarters, a dime and two pennies: the lore's 87 cents in US change.
    // Faces, relief and thin milled edges replace the oversized game-token numerals.
    const coin = (id, x, y, radius, copper, reverse = false, rotation = 0) => {
      const light = copper ? '#b4896b' : '#c1c4be';
      const shade = copper ? '#73533f' : '#747d7a';
      const face = copper ? ['#80624c','#b99b80','#9c795d'] : ['#838d89','#c9cec6','#a1aaa3'];
      const bust = copper
        ? 'M-2-8q6-3 8 2l-1 3 3 3-3 1v4L2 7l1 3 5 3H-8l3-6 2-2v-4q-4-2-2-7z'
        : 'M2-9q-8-1-7 6l-2 4 3 1v3l3 2v3l-6 3H9l-5-5V3q4-3 2-8z';
      const relief = reverse
        ? copper
          ? `<path d="M-8-3H8v9H-8zM-10 8h20m-18-13h16L0-9z" fill="${shade}" stroke="${light}" stroke-width=".45"/>${path('M-5-2v7m3-7v7m4-7v7m3-7v7', light, .8)}${text('ONE CENT',0,12,2.7,shade)}`
          : `<path d="m0-7 3 4 8-3-3 6-6 2 4 7-6-2-6 2 4-7-6-2-3-6 8 3z" fill="${shade}" stroke="${light}" stroke-width=".55"/>${path('m-8-3 5 3m11-3-5 3M-3 6h6',light,.55)}${text('QUARTER DOLLAR',0,13,2.1,shade)}`
        : `<path d="${bust}" fill="${shade}" stroke="${light}" stroke-width=".65"/><path d="${bust}" fill="${light}" opacity=".5" transform="translate(.45 -.4)"/>${path(copper ? 'M-3-5 6-3M-1 8l3 2' : 'M-3-5q3-4 7-1M0 4l3 1m-1 4 3 2',shade,.5)}${text(copper ? '2006' : '1998',0,14,2.5,shade)}`;
      return `<g transform="translate(${x} ${y}) rotate(${rotation}) scale(${radius/18} ${radius/18*.88})">
        ${gradient(`gb-coins-${id}`,face)}
        <circle cy="1" r="18" fill="${shade}" stroke="#424d47" stroke-width=".5"/>
        <circle r="18" fill="url(#gb-coins-${id})" stroke="${light}" stroke-width=".7"/>
        <circle r="16.5" fill="none" stroke="${shade}" stroke-width=".4"/>
        ${!copper ? Array.from({length:46},(_,i) => `<path d="M0-17.1v-.7" stroke="${shade}" stroke-width=".45" transform="rotate(${i*360/46})"/>`).join('') : ''}
        <path id="gb-coins-${id}-legend" d="M-14 0a14 14 0 0 1 28 0" fill="none"/>
        <text font-family="Georgia,serif" font-size="2.9" fill="${shade}" letter-spacing=".4"><textPath href="#gb-coins-${id}-legend" startOffset="50%" text-anchor="middle">${reverse ? 'UNITED STATES' : 'LIBERTY'}</textPath></text>
        ${relief}
        ${path('m-12 6 2 2m20-17 2 1m-7 13 1 1',shade,.35)}
        <path d="m-10-10 2 1-2 2-2-1zm18 19 2-1 1 2-2 1z" fill="${copper ? '#58736044' : '#515d4b25'}"/>
      </g>`;
    };
    return coin('quarter-a',29,26,17,false,false,-18) + coin('quarter-b',65,28,16,false,true,15)
      + coin('penny-a',22,52,12,true,false,-15) + coin('penny-b',43,30,11,true,true,28)
      + coin('quarter-c',45,53,18,false,false,12) + coin('dime',72,57,13,false,false,-22);
  });

  draw('ekg', r => `<path d="m6 18 19-7 22 7 23-6 20 6-4 46-20-5-21 8-21-8-18 6z" fill="#f5e6d9" stroke="#baa99a" stroke-width=".5"/>${Array.from({ length: 25 }, (_, i) => path(`M${9 + i * 3} 21v39`, '#dba5a0', i % 5 === 0 ? .45 : .2)).join('')}${Array.from({ length: 14 }, (_, i) => path(`M9 ${21 + i * 3}h77`, '#dba5a0', i % 5 === 0 ? .45 : .2)).join('')}${text('12-LEAD ECG  •  25 mm/s  10 mm/mV', 47, 22, 2.4)}${text('FERRIS, Y.   11:42   SINUS RHYTHM', 45, 26, 2.2)}${[0, 1, 2].map(row => [0, 1, 2, 3].map(col => `<g transform="translate(${10 + col * 19} ${32 + row * 9})">${text(['I', 'aVR', 'V1', 'V4', 'II', 'aVL', 'V2', 'V5', 'III', 'aVF', 'V3', 'V6'][row * 4 + col], 1, -1, 2)}${path('M0 3h4l1-1 1 1 1-6 1 10 1-4h3l2-2 2 2h2', '#4f4947', .5)}</g>`).join('')).join('')}<path d="m25 11-1 48 4 1 1-47zM47 18l-2 49 5-2 1-46zM70 12l-4 47 4 1 4-47z" fill="#7761481a"/>${path('m25 12-1 46M47 19l-2 46M70 13l-4 44', '#a89582', .55)}${path('m26 13-1 44M48 20l-2 44M71 14l-4 42', '#fff6e9', .8)}`);

  draw('eightball', r => `<circle cx="48" cy="41" r="31" fill="${r('sphere')}" stroke="#7b888c" stroke-width=".6"/><path d="M24 32q5-18 23-19" fill="none" stroke="#d9e5e6" stroke-opacity=".5" stroke-width="2.5"/><path d="M26 25q3-5 8-7" fill="none" stroke="#fff" stroke-opacity=".65" stroke-width="1.2"/><ellipse cx="49" cy="36" rx="15.5" ry="16" fill="#e3e3d7" stroke="#131e24" stroke-width="1.2"/>${text('8', 49, 46, 27, '#172028')}${path('M25 58q14 16 33 9', '#647581', .5)}${path('m64 52 3-1m-9 11 2-1', '#75828d', .5)}`);

  draw('granola', r => `${gradient('gb-granola-wrap', ['#455e38', '#94a561', '#63793f', '#374e32'])}<path d="m8 26 5 2 3-3 4 2 57-7 9 30-5-1-2 4-5-2-56 8z" fill="url(#gb-granola-wrap)" stroke="#3f5333" stroke-width=".7"/><path d="m23 28 43-5 7 28-43 5z" fill="${r('paper')}"/>${path('m13 30 7 23M16 29l7 23M77 26l6 19m-9-18 5 20', '#c7cf8c', .6)}${text('TRAIL &amp; FIELD', 45, 31, 3.3, '#4b5b36', 'transform="rotate(-7 45 31)"')}${text('OATS &amp; HONEY', 47, 37, 4.3, '#3f4d2e', 'transform="rotate(-7 47 37)"')}<path d="m31 44 29-4 7 7-4 5-28 3-5-6z" fill="#ab7b42" stroke="#7c592d" stroke-width=".5"/>${Array.from({ length: 17 }, (_, i) => `<ellipse cx="${34 + (i * 7) % 28}" cy="${45 + (i * 3) % 7}" rx="1.6" ry=".75" fill="${i % 3 ? '#d9b979' : '#745232'}" transform="rotate(${i * 17} ${34 + (i * 7) % 28} ${45 + (i * 3) % 7})"/>`).join('')}${path('m22 33 4 11-2 7M68 27l-1 11 5 9', '#fff7cb55', .65)}`);

  packet('hot-sauce', ['#7c231c', '#e05b3f', '#b83525', '#85261f'], () => `<rect x="34" y="22" width="26" height="37" rx="9" fill="#f6d9ac" stroke="#eeae71" stroke-width=".8"/>${text('FIRELINE', 47, 30, 4, '#a13624')}${text('HOT SAUCE', 47, 54, 4.1, '#a13624')}<path d="M41 36q14-6 14 0c-1 9-10 13-16 12 6-2 7-6 2-12z" fill="#c73f2d" stroke="#92271b" stroke-width=".6"/>${path('m47 35 3-5 4 1', '#49794b', 1.2)}${text('NET WT 7 g', 47, 62, 2.2, '#fce4bb')}`);

  draw('uncrustable', r => `${gradient('gb-uncrustable-wrap', ['#7f97b4', '#d6e2e455', '#adc9d9aa', '#7291b5'])}<path d="m12 15 14 4 10-5 13 4 17-4 18 5-5 45-15-2-14 6-15-5-22 2z" fill="url(#gb-uncrustable-wrap)" stroke="#b2c8d1" stroke-width=".6"/><path d="m18 25 59-2-4 31-55 3z" fill="#335f99" stroke="#7396bd" stroke-width=".6"/>${text('soft &amp; crustless', 47, 31, 2.6, '#e2e8dc')}<ellipse cx="47" cy="42" rx="21" ry="11" fill="#eee0b9" stroke="#d9b87e"/>${text('Uncrustables', 47, 42, 6, '#365884', 'font-style="italic"')}${text('PEANUT BUTTER &amp; GRAPE', 47, 48, 2.3, '#715236')}<path d="m22 55 12-4 7 3 10-1-7 9-15-1zM65 29l8 4-2 11-6-4z" fill="#ae7a416b"/>${path('m17 18 10 12-5 15 5 16M49 19l-5 10m30 18-10 6 1 10M15 21l8 1m-8 38 11-1m48-39 5 1', '#eef9ef99', 1)}${path('m27 33 3 15-8 7m44-31-3 14 8 10', '#233f6644', .7)}`);

  draw('aux', r => `${path('M25 28C5 51 21 73 39 64S43 32 62 31 83 47 74 61', '#0c1115', 5.5)}${path('M25 28C5 51 21 73 39 64S43 32 62 31 83 47 74 61', '#58616a', 2)}${path('M24 29C8 51 22 69 37 62', '#889296', .6)}<g transform="rotate(24 26 25)"><rect x="21" y="14" width="10" height="19" rx="2" fill="${r('dark')}" stroke="#718087" stroke-width=".6"/><rect x="23.5" y="3" width="5" height="13" rx="1" fill="#d3b473" stroke="#6e6247" stroke-width=".5"/>${path('M24 7h4m-4 4h4', '#252c30', 1.3)}${path('M23 19v9m1 5v4m3-4v4', '#6b747a', .6)}</g><path d="m69 53 11 3-2 11-12-4z" fill="${r('dark')}" stroke="#7d8788" stroke-width=".6"/>${path('m69 64-4 8m9-7 2 9', '#d89c64', 1.3)}${path('m70 65-1 9m3-8 1 8', '#8f5556', .75)}${path('m68 60 9 2', '#8b999b', .55)}`);

  function book(id, cover, content, pages = true) {
    draw(id, r => `${gradient(`gb-${id}-cover`, cover)}<path d="M23 9h49l4 4v59H25l-5-4V12z" fill="${cover[0]}" stroke="#101a2244" stroke-width=".7"/>${pages ? `<path d="m26 65 48-1v6H26z" fill="${r('paper')}"/>${path('M28 66h43m-42 2h43', '#aaa48f', .45)}` : ''}<path d="M23 7h49v58H23q-4 1-3 4V11q0-4 3-4z" fill="url(#gb-${id}-cover)" stroke="${cover[0]}" stroke-width=".7"/>${path('M26 9v54', '#ffffff25', .8)}${content(r)}${path('m29 9 6 1m32-1 3 1v6M23 53v8m44 1 3-1v-4', '#e3cfaa66', .65)}`);
  }
  book('hazmat', ['#8c3b1e', '#ef9b42', '#d9762b', '#b75527'], () => `${text('EMERGENCY RESPONSE', 49, 16, 3, '#4e321e')}${text('GUIDEBOOK', 49, 22, 5.2, '#4e321e')}<path d="m49 27 13 13-13 13-13-13z" fill="#f3e4b6" stroke="#5d4c33" stroke-width=".6"/><path d="m49 27 13 13H36z" fill="#b94937"/><path d="m36 40 13 13V27z" fill="#40799f"/><path d="m49 53 13-13H49z" fill="#dbb854"/>${path('M36 40h26M49 27v26', '#4c4939', .5)}${text('3', 43, 42, 4, '#eceddf')}${text('2', 49, 36, 4, '#fff0ce')}${text('0', 55, 42, 4)}${text('2012', 49, 60, 6.5, '#603d25')}`);

  draw('glasses', r => `${path('m17 38 7-20q2-4 10-4m43 24-9-21-11-3', '#49352d', 2.8)}${path('m18 36 7-18 8-2m42 20-8-18-9-3', '#c49b79', 1)}<path d="M12 34q14-5 29 0l-1 17q-13 6-25-1zM55 34q15-5 29 0l-3 16q-12 7-25 1z" fill="${r('glass')}" stroke="#956b54" stroke-width="2.7"/>${path('M41 36q7-5 14 0M11 34h5m65 0h5', '#c39777', 2)}${path('m18 37 8-2m-7 3 12 11m30-12 10 10M17 51q10 3 20-1m22 0q11 3 19-1', '#e2e8d9b3', .75)}${screw(15, 35, .8)}${screw(81, 35, .8)}${path('M19 33q9-3 19 0m20 0q12-3 22 0', '#edcaa0', .6)}`);

  paper('divorce', `${text('SUPERIOR COURT', 47, 20, 3.5)}${text('PETITION FOR DISSOLUTION', 47, 26, 3.1)}${text('OF MARRIAGE', 47, 31, 4.1)}${path('M29 34h35', '#555d5b', .6)}${print(29, 38, 33, 6)}${text('DELUCCI, FRANK', 43, 58, 2.7, '#6b756f')}${path('m30 64 5-5 1 7 4-4 4 2 2-5 1 6 5-3 7 2', '#4f6484', .8)}${path('M29 67h34', '#999e91', .5)}`);
  packet('electrolytes', ['#286a76', '#81c8c6', '#55a5af', '#297382'], () => `${text('REPLENISH', 47, 25, 4.5, '#eff5da')}${text('ELECTROLYTE MIX', 47, 31, 2.6, '#e5f0dc')}<path d="m48 34-9 13h8l-3 11 13-17h-9l5-7z" fill="#f6dda0" stroke="#fff1b2" stroke-width=".6"/>${text('LEMON · LIME', 47, 62, 2.5, '#f0f4d8')}${path('M34 19h25', '#ceeee3', .5)}`);

  draw('straw', r => `<g transform="rotate(51 48 40)"><path d="m43 1 3 1 2-1 2 1 3-1 1 76-3-1-2 1-2-1-3 1z" fill="${r('paper')}" stroke="#b4af96" stroke-width=".5"/><path d="M47 7h4v64h-4z" fill="#bcbfb04d"/>${path('M46 5v68M52 5v68', '#faf4df', .65)}${path('M44 5h9m-9 68h9M44 3h9m-9 72h9', '#a8a58e', .5)}${text('SANITARY • WRAPPED', 49, 43, 2, '#75968a', 'transform="rotate(90 49 43)"')}${path('m44 26 3 3-3 5m9 23-2 4 2 5', '#b1a88c', .5)}</g>`);

  draw('stethoscope', r => `${path('M29 39v10c0 29 42 29 42 3V39', '#3d2c50', 7)}${path('M29 39v10c0 29 42 29 42 3V39', r('rubber'), 5)}${path('M28 46c-2 21 23 29 34 18', '#cdb7dc88', .85)}${path('M16 13v16c0 10 7 15 13 15s13-5 13-15V13', '#45545e', 4)}${path('M16 13v16c0 10 7 15 13 15s13-5 13-15V13', r('steel'), 2.7)}${path('M16 13h4M38 13h4', '#141d24', 5)}${path('M16 12h3m20 0h3', '#68757b', 1.2)}<rect x="26" y="38" width="6" height="8" rx="1.5" fill="#665174"/>${path('M70 38v9', '#a4b3b6', 4)}<circle cx="71" cy="31" r="12" fill="${r('steel')}" stroke="#3e515a" stroke-width=".8"/><circle cx="71" cy="31" r="8.8" fill="#263c49" stroke="#dfebe9" stroke-width="1"/><circle cx="71" cy="31" r="7" fill="#566c79"/>${path('M65 28q5-6 11-1', '#b7d0d4', .65)}${text('IV', 71, 34, 3.7, '#dbe4df')}`);

  draw('vape', r => `${gradient('gb-vape-body', ['#355d5d', '#a6c3b1', '#79a594', '#386465'])}<path d="M40 8q9-5 17 0v17H40z" fill="${r('dark')}" stroke="#76918a" stroke-width=".5"/><ellipse cx="48.5" cy="8" rx="8.5" ry="3" fill="#17232b" stroke="#60737b" stroke-width=".7"/><ellipse cx="48.5" cy="8" rx="4.5" ry="1.3" fill="#080e15"/><rect x="33" y="22" width="32" height="48" rx="6" fill="url(#gb-vape-body)" stroke="#456a66" stroke-width=".7"/>${path('M36 29v32m3-36h19M36 65q12 4 25 0', '#c7dec766', .75)}<circle cx="49" cy="33" r="3.5" fill="${r('steel')}" stroke="#466763" stroke-width=".65"/><rect x="40" y="44" width="18" height="12" rx="1.5" fill="#203936" stroke="#85a99b" stroke-width=".7"/>${text('23.0 W', 49, 49, 3.6, '#b8d9bf')}${path('M43 52h5m3 0h4', '#b8d9bf', .5)}${text('TYLER', 49, 63, 3.4, '#264944')}${path('M46 68h6', '#183d3d', 1.5)}`);

  draw('pen', r => `<g transform="rotate(43 48 40)"><path d="M44 23h8v37l-4 12-4-12z" fill="${r('glass')}" stroke="#a6b7b3" stroke-width=".6"/><path d="M48 24v37" stroke="#3d5979" stroke-width="1.6"/><path d="m44 59 4 13 4-13z" fill="${r('steel')}" stroke="#7b8788" stroke-width=".4"/><path d="m47 69 1 5 1-5" fill="#202c36"/><rect x="43" y="7" width="10" height="25" rx="2" fill="${r('blue')}" stroke="#6c8a9b" stroke-width=".6"/>${path('M46 9v19', '#c5dde06b', .7)}${path('M51 10h3v19l-3 3', '#a5b6ba', 1.2)}${path('M43 29h10M45 35v21', '#ecf1dc66', .6)}${text('EMS', 48, 43, 2.5, '#345273', 'transform="rotate(90 48 43)"')}</g>`);

  paper('va-letter', `${text('DEPARTMENT OF', 48, 18, 3)}${text('VETERANS AFFAIRS', 48, 23, 3.5)}${path('M29 27h36', '#7e8580', .65)}${print(29, 31, 34, 4)}<g transform="rotate(-9 48 49)"><rect x="28" y="43" width="39" height="12" rx="1" fill="#b4543a0a" stroke="#a35743" stroke-width="1.1"/>${text('DENIED', 47.5, 51.5, 7.5, '#a35743')}</g>${print(29, 59, 32, 2)}${text('HUGHES, D.', 42, 67, 2.5, '#606e6b')}`);
  paper('incident', `${text('INCIDENT REPORT', 47, 19, 4)}${text('UNIT 06   /   HENDRICKS, B.', 47, 24, 2.3)}${path('M28 28h37v34H28zM28 35h37M28 42h37M28 49h37M28 56h37M39 28v34', '#8c948b', .5)}${path('m30 32 4-1 2 2m6-1 6-1 3 1m-20 7 5-1m6 1 8-1 5 1', '#4e6e8b', .65)}<path d="M71 50a12 12 0 1 0-7 14" fill="none" stroke="#a075414f" stroke-width="3"/><path d="m65 60 7 3-2 6-10-3z" fill="#ae814838"/><circle cx="58" cy="60" r="1.2" fill="#a075414f"/>`);

  // Photograph emulsion, scuffed edges and miniature uniform details.
  draw('photo', r => `<g transform="rotate(5 48 40)">
    <path d="M8 8h80v64H8z" fill="${r('paper')}" stroke="#ada58c" stroke-width=".7"/>
    <path d="M13 13h70v45H13z" fill="#9ba79b"/>
    <path d="M13 28h70v30H13z" fill="#894b3b"/>
    ${path('M13 35h70M13 44h70M13 52h70M23 28v7m14 0v9m15-16v7m16 0v9M26 44v8m30-8v8', '#ba7b5d55', .6)}
    <rect x="43" y="20" width="34" height="30" rx="3" fill="#a84936"/>
    <rect x="48" y="23" width="18" height="10" rx="1" fill="#4e6872"/>
    ${path('M45 40h32', '#deca9f', 2)}
    <g data-crew="Walt Garside">
      <path d="m17 57 2-17 11-5 12 3 7 19" fill="#b3985d" stroke="#70613f" stroke-width=".7"/>
      <path d="m23 43 17 2m-19 6 23 3" fill="none" stroke="#dfd2a0" stroke-width="2.8"/>
      ${path('m23 43 17 2m-19 6 23 3', '#929d82', .65)}
      <path d="M23 25q2-9 13-6l4 8-2 8-3-1-9-2-3 2z" fill="#70513b"/>
      <path d="M24 26q7-8 14 0v8q-1 8-7 8t-8-8z" fill="#c69a72" stroke="#a77d59" stroke-width=".45"/>
      <ellipse cx="23.5" cy="31.5" rx="1.3" ry="2.3" fill="#bd8e68"/>
      <ellipse cx="38.5" cy="31.5" rx="1.3" ry="2.3" fill="#bd8e68"/>
      ${path('m25 29 4-1m4 0 3 1M27 31h1m6 0h1M31 31l-1 3h2', '#5f4935', .65)}
      <path d="m25.5 35.2 2.5-1.8 3 .9 2.8-.9 2.7 1.8-2.4 1.3-3.1-.8-3.2.8z" fill="#68432d"/>
      ${path('M28 38q3 2 6 0', '#faf0d0', .8)}
      <path d="M19 25l5-10 12-1 8 10-2 3-23-1z" fill="#c4aa62" stroke="#79633d" stroke-width=".65"/>
      ${path('m22 23 18 1m-14-7-2 5m11-5 3 6', '#e5cf88', .7)}
      <path d="M27 17h7v7h-7z" fill="#6b6242" stroke="#f2dda0" stroke-width=".45"/>
      ${text('6',30.5,22,4,'#f2dda0')}
      ${path('M24 28v3m14-3v3', '#795136', .8)}
    </g>
    <g data-crew="Frank Delucci">
      <path d="M55 23q7-8 15 0l3 18-5 3-14-2z" fill="#c1a06a" stroke="#947545" stroke-width=".5"/>
      ${path('m56 27-1 13m3-13-1 14m12-14 2 13', '#ebd5a1', .75)}
      <path d="m48 57 2-16 12-5 12 4 5 17" fill="#b5a16b" stroke="#74653f" stroke-width=".7"/>
      <path d="m53 45 21 1m-24 7 27 2" fill="none" stroke="#e6d9a9" stroke-width="2.8"/>
      ${path('m53 45 21 1m-24 7 27 2', '#a2a48b', .65)}
      <path d="M57 24q6-5 12 1v10q-1 7-6 7t-7-8z" fill="#f0d4b9" stroke="#c8aa89" stroke-width=".45"/>
      <ellipse cx="56.5" cy="31.5" rx="1.1" ry="2" fill="#dbb997"/>
      <ellipse cx="69" cy="31.5" rx="1.1" ry="2" fill="#dbb997"/>
      ${path('m58 29 3-.7m4 .2 2 .7', '#b38d53', .7)}
      ${path('M59 31h1m6 0h1M63 31l-1 3h2', '#827263', .6)}
      ${path('M58.8 36h3M64 36h3', '#b69558', .75)}
      ${path('M60 38q3 2 6 0', '#a87565', .65)}
      <path d="m51 24 4-10 13 1 8 11-2 2-24-1z" fill="#d8bc74" stroke="#8e7549" stroke-width=".65"/>
      ${path('m53 24 19 2m-13-9-2 6m10-5 3 6', '#f1dea1', .7)}
      <path d="m60 17 7 1-1 7-7-1z" fill="#7d6c43" stroke="#f2dda0" stroke-width=".45"/>
      ${text('6',63,23,4,'#f2dda0')}
    </g>
    <path d="M38 41q10-9 19 0" fill="none" stroke="#b7a16c" stroke-width="5"/>
    ${path('M39 39q9-6 16 1', '#ddc991', .8)}
    ${text('Walt &amp; Frank · B shift, 1998',48,65,3.5,'#6d6958','font-style="italic"')}
    ${path('m10 10 7 1m61 0 7 1v7M10 62l1 7 7 1', '#fff6de', .7)}
    ${path('m16 16 2 35M77 16l-2 20', '#fff1c026', .5)}
  </g>`);

  book('map-book', ['#3e6259', '#86a17a', '#647f61', '#405b4d'], () => `<rect x="29" y="24" width="37" height="31" fill="#e8dfbe" stroke="#a5ac85" stroke-width=".6"/><path d="m31 27 10 9 10-8 12 3v20l-11-4-12 6-9-9z" fill="#cbd2aa"/>${path('m32 29 7 14 8-10 16 10m-31 6 14-7 9 8 9-3', '#faf0c8', 2)}${path('m32 29 7 14 8-10 16 10m-31 6 14-7 9 8 9-3', '#bc7a5b', .7)}${path('m53 25-5 13 2 15M30 39l11-1 5 3 19-8', '#83b0b2', 1.5)}${text('STREET ATLAS', 48, 17, 5.3, '#f7edca')}${text('COUNTY &amp; CITY MAPS', 48, 21, 2.3, '#e2dab2')}${text('2006 EDITION', 48, 60, 3.5, '#ede3bc')}`);

  paper('crossword', `${text('THE DAILY CROSSWORD', 47, 19, 3.4)}${text('Tuesday · Pencil recommended', 47, 23, 2.2, '#7c7d6f')}<rect x="28" y="27" width="36" height="30" fill="#fff8e1"/>${Array.from({ length: 7 }, (_, i) => path(`M${28 + i * 6} 27v30`, '#626c67', .45)).join('')}${Array.from({ length: 6 }, (_, i) => path(`M28 ${27 + i * 6}h36`, '#626c67', .45)).join('')}${[[28, 27], [52, 27], [40, 33], [58, 39], [34, 45], [46, 51]].map(([x, y]) => `<rect x="${x}" y="${y}" width="6" height="6" fill="#35413f"/>`).join('')}${text('I', 37, 37.5, 4, '#637184')}${text('F', 49, 37.5, 4, '#637184')}${text('T', 55, 37.5, 4, '#637184')}${text('S', 43, 31.5, 4, '#637184')}${text('T', 43, 43.5, 4, '#637184')}${text('R', 49, 49.5, 4, '#637184')}${text('1', 35, 29, 1.6)}${text('4', 47, 35, 1.6)}${print(29, 61, 32, 3)}`, { fold: false });

  book('journal', ['#254b5d', '#7a9fa4', '#bdd4ca', '#647f88'], () => `<path d="M27 9h43v17H27z" fill="#2f6373"/>${text('AIR MEDICAL', 48, 16, 4.5, '#f1f2de')}${text('JOURNAL', 48, 22, 5.3, '#f1f2de')}<rect x="29" y="30" width="38" height="22" fill="#9bb6b6"/><path d="m29 48 11-8 8 5 9-7 10 8v6H29z" fill="#587f80"/><path d="m35 41 15-3 10 4-5 5-17-1z" fill="#dfe4dc" stroke="#3f5962" stroke-width=".6"/><path d="m55 42 12-9-1 8-7 5" fill="#cddad1" stroke="#3f5962" stroke-width=".6"/>${path('M49 39v-6m-12 0h24M43 47l-1 3h12', '#394e55', .8)}<path d="m48 40 5 1 2 3-7-1z" fill="#466e85"/>${print(29, 56, 36, 3, '#5a7273')}${path('m63 55 3 4 6-8M30 61h19', '#a3554e', .7)}${text('VOL. 45 • NO. 4', 48, 11, 1.6, '#cee0d8')}`);

  draw('retirement', r => {
    const member = ({name,x,y,skin,shirt = '#2e465d',back = '',hair = '',features = '',smile = true,scale = 1}) => `<g data-crew="${name}" transform="translate(${x} ${y}) scale(${scale})">
      <path d="m-7 16 1-9 4-2h4l4 2 1 9z" fill="${shirt}" stroke="#243c4d" stroke-width=".3"/>
      ${back}
      <path d="M-1.5 3h3v4h-3z" fill="${skin}"/>
      <path d="m-3 6 3 3-1-3m4 0L0 9l1-3" fill="${shirt === '#eee9d7' ? '#fffdf1' : '#718293'}"/>
      <ellipse cx="-3.6" cy="0" rx=".8" ry="1.4" fill="${skin}"/><ellipse cx="3.6" cy="0" rx=".8" ry="1.4" fill="${skin}"/>
      <path d="M-3.5-3q3.5-3.5 7 0v4q-.4 4-3.5 4t-3.5-4z" fill="${skin}"/>
      ${hair}
      ${path('m-2.4-.8 1.5-.2m1.8 0 1.5.2', '#3d3027', .35)}
      ${path('M-1.6.2h.2m2.8 0h.2M-.1.4l-.5 1.2h.7', '#3d3027', .4)}
      ${smile ? path('M-1.6 3q1.6 1.5 3.2 0', '#f8e3ca', .55) : path('M-1.3 3.3h2.6', '#513b2d', .45)}
      ${features}
      ${path('M.3 10v4M-4.5 10h2m5 0h2', shirt === '#eee9d7' ? '#aaa98f' : '#8194a0', .3)}
      <path d="m-5 7 .7 1.1 1.2-.3-.6 1 1.1.5-1.2.3-.4 1-.5-1-1.1-.2 1-.7z" fill="#d2b66d"/>
    </g>`;
    const curls = [[-4,-3],[-4.7,-1.7],[-4.5,-4.8],[-2.8,-5.9],[-1,-6.5],[.9,-6.7],[2.8,-6.2],[4.3,-5.2],[4.9,-3.4],[4.6,-1.5],[-3,-3.7],[-1.3,-4.8],[.6,-5],[2.5,-4.4],[3.6,-3]];
    return `<path d="M13 7h70v66H13z" fill="${r('paper')}" stroke="#c0af86" stroke-width=".7"/>
      <path d="M17 11h62v58H17z" fill="none" stroke="#b29b5d" stroke-width=".6"/>
      ${text('THANK YOU, SANDRA',48,20,4.8,'#8d733d')}
      <path d="M19 26h58v30H19z" fill="#7c9996"/>
      <path d="M19 26h58v10H19z" fill="#b4c5ae"/>
      ${path('M21 31h54M24 26v9m14-9v9m22-9v9m13-9v9', '#d3d8bc55', .6)}
      ${member({name:'Darnell Hughes',x:27,y:39,skin:'#875a3e',smile:false,hair:path('m-2.1-3.8 2.1 1.4 2.1-1.4M-3.4-2v1m6.8-1v1','#46362a',.65),features:path('m-2.4-1.1 1.5.4m1.8 0 1.5-.4','#3d3027',.45)})}
      ${member({name:'Priya Nair',x:38,y:38.5,skin:'#bd855a',back:'<circle cx="4.4" cy="-1.9" r="2.2" fill="#272b2c"/><path d="M-4-2q4-7 8 0v8H-4z" fill="#262c2d"/>',hair:'<path d="M-3.8-.6q0-6 3.5-6.2t4.1 6.2L1-3.7-1-3z" fill="#24292a"/>',features:path('M-3.6 1.8v.9m7.2-.9v.9','#e0bb67',.4)})}
      ${member({name:'Jorge Medina',x:69,y:38.5,skin:'#c0956c',back:'<path d="M-4-3q4-4 8 0v7H-4z" fill="#3c352e"/>',hair:'<path d="M-4-1q-1-3 1-4l1-1 2 .6 1-1 2 1 1.5 1.5L3 0 1-3l-2 .7-2-.7z" fill="#30312d"/>',features:'<path d="m-2.4 2 1.3-1 1.1.5 1.1-.5 1.3 1-.8.8-1.6-.5-1.6.5z" fill="#3c3228"/>'})}
      ${member({name:'Sandra Okonkwo',x:51,y:37,skin:'#a7734e',shirt:'#eee9d7',scale:1.12,back:'<path d="M-4.8-1.5q-2-7 4.8-7t4.8 7z" fill="#575954"/>',hair:curls.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="${i%3===0 ? 1.25 : 1.05}" fill="${['#c5c7bb','#848b83','#deded0','#9ca399'][i%4]}"/>`).join(''),features:path('M-2.7 1.5l.6.2m4.2-.2-.6.2','#835435',.35)})}
      ${text('HAPPY RETIREMENT',48,62,4.2,'#8d733d')}
      ${text('A lifetime of showing up.',48,66,2.6,'#7e826c')}
      ${path('m21 14 2 1-1 2m51 44 2 1-1 2', '#b49b5e', .8)}
    `;
  });

  paper('exam', `${text('PARAMEDIC PROGRAM', 47, 17, 3.2)}${text('SUMMATIVE EXAMINATION', 47, 22, 2.8)}${text('TREMBLAY, KEISHA', 43, 27, 2.7, '#65716e')}${print(29, 41, 34, 6)}<g transform="rotate(-10 55 34)">${text('74%', 55, 36, 9, '#af5349')}<ellipse cx="55" cy="33" rx="13" ry="7" fill="none" stroke="#af5349" stroke-width="1"/></g>${path('m30 44 2 2 4-4m-6 11 4-4m-4 0 4 4', '#af5349', .8)}<path d="M35 51c-8 10-5 14 1 12 6-1 4-6-1-12M60 58c-6 6-4 11 1 9 5-1 2-6-1-9" fill="#8a9a9c24" stroke="#83959638" stroke-width=".5"/>`);
  draw('thank-you', r => `<g transform="rotate(-3 48 40)"><path d="M20 10h56v60H20z" fill="${r('paper')}" stroke="#b5a68c" stroke-width=".6"/><path d="M24 14h48v52H24z" fill="none" stroke="#cab598" stroke-width=".5"/>${text('Dear Jorge,', 46, 28, 6.5, '#4c6573', 'font-family="Georgia,serif" font-style="italic"')}${path('m28 36 6-1 3 2 6-1 3 1 7-2 12 1m-37 5 11-1 4 2 5-1 3 1 12-1m-35 6 7-1 5 2 6-2 11 1', '#627889', .65)}<path d="M52 56c-9-10-16 1 0 9 16-8 9-19 0-9z" fill="#bb7f78" stroke="#a66561" stroke-width=".6"/>${path('M22 40h51', '#c0b294', .45)}${path('M23 41h50', '#fff8e4', .55)}${text('With all our love.', 42, 62, 2.8, '#677d8b', 'font-style="italic"')}</g>`);

  draw('vapor-rub', r => `<path d="M25 27h46v34c0 11-46 11-46 0z" fill="${r('blue')}" stroke="#34566c" stroke-width=".7"/><ellipse cx="48" cy="61" rx="23" ry="7" fill="#1c3d6355"/><path d="m27 37 42-1v22q-21 7-42 0z" fill="${r('paper')}" stroke="#adbea5" stroke-width=".6"/>${text('VAPOR', 48, 46, 6.2, '#3d7478')}${text('RUB', 48, 52, 5.4, '#3d7478')}${text('MENTHOL • CAMPHOR', 48, 56, 1.8, '#5b796e')}<path d="M23 23h50v9q-25 12-50 0z" fill="#326a63" stroke="#1d504e" stroke-width=".5"/><ellipse cx="48" cy="23" rx="25" ry="8" fill="#78a294" stroke="#9fc1a3" stroke-width=".7"/><ellipse cx="48" cy="22" rx="20" ry="5" fill="#60927f"/>${text('M. WEBB', 48, 24, 5.5, '#203c3b', 'transform="rotate(-5 48 24)"')}${path('M27 29v5m4-4v5m4-4v5m4-4v5m4-4v5m4-4v5m4-4v5m4-4v5m4-4v5m4-5v4m4-6v4', '#7ca493', .65)}${path('M28 40v16m-1 4 2 3', '#e9f0de55', 1)}`);

  draw('officer-shirt', r => `${gradient('gb-officer-shirt-cloth', ['#1d2c3c', '#4c6272', '#293c4c', '#182735'])}<path d="m24 17 15-7q10 11 20 0l15 8 13 18-14 11-7-10 6 30-26 4-23-5 6-30-10 10L8 34z" fill="url(#gb-officer-shirt-cloth)" stroke="#607582" stroke-width=".65"/><path d="m39 10 4 11 8 4 8-15q-10 10-20 0z" fill="#152532" stroke="#667985" stroke-width=".6"/>${path('m25 20 7 11-5 21m44-30-9 12 5 25m-34 4 12-8-7-10m19-13-7 14 8 13', '#10202c', 1.5)}${path('m27 22 7 9-5 16m39-24-8 11 3 17M27 62l15 4 25-2m-55-31 8 8m54-3 8-5', '#8293a24d', .8)}${text('OFFICER', 48, 39, 6.6, '#d3bc7e', 'transform="rotate(3 48 39)"')}${text('VOLUNTEER FIRE', 48, 45, 2.9, '#d3bc7e', 'transform="rotate(3 48 45)"')}${path('m43 48 4 1m5 0 2 1', '#d3bc7e', .5)}`);

  draw('maglite', r => `<g transform="rotate(43 48 40)"><path d="M42 25h13v41q-6.5 6-13 0z" fill="${r('dark')}" stroke="#75828b" stroke-width=".7"/><rect x="40" y="22" width="17" height="7" rx="1.5" fill="${r('steel')}"/><path d="m39 8 1 15h17l2-15z" fill="${r('dark')}" stroke="#839196" stroke-width=".7"/><ellipse cx="49" cy="8" rx="10" ry="4" fill="${r('steel')}" stroke="#b8c5c6" stroke-width=".7"/><ellipse cx="49" cy="8" rx="7.5" ry="2.6" fill="#5c6f74"/><path d="m44 6 5 3 2-3 4 3" fill="none" stroke="#202d37" stroke-width=".7"/>${Array.from({ length: 10 }, (_, i) => path(`M43 ${34 + i * 2.4}l11 5m-11-1 11-5`, '#84919644', .4)).join('')}<ellipse cx="48.5" cy="66" rx="6.5" ry="2.8" fill="#596a70" stroke="#9aa8a9" stroke-width=".5"/><circle cx="48.5" cy="19" r="2.5" fill="#17242b" stroke="#7a8b92" stroke-width=".6"/>${path('M44 31v28m-1-43v4m10 9 1 2', '#bdc9c780', .7)}${text('MAGLITE', 48, 33, 2.2, '#b7c3c0')}</g>`);

  draw('narcan', () => `${gradient('gb-narcan-plastic', ['#c4c9c5','#fffdf1','#edead9','#d3d8cd'])}
    ${gradient('gb-narcan-plunger', ['#a71551','#fa397a','#e32361','#ab174d'])}
    <path d="M43 37V14q0-10 6-10t6 10v23z" fill="url(#gb-narcan-plastic)" stroke="#c6d4cf" stroke-width=".7"/>
    ${path('M46 12q0-5 3-5M51 14v20', '#fffef7',1.1)}
    <path d="M44 48h11v19q-5 4-11 0z" fill="url(#gb-narcan-plunger)" stroke="#c02a60" stroke-width=".5"/>
    ${path('M46 53v12', '#ff9ca1', .65)}
    <path d="M23 36q26-4 52 0l3 4v31q-5 3-11 1l-2-14q-2-9-16-9T32 59l-2 13q-6 2-12-1l1-30z" fill="url(#gb-narcan-plastic)" stroke="#bdccc7" stroke-width=".7"/>
    ${path('M22 40q26-4 52-1M22 44v23M74 44v23M34 54q15-10 29 0', '#fffff4', .75)}
    ${Array.from({length:18},(_,i) => path(`M${24+i*2.8} 36v-1.2`, '#e7e9da',.9)).join('')}
    <path d="m24 41 1.1 1.6 1.8-.1-.8 1.6 1 1.5-1.8.2-1 1.5-.8-1.5-1.8-.2.9-1.5-.8-1.6 1.8.1z" fill="#d41459"/>
    ${text('NARCAN',39,45.3,5.8,'#d01556','textLength="23" lengthAdjust="spacingAndGlyphs"')}
    ${text('NASAL SPRAY',62,45.3,3.6,'#202936','textLength="22" lengthAdjust="spacingAndGlyphs"')}
    ${text('4 mg',26,58.5,5.5,'#273345','transform="rotate(-90 26 58.5)"')}
    ${path('M20 69l8 1M69 70l6-1', '#aebbb6', .5)}
  `);

  draw('clipboard', r => `<path d="m23 10 46 1 5 8-3 17 3 34-51 2-3-6 3-23-3-17z" fill="${r('steel')}" stroke="#c0ceca" stroke-width=".8"/>${path('M25 14h42l4 5-2 18 3 29-46 2-2-5 2-22-3-14z', '#5a7077', .6)}<path d="M28 22h36v39H28z" fill="${r('paper')}" stroke="#a4b3ac" stroke-width=".4"/>${text('UNIT CHECK', 46, 31, 3.1)}${[37, 43, 49, 55].map((y, i) => `<rect x="32" y="${y - 2}" width="3" height="3" fill="none" stroke="#899b92" stroke-width=".4"/>${path(`M39 ${y}h20`, '#a5aca1', .5)}${i < 2 ? path(`m32 ${y - 1} 1 1 3-3`, '#5d7f94', .6) : ''}`).join('')}<rect x="34" y="8" width="25" height="14" rx="2" fill="${r('dark')}" stroke="#c8d3cd" stroke-width=".7"/><rect x="39" y="11" width="15" height="6" rx="1" fill="${r('steel')}" stroke="#71838a" stroke-width=".5"/>${screw(37, 19, 1)}${screw(56, 19, 1)}${path('m25 53-2 8 3 4m40-50 3 4-2 8m-7 37 7-1', '#eff7e2aa', .9)}${path('m25 55 2 3-1 5M66 25l2 4', '#4f626b', .5)}`);

  draw('gas-card', r => `${gradient('gb-gas-card-face', ['#9b7f48', '#e6d3a0', '#c6ab70', '#a88e58'])}<rect x="10" y="17" width="76" height="48" rx="4" fill="url(#gb-gas-card-face)" stroke="#decd9d" stroke-width=".7"/><path d="M10 28h76v12H10z" fill="#283b40"/>${text('FLEET FUEL', 48, 25, 6, '#354340')}${text('AUTHORIZED VEHICLES ONLY', 48, 36, 3, '#ded9bc')}<rect x="18" y="45" width="13" height="10" rx="2" fill="#d5bf7a" stroke="#a58a50" stroke-width=".5"/>${path('M22 45v10m5-10v10m-9-5h13m-9-2h5v4h-5z', '#aa8e51', .5)}${text('••••  ••••  0911', 57, 52, 5, '#596052')}${text('COUNTY EMS · UNIT 06', 54, 59, 2.6, '#616752')}${path('m15 21 12-1m48 3 7 1m-68 35 4 1m53-16 8-1m-41 12 10-1', '#f5e6b877', .45)}`);

  draw('window-punch', r => `<g transform="rotate(44 48 40)"><path d="m46 7 3-6 3 6v9h-6z" fill="${r('steel')}" stroke="#b7c6c1" stroke-width=".5"/><path d="M43 15h12v10H43z" fill="${r('steel')}" stroke="#7c8c92" stroke-width=".6"/><rect x="41" y="24" width="16" height="40" rx="3" fill="${r('pink')}" stroke="#b26489" stroke-width=".7"/>${Array.from({ length: 10 }, (_, i) => path(`M42 ${29 + i * 3}h14`, i % 2 ? '#e3a9c1' : '#7f3d62', .7)).join('')}<path d="M43 65h12v5q-6 5-12 0z" fill="${r('steel')}" stroke="#8e9b9f" stroke-width=".5"/>${path('M44 27v34M44 18v4', '#ffe4f08c', .75)}${text('AUTO', 49, 48, 2, '#6f3158', 'transform="rotate(90 49 48)"')}</g>`);

  draw('blood-vial', r => `<path d="M36 22h24v39c0 17-24 17-24 0z" fill="${r('glass')}" stroke="#aec9c9" stroke-width=".7"/><path d="M39 29v32q0 8 9 9" fill="none" stroke="#ebf8ed" stroke-opacity=".7" stroke-width="1.1"/><path d="M36 37h24v20H36z" fill="#f1ecd9" stroke="#b5bdae" stroke-width=".5"/>${text('EDTA', 48, 42, 3.7, '#566776')}${barcode(39, 44, 17, 7)}${text('6 mL · K₂', 48, 55, 2.2, '#657570')}<rect x="33" y="12" width="30" height="17" rx="2" fill="${r('rubber')}" stroke="#b49bc9" stroke-width=".7"/><ellipse cx="48" cy="12" rx="15" ry="3" fill="#ba9fd0" stroke="#d1bfe0" stroke-width=".6"/><ellipse cx="48" cy="12" rx="9" ry="1.8" fill="#76538e"/>${path('M36 16v10m4-10v10m4-10v10m4-10v10m4-10v10m4-10v10m4-10v10', '#4f346d', .8)}${path('M37 16v9m4-9v9m4-9v9m4-9v9m4-9v9m4-9v9', '#c1a7d466', .5)}${path('M43 69q6 4 12-2', '#d2e8df', .6)}`);

  draw('scalpel', r => `<g transform="rotate(44 48 40)"><path d="M43 29h10v40q-5 3-10 0z" fill="#528d9c" stroke="#94bdc1" stroke-width=".6"/>${path('M45 31v35', '#cae5d8', .7)}${Array.from({ length: 9 }, (_, i) => path(`M47 ${44 + i * 2.1}h5`, '#2b6072', .7)).join('')}<path d="M46 28V9q5 1 5 5v17" fill="${r('steel')}" stroke="#c3d2cc" stroke-width=".5"/><rect x="40" y="5" width="16" height="31" rx="2" fill="${r('glass')}" stroke="#ceddd5" stroke-width=".7"/>${path('M43 8v23m10-23v23M41 32h14', '#eff6e5', .6)}${text('STERILE', 48, 21, 2, '#e4efe5', 'transform="rotate(90 48 21)"')}</g>`);

  paper('conference', `<path d="M24 13h44v17H24z" fill="#315b76"/>${text('EMS SUMMIT', 46, 20, 5, '#e9edda')}${text('EXCELLENCE IN MOTION', 46, 26, 2, '#bdd4d3')}${text('$300', 47, 43, 13, '#405769')}${text('REGISTRATION', 47, 48, 2.3, '#71847c')}${path('M29 51h35', '#b3ac8c', .5)}${text('2 CE HOURS', 47, 57, 4.2, '#506d73')}${text('LUNCH NOT INCLUDED', 47, 64, 2.7, '#9e5d48')}`);

  draw('csn-stickers', r => `<path d="m13 27 66-7 6 31-66 9z" fill="#a9ad9c" stroke="#c2c3af" stroke-width=".5"/><path d="m13 22 65-6 5 31-65 7z" fill="#d8d5bc" stroke="#a5b0a4" stroke-width=".5"/><g transform="rotate(-4 48 33)"><path d="M17 15h63v31H17z" fill="${r('paper')}" stroke="#c9c7ad" stroke-width=".6"/>${text('COUNTY GENERAL HOSPITAL', 48, 22, 3, '#425551')}${text('CSN: ••••••••••', 43, 27, 3.2, '#425551')}${barcode(24, 30, 47, 9)}${text('PATIENT LABEL · 1 OF 8', 43, 43, 2.1, '#697b6a')}<path d="m72 46 8-8v8z" fill="#b7c5b5"/>${path('m72 46v-7h7', '#95a597', .5)}</g>${path('m19 50 9-1m35 5 13-2', '#f2e8c6', .6)}`);

  book('fatima-passport', ['#152b4c', '#3a527d', '#253b63', '#162847'], () => `<path d="M29 13h37v45H29z" fill="none" stroke="#bc9a5f" stroke-width=".5"/>${text('PASSPORT', 48, 22, 5, '#e3c68b')}<circle cx="48" cy="38" r="11" fill="none" stroke="#d7b77b" stroke-width=".8"/>${path('M37 38h22M38 34h20m-20 8h20M48 27c-9 8-9 15 0 22 9-7 9-14 0-22zM48 27v22', '#d7b77b', .6)}${text('P', 48, 56, 4, '#e3c68b')}<path d="m29 29 5-2 4 8-6 3z" fill="#d59377" stroke="#f2c6a3" stroke-width=".5"/><path d="m58 48 9-3 2 10-9 2z" fill="#9eb8ab" stroke="#d0d8b7" stroke-width=".5"/>${text('AIR', 64, 51, 2, '#416d78')}${path('m31 32 4-2m-3 4 4-2m25 21 4-1', '#efcfab', .5)}`);

  draw('covid-mask', r => `${gradient('gb-covid-mask-fabric', ['#6d9fae', '#c0e0df', '#95c6cd', '#729caa'])}${path('M24 29C4 14 1 51 20 56l8-6M72 29c20-15 23 22 4 27l-8-6', '#b7c9c8', 1.6)}${path('M24 29C4 14 1 51 20 56M72 29c20-15 23 22 4 27', '#e0e7db77', .6)}<path d="M23 26q25-13 50 0l-4 32q-21 14-42 0z" fill="url(#gb-covid-mask-fabric)" stroke="#e0e5d6" stroke-width="1.1"/>${path('M28 29q20-9 40 0', '#a0b8b5', 1.5)}${path('M29 29q19-8 38 0', '#edf4e4', .65)}${path('M26 35q22 10 44 0M27 44q21 10 42 0M28 53q20 10 40 0', '#648f9e', 1.1)}${path('M26 37q22 10 44 0M27 46q21 10 42 0M28 55q20 10 40 0', '#deeee1', .7)}${path('M26 29l4 27M70 29l-4 27', '#dae7dd', .75, 'stroke-dasharray=".5 1.5"')}<path d="m30 51 8 7 6 2" fill="none" stroke="#9b9f792e" stroke-width="2"/>`);

  draw('old-newspaper', r => `<path d="m14 14 65-5-3 58-61 6-4-5z" fill="#b6ad91" stroke="#908c77" stroke-width=".6"/><path d="m16 12 62-5-4 58-59 5z" fill="${r('paper')}" stroke="#c2b596" stroke-width=".6"/><g transform="rotate(-4 48 38)">${text('THE DAILY', 46, 22, 8, '#4d534a', 'font-family="Georgia,serif"')}${path('M21 26h50M21 29h50', '#6a7166', .55)}${text('A CITY ON THE MOVE', 46, 35, 4.1, '#565c4e', 'font-family="Georgia,serif"')}<rect x="23" y="39" width="21" height="15" fill="#a5ab90"/><path d="m23 50 6-6 4 3 7-6 4 8v5H23z" fill="#717e6b"/>${print(48, 40, 23, 5, '#8e927e')}${print(23, 58, 22, 3, '#8e927e')}${print(48, 58, 23, 3, '#8e927e')}</g><path d="m17 43 57-5v3l-58 4z" fill="#a390681a"/>${path('m17 43 57-5M47 11l-3 55', '#b5a684', .5)}${path('m18 44 55-5', '#fff5d7', .65)}`);

  draw('zynn-container', r => `${gradient('gb-zynn-container-side', ['#7e8e96', '#e1e7e2', '#9eabb2', '#6d7e87'])}<path d="M18 32h60v20c0 20-60 20-60 0z" fill="url(#gb-zynn-container-side)" stroke="#9caaa9" stroke-width=".7"/><ellipse cx="48" cy="32" rx="30" ry="16" fill="#e4e9e2" stroke="#b9c8c8" stroke-width="1"/><ellipse cx="48" cy="32" rx="25" ry="12" fill="#cbdadb" stroke="#80a5b4" stroke-width=".7"/><ellipse cx="48" cy="32" rx="22" ry="10" fill="#dfe9e2"/>${text('ZYNN', 48, 35, 10, '#487b9d', 'font-style="italic"')}${text('COOL MINT', 48, 41, 2.5, '#658294')}${text('6 mg', 48, 24, 2.5, '#5e8196')}${path('M21 48q27 16 54 0M21 52q27 16 54 0', '#82969d', .55)}${text('EMPTY', 48, 57, 2.7, '#6c7e84')}${path('m26 25 8-3m-10 34 4 1m35-3 6-2', '#f9f7e9aa', .65)}`);

  draw('french-fry', r => `${gradient('gb-french-fry-crust', ['#806039', '#d9ad5f', '#b98e46', '#826139'])}<path d="M13 45q11-7 26-4l19 5 21 3 3 6-7 6-21-5-19-4-18 4-5-4z" fill="url(#gb-french-fry-crust)" stroke="#86653c" stroke-width=".7"/><path d="m14 45 5 3 15-4 19 5 26 3-4 3-20-4-21-4-15 4-6 1z" fill="#e3bd71"/>${path('m20 53 7-2m10-2 9 1m12 4 14 3', '#695e35', .8)}${[[24, 47], [38, 46], [55, 50], [69, 53], [49, 48]].map(([x,y]) => `<ellipse cx="${x}" cy="${y}" rx="1.5" ry=".7" fill="#8b683a"/>`).join('')}${path('m27 45 .5 1m18 1 .5 1m17 4 .5 1m10 2 .5 1', '#f0d89b', .8)}`);

  draw('parking-receipt', r => `<g transform="rotate(-5 48 40)"><path d="m29 5 4 2 3-2 4 2 3-2 4 2 4-2 3 2 4-2 3 2 5-2-2 69-4-2-3 2-4-2-3 2-4-2-3 2-4-2-3 2-4-2-4 2z" fill="${r('paper')}" stroke="#bfb394" stroke-width=".6"/>${text('UNIVERSITY HOSPITAL', 48, 17, 3)}${text('PARKING', 48, 24, 5)}${text('04 / 16 / 2019', 48, 31, 3.2, '#7f8477')}${path('M35 35h25', '#939887', .5, 'stroke-dasharray="1 1"')}${text('ENTRY   07:18', 48, 42, 3, '#7f8477')}${text('EXIT    09:42', 48, 47, 3, '#7f8477')}${text('$10.00', 48, 58, 7, '#606b5d')}${barcode(35, 62, 25, 5)}${path('m30 46 15-5 18 4M47 9l-2 60', '#b7ac91', .45)}${path('m31 47 14-5 17 4', '#fff6e1', .7)}</g>`);

  draw('googly-eye', r => `<ellipse cx="48" cy="44" rx="27" ry="26" fill="#b0b6ae" stroke="#e4e9df" stroke-width=".7"/><ellipse cx="48" cy="42" rx="27" ry="26" fill="#f1f2e6" stroke="#829394" stroke-width=".8"/><ellipse cx="48" cy="42" rx="23.5" ry="22.5" fill="#faf9eb" stroke="#c9d5cf" stroke-width=".6"/><circle cx="56" cy="50" r="13.5" fill="${r('sphere')}" stroke="#131f27" stroke-width=".5"/><ellipse cx="44" cy="31" rx="15" ry="8" fill="#e6f5f52b" transform="rotate(-25 44 31)"/>${path('M29 33q6-14 21-13', '#fffefa', 2)}${path('M30 27q5-5 9-5M63 24q13 10 7 24', '#d5e9e580', 1)}<ellipse cx="52" cy="44" rx="3" ry="1.6" fill="#b2c6cb" transform="rotate(-25 52 44)"/>${path('M33 61q14 10 29-1', '#92a5a84d', .7)}`);

  draw('dead-marker', r => `<g transform="rotate(32 48 40)"><path d="m46 8 1-5 1-2 1 2 1 5z" fill="#302e27" stroke="#655d45" stroke-width=".4"/><path d="M46 8h4v5h-4z" fill="#0c1418"/><path d="M46 12q-2.5 4-2.5 7v6h9v-6q0-3-2.5-7z" fill="${r('dark')}" stroke="#58646a" stroke-width=".5"/><path d="M43.5 24q4.5-1 9 0v43q0 7-3 9h-3q-3-2-3-9z" fill="${r('steel')}" stroke="#71847f" stroke-width=".65"/>${path('M45 27v40q0 5 1.5 7', '#edf0de', .7)}${path('M44 25h8M46 15l-1 7', '#b8c1b688', .6)}${text('Sharpie', 48, 47, 5, '#273332', 'font-family="Georgia,serif" font-style="italic" transform="rotate(90 48 47)"')}${text('Permanent Marker', 46, 48, 1.8, '#32403a', 'transform="rotate(90 46 48)"')}${text('FINE POINT', 48, 65, 2, '#32403a', 'transform="rotate(90 48 65)"')}${path('m49 30 2 3m-6 27 1 4', '#576d5d', .45)}</g>`);

  draw('dead-pager', r => `<rect x="15" y="18" width="65" height="45" rx="6" fill="#1a272e" stroke="#8b9b9d" stroke-width=".7"/><rect x="12" y="22" width="69" height="39" rx="5" fill="${r('dark')}" stroke="#71838b" stroke-width=".8"/><path d="M19 26h45v23H19z" fill="#152229" stroke="#84948c" stroke-width=".7"/><rect x="22" y="29" width="39" height="16" rx="1" fill="#9da98c"/>${text('CALL BASE', 41, 39, 5, '#76856e', 'font-family="monospace"')}${text('MOTOROLA', 42, 54, 2.8, '#a8b7ad')}<rect x="69" y="31" width="7" height="11" rx="3" fill="#789785" stroke="#b0c8ab" stroke-width=".6"/>${path('M70 49h6m-6 3h6m-6 3h6', '#91a19f', .7)}${screw(17, 56, 1)}${screw(76, 56, 1)}${path('m17 25 8-1M26 30h30', '#dae0c438', .65)}${path('m22 59 9-1m31-34 10 1', '#a6b3b870', .6)}`);

  draw('fossil-cough-drop', r => `${gradient('gb-fossil-cough-drop-sweet', ['#805130', '#c49951', '#a26c30', '#604323'])}<path d="m9 26 19 7 35-7 23-7-6 15 5 12-20-2-35 12-17 8 3-16z" fill="${r('glass')}" stroke="#b2b89a" stroke-width=".65"/><ellipse cx="47" cy="41" rx="21" ry="13" fill="url(#gb-fossil-cough-drop-sweet)" stroke="#b78c4c" stroke-width=".7"/><ellipse cx="46" cy="39" rx="14" ry="8" fill="none" stroke="#d0af6c66" stroke-width=".8"/>${text('H', 47, 44, 8, '#805c30')}${path('m12 30 12 9-7 15m-3-18 8 6-4 10m62-27-10 13 11 5m-4-12-5 8 6 2M29 34l9 13 12-12 12 9', '#e1d6ae66', .85)}${path('m27 38 4 10 9 4m13-20 8 2 3 7', '#6e633b66', .7)}`);

  draw('ancient-charger', r => `${path('M30 27C8 60 36 74 53 60s-6-36 12-32 13 20 10 29', '#7f8b81', 5.5)}${path('M30 27C8 60 36 74 53 60s-6-36 12-32 13 20 10 29', '#d2d4bc', 4)}${path('M29 29C10 60 37 69 50 59', '#f4f0da', .8)}<rect x="13" y="12" width="38" height="18" rx="3" fill="${r('paper')}" stroke="#9ca99e" stroke-width=".7"/><rect x="17" y="8" width="30" height="7" rx="1" fill="${r('steel')}" stroke="#bdc9bf" stroke-width=".6"/><path d="M20 9h24v3H20z" fill="#4d5c60"/>${Array.from({length: 12}, (_, i) => path(`M${21 + i * 1.8} 9.5v2`, '#d6c398', .4)).join('')}${path('M18 18h27M28 26h8', '#a8b6a2', .6)}<rect x="67" y="49" width="17" height="17" rx="2" fill="${r('paper')}" stroke="#a9b2a2" stroke-width=".7"/><path d="M70 65h11v8H70z" fill="${r('steel')}" stroke="#a7b8b3" stroke-width=".6"/><path d="M72 68h2v2h-2m4-2h2v2h-2" fill="#485c62"/>${text('USB', 75, 58, 2.5, '#9da899')}${path('M29 31v3m3-3v3M73 47h6', '#b4b7a0', 1)}`);

  draw('conference-lanyard', r => `${path('M29 8C10 28 31 44 47 55 64 47 86 24 68 8', '#4e3e63', 7)}${path('M29 8C10 28 31 44 47 55 64 47 86 24 68 8', '#9280a8', 5)}${path('M27 10C14 29 32 43 47 52 64 44 80 24 69 10', '#c7b2ca66', .5)}${text('EMS', 27, 24, 3, '#d8d6c2', 'transform="rotate(65 27 24)"')}${text('SUMMIT', 65, 31, 2.5, '#d8d6c2', 'transform="rotate(-60 65 31)"')}<rect x="44" y="51" width="7" height="9" rx="1" fill="${r('steel')}" stroke="#a1b0ac" stroke-width=".5"/><rect x="28" y="58" width="40" height="19" rx="2" fill="${r('glass')}" stroke="#cad5c9" stroke-width=".6"/><rect x="31" y="60" width="34" height="14" fill="${r('paper')}"/><path d="M31 60h34v5H31z" fill="#667b96"/>${text('EMS EXPO · 2008', 48, 64, 2.9, '#eef0d9')}${text('ATTENDEE', 48, 70, 4, '#53696c')}${text('Sponsored by LifeSystems', 48, 73, 1.7, '#7c8f83')}${path('m26 8-3-3m4 4-1-5m44 5 3-4m-4 5 5-1', '#b9a3c0', .5)}`);

  draw('earplug', r => `${gradient('gb-earplug-foam', ['#af6f45', '#f2ba89', '#da9865', '#ad7047'])}<path d="M34 22c0-15 28-15 28 0l-1 32c-1 20-28 19-28 1z" fill="url(#gb-earplug-foam)" stroke="#b67c50" stroke-width=".7"/><ellipse cx="48" cy="22" rx="14" ry="8" fill="#f0b78b" stroke="#d69d6c" stroke-width=".6"/><ellipse cx="47" cy="21" rx="10" ry="5" fill="#e4a979"/>${path('M37 34q10 6 21 1M36 48q11 5 22 1M38 59q9 5 17 0', '#bb7a4e', .6)}${Array.from({length: 36}, (_, i) => `<circle cx="${37 + (i * 7) % 21}" cy="${18 + (i * 11) % 43}" r="${i % 3 ? .4 : .65}" fill="${i % 2 ? '#a4653c55' : '#ffe0b866'}"/>`).join('')}${path('M36 30v17m2 10 1 4', '#ffddb577', .9)}`);

  paper('pizza-coupon', `${text('STATION HOUSE', 47, 19, 4.3, '#a45439')}${text('PIZZA', 47, 25, 6, '#a45439')}<path d="m34 31 29 6-20 20z" fill="#e0bd67" stroke="#a18044" stroke-width=".5"/>${path('m34 31 29 6', '#ac793c', 4)}${path('m35 30 27 6', '#edcc89', 1.3)}${[[42, 39], [53, 40], [44, 48]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="2.5" fill="#a64b32" stroke="#ca7449" stroke-width=".4"/>`).join('')}${text('ONE FREE TOPPING', 47, 61, 3.3, '#886746')}${text('EXPIRED 2018', 47, 66, 3.4, '#a45439')}${path('M26 28h40M26 68h40', '#b4966b', .5, 'stroke-dasharray="1 1.7"')}`);

  draw('radio-clip', r => `<path d="M32 10h28v24l-7 7 6 5-5 24H30V47l9-9-7-5z" fill="${r('dark')}" stroke="#87969b" stroke-width=".8"/><path d="M38 17h15v16l-9 6 6 5-6 17h-8V48l8-10-6-7z" fill="#101e26" stroke="#64747e" stroke-width=".6"/><path d="m31 44 8-7 6 3 7-2 8 7-8-3-5 3-7-3z" fill="#b4bfc0" stroke="#263a46" stroke-width=".5"/>${screw(46, 18, 2.7)}${screw(43, 65, 1.8)}${path('m34 13 3 1m20 10v8M32 51v10m19 5 1-7', '#c4cecb77', .7)}${path('M40 22v8m2-8v8m2-8v8m2-8v8m2-8v8m2-8v8', '#7b89914d', .5)}`);

  draw('flush-wrapper', r => `<path d="m8 26 13-4 10 3 13-5 19 3 18-4 7 28-12 6-14-3-17 8-14-4-15 4z" fill="${r('glass')}" stroke="#a9c2b6" stroke-width=".6"/><path d="m16 31 60-4 3 19-59 7z" fill="#d6e5d2aa" stroke="#a3bdb0" stroke-width=".5"/><g transform="rotate(-4 48 40)">${text('SODIUM CHLORIDE', 47, 36, 3.2, '#477e7e')}${text('0.9% NaCl', 47, 42, 6.5, '#477e7e')}${text('10 mL · STERILE · SINGLE USE', 47, 47, 2.2, '#477e7e')}</g>${path('m13 28 6 25m-3-26 6 25m54-29 6 21m-3-22 6 21', '#dcebdcaa', .8)}${path('m29 25 7 10-4 12 4 7m27-29-6 14 8 10', '#718f8966', .65)}${path('m31 26 7 9-4 11m30-19-5 11 7 10', '#f3f7e8bb', .7)}`);

  draw('mix-cd', r => `${gradient('gb-mix-cd-disc', ['#84b4b5', '#e1c9e2', '#e0edc7', '#a0c3ce', '#b6a3cf'])}<circle cx="48" cy="40" r="31" fill="url(#gb-mix-cd-disc)" stroke="#d1e2d9" stroke-width=".75"/><path d="m22 23 21 13-9-24M73 22 52 36l9-23M72 60 53 45l10 23M24 60l19-15-8 23" fill="#edf4e855"/><circle cx="48" cy="40" r="27" fill="none" stroke="#729a9f" stroke-width=".5"/><circle cx="48" cy="40" r="12" fill="#d3ded455" stroke="#b9d2c5" stroke-width=".5"/><circle cx="48" cy="40" r="6.5" fill="#1b272c" stroke="#eef0d9" stroke-width="1.2"/>${text('NIGHT SHIFT', 48, 28, 5.3, '#394e66', 'transform="rotate(-9 48 28)" font-style="italic"')}${text('MIX', 48, 60, 7, '#394e66', 'transform="rotate(-9 48 60)" font-style="italic"')}${path('m25 40 11 13m29-30-9 8M25 55l9-3m28-1 8-7m-27-27 3 9m-12 35 5-2', '#f7f3e1bb', .5)}${path('m30 33 7 6m22 16 7 1', '#759ba9', .4)}`);

  paper('shift-swap', `${text('SHIFT COVERAGE', 47, 18, 3.8)}${text('REQUEST', 47, 23, 3.8)}${text('DECEMBER 25, 2012', 47, 30, 3.3, '#5d787c')}${path('M29 34h35', '#a5a58e', .5)}${text('Can anyone cover?', 47, 39, 3.8, '#4f6d83', 'font-style="italic"')}${[46, 53, 60].map((y, i) => `${path(`M29 ${y}h35`, '#b8b59b', .4)}${text(['NO.', 'Sorry, no.', 'Absolutely not.'][i], 47, y - 1, 3.5, '#94645b', `transform="rotate(${i * 3 - 4} 47 ${y})"`)}`).join('')}${text('Thanks anyway.', 47, 67, 2.8, '#5d7880', 'font-style="italic"')}`);

  function note(color) {
    const id = `callahan-note-${color.replace('#', '')}`;
    return draw(id, () => `<path d="M19 10h59v50L65 73H19z" fill="${color}" stroke="#93885e" stroke-width=".55"/><path d="M19 10h59v12H19z" fill="#43482d14"/>${path('M21 11h55', '#fff9d680', .6)}<path d="m65 73 1-13h12z" fill="#fff6d375" stroke="#b3a777" stroke-width=".5"/><path d="m65 73-1-15 14 2z" fill="#594d2520"/>${text('CREW —', 44, 32, 7, '#45535a', 'transform="rotate(-3 44 32)"')}${path('m28 40 9-2 4 2 9-1 5 2 12-3m-39 9 12-1 4 1 8-2 10 1m-34 9 7-1 4 1 12-2', '#52636b', .85)}${text('— RUTH', 48, 65, 5, '#45535a', 'transform="rotate(-3 48 65)"')}${path('m21 53 1 16 9 1', '#fff6d044', .7)}`);
  }
  // Inline SVG paint servers use document IDs. Give simultaneous tray, ghost,
  // pocket and gallery copies separate IDs rather than referencing hidden SVGs.
  const renderArt = (markup, context) => markup.replace(/gb-/g, `gb-${context}-`);
  return { art, note, renderArt };
});
