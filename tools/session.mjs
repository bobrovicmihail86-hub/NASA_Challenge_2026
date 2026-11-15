/* Chat-GM: a step-by-step v1.5 campaign where the player makes the decisions and the engine computes.
 *
 *   node tools/session.mjs new --seed 777 --steps 15
 *   node tools/session.mjs show
 *   node tools/session.mjs offers
 *   node tools/session.mjs build --mission m_hubble --rocket rocket_medium \
 *        --res res_single --control ctrl_advanced --instruments "ins_camera:2" \
 *        --antenna ant_medium --power pwr_solar_medium --traj direct
 *   node tools/session.mjs accept --mission m_hubble --auto
 *   node tools/session.mjs launch
 *   node tools/session.mjs ops                    # flights, MCC channels, load plan
 *   node tools/session.mjs overtime --mission m_hubble   # extend acceptance (+S, −money)
 *   node tools/session.mjs close --mission m_hubble      # early acceptance (S ×0.6)
 *   node tools/session.mjs prep school | factory | mcs | hire | pr | std --card ins_exp
 *   node tools/session.mjs next
 *   node tools/session.mjs finish
 *   node tools/session.mjs report
 *   node tools/session.mjs undo
 *   node tools/session.mjs selftest          # determinism: two runs of one scenario
 *
 * State: playtest/session-<seed>.json (+ .prev.json for undo).
 * `compute` is not stored — it is recalculated through ENGINE.campaignCompute
 * (including for the flights in `state.flights`).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const playDir = path.join(root, 'playtest');
const ctx = { console };
vm.createContext(ctx);
['data/config.js', 'data/cards.js', 'data/missions.js', 'data/engine.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
});
const { CONFIG, CARDS, MISSIONS, SALVAGE, ENGINE } = ctx;

/* ---------- utilities ---------- */
const num = (x, d) => (x == null || Number.isNaN(x) ? '—' : (Math.round(x * Math.pow(10, d == null ? 1 : d)) / Math.pow(10, d)).toFixed(d == null ? 1 : d));
const line = (t) => (t == null || t === '' ? '' : t + '\n');
const head = (t) => '\n── ' + t + ' ' + '─'.repeat(Math.max(0, 46 - t.length)) + '\n';

function missionById(id) { return MISSIONS.find((m) => m.id === id) || null; }
function pointName(key) { return (CONFIG.points[key] || {}).name || key; }
function trajName(id) { return (CONFIG.trajectories[id] || {}).name || id; }

/* The same LCG as in E.makeRng; the state is kept so a run is reproducible. */
function makeLcg(seed) {
  let s = (seed >>> 0) || 1;
  return {
    next() { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; },
    get state() { return s; },
    set state(v) { s = (v >>> 0) || 1; }
  };
}

/* ---------- session files ---------- */
function sessionPath(seed) { return path.join(playDir, 'session-' + seed + '.json'); }
function prevPath(seed) { return path.join(playDir, 'session-' + seed + '.prev.json'); }

function sessionFromSeed(seed, steps) {
  const st = ENGINE.campaignSetup(seed);
  st.maxSteps = steps || CONFIG.campaign.steps;
  return {
    seed: seed,
    rnd: makeLcg((seed * 2654435761) >>> 0 || 7),
    actionsLeft: CONFIG.campaign.skipPrepActions,
    finished: false,
    state: st,
    journal: []
  };
}

function serialize(s) {
  const clean = JSON.parse(JSON.stringify(s.state, function (k, v) {
    if (k === '_deck' || k === 'compute') return undefined;
    return v;
  }));
  return {
    version: CONFIG.version, seed: s.seed, maxSteps: s.state.maxSteps,
    rng: s.rnd.state, actionsLeft: s.actionsLeft, finished: s.finished,
    journal: s.journal, state: clean
  };
}

function hydrate(data) {
  const st = ENGINE.campaignSetup(data.seed);
  st.maxSteps = data.maxSteps || CONFIG.campaign.steps;
  Object.assign(st, data.state);
  /* `compute` is not stored (it holds card references) — rebuild it for the flights. */
  (st.flights || []).forEach((f) => {
    if (f.compute) return;
    const mission = missionById(f.missionId);
    if (!mission) return;
    f.compute = ENGINE.campaignCompute(st, f.sel, mission, f.trajectoryId,
      { unique: f.unique, money: f.cap });
  });
  return {
    seed: data.seed, rnd: makeLcg(data.rng), actionsLeft: data.actionsLeft,
    finished: !!data.finished, state: st, journal: data.journal || []
  };
}

function save(s) {
  if (!fs.existsSync(playDir)) fs.mkdirSync(playDir, { recursive: true });
  const file = sessionPath(s.seed);
  const data = serialize(s);
  if (fs.existsSync(file)) fs.copyFileSync(file, prevPath(s.seed));
  fs.writeFileSync(file, JSON.stringify(data, null, 1), 'utf8');
  return file;
}

function load(seedArg) {
  if (!fs.existsSync(playDir)) return { err: 'no playtest folder — run new --seed N first' };
  const files = fs.readdirSync(playDir).filter((f) => /^session-\d+\.json$/.test(f));
  let file = null;
  if (seedArg != null) file = sessionPath(seedArg);
  else if (files.length === 1) file = path.join(playDir, files[0]);
  else if (files.length === 0) return { err: 'no sessions — run new --seed N first' };
  else return { err: 'several sessions, pass --seed (' + files.join(', ') + ')' };
  if (!fs.existsSync(file)) return { err: 'no such file ' + file };
  return { sess: hydrate(JSON.parse(fs.readFileSync(file, 'utf8'))) };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.slice(0, 2) === '--') {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next == null || next.slice(0, 2) === '--') out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

