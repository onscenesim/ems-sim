#!/usr/bin/env node
'use strict';

require('dotenv').config();
const readline = require('readline');
const { rollScenario } = require('../src/engine/roller');
const { Session } = require('../src/engine/session');

// ---- CLI args ----
const args = process.argv.slice(2);
const difficulty = (['EASY', 'NORMAL', 'HARD'].find(d => args.includes(d))) || 'NORMAL';
const provider   = args.includes('BLS') ? 'BLS' : 'ALS';
const region     = args.find(a => a.startsWith('--region='))?.split('=')[1] || 'SUBURBAN';

// ---- Readline setup ----
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

function prompt(text) {
  return new Promise(resolve => rl.question(text, resolve));
}

function print(text) {
  process.stdout.write('\n' + text + '\n');
}

function hr() {
  process.stdout.write('\n' + '─'.repeat(72) + '\n');
}

// ---- Main ----
async function main() {
  print(`EMS SIMULATION  |  ${difficulty} | ${provider} | ${region}`);
  hr();

  const history = {
    categories: [], presentations: [], crew: [],
    doa_positions: [], arrest_positions: [], total_count: 0,
  };

  const seed = rollScenario({
    difficulty,
    provider_level: provider,
    region_id: region,
    user_id: 'local',
    history,
  });

  print(`Scenario rolled: ${seed.category.toUpperCase()} — ${seed.scenario_id}`);
  print('Connecting to simulation engine...\n');

  const session = new Session(seed);

  // Kick off with a blank first message so Claude delivers the dispatch
  rl.pause();
  let result = await session.send('begin');
  rl.resume();
  hr();
  print(result.reply);
  hr();

  // ---- Conversation loop ----
  while (!session.closed) {
    let input;
    try {
      input = await prompt('\nYou: ');
    } catch {
      // stdin closed (Ctrl-D)
      break;
    }

    input = input.trim();
    if (!input) continue;

    if (input.toLowerCase() === '/quit') {
      session.close();
      print('Scenario ended.');
      break;
    }

    if (input.toLowerCase() === '/seed') {
      print(session.systemPrompt);
      continue;
    }

    if (input.toLowerCase() === '/events') {
      print(JSON.stringify(session.seed.events, null, 2));
      continue;
    }

    process.stdout.write('\n[...]\n');
    rl.pause();

    try {
      result = await session.send(input);
    } catch (err) {
      rl.resume();
      print(`[API error: ${err.message}]`);
      continue;
    }

    rl.resume();

    // Show roll result inline if one fired
    if (result.roll && !result.roll.no_roll) {
      if (result.roll.multi_roll) {
        const parts = result.roll.rolls.map(r => `d20=${r.roll} vs DC ${r.dc} → ${r.outcome}`);
        print(`[ROLL: ${result.roll.procedure_id} — ${parts.join(' | ')}]`);
      } else {
        print(`[ROLL: ${result.roll.procedure_id} — d20=${result.roll.roll} vs DC ${result.roll.dc} → ${result.roll.outcome}]`);
      }
    }

    hr();
    print(result.reply);
    hr();

    if (result.closed) break;
  }

  // ---- Debrief offer ----
  if (session.closed) {
    const answer = await prompt('\nWant the debrief? (y/n): ');
    if (answer.trim().toLowerCase().startsWith('y')) {
      process.stdout.write('\n[generating debrief...]\n');
      try {
        const debrief = await session.debrief();
        hr();
        print(debrief);
        hr();
      } catch (err) {
        print(`[Debrief error: ${err.message}]`);
      }
    }
  }

  rl.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
