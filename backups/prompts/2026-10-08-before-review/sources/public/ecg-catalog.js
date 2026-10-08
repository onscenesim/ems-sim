/* Shared ECG catalog. Add patterns/rhythm presets here; acquisition, artifact,
 * persistence and paper layout stay in twelve-lead.js. See docs/twelve-lead-ecg.md. */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.ECGCatalog=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const names=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
  const views={
    standard:{label:'12-lead ECG',procedure:'twelve_lead',leads:{}},
    posterior:{label:'Posterior ECG',procedure:'posterior_ecg',leads:{V4:'V7',V5:'V8',V6:'V9'}},
    right:{label:'Right-sided ECG',procedure:'right_sided_ecg',leads:{V1:'V1R',V2:'V2R',V3:'V3R',V4:'V4R',V5:'V5R',V6:'V6R'}},
    v4r:{label:'V4R ECG',procedure:'v4r_ecg',leads:{V4:'V4R'}},
  };
  const procedureViews=Object.fromEntries(Object.entries(views).map(([key,v])=>[v.procedure,key]));
  const ecgWords=['ECG','EKG','ECGs','EKGs','12 lead','12-lead','12 lead ECG','12-lead ECG','12 lead EKG','12-lead EKG','twelve lead'];
  views.posterior.synonyms=['posterior leads','V7 V8 V9','V7-V9',...ecgWords.flatMap(w=>['posterior '+w,w+' posterior',w+' with posterior leads'])];
  views.right.synonyms=['right sided leads','right-sided leads','right precordial leads',...ecgWords.flatMap(w=>['right sided '+w,'right-sided '+w,w+' right sided',w+' right-sided',w+' with right sided leads',w+' with right-sided leads'])];
  views.v4r.synonyms=['V4R','V4 R','V4 right',...ecgWords.flatMap(w=>['V4R '+w,w+' with V4R',w+' V4R'])];
  // waveform names select existing signal families in BOTH monitor and paper.
  // New presets can reuse any family with a rate, aliases and optional pattern.
  const rhythms={
    pvc:{rate:80,waveform:'sinus',aliases:/^(?:pvcs?|vpcs?|premature_ventricular_(?:complex|contraction|beat)s?|ventricular_ectopy|frequent_ectopy)$/,ectopy:'frequent',prompt:'Sinus rhythm with frequent premature ventricular complexes. Preserve the underlying rhythm with Ectopy=frequent when it is sinus_tach, sinus_brad, AV_block_1 or hyperK.'},
    torsades:{rate:220,waveform:'torsades',aliases:/torsad|(?:^|_)tdp(?:_|$)|polymorphic_(?:v_?t|ventricular_tach)/,priority:true},
    vf:{rate:0,waveform:'vf',aliases:/^v_?fib|ventricular_fib|fine_vf|coarse_vf/,priority:true,noRate:true},
    vt:{rate:185,waveform:'vt',aliases:/^v_?tach|ventricular_tach|monomorphic_(?:v_?t|ventricular_tach)|wide|broad|wct/,priority:true,broad:true},
    afib:{rate:95,waveform:'afib',aliases:/a_?fib|atrial_fib/,priorityAt:60},
    aflutter:{rate:140,waveform:'aflutter',aliases:/flutter/,priorityAt:60},
    asystole:{rate:0,waveform:'asystole',aliases:/asystole|flat/,priority:true,noRate:true,variants:['flat','wander']},
    pea:{rate:45,waveform:'pea',aliases:/pea|pulseless_electrical/,pWaves:true},
    paced:{rate:70,waveform:'paced',aliases:/pace/,priority:true,broad:true},
    hyperk:{rate:70,waveform:'hyperk',aliases:/hyperk|peaked_t|tented_t/,pattern:'hyperk'},
    junctional:{rate:45,waveform:'junctional',aliases:/junctional/,priorityAt:60},
    idioventricular:{rate:35,waveform:'idioventricular',aliases:/idio|agonal/,priorityAt:60,broad:true},
    av_block_3:{rate:35,waveform:'av_block_3',aliases:/block_3|third_degree|complete_heart/,broad:true},
    av_block_2_ii:{rate:45,waveform:'av_block_2_ii',aliases:/block_2_ii|mobitz_ii|type_ii/,pWaves:true},
    av_block_2_i:{rate:55,waveform:'av_block_2_i',aliases:/block_2|wenckebach|mobitz/,pWaves:true},
    av_block_1:{rate:70,waveform:'av_block_1',aliases:/block_1|first_degree/,pWaves:true},
    svt:{rate:180,waveform:'svt',aliases:/^svt|supraventricular/,priority:true},
    sinus_tach:{rate:125,waveform:'sinus_tach',aliases:/tach/,pWaves:true},
    sinus_brad:{rate:45,waveform:'sinus_brad',aliases:/brad/,pWaves:true},
    sinus:{rate:80,waveform:'sinus',pWaves:true},
  };
  // Presets inherit physiology from their waveform family. Keep specific alias
  // matches before broad ones (e.g. torsades before ventricular tachycardia).
  function resolveRhythm(key,ancestors=[]){
    const own=rhythms[key];
    if(!own||ancestors.includes(key))throw new Error('Invalid ECG rhythm family: '+key);
    if(own.waveform===key)return own;
    const base=resolveRhythm(own.waveform,[...ancestors,key]);
    return {...base,...own,waveform:base.waveform,aliases:own.aliases};
  }
  for(const key of Object.keys(rhythms))rhythms[key]=resolveRhythm(key);
  // An overlay is [lead names, properties]. st() keeps the old per-case ST scale;
  // other amplitudes use exact mV. Inheritance combines regional patterns.
  const st=(leads,value)=>[leads,{st:value},true];
  const patterns={
    normal:{overlays:[]},
    rv_infarct:{match:/right ventricular infarct|\brv infarct/,extends:['inferior'],rvChance:1,overlays:[st('V1',.08)]},
    subendocardial:{match:/sub[ -]?endocardial|diffuse (?:myocardial )?isch[ae]+mia/,extends:['nstemi_st'],overlays:[st('I II aVL aVF V3 V4 V5 V6',-.18),st('aVR',.12),st('V1',.04)]},
    de_winter:{match:/de[ -]?winter/,overlays:[st('V2 V3 V4 V5 V6',-.18),['V2 V3 V4 V5 V6',{t:.85,upsloping:true}],st('aVR',.075)]},
    wellens_biphasic:{match:/wellens/,choose:v=>v<.5?'wellens_biphasic':'wellens_deep',overlays:[['V2 V3 V4',{t:-.65,biphasic:true}]]},
    wellens_deep:{overlays:[['V2 V3 V4',{t:-.65,biphasic:false}]]},
    aslanger:{match:/aslanger/,overlays:[st('III',.16),st('I II V4 V5 V6',-.14),st('V1',.08),st('V2',0)]},
    hypothermia:{match:/hypothermi/,qrs:.115,pr:.23,qtScale:1.3,overlays:[['II III aVF V3 V4 V5 V6',{j:.25}],['aVR V1',{j:-.12}]]},
    cerebral:{match:/subarachnoid|intracerebral hemorr|intracranial hemorr|hemorrhagic stroke|raised intracranial|cerebral t|brain herniation/,qtScale:1.3,overlays:[['I II aVL aVF V2 V3 V4 V5 V6',{t:-.8,tWidth:.08}]]},
    hyperk:{match:/hyperkal/,qrs:.13,overlays:[[names.join(' '),{p:.015,t:.8,tWidth:.027}]]},
    hypok:{match:/hypokal/,overlays:[['II V2 V3 V4 V5 V6',{t:.04,u:.18,st:-.07}]]},
    pericarditis:{match:/pericarditis/,overlays:[st('I II III aVL aVF V2 V3 V4 V5 V6',.14),['I II V4 V5 V6',{pr:-.055}],st('aVR V1',-.09)]},
    brugada:{match:/brugada/,overlays:[['V1 V2',{r:.55,s:.12,j:.28,st:.22,t:-.32,coved:true}]]},
    long_qt:{match:/long[ _-]?qt|prolonged[ _-]?qt/,qtScale:1.3,overlays:[]},
    hcm:{match:/hypertrophic.*cardiomyopathy|\bhocm\b|\bhcm\b/,extends:['lvh'],afterBroad:true,mimic:false,overlays:[['I II III aVL aVF V5 V6',{q:.6,qWidth:.006}]]},
    lbbb:{match:/left bundle branch|\blbbb\b/,afterBroad:true,mimic:true,qrs:.16,overlays:[['V1 V2 V3',{r:.08,s:1.5,q:0,st:.18,t:.38,lbbb:true}],['I aVL V5 V6',{r:1.1,s:0,q:0,st:-.14,t:-.35,lbbb:true}]]},
    lvh:{match:/left ventricular hypertrophy|\blvh\b/,afterBroad:true,mimic:true,overlays:[['V1 V2',{s:1.9,r:.15,st:.17,t:.38}],['I aVL',{r:1.25,st:-.12,t:-.3}],['V5 V6',{r:2,s:.1,st:-.16,t:-.42}]]},
    rv_strain:{match:/pulmonary embol/,overlays:[['V1 V2 V3 V4 III',{t:-.35}],['I',{s:.5}],['III',{q:.22}]]},
    wpw:{match:/wolff|wpw/,delta:true,pr:.10,overlays:[]},
    nstemi_st:{match:/nstemi|non[ -]st|subendocardial|unstable angina/,choose:v=>v<.55?'nstemi_st':'nstemi_t',overlays:[st('I aVL V4 V5 V6',-.13)]},
    nstemi_t:{overlays:[['I aVL V3 V4 V5 V6',{t:-.35}]]},
    inferior:{rvChance:.4,overlays:[st('II',.19),st('III',.32),st('aVF',.27),st('I',-.08),st('aVL',-.17),['II III aVF',{t:.43}]]},
    anterior:{overlays:[st('V1',.15),st('V2 V3',.36),st('V4',.24),st('II III aVF',-.12),['V2 V3 V4',{t:.5,r:.5}]]},
    lateral:{posteriorChance:.35,overlays:[st('I aVL V5 V6',.21),st('III aVF',-.15)]},
    posterior:{posteriorChance:1,overlays:[st('V1 V2 V3',-.20),['V1 V2 V3',{r:.95,s:.25,t:.36}]]},
    inferoposterior:{extends:['inferior','posterior'],overlays:[]},
    anterolateral:{extends:['anterior','lateral'],overlays:[]},
    inferolateral:{extends:['inferior'],overlays:[st('I aVL V5 V6',.21)]},
    hyperacute:{overlays:[st('V2 V3 V4',.055),['V2 V3 V4',{t:.85,tWidth:.085}],st('III aVF',-.06)]},
  };
  // Supplemental views inherit automatically. These overrides refine regional
  // teaching findings; a new pattern without overrides still gets all views.
  const posterior=['V7 V8 V9'],right=['V3R V4R V5R V6R'];
  const regional=(p={},r={})=>({posterior:[[posterior[0],p]],right:[[right[0],r]]});
  const supplements={
    anterior:regional({st:-.025,t:.12},{st:.015,t:.07}),
    lateral:regional({st:.015,t:.14}),
    de_winter:regional({st:-.045,t:.18},{st:-.015,t:.08}),
    wellens_biphasic:regional({st:0,t:.08},{st:0,t:.05}),
    wellens_deep:regional({st:0,t:.08},{st:0,t:.05}),
    hyperacute:regional({st:-.035,t:.12},{st:0,t:.06}),
    aslanger:regional({st:-.08,t:.16},{st:-.025,t:.08}),
    nstemi_st:regional({st:-.08,t:.12},{st:-.025,t:.07}),
    nstemi_t:regional({st:0,t:-.18},{st:0,t:.03}),
    subendocardial:regional({st:-.12,t:.10},{st:-.045,t:.06}),
    lvh:regional({r:1.05,s:.08,st:-.07,t:-.23},{r:.1,s:1.0,st:.065,t:.17}),
    hcm:regional({q:.35,qWidth:.006},{q:.03}),
    lbbb:regional({r:.7,s:0,q:0,st:-.065,t:-.18,lbbb:true},{r:.06,s:.85,q:0,st:.085,t:.20,lbbb:true}),
    rv_strain:regional({}, {r:.35,s:.35,st:0,t:-.23}),
    pericarditis:regional({st:.08,pr:-.035},{st:.045,pr:-.025,t:.10}),
    brugada:regional({st:0,t:.12},{st:0,j:0,coved:false,t:.06}),
    cerebral:regional({t:-.45,tWidth:.08},{t:-.22,tWidth:.08}),
    hypothermia:regional({j:.14},{j:.085}),
    hyperk:regional({p:.01,t:.45,tWidth:.027},{p:.01,t:.35,tWidth:.027}),
    hypok:regional({t:.02,u:.12,st:-.04},{t:.015,u:.07,st:-.025}),
  };
  for(const [key,supplemental] of Object.entries(supplements))patterns[key].supplemental=supplemental;
  // All rhythms/patterns pass through this acquisition-quality layer, including
  // future catalog entries. Quality variants never need separate waveforms.
  const qualities={
    SUCCESS:{noise:.008,label:'Standard'},
    MARGINAL:{noise:.045,label:'Artifact present'},
    FAILURE:{noise:.14,label:'Poor contact / motion'},
    COMPLICATION:{noise:.22,label:'Unreliable — check electrodes'},
  };
  function resolvePattern(key,ancestors=[]){
    const own=patterns[key];
    if(!own||ancestors.includes(key))throw new Error('Invalid ECG pattern inheritance: '+[...ancestors,key].join(' → '));
    let result={overlays:[],supplemental:{posterior:[],right:[]}};
    const merge=(base,next)=>({...base,...next,overlays:[...base.overlays,...(next.overlays||[])],
      supplemental:{posterior:[...base.supplemental.posterior,...(next.supplemental?.posterior||[])],
        right:[...base.supplemental.right,...(next.supplemental?.right||[])]}});
    for(const parent of own.extends||[])result=merge(result,resolvePattern(parent,[...ancestors,key]));
    return merge(result,own);
  }
  const ectopy={none:'None',occasional:'Occasional PVCs',frequent:'Frequent PVCs',bigeminy:'Ventricular bigeminy',trigeminy:'Ventricular trigeminy'};
  return {names,views,procedureViews,rhythms,patterns,qualities,resolvePattern,ectopy};
});
