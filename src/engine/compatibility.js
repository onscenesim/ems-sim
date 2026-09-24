'use strict';

const { WEATHER } = require('../data/modifiers');
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
// These are simulator setting rules, not claims about every place in a region.
const COLD_REGIONS = ['URBAN_DENSE', 'SUBURBAN', 'RURAL_TEMPERATE', 'RURAL_REMOTE', 'NORTHERN_URBAN'];
const WEATHER_RULES = {
  snow: { regions: COLD_REGIONS, seasons: ['winter', 'spring'] },
  cold: { regions: COLD_REGIONS, seasons: ['autumn', 'winter', 'spring'] },
  black_ice: { regions: COLD_REGIONS, seasons: ['autumn', 'winter', 'spring'] },
  blizzard: { regions: COLD_REGIONS, seasons: ['winter', 'spring'] },
  heat: { seasons: ['summer'] },
  humid_heat: { seasons: ['summer'] },
  smoke: { regions: ['URBAN_SPRAWL', 'RURAL_REMOTE', 'NORTHERN_URBAN', 'CALIFORNIA_Urban'], seasons: ['spring', 'summer', 'autumn'] },
  dust: { regions: ['URBAN_SPRAWL', 'INTERNATIONAL_DEVELOPING'] },
  tornado: { regions: ['URBAN_DENSE', 'URBAN_SPRAWL', 'SUBURBAN', 'RURAL_TEMPERATE'], seasons: ['spring', 'summer', 'autumn'] },
};
function allows(rule = {}, region, season, weather) {
  return (!rule.regions || rule.regions.includes(region)) &&
    (!rule.seasons || rule.seasons.includes(season)) &&
    (weather === undefined || !rule.weather || rule.weather.includes(weather));
}
function compatibleWeather(entry, region, season) {
  return [{ id: 'clear', text: null, weight: 6 }, ...WEATHER].filter(w =>
    allows(WEATHER_RULES[w.id], region, season) && allows(entry.compatibility, region, season, w.id));
}
function caseCompatible(entry, region, season) {
  return allows(entry.compatibility, region, season) && compatibleWeather(entry, region, season).length > 0;
}
function validateCombination(entry, { region, season, weather_id }) {
  return SEASONS.includes(season) && caseCompatible(entry, region, season) &&
    compatibleWeather(entry, region, season).some(w => w.id === weather_id);
}
module.exports = { SEASONS, compatibleWeather, caseCompatible, validateCombination };
