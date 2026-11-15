/* Data and calculation checks: node tools/check.mjs [games] */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const ctx = { console };
vm.createContext(ctx);
['data/config.js', 'data/cards.js', 'data/missions.js', 'data/engine.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
});
const { CONFIG, CARDS, MISSIONS, SALVAGE, ENGINE } = ctx;

let errors = 0;
const ok = (cond, msg) => { if (!cond) { errors++; console.log('  FAIL ' + msg); } else { console.log('  ok   ' + msg); } };

console.log('\n=== 1. Data integrity ===');
const ids = new Set();
Object.keys(CARDS).forEach((deck) => {
  CARDS[deck].forEach((c) => {
    if (ids.has(c.id)) { errors++; console.log('  duplicate id: ' + c.id); }
    ids.add(c.id);
    if (!c.name) { errors++; console.log('  no name: ' + c.id); }
  });
});
MISSIONS.forEach((m) => {
  if (ids.has(m.id)) { errors++; console.log('  duplicate mission id: ' + m.id); }
  ids.add(m.id);
});
const copiesOf = (c) => CONFIG.deckCopies[c.id] != null ? CONFIG.deckCopies[c.id] : (c.copies == null ? 1 : c.copies);
const campaignDecks = ['campaignMcs', 'campaignTests', 'groundContracts', 'opsEvents'];
/* the std/exp2 variants are not separate cards of the base deck but the continuation
 * of the experimental ladder; they are not part of the 68/205 count.
 */
const variantDecks = ['standardRockets', 'experimentalRockets', 'standardInstruments', 'experimentalInstruments'];
const coreDecks = Object.keys(CARDS).filter((k) => campaignDecks.indexOf(k) === -1 && variantDecks.indexOf(k) === -1);
const coreTypes = coreDecks.reduce((a, k) => a + CARDS[k].length, 0);
const coreCopies = coreDecks.reduce((a, k) => a + CARDS[k].reduce((b, c) => b + copiesOf(c), 0), 0);
const salvageCopies = SALVAGE.reduce((a, c) => a + copiesOf(c), 0);
ok(coreTypes === 68 && coreCopies === 205, 'base decks: 68 kinds / 205 cards');
ok(MISSIONS.length === 27 && SALVAGE.length === 4, 'missions 27 + salvage 4');
ok(coreTypes + MISSIONS.length + SALVAGE.length === 99 && coreCopies + MISSIONS.length + salvageCopies === 236,
  'total 99 kinds / 236 cards');
ok(CARDS.events.length === 13 && CARDS.events.reduce((a, c) => a + (c.copies || 0), 0) === 28,
  'events: 13 kinds / 28 cards');
ok(MISSIONS.every((m) => CONFIG.points[m.point]), 'every mission has a valid point');
ok(MISSIONS.every((m) => (m.trajectories || []).every((t) => CONFIG.trajectories[t])), 'every mission trajectory is described in CONFIG');
ok(MISSIONS.every((m) => Math.abs(m.targetValue - (20 + 10 * m.complexity)) < 0.01), 'targetValue = 20 + 10·complexity');
ok(CARDS.rockets.length === 5 && CARDS.instruments.length === 5, '5 launchers, 5 instruments');
ok(!!CONFIG.campaign.ops && CONFIG.campaign.ops.capacity.length === 5, 'v1.5: the campaign.ops block is present (5 MCC levels)');
ok(CARDS.opsEvents.length === 8 && CARDS.opsEvents.reduce((a, c) => a + (c.copies || 0), 0) === 14,
  'flight events: 8 kinds / 14 cards');
ok(MISSIONS.every((m) => Number.isInteger(m.flight) && m.flight >= 1 && m.flight <= CONFIG.campaign.ops.flightMax),
  'every mission has flight in 1..' + CONFIG.campaign.ops.flightMax);
ok(MISSIONS.filter((m) => m.point === 'deep').every((m) => m.flight === CONFIG.campaign.ops.flightMax),
  'deep space flies the maximum number of steps');

console.log('\n=== 2. The "payload to the target" table (kg) ===');
const pts = Object.keys(CONFIG.points);
console.log('  launcher    ' + pts.map((p) => CONFIG.points[p].name.padEnd(16)).join(''));
CARDS.rockets.forEach((r) => {
  const row = pts.map((p) => String(Math.round(r.payload * 1000 / CONFIG.points[p].k)).padStart(16));
  console.log('  ' + r.name.replace('Upper stage ', '').padEnd(12) + row.join(''));
});

