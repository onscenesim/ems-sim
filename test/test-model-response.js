'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {extractText} = require('../src/engine/modelResponse');
const fs = require('node:fs');
const vm = require('node:vm');
test('filtered and empty responses have distinct actionable errors', () => {
  for (const response of [
    {promptFeedback:{blockReason:'SAFETY'}},
    {candidates:[{finishReason:'SAFETY'}],text:'partial blocked text'},
    {candidates:[{finishReason:'PROHIBITED_CONTENT'}]},
  ]) assert.throws(()=>extractText(response), e=>e.code==='model_content_filtered' && e.status===422 && /rephrase/.test(e.message));
  assert.throws(()=>extractText({text:'  ',candidates:[{finishReason:'MAX_TOKENS'}]}), {code:'model_empty_response'});
  assert.equal(extractText({text:'Crew responds.',candidates:[{finishReason:'STOP'}]}),'Crew responds.');
});
const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
const sendSource=source.slice(source.indexOf('async function sendTurn(msg'),source.indexOf('// ── Confirm panel'));
test('a filtered turn restores editable text and a rephrase gets a fresh operation',async()=>{
  const requests=[];
  const c=vm.createContext({window:{},sessionId:'test',sendingTurn:false,retryTurn:null,reportMode:false,
    document:{getElementById:()=>null}, userInput:{value:''},newOperationId:()=>`op-${requests.length}`,
    addHistory(){},print(){},setLoading(){},showLoadingDots(){},hideLoadingDots(){},
    apiOperation:async(path,body,id)=>{requests.push({body,id});throw Object.assign(Error('Please rephrase'),{code:'model_content_filtered'});}});
  vm.runInContext(sendSource,c);
  await c.sendTurn('original action');
  assert.equal(c.userInput.value,'original action'); assert.equal(c.retryTurn,null);
  await c.sendTurn('rephrased clinical action');
  assert.equal(requests[1].body.message,'rephrased clinical action');
  assert.notEqual(requests[0].id,requests[1].id);
});
