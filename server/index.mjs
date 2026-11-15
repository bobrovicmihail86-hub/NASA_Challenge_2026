/* Space Mission Design — multiplayer web server (zero dependencies).
 *
 *   node server/index.mjs --port 8080 [--host 0.0.0.0] [--data ./server/data]
 *
 * Responsibilities:
 *  - static hosting of the game (app/, data/, art/, docs/)
 *  - e-mail-only login and team membership checks
 *  - one isolated game room per team (server is the only mutator)
 *  - role-separated actions with a strict allow-list
 *  - live snapshots over Server-Sent Events (20 s heartbeat)
 *  - per-team results plus the global tournament table and mission briefs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureDir, readJson, writeJson, makeId, makeToken, normEmail, cleanText, cleanId,
  nowIso, sendJson, readBody
} from './util.mjs';
import { Room, maskEmail } from './room.mjs';
import { loadGlobal, loadTeamResult, hasTeamResult, summarize } from './results.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function parseArgs(argv) {
  const out = { port: 8080, host: '0.0.0.0', data: path.join(ROOT, 'server', 'data') };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if ((a === '--port' || a === '-p') && argv[i + 1]) out.port = Number(argv[++i]);
    else if (a === '--host' && argv[i + 1]) out.host = argv[++i];
    else if (a === '--data' && argv[i + 1]) out.data = path.resolve(argv[++i]);
  }
  return out;
}

const ARGS = parseArgs(process.argv.slice(2));
const DATA_DIR = ARGS.data;
ensureDir(path.join(DATA_DIR, 'teams'));
ensureDir(path.join(DATA_DIR, 'results'));

const ROLES = ['manager', 'engineer', 'scientist', 'ops'];

const ROLE_ACTIONS = {
  manager: ['select-mission', 'accept', 'recommend', 'launch', 'launch-all', 'next-step', 'finish',
    'prep-hire', 'prep-mcs', 'prep-pr', 'ground', 'approve-exp'],
  engineer: ['select-mission', 'recommend', 'patch-engineer', 'confirm-engineer',
    'prep-factory', 'test-rocket', 'tech-rocket', 'standardize', 'approve-exp'],
  scientist: ['select-mission', 'recommend', 'patch-scientist', 'confirm-scientist',
    'prep-school', 'test-stand', 'test-instrument', 'tech-instrument', 'standardize', 'approve-exp'],
  ops: ['select-mission', 'launch', 'launch-all', 'next-step', 'finish', 'overtime', 'close-flight']
};
const COMMON_ACTIONS = ['chat', 'toggle-panel', 'save', 'select-mission'];
const CAPTAIN_ACTIONS = ['new-campaign', 'undo', 'import', 'export'];

const sessionsFile = path.join(DATA_DIR, 'sessions.json');
const sessions = readJson(sessionsFile, { tokens: {} });
const teams = new Map();
const rooms = new Map();
const streams = new Map();
const presence = new Map();

function saveSessions() {
  writeJson(sessionsFile, sessions);
}

function loadTeams() {
  const dir = path.join(DATA_DIR, 'teams');
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(function (name) {
    const file = path.join(dir, name, 'team.json');
    if (!fs.existsSync(file)) return;
    const team = readJson(file, null);
    if (team && team.id) teams.set(team.id, team);
  });
}

function saveTeam(team) {
  writeJson(path.join(DATA_DIR, 'teams', team.id, 'team.json'), team);
}

function memberOf(team, email) {
  return (team.roster || []).find(function (m) { return m.email === email; }) || null;
}

function authOf(req, query) {
  const header = req.headers['x-token'];
  const raw = header || (query ? query.get('token') : '') || '';
  const token = cleanId(String(raw), 80);
  const session = token && sessions.tokens[token];
  if (!session) return null;
  session.lastSeen = nowIso();
  return { token: token, email: session.email };
}

function teamCard(team, email) {
  const member = memberOf(team, email);
  const result = hasTeamResult(DATA_DIR, team.id) ? loadTeamResult(DATA_DIR, team.id) : null;
  return {
    id: team.id,
    name: team.name,
    logo: team.logo || '',
    status: team.status,
    creator: team.creator === email,
    captain: maskEmail(team.creator),
    seed: team.seed,
    maxSteps: team.maxSteps,
    roles: member ? member.roles.slice() : [],
    nameOfMember: member ? (member.name || '') : '',
    rosterSize: (team.roster || []).length,
    members: rosterMask(team, email),
    finishedAt: team.finishedAt || null,
    total: result && result.score ? result.score.total : null
  };
}

/** Roster for the lobby: the captain sees real e-mails, everyone else sees masks. */
function rosterMask(team, email) {
  const captain = team.creator === email;
  return (team.roster || []).map(function (m) {
    return {
      mask: captain || m.email === email ? m.email : maskEmail(m.email),
      email: captain ? m.email : undefined,
      self: m.email === email,
      name: m.name || '',
      roles: (m.roles || []).slice()
    };
  });
}

