'use strict';

const { REGIONS } = require('../data/regions');

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
  const matches = ['nearest', 'major'].filter(key => hospitals?.[key]?.name
    && order.includes(hospitals[key].name.toLowerCase()));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return null;
  const near = /\b(?:nearest|closer|community|local)\s+(?:hospital|ed|er|facility)\b/i.test(text);
  const far = /\b(?:major|farther|referral)\s+(?:hospital|ed|er|facility)\b/i.test(text);
  return near === far ? null : near ? 'nearest' : 'major';
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

module.exports = { roadNetwork, origin, drive, travelSeconds, legacyEta, orderedDestination, transportStatus };
