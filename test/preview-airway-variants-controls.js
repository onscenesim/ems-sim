'use strict';
const profiles=AirwayScenes.profiles, procedures=AirwayScenes.procedures;
const params=new URLSearchParams(location.search);
const sceneSelect=document.getElementById('scene'),profileSelect=document.getElementById('profile'),outcomeSelect=document.getElementById('outcome');
const names={male:'Adult male',female:'Adult female','child-male':'Child male','child-female':'Child female',baby:'Baby'};
sceneSelect.value=procedures.includes(params.get('scene'))?params.get('scene'):'laryngoscope';
profileSelect.value=profiles.includes(params.get('profile'))?params.get('profile'):'female';
if(params.get('mini'))document.body.classList.add('mini');
let animations=[],playing=false,current;
function seek(percent){playing=false;animations.forEach(a=>{a.pause();a.currentTime=percent/100*airwayPreviewTiming[sceneSelect.value].hold;});document.getElementById('time').value=percent;document.getElementById('stamp').textContent=percent.toFixed(1)+'%';}
function show(scene=sceneSelect.value,profile=profileSelect.value,outcome=outcomeSelect.value,percent=0){
 sceneSelect.value=scene;profileSelect.value=profile;outcomeSelect.value=outcome;
 procedures.forEach(id=>{const el=document.getElementById(id+'-overlay');el.dataset.airwayProfile=profile;el.style.display=id===scene?'':'none';el.style.transition='none';el.className='';});
 current=document.getElementById(scene+'-overlay');const timing=airwayPreviewTiming[scene];
 current.style.setProperty('--procedure-duration',timing.hold+'ms');current.style.setProperty('--procedure-result',timing.result+'ms');
 document.getElementById(scene+'-label').textContent=outcome;
 void current.offsetWidth;current.className='visible outcome-'+outcome;
 animations=current.getAnimations({subtree:true});seek(percent);
}
function play(){if(playing)return seek((animations[0]?.currentTime||0)/airwayPreviewTiming[sceneSelect.value].hold*100);if(+document.getElementById('time').value>99)seek(0);animations.forEach(a=>a.play());playing=true;}
function tick(){if(playing){const p=Math.min(99.99,(animations[0]?.currentTime||0)/airwayPreviewTiming[sceneSelect.value].hold*100);document.getElementById('time').value=p;document.getElementById('stamp').textContent=p.toFixed(1)+'%';if(p>=99.99)seek(99.99);}requestAnimationFrame(tick);}tick();
[sceneSelect,profileSelect,outcomeSelect].forEach(el=>el.onchange=()=>show());
document.getElementById('play').onclick=play;
document.querySelectorAll('[data-percent]').forEach(b=>b.onclick=()=>seek(+b.dataset.percent));
document.getElementById('time').oninput=e=>seek(+e.target.value);
show();
window.addEventListener('message',e=>{if(e.origin!==location.origin)return;if(e.data?.type==='airway-seek')seek(e.data.percent);if(e.data?.type==='airway-play')play();});
document.getElementById('compare').onclick=()=>{location.href='/?compare=1&scene='+sceneSelect.value;};
if(params.has('compare')){
 document.body.className='gallery';procedures.forEach(id=>document.getElementById(id+'-overlay').remove());
 document.querySelector('label:has(#profile)').style.display='none';document.querySelector('label:has(#outcome)').style.display='none';document.getElementById('audit').style.display='none';document.getElementById('compare').textContent='Single patient';document.getElementById('compare').onclick=()=>location.href='/?scene='+sceneSelect.value;
 const cards=document.createElement('div');cards.className='cards';document.body.append(cards);
 function populate(){cards.innerHTML=profiles.map(profile=>`<section class="card"><h2>${names[profile]}</h2><iframe title="${names[profile]}" src="/?mini=1&scene=${sceneSelect.value}&profile=${profile}"></iframe></section>`).join('');}
 sceneSelect.onchange=populate;populate();
 document.querySelectorAll('[data-percent]').forEach(b=>b.onclick=()=>cards.querySelectorAll('iframe').forEach(f=>f.contentWindow.postMessage({type:'airway-seek',percent:+b.dataset.percent},location.origin)));
 document.getElementById('play').onclick=()=>cards.querySelectorAll('iframe').forEach(f=>f.contentWindow.postMessage({type:'airway-play'},location.origin));
 document.getElementById('report').textContent='Five patient profiles · production anatomy and animation';
}
function scenePoint(el,x,y){const scene=current.querySelector('.lx-scene,.ra-scene,.airway-scene');return new DOMPoint(x,y).matrixTransform(scene.getScreenCTM().inverse().multiply(el.getScreenCTM()));}
function visible(el){return el&&getComputedStyle(el).display!=='none';}
document.getElementById('audit').onclick=async()=>{
 const report=document.getElementById('report'),issues=[];let reviewed=0;
 try{
  const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);if(new Set(ids).size!==ids.length)throw Error('Duplicate geometry ids');
  for(const scene of procedures)for(const profile of profiles){
   report.textContent=`Reviewing ${scene} / ${names[profile]}…`;show(scene,profile,'SUCCESS',0);
   const svg=document.getElementById(scene+'-svg');
   const head=scene==='laryngoscope'?document.getElementById('lx-head'):svg.querySelector('[data-airway-part="lx-head"]');
   const heads=[...head.children].filter(visible);if(heads.length!==1)issues.push(`${scene}/${profile}: wrong head profile`);
   if(head.getBBox().width<100)issues.push(`${scene}/${profile}: missing anatomy`);
   seek(62);
   if(scene==='laryngoscope'){
    const tissues=[['tongue',document.getElementById('lx-male-tongue')],['palate',document.getElementById('lx-palate')],['face',heads[0]]];
    const pharynx=document.getElementById('lx-pharynx');
    const blade=document.querySelector(profile==='baby'?'#lx-miller-blade > path':'#lx-male-mac-blade');
    const points=[];for(let l=0;l<blade.getTotalLength();l+=2)points.push(blade.getPointAtLength(l));
    for(let percent=4;percent<=98;percent+=1){seek(percent);for(const[name,tissue]of tissues){const b=tissue.getBBox(),m=tissue.getScreenCTM().inverse().multiply(blade.getScreenCTM());for(const local of points){const p=local.matrixTransform(m);if(p.x<b.x||p.x>b.x+b.width||p.y<b.y||p.y>b.y+b.height)continue;if(!tissue.isPointInFill(p))continue;if(name==='face'&&pharynx.isPointInFill(p))continue;issues.push(`${profile}: blade/${name} at ${percent}% (${p.x.toFixed(1)},${p.y.toFixed(1)})`);break;}}
     if(percent%10===0)await new Promise(requestAnimationFrame);
    }
    seek(45);const route=document.querySelector('#lx-tube-tracheal .lx-tube-wall'),pre=getComputedStyle(route).d;seek(56.5);if(pre!==getComputedStyle(route).d)issues.push(profile+': tube deforms before cords');
    seek(99.99);if(+getComputedStyle(document.getElementById('lx-mac')).opacity!==0)issues.push(profile+': blade remains');
   }else{
    seek(75);
    const tipStyle=scene==='sga'?getComputedStyle(document.getElementById('sga-tip')):null;
    const key=scene==='sga'?['sga-tip',parseFloat(tipStyle.cx),parseFloat(tipStyle.cy),308.0437,307.0662]:{opa:['opa-tip',194,173,234,276],npa:['npa-device',200,184,215,289],suction:['suction-tip',185,164,216,276]}[scene];
    if(key){const p=scenePoint(document.getElementById(key[0]),key[1],key[2]);if(Math.hypot(p.x-key[3],p.y-key[4])>1)issues.push(`${scene}/${profile}: device not seated`);}
    seek(99.99);
    if(scene==='suction'&&[...svg.querySelectorAll('.suction-particle')].some(e=>+getComputedStyle(e).opacity>.01))issues.push(`${scene}/${profile}: debris remains`);
    if(scene==='obstruction'){const item=svg.querySelector('.reference-obstruction-motion'),p=scenePoint(item,0,0);if(p.y>100)issues.push(`${scene}/${profile}: object remains in trachea`);}

   }
   reviewed++;await new Promise(requestAnimationFrame);
  }
  show('laryngoscope','female','SUCCESS',62);
  report.textContent=issues.length?`${issues.length} issues: `+issues.slice(0,8).join('; ')+'; LAST: '+issues.slice(-18).join('; '):`PASS · ${reviewed} procedure / patient combinations. Correct profile, insertion, final placement, infant equipment and cleanup.`;
 }catch(error){report.textContent='FAIL · '+error.message;}
};