function presenceList(teamId) {
  const map = presence.get(teamId);
  if (!map) return [];
  const byEmail = new Map();
  map.forEach(function (entry) {
    const row = byEmail.get(entry.email) || { email: entry.email, roles: {}, count: 0 };
    row.roles[entry.role] = true;
    row.count += 1;
    byEmail.set(entry.email, row);
  });
  return Array.from(byEmail.values()).map(function (row) {
    return { mask: maskEmail(row.email), roles: Object.keys(row.roles), count: row.count };
  });
}


function ensureRoom(team) {
  let room = rooms.get(team.id);
  if (!room) {
    room = new Room({
      rootDir: ROOT,
      dataDir: DATA_DIR,
      team: team,
      onEvent: function (ev) {
        if (ev && ev.type === 'finished') {
          teams.set(team.id, team);
          saveTeam(team);
        }
      }
    });
    rooms.set(team.id, room);
  }
  return room;
}

function sseSend(res, event, data) {
  try {
    res.write('event: ' + event + '\n');
    res.write('data: ' + JSON.stringify(data) + '\n\n');
  } catch (err) { /* client gone */ }
}

function broadcast(teamId, event, data) {
  const set = streams.get(teamId);
  if (!set) return;
  set.forEach(function (client) { sseSend(client.res, event, data); });
}

function snapshotPayload(team, role, extra) {
  const room = ensureRoom(team);
  return Object.assign({
    team: room.mask(),
    rev: room.rev,
    snapshot: room.snapshot(),
    analysis: room.analysis(),
    presence: presenceList(team.id),
    role: role || null,
    rosterRoles: ROLES,
    history: room.history.slice(),
    result: hasTeamResult(DATA_DIR, team.id) ? loadTeamResult(DATA_DIR, team.id) : null
  }, extra || {});
}

function broadcastSnapshot(team, extra) {
  const set = streams.get(team.id);
  if (!set) return;
  const room = ensureRoom(team);
  const base = {
    team: room.mask(),
    rev: room.rev,
    analysis: room.analysis(),
    presence: presenceList(team.id),
    history: room.history.slice(),
    result: hasTeamResult(DATA_DIR, team.id) ? loadTeamResult(DATA_DIR, team.id) : null
  };
  set.forEach(function (client) {
    sseSend(client.res, 'snapshot',
      Object.assign({}, base, { snapshot: room.snapshot(), role: client.role }, extra || {}));
  });
}

