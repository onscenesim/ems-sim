'use strict';

const { REGIONS } = require('../data/regions');
const { ordered, departureOrdered, commandClauses } = require('./command-intent');

// Fictional road network: a common outbound road with two branches. Calibrate
// each region to its existing clear-road ETA ranges and typical road speeds.
const ROAD_MPH = {
  URBAN_DENSE: 24, URBAN_SPRAWL: 36, SUBURBAN: 36, RURAL_TEMPERATE: 48,
  RURAL_REMOTE: 48, NORTHERN_URBAN: 30, TROPICAL_ISLAND: 24,
  INTERNATIONAL_DEVELOPING: 24, CALIFORNIA_Urban: 30,
};
const WEATHER_SPEED = {
  rain: .8, fog: .7, wind: .9, snow: .65, black_ice: .55, smoke: .85,
  flood: .6, blizzard: .45, tornado: .55, dust: .5,
};

function baseline(eta) {
  const match = (eta || '').match(/(\d+)(?:\s*[-–]\s*(\d+))?\s*min/i);
  return match ? (Number(match[1]) + Number(match[2] || match[1])) / 2 : null;
}

function roadNetwork(seed) {
  const region = REGIONS.find(r => r.id === seed.region);
  const speed = (ROAD_MPH[seed.region] || 36) / 60;
  const near = (baseline(region?.nearest_hospital_min) || 12) * speed;
  const far = (baseline(region?.major_hospital_min) || 24) * speed;
  const shared = Math.min(near, far) * .65;
  return {
    length: { shared, nearest: near - shared, major: far - shared },
    speed: speed * (WEATHER_SPEED[seed.weather_id] || 1),
    ground: { nearest: true, major: seed.region !== 'TROPICAL_ISLAND' },
    weather: Object.hasOwn(WEATHER_SPEED, seed.weather_id) ? seed.weather_id : null,
  };
}

const origin = () => ({ road: 'shared', miles: 0 });

function distanceTo(network, position, destination) {
  const { road, miles } = position;
  if (road === destination) return Math.max(0, network.length[road] - miles);
  const toJunction = road === 'shared' ? network.length.shared - miles : miles;
  return toJunction + network.length[destination];
}

function drive(network, position, destination, minutes) {
  const miles = Math.max(0, minutes) * network.speed;
  const remaining = distanceTo(network, position, destination);
  if (miles >= remaining - 1e-8) return { road: destination, miles: network.length[destination] };
  if (position.road === destination) return { road: destination, miles: position.miles + miles };
  const toJunction = position.road === 'shared' ? network.length.shared - position.miles : position.miles;
  if (miles >= toJunction) return { road: destination, miles: miles - toJunction };
  return { road: position.road, miles: position.miles + (position.road === 'shared' ? miles : -miles) };
}

function travelSeconds(network, position, dest) {
  return Math.max(0, Math.ceil(distanceTo(network, position, dest) / network.speed * 60 - 1e-8));
}

function legacyEta(seed, dest) {
  const region = REGIONS.find(r => r.id === seed.region);
  return baseline(dest === 'major' ? region?.major_hospital_min : region?.nearest_hospital_min) || 12;
}