/* ---------- build argument parsing ---------- */
function listArg(v) {
  if (!v || v === true) return [];
  return String(v).split(',').map((x) => x.trim()).filter(Boolean);
}
function insArg(v) {
  if (!v || v === true) return [];
  return String(v).split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const parts = x.split(':');
    return { id: parts[0].trim(), count: parts[1] == null ? 1 : Math.max(1, parseInt(parts[1], 10) || 1) };
  });
}
function selFromArgs(a) {
  return {
    rocketId: a.rocket || 'rocket_light',
    reservationId: a.res || 'res_single',
    controlId: a.control || 'ctrl_basic',
    antennaId: a.antenna || 'ant_small',
    powerId: a.power || 'pwr_solar_small',
    bufferId: a.buffer && a.buffer !== 'none' ? a.buffer : null,
    instruments: insArg(a.instruments),
    physical: listArg(a.physical),
    antennaDup: !!a.dup,
    moduleBuild: !!a.module
  };
}
function budgetOf(sess, mission) {
  const st = sess.state;
  const contract = ENGINE.contract(mission);
  const cap = Math.min(st.money + contract.advance, contract.advance * CONFIG.contractReward.capFactor);
  return { advance: contract.advance, bonus: contract.bonus, cap: cap };
}

/* ---------- printing ---------- */
function dataTypeInfo(m) {
  const dt = CONFIG.dataTypes[m.dataType] || { name: m.dataType };
  const ins = (CARDS.instruments || []).filter((c) => c.dataType === m.dataType);
  return dt.name + (ins.length ? ' — matching instruments: ' + ins.map((c) => c.name).join(', ')
    : ' — no matching instruments in the deck');
}
function moduleNames(keys) {
  return (keys || []).map((k) => {
    const card = (CARDS.physical || []).find((p) => p.key === k);
    return card ? card.name : k;
  });
}

function describeMission(m) {
  const c = ENGINE.contract(m);
  const req = moduleNames(m.requires);
  return m.name + ' · ' + pointName(m.point) + ' · complexity ' + num(m.complexity, 2) +
    ' · S target ' + num(m.targetValue, 0) + ' · deadline ' + m.deadline +
    ' · advance ' + c.advance + ' $ · bonus ' + c.bonus + ' $\n' +
    '  data: ' + dataTypeInfo(m) + ' (other type — S_det ×0.5)' +
    (req.length ? '\n  mission modules: ' + req.join(', ') + ' (the physical modules are mandatory)' : '');
}

function describeBuild(sess, r, mission) {
  const c = r.compute;
  const b = c.build;
  const st = sess.state;
  const out = [];
  out.push('Mission: ' + describeMission(mission));
  out.push('Trajectory: ' + trajName(r.traj.id) + ' · k×' + num(r.traj.kMult, 2) +
    ' · deadline ' + r.traj.deadline + ' · window ' + num(r.traj.window, 2));
  out.push('');
  out.push('Launcher: ' + b.rocket.name + ' (p ' + num(b.rocket.p, 2) + ', cycles ' + c.cycles +
    ', PM ' + b.rocket.pm + ', payload ' + num(b.rocket.payload, 2) + ' t)');
  out.push('Reservation: ' + b.res.name + ' · FCS: ' + b.control.name +
    ' (slots ' + c.slots.total + (c.slots.bonus ? ' = ' + b.control.slots + ' + ' + c.slots.bonus + ' school' : '') + ')');
  out.push('Antenna: ' + b.antenna.name + (b.antennaDup ? ' + duplication' : '') +
    ' · power: ' + b.power.name + (b.buffer ? ' · buffer: ' + b.buffer.name : ''));
  out.push('Instruments: ' + (b.instruments.length
    ? b.instruments.map((o) => o.card.name + ' ×' + o.count).join(', ') : 'none'));
  if (b.instruments.length) {
    out.push('  instrument p: ' + b.instruments.map((o) => o.card.name + ' ' +
      num(Math.min(0.995, o.card.p + c.school.reliability), 2) + ' (with the school)').join(', '));
  }
  const dtName = (CONFIG.dataTypes[mission.dataType] || {}).name || mission.dataType;
  const typeOk = b.instruments.some((o) => o.card.dataType === mission.dataType);
  out.push('Mission data: ' + dtName + (typeOk ? ' · the instrument set matches'
    : ' · NO instrument of this type → S_det ×0.5'));
  out.push('Modules: ' + (b.physical.map((p) => p.name).join(', ') || '—') +
    (b.moduleBuild ? ' · modular build' : ''));
  out.push('');
  out.push('Mass ' + num(c.massKg / 1000, 2) + ' t / ' + num(c.capacityKg / 1000, 2) + ' t to the point');
  out.push('Price ' + c.price + ' $ / limit ' + Math.round(r.cap) + ' $ (advance ' + r.advance +
    ' $, cash ' + Math.round(st.money) + ' $, after the purchase ' + Math.round(r.cashAfter) + ' $)');
  out.push('Mission PM ' + c.pm + ' → ' + r.pmRate + '/step × ' + r.prodTime + ' step(s) · free PM ' + r.pmFree);
  out.push('');
  out.push('p_launch ' + num(c.pLaunch, 3) + ' · p_build ' + num(c.pCollect, 3) +
    ' · p_channel ' + num(c.pChannel, 3) + ' → P_success ' + num(c.pSuccess, 3));
  out.push('D_ratio ' + num(c.data.ratio, 2) + ' · S_det ' + num(c.sDet, 1) + ' (target ' + num(c.target, 1) +
    ') · S with P ' + num(c.s, 1));
  out.push('Plan verdict: ' + c.verdict + ' · expected rating ' + num(c.dRating, 1) +
    ' / VChK ' + num(c.dVchk, 1) + ' / bonus ' + c.bonus + ' $');
  const bad = c.checks.filter((k) => !k.ok && !k.soft);
  out.push('Checks: ' + (bad.length ? 'FAILED — ' + bad.map((k) => k.label + ' (' + k.detail + ')').join('; ')
    : 'all hard conditions hold'));
  const soft = c.checks.filter((k) => k.soft && !k.ok);
  if (soft.length) out.push('Soft: ' + soft.map((k) => k.label + ' — ' + k.detail).join('; '));
  out.push('Timing: ready at step ' + (st.step + r.prodTime) + ', step deadline ' + (st.step + c.deadline));
  return out.join('\n');
}