function resetArchive(team) {
  writeJson(path.join(DATA_DIR, 'teams', team.id, 'history.json'), []);
  const resultFile = path.join(DATA_DIR, 'results', team.id + '.json');
  if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile);
  const g = loadGlobal(DATA_DIR);
  g.teams = (g.teams || []).filter(function (t) { return t.teamId !== team.id; });
  g.updatedAt = nowIso();
  writeJson(path.join(DATA_DIR, 'results', 'global.json'), g);
  team.status = 'active';
  delete team.finishedAt;
  saveTeam(team);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '/app' || rel === '/app/') rel = '/app/lobby.html';
  if (rel === '/play') rel = '/app/index.html';
  const file = path.resolve(ROOT, '.' + rel);
  if (!file.startsWith(ROOT)) return sendJson(res, 403, { ok: false, error: 'forbidden' });
  const low = file.toLowerCase();
  const serverDir = path.join(ROOT, 'server').toLowerCase();
  if (low.indexOf(serverDir) === 0) return sendJson(res, 404, { ok: false, error: 'not found' });
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return sendJson(res, 404, { ok: false, error: 'not found', path: rel });
  }
  const ext = path.extname(low);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=60',
    'X-Content-Type-Options': 'nosniff'
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}


function normalizeRoster(input) {
  if (!Array.isArray(input) || !input.length) return { ok: false, error: 'roster must be a non-empty array' };
  if (input.length > 12) return { ok: false, error: 'a team can have at most 12 members' };
  const seen = {};
  const roster = [];
  for (const raw of input) {
    const email = normEmail(raw && raw.email);
    if (!email) return { ok: false, error: 'invalid e-mail: ' + String((raw && raw.email) || '') };
    if (seen[email]) return { ok: false, error: 'duplicate e-mail: ' + email };
    seen[email] = true;
    const roles = Array.isArray(raw.roles) ? raw.roles.filter(function (r, i, a) {
      return ROLES.indexOf(r) !== -1 && a.indexOf(r) === i;
    }) : [];
    if (!roles.length) return { ok: false, error: 'at least one role is required for ' + email };
    roster.push({ email: email, name: cleanText(raw.name, 40), roles: roles });
  }
  const managers = roster.filter(function (m) { return m.roles.indexOf('manager') !== -1; });
  if (!managers.length) return { ok: false, error: 'the team needs at least one manager' };
  return { ok: true, roster: roster };
}

function validateTeamInput(body) {
  const name = cleanText(body.name, 40);
  if (name.length < 2) return { ok: false, error: 'team name is too short' };
  const logo = typeof body.logo === 'string' ? body.logo.trim() : '';
  if (logo) {
    const isData = logo.slice(0, 5) === 'data:' && logo.indexOf('base64,') !== -1;
    const isLink = logo.indexOf('http://') === 0 || logo.indexOf('https://') === 0;
    if (!isData && !isLink) return { ok: false, error: 'logo must be an image data URL or an https link' };
  }
  if (logo.length > 200000) return { ok: false, error: 'logo is too large (200 KB max)' };
  const rosterCheck = normalizeRoster(body.roster);
  if (!rosterCheck.ok) return rosterCheck;
  const seed = Math.min(99999999, Math.max(1, Math.floor(Number(body.seed) || 20260101)));
  const maxSteps = Math.min(24, Math.max(6, Math.floor(Number(body.maxSteps) || 15)));
  return { ok: true, name: name, logo: logo, roster: rosterCheck.roster, seed: seed, maxSteps: maxSteps };
}

function tokenFrom(req, query, body) {
  if (query) {
    const auth = authOf(req, query);
    if (auth) return auth;
  }
  if (body && body.token) {
    return authOf({ headers: { 'x-token': String(body.token) } }, null);
  }
  return authOf(req, null);
}

async function handleLogin(req, res) {
  const body = await readBody(req, 20000);
  const email = normEmail(body.email);
  if (!email) return sendJson(res, 400, { ok: false, error: 'Enter a valid e-mail address.' });
  const token = makeToken();
  sessions.tokens[token] = { email: email, createdAt: nowIso(), lastSeen: nowIso() };
  saveSessions();
  const list = [];
  teams.forEach(function (team) {
    if (memberOf(team, email)) list.push(teamCard(team, email));
  });
  list.sort(function (a, b) {
    return String(b.finishedAt || '').localeCompare(String(a.finishedAt || '')) || a.name.localeCompare(b.name);
  });
  return sendJson(res, 200, { ok: true, token: token, email: email, teams: list });
}

