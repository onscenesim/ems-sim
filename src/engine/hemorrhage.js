'use strict';

const { patientFor } = require('./patient-records');

// Wound state is owned by the server. The narrator can reveal a wound, but
// cannot grant hemostasis, reroll maintenance, or transfer control to a patient.
const METHODS = ['pressure', 'packing', 'dressing', 'tourniquet'];
const SITE_RE = /\b(?:(left|right)\s+)?(axilla(?:ry)?|armpit|scalp|head|scrot(?:um|al)|genital(?:s|ia)?|perine(?:um|al)|groin|neck|forearm|upper arm|arm|thigh|lower leg|leg|chest|flank|back)\b/gi;
function sitesIn(text) {
  return [...String(text).matchAll(SITE_RE)].map(m => {
    let site = m[2].toLowerCase();
    if (/axill|armpit/.test(site)) site = 'axilla';
    if (/head|scalp/.test(site)) site = 'scalp';
    if (/scrot|genital|perine/.test(site)) site = 'genital/perineal';
    return `${m[1] ? m[1].toLowerCase() + ' ' : ''}${site}`;
  }).filter((s,i,a) => a.indexOf(s) === i);
}
const NEGATIVE = /\b(?:no|not|never|do not|don'?t|not going to|avoid|without|if|unless|consider|might|would|could|already|previously|we did|we applied|we packed|was applied|was packed)\b/i;
const CONTEXT = /\b(?:wound|bleed\w*|hemorrhag\w*|blood|cut|laceration|dressing|gauze|towel|bandage|pressure|tourniquet|\btq\b|\bcat\b)\b/i;
const EXTERNAL_SOURCE = /\b(?:wound|laceration|cut|puncture|fistula|avulsion|amputation|stump|abrasion)\b/i;
const MAJOR_BLEEDING = /\b(?:uncontrolled|profuse|severe|spurting|massive|significant|persistent)\b[^.!?;]{0,40}\b(?:bleed\w*|hemorrhag\w*|blood)\b/i;
const NEXT_CARE_ACTION = /\b(?:and|then|also|but)\s+(?=(?:(?:I|we|my partner|partner)\s+)?(?:(?:apply|pack|secure|place|check|recheck|maintain|keep|release|tighten|put|press|hold|start|give|push|insert|perform|suction|wrap|warm|cover|protect|change|obtain|get|massage|elevate|offer|ask|speak|support|dry|remove|increase|decrease|use|hang|assess|reassess|inspect|examine|monitor|count|ventilate|intubate)(?:s|ing)?|applies|giving|placing|securing|pressing|wrapping|changing|removing|taking over|take over|manually)\b)/i;
function nonWoundCare(source) {
  // "Pressure", "packing", "blood" and "towel" also belong to airway,
  // obstetric, thermal and routine access care. Keep these out of both the
  // deterministic parser AND the semantic fallback, including with active wounds.
  if (/\b(?:cricoid|sellick|suprapubic|fundal|fundus|uterine|uterus|carotid sinus|prolapsed cord|cord prolapse|presenting (?:fetal )?part|positive[ -]pressure|cpap|peep|pressure bag|blood pressure)\b/i.test(source)) return true;
  if (/\b(?:we|I|they|partner)\s+(?:(?:already|previously)\s+)?(?:applied|packed|wrapped|secured|held)\b|\b(?:was|were|has been|had been)\s+(?:applied|packed|wrapped|secured)\b/i.test(source)) return true;
  if (/\b(?:nose|nares|nostrils?|nasal|epistaxis)\b/i.test(source)) return true;
  if (/\b(?:cat scan|ct scan|umbilical|cord|eyes?|contact lens\w*|tracheostom\w*)\b/i.test(source)) return true;
  if (/\b(?:burns?|scald\w*|chemical|rash|pressure ulcer|bedsore|sprained? ankle|surgical site|incision site)\b/i.test(source)
    && !/\b(?:blood|bleed\w*|hemorrhag\w*)\b/i.test(source)) return true;
  if (!EXTERNAL_SOURCE.test(source)) {
    if (/\b(?:newborn|neonate|baby|infant|warm|cold|cool|blanket|thermal|suction\w*|chin|saliva|vomit\w*)\b/i.test(source)) return true;
    if (/\b(?:iv|injection|venipuncture|cannula|dialysis catheter|central line|catheter site)\b/i.test(source) && !MAJOR_BLEEDING.test(source)) return true;
    if (/\b(?:draw(?:s|ing)? blood|blood draw|phlebotomy)\b/i.test(source)) return true;
  }
  return false;
}
function parseActions(text) {
  const actions = [];
  // A new action clause may change the patient, method or anatomical target.
  const clauses = String(text).split(/[;.!?\n]+/).flatMap(sentence =>
    /\b(?:if|unless|consider|might|would|could)\b/i.test(sentence) ? []
      : sentence.split(NEXT_CARE_ACTION));
  for (const source of clauses) {
    const clause = source.trim();
    if (!clause || NEGATIVE.test(clause) || nonWoundCare(clause) || /^(?:ask|tell me|discuss|explain)\b/i.test(clause)) continue;
    if (/\b(?:occlusive|chest seal|nasal|epistaxis|red blood cells|blood products?|blood pressure|scalp (?:iv|vein)|intravenous|io access)\b/i.test(clause)
      && !/\b(?:bleeding|wound|laceration|direct pressure)\b/i.test(clause)) continue;
    const exam = /\b(?:check|recheck|inspect|assess|reassess|look|is|are|does|has)\b/i.test(clause);
    const active = /\b(?:appl(?:y|ying)|press(?:ing)?|push(?:ing)?|pack(?:ing)?|stuff(?:ing)?|shove|put(?:ting)?|hold(?:ing)?|maintain(?:ing)?|keep|secure|wrap|dress|place|tighten|adjust|reinforce|redo|retry|repack|take over|release|remove|stop|let go|do|perform)\b/i.test(clause);
    let method = /\b(?:tourniquet|tq|cat)\b/i.test(clause) ? 'tourniquet'
      : /\b(?:pack(?:ing)?|repack|stuff(?:ing)?|shove)\b/i.test(clause) ? 'packing'
      : /\b(?:(?:direct|manual|sustained) pressure|press(?:ing)?|push(?:ing)?|hold(?:ing)?|maintain|keep)\b/i.test(clause) ? 'pressure'
      : /\b(?:pressure (?:dressing|bandage)|secure|wrap|bandag\w*|dress(?:ing)?s?)\b/i.test(clause) ? 'dressing'
      : /\b(?:pressure|press|push|hold|holding|hand|towel|compress)\b/i.test(clause) ? 'pressure' : null;
    const generic = /\b(?:bleeding|hemorrhage) control|control (?:the )?bleeding|stop (?:the )?bleeding/i.test(clause);
    if (!CONTEXT.test(clause) && !generic) continue;
    // Supplies alone do not establish hemorrhage intent. A towel, dressing or
    // bandage may be for comfort, padding, a sprain or routine skin care.
    const externalIntent = generic || EXTERNAL_SOURCE.test(clause)
      || /\b(?:bleed\w*|hemorrhag\w*|hemostatic|quikclot|celox|combat gauze|tourniquet|tq|cat|(?:direct|manual|sustained) pressure|pressure (?:dressing|bandage))\b/i.test(clause)
      || sitesIn(clause).length && /\b(?:pack(?:ing)?|repack)\b/i.test(clause)
      || /\b(?:take over|hand off|handoff)\s+(?:the\s+)?pressure\b/i.test(clause)
      || /^(?:(?:I|we|partner)\s*[, ]\s*)?(?:apply|hold|maintain|keep holding|release|take over)\s+(?:the\s+)?pressure$/i.test(clause);
    if (!externalIntent) continue;
    let kind = exam && !active ? 'assess'
      : /\b(?:release|remove|stop holding|let go|lift (?:my|the|your) hand)\b/i.test(clause) ? 'release'
      : /\b(?:maintain|keep|continue|still holding)\b/i.test(clause) ? 'maintain'
      : active || generic ? 'treat' : null;
    // "Check whether the pressure dressing is dry" is an exam, not treatment.
    if (exam && !/\b(?:apply|pack|repack|tighten|put|press|secure|wrap|retry|redo|take over)\b/i.test(clause)) kind = 'assess';
    if (kind) actions.push({ kind, method, sites: sitesIn(clause), source: clause });
  }
  return actions;
}

function initialWounds(seed) {
  return (seed.hemorrhage_wounds || []).map(w => ({ ...structuredClone(w), discovered: false,
    status: 'uncontrolled', method: null, holder: null, attempts: 0 }));
}
function siteMatches(a,b) {
  return a === b || a.replace(/^(left|right) /,'') === b.replace(/^(left|right) /,'')
    && !(/^(left|right) /.test(a) && /^(left|right) /.test(b));
}
function holderFor(source, seed) {
  const firstName = seed.crew_partner?.toLowerCase().split(' ')[0];
  if (firstName && source.toLowerCase().startsWith(firstName)) return 'partner';
  if (/\b(?:I|me)\b/i.test(source) || /^take over\b/i.test(source)) return 'provider';
  if (/\bpartner\b/i.test(source) || seed.crew_partner && source.toLowerCase().includes(seed.crew_partner.toLowerCase().split(' ')[0])) return 'partner';
  if (/\bcaptain\b/i.test(source)) return 'captain';
  return null;
}
function actionKey(wound, method) { return `hemorrhage|${wound.id}|${method}`; }

function planActions(wounds, actions, { focus, records, seed, deny = [], crewStatus = {}, moving = false }) {
  const plan = [], notes = [];
  for (const action of actions) {
    const patientId = action.patientId || patientFor(action.source, focus, records);
    const candidates = wounds.filter(w => w.discovered && w.patientId === patientId
      && (!action.woundId || action.woundId === w.id)
      && (!action.sites.length || action.sites.some(site => siteMatches(site,w.site))));
    if (!candidates.length || (!action.sites.length && candidates.length !== 1)) {
      notes.push('Ask which revealed wound/patient and method the provider intends; no treatment was performed and no hemorrhage roll occurred. Do not reveal concealed wounds.');
      continue;
    }
    for (const wound of candidates) {
      let method = action.method || wound.method;
      if (action.kind === 'assess') { plan.push({ wound, action, kind:'assess' }); continue; }
      if (action.kind === 'release') { plan.push({ wound, action, kind:'release' }); continue; }
      if (!method) { notes.push(`Ask what method is intended for ${wound.site}. No treatment occurred; do not choose a method on the provider's behalf.`); continue; }
      // Continued pressure over packing maintains that application. It is not a
      // change from packing to a fresh direct-pressure attempt.
      if (action.kind === 'maintain' && method === 'pressure' && wound.method === 'packing') method = 'packing';
      if (action.kind === 'maintain' && !wound.method) method = action.method || 'pressure';
      const key = actionKey(wound,method);
      if (deny.includes(key) || deny.some(k => k.startsWith(`${method === 'tourniquet' ? 'tourniquet' : 'bleeding_control'}|`))) {
        notes.push(`The provider declined the ${method} action for ${wound.site}; no treatment, no roll, and no improvement.`); continue;
      }
      const holder = holderFor(action.source,seed);
      if (holder === 'captain' && !['on_scene','in_back'].includes(crewStatus.captain)
        || holder === 'partner' && moving && crewStatus.partner === 'driving') {
        notes.push(`The ${holder} is unavailable for hands-on wound care. No attempt or roll occurred; do not invent an available rescuer.`); continue;
      }
      const maintained = wound.method && method === wound.method
        && (!holder || !wound.holder || holder === wound.holder)
        && (action.kind === 'maintain' || wound.status.startsWith('controlled')
          && !/\b(?:retry|redo|adjust|tighten|repack|take over)\b/i.test(action.source));
      // A CAT cannot control junctional, scalp or genital bleeding, even on 20.
      if (method === 'tourniquet' && !/\b(?:arm|forearm|thigh|leg)\b/.test(wound.site)) {
        notes.push(`A standard limb tourniquet cannot be applied to ${wound.site}. No attempt/roll occurred; explain the anatomical limitation without choosing another treatment.`); continue;
      }
      if (method === 'packing' && /\b(?:chest|back)\b/.test(wound.site)) {
        notes.push(`Packing a possible torso-cavity wound at ${wound.site} is not authorized. Clarify and assess before an attempt; no packing or roll occurred.`); continue;
      }
      if (wound.allowedMethods && !wound.allowedMethods.includes(method)) {
        notes.push(`The proposed ${method} is unsuitable for the established ${wound.site} wound. No attempt or roll occurred; do not substitute a treatment.`); continue;
      }
      const packingHeld = method === 'pressure' && /\b(?:hold|holding|maintain|keep)\b/i.test(action.source)
        && plan.some(p => p.wound.id === wound.id && p.method === 'packing');
      const kind = maintained || packingHeld ? 'maintain' : 'attempt';
      const busy = wounds.find(w => w.discovered && w.id !== wound.id
        && w.patientId !== wound.patientId && w.holder === (holder || 'provider'));
      if (kind === 'attempt' && busy) {
        notes.push(`${holder || 'provider'} is maintaining pressure on ${busy.patientId}'s ${busy.site}. They cannot simultaneously treat another patient. Ask for an explicit release or qualified handoff before the new attempt. Do not silently release the existing pressure, perform the new treatment, or roll it.`);
        continue;
      }
      if (plan.some(p => p.wound.id === wound.id && p.method === method && p.kind === kind)) continue;
      plan.push({ wound, action, kind, method, key, holder:holder || 'provider' });
    }
  }
  return { plan, notes };
}

function resolvePlan(plan, roll, context, difficulty, minute) {
  const rolls = [], events = [];
  for (const p of plan) {
    const w = p.wound;
    const before = { status:w.status, holder:w.holder, method:w.method };
    if (p.kind === 'attempt') {
      const r = { ...roll(p.method === 'tourniquet' ? 'tourniquet' : 'bleeding_control',
        { ...context, junctional:!!w.junctional }, difficulty), patient:w.patientId, target:w.site,
        wound_id:w.id, hemorrhage_method:p.method, hemorrhage_managed:true };
      rolls.push(r); w.attempts++; w.lastAttemptMinute = minute;
      if (r.outcome === 'SUCCESS' || r.outcome === 'MARGINAL') {
        w.treatments = [...new Set([...(w.treatments || []),...(w.method ? [w.method] : []),p.method])];
        w.method = p.method;
        w.status = r.outcome === 'MARGINAL' ? 'partially_controlled'
          : ['tourniquet','dressing'].includes(p.method) ? 'controlled_secured' : 'controlled_pressure';
        w.holder = w.status === 'controlled_secured' ? null : p.holder;
        if (p.method === 'dressing' && r.outcome === 'MARGINAL' && before.status.startsWith('controlled') && before.holder) {
          Object.assign(w,before);
        }
      } else if (w.status === 'uncontrolled') {
        w.status = 'uncontrolled'; w.method = p.method;
        w.holder = ['pressure','packing'].includes(p.method) ? p.holder : null;
      }
      // Failure securing/handing off an already controlled wound leaves the
      // prior pressure in place. A separate release/crew departure can remove it.
    } else if (p.kind === 'release' && w.holder) {
      w.holder = null; w.status = 'uncontrolled';
    }
    events.push({ woundId:w.id, patientId:w.patientId, site:w.site, action:p.kind,
      method:p.method || w.method, before, after:{status:w.status,holder:w.holder,method:w.method} });
  }
  return {rolls,events};
}

// Older calls/snapshots may reveal their first wound during an already rolled
// application. Attach that existing result; never roll it a second time or
// let one unnamed result control several newly discovered wounds.
function adoptExistingRolls(wounds, actions, rolls, options, minute) {
  const {plan} = planActions(wounds,actions,options);
  const consumed = new Set(), events = [];
  for (const p of plan.filter(p => p.kind === 'attempt')) {
    const id = p.method === 'tourniquet' ? 'tourniquet' : 'bleeding_control';
    const candidates = rolls.filter(r => r.procedure_id === id && !r.no_roll && !consumed.has(r)
      && (!r.target || siteMatches(r.target,p.wound.site)));
    if (candidates.length !== 1 || !candidates[0].target && plan.filter(x => x.kind === 'attempt').length !== 1) continue;
    const r = candidates[0]; consumed.add(r);
    const result = resolvePlan([p],()=>r,{},'NORMAL',minute);
    Object.assign(r,result.rolls[0]);events.push(...result.events);
  }
  return events;
}

// Only observations are accepted from the narrator. Exact quoted evidence must
// occur in the scene prose; state and treatment fields are never accepted.
function discoverWounds(wounds, raw, seed) {
  let cleaned = raw;
  for (const match of raw.matchAll(/\[WOUND_FOUND:\s*(\{[^\n]*?\})\s*\]/g)) {
    cleaned = cleaned.replace(match[0], '');
    try {
      const o = JSON.parse(match[1]);
      const prose = raw.replace(/\[WOUND_FOUND:[^\n]*\]/g,'');
      if (!/^patient_[1-9]\d*$/.test(o.patientId) || typeof o.evidence !== 'string'
        || o.evidence.length < 12 || !prose.includes(o.evidence) || !EXTERNAL_SOURCE.test(o.evidence)
        || !/\b(?:blood|bleed\w*|hemorrhag\w*)\b/i.test(o.evidence)) continue;
      const site = sitesIn(o.site || '')[0];
      if (!site || !sitesIn(o.evidence).some(s => siteMatches(s,site))
        || /\b(?:no|not|without|denies|historical|previous)\b/i.test(o.evidence)) continue;
      let wound = wounds.find(w => w.patientId === o.patientId && siteMatches(site,w.site));
      if (!wound && !seed.hemorrhage_wounds?.length) {
        wound = {id:`${o.patientId}-${site.replaceAll(' ','-')}`,patientId:o.patientId,site,
          junctional:/axilla|groin|neck/.test(site),severity:'unspecified',status:'uncontrolled',method:null,holder:null,attempts:0};
        wounds.push(wound);
      }
      if (wound) wound.discovered = true;
    } catch (_) { /* malformed observation cannot change the ledger */ }
  }
  return cleaned;
}

function pressureInterruptions(wounds, partnerDriving) {
  const events = [];
  if (partnerDriving) for (const w of wounds) {
    if (w.discovered && w.holder === 'partner') {
      w.holder = null; w.status = 'uncontrolled';
      events.push({woundId:w.id,patientId:w.patientId,site:w.site,action:'pressure_interrupted',reason:'partner now driving',after:{status:w.status,holder:null}});
    }
  }
  return events;
}
function woundContext(wounds, notes = [], events = []) {
  if (!wounds.length && !notes.length) return '';
  return '\n\n[HEMORRHAGE STATE — SERVER AUTHORITATIVE, never echo this block: '
    + JSON.stringify(wounds.map(w => ({id:w.id,patientId:w.patientId,site:w.site,discovered:w.discovered,status:w.status,method:w.method,treatments:w.treatments || [],holder:w.holder})))
    + '\nThis turn: '+JSON.stringify(events)+'\n'+notes.join('\n')
    + '\nOnly injected wound attempts can establish or improve bleeding control. Honor each attempt outcome and retained prior pressure on failed adjustments. Maintenance and reassessment do not reroll or improve control. Uncontrolled/partial wounds keep bleeding despite silence, euphemisms or reports. Controlled wounds remain controlled without new arbitrary failures; routine movement/reassessment cannot revoke success. Manual pressure needs its recorded holder; a driving crew member cannot hold pressure. Changing focus never implicitly releases pressure or invents a replacement holder. A busy holder needs an explicit release or qualified handoff before treating a different patient. Do not restore lost blood volume or reverse shock just because external bleeding stops. Describe observable findings and elapsed time, not ledger labels. Never reveal an undiscovered wound until an appropriate exam exposes it. Do not invent treatment or treat a clarification/denial as an order.]';
}
function needsInterpretation(text, actions, wounds) {
  return wounds.some(w => w.discovered) && !actions.length && CONTEXT.test(text)
    && /\b(?:wound|bleed\w*|hemorrhag\w*|cut|laceration|fistula|gauze|bandage|tourniquet|tq|(?:direct|manual|sustained) pressure)\b/i.test(text)
    && !/^\s*(?:ask|tell me|discuss|explain|what|how|why|is|are|does|check|inspect|assess|reassess|recheck)\b/i.test(text)
    && !nonWoundCare(text) && !NEGATIVE.test(text) && !/\b(?:gave|applied|packed|wrapped|patient says|patient said|we did|history of)\b/i.test(text);
}
function validateInterpretation(input, text, wounds) {
  if (!Array.isArray(input)) return [];
  return input.slice(0,8).flatMap(a => {
    if (!['treat','maintain','assess','release'].includes(a.kind)
      || a.method !== null && !METHODS.includes(a.method)
      || typeof a.source !== 'string' || a.source.length < 4 || !text.includes(a.source)
      || NEGATIVE.test(a.source)) return [];
    const w = wounds.find(w => w.discovered && w.id === a.woundId);
    if (!w) return [];
    return [{kind:a.kind,method:a.method,source:a.source,woundId:w.id,patientId:w.patientId,sites:[w.site]}];
  });
}
function narrationIssues(raw, wounds) {
  const prose = String(raw).replace(/\[[^\]]*\]/g,'');
  const discovered = wounds.filter(w => w.discovered);
  const issues = [];
  for (const w of discovered) {
    const local = prose.split(/[.!?\n]+/).filter(sentence => discovered.length === 1 && !sitesIn(sentence).length
      || sitesIn(sentence).some(site => siteMatches(site,w.site))).join('. ');
    const stopped = /\b(?:bleeding (?:stops|halts|ceases|is controlled|has stopped)|bleeding (?:has been|is) arrested|no (?:fresh|active|new|further) (?:bleeding|blood|seepage)|(?:halts?|arrests?) (?:the )?(?:active )?(?:bleeding|seep))\b/i.test(local);
    const resumed = /\b(?:active bleeding (?:resumes|continues)|bleeding (?:resumes|restarts)|blood (?:pours|streams|wells) (?:freely|rapidly)|pressure (?:is|having been|has been|was) released)\b/i.test(local);
    if (['uncontrolled','partially_controlled'].includes(w.status) && stopped) issues.push(`${w.id}: narration grants full control despite server state ${w.status}.`);
    if (w.status.startsWith('controlled') && resumed) issues.push(`${w.id}: narration revokes server-controlled hemostasis or releases its holder without an authorized event.`);
  }
  return issues;
}
const DISCOVERY_RULE = '\nHEMORRHAGE OBSERVATIONS: When an exam actually reveals an external bleeding wound in your narration, emit [WOUND_FOUND: {"patientId":"patient_1","site":"left axilla","evidence":"exact quotation from this reply describing the visible wound"}]. Use the correct stable patient ID and anatomical site. Never emit for a concealed/unexamined wound, internal bleeding, historical bleeding, or a negative exam. This tag only reports discovery; you cannot set bleeding-control state. An unrecognized possible treatment order without an injected hemorrhage attempt must be clarified, never granted free success. Assessments and continued existing care do not constitute new treatment attempts.';

module.exports = { METHODS, parseActions, initialWounds, planActions, resolvePlan, discoverWounds,
  pressureInterruptions, woundContext, DISCOVERY_RULE, actionKey, sitesIn, needsInterpretation, validateInterpretation, narrationIssues, adoptExistingRolls, nonWoundCare };
