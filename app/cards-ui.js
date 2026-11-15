/* Space Mission Design — shared build cards, SVG graphs, engineer and scientist screens. */
(function (root) {
  'use strict';

  const APP = root.APP;
  const C = root.CONFIG;
  const E = root.ENGINE;
  const CARDS = root.CARDS;
  const esc = APP.esc;

  function shortName(card) {
    if (!card) return '—';
    return card.name
      .replace(/^Upper stage\s*/i, '')
      .replace(/^Reservation unit\s*/i, '')
      .replace(/^Flight control system\s*/i, '')
      .replace(/^Antenna\s*/i, '')
      .replace(/^Solar panels\s*/i, '')
      .replace(/^Power source\s*/i, '')
      .replace(/^Module\s*/i, '')
      .replace(/^Instrument\s*/i, '')
      .replace(/["«»]/g, '');
  }

  function cardPNote(card) {
    if (!APP.state || !card) return '';
    if (E.isExpCard(card)) {
      const risk = E.expRiskInfo(APP.state, card);
      return ' · risk −' + APP.fmt(risk.penaltyPct, 0) + '% (' + risk.runs + '/' + risk.max + ')';
    }
    if (card.standard) return ' · p fixed';
    return '';
  }

  function cardSub(card, count) {
    if (!card) return '—';
    const s = APP.state;
    if (card.kind === 'rocket') {
      const p = s ? E.cardPFor(s, card, { kind: 'rocket' }) : card.p;
      return card.payload + ' t · p ' + APP.fmt(p, 2) + ' · ' + card.cycles + ' cyc.' + cardPNote(card);
    }
    if (card.kind === 'reservation') return card.t === 'double' ? 'p′ = 1−(1−p)²' : (card.t === 'plus' ? 'p + 0.05' : 'no redundancy');
    if (card.kind === 'control') return card.slots + ' slots · ' + card.mass + ' kg · ' + card.watts + ' W';
    if (card.kind === 'antenna') return 'p ' + APP.fmt(card.p, 2) + ' · ' + card.bw + ' Mbit/s';
    if (card.kind === 'power') return card.watts + ' W · ' + (card.source === 'reactor' ? 'RTG' : 'solar');
    if (card.kind === 'buffer') return card.mass + ' kg · buffer';
    if (card.kind === 'instrument') {
      const p = s ? E.cardPFor(s, card, { kind: 'instrument' }) : card.p;
      return 'p ' + APP.fmt(p, 2) + ' · ' + card.value + ' S · ' + card.bw + ' Mbit/s' + (count > 1 ? ' ×' + count : '') + cardPNote(card);
    }
    if (card.kind === 'physical') {
      if (card.bonusS > 0 && card.bonusS < 1) return 'S ×' + APP.fmt(1 + card.bonusS, 2) + ' · ' + card.mass + ' kg';
      if (card.bonusS > 0) return 'S +' + card.bonusS + ' · ' + card.mass + ' kg';
      return card.mass + ' kg · module';
    }
    return card.kind;
  }

  function optionList(list, selected, emptyLabel) {
    return (emptyLabel ? '<option value="">' + esc(emptyLabel) + '</option>' : '') +
      (list || []).map(function (card) {
        return '<option value="' + card.id + '"' + (card.id === selected ? ' selected' : '') + '>' +
          esc(card.name) + (card.copies != null ? ' · ' + card.copies + ' pcs' : '') + '</option>';
      }).join('');
  }

  function fieldSelect(label, field, list, selected, role, missionId, emptyLabel) {
    return '<label class="field">' + esc(label) +
      '<select data-bind="' + field + '" data-bind-role="' + role + '" data-bind-mission="' + esc(missionId) + '">' +
        optionList(list, selected, emptyLabel) +
      '</select></label>';
  }

  APP.cardSub = cardSub;
  APP.shortName = shortName;
  APP.optionList = optionList;
  APP.fieldSelect = fieldSelect;

  /* ---------- mission switcher ---------- */
  APP.missionSwitcher = function () {
    const s = APP.state;
    if (!s || !(s.offers || []).length) return '';
    return '<label class="field" style="min-width:230px">Mission in progress' +
      '<select id="missionSwitch">' + s.offers.map(function (id) {
        const m = APP.mission(id);
        return '<option value="' + id + '"' + (id === APP.selectedMissionId ? ' selected' : '') + '>' +
          esc(m ? m.name : id) + '</option>';
      }).join('') + '</select></label>';
  };

  /* ---------- metrics and readiness ---------- */
  APP.buildMetrics = function (analysis) {
    const c = analysis.compute;
    const m = analysis.manual;
    if (!c || !m) return '<div class="empty">This build cannot be computed.</div>';
    return '<div class="metric-grid">' +
      '<div class="metric"><small>mass</small><b class="' + (c.massOk ? '' : 'bad') + '">' + APP.fmt(c.massKg / 1000, 2) + ' / ' + APP.fmt(c.capacityKg / 1000, 2) + ' t</b><span>to the point</span></div>' +
      '<div class="metric"><small>power</small><b class="' + (c.power.ok ? '' : 'bad') + '">' + APP.fmt(c.power.available, 0) + ' / ' + APP.fmt(c.power.required, 0) + ' W</b><span>available / needed</span></div>' +
      '<div class="metric"><small>FCS slots</small><b class="' + (c.slots.ok ? '' : 'bad') + '">' + c.slots.used + ' / ' + c.slots.total + '</b><span>instruments</span></div>' +
      '<div class="metric"><small>PM / step</small><b class="' + (m.pmRate <= m.pmFree ? '' : 'bad') + '">' + m.pmRate + ' / ' + m.pmFree + '</b><span>project / free</span></div>' +
      '<div class="metric"><small>price</small><b>' + APP.num(c.price) + ' $</b><span>limit ' + APP.num(Math.round(m.cap)) + ' $</span></div>' +
      '<div class="metric"><small>P of success</small><b class="' + (c.pSuccess >= 0.65 ? 'ok' : (c.pSuccess >= 0.5 ? 'mid' : 'bad')) + '">' + APP.pct(c.pSuccess) + '</b><span>launch × build × channel</span></div>' +
      '<div class="metric"><small>S / target</small><b class="' + (c.sDet >= c.target ? 'ok' : 'mid') + '">' + APP.fmt(c.sDet, 1) + ' / ' + c.target + '</b><span>expected</span></div>' +
      '<div class="metric"><small>data</small><b class="' + (c.data.ratio >= 0.5 ? '' : 'mid') + '">' + APP.pct(c.data.ratio) + '</b><span>channel ' + APP.pct(c.pChannel) + '</span></div>' +
    '</div>';
  };

  APP.readyStrip = function (missionId, analysis) {
    const b = analysis.build;
    const a = analysis;
    const blockers = a.blockers.length;
    return '<div class="ready-strip">' +
      '<div class="ready-card ' + (b.ready.engineer ? 'ready' : '') + '">' +
        '<div class="avatar">E</div><div><div class="who">Engineer</div>' +
        '<div class="what">launcher · reserve · modules · trajectory</div></div>' +
        '<div class="state ' + (b.ready.engineer ? 'ok' : 'mid') + '">' + (b.ready.engineer ? '✓ ready' : 'waiting') + '</div>' +
      '</div>' +
      '<div class="ready-card ' + (b.ready.scientist ? 'ready' : '') + '">' +
        '<div class="avatar">S</div><div><div class="who">Scientist</div>' +
        '<div class="what">FCS · instruments · power · antenna</div></div>' +
        '<div class="state ' + (b.ready.scientist ? 'ok' : 'mid') + '">' + (b.ready.scientist ? '✓ ready' : 'waiting') + '</div>' +
      '</div>' +
      '<div class="ready-card">' +
        '<div class="avatar">C</div><div><div class="who">Consultant</div>' +
        '<div class="what">' + (blockers ? blockers + ' blocker(s)' : (a.warnings.length ? a.warnings.length + ' risk(s)' : 'no remarks')) + '</div></div>' +
        '<div class="state ' + a.score + '">' + (a.score === 'ok' ? '✓ ok' : (a.score === 'mid' ? '!' : '✕')) + '</div>' +
      '</div>' +
      '<div class="ready-card">' +
        '<div class="avatar">M</div><div><div class="who">Manager</div>' +
        '<div class="what">acceptance · production · launch</div></div>' +
        '<div class="state ' + (b.ready.engineer && b.ready.scientist && !blockers ? 'ok' : 'mid') + '">' +
          (b.ready.engineer && b.ready.scientist && !blockers ? 'ready to accept' : 'not ready') + '</div>' +
      '</div>' +
    '</div>';
  };

  APP.checkSummary = function (analysis, max) {
    const list = [];
    analysis.blockers.forEach(function (b) { list.push({ cls: 'bad', mark: '✕', text: b.text }); });
    analysis.warnings.forEach(function (w) { list.push({ cls: 'mid', mark: '!', text: w.text }); });
    if (!list.length) list.push({ cls: 'ok', mark: '✓', text: 'All hard checks pass.' });
    const use = list.slice(0, max || 6);
    return '<div class="checks">' + use.map(function (x) {
      return '<div class="check"><span class="ico ' + x.cls + '">' + x.mark + '</span>' +
        '<span class="name ' + x.cls + '">' + esc(x.text) + '</span><span></span></div>';
    }).join('') + '</div>' + (list.length > use.length ?
      '<div class="small muted" style="margin-top:5px">and ' + (list.length - use.length) + ' more in the consultant</div>' : '');
  };

  /* ---------- SVG graph ---------- */
  function statusDot(ok) { return ok ? '#5dd39e' : '#e8695b'; }
  function clipText(text, max) {
    const s = String(text == null ? '' : text);
    return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
  }

  function node(x, y, w, h, card, label, sub, opts) {
    opts = opts || {};
    const cls = opts.cls || '';
    const name = card ? shortName(card) : (opts.name || '—');
    const art = card ? APP.cardArt(card) : '';
    const nameMax = Math.max(6, Math.floor((w - 20) / 6));
    const subMax = Math.max(8, Math.floor((w - 20) / 5.7));
    return '<g class="graph-node ' + cls + '" data-graph-card="' + esc(card ? card.id : '') + '">' +
      '<rect class="box" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8"/>' +
      '<text class="cap" x="' + (x + 8) + '" y="' + (y + 13) + '">' + esc(clipText(label, Math.floor((w - 16) / 4.8))) + '</text>' +
      '<text x="' + (x + 8) + '" y="' + (y + 28) + '" style="font-size:11px">' + esc(clipText(name, nameMax)) + '</text>' +
      '<text class="sub" x="' + (x + 8) + '" y="' + (y + 42) + '">' + esc(clipText(sub || '', subMax)) + '</text>' +
      (art ? '<image href="' + esc(art) + '" x="' + (x + w - 38) + '" y="' + (y + h - 34) + '" width="32" height="28" preserveAspectRatio="xMidYMid meet" opacity=".9"/>' : '') +
      '<circle cx="' + (x + w - 9) + '" cy="' + (y + 9) + '" r="3" fill="' + statusDot(opts.ok !== false) + '"/>' +
    '</g>';
  }

  function edge(x1, y1, x2, y2, active, bad) {
    return '<path class="graph-edge ' + (bad ? 'bad' : (active ? 'active' : '')) + '" d="M' + x1 + ' ' + y1 +
      ' C' + (x1 + 30) + ' ' + y1 + ' ' + (x2 - 30) + ' ' + y2 + ' ' + x2 + ' ' + y2 + '"/>';
  }

  APP.graph = function (analysis, role) {
    const c = analysis.compute;
    if (!c) return '<div class="empty">No computed build for the graph.</div>';
    const b = c.build;
    const ins = b.instruments;
    const insText = ins.length ? ins.map(function (o) { return shortName(o.card) + '×' + o.count; }).join(' + ') : 'no instruments';
    const physText = b.physical.length ? b.physical.map(function (p) { return shortName(p); }).join(' + ') : 'no modules';
    const traj = C.trajectories[c.trajectoryId] || C.trajectories.direct;
    if (role === 'engineer') {
      return '<div class="graph-wrap"><svg viewBox="0 0 780 270" role="img" aria-label="Engineering build graph">' +
        edge(155, 63, 190, 63, true) + edge(325, 63, 360, 63, true) +
        edge(427, 96, 427, 150, c.slots.ok) + edge(87, 96, 87, 150, c.power.ok) +
        edge(155, 183, 365, 183, c.power.ok) + edge(500, 110, 520, 160, c.pChannel >= 0.6) +
        edge(535, 183, 520, 183, !(c.missingMission || []).length) +
        node(20, 30, 135, 66, b.rocket, 'LAUNCHER', cardSub(b.rocket), { ok: c.massOk, cls: c.massOk ? '' : 'bad' }) +
        node(190, 30, 135, 66, b.res, 'RESERVE', cardSub(b.res), { ok: true }) +
        node(360, 30, 135, 66, b.control, 'FCS', cardSub(b.control), { ok: c.slots.ok, cls: c.slots.ok ? '' : 'bad' }) +
        node(530, 30, 150, 66, b.antenna, 'ANTENNA', cardSub(b.antenna), { ok: c.pChannel >= 0.6 }) +
        node(20, 150, 135, 66, b.power, 'POWER', cardSub(b.power), { ok: c.power.ok, cls: c.power.ok ? '' : 'bad' }) +
        node(190, 150, 160, 66, b.buffer ? b.buffer : null, 'BUFFER', b.buffer ? cardSub(b.buffer) : 'not installed', { ok: true, name: b.buffer ? shortName(b.buffer) : 'no buffer' }) +
        node(365, 150, 155, 66, null, 'INSTRUMENTS', c.slots.used + ' / ' + c.slots.total + ' · ' + insText, { ok: c.slots.ok, name: ins.length ? insText : 'no instruments' }) +
        node(535, 150, 145, 66, null, 'MODULES', physText, { ok: !(c.missingMission || []).length, name: b.physical.length ? physText : 'no modules', cls: (c.missingMission || []).length ? 'bad' : '' }) +
        '<text class="graph-label" x="535" y="235">Trajectory: ' + esc(traj.name) + ' · ' + APP.fmt(c.massKg / 1000, 2) + ' / ' + APP.fmt(c.capacityKg / 1000, 2) + ' t</text>' +
      '</svg></div>';
    }
    const items = ins.slice(0, 4);
    const positions = [[245, 24], [245, 107], [245, 190], [445, 107]];
    let nodes = node(25, 105, 155, 70, b.control, 'FCS', cardSub(b.control), { ok: c.slots.ok, cls: c.slots.ok ? '' : 'bad' });
    nodes += node(25, 205, 155, 58, b.power, 'POWER', cardSub(b.power), { ok: c.power.ok, cls: c.power.ok ? '' : 'bad' });
    nodes += node(25, 25, 155, 58, b.antenna, 'ANTENNA', cardSub(b.antenna), { ok: c.pChannel >= 0.6 });
    nodes += node(25, 275, 155, 55, b.buffer ? b.buffer : null, 'BUFFER', b.buffer ? cardSub(b.buffer) : 'none', { ok: true, name: b.buffer ? shortName(b.buffer) : 'no buffer' });
    items.forEach(function (o, i) {
      const p = positions[i] || [445, 190];
      nodes += node(p[0], p[1], 160, 64, o.card, 'INSTRUMENT ' + (i + 1), cardSub(o.card, o.count), { ok: c.slots.ok });
      nodes += edge(180, 140, p[0], p[1] + 32, true);
    });
    if (ins.length > 4) nodes += '<text class="graph-label" x="445" y="278">+' + (ins.length - 4) + ' more instruments</text>';
    if (!ins.length) {
      nodes += node(245, 107, 160, 64, null, 'INSTRUMENTS', 'none installed', { ok: false, name: 'no instruments', cls: 'bad' });
    }
    nodes += edge(180, 55, 245, 40, true);
    return '<div class="graph-wrap"><svg viewBox="0 0 680 350" role="img" aria-label="Scientific build graph">' +
      nodes +
      '<text class="graph-label" x="25" y="345">P_build ' + APP.pct(c.pCollect) + ' · data ' + APP.pct(c.data.ratio) + ' · S ' + APP.fmt(c.sDet, 1) + ' / ' + c.target + '</text>' +
    '</svg></div>';
  };

  /* ---------- shared role blocks ---------- */
  APP.roleBanner = function (role, title, sub, actions) {
    return '<div class="role-banner"><div><h2>' + esc(title) + '</h2><div class="sub">' + sub + '</div></div>' +
      '<div class="actions">' + (actions || '') + '</div></div>';
  };

  /* ---------- experimental flight approvals ---------- */
  APP.expApprovalsPanel = function (role) {
    const s = APP.state;
    if (!s || APP.finished) return '';
    const list = APP.listExpApprovals('test').concat(APP.listExpApprovals('launch'));
    if (!list.length) return '';
    const canSign = APP.expApprovalRoles.indexOf(role) !== -1;
    const pending = list.filter(function (req) { return !APP.expApprovalReady(req); }).length;
    const rows = list.map(function (req) {
      const signed = APP.expApprovalSigned(req);
      const total = APP.expApprovalRoles.length;
      const ready = APP.expApprovalReady(req);
      const chips = APP.expApprovalRoles.map(function (r) {
        const name = APP.expApprovalLabels[r] || APP.roleName(r);
        return '<span class="badge ' + (req.signatures[r] ? 'ok' : '') + '">' +
          (req.signatures[r] ? '✓ ' : '○ ') + esc(name) + '</span>';
      }).join('');
      const cards = APP.expApprovalCards(req);
      const risk = cards.map(function (card) {
        const info = E.expRiskInfo(s, card);
        return esc(card.name) + (info.experimental ? ' · risk ' + APP.fmt(info.penaltyPct, 0) + '%' : '');
      }).join(' · ');
      const canSignThis = canSign && !req.signatures[role] &&
        (req.scope === 'launch' || req.step === s.step);
      const action = canSignThis
        ? '<button class="btn small primary" data-act="approve-exp" data-scope="' + esc(req.scope) +
          '" data-key="' + esc(req.key) + '">Sign: ' +
          esc(APP.expApprovalLabels[role] || role) + '</button>'
        : '';
      return '<div class="mission-row">' +
        '<div class="top"><div><span class="name">' + esc(req.title) + '</span> ' +
          '<span class="badge ' + (req.scope === 'launch' ? 'cy' : 'mid') + '">' +
          (req.scope === 'launch' ? 'launch' : 'test') + '</span></div>' +
          '<span class="badge ' + (ready ? 'ok' : 'mid') + '">' +
          signed + ' / ' + total + (ready ? ' · approval' : '') + '</span></div>' +
        '<div class="facts"><span>' + esc(req.detail || '') + '</span></div>' +
        (risk ? '<div class="facts"><span>Shared resources: ' + risk + '</span></div>' : '') +
        '<div class="row" style="margin-top:5px">' + chips + action + '</div></div>';
    }).join('');
    return '<section class="panel exp-approvals">' +
      '<div class="panel-head"><h2>Experiment approval</h2>' +
        '<span class="badge ' + (pending ? 'mid' : 'ok') + '">' +
        (pending ? 'awaiting signatures: ' + pending : 'approvals granted') + '</span></div>' +
      '<div class="small muted" style="margin-bottom:7px">Experimental launches and tests draw on shared resources. ' +
        'A request appears when the action is attempted; it needs the signatures of the engineer, the scientist and the manager. ' +
        'A test approval is valid only within the current step.</div>' +
      (canSign ? '' : '<div class="hint" style="margin-bottom:7px">The engineer, the scientist and the manager sign. ' +
        'Switch role to approve the request.</div>') +
      rows + '</section>';
  };

  APP.techTable = function (kind) {
    const s = APP.state;
    const names = C.tech.names || {};
    const rows = Object.keys(s.tech[kind] || {}).map(function (cls) {
      const lvl = E.techLevel(s, kind, cls);
      const ip = E.ipFor(s, kind, cls);
      const target = lvl + 1;
      let next = 'CML 4 reached';
      let btn = '';
      if (target <= C.tech.maxLevel) {
        const need = C.tech.ipThresholds[target] || 0;
        const cost = E.techUpgradeCost(target);
        next = 'IP ' + ip + '/' + need + ' · ' + cost.money + ' $ · ' + cost.np + ' NP · ' + cost.pm + ' PM';
        const disabled = ip < need || s.money < cost.money || s.np < cost.np || E.pmAvailable(s) < cost.pm || APP.actionsLeft <= 0 || APP.finished;
        btn = '<button class="btn small" data-act="tech-' + kind + '" data-cls="' + cls + '"' +
          (disabled ? ' disabled' : '') + '>R&D</button>';
      }
      return '<tr><td>' + esc(names[cls] || cls) + '<div class="small muted">' + (kind === 'rocket' ? 'launcher' : 'instrument') +
        '</div></td><td class="num">' + lvl + '</td><td class="num">' + ip + '</td>' +
        '<td class="small">' + esc(next) + '</td><td class="num">' + btn + '</td></tr>';
    }).join('');
    return '<table class="tiny-table"><thead><tr><th>class</th><th class="num">CML</th><th class="num">IP</th><th>next</th><th></th></tr></thead><tbody>' +
      rows + '</tbody></table>';
  };

  APP.standardizeBox = function (role) {
    const s = APP.state;
    const school = E.schoolFor(s);
    const price = Math.round(C.tech.standardizeCost.money * (1 - school.standardizeDiscount));
    const ids = Object.keys(s.expSeen || {}).filter(function (id) {
      const card = E.card(id);
      return card && E.isCardAvailable(s, card) && !(s.standardized && s.standardized[id]);
    });
    if (!ids.length) return '<div class="small muted">No experimental card has been seen yet.</div>';
    const html = ids.map(function (id) {
      const card = E.card(id);
      if (!card) return '';
      const needed = card.kind === 'rocket' ? 'engineer' : 'scientist';
      if (needed !== role) return '';
      const pNow = E.cardPFor(s, card, { kind: card.kind });
      return '<div class="row between" style="margin:4px 0"><span class="small">' + esc(card.name) +
        '<span class="muted"> · p ' + APP.fmt(pNow, 2) + ' (base ' + APP.fmt(card.p, 2) + ')</span></span>' +
        '<button class="btn small" data-act="standardize" data-card="' + id + '"' +
        (APP.actionsLeft <= 0 || s.money < price || APP.finished ? ' disabled' : '') +
        '>Standardise (' + price + ' $)</button></div>';
    }).join('');
    return html || '<div class="small muted">No experimental cards for this role.</div>';
  };

  /* ---------- engineer screen ---------- */
  function finishedRole(role, title) {
    return APP.roleBanner(role, title,
      'The campaign is over. The build can no longer be changed and parts can no longer be signed; the engine computes the total.',
      '<button class="btn primary" data-act="new-campaign">New campaign</button>' +
      '<button class="btn ghost" data-act="export">Export</button>') +
      '<section class="panel"><div class="panel-head"><h2>Final score</h2></div>' +
      APP.renderFinalSummary(false) + '</section>';
  }

  APP.screens.engineer = function () {
    if (APP.finished) return finishedRole('engineer', 'Engineer · campaign finished');
    const missionId = APP.ensureSelection();
    if (!missionId) return '<div class="empty">The showcase is empty. The manager has to close the campaign step.</div>';
    const mission = APP.mission(missionId);
    const a = APP.buildAnalysis(missionId);
    const b = a.build;
    const sel = b.sel;
    const s = APP.state;
    const trOpts = { tech: s.tech, pmPerStep: E.pmLimit(s), pmOverhead: C.campaign.pmOverhead, schoolLevel: s.school || 0 };
    const trajs = E.trajectoriesFor(sel, mission, trOpts);
    const tSel = trajs.find(function (t) { return t.id === b.trajId; }) || trajs[0] || { id: mission.trajectories[0], name: '—', available: false };
    const required = (mission.requires || []);
    const banner = APP.roleBanner('engineer', 'Engineer · launcher and trajectory',
      'Pick the launcher, the redundancy, the physical modules and the trajectory. Then confirm the engineering part — the manager cannot accept the mission without both signatures.',
      '<button class="btn ghost" data-act="recommend" data-mission="' + missionId + '">Recommend</button>' +
      '<button class="btn primary" data-act="confirm-engineer" data-mission="' + missionId + '">Confirm the engineering part</button>' +
      '<button class="btn ghost" data-act="set-role" data-role="manager">To the manager →</button>');
    const trajRows = trajs.map(function (t) {
      const cls = t.available ? 'ok' : 'bad';
      const bits = [];
      if (!t.massOk) bits.push('mass');
      if (!t.cyclesOk) bits.push('cycles');
      if (!t.pmOk) bits.push('PM');
      if (t.missing.length) bits.push('needs: ' + t.missing.join(', '));
      return '<tr><td><b>' + esc(t.name) + '</b><div class="small muted">k=' + APP.fmt(t.k, 2) +
        ' · deadline ' + t.deadline + ' · ' + APP.fmt(t.capacityKg / 1000, 2) + ' t</div></td>' +
        '<td class="num ' + cls + '">' + (t.available ? '✓' : '✕') + '</td>' +
        '<td class="small">' + esc(bits.join(' · ') || 'available') + '</td></tr>';
    }).join('');
    return banner + APP.expApprovalsPanel('engineer') +
      '<div class="panel"><div class="row between"><div class="row">' + APP.missionSwitcher() +
        '<span class="badge cy">' + esc(mission.name) + '</span><span class="badge">' + esc(C.points[mission.point].name) + '</span></div>' +
        '<span class="badge ' + (b.ready.engineer ? 'ok' : 'mid') + '">' + (b.ready.engineer ? 'engineer has signed' : 'awaiting signature') + '</span></div></div>' +
      '<div class="panel"><div class="panel-head"><h2>Build graph</h2><span class="hint">state of parts and limits</span></div>' +
        APP.graph(a, 'engineer') +
        (a.blockers.length ? '<div class="small bad">' + a.blockers.slice(0, 2).map(function (x) { return esc(x.text); }).join(' · ') + '</div>' : '') +
      '</div>' +
      '<div class="section-grid">' +
        '<section class="panel"><div class="panel-head"><h2>1. Launcher</h2></div>' +
          '<div class="stack">' +
            APP.fieldSelect('Upper stage', 'rocketId', E.rocketPool(s), sel.rocketId, 'engineer', missionId) +
            (E.card(sel.rocketId) ? '<div class="small muted">' + esc(cardSub(E.card(sel.rocketId))) + '</div>' : '') +
            APP.fieldSelect('Redundancy', 'reservationId', CARDS.reservations, sel.reservationId, 'engineer', missionId) +
            '<label class="toggle"><input type="checkbox" data-bind="moduleBuild" data-bind-role="engineer" data-bind-mission="' + missionId + '"' + (sel.moduleBuild ? ' checked' : '') + '>modular build (−assembly risk)</label>' +
            '<div class="small muted">The launcher sets the payload capacity, the power bus, the channel and the number of cycles. Redundancy raises the launch p at the cost of mass and price.</div>' +
          '</div></section>' +
        '<section class="panel"><div class="panel-head"><h2>2. Trajectory</h2></div>' +
          APP.fieldSelect('Mission trajectory', 'trajId', trajs.map(function (t) { return { id: t.id, name: t.name + (t.available ? '' : ' · unavailable') }; }), b.trajId, 'engineer', missionId) +
          '<table class="tiny-table" style="margin-top:6px"><thead><tr><th>option</th><th class="num">ok</th><th>limits</th></tr></thead><tbody>' + trajRows + '</tbody></table>' +
          '<div class="small muted" style="margin-top:6px">Current: <b class="' + (tSel.available ? 'ok' : 'bad') + '">' + esc(tSel.name) + '</b>' +
            (tSel.available ? '' : ' — ' + (tSel.missing || []).join(', ')) + '</div>' +
        '</section>' +
        '<section class="panel span2"><div class="panel-head"><h2>3. Physical modules</h2><span class="hint">the mission requirements mark the mandatory ones</span></div>' +
          '<div class="metric-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">' +
          CARDS.physical.map(function (card) {
            const on = (sel.physical || []).indexOf(card.id) !== -1;
            const need = required.indexOf(card.key) !== -1;
            return '<label class="ready-card ' + (on ? 'ready' : '') + '" style="cursor:pointer;align-items:flex-start">' +
              '<input type="checkbox" data-physical="' + card.id + '" data-mission="' + missionId + '"' + (on ? ' checked' : '') + ' style="margin-top:3px">' +
              '<span><span class="who">' + esc(card.name) + (need ? ' <span class="badge bad">required</span>' : '') + '</span>' +
              '<span class="what">' + cardSub(card) + ' · ' + card.price + ' $</span></span></label>';
          }).join('') + '</div>' +
          (required.length ? '<div class="small muted" style="margin-top:6px">The mission requires: ' + required.map(function (k) {
            const card = CARDS.physical.find(function (x) { return x.key === k; });
            return card ? card.name : k;
          }).join(', ') + '</div>' : '<div class="small muted" style="margin-top:6px">The mission requires no physical modules.</div>') +
        '</section>' +
        '<section class="panel span2"><div class="panel-head"><h2>4. Numbers and signature</h2></div>' +
          APP.buildMetrics(a) + '<div style="height:8px"></div>' + APP.readyStrip(missionId, a) +
          '<div class="row" style="margin-top:10px"><button class="btn primary" data-act="confirm-engineer" data-mission="' + missionId + '">Confirm the engineering part</button>' +
          '<button class="btn ghost" data-act="recommend" data-mission="' + missionId + '">Use the recommended build</button>' +
          '<span class="small ' + (b.ready.engineer ? 'ok' : 'mid') + '">' + (b.ready.engineer ? 'the engineer has signed' : 'the engineer has not signed') + '</span></div>' +
          APP.checkSummary(a, 5) +
        '</section>' +
        '<section class="panel"><div class="panel-head"><h2>Factory and preparation</h2><span class="hint">actions: ' + APP.actionsLeft + '</span></div>' +
          '<div class="small muted">Factory: ' + s.factory + ' · +' + E.factoryPm(s) + ' PM/step · ' + esc((C.facilities.factory.stages[s.factory] || {}).name || '') + '</div>' +
          '<div class="row" style="margin-top:7px"><button class="btn small" data-act="prep-factory"' + (APP.actionsLeft <= 0 || s.factory >= 4 || APP.finished ? ' disabled' : '') + '>Upgrade the factory</button>' +
          '<button class="btn small" data-act="test-rocket" data-rocket="' + (sel.rocketId || (E.rocketPool(s)[0] || {}).id) + '"' + (APP.actionsLeft <= 0 || s.testUsed || APP.finished ? ' disabled' : '') + '>Launcher flight test</button></div>' +
          '<div class="small muted" style="margin-top:6px">Factory cost: ' + (C.campaign.factoryUpgrades[s.factory] ? C.campaign.factoryUpgrades[s.factory].money + ' $ · ' + C.campaign.factoryUpgrades[s.factory].pm + ' PM · rating ' + C.campaign.factoryUpgrades[s.factory].rating : 'maximum') + '</div>' +
        '</section>' +
        '<section class="panel"><div class="panel-head"><h2>Launcher CML</h2></div>' + APP.techTable('rocket') +
          '<div class="divider"></div><h3>Standardisation</h3>' + APP.standardizeBox('engineer') +
        '</section>' +
      '</div>';
  };

  /* ---------- scientist screen ---------- */
  APP.screens.scientist = function () {
    if (APP.finished) return finishedRole('scientist', 'Scientist · campaign finished');
    const missionId = APP.ensureSelection();
    if (!missionId) return '<div class="empty">The showcase is empty. The manager has to close the campaign step.</div>';
    const mission = APP.mission(missionId);
    const a = APP.buildAnalysis(missionId);
    const b = a.build;
    const sel = b.sel;
    const s = APP.state;
    const c = a.compute;
    const dataName = (C.dataTypes[mission.dataType] || {}).name || mission.dataType;
    const banner = APP.roleBanner('scientist', 'Scientist · instruments and channel',
      'Build the scientific part: FCS, instruments, power, antenna and buffer. Watch the slots, the data type and the channel — then confirm the scientific part.',
      '<button class="btn ghost" data-act="recommend" data-mission="' + missionId + '">Recommend</button>' +
      '<button class="btn primary" data-act="confirm-scientist" data-mission="' + missionId + '">Confirm the scientific part</button>' +
      '<button class="btn ghost" data-act="set-role" data-role="manager">To the manager →</button>');
    const insRows = E.instrumentPool(s).map(function (card) {
      const row = (sel.instruments || []).find(function (o) { return o.id === card.id; });
      const count = row ? row.count : 0;
      const match = card.dataType === mission.dataType;
      const tech = E.techMods('instrument', E.techLevel(s, 'instrument', E.techClassOf(card)));
      return '<div class="row between" style="padding:5px 0;border-bottom:1px dotted rgba(32,61,94,.55)">' +
        '<div><div class="small"><b>' + esc(card.name) + '</b>' + (match ? ' <span class="badge ok">data</span>' : '') + '</div>' +
          '<div class="hint">' + cardSub(card) + ' · CML class ' + tech.level + ' · ' + card.price + ' $</div></div>' +
        '<div class="row" style="gap:4px"><button class="btn small" data-instrument="' + card.id + '" data-delta="-1"' + (count <= 0 ? ' disabled' : '') + '>−</button>' +
          '<b style="min-width:18px;text-align:center">' + count + '</b>' +
          '<button class="btn small" data-instrument="' + card.id + '" data-delta="1">+</button></div></div>';
    }).join('');
    return banner + APP.expApprovalsPanel('scientist') +
      '<div class="panel"><div class="row between"><div class="row">' + APP.missionSwitcher() +
        '<span class="badge cy">' + esc(mission.name) + '</span><span class="badge">data: ' + esc(dataName) + '</span>' +
        '<span class="badge ' + (c && c.data.typeMatch ? 'ok' : 'bad') + '">' + (c && c.data.typeMatch ? 'type covered' : 'type not covered') + '</span></div>' +
        '<span class="badge ' + (b.ready.scientist ? 'ok' : 'mid') + '">' + (b.ready.scientist ? 'scientist has signed' : 'awaiting signature') + '</span></div></div>' +
      '<div class="panel"><div class="panel-head"><h2>Scientific graph</h2><span class="hint">FCS → instruments; power and antenna are constraints</span></div>' +
        APP.graph(a, 'scientist') +
        (a.blockers.length ? '<div class="small bad">' + a.blockers.slice(0, 2).map(function (x) { return esc(x.text); }).join(' · ') + '</div>' : '') +
      '</div>' +
      '<div class="section-grid">' +
        '<section class="panel"><div class="panel-head"><h2>1. FCS and antenna</h2></div><div class="stack">' +
          APP.fieldSelect('Flight control system', 'controlId', CARDS.control, sel.controlId, 'scientist', missionId) +
          APP.fieldSelect('Antenna', 'antennaId', CARDS.antennas, sel.antennaId, 'scientist', missionId) +
          '<label class="toggle"><input type="checkbox" data-bind="antennaDup" data-bind-role="scientist" data-bind-mission="' + missionId + '"' + (sel.antennaDup ? ' checked' : '') + '>antenna duplication</label>' +
          '<div class="small muted">The FCS provides the slots; the antenna gives the channel p and the bandwidth. Duplicating the antenna raises the channel p at the cost of mass and price.</div>' +
        '</div></section>' +
        '<section class="panel"><div class="panel-head"><h2>2. Power and buffer</h2></div><div class="stack">' +
          APP.fieldSelect('Power source', 'powerId', CARDS.power, sel.powerId, 'scientist', missionId) +
          APP.fieldSelect('Buffer', 'bufferId', CARDS.buffers, sel.bufferId, 'scientist', missionId, '— no buffer —') +
          '<label class="toggle"><input type="checkbox" data-bind="moduleBuild" data-bind-role="scientist" data-bind-mission="' + missionId + '"' + (sel.moduleBuild ? ' checked' : '') + '>modular build (assembly risk)</label>' +
          '<div class="small muted">The buffer raises the share of data that gets through; distant targets need an RTG, where solar panels are weak.</div>' +
        '</div></section>' +
        '<section class="panel span2"><div class="panel-head"><h2>3. Instruments</h2>' +
          '<span class="hint">slots: ' + (c ? c.slots.used + ' / ' + c.slots.total : '—') + '</span></div>' +
          insRows +
          '<div class="small muted" style="margin-top:7px">Mission data type: <b>' + esc(dataName) +
            '</b>. An instrument of another type gives S ×0.5; without instruments there is no scientific return.</div>' +
        '</section>' +
        '<section class="panel span2"><div class="panel-head"><h2>4. Numbers and the scientist signature</h2></div>' +
          APP.buildMetrics(a) + '<div style="height:8px"></div>' + APP.readyStrip(missionId, a) +
          '<div class="row" style="margin-top:10px"><button class="btn primary" data-act="confirm-scientist" data-mission="' + missionId + '">Confirm the scientific part</button>' +
          '<button class="btn ghost" data-act="recommend" data-mission="' + missionId + '">Use the recommended build</button>' +
          '<span class="small ' + (b.ready.scientist ? 'ok' : 'mid') + '">' + (b.ready.scientist ? 'the scientist has signed' : 'the scientist has not signed') + '</span></div>' +
          APP.checkSummary(a, 5) +
        '</section>' +
        '<section class="panel"><div class="panel-head"><h2>School and test facilities</h2><span class="hint">actions: ' + APP.actionsLeft + '</span></div>' +
          '<div class="small muted">School: ' + s.school + ' · ' + esc((C.facilities.school.stages[s.school] || {}).name || '') +
            ' · +' + APP.fmt(E.schoolFor(s).reliability * 100, 0) + '% p · PM ×' + APP.fmt(E.schoolFor(s).pmFactor, 2) + '</div>' +
          '<div class="row" style="margin-top:7px"><button class="btn small" data-act="prep-school"' + (APP.actionsLeft <= 0 || s.school >= 4 || APP.finished ? ' disabled' : '') + '>Upgrade the school</button>' +
          '<button class="btn small" data-act="test-stand"' + (APP.actionsLeft <= 0 || s.testUsed || APP.finished ? ' disabled' : '') + '>Test stand</button></div>' +
          '<label class="field" style="margin-top:7px">stand class<select id="testStandClass">' +
            Object.keys(s.tech.instrument).map(function (cls) {
              return '<option value="' + cls + '">' + esc(C.tech.names[cls] || cls) + '</option>';
            }).join('') + '</select></label>' +
          '<label class="field" style="margin-top:6px">experimental card for the stand<select id="testStandCard">' +
            '<option value="">— no card —</option>' +
            E.instrumentPool(s).filter(function (card) { return E.isExpCard(card); }).map(function (card) {
              return '<option value="' + card.id + '">' + esc(card.name) + '</option>';
            }).join('') + '</select></label>' +
          '<div class="row" style="margin-top:7px"><select id="testInstrumentId">' + APP.optionList(E.instrumentPool(s), (sel.instruments[0] || {}).id || '') + '</select>' +
          '<button class="btn small" data-act="test-instrument" data-rocket="' + (sel.rocketId || (E.rocketPool(s)[0] || {}).id) + '"' + (APP.actionsLeft <= 0 || s.testUsed || APP.finished ? ' disabled' : '') + '>Instrument flight test</button></div>' +
          '<div class="small muted" style="margin-top:6px">School cost: ' + (E.schoolUpgradeCost(s.school + 1) ? E.schoolUpgradeCost(s.school + 1).money + ' $ · ' + E.schoolUpgradeCost(s.school + 1).pm + ' PM · ' + E.schoolUpgradeCost(s.school + 1).np + ' NP' : 'maximum') + '</div>' +
        '</section>' +
        '<section class="panel"><div class="panel-head"><h2>Instrument CML</h2></div>' + APP.techTable('instrument') +
          '<div class="divider"></div><h3>Standardisation</h3>' + APP.standardizeBox('scientist') +
        '</section>' +
      '</div>';
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