console.log('\n=== 3. Reference builds (§12) ===');
const ref = ENGINE.referenceBuilds();
ref.forEach((r) => {
  const flag = Math.abs(r.delta) <= 0.02 ? 'ok  ' : 'diff';
  console.log('  ' + flag + ' ' + r.label.padEnd(44) +
    ' P=' + r.computed.toFixed(3) + ' (target ' + r.expected.toFixed(2) + ', Δ ' + (r.delta > 0 ? '+' : '') + r.delta.toFixed(3) + ')' +
    '  [launch ' + r.pLaunch + ' · build ' + r.pCollect + ' · channel ' + r.pChannel + ']');
});
ok(Math.abs(ref[0].delta) <= 0.02, 'build #1 reproduces 0.68');
ok(Math.abs(ref[1].delta) <= 0.02, 'build #2 reproduces 0.76');
ok(Math.abs(ref[2].delta) <= 0.02, 'build #3 reproduces 0.50');
ok(Math.abs(ref[3].delta) <= 0.02, 'platform duplication reproduces 0.77');
ok(Math.abs(ref[4].delta) <= 0.02, 'modular build + duplication reproduces 0.84');
ok(Math.abs(ref[5].delta) <= 0.02, 'experimental launcher reproduces 0.45');

console.log('\n=== 4. Example: Luna 9 (landing) ===');
const luna = MISSIONS.find((m) => m.id === 'm_luna9');
const sel = {
  rocketId: 'rocket_medium', reservationId: 'res_single', controlId: 'ctrl_advanced',
  instruments: [{ id: 'ins_camera', count: 1 }, { id: 'ins_spectrometer', count: 1 }],
  antennaId: 'ant_medium', powerId: 'pwr_solar_medium', bufferId: 'buf_2',
  physical: ['phy_lander'], moduleBuild: true
};
const lc = ENGINE.compute(sel, luna, 'landing', { unique: CONFIG.uniqueness.first });
console.log('  mass ' + (lc.massKg / 1000).toFixed(3) + ' t of ' + (lc.capacityKg / 1000).toFixed(3) + ' t, price ' + lc.price + ' $, PM ' + lc.pm);
console.log('  P = ' + lc.pSuccess.toFixed(3) + ' (launch ' + lc.pLaunch.toFixed(3) + ' · build ' + lc.pCollect.toFixed(3) + ' · channel ' + lc.pChannel.toFixed(3) + ')');
console.log('  D_ratio = ' + lc.data.ratio.toFixed(2) + ', S(on success) = ' + lc.sDet.toFixed(1) + ', S(expected) = ' + lc.s.toFixed(1) + ' / target ' + lc.target + ' → ' + lc.verdict);
console.log('  Δrating ' + lc.dRating + ', ΔVChK ' + lc.dVchk + ', payment ' + lc.reward + ' $');
lc.checks.forEach((ch) => console.log('    ' + (ch.ok ? '✓' : '✗') + ' ' + ch.label + ': ' + ch.detail));

console.log('\n=== 4.1. P0 regressions ===');
const lunaContract = ENGINE.contract(luna);
ok(lunaContract.advance === 1360, 'E.contract(Luna 9).advance = 1360');
ok(lc.advance === 1360 && lc.bonus === 340 && lc.reward === 1700,
  'compute(Luna 9): advance 1360 + bonus 340 = 1700');

const cassini = MISSIONS.find((m) => m.id === 'm_cassini');
const cassiniContract = ENGINE.contract(cassini);
const cassiniCap = Math.min(CONFIG.start.money + cassiniContract.advance,
  cassiniContract.advance * CONFIG.contractReward.capFactor);
const cassiniChoice = ENGINE.chooseBuild(cassini, { money: CONFIG.start.money, cap: cassiniCap, used: {} }, CONFIG.uniqueness.first);
ok(!!cassiniChoice && cassiniChoice.compute.price <= cassiniCap,
  'chooseBuild(Cassini) finds a build within the 1.35·advance cap (' + Math.round(cassiniCap) + ' $)');

const noMoney = ENGINE.compute(sel, luna, 'landing', { unique: CONFIG.uniqueness.first, money: 0 });
ok(noMoney.moneyOk === false && noMoney.feasible === false, 'the budget is part of feasible');

