'use strict';

function chemicalExposureContract(seed) {
  const exposure = seed.chemical_exposure;
  if (!exposure) return '';
  const lines = [
    'CHEMICAL EXPOSURE — PRIVATE CASE CONTRACT (takes precedence over generic modifiers and difficulty defaults):',
    `Agent: ${exposure.agent}; exposure route: ${exposure.route}; clinical course: ${exposure.course}. The case key governs the product, concentration and exposure history; do not silently substitute a different chemical or add an unrecorded exposure route.`,
    'Dispatch and arrival show what callers can report, not a hidden toxicology conclusion. Reveal labels/SDS, histories and examination findings when requested or visibly assessed under the crew contract. No magical field toxin levels, pH, blood gas, metal assay or other unperformed tests. A pH measurement requires available paper and an actual measurement; do not invent a pH meter in the manifest.',
    'Scene safety and ABCs continue together. Ordinary EMS PPE is not respiratory protection for hazardous atmospheres. Use established rescue resources; do not automatically evacuate people, complete decontamination or declare atmospheric clearance. Product information must be obtained without unsafe re-entry or carrying open leaking containers into the rig. Consult poison control/medical direction within local protocols; antidotes, chelation, topical anesthetics and special devices require scope, actual availability and orders. Existing procedure rolls govern delivery, never invent a deliberate unsafe technique from a correctly specified order.',
    'Track actual duration, route, removed clothing, persistent residue, clinical findings and response to care. Successful decontamination reduces further exposure; it does not guarantee reversal of established injury. Late complications are possible only for the seeded agent and clinical course, not a fixed universal timer. No chemical neutralization of eyes/skin or ingested poisons with an opposing acid/base. Review care using recorded findings and resources, not a requirement to name the hidden agent.',
  ];
  if (exposure.route === 'ocular') lines.push(
    'OCULAR CARE: Available water or saline irrigation begins promptly; do not delay for history, visual acuity, product confirmation, pH paper, sterile fluid or an irrigation lens. Remove easily removable contacts while flushing; hold lids open gently and protect the unaffected eye from runoff. Continue copious low-pressure irrigation, commonly at least 15–20 minutes initially; strong corrosives/retained particles may need longer and repeat pH assessment when feasible under protocol. A normal measured pH does not prove that the cornea is uninjured. Persistent pain, haze, photophobia or visual change needs urgent ophthalmic evaluation. No rubbing, neutralizing chemicals or dermal calcium gel in the eye. Do not put skin burn dressings over an eye to end irrigation. Equipment, medicines and lid/particle procedures stay within scope. A failed irrigation roll means inadequate delivery/removal needing correction, not an automatic provider decision to use the wrong chemical.',
    'OCULAR COURSE: Normal cardiopulmonary vital signs can coexist with serious eye injury. Delay worsens local findings as the case supports; do not force desaturation, shock or death in an isolated eye splash. Report requested side-specific gross vision and eye findings in narration; do not fabricate unsupported monitor fields or diagnostic certainty. Pain relief and a successful roll alone do not establish complete decontamination or visual recovery.',
  );
  if (exposure.course === 'local') lines.push('LOCAL INJURY: Keep the systemic course stable in every difficulty, including BLACK_CLOUD. Stress may raise pulse and pain, and local damage can progress, but do not invent respiratory failure, intoxication, electrolyte collapse or death. Random complications cannot replace the seeded localized exposure with a new medical emergency.');
  if (exposure.course === 'chronic') lines.push('CHRONIC COURSE: Preserve the established weeks-long course. Do not accelerate chronic exposure into acute collapse merely to satisfy a generic deterioration or BLACK_CLOUD rule; assess and arrange evaluation based on the recorded findings.');
  return lines.join('\n');
}

module.exports = { chemicalExposureContract };
