import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function load() {
  const ctx = { console };
  vm.createContext(ctx);
  ['data/config.js', 'data/cards.js', 'data/missions.js', 'data/engine.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  });
  return ctx;
}

const variants = [
  { name: 'A baseline', cfg: {} },
  { name: 'B rating .15 / fail -4', cfg: { ratingPerS: 0.15, failRating: -4 } },
  { name: 'C B + dup x2.2', cfg: { ratingPerS: 0.15, failRating: -4, dup: 2.2 } },
  { name: 'D rating .18 / fail -4 / dup 2.2', cfg: { ratingPerS: 0.18, failRating: -4, dup: 2.2 } },
  { name: 'E rating .18 / fail -3 / dup 2.2', cfg: { ratingPerS: 0.18, failRating: -3, dup: 2.2 } }
];

for (const v of variants) {
  const ctx = load();
  const { CONFIG, ENGINE, CARDS } = ctx;
  if (v.cfg.ratingPerS) CONFIG.score.ratingPerS = v.cfg.ratingPerS;
  if (v.cfg.failRating) CONFIG.score.failRating = v.cfg.failRating;
  if (v.cfg.dup) {
    const res = CARDS.reservations.find((r) => r.id === 'res_double');
    res.priceFactor = v.cfg.dup;
  }
  const mc = ENGINE.runMonteCarlo(40, 777);
  console.log(v.name.padEnd(34) +
    ' rating ' + String(mc.avgRating).padStart(6) +
    ' | VChK ' + String(mc.avgVchk).padStart(5) +
    ' | succ ' + mc.successRate + '% part ' + mc.partialRate + '% fail ' + mc.failRate + '%' +
    ' | dup ' + mc.dupRate + '% exp ' + mc.expRate + '%' +
    ' | price ' + mc.avgPrice + '$ left ' + mc.avgMoney + '$' +
    ' | missions ' + mc.avgMissions + ' skip ' + mc.skipRate + '%');
}
