'use strict';

// Shared catalog: the server selects finds and validates sorting; the browser draws them.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GloveboxCatalog = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  // Tiny hand-drawn sprites share a 96 × 80 canvas. All markup is local artwork.
  const paper = (inside) => `<path d="M23 5h43l9 12-3 56-51-2 3-30-5-14z" fill="#ddd8bd"/><path d="m66 5-1 14 10-2M24 41l20-7 28 11M44 34l-4 35" fill="none" stroke="#b6b197"/>${inside}`;
  const lines = '<path d="M30 37h28M30 43h33M30 49h25M30 60h19" stroke="#868c89" stroke-width="2"/>';
  const packet = (color, inside) => `<path d="m26 10 5 3 5-3 5 3 5-3 5 3 5-3 5 3 6-3-2 60-5-3-5 3-5-3-5 3-5-3-5 3-5-3-6 3z" fill="${color}"/><path d="M29 19h34M27 61h34" stroke="#ffffff55"/>${inside}`;
  const label = (text, x, y, size = 8, color = '#344047') => `<text x="${x}" y="${y}" fill="${color}" stroke="none" font-family="monospace" font-weight="bold" font-size="${size}" text-anchor="middle">${text}</text>`;
  const items = [
    {
      id: 'shears', name: "Captain Holt’s off-brand folding Raptor shears",
      lore: 'Black, off-brand, and stuck folded shut. The logo says “RAPTURE.” The hinge says otherwise. These could only be Captain Holt’s.',
      art: '<path d="m31 22 29-4 6 37-27 5z" fill="#252b30" stroke="#59636a" stroke-width="2"/><path d="m40 24 8 30 8-2-4-31z" fill="#78848b"/><path d="M34 42c-14 0-13 28 0 27 15-1 13-27 0-27zM57 40c-14 1-11 27 3 26 13-2 11-27-3-26z" fill="#151a1f" stroke="#566068" stroke-width="2"/><path d="M33 49c-5 0-5 12 1 12 6 0 5-12-1-12zM57 47c-5 1-3 12 3 11 5-1 3-12-3-11z" fill="#303b40"/><circle cx="47" cy="27" r="4" fill="#9ca8ae"/><path d="m51 18 8-1 2 8" fill="none" stroke="#4b555c" stroke-width="3"/>',
    },
    {
      id: 'napkins', name: 'A stack of napkins',
      lore: 'From at least four different drive-throughs. The closest thing this truck has to a linen service.',
      art: '<path d="m15 25 57-8 10 43-59 9z" fill="#a99d7b"/><path d="m12 19 59-6 10 43-61 9z" fill="#d3c7a4"/><path d="m15 15 58-5 7 41-60 8z" fill="#e4dbbe"/><path d="m19 22 51-5 5 30-50 7zM44 18l5 34" fill="none" stroke="#c2b694" stroke-dasharray="2 2"/>',
    },
    {
      id: 'glove', name: 'One extra-small glove',
      lore: 'Fatima brings these from home. Apparently “one size fits all” is a promise the supply room can’t keep.',
      art: '<path d="m35 67-7-21-11-13q-3-8 4-7l12 11-6-24q0-8 6-5l9 23-2-27q3-7 7-1l5 26 3-24q4-6 7 1l-1 27 6-15q6-4 7 3l-5 27-12 17 2 8z" fill="#9bafd6"/><path d="m36 62 23-3M38 42l13 10 11-16" stroke="#6e80ab" fill="none"/>',
    },
    {
      id: 'coins', name: 'Some crusty coins',
      lore: 'Eighty-seven cents, a little verdigris, and something that used to be a mint. Your retirement fund.',
      art: '<g stroke="#66563b" stroke-width="2"><ellipse cx="32" cy="49" rx="17" ry="13" fill="#aa8650"/><ellipse cx="59" cy="52" rx="16" ry="12" fill="#999c90"/><ellipse cx="48" cy="31" rx="16" ry="13" fill="#bd9b65"/></g><g fill="none" stroke="#d1b581"><ellipse cx="32" cy="47" rx="12" ry="8"/><ellipse cx="48" cy="29" rx="11" ry="8"/></g><path d="m21 45 5-3 4 5-6 4M50 22l8 3-3 6-6-2M61 49l8 2-3 5" fill="#75866b"/>',
    },
    {
      id: 'ekg', name: 'A crumpled 12-lead EKG',
      lore: 'Flawless baseline. Every patient field filled in. Even the time is correct. This can only be Captain Yolanda Ferris’s work.',
      art: '<path d="m5 21 23-8 22 8 23-6 16 6-5 42-20-5-20 8-20-8-17 5z" fill="#efdbce"/><path d="M10 32h74M9 42h76M9 52h75M20 21v37M30 21v40M40 23v38M50 23v40M60 22v38M70 21v38M80 24v34" stroke="#d5aba4" stroke-width=".6"/><path d="M11 38h10l3-4 3 5 3-15 3 24 3-10h11l3-4 3 5 3-15 3 24 3-10h19M10 53h14l3-4 3 4 3-9 3 16 3-7h17l3-4 3 4 3-9 3 16 3-7h9" stroke="#565052" fill="none" stroke-width="1.2"/><path d="m28 13-4 44M50 21l-6 45M73 15l-9 43" stroke="#b7a494" fill="none"/>' + label('FERRIS / 12:04', 49, 19, 5),
    },
    {
      id: 'eightball', name: 'A magic 8-ball',
      lore: '“Ask again after shift change.” Finally, a second opinion everyone can agree on.',
      art: '<circle cx="48" cy="40" r="30" fill="#101519" stroke="#434d56" stroke-width="2"/><path d="M26 30q4-15 19-16" stroke="#64717a" stroke-width="3" fill="none"/><circle cx="49" cy="36" r="15" fill="#e1e0ce"/>' + label('8', 49, 44, 24, '#192128'),
    },
    {
      id: 'granola', name: 'A granola bar',
      lore: 'Emergency rations. Compressed oats, chocolate chips, and the hope of getting a real meal before midnight.',
      art: '<path d="m9 26 6 3 4-5 5 3 55-6 7 30-6-2-3 5-5-2-56 7z" fill="#8d9c68"/><path d="m25 29 40-4 6 27-40 4z" fill="#ded4ac"/><path d="m30 43 8-7 8 4 8-6 10 9-5 7-25 2z" fill="#b58b52"/><path d="m39 40 3 3m8-3 3 4m4-1 3 3" stroke="#624631" stroke-width="3"/>' + label('OATS', 46, 34, 7),
    },
    {
      id: 'hot-sauce', name: 'A packet of hot sauce',
      lore: 'For station food, gas-station food, and anything else that needs to taste like a different decision.',
      art: packet('#b84e39', '<path d="M39 32q23-11 17 9-5 13-20 12 11-7 3-21" fill="#e9874b"/><path d="m43 31 8-7" stroke="#859866" stroke-width="3"/>' + label('HOT', 47, 59, 7, '#f2ddb2')),
    },
    {
      id: 'uncrustable', name: 'An empty Uncrustables bag',
      lore: 'Still smeared with peanut butter. Danny’s favorite snack, preserved here as a greasy little crime scene.',
      art: '<path d="m13 17 13 4 9-6 13 5 15-4 20 3-6 45-14-3-13 6-16-4-20 1z" fill="#b5c2c5" fill-opacity=".8"/><path d="m19 27 57-2-3 26-54 4z" fill="#607ba0"/><ellipse cx="47" cy="40" rx="19" ry="12" fill="#ddd8b5"/><path d="m25 54 19-4 9 5-9 7-17-3M61 28l11 5-3 9-8-4" fill="#a47445"/>' + label('PB &amp; J', 47, 42, 7),
    },
    {
      id: 'aux', name: 'A broken AUX cord',
      lore: 'Brianna Solis’s. When phones stopped having AUX ports, that was the final straw for her resolve. This cord gave up shortly afterward.',
      art: '<path d="M24 28C3 63 44 76 51 47S87 25 76 59" fill="none" stroke="#111619" stroke-width="7"/><path d="M24 28C3 63 44 76 51 47S87 25 76 59" fill="none" stroke="#62656b" stroke-width="2"/><path d="m21 30 6-15 9 4-6 16zM68 55l13 1-1 10-13-1z" fill="#364048"/><path d="m29 15 3-9 5 2-3 9" fill="#c5b075"/><path d="m70 66-4 7m8-7 3 9" stroke="#be8a5b" stroke-width="2"/>',
    },
    {
      id: 'hazmat', name: '2012 hazardous materials book',
      lore: 'Orange cover. Fire diamond. Fourteen years of “we should probably replace that.” Somehow still holding the compartment shut.',
      art: '<path d="M23 10h52v61H23z" fill="#a84929"/><path d="M26 8h47v59H26z" fill="#dc8644"/><path d="M29 64h43v5H29z" fill="#d9d2ae"/><path d="M26 8v55" stroke="#f0ad61" stroke-width="3"/><path d="m50 27 13 13-13 13-13-13z" fill="#ece3c6"/><path d="m50 27 13 13H37z" fill="#b74435"/><path d="m37 40 13 13V27z" fill="#4d7eab"/><path d="m63 40-13 13V27z" fill="#d4b854"/><path d="m50 27 13 13-13 13-13-13zM37 40h26M50 27v26" fill="none" stroke="#493f34"/>' + label('HAZMAT', 50, 20, 8) + label('2012', 50, 60, 8),
    },
    {
      id: 'glasses', name: 'Destiny Okafor’s reading glasses',
      lore: 'Destiny has been looking for these all shift. She has checked on everyone else at least twice in the meantime.',
      art: '<path d="m14 36 7-19 13-2M79 36l-8-19-12-2" fill="none" stroke="#b08b73" stroke-width="4"/><path d="M11 34h30v20H15zM55 34h30l-4 20H55z" fill="#b1d2d5" fill-opacity=".25" stroke="#b8866b" stroke-width="4"/><path d="M41 38q7-7 14 0M19 40l10 9M62 40l10 9" stroke="#d5c5ac" stroke-width="2" fill="none"/>',
    },
    {
      id: 'divorce', name: 'Captain Frank Delucci’s divorce papers',
      lore: 'Folded, unfolded, and folded again. Delucci was never quite the same after the divorce.',
      art: paper(lines + label('DISSOLUTION', 47, 25, 6) + label('OF MARRIAGE', 47, 32, 6) + '<path d="m39 61 5-6 3 8 6-5 7 2" fill="none" stroke="#45577d"/>'),
    },
    {
      id: 'electrolytes', name: 'A flavored electrolyte packet',
      lore: '“Tropical rescue.” It tastes like someone described a mango to a bag of salt.',
      art: packet('#659c9d', '<path d="m49 23-12 19h10l-4 15 17-23H49l5-11z" fill="#e3d39a"/>' + label('HYDRATE', 47, 60, 6, '#edf0d3')),
    },
    {
      id: 'straw', name: 'A straw still in its wrapper',
      lore: 'Pristine. Unopened. The only thing in here that has its life together.',
      art: '<path d="m14 60 60-47 9 11-60 47z" fill="#e1dbc4"/><path d="m19 59 55-42 4 5-55 43z" fill="#bdc3b6"/><path d="m16 57 9 10M70 17l8 10" stroke="#aea993" stroke-dasharray="2 2"/>',
    },
    {
      id: 'stethoscope', name: 'Priya Nair’s Cardiology IV stethoscope',
      lore: 'Priya spent way too much on this. The acoustics are excellent. The monthly payments are less soothing.',
      art: '<path d="M27 35v13c0 28 43 28 43 4V40" fill="none" stroke="#9275a5" stroke-width="7"/><path d="M15 14v16q0 15 13 15t13-15V14" fill="none" stroke="#b9c4c7" stroke-width="4"/><path d="M15 13h6M35 13h6" stroke="#282d35" stroke-width="7" stroke-linecap="round"/><circle cx="70" cy="33" r="12" fill="#b9c4c7"/><circle cx="70" cy="33" r="8" fill="#55696f"/><path d="M64 29q7-5 11 2" stroke="#d1d9d6" stroke-width="2" fill="none"/>',
    },
    {
      id: 'vape', name: 'Tyler Beaumont’s vape',
      lore: 'He says it isn’t his. It is labeled “TYLER” in his handwriting.',
      art: '<path d="M40 9h17v13H40z" fill="#263337"/><rect x="33" y="21" width="32" height="47" rx="5" fill="#789e99"/><path d="M37 25v36" stroke="#aac0ac" stroke-width="3"/><rect x="41" y="45" width="16" height="10" fill="#d0ccb1"/>' + label('TYLER', 49, 52, 5) + '<circle cx="49" cy="32" r="3" fill="#d6e5bc"/>',
    },
    {
      id: 'pen', name: 'A dried-out ballpoint pen',
      lore: 'The entire crew has tried it, shaken it, and put it back. The cycle continues.',
      art: '<path d="m23 61 43-46 8 8-43 46z" fill="#c3ba9c"/><path d="m58 23 14-15 11 10-14 16z" fill="#476487"/><path d="m66 18 7 7-15 15" stroke="#91a4b7" stroke-width="2" fill="none"/><path d="m23 61-5 14 13-6z" fill="#899295"/><path d="m18 75 3-8 5 5z" fill="#272d34"/>',
    },
    {
      id: 'va-letter', name: 'Darnell Hughes’s VA benefits rejection',
      lore: 'Another rejection. Darnell folded it small enough to disappear under a pile of napkins. He hasn’t brought it up.',
      art: paper(lines + label('VA BENEFITS', 47, 22, 6) + '<path d="m27 27 38-2 1 12-38 2z" fill="none" stroke="#a35d4b"/>' + label('DENIED', 47, 34, 8, '#a35d4b')),
    },
    {
      id: 'photo', name: 'Walt and Frank, back on the line',
      lore: 'Walt Garside and Frank Delucci as happy line firemen. Arms around shoulders, grinning at the camera. Oh, how the mighty have fallen.',
      art: '<path d="m12 9 73 6-5 59-72-6z" fill="#dedac0"/><path d="m18 15 60 5-3 40-60-5z" fill="#879186"/><path d="M19 25h55v16H19z" fill="#985a45"/><path d="m22 53 1-16h20l3 18M48 55V39h19l5 18" fill="#b59a5f"/><path d="m24 45 18 1m8 1 18 1" stroke="#d9c796" stroke-width="3"/><circle cx="33" cy="32" r="8" fill="#c8a17b"/><circle cx="57" cy="34" r="8" fill="#d6b18b"/><path d="M23 28h21l-4-7H28zM47 30h21l-5-8H52z" fill="#d3bd74"/><path d="m29 34 4 2 4-2m16 2 4 2 4-2" fill="none" stroke="#735341"/>' + label('THE GOOD YEARS', 46, 65, 5),
    },
    {
      id: 'incident', name: 'A coffee-stained incident report',
      lore: 'Bo Hendricks started this. The coffee finished more of it than he did.',
      art: paper(label('INCIDENT REPORT', 47, 24, 5) + '<path d="M29 31h34v29H29zM29 39h34M29 48h34M40 31v29" stroke="#8e9590" fill="none"/><path d="m32 35 6-1 5 2" stroke="#4c6689" fill="none"/><circle cx="62" cy="53" r="14" fill="none" stroke="#a37b4c" stroke-width="4" opacity=".65"/><path d="m66 61 5 3-4 5-6-4z" fill="#a37b4c" opacity=".5"/>'),
    },
  ];

  items.push(
    {
      id: 'map-book', name: 'A twenty-year-old map book',
      lore: 'Every road you need is a cornfield. Every cornfield is now a subdivision. Still insists the hospital is on the other side of town.',
      art: '<path d="M17 12h61v57H17z" fill="#7f987a"/><path d="M21 17h51v44H21z" fill="#ded1a9"/><path d="m23 28 16 9 18-14 13 6M28 59l10-19 20 9 12-9" stroke="#ac6a51" stroke-width="4" fill="none"/><path d="m23 46 47-11M49 20l-7 38" stroke="#7c9ca6" stroke-width="3"/>' + label('STREET ATLAS', 47, 15, 6) + label('2006', 47, 67, 7),
    },
    {
      id: 'crossword', name: 'Quinn Abernathy’s half-finished crossword',
      lore: 'Quinn does these instead of his report while you drive back. The unmistakable signature of an IFT industry vet. Four down: “documentation,” thirteen letters.',
      art: paper('<path d="M28 25h36v36H28z" fill="#f1ead3"/><path d="M28 34h36M28 43h36M28 52h36M37 25v36M46 25v36M55 25v36" stroke="#7e827c"/><path d="M28 25h9v9h-9zM46 34h9v9h-9zM37 52h9v9h-9zM55 52h9v9h-9z" fill="#414e50"/>' + label('CROSSWORD', 47, 19, 6) + label('I F T', 46, 41, 7) + label('R', 32, 50, 7)),
    },
    {
      id: 'journal', name: 'Amara Diallo’s Air Medical Journal',
      lore: 'Her bimonthly copy, already annotated. You have never seen anyone else reading physical journal copies. Amara has a subscription and opinions.',
      art: '<path d="M22 7h53v65H22z" fill="#cbd9d3"/><path d="M22 7h53v22H22z" fill="#43727b"/><path d="M28 30h41v24H28z" fill="#88a6ae"/><path d="m36 42 20-5 8 7-10 4-20-2zM51 38v-5M36 32h31M63 42l7-8" fill="#e3e0c5" stroke="#394f59" stroke-width="2"/>' + label('AIR MEDICAL', 48, 15, 6, '#e6e8da') + label('JOURNAL', 48, 22, 6, '#e6e8da') + '<path d="M29 61h37M29 65h29" stroke="#617f83"/>',
    },
    {
      id: 'retirement', name: 'Captain Okonkwo’s retirement invitation',
      lore: 'Sandra, surrounded by a smiling crew. An invitation to her upcoming retirement party. Long deserved. Nobody has volunteered to give the speech without crying.',
      art: '<path d="M15 8h66v64H15z" fill="#e3d9b7"/>' + label('THANK YOU, SANDRA', 48, 18, 5) + '<path d="M23 25h50v30H23z" fill="#8caaa3"/><path d="M25 53V41h12v12M38 54V39h19v15M59 54V42h12v12" fill="#465e75"/><g fill="#a57d57"><circle cx="31" cy="35" r="5"/><circle cx="48" cy="32" r="7"/><circle cx="65" cy="36" r="5"/></g><path d="m28 36 3 2 3-2m10-3 4 3 4-3m10 4 3 2 3-2" stroke="#efddad" fill="none"/>' + label('HAPPY RETIREMENT', 48, 64, 5),
    },
    {
      id: 'exam', name: 'Keisha Tremblay’s medic school exam',
      lore: 'Summative exam. 74%. There are little dried droplet marks on the front page. You fold it back along the same crease.',
      art: paper(label('SUMMATIVE EXAM', 47, 21, 5) + lines + '<ellipse cx="48" cy="30" rx="16" ry="10" stroke="#b66659" fill="none"/>' + label('74%', 48, 34, 12, '#b66659') + '<path d="M30 50q-7 10 0 11 8-2 0-11M61 57q-6 8 0 9 7-1 0-9" fill="#9babb0" opacity=".45"/>'),
    },
    {
      id: 'thank-you', name: 'A thank-you note to Jorge Medina',
      lore: 'From a patient’s family member. You were on that call. The patient didn’t make it. They remembered how Jorge stayed with them anyway.',
      art: '<path d="m18 12 58 2-3 57-57-3z" fill="#e0d5be"/>' + label('Dear Jorge,', 46, 27, 8) + '<path d="m26 37 12-2 4 3 19-1M26 44h37M26 51l15-1 4 2 10-2" stroke="#697c8a" fill="none"/><path d="M53 59c-9-10-16 1 0 8 16-7 9-18 0-8" fill="#b77976"/>',
    },
    {
      id: 'vapor-rub', name: 'Marcus Webb’s half-empty vapor rub',
      lore: 'Marcus’s name is written on the cap. Best used with an N95, according to Marcus. The smell alone brings back calls you would rather forget.',
      art: '<path d="M24 25h48v36q-24 13-48 0z" fill="#455c8d"/><path d="M29 37h38v21H29z" fill="#adbea4"/><ellipse cx="48" cy="25" rx="26" ry="9" fill="#609184"/><path d="M22 24v8q26 13 52 0v-8" fill="#41776f"/><ellipse cx="48" cy="23" rx="26" ry="8" fill="#75a497"/>' + label('M. WEBB', 48, 26, 7) + label('VAPOR RUB', 48, 49, 6),
    },
    {
      id: 'officer-shirt', name: 'A crumpled volunteer officer T-shirt',
      lore: 'From a fire department so far away you’re not sure it exists. Probably Captain Gord’s. The word “OFFICER” has survived every wash.',
      art: '<path d="m23 17 17-6 9 7 10-6 15 8 13 18-15 9-6-9 7 29-28 2-22-5 5-27-9 8-12-12z" fill="#334452" stroke="#607180"/><path d="m37 14 10 14 15-13M29 45l16 5-8 15M58 29l-7 16 14 15" fill="none" stroke="#26333e" stroke-width="3"/>' + label('OFFICER', 48, 39, 8, '#c4b27d') + label('VOL. FIRE', 48, 47, 5, '#c4b27d'),
    },
    {
      id: 'callahan-note', name: 'A fresh Post-it from Captain Callahan',
      lore: '', art: '', // One catalog slot; its message and paper color are fixed per call.
    },
    {
      id: 'maglite', name: 'A broken Maglite',
      lore: 'Still functions as a weapon. You know because Darnell broke it using it as a weapon. The incident report was less concise.',
      art: '<path d="m21 59 37-39 12 12-38 38z" fill="#4c5356" stroke="#7d8584"/><path d="m54 22 10-14 19 19-14 11z" fill="#333d44"/><path d="m63 10 8-5 17 17-6 7z" fill="#899691"/><path d="m69 10 13 12" stroke="#262e36" stroke-width="4"/><path d="m28 52 9 8m-3-16 9 8m-3-15 9 8" stroke="#252e34" stroke-width="3"/><path d="m76 11-3 8 10-2" fill="none" stroke="#292f35"/>',
    },
    {
      id: 'narcan', name: 'Expired community Narcan',
      lore: 'The little nasal sprayer with the pink logo. We’re supposed to give these out to overdose patients on scene. But, uh… this one expired two years ago.',
      art: '<path d="M39 9h17v25l14 9v17H25V43l14-9z" fill="#e0ded0" stroke="#969c99"/><path d="M43 6h9v19h-9z" fill="#d1d7d3"/><path d="M21 41h53v7H21z" fill="#e3e8df"/><path d="M38 55h20v15H38z" fill="#c18da5"/><path d="M31 49h34v8H31z" fill="#bb7097"/>' + label('NARCAN', 48, 55, 6, '#fff3ed'),
    },
    {
      id: 'clipboard', name: 'A dented metal clipboard',
      lore: 'Older than you. For when you have to go analogue, or the tablet decides it has completed enough reports for one day.',
      art: '<path d="M23 12h48l5 8-4 17 3 31H20l3-25-3-15z" fill="#96a3a4" stroke="#c5cdca"/><path d="M28 22h36v37H28z" fill="#d5d3bd"/><path d="M34 9h25v16H34z" fill="#556a70"/><path d="M39 13h15v6H39z" fill="#a2b2af"/><path d="M33 34h27M33 43h24M33 52h27" stroke="#9fa59a"/>',
    },
    {
      id: 'gas-card', name: 'The missing gas card',
      lore: 'It was there the whole time! Three shifts of accusations, one very awkward group text, and it was under a napkin.',
      art: '<rect x="10" y="18" width="76" height="47" rx="4" fill="#b99d65"/><path d="M10 29h76v10H10z" fill="#435458"/><path d="M19 45h14v10H19z" fill="#ddc690"/>' + label('FLEET FUEL', 49, 26, 7) + label('•••• 0911', 56, 57, 8),
    },
    {
      id: 'window-punch', name: 'A pink window punch',
      lore: 'Spring-loaded. Ready for action. The only tool on the truck nobody can accidentally claim is theirs.',
      art: '<path d="m21 62 39-42 12 12-40 39z" fill="#c784a1" stroke="#e0a8bf"/><path d="m61 20 9-10 8 8-7 13z" fill="#c9d0c9"/><path d="m70 10 9-6-1 14z" fill="#84959c"/><path d="m26 55 12 10m-6-18 12 10m-5-18 12 10m-5-18 12 10" stroke="#994e77" stroke-width="3"/>',
    },
    {
      id: 'blood-vial', name: 'A purple-top blood vial',
      lore: 'The “drawing labs for the hospital” experiment never really took off at this station. This unused tube is all that remains of the pilot program.',
      art: '<path d="M36 20h23v44q-12 13-23 0z" fill="#9ab3b4" fill-opacity=".6" stroke="#b7cccc"/><path d="M36 39h23v17H36z" fill="#e4dfc6"/><path d="M32 12h31v17H32z" fill="#9176a8"/><path d="M37 14v12M43 14v12M49 14v12M55 14v12" stroke="#684f80" stroke-width="2"/><path d="M40 44h14M40 48h11" stroke="#929e98"/>',
    },
    {
      id: 'scalpel', name: 'A capped surgical scalpel',
      lore: 'Amara Diallo always keeps one in her front pocket. Apparently her packing list includes “just in case” as a personality trait.',
      art: '<path d="m19 62 40-43 10 9-40 43z" fill="#658c98"/><path d="m54 24 22-21 12 11-22 22z" fill="#becbc6"/><path d="m60 24 16-16 6 6-16 16z" fill="#dae0d5"/><path d="m26 55 7 7m-1-14 7 7m-1-14 7 7" stroke="#325f71" stroke-width="2"/>',
    },
    {
      id: 'conference', name: 'A $300 EMS conference flyer',
      lore: 'Two CE hours. Lunch not included. Parking not included. A tote bag, somehow, is the selling point.',
      art: paper('<path d="M24 12h44v17H24z" fill="#647d91"/>' + label('EMS SUMMIT', 46, 23, 6, '#e4e0c8') + label('$300', 47, 44, 16) + label('2 CE HOURS', 47, 54, 6) + label('NO LUNCH', 47, 63, 5, '#a36857')),
    },
    {
      id: 'csn-stickers', name: 'A shift’s worth of CSN stickers',
      lore: 'Stacked on top of each other like the world’s least defensible sticker collection. A flagrant HIPAA violation. Every corner has pocket lint.',
      art: '<path d="m12 29 67-8 6 31-67 8z" fill="#b8b7a5"/><path d="m13 23 67-6 4 32-67 7z" fill="#d2cfb7"/><path d="m16 17 64-4 2 31-65 5z" fill="#e4e1ce"/>' + label('CSN ••••••', 48, 26, 6) + '<path d="M26 30v10M30 29v10M34 29v10M41 29v10M45 28v10M52 28v10M56 27v10M63 27v10M67 26v10" stroke="#485255" stroke-width="2"/>',
    },
    {
      id: 'phone-glove', name: 'A faded blue hospital glove',
      lore: 'A phone number and a little heart, written in marker. A tradition as old as time, unfortunately. Nobody is admitting whose handwriting that is.',
      art: '<path d="m30 65-5-20-10-14q0-6 5-4l11 12-5-24q2-6 6-2l9 20-1-27q4-5 7 0l3 27 4-24q5-4 6 2l-1 26 7-15q6-3 6 4l-6 24-9 14 1 10z" fill="#759db6"/>' + label('555-0142', 47, 51, 7, '#34495c') + '<path d="M49 57c-7-7-11 2 0 7 11-5 7-14 0-7" fill="#415b79"/>',
    },
    {
      id: 'fatima-passport', name: 'Fatima’s passport',
      lore: 'How’d this get here? The cover is decorated, and the pages have stamps from all over the world.',
      art: '<path d="M23 7h49q5 0 5 5v57q0 5-5 5H23q-5 0-5-5V12q0-5 5-5z" fill="#364c79" stroke="#a4a9a4" stroke-width="2"/><path d="M25 13h45v54H25z" fill="none" stroke="#a98859"/><circle cx="47" cy="38" r="13" fill="none" stroke="#d4b577" stroke-width="2"/><path d="M34 38h26M47 25q-11 13 0 26 11-13 0-26M47 25v26" fill="none" stroke="#d4b577"/><path d="m26 17 5 3-2 5-5-2m35 39 5-5 6 3-3 5" fill="#db897b"/>' + label('PASSPORT', 47, 61, 7, '#dec693'),
    },
    {
      id: 'covid-mask', name: 'Discarded COVID Mask',
      lore: 'From a darker time.',
      art: '<path d="M22 27Q48 12 74 27L70 58Q48 69 26 58z" fill="#9dbac1" stroke="#d5d9cf" stroke-width="2"/><path d="M23 31q-21-13-17 13 3 16 20 10M73 31q21-13 17 13-3 16-20 10M28 36q20 8 40 0M28 45q20 8 40 0" fill="none" stroke="#718f98" stroke-width="3"/>',
    },
    {
      id: 'old-newspaper', name: 'Old newspaper',
      lore: 'Who reads the newspaper anymore?',
      art: '<path d="m12 13 69-5-4 58-64 6z" fill="#c8c2a8" stroke="#868478"/><path d="m17 17 59-4-4 49-55 5z" fill="#e6dfc6"/>' + label('THE DAILY', 46, 25, 9) + '<path d="M20 30h49M20 34h49M20 39h28v15H20zM52 39h18M52 44h18M52 49h18M20 58h50M20 62h38" stroke="#7c8076" stroke-width="2"/><path d="m25 45 8-5 9 10" stroke="#9b9a8c" fill="none"/>',
    },
    {
      id: 'zynn-container', name: 'Empty Zynn container',
      lore: 'The modern EMS vice. Could be anyone’s.',
      art: '<ellipse cx="48" cy="53" rx="30" ry="15" fill="#6e7278"/><path d="M18 33h60v20q-30 18-60 0z" fill="#9ea6aa"/><ellipse cx="48" cy="33" rx="30" ry="14" fill="#d4d9d7" stroke="#758289" stroke-width="3"/><ellipse cx="48" cy="33" rx="23" ry="9" fill="none" stroke="#8ca0a8" stroke-width="2"/>' + label('ZYNN', 48, 37, 12, '#4e7184'),
    },
    {
      id: 'french-fry', name: 'One petrified french fry',
      lore: 'It has outlived two ambulance assignments and at least one station chief.',
      art: '<path d="M15 48q28-15 62 5l-4 9Q42 51 19 60z" fill="#b9914f" stroke="#75613d" stroke-width="2"/><path d="m17 51 8 2m7-6 7 5m7-4 7 5m8-3 9 5" stroke="#dfbb72" stroke-width="3"/><path d="m27 57 7 3m18-6 8 5" stroke="#6f6742" stroke-width="2"/>',
    },
    {
      id: 'parking-receipt', name: 'A parking receipt from 2019',
      lore: 'Four dollars to park at a hospital that no longer exists. Accounting has questions.',
      art: paper(label('PARKING', 47, 22, 8) + label('2019', 47, 32, 8) + '<path d="M29 38h36M29 44h36M29 50h36M29 56h36" stroke="#828a85" stroke-width="2"/>' + label('$4.00', 47, 66, 9)),
    },
    {
      id: 'googly-eye', name: 'A single googly eye',
      lore: 'The dashboard mascot has been staring at the wall for three weeks. Now you know why.',
      art: '<ellipse cx="48" cy="43" rx="27" ry="26" fill="#e6e4d7" stroke="#8c918b" stroke-width="3"/><circle cx="57" cy="51" r="13" fill="#1d2428"/><circle cx="53" cy="46" r="4" fill="#f5f1e8"/><path d="M30 21q18-12 35 0" fill="none" stroke="#ffffff88" stroke-width="3"/>',
    },
    {
      id: 'dead-marker', name: 'A marker with no cap and no ink',
      lore: 'Still riding along because someone keeps hoping it will work this time.',
      art: '<path d="m20 60 42-42 13 13-42 42z" fill="#353d43" stroke="#738087" stroke-width="2"/><path d="m57 23 8-8 13 13-8 8z" fill="#e2d1a0"/><path d="m16 64 10-10 10 10-10 10z" fill="#65686a"/><path d="m26 54 10 10M62 17l13 13" stroke="#a5a8a0" stroke-width="2"/>' + label('PERMANENT', 45, 47, 5, '#d4d1bd'),
    },
  );

  const trash = new Set(['coins', 'napkins', 'ekg', 'hot-sauce', 'uncrustable', 'aux', 'straw', 'pen', 'map-book', 'narcan', 'conference', 'csn-stickers', 'phone-glove', 'covid-mask', 'old-newspaper', 'zynn-container', 'french-fry', 'parking-receipt', 'googly-eye', 'dead-marker']);
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
  function noteArt(color) {
    return '<path d="M19 10h59v51L65 73H19z" fill="' + color + '"/><path d="M19 10h59v12H19z" fill="#00000010"/><path d="m65 73 1-12h12" fill="#fff6"/>' + label('CREW —', 45, 32, 8) + '<path d="m28 41 11-2 5 2 23-1M28 48h34M28 55h24" stroke="#53616a" stroke-width="1.5"/>' + label('— RUTH', 47, 65, 6);
  }
  function resolve(id, variant = {}) {
    const item = items.find(item => item.id === id);
    if (!item) return null;
    if (id !== 'callahan-note') return item;
    return { ...item, lore: notes[variant.message % notes.length] || notes[0], art: noteArt(noteColors[variant.color % noteColors.length] || noteColors[0]) };
  }
  return { items, notes, noteColors, resolve };
});