async function handleMe(req, res, query) {
  const auth = authOf(req, query);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'session expired' });
  saveSessions();
  const list = [];
  teams.forEach(function (team) {
    if (memberOf(team, auth.email)) list.push(teamCard(team, auth.email));
  });
  return sendJson(res, 200, { ok: true, email: auth.email, teams: list });
}

async function handleCreateTeam(req, res, query) {
  const body = await readBody(req, 400000);
  const auth = tokenFrom(req, query, body);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'sign in first' });
  const check = validateTeamInput(body);
  if (!check.ok) return sendJson(res, 400, check);
  if (!check.roster.some(function (m) { return m.email === auth.email; })) {
    return sendJson(res, 400, { ok: false, error: 'the captain must be listed in the roster' });
  }
  const team = {
    id: makeId('t'),
    name: check.name,
    logo: check.logo,
    creator: auth.email,
    seed: check.seed,
    maxSteps: check.maxSteps,
    status: 'active',
    createdAt: nowIso(),
    roster: check.roster
  };
  teams.set(team.id, team);
  saveTeam(team);
  const room = ensureRoom(team);
  room.persist();
  writeJson(path.join(DATA_DIR, 'teams', team.id, 'history.json'), []);
  return sendJson(res, 200, { ok: true, team: teamCard(team, auth.email), room: room.mask() });
}

async function handleRoster(req, res, teamId, query) {
  const team = teams.get(teamId);
  if (!team) return sendJson(res, 404, { ok: false, error: 'team not found' });
  const body = await readBody(req, 200000);
  const auth = tokenFrom(req, query, body);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'sign in first' });
  if (team.creator !== auth.email) {
    return sendJson(res, 403, { ok: false, error: 'only the captain can edit the roster' });
  }
  const check = normalizeRoster(body.roster);
  if (!check.ok) return sendJson(res, 400, check);
  if (!check.roster.some(function (m) { return m.email === team.creator; })) {
    return sendJson(res, 400, { ok: false, error: 'the captain must stay in the roster' });
  }
  team.roster = check.roster;
  saveTeam(team);
  ensureRoom(team);
  broadcastSnapshot(team);
  return sendJson(res, 200, { ok: true, team: ensureRoom(team).mask() });
}

/** Self-service join: a signed-in player adds their own e-mail to an active team. */
async function handleJoin(req, res, teamId, query) {
  const team = teams.get(teamId);
  if (!team) return sendJson(res, 404, { ok: false, error: 'team not found' });
  const body = await readBody(req, 20000);
  const auth = tokenFrom(req, query, body);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'sign in first' });
  const existing = memberOf(team, auth.email);
  if (existing) {
    return sendJson(res, 200, { ok: true, joined: false, team: teamCard(team, auth.email) });
  }
  if (team.status !== 'active') {
    return sendJson(res, 409, { ok: false, error: 'the campaign is already finished' });
  }
  if ((team.roster || []).length >= 12) {
    return sendJson(res, 400, { ok: false, error: 'a team can have at most 12 members' });
  }
  const roles = Array.isArray(body.roles) ? body.roles.filter(function (r, i, a) {
    return ROLES.indexOf(r) !== -1 && a.indexOf(r) === i;
  }) : [];
  if (!roles.length) return sendJson(res, 400, { ok: false, error: 'pick at least one role' });
  const name = cleanText(body.name, 40) || maskEmail(auth.email);
  team.roster.push({ email: auth.email, name: name, roles: roles });
  saveTeam(team);
  const room = ensureRoom(team);
  broadcastSnapshot(team);
  return sendJson(res, 200, {
    ok: true,
    joined: true,
    team: teamCard(team, auth.email),
    roles: memberOf(team, auth.email).roles,
    rev: room.rev
  });
}

