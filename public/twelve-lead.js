/* Original synthetic ECGs. Morphology references: https://litfl.com/ecg-library/
 * Values are mV and seconds; paper is 25 mm/s, 10 mm/mV. Optional machine statements are deliberately unreliable; the underlying
 * diagnosis is never printed as an answer. Shared with Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TwelveLead = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const rates = { sinus:80, sinus_tach:125, sinus_brad:45, afib:95, aflutter:140,
    svt:180, vt:185, torsades:220, vf:0, asystole:0, pea:45, paced:70,
    junctional:45, idioventricular:35, hyperk:70, av_block_1:70,
    av_block_2_i:55, av_block_2_ii:45, av_block_3:35 };
  const names = ['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
  function normalizeRhythm(raw) {
    const k = String(raw).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (k in rates) return k;
    if (/torsad|(?:^|_)tdp(?:_|$)|polymorphic_(?:v_?t|ventricular_tach)/.test(k)) return 'torsades';
    if (/^v_?fib|ventricular_fib|fine_vf|coarse_vf/.test(k)) return 'vf';
    if (/^v_?tach|ventricular_tach|monomorphic_(?:v_?t|ventricular_tach)|wide|broad|wct/.test(k)) return 'vt';
    if (/a_?fib|atrial_fib/.test(k)) return 'afib';
    if (/flutter/.test(k)) return 'aflutter';
    if (/asystole|flat/.test(k)) return 'asystole';
    if (/pea|pulseless_electrical/.test(k)) return 'pea';
    if (/pace/.test(k)) return 'paced';
    if (/hyperk|peaked_t|tented_t/.test(k)) return 'hyperk';
    if (/junctional/.test(k)) return 'junctional';
    if (/idio|agonal/.test(k)) return 'idioventricular';
    if (/block_3|third_degree|complete_heart/.test(k)) return 'av_block_3';
    if (/block_2_ii|mobitz_ii|type_ii/.test(k)) return 'av_block_2_ii';
    if (/block_2|wenckebach|mobitz/.test(k)) return 'av_block_2_i';
    if (/block_1|first_degree/.test(k)) return 'av_block_1';
    if (/^svt|supraventricular/.test(k)) return 'svt';
    if (/tach/.test(k)) return 'sinus_tach';
    if (/brad/.test(k)) return 'sinus_brad';
    return 'sinus';
  }
  const value = v => v && typeof v === 'object' ? v.value : v;
  function hash(text) { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
  function random(seed) { let a=seed>>>0; return () => { a+=0x6D2B79F5; let t=Math.imul(a^a>>>15,1|a); t^=t+Math.imul(t^t>>>7,61|t); return ((t^t>>>14)>>>0)/4294967296; }; }
  const gauss = (x,s) => Math.exp(-x*x/(2*s*s));
  function noise(t, f, seed) {
    const x=t*f, i=Math.floor(x), u=x-i, s=u*u*(3-2*u);
    const n=j=>{const v=Math.sin(j*12.9898+seed*0.013)*43758.5453; return 2*(v-Math.floor(v))-1;};
    return n(i)*(1-s)+n(i+1)*s;
  }
  // Only affirmative case identity is matched; educational hints often list
  // differentials and treatments that must not become the patient's diagnosis.
  function selectPattern(seed, variant) {
    const text = [seed.true_diagnosis, seed.presentation, seed.ecg_pattern].filter(Boolean).join(' ').toLowerCase();
    if (/de[ -]?winter/.test(text)) return 'de_winter';
    if (/wellens/.test(text)) return variant < .5 ? 'wellens_biphasic' : 'wellens_deep';
    if (/aslanger/.test(text)) return 'aslanger';
    if (/hypothermi/.test(text)) return 'hypothermia';
    if (/subarachnoid|intracerebral hemorr|intracranial hemorr|hemorrhagic stroke|raised intracranial|cerebral t|brain herniation/.test(text)) return 'cerebral';
    if (/hyperkal/.test(text)) return 'hyperk';
    if (/hypokal/.test(text)) return 'hypok';
    if (/pericarditis/.test(text)) return 'pericarditis';
    if (/brugada/.test(text)) return 'brugada';
    if (/long[ _-]?qt|prolonged[ _-]?qt/.test(text)) return 'long_qt';
    if (/hypertrophic.*cardiomyopathy|\bhocm\b|\bhcm\b/.test(text)) return 'hcm';
    if (/left bundle branch|\blbbb\b/.test(text)) return 'lbbb';
    if (/left ventricular hypertrophy|\blvh\b/.test(text)) return 'lvh';
    if (/pulmonary embol/.test(text)) return 'rv_strain';
    if (/wolff|wpw/.test(text)) return 'wpw';
    if (/nstemi|non[ -]st|subendocardial|unstable angina/.test(text)) return variant < .55 ? 'nstemi_st' : 'nstemi_t';
    if (/stemi|\bomi\b|(?:myocardial|coronary) (?:infarct|occlusion)/.test(text) && !/no stemi|without stemi/.test(text)) {
      // Hints supply location only after an infarct has been established.
      const location = /anterior|anteroseptal|anterolateral|inferior|inferolateral|posterior|lateral|right ventricular/.test(text)
        ? text : String(seed.hint||'').split(/[—.;]/)[0].toLowerCase();
      if (/posterior/.test(location)) return /inferior/.test(text) ? 'inferoposterior' : 'posterior';
      if (/inferolateral/.test(location)) return 'inferolateral';
      if (/inferior|right ventricular/.test(location)) return 'inferior';
      if (/anterolateral/.test(location)) return 'anterolateral';
      if (/lateral/.test(location)) return 'lateral';
      if (/hyperacute|subtle/.test(text)) return 'hyperacute';
      if (/\bomi\b/.test(text) && !/stemi/.test(text)) return variant < .5 ? 'de_winter' : 'hyperacute';
      return 'anterior';
    }
    // Background remodeling only supplies a mimic when the acute case has no
    // selected injury/channelopathy pattern. A cardiac profile is not an MI.
    const history=String(seed.comorbidity_bundle||'').toLowerCase();
    if (/left bundle branch|lbbb/.test(history)) return 'lbbb';
    if (/left ventricular hypertrophy|lvh/.test(history)) return 'lvh';
    if (/compensated_cardiac|coronary|prior mi|heart failure|cardiomyopathy/.test(history)) return variant<.45?'lbbb':'lvh';
    if (/metabolic_syndrome|hypertension|hypertensive|aortic stenosis|renal_failure/.test(history)) return 'lvh';
    return 'normal';
  }
  // Deliberately unreliable monitor software, as a training distraction. These
  // canned statements are NOT the underlying pathology or a diagnostic engine.
  function autoInterpret(ecg, pattern) {
    if(ecg.rhythm==='paced') return {headline:'',lines:['Paced Rhythm: No further interpretation.']};
    if(ecg.noise>.012) return {headline:'',lines:['12 lead quality prevents further interpretation.']};
    const r=random(ecg.seed+511), pick=list=>list[Math.floor(r()*list.length)];
    const mimic=['lvh','lbbb'].includes(pattern);
    const rhythmLine=ecg.rhythm==='sinus'&&r()<.05?'Normal Sinus Rhythm':pick(['Sinus rhythm with nonspecific ST abnormality','Possible ectopic atrial rhythm','Undetermined rhythm']);
    return {headline:mimic?'*** ACUTE MI SUSPECTED ***':'ABNORMAL ECG',lines:[
      rhythmLine,
      pick(['Possible inferior infarct, age unknown','Possible anterior infarct, age undetermined','Possible septal infarct, age unknown']),
      mimic?'Acute injury pattern suspected':pick(['Consider left atrial enlargement','Nonspecific intraventricular conduction delay','Consider anterolateral ischemia']),
    ]};
  }
  function create({seed={}, vitals={}, outcome='SUCCESS', patientId='patient_1', minute=0, id='ecg', entropy, patient={}}={}) {
    const waveSeed = entropy ?? hash(id);
    // Stable per-case anatomy across serial recordings; acquisition noise varies.
    const rand = random(hash([seed.scenario_id,seed.presentation,seed.true_diagnosis,patientId].join('|')));
    const variant=rand(), scale=.9+rand()*.2;
    const raw=value(vitals.Rhythm);
    const measured=Number(value(vitals.HR));
    const rhythm=normalizeRhythm(raw || (measured>100?'sinus_tach':measured>0&&measured<60?'sinus_brad':'sinus'));
    const rate=['vf','asystole'].includes(rhythm)?0:Number.isFinite(measured)&&measured>0?Math.max(15,Math.min(300,measured)):rates[rhythm];
    const priority = ['paced','vt','torsades','vf','asystole','svt'].includes(rhythm) || (['afib','aflutter','junctional','idioventricular'].includes(rhythm)&&rate>=60);
    const pattern = rhythm==='hyperk' ? 'hyperk' : priority ? 'normal' : selectPattern(seed,variant);
    const preexcited = /pre.excited|wpw.*(?:afib|atrial fibrillation)/i.test(seed.presentation||'') && ['vt','afib'].includes(rhythm);
    const broad=['paced','vt','idioventricular','av_block_3'].includes(rhythm)||preexcited;
    const qrs=broad||pattern==='lbbb'?.16:pattern==='hyperk'?.13:pattern==='hypothermia'?.115:.085;
    const leads={};
    const rs=[[.7,.18],[1,.22],[.45,.15],[-.7,-.2],[.45,.1],[.7,.2],[.16,.95],[.4,1.25],[.85,.8],[1.3,.35],[1.1,.15],[.9,.08]];
    names.forEach((name,i)=>{const k=scale*(.95+rand()*.1);leads[name]={r:rs[i][0]*k,s:rs[i][1]*k,q:.035,p:name==='aVR'?-.1:name==='V1'?.055:.12,t:name==='aVR'?-.2:name==='V1'?-.06:.25,st:0,j:0,pr:0,biphasic:false};});
    const set=(list,props)=>list.split(' ').forEach(n=>Object.assign(leads[n],props));
    const st=(list,mv)=>set(list,{st:mv*scale});
    if (['inferior','inferoposterior','inferolateral'].includes(pattern)) {
      st('II',.19);st('III',.32);st('aVF',.27);st('I',-.08);st('aVL',-.17);set('II III aVF',{t:.43});
    }
    if (['anterior','anterolateral'].includes(pattern)) { st('V1',.15);st('V2 V3',.36);st('V4',.24);st('II III aVF',-.12);set('V2 V3 V4',{t:.5,r:.5}); }
    if (['lateral','anterolateral','inferolateral'].includes(pattern)) {st('I aVL V5 V6',.21);if(pattern!=='inferolateral')st('III aVF',-.15);}
    if (['posterior','inferoposterior'].includes(pattern)) {st('V1 V2 V3',-.20);set('V1 V2 V3',{r:.95,s:.25,t:.36});}
    if (pattern==='de_winter') {st('V2 V3 V4 V5 V6',-.18);set('V2 V3 V4 V5 V6',{t:.85,upsloping:true});st('aVR',.075);}
    if (pattern==='hyperacute') {st('V2 V3 V4',.055);set('V2 V3 V4',{t:.85,tWidth:.085});st('III aVF',-.06);}
    if (pattern.startsWith('wellens')) set('V2 V3 V4',{t:-.65,biphasic:pattern==='wellens_biphasic'});
    if (pattern==='aslanger') {st('III',.16);st('I II V4 V5 V6',-.14);st('V1',.08);st('V2',0);}
    if (pattern==='nstemi_st') st('I aVL V4 V5 V6',-.13);
    if (pattern==='nstemi_t') set('I aVL V3 V4 V5 V6',{t:-.35});
    if (pattern==='cerebral') set('I II aVL aVF V2 V3 V4 V5 V6',{t:-.8,tWidth:.08});
    if (pattern==='hypothermia') {set('II III aVF V3 V4 V5 V6',{j:.25});set('aVR V1',{j:-.12});}
    if (pattern==='hyperk') set(names.join(' '),{p:.015,t:.8,tWidth:.027});
    if (pattern==='hypok') set('II V2 V3 V4 V5 V6',{t:.04,u:.18,st:-.07});
    if (pattern==='pericarditis') {st('I II III aVL aVF V2 V3 V4 V5 V6',.14);set('I II V4 V5 V6',{pr:-.055});st('aVR V1',-.09);}
    if (pattern==='brugada') {set('V1 V2',{r:.55,s:.12,j:.28,st:.22,t:-.32,coved:true});}
    if (pattern==='rv_strain') {set('V1 V2 V3 V4 III',{t:-.35});set('I',{s:.5});set('III',{q:.22});}
    // Ventricular depolarization produces secondary discordant repolarization.
    if(broad) names.forEach((n,i)=>{const polarity=i===3||i===6||i===7?-1:1;Object.assign(leads[n],{r:polarity*1.1,s:polarity*.25,t:-polarity*.3,st:priority?-polarity*.06:leads[n].st});});
    if(['lvh','hcm'].includes(pattern)) {
      set('V1 V2',{s:1.9,r:.15,st:.17,t:.38});
      set('I aVL',{r:1.25,st:-.12,t:-.3});
      set('V5 V6',{r:2.0,s:.1,st:-.16,t:-.42});
      if(pattern==='hcm')set('I II III aVL aVF V5 V6',{q:.6,qWidth:.006});
    }
    if(pattern==='lbbb') {
      set('V1 V2 V3',{r:.08,s:1.5,q:0,st:.18,t:.38,lbbb:true});
      set('I aVL V5 V6',{r:1.1,s:0,q:0,st:-.14,t:-.35,lbbb:true});
    }
    const qtScale=['cerebral','long_qt','hypothermia'].includes(pattern)?1.3:1;
    const r=random(waveSeed), beats=[];
    const group=rhythm==='av_block_2_i'?4:rhythm==='av_block_2_ii'?3:1;
    // HR counts conducted beats, not atrial impulses. Keep dropped beats on time.
    const interval=rate?60/rate*(group-1||1)/group:1;
    for(let t=-1, count=0;t<11;count++) {
      const dropped=group>1&&count%group===group-1;
      const pr=rhythm==='av_block_1'?.32:rhythm==='av_block_2_i'?.16+.045*(count%group):pattern==='wpw'?.10:pattern==='hypothermia'?.23:.16;
      const irregular=rhythm==='afib'||preexcited;
      t+=interval*(irregular?.62+r()*.76:1);
      beats.push({t,pr,dropped,width:preexcited?.13+r()*.09:qrs});
    }
    const recording = {version:1,id,demographics:{name:patient.name||null,age:patient.age_display??patient.age??null,sex:patient.sex||null},patientId,minute,rate,rhythm,rateEstimated:!(Number.isFinite(measured)&&measured>0)&&rate>0,
      seed:waveSeed,leads,beats,qtScale,delta:pattern==='wpw',preexcited,
      noise:({SUCCESS:.008,MARGINAL:.045,FAILURE:.14,COMPLICATION:.22})[outcome]??.008,
      quality:({SUCCESS:'Standard',MARGINAL:'Artifact present',FAILURE:'Poor contact / motion',COMPLICATION:'Unreliable — check electrodes'})[outcome]||'Standard'};
    recording.machine=autoInterpret(recording,pattern);
    return recording;
  }
  function sample(ecg, lead, t) {
    const l=ecg.leads[lead], type=ecg.rhythm, i=names.indexOf(lead);
    let y=ecg.noise*(.65*Math.sin(t*2.7+i)+.65*noise(t,17,ecg.seed+i)+.25*noise(t,49,ecg.seed+i*7));
    if(type==='asystole') return y;
    if(type==='vf') return y+(.7+.2*noise(t,.7,ecg.seed))*(.7*noise(t,7,ecg.seed+2)+.3*noise(t,15,ecg.seed+4))*(i===3?-1:1);
    if(type==='torsades') { const a=2*Math.PI*(ecg.rate/60*t+.025*noise(t,.7,ecg.seed));return y+1.1*Math.sin(t*1.1+i*.15)*(.8*Math.sin(a)+.2*Math.sin(2*a))+.07*Math.cos(a); }
    if(type==='afib'||ecg.preexcited) y+=.035*noise(t,9,ecg.seed+70)*(lead==='V1'?1.5:1);
    if(type==='aflutter') y+=(['II','III','aVF'].includes(lead)?-.16:.09)*(2*((t*5)%1)-1);
    if(type==='av_block_3') {const d=((t+.2)%(60/85)+60/85)%(60/85);y+=l.p*gauss(Math.min(d,60/85-d),.022);}
    const rr=60/(ecg.rate||80), recovery=Math.min(.34,Math.max(.15,.30*Math.sqrt(rr/.8)))*ecg.qtScale;
    for(const b of ecg.beats) {
      const d=t-b.t;
      if(d<-.5||d>.8)continue;
      const p=['sinus','sinus_tach','sinus_brad','pea','av_block_1','av_block_2_i','av_block_2_ii'].includes(type);
      if(p) {y+=l.p*gauss(d+b.pr,.022);if(d> -b.pr+.04&&d<-.045)y+=l.pr;}
      if(b.dropped)continue;
      const w=b.width;
      if(type==='paced' && Math.abs(d+.065)<.004) y+=1.7;
      if(ecg.delta)y+=.18*gauss(d+.04,.027);
      if(l.lbbb) {
        // Broad notched lateral R, broad QS/rS anteriorly, no lateral septal Q.
        y+=l.r*(.85*gauss(d-.012,.022)+gauss(d-.065,.027))-l.s*gauss(d-.04,.039);
      } else {
        y+=-l.q*gauss(d+.026,l.qWidth||.009)+l.r*gauss(d,w/8)-l.s*gauss(d-w*.34,w/8);
        if(w>=.14)y+=l.r*.27*gauss(d-.047,.025);
      }
      const j=w*.65;
      y+=l.j*gauss(d-j,.014);
      // Smooth join to the J point, then an actual sustained ST segment.
      if(d>j-.015&&d<recovery) {
        const onset=Math.min(1,(d-j+.015)/.025), end=1/(1+Math.exp((d-recovery+.025)/.012));
        const slope=l.upsloping?Math.max(0,1-(d-j)/(recovery-j)):l.coved?Math.max(0,1-(d-j)/(recovery-j)) :1;
        y+=l.st*onset*end*slope;
      }
      const tw=(l.tWidth||.052)*Math.min(1,Math.sqrt(rr/.8));
      y+=l.biphasic?.3*gauss(d-recovery+.035,tw*.65)+l.t*gauss(d-recovery-.025,tw*.7):l.t*gauss(d-recovery,tw);
      if(l.u)y+=l.u*gauss(d-recovery-.14,.035);
    }
    return y;
  }
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function measurements(ecg) {
    if(!ecg.rate||['vf','torsades','asystole'].includes(ecg.rhythm)||ecg.noise>.012) return {pr:'—',qrs:'—',qt:'—',axes:'— / — / —'};
    const beat=ecg.beats.find(b=>!b.dropped), rr=60/ecg.rate;
    const sinus=['sinus','sinus_tach','sinus_brad','pea','av_block_1','av_block_2_i','av_block_2_ii'].includes(ecg.rhythm);
    const recovery=Math.min(.34,Math.max(.15,.30*Math.sqrt(rr/.8)))*ecg.qtScale;
    const tWidth=(ecg.leads.II.tWidth||.052)*Math.min(1,Math.sqrt(rr/.8));
    // Estimates from the synthetic complex, not an independent diagnostic
    // analyzer. Tangent-style T offset is about two Gaussian widths past peak.
    const qt=recovery+2*tWidth+beat.width*.4;
    const angle=(i,ii)=>Math.round(Math.atan2((2*ii-i)/Math.sqrt(3),i)*180/Math.PI);
    const i=ecg.leads.I,ii=ecg.leads.II;
    return {pr:sinus?beat.pr.toFixed(3)+' s':'—',qrs:beat.width.toFixed(3)+' s',
      qt:qt.toFixed(3)+' / '+(qt/Math.sqrt(rr)).toFixed(3)+' s',
      axes:(sinus?angle(i.p,ii.p)+'°':'—')+' / '+angle(i.r-i.s,ii.r-ii.s)+'° / '+angle(i.t,ii.t)+'°'};
  }
  function svg(ecg, {autoInterpret:showInterpretation=true}={}) {
    const rawMachine=showInterpretation?ecg.machine:null;
    // Also update wording on already-filed snapshots from the first version.
    const machine=rawMachine?{...rawMachine,headline:rawMachine.headline.replace(/STEMI/g,'ACUTE MI SUSPECTED')}:null;
    const width=1140,height=725,x0=70,baseline=240,pps=100,mv=40,cell=250,row=128;
    const m=measurements(ecg), patient=ecg.demographics||{};
    const field=(x,y,text,size=16,bold=false)=>`<text x="${x}" y="${y}" font-size="${size}"${bold?' font-weight="bold"':''}>${escape(text)}</text>`;
    const minutes=Math.floor(ecg.minute),seconds=Math.round((ecg.minute-minutes)*60);
    let header=field(16,29,'Name: '+(patient.name||'—').slice(0,29),18,true)
      +field(16,53,'ID: '+hash(ecg.id).toString(16).toUpperCase().padStart(8,'0'))
      +field(16,77,'Age: '+(patient.age??'—'))+field(174,77,'Sex: '+(patient.sex||'—'))
      +field(16,102,'12-Lead ECG',18,true)+field(16,126,`T+${minutes}:${String(seconds).padStart(2,'0')} · ${ecg.patientId.replace('patient_','Patient ')}`,14)
      +field(300,29,'HR '+(ecg.rate?Math.round(ecg.rate)+' bpm'+(ecg.rateEstimated?'*':''):'—'),19,true)
      +field(300,54,'PR '+m.pr)+field(427,54,'QRS '+m.qrs)
      +field(300,79,'QT/QTc '+m.qt)+field(300,104,'P-QRS-T axes '+m.axes,14)
      +field(300,126,'Measurements estimated',11)
      +'<path d="M286 16v112 M552 16v112" fill="none" stroke="#3b3433" stroke-width="1.2"/>';
    if(machine) {
      if(machine.headline)header+=field(566,29,machine.headline,machine.headline.includes('ACUTE MI')?23:18,true);
      header+=field(566,machine.headline?53:29,'Abnormal ECG “Unconfirmed”',17,true);
      machine.lines.forEach((line,i)=>{header+=field(566,(machine.headline?77:53)+i*22,'• '+line,16);});
    }
    const trace=(lead,start,x,y,duration=2.5)=>{
      const points=[];
      for(let n=0;n<=duration*250;n++)points.push(`${n?'L':'M'}${(x+n/250*pps).toFixed(2)},${(y-sample(ecg,lead,start+n/250)*mv).toFixed(2)}`);
      return `<path d="${points.join(' ')}" fill="none" stroke="#272524" stroke-width="1.15" stroke-linejoin="round"/>`;
    };
    let body='';
    const layout=[['I','aVR','V1','V4'],['II','aVL','V2','V5'],['III','aVF','V3','V6']];
    layout.forEach((leads,r)=>leads.forEach((lead,c)=>{
      const x=x0+c*cell,y=baseline+r*row;
      body+=field(x+6,y-55,lead,14)+trace(lead,c*2.5,x,y);
      if(c)body+=`<path d="M${x} ${y-42}v70" stroke="#bb777777"/>`;
    }));
    body+=field(x0+6,baseline+3*row-55,'II · 10 s',14)+trace('II',0,x0,baseline+3*row,10);
    for(let r=0;r<4;r++){const y=baseline+r*row;body+=`<path d="M22 ${y}h8v-40h20v40h12" fill="none" stroke="#272524" stroke-width="1.2"/>`;}
    const accessible=`Captured twelve lead ECG, ${ecg.rate||'no organized'} beats per minute. ${ecg.quality}. Leads I, II, III, aVR, aVL, aVF, V1 through V6 in three rows of four and a ten second lead II strip.${machine?' Unconfirmed automated interpretation: '+[machine.headline,...machine.lines].filter(Boolean).join('. '):''}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(accessible)}"><defs><pattern id="ecg-small" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M4 0H0V4" fill="none" stroke="#e9a9ab" stroke-width=".4"/></pattern><pattern id="ecg-grid" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="url(#ecg-small)"/><path d="M20 0H0V20" fill="none" stroke="#d47d83" stroke-width=".7"/></pattern></defs><rect width="${width}" height="${height}" fill="#fff9f2"/><rect x="16" y="8" width="1108" height="128" fill="#f8e2e6"/><rect x="16" y="8" width="1108" height="128" fill="url(#ecg-grid)"/><rect x="16" y="155" width="1108" height="516" fill="url(#ecg-grid)"/><g fill="#292526" font-family="Arial Narrow, Liberation Sans Narrow, Arial, sans-serif" font-size="16">${header}${body}${field(16,700,'×1.0   10 mm/mV   25 mm/s',15,true)}${field(360,700,ecg.quality,13)}${field(735,700,'SIMULATED · 3 × 4 · 10 s sequential',12)}</g></svg>`;
  }
  return {rates,names,normalizeRhythm,selectPattern,autoInterpret,create,sample,measurements,svg};
});
