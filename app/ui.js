/* Space Mission Design — shell: header, campaign stepbar, consultant, chat, modals. */
(function (root) {
  'use strict';

  const APP = root.APP;
  const C = root.CONFIG;
  const E = root.ENGINE;
  const esc = APP.esc;
  const $ = function (id) { return document.getElementById(id); };

  APP._modalActions = [];
  APP._toastTimer = null;

  APP.toast = function (text, type) {
    if (!text) return;
    const el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.className = 'toast show ' + (type || '');
    clearTimeout(APP._toastTimer);
    APP._toastTimer = setTimeout(function () {
      el.className = 'toast ' + (type || '');
    }, 4200);
  };

  APP.closeModal = function () {
    const b = $('modalBackdrop');
    if (b) b.hidden = true;
    APP._modalActions = [];
  };

  APP.modal = function (opts) {
    const backdrop = $('modalBackdrop');
    const modal = $('modal');
    if (!backdrop || !modal) return;
    APP._modalActions = opts.actions || [];
    modal.innerHTML =
      '<h2>' + esc(opts.title || 'Confirmation') + '</h2>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      '<div class="modal-actions">' +
        APP._modalActions.map(function (a, i) {
          return '<button class="btn ' + (a.primary ? 'primary' : (a.warn ? 'warn' : 'ghost')) +
            '" data-modal-index="' + i + '">' + esc(a.label) + '</button>';
        }).join('') +
      '</div>';
    backdrop.hidden = false;
  };

  APP.handleModalClick = function (index) {
    const action = APP._modalActions[index];
    if (!action) return;
    if (action.onClick) {
      const keep = action.onClick();
      if (keep === true) return;
    }
    APP.closeModal();
  };

  APP.confirm = function (title, body, okLabel, onOk, opts) {
    opts = opts || {};
    APP.modal({
      title: title,
      body: body,
      actions: [
        { label: opts.cancelLabel || 'Cancel', onClick: function () { if (opts.onCancel) opts.onCancel(); } },
        { label: okLabel || 'Confirm', primary: !opts.warn, warn: opts.warn, onClick: onOk }
      ]
    });
  };

  APP.handleDispatchResult = function (res) {
    if (!res || !res.needsConfirm) return res;
    if (res.newCampaign) {
      APP.confirm('New campaign', '<p>The current progress will be replaced. The browser save will be overwritten.</p>',
        'Start over', function () {
          const seed = Number(($('seedInput') || {}).value) || 20260101;
          const maxSteps = Number(($('lengthSelect') || {}).value) || C.campaign.steps;
          APP.dispatch('new-campaign', { force: true, seed: seed, maxSteps: maxSteps });
        }, { warn: true });
      return res;
    }
    if (res.finish) {
      APP.confirm('Final score', '<p>Open flights will be accepted and the remaining missions closed. The Undo button reverses this.</p>',
        'Wrap up', function () { APP.dispatch('finish', { force: true }); }, { warn: true });
      return res;
    }
    if (res.analysis) {
      const a = res.analysis;
      const list = a.warnings.map(function (w) { return '<li>' + esc(w.text) + '</li>'; }).join('');
      APP.confirm('Accept with warnings',
        '<p>No blockers, but the consultant sees risks:</p><ul>' + list + '</ul>' +
        '<p class="small muted" style="margin-top:8px">The engine allows acceptance, but the result may be partial.</p>',
        'Accept anyway', function () {
          APP.dispatch('accept', { missionId: res.missionId, allowWarnings: true });
        }, { warn: true });
    }
    return res;
  };

  /* ---------- header ---------- */
  APP.renderResources = function () {
    const el = $('resources');
    if (!el || !APP.state) return;
    const s = APP.state;
    const mcs = E.mcsFor(s);
    const freePm = E.pmAvailable(s);
    const pmLimit = E.pmLimit(s);
    const moneyCls = s.money < 0 ? 'bad' : (s.money < 200 ? 'warn' : 'cy');
    const pmCls = freePm <= 0 ? 'bad' : (freePm < 10 ? 'warn' : 'neutral');
    el.innerHTML =
      '<div class="res"><small>step</small><b class="cy">' + s.step + ' / ' + s.maxSteps + '</b></div>' +
      '<div class="res"><small>cash</small><b class="' + moneyCls + '">' + APP.num(Math.round(s.money)) + ' $</b></div>' +
      '<div class="res"><small>fund</small><b class="neutral">' + APP.num(Math.round(s.groundFund || 0)) + '</b></div>' +
      '<div class="res"><small>Rating / VChK</small><b class="neutral">' + APP.fmt(s.rating, 0) + ' / ' + APP.fmt(s.vchk, 0) + '</b></div>' +
      '<div class="res"><small>NP</small><b class="neutral">' + APP.num(Math.round(s.np)) + '</b></div>' +
      '<div class="res"><small>free PM</small><b class="' + pmCls + '">' + freePm + ' / ' + pmLimit + '</b></div>' +
      '<div class="res"><small>MCC · roles</small><b class="neutral">' + mcs.capacity + ' · ' +
        APP.rolePoints.eng + '/' + APP.rolePoints.sci + '/' + APP.rolePoints.man + '</b></div>';
  };

  APP.renderRoleNav = function () {
    const nav = $('roleNav');
    if (!nav) return;
    nav.querySelectorAll('[data-role]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.role === APP.ui.role);
      const dots = b.querySelector('.role-points');
      if (dots) dots.remove();
    });
    const active = nav.querySelector('[data-role="' + APP.ui.role + '"]');
    if (active) {
      const key = active.dataset.role === 'engineer' ? 'eng' : (active.dataset.role === 'scientist' ? 'sci' : (active.dataset.role === 'manager' ? 'man' : null));
      if (key) active.insertAdjacentHTML('beforeend', '<span class="role-points" style="font-size:9px;opacity:.7;margin-left:3px">' + APP.rolePoints[key] + '</span>');
    }
    nav.querySelectorAll('[data-panel]').forEach(function (b) {
      const p = b.dataset.panel;
      b.classList.toggle('active', p === 'chat' ? APP.ui.chatOpen : (p === 'consultant' ? APP.ui.consultantOpen : false));
    });
    const count = $('chatCount');
    if (count) {
      const unseen = Math.max(0, APP.chat.length - (APP.ui.chatSeen || 0));
      count.textContent = unseen > 9 ? '9+' : String(unseen);
      count.classList.toggle('show', !APP.ui.chatOpen && unseen > 0);
    }
  };

  /* ---------- campaign stepbar ---------- */
  APP.renderStepbar = function () {
    const el = $('stepbar');
    if (!el || !APP.state) return;
    const s = APP.state;
    const max = s.maxSteps || C.campaign.steps;
    el.style.setProperty('--steps', max);
    const cells = [];
    for (let step = 1; step <= max; step++) {
      const prod = (s.production || []).filter(function (p) { return p.startedStep <= step && step < p.readyStep; });
      const ready = (s.ready || []).filter(function (p) { return p.readyStep <= step; });
      const flights = (s.flights || []).filter(function (f) { return f.startedStep <= step && step <= f.endStep && !f.ended; });
      const deadlines = (s.production || []).concat(s.ready || []).filter(function (p) { return p.deadlineStep === step; });
      const prodPct = prod.length ? 100 : 0;
      const flightPct = flights.length ? 100 : 0;
      const deadlinePct = deadlines.length ? 100 : 0;
      const names = [];
      prod.forEach(function (p) {
        const m = APP.mission(p.missionId);
        if (m) names.push(m.name);
      });
      flights.forEach(function (f) { names.push(f.name); });
      const tip = names.length ? names.join(', ') : (deadlines.length ? 'deadline' : (step < s.step ? 'finished' : '—'));
      const title = 'Step ' + step + ': production ' + prod.length + ', ready ' + ready.length +
        ', flights ' + flights.length + ', deadlines ' + deadlines.length +
        (names.length ? '\n' + names.join(', ') : '');
      cells.push(
        '<div class="step-cell ' + (step === s.step ? 'now' : (step < s.step ? 'done' : '')) + '" title="' + esc(title) + '">' +
          '<span class="n">' + step + '</span>' +
          '<div class="tracks">' +
            '<div class="track prod"><i style="width:' + prodPct + '%"></i></div>' +
            '<div class="track"><i style="width:' + flightPct + '%"></i></div>' +
            '<div class="track deadline"><i style="width:' + deadlinePct + '%"></i></div>' +
          '</div>' +
          '<div class="tip"><b>' + esc(tip) + '</b></div>' +
        '</div>'
      );
    }
    el.innerHTML = cells.join('');
  };

  /* ---------- consultant ---------- */
  function block(title, text, cls) {
    return '<div class="consult-block ' + cls + '"><b>' + esc(title) + '</b><br>' + text + '</div>';
  }

  APP.renderConsultant = function () {
    const el = $('consultant');
    if (!el) return;
    if (!APP.state) { el.innerHTML = '<div class="empty">The campaign has not started.</div>'; return; }
    if (APP.finished) {
      el.innerHTML = APP.renderFinalSummary ? APP.renderFinalSummary(true) : '<div class="empty">The campaign is over.</div>';
      return;
    }
    const missionId = APP.ensureSelection();
    if (!missionId) {
      el.innerHTML = '<div class="empty">The mission board is empty. Finish the step to draw new missions.</div>';
      return;
    }
    const a = APP.buildAnalysis(missionId);
    const c = a.compute;
    if (!a.manual || !a.manual.ok || !c) {
      el.innerHTML = '<div class="badge bad">Build not computed</div>' +
        (a.blockers.map(function (b) { return block('Blocker', esc(b.text), 'bad'); }).join(''));
      return;
    }
    const m = a.manual;
    const stateBadge = a.blockers.length ? 'bad' : (a.warnings.length ? 'mid' : 'ok');
    const stateText = a.blockers.length ? 'blockers present' : (a.warnings.length ? 'risks present' : 'ready to accept');
    const checks = (c.checks || []).map(function (ch) {
      const cls = ch.ok ? 'ok' : (ch.soft ? 'mid' : 'bad');
      const mark = ch.ok ? '✓' : (ch.soft ? '!' : '✕');
      return '<div class="check"><span class="ico ' + cls + '">' + mark + '</span>' +
        '<span class="name">' + esc(ch.label) + '</span>' +
        '<span class="detail">' + esc(ch.detail) + '</span></div>';
    }).join('');
    const blockers = a.blockers.map(function (b) { return block('Blocker', esc(b.text), 'bad'); }).join('');
    const warnings = a.warnings.map(function (w) { return block('Risk', esc(w.text), 'mid'); }).join('');
    el.innerHTML =
      '<div class="row between" style="margin-bottom:8px">' +
        '<span class="badge ' + stateBadge + '">' + stateText + '</span>' +
        '<span class="badge">' + esc(a.mission.name) + '</span>' +
      '</div>' +
      '<div class="kpis" style="grid-template-columns:repeat(2,1fr);margin-bottom:8px">' +
        '<div class="kpi"><small>P of success</small><b class="' + (c.pSuccess >= 0.65 ? 'neutral' : (c.pSuccess >= 0.5 ? 'warn' : 'bad')) + '">' + APP.pct(c.pSuccess) + '</b></div>' +
        '<div class="kpi"><small>S / target</small><b class="neutral">' + APP.fmt(c.sDet, 1) + ' / ' + c.target + '</b></div>' +
        '<div class="kpi"><small>price</small><b class="neutral">' + APP.num(c.price) + ' $</b></div>' +
        '<div class="kpi"><small>PM / step</small><b class="' + (m.pmRate <= m.pmFree ? 'neutral' : 'bad') + '">' + m.pmRate + ' / ' + m.pmFree + '</b></div>' +
      '</div>' +
      (blockers || warnings ? blockers + warnings : block('Checks', 'Every mandatory constraint is met.', 'ok')) +
      '<div class="divider"></div>' +
      '<h3>Check matrix</h3>' +
      '<div class="checks">' + checks + '</div>' +
      '<div class="divider"></div>' +
      '<div class="small muted">Engine verdict: <b class="' + (c.verdictKey === 'fail' || c.verdictKey === 'infeasible' ? 'bad' : (c.verdictKey === 'partial' ? 'mid' : 'ok')) + '">' +
        esc(c.verdict) + '</b>. Data: ' + APP.pct(c.data.ratio) + ', channel ' + APP.pct(c.pChannel) +
      '.</div>';
  };

  /* ---------- final score ---------- */
  APP.renderFinalSummary = function (compact) {
    if (!APP.state) return '';
    const sc = APP.state.score || E.finalScore(APP.state);
    const rows = [
      ['Rating', APP.fmt(sc.rating, 1)],
      ['VChK × 0.5', APP.fmt(sc.vchkPart, 1)],
      ['CML levels', APP.fmt(sc.techLevels, 0) + ' → ' + APP.fmt(sc.techPart, 1)],
      ['Standardisations', APP.fmt(sc.standardized, 0) + ' → ' + APP.fmt(sc.stdPart, 1)],
      ['MCC', APP.fmt(sc.mcsLevel, 0) + ' → ' + APP.fmt(sc.mcsPart, 1)],
      ['School', APP.fmt(sc.schoolLevel, 0) + ' → ' + APP.fmt(sc.schoolPart, 1)],
      ['Salvage', APP.fmt(sc.rescues, 0) + ' → ' + APP.fmt(sc.rescuePart, 1)],
      ['Failure streaks', APP.fmt(sc.penaltyPart, 1)]
    ];
    return '<div class="row between"><span class="badge ok">campaign finished</span>' +
      '<span class="badge">seed ' + APP.seed + '</span></div>' +
      '<div style="margin:10px 0 6px"><b style="font-size:26px;color:var(--cyan)">' +
        APP.fmt(sc.total, 1) + '</b> <span class="muted">points</span></div>' +
      '<div class="small muted" style="margin-bottom:8px">Missions: ' + (APP.state.stats.missions || 0) +
        ' · success/partial/failure: ' + (APP.state.stats.success || 0) + '/' +
        (APP.state.stats.partial || 0) + '/' + (APP.state.stats.fail || 0) + '</div>' +
      (compact ? '' : '<table class="tiny-table">' + rows.map(function (r) {
        return '<tr><td>' + esc(r[0]) + '</td><td class="num">' + esc(r[1]) + '</td></tr>';
      }).join('') + '</table>');
  };

  /* ---------- journal ---------- */
  APP.renderJournal = function () {
    const el = $('log');
    if (!el) return;
    const stepEl = $('logStep');
    if (stepEl && APP.state) stepEl.textContent = APP.state.step;
    const items = (APP.journal || []).slice(0, 50);
    el.innerHTML = items.length ? items.map(function (j) {
      return '<div><span class="step">s' + j.step + '</span> · ' + esc(j.text) + '</div>';
    }).join('') : '<div class="muted">the journal is empty</div>';
  };

  /* ---------- chat ---------- */
  APP.renderChat = function () {
    const dock = $('chatDock');
    const log = $('chatLog');
    if (!dock || !log) return;
    dock.classList.toggle('open', !!APP.ui.chatOpen);
    if (!APP.ui.chatOpen) return;
    const msgs = (APP.chat || []).slice(-60);
    log.innerHTML = msgs.length ? msgs.map(function (m) {
      const role = m.role || 'system';
      return '<div class="chat-msg"><div class="meta"><span class="role ' + esc(role) + '">' +
        esc(APP.roleName(role)) + '</span><span>step ' + (m.step == null ? '—' : m.step) + '</span></div>' +
        '<div class="text">' + esc(m.text) + '</div></div>';
    }).join('') : '<div class="empty">No messages yet. Write to a role or use a quick phrase.</div>';
    APP.ui.chatSeen = APP.chat.length;
    const hint = $('chatHint');
    if (hint) {
      hint.textContent = APP.storageOk ? 'saved in the browser' : 'export the session manually';
      hint.className = 'hint ' + (APP.storageOk ? 'ok' : 'mid');
    }
    requestAnimationFrame(function () { log.scrollTop = log.scrollHeight; });
  };

  /* ---------- shared render ---------- */
  APP.renderAll = function () {
    if (!APP.state) return;
    APP.ensureOfferBuilds();
    APP.ensureSelection();
    APP.renderResources();
    APP.renderStepbar();
    APP.renderConsultant();
    APP.renderJournal();
    APP.renderChat();
    APP.renderRoleNav();
    const panel = $('consultantPanel');
    if (panel) panel.hidden = !APP.ui.consultantOpen;
    const screen = $('screen');
    if (screen) {
      const fn = APP.screens[APP.ui.role];
      screen.innerHTML = fn ? fn() : '<div class="empty">This role screen is not implemented yet.</div>';
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