function activeTeams() {
  const out = [];
  teams.forEach(function (team) {
    if (team.status !== 'active') return;
    let step = 1;
    let missions = 0;
    try {
      const st = readJson(path.join(DATA_DIR, 'teams', team.id, 'state.json'), null);
      if (st && st.state && st.state.state) step = st.state.state.step || 1;
      const hist = readJson(path.join(DATA_DIR, 'teams', team.id, 'history.json'), []);
      missions = hist.length;
    } catch (err) { /* keep defaults */ }
    out.push({
      id: team.id,
      name: team.name,
      logo: team.logo || '',
      seed: team.seed,
      maxSteps: team.maxSteps,
      step: step,
      missionCount: missions,
      rosterSize: (team.roster || []).length,
      members: (team.roster || []).map(function (m) {
        return { mask: maskEmail(m.email), name: m.name || '', roles: (m.roles || []).slice() };
      }),
      online: presenceList(team.id).reduce(function (s, p) { return s + p.count; }, 0),
      createdAt: team.createdAt
    });
  });
  out.sort(function (a, b) { return b.missionCount - a.missionCount || a.name.localeCompare(b.name); });
  return out;
}

async function handleAction(req, res, teamId, query) {
  const team = teams.get(teamId);
  if (!team) return sendJson(res, 404, { ok: false, error: 'team not found' });
  const body = await readBody(req, 400000);
  const auth = tokenFrom(req, query, body);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'sign in first' });
  const member = memberOf(team, auth.email);
  if (!member) return sendJson(res, 403, { ok: false, error: 'you are not a member of this team' });

  const type = cleanText(body.type, 40);
  const role = cleanText(body.role, 20) || member.roles[0];
  if (member.roles.indexOf(role) === -1) {
    return sendJson(res, 403, { ok: false, error: 'your role in this team does not allow that' });
  }
  const isCaptain = team.creator === auth.email;
  if (CAPTAIN_ACTIONS.indexOf(type) !== -1 && !isCaptain) {
    return sendJson(res, 403, { ok: false, error: 'only the captain can do that' });
  }
  const allowed = (ROLE_ACTIONS[role] || []).concat(COMMON_ACTIONS).concat(isCaptain ? CAPTAIN_ACTIONS : []);
  if (allowed.indexOf(type) === -1) {
    return sendJson(res, 403, { ok: false, error: 'action ' + type + ' is not available for role ' + role });
  }
  if (team.status === 'finished' && CAPTAIN_ACTIONS.indexOf(type) === -1 &&
    COMMON_ACTIONS.indexOf(type) === -1) {
    return sendJson(res, 409, { ok: false, error: 'the campaign is finished — open the results archive' });
  }

  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  if (type === 'chat') payload.text = cleanText(payload.text, 500);
  if (type === 'import' && typeof payload.text === 'string' && payload.text.length > 1500000) {
    return sendJson(res, 400, { ok: false, error: 'save file is too large' });
  }

  const room = ensureRoom(team);
  let out;
  try {
    out = room.dispatch(type, payload, role);
  } catch (err) {
    console.error('action failed', teamId, type, err);
    return sendJson(res, 500, { ok: false, error: 'engine error: ' + err.message });
  }
  const result = out.res || {};

  if (result.needsConfirm) {
    return sendJson(res, 200, {
      ok: false,
      needsConfirm: true,
      message: result.message || 'Please confirm the action.',
      confirmAction: type,
      rev: room.rev,
      role: role
    });
  }

  if (type === 'new-campaign' && result.ok) {
    room.history = [];
    room.reportsSeen = (room.APP.reports || []).length;
    team.seed = room.APP.seed || team.seed;
    team.maxSteps = room.APP.state.maxSteps || team.maxSteps;
    resetArchive(team);
    broadcastSnapshot(team);
  } else if (type !== 'select-mission' && type !== 'toggle-panel' && type !== 'save') {
    broadcastSnapshot(team);
  }

  (out.fresh || []).forEach(function (entry) {
    broadcast(team.id, 'history', { entry: entry });
  });
  if (out.record) broadcast(team.id, 'finished', { record: out.record });
  for (const email of Object.keys(sessions.tokens)) {
    if (sessions.tokens[email].email === auth.email) sessions.tokens[email].lastSeen = nowIso();
  }

  return sendJson(res, 200, {
    ok: result.ok !== false,
    result: {
      ok: result.ok !== false,
      message: result.message || '',
      type: result.type || 'ok',
      noSave: !!result.noSave
    },
    rev: room.rev,
    role: role,
    team: room.mask(),
    snapshot: room.snapshot(),
    analysis: room.analysis(),
    presence: presenceList(team.id),
    history: room.history.slice(),
    fresh: out.fresh || [],
    resultRecord: out.record || (hasTeamResult(DATA_DIR, team.id) ? loadTeamResult(DATA_DIR, team.id) : null)
  });
}



