'use strict';

const VISION_EMERGENCIES = {
  medical: [
    {
      presentation: 'Acute angle-closure glaucoma — sudden painful red eye and blurred vision with halos, headache, and nausea after leaving a dim theater',
      hint: 'The patient has a history of being told their drainage angles are narrow, if asked. A focused exam can reveal a hazy cornea, poor visual acuity and a sluggish mid-dilated pupil on the affected side. Check symptom onset and vision in each eye. Arrange urgent ophthalmology-capable evaluation and address pain and nausea within scope. A routine headache or migraine disposition misses the vision threat.',
      age_override: ['middle_aged', 'elderly'],
      difficulty: 'NORMAL',
    },
    {
      presentation: 'Retinal detachment — sudden new flashes and floaters followed by a painless dark curtain creeping across one eye',
      hint: 'The patient can describe progression from a peripheral shadow to a larger field defect. The external eye looks normal. Assess vision and fields separately for each eye and arrange urgent retinal evaluation. A normal external eye exam does not explain away the curtain or exclude detachment.',
      age_override: ['middle_aged', 'elderly'],
      difficulty: 'NORMAL',
    },
    {
      presentation: 'Central retinal artery occlusion — abrupt painless loss of most vision in one eye while reading breakfast news',
      hint: 'The patient can give a precise onset and last known well. Severe monocular loss persists on separate-eye testing despite a normal external eye and no face, speech or limb deficits. Treat suspected retinal arterial ischemia as a time-sensitive stroke emergency. Follow the regional stroke pathway and notify the receiving stroke-capable facility promptly. Ocular massage does not restore flow in this scenario.',
      age_override: ['middle_aged', 'elderly'],
      difficulty: 'HARD',
    },
  ],
  trauma: [
    {
      presentation: 'Globe rupture — a bungee cord hook snaps back into one eye while securing cargo, with immediate severe vision loss',
      hint: 'Gentle inspection can reveal an irregular pupil and a visible wound. The patient has an open globe. Protect it with a rigid shield that rests on the surrounding bones. Avoid any pressure on the eye, forced lid opening, tonometry, and removal of any protruding material. Control nausea within scope and expedite transport to an appropriate trauma or ophthalmology-capable facility. Canthotomy has no indication in this case.',
      age_override: ['young_adult', 'middle_aged'],
      difficulty: 'HARD',
    },
    {
      presentation: 'Orbital compartment syndrome — softball to the orbit, with worsening eye pain, rapidly fading vision, and progressive bulging of one eye',
      hint: 'Retrobulbar bleeding is raising orbital pressure with the globe intact. Focused exam reveals proptosis, tense lids, restricted eye movements and an afferent pupillary defect. Vision worsens with delay while systemic vital signs remain stable. A trained, authorized provider can order emergency lateral canthotomy with inferior cantholysis in the simulator. Effective decompression relieves orbital tension and can preserve remaining vision. Reassess vision and continue urgent transport even after decompression. If outside scope, expedite transport and prealert the receiving team.',
      age_override: ['young_adult', 'middle_aged'],
      difficulty: 'HARD',
    },
  ],
};

module.exports = { VISION_EMERGENCIES };