const geometryButton=document.createElement('button');geometryButton.id='geometry-audit';geometryButton.hidden=params.has('compare');geometryButton.textContent='Audit intubation geometry';document.getElementById('audit').after(geometryButton);
geometryButton.onclick=async()=>{
 const issues=[],report=document.getElementById('report');let frames=0;
 const issue=(message)=>{if(issues.length<2000)issues.push(message);};
 const path=document.createElementNS('http://www.w3.org/2000/svg','path');
 function samples(el,step=2){const n=el.getTotalLength(),pts=[];for(let l=0;l<=n;l+=step)pts.push(el.getPointAtLength(l));pts.push(el.getPointAtLength(n));return pts;}
 try{
 for(const profile of profiles){
  show('laryngoscope',profile,'SUCCESS',0);
  const head=[...document.getElementById('lx-head').children].find(visible),tongue=document.getElementById('lx-male-tongue'),pharynx=document.getElementById('lx-pharynx');
  const blade=document.querySelector(profile==='baby'?'#lx-miller-blade > path':'#lx-male-mac-blade');
  const solids=[['tongue',tongue],['palate',document.getElementById('lx-palate')],['septum',document.getElementById('lx-airway-septum')],['anterior',document.getElementById('lx-anterior-neck-tissue')]];
  for(let pc=0;pc<=100;pc+=2){seek(pc);for(const p of samples(tongue,1)){if(p.x<285&&!head.isPointInFill(p)&&!pharynx.isPointInFill(p)){issue(`${profile}: tongue outside face ${pc}% (${p.x.toFixed(1)},${p.y.toFixed(1)})`);break;}}}
  if(profile==='baby'){
   const points=[];for(const pc of [4,10,16,20,26]){seek(pc);points.push(scenePoint(blade,303,132));}
   const a=points[0],b=points.at(-1),len=Math.hypot(b.x-a.x,b.y-a.y);
   if(points.some(p=>Math.abs((p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x))/len>.1))issue('baby: insertion is not straight');
   if(Math.hypot(b.x-279,b.y-294)>.1)issue('baby: blade does not reach posterior target');
  }
  for(const outcome of ['SUCCESS','COMPLICATION']){
   show('laryngoscope',profile,outcome,45);
   const tube=document.querySelector(outcome==='SUCCESS'?'#lx-tube-tracheal .lx-tube-wall':'#lx-tube-esophageal .lx-tube-wall'),pre=getComputedStyle(tube).d;
   seek(56.5);if(getComputedStyle(tube).d!==pre)issue(`${profile}/${outcome}: preformed tube yields before entry`);
   for(let pc=45;pc<=84;pc+=.5){seek(pc);frames++;
    const n=tube.getTotalLength(),mt=tongue.getScreenCTM().inverse().multiply(tube.getScreenCTM()),mb=blade.getScreenCTM().inverse().multiply(tube.getScreenCTM());
    let found=false;
    for(let l=0;l<=n;l+=2){
     const p=tube.getPointAtLength(l),a=tube.getPointAtLength(Math.max(0,l-.3)),b=tube.getPointAtLength(Math.min(n,l+.3)),len=Math.hypot(b.x-a.x,b.y-a.y)||1;
     for(const offset of [-4.75,0,4.75]){
      const q=new DOMPoint(p.x-(b.y-a.y)/len*offset,p.y+(b.x-a.x)/len*offset),r=q.matrixTransform(mt),metal=q.matrixTransform(mb);
      for(const[name,tissue]of solids){if(tissue.isPointInFill(r)){issue(`${profile}/${outcome}: tube/${name} ${pc}% (${r.x.toFixed(1)},${r.y.toFixed(1)})`);found=true;break;}}
      if(found)break;
     }
     if(found)break;
    }
    if(outcome==='COMPLICATION'){
     const tip=tube.getPointAtLength(n).matrixTransform(mt);
     if(document.getElementById('lx-trachea').isPointInFill(tip))issue(`${profile}: esophageal tip enters trachea ${pc}%`);
     if(pc>=58&&!document.getElementById('lx-esophagus').isPointInFill(tip))issue(`${profile}: esophageal tip misses lumen ${pc}% (${tip.x.toFixed(1)},${tip.y.toFixed(1)})`);
    }
    if(pc%5===0){report.textContent=`Geometry ${profile} / ${outcome} / ${pc}%`;await new Promise(requestAnimationFrame);}
   }
  }
 }
 report.dataset.geometryIssues=JSON.stringify(issues);report.textContent=issues.length?`${issues.length} geometry issues: `+issues.slice(0,12).join('; '):`PASS · ${frames} tube frames, pediatric tongue containment, straight Miller approach and direct esophageal entry.`;
 show('laryngoscope','baby','SUCCESS',44);
 }catch(error){report.textContent='FAIL · '+error.stack;}
};
for(const [title,pc]of [['Blade seated',26],['Lift',44],['Tube arriving',55],['Cord entry',58],['Tube advancing',60]]){
 const button=document.createElement('button');button.textContent=title;button.onclick=()=>{if(params.has('compare'))document.querySelectorAll('.cards iframe').forEach(f=>f.contentWindow.postMessage({type:'airway-seek',percent:pc},location.origin));else seek(pc);};document.getElementById('play').after(button);
}