/* ---------- science consultant: input control, no reliability assessment ---------- */
const CONSULT = {
  mass: (c) => 'mass ' + num(c.massKg / 1000, 2) + ' t > capacity ' + num(c.capacityKg / 1000, 2) +
    ' t — a launcher one class up, an assist/orbit trajectory (cheaper in k) or drop a module',
  power: (c) => 'bus ' + num(c.power.available, 0) + ' W < ' + num(c.power.required, 0) +
    ' W — another source (RTG), fewer instruments or a more modest antenna; a buffer adds no power',
  slots: (c) => 'FCS slots ' + c.slots.total + ', instruments ' + c.slots.used +
    ' — an FCS with 5–6 slots or school 4 (+1 slot)',
  deadline: (c) => 'cycles ' + c.cycles + ' > deadline ' + c.deadline +
    ' — a launcher with fewer cycles, an assist/orbit trajectory (+1…2 steps), factory 4 (−1 cycle)',
  pm: (c) => 'build PM ' + c.pm + ' > the limit 40×' + c.deadline +
    ' — drop an instrument; the factory and the school lower the mission PM',
  modules: (c) => 'the trajectory requires: ' + (moduleNames(c.trajectory.requires).join(', ') || '—'),
  money: (c) => 'price ' + c.price + ' $ is above the purchase cap — a cheaper launcher/instruments/buffer',
  data: (c) => 'D_ratio ' + num(c.data.ratio, 2) +
    ' — more data than the channel can carry: a wider antenna, a buffer or fewer instruments; otherwise a full success is unavailable'
};

function consultBlock(r, mission, enabled) {
  if (!enabled) return '';
  const c = r.compute;
  const issues = c.checks.filter((k) => !k.ok);
  const out = [head('Science consultant · input control')];
  if (!issues.length) {
    out.push('· No hard violations: mass, power, slots, timing, modules and budget all hold.');
  } else {
    issues.forEach((k) => {
      out.push('· ' + (CONSULT[k.id] ? CONSULT[k.id](c, mission) : k.label + ': ' + k.detail));
    });
  }
  if (!c.build.instruments.some((o) => o.card.dataType === mission.dataType)) {
    const dt = (CONFIG.dataTypes[mission.dataType] || {}).name || mission.dataType;
    out.push('· the build has no instrument of type “' + dt + '”: S_det will be ×0.5');
  }
  out.push('The input control checks: mass, power, slots, timing, modules, budget, data type.');
  out.push('It does not judge reliability and duplication — a trial run shows that (prep stand / rocket / instrument).');
  return out.join('\n');
}

function describeState(sess) {
  const st = sess.state;
  const mcs = ENGINE.mcsFor(st);
  const school = ENGINE.schoolFor(st);
  const out = [];
  out.push('Step ' + st.step + ' / ' + st.maxSteps + (sess.finished ? ' · campaign finished' : '') +
    (st.mcsPenalty ? ' · MCC −1' : ''));
  out.push('Cash ' + Math.round(st.money) + ' $ · fund ' + Math.round(st.groundFund) +
    ' $ · NP ' + Math.round(st.np) + ' · rating ' + num(st.rating, 0) + ' · VChK ' + num(st.vchk, 0));
  out.push('PM ' + ENGINE.pmAvailable(st) + ' / ' + ENGINE.pmLimit(st) + ' free · active ' + ENGINE.activePm(st) +
    ' · preparation actions ' + sess.actionsLeft);
  out.push('MCC ' + st.mcsLevel + ' (eff. ' + mcs.levelEff + ', ' + mcs.capacity + ' launches/step, managers ' +
    st.managers + '/' + mcs.managersRequired + ') · upkeep ' + mcs.upkeep + ' $/step');
  out.push('Factory ' + st.factory + ' (+' + ENGINE.factoryPm(st) + ' PM) · school ' + school.level + ' “' + school.name +
    '” (+' + num(school.reliability * 100, 0) + '% p, PM ×' + num(school.pmFactor, 2) +
    (school.slotsBonus ? ', +' + school.slotsBonus + ' slot' : '') + ')');
  const prod = st.production.map((p) => {
    const m = missionById(p.missionId);
    return '  · ' + (m ? m.name : p.missionId) + ' — ready step ' + p.readyStep +
      ', deadline ' + p.deadlineStep + ', ' + p.pmRate + ' PM/step, ' + p.price + ' $';
  });
  out.push('Production ' + st.production.length + '/' + CONFIG.campaign.productionSlots +
    (prod.length ? ':\n' + prod.join('\n') : ' — empty'));
  const ready = st.ready.map((p) => '  · ' + (missionById(p.missionId) || {}).name +
    ' (deadline ' + p.deadlineStep + ')');
  out.push('Ready to launch: ' + (ready.length ? '\n' + ready.join('\n') : '—'));
  if ((st.flights || []).length) {
    const ld = ENGINE.opsLoad(st);
    out.push('In flight ' + st.flights.length + ' · MCC ' + ld.load + '/' + ld.cap +
      (ld.overload ? ' (overload ' + ld.overload + ')' : ''));
    st.flights.forEach((f) => out.push(flightLine(f)));
  }
  out.push('Showcase: ' + st.offers.map((id) => (missionById(id) || {}).name).join(' · '));
  if (st.log.length) out.push('Journal: ' + st.log.slice(-4).join(' | '));
  return out.join('\n');
}

/* ---------- commands ---------- */
function cmdNew(a) {
  const seed = Number(a.seed);
  if (!Number.isFinite(seed) || seed <= 0) return { err: 'pass --seed N (an integer > 0)' };
  const steps = Number(a.steps) || CONFIG.campaign.steps;
  const allowed = [CONFIG.campaign.shortSteps, CONFIG.campaign.steps, CONFIG.campaign.longSteps];
  if (allowed.indexOf(steps) === -1) return { err: 'campaign length: ' + allowed.join(' / ') };
  if (fs.existsSync(sessionPath(seed)) && !a.force) {
    return { err: 'session ' + seed + ' already exists (--force to overwrite)' };
  }
  const sess = sessionFromSeed(seed, steps);
  const text = [
    head('New campaign ' + seed + ', ' + steps + ' steps'),
    describeState(sess), '',
    'Start: ' + CONFIG.start.money + ' $, NP ' + CONFIG.start.np + ', PM ' + CONFIG.start.pm +
    '/step, VChK ' + CONFIG.start.vchk + ', rating ' + CONFIG.start.rating + ', managers ' +
    CONFIG.campaign.startManagers + ', fund ' + CONFIG.campaign.groundFundStart + ' $.'
  ].join('\n');
  return { sess: sess, text: text };
}