const fallback = ENGINE.compute(sel, luna, 'unknown-trajectory', { unique: CONFIG.uniqueness.first });
ok(fallback.trajectoryId === 'landing' && fallback.trajectory === CONFIG.trajectories.landing,
  'an unknown trajectory falls back to the first available one and returns its id');

const hubble = MISSIONS.find((m) => m.id === 'm_hubble');
const lowDataSel = {
  rocketId: 'rocket_heavy', reservationId: 'res_single', controlId: 'ctrl_redundant',
  instruments: [{ id: 'ins_camera', count: 5 }], antennaId: 'ant_small',
  powerId: 'pwr_solar_large', physical: [], moduleBuild: false
};
const lowData = ENGINE.compute(lowDataSel, hubble, 'direct', { unique: CONFIG.uniqueness.first, money: 5000 });
ok(lowData.feasible && lowData.data.ratio < CONFIG.success.minDataRatioForFull && lowData.sDet >= lowData.target,
  'D_ratio < 0.5 does not make the build impossible');
ok(lowData.verdictKey === 'success', 'D_ratio < 0.5 forbids a full success only, not a success');
ok(lowData.checks.find((ch) => ch.id === 'data').soft === true, 'the data check is marked soft');
const lowDataPlay = ENGINE.playMission(lowData, () => 0);
ok(lowDataPlay.key === 'success' && lowDataPlay.stage === 'ok',
  'playMission: D_ratio < 0.5 gives a success, not a full success');

const partialSel = {
  rocketId: 'rocket_medium', reservationId: 'res_single', controlId: 'ctrl_basic',
  instruments: [{ id: 'ins_camera', count: 2 }], antennaId: 'ant_small',
  powerId: 'pwr_solar_medium', physical: [], moduleBuild: false
};
const partial = ENGINE.compute(partialSel, hubble, 'direct', { unique: 0.8, money: 5000 });
ok(partial.feasible && partial.verdictKey === 'partial', 'partial success is reachable');
ok(partial.bonus === Math.round(ENGINE.contract(hubble).bonus * CONFIG.contractReward.partialBonus),
  'partial success pays 0.5 of the bonus');

const failLaunch = ENGINE.rolesFor('fail', 'launch');
const failCollect = ENGINE.rolesFor('fail', 'collect');
ok(failLaunch.eng === -2 && failLaunch.man === -1 && failLaunch.sci === 0, 'roles on a launch failure: −2/0/−1');
ok(failCollect.eng === 1 && failCollect.sci === -1 && failCollect.man === 0, 'roles on a build/channel failure: +1/−1/0');
ok(ENGINE.rolesFor('partial', 'ok').eng === 1, 'roles on a partial success: +1/+1/+1');

console.log('\n=== 5. Monte Carlo ===');
const games = Number(process.argv[2] || 40);
const mc = ENGINE.runMonteCarlo(games, 12345);
console.log('  games: ' + mc.games + ', missions per game: ' + mc.avgMissions);
console.log('  rating: ' + mc.avgRating + ' (target > 40) | VChK: ' + mc.avgVchk);
console.log('  success: ' + mc.successRate + '% | partial: ' + mc.partialRate + '% | failure: ' + mc.failRate + '% (target 15-35%)');
console.log('  duplication: ' + mc.dupRate + '% of missions (launcher ' + mc.dupRocketRate + '%, FCS ' + mc.dupCtrlRate + '%) | experimental launcher/instrument: ' + mc.expRate + '% | experimental subsystems: ' + mc.expSubsystemRate + '% | pwr_exp: ' + mc.powerExpRate + '% | salvage: ' + mc.salvageRate + '%');
console.log('  average build price: ' + mc.avgPrice + ' $ | left: ' + mc.avgMoney + ' $ | skipped: ' + mc.skipRate + '%');
console.log('  average P_success of the chosen builds: ' + mc.avgPSuccess);
console.log('  failure stages: launch ' + mc.stages.launch + '%, build ' + mc.stages.collect + '%, channel ' + mc.stages.channel + '%, physics ' + mc.stages.physical + '%, reached S ' + mc.stages.ok + '%');
console.log('  role points (average per game): eng ' + mc.avgRoles.eng + ', sci ' + mc.avgRoles.sci + ', mgr ' + mc.avgRoles.man);
console.log('  experimental cards (all): ' + JSON.stringify(mc.expCards));

