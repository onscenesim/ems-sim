'use strict';

const AGE_GROUPS = {
  cardiac:    ['young_adult', 'middle_aged', 'elderly'],
  pulmonary:  ['young_adult', 'middle_aged', 'elderly'],
  trauma:     ['pediatric', 'young_adult', 'middle_aged', 'elderly'],
  neuro:      ['young_adult', 'middle_aged', 'elderly'],
  medical:    ['young_adult', 'middle_aged', 'elderly'],
  toxicology: ['pediatric', 'young_adult', 'middle_aged', 'elderly'],
  behavioral: ['young_adult', 'middle_aged'],
  ob:         ['young_adult', 'middle_aged'],
  pediatric:  ['pediatric'],
  doa:        ['pediatric', 'young_adult', 'middle_aged', 'elderly'],
  arrest:     ['young_adult', 'middle_aged', 'elderly'],
  curveballs: ['young_adult', 'middle_aged', 'elderly'],
};

module.exports = { AGE_GROUPS };