function cmdOffers(sess) {
  const st = sess.state;
  const out = [head('Showcase of step ' + st.step)];
  if (!st.offers.length) out.push('The showcase is empty.');
  st.offers.forEach((id) => {
    const m = missionById(id);
    if (!m) return;
    const b = budgetOf(sess, m);
    const auto = ENGINE.campaignBuild(st, m);
    out.push('[' + m.id + '] ' + describeMission(m));
    out.push('  purchase cap ' + Math.round(b.cap) + ' $ · trajectories: ' +
      (m.trajectories || ['direct']).map((t) => trajName(t) + ' [' + t + ']').join(', '));
    out.push('  GM hint: ' + (auto
      ? auto.compute.build.rocket.name + ' · P ' + num(auto.compute.pSuccess, 3) + ' · ' +
        auto.compute.price + ' $ · ' + auto.pmRate + ' PM/step · ' + auto.compute.verdict
      : 'no build within budget'));
    out.push('');
  });
  out.push('Accept: accept --mission <id> --auto  |  own build: build ... then accept ... with the same keys');
  return out.join('\n');
}

function drawTrace(entry) {
  const out = [];
  entry.trace.forEach((t) => {
    if (t.stage === 'result') {
      out.push('  result: S_det ' + num(t.sAct, 1) + ' / target ' + num(t.target, 1) +
        ' · D ' + num(t.ratio, 2) + (t.physicalOk ? '' : ' · the physical stage failed') +
        ' → ' + t.key);
      return;
    }
    const roll = t.roll == null ? '—' : num(t.roll, 3);
    out.push('  ' + t.stage + ': p ' + num(t.p, 3) + ' · roll ' + roll + ' → ' + (t.ok ? 'ok' : 'fail'));
  });
  return out.join('\n');
}


function cmdCards() {
  const out = [head('Decks: id — stats')];
  const deck = (title, arr, f) => {
    out.push('\n' + title + ':');
    arr.forEach((c) => out.push('  ' + c.id + ' — ' + f(c)));
  };
  deck('Upper stages', CARDS.rockets,
    (c) => c.name + ' · p ' + num(c.p, 2) + ' · payload ' + c.payload + ' t · ' + c.price + ' $ · cycles ' +
      c.cycles + ' · PM ' + c.pm + ' · NP ' + c.np + ' · bus ' + c.busPower + ' W/' + c.busChannel + ' Mbit');
  deck('Reservations', CARDS.reservations,
    (c) => c.name + ' · ×' + num(c.priceFactor, 2) + ' price · type ' + c.t);
  deck('FCS', CARDS.control,
    (c) => c.name + ' · slots ' + c.slots + ' · p ' + num(c.p, 2) + ' · ' + c.price + ' $ · ' +
      c.watts + ' W · duplication: ' + (c.dup || '—'));
  deck('Instruments', CARDS.instruments,
    (c) => c.name + ' · p ' + num(c.p, 2) + ' · value ' + c.value + ' · ' + c.price + ' $ · ' +
      c.mass + ' kg · ' + c.watts + ' W · ' + c.bw + ' Mbit/s · ' + c.dataType + ' · PM ' + c.pm + ' · NP ' + c.np);
  deck('Antennas', CARDS.antennas,
    (c) => c.name + ' · ' + c.bw + ' Mbit/s · p ' + num(c.p, 2) + ' · ' + c.price + ' $ · ' + c.mass +
      ' kg · ' + c.watts + ' W');
  deck('Power and buffers', CARDS.power.concat(CARDS.buffer || []),
    (c) => c.name + ' · ' + (c.watts || c.kwh) + (c.watts ? ' W' : ' kWh') + ' · ' + c.price + ' $ · ' + c.mass + ' kg');
  deck('Physical modules', CARDS.physical,
    (c) => c.name + ' · key ' + c.key + ' · ' + c.price + ' $ · ' + c.mass + ' kg · p ' + num(c.p, 2));
  out.push('\nGround contracts:');
  (CARDS.groundContracts || []).forEach((c) => {
    out.push('  ' + c.id + ' — ' + c.name + ' (+' + c.fund + ' $ to the fund' +
      (c.npDelta ? ', ' + c.npDelta + ' NP' : '') + (c.ipDelta ? ', +' + c.ipDelta + ' IP' : '') + ')');
  });
  return out.join('\n');
}

function cmdBuild(sess, a) {
  const mission = missionById(a.mission);
  if (!mission) return 'no mission ' + a.mission;
  const r = ENGINE.campaignManual(sess.state, mission, selFromArgs(a), a.traj);
  if (!r.ok) {
    return r.reason + '\n' + r.trajectories.map((t) => '  ' + t.id + ' — available: ' + (t.available ? 'yes' : 'no') +
      ', k ' + num(t.k, 2) + ', deadline ' + t.deadline + ', mass ' + (t.massOk ? 'ok' : 'no') +
      ', cycles ' + t.cycles + '/' + t.deadline).join('\n');
  }
  return describeBuild(sess, r, mission) + '\n' +
    consultBlock(r, mission, !a['no-consult']);
}

function cmdAccept(sess, a) {
  const st = sess.state;
  if (sess.finished) return 'The campaign is over.';
  const mission = missionById(a.mission);
  if (!mission) return 'no mission ' + a.mission;
  let choice = null;
  if (a.auto) {
    choice = ENGINE.campaignBuild(st, mission);
    if (!choice) return 'no build within budget';
  } else {
    const r = ENGINE.campaignManual(st, mission, selFromArgs(a), a.traj);
    if (!r.ok) return r.reason;
    if (!r.budgetOk) return 'price ' + r.price + ' $ is above the purchase cap ' + Math.round(r.cap) + ' $';
    if (!r.cashOk) return 'not enough cash: ' + r.price + ' $ against ' + Math.round(st.money + r.advance) + ' $';
    if (!r.compute.feasible) {
      return 'the build fails the checks: ' +
        r.compute.checks.filter((k) => !k.ok).map((k) => k.label + ' (' + k.detail + ')').join('; ');
    }
    choice = r.choice;
  }
  const res = ENGINE.acceptMission(st, mission.id, choice);
  if (!res.ok) return res.reason;
  st.tookMission = true;
  const out = [head('Accepted: ' + mission.name)];
  out.push('Advance +' + res.entry.advance + ' $ (to the fund ' +
    Math.round(res.entry.advance * CONFIG.campaign.groundFundShare) + ' $) · purchase −' + res.entry.price + ' $');
  out.push('PM ' + res.entry.pmRate + '/step · production ' + res.entry.prodTime + ' step(s) → ready step ' +
    res.entry.readyStep + ', step deadline ' + res.entry.deadlineStep);
  out.push('Data: ' + dataTypeInfo(mission));
  out.push('Consultant: mass, power, slots, timing, modules and budget checked — no violations.');
  out.push('Cash ' + Math.round(st.money) + ' $ · free PM ' + ENGINE.pmAvailable(st));
  out.push('Production ' + st.production.length + '/' + CONFIG.campaign.productionSlots);
  return out.join('\n');
}


