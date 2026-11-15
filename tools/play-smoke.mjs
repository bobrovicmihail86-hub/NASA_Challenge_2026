/* End-to-end check of the multiplayer client: node tools/play-smoke.mjs
 *
 * The client is booted inside a vm context with a minimal DOM stub, so every
 * render pass really runs: hydration, offers, build editors, operations,
 * programme, archive, the finished banner and the delegated click/change
 * handlers. All client HTTP calls go to a throw-away server on a random port.
 * The run also asserts that play.html defines every id the client looks up and
 * that every class the board renders has a rule in play.css/lobby.css.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8600 + Math.floor(Math.random() * 200);
const BASE = 'http://127.0.0.1:' + PORT;
const DATA = path.join(ROOT, 'server', 'data-play-smoke');

const out = [];
function log(line) { out.push(line); }

let failures = 0;
function check(cond, label, extra) {
  if (cond) log('  ok   ' + label);
  else {
    failures += 1;
    log('  FAIL ' + label + (extra ? ' :: ' + extra : ''));
  }
}

/* ---------- DOM stub ---------- */

class Node {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.className = '';
    this.id = '';
    this.title = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.checked = false;
    this.style = {};
    this.attrs = {};
    this.children = [];
    this.parentNode = null;
    this._text = '';
    this.listeners = {};
  }
  get firstChild() { return this.children[0] || null; }
  get textContent() {
    if (this.children.length) return this.children.map(function (c) { return c.textContent; }).join('');
    return this._text;
  }
  set textContent(v) {
    this._text = v == null ? '' : String(v);
    this.children.length = 0;
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  removeChild(child) {
    const at = this.children.indexOf(child);
    if (at !== -1) this.children.splice(at, 1);
    child.parentNode = null;
    return child;
  }
  setAttribute(key, value) {
    this.attrs[key] = String(value);
    if (key === 'class') this.className = String(value);
  }
  getAttribute(key) { return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null; }
  hasAttribute(key) { return Object.prototype.hasOwnProperty.call(this.attrs, key); }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  closest(selector) {
    const want = /^\[([\w-]+)\]$/.exec(String(selector || ''));
    let node = this;
    while (node) {
      if (want && node.attrs && Object.prototype.hasOwnProperty.call(node.attrs, want[1])) return node;
      node = node.parentNode;
    }
    return null;
  }
  /* the client writes data-act through btn(); tests read it back */
  act() { return this.getAttribute('data-act'); }
}

const IDS = ['toast', 'status', 'netDot', 'gate', 'gateTitle', 'gateText', 'gateLink', 'board',
  'signOutBtn', 'roleSelect', 'dialog', 'dialogTitle', 'dialogText', 'dialogOk', 'dialogCancel',
  'crew', 'revInfo', 'finishedBar', 'programme', 'archiveMeta', 'offersMeta', 'buildMeta',
  'opsMeta', 'log', 'teamLogo', 'teamName', 'teamMeta', 'meters', 'offers', 'build', 'ops',
  'archive'];

function makeDom() {
  const registry = new Map();
  const listeners = {};
  IDS.forEach(function (id) {
    const node = new Node('div');
    node.id = id;
    registry.set(id, node);
  });
  registry.get('board').hidden = true;
  registry.get('gate').hidden = true;
  registry.get('finishedBar').hidden = true;
  const document = {
    getElementById(id) { return registry.get(id) || null; },
    createElement(tag) { return new Node(tag); },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    querySelector() { return null; }
  };
  function fire(type, target) {
    const event = { target: target, preventDefault() {}, key: '' };
    const own = target && target.listeners && target.listeners[type];
    if (own) own.forEach(function (fn) { fn(event); });
    (listeners[type] || []).forEach(function (fn) { fn(event); });
    return event;
  }
  function find(root, pred) {
    if (!root) return null;
    if (pred(root)) return root;
    for (let i = 0; i < root.children.length; i += 1) {
      const hit = find(root.children[i], pred);
      if (hit) return hit;
    }
    return null;
  }
  function findAll(root, pred, acc) {
    acc = acc || [];
    if (!root) return acc;
    if (pred(root)) acc.push(root);
    root.children.forEach(function (child) { findAll(child, pred, acc); });
    return acc;
  }
  return { registry, document, listeners, fire, find, findAll };
}

function textOf(node) { return node ? node.textContent : ''; }

/* ---------- CSS coverage ---------- */

const seenClasses = new Set();