function handleStream(req, res, teamId, query) {
  const team = teams.get(teamId);
  if (!team) return sendJson(res, 404, { ok: false, error: 'team not found' });
  const auth = authOf(req, query);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'sign in first' });
  const member = memberOf(team, auth.email);
  if (!member) return sendJson(res, 403, { ok: false, error: 'you are not a member of this team' });
  let role = cleanText(query.get('role'), 20) || member.roles[0];
  if (member.roles.indexOf(role) === -1) role = member.roles[0];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 3000\n\n');

  const room = ensureRoom(team);
  const client = { res: res, email: auth.email, role: role };
  if (!streams.has(teamId)) streams.set(teamId, new Set());
  streams.get(teamId).add(client);
  if (!presence.has(teamId)) presence.set(teamId, new Map());
  const pid = makeId('p');
  presence.get(teamId).set(pid, { email: auth.email, role: role, since: nowIso() });

  sseSend(res, 'hello', Object.assign(snapshotPayload(team, role), { rev: room.rev }));
  broadcast(teamId, 'presence', { presence: presenceList(teamId) });

  const hb = setInterval(function () {
    try { res.write(': ping\n\n'); } catch (err) { /* ignore */ }
  }, 20000);

  function cleanup() {
    clearInterval(hb);
    const set = streams.get(teamId);
    if (set) set.delete(client);
    const map = presence.get(teamId);
    if (map) map.delete(pid);
    broadcast(teamId, 'presence', { presence: presenceList(teamId) });
  }
  req.on('close', cleanup);
  req.on('aborted', cleanup);
  return null;
}

function handleState(req, res, teamId, query) {
  const team = teams.get(teamId);
  if (!team) return sendJson(res, 404, { ok: false, error: 'team not found' });
  const auth = authOf(req, query);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'sign in first' });
  const member = memberOf(team, auth.email);
  if (!member) return sendJson(res, 403, { ok: false, error: 'you are not a member of this team' });
  let role = cleanText(query.get('role'), 20) || member.roles[0];
  if (member.roles.indexOf(role) === -1) role = member.roles[0];
  return sendJson(res, 200, Object.assign(snapshotPayload(team, role), {
    ok: true, roles: member.roles.slice()
  }));
}

function handleHistory(req, res, teamId, query) {
  const team = teams.get(teamId);
  if (!team) return sendJson(res, 404, { ok: false, error: 'team not found' });
  const auth = authOf(req, query);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'sign in first' });
  if (!memberOf(team, auth.email)) return sendJson(res, 403, { ok: false, error: 'not a member' });
  const room = ensureRoom(team);
  return sendJson(res, 200, {
    ok: true,
    history: room.history.slice(),
    result: hasTeamResult(DATA_DIR, team.id) ? loadTeamResult(DATA_DIR, team.id) : null
  });
}

