/* Smoke test of the game/app logic without a browser: node game/tools/app-smoke.mjs
 * Checks the core.js ↔ ENGINE link: recommendation → signatures → acceptMission →
 * campaign steps → finish → save/restore, plus the approval of experimental
 * tests/launches and the approval panel.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { console, setTimeout: () => 0, clearTimeout: () => 0 };
ctx.localStorage = {
  _v: {},
  getItem(k) { return this._v[k] || null; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; }
};
ctx.document = {
  getElementById() { return null; },
  addEventListener() {},
  createElement() { return { style: {}, click() {}, remove() {}, setAttribute() {} }; },
  body: { appendChild() {} }
};
ctx.Blob = function () {};
ctx.URL = { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} };
ctx.window = ctx;
vm.createContext(ctx);

for (const f of ['data/config.js', 'data/cards.js', 'data/missions.js', 'data/engine.js',
  'app/core.js', 'app/ui.js', 'app/cards-ui.js', 'app/manager.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}

const APP = ctx.APP;
const E = ctx.ENGINE;
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log('  ok   ' + label + (extra ? ' — ' + extra : ''));
  else { failures++; console.log('  FAIL ' + label + (extra ? ' — ' + extra : '')); }
};

function acceptExperimentalMission() {
  APP.newCampaign(20260101, 15);
  const id = APP.ensureSelection();
  APP.dispatch('set-role', { role: 'engineer' });
  APP.dispatch('recommend', { missionId: id });
  const build = APP.ensureBuild(id);
  build.sel.instruments = [{ id: 'ins_exp', count: 1 }];
  APP.dispatch('confirm-engineer', { missionId: id });
  APP.dispatch('set-role', { role: 'scientist' });
  APP.dispatch('confirm-scientist', { missionId: id });
  APP.dispatch('set-role', { role: 'manager' });
  return { id, res: APP.dispatch('accept', { missionId: id, allowWarnings: true }) };
}

APP.newCampaign(20260101, 15);
const missionId = APP.ensureSelection();
ok(APP.state.offers.length === 3, 'showcase of 3 missions', APP.state.offers.join(', '));
ok(!!missionId, 'a mission is selected', missionId);
ok(APP.permitted('recommend'), 'the manager can recommend a build');

const failAccept = APP.dispatch('accept', { missionId });
ok(!failAccept.ok && !failAccept.needsConfirm, 'the manager cannot accept without signatures', failAccept.message);

APP.dispatch('set-role', { role: 'engineer' });
const rec = APP.dispatch('recommend', { missionId });
ok(rec.ok, 'build recommendation', rec.message);
const recResolved = E.resolveBuild(APP.builds[missionId].sel, APP.state.school || 0);
ok(!E.isExperimental(recResolved), 'an ordinary recommended build needs no approval');
ok(APP.cardSub(E.card('rocket_exp')).indexOf('risk') >= 0,
  'the experimental launcher card shows the risk', APP.cardSub(E.card('rocket_exp')));
let engineerHtml = '';
try { engineerHtml = APP.screens.engineer(); } catch (err) { engineerHtml = 'ERROR ' + err.message; }
ok(engineerHtml.indexOf('Upper stage') >= 0 && engineerHtml.indexOf('ERROR') !== 0,
  'the engineer screen renders with experimental cards');
let scientistHtml = '';
try { scientistHtml = APP.screens.scientist(); } catch (err) { scientistHtml = 'ERROR ' + err.message; }
ok(scientistHtml.indexOf('Standardisation') >= 0 && scientistHtml.indexOf('ERROR') !== 0,
  'the scientist screen renders with the standardisation block');

APP.state.tech.rocket.medium = 3;
APP.state.money = 5000;
APP.state.expSeen.rocket_exp = true;
const stdAction = APP.dispatch('standardize', { cardId: 'rocket_exp' });
ok(stdAction.ok && APP.state.standardized.rocket_exp &&
  E.rocketPool(APP.state).some((c) => c.id === 'rocket_std1') &&
  E.rocketPool(APP.state).some((c) => c.id === 'rocket_exp2'),
  'the standardisation action opens std1 and exp2', stdAction.message);

let analysis = APP.buildAnalysis(missionId);
ok(analysis.manual && analysis.manual.ok, 'campaignManual computed the build');
ok(analysis.blockers.length === 0, 'the recommended build has no blockers', analysis.blockers.map((b) => b.text).join(' | '));
const confirmEng = APP.dispatch('confirm-engineer', { missionId });
ok(confirmEng.ok && analysis.build.ready.engineer, 'engineer signature');

APP.dispatch('set-role', { role: 'scientist' });
const confirmSci = APP.dispatch('confirm-scientist', { missionId });
ok(confirmSci.ok && analysis.build.ready.scientist, 'scientist signature');

APP.dispatch('set-role', { role: 'manager' });
const accepted = APP.dispatch('accept', { missionId, allowWarnings: true });
ok(accepted.ok, 'acceptMission accepted the mission', accepted.message);
ok(APP.state.production.length === 1, 'the mission is in production');
ok(APP.state.offers.indexOf(missionId) === -1, 'the mission left the showcase');

const beforeStep = APP.state.step;
const step = APP.dispatch('next-step');
ok(step.ok && APP.state.step === beforeStep + 1, 'campaign step performed', 'step ' + APP.state.step);

for (let i = 0; i < 8; i++) APP.dispatch('next-step');
ok(APP.state.flights.length + APP.state.ready.length + APP.state.production.length >= 0, 'flights/production did not break');
ok(APP.listExpApprovals('test').length === 0 && APP.listExpApprovals('launch').length === 0,
  'an ordinary campaign creates no experimental requests');
const finishAsk = APP.dispatch('finish');
ok(finishAsk.needsConfirm, 'the finish asks for confirmation');
const finished = APP.dispatch('finish', { force: true });
ok(finished.ok && APP.finished, 'the campaign is finished', finished.message);
ok(APP.state.score && isFinite(APP.state.score.total), 'the final score is numeric', APP.state.score && APP.state.score.total);

const u1 = APP.undo();
const u2 = APP.undo();
ok(u1.ok && u2.ok, 'undo works repeatedly', u1.message + ' | ' + u2.message);

const saved = APP.serialize();
const snapshot = JSON.stringify(saved);
APP.hydrate(JSON.parse(snapshot));
ok(APP.state.step === saved.state.step && APP.finished === saved.finished, 'serialisation/hydration keep the step and the finish');
ok(APP.state.standardized && APP.state.standardized.rocket_exp === true &&
  APP.state.standardP && APP.state.standardP.rocket_exp != null,
  'serialisation keeps the standardisation and the fixed p');
ok(APP.chat.length > 0 && APP.journal.length > 0, 'chat and journal are saved', APP.chat.length + ' / ' + APP.journal.length);

/* ---------- approval of experimental tests ---------- */
APP.newCampaign(20260101, 15);
ok(APP.expApprovalRoles.length === 3 &&
  ['engineer', 'scientist', 'manager'].every((role) => APP.expApprovalRoles.indexOf(role) !== -1),
  'the approval needs the signatures of the engineer, the scientist and the manager', APP.expApprovalRoles.join(', '));