ok(Math.abs(mc.successRate + mc.partialRate + mc.failRate - 100) < 0.3, 'mission outcomes add up to 100%');
ok(Math.abs(mc.stages.launch + mc.stages.collect + mc.stages.channel + mc.stages.physical + mc.stages.ok - 100) < 0.3,
  'the stages (physics included) add up to 100%');
if (games >= 100) {
  ok(mc.avgRating > 40, 'average rating > 40 (' + mc.avgRating + ')');
  ok(mc.failRate >= 15 && mc.failRate <= 35, 'failures inside the 15–35% corridor (' + mc.failRate + '%)');
  ok(mc.dupRocketRate < 40 && mc.dupCtrlRate < 40, 'launcher and FCS duplication < 40%');
  ok(mc.expRate < 20, 'experimental launcher/instrument < 20% (' + mc.expRate + '%)');
  ok(mc.avgPSuccess >= 0.68 && mc.avgPSuccess <= 0.72, 'average P_success 0.68–0.72 (' + mc.avgPSuccess + ')');
  ok(mc.skipRate < 10, 'skipped < 10% (' + mc.skipRate + '%)');
  ok(mc.avgMissions >= 9.5, 'missions per game ≥ 9.5 (' + mc.avgMissions + ')');
}
console.log('\n  journal of the first game:');
mc.gamesArr[0].log.forEach((l) => console.log('    ' + l));

console.log('\n=== 6. Campaign v1.5 ===');
const campState = ENGINE.campaignSetup(424242);
ok(campState.offers.length === CONFIG.campaign.showcase, 'the campaign showcase is full');
ok(campState.tech.rocket.light === CONFIG.tech.baseLevel, 'the CML starts at the base level');
const mcs0 = ENGINE.mcsMods(0, 2);
const mcs4 = ENGINE.mcsMods(4, 5);
ok(mcs4.capacity === CONFIG.mcs.capacity[4] && mcs4.pChannel > mcs0.pChannel,
  'MCC 4 gives more launches and +channel p');
const mcsDeficit = ENGINE.mcsMods(3, 2);
ok(mcsDeficit.levelEff < 3, 'a manager shortage lowers the effective MCC level');

const campSel = {
  rocketId: 'rocket_medium', reservationId: 'res_single', controlId: 'ctrl_basic',
  instruments: [{ id: 'ins_camera', count: 1 }], antennaId: 'ant_small',
  powerId: 'pwr_solar_medium', physical: [], moduleBuild: false
};
const plainC = ENGINE.compute(campSel, hubble, 'direct', { unique: 1, money: 5000 });
const mcsC = ENGINE.compute(campSel, hubble, 'direct', {
  unique: 1, money: 5000, mcsLevel: 4, managers: 5
});
const techC = ENGINE.compute(campSel, hubble, 'direct', {
  unique: 1, money: 5000,
  tech: { rocket: { medium: 4 }, instrument: { camera: 2 } }
});
ok(mcsC.pChannel > plainC.pChannel && mcsC.pSuccess > plainC.pSuccess,
  'the MCC raises P_channel and P_success');
ok(techC.pSuccess > plainC.pSuccess, 'R&D raises reliability');

/* --- school: instrument p, preparation PM, slots, standardisation --- */
const school0 = ENGINE.compute(campSel, hubble, 'direct', { unique: 1, money: 5000, schoolLevel: 0 });
const school4 = ENGINE.compute(campSel, hubble, 'direct', { unique: 1, money: 5000, schoolLevel: 4 });
ok(school4.pSuccess > school0.pSuccess, 'the school raises the instrument p');
ok(school4.pm < school0.pm, 'the school lowers the mission PM (' + school0.pm + ' → ' + school4.pm + ')');
ok(school4.slots.total === school0.slots.total + 1, 'school 4 gives +1 FCS slot');
const schState = ENGINE.campaignSetup(11);
schState.money = 5000; schState.np = 500; schState.pmPrepUsed = 0;
const sch1 = ENGINE.upgradeSchool(schState);
ok(sch1.ok && schState.school === 1 && schState.money < 5000 && schState.np < 500,
  'school 1 is bought with money, PM and NP');
schState.pmPrepUsed = 0;
const sch2 = ENGINE.upgradeSchool(schState);
ok(sch2.ok && ENGINE.schoolFor(schState).level === 2 &&
  ENGINE.schoolMods(2).pmFactor < ENGINE.schoolMods(1).pmFactor,
  'school 2 is bought and lowers the preparation PM');