function pushLaunchReport(sess, r, out) {
  if (r.pending) {
    out.push('  · ' + r.name + ' → launched · flight ' + r.flight + ' step(s) · channel ' + r.load +
      ' · acceptance ~step ' + r.flightEndStep);
    return;
  }
  out.push('  · ' + r.name + ' → ' + r.result.key +
    (r.result.stage !== 'ok' ? ' (' + r.result.stage + ')' : '') +
    ' · rating ' + (r.dRating >= 0 ? '+' : '') + num(r.dRating, 1) +
    ' · money ' + (r.dMoney >= 0 ? '+' : '') + Math.round(r.dMoney) + ' $');
  sess.journal.push({
    step: r.step, mission: r.missionId, name: r.name, point: r.point, traj: r.trajectoryId,
    p: r.p, sAct: r.sAct, verdict: r.result.key, stage: r.result.stage,
    price: r.price, advance: r.advance,
    dRating: r.dRating, dVchk: r.dVchk, dMoney: r.dMoney
  });
}

function cmdLaunch(sess, a) {
  const st = sess.state;
  if (sess.finished) return 'The campaign is over.';
  const ids = a.mission ? [a.mission] : null;
  const report = [];
  const n = ENGINE.launchReady(st, ids, () => sess.rnd.next(), false, report);
  if (!n) {
    return 'No launches: ready missions ' + st.ready.length + ', MCC limit ' + ENGINE.mcsFor(st).capacity + '/step.';
  }
  const out = [head('Launches, step ' + st.step)];
  report.forEach((r) => pushLaunchReport(sess, r, out));
  out.push('');
  out.push('Still ready ' + st.ready.length + ' · cash ' + Math.round(st.money) + ' $ · rating ' + num(st.rating, 1));
  return out.join('\n');
}

/* ---------- flight operations (v1.5) ---------- */
function flightLine(f) {
  const need = f.flight + (f.overtime || 0);
  const done = (f.sessions || []).length;
  const full = f.compute.sRaw * f.compute.data.ratio;
  const share = full > 0 ? Math.min(1, f.accrued / full) : 0;
  const ratio = f.compute.data.ratio * (CONFIG.campaign.ops.dataFloor +
    (1 - CONFIG.campaign.ops.dataFloor) * share);
  return '  · ' + f.name + ' · flight ' + done + '/' + need + ' · channel ' + f.load +
    ' · data ' + num(100 * ratio / (f.compute.data.ratio || 1), 0) + '%' +
    ' · acceptance ~step ' + f.endStep + (f.overtime ? ' (extensions ' + f.overtime + ')' : '');
}

function journalReception(sess, r) {
  sess.journal.push({
    step: r.step, mission: r.missionId, name: r.name, point: r.point || 'leo',
    traj: r.trajectoryId, p: r.compute.pSuccess, sAct: r.result.sAct,
    verdict: r.result.key, stage: r.result.stage,
    price: r.price || 0, advance: r.advance || 0,
    dRating: r.reward ? r.reward.dRating : 0,
    dVchk: r.reward ? r.reward.dVchk : 0,
    dMoney: 0
  });
}

function opsSummaryText(sess, ops) {
  const out = [];
  ops.filter((r) => r.session).forEach((r) => {
    const s = r.session;
    out.push('  · ' + r.name + ': session ' + s.step +
      (s.event ? ' · event ' + s.event : '') +
      (s.incident ? ' · incident ' + s.incident : '') +
      (s.note ? ' · ' + s.note : '') +
      ' · +' + num(s.accrued, 1) + ' S');
  });
  ops.filter((r) => r.reception).forEach((r) => {
    out.push('  · ' + r.name + ': ACCEPTANCE ' + r.result.key +
      (r.result.stage !== 'ok' ? ' (' + r.result.stage + ')' : '') +
      ' · data ' + num(100 * r.ratioOps / (r.compute.data.ratio || 1), 0) + '%' +
      (r.overtime ? ' · extensions ' + r.overtime : '') +
      (r.earlyEnd ? ' · early' : '') +
      (r.reward ? ' · rating ' + (r.reward.dRating >= 0 ? '+' : '') + num(r.reward.dRating, 1) : ''));
    journalReception(sess, r);
  });
  return out;
}

function cmdOps(sess) {
  const st = sess.state;
  const ld = ENGINE.opsLoad(st);
  const relief = ENGINE.opsIncidentRelief(st.school);
  const out = [head('Flight operations, step ' + st.step)];
  out.push('MCC: ' + ld.load + ' / ' + ld.cap + ' channels' +
    (ld.overload ? ' · overload ' + ld.overload : '') +
    ' · incident p ' + num(ENGINE.opsIncidentP(ld.overload, 0, st.school), 2) +
    (relief > 0 ? ' (school −' + Math.round(relief * 100) + '% of the penalty)' : '') +
    ' · event p ' + num(ENGINE.opsEventChance(st), 2) + '/step');
  if (!(st.flights || []).length) out.push('  no flights.');
  (st.flights || []).forEach((f) => out.push(flightLine(f)));
  out.push('Load plan:');
  ENGINE.mcsLoadPlan(st, CONFIG.campaign.ops.loadPlanSteps).forEach((p) => {
    out.push('  step ' + p.step + ': ' + p.load + ' / ' + p.cap +
      (p.overload ? ' (overload ' + p.overload + ')' : ''));
  });
  out.push('Commands: overtime --mission ID · close --mission ID');
  return out.join('\n');
}

