'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const helperSource = source.slice(source.indexOf('function newOperationId()'), source.indexOf('async function apiGet('));
const deferred = () => { let resolve; const promise=new Promise(r=>{resolve=r;}); return {promise,resolve}; };
function client(apiPost) {
  const context=vm.createContext({apiPost,sessionId:'test-session',sendBtn:{},crypto:require('node:crypto'), print(){}});
  vm.runInContext('let currentOperation = null;\n'+helperSource+'\nthis.activeOperation = () => currentOperation;',context);
  return context;
}

test('client repeats the same operation and confirmation payload after a dropped response', async () => {
  const requests=[];
  const c=client(async(path,body)=>{
    requests.push({path,body});
    if(requests.length===1)throw Object.assign(Error('connection dropped'),{code:'network_error'});
    return {reply:'processed once'};
  });
  const result=await c.apiOperation('/turn',{message:'epi',proc_allow:['medication_push|epi'],procs_resolved:true},'client-operation-001');
  assert.equal(result.reply,'processed once');assert.equal(requests.length,2);
  assert.deepEqual(requests[0],requests[1]);assert.equal(requests[1].body.operation_id,'client-operation-001');
  assert.equal(c.activeOperation(),null);
});

test('STOP requests server cancellation and handles its acknowledgement without browser abort', async () => {
  const paths=[];
  const c=client(async(path)=>{
    paths.push(path);
    if(path.endsWith('/cancel'))return {status:'cancelled'};
    return new Promise(()=>{});
  });
  const request=c.apiOperation('/turn',{message:'epi'},'client-operation-002');
  const rejected=assert.rejects(request,{code:'operation_cancelled'});
  await c.stopCurrentOperation();await rejected;
  assert.equal(paths[1],'/api/scenario/test-session/operations/client-operation-002/cancel');
  assert.equal(c.activeOperation(),null);
});

test('a completed turn racing with STOP is returned rather than discarded', async () => {
  const original=deferred();
  const c=client(async(path)=>path.endsWith('/cancel')?{status:'completed',result:{reply:'already committed'}}:original.promise);
  const request=c.apiOperation('/turn',{},'client-operation-003');
  await c.stopCurrentOperation();
  assert.equal((await request).reply,'already committed');
  original.resolve({reply:'already committed'});
  assert.equal(c.activeOperation(),null);
});

test('a failed STOP request leaves the original operation active', async () => {
  const original=deferred();
  const c=client(async(path)=>{
    if(path.endsWith('/cancel'))throw Error('offline');
    return original.promise;
  });
  const request=c.apiOperation('/turn',{},'client-operation-004');
  await c.stopCurrentOperation();
  assert.equal(c.activeOperation().id,'client-operation-004');assert.equal(c.activeOperation().stopping,false);
  original.resolve({reply:'finished'});assert.equal((await request).reply,'finished');
});

test('browser loads the shared aliases before drug cards, without Node globals', () => {
  const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8');
  assert.ok(html.indexOf('src="medication-aliases.js"')<html.indexOf('src="drug-cards.js"'));
  const c=vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../public/medication-aliases'),'utf8'),c);
  vm.runInContext(fs.readFileSync(require.resolve('../public/drug-cards'),'utf8'),c);
  assert.equal(c.lookupDrug('epi').name,'Epinephrine');
});
