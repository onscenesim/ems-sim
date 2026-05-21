'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Minecraft-style splash text for the home screen.
// To add more, just append strings to this array. One is chosen at random
// on every page load.
// ─────────────────────────────────────────────────────────────────────────────
const SPLASHES = [
  // EMS in-jokes
  'Now with vitals!',
  'Did you check the BGL?',
  'Is it still ABC? Or is it CAB now? XABC?',
  'BSI Scene safe!',
  'Frank Pierce is Literally me ',
  'Load and go!',
  'Stay and play!',
  'Autoloader? I hardly know-her!',
  'Move to the right!',
  'All for 19 an hour!',
  'BLS = Basic Lifting Service',
  'He\'s dead, Jim.',
  'Does this qualify me for a first responder discount?',
  'Roll for initiative!',
  'Bodies R Hauled Off 1992',
  'Roc Rocks, Sux Sucks!',
  'Also try DialedMedics.com!',
  'Medicare Fraud!',
  'C-spine terrorists!',
  'RIP Freedom House 1967-1975',
  'If a tree falls in a forest and you didn\'t document it...',
  'You should watch Amal Mattu!',
  'Crack the Chest, get Crucified -John Hinds',
  'The Q word!',
  'Quiet Quiet Quiet Quiet-!',
  'Welcome to Costco, I love you',
  'TKO',
  'Saint LUCAS is watching!',
  'I don\'t always push dose, but when I do, I push dose epis!',
  'Absolute cinema!',
  'Lifepak 35 sucks!',
  'Have you ever eaten the glucose gel?',
  'OMI > STEMI!',
  'The Debrief is still busted!>:(',
  'Turn off that F***ing metronome!',
  'I\'ve fallen and I can\'t get up!',
  'Canceled on scene!',
  'I am completely prepared to tell my driver to disembark and I will drive this thing in the Inner Harbor!',
  'I\'m tired, boss.',
  'Get your evidence off my truck!',
  'Hands on defibrillation? Its more likely than you think!',
  'CLEAR!',
];

/**
 * Pick a random splash. Safe to call before SPLASHES is populated — returns
 * an empty string if the list is empty.
 */
function getRandomSplash() {
  if (!Array.isArray(SPLASHES) || SPLASHES.length === 0) return '';
  return SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
}