const stdSchool = ENGINE.campaignSetup(12);
stdSchool.money = 5000; stdSchool.school = 1; stdSchool.expSeen = { ins_exp: true };
const std1 = ENGINE.standardize(stdSchool, 'ins_exp');
ok(std1.ok, 'school 1 opens instrument standardisation without CML 3');
const stdDisc = ENGINE.campaignSetup(13);
stdDisc.money = 5000; stdDisc.school = 3; stdDisc.expSeen = { ins_exp: true };
const std3 = ENGINE.standardize(stdDisc, 'ins_exp');
ok(std3.ok && std3.cost.money === Math.round(CONFIG.tech.standardizeCost.money * 0.8),
  'school 3 gives −20% on standardisation (' + (std3.cost || {}).money + ' $)');
const stdRocket = ENGINE.campaignSetup(14);
stdRocket.money = 5000; stdRocket.school = 4; stdRocket.expSeen = { rocket_exp: true };
ok(!ENGINE.standardize(stdRocket, 'rocket_exp').ok, 'a launcher needs CML 3 even with school 4');

/* --- experimental ladder: launch risk and std cards --- */
const ladder = ENGINE.campaignSetup(15);
const expRocket = ENGINE.card('rocket_exp');
const stdRocket1 = ENGINE.card('rocket_std1');
const expRocket2 = ENGINE.card('rocket_exp2');
const stdRocket2 = ENGINE.card('rocket_std2');
const riskP0 = ENGINE.cardPFor(ladder, expRocket, { kind: 'rocket' });
ok(ENGINE.isExpCard(expRocket) && ENGINE.expRiskPenalty(ladder, expRocket) < 0,
  'an experimental card starts with launch risk');
ok(!ENGINE.isCardAvailable(ladder, stdRocket1) && !ENGINE.isCardAvailable(ladder, expRocket2),
  'std1 and exp2 are locked until standardisation');
ladder.tech.rocket.medium = 3; ladder.money = 5000;
const stdUnseen = ENGINE.standardize(ladder, 'rocket_exp');
ok(!stdUnseen.ok && /not been seen/.test(stdUnseen.reason || ''),
  'an experimental card that has not appeared cannot be standardised');
ENGINE.addExpRun(ladder, 'rocket_exp', 'launch');
const riskP1 = ENGINE.cardPFor(ladder, expRocket, { kind: 'rocket' });
ladder.expSeen = { rocket_exp: true };
const stdExp = ENGINE.standardize(ladder, 'rocket_exp');
ok(stdExp.ok && ENGINE.isCardAvailable(ladder, stdRocket1) && ENGINE.isCardAvailable(ladder, expRocket2),
  'standardisation opens std1 and exp2');
ok(ENGINE.cardBaseP(ladder, stdRocket1) === stdExp.standardP &&
  ENGINE.cardBaseP(ladder, stdRocket1) < ENGINE.cardBaseP(ladder, expRocket),
  'std1 fixes p without clearing the residual risk');
ENGINE.addExpRun(ladder, 'rocket_exp', 'flightRocket');
ENGINE.addExpRun(ladder, 'rocket_exp', 'stand');
const riskP3 = ENGINE.cardPFor(ladder, expRocket, { kind: 'rocket' });
ok(riskP1 > riskP0 && riskP3 > riskP1 && ENGINE.expRiskPenalty(ladder, expRocket) === 0,
  'three launches clear the risk of an experimental card');
ok(ENGINE.cardBaseP(ladder, stdRocket1) === stdExp.standardP,
  'the standardised p does not grow with the trial card');
ok(!ENGINE.isCardAvailable(ladder, stdRocket2), 'std2 is locked until exp2 is standardised');
ladder.expSeen.rocket_exp2 = true;
const stdExp2 = ENGINE.standardize(ladder, 'rocket_exp2');
ok(stdExp2.ok && ENGINE.isCardAvailable(ladder, stdRocket2), 'standardising exp2 opens std2');
ok(ENGINE.combosFor(ladder).some(function (c) {
  return c.instruments.some(function (o) { return o.id === 'ins_exp'; });
}), 'the instrument combinations include the experimental card');

