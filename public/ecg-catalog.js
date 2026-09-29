/* Shared ECG catalog. Add patterns/rhythm presets here; acquisition, artifact,
 * persistence and paper layout stay in twelve-lead.js. See docs/twelve-lead-ecg.md. */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.ECGCatalog=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const names=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
  // waveform names select existing signal families in BOTH monitor and paper.
  // New presets can reuse any family with a rate, aliases and optional pattern.
  const rhythms={
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
    inferior:{overlays:[st('II',.19),st('III',.32),st('aVF',.27),st('I',-.08),st('aVL',-.17),['II III aVF',{t:.43}]]},
    anterior:{overlays:[st('V1',.15),st('V2 V3',.36),st('V4',.24),st('II III aVF',-.12),['V2 V3 V4',{t:.5,r:.5}]]},
    lateral:{overlays:[st('I aVL V5 V6',.21),st('III aVF',-.15)]},
    posterior:{overlays:[st('V1 V2 V3',-.20),['V1 V2 V3',{r:.95,s:.25,t:.36}]]},
    inferoposterior:{extends:['inferior','posterior'],overlays:[]},
    anterolateral:{extends:['anterior','lateral'],overlays:[]},
    inferolateral:{extends:['inferior'],overlays:[st('I aVL V5 V6',.21)]},
    hyperacute:{overlays:[st('V2 V3 V4',.055),['V2 V3 V4',{t:.85,tWidth:.085}],st('III aVF',-.06)]},
  };
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
    let result={overlays:[]};
    for(const parent of own.extends||[]){const base=resolvePattern(parent,[...ancestors,key]);result={...result,...base,overlays:[...result.overlays,...base.overlays]};}
    return {...result,...own,overlays:[...result.overlays,...(own.overlays||[])]};
  }
  return {names,rhythms,patterns,qualities,resolvePattern};
});
