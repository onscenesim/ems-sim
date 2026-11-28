'use strict';
// Optional live-model verification with synthetic patients and disposable logs.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.EMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-authority-live-'));
require('dotenv').config({quiet:true});
const { Session } = require('../src/engine/session');
const { rollScenario } = require('../src/engine/roller');
const output = { steps: [], state: 'running' };
const filename = path.join(process.env.EMS_DATA_DIR, 'results.json');
const save = () => fs.writeFileSync(filename, JSON.stringify(output, null, 2));
const s = new Session({ ...rollScenario({random_seed:'authority-live',provider_level:'ALS',category:'medical'}),
  patient_name:'Synthetic Patient', patient_age:45, patient_age_display:'45 years old', age_group:'middle_aged',
  presentation:'Awake adult with mild dehydration after gastroenteritis, normal mentation, breathing comfortably',
  hint:'Mild volume depletion; no vascular access exists on arrival.', special_flags:'', true_diagnosis:undefined,
  trajectory:'stable', decompensation_clock:null, complication_type:'none', catastrophe:null,
  routine_er_divert:false, backup_present_on_arrival:false });
async function step(order, check) {
  console.log('Checking:', order);
  const result = await s.send(order);
  const item = { order, reply:result.reply, rolls:result.rolls, suppressed:result.suppressed,
    access:structuredClone(s.access), closed:result.closed, moving:s.moving, minute:s.sceneMinute };
  item.pass = check(result);
  output.steps.push(item); save();
  console.log(JSON.stringify({pass:item.pass,rolls:result.rolls.map(r=>r.procedure_id),closed:result.closed,access:s.access}));
  if (!item.pass) throw Error('Live verification invariant failed');
}
(async()=>{
  save();
  await step('Begin the scenario.', r=>!r.closed&&s.access.length===0);
  await step('I push a liter of normal saline through the established 18 gauge IV.', r=>!r.rolls.some(x=>['medication_push','peripheral_iv'].includes(x.procedure_id))&&s.access.length===0&&r.suppressed.some(x=>x.vascular));
  await step('Do not terminate resuscitation. Ask the patient their allergies.', r=>!r.closed&&!s.moving);
  const random=Math.random;
  Math.random=()=>.99;
  try {
    await step('Start an IV in the left arm.', r=>r.rolls.some(x=>x.procedure_id==='peripheral_iv'&&x.outcome==='SUCCESS'));
    await step('Give 250 mL normal saline through the left arm IV.', r=>r.rolls.some(x=>x.procedure_id==='medication_push'));
  } finally {Math.random=random;}
  await step('Remove the left arm IV.', ()=>s.access.every(x=>x.status==='removed'));
  await step('I give another liter of normal saline through that established left arm IV.', r=>!r.rolls.some(x=>x.procedure_id==='medication_push')&&s.access.every(x=>x.status==='removed'));
  output.state='complete'; save(); console.log('Results:',filename);
})().catch(error=>{output.state='failed';output.error=error.message;save();console.error(error.message);console.log('Results:',filename);process.exitCode=1;});