const upState = ENGINE.campaignSetup(7);
upState.money = 5000; upState.np = 500;
upState.ip.instrument.camera = 20;
const up = ENGINE.upgradeTech(upState, 'instrument', 'camera');
ok(up.ok && upState.tech.instrument.camera === 2 && upState.money < 5000, 'a CML upgrade spends money and the IP threshold');
const testState = ENGINE.campaignSetup(8);
testState.money = 5000; testState.np = 500; testState.pmPrepUsed = 0;
const testRes = ENGINE.testLaunch(testState, 'stand', {}, () => 0);
ok(testRes.ok && testRes.success && testRes.ip > 0, 'a test gives IP');

const standCardState = ENGINE.campaignSetup(16);
standCardState.money = 5000; standCardState.np = 500; standCardState.pmPrepUsed = 0;
standCardState.testUsed = false;
const standBefore = (standCardState.expRuns && standCardState.expRuns.ins_exp) || 0;
const standCardRes = ENGINE.testLaunch(standCardState, 'stand',
  { cardId: 'ins_exp', ipKind: 'instrument', ipClass: 'camera' }, () => 0);
ok(standCardRes.ok && standCardRes.expRun && standCardRes.expRun.source === 'stand' &&
  standCardState.expRuns.ins_exp === standBefore + 1 && standCardRes.expRun.cardId === 'ins_exp',
  'the stand accepts a cardId and clears the risk of exactly that card');

const gcState = ENGINE.campaignSetup(9);
const fund0 = gcState.groundFund;
const gc = ENGINE.groundContract(gcState, 'gc_survey');
ok(gc.ok && gcState.groundFund === fund0 + 80 && gcState.stats.missions === 0,
  'a ground contract tops up the fund and does not count as a mission');
const ip0 = gcState.ip.instrument.camera || 0;
const gcIp = ENGINE.groundContract(gcState, 'gc_telemetry', { ipKind: 'instrument', ipClass: 'camera' });
ok(gcIp.ok && gcIp.ip === 1 && gcState.ip.instrument.camera === ip0 + 1,
  'a telemetry contract adds IP to an instrument');

const camp = ENGINE.runCampaignMonteCarlo(Math.min(games, 40), 20260101);
console.log('  games: ' + camp.games + ', missions per game: ' + camp.avgMissions +
  ', accepted: ' + camp.avgAccepted);
console.log('  final score: ' + camp.avgScore + ' | rating: ' + camp.avgRating +
  ' | VChK: ' + camp.avgVchk);
console.log('  success: ' + camp.successRate + '% | partial: ' + camp.partialRate +
  '% | failure: ' + camp.failRate + '% | expired: ' + camp.expiredRate + '%');
console.log('  MCC: ' + camp.avgMcs + ' | factory: ' + camp.avgFactory + ' | school: ' + camp.avgSchool +
  ' | CML levels: ' + camp.avgTech + ' | standardisations: ' + camp.avgStandardized +
  ' | tests: ' + camp.avgTests);
console.log('  money: ' + camp.avgMoney + ' $ | fund: ' + camp.avgFund +
  ' $ | mission price: ' + camp.avgPrice + ' $ | P: ' + camp.avgPSuccess);
ok(camp.avgScore >= 80, 'average final score ≥ 80 (' + camp.avgScore + ')');
ok(camp.avgMissions >= 9 && camp.avgMissions <= 14,
  'missions per campaign 9–14 (' + camp.avgMissions + ')');
/* The school lowers failures by 2–4 pp, hence the wider corridor compared with §5 without it. */
ok(camp.failRate >= 13 && camp.failRate <= 33, 'campaign failures 13–33% (' + camp.failRate + '%)');
ok(Math.abs(camp.avgMoney) <= 2500, 'cash left within ±2500 $ (' + camp.avgMoney + ' $)');

console.log('\n=== 6b. Flight and MCC (v1.5) ===');
/* --- 11. Flight: steps, MCC load, channels --- */
ok(MISSIONS.every((m) => ENGINE.flightSteps(m) === m.flight), 'flightSteps matches the mission card');
const longMission = Object.assign({}, luna, { flight: undefined, missionTime: 48, point: 'mars' });
ok(ENGINE.flightSteps(longMission) === CONFIG.campaign.ops.flightMax,
  'a long deep-space mission gets flightMax steps (' + ENGINE.flightSteps(longMission) + ')');