function harvest(dom) {
  function walk(node) {
    if (!node) return;
    String(node.className || '').split(/\s+/).forEach(function (c) {
      if (/^[a-zA-Z][\w-]*$/.test(c)) seenClasses.add(c);
    });
    (node.children || []).forEach(walk);
  }
  dom.registry.forEach(walk);
}

/* ---------- markup wiring ---------- */

function checkIdWiring() {
  const html = fs.readFileSync(path.join(ROOT, 'app', 'play.html'), 'utf8');
  const ids = new Set();
  const reHtml = /\bid="([^"]+)"/g;
  let m;
  while ((m = reHtml.exec(html))) ids.add(m[1]);

  const js = fs.readFileSync(path.join(ROOT, 'app', 'play.js'), 'utf8');
  const used = new Set();
  const scans = [/\$\('([\w-]+)'\)/g, /getElementById\('([\w-]+)'\)/g];
  scans.forEach(function (re) {
    let hit;
    while ((hit = re.exec(js))) used.add(hit[1]);
  });

  const missing = Array.from(used).filter(function (id) { return !ids.has(id); }).sort();
  const stray = IDS.filter(function (id) { return !ids.has(id); });
  const uncovered = Array.from(used).filter(function (id) { return IDS.indexOf(id) === -1; }).sort();
  check(missing.length === 0, 'play.html defines every id the client looks up', missing.join(', '));
  check(stray.length === 0, 'the DOM stub mirrors only ids play.html really has', stray.join(', '));
  check(uncovered.length === 0, 'the DOM stub covers every id the client looks up', uncovered.join(', '));
}

function checkCssCoverage() {
  const css = (fs.readFileSync(path.join(ROOT, 'app', 'play.css'), 'utf8') + '\n' +
    fs.readFileSync(path.join(ROOT, 'app', 'lobby.css'), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const defined = new Set();
  const re = /\.(-?[_a-zA-Z][\w-]*)/g;
  let m;
  while ((m = re.exec(css))) defined.add(m[1]);
  const missing = Array.from(seenClasses).filter(function (c) { return !defined.has(c); }).sort();
  check(seenClasses.size > 40, 'the board renders a full set of component classes', seenClasses.size);
  check(missing.length === 0, 'every rendered class has a style rule', missing.join(', '));
}

/* ---------- tooltips ---------- */

function collectTips(dom) {
  const tips = [];
  function walk(node) {
    if (!node) return;
    const value = node.attrs && node.attrs['data-tip'];
    if (value != null) tips.push(value);
    (node.children || []).forEach(walk);
  }
  dom.registry.forEach(walk);
  return tips;
}

function checkTipText(label, tips, minimum) {
  check(tips.length >= minimum, label + ' carries tooltips', tips.length);
  const bad = tips.filter(function (t) {
    return !String(t).trim() || CYRILLIC.test(t) || BROKEN.test(t) || String(t).length > 200;
  });
  check(bad.length === 0, label + ' tooltips are short, English and complete',
    bad.slice(0, 3).join(' | '));
}

function checkTooltips() {
  const css = fs.readFileSync(path.join(ROOT, 'app', 'lobby.css'), 'utf8');
  check(/\[data-tip\]::after/.test(css), 'lobby.css draws the tooltip bubble');
  check(/content:\s*attr\(data-tip\)/.test(css), 'the bubble reads its text from data-tip');
  check(/\[data-tip\]:hover::after/.test(css), 'the bubble opens on hover');
  check(/\[data-tip\]:focus-visible::after/.test(css), 'the bubble opens on keyboard focus');
  check(/@media \(hover: none\)/.test(css), 'touch devices drop the hover bubble');

  ['play.html', 'lobby.html'].forEach(function (name) {
    const html = fs.readFileSync(path.join(ROOT, 'app', name), 'utf8');
    const tips = [];
    const re = /data-tip="([^"]*)"/g;
    let m;
    while ((m = re.exec(html))) tips.push(m[1]);
    checkTipText(name, tips, 4);
  });

  const playHtml = fs.readFileSync(path.join(ROOT, 'app', 'play.html'), 'utf8');
  check(!/id="netDot"[^>]*\btitle=/.test(playHtml), 'the net dot leaves its tooltip to the client');
  check(!/title="Live connection"/.test(playHtml), 'no native title duplicates the styled bubble');
  check(/\[data-tip\]\[data-tip-side="down"\]::after/.test(css), 'the top bar opens its bubble downwards');
  check(/data-tip-side="down"/.test(playHtml), 'the room header uses the downwards bubble');
}

