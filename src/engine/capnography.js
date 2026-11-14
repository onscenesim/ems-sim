'use strict';
const Capno=require('../../public/capnography');
const value=x=>x&&typeof x==='object'?x.value:x;
const number=(x,max)=>{x=value(x);if(x==null||x==='')return null;const n=Number(x);return Number.isFinite(n)&&n>=0&&n<=max?n:null;};
function hash(text){let h=2166136261;for(const c of String(text))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
const ADVANCED_AIRWAYS = new Set(['intubation', 'supraglottic_airway', 'cricothyrotomy']);

function applyCapnography(vitals,previous,identity='patient_1',{rolls=[],age,als=true}={}){
  const old=previous?.Capnography;
  const inline=als&&rolls.some(r=>ADVANCED_AIRWAYS.has(r.procedure_id)&&r.outcome==='SUCCESS'&&!r.continued);
  const bagging=rolls.some(r=>r.procedure_id==='bvm'&&r.outcome==='SUCCESS');
  if(!vitals&&!inline&&!(bagging&&old))return vitals;
  vitals ||= { ...previous };
  const choice=(key,options)=>options.includes(value(vitals[key]))?value(vitals[key]):null;
  const measured=number(vitals.ETCO2,150),rr=number(vitals.RR,100);
  const source=choice('CapnoSource',Object.keys(Capno.sources))||(inline?'airway':old?.source||'unknown');
  const status=choice('CapnoStatus',['connected','disconnected','unplaced'])||(inline?'connected':old?.status==='disconnected'?'disconnected':measured!=null||vitals.CapnoSource?'connected':old?.status||'unplaced');
  const ventilation=choice('CapnoVentilation',['manual','mechanical','paused','spontaneous'])
    || (bagging||inline?'manual':old?.source===source?old.ventilation:null)
    || (source==='airway'?'manual':null);
  const result={...vitals};
  if(measured==null)delete result.ETCO2;
  for(const key of ['CapnoSource','CapnoStatus','CapnoQuality','CapnoShape','CapnoVentilation'])delete result[key];
  // Source alone denotes placement; a disconnected line requires an explicit
  // reconnect, rather than an omitted field reviving the previous measurement.
  if(!inline&&!old&&measured==null&&!vitals.CapnoSource&&!vitals.CapnoStatus)return result;
  const connected=status==='connected';
  const changedSource=old?.source!==source;
  const assisted=ventilation==='manual'||ventilation==='mechanical';
  const resumed=assisted&&old?.ventilation==='paused';
  const fallbackRate=age==null?null:age<13?20:10;
  const priorAssistedRate=!changedSource&&old?.rate>0
    && (old.ventilation==='manual'||old.ventilation==='mechanical'||(source==='airway'&&!old.ventilation)) ? old.rate : null;
  const rate=ventilation==='paused'?0:assisted
    ? (rr>0?rr:null)??priorAssistedRate??fallbackRate
    : rr??(!changedSource?old?.rate:null);
  const etco2=measured??(!changedSource&&old?.status==='connected'?old.etco2:null);
  let shape=choice('CapnoShape',Object.keys(Capno.shapes))||(!changedSource?old?.shape:null)||'normal';
  if(assisted&&rate>0&&shape==='apnea'&&(resumed||etco2>0))shape='normal';
  const signal=Capno.normalize({source,status,
    shape,ventilation,
    quality:choice('CapnoQuality',Object.keys(Capno.qualities))||(!changedSource?old?.quality:null)||(source==='airway'?'clean':'variable'),
    rate:connected?rate:null,etco2:connected?etco2:null,seed:old?.seed??hash(identity)});
  result.Capnography=signal;
  if(signal.etco2!=null&&connected)result.ETCO2=signal.etco2;else delete result.ETCO2;
  if(signal.rate!=null&&connected)result.RR=signal.rate;
  return result;
}
module.exports={applyCapnography};