const opsState = ENGINE.campaignSetup(777);
opsState.money = 100000;
const lunaC = ENGINE.campaignCompute(opsState, sel, luna, 'landing', { money: 100000 });
const lunaP = { missionId: luna.id, sel: sel, trajectoryId: 'landing' };
const fLuna = ENGINE.enterFlight(opsState, lunaP, lunaC, { physOk: true });
ok(fLuna.flight === luna.flight && fLuna.endStep === opsState.step + luna.flight - 1,
  'the Moon flight runs ' + luna.flight + ' step(s) and schedules acceptance');
ok(fLuna.load === 1 + (ENGINE.flightVideo(lunaC) ? CONFIG.campaign.ops.loadVideo : 0),
  'the Moon channel = base + video (' + fLuna.load + ')');

const deepOps = ENGINE.campaignSetup(778);
deepOps.money = 100000;
const deepC = ENGINE.campaignCompute(deepOps, sel, luna, 'landing', { money: 100000 });
const deepLoadLow = ENGINE.flightLoad(deepC, Object.assign({}, luna, { point: 'mars' }), 0);
const deepLoadHigh = ENGINE.flightLoad(deepC, Object.assign({}, luna, { point: 'mars' }), CONFIG.campaign.ops.deepFromLevel);
ok(deepLoadLow === deepLoadHigh + CONFIG.campaign.ops.loadDeep,
  'deep space loads the MCC by +1 channel while the level is below ' + CONFIG.campaign.ops.deepFromLevel);

ok(ENGINE.opsCapacity(ENGINE.campaignSetup(779)) === CONFIG.campaign.ops.capacity[0],
  'MCC 0 has ' + CONFIG.campaign.ops.capacity[0] + ' channels');
const planState = ENGINE.campaignSetup(780);
planState.money = 100000;
ENGINE.enterFlight(planState, lunaP, ENGINE.campaignCompute(planState, sel, luna, 'landing', { money: 100000 }), { physOk: true });
const plan = ENGINE.mcsLoadPlan(planState, 3);
ok(plan.length === 3 && plan[0].load >= 1 && plan[0].step === planState.step,
  'the MCC load plan shows 3 steps');
ok(ENGINE.opsIncidentP(0) < ENGINE.opsIncidentP(2) &&
  ENGINE.opsIncidentP(0) === CONFIG.campaign.ops.pIncidentBase &&
  ENGINE.opsIncidentP(99) === CONFIG.campaign.ops.pIncidentCap,
  'an MCC overload raises the incident p monotonically up to the ceiling');

const pOverloadSchool2 = ENGINE.opsIncidentP(2, 0, 2);
const pOverloadSchool4 = ENGINE.opsIncidentP(2, 0, 4);
ok(ENGINE.opsIncidentP(2, 0, 0) > pOverloadSchool2 && pOverloadSchool2 > pOverloadSchool4 &&
  ENGINE.opsIncidentP(0, 0, 4) === CONFIG.campaign.ops.pIncidentBase &&
  Math.abs(ENGINE.opsIncidentRelief(CONFIG.campaign.schoolUpgrades.length) -
    CONFIG.campaign.ops.pIncidentSchoolReliefMax) < 1e-9 &&
  ENGINE.opsIncidentP(99, 0, 4) === CONFIG.campaign.ops.pIncidentCap,
  'the school softens the MCC overload penalty (2 channels: ' +
  ENGINE.opsIncidentP(2, 0, 0).toFixed(3) + ' → ' +
  pOverloadSchool2.toFixed(3) + ' → ' + pOverloadSchool4.toFixed(3) + ')');



/* --- 12. Flight invariants: one channel roll, clean accrual --- */
const opsCfg = CONFIG.campaign.ops;
const savedEventChance = opsCfg.opsEventChance;
const savedIncidentBase = opsCfg.pIncidentBase;
opsCfg.opsEventChance = 0;
opsCfg.pIncidentBase = 0;
const invState = ENGINE.campaignSetup(781);
invState.money = 100000;
const invC = ENGINE.campaignCompute(invState, sel, luna, 'landing', { money: 100000 });
const invF = ENGINE.enterFlight(invState, lunaP, invC, { physOk: true });
const chTrace = [];
for (let i = 0; i < luna.flight; i++) {
  ENGINE.stepFlights(invState, () => 0, chTrace);
  invState.step++;
}
ok(!invState.flights.length, 'after the flight steps the flight is accepted');
ok(Math.abs(invF.accrued - invC.sRaw * invC.data.ratio) < 1e-6,
  'without events and incidents exactly sRaw·ratio is accrued');
