/* Space Mission Design — mission room (multiplayer client).
 *
 * The server owns the campaign: this page only hydrates the snapshot it gets
 * from /api/teams/:id/state (and the SSE stream), renders the board and posts
 * actions back. All copy is English; anything language-neutral (card ids, check
 * codes, numbers) comes from the server, so nothing has to be parsed out of
 * Russian sentences.
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'smd.token';
  var EMAIL_KEY = 'smd.email';
  var ROLE_KEY = 'smd.role';

  var ROLE_ORDER = ['manager', 'engineer', 'scientist', 'ops'];
  var ROLE_LABEL = { manager: 'Manager', engineer: 'Engineer', scientist: 'Scientist', ops: 'Operations' };
  var APPROVAL_ROLES = ['engineer', 'scientist', 'manager'];
  var TEST_KIND = {
    flightRocket: 'Launcher test flight',
    stand: 'Instrument bench test',
    flightInstrument: 'Instrument test flight'
  };

  /* Mirrors ROLE_ACTIONS + COMMON_ACTIONS on the server; only used to hide
   * buttons the server would refuse anyway. */
  var ACTIONS = {
    manager: ['select-mission', 'accept', 'recommend', 'launch', 'launch-all', 'next-step',
      'finish', 'prep-hire', 'prep-mcs', 'prep-pr', 'ground', 'approve-exp'],
    engineer: ['select-mission', 'recommend', 'patch-engineer', 'confirm-engineer', 'prep-factory',
      'test-rocket', 'tech-rocket', 'standardize', 'approve-exp'],
    scientist: ['select-mission', 'recommend', 'patch-scientist', 'confirm-scientist', 'prep-school',
      'test-stand', 'test-instrument', 'tech-instrument', 'standardize', 'approve-exp'],
    ops: ['select-mission', 'launch', 'launch-all', 'next-step', 'finish', 'overtime', 'close-flight']
  };

  var MISSIONS_BY_ID = {};
  (window.MISSIONS || []).forEach(function (m) { MISSIONS_BY_ID[m.id] = m; });

  var state = {
    token: localStorage.getItem(TOKEN_KEY) || '',
    email: localStorage.getItem(EMAIL_KEY) || '',
    teamId: new URLSearchParams(location.search).get('team') || '',
    role: localStorage.getItem(ROLE_KEY) || '',
    myRoles: [],
    team: null,
    snapshot: null,
    analysis: null,
    history: [],
    presence: [],
    result: null,
    rev: 0,
    es: null,
    busy: false,
    groundPick: '',
    feed: [],
    draft: null,
    pick: {},
    onConfirm: null
  };

  /* ---------- tiny helpers ---------- */

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  /* Styled tooltip: the bubble itself is drawn by the [data-tip] rules in
   * lobby.css. Form controls cannot render pseudo-elements, so they keep the
   * native title attribute; everything else gets data-tip. */
  var FORM_TAGS = { SELECT: 1, INPUT: 1, TEXTAREA: 1, OPTION: 1 };

  function tip(node, text, side) {
    if (!node) return node;
    if (text == null || text === '') {
      node.removeAttribute('data-tip');
      node.removeAttribute('data-tip-side');
      node.removeAttribute('title');
      return node;
    }
    var value = String(text);
    if (FORM_TAGS[String(node.tagName || '').toUpperCase()]) {
      node.setAttribute('title', value);
    } else {
      node.setAttribute('data-tip', value);
      if (side) node.setAttribute('data-tip-side', side);
    }
    return node;
  }

  function fmt(n, digits) {
    var v = Number(n);
    if (!isFinite(v)) return '—';
    return v.toFixed(digits == null ? 1 : digits);
  }

  function money(n) {
    var v = Math.round(Number(n) || 0);
    return '$' + v.toLocaleString('en-US');
  }

  function pct(x) {
    var v = Number(x);
    if (!isFinite(v)) return '—';
    return Math.round(v * 100) + '%';
  }

  function massLabel(kg) {
    var v = Number(kg);
    if (!isFinite(v)) return '—';
    return fmt(v / 1000, 2) + ' t';
  }

  function mission(id) { return MISSIONS_BY_ID[id] || null; }

  /* Top levels of the programme facilities, straight from the shared config. */
  function levelCaps() {
    var C = window.CONFIG || {};
    var camp = C.campaign || {};
    return {
      mcs: (C.mcs && C.mcs.maxLevel) || 4,
      factory: (camp.factoryUpgrades || []).length || 4,
      school: (camp.schoolUpgrades || []).length || 4
    };
  }

  function nameOf(id) {
    if (!id) return '';
    if (window.EN && EN.name) return EN.name(id);
    var m = mission(id);
    return m && m.name ? m.name : String(id);
  }

  function tipOf(id) {
    if (!window.EN || !EN.text) return '';
    return EN.text(id) || '';
  }

  function pointName(id) {
    var C = window.CONFIG;
    var p = C && C.points ? C.points[id] : null;
    return p && p.name ? p.name : String(id || '');
  }

  function isCaptain() {
    var team = state.team || {};
    return !!state.email && String(team.creator || '').toLowerCase() ===
      String(state.email).toLowerCase();
  }

  function roleAllowed(type) {
    if (type === 'new-campaign') return isCaptain();
    if (state.team && state.team.status === 'finished' && type !== 'select-mission') return false;
    if (type === 'select-mission') return true;
    var list = ACTIONS[state.role] || [];
    return list.indexOf(type) !== -1;
  }

  function btn(label, type, dataset, opts) {
    opts = opts || {};
    var node = el('button', 'small' + (opts.cls ? ' ' + opts.cls : ''), label);
    node.setAttribute('data-act', type);
    if (dataset) {
      Object.keys(dataset).forEach(function (k) {
        node.setAttribute('data-' + k, dataset[k]);
      });
    }
    if (opts.disabled) node.disabled = true;
    if (opts.title) tip(node, opts.title);
    return node;
  }

  /* ---------- http ---------- */

  function api(path, opts) {
    opts = opts || {};
    var headers = { Accept: 'application/json' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    if (state.token) headers['x-token'] = state.token;
    return fetch(path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store'
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || ('HTTP ' + res.status));
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function toast(text, bad) {
    var node = $('toast');
    if (!node) return;
    node.textContent = text;
    node.className = 'toast' + (bad ? ' bad' : '');
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { node.hidden = true; }, bad ? 7000 : 4200);
  }

  function status(text, cls) {
    var node = $('status');
    if (!node) return;
    node.textContent = text;
    node.className = cls || '';
  }

  function setNet(online) {
    var dot = $('netDot');
    if (!dot) return;
    dot.className = 'net' + (online ? ' on' : '');
    tip(dot, online ? 'Live connection' : 'Reconnecting…', 'down');
  }

  function openDialog(title, text, onOk, okLabel) {
    state.onConfirm = onOk || null;
    $('dialogTitle').textContent = title || 'Please confirm';
    $('dialogText').textContent = text || '';
    $('dialogOk').textContent = okLabel || 'Confirm';
    $('dialog').hidden = false;
  }

  function closeDialog() {
    $('dialog').hidden = true;
    state.onConfirm = null;
  }

  /* ---------- gate / bootstrap ---------- */

  function showGate(title, text, link, linkLabel) {
    stopStream();
    $('board').hidden = true;
    $('signOutBtn').hidden = true;
    $('gate').hidden = false;
    $('gateTitle').textContent = title;
    $('gateText').textContent = text;
    var a = $('gateLink');
    a.href = link || 'lobby.html';
    a.textContent = linkLabel || 'Go to the lobby';
    status(text, 'bad');
  }

  function boot() {
    $('roleSelect').addEventListener('change', onRoleChange);
    $('signOutBtn').addEventListener('click', signOut);
    $('dialogCancel').addEventListener('click', closeDialog);
    $('dialogOk').addEventListener('click', function () {
      var fn = state.onConfirm;
      closeDialog();
      if (fn) fn();
    });
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('dialog').hidden) closeDialog();
    });

    if (!state.teamId) {
      showGate('No team selected',
        'Open the lobby, pick a team and press “Enter room”. The room link carries the team id.',
        'lobby.html', 'Go to the lobby');
      return;
    }
    if (!state.token) {
      showGate('Sign in to play',
        'The mission room is available to team members only. Sign in on the lobby page first.',
        'lobby.html', 'Sign in on the lobby page');
      return;
    }
    load();
  }

  function signOut() {
    stopStream();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(ROLE_KEY);
    location.href = 'lobby.html';
  }

  function load() {
    status('Loading the campaign…');
    return api('/api/teams/' + encodeURIComponent(state.teamId) + '/state?role=' +
      encodeURIComponent(state.role || ''))
      .then(function (data) {
        hydrate(data, true);
        status('Connected · revision ' + state.rev +
          (state.team && state.team.status === 'finished' ? ' · campaign finished' : ''), 'ok');
        connect();
      })
      .catch(onLoadError);
  }

  function onLoadError(err) {
    stopStream();
    var code = err && err.status;
    if (code === 401) {
      showGate('Session expired', 'Sign in again on the lobby page to keep playing.',
        'lobby.html', 'Sign in again');
      return;
    }
    if (code === 403) {
      showGate('Not a team member', 'Ask the captain to add your e-mail to the roster, then reload.',
        'lobby.html', 'Back to the lobby');
      return;
    }
    if (code === 404) {
      showGate('Team not found', 'The team was removed or the room link is wrong.',
        'lobby.html', 'Back to the lobby');
      return;
    }
    showGate('Server unavailable', (err && err.message) || 'The mission room could not reach the server.',
      'lobby.html', 'Back to the lobby');
  }

  function hydrate(data, first) {
    if (!data) return;
    if (first) {
      $('gate').hidden = true;
      $('board').hidden = false;
      $('signOutBtn').hidden = false;
    }
    if (data.team) state.team = data.team;
    if (data.snapshot) state.snapshot = data.snapshot;
    if (data.roles) state.myRoles = data.roles.slice();
    if (Object.prototype.hasOwnProperty.call(data, 'analysis')) state.analysis = data.analysis;
    if (data.history) state.history = data.history;
    if (data.presence) state.presence = data.presence;
    if (Object.prototype.hasOwnProperty.call(data, 'result')) state.result = data.result;
    if (!state.result && data.resultRecord) state.result = data.resultRecord;
    if (typeof data.rev === 'number') state.rev = data.rev;
    /* The server echoes the role an action ran with; a console the player just
     * picked must not be reverted by a reply that was already in flight. */
    if (data.role && state.myRoles.indexOf(state.role) === -1) state.role = data.role;
    if (!state.myRoles.length && state.team && state.team.roles) state.myRoles = state.team.roles.slice();
    if (!state.role || state.myRoles.indexOf(state.role) === -1) {
      state.role = state.myRoles[0] || '';
    }
    render();
  }

  /* ---------- live stream ---------- */

  function stopStream() {
    if (state.es) {
      try { state.es.close(); } catch (err) { /* ignore */ }
      state.es = null;
    }
    setNet(false);
  }

  function connect() {
    stopStream();
    if (typeof EventSource === 'undefined') return;
    var url = '/api/teams/' + encodeURIComponent(state.teamId) + '/stream?token=' +
      encodeURIComponent(state.token) + '&role=' + encodeURIComponent(state.role || '');
    var es = new EventSource(url);
    state.es = es;
    es.onopen = function () { setNet(true); };
    es.onerror = function () { setNet(false); };
    es.addEventListener('hello', onSnapshotEvent);
    es.addEventListener('snapshot', onSnapshotEvent);
    es.addEventListener('presence', function (e) {
      try {
        var data = JSON.parse(e.data);
        if (data && data.presence) {
          state.presence = data.presence;
          renderPresence();
        }
      } catch (err) { /* ignore */ }
    });
    es.addEventListener('history', function (e) {
      try {
        var data = JSON.parse(e.data);
        if (data && data.entry) {
          state.history.push(data.entry);
          renderArchive();
          pushFeed(data.entry.missionName + ' — ' + data.entry.verdict + '.');
        }
      } catch (err) { /* ignore */ }
    });
    es.addEventListener('finished', function (e) {
      try {
        var data = JSON.parse(e.data);
        if (data && data.record) {
          state.result = data.record;
          renderFinished();
          toast('Campaign finished — the archive is complete.');
        }
      } catch (err) { /* ignore */ }
    });
  }

  function onSnapshotEvent(e) {
    try {
      hydrate(JSON.parse(e.data), false);
      setNet(true);
    } catch (err) { /* ignore */ }
  }

  function onRoleChange(e) {
    var role = e.target.value;
    if (ROLE_ORDER.indexOf(role) === -1) return;
    state.role = role;
    localStorage.setItem(ROLE_KEY, role);
    status('Switched to the ' + ROLE_LABEL[role].toLowerCase() + ' console.');
    render();
    connect();
  }

  /* ---------- actions ---------- */

  var ACTION_TITLE = {
    accept: 'Accept the mission',
    recommend: 'Load the recommended build',
    launch: 'Launch',
    'launch-all': 'Launch everything that is ready',
    'next-step': 'Close the step',
    finish: 'Finish the campaign',
    'prep-hire': 'Hire a manager',
    'prep-mcs': 'Upgrade mission control',
    'prep-pr': 'Run a PR campaign',
    'prep-factory': 'Upgrade the factory',
    'prep-school': 'Upgrade the science school',
    overtime: 'Extend the reception',
    'close-flight': 'Close the flight early',
    'approve-exp': 'Sign the approval',
    'new-campaign': 'Start a new campaign',
    'test-rocket': 'Launcher test flight',
    'test-stand': 'Instrument bench test',
    'test-instrument': 'Instrument test flight',
    'tech-rocket': 'Launcher R&D',
    'tech-instrument': 'Instrument R&D',
    standardize: 'Standardise the card',
    ground: 'Ground contract'
  };

  function act(type, payload) {
    if (state.busy) return Promise.resolve(null);
    var s = state.snapshot ? state.snapshot.state : null;
    var before = s ? {
      step: s.step,
      money: s.money,
      production: (s.production || []).length,
      ready: (s.ready || []).length,
      flights: (s.flights || []).length,
      actionsLeft: state.snapshot.actionsLeft
    } : null;
    state.busy = true;
    status('Sending: ' + (ACTION_TITLE[type] || type) + '…');
    return api('/api/teams/' + encodeURIComponent(state.teamId) + '/action', {
      method: 'POST',
      body: { type: type, role: state.role || '', payload: payload || {} }
    }).then(function (data) {
      if (data && data.needsConfirm) {
        state.busy = false;
        askConfirm(type, payload, data);
        status('Waiting for your confirmation.');
        return null;
      }
      hydrate(data, false);
      var note = describe(type, payload, before, data);
      if (data && data.ok === false) {
        toast(note || 'The action did not go through.', true);
        status(note || 'The action did not go through.', 'bad');
      } else {
        toast(note || 'Done.');
        status(note || 'Done.', 'ok');
      }
      pushFeed(note);
      state.busy = false;
      return data;
    }).catch(function (err) {
      state.busy = false;
      var text = (err && err.message) || 'Request failed.';
      toast(text, true);
      status(text, 'bad');
      if (err && err.status === 401) {
        showGate('Session expired', 'Sign in again on the lobby page to keep playing.',
          'lobby.html', 'Sign in again');
      }
      return null;
    });
  }

  function askConfirm(type, payload, data) {
    var text = 'This action asks for a second confirmation.';
    if (type === 'finish') {
      text = 'Tally the final score? Unfinished missions will be closed and the campaign is archived.';
    } else if (type === 'accept') {
      text = 'The build raises warnings (see the notes under the selected mission). ' +
        'The engine will accept it, but a partial result is likely.';
    } else if (type === 'new-campaign') {
      text = 'Start a new campaign? The current progress and archive will be replaced.';
    } else if (data && data.message && /^[\x20-\x7E]+$/.test(data.message)) {
      text = data.message;
    }
    openDialog(ACTION_TITLE[type] || 'Please confirm', text, function () {
      var again = {};
      Object.keys(payload || {}).forEach(function (k) { again[k] = payload[k]; });
      if (type === 'accept') again.allowWarnings = true;
      else again.force = true;
      act(type, again);
    }, type === 'finish' ? 'Finish' : 'Confirm');
  }

  /* English copy for the structured deal-breakers the server reports. */
  var CODE_TEXT = {
    mission: function () { return 'The mission card is missing.'; },
    trajectory: function () { return 'This trajectory is not offered by the mission.'; },
    'data-check': function () { return 'The data channel is weak: a full success is off the table. '; },
    budget: function (n) {
      return 'The build costs ' + money(n.price) + ', above the contract cap of ' + money(n.cap) + '.';
    },
    cash: function (n) {
      return 'After the advance and the purchase the treasury would sit at ' + money(n.cashAfter) + '.';
    },
    'pm-step': function (n) {
      return 'Production needs ' + fmt(n.pmRate, 0) + ' PM/step but only ' + fmt(n.pmFree, 0) + ' is free.';
    },
    'prod-deadline': function (n) {
      return 'Production takes ' + fmt(n.prodTime, 0) + ' step(s) and misses the deadline of ' +
        fmt(n.deadline, 0) + '.';
    },
    'campaign-end': function () { return 'The mission would be ready after the campaign ends.'; },
    'slots-production': function () { return 'Every production slot is already taken.'; },
    'check-mass': function (n) {
      return 'Too heavy: ' + massLabel(n.massKg) + ' against a capacity of ' + massLabel(n.capacityKg) + '.';
    },
    'check-power': function (n) {
      return 'Power shortfall: ' + fmt(n.powerRequired, 0) + ' W needed, ' +
        fmt(n.powerAvailable, 0) + ' W available.';
    },
    'check-slots': function (n) {
      return 'Control slots are full: ' + fmt(n.slotsUsed, 0) + ' of ' + fmt(n.slotsTotal, 0) + ' used.';
    },
    'check-deadline': function (n) {
      return 'The build needs more cycles than the deadline of ' + fmt(n.deadline, 0) + ' allows.';
    },
    'check-pm': function () { return 'Not enough person-months for this deadline.'; },
    'check-modules': function () { return 'The mission needs modules this trajectory does not carry.'; },
    'check-money': function (n) { return 'Over budget: ' + money(n.price) + '.'; },
    'mission-modules': function () { return 'Mission modules are missing: each one halves the science. '; },
    'data-type': function () { return 'No instrument matches the mission data type: S x0.5. '; },
    'no-instruments': function () { return 'The build carries no instruments: no science result. '; },
    'p-success': function (n) { return 'P success ' + pct(n.pSuccess) + ' is below 50%: a failure. '; },
    'p-low': function (n) { return 'P success ' + pct(n.pSuccess) + ' is risky. '; },
    'data-ratio': function (n) { return 'Only ' + pct(n.dataRatio) + ' of the data comes down. '; },
    'p-channel': function (n) { return 'Channel reliability ' + pct(n.pChannel) + ' is the weak spot. '; },
    's-target': function (n) {
      return 'S ' + fmt(n.sDet, 1) + ' is below the target of ' + fmt(n.target, 0) + '. ';
    },
    'eng-ready': function () { return 'The engineer has not confirmed the build. '; },
    'sci-ready': function () { return 'The scientist has not confirmed the build. '; }
  };

  function codeTextSafe(code, numbers) {
    var fn = CODE_TEXT[code];
    if (fn) return fn(numbers || {});
    return String(code).replace(/^check-/, 'Check: ');
  }

  function analysisNotes(codes, numbers) {
    var out = [];
    (codes || []).forEach(function (code) {
      if (CODE_TEXT[code]) out.push(CODE_TEXT[code](numbers || {}));
    });
    return out.join(' ').trim();
  }

  function describe(type, payload, before, data) {
    var snap = data && data.snapshot ? data.snapshot : state.snapshot;
    var s = snap && snap.state ? snap.state : null;
    var ok = !data || data.ok !== false;
    var raw = data && data.result ? data.result.message : '';
    var name = payload && payload.missionId ? nameOf(payload.missionId) : '';
    if (!s) return '';
    if (!ok) return failureText(type, s, name, raw);
    if (type === 'accept') {
      var entry = (s.production || []).filter(function (p) { return p.missionId === payload.missionId; })[0];
      return name + ' accepted' + (entry ? ': advance ' + money(entry.advance) + ', ready on step ' +
        entry.readyStep + ', deadline step ' + entry.deadlineStep : '') + '.';
    }
    if (type === 'recommend') {
      var a = state.analysis;
      if (a && a.numbers) {
        return 'Recommended build loaded: P ' + pct(a.numbers.pSuccess) + ', S ' +
          fmt(a.numbers.sDet, 1) + ' of ' + fmt(a.numbers.target, 0) + '. Both roles must confirm it.';
      }
      return 'Recommended build loaded. Both roles must confirm it.';
    }
    if (type === 'confirm-engineer') {
      return 'Engineer part confirmed: launcher, redundancy, physical modules, trajectory.';
    }
    if (type === 'confirm-scientist') {
      return 'Scientist part confirmed: control, instruments, power, antenna, buffer.';
    }
    if (type === 'launch' || type === 'launch-all') {
      var gained = before ? (s.flights || []).length - before.flights : 0;
      var left = (s.ready || []).length;
      if (gained > 0) {
        return 'Launched ' + gained + ' mission(s). In flight: ' + (s.flights || []).length +
          (left ? '. Still ready: ' + left + '.' : '.');
      }
      return 'No launch happened' + (left ? '.' : ' — nothing is ready.');
    }
    if (type === 'next-step') {
      return 'Step ' + s.step + ' started. Preparation actions: ' + (snap.actionsLeft || 0) + '.';
    }
    if (type === 'finish') {
      var score = s.score && s.score.total != null ? fmt(s.score.total, 1) : '?';
      return 'Campaign finished: ' + score + ' points.';
    }
    if (type === 'overtime') return 'Reception extended for ' + name + ' (+8% S per extra step).';
    if (type === 'close-flight') return name + ' closed early (data cut to 60%).';
    if (type === 'approve-exp') return 'Signature added to the approval request.';
    if (type === 'prep-hire') return 'Manager hired.';
    if (type === 'prep-mcs') return 'Mission control upgraded.';
    if (type === 'prep-pr') return 'PR campaign done: rating and visibility improved.';
    if (type === 'prep-factory') return 'Factory upgraded: more production cycles every step.';
    if (type === 'prep-school') return 'Science school upgraded.';
    if (type === 'standardize') return 'Card standardised: its reliability no longer drops.';
    if (type === 'ground') return 'Ground contract signed.';
    if (type === 'tech-rocket' || type === 'tech-instrument') {
      return ACTION_TITLE[type] + ': the class level went up.';
    }
    if (type.indexOf('test-') === 0) return ACTION_TITLE[type] + ' done.';
    if (type === 'select-mission' || type === 'patch-engineer' || type === 'patch-scientist') return '';
    if (raw && /^[\x20-\x7E]+$/.test(raw)) return raw;
    return ACTION_TITLE[type] ? ACTION_TITLE[type] + ': done.' : 'Done.';
  }

  function failureText(type, s, name, raw) {
    var finished = state.snapshot && state.snapshot.finished;
    if (finished) return 'The campaign is over — open the archive or start a new campaign from the lobby.';
    if (type === 'accept') {
      var a = state.analysis;
      if (a && a.blockers && a.blockers.length) {
        return 'Accept refused. ' + analysisNotes(a.blockers, a.numbers);
      }
      if (a && a.ready && (!a.ready.engineer || !a.ready.scientist)) {
        return 'The engineer and the scientist must both confirm the build first.';
      }
      return 'The mission was not accepted.';
    }
    if (type.indexOf('prep-') === 0 && state.snapshot && state.snapshot.actionsLeft <= 0) {
      return 'No preparation actions left this step — close the step first.';
    }
    if (type === 'launch' || type === 'launch-all') {
      if (!(s.ready || []).length) return 'Nothing is ready for launch.';
      return 'The launch is waiting for an approval: the engineer, the scientist and the manager must sign.';
    }
    if (type === 'next-step' && s.step >= s.maxSteps) {
      return 'This is the last step — tally the final score.';
    }
    if (raw && /^[\x20-\x7E]+$/.test(raw)) return raw;
    var notes = state.analysis ? analysisNotes(state.analysis.blockers, state.analysis.numbers) : '';
    return ('The action did not go through. ' + notes).trim();
  }

  /* ---------- render: header, meters, presence ---------- */

  function render() {
    var snap = state.snapshot;
    if (!snap || !snap.state) return;
    var s = snap.state;
    renderHeader();
    renderMeters(s, snap);
    renderOffers(s, snap);
    renderBuild(s, snap);
    renderOps(s, snap);
    renderProgramme(s, snap);
    renderArchive();
    renderFinished();
    renderFeed();
    renderPresence();
    var rev = $('revInfo');
    if (rev) rev.textContent = 'revision ' + state.rev + ' · ' + ROLE_LABEL[state.role] + ' console';
  }

  function renderHeader() {
    var team = state.team || {};
    var logo = $('teamLogo');
    if (logo) logo.textContent = team.logo || '🛰';
    var name = $('teamName');
    if (name) name.textContent = team.name || 'Mission room';
    var meta = $('teamMeta');
    if (meta) {
      var roster = team.roster ? team.roster.length : 0;
      meta.textContent = 'seed ' + (team.seed || '—') + ' · ' + roster + ' member(s) · ' +
        (team.status === 'finished' ? 'campaign finished' : 'campaign running');
    }
    var select = $('roleSelect');
    if (select) {
      if (select.parentNode) {
        tip(select.parentNode,
          'Pick the console you are watching. Only the roles you hold in this team are listed.', 'down');
      }
      var list = state.myRoles.length ? state.myRoles : ROLE_ORDER;
      var want = list.map(function (r) { return r + '|' + ROLE_LABEL[r]; }).join(',');
      if (select.getAttribute('data-roles') !== want) {
        clear(select);
        list.forEach(function (role) {
          var opt = el('option', null, ROLE_LABEL[role]);
          opt.value = role;
          select.appendChild(opt);
        });
        select.setAttribute('data-roles', want);
      }
      if (state.role) select.value = state.role;
    }
  }

  function meter(label, value, cls, hint) {
    var box = el('div', 'meter' + (cls ? ' ' + cls : ''));
    box.appendChild(el('span', 'meter-label', label));
    box.appendChild(el('strong', 'meter-value', value));
    return tip(box, hint, 'start');
  }

  function renderMeters(s, snap) {
    var box = $('meters');
    if (!box) return;
    clear(box);
    var slots = (window.CONFIG && CONFIG.campaign && CONFIG.campaign.productionSlots) || 3;
    box.appendChild(meter('Step', s.step + ' / ' + (s.maxSteps || snap.maxSteps), '',
      'Campaign clock: one step covers one production and launch cycle.'));
    box.appendChild(meter('Treasury', money(s.money), s.money < 0 ? 'bad' : '',
      'Cash in the bank. A negative balance blocks purchases and salaries.'));
    box.appendChild(meter('Ground fund', money(s.groundFund), '',
      'Money reserved for the ground segment: flights, link sessions and overtime.'));
    box.appendChild(meter('NP', fmt(s.np, 0), s.np <= 0 ? 'warn' : '',
      'Scientific potential: the science budget that pays for instruments and the school.'));
    box.appendChild(meter('VChK', fmt(s.vchk, 1), 'good',
      'VChK reserve: the reliability margin that absorbs overload, late flights and failures.'));
    box.appendChild(meter('Rating', fmt(s.rating, 1), s.rating < -20 ? 'bad' : (s.rating < 0 ? 'warn' : ''),
      'Agency rating: negative values cost money, below -20 the agency is in trouble.'));
    box.appendChild(meter('Prep actions', fmt(snap.actionsLeft, 0), snap.actionsLeft <= 0 ? 'warn' : '',
      'Preparation actions left in this step: factory, school, tests, technology and approvals.'));
    box.appendChild(meter('In production', (s.production || []).length + ' / ' + slots,
      (s.production || []).length >= slots ? 'warn' : '',
      'Missions building in the factory against the number of production slots.'));
    box.appendChild(meter('In flight', String((s.flights || []).length), '',
      'Missions currently flying. Link sessions and incidents happen here.'));
  }

  function renderPresence() {
    var box = $('crew');
    if (!box) return;
    var list = state.presence || [];
    if (!list.length) {
      box.textContent = 'Nobody else is connected right now.';
      return;
    }
    var parts = list.map(function (row) {
      var roles = (row.roles || []).map(function (r) { return ROLE_LABEL[r] || r; }).join(' + ');
      return (row.mask || 'participant') + (roles ? ' (' + roles + ')' : '') +
        (row.count > 1 ? ' ×' + row.count : '');
    });
    box.textContent = 'Online: ' + parts.join(' · ');
  }

  function pushFeed(text) {
    if (!text) return;
    state.feed.unshift(text);
    state.feed = state.feed.slice(0, 60);
    renderFeed();
  }

  function reportLine(r) {
    if (!r) return '';
    var head = 'Step ' + (r.step != null ? r.step : '?') + ' · ' + (r.name || nameOf(r.missionId));
    if (r.reception) {
      var res = r.result || {};
      var bits = [head + ' — ' + (res.key || 'result') + (res.key === 'fail' && res.stage ?
        ' (' + res.stage + ')' : '')];
      if (res.sAct != null) bits.push('S ' + fmt(res.sAct, 1));
      if (r.reward && r.reward.bonus != null) bits.push('+' + money(r.reward.bonus));
      if (r.earlyEnd) bits.push('closed early');
      if (r.overtime) bits.push('overtime +' + r.overtime);
      return bits.join(' · ');
    }
    if (r.session) {
      var se = r.session;
      var line = head + ' — link session' + (se.lost ? ' (lost)' : '') +
        (se.incident ? ' · ' + se.incident : '') +
        (se.event ? ' · ' + nameOf(se.event) : '');
      if (se.accrued != null) line += ' · data ' + fmt(se.accrued, 1);
      return line;
    }
    return head;
  }

  function renderFeed() {
    var box = $('log');
    if (!box) return;
    clear(box);
    var lines = state.feed.slice();
    ((state.snapshot && state.snapshot.reports) || []).slice(0, 24).forEach(function (r) {
      var line = reportLine(r);
      if (line) lines.push(line);
    });
    if (!lines.length) {
      box.appendChild(el('li', 'muted', 'No events yet in this campaign.'));
      return;
    }
    lines.forEach(function (line) { box.appendChild(el('li', null, line)); });
  }

  /* ---------- render: mission offers ---------- */

  function renderOffers(s, snap) {
    var box = $('offers');
    var meta = $('offersMeta');
    if (!box) return;
    clear(box);
    var offers = s.offers || [];
    if (meta) meta.textContent = offers.length + ' on the table · selected: ' + (snap.selectedMissionId || '—');
    if (!offers.length) {
      box.appendChild(el('div', 'empty', 'The showcase is empty. Close the step to draw new offers.'));
      return;
    }
    offers.forEach(function (id) {
      var m = mission(id) || {};
      var card = el('article', 'offer' + (id === snap.selectedMissionId ? ' on' : ''));
      var head = el('div', 'row between');
      head.appendChild(el('h3', null, nameOf(id)));
      head.appendChild(el('span', 'hint', (m.agency || '') + (m.year ? ' ' + m.year : '')));
      card.appendChild(head);

      var chips = el('div', 'chips');
      chips.appendChild(chip(pointName(m.point), 'cy', tipOf(m.point)));
      chips.appendChild(chip('data: ' + ENname(m.dataType), null, tipOf(m.dataType)));
      chips.appendChild(chip('deadline ' + (m.deadline != null ? m.deadline : '—'), null,
        'Steps from acceptance until the contract deadline.'));
      chips.appendChild(chip('target S ' + fmt(m.targetValue, 0), 'ok', 'Science needed for a full success.'));
      chips.appendChild(chip('complexity ' + fmt(m.complexity, 1), null, 'Higher complexity means a richer contract.'));
      if (m.farSide) chips.appendChild(chip('far side', 'warn', 'The far side needs a relay satellite.'));
      card.appendChild(chips);

      var needs = (m.requires || []).map(function (key) { return key; });
      if (needs.length) {
        card.appendChild(el('p', 'hint', 'Payload required: ' + needs.map(physicalName).join(', ') + '.'));
      }
      if (m.history) card.appendChild(el('p', 'small', m.history));

      var actions = el('div', 'row');
      actions.appendChild(btn('Open', 'select-mission', { mission: id }, {
        cls: id === snap.selectedMissionId ? 'primary' : '',
        title: 'Open this offer on the board: build, checks and confirmations.'
      }));
      actions.appendChild(btn('Recommended build', 'recommend', { mission: id }, {
        disabled: !roleAllowed('recommend'),
        title: 'Fill the build from the cheapest safe assembly'
      }));
      actions.appendChild(btn('Accept', 'accept', { mission: id }, {
        disabled: !roleAllowed('accept'),
        title: 'Sign the contract, take the advance and queue production'
      }));
      card.appendChild(actions);
      box.appendChild(card);
    });
  }

  /* English name for a language-neutral id (config class, point, data type). */
  function ENname(id) {
    if (!id) return '—';
    if (window.EN && EN.name) {
      var n = EN.name(id);
      if (n && n !== id) return n;
    }
    return String(id);
  }

  var PHYS_NAMES = {
    capsule: 'return capsule', lander: 'descent module', rover: 'rover / drone',
    manipulator: 'sample manipulator', relay: 'relay satellite'
  };

  function physicalName(key) {
    return PHYS_NAMES[key] || key;
  }

  function kvRow(box, label, value, hint) {
    var row = el('div', 'kv');
    var k = el('span', 'kv-k', label);
    row.appendChild(tip(k, hint, 'start'));
    row.appendChild(el('span', 'kv-v', value));
    box.appendChild(row);
    return row;
  }

  /* ---------- render: selected mission build ---------- */

  function renderBuild(s, snap) {
    var box = $('build');
    var meta = $('buildMeta');
    if (!box) return;
    clear(box);
    var missionId = snap.selectedMissionId;
    if (!missionId) {
      if (meta) meta.textContent = '';
      box.appendChild(el('div', 'empty', 'Pick an offer on the left to open its build.'));
      return;
    }
    var m = mission(missionId) || {};
    var a = state.analysis && state.analysis.missionId === missionId ? state.analysis : null;
    var b = (snap.builds || {})[missionId] || null;
    var sel = (b && b.sel) || {};
    var trajId = (b && b.trajId) || (m.trajectories || [])[0] || 'direct';
    if (meta) {
      meta.textContent = (a ? a.score : 'n/a') + ' · ' +
        (a && a.ready.engineer ? 'E✓' : 'E…') + ' ' + (a && a.ready.scientist ? 'S✓' : 'S…');
    }

    var head = el('div', 'row between');
    head.appendChild(el('h3', null, nameOf(missionId)));
    var headChips = el('div', 'chips');
    headChips.appendChild(chip(pointName(m.point), 'cy', tipOf(m.point)));
    headChips.appendChild(chip(ENname(trajId), null, tipOf(trajId)));
    head.appendChild(headChips);
    box.appendChild(head);

    box.appendChild(buildNumbers(a));
    box.appendChild(buildChecks(a));

    var ready = el('div', 'row confirm-row');
    ready.appendChild(chip(a && a.ready.engineer ? 'engineer confirmed' : 'engineer pending',
      a && a.ready.engineer ? 'ok' : 'warn'));
    ready.appendChild(chip(a && a.ready.scientist ? 'scientist confirmed' : 'scientist pending',
      a && a.ready.scientist ? 'ok' : 'warn'));
    ready.appendChild(btn('Confirm engineer part', 'confirm-engineer', { mission: missionId }, {
      disabled: !roleAllowed('confirm-engineer'), cls: 'ghost',
      title: 'Launcher, redundancy, physical modules and trajectory are final'
    }));
    ready.appendChild(btn('Confirm scientist part', 'confirm-scientist', { mission: missionId }, {
      disabled: !roleAllowed('confirm-scientist'), cls: 'ghost',
      title: 'Control, instruments, power, antenna and buffer are final'
    }));
    box.appendChild(ready);

    renderEngineerEditor(box, m, sel, trajId, missionId);
    renderScientistEditor(box, m, sel, missionId);

    var footer = el('div', 'row');
    footer.appendChild(btn('Accept the contract', 'accept', { mission: missionId }, {
      disabled: !roleAllowed('accept'), cls: 'primary',
      title: 'Take the advance and queue production'
    }));
    footer.appendChild(btn('Recommended build', 'recommend', { mission: missionId }, {
      disabled: !roleAllowed('recommend')
    }));
    box.appendChild(footer);
  }

  function buildNumbers(a) {
    var wrap = el('div', 'kvs');
    if (!a) {
      wrap.appendChild(el('p', 'hint', 'The server has not analysed this mission yet.'));
      return wrap;
    }
    var n = a.numbers || {};
    kvRow(wrap, 'P success', n.pSuccess == null ? '—' : pct(n.pSuccess),
      'Probability of a successful launch and a healthy spacecraft.');
    kvRow(wrap, 'S expected', fmt(n.sDet, 1), 'Science points expected at reception.');
    kvRow(wrap, 'Target S', fmt(n.target, 0), 'The mission needs this much science for a full success.');
    kvRow(wrap, 'Channel', n.pChannel == null ? '—' : pct(n.pChannel),
      'Reliability of the data channel at reception.');
    kvRow(wrap, 'Data ratio', n.dataRatio == null ? '—' : pct(n.dataRatio),
      'Share of the science that can be transmitted.');
    kvRow(wrap, 'Mass', massLabel(n.massKg) + ' / ' + massLabel(n.capacityKg), 'Payload against launcher capacity.');
    kvRow(wrap, 'Power', fmt(n.powerRequired, 0) + ' / ' + fmt(n.powerAvailable, 0) + ' W',
      'Instrument demand against the power source at the destination.');
    kvRow(wrap, 'Control slots', fmt(n.slotsUsed, 0) + ' / ' + fmt(n.slotsTotal, 0),
      'Command and data handling capacity.');
    kvRow(wrap, 'Price', money(n.price) + ' / cap ' + money(n.cap), 'Assembly cost against the contract cap.');
    kvRow(wrap, 'Treasury after', money(n.cashAfter), 'Cash left once the advance is in and the build is paid.');
    kvRow(wrap, 'Production', fmt(n.prodTime, 0) + ' step(s)',
      'PM per step ' + fmt(n.pmRate, 0) + ' (free ' + fmt(n.pmFree, 0) + ')');
    kvRow(wrap, 'Deadline', fmt(n.deadline, 0) + ' step(s)', 'Steps allowed by the trajectory and mission.');
    return wrap;
  }

  function buildChecks(a) {
    var wrap = el('div', 'checks');
    if (!a) return wrap;
    (a.checks || []).forEach(function (ch) {
      wrap.appendChild(chip((ch.ok ? '✓ ' : '✗ ') + ch.id, ch.ok ? 'ok' : 'bad', codeTextSafe('check-' + ch.id)));
    });
    var blockers = a.blockers || [];
    var warnings = a.warnings || [];
    if (blockers.length) wrap.appendChild(el('p', 'note bad', analysisNotes(blockers, a.numbers)));
    if (warnings.length) wrap.appendChild(el('p', 'note warn', analysisNotes(warnings, a.numbers)));
    if (!blockers.length && !warnings.length) {
      wrap.appendChild(el('p', 'note ok', 'All checks pass. The build is ready to be accepted.'));
    }
    return wrap;
  }

  /* ---------- build editors (engineer / scientist) ---------- */

  function cards(group) {
    return (window.CARDS && CARDS[group]) || [];
  }

  function cardById(id) {
    if (!id) return null;
    if (window.CARDS_BY_ID && CARDS_BY_ID[id]) return CARDS_BY_ID[id];
    var groups = ['rockets', 'standardRockets', 'experimentalRockets', 'reservations', 'control',
      'instruments', 'standardInstruments', 'experimentalInstruments', 'antennas', 'antennaDup',
      'power', 'buffers', 'physical'];
    for (var i = 0; i < groups.length; i += 1) {
      var found = cards(groups[i]).filter(function (c) { return c.id === id; })[0];
      if (found) return found;
    }
    return null;
  }

  function cardLabel(card) {
    if (!card) return '—';
    var bits = [];
    if (card.mass != null) bits.push(card.mass + ' kg');
    if (card.payload != null) bits.push(card.payload + ' t');
    if (card.watts != null) bits.push(card.watts + ' W');
    if (card.bw != null) bits.push(card.bw + ' Mbit/s');
    if (card.slots != null) bits.push(card.slots + ' slots');
    if (card.price != null) bits.push(card.price + ' $');
    if (card.p != null) bits.push('p ' + fmt(card.p, 2));
    if (card.experimental) bits.push('experimental' + (card.generation ? ' gen ' + card.generation : ''));
    if (card.standard) bits.push('standard' + (card.generation ? ' gen ' + card.generation : ''));
    return (card.name || ENname(card.id)) + (bits.length ? ' — ' + bits.join(', ') : '');
  }

  function draftPatch(missionId) {
    if (!state.draft || state.draft.missionId !== missionId) {
      state.draft = { missionId: missionId, patch: {} };
    }
    return state.draft.patch;
  }

  function current(missionId, sel, key) {
    var patch = state.draft && state.draft.missionId === missionId ? state.draft.patch : {};
    return patch[key] !== undefined ? patch[key] : sel[key];
  }

  function cardSelect(missionId, sel, key, group, allowed, hint, emptyLabel) {
    var node = el('select', 'pick');
    if (!allowed) node.disabled = true;
    if (emptyLabel) {
      var none = el('option', null, emptyLabel);
      none.value = '';
      node.appendChild(none);
    }
    cards(group).forEach(function (card) {
      var opt = el('option', null, cardLabel(card));
      opt.value = card.id;
      opt.title = tipOf(card.id);
      node.appendChild(opt);
    });
    node.value = current(missionId, sel, key) || '';
    node.setAttribute('data-draft', key);
    node.setAttribute('data-mission', missionId);
    if (hint) tip(node, hint);
    return node;
  }

  function checkBox(missionId, sel, key, label, allowed, hint) {
    var wrap = el('label', 'check');
    var box = el('input');
    box.type = 'checkbox';
    box.checked = !!current(missionId, sel, key);
    box.disabled = !allowed;
    box.setAttribute('data-draft-check', key);
    box.setAttribute('data-mission', missionId);
    wrap.appendChild(box);
    wrap.appendChild(el('span', null, label));
    return tip(wrap, hint, 'start');
  }

  /* A label plus its control. The tooltip always lives on the label: native
   * titles on the control itself would pop up on top of the styled bubble. */
  function field(label, node, hint) {
    var row = el('label', 'field');
    var span = el('span', 'field-label', label);
    var text = hint || (node && node.getAttribute ? node.getAttribute('title') : '');
    if (text) {
      tip(row, text, 'start');
      if (node && node.removeAttribute) node.removeAttribute('title');
    }
    row.appendChild(span);
    row.appendChild(node);
    return row;
  }

  function applyRow(box, missionId, role) {
    var row = el('div', 'row');
    row.appendChild(btn('Apply changes', 'patch-' + role, { mission: missionId }, {
      disabled: !roleAllowed('patch-' + role), cls: 'ghost',
      title: 'Only the ' + role + ' can edit this half of the build'
    }));
    box.appendChild(row);
  }

  /* A titled sub-block appended to a panel. */
  function section(parent, title, hint) {
    var wrap = el('section', 'sub');
    var head = el('div', 'row between');
    head.appendChild(el('h4', null, title));
    if (hint) head.appendChild(el('span', 'hint', hint));
    wrap.appendChild(head);
    if (parent) parent.appendChild(wrap);
    return wrap;
  }

  function renderEngineerEditor(box, m, sel, trajId, missionId) {
    var allowed = state.role === 'engineer';
    var wrap = section(box, 'Engineer: launcher, modules, trajectory',
      allowed ? 'you may edit' : 'read only');

    var trajSel = el('select', 'pick');
    (m.trajectories || []).forEach(function (id) {
      var opt = el('option', null, ENname(id));
      opt.value = id;
      opt.title = tipOf(id);
      trajSel.appendChild(opt);
    });
    trajSel.value = trajId;
    trajSel.disabled = !allowed;
    trajSel.setAttribute('data-draft-traj', 'trajId');
    trajSel.setAttribute('data-mission', missionId);
    wrap.appendChild(field('Trajectory', trajSel, 'Only the profiles offered by this mission can be flown.'));

    wrap.appendChild(field('Launcher', cardSelect(missionId, sel, 'rocketId', 'rockets', allowed,
      'Launch mass capacity, bus power and bus channel.')));
    wrap.appendChild(field('Redundancy', cardSelect(missionId, sel, 'reservationId', 'reservations', allowed,
      'A backup copy of a critical subsystem.')));
    wrap.appendChild(checkBox(missionId, sel, 'moduleBuild', 'Assemble mission modules on site',
      allowed, 'Build the required payload from physical cards instead of buying it.'));

    var phys = el('div', 'checks');
    var picked = current(missionId, sel, 'physical') || [];
    cards('physical').forEach(function (card) {
      var label = el('label', 'check');
      var input = el('input');
      input.type = 'checkbox';
      input.checked = picked.indexOf(card.id) !== -1;
      input.disabled = !allowed;
      input.setAttribute('data-phys', card.id);
      input.setAttribute('data-mission', missionId);
      label.appendChild(input);
      label.appendChild(el('span', null,
        ENname(card.id) + ' · ' + card.mass + ' kg · ' + card.price + ' $'));
      phys.appendChild(tip(label, tipOf(card.id), 'start'));
    });
    wrap.appendChild(field('Physical payload', phys,
      'Descent modules, capsules, rovers, manipulators and relay satellites.'));
    applyRow(wrap, missionId, 'engineer');
  }

  function renderScientistEditor(box, m, sel, missionId) {
    var allowed = state.role === 'scientist';
    var wrap = section(box, 'Scientist: control, instruments, power',
      allowed ? 'you may edit' : 'read only');

    wrap.appendChild(field('Control (C&DH)', cardSelect(missionId, sel, 'controlId', 'control', allowed,
      'Command slots and onboard data handling.')));
    wrap.appendChild(field('Antenna', cardSelect(missionId, sel, 'antennaId', 'antennas', allowed,
      'Channel bandwidth for the downlink.')));
    wrap.appendChild(checkBox(missionId, sel, 'antennaDup', 'Duplicate the antenna',
      allowed, 'A second antenna: redundancy for the communication channel.'));
    wrap.appendChild(field('Power source', cardSelect(missionId, sel, 'powerId', 'power', allowed,
      'Solar panels lose output away from Earth; reactors do not.')));
    wrap.appendChild(field('Buffer', cardSelect(missionId, sel, 'bufferId', 'buffers', allowed,
      'Battery capacity that smooths the transmission window.', 'no buffer')));

    var picked = current(missionId, sel, 'instruments') || [];
    var countOf = function (id) {
      var row = picked.filter(function (x) { return (x.id || x) === id; })[0];
      return row ? Number(row.count || 1) : 0;
    };
    var list = el('div', 'ins-list');
    cards('instruments').forEach(function (card) {
      var row = el('div', 'ins-row');
      var num = el('select', 'pick small-pick');
      for (var i = 0; i <= 3; i += 1) {
        var opt = el('option', null, String(i));
        opt.value = String(i);
        num.appendChild(opt);
      }
      num.value = String(countOf(card.id));
      num.disabled = !allowed;
      num.setAttribute('data-ins', card.id);
      num.setAttribute('data-mission', missionId);
      row.appendChild(num);
      row.appendChild(el('span', 'ins-name', ENname(card.id)));
      row.appendChild(el('span', 'hint', card.mass + ' kg · ' + card.watts + ' W · ' +
        card.bw + ' Mbit/s · ' + card.price + ' $ · p ' + fmt(card.p, 2) +
        (m.dataType && card.dataType === m.dataType ? ' · matches the mission data type' : '')));
      list.appendChild(tip(row, tipOf(card.id), 'start'));
    });
    wrap.appendChild(field('Instruments', list,
      'Science value, mass, power draw and channel load per instrument.'));
    applyRow(wrap, missionId, 'scientist');
  }

  /* ---------- render: operations ---------- */

  function chip(text, cls, hint) {
    var node = el('span', 'chip' + (cls ? ' ' + cls : ''), text);
    return tip(node, hint);
  }

  function renderOps(s, snap) {
    var box = $('ops');
    var meta = $('opsMeta');
    if (!box) return;
    clear(box);
    if (meta) {
      meta.textContent = 'step ' + s.step + '/' + s.maxSteps + ' · ' + (snap.actionsLeft || 0) +
        ' action(s) left';
    }

    var clock = section(box, 'Campaign clock', 'the room moves one step at a time');
    var row = el('div', 'row');
    row.appendChild(btn('Close the step', 'next-step', null, {
      disabled: !roleAllowed('next-step'), cls: 'primary',
      title: 'Flights advance, production ticks over and a new showcase is drawn'
    }));
    row.appendChild(btn('Launch everything', 'launch-all', null, {
      disabled: !roleAllowed('launch-all'),
      title: 'Send every mission that is ready and cleared'
    }));
    row.appendChild(btn('Finish the campaign', 'finish', null, {
      disabled: !roleAllowed('finish'), cls: 'ghost',
      title: 'Tally the score and archive the team result'
    }));
    clock.appendChild(row);
    if (s.step >= s.maxSteps) {
      clock.appendChild(el('p', 'note warn', 'This is the last step — finish the campaign to score it.'));
    }

    renderApprovals(s, box);
    renderQueue(s, snap, box);
    renderFlights(s, box);
    renderProduction(s, box);
    renderPrep(s, snap, box);
    renderTech(s, box);
    renderTests(s, box);
    renderGround(s, box);
    renderStandardize(s, box);
  }

  function approvalRows(s) {
    var rows = [];
    var store = s.expApprovals || {};
    ['tests', 'launches'].forEach(function (scope) {
      var bucket = store[scope] || {};
      Object.keys(bucket).forEach(function (key) {
        var req = bucket[key];
        if (req) rows.push({ scope: scope === 'launches' ? 'launch' : 'test', key: key, req: req });
      });
    });
    return rows;
  }

  function approvalRow(s, entry) {
    var req = entry.req || {};
    var params = req.params || {};
    var row = el('div', 'queue-row');
    var title = el('div', 'queue-head');
    var label = entry.scope === 'launch'
      ? 'Launch clearance'
      : (TEST_KIND[params.kind] || 'Test clearance');
    var parts = String(entry.key).split('|');
    var subject = entry.scope === 'launch' ? nameOf(parts[1]) : '';
    title.appendChild(el('strong', null, label + (subject ? ': ' + subject : '')));
    var signed = APPROVAL_ROLES.filter(function (r) { return req.signatures && req.signatures[r]; });
    var chips = el('div', 'chips');
    APPROVAL_ROLES.forEach(function (r) {
      var ok = signed.indexOf(r) !== -1;
      chips.appendChild(chip(ROLE_LABEL[r] + (ok ? ' ✓' : ' …'), ok ? 'ok' : 'warn',
        ok ? 'Signed' : 'Still waiting for this signature'));
    });
    (req.cards || []).forEach(function (id) {
      chips.appendChild(chip(ENname(id), 'cy', 'Experimental hardware on this request'));
    });
    title.appendChild(chips);
    row.appendChild(title);

    var canSign = roleAllowed('approve-exp');
    var mine = !!(req.signatures && req.signatures[state.role]);
    var actions = el('div', 'row');
    actions.appendChild(btn(mine ? 'You signed' : 'Sign the clearance', 'approve-exp',
      { scope: entry.scope, key: entry.key }, {
        disabled: !canSign || mine,
        cls: signed.length ? 'ghost' : 'primary',
        title: 'Engineer, scientist and manager must all sign'
      }));
    row.appendChild(actions);
    return row;
  }

  function renderApprovals(s, box) {
    var rows = approvalRows(s);
    if (!rows.length) return;
    var wrap = section(box, 'Clearances in progress', 'experimental hardware needs three signatures');
    rows.forEach(function (entry) { wrap.appendChild(approvalRow(s, entry)); });
  }

  function renderQueue(s, snap, box) {
    var ready = s.ready || [];
    var wrap = section(box, 'Ready on the pad', ready.length + ' waiting');
    if (!ready.length) {
      wrap.appendChild(el('p', 'hint', 'Nothing is assembled yet. Accepted missions appear here when production finishes.'));
      return;
    }
    ready.forEach(function (p) {
      var row = el('div', 'queue-row');
      var head = el('div', 'queue-head');
      head.appendChild(el('strong', null, nameOf(p.missionId)));
      var chips = el('div', 'chips');
      chips.appendChild(chip('launch window step ' + (p.readyStep || '—'), null,
        'The assembly finished on this step.'));
      if (p.deadlineStep != null) {
        chips.appendChild(chip('deadline step ' + p.deadlineStep,
          s.step > p.deadlineStep ? 'bad' : (p.deadlineStep - s.step <= 2 ? 'warn' : 'ok'),
          'After the deadline the contract is at risk.'));
      }
      if (p.price != null) chips.appendChild(chip(money(p.price) + ' spent', null, 'Assembly cost.'));
      head.appendChild(chips);
      row.appendChild(head);
      var actions = el('div', 'row');
      actions.appendChild(btn('Launch', 'launch', { mission: p.missionId }, {
        disabled: !roleAllowed('launch'), cls: 'primary',
        title: 'Start the flight; reception follows a few steps later'
      }));
      row.appendChild(actions);
      wrap.appendChild(row);
    });
  }

  function renderFlights(s, box) {
    var flights = s.flights || [];
    var wrap = section(box, 'In flight', flights.length + ' mission(s) on the link');
    if (!flights.length) {
      wrap.appendChild(el('p', 'hint', 'No spacecraft is transmitting right now.'));
      return;
    }
    flights.forEach(function (f) {
      var row = el('div', 'queue-row');
      var head = el('div', 'queue-head');
      head.appendChild(el('strong', null, nameOf(f.missionId)));
      var chips = el('div', 'chips');
      chips.appendChild(chip('flight ' + (f.flight || '?') + ' step(s)', null,
        'Nominal duration from launch to the start of the reception.'));
      if (f.endStep != null) {
        chips.appendChild(chip('ends step ' + f.endStep + (f.overtime ? ' (+' + f.overtime + ')' : ''),
          'ok', 'The reception window closes on this step.'));
      }
      chips.appendChild(chip('data ' + fmt(f.accrued, 1), 'cy', 'Science accumulated so far.'));
      if (f.load != null) chips.appendChild(chip('channel load ' + fmt(f.load, 1), null,
        'How much of the mission control capacity this flight occupies.'));
      chips.appendChild(chip('sessions ' + (f.sessions || []).length + ' / ' +
        ((f.flight || 0) + (f.overtime || 0)), null, 'Link sessions completed out of the planned number.'));
      if (f.earlyEnd) chips.appendChild(chip('closing early', 'bad', 'The flight will end after this session.'));
      head.appendChild(chips);
      row.appendChild(head);
      var actions = el('div', 'row');
      actions.appendChild(btn('Extend reception', 'overtime', { mission: f.missionId }, {
        disabled: !roleAllowed('overtime'), cls: 'ghost',
        title: 'One more step of reception: +8% science, but paid'
      }));
      actions.appendChild(btn('Close early', 'close-flight', { mission: f.missionId }, {
        disabled: !roleAllowed('close-flight'), cls: 'ghost',
        title: 'Stop the reception now: the data is cut to 60%'
      }));
      row.appendChild(actions);
      wrap.appendChild(row);
    });
  }

  function renderProduction(s, box) {
    var list = s.production || [];
    if (!list.length) return;
    var wrap = section(box, 'In production', list.length + ' in the factory');
    list.forEach(function (p) {
      var row = el('div', 'queue-row');
      var head = el('div', 'queue-head');
      head.appendChild(el('strong', null, nameOf(p.missionId)));
      var chips = el('div', 'chips');
      chips.appendChild(chip('ready step ' + p.readyStep, null, 'Assembly finishes on this step.'));
      chips.appendChild(chip('deadline step ' + (p.deadlineStep != null ? p.deadlineStep : '—'), null,
        'Contract deadline for the reception.'));
      chips.appendChild(chip('PM ' + fmt(p.pmRate, 0) + '/step', null,
        'Person-months per step reserved by this build.'));
      head.appendChild(chips);
      row.appendChild(head);
      wrap.appendChild(row);
    });
  }

  function prepCost(key, s) {
    var C = window.CONFIG || {};
    var camp = C.campaign || {};
    if (key === 'prep-hire') return camp.hireManager || null;
    if (key === 'prep-pr') return camp.pr || null;
    if (key === 'prep-mcs') {
      var up = (C.mcs && C.mcs.upgradeCost) || [];
      return up[(s.mcsLevel || 0) + 1] || null;
    }
    if (key === 'prep-factory') {
      var f = camp.factoryUpgrades || [];
      return f[s.factory || 0] || null;
    }
    if (key === 'prep-school') {
      var sc = camp.schoolUpgrades || [];
      return sc[s.school || 0] || null;
    }
    return null;
  }

  function costText(cost) {
    if (!cost) return 'maxed';
    var bits = [];
    if (cost.money != null) bits.push(money(cost.money));
    if (cost.np != null) bits.push('NP ' + fmt(cost.np, 0));
    if (cost.pm != null) bits.push('PM ' + fmt(cost.pm, 0));
    if (cost.rating != null) bits.push('rating ' + fmt(cost.rating, 0));
    if (cost.vchk != null) bits.push('VChK ' + fmt(cost.vchk, 0));
    return bits.join(' · ') || 'free';
  }

  function renderPrep(s, snap, box) {
    var wrap = section(box, 'Preparation actions',
      (snap.actionsLeft || 0) + ' left this step');
    var items = [
      { type: 'prep-hire', label: 'Hire a manager',
        tip: 'Managers keep the control centre at full efficiency.' },
      { type: 'prep-mcs', label: 'Upgrade mission control',
        tip: 'More channels, a better data channel and a science bonus.' },
      { type: 'prep-pr', label: 'Run a PR campaign',
        tip: 'Spend cash for VChK and rating.' },
      { type: 'prep-factory', label: 'Upgrade the factory',
        tip: 'More person-months per step, shorter production.' },
      { type: 'prep-school', label: 'Upgrade the science school',
        tip: 'Better instrument reliability, cheaper preparation.' }
    ];
    items.forEach(function (item) {
      var cost = prepCost(item.type, s);
      var row = el('div', 'queue-row');
      var head = el('div', 'queue-head');
      head.appendChild(el('strong', null, item.label));
      var chips = el('div', 'chips');
      chips.appendChild(chip(costText(cost), cost ? null : 'warn',
        'Cost in cash, NP, PM and rating'));
      var CAMP = levelCaps();
      if (item.type === 'prep-mcs') chips.appendChild(chip('level ' + (s.mcsLevel || 0) + '/' + CAMP.mcs, null, 'Nominal mission control level'));
      if (item.type === 'prep-factory') chips.appendChild(chip('level ' + (s.factory || 0) + '/' + CAMP.factory, null, 'Factory level'));
      if (item.type === 'prep-school') chips.appendChild(chip('level ' + (s.school || 0) + '/' + CAMP.school, null, 'Science school level'));
      if (item.type === 'prep-hire') chips.appendChild(chip('managers ' + (s.managers || 0), null, 'Managers on the staff'));
      head.appendChild(chips);
      row.appendChild(head);
      var actions = el('div', 'row');
      actions.appendChild(btn('Do it', item.type, null, {
        disabled: !cost || !roleAllowed(item.type) || (snap.actionsLeft || 0) <= 0,
        title: item.tip
      }));
      row.appendChild(actions);
      wrap.appendChild(row);
    });
  }

  function techLevel(s, kind, cls) {
    var base = (window.CONFIG && CONFIG.tech && CONFIG.tech.baseLevel) || 1;
    var tree = s.tech ? s.tech[kind] : null;
    return tree && tree[cls] != null ? tree[cls] : base;
  }

  function techIp(s, kind, cls) {
    var tree = s.ip ? s.ip[kind] : null;
    return tree && tree[cls] != null ? tree[cls] : 0;
  }

  function techClasses(kind) {
    var T = (window.CONFIG && CONFIG.tech) || {};
    return (kind === 'rocket' ? T.rocketClasses : T.instrumentClasses) || [];
  }

  function renderTech(s, box) {
    var wrap = section(box, 'Research (NIOKR)', 'class level raises reliability across the board');
    [['rocket', 'tech-rocket', 'Launcher class'], ['instrument', 'tech-instrument', 'Instrument class']]
      .forEach(function (pair) {
        var kind = pair[0];
        var type = pair[1];
        var grid = el('div', 'tech-grid');
        techClasses(kind).forEach(function (cls) {
          var level = techLevel(s, kind, cls);
          var ip = techIp(s, kind, cls);
          var maxLevel = (window.CONFIG && CONFIG.tech && CONFIG.tech.maxLevel) || 4;
          var target = level + 1;
          var need = (window.CONFIG && CONFIG.tech && CONFIG.tech.ipThresholds &&
            CONFIG.tech.ipThresholds[target]) || 0;
          var cost = target <= maxLevel ? {
            money: ((CONFIG.tech && CONFIG.tech.upgradeCost && CONFIG.tech.upgradeCost.money) || 100) * target,
            np: ((CONFIG.tech && CONFIG.tech.upgradeCost && CONFIG.tech.upgradeCost.np) || 0) * target,
            pm: ((CONFIG.tech && CONFIG.tech.upgradeCost && CONFIG.tech.upgradeCost.pm) || 0) * target
          } : null;
          var tile = el('div', 'tech-tile');
          tile.appendChild(el('strong', null, ENname(cls)));
          tile.appendChild(el('span', 'hint', 'level ' + level + ' / ' + maxLevel + ' · IP ' + ip +
            (need ? ' (needs ' + need + ')' : '')));
          if (target <= maxLevel) {
            tile.appendChild(btn('Upgrade → ' + target, type, { cls: cls }, {
              disabled: !roleAllowed(type) || ip < need,
              cls: ip >= need ? '' : 'ghost',
              title: 'Cost ' + costText(cost) + '. R&D needs IP from tests and flights.'
            }));
          } else {
            tile.appendChild(el('span', 'hint', 'fully researched'));
          }
          grid.appendChild(tile);
        });
        wrap.appendChild(field(pair[2], grid, 'Each level adds reliability to every card of the class.'));
      });
  }

  function pool(s, kind) {
    var base = kind === 'rocket' ? 'rockets' : 'instruments';
    var out = cards(base).slice();
    var groups = kind === 'rocket'
      ? ['standardRockets', 'experimentalRockets']
      : ['standardInstruments', 'experimentalInstruments'];
    groups.forEach(function (group) {
      cards(group).forEach(function (card) {
        if (card.standard) {
          if (s.standardized && s.standardized[card.sourceId]) out.push(card);
          return;
        }
        if (!card.experimental) { out.push(card); return; }
        if ((card.generation || 1) <= 1) { out.push(card); return; }
        if (s.expUnlocked && s.expUnlocked[card.id]) { out.push(card); return; }
        if (s.standardized && card.unlockAfter && s.standardized[card.unlockAfter]) out.push(card);
      });
    });
    return out;
  }

  function pickValue(key, fallback) {
    if (!state.pick) state.pick = {};
    return state.pick[key] !== undefined ? state.pick[key] : fallback;
  }

  function pickSelect(key, list, hint) {
    var node = el('select', 'pick');
    list.forEach(function (card) {
      var opt = el('option', null, cardLabel(card));
      opt.value = card.id;
      node.appendChild(opt);
    });
    node.value = pickValue(key, list.length ? list[0].id : '');
    node.setAttribute('data-pick', key);
    if (hint) tip(node, hint);
    return node;
  }

  function renderTests(s, box) {
    var rockets = pool(s, 'rocket');
    var instruments = pool(s, 'instrument');
    var wrap = section(box, 'Tests', s.testUsed ? 'already used this step' : 'one test per step');
    var testTip = 'Burns a preparation action. Success earns IP for the class and lowers the ' +
      'experimental risk of the card.';

    var flightRow = el('div', 'queue-row');
    var head = el('div', 'queue-head');
    head.appendChild(el('strong', null, 'Launcher test flight'));
    var chips = el('div', 'chips');
    chips.appendChild(chip('experimental launcher', 'cy',
      'Testing experimental hardware needs three signatures the first time.'));
    head.appendChild(chips);
    flightRow.appendChild(head);
    var controls = el('div', 'row');
    controls.appendChild(pickSelect('rocketId', rockets, 'Which launcher to fly'));
    controls.appendChild(btn('Fly', 'test-rocket', null, {
      disabled: !roleAllowed('test-rocket') || s.testUsed || !rockets.length,
      title: testTip
    }));
    flightRow.appendChild(controls);
    wrap.appendChild(flightRow);

    var standRow = el('div', 'queue-row');
    var standHead = el('div', 'queue-head');
    standHead.appendChild(el('strong', null, 'Instrument bench test'));
    var standChips = el('div', 'chips');
    standChips.appendChild(chip('cheapest progress on instrument risk', null,
      'The bench test is the cheapest way to work off experimental risk.'));
    standHead.appendChild(standChips);
    standRow.appendChild(standHead);
    var standControls = el('div', 'row');
    standControls.appendChild(pickSelect('standCardId', instruments, 'Which instrument to test'));
    standControls.appendChild(btn('Run the stand', 'test-stand', null, {
      disabled: !roleAllowed('test-stand') || s.testUsed || !instruments.length,
      title: testTip
    }));
    standRow.appendChild(standControls);
    wrap.appendChild(standRow);

    var pairRow = el('div', 'queue-row');
    var pairHead = el('div', 'queue-head');
    pairHead.appendChild(el('strong', null, 'Instrument test flight'));
    var pairChips = el('div', 'chips');
    pairChips.appendChild(chip('launcher + instrument', null,
      'Costs more, but tests the pair that will fly together.'));
    pairHead.appendChild(pairChips);
    pairRow.appendChild(pairHead);
    var pairControls = el('div', 'row');
    pairControls.appendChild(pickSelect('testRocketId', rockets, 'Launcher for the flight'));
    pairControls.appendChild(pickSelect('testInstrumentId', instruments, 'Instrument for the flight'));
    pairControls.appendChild(btn('Fly the pair', 'test-instrument', null, {
      disabled: !roleAllowed('test-instrument') || s.testUsed ||
        !rockets.length || !instruments.length,
      title: testTip
    }));
    pairRow.appendChild(pairControls);
    wrap.appendChild(pairRow);
  }

  function renderGround(s, box) {
    var instruments = pool(s, 'instrument');
    var wrap = section(box, 'Ground contracts', 'turn the ground fund into cash and IP');
    var row = el('div', 'queue-row');
    var head = el('div', 'queue-head');
    head.appendChild(el('strong', null, 'Sell an instrument contract'));
    var chips = el('div', 'chips');
    chips.appendChild(chip('fund ' + money(s.groundFund), null, 'Money reserved for ground work.'));
    head.appendChild(chips);
    row.appendChild(head);
    var controls = el('div', 'row');
    controls.appendChild(pickSelect('groundCardId', instruments, 'Instrument to build under contract'));
    controls.appendChild(btn('Take the contract', 'ground', null, {
      disabled: !roleAllowed('ground') || !instruments.length,
      title: 'Paid from the ground fund; earns IP for the class.'
    }));
    row.appendChild(controls);
    wrap.appendChild(row);
  }

  function standardizeCandidates(s, kind) {
    var groups = kind === 'rocket'
      ? ['standardRockets', 'experimentalRockets']
      : ['standardInstruments', 'experimentalInstruments'];
    var out = [];
    groups.forEach(function (group) {
      cards(group).forEach(function (card) {
        if (card.standard) return;
        if (s.standardized && s.standardized[card.id]) return;
        out.push(card);
      });
    });
    return out;
  }

  function renderStandardize(s, box) {
    var rockets = standardizeCandidates(s, 'rocket');
    var instruments = standardizeCandidates(s, 'instrument');
    if (!rockets.length && !instruments.length) return;
    var wrap = section(box, 'Standardisation', 'freeze the current reliability into a standard card');
    rockets.forEach(function (card) { wrap.appendChild(standardRow(card, 'engineer')); });
    instruments.forEach(function (card) { wrap.appendChild(standardRow(card, 'scientist')); });
  }

  function standardRow(card, role) {
    var row = el('div', 'queue-row');
    var head = el('div', 'queue-head');
    head.appendChild(el('strong', null, ENname(card.id)));
    var chips = el('div', 'chips');
    chips.appendChild(chip(role === 'engineer' ? 'launcher' : 'instrument', null, 'Card class'));
    chips.appendChild(chip('gen ' + (card.generation || 1), null, 'Experimental generation'));
    if (card.p != null) chips.appendChild(chip('p ' + fmt(card.p, 2), null, 'Base reliability of the card'));
    head.appendChild(chips);
    row.appendChild(head);
    var cost = (window.CONFIG && CONFIG.tech && CONFIG.tech.standardizeCost) || { money: 100 };
    var controls = el('div', 'row');
    controls.appendChild(btn('Standardise (' + costText(cost) + ')', 'standardize',
      { card: card.id }, {
        disabled: !roleAllowed('standardize') || state.role !== role,
        title: 'Only the ' + role + ' can standardise this card'
      }));
    row.appendChild(controls);
    return row;
  }

  /* ---------- render: programme and archive ---------- */

  function scoreRow(score) {
    var grid = el('div', 'score-grid');
    [['Total', score.total, 'Points from every scored part below.'],
      ['Rating part', score.rating, 'VChK and rating converted into points.'],
      ['VChK part', score.vchkPart, 'Half of the VChK reserve.'],
      ['Technology', score.techPart, 'Class levels and IP.'],
      ['Standardisation', score.stdPart, 'Standardised cards on the programme.'],
      ['Mission control', score.mcsPart, 'MCC level and slots.'],
      ['School', score.schoolPart, 'Science school level.'],
      ['Rescues', score.rescuePart, 'Partial successes rescued.'],
      ['Penalty', score.penaltyPart, 'Failures, expiries and overload.']
    ].forEach(function (pair) {
      if (pair[1] == null) return;
      var tile = el('div', 'score-tile');
      tile.appendChild(el('span', 'meter-label', pair[0]));
      tile.appendChild(el('strong', 'meter-value', fmt(pair[1], 1)));
      grid.appendChild(tip(tile, pair[2], 'start'));
    });
    return grid;
  }

  function statsChips(stats) {
    var chips = el('div', 'chips');
    [['missions', 'missions'], ['accepted', 'accepted'], ['launches', 'launches'],
      ['success', 'successes'], ['partial', 'partials'], ['fail', 'failures'],
      ['expired', 'expired'], ['rescues', 'rescued'], ['advances', 'advances'],
      ['opsFlights', 'flights tracked'], ['opsSessions', 'link sessions'],
      ['opsIncidents', 'incidents'], ['opsLostSessions', 'lost sessions'],
      ['opsOvertime', 'overtimes'], ['opsEarlyEnds', 'early ends'],
      ['opsOverloadSteps', 'overload steps'], ['testLaunches', 'test flights'],
      ['standardized', 'standardised'], ['groundContracts', 'ground contracts'],
      ['maxFailStreak', 'worst fail streak'], ['salaries', 'salaries paid'],
      ['upkeep', 'MCC upkeep']
    ].forEach(function (pair) {
      var value = stats ? stats[pair[0]] : null;
      if (!value) return;
      var text = pair[0] === 'salaries' || pair[0] === 'upkeep' ?
        money(value) + ' ' + pair[1] : fmt(value, 0) + ' ' + pair[1];
      chips.appendChild(chip(text, null, 'Campaign statistics'));
    });
    if (stats && stats.bonuses) {
      chips.appendChild(chip('+' + money(stats.bonuses) + ' bonuses', 'ok', 'Contract bonuses and events'));
    }
    if (stats && stats.spent) {
      chips.appendChild(chip(money(stats.spent) + ' spent on builds', null, 'Cash spent on assemblies'));
    }
    return chips;
  }

  function renderProgramme(s, snap) {
    var box = $('programme');
    if (!box) return;
    clear(box);
    var record = state.result || null;
    var score = (record && record.score) || s.score || null;

    var scoreSec = section(box, 'Score', record ? 'final tally' : 'tallied when the campaign is closed');
    if (score && score.total != null) scoreSec.appendChild(scoreRow(score));
    else scoreSec.appendChild(el('p', 'hint',
      'The score is computed at the finish: rating, VChK, technology, standardisation, ' +
      'mission control, the school, rescues and penalties.'));

    var stats = (record && record.stats) || s.stats || {};
    var statsSec = section(box, 'Campaign statistics', 'what the team actually flew');
    var statsRow = statsChips(stats);
    statsSec.appendChild(statsRow);
    if (!statsRow.children.length) statsSec.appendChild(el('p', 'hint', 'Nothing has flown yet.'));

    var points = (record && record.rolePoints) || snap.rolePoints || null;
    if (points) {
      var crewSec = section(box, 'Crew points', 'each console earns its own tally');
      var crewChips = el('div', 'chips');
      [['eng', 'Engineer'], ['sci', 'Scientist'], ['man', 'Manager']].forEach(function (pair) {
        crewChips.appendChild(chip(pair[1] + ' ' + fmt(points[pair[0]], 0), 'cy',
          'Points earned by the ' + pair[1] + ' console.'));
      });
      crewSec.appendChild(crewChips);
    }

    var levelSec = section(box, 'Programme levels', 'levels decide reliability and capacity');
    var caps = levelCaps();
    var levelChips = el('div', 'chips');
    levelChips.appendChild(chip('MCC ' + (s.mcsLevel || 0) + '/' + caps.mcs, null, 'Mission control centre level'));
    levelChips.appendChild(chip('factory ' + (s.factory || 0) + '/' + caps.factory, null, 'Factory level'));
    levelChips.appendChild(chip('school ' + (s.school || 0) + '/' + caps.school, null, 'Science school level'));
    levelChips.appendChild(chip('managers ' + (s.managers || 0), null, 'Managers on the staff'));
    levelChips.appendChild(chip('VChK ' + fmt(s.vchk, 1), null, 'VChK reserve'));
    levelChips.appendChild(chip('rating ' + fmt(s.rating, 1), null, 'Agency rating'));
    levelSec.appendChild(levelChips);
  }

  function archiveEntry(entry) {
    var node = el('details', 'archive-entry');
    var summary = tip(el('summary'), 'Open the historical brief for this reception.', 'start');
    var head = el('div', 'row between');
    var name = entry.missionName || nameOf(entry.missionId);
    head.appendChild(el('strong', null, 'Step ' + (entry.step != null ? entry.step : '?') + ' · ' + name));
    var chips = el('div', 'chips');
    var key = entry.verdictKey || 'fail';
    chips.appendChild(chip(String(key), key === 'full' || key === 'success' ? 'ok' :
      (key === 'partial' ? 'warn' : 'bad'), entry.verdict || 'Verdict of the reception'));
    if (entry.sAct != null) {
      chips.appendChild(chip('S ' + fmt(entry.sAct, 1) + ' / ' +
        (entry.target == null ? '?' : fmt(entry.target, 0)), 'cy', 'Science delivered against the target'));
    }
    if (entry.bonus) chips.appendChild(chip('+' + money(entry.bonus), null, 'Contract bonus'));
    if (entry.dRating) chips.appendChild(chip('rating ' + fmt(entry.dRating, 1), null, 'Rating change'));
    head.appendChild(chips);
    summary.appendChild(head);
    node.appendChild(summary);

    var facts = el('div', 'chips');
    if (entry.pointName) facts.appendChild(chip(entry.pointName, null, 'Destination'));
    if (entry.trajectoryName) facts.appendChild(chip(entry.trajectoryName, null, 'Trajectory profile'));
    if (entry.flightSteps) facts.appendChild(chip(entry.flightSteps + ' flight step(s)', null,
      'How long the flight lasted'));
    if (entry.sessions) facts.appendChild(chip(entry.sessions + ' session(s)', null,
      'Communication sessions'));
    if (entry.lostSessions) facts.appendChild(chip(entry.lostSessions + ' lost', 'bad',
      'Sessions lost to the human factor'));
    if (entry.overtime) facts.appendChild(chip('overtime ' + entry.overtime, 'warn', 'Flight director overtime'));
    if (entry.earlyEnd) facts.appendChild(chip('closed early', 'warn', 'The director stopped the reception'));
    if (entry.agency) facts.appendChild(chip(entry.agency + (entry.year ? ' ' + entry.year : ''), null,
      'Who flew the mission for real'));
    node.appendChild(facts);
    if (entry.narrative) node.appendChild(el('p', 'small muted', entry.narrative));
    return node;
  }

  function renderArchive() {
    var box = $('archive');
    var meta = $('archiveMeta');
    if (!box) return;
    clear(box);
    var list = (state.history || []).slice().reverse();
    if (meta) {
      var updated = state.result && state.result.finishedAt ? ' · archived ' +
        String(state.result.finishedAt).slice(0, 16).replace('T', ' ') : '';
      meta.textContent = list.length + ' mission brief(s)' + updated;
    }
    if (!list.length) {
      box.appendChild(el('div', 'empty',
        'The archive is empty. Every received mission gets a historical brief here.'));
      return;
    }
    list.forEach(function (entry) { box.appendChild(archiveEntry(entry)); });
  }

  /* ---------- render: finished banner ---------- */

  function renderFinished() {
    var bar = $('finishedBar');
    if (!bar) return;
    var record = state.result;
    var snap = state.snapshot;
    var done = !!(record || (state.team && state.team.status === 'finished'));
    bar.hidden = !done;
    clear(bar);
    if (!done) return;

    var head = el('div', 'row between');
    head.appendChild(el('h2', null, 'Campaign finished'));
    var chips = el('div', 'chips');
    if (record) {
      if (record.score && record.score.total != null) {
        chips.appendChild(chip('score ' + fmt(record.score.total, 1), 'ok', 'Final score of the campaign'));
      }
      if (record.missionCount != null) {
        chips.appendChild(chip(record.missionCount + ' mission(s)', null, 'Missions in the archive'));
      }
      if (record.vchk != null) chips.appendChild(chip('VChK ' + fmt(record.vchk, 1), null, 'VChK reserve at the finish'));
      if (record.rosterSize) chips.appendChild(chip(record.rosterSize + ' member(s)', null, 'Roster size at the finish'));
      if (record.finishedAt) {
        chips.appendChild(chip(String(record.finishedAt).slice(0, 16).replace('T', ' '), null,
          'When the record was archived'));
      }
    } else {
      chips.appendChild(chip('closing the record', 'warn', 'The server is still writing the team result'));
    }
    head.appendChild(chips);
    bar.appendChild(head);

    var row = el('div', 'row');
    row.appendChild(btn('New campaign', 'new-campaign', null, {
      cls: 'ghost', title: 'Only the captain can start a new campaign with the same team'
    }));
    bar.appendChild(row);

    if (record && record.participants && record.participants.length) {
      var crew = el('div', 'chips');
      record.participants.forEach(function (p) {
        var roles = (p.roles || []).map(function (r) { return ROLE_LABEL[r] || r; }).join(' + ');
        crew.appendChild(chip((p.name || 'participant') + (roles ? ' · ' + roles : ''), null,
          'Crew member of the finished campaign'));
      });
      bar.appendChild(crew);
    }
    if (record && record.campaignNarrative) {
      bar.appendChild(el('p', 'small muted', record.campaignNarrative));
    }
  }

  /* ---------- delegated events ---------- */

  function currentSel(missionId) {
    var snap = state.snapshot || {};
    var b = (snap.builds || {})[missionId];
    return (b && b.sel) || {};
  }

  function setDraft(missionId, key, value) {
    var patch = draftPatch(missionId);
    patch[key] = value;
    status('Build changed — press “Apply changes” to send it.');
  }

  function toggleDraftId(missionId, key, id, on) {
    var patch = draftPatch(missionId);
    var base = patch[key] !== undefined ? patch[key] : (currentSel(missionId)[key] || []);
    var list = base.slice();
    var at = list.indexOf(id);
    if (on && at === -1) list.push(id);
    if (!on && at !== -1) list.splice(at, 1);
    patch[key] = list;
    status('Build changed — press “Apply changes” to send it.');
  }

  function setDraftInstrument(missionId, id, count) {
    var patch = draftPatch(missionId);
    var base = patch.instruments !== undefined ? patch.instruments :
      (currentSel(missionId).instruments || []);
    var list = [];
    base.forEach(function (item) {
      var cardId = item && item.id ? item.id : item;
      if (!cardId) return;
      if (cardId === id) return;
      list.push({ id: cardId, count: Number(item.count || 1) });
    });
    if (count > 0) list.push({ id: id, count: count });
    patch.instruments = list;
    status('Build changed — press “Apply changes” to send it.');
  }

  function buildPatch(missionId) {
    if (!state.draft || state.draft.missionId !== missionId) return {};
    return JSON.parse(JSON.stringify(state.draft.patch));
  }

  function payloadFor(node, type) {
    var missionId = node.getAttribute('data-mission') || '';
    var payload = {};
    var card = null;
    switch (type) {
      case 'select-mission':
      case 'accept':
      case 'recommend':
      case 'launch':
      case 'overtime':
      case 'close-flight':
        if (missionId) payload.missionId = missionId;
        break;
      case 'patch-engineer':
      case 'patch-scientist':
        if (missionId) payload.missionId = missionId;
        payload.patch = buildPatch(missionId);
        break;
      case 'confirm-engineer':
      case 'confirm-scientist':
        if (missionId) payload.missionId = missionId;
        break;
      case 'approve-exp':
        payload.scope = node.getAttribute('data-scope') || 'test';
        payload.key = node.getAttribute('data-key') || '';
        break;
      case 'tech-rocket':
      case 'tech-instrument':
        payload.cls = node.getAttribute('data-cls') || '';
        break;
      case 'test-rocket':
        payload.rocketId = pickValue('rocketId', '');
        break;
      case 'test-stand':
        card = cardById(pickValue('standCardId', ''));
        payload.cardId = card ? card.id : '';
        payload.cls = (card && (card.techClass || card.cls)) || 'camera';
        break;
      case 'test-instrument':
        payload.rocketId = pickValue('testRocketId', '');
        payload.instrumentId = pickValue('testInstrumentId', '');
        break;
      case 'ground':
        card = cardById(pickValue('groundCardId', ''));
        payload.cardId = card ? card.id : '';
        payload.cls = (card && (card.techClass || card.cls)) || 'camera';
        break;
      case 'standardize':
        payload.cardId = node.getAttribute('data-card') || '';
        break;
      default:
        break;
    }
    return payload;
  }

  function onClick(e) {
    var node = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!node || node.disabled) return;
    var type = node.getAttribute('data-act');
    if (!type) return;
    e.preventDefault();
    if (state.busy) {
      status('Still sending the previous action…');
      return;
    }
    var payload = payloadFor(node, type);
    if (type === 'select-mission') {
      state.draft = null;
      state.pick = {};
    }
    act(type, payload).then(function (data) {
      if (!data || data.ok === false) return;
      if (type.indexOf('patch-') === 0 || type.indexOf('confirm-') === 0 ||
        type === 'recommend') {
        state.draft = null;
        render();
      }
    });
  }

  function onChange(e) {
    var node = e.target;
    if (!node || !node.getAttribute) return;
    var pickKey = node.getAttribute('data-pick');
    if (pickKey) {
      if (!state.pick) state.pick = {};
      state.pick[pickKey] = node.value;
      return;
    }
    var missionId = node.getAttribute('data-mission') || '';
    var draftKey = node.getAttribute('data-draft');
    if (draftKey) { setDraft(missionId, draftKey, node.value); return; }
    var trajKey = node.getAttribute('data-draft-traj');
    if (trajKey) { setDraft(missionId, trajKey, node.value); return; }
    var checkKey = node.getAttribute('data-draft-check');
    if (checkKey) { setDraft(missionId, checkKey, !!node.checked); return; }
    var physId = node.getAttribute('data-phys');
    if (physId) { toggleDraftId(missionId, 'physical', physId, !!node.checked); return; }
    var insId = node.getAttribute('data-ins');
    if (insId) setDraftInstrument(missionId, insId, Number(node.value) || 0);
  }

  boot();
})();