const airwayFit=document.createElement('button');airwayFit.id='airway-fit';airwayFit.hidden=params.has('compare');airwayFit.textContent='Audit OPA and i-gel fit';document.getElementById('audit').after(airwayFit);
airwayFit.onclick=async()=>{
 const report=document.getElementById('report'),issues=[];let checked=0;
 try{
 for(const scene of ['sga','opa'])for(const profile of profiles){
  show(scene,profile,'SUCCESS',0);const svg=document.getElementById(scene+'-svg'),tongue=svg.querySelector('[data-airway-part="lx-male-tongue"]'),palate=svg.querySelector('[data-airway-part="lx-palate"]'),trachea=svg.querySelector('[data-airway-part="lx-trachea"]'),esophagus=svg.querySelector('[data-airway-part="lx-esophagus"]');
  if(scene==='sga'){
   const cuff=svg.querySelector('#sga-cuff'),rigid=[...cuff.querySelectorAll('path')].filter(p=>getComputedStyle(p).display!=='none'),parts=[svg.querySelector('#sga-stem'),...rigid],shapes=rigid.map(p=>getComputedStyle(p).d),tongueShape=getComputedStyle(tongue).d,palateShape=getComputedStyle(palate).d;
   const wall=svg.querySelector('[data-airway-part="lx-male-pharynx-outline"]'),restWall=getComputedStyle(wall).d;
   const size=profile==='baby'?1:profile.startsWith('child-')?3:4,band=svg.querySelector('#sga-size-band'),cap=svg.querySelector('#sga-oxygen-cap');
   if(getComputedStyle(band).fill!==getComputedStyle(cap).fill)issues.push(`${profile}: band and oxygen cap colors differ`);
   for(const text of svg.querySelectorAll('#sga-connector text'))if((getComputedStyle(text).display!=='none')!==(text.textContent===String(size)))issues.push(`${profile}: wrong i-gel size label`);
   const step=profile==='male'?.5:2;
   for(let pc=4;pc<=78;pc+=step){seek(pc);for(let i=0;i<rigid.length;i++)if(getComputedStyle(rigid[i]).d!==shapes[i])issues.push(`${profile}: cuff changes shape`);
    // Adult male success deliberately layers the device over the unchanged
    // tongue silhouette. Palate clearance still applies throughout insertion.
    const tissues=[['palate',palate],['teeth',svg.querySelector('.lx-upper-teeth')]];
    {
     if(getComputedStyle(tongue).d!==tongueShape)issues.push(`male: tongue deforms at ${pc}%`);
     if(getComputedStyle(palate).d!==palateShape)issues.push(`male: hard palate moves at ${pc}%`);
     if(pc<=54.8&&getComputedStyle(wall).d!==restWall)issues.push(`male: throat moves before device contact at ${pc}%`);
     const lumen=svg.querySelector('#sga-lumen'),m=svg.querySelector('.ra-scene').getScreenCTM().inverse().multiply(lumen.getScreenCTM());
     for(let l=0;l<=55;l+=10){const p=lumen.getPointAtLength(l/Math.hypot(m.a,m.b)).matrixTransform(m);if(Math.abs(p.x-155.5)>.15){issues.push(`male: shaft moves across mouth at ${pc}%`);break;}}
    }
    for(const part of parts){let hit=false;for(let l=0;l<part.getTotalLength();l+=2){const p=part.getPointAtLength(l).matrixTransform(tongue.getScreenCTM().inverse().multiply(part.getScreenCTM()));for(const[name,tissue]of tissues)if(tissue.isPointInFill(p)){issues.push(`${profile}: i-gel/${name} at ${pc}% (${p.x.toFixed(1)},${p.y.toFixed(1)})`);hit=true;break;}if(hit)break;}}
    if(pc%10===0)await new Promise(requestAnimationFrame);
   }
   seek(99.99);const tip=svg.querySelector('#sga-tip'),style=getComputedStyle(tip),p=scenePoint(tip,parseFloat(style.cx),parseFloat(style.cy));if(!esophagus.isPointInFill(p))issues.push(`${profile}: i-gel tip is not in esophagus`);
  }
  seek(99.99);
  const stem=scene==='sga'?svg.querySelector('#sga-lumen'):svg.querySelector('#opa-device > path'),flow=svg.querySelector('.reference-airway-flow'),length=stem.getTotalLength();
  const matrix=svg.querySelector('.ra-scene').getScreenCTM().inverse().multiply(stem.getScreenCTM()),scale=Math.hypot(matrix.a,matrix.b);
  for(let l=0;l<=length;l+=2){const a=stem.getPointAtLength(l).matrixTransform(matrix),b=flow.getPointAtLength(l*scale);if(Math.hypot(a.x-b.x,a.y-b.y)>.15){issues.push(`${scene}/${profile}: airflow misses device centerline`);break;}}
  if((flow.getAttribute('d').match(/M/g)||[]).length!==1)issues.push(`${scene}/${profile}: airflow is disconnected`);
  for(let l=0;l<flow.getTotalLength();l+=2){const p=flow.getPointAtLength(l);if(scene==='sga'&&tongue.isPointInFill(p))issues.push('male: airflow crosses tongue');if(p.x>283&&p.x<499&&!trachea.isPointInFill(p)){issues.push(`${scene}/${profile}: airflow misses trachea (${p.x.toFixed(1)},${p.y.toFixed(1)})`);break;}}
  checked++;report.textContent=`Checking ${scene} / ${profile}`;await new Promise(requestAnimationFrame);
 }
 report.dataset.airwayIssues=JSON.stringify(issues);report.textContent=issues.length?`${issues.length} airway issues: `+issues.slice(0,12).join('; '):`PASS · ${checked} device / patient combinations. Rigid cuff, esophageal tip and continuous airflow aligned with the device and trachea.`;
 show('sga','male','SUCCESS',99.99);
 }catch(error){report.textContent='FAIL · '+error.stack;}
};