function handleExport(req, res, teamId, query) {
  const team = teams.get(teamId);
  if (!team) return sendJson(res, 404, { ok: false, error: 'team not found' });
  const auth = authOf(req, query);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'sign in first' });
  if (team.creator !== auth.email) {
    return sendJson(res, 403, { ok: false, error: 'only the captain can export the archive' });
  }
  const room = ensureRoom(team);
  const payload = {
    exportedAt: nowIso(),
    team: room.mask(),
    rev: room.rev,
    snapshot: room.snapshot(),
    history: room.history.slice(),
    result: hasTeamResult(DATA_DIR, team.id) ? loadTeamResult(DATA_DIR, team.id) : null
  };
  const body = JSON.stringify(payload, null, 1);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': 'attachment; filename="smd-' + team.id + '.json"',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function handleResults(req, res, teamId) {
  if (teamId) {
    const record = loadTeamResult(DATA_DIR, teamId);
    if (!record) return sendJson(res, 404, { ok: false, error: 'no results for this team yet' });
    return sendJson(res, 200, { ok: true, record: record });
  }
  const global = loadGlobal(DATA_DIR);
  return sendJson(res, 200, {
    ok: true,
    updatedAt: global.updatedAt,
    teams: global.teams || [],
    active: activeTeams()
  });
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean);
  const q = url.searchParams;
  if (parts[1] === 'health') {
    return sendJson(res, 200, { ok: true, service: 'smd', teams: teams.size, rooms: rooms.size, up: Math.round(process.uptime()) });
  }
  if (parts[1] === 'login') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'use POST' });
    return handleLogin(req, res);
  }
  if (parts[1] === 'me') return handleMe(req, res, q);
  if (parts[1] === 'results') return handleResults(req, res, parts[2] ? cleanId(parts[2]) : null);
  if (parts[1] === 'teams') {
    if (parts.length === 2) {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'use POST to create a team' });
      return handleCreateTeam(req, res, q);
    }
    const teamId = cleanId(parts[2]);
    const sub = parts[3] || '';
    if (!teams.has(teamId)) return sendJson(res, 404, { ok: false, error: 'team not found' });
    if (sub === 'action') {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'use POST' });
      return handleAction(req, res, teamId, q);
    }
    if (sub === 'state') return handleState(req, res, teamId, q);
    if (sub === 'stream') return handleStream(req, res, teamId, q);
    if (sub === 'history') return handleHistory(req, res, teamId, q);
    if (sub === 'export') return handleExport(req, res, teamId, q);
    if (sub === 'roster') {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'use POST' });
      return handleRoster(req, res, teamId, q);
    }
    if (sub === 'join') {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'use POST' });
      return handleJoin(req, res, teamId, q);
    }
    if (!sub) return handleState(req, res, teamId, q);
  }
  return sendJson(res, 404, { ok: false, error: 'unknown endpoint' });
}

const server = http.createServer(function (req, res) {
  let url;
  try {
    url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: 'bad request' });
  }
  if (url.pathname.indexOf('/api/') === 0) {
    api(req, res, url).catch(function (err) {
      console.error('api error', url.pathname, err);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'server error' });
      else res.end();
    });
    return undefined;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { ok: false, error: 'method not allowed' });
  }
  try {
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error('static error', url.pathname, err);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'server error' });
    return undefined;
  }
});

loadTeams();

server.listen(ARGS.port, ARGS.host, function () {
  console.log('Space Mission Design server');
  console.log('  url  : http://' + (ARGS.host === '0.0.0.0' ? 'localhost' : ARGS.host) + ':' + ARGS.port + '/');
  console.log('  lobby: http://' + (ARGS.host === '0.0.0.0' ? 'localhost' : ARGS.host) + ':' + ARGS.port + '/app/lobby.html');
  console.log('  data : ' + DATA_DIR);
  console.log('  teams: ' + teams.size);
});

function shutdown() {
  try {
    saveSessions();
    rooms.forEach(function (room) { room.persist(); });
  } catch (err) { /* ignore */ }
  server.close(function () { process.exit(0); });
  setTimeout(function () { process.exit(0); }, 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

