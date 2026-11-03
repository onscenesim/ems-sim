'use strict';

// Shared catalog: the server selects finds and validates sorting; the browser draws them.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./glovebox-art'));
  else root.GloveboxCatalog = factory(root.GloveboxArt);
})(typeof globalThis !== 'undefined' ? globalThis : this, ({ art, note: noteArt, renderArt }) => {
  // Artwork is shared by the tray, inventory and drag ghost.
  const items = [
    {
      id: 'shears', name: "Captain Holt’s off-brand folding Raptor shears",
      lore: 'Black, off-brand, and stuck folded shut. These could only be Captain Holt’s.',
      art: art['shears'],
    },
    {
      id: 'napkins', name: 'A stack of napkins',
      lore: 'From at least four different drive-throughs. The closest thing this truck has to fresh linens.',
      art: art['napkins'],
    },
    {
      id: 'glove', name: 'One extra-small glove',
      lore: 'Fatima brings these from home. You didnt know they made them this small.',
      art: art['glove'],
    },
    {
      id: 'coins', name: 'Some crusty coins',
      lore: 'Eighty-seven cents in change. This could be your retirement fund.',
      art: art['coins'],
    },
    {
      id: 'ekg', name: 'A crumpled 12-lead EKG',
      lore: 'Flawless baseline. Every patient field filled in. This can only be Captain Yolanda Ferris’s work.',
      art: art['ekg'],
    },
    {
      id: 'eightball', name: 'A magic 8-ball',
      lore: '“Signs point to yes.” More sensitive and specific than bowel sounds.',
      art: art['eightball'],
    },
    {
      id: 'granola', name: 'A granola bar',
      lore: 'A healthier alternative to the standard issue Uncrustable. This one has been in here for a while.',
      art: art['granola'],
    },
    {
      id: 'hot-sauce', name: 'A packet of hot sauce',
      lore: 'For anything that needs to taste like a different decision.',
      art: art['hot-sauce'],
    },
    {
      id: 'uncrustable', name: 'An empty Uncrustables bag',
      lore: 'Still smeared with peanut butter. Danny’s favorite snack, preserved here as a greasy little crime scene. Learn to use the trash can, Danny.',
      art: art['uncrustable'],
    },
    {
      id: 'aux', name: 'A broken AUX cord',
      lore: 'Brianna Solis’s. When phones stopped having AUX ports, that was the final straw for her resolve.',
      art: art['aux'],
    },
    {
      id: 'hazmat', name: '2012 Hazardous materials book',
      lore: 'Fourteen years of “we should probably replace that.” Jams the compartment shut every time you open it.',
      art: art['hazmat'],
    },
    {
      id: 'glasses', name: 'Destiny Okafor’s reading glasses',
      lore: 'Destiny has been looking for these for days. She looks odd without her readers.',
      art: art['glasses'],
    },
    {
      id: 'divorce', name: 'Captain Frank Delucci’s divorce papers',
      lore: 'Folded, unfolded, and folded again. It was all downhill from here.',
      art: art['divorce'],
    },
    {
      id: 'electrolytes', name: 'A flavored electrolyte packet',
      lore: 'Electrolytes; Its what plants crave.',
      art: art['electrolytes'],
    },
    {
      id: 'straw', name: 'A straw still in its wrapper',
      lore: 'Its in the wrapper, but you still wouldnt use it. Who knows how long its been in there.',
      art: art['straw'],
    },
    {
      id: 'stethoscope', name: 'Priya Nair’s Cardiology IV stethoscope',
      lore: 'This stethoscope cost almost as much as her monthly rent. Do you think she even noticed it missing?',
      art: art['stethoscope'],
    },
    {
      id: 'vape', name: 'Tyler Beaumont’s vape',
      lore: 'He gets extra cranky without it.',
      art: art['vape'],
    },
    {
      id: 'pen', name: 'A dried-out ballpoint pen',
      lore: 'The entire crew has tried it, shaken it, and put it back. The cycle continues. Throw this crap out.',
      art: art['pen'],
    },
    {
      id: 'va-letter', name: 'Darnell Hughes’s VA benefits rejection',
      lore: 'Another rejection. Darnell folded it small enough to disappear under a pile of napkins.',
      art: art['va-letter'],
    },
    {
      id: 'photo', name: 'Walt and Frank, back on the line',
      lore: 'Walt Garside and Frank Delucci as happy line firemen. Arms around shoulders, grinning at the camera. Oh, how the mighty have fallen.',
      art: art['photo'],
    },
    {
      id: 'incident', name: 'A coffee-stained incident report',
      lore: 'Bo Hendricks started this, but clearly abandoned it after the coffee spill. Not his first, wont be his last.',
      art: art['incident'],
    },
  ];

  items.push(
    {
      id: 'map-book', name: 'A twenty-year-old map book',
      lore: 'Just use GPS, dude.',
      art: art['map-book'],
    },
    {
      id: 'crossword', name: 'Quinn Abernathy’s half-finished crossword',
      lore: 'Quinn does these instead of his report while you drive back. A habit learned from long shifts running IFT.',
      art: art['crossword'],
    },
    {
      id: 'journal', name: 'Amara Diallo’s Air Medical Journal',
      lore: 'Her bimonthly copy, already annotated. You have never seen anyone else reading physical journal copies.',
      art: art['journal'],
    },
    {
      id: 'retirement', name: 'Captain Okonkwo’s retirement invitation',
      lore: 'Sandra, natural grey curls and all, with Priya and Jorge smiling and Darnell looking characteristically serious. Long deserved.',
      art: art['retirement'],
    },
    {
      id: 'exam', name: 'Keisha Tremblay’s medic school exam',
      lore: 'Summative exam. 74%. There are little droplet marks on the front page.',
      art: art['exam'],
    },
    {
      id: 'thank-you', name: 'A thank-you note to Jorge Medina',
      lore: 'From a patient’s family member. You were on that call - The patient didn’t make it.',
      art: art['thank-you'],
    },
    {
      id: 'vapor-rub', name: 'Marcus Webb’s half-empty vapor rub',
      lore: 'Marcus’s name is written on the cap. Best used with an N95, according to Marcus. The smell back bad memories.',
      art: art['vapor-rub'],
    },
    {
      id: 'officer-shirt', name: 'A crumpled volunteer officer T-shirt',
      lore: 'From a fire department so far away you’re not sure it exists. Probably Captain Gord’s. How the hell does he drive here?',
      art: art['officer-shirt'],
    },
    {
      id: 'callahan-note', name: 'A fresh Post-it from Captain Callahan',
      lore: '', art: '', // One catalog slot; its message and paper color are fixed per call.
    },
    {
      id: 'maglite', name: 'A broken Maglite',
      lore: 'Still functions as a weapon. You know because Darnell broke it using it as a weapon.',
      art: art['maglite'],
    },
    {
      id: 'narcan', name: 'Expired community Narcan',
      // Storage-dependent stability: https://www.acmt.net/news/acmt-supports-the-use-of-expired-naloxone-when-unexpired-drug-is-not-available/
      lore: 'Properly stored naloxone can remain useful years past expiration. This one has been roasting in a glovebox. You can’t be caught giving this stuff out as current stock.',
      art: art['narcan'],
    },
    {
      id: 'clipboard', name: 'A dented metal clipboard',
      lore: 'Older than you. For when you have to go analogue, or whack someone in the face.',
      art: art['clipboard'],
    },
    {
      id: 'gas-card', name: 'The missing gas card',
      lore: 'It was there the whole time!',
      art: art['gas-card'],
    },
    {
      id: 'window-punch', name: 'A pink window punch',
      lore: 'Spring-loaded. Ready for action.',
      art: art['window-punch'],
    },
    {
      id: 'blood-vial', name: 'A purple-top blood vial',
      lore: 'The “drawing labs for the hospital” experiment never really took off at this station. Unused tubes are all that remain of the pilot program.',
      art: art['blood-vial'],
    },
    {
      id: 'scalpel', name: 'A capped surgical scalpel',
      lore: 'Amara Diallo always keeps one in her front pocket. Fortune favors the bold.',
      art: art['scalpel'],
    },
    {
      id: 'conference', name: 'A $300 EMS conference flyer',
      lore: 'Two CE hours. Lunch not included.',
      art: art['conference'],
    },
    {
      id: 'csn-stickers', name: 'A shift’s worth of CSN stickers',
      lore: 'Stacked on top of each other, this was presumably stuck to the tablet at one point. A flagrant HIPAA violation.',
      art: art['csn-stickers'],
    },
    {
      id: 'phone-glove', name: 'Hot date glove',
      lore: 'A phone number and a little heart, written in marker on a hospital glove.',
      art: art['phone-glove'],
    },
    {
      id: 'fatima-passport', name: 'Fatima’s passport',
      lore: 'How’d this get here? The cover is decorated, and the pages have stamps from all over the world.',
      art: art['fatima-passport'],
    },
    {
      id: 'covid-mask', name: 'Discarded COVID Mask',
      lore: 'From a darker time. Best be rid of this.',
      art: art['covid-mask'],
    },
    {
      id: 'old-newspaper', name: 'Old newspaper',
      lore: 'Who reads the newspaper anymore?',
      art: art['old-newspaper'],
    },
    {
      id: 'zynn-container', name: 'Empty Zynn container',
      lore: 'The modern EMS vice. Could be anyone’s.',
      art: art['zynn-container'],
    },
    {
      id: 'french-fry', name: 'One petrified french fry',
      lore: 'It has outlived at least one station chief.',
      art: art['french-fry'],
    },
    {
      id: 'parking-receipt', name: 'A parking receipt from 2019',
      lore: 'Ten dollars for parking at University Hospital. Someone was very confused.',
      art: art['parking-receipt'],
    },
    {
      id: 'googly-eye', name: 'A single googly eye',
      lore: 'Someone is watching you.',
      art: art['googly-eye'],
    },
    {
      id: 'dead-marker', name: 'A marker with no cap and no ink',
      lore: 'Its the only marker on the ambulance, so no one has thrown it out.',
      art: art['dead-marker'],
    },
  );

  const trash = new Set(['coins', 'napkins', 'glove', 'ekg', 'hot-sauce', 'uncrustable', 'aux', 'straw', 'pen', 'hazmat', 'map-book', 'narcan', 'conference', 'csn-stickers', 'phone-glove', 'covid-mask', 'old-newspaper', 'zynn-container', 'french-fry', 'parking-receipt', 'googly-eye', 'dead-marker', 'blood-vial']);
  const moreJunk = [
    {
      id: 'dead-pager', name: 'A pager with a dead battery',
      lore: 'The IFT division used these for a while, but once everyone started carrying cell phones they got rid of them.',
      art: art['dead-pager'],
    },
    {
      id: 'fossil-cough-drop', name: 'A fossilized cough drop',
      lore: 'Fused to its wrapper. It might soothe a throat if you could somehow seperate it from the paper.',
      art: art['fossil-cough-drop'],
    },
    {
      id: 'ancient-charger', name: 'A thirty-pin charging cable',
      lore: 'For a device nobody owns. It has survived three fleet upgrades by looking proprietary. Surely it must go to some piece of equipment?',
      art: art['ancient-charger'],
    },
    {
      id: 'conference-lanyard', name: 'A conference lanyard from 2008',
      lore: 'Sponsored by a company that has since been acquired. The lanyard is frayed, but the badge is still intact.',
      art: art['conference-lanyard'],
    },
    {
      id: 'earplug', name: 'One foam earplug',
      lore: 'Just one. For when you only want to hear half of Tyler’s complaints.',
      art: art['earplug'],
    },
    {
      id: 'pizza-coupon', name: 'An expired pizza coupon',
      lore: 'One free topping. Valid Tuesdays. Dine-in only. Expired during the first Trump administration.',
      art: art['pizza-coupon'],
    },
    {
      id: 'radio-clip', name: 'A broken radio belt clip',
      lore: 'The radio hit the pavement. The clip stayed on the belt. Technically, half of it did its job.',
      art: art['radio-clip'],
    },
    {
      id: 'flush-wrapper', name: 'An empty saline flush wrapper',
      lore: 'The flush is long gone. Its a shell of its former self, just like you.',
      art: art['flush-wrapper'],
    },
    {
      id: 'mix-cd', name: 'A scratched-up “NIGHT SHIFT MIX” CD',
      lore: 'This doesnt play anymore, but you remember some of the tracks that were on it. Goodbye Stranger, Gangsta’s Paradise, Don’t Stop Believin’...',
      art: art['mix-cd'],
    },
    {
      id: 'shift-swap', name: 'A shift-swap request from 2012',
      lore: '“Can anyone cover?” From before the electronic scheduling system was fully implemented. They could not cover.',
      art: art['shift-swap'],
    },
  ];
  items.push(...moreJunk);
  moreJunk.forEach(item => trash.add(item.id));
  items.forEach(item => { item.destination = trash.has(item.id) ? 'trash' : 'pocket'; });
  items.find(item => item.id === 'coins').alternateDestination = 'pocket';
  const notes = [
    'The new frequent caller on Birch says his smartwatch is “too accurate.” Please do not challenge it to a second opinion. — Ruth',
    'The passenger window goes down. Coming back up is now a team-building exercise. — Ruth',
    'The left siren speaker sounds like a goose. Fleet says “unable to reproduce.” The goose disagrees. — Ruth',
    'We are out of emesis bags. I have ordered more. This is not an invitation to test our improvisational skills. — Ruth',
    'The stretcher charger only works in the outlet labeled DOES NOT WORK. The label is from a different era. — Ruth',
    'Station 4 borrowed our spare BP cuff. They deny it. Their station number is written over ours. — Ruth',
    'No more orange electrolyte packets until Friday. The lemon ones are not a punishment. Officially. — Ruth',
    'The CAD tablet thinks the river is a road again. Please continue respecting the river. — Ruth',
    'A new frequent caller wants transport because his upstairs neighbor “breathes competitively.” Establish scene peace. — Ruth',
    'The cab clock gains eleven minutes per shift. You are not getting off early. — Ruth',
    'The oxygen wrench has been found in the coffee drawer. I will not be taking questions. — Ruth',
    'The suction unit makes a noise like a blender full of pennies. Tagged out. Use the checked spare. Do not make a smoothie. — Ruth',
    'Dispatch has renamed the same apartment complex for the third time. It is still the one with the angry peacock. — Ruth',
    'No medium gloves until the delivery arrives. No, putting LARGE on the box in smaller writing does not help. — Ruth',
    'The printer feeds six blank sheets before each report. Fleet calls this “warm-up.” So does Bo. — Ruth',
    'The rear AC has two settings: Arctic and Rumor. Work order submitted. Again. — Ruth',
    'The spare monitor battery is at Station 2. Station 2 has our battery, our broom, and no shame. — Ruth',
    'The pharmacy order is delayed. Check the stock list before shift. “I thought Priya checked” is not a stock list. — Ruth',
    'The new gate code at Rose Court is the old gate code backwards. Please stop driving around the building in reverse. — Ruth',
    'The radio volume knob is decorative now. A replacement is coming. Until then, dispatch is very enthusiastic. — Ruth',
    'Our favorite caller on Elm bought a pulse oximeter for his cat. This is now somehow a district issue. — Ruth',
    'The back-step light stays on when the doors close. Fleet says it is “probably fine.” Documented that exact quote. — Ruth',
    'Out of instant cold packs. Someone used the last case to keep a potluck salad “within protocol.” — Ruth',
    'The station microwave trips the bay lights. Please stop announcing “clear” before reheating fish. — Ruth',
    'The spare stethoscope has reappeared in the holiday decorations. It is September. No further comment. — Ruth',
    'The district has a new roundabout. Navigation calls it a cul-de-sac. Both are currently losing to Walt. — Ruth',
    'The clipboard clip has launched another pen into the dashboard. Eye contact with Fleet is now mandatory. — Ruth',
    'The supply order contains 400 tongue depressors and zero tape. Procurement has been asked to show its work. — Ruth',
    'A caller on Pine requests the “quiet ambulance.” Quinn, apparently you have a regular. — Ruth',
    'The cup holder is not a sharps container, phone mount, or specimen rack. It barely holds cups. — Ruth',
    'Truck 6’s fuel gauge reads full whenever it rains. Please use the mileage log, not the weather forecast. — Ruth',
    'The station doorbell now triggers the training AED. Nobody is in cardiac arrest. Someone is delivering pizza. — Ruth',
  ];
  const noteColors = ['#e0d487', '#d1a0b4', '#9dbdab', '#9fb9cc', '#d8b08a'];
  function resolve(id, variant = {}) {
    const item = items.find(item => item.id === id);
    if (!item) return null;
    if (id !== 'callahan-note') return item;
    return { ...item, lore: notes[variant.message % notes.length] || notes[0], art: noteArt(noteColors[variant.color % noteColors.length] || noteColors[0]) };
  }
  return { items, notes, noteColors, resolve, renderArt };
});
