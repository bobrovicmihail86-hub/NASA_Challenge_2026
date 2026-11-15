/* Space Mission Design — lobby client.
 *
 * Talks to the multiplayer server: e-mail login, team creation and joining,
 * roster management, live game list and the results archive.
 * No game logic lives here: the server is the only mutator.
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'smd.token';
  var EMAIL_KEY = 'smd.email';
  var ROLES = ['manager', 'engineer', 'scientist', 'ops'];

  /* One-line explanations reused by every role checkbox and tooltip. */
  var ROLE_TIPS = {
    manager: 'Manager: signs contracts, hires the crew and approves experiments.',
    engineer: 'Engineer: launcher, mission modules, trajectory and factory work.',
    scientist: 'Scientist: control, instruments, power and the science school.',
    ops: 'Ops: launches flights, runs link sessions and closes the step.'
  };

  var state = {
    token: localStorage.getItem(TOKEN_KEY) || '',
    email: localStorage.getItem(EMAIL_KEY) || '',
    teams: [],
    active: [],
    results: []
  };

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = String(text);
    return node;
  }

  /* Styled tooltip drawn by the [data-tip] rules in lobby.css. Form controls
   * cannot render pseudo-elements, so they keep the native title attribute. */
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

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  var toastTimer = null;
  function toast(message, bad) {
    var box = $('toast');
    box.textContent = String(message || '');
    box.className = 'toast' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.className = 'toast hidden'; }, 4200);
  }

  function api(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    if (state.token) headers['x-token'] = state.token;
    return fetch(path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (json) {
        return { status: res.status, body: json || {} };
      });
    }).catch(function (err) {
      return { status: 0, body: { ok: false, error: String(err && err.message || err) } };
    });
  }

  function failText(out) {
    if (!out) return 'Network error.';
    if (out.status === 0) return 'The server is unreachable.';
    return (out.body && (out.body.error || out.body.message)) || ('Request failed (' + out.status + ').');
  }

  function signIn(email) {
    return api('POST', '/api/login', { email: email }).then(function (out) {
      if (out.status !== 200 || !out.body.token) {
        toast(failText(out), true);
        return false;
      }
      state.token = out.body.token;
      state.email = out.body.email || email;
      localStorage.setItem(TOKEN_KEY, state.token);
      localStorage.setItem(EMAIL_KEY, state.email);
      state.teams = out.body.teams || [];
      renderSession();
      showApp(true);
      toast('Signed in as ' + state.email + '.');
      return refresh();
    });
  }

  function signOut() {
    state.token = '';
    state.email = '';
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    state.teams = [];
    renderSession();
    showApp(false);
    $('#myTeams').innerHTML = '<p class="hint">Sign in to see your teams.</p>';
    toast('Signed out.');
  }

  function showApp(on) {
    $('app').className = on ? '' : 'hidden';
    $('loginCard').className = on ? 'card hidden' : 'card';
  }

  function renderSession() {
    $('sessionText').textContent = state.email ? 'Signed in as ' + state.email : 'Not signed in';
    $('signOut').className = state.email ? 'ghost' : 'ghost hidden';
  }

  function refresh() {
    if (!state.token) return Promise.resolve();
    return api('GET', '/api/me').then(function (me) {
      if (me.status === 401) {
        signOut();
        toast('Session expired — sign in again.', true);
        return null;
      }
      state.teams = (me.body && me.body.teams) || [];
      renderTeams();
      return api('GET', '/api/results');
    }).then(function (res) {
      if (!res) return null;
      state.active = (res.body && res.body.active) || [];
      state.results = (res.body && res.body.teams) || [];
      renderOpen();
      renderResults(res.body && res.body.updatedAt);
      return null;
    });
  }

  function renderTeams() {
    var box = clear($('myTeams'));
    if (!state.teams.length) {
      box.appendChild(el('p', 'hint', 'No teams yet — create one on the left.'));
      return;
    }
    state.teams.forEach(function (team) {
      var item = el('div', 'item');
      var main = el('div');
      var title = el('div', 'title', team.name);
      title.appendChild(el('span', 'badge ' + (team.status === 'active' ? 'live' : 'ok'),
        team.status === 'active' ? 'active' : 'finished'));
      main.appendChild(title);
      var meta = el('div', 'meta');
      meta.appendChild(el('span', null, 'seed ' + team.seed));
      meta.appendChild(el('span', null, team.maxSteps + ' steps'));
      meta.appendChild(el('span', null, (team.roles || []).join(' · ') || 'no roles'));
      meta.appendChild(el('span', null, team.rosterSize + ' members'));
      if (team.total != null) meta.appendChild(el('span', null, 'total ' + fmt(team.total)));
      main.appendChild(meta);
      item.appendChild(main);

      var actions = el('div', 'actions');
      actions.appendChild(link('/app/play.html?team=' + team.id,
        team.status === 'active' ? 'Open mission control' : 'Open room', 'primary',
        'Enter the live room of this team with your own console.'));
      actions.appendChild(button('Archive', function () { openResult(team.id); }, null,
        'Read the finished campaign: score, crew and mission briefs.'));
      if (team.creator) {
        actions.appendChild(button('Roster', function () { openRoster(team); }, null,
          'Captain only: add players and hand out the roles.'));
        actions.appendChild(button('Export', function () { exportTeam(team); }, 'ghost',
          'Download the team result as a JSON record.'));
      }
      actions.appendChild(button('Invite link', function () {
        var url = location.origin + '/app/lobby.html?join=' + team.id;
        copy(url).then(function (ok) {
          toast(ok ? 'Invite link copied: ' + url : url);
        });
      }, 'ghost', 'Copy a link that lets a teammate join this team.'));
      item.appendChild(actions);
      box.appendChild(item);
    });
  }

  function renderOpen() {
    var box = clear($('openGames'));
    if (!state.active.length) {
      box.appendChild(el('p', 'hint', 'No campaigns are running right now.'));
      return;
    }
    var mine = {};
    state.teams.forEach(function (t) { mine[t.id] = true; });
    state.active.forEach(function (game) {
      var item = el('div', 'item');
      var main = el('div');
      main.appendChild(el('div', 'title', game.name));
      var meta = el('div', 'meta');
      meta.appendChild(el('span', null, 'step ' + game.step + ' / ' + game.maxSteps));
      meta.appendChild(el('span', null, game.missionCount + ' missions flown'));
      meta.appendChild(el('span', null, game.rosterSize + ' members'));
      meta.appendChild(el('span', null, (game.online || 0) + ' online'));
      if (game.members && game.members.length) {
        meta.appendChild(el('span', null, game.members.map(function (m) {
          return (m.name || m.mask) + ' (' + (m.roles || []).join('/') + ')';
        }).join(', ')));
      }
      main.appendChild(meta);
      item.appendChild(main);

      var actions = el('div', 'actions');
      if (!state.email) {
        actions.appendChild(el('span', 'hint', 'sign in to join'));
      } else if (mine[game.id]) {
        actions.appendChild(link('/app/play.html?team=' + game.id, 'Open', 'primary',
          'Open the room of your own team.'));
      } else if (game.rosterSize >= 12) {
        actions.appendChild(el('span', 'hint', 'team is full'));
      } else {
        actions.appendChild(button('Join', function () { openJoin(game); }, 'primary',
          'Take a station in this team and enter the room.'));
      }
      item.appendChild(actions);
      box.appendChild(item);
    });
  }

  function renderResults(updatedAt) {
    $('resultsUpdated').textContent = updatedAt ? 'updated ' + shortDate(updatedAt) : '';
    var box = clear($('results'));
    if (!state.results.length) {
      box.appendChild(el('p', 'hint', 'No finished campaigns yet — be the first to write a brief.'));
      return;
    }
    var table = el('table');
    var head = el('thead');
    var hr = el('tr');
    [['#', 'num'], ['Team', ''], ['Total', 'num'], ['Rating', 'num'], ['VChK', 'num'],
      ['Missions', 'num'], ['Finished', '']].forEach(function (col) {
      hr.appendChild(el('th', col[1] || null, col[0]));
    });
    head.appendChild(hr);
    table.appendChild(head);
    var body = el('tbody');
    state.results.forEach(function (row, index) {
      var tr = el('tr');
      tr.appendChild(el('td', 'num', index + 1));
      tr.appendChild(tip(el('td', null, row.teamName || row.teamId),
        'Open the campaign archive of this team.', 'start'));
      tr.appendChild(el('td', 'num', fmt(row.total)));
      tr.appendChild(el('td', 'num', fmt(row.rating)));
      tr.appendChild(el('td', 'num', fmt(row.vchk)));
      tr.appendChild(el('td', 'num', String(row.missions == null ? '—' : row.missions)));
      tr.appendChild(el('td', null, shortDate(row.finishedAt)));
      tr.addEventListener('click', function () { openResult(row.teamId); });
      body.appendChild(tr);
    });
    table.appendChild(body);
    box.appendChild(table);
  /* ---------- small UI helpers ---------- */

  function button(label, onClick, cls, hint) {
    var node = el('button', cls || null, label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return tip(node, hint);
  }

  function link(href, label, cls, hint) {
    var a = el('a', 'button' + (cls ? ' ' + cls : ''), label);
    a.href = href;
    a.style.textDecoration = 'none';
    a.style.display = 'inline-block';
    return tip(a, hint);
  }

  function fmt(value) {
    var n = Number(value);
    if (!isFinite(n)) return '—';
    return (Math.round(n * 10) / 10).toString();
  }

  function shortDate(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) + ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; },
        function () { return false; });
    }
    try {
      var area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
      return Promise.resolve(true);
    } catch (err) {
      return Promise.resolve(false);
    }
  }

  function openDialog(title, content) {
    $('dialogTitle').textContent = title;
    var box = clear($('dialogContent'));
    if (typeof content === 'string') box.innerHTML = content;
    else box.appendChild(content);
    $('dialog').className = 'dialog';
  }

  function closeDialog() { $('dialog').className = 'dialog hidden'; }

  /* ---------- archive ---------- */

  function openResult(teamId) {
    openDialog('Campaign archive', el('p', 'hint', 'Loading…'));
    api('GET', '/api/results/' + encodeURIComponent(teamId)).then(function (out) {
      if (out.status !== 200 || !out.body.record) {
        openDialog('Campaign archive', el('p', 'hint', failText(out)));
        return;
      }
      var record = out.body.record;
      var wrap = el('div');
      var head = el('div');
      head.appendChild(el('h2', null, record.teamName || teamId));
      head.appendChild(el('div', 'hint', 'Seed ' + record.seed + ' · ' + record.maxSteps + ' steps · ' +
        (record.missionCount || (record.missions || []).length) + ' missions · finished ' +
        shortDate(record.finishedAt)));
      wrap.appendChild(head);

      if (record.campaignNarrative) {
        var brief = el('div', 'brief');
        brief.appendChild(el('h4', null, 'Campaign brief'));
        brief.appendChild(el('p', null, record.campaignNarrative));
        wrap.appendChild(brief);
      }

      var score = record.score || {};
      var scoreLine = el('div', 'meta');
      var SCORE_TIPS = {
        total: 'Final score of the campaign.',
        rating: 'VChK and rating converted into points.',
        VChK: 'Half of the VChK reserve.',
        technology: 'Class levels and IP.',
        standardisation: 'Standardised cards on the programme.',
        MCC: 'Mission control level and slots.',
        school: 'Science school level.',
        rescues: 'Partial successes rescued.',
        penalty: 'Failures, expiries and overload.'
      };
      [['total', score.total], ['rating', score.rating], ['VChK', score.vchkPart],
        ['technology', score.techPart], ['standardisation', score.stdPart], ['MCC', score.mcsPart],
        ['school', score.schoolPart], ['rescues', score.rescuePart], ['penalty', score.penaltyPart]]
        .forEach(function (pair) {
          if (pair[1] == null) return;
          scoreLine.appendChild(tip(el('span', null, pair[0] + ': ' + fmt(pair[1])),
            SCORE_TIPS[pair[0]], 'start'));
        });
      wrap.appendChild(el('h3', null, 'Score breakdown'));
      wrap.appendChild(scoreLine);

      if (record.participants && record.participants.length) {
        wrap.appendChild(el('h3', null, 'Crew'));
        wrap.appendChild(el('p', 'hint', record.participants.map(function (p) {
          return (p.name || 'participant') + ' (' + (p.roles || []).join('/') + ')';
        }).join(' · ')));
      }

      wrap.appendChild(el('h3', null, 'Mission briefs'));
      var missions = record.missions || [];
      if (!missions.length) wrap.appendChild(el('p', 'hint', 'No mission was finished in this campaign.'));
      missions.forEach(function (m) {
        var box = el('div', 'brief');
        var title = el('h4', null, (m.missionName || m.id) + ' — ' + (m.verdict || 'recorded'));
        box.appendChild(title);
        box.appendChild(el('p', 'hint', 'Step ' + (m.step == null ? '?' : m.step) + ' · ' +
          (m.pointName || '?') + ' · ' + (m.trajectoryName || '?') + ' · ' +
          fmt(m.sAct) + ' / ' + (m.target == null ? '?' : m.target) + ' S · rating ' +
          (m.dRating > 0 ? '+' : '') + fmt(m.dRating)));
        box.appendChild(el('p', null, m.narrative || ''));
        wrap.appendChild(box);
      });
      openDialog('Campaign archive', wrap);
    });
  }

  }

  /* ---------- roster editor (captain) ---------- */

  function openRoster(team) {
    var rows = (team.members || []).map(function (m) {
      return { email: m.email || m.mask || '', name: m.name || '', roles: (m.roles || []).slice() };
    });
    if (!rows.length) rows.push({ email: state.email, name: '', roles: ['manager'] });
    var wrap = el('div');
    var listBox = el('div', 'list');
    wrap.appendChild(el('p', 'hint', 'The captain keeps the roster. Every e-mail is a player identity: ' +
      'a teammate signs in with the same e-mail to take their role. One manager is mandatory.'));
    wrap.appendChild(listBox);

    function draw() {
      clear(listBox);
      rows.forEach(function (row, index) {
        var item = el('div', 'item');
        var fields = el('div', 'grow');
        var email = el('input');
        email.type = 'email';
        email.value = row.email;
        email.placeholder = 'player@example.org';
        email.addEventListener('input', function () { rows[index].email = email.value.trim(); });
        var name = el('input');
        name.type = 'text';
        name.value = row.name;
        name.placeholder = 'Display name';
        name.maxLength = 40;
        name.addEventListener('input', function () { rows[index].name = name.value; });
        fields.appendChild(email);
        fields.appendChild(name);
        var roles = el('div', 'roles');
        ROLES.forEach(function (role) {
          var label = el('label');
          var box = el('input');
          box.type = 'checkbox';
          box.checked = row.roles.indexOf(role) !== -1;
          box.addEventListener('change', function () {
            var set = rows[index].roles.filter(function (r) { return r !== role; });
            if (box.checked) set.push(role);
            rows[index].roles = set;
          });
          label.appendChild(box);
          label.appendChild(document.createTextNode(' ' + role));
          roles.appendChild(tip(label, ROLE_TIPS[role], 'start'));
        });
        fields.appendChild(roles);
        item.appendChild(fields);
        if (rows.length > 1) {
          item.appendChild(button('Remove', function () {
            rows.splice(index, 1);
            draw();
          }, 'warn', 'Drop this player from the roster.'));
        }
        listBox.appendChild(item);
      });
    }

    draw();

    var bar = el('div', 'row');
    bar.appendChild(button('+ Add member', function () {
      rows.push({ email: '', name: '', roles: ['engineer'] });
      draw();
    }, 'ghost', 'Add one more player identity to the roster.'));
    bar.appendChild(button('Save roster', function () {
      api('POST', '/api/teams/' + team.id + '/roster', { roster: rows }).then(function (out) {
        if (out.status !== 200 || out.body.ok === false) {
          toast(failText(out), true);
          return;
        }
        toast('Roster saved.');
        closeDialog();
        refresh();
      });
    }, 'primary', 'Write the roster to the server: each e-mail then signs in with its own roles.'));
    wrap.appendChild(bar);
    openDialog('Roster — ' + team.name, wrap);
  }

  /* ---------- joining ---------- */

  function openJoin(game) {
    var wrap = el('div');
    var nameField = el('input');
    nameField.type = 'text';
    nameField.maxLength = 40;
    nameField.placeholder = 'Display name (optional)';
    nameField.value = state.email.split('@')[0];
    var roles = el('div', 'roles');
    var picked = { engineer: true };
    ROLES.forEach(function (role) {
      var label = el('label');
      var box = el('input');
      box.type = 'checkbox';
      box.checked = !!picked[role];
      box.addEventListener('change', function () { picked[role] = box.checked; });
      label.appendChild(box);
      label.appendChild(document.createTextNode(' ' + role));
      roles.appendChild(tip(label, ROLE_TIPS[role], 'start'));
    });
    wrap.appendChild(el('p', 'hint', 'Joining “' + game.name + '” (step ' + game.step + ' / ' + game.maxSteps +
      '). Pick the stations you will run in the control room.'));
    wrap.appendChild(el('h3', null, 'Display name'));
    wrap.appendChild(nameField);
    wrap.appendChild(el('h3', null, 'Roles'));
    wrap.appendChild(roles);
    var bar = el('div', 'row');
    bar.appendChild(button('Join team', function () {
      var chosen = ROLES.filter(function (r) { return picked[r]; });
      if (!chosen.length) {
        toast('Pick at least one role.', true);
        return;
      }
      api('POST', '/api/teams/' + game.id + '/join', { name: nameField.value, roles: chosen })
        .then(function (out) {
          if (out.status !== 200 || out.body.ok === false) {
            toast(failText(out), true);
            return;
          }
          closeDialog();
          toast(out.body.joined === false ? 'You are already in this team.' : 'Joined ' + game.name + '.');
          refresh();
        });
    }, 'primary', 'Join the team with the chosen stations.'));
    wrap.appendChild(bar);
    openDialog('Join an open game', wrap);
  }

  /* ---------- export and creation ---------- */

  function exportTeam(team) {
    var headers = { 'x-token': state.token };
    fetch('/api/teams/' + team.id + '/export', { headers: headers }).then(function (res) {
      if (!res.ok) throw new Error('export failed (' + res.status + ')');
      return res.blob();
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'smd-' + team.id + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      toast('Archive exported.');
    }).catch(function (err) {
      toast('Export failed: ' + err.message, true);
    });
  }

  function createTeam(event) {
    event.preventDefault();
    var roles = [];
    Array.prototype.forEach.call($('selfRoles').querySelectorAll('input[type="checkbox"]'), function (box) {
      if (box.checked) roles.push(box.value);
    });
    if (!roles.length) {
      toast('Pick at least one role for yourself.', true);
      return;
    }
    if (roles.indexOf('manager') === -1) {
      toast('A team needs a manager — tick manager for yourself.', true);
      return;
    }
    var payload = {
      name: $('teamName').value.trim(),
      logo: $('teamLogo').value.trim(),
      seed: Number($('teamSeed').value) || 20260101,
      maxSteps: Number($('teamSteps').value) || 15,
      roster: [{ email: state.email, name: $('selfName').value.trim(), roles: roles }]
    };
    api('POST', '/api/teams', payload).then(function (out) {
      if (out.status !== 200 || out.body.ok === false) {
        toast(failText(out), true);
        return;
      }
      toast('Team “' + out.body.team.name + '” created.');
      $('teamName').value = '';
      $('teamLogo').value = '';
      refresh();
    });
  }

  /* ---------- boot ---------- */

  var pendingJoin = new URLSearchParams(location.search).get('join') || '';

  function boot() {
    renderSession();
    showApp(!!state.token);
    $('loginForm').addEventListener('submit', function (event) {
      event.preventDefault();
      var email = $('email').value.trim();
      if (!email) return;
      signIn(email);
    });
    $('signOut').addEventListener('click', signOut);
    $('createForm').addEventListener('submit', createTeam);
    $('refresh').addEventListener('click', function () { refresh(); });
    $('dialogClose').addEventListener('click', closeDialog);
    $('dialog').addEventListener('click', function (event) {
      if (event.target === $('dialog')) closeDialog();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeDialog();
    });
    if (state.token) {
      refresh().then(afterPendingJoin);
      setInterval(function () {
        if (state.token && document.visibilityState === 'visible') refresh();
      }, 20000);
    }
  }

  function afterPendingJoin() {
    if (!pendingJoin) return;
    var wanted = pendingJoin;
    pendingJoin = '';
    var game = null;
    state.active.forEach(function (g) { if (g.id === wanted) game = g; });
    if (!state.email) {
      toast('Sign in to join the invited team.', true);
      return;
    }
    if (!game) {
      toast('That campaign is no longer open.', true);
      return;
    }
    var already = state.teams.some(function (t) { return t.id === wanted; });
    if (already) {
      toast('You are already in ' + game.name + '.');
      return;
    }
    openJoin(game);
  }

  boot();
})();