function orderedDestination(seed, text) {
  const region = REGIONS.find(r => r.id === seed.region);
  const hospitals = seed.hospitals || region?.hospitals;
  const order = text.toLowerCase();
  const matches = ['nearest', 'major'].filter(key => {
    const name = hospitals?.[key]?.name?.toLowerCase();
    if (!name) return false;
    if (order.includes(name)) return true;
    // Players commonly use "Lakeview" rather than the full CAD name. Only
    // accept a distinctive whole first word; ambiguous names stay ambiguous.
    const first = name.split(/\s+/)[0];
    return first.length >= 4 && !['saint', 'mount', 'medical', 'general'].includes(first)
      && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return null;
  const near = /\b(?:nearest|closer|community|local)\s+(?:hospital|ed|er|facility)\b/i.test(text);
  const far = /\b(?:major|farther|referral)\s+(?:hospital|ed|er|facility)\b/i.test(text);
  return near === far ? null : near ? 'nearest' : 'major';
}

function correctedDestination(session, text) {
  if (!session.transportDest || session.arrivedAtHospital) return null;
  return ordered(text, /^(?:i\s+)?meant(?:\s+to\s+(?:type|say))?\b|^correction\b/i)
    ? orderedDestination(session.seed, text) : null;
}

function destinationDepartureOrdered(seed, text) {
  return departureOrdered(text) || commandClauses(text).some(clause => orderedDestination(seed, clause.text)
    && /^(?:please\s+)?(?:let'?s\s+)?(?:redirect|reroute|divert|switch|change|depart|drive|transport|head|go|leave|roll|take (?:him|her|them|the patient))\b/i.test(clause.text));
}

function hospitalReportDestination(session, text, reportMode) {
  if (/\b(?:medical control|dispatch|backup)\b/i.test(text)) return null;
  const dest = orderedDestination(session.seed, text);
  if (reportMode) return dest || session.transportDest || 'nearest';
  const contact = ordered(text, /\b(?:call|contact|radio|patch|notify)\b/i);
  const receiving = /\b(?:hospital|receiving|call ahead|report|university|uni)\b/i.test(text);
  return contact && (dest || receiving) ? dest || session.transportDest || 'nearest' : null;
}

function transportContext(session) {
  if (!session.hasLoaded && !session.transportDest) return '';
  const network = roadNetwork(session.seed);
  const position = session.transportPosition || origin();
  const at = ['nearest', 'major'].find(key => network.ground[key]
    && position.road === key && travelSeconds(network, position, key) === 0);
  const hospitals = session.seed.hospitals || REGIONS.find(r => r.id === session.seed.region)?.hospitals;
  const routes = ['nearest', 'major'].filter(key => network.ground[key]).map(key => {
    const seconds = travelSeconds(network, position, key);
    return { key, name: hospitals?.[key]?.name || key, seconds };
  });
  const location = at ? `at ${hospitals?.[at]?.name || at}` : 'on the established road network';
  const choices = routes.map(r => `${r.key} / ${r.name}: ${Math.floor(r.seconds / 60)}:${String(r.seconds % 60).padStart(2, '0')}`).join('; ');
  return `[CAD ROUTE STATE: T+${session.sceneMinute.toFixed(2)}; location=${location}; selected=${session.transportDest || 'none'}; moving=${session.moving}; arrived=${session.arrivedAtHospital}. Ground travel from this exact position (minutes:seconds): ${choices}. These times include the current road/weather conditions and any backtracking between hospitals. Use them for every ETA, comparison and reroute, including during a diversion. Hospital availability does not change distance. Do not invent a shortcut, reset to the scene, or arrive/transfer care before the drive is complete.]`;
}

function typedTransportSkip(session, text) {
  if (session.arrivedAtHospital) return null;
  const order = text.trim().toLowerCase().replace(/[.!]+$/, '');
  const explicit = /^(?:please )?(?:skip(?: ahead)?|fast[ -]forward|jump(?: ahead)?)\s+(?:to|until)\s+(.+)$/.exec(order);
  const ongoing = /^(?:please )?(?:continue(?:(?: with)? (?:current care(?: and monitoring)?|care|monitoring|acls|cpr|transport|driving))?|keep (?:going|driving|monitoring|doing (?:acls|cpr))|wait)\s+(?:until|til|till|'til)\s+(.+)$/.exec(order);
  const endpoint = (explicit || ongoing)?.[1].replace(/^(?:we|you)\s+(?:reach|get to|arrive at)\s+/, '');
  const destination = session.transportDest;
  const hospital = session.seed.hospitals?.[destination]
    || REGIONS.find(r => r.id === session.seed.region)?.hospitals?.[destination];
  const name = hospital?.name?.toLowerCase();
  const generic = /^(?:(?:the )?(?:hospital|er|ed|emergency department|ambulance bay|(?:hospital|ed) bay|arrival|hospital arrival|end of transport)|(?:we|you) arrive)$/;
  if (!endpoint || (!generic.test(endpoint) && !(name && (endpoint === name || endpoint === name.split(' ')[0])))) return null;
  if (destination) return 'to_arrival';
  return explicit ? 'to_hospital' : null;
}

// Continuation is an observation interval, with a chance to stop for a clinical
// event. It must never swallow a bundled treatment, report, question or stop.
function monitoringTransport(session, text) {
  if (!session.moving || session.arrivedAtHospital || !session.transportPosition
      || !session.transportDest || (session.incident && !session.incident.resolved)) return false;
  const order = text.trim().toLowerCase().replace(/[.!]+$/, '').replace(/\s+/g, ' ');
  const match = /^(?:please )?(?:continue(?: (?:transport(?: and monitoring)?|monitoring(?: and transport)?|current care(?: and monitoring)?))?|keep (?:going|driving|monitoring))(?: (until|unless) (.+))?$/.exec(order);
  if (!match) return false;
  if (!match[1]) return true;
  // These endpoints explicitly return control for something that needs a
  // decision; they are not instructions to ignore a changing patient.
  if (/^(?:something (?:significant )?happens|(?:the )?need for intervention arises|(?:an? )?(?:intervention|significant change) (?:is needed|occurs))$/.test(match[2])) return true;
  const endpoint = match[2].replace(/ or something (?:significant )?happens$/, '');
  return typedTransportSkip(session, 'continue monitoring until ' + endpoint) === 'to_arrival';
}

function hospitalArrival(seed, text) {
  const hospitals = seed.hospitals || REGIONS.find(r => r.id === seed.region)?.hospitals;
  return text.replace(/\[[^\]]*\]/g, '').split(/(?<=[.!?])\s+|\n/).some(sentence => {
    if (/\b(?:will|would|could|should|not|never|haven't|haven’t|before|once|when|if)\b/i.test(sentence)) return false;
    const place = /\b(?:hospital|emergency department|(?:ambulance|ed|hospital) bay|bay doors?|hospital bed|resuscitation bay)\b/i.test(sentence)
      || Object.values(hospitals || {}).some(h => sentence.toLowerCase().includes(h.name.toLowerCase()));
    return place && (
      (/\b(?:ambulance|rig|unit|medic\s*\d+|crew|we|you)\b/i.test(sentence)
        && /\b(?:arriv(?:e|es|ed)|reach(?:es|ed)?|pull(?:s|ed)? (?:in|into|up)|(?:final )?turn into|(?:is|are|comes? to a) (?:now )?(?:halt|stop)|we(?:'re| are| have arrived|’re))\b/i.test(sentence))
      || /\b(?:stretcher|patient)\b.{0,65}\b(?:wheel(?:s|ed)?|transferred?|moved?)\b/i.test(sentence));
  });
}

function significantTransportChange(before, after, text) {
  if (/\[TRANSPORT_EVENT\]/i.test(text)) return true;
  const value = (v) => v && typeof v === 'object' ? v.value : v;
  const changed = (key, amount, direction) => {
    const a = Number(value(before?.[key])), b = Number(value(after?.[key]));
    return Number.isFinite(a) && Number.isFinite(b) && direction * (b - a) >= amount;
  };
  // Fallback for a model that narrates deterioration but misses the checkpoint
  // tag. Never silently carry on to the ED past these observed changes.
  return changed('GCS', 2, -1) || changed('HR', 20, 1) || changed('HR', 25, -1)
    || changed('RR', 10, 1) || changed('RR', 8, -1)
    || changed('TrueSpO2', 5, -1) || changed('SpO2', 5, -1)
    || /\b(?:becomes?|becoming|suddenly|now)\s+(?:\w+\s+){0,3}(?:unresponsive|unconscious|apneic|pulseless|confused|restless|seiz(?:ing|es)|vomit(?:s|ing))\b/i.test(text);
}

function transportStatus(session) {
  const dest = session.transportDest;
  const incident = session.incident;
  if (session.closed || (!dest && !(incident?.id === 'er_divert' && !incident.resolved))) return null;
  const blocked = incident && !incident.resolved;
  const network = roadNetwork(session.seed);
  const phase = blocked && incident.id === 'er_divert' ? 'diverted'
    : blocked && incident.bedAvailableMinute ? 'waiting'
    : session.arrivedAtHospital ? 'arrived'
    : blocked || !session.moving ? 'paused'
    : !network.ground[dest] ? 'unavailable' : 'en_route';
  const active = phase === 'en_route' || (phase === 'paused' && !blocked);
  const position = session.transportPosition;
  const hasEstimate = active && position && network.ground[dest];
  const hospital = session.seed.hospitals?.[dest || incident?.divertedDest]
    || REGIONS.find(r => r.id === session.seed.region)?.hospitals?.[dest || incident?.divertedDest];
  return {
    phase, destination: hospital?.name || 'Receiving hospital',
    distance_mi: hasEstimate ? distanceTo(network, position, dest) : null,
    eta_seconds: hasEstimate ? travelSeconds(network, position, dest) : null,
    weather: hasEstimate ? network.weather : null,
  };
}

module.exports = { roadNetwork, origin, drive, travelSeconds, legacyEta, orderedDestination, correctedDestination,
  destinationDepartureOrdered, hospitalReportDestination, transportContext, typedTransportSkip,
  monitoringTransport, hospitalArrival, significantTransportChange, transportStatus };
