'use strict';

// SVG artwork and mechanisms share one model in the scratchpad and pen case.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PenKit = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const models = {
    navy: { name: 'BIC ballpoint', hint: 'Always ready · cap posted on the end', action: null },
    black: { name: 'Pilot G-2', hint: 'Click the back button', action: 'back' },
    red: { name: 'Sharpie retractable', hint: 'Click the red back button', action: 'back' },
    purple: { name: 'Pupil penlight pen', hint: 'Click the pen to slide its clip', action: 'body' },
    teal: { name: 'Fisher Space Pen AG7', hint: 'Click to extend · side button to release', action: 'body' },
    pink: { name: 'Rose gold stylus pen', hint: 'Click the pen · spring-return button', action: 'body' },
    orange: { name: 'Chudville Hospital bubble pen', hint: 'Click to shake the bubbles', action: 'body' },
    green: { name: 'Pilot MYU pocket fountain pen', hint: 'Click the cap to slide it on or off', action: 'cap' },
  };
  const initial = id => ({ extended: id !== 'green' });
  function transition(id, state, action) {
    if (id === 'navy' || id === 'orange') return { ...state };
    if (id === 'teal') return { extended: action === 'release' ? false : action === 'body' ? true : state.extended };
    return { extended: action === models[id].action ? !state.extended : state.extended };
  }
  let serial = 0;
  const ribs = (x, count, color = '#171a1d') => Array.from({ length: count }, (_, i) => `<path d="M${x + i * 5} 45v22" stroke="${color}" stroke-width="1.5" opacity=".6"/>`).join('');
  function art(id) {
    const p = `pen-${++serial}`;
    const metal = `url(#${p}-metal)`, rose = `url(#${p}-rose)`, purple = `url(#${p}-purple)`;
    const tip = (color = '#252c32') => `<g class="pen-tip"><path d="M48 53H27l-9 3 9 3h21" fill="${color}"/><path d="M20 55h10" stroke="#e7ecec"/></g>`;
    const cone = (fill = metal, x = 42) => `<path d="M${x} 52 85 42v28L${x} 60Z" fill="${fill}" stroke="#6b7478"/>`;
    const clip = (fill = metal, x = 382, end = 499) => `<path d="M${end} 43v-12q0-4-7-4H${x}q-8 0-8 7v3h9v-3h${end - x - 10}v9" fill="${fill}" stroke="#586168" stroke-width="1.5"/>`;
    const button = (fill, x = 514) => `<g class="pen-plunger"><rect x="${x}" y="43" width="23" height="26" rx="5" fill="${fill}" stroke="#596066"/><path d="M${x + 15} 46v20" stroke="#fff" opacity=".45"/></g>`;
    let body = '';
    if (id === 'navy') body = `${tip('#1c3767')}${cone('#cfb66e')}<path d="M83 44h359l13 6v12l-13 6H83Z" fill="#dce7df" fill-opacity=".65" stroke="#7d8e9b"/><path d="M91 50h349M91 63h349" stroke="#fff" opacity=".8"/><path d="M90 56h355" stroke="#234a83" stroke-width="4"/><path d="M88 45v22M437 45v22" stroke="#879fa9"/><text x="215" y="52" font-size="9" fill="#283a57">BIC • Cristal</text><path d="M436 41h77q16 0 17 15-1 15-17 15h-77Z" fill="#214579" stroke="#122c52"/><path d="M450 44h62" stroke="#638bc0" stroke-width="3"/><path d="M525 43v-11h-95q-8 0-8 6h83v5" fill="#254f86" stroke="#122c52"/><path d="M440 41v30" stroke="#0f294a" stroke-width="3"/>`;
    if (id === 'black') body = `${button('#383b3f')}${tip()}${cone()}<rect x="81" y="42" width="427" height="28" rx="10" fill="#596167" fill-opacity=".5" stroke="#282e33"/><path d="M190 55h280" stroke="#161b20" stroke-width="6"/><path d="M205 46h269" stroke="#e7eef0" opacity=".7"/><rect x="81" y="41" width="115" height="30" rx="7" fill="#292b2e" stroke="#141619"/>${ribs(92, 19)}<path d="M90 44h92" stroke="#6e7274"/><rect x="478" y="41" width="39" height="30" rx="5" fill="#25282c"/>${clip('#292d32', 364, 506)}<text x="273" y="60" font-size="16" font-style="italic" fill="#f4f0df">PILOT G-2</text><text x="439" y="60" font-size="10" fill="#eef1e8">07</text>`;
    if (id === 'red') body = `${button('#c63342')}${tip('#bb2637')}<path d="M43 51 90 39v34L43 61Z" fill="#4b4d50" stroke="#303638"/><rect x="87" y="39" width="427" height="34" rx="14" fill="url(#${p}-grey)" stroke="#60646b"/><path d="M110 43h355" stroke="#eceded" opacity=".7"/>${clip('#b72d3a', 390, 508)}<path d="M489 40v32M97 41v30" stroke="#74777b"/><text x="248" y="63" font-family="cursive" font-style="italic" font-size="27" fill="#20252b">Sharpie</text><text x="345" y="60" font-size="9" fill="#343a40">RETRACTABLE</text><path d="M54 52v8" stroke="#dd5061" stroke-width="4"/>`;
    if (id === 'purple') body = `${tip()}${cone()}<rect x="81" y="42" width="433" height="28" rx="12" fill="${purple}" stroke="#543d6e"/><path d="M95 45h388" stroke="#e8c8ff" opacity=".65"/><path d="M113 43v26M486 43v26" stroke="#4f3069"/><g class="pen-slider">${clip('#1b1c24', 393, 505)}</g><text x="112" y="60" font-size="9" fill="#fff">PUPIL • mm</text>${[2,3,4,5,6,7,8].map((n,i)=>`<circle cx="${205+i*30}" cy="54" r="${n*.65}" fill="#fff"/><text x="${205+i*30}" y="66" text-anchor="middle" font-size="7" fill="#fff">${n}</text>`).join('')}<path d="M512 45q13 11 0 22" fill="#332a41" stroke="#b9a4c9"/>`;
    if (id === 'teal') body = `${button(metal)}${tip()}<path d="M43 52q55-17 109-14h346q17 0 17 18t-17 18H152q-54 3-109-14Z" fill="${metal}" stroke="#647079"/><path d="M90 47q35-6 73-6h318" fill="none" stroke="#fff" stroke-width="2"/><path d="M151 39v34M485 39v34" stroke="#77868c"/>${clip(metal, 365, 502)}<g class="pen-side-button"><rect x="474" y="68" width="17" height="9" rx="3" fill="#687982" stroke="#303d47"/><path d="M478 70h9" stroke="#dfe8ea"/></g><text x="231" y="61" font-size="11" letter-spacing="1" fill="#58656e">fisher SPACE PEN • AG7</text>${ribs(118, 5, '#85949b')}`;
    if (id === 'pink') body = `<g class="pen-spring"><path d="M452 45h30v22h-30Z" fill="${rose}" stroke="#9c6658"/><path d="M456 51h22v10h-22Z" fill="#6d444b"/><path d="m458 52 4 8 4-8 4 8 4-8" fill="none" stroke="#efc5ab"/><rect x="482" y="42" width="39" height="28" rx="5" fill="url(#${p}-pink)" stroke="#b67c96"/>${ribs(489, 5, '#b87394')}<path d="M521 43q23 0 23 13t-23 13Z" fill="#292730" stroke="#55434c"/><path d="M525 46q10 0 13 6" fill="none" stroke="#69616d"/></g>${tip()}${cone(rose)}<rect x="81" y="42" width="371" height="28" rx="11" fill="#e8a3bf" stroke="#a9708d"/><rect x="84" y="41" width="116" height="30" rx="9" fill="url(#${p}-pink)"/>${ribs(95, 19, '#b87394')}<path d="M210 45h219" stroke="#ffe3ed" stroke-width="2"/>${clip(rose, 350, 443)}<text x="238" y="60" font-size="9" letter-spacing="3" fill="#97536f">TOUCH</text>`;
    if (id === 'orange') body = `${tip()}${cone()}<rect x="82" y="40" width="242" height="32" rx="8" fill="url(#${p}-orange)" stroke="#bd6b28"/><rect x="324" y="41" width="183" height="30" rx="10" fill="#e6f0e6" fill-opacity=".6" stroke="#93a3a4"/><rect x="330" y="44" width="169" height="24" rx="9" fill="#ffc45b" fill-opacity=".35"/><g class="pen-bubbles">${[0,1,2,3,4,5,6,7,8,9,10,11].map((n)=>`<circle style="--bubble-delay:${n*-47}ms;--bubble-drift:${n%2 ? -4 : 4}px" cx="${340+n*13}" cy="${50+(n%3)*6}" r="${3+n%3}" fill="#f59423" fill-opacity=".78" stroke="#db6b1e" stroke-width=".6"/><circle cx="${339+n*13}" cy="${49+(n%3)*6}" r="1" fill="#fff5c4"/>`).join('')}</g><path d="M334 46h157" stroke="#fff" stroke-width="2" opacity=".8"/><path d="M324 40v32M504 43v26" stroke="#adb9bc" stroke-width="5"/>${clip(metal, 380, 508)}<path d="M508 42q26 0 26 14t-26 14Z" fill="${metal}" stroke="#7d8b93"/><text x="105" y="61" font-family="Georgia, serif" font-style="italic" font-size="20" fill="#fff">Chudville Hospital</text>`;
    // MYU: the nib and long steel section are one continuous surface. The only
    // barrel seam is at the rear section; there is no separate diamond-shaped nib.
    if (id === 'green') body = `
      <path d="M302 37Q412 36 500 43Q512 45 512 56T500 69Q412 76 302 75Z" fill="url(#${p}-myu)" stroke="#7b827d"/>
      <path class="pen-nib" d="M28 56C101 34 181 34 302 37V75C181 78 101 78 28 56Z" fill="url(#${p}-myu)" stroke="#7b827d" stroke-width="1"/>
      <path d="M34 55C107 39 195 39 299 41M310 41Q416 40 497 46" fill="none" stroke="#f5f5e9" stroke-width="1.2" opacity=".85"/>
      <path d="M40 59C109 72 196 73 298 71M310 71Q419 71 498 66" fill="none" stroke="#787e74" stroke-width=".7" opacity=".5"/>
      <path d="M29 56h47" stroke="#3c443d" stroke-width=".8"/>
      <circle cx="76" cy="56" r="2.8" fill="#30392f"/>
      <path d="M77 53.3a2.8 2.8 0 0 1 1.7 2.7" fill="none" stroke="#eef0e5" stroke-width=".65"/>
      <path d="M302 38v36" stroke="#656d66" stroke-width="2"/><path d="M305 38v36" stroke="#eff1e7" stroke-width="2"/>
      <text x="276" y="61" font-size="5" letter-spacing=".7" fill="#737a6f">F</text>
      <g class="pen-cap">
        <path d="M25 33Q10 33 10 56T25 79L318 77Q324 56 318 35Z" fill="url(#${p}-myu)" stroke="#777f79"/>
        <path d="M27 37 311 39" stroke="#f5f7ed" stroke-width="1.5" opacity=".85"/>
        <path d="M26 75 312 73" stroke="#767e74" stroke-width=".8" opacity=".55"/>
        <path d="M317 36Q322 56 317 76" fill="none" stroke="#e5e8dd" stroke-width="2"/>
        <path d="M40 36 45 30 230 32 229 39Z" fill="#5f675f" opacity=".6"/>
        <path d="M39 34 43 27 230 29 230 35Z" fill="url(#${p}-myu-clip)" stroke="#79827a" stroke-width=".8"/>
        <path d="M45 28 226 30" stroke="#fbfcf2" stroke-width="1.3"/>
        <path d="M227 30v4" stroke="#68736a"/>
        <text x="277" y="67" font-size="6" letter-spacing="1.3" fill="#a0a79a">PILOT</text>
      </g>`;
    return `<svg class="pen-art pen-art-${id}" viewBox="0 0 580 112" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs>
      <linearGradient id="${p}-myu" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#939b91"/><stop offset=".2" stop-color="#d0d5cb"/><stop offset=".43" stop-color="#e5e8de"/><stop offset=".66" stop-color="#d5d8cb"/><stop offset=".88" stop-color="#aeb5a8"/><stop offset="1" stop-color="#747f72"/></linearGradient>
      <linearGradient id="${p}-myu-clip" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fafbf6"/><stop offset=".5" stop-color="#cbd2c8"/><stop offset="1" stop-color="#8a968a"/></linearGradient>
      <linearGradient id="${p}-metal" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#61727d"/><stop offset=".22" stop-color="#d7e0e4"/><stop offset=".42" stop-color="#fafdfb"/><stop offset=".57" stop-color="#a2b0b9"/><stop offset=".85" stop-color="#cad4d9"/><stop offset="1" stop-color="#5c6e7b"/></linearGradient>
      <linearGradient id="${p}-rose" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#a76651"/><stop offset=".4" stop-color="#ffe3c8"/><stop offset=".6" stop-color="#c1886f"/><stop offset="1" stop-color="#edbea3"/></linearGradient>
      <linearGradient id="${p}-purple" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#47325d"/><stop offset=".35" stop-color="#c8a0e6"/><stop offset=".5" stop-color="#9460b7"/><stop offset="1" stop-color="#482565"/></linearGradient>
      <linearGradient id="${p}-grey" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#8e949b"/><stop offset=".4" stop-color="#dce0e1"/><stop offset="1" stop-color="#858d96"/></linearGradient>
      <linearGradient id="${p}-pink" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#cb89aa"/><stop offset=".4" stop-color="#f2bcd1"/><stop offset="1" stop-color="#c989aa"/></linearGradient>
      <linearGradient id="${p}-orange" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#c6691c"/><stop offset=".35" stop-color="#ffba4b"/><stop offset=".6" stop-color="#ef9526"/><stop offset="1" stop-color="#c46518"/></linearGradient>
      </defs><g class="pen-object">${body}</g></svg>`;
  }

  let audio;
  function sound(slide, enabled) {
    if (!enabled || typeof window === 'undefined' || document.hidden) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      audio ||= new Context();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const length = slide ? .23 : .045;
      const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * length), audio.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / samples.length) * Math.exp(-i / samples.length * (slide ? 1 : 6));
      const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
      source.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = slide ? 3700 : 1900; filter.Q.value = slide ? 2 : .8; gain.gain.value = slide ? .13 : .3;
      source.connect(filter); filter.connect(gain); gain.connect(audio.destination); source.start();
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    } catch { /* Sound is optional; mechanisms still work without Web Audio. */ }
  }

  function mount(host, id, options = {}) {
    if (host.dataset.pen === id) return;
    host.dataset.pen = id;
    host.classList.add('pen-display');
    host.replaceChildren();
    const model = models[id];
    let state = initial(id);
    const stage = document.createElement('div');
    stage.className = 'pen-stage';
    stage.innerHTML = art(id); // Only fixed local artwork enters this markup.
    const caption = document.createElement('div'); caption.className = 'pen-caption';
    const name = document.createElement('strong'); name.textContent = model.name;
    const hint = document.createElement('span'); hint.textContent = model.hint;
    const status = document.createElement('span'); status.className = 'pen-state'; status.setAttribute('role', 'status');
    caption.append(name, hint, status);
    host.append(stage, caption);
    const controls = [];
    const update = () => {
      host.classList.toggle('is-extended', state.extended);
      host.classList.toggle('is-retracted', !state.extended);
      host.dataset.ready = String(state.extended);
      status.textContent = id === 'green' ? (state.extended ? 'Uncapped · ready' : 'Capped') : state.extended ? 'Ready to write' : 'Tip retracted';
      for (const [button, action] of controls) {
        const verb = action === 'release' ? 'Release side button to retract' : id === 'green' ? state.extended ? 'Put cap on' : 'Remove cap' : id === 'orange' ? 'Jiggle bubbles' : id === 'teal' ? 'Press back button to extend' : state.extended ? 'Retract tip' : 'Extend tip';
        button.setAttribute('aria-label', `${model.name}: ${verb}`);
        button.title = verb;
      }
    };
    function control(action) {
      const button = document.createElement('button'); button.type = 'button';
      button.className = `pen-control pen-control-${action}`;
      button.addEventListener('click', () => {
        state = transition(id, state, action);
        update();
        host.classList.remove('pen-actuating'); void host.offsetWidth; host.classList.add('pen-actuating');
        sound(id === 'green', options.soundEnabled?.() ?? true);
      });
      stage.appendChild(button); controls.push([button, action]);
    }
    if (model.action) control(model.action);
    if (id === 'teal') control('release');
    update();
  }
  return { models, initial, transition, art, mount };
});
