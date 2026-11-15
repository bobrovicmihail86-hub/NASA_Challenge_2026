/* Space Mission Design — manager and MCC screens. */
(function (root) {
  'use strict';

  const APP = root.APP;
  const C = root.CONFIG;
  const E = root.ENGINE;
  const CARDS = root.CARDS;
  const esc = APP.esc;

  function launchesThisStep() {
    return (APP.state.flights || []).filter(function (f) { return f.launchStep === APP.state.step; }).length;
  }

  function capLeft() {
    return Math.max(0, E.mcsFor(APP.state).capacity - launchesThisStep());
  }

  APP.missionCard = function (missionId) {
    const mission = APP.mission(missionId);
    if (!mission) return '';
    const a = APP.buildAnalysis(missionId);
    const c = a.compute;
    const b = a.build;
    const selected = missionId === APP.selectedMissionId;
    const status = a.blockers.length ? 'bad' : (b.ready.engineer && b.ready.scientist && c && c.pSuccess >= 0.5 ? 'ok' : 'mid');
    const statusText = a.blockers.length ? a.blockers.length + ' blocker(s)'
      : (b.ready.engineer && b.ready.scientist ? 'build ready' : 'build in progress');
    return '<article class="mission-card ' + (selected ? 'selected' : '') + '" data-select-mission="' + mission.id + '">' +
      '<div class="art" style="background-image:url(\'' + esc(APP.missionArt(mission)) + '\')"></div>' +
      '<div class="scrim"></div>' +
      '<div class="body">' +
        '<div class="top"><div><h3>' + esc(mission.name) + '</h3>' +
          '<div class="agency">' + esc(mission.agency) + ' · ' + mission.year + '</div></div>' +
          '<span class="dot ' + status + '"></span></div>' +
        '<div class="metrics">' +
          '<span class="m">P <b>' + (c ? APP.pct(c.pSuccess) : '—') + '</b></span>' +
          '<span class="m">S <b>' + (c ? APP.fmt(c.sDet, 1) : '—') + '</b>/' + mission.targetValue + '</span>' +
          '<span class="m">' + esc(C.points[mission.point].name) + '</span>' +
        '</div>' +
        '<div class="status ' + status + '"><span class="dot ' + status + '"></span>' + esc(statusText) + '</div>' +
      '</div></article>';
  };

  APP.missionHero = function (missionId, a) {
    const mission = APP.mission(missionId);
    if (!mission) return '<div class="empty">Pick a mission from the board.</div>';
    const c = a.compute;
    const m = a.manual;
    const b = a.build;
    const canAccept = b.ready.engineer && b.ready.scientist && a.blockers.length === 0 && !APP.finished && APP.state.production.length < C.campaign.productionSlots;
    return '<div class="mission-hero">' +
      '<div class="hero-card">' +
        '<div class="art" style="background-image:url(\'' + esc(APP.missionArt(mission)) + '\')"></div>' +
        '<div class="scrim"></div><div class="body">' +
          '<div class="row between"><div><h2>' + esc(mission.name) + '</h2>' +
            '<div class="agency">' + esc(mission.agency) + ' · ' + mission.year + ' · ' + esc(C.points[mission.point].name) + '</div></div>' +
            '<span class="badge ' + a.score + '">' + (a.blockers.length ? 'needs fixing' : (a.warnings.length ? 'risks present' : 'ready')) + '</span></div>' +
          '<div class="history">' + esc(mission.history) + '</div>' +
          '<div class="metrics">' +
            '<span class="badge">complexity ' + mission.complexity + '</span>' +
            '<span class="badge">deadline ' + mission.deadline + '</span>' +
            '<span class="badge">S target ' + mission.targetValue + '</span>' +
            '<span class="badge">data: ' + esc((C.dataTypes[mission.dataType] || {}).name || mission.dataType) + '</span>' +
            (mission.requires || []).map(function (k) { return '<span class="badge mid">' + esc(k) + '</span>'; }).join('') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="panel" style="margin-bottom:0"><div class="panel-head"><h2>Contract draft</h2></div>' +
        (c && m ? '<div class="kpis" style="grid-template-columns:repeat(2,1fr)">' +
          '<div class="kpi"><small>advance</small><b class="neutral">' + APP.num(m.advance) + ' $</b></div>' +
          '<div class="kpi"><small>build price</small><b class="neutral">' + APP.num(c.price) + ' $</b></div>' +
          '<div class="kpi"><small>P of success</small><b class="' + (c.pSuccess >= 0.6 ? 'neutral' : 'warn') + '">' + APP.pct(c.pSuccess) + '</b></div>' +
          '<div class="kpi"><small>S / target</small><b class="' + (c.sDet >= c.target ? 'neutral' : 'warn') + '">' + APP.fmt(c.sDet, 1) + ' / ' + c.target + '</b></div>' +
          '<div class="kpi"><small>production</small><b class="neutral">' + m.prodTime + ' step.</b></div>' +
          '<div class="kpi"><small>PM / step</small><b class="' + (m.pmRate <= m.pmFree ? 'neutral' : 'bad') + '">' + m.pmRate + ' / ' + m.pmFree + '</b></div>' +
        '</div>' : '<div class="small bad">The build is not computed.</div>') +
        '<div class="divider"></div>' +
        '<div class="ready-strip" style="grid-template-columns:1fr">' +
          '<div class="ready-card ' + (b.ready.engineer ? 'ready' : '') + '"><div class="avatar">E</div><div><div class="who">Engineer</div><div class="what">' +
            (b.ready.engineer ? 'signed' : 'signature needed') + '</div></div><button class="btn small" data-act="set-role" data-role="engineer">Open</button></div>' +
          '<div class="ready-card ' + (b.ready.scientist ? 'ready' : '') + '"><div class="avatar">S</div><div><div class="who">Scientist</div><div class="what">' +
            (b.ready.scientist ? 'signed' : 'signature needed') + '</div></div><button class="btn small" data-act="set-role" data-role="scientist">Open</button></div>' +
        '</div>' +
        '<div class="row" style="margin-top:10px">' +
          '<button class="btn primary" data-act="accept" data-mission="' + mission.id + '"' + (canAccept ? '' : ' disabled') + '>Accept into production</button>' +
          '<button class="btn ghost" data-act="recommend" data-mission="' + mission.id + '">Recommend the build</button>' +
        '</div>' +
        (canAccept ? '' : '<div class="small mid" style="margin-top:6px">' + acceptWhy(b, a) + '</div>') +
      '</div>' +
    '</div>';
  };

  function acceptWhy(b, a) {
    if (APP.finished) return 'The campaign is over.';
    if (APP.state.production.length >= C.campaign.productionSlots) return 'Every production slot is taken.';
    if (!b.ready.engineer) return 'Waiting for the engineer signature.';
    if (!b.ready.scientist) return 'Waiting for the scientist signature.';
    if (a.blockers.length) return a.blockers[0].text;
    return '';
  }

  APP.productionList = function (compact, readyOnly) {
    const s = APP.state;
    const rows = [];
    if (!readyOnly) (s.production || []).forEach(function (p) {
      APP.recomputeEntry(p);
      const mission = APP.mission(p.missionId);
      const total = Math.max(1, p.readyStep - p.startedStep);
      const done = Math.max(0, Math.min(total, s.step - p.startedStep));
      const pct = Math.round(done / total * 100);
      const left = Math.max(0, p.readyStep - s.step);
      rows.push('<div class="mission-row"><div class="top"><div><span class="name">' + esc(mission ? mission.name : p.missionId) + '</span></div>' +
        '<span class="badge mid">in production</span></div>' +
        '<div class="progress-row" style="margin-top:4px"><span>readiness</span><div class="progress prod"><i style="width:' + pct + '%"></i></div><b>' + pct + '%</b></div>' +
        '<div class="facts"><span>in <b>' + left + '</b> step.</span><span>deadline in <b>' + Math.max(0, p.deadlineStep - s.step) + '</b></span>' +
          '<span><b>' + p.pmRate + '</b> PM/step</span><span>price <b>' + APP.num(p.price) + '</b> $</span>' +
          '<span>advance <b>' + APP.num(p.advance) + '</b> $</span></div></div>');
    });
    (s.ready || []).forEach(function (p) {
      APP.recomputeEntry(p);
      const mission = APP.mission(p.missionId);
      const c = p.compute;
      const canLaunch = capLeft() > 0 && !APP.finished;
      rows.push('<div class="mission-row" style="border-color:rgba(93,211,158,.35)"><div class="top"><div><span class="name">' + esc(mission ? mission.name : p.missionId) + '</span></div>' +
        '<span class="badge ok">ready to launch</span></div>' +
        '<div class="facts"><span>P <b>' + (c ? APP.pct(c.pSuccess) : '—') + '</b></span><span>S <b>' + (c ? APP.fmt(c.sDet, 1) : '—') + '</b> / ' + (c ? c.target : '—') + '</span>' +
          '<span>deadline in <b>' + Math.max(0, p.deadlineStep - s.step) + '</b></span><span>flight <b>' + E.flightSteps(mission) + '</b> step.</span></div>' +
        '<div class="row" style="margin-top:5px"><button class="btn small primary" data-act="launch" data-mission="' + p.missionId + '"' +
          (canLaunch ? '' : ' disabled') + '>Launch</button>' +
          (compact ? '' : '<span class="hint">free channels: ' + capLeft() + '</span>') + '</div></div>');
    });
    return rows.join('') || (readyOnly ? '<div class="empty">No mission is ready to launch.</div>'
      : '<div class="empty">No mission is in production. Accept one from the board.</div>');
  };

  APP.prepPanel = function () {
    const s = APP.state;
    const mcsCost = C.mcs.upgradeCost[(s.mcsLevel || 0) + 1] || null;
    const disabled = APP.actionsLeft <= 0 || APP.finished;
    return '<section class="panel"><div class="panel-head"><h2>Preparation · actions ' + APP.actionsLeft + '</h2>' +
      '<span class="badge ' + (APP.actionsLeft > 0 && !APP.finished ? 'ok' : 'bad') + '">' + (APP.actionsLeft > 0 ? 'actions left' : 'exhausted') + '</span></div>' +
      '<div class="action-grid">' +
        '<button class="btn" data-act="prep-hire"' + (disabled ? ' disabled' : '') + '>Hire a manager<span class="sub">' + C.campaign.hireManager.money + ' $ · ' + C.campaign.hireManager.np + ' NP</span></button>' +
        '<button class="btn" data-act="prep-mcs"' + (disabled ? ' disabled' : '') + '>Upgrade the MCC<span class="sub">' + (mcsCost ? mcsCost.money + ' $ · ' + mcsCost.pm + ' PM · ' + mcsCost.np + ' NP · Rating ' + mcsCost.rating : 'maximum') + '</span></button>' +
        '<button class="btn" data-act="prep-pr"' + (disabled ? ' disabled' : '') + '>PR<span class="sub">' + C.campaign.pr.money + ' $ → +' + C.campaign.pr.vchk + ' VChK · +' + C.campaign.pr.rating + ' Rating</span></button>' +
      '</div>' +
      '<div class="small muted" style="margin-top:8px">MCC ' + s.mcsLevel + ' → capacity ' + E.mcsFor(s).capacity +
        ' launches/step · managers ' + s.managers + ' (need ' + E.mcsFor(s).managersRequired + ') · upkeep ' +
        E.mcsFor(s).upkeep + ' $/step.</div>' +
      '<div class="row" style="margin-top:8px"><button class="btn small ghost" data-act="set-role" data-role="engineer">Factory and launcher CML →</button>' +
        '<button class="btn small ghost" data-act="set-role" data-role="scientist">School and instrument CML →</button></div>' +
    '</section>';
  };

  APP.groundPanel = function () {
    const s = APP.state;
    const disabled = APP.actionsLeft <= 0 || APP.finished;
    return '<section class="panel"><div class="panel-head"><h2>Ground contracts</h2>' +
      '<span class="hint">1 action · ground segment fund</span></div>' +
      '<div class="row" style="margin-bottom:7px"><label class="field" style="flex:1">IP to an instrument' +
        '<select id="gcClass">' + Object.keys(s.tech.instrument).map(function (cls) {
          return '<option value="' + cls + '">' + esc(C.tech.names[cls] || cls) + '</option>';
        }).join('') + '</select></label></div>' +
      (CARDS.groundContracts || []).map(function (card) {
        const bits = ['+' + card.fund + ' $ to the fund'];
        if (card.npDelta) bits.push((card.npDelta > 0 ? '+' : '') + card.npDelta + ' NP');
        if (card.vchkDelta) bits.push('+' + card.vchkDelta + ' VChK');
        if (card.ipDelta) bits.push('+' + card.ipDelta + ' IP');
        const blocked = disabled || (card.npDelta < 0 && s.np < -card.npDelta);
        return '<div class="row between" style="padding:3px 0"><span class="small">' + esc(card.name) +
          '<span class="muted"> · ' + esc(bits.join(' · ')) + '</span></span>' +
          '<button class="btn small" data-act="ground" data-card="' + card.id + '"' + (blocked ? ' disabled' : '') + '>Take</button></div>';
      }).join('') +
    '</section>';
  };

  /* ---------- reports ---------- */
  APP.reportsPanel = function (limit) {
    const list = (APP.reports || []).slice(0, limit || 12);
    if (!list.length) return '<div class="empty">No reports yet. Launch a mission or finish the step.</div>';
    return list.map(function (r) {
      const result = r.result || {};
      const key = result.key || '?';
      const cls = key === 'full' || key === 'success' ? 'ok' : (key === 'partial' || key === 'inflight' ? 'mid' : 'bad');
      const title = key === 'inflight' ? 'launched' : (key === 'full' ? 'full success' : (key === 'success' ? 'success' : (key === 'partial' ? 'partial success' : ('failure' + (result.stage ? ' · ' + result.stage : '')))));
      const sAct = result.sAct == null ? null : APP.fmt(result.sAct, 1);
      const reward = r.reward || {};
      return '<div class="mission-row"><div class="top"><div><span class="name">' + esc(r.name || r.missionId) + '</span>' +
        ' <span class="hint">step ' + (r.step == null ? '—' : r.step) + '</span></div>' +
        '<span class="badge ' + cls + '">' + esc(title) + '</span></div>' +
        '<div class="facts">' +
          (sAct != null ? '<span>S <b>' + sAct + '</b></span>' : '') +
          (r.p != null ? '<span>P <b>' + APP.pct(r.p) + '</b></span>' : '') +
          (r.flight ? '<span>flight <b>' + r.flight + '</b> step.</span>' : '') +
          (r.load ? '<span>channel <b>' + r.load + '</b></span>' : '') +
          (r.sessions ? '<span>sessions <b>' + r.sessions.length + '</b></span>' : '') +
          (reward.dRating ? '<span>Rating <b class="' + (reward.dRating > 0 ? 'ok' : 'bad') + '">' + (reward.dRating > 0 ? '+' : '') + APP.fmt(reward.dRating, 1) + '</b></span>' : '') +
          (reward.bonus ? '<span>bonus <b>' + APP.num(reward.bonus) + ' $</b></span>' : '') +
        '</div></div>';
    }).join('');
  };

  /* ---------- manager screen ---------- */
  APP.screens.manager = function () {
    if (APP.finished) {
      return APP.roleBanner('manager', 'Manager · campaign finished',
        'The engine has produced the final score. You can export the session, undo the last action or start a new campaign.',
        '<button class="btn primary" data-act="new-campaign">New campaign</button>' +
        '<button class="btn ghost" data-act="export">Export</button>' +
        '<button class="btn ghost" data-act="undo">Undo</button>') +
        '<div class="section-grid"><section class="panel"><div class="panel-head"><h2>Result</h2></div>' +
          APP.renderFinalSummary(false) + '</section>' +
          '<section class="panel"><div class="panel-head"><h2>Latest reports</h2></div>' +
          APP.reportsPanel(10) + '</section></div>';
    }
    const missionId = APP.ensureSelection();
    const s = APP.state;
    const banner = APP.roleBanner('manager', 'Manager · mission board and contracts',
      'Pick a mission, check the role recommendations and accept the contract. After both signatures the mission goes into production, then to launch and flight.',
      '<button class="btn primary" data-act="next-step"' + (s.step >= s.maxSteps ? ' disabled' : '') + '>Next step</button>' +
      '<button class="btn warn" data-act="finish">Wrap up and score</button>' +
      '<button class="btn ghost" data-act="launch-all"' + (capLeft() <= 0 || !(s.ready || []).length ? ' disabled' : '') + '>Launch the ready ones</button>');
    const grid = (s.offers || []).map(APP.missionCard).join('') ||
      '<div class="empty">The board is empty. Finish the campaign step.</div>';
    let hero = '';
    if (missionId) {
      const a = APP.buildAnalysis(missionId);
      hero = '<section class="panel"><div class="panel-head"><h2>Mission in progress</h2>' +
        '<div class="row">' + APP.missionSwitcher() + '</div></div>' +
        APP.missionHero(missionId, a) +
        '<div class="divider"></div>' + APP.buildMetrics(a) +
        '<div style="height:8px"></div>' + APP.readyStrip(missionId, a) +
        '<div style="height:8px"></div>' + APP.checkSummary(a, 5) +
      '</section>';
    }
    return banner + APP.expApprovalsPanel('manager') +
      '<section class="panel"><div class="panel-head"><h2>Mission board · step ' + s.step + '</h2>' +
        '<span class="hint">click a card to select it</span></div>' +
        '<div class="mission-grid">' + grid + '</div></section>' +
      hero +
      '<div class="section-grid">' +
        '<section class="panel" style="grid-column:1/-1"><div class="panel-head"><h2>Production and launches</h2>' +
          '<span class="hint">free MCC channels: ' + capLeft() + ' / ' + E.mcsFor(s).capacity + '</span></div>' +
          APP.productionList(false) + '</section>' +
        APP.prepPanel() +
        APP.groundPanel() +
      '</div>';
  };

  /* ---------- MCC screen ---------- */
  function flightTrack(f) {
    const need = Math.max(1, f.flight + (f.overtime || 0));
    const done = Math.min(need, (f.sessions || []).length);
    const pct = Math.round(done / need * 100);
    const ticks = [];
    for (let i = 1; i < need; i++) ticks.push('<i class="tick ' + (i <= done ? 'done' : '') + '" style="left:' + (i / need * 100) + '%"></i>');
    return '<div class="flight-track"><div class="route"></div>' +
      '<div class="ship" style="left:calc(' + Math.max(2, pct) + '% - ' + (pct > 85 ? 34 : 8) + 'px)"></div>' +
      '<div class="planet"></div>' + ticks.join('') + '</div>';
  }

  APP.screens.ops = function () {
    const s = APP.state;
    if (APP.finished) {
      return APP.roleBanner('ops', 'MCC · campaign finished',
        'Every flight is accepted and the remaining missions are closed. The final score and the latest reports are below.',
        '<button class="btn primary" data-act="new-campaign">New campaign</button>' +
        '<button class="btn ghost" data-act="export">Export</button>') +
        '<div class="section-grid"><section class="panel"><div class="panel-head"><h2>Result</h2></div>' +
          APP.renderFinalSummary(false) + '</section>' +
          '<section class="panel"><div class="panel-head"><h2>Acceptances and launches</h2></div>' +
          APP.reportsPanel(14) + '</section></div>';
    }
    const ld = E.opsLoad(s);
    const relief = E.opsIncidentRelief(s.school);
    const banner = APP.roleBanner('ops', 'MCC · flights and link sessions',
      'Watch the channels, extend acceptance and close flights early. An overloaded MCC raises the incident risk; the school softens the penalty.',
      '<button class="btn primary" data-act="next-step"' + (s.step >= s.maxSteps ? ' disabled' : '') + '>Next step</button>' +
      '<button class="btn warn" data-act="finish">Wrap up and score</button>' +
      '<button class="btn ghost" data-act="launch-all"' + (capLeft() <= 0 || !(s.ready || []).length ? ' disabled' : '') + '>Launch the ready ones</button>');
    const flights = (s.flights || []).map(function (f) {
      const need = Math.max(1, f.flight + (f.overtime || 0));
      const done = (f.sessions || []).length;
      const full = f.compute ? f.compute.sRaw * f.compute.data.ratio : 0;
      const share = full > 0 ? Math.min(1, f.accrued / full) : 0;
      const ratio = f.compute ? f.compute.data.ratio * (C.campaign.ops.dataFloor + (1 - C.campaign.ops.dataFloor) * share) : 0;
      const last = (f.sessions || [])[f.sessions.length - 1];
      const lastNote = last && (last.note || last.incident || last.event) ? [last.event, last.incident, last.note].filter(Boolean).join(' / ') : '';
      const canOt = !f.earlyEnd && (f.overtime || 0) < C.campaign.ops.overtime.max && s.money >= C.campaign.ops.overtime.money;
      const canClose = done > 0 && !f.earlyEnd;
      return '<div class="mission-row"><div class="top"><div><span class="name">' + esc(f.name) + '</span>' +
        ' <span class="hint">acceptance ~step ' + f.endStep + '</span></div>' +
        '<span class="badge mid">flight ' + done + ' / ' + need + '</span>' +
        '<span class="badge">channel ' + f.load + '</span>' +
        '<span class="badge ' + (ratio >= (f.compute ? f.compute.data.ratio : 1) ? 'ok' : 'mid') + '">data ' +
          APP.pct(ratio / ((f.compute && f.compute.data.ratio) || 1)) + '</span></div>' +
        flightTrack(f) +
        '<div class="facts"><span>S collected <b>' + APP.fmt(f.accrued, 1) + '</b> of <b>' + APP.fmt(full, 1) + '</b></span>' +
          '<span>target <b>' + (f.compute ? f.compute.target : '—') + '</b></span>' +
          '<span>overtimes <b>' + (f.overtime || 0) + '</b></span>' +
          '<span>events <b>' + (f.events || []).length + '</b></span>' +
          (lastNote ? '<span class="muted">' + esc(lastNote) + '</span>' : '') + '</div>' +
        '<div class="row" style="margin-top:5px"><button class="btn small" data-act="overtime" data-mission="' + f.missionId + '"' +
          (canOt ? '' : ' disabled') + '>Extend (' + C.campaign.ops.overtime.money + ' $)</button>' +
          '<button class="btn small ghost" data-act="close-flight" data-mission="' + f.missionId + '"' +
          (canClose ? '' : ' disabled') + '>Accept early (S ×' + C.campaign.ops.earlyEndSFactor + ')</button></div></div>';
    }).join('') || '<div class="empty">No active flights. Launch a mission that is ready.</div>';
    const loadPlan = E.mcsLoadPlan(s, C.campaign.ops.loadPlanSteps).map(function (p) {
      return '<tr><td>' + p.step + '</td><td class="num">' + p.flights + '</td><td class="num">' +
        p.load + ' / ' + p.cap + '</td><td class="num ' + (p.overload ? 'bad' : 'ok') + '">' + p.overload + '</td></tr>';
    }).join('');
    return banner + APP.expApprovalsPanel('ops') +
      '<div class="section-grid">' +
        '<section class="panel span2"><div class="panel-head"><h2>MCC load</h2>' +
          '<span class="badge ' + (ld.overload ? 'bad' : 'ok') + '">' + (ld.overload ? 'overload ' + ld.overload : 'nominal') + '</span></div>' +
          '<div class="kpis" style="grid-template-columns:repeat(4,1fr)">' +
            '<div class="kpi"><small>channels</small><b class="' + (ld.overload ? 'bad' : 'neutral') + '">' + ld.load + ' / ' + ld.cap + '</b></div>' +
            '<div class="kpi"><small>incident risk</small><b class="' + (E.opsIncidentP(ld.overload, 0, s.school) > 0.1 ? 'warn' : 'neutral') + '">' + APP.pct(E.opsIncidentP(ld.overload, 0, s.school)) + '</b></div>' +
            '<div class="kpi"><small>event / step</small><b class="neutral">' + APP.pct(E.opsEventChance(s)) + '</b></div>' +
            '<div class="kpi"><small>school − penalty</small><b class="neutral">' + APP.pct(relief) + '</b></div>' +
          '</div>' +
          '<div class="small muted" style="margin-top:7px">MCC level ' + s.mcsLevel + ' (effective ' + E.mcsFor(s).levelEff + '), channels ' + E.opsCapacity(s) +
            '. Flights with video and deep-space traffic take more channels.</div>' +
        '</section>' +
        '<section class="panel span2"><div class="panel-head"><h2>Active flights</h2><span class="hint">link sessions and acceptance</span></div>' +
          flights + '</section>' +
        '<section class="panel"><div class="panel-head"><h2>Ready to launch</h2></div>' + APP.productionList(true, true) + '</section>' +
        '<section class="panel"><div class="panel-head"><h2>Load plan</h2></div>' +
          '<table class="tiny-table"><thead><tr><th>step</th><th class="num">flights</th><th class="num">channels</th><th class="num">overload</th></tr></thead><tbody>' +
          loadPlan + '</tbody></table></section>' +
        '<section class="panel span2"><div class="panel-head"><h2>Reports</h2><span class="hint">latest launches and acceptances</span></div>' +
          APP.reportsPanel(12) + '</section>' +
      '</div>';
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