function cmdOvertime(sess, a) {
  const r = ENGINE.overtime(sess.state, a.mission || null);
  if (!r.ok) return 'Overtime: ' + r.reason;
  return 'Acceptance of “' + r.flight.name + '” extended: −' + r.cost + ' $, extensions ' +
    r.overtime + '/' + CONFIG.campaign.ops.overtime.max + ', acceptance ~step ' + r.flight.endStep + '.';
}

function cmdClose(sess, a) {
  const r = ENGINE.closeEarly(sess.state, a.mission || null, () => sess.rnd.next());
  if (!r.ok) return 'Early acceptance: ' + r.reason;
  const rec = r.report;
  journalReception(sess, rec);
  return 'Early acceptance of “' + rec.name + '” → ' + rec.result.key +
    (rec.result.stage !== 'ok' ? ' (' + rec.result.stage + ')' : '') +
    ' · data ' + num(100 * rec.ratioOps / (rec.compute.data.ratio || 1), 0) + '%' +
    ' · S ' + num(rec.result.sAct, 1) +
    (rec.reward ? ' · rating ' + (rec.reward.dRating >= 0 ? '+' : '') + num(rec.reward.dRating, 1) : '');
}

function cmdPrep(sess, a) {
  const what = (a._[0] || '').toLowerCase();
  const st = sess.state;
  if (sess.finished) return 'The campaign is over.';
  if (sess.actionsLeft <= 0) return 'The preparation actions for this step are used up — next.';
  const rnd = () => sess.rnd.next();
  let res = null;
  if (what === 'school') res = ENGINE.upgradeSchool(st);
  else if (what === 'factory') res = ENGINE.upgradeFactory(st);
  else if (what === 'mcs') res = ENGINE.mcsUpgrade(st);
  else if (what === 'hire') res = ENGINE.hireManager(st);
  else if (what === 'pr') res = ENGINE.prAction(st);
  else if (what === 'tech') res = ENGINE.upgradeTech(st, a.kind || 'instrument', a.cls);
  else if (what === 'std') res = ENGINE.standardize(st, a.card);
  else if (what === 'ground') {
    res = ENGINE.groundContract(st, a.card,
      { ipKind: 'instrument', ipClass: a.ipClass || 'camera' });
  } else if (what === 'stand') {
    res = ENGINE.testLaunch(st, 'stand', { ipKind: 'instrument', ipClass: a.ipClass || 'camera' }, rnd);
  } else if (what === 'rocket') {
    res = ENGINE.testLaunch(st, 'flightRocket', { rocketId: a.rocket || 'rocket_light' }, rnd);
  } else if (what === 'instrument') {
    res = ENGINE.testLaunch(st, 'flightInstrument',
      { rocketId: a.rocket || 'rocket_light', instrumentId: a.instrument || 'ins_camera' }, rnd);
  } else {
    return 'Unknown action “' + what + '”.\noptions: school factory mcs hire pr tech std ground stand rocket instrument';
  }
  if (!res || !res.ok) return what + ': ' + ((res && res.reason) || 'unavailable');
  sess.actionsLeft--;
  const out = [head('Preparation: ' + what)];
  const logTail = st.log[st.log.length - 1];
  if (logTail) out.push(logTail);
  if (res.success != null) out.push('Test: ' + (res.success ? 'success' : 'failure') + ' · p ' + num(res.p, 3) +
    ' · +' + res.ip + ' IP' + (res.refund ? ' · refund ' + res.refund + ' $' : ''));
  if (res.mods) out.push('School ' + res.mods.level + ' “' + res.mods.name + '”: +' + num(res.mods.reliability * 100, 0) +
    '% p, PM ×' + num(res.mods.pmFactor, 2) + (res.mods.standardize ? ', instrument standardisation' : '') +
    (res.mods.slotsBonus ? ', +' + res.mods.slotsBonus + ' slot' : '') +
    (res.mods.overloadRelief ? ', −' + Math.round(res.mods.overloadRelief * 100) + '% of the MCC penalty' : ''));
  out.push('Actions left: ' + sess.actionsLeft + ' · cash ' + Math.round(st.money) + ' $ · NP ' + Math.round(st.np) +
    ' · rating ' + num(st.rating, 0) + ' · free PM ' + ENGINE.pmAvailable(st));
  return out.join('\n');
}


function cmdNext(sess) {
  const st = sess.state;
  if (sess.finished) return 'The campaign is over.';
  if (st.step >= st.maxSteps) return 'The last step of the campaign — finish.';
  st.hadMissionLast = st.tookMission;
  const report = [];
  ENGINE.launchReady(st, null, () => sess.rnd.next(), false, report);
  const ops = ENGINE.stepFlights(st, () => sess.rnd.next());
  const expenses = ENGINE.endStep(st, () => sess.rnd.next(), { skipExpire: false });
  ENGINE.advanceProduction(st);
  sess.actionsLeft = st.hadMissionLast ? CONFIG.campaign.prepActions : CONFIG.campaign.skipPrepActions;
  const out = [head('Step closed → ' + st.step)];
  if (report.length) {
    out.push('Auto-launch of the ready missions:');
    report.forEach((r) => pushLaunchReport(sess, r, out));
  }
  const opsRows = opsSummaryText(sess, ops);
  if (opsRows.length) {
    out.push('Communication sessions and acceptances:');
    opsRows.forEach((l) => out.push(l));
  }
  out.push('Salaries ' + expenses.salary + ' $ · MCC upkeep ' + (expenses.upkeep || 0) + ' $');
  if (st.stats.expired) out.push('Expired in total: ' + st.stats.expired);
  out.push('Preparation actions this step: ' + sess.actionsLeft +
    (st.hadMissionLast ? ' (a mission was accepted)' : ' (no mission)'));
  out.push('');
  out.push(describeState(sess));
  return out.join('\n');
}