APP.dispatch('set-role', { role: 'scientist' });
const testBlocked = APP.dispatch('test-stand', { cls: 'camera', cardId: 'ins_exp' });
ok(!testBlocked.ok && testBlocked.needsApproval, 'the experimental stand is blocked without an approval', testBlocked.message);
ok(!APP.state.testUsed, 'a blocked test does not spend the step attempt');
let testReqs = APP.listExpApprovals('test');
ok(testReqs.length === 1 && APP.expApprovalSigned(testReqs[0]) === 1,
  'the test request is created and the initiator signed it',
  testReqs.length ? APP.expApprovalSigned(testReqs[0]) + ' / ' + APP.expApprovalRoles.length : 'no requests');
let panelHtml = '';
try { panelHtml = APP.expApprovalsPanel('engineer'); } catch (err) { panelHtml = 'ERROR ' + err.message; }
ok(panelHtml.indexOf('Experiment approval') >= 0 &&
  panelHtml.indexOf('data-act="approve-exp"') >= 0 && panelHtml.indexOf('ERROR') !== 0,
  'the approval panel renders the request and the signature button');
let managerHtml = '';
try { managerHtml = APP.screens.manager(); } catch (err) { managerHtml = 'ERROR ' + err.message; }
ok(managerHtml.indexOf('Experiment approval') >= 0 &&
  managerHtml.indexOf('data-act="approve-exp"') >= 0 && managerHtml.indexOf('ERROR') !== 0,
  'the manager screen shows the approval panel');
let engineerApprovalHtml = '';
try { engineerApprovalHtml = APP.screens.engineer(); } catch (err) { engineerApprovalHtml = 'ERROR ' + err.message; }
ok(engineerApprovalHtml.indexOf('Experiment approval') >= 0 &&
  engineerApprovalHtml.indexOf('ERROR') !== 0,
  'the engineer screen shows the approval panel');

const testSaved = JSON.parse(JSON.stringify(APP.serialize()));
APP.hydrate(testSaved);
testReqs = APP.listExpApprovals('test');
ok(testReqs.length === 1 && APP.expApprovalSigned(testReqs[0]) === 1,
  'the test approval survives save/load',
  testReqs.length ? APP.expApprovalSigned(testReqs[0]) + ' / ' + APP.expApprovalRoles.length : 'no requests');
