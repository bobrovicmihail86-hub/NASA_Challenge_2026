/* End-to-end smoke test for the multiplayer server.
 *
 *   node tools/server-smoke.mjs
 *
 * Boots server/index.mjs on a random local port with a throw-away data dir,
 * signs in, creates a team, plays a campaign through the HTTP API and checks
 * that role separation, live snapshots and the results archive behave.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8200 + Math.floor(Math.random() * 300);
const DATA = path.join(ROOT, 'server', 'data-smoke');
const BASE = 'http://127.0.0.1:' + PORT;

fs.rmSync(DATA, { recursive: true, force: true });

const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.mjs'),
  '--port', String(PORT), '--host', '127.0.0.1', '--data', DATA], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
child.stdout.on('data', function (d) { serverLog += String(d); });
child.stderr.on('data', function (d) { serverLog += String(d); process.stderr.write('[server] ' + d); });

const TRACE = path.join(ROOT, 'tools', 'smoke-trace.log');
fs.writeFileSync(TRACE, 'port=' + PORT + ' spawned=' + child.pid + '\n');
function trace(msg) {
  fs.appendFileSync(TRACE, String(msg) + '\n');
}
trace('spawned, waiting for health');

let failures = 0;
function check(cond, label, extra) {
  if (cond) {
    console.log('  ok   ' + label);
    trace('ok   ' + label);
  } else {
    failures += 1;
    console.error('  FAIL ' + label + (extra ? ' :: ' + JSON.stringify(extra) : ''));
    trace('FAIL ' + label + (extra ? ' :: ' + JSON.stringify(extra) : ''));
  }
}

async function waitForServer() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const r = await fetch(BASE + '/api/health', { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
      trace('health attempt ' + i + ' status ' + r.status);
    } catch (err) {
      if (i % 10 === 0) trace('health attempt ' + i + ' error ' + (err && err.message));
    }
    await new Promise(function (r) { setTimeout(r, 100); });
  }
  return false;
}

async function call(method, pathname, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-token'] = token;
  const res = await fetch(BASE + pathname, {
    method: method,
    headers: headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch (err) { json = null; }
  return { status: res.status, body: json };
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

async function main() {
  const up = await waitForServer();
  check(up, 'server answers /api/health');
  if (!up) throw new Error('server did not start:\n' + serverLog);

  const captain = 'captain@example.org';
  const mate = 'mate@example.org';
  const login = await call('POST', '/api/login', { email: captain });
  check(login.status === 200 && login.body.token, 'captain can sign in');
  const token = login.body.token;

  const badLogin = await call('POST', '/api/login', { email: 'not-an-email' });
  check(badLogin.status === 400, 'invalid e-mail is rejected');

  const created = await call('POST', '/api/teams', {
    name: 'Aurora',
    seed: 424242,
    maxSteps: 12,
    roster: [
      { email: captain, name: 'Captain', roles: ['manager', 'engineer', 'scientist', 'ops'] },
      { email: mate, name: 'Flight engineer', roles: ['ops'] }
    ]
  }, token);
  check(created.status === 200 && created.body.team && created.body.team.id, 'team is created', created.body);
  const teamId = created.body.team.id;

  const state1 = await call('GET', '/api/teams/' + teamId + '/state', null, token);
  check(state1.status === 200 && state1.body.snapshot, 'member receives a snapshot');
  check(Array.isArray(state1.body.history) && state1.body.history.length === 0, 'fresh archive is empty');

  const mateLogin = await call('POST', '/api/login', { email: mate });
  const mateToken = mateLogin.body.token;
  const outsider = await call('POST', '/api/login', { email: 'stranger@example.org' });
  const denied = await call('GET', '/api/teams/' + teamId + '/state', null, outsider.body.token);
  check(denied.status === 403, 'non-member is refused');

  const roleDenied = await call('POST', '/api/teams/' + teamId + '/action',
    { type: 'accept', payload: {}, role: 'ops' }, token);
  check(roleDenied.status === 403, 'role allow-list blocks ops from accepting a mission', roleDenied.body);

  const snap = state1.body.snapshot;
  const offers = (snap.state && snap.state.offers) || [];
  check(offers.length > 0, 'showcase has missions', offers);
  const missionId = offers[0];

  async function act(type, payload, role) {
    return call('POST', '/api/teams/' + teamId + '/action', { type, payload, role }, token);
  }

  const rec = await act('recommend', { missionId }, 'manager');
  check(rec.body && rec.body.ok !== false, 'recommended build is applied', rec.body && rec.body.result);
  check((await act('confirm-engineer', { missionId }, 'engineer')).body.ok !== false, 'engineer confirms build');
  check((await act('confirm-scientist', { missionId }, 'scientist')).body.ok !== false, 'scientist confirms build');

  const accepted = await act('accept', { missionId }, 'manager');
  check(accepted.body && accepted.body.ok !== false, 'manager accepts the mission', accepted.body && accepted.body.result);

  for (let i = 0; i < 14; i += 1) {
    await act('launch-all', {}, 'manager');
    const step = await act('next-step', {}, 'manager');
    if (!step.body || step.body.ok === false) break;
  }

  const fin = await act('finish', { force: true }, 'manager');
  check(fin.body && fin.body.resultRecord, 'finish writes a results record', fin.body && fin.body.result);

  const results = await call('GET', '/api/results', null, token);
  const row = (results.body.teams || []).find(function (t) { return t.teamId === teamId; });
  check(!!row, 'team appears in the global table', results.body.teams);
  check(row && typeof row.total === 'number', 'global row carries the total score', row);

  const detail = await call('GET', '/api/results/' + teamId, null, token);
  const record = detail.body.record;
  check(!!record, 'results detail is readable');
  check(record && record.missions && record.missions.length > 0, 'mission briefs are recorded',
    record && record.missions && record.missions.length);
  const first = record && record.missions && record.missions[0];
  check(!!(first && first.narrative && first.narrative.length > 120), 'mission brief has a narrative',
    first && first.narrative);
  check(!!(record && record.campaignNarrative), 'campaign brief is written');
  check(record && record.score && record.tieBreak, 'score breakdown and tie-break keys are present');

  const history = await call('GET', '/api/teams/' + teamId + '/history', null, mateToken);
  check(history.status === 200 && history.body.history.length > 0, 'teammate can read the mission archive');

  const exported = await call('GET', '/api/teams/' + teamId + '/export', null, token);
  check(exported.status === 200, 'captain can export the archive');
  const exportDenied = await call('GET', '/api/teams/' + teamId + '/export', null, mateToken);
  check(exportDenied.status === 403, 'only the captain can export');

  const lobby = await fetch(BASE + '/app/lobby.html');
  check(lobby.status === 200, 'lobby is served');
  const secret = await fetch(BASE + '/server/data/sessions.json');
  check(secret.status === 404, 'server data is not exposed over HTTP');

  console.log(failures ? '\nSMOKE: ' + failures + ' failure(s)' : '\nSMOKE: all checks passed');
  if (failures) process.exitCode = 1;
}

main().catch(function (err) {
  failures += 1;
  console.error('SMOKE crashed:', err && err.message);
  console.error(serverLog.slice(-2000));
  process.exitCode = 1;
}).finally(async function () {
  child.kill('SIGKILL');
  await sleep(300);
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (err) { /* ignore */ }
  process.exit(failures ? 1 : 0);
});