function cmdFinish(sess) {
  const st = sess.state;
  if (sess.finished) return 'Already finished. Total: ' + num(st.score && st.score.total, 1);
  st.hadMissionLast = st.tookMission;
  ENGINE.advanceProduction(st);
  const report = [];
  ENGINE.launchReady(st, null, () => sess.rnd.next(), true, report);
  const ops = ENGINE.stepFlights(st, () => sess.rnd.next());
  const finOps = ENGINE.finalizeFlights(st, () => sess.rnd.next());
  const pending = report.filter((r) => r.pending);
  report.filter((r) => !r.pending).forEach((r) => {
    sess.journal.push({
      step: r.step, mission: r.missionId, name: r.name, point: r.point, traj: r.trajectoryId,
      p: r.p, sAct: r.sAct, verdict: r.result.key, stage: r.result.stage,
      price: r.price, advance: r.advance,
      dRating: r.dRating, dVchk: r.dVchk, dMoney: r.dMoney
    });
  });
  const opsRows = opsSummaryText(sess, ops.concat(finOps));
  const failed = ENGINE.failRemaining(st, 'end of the campaign');
  st.score = ENGINE.finalScore(st);
  sess.finished = true;
  const sc = st.score;
  const out = [head('Campaign final ' + sess.seed)];
  const finalLaunches = report.filter((r) => !r.pending);
  if (finalLaunches.length) out.push('Final window: ' +
    finalLaunches.map((r) => r.name + ' → ' + r.result.key).join(' · '));
  if (pending.length) out.push('In flight at the final: ' +
    pending.map((r) => r.name + ' (' + r.flight + ' step(s))').join(' · '));
  if (opsRows.length) {
    out.push('Sessions and acceptances:');
    opsRows.forEach((l) => out.push(l));
  }
  if (failed) out.push('Unlaunched missions written off: ' + failed);
  out.push('');
  out.push('Rating ' + num(sc.rating, 1) + ' · VChK ' + num(sc.vchk, 1) + ' (×0.5 = ' + num(sc.vchkPart, 1) + ')');
  out.push('CML levels ' + sc.techLevels + ' → ' + num(sc.techPart, 1) + ' · standardisations ' + sc.standardized +
    ' → ' + num(sc.stdPart, 1));
  out.push('MCC ' + sc.mcsLevel + ' → ' + num(sc.mcsPart, 1) + ' · school ' + sc.schoolLevel + ' → ' + num(sc.schoolPart, 1));
  out.push('Rescues ' + sc.rescues + ' → ' + num(sc.rescuePart, 1) + ' · failure streaks ' +
    sc.failStreakPenalties + ' → ' + num(sc.penaltyPart, 1));
  out.push('');
  out.push('TOTAL: ' + num(sc.total, 1) + ' points (target ≥ 80)');
  out.push('Missions ' + st.stats.missions + ' · success ' + st.stats.success + ' · partial ' + st.stats.partial +
    ' · failure ' + st.stats.fail + ' · expired ' + st.stats.expired);
  out.push('Next: report — write playtest/session-' + sess.seed + '.md/.csv');
  return out.join('\n');
}


function cmdReport(sess) {
  const st = sess.state;
  const sc = st.score || ENGINE.finalScore(st);
  if (!fs.existsSync(playDir)) fs.mkdirSync(playDir, { recursive: true });
  const md = [];
  md.push('# Campaign playtest ' + CONFIG.version + ' — session ' + sess.seed);
  md.push('');
  md.push('* Length: ' + st.maxSteps + ' steps · stop step: ' + st.step);
  md.push('* Total: **' + num(sc.total, 1) + '** points (target ≥ 80)');
  md.push('* Rating ' + num(sc.rating, 1) + ' · VChK ' + num(sc.vchk, 1) + ' · rescues ' + sc.rescues);
  md.push('* MCC ' + st.mcsLevel + ' · factory ' + st.factory + ' · school ' + (st.school || 0) +
    ' · CML levels ' + sc.techLevels + ' · standardisations ' + sc.standardized);
  md.push('* Missions ' + st.stats.missions + ': success ' + st.stats.success + ', partial ' + st.stats.partial +
    ', failure ' + st.stats.fail + ', expired ' + st.stats.expired);
  md.push('* Tests ' + st.stats.testLaunches + ' · cash ' + Math.round(st.money) +
    ' $ · fund ' + Math.round(st.groundFund) + ' $ · NP ' + Math.round(st.np));
  md.push('* Operations: flights ' + (st.stats.opsFlights || 0) + ' · sessions ' + (st.stats.opsSessions || 0) +
    ' · events ' + (st.stats.opsEvents || 0) + ' · incidents ' + (st.stats.opsIncidents || 0) +
    ' · early acceptances ' + (st.stats.opsEarlyEnds || 0) + ' · extensions ' + (st.stats.opsOvertime || 0) +
    ' (' + Math.round(st.stats.opsOvertimeSpent || 0) + ' $) · max channels ' + (st.stats.opsMaxLoad || 0) +
    ', overload ' + (st.stats.opsOverloadSteps || 0) + ' step(s).');
  md.push('');
  md.push('| # | Step | Mission | Point | Trajectory | P | S_det | Verdict | +rating | +VChK | Price | Advance |');
  md.push('|---|-----|--------|-------|------------|---|-------|---------|-----|------|------|-------|');
  sess.journal.forEach((j, i) => {
    md.push('| ' + (i + 1) + ' | ' + j.step + ' | ' + j.name + ' | ' + pointName(j.point) + ' | ' +
      trajName(j.traj) + ' | ' + num(j.p, 3) + ' | ' + num(j.sAct, 1) + ' | ' + j.verdict +
      (j.stage && j.stage !== 'ok' ? ' (' + j.stage + ')' : '') + ' | ' + num(j.dRating, 1) + ' | ' +
      num(j.dVchk, 1) + ' | ' + j.price + ' | ' + j.advance + ' |');
  });
  md.push('');
  md.push('## Review questions (docs/PLAYTEST.md §4)');
  md.push('');
  md.push('1. Was the decision "which instrument to install" interesting?');
  md.push('2. Did the school feel like an alternative to the MCC/factory?');
  md.push('3. Was there enough NP and PM? Where did you hit the wall most often?');
  md.push('4. Were there missions nobody wanted to take? Why?');
  md.push('5. Did the plan (build verdict) match the actual outcome?');
  const csv = ['step;mission;point;trajectory;p;s_det;verdict;stage;d_rating;d_vchk;price;advance;d_money'];
  sess.journal.forEach((j) => {
    csv.push([j.step, j.name, pointName(j.point), trajName(j.traj), num(j.p, 3), num(j.sAct, 1),
      j.verdict, j.stage, num(j.dRating, 2), num(j.dVchk, 2), j.price, j.advance, Math.round(j.dMoney)].join(';'));
  });
  const mdFile = path.join(playDir, 'session-' + sess.seed + '.md');
  const csvFile = path.join(playDir, 'session-' + sess.seed + '.csv');
  fs.writeFileSync(mdFile, md.join('\n') + '\n', 'utf8');
  fs.writeFileSync(csvFile, csv.join('\n') + '\n', 'utf8');
  return 'Report written:\n  ' + mdFile + '\n  ' + csvFile + '\nmissions in the journal: ' + sess.journal.length;
}

