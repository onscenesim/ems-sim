'use strict';
const Capno=require('../../public/capnography');
const value=x=>x&&typeof x==='object'?x.value:x;
const number=(x,max)=>{x=value(x);if(x==null||x==='')return null;const n=Number(x);return Number.isFinite(n)&&n>=0&&n<=max?n:null;};
function hash(text){let h=2166136261;for(const c of String(text))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function applyCapnography(vitals,previous,identity='patient_1'){
  if(!vitals)return vitals;
  const old=previous?.Capnography;
  const choice=(key,options)=>options.includes(value(vitals[key]))?value(vitals[key]):null;
  const measured=number(vitals.ETCO2,150),rr=number(vitals.RR,100);
  const source=choice('CapnoSource',Object.keys(Capno.sources))||old?.source||'unknown';
  const status=choice('CapnoStatus',['connected','disconnected','unplaced'])||(old?.status==='disconnected'?'disconnected':measured!=null||vitals.CapnoSource?'connected':old?.status||'unplaced');
  const result={...vitals};
  if(measured==null)delete result.ETCO2;
  for(const key of ['CapnoSource','CapnoStatus','CapnoQuality','CapnoShape'])delete result[key];
  // Source alone denotes placement; a disconnected line requires an explicit
  // reconnect, rather than an omitted field reviving the previous measurement.
  if(!old&&measured==null&&!vitals.CapnoSource&&!vitals.CapnoStatus)return result;
  const connected=status==='connected';
  const changedSource=old?.source!==source;
  const signal=Capno.normalize({source,status,
    shape:choice('CapnoShape',Object.keys(Capno.shapes))||old?.shape||'normal',
    quality:choice('CapnoQuality',Object.keys(Capno.qualities))||(!changedSource?old?.quality:null)||(source==='airway'?'clean':'variable'),
    rate:connected?(rr??old?.rate):null,etco2:connected?(measured??old?.etco2):null,seed:old?.seed??hash(identity)});
  result.Capnography=signal;
  if(signal.etco2!=null&&connected)result.ETCO2=signal.etco2;else delete result.ETCO2;
  if(signal.rate!=null&&connected)result.RR=signal.rate;
  return result;
}
module.exports={applyCapnography};
