/* Smoke-run the inline page scripts in a DOM stub: node tools/dom-check.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = process.argv.slice(2);
const targets = pages.length ? pages : ['calc/index.html', 'calc/campaign.html', 'print/cards.html', 'print/board.html', 'print/tokens.html'];

let failures = 0;

for (const rel of targets) {
  const ctx = { console, performance: { now: () => 0 }, setTimeout: (fn) => fn() };
  vm.createContext(ctx);
  ['data/config.js', 'data/cards.js', 'data/missions.js', 'data/engine.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  });

  const made = new Map();
  const el = (id) => {
    if (!made.has(id)) {
      made.set(id, {
        id, innerHTML: '', textContent: '', className: '', value: '', checked: false,
        disabled: false, style: {}, dataset: {}, children: [],
        onclick: null, onchange: null, oninput: null,
        classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
        querySelectorAll: () => [],
        click() {}
      });
    }
    return made.get(id);
  };

  ctx.document = {
    getElementById: el,
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: () => el('__tmp' + made.size)
  };
  ctx.Blob = function (parts) { this.parts = parts; };
  ctx.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
  ctx.window = ctx;
  ctx.print = () => {};

  const html = fs.readFileSync(path.join(root, rel), 'utf8');
  const i = html.lastIndexOf('<script>');
  const j = html.lastIndexOf('</script>');
  try {
    vm.runInContext(html.slice(i + 8, j), ctx, { filename: rel + ' <inline>' });
    if (rel.endsWith('cards.html')) {
      const decks = vm.runInContext('DECKS.map((d) => d.key)', ctx);
      for (const deck of decks) {
        vm.runInContext('ST.deck = ' + JSON.stringify(deck) + '; render();', ctx);
        const cardsHtml = made.get('sheets').innerHTML;
        if (!cardsHtml.includes('class="card')) throw new Error('empty deck ' + deck);
        if (/undefined/.test(cardsHtml)) throw new Error('undefined in the deck ' + deck);
      }
      console.log('     decks: ' + decks.join(', '));
    }
    if (rel.endsWith('campaign.html')) {
      const score = vm.runInContext(
        'for (let i = 0; i < 20 && !U.finished; i++) {' +
        ' if (i === 0) ENGINE.groundContract(U.state, "gc_survey");' +
        ' if (U.state.offers.length) accept(U.state.offers[0]);' +
        ' if (i === 0) launch(null);' +
        ' nextStep();' +
        '}' +
        'finishCampaign(); U.state.score.total;', ctx);
      if (!(score > 0)) throw new Error('the campaign produced no final score');
      const shortSteps = vm.runInContext(
        '$("campLength").value = "12"; newCampaign(); U.state.maxSteps;', ctx);
      if (shortSteps !== 12) throw new Error('the campaign length does not switch');
      console.log('     campaign: final score ' + score + ' | short: ' + shortSteps + ' steps');
    }
    const summary = [];
    if (made.get('verdict')) summary.push('verdict: ' + made.get('verdict').textContent);
    if (made.get('kP')) summary.push('P: ' + made.get('kP').textContent);
    if (made.get('checks')) summary.push('checks: ' + (made.get('checks').innerHTML.match(/<tr>/g) || []).length);
    if (made.get('refRows')) summary.push('reference builds: ' + (made.get('refRows').innerHTML.match(/<tr>/g) || []).length);
    if (made.get('sheets')) summary.push('cards on the sheets: ' + (made.get('sheets').innerHTML.match(/class="card/g) || []).length);
    if (made.get('counter')) summary.push(made.get('counter').textContent);
    if (made.get('gridP')) summary.push('calculator rows: ' + (made.get('gridP').innerHTML.match(/<tr>/g) || []).length);
    if (made.get('logBody')) summary.push('journal rows: ' + (made.get('logBody').innerHTML.match(/<tr>/g) || []).length);
    if (made.get('money')) summary.push('money tokens: ' + (made.get('money').innerHTML.match(/class="tok/g) || []).length);
    console.log('OK   ' + rel + (summary.length ? ' — ' + summary.join(' | ') : ''));
  } catch (e) {
    failures++;
    console.log('FAIL ' + rel + ': ' + e.message);
  }
}

if (failures) process.exitCode = 1;