function cmdUndo(a) {
  let seed = Number(a.seed);
  if (!Number.isFinite(seed)) {
    const files = fs.existsSync(playDir)
      ? fs.readdirSync(playDir).filter((f) => /^session-\d+\.prev\.json$/.test(f)) : [];
    if (files.length === 1) seed = Number(files[0].match(/session-(\d+)\.prev\.json/)[1]);
  }
  if (!Number.isFinite(seed)) return 'pass --seed N (available undos: ' +
    (fs.existsSync(playDir) ? fs.readdirSync(playDir).filter((f) => /\.prev\.json$/.test(f)).length : 0) + ')';
  const prev = prevPath(seed);
  if (!fs.existsSync(prev)) return 'no save to undo: ' + prev;
  fs.copyFileSync(prev, sessionPath(seed));
  const sess = hydrate(JSON.parse(fs.readFileSync(prev, 'utf8')));
  return 'Session ' + seed + ' undone: step ' + sess.state.step + ', actions ' + sess.actionsLeft +
    ', missions in the journal ' + sess.journal.length + '.';
}

function selftest() {
  const run = (seed) => {
    const sess = sessionFromSeed(seed, CONFIG.campaign.steps);
    const prints = [];
    for (let step = 1; step <= CONFIG.campaign.steps; step++) {
      if (sess.state.offers.length && sess.state.production.length < CONFIG.campaign.productionSlots) {
        const ch = ENGINE.campaignBuild(sess.state, missionById(sess.state.offers[0]));
        if (ch && ch.pmRate <= ENGINE.pmAvailable(sess.state) && ch.prodTime <= ch.compute.deadline) {
          prints.push(cmdAccept(sess, { mission: sess.state.offers[0], auto: true }));
        }
      }
      while (sess.actionsLeft > 0) {
        const nextLevel = (sess.state.school || 0) + 1;
        const cost = ENGINE.schoolUpgradeCost(nextLevel);
        if (!cost || sess.state.money < cost.money + 100) break;
        const text = cmdPrep(sess, { _: ['school'] });
        prints.push(text);
        if (text.indexOf('Actions left') === -1) break;
      }
      prints.push(cmdLaunch(sess, {}));
      if (step < CONFIG.campaign.steps) prints.push(cmdNext(sess));
    }
    prints.push(cmdFinish(sess));
    return {
      json: JSON.stringify(serialize(sess)),
      total: sess.state.score.total,
      missions: sess.state.stats.missions,
      school: sess.state.school,
      journal: sess.journal.length,
      prints: prints
    };
  };
  const a = run(777);
  const b = run(777);
  const sameState = a.json === b.json;
  const samePrint = JSON.stringify(a.prints) === JSON.stringify(b.prints);
  console.log('Session 777: score ' + num(a.total, 1) + ', missions ' + a.missions +
    ', school ' + a.school + ', entries ' + a.journal);
  console.log('State matches:  ' + (sameState ? 'yes' : 'NO'));
  console.log('Output matches: ' + (samePrint ? 'yes' : 'NO'));
  if (!sameState || !samePrint) {
    console.log('Determinism broken — look for Math.random or iteration order in the engine.');
    return false;
  }
  console.log('Determinism: two runs of the same scenario gave the same result.');
  return true;
}


/* ---------- CLI ---------- */
const argv = process.argv.slice(2);
const cmd = (argv[0] || 'show').toLowerCase();
const a = parseArgs(argv.slice(1));
const COMMANDS = 'new · show · offers · cards · build · accept · launch · ops · overtime · close · prep · next · finish · report · undo · selftest';

if (cmd === 'selftest') {
  process.exitCode = selftest() ? 0 : 1;
} else if (cmd === 'new') {
  const r = cmdNew(a);
  if (r.err) {
    console.log(r.err);
    process.exitCode = 2;
  } else {
    save(r.sess);
    console.log(r.text);
    console.log('\nSession: ' + sessionPath(r.sess.seed));
  }
} else if (cmd === 'cards') {
  console.log(cmdCards());
} else if (cmd === 'undo') {
  console.log(cmdUndo(a));
} else {
  const l = load(Number.isFinite(Number(a.seed)) && a.seed != null ? Number(a.seed) : null);
  if (l.err) {
    console.log(l.err);
    process.exitCode = 2;
  } else {
    const sess = l.sess;
    let text = '';
    if (cmd === 'show') text = describeState(sess);
    else if (cmd === 'offers') text = cmdOffers(sess);
    else if (cmd === 'build') text = cmdBuild(sess, a);
    else if (cmd === 'accept') text = cmdAccept(sess, a);
    else if (cmd === 'launch') text = cmdLaunch(sess, a);
    else if (cmd === 'ops') text = cmdOps(sess);
    else if (cmd === 'overtime') text = cmdOvertime(sess, a);
    else if (cmd === 'close') text = cmdClose(sess, a);
    else if (cmd === 'prep') text = cmdPrep(sess, a);
    else if (cmd === 'next') text = cmdNext(sess);
    else if (cmd === 'finish') text = cmdFinish(sess);
    else if (cmd === 'report') text = cmdReport(sess);
    else text = 'Unknown command: ' + cmd + '\ncommands: ' + COMMANDS;
    if (['accept', 'launch', 'ops', 'overtime', 'close', 'prep', 'next', 'finish'].indexOf(cmd) !== -1) save(sess);
    console.log(text);
  }
}