ok(chTrace.filter((t) => t.stage === 'channel').length === 1,
  'p_channel is rolled once per flight (no repeated session rolls)');
ok(invF.ratioOps === invC.data.ratio,
  'a clean flight keeps data.ratio (ratioOps = ' + invF.ratioOps + ')');

/* --- 13. Acceptance overtime --- */
const otState = ENGINE.campaignSetup(782);
otState.money = 1000;
const otC = ENGINE.campaignCompute(otState, sel, luna, 'landing', { money: 100000 });
const otF = ENGINE.enterFlight(otState, lunaP, otC, { physOk: true });
const otMoney = otState.money;
const ot1 = ENGINE.overtime(otState, luna.id);
ok(ot1.ok && otState.money === otMoney - CONFIG.campaign.ops.overtime.money &&
  otF.overtime === 1 && otF.endStep === otF.nominalEndStep + 1,
  'overtime costs ' + CONFIG.campaign.ops.overtime.money + ' $ and adds a session');
ENGINE.overtime(otState, luna.id);
ok(!ENGINE.overtime(otState, luna.id).ok, 'overtime is limited to ' + CONFIG.campaign.ops.overtime.max + ' steps');
for (let i = 0; i < luna.flight + 2; i++) {
  ENGINE.stepFlights(otState, () => 0);
  otState.step++;
}
const otExpect = otC.sRaw * otC.data.ratio * CONFIG.campaign.ops.accrualBonus *
  (1 + 2 * CONFIG.campaign.ops.overtime.sBonusPerStep);
ok(Math.abs(otF.result.sAct - otExpect) < 1e-6,
  'acceptance after two extensions gives S=' + otF.result.sAct.toFixed(2));

/* --- 14. Early closure and finalisation --- */
const ceState = ENGINE.campaignSetup(783);
ceState.money = 100000;
const ceC = ENGINE.campaignCompute(ceState, sel, luna, 'landing', { money: 100000 });
ENGINE.enterFlight(ceState, lunaP, ceC, { physOk: true });
ENGINE.stepFlights(ceState, () => 0);
const ce = ENGINE.closeEarly(ceState, luna.id, () => 0);
ok(ce.ok && ce.report.earlyEnd && ce.report.compute === ceC, 'early closure runs the acceptance immediately');
ok(Math.abs(ce.report.result.sAct -
  ceC.sRaw * ce.report.ratioOps * CONFIG.campaign.ops.accrualBonus * CONFIG.campaign.ops.earlyEndSFactor) < 1e-6,
  'early closure gives the S multiplier ' + CONFIG.campaign.ops.earlyEndSFactor);

const finState = ENGINE.campaignSetup(784);
finState.money = 100000;
ENGINE.enterFlight(finState, lunaP, ENGINE.campaignCompute(finState, sel, luna, 'landing', { money: 100000 }), { physOk: true });
ENGINE.stepFlights(finState, () => 0);
const fin = ENGINE.finalizeFlights(finState, () => 0);
ok(fin.length === 1 && fin[0].final && !finState.flights.length,
  'the end of the campaign closes unfinished flights');

/* --- 15. The flight event deck --- */
ok(CARDS.opsEvents.reduce((a, c) => a + (c.copies || 0), 0) === 14 &&
  CARDS.opsEvents.every((c) => c.id && c.name && c.text), 'flight event deck: 8 kinds / 14 cards');
const evPress = ENGINE.applyOpsEvent(invState, invF, CARDS.opsEvents.find((c) => c.id === 'oe_press'));
const evFlare = ENGINE.applyOpsEvent(invState, invF, CARDS.opsEvents.find((c) => c.id === 'oe_flare'));
ok(evPress.quality === 1 && evFlare.quality <= 1 && evFlare.lost === !invC.build.buffer,
  'flight events are applied by the build (' + evPress.note + ' / ' +
  (evFlare.lost ? 'session lost: ' + evFlare.note : 'the buffer survived the flare') + ')');
opsCfg.opsEventChance = savedEventChance;
opsCfg.pIncidentBase = savedIncidentBase;

console.log('\n=== 7. Summary ===');
if (errors) { console.log('  errors: ' + errors); process.exitCode = 1; }
else console.log('  all checks passed');