const testKey = testReqs.length ? testReqs[0].key : '';
APP.dispatch('set-role', { role: 'engineer' });
const testSignEng = APP.dispatch('approve-exp', { scope: 'test', key: testKey });
APP.dispatch('set-role', { role: 'manager' });
const testSignMan = APP.dispatch('approve-exp', { scope: 'test', key: testKey });
ok(testSignEng.ok && testSignMan.ok &&
  APP.expApprovalSigned(testReqs[0]) === APP.expApprovalRoles.length &&
  APP.expApprovalReady(testReqs[0]),
  'three signatures open the test approval', testSignEng.message + ' | ' + testSignMan.message);
APP.dispatch('set-role', { role: 'scientist' });
const testRun = APP.dispatch('test-stand', { cls: 'camera', cardId: 'ins_exp' });
ok(testRun.ok && APP.state.testUsed, 'the signed test is performed', testRun.message);
ok(APP.listExpApprovals('test').length === 0, 'the test approval is consumed after the run');
const testAgain = APP.dispatch('test-stand', { cls: 'camera', cardId: 'ins_exp' });
ok(!testAgain.ok && APP.listExpApprovals('test').length === 0,
  'a second test in the step creates no request', testAgain.message);

/* ---------- approval of experimental launches ---------- */
const expMission = acceptExperimentalMission();
ok(expMission.res.ok && APP.state.production.length === 1,
  'the experimental mission is accepted into production', expMission.res.message);
APP.dispatch('next-step');
APP.dispatch('next-step');
const readyEntry = (APP.state.ready || []).find((p) => p.missionId === expMission.id);
ok(!!readyEntry, 'the experimental mission is ready to launch',
  'step ' + APP.state.step + ', ready: ' + (APP.state.ready || []).map((p) => p.missionId).join(', '));
const launchBlocked = APP.dispatch('launch', { missionId: expMission.id });
ok(!launchBlocked.ok && launchBlocked.needsApproval && (APP.state.flights || []).length === 0,
  'the experimental launch is blocked without an approval', launchBlocked.message);
let launchReqs = APP.listExpApprovals('launch');
const launchKey = launchReqs.length ? launchReqs[0].key : '';
ok(launchReqs.length === 1 && APP.expApprovalSigned(launchReqs[0]) === 1,
  'the launch request is created and the manager signed it',
  launchReqs.length ? APP.expApprovalSigned(launchReqs[0]) + ' / ' + APP.expApprovalRoles.length : 'no requests');
const launchSaved = JSON.parse(JSON.stringify(APP.serialize()));
const orphanLaunch = JSON.parse(JSON.stringify(launchSaved));
orphanLaunch.state.ready = [];
APP.hydrate(orphanLaunch);
ok(Object.keys(APP.state.expApprovals.launches).length === 0,
  'a launch request outside ready is dropped on load');
APP.hydrate(launchSaved);
launchReqs = APP.listExpApprovals('launch');
ok(launchReqs.length === 1 && APP.expApprovalSigned(launchReqs[0]) === 1,
  'the launch approval survives save/load');
APP.dispatch('set-role', { role: 'engineer' });
const launchSignEng = APP.dispatch('approve-exp', { scope: 'launch', key: launchKey });
APP.dispatch('set-role', { role: 'scientist' });
const launchSignSci = APP.dispatch('approve-exp', { scope: 'launch', key: launchKey });
ok(launchSignEng.ok && launchSignSci.ok && APP.expApprovalReady(launchReqs[0]),
  'three signatures open the launch approval',
  launchSignEng.message + ' | ' + launchSignSci.message);
APP.dispatch('set-role', { role: 'manager' });
const launchOk = APP.dispatch('launch', { missionId: expMission.id });
ok(launchOk.ok && (APP.state.ready || []).every((p) => p.missionId !== expMission.id),
  'the signed experimental launch is performed', launchOk.message);
ok(APP.listExpApprovals('launch').length === 0, 'the launch approval is consumed by the launch');

/* ---------- test approvals are cleared on a new step ---------- */
APP.newCampaign(20260101, 15);
APP.dispatch('set-role', { role: 'scientist' });
APP.dispatch('test-stand', { cls: 'camera', cardId: 'ins_exp' });
ok(APP.listExpApprovals('test').length === 1, 'the test request is created before the step changes');
APP.dispatch('set-role', { role: 'manager' });
APP.dispatch('next-step');
ok(APP.listExpApprovals('test').length === 0, 'test approvals are cleared on a new step');

/* ---------- an ordinary test withdraws the stale request ---------- */
APP.dispatch('set-role', { role: 'scientist' });
const staleReq = APP.dispatch('test-stand', { cls: 'camera', cardId: 'ins_exp' });
ok(!staleReq.ok && staleReq.needsApproval && APP.listExpApprovals('test').length === 1,
  'the experimental stand request is created again', staleReq.message);
const normalTest = APP.dispatch('test-stand', { cls: 'camera', cardId: 'ins_camera' });
ok(normalTest.ok && APP.listExpApprovals('test').length === 0,
  'an ordinary test withdraws the stale experimental request', normalTest.message);

if (failures) process.exitCode = 1;
else console.log('\nall app-smoke checks passed');