/* ---------- server helpers ---------- */

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function call(method, pathname, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-token'] = token;
  const res = await fetch(BASE + pathname, {
    method: method, headers: headers, body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch (err) { json = null; }
  return { status: res.status, body: json };
}

async function waitFor(fn, label, ms) {
  const until = Date.now() + (ms || 6000);
  while (Date.now() < until) {
    if (fn()) return true;
    await sleep(50);
  }
  check(false, 'timed out waiting for ' + label);
  return false;
}

/* ---------- client bootstrap ---------- */

function bootClient(teamId, token, email) {
  const dom = makeDom();
  const errors = [];
  const store = new Map([['smd.token', token], ['smd.email', email], ['smd.role', 'manager']]);
  const ctx = {
    console: {
      log() {},
      warn() {},
      error: function () { errors.push(Array.prototype.join.call(arguments, ' ')); }
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    URLSearchParams: URLSearchParams,
    performance: { now: function () { return Date.now(); } },
    localStorage: {
      getItem: function (k) { return store.has(k) ? store.get(k) : null; },
      setItem: function (k, v) { store.set(k, String(v)); },
      removeItem: function (k) { store.delete(k); }
    },
    location: { search: '?team=' + encodeURIComponent(teamId), href: '' },
    document: dom.document,
    fetch: function (p, o) { return fetch(String(p).indexOf('http') === 0 ? p : BASE + p, o); }
  };
  vm.createContext(ctx);
  ctx.window = ctx;
  ['data/config.js', 'data/cards.js', 'data/missions.js', 'data/en.js', 'app/play.js']
    .forEach(function (rel) {
      vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
    });
  return { ctx: ctx, dom: dom, errors: errors };
}

const CYRILLIC = /[\u0400-\u04FF]/;
const BROKEN = /undefined|NaN|\[object Object\]/;

function tidy(label, text) {
  check(!CYRILLIC.test(text), label + ' is fully English',
    (text.match(/[\u0400-\u04FF][^\s]*/g) || []).slice(0, 5).join(', '));
  check(!BROKEN.test(text), label + ' has no undefined/NaN placeholders',
    (text.match(/.{0,24}(undefined|NaN|\[object Object\]).{0,24}/g) || []).slice(0, 3).join(' | '));
}
/* ---------- phase 1: a running campaign ---------- */

async function phaseRunning(teamId, token, email) {
  const client = bootClient(teamId, token, email);
  const r = client.dom.registry;
  const board = r.get('board');

  await waitFor(function () { return board.hidden === false; }, 'the board to open');
  check(board.hidden === false, 'board is shown after hydration');
  check(r.get('gate').hidden === true, 'gate stays hidden for a member');
  check(r.get('signOutBtn').hidden === false, 'sign-out is available');

  const offers = r.get('offers');
  const meters = r.get('meters');
  check(offers.children.length > 0, 'offers are rendered', offers.children.length);
  check(meters.children.length === 9, 'nine meters are rendered', meters.children.length);
  check(/^Step\s*1\s*\/\s*\d+$/.test(textOf(meters.children[0])), 'the step meter reads step 1',
    textOf(meters.children[0]));
  check(/Campaign running|seed/.test(textOf(r.get('teamMeta'))), 'team meta is filled',
    textOf(r.get('teamMeta')));
  check(textOf(r.get('status')) !== 'Loading the campaign…', 'status left the loading state',
    textOf(r.get('status')));

  tidy('the board', textOf(board));
  check(textOf(r.get('buildMeta')).indexOf('n/a') !== -1 ||
    /E[✓…] S[✓…]/.test(textOf(r.get('buildMeta'))), 'build meta was filled',
    textOf(r.get('buildMeta')));

  /* every control explains itself through data-tip */
  const tips = collectTips(client.dom);
  checkTipText('the rendered board', tips, 20);
  const meterTips = meters.children.map(function (m) { return m.attrs && m.attrs['data-tip']; });
  check(meterTips.every(function (t) { return !!t; }), 'every meter explains its number',
    meterTips.filter(function (t) { return !t; }).length + ' without a tip');
  const untipped = client.dom.findAll(offers, function (n) { return n.act() === 'select-mission'; })
    .filter(function (n) { return !(n.attrs && n.attrs['data-tip']); });
  check(untipped.length === 0, 'the offer buttons explain themselves', untipped.length);

  /* open the second offer through the delegated click handler */
  const before = textOf(r.get('build'));
  const openBtn = client.dom.find(offers.children[1], function (n) { return n.act() === 'select-mission'; });
  check(!!openBtn, 'the second offer carries a select-mission button');
  if (openBtn) {
    client.dom.fire('click', openBtn);
    await waitFor(function () { return / on$/.test(offers.children[1].className); }, 'the offer to open');
    check(/ on$/.test(offers.children[1].className), 'the clicked offer is marked as selected');
    await waitFor(function () { return textOf(r.get('build')) !== before; }, 'the build panel to change');
    check(textOf(r.get('build')).indexOf('P success') !== -1, 'the build panel shows the analysis rows');
    tidy('the build panel', textOf(r.get('build')));
  }

  /* a draft edit: change the first select the editors expose */
  const draft = client.dom.find(r.get('build'), function (n) { return !!n.getAttribute('data-draft'); });
  check(!!draft, 'the editors expose a draft select');
  if (draft) {
    client.dom.fire('change', draft);
    check(textOf(r.get('status')).indexOf('Build changed') === 0, 'editing the draft is announced',
      textOf(r.get('status')));
    const applyBtn = client.dom.find(r.get('build'), function (n) { return n.act() === 'patch-engineer'; });
    check(!!applyBtn && applyBtn.disabled === true, 'a manager cannot apply build changes');
  }


  /* close the step: the meters must move to step 2 */
  const stepBtn = client.dom.find(r.get('ops'), function (n) { return n.act() === 'next-step'; });
  check(!!stepBtn && stepBtn.disabled === false, 'a manager may close the step');
  if (stepBtn) {
    client.dom.fire('click', stepBtn);
    await waitFor(function () { return /Step\s*2\s*\//.test(textOf(meters.children[0])); }, 'step 2');
    check(/Step\s*2\s*\//.test(textOf(meters.children[0])), 'closing the step moves the clock',
      textOf(meters.children[0]));
    check(textOf(r.get('toast')).length > 0, 'the action is reported in the toast', textOf(r.get('toast')));
  }
  await sleep(300);

  /* switch console: the role select drives the whole board */
  const select = r.get('roleSelect');
  check(select.children.length === 4, 'the role select offers four consoles', select.children.length);
  select.value = 'engineer';
  client.dom.fire('change', select);
  check(textOf(r.get('status')).indexOf('Switched to the engineer console') === 0,
    'switching the console is announced', textOf(r.get('status')));
  const confirmBtn = client.dom.find(r.get('build'), function (n) { return n.act() === 'confirm-engineer'; });
  check(!!confirmBtn && confirmBtn.disabled === false, 'the engineer console may confirm its half');

  /* the recommended build can be loaded by an engineer */
  const recBtn = client.dom.find(r.get('build'), function (n) { return n.act() === 'recommend'; });
  check(!!recBtn && recBtn.disabled === false, 'the engineer may load the recommended build');
  if (recBtn) {
    client.dom.fire('click', recBtn);
    await waitFor(function () { return /Recommended build loaded/.test(textOf(r.get('status'))); },
      'the recommendation note');
    check(/Recommended build loaded/.test(textOf(r.get('status'))), 'the recommendation is confirmed',
      textOf(r.get('status')));
  }

  check(client.errors.length === 0, 'the client logged no console errors', client.errors.join(' | '));
  harvest(client.dom);
  return client;
}

/* ---------- phase 2: the finished campaign ---------- */

async function phaseFinished(teamId, token, email) {
  const client = bootClient(teamId, token, email);
  const r = client.dom.registry;

  await waitFor(function () { return r.get('board').hidden === false; }, 'the finished board');
  await waitFor(function () { return r.get('finishedBar').hidden === false; }, 'the finished banner');

  check(r.get('finishedBar').hidden === false, 'the finished banner is visible');
  const banner = textOf(r.get('finishedBar'));
  check(banner.indexOf('Campaign finished') !== -1, 'the banner announces the finish', banner.slice(0, 80));
  check(/score -?\d/.test(banner), 'the banner carries the final score', banner.slice(0, 160));
  check(banner.indexOf('Captain') !== -1, 'the banner lists the participants');

  const newBtn = client.dom.find(r.get('finishedBar'), function (n) { return n.act() === 'new-campaign'; });
  check(!!newBtn && newBtn.disabled === false, 'the captain may start a new campaign');

  const archive = r.get('archive');
  check(archive.children.length > 0, 'the archive holds a brief', archive.children.length);
  const entry = archive.children[0];
  check(!!entry && entry.tagName === 'DETAILS', 'a brief is a collapsed details block',
    entry && entry.tagName);
  check(textOf(entry).indexOf('Step ') === 0, 'the brief starts with the step',
    textOf(entry).slice(0, 60));
  check(/mission brief\(s\)/.test(textOf(r.get('archiveMeta'))), 'the archive meta counts the briefs',
    textOf(r.get('archiveMeta')));

  const programme = r.get('programme');
  const grid = client.dom.find(programme, function (n) { return n.className.indexOf('score-grid') === 0; });
  check(!!grid && grid.children.length >= 8, 'the programme shows the score grid',
    grid && grid.children.length);
  check(textOf(programme).indexOf('Score') !== -1, 'the programme names the score section');
  check(/VChK -?\d/.test(textOf(programme)), 'the programme lists the VChK level');

  /* finished teams must not be able to act any more */
  const stepBtn = client.dom.find(r.get('ops'), function (n) { return n.act() === 'next-step'; });
  check(!stepBtn || stepBtn.disabled === true, 'a finished campaign cannot close more steps');
  const acceptBtn = client.dom.find(r.get('offers'), function (n) { return n.act() === 'accept'; });
  check(!acceptBtn || acceptBtn.disabled === true, 'a finished campaign cannot accept offers');

  tidy('the finished board', textOf(r.get('board')));
  check(client.errors.length === 0, 'the finished board logged no console errors', client.errors.join(' | '));
  harvest(client.dom);
  return client;
}

/* ---------- main ---------- */

async function playThrough(teamId, token) {
  const state = await call('GET', '/api/teams/' + teamId + '/state?role=manager', null, token);
  const missionId = ((state.body.snapshot || {}).state || {}).offers[0];
  async function act(type, payload, role) {
    return call('POST', '/api/teams/' + teamId + '/action',
      { type: type, payload: payload || {}, role: role || 'manager' }, token);
  }
  await act('recommend', { missionId: missionId }, 'manager');
  await act('confirm-engineer', { missionId: missionId }, 'engineer');
  await act('confirm-scientist', { missionId: missionId }, 'scientist');
  await act('accept', { missionId: missionId }, 'manager');
  for (let i = 0; i < 14; i += 1) {
    await act('launch-all', {}, 'manager');
    const step = await act('next-step', {}, 'manager');
    if (!step.body || step.body.ok === false) break;
  }
  const fin = await act('finish', { force: true }, 'manager');
  check(fin.body && fin.body.ok !== false, 'the campaign can be finished over the API',
    fin.body && fin.body.result && fin.body.result.message);
}

async function main() {
  fs.rmSync(DATA, { recursive: true, force: true });
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.mjs'),
    '--port', String(PORT), '--host', '127.0.0.1', '--data', DATA], { stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  child.stdout.on('data', function (d) { serverLog += String(d); });
  child.stderr.on('data', function (d) { serverLog += String(d); });

  try {
    let up = false;
    for (let i = 0; i < 100 && !up; i += 1) {
      try {
        const res = await fetch(BASE + '/api/health', { signal: AbortSignal.timeout(2000) });
        up = res.ok;
      } catch (err) { up = false; }
      if (!up) await sleep(100);
    }
    check(up, 'the server answers /api/health');
    if (!up) throw new Error('server did not start:\n' + serverLog);

    const captain = 'captain@example.org';
    const login = await call('POST', '/api/login', { email: captain });
    check(login.status === 200 && !!login.body.token, 'the captain signs in');
    const token = login.body.token;
    const created = await call('POST', '/api/teams', {
      name: 'Aurora', seed: 424242, maxSteps: 12,
      roster: [{ email: captain, name: 'Captain', roles: ['manager', 'engineer', 'scientist', 'ops'] }]
    }, token);
    check(created.status === 200 && created.body.team && created.body.team.id, 'the team is created');
    const teamId = created.body.team.id;

    log('\n-- markup and styles --');
    checkIdWiring();

    log('\n-- running campaign --');
    await phaseRunning(teamId, token, captain);

    log('\n-- finishing the campaign --');
    await playThrough(teamId, token);

    log('\n-- finished campaign --');
    await phaseFinished(teamId, token, captain);

    log('\n-- styles --');
    checkCssCoverage();

    log('\n-- tooltips --');
    checkTooltips();
  } catch (err) {
    failures += 1;
    log('  FAIL crashed :: ' + (err && err.message));
    log(serverLog.slice(-1500));
  } finally {
    child.kill('SIGKILL');
    await sleep(300);
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (err) { /* ignore */ }
  }

  log('');
  log(failures ? 'PLAY-SMOKE: ' + failures + ' failure(s)' : 'PLAY-SMOKE: all checks passed');
  console.log(out.join('\n'));
  process.exit(failures ? 1 : 0);
}

main();
