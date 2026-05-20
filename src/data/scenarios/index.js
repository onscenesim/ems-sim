'use strict';

const { CARDIAC }    = require('./cardiac');
const { PULMONARY }  = require('./pulmonary');
const { TRAUMA }     = require('./trauma');
const { NEURO }      = require('./neuro');
const { MEDICAL }    = require('./medical');
const { TOXICOLOGY } = require('./toxicology');
const { BEHAVIORAL } = require('./behavioral');
const { OB }         = require('./ob');
const { PEDIATRIC }  = require('./pediatric');
const { ARREST }     = require('./arrest');
const { DOA }        = require('./doa');
const { CURVEBALLS } = require('./curveballs');

const SCENARIO_POOLS = {
  cardiac:     CARDIAC,
  respiratory: PULMONARY,
  trauma:      TRAUMA,
  neuro:       NEURO,
  medical:     MEDICAL,
  toxicology:  TOXICOLOGY,
  behavioral:  BEHAVIORAL,
  ob:          OB,
  pediatric:   PEDIATRIC,
  arrest:      ARREST,
  doa:         DOA,
  curveballs:  CURVEBALLS,
};

module.exports = { SCENARIO_POOLS };
