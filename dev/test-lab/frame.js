'use strict';
// This bridge is served only by the loopback test server, after the real app scripts.
(() => {
  const style = document.createElement('style');
  style.textContent = 'html,body{height:100%;overflow:hidden}body{min-height:0}body> :not(#terminal):not(svg):not(script){display:none!important}#terminal{display:block!important;height:100%;border:0}#terminal> :not([id$="-overlay"]):not(svg){display:none!important}';
  style.textContent += 'body.lab-monitor #terminal>#vitals-bar{display:flex!important;flex-wrap:wrap;margin:30px 10px}body.lab-monitor #rhythm-cell{min-width:280px;flex:1}body.lab-monitor #vitals-expand{display:none}';
  document.head.append(style);
  soundEnabled = false;
  const ballOverlay = document.createElement('div');ballOverlay.id='eightball-overlay';ballOverlay.setAttribute('aria-hidden','true');
  ballOverlay.style.cssText='position:fixed;inset:0;align-items:center;justify-content:center;flex-direction:column;background:var(--bg)';
  const ballStyle=document.createElement('style');ballStyle.textContent='#eightball-overlay{display:none}#eightball-overlay.visible{display:flex}#eightball-response{position:static;display:block;min-height:40px}';document.head.append(ballStyle);
  ballOverlay.append(eightball,eightballResponse);terminal.append(ballOverlay);
  const scenes = [];
  const add = (id, name, overlay, run, duration) => scenes.push({ id, name, overlay, run, duration });
  add('dispatch', 'Dispatch radio', 'dispatch', () => { playSound('dispatch'); return animateDispatch(); }, 1700);
  add('signoff', 'Radio signoff', 'signoff', () => { showSignoffAnimation(); return new Promise(resolve => setTimeout(resolve, 2550)); }, 2200);
  add('loading', 'Load patient', 'loading', o => { playSound(o.provider === 'BLS' ? 'sfx_loading_bls' : 'sfx_loading_als'); return animateLoading(o.patient); }, TRANSPORT_TIMING.loading.hold);
  add('depart', 'Depart scene', 'depart', () => { playSound('sfx_depart'); return animateDepart(); }, TRANSPORT_TIMING.depart.hold);
  for (const [id, name, procedure] of [
    ['npa','Nasopharyngeal airway','nasopharyngeal_airway'], ['obstruction','Remove obstruction','foreign_body_removal'],
    ['chest_seal','Chest seal','chest_seal'], ['pacing','Transcutaneous pacing','pacing'],
    ['defib','Defibrillation','defibrillation'], ['cardioversion','Synchronized cardioversion','cardioversion'],
    ['bleeding_control','Direct pressure','bleeding_control'], ['tourniquet','Tourniquet','tourniquet'],
    ['bvm','Bag valve mask','bvm'], ['lucas','LUCAS compressions','lucas'],
    ['laryngoscope','Intubation','intubation'], ['rsi','Rapid sequence intubation','rsi'],
    ['sga','Supraglottic airway','supraglottic_airway'], ['ncd','Needle decompression','needle_decompression'],
    ['suction','Suction','suction'], ['opa','Oropharyngeal airway','oropharyngeal_airway'],
    ['scalpel','Cricothyrotomy','cricothyrotomy'], ['finger_thoracostomy','Finger thoracostomy','finger_thoracostomy'],
    ['resuscitative_thoracotomy','Resuscitative thoracotomy','resuscitative_thoracotomy'], ['perimortem_csection','Perimortem C-section','perimortem_csection'],
  ]) {
    const overlay = id === 'cardioversion' ? 'defib' : id === 'rsi' ? 'laryngoscope' : SCALPEL_PROCS.has(id) ? 'scalpel' : id;
    const run = overlay === 'defib'
      ? o => animateDefib(procedure, o.outcome, o.mode === 'play' ? (procedure === 'cardioversion' ? 100 : 200) : undefined, speed)
      : overlay === 'laryngoscope'
      ? o => animateLaryngoscope(procedure, o.outcome)
      : o => animateProcedureScene(overlay, procedure, o.outcome);
    add(id, name, overlay, run, PROCEDURE_TIMING[overlay].hold);
  }
  add('goose', 'Goose honk', 'goose', () => animateGoose(), PROCEDURE_TIMING.goose.hold);
  add('io','IO drill','io', o => animateDrill(o.outcome),2200);
  add('iv','Peripheral IV','iv', o => animateIV(o.outcome),2500);
  add('thump','Precordial thump','thump', o => animateThorsHammer(o.outcome),1700);
  add('cpr','Manual CPR','cpr', o => animateCPR(o.outcome),1650);
  add('ncric','Needle cricothyrotomy','ncric', o => animateNCD(o.outcome,'needle_cricothyrotomy'),2600);
  add('ekg','12-lead acquisition','ekg', o => animateTwelveLead(o.outcome),2600);
  for (const view of ['right', 'posterior', 'v4r']) {
    const { label, procedure } = TwelveLead.catalog.views[view];
    add(procedure, label, 'ekg', o => animateTwelveLead(o.outcome, procedure), 2600);
  }
  add('medpush','IV medication push','medpush', o => animateMedPush(o.outcome),2500);
  add('medpush_io','IO medication push','medpush', o => animateMedPush(o.outcome,'IO','TEST MEDICATION'),2500);
  for (const [id,name,route,duration] of [['oralmed','Oral / sublingual medication','PO',2600],['immed','IM medication','IM',2600],['inmed','Intranasal medication','IN',2300],['nebmed','Nebulized medication','NEB',2800]]) {
    add(id,name,id,o => animateMedicationAdministration({ outcome:o.outcome, administration_route:route }),duration);
  }
  for (const kind of ['fluid','blood']) for (const route of ['IV','IO']) {
    add(`${kind}_${route}`,`${route} ${kind === 'blood' ? 'blood' : 'fluid'} infusion`,'infusion',o => animateMedicationAdministration({outcome:o.outcome,medication_kind:kind,administration_route:route,medication_name:kind === 'blood' ? 'BLOOD' : 'IV FLUID'}),3200);
  }
  add('oxygen','Supplemental oxygen','oxygen',o => animateRouteMedication('oxygen',o.outcome,2800),2800);
  add('niv','Noninvasive ventilation','niv',o => animateNIV({outcome:o.outcome}),3200);
  add('dice','D20 procedure roll','dice',o => animateDiceRoll('peripheral_iv',({SUCCESS:20,MARGINAL:12,FAILURE:5,COMPLICATION:1})[o.outcome],14,o.outcome),1180);

  add('eightball','Magic 8-ball','eightball',()=>{ballOverlay.classList.add('visible');eightball.click();return new Promise(resolve=>setTimeout(()=>{ballOverlay.classList.remove('visible');resolve();},3000));},2900);
  const nativeTimeout = window.setTimeout.bind(window), nativeInterval = window.setInterval.bind(window);
  const timers = new Set(), intervals = new Set();
  let tracking = false, speed = 1, generation = 0, activeOverlay, followupObserver;
  const privacyStops = new Set();
  const privacyStart = PatientPrivacy.start.bind(PatientPrivacy);
  PatientPrivacy.start = (...args) => { const cleanup = privacyStart(...args); privacyStops.add(cleanup); return () => { cleanup(); privacyStops.delete(cleanup); }; };
  const nativeNow = performance.now.bind(performance);
  let clockOrigin = nativeNow();
  performance.now = () => tracking ? clockOrigin + (nativeNow() - clockOrigin) * speed : nativeNow();
  window.setTimeout = (fn, delay, ...args) => {
    if (!tracking) return nativeTimeout(fn, delay, ...args);
    const id = nativeTimeout(() => { timers.delete(id); fn(...args); }, delay / speed);
    timers.add(id); return id;
  };
  window.setInterval = (fn, delay, ...args) => {
    const id = nativeInterval(fn, tracking ? delay / speed : delay, ...args);
    if (tracking) intervals.add(id); return id;
  };
  function cancelTimers() { timers.forEach(clearTimeout); intervals.forEach(clearInterval); timers.clear(); intervals.clear(); }
  function stop() {
    generation++; tracking = false; cancelActiveShock?.(); cancelTimers(); stopAllSounds(); privacyStops.forEach(fn => fn()); privacyStops.clear();
    followupObserver?.disconnect();
    document.getAnimations().forEach(a => a.cancel());
    document.querySelectorAll('[id$="-overlay"]').forEach(el => { el.classList.remove('visible','is-fading','fade-out'); el.style.removeProperty('opacity'); el.style.removeProperty('transition'); el.setAttribute('aria-hidden','true'); });
    activeOverlay = null; document.body.classList.remove('lab-monitor'); stopRhythmStrip(); plethStrip.update(null); updateCapnography(null);
  }
  function freeze(scene, mode, o) {
    cancelTimers(); tracking = false; stopAllSounds();
    const el = document.getElementById(`${scene.overlay}-overlay`);
    // The overlay itself must be opaque; seeking its opacity transition to zero
    // would hide the starting pose we are trying to inspect.
    el.style.transition = 'none'; el.style.opacity = '1';
    for (const animation of el.getAnimations({subtree:true})) {
      if (animation.effect?.target === el) continue;
      animation.pause();
      const timing = PROCEDURE_TIMING[scene.overlay];
      const actionTime = scene.overlay === 'bvm' ? timing.start + timing.cycle * .5
        : scene.overlay === 'lucas' ? timing.start + timing.cycle * .45
        : scene.overlay === 'defib' ? timing.result + 64
        : scene.overlay === 'cpr' ? 275 : scene.duration * .5;
      animation.currentTime = mode === 'start' ? 0 : mode === 'action' ? actionTime : Math.max(0, scene.duration - 1);
    }
    if (scene.id === 'dice' && mode === 'end') {
      diceNumberEl.textContent = ({SUCCESS:20,MARGINAL:12,FAILURE:5,COMPLICATION:1})[o.outcome];
      diceSvgEl.setAttribute('class',o.outcome); diceOutcomeEl.textContent=o.outcome; diceOutcomeEl.className=`visible ${o.outcome}`;
    }
    PatientPrivacy?.start(el,{held:true});
  }
  window.EMSTestLab = {
    scenes: scenes.map(({run,...scene})=>scene),
    catalog: TwelveLead.catalog,
    monitor({rhythm,rate,pattern,view,quality,ecgQuality='SUCCESS',capnography=null}) {
      stop(); document.body.classList.add('lab-monitor');
      const pulse={quality,reliable:quality==='good',reason:quality==='good'?'reliable':quality==='poor'?'low_perfusion':quality==='absent'?'no_pulse':'motion',pulseRate:rate,perfusionIndex:quality==='good'?4.2:0.2};
      applyVitals({Rhythm:rhythm,HR:rate,BP:'120/80',SpO2:98,PulseOx:pulse,Capnography:capnography,ETCO2:capnography?.status==='connected'?capnography.etco2:undefined,RR:capnography?.rate});
      return TwelveLead.svg(TwelveLead.create({seed:{ecg_pattern:pattern},vitals:{Rhythm:rhythm,HR:rate},view,outcome:ecgQuality,entropy:42,patient:{age:35,sex:'male'}}));
    },
    motion(mode) {
      rhythmStrip.artifactPreview=['clean','scene','transport'].includes(mode)?mode:'auto';
      window._isMoving=mode==='transport'||mode==='auto_transport';
    },
    capnography(signal) { applyVitals({...currentVitals,Capnography:signal,ETCO2:signal?.status==='connected'?signal.etco2:undefined,RR:signal?.rate}); },
    sounds: Object.entries(SOUNDS).filter(([,src])=>src).map(([id,src])=>({id,src,level:SOUND_LEVELS[id]??1})),
    drugs: DRUG_CARDS,
    noteImage(message) {
      localStorage.setItem('ems_guest_cosmetics',JSON.stringify({pen:'navy',stickers:['custom-note'],note:message}));
      EMSCosmetics.refresh();
      return document.querySelector('#notepad-stickers img').src;
    },
    card: member => { const node=buildCrewMemberCard(member); node.querySelector('[id]')?.removeAttribute('id'); return node; },
    drug: card => { renderDrugPanel(card); const node=drugPanelBody.cloneNode(true); drugPanel.classList.remove('open'); node.removeAttribute('id'); return node; },
    stop,
    theme: light => document.body.classList.toggle('light-mode',light),
    async play(id, mode, options) {
      stop(); const token = generation;
      const scene = scenes.find(scene=>scene.id===id);
      if (!scene) throw new Error(`Unknown animation: ${id}`);
      activeOverlay = document.getElementById(`${scene.overlay}-overlay`);
      activeOverlay.style.removeProperty('opacity'); activeOverlay.style.removeProperty('transition');
      soundEnabled = mode === 'play' && options.sound;
      window._isMoving = options.moving;
      localTranscript={meta:{provider_level:options.provider}};
      configureAirwayPatient(options.patient);
      speed = Number(options.speed) || 1; clockOrigin = nativeNow(); tracking = true;
      if (soundEnabled) unlockAudio();
      if (mode === 'play' && scene.overlay === 'laryngoscope' && options.outcome === 'COMPLICATION') {
        const goose = document.getElementById('goose-overlay');
        followupObserver = new MutationObserver(() => {
          if (!goose.classList.contains('visible')) return;
          followupObserver.disconnect();
          activeOverlay.setAttribute('aria-hidden', 'true');
          activeOverlay = goose;
          goose.setAttribute('aria-hidden', 'false');
          goose.getAnimations({ subtree: true }).forEach(a => a.updatePlaybackRate(speed));
        });
        followupObserver.observe(goose, { attributes: true, attributeFilter: ['class'] });
      }
      const result=scene.run({ ...options, mode });
      await new Promise(requestAnimationFrame);
      if(token!==generation)return;
      activeOverlay.setAttribute('aria-hidden','false');
      if(mode!=='play') { freeze(scene,mode,options); return; }
      activeOverlay.getAnimations({subtree:true}).forEach(a=>a.updatePlaybackRate(speed));
      await result;
      if(token===generation) { tracking=false; activeOverlay.setAttribute('aria-hidden','true'); return true; }
    },
    coverage: () => [...document.querySelectorAll('[id$="-overlay"]')].map(el=>el.id.replace(/-overlay$/,'')).filter(id=>!['auth','progress'].includes(id)&&!scenes.some(scene=>scene.overlay===id)),
  };
  window.parent.dispatchEvent(new Event('lab-ready'));
})();
