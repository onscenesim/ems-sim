'use strict';
const $ = id => document.getElementById(id);
const collections = [['animations','Animations'],['crew','Character cards'],['pens','Pens'],['stickers','Stickers'],['glovebox','Glovebox'],['drugs','Medication cards'],['sounds','Sound library'],['monitors','Monitors & ECG']];
let capnoSeed=17;
const capnoDetail=Capnography.createStrip($('capno-detail'));
for(const [id,entries] of [['capno-shape',Capnography.shapes],['capno-quality',Capnography.qualities]])for(const [key,label] of Object.entries(entries))$(id).add(new Option(label,key));
let api, crew=[], tab='animations', scene='loading', sequence=0, initialized=false;
const params = new URLSearchParams(location.hash.slice(1));
if(collections.some(([id])=>id===params.get('tab')))tab=params.get('tab');
scene=params.get('scene')||scene;
function status(text) { $('status').textContent=text; }
function bookmark() { history.replaceState(null,'','#'+new URLSearchParams({tab,scene})); }
function stop() { capnoDetail.update(null);sequence++; api?.stop(); document.querySelectorAll('audio').forEach(a=>{a.pause();a.currentTime=0;}); }
function card(name,id) {
  const node=document.createElement('article'); node.className='asset-card';
  const heading=document.createElement('h2'); heading.textContent=name;
  const detail=document.createElement('div');detail.className='asset-id';detail.textContent=id;
  node.append(heading,detail);return node;
}
function empty(root,count) { if(!count) {const p=document.createElement('p');p.className='empty';p.textContent='No matches. Try another name or clear the search.';root.append(p);} }
function matches(...values) { return values.join(' ').toLowerCase().includes($('search').value.trim().toLowerCase()); }
function options() { return {outcome:$('outcome').value,speed:$('speed').value,provider:$('provider').value,moving:$('moving').checked,sound:$('sound').checked,patient:({adult:{age:35,sex:'male'},female:{age:35,sex:'female'},child_male:{age:9,sex:'male'},child:{age:9,sex:'female'},baby:{age:2,sex:'male'}})[$('patient').value]}; }
async function play(mode='play') {
  if(!api)return;
  stop();const token=sequence;
  const selected=api.scenes.find(s=>s.id===scene);
  $('patient').disabled=selected.fixedPatient;
  if (selected.fixedPatient) $('patient').value='adult';
  status(`${selected.name} · ${$('outcome').value} · ${mode==='play'?'Playing…':mode+' pose held'}`);
  try {
    const finished=await api.play(scene,mode,options());
    if(token!==sequence)return;
    if(mode==='play'&&finished) {
      if($('loop').checked)play();else status(`${selected.name} · Finished. Replay or inspect either pose.`);
    }
  } catch(error) { status('Preview failed: '+error.message); }
}
function renderScenes() {
  $('scene-list').replaceChildren();
  const entries=api.scenes.filter(s=>matches(s.name,s.id));
  for(const item of entries) {
    const b=document.createElement('button');b.textContent=item.name;b.setAttribute('aria-pressed',String(item.id===scene));
    b.onclick=()=>{scene=item.id;bookmark();renderScenes();play('start');};$('scene-list').append(b);
  }
  empty($('scene-list'),entries.length);
  status(`${entries.length} / ${api.scenes.length} animation variants · Actual game renderers`);
}
function renderGallery() {
  const root=$('collection');root.replaceChildren();
  let count=0,total=0;
  if(tab==='crew') {
    total=crew.length;
    for(const member of crew.filter(m=>matches(m.name,m.role,m.personality_notes))) {
      const c=card('','');c.replaceChildren(document.importNode(api.card(member),true));root.append(c);count++;
    }
  } else if(tab==='pens') {
    total=CosmeticsCatalog.pens.length;
    for(const pen of CosmeticsCatalog.pens.filter(p=>matches(p.name,p.id,PenKit.models[p.id].name))) {
      const c=card(PenKit.models[pen.id].name,`${pen.id} · ${pen.name}`), stage=document.createElement('div');stage.className='pen-display';c.append(stage);
      const sample=document.createElement('div');sample.className='ink-sample';sample.style.color=pen.color;sample.textContent='Medic 1 · Back in service';c.append(sample);root.append(c);
      PenKit.mount(stage,pen.id,{soundEnabled:()=>$('sound').checked});count++;
    }
  } else if(tab==='stickers') {
    total=CosmeticsCatalog.stickers.length;
    for(const sticker of CosmeticsCatalog.stickers.filter(s=>matches(s.name,s.id))) {
      const c=card(sticker.name,sticker.src),art=document.createElement('div');art.className='sticker-art';
      if(sticker.id==='custom-note') {
        const note=document.createElement('img');note.src=api.noteImage(CosmeticsCatalog.defaults.note);note.alt='Custom Post-it preview';art.append(note);
        const input=document.createElement('input');input.className='note-control';input.maxLength=80;input.value=CosmeticsCatalog.defaults.note;input.setAttribute('aria-label','Custom Post-it text');input.oninput=()=>{note.src=api.noteImage(input.value);note.alt='Post-it: '+input.value;};c.append(input);
      } else {const img=document.createElement('img');img.src=sticker.src;img.alt=sticker.name;img.loading='lazy';art.append(img);}
      c.prepend(art);root.append(c);count++;
    }
  } else if(tab==='drugs') {
    total=api.drugs.length;
    for(const drug of api.drugs.filter(d=>matches(d.name,d.drugClass,...d.synonyms))) {
      const c=card(drug.name,drug.drugClass);c.dataset.drugClass=drug.drugClass;c.append(document.importNode(api.drug(drug),true));root.append(c);count++;
    }
  }
  empty(root,count);status(`${count} / ${total} ${collections.find(([id])=>id===tab)?.[1].toLowerCase()} · Shared production catalog`);
}
function renderSounds() {
  const root=$('sound-list');root.replaceChildren();
  const entries=api.sounds.filter(s=>matches(s.id,s.src));
  for(const sound of entries) {
    const c=card(sound.id.replaceAll('_',' '),`${sound.src} · Game level ${Math.round(sound.level*100)}%`),audio=document.createElement('audio');
    audio.controls=true;audio.preload='none';audio.src=sound.src;audio.volume=sound.level;audio.muted=!$('sound').checked;
    audio.onplay=()=>{if(!$('sound').checked){audio.pause();status('Enable sound to audition a recording.');return;}document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();});};
    audio.onerror=()=>status(`Unable to load ${sound.src}`);c.append(audio);root.append(c);
  }
  empty(root,entries.length);status(`${entries.length} / ${api.sounds.length} game sound cues`);
}
function render() {
  if(!api)return;
  stop();bookmark();
  for(const id of ['animations','collection','glovebox','sounds','monitors'])$(id).hidden=true;
  $('search-label').hidden=['glovebox','monitors'].includes(tab);
  $('animations').hidden=!['animations','monitors'].includes(tab);
  document.body.classList.toggle('monitor-mode',tab==='monitors');
  $('ecg-output').hidden=tab!=='monitors';
  $('capno-lab').hidden=tab!=='monitors';
  document.querySelectorAll('#tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));
  if(tab==='animations') {renderScenes();play('start');}
  else if(tab==='glovebox') { $('glovebox').hidden=false;const frame=$('glovebox-frame');if(!frame.src)frame.src=frame.dataset.src;status(`${GloveboxCatalog.items.length} glovebox objects · Inspect and sort with disposable data`); }
  else if(tab==='monitors') { $('monitors').hidden=false;renderMonitor(); }
  else if(tab==='sounds') { $('sounds').hidden=false;renderSounds(); }
  else { $('collection').hidden=false;renderGallery(); }
}
for(const [id,name] of collections) {const b=document.createElement('button');b.textContent=name;b.dataset.tab=id;b.onclick=()=>{tab=id;$('search').value='';render();};$('tabs').append(b);}
$('play').onclick=()=>play();$('start').onclick=()=>play('start');$('action').onclick=()=>play('action');$('end').onclick=()=>play('end');$('stop').onclick=()=>{stop();status('Stopped. Select a pose or press Play.');};
$('search').oninput=()=>{if(!api)return;if(tab==='animations')renderScenes();else if(tab==='sounds')renderSounds();else renderGallery();};
for(const id of ['outcome','patient','provider','moving','speed'])$(id).onchange=()=>play('start');
$('theme').onchange=()=>{const light=$('theme').value==='light';document.body.classList.toggle('light-mode',light);api?.theme(light);};
$('sound').onchange=()=>{if(!$('sound').checked)stop();document.querySelectorAll('audio').forEach(a=>a.muted=!$('sound').checked);};
$('reset').onclick=()=>{stop();scene='loading';$('rhythm').value='sinus';$('rate').value='80';$('pattern').value='normal';$('lead-view').value='standard';$('signal').value='good';$('ecg-quality').value='SUCCESS';$('ecg-motion').value='auto';$('capno-input').value='airway';$('capno-rate').value=12;$('capno-value').value=38;$('capno-shape').value='normal';$('capno-quality').value='clean';$('capno-connection').value='connected';capnoSeed=17;$('search').value='';$('loop').checked=false;$('sound').checked=false;$('outcome').value='SUCCESS';$('speed').value='1';$('patient').value='adult';$('provider').value='ALS';$('moving').checked=false;$('theme').value='dark';$('theme').onchange();if(tab==='glovebox')$('glovebox-frame').src=$('glovebox-frame').dataset.src;render();};
window.addEventListener('hashchange',()=>{const p=new URLSearchParams(location.hash.slice(1));if(collections.some(([id])=>id===p.get('tab')))tab=p.get('tab');if(api?.scenes.some(s=>s.id===p.get('scene')))scene=p.get('scene');render();});
function renderMonitor() {
  if(!api)return;
  $('ecg-printout').innerHTML=api.monitor({rhythm:$('rhythm').value,rate:Math.max(0,Math.min(300,Number($('rate').value)||0)),pattern:$('pattern').value,view:$('lead-view').value,quality:$('signal').value,ecgQuality:$('ecg-quality').value,capnography:capnoOptions()});
  renderCapno();
  api.motion($('ecg-motion').value);
  status(`${Object.keys(api.catalog.rhythms).length} rhythms · ${Object.keys(api.catalog.patterns).length} ECG patterns · Production waveforms and printouts`);
}
$('monitor-refresh').onclick=renderMonitor;
for(const id of ['rate','pattern','lead-view','signal','ecg-quality'])$(id).onchange=renderMonitor;
$('rhythm').onchange=()=>{$('rate').value=api.catalog.rhythms[$('rhythm').value].rate;renderMonitor();};
async function initialize() {
  if(initialized)return;
  try {api=$('runtime').contentWindow.EMSTestLab;if(!api)return;initialized=true;crew=await(await fetch('/lab/crew')).json();for(const [id,entries] of [['rhythm',api.catalog.rhythms],['pattern',api.catalog.patterns],['lead-view',api.catalog.views]]) { for(const [value,entry] of Object.entries(entries))$(id).add(new Option(entry.label||value.replaceAll('_',' '),value)); }$('rhythm').value='sinus';if(!api.scenes.some(s=>s.id===scene))scene='loading';render();const missing=api.coverage();if(missing.length)status('New scenes need lab controls: '+missing.join(', '));}
  catch(error){status('Lab failed to initialize: '+error.message);}
}
window.addEventListener('lab-ready',initialize);
$('runtime').addEventListener('load',()=>{initialize();if(!api)status('The production preview could not initialize. Check the browser console and reload the lab.');});
initialize();
window.addEventListener('pagehide',stop);

function capnoOptions(){return Capnography.normalize({source:$('capno-input').value,status:$('capno-connection').value,rate:Number($('capno-rate').value),etco2:Number($('capno-value').value),shape:$('capno-shape').value,quality:$('capno-quality').value,seed:capnoSeed});}
function renderCapno(){if(!api)return;const signal=capnoOptions();api.capnography(signal);capnoDetail.update(signal);$('capno-lab-label').textContent=Capnography.description(signal);$('capno-lab-numbers').textContent=signal.status==='connected'?`EtCO₂ ${signal.etco2??'—'} mmHg · RR ${signal.rate??'—'}/min`:'EtCO₂ — · RR —';}
for(const id of ['capno-rate','capno-value','capno-shape','capno-quality','capno-connection'])$(id).onchange=renderCapno;
$('capno-shape').onchange=()=>{const shape=$('capno-shape').value;if(shape==='apnea'){$('capno-rate').value=0;$('capno-value').value=0;}else if(shape==='low_flow'){$('capno-value').value=12;}else if(Number($('capno-rate').value)===0){$('capno-rate').value=12;$('capno-value').value=38;}renderCapno();};
$('capno-input').onchange=()=>{$('capno-quality').value=$('capno-input').value==='airway'?'clean':'variable';renderCapno();};
$('capno-variant').onclick=()=>{capnoSeed++;renderCapno();};

$('ecg-motion').onchange=()=>api?.motion($('ecg-motion').value);
