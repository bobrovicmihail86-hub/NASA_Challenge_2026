/* Space Mission Design — role headquarters: state, actions, saving.
 * The only place where the campaign changes is APP.dispatch(action).
 * The engine (data/engine.js) is not duplicated: every calculation goes through ENGINE.
 */
(function (root) {
  'use strict';

  const C = root.CONFIG;
  const E = root.ENGINE;
  const CARDS = root.CARDS;
  const MISSIONS = root.MISSIONS;
  const APP = root.APP = {};
  const STORE_KEY = 'smd.app.v1';

  const ROLE_NAMES = { manager: 'Manager', engineer: 'Engineer', scientist: 'Scientist', ops: 'MCC', system: 'System', consultant: 'Consultant' };
  const PHYS_BY_KEY = { capsule: 'phy_capsule', lander: 'phy_lander', rover: 'phy_rover', manipulator: 'phy_manipulator', relay: 'phy_relay' };
  const DATA_INSTRUMENT = { video: 'ins_camera', spectrum: 'ins_spectrometer', telemetry: 'ins_radiometer' };

  APP.ROLES = ROLE_NAMES;
  APP.C = C;
  APP.E = E;
  APP.CARDS = CARDS;
  APP.MISSIONS = MISSIONS;
  APP.screens = {};
  APP.version = 1;
  APP.storageOk = false;
  APP.undoStack = [];

  /* ---------- utilities ---------- */
  APP.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  APP.fmt = function (x, d) {
    if (x == null || isNaN(x)) return '—';
    return Number(x).toFixed(d == null ? 2 : d);
  };
  APP.num = function (x, d) {
    if (x == null || isNaN(x)) return '—';
    return Number(x).toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 0 : d });
  };
  APP.pct = function (x) { return Math.round((x || 0) * 100) + '%'; };
  APP.mission = function (id) { return MISSIONS.find(function (m) { return m.id === id; }) || null; };
  APP.card = function (id) { return E.card(id); };
  APP.art = function (p) {
    if (!p) return '';
    if (/^(\.\.\/|https?:|\/)/.test(p)) return p;
    return '../art/' + p.replace(/^art\//, '');
  };
  APP.missionArt = function (mission) { return mission ? APP.art(mission.art) : ''; };
  APP.cardArt = function (card) { return card ? APP.art(card.art) : ''; };
  APP.roleName = function (role) { return ROLE_NAMES[role] || role; };

  /* ---------- experiment approval (shared resources) ---------- */
  const EXP_APPROVAL_FALLBACK = ['engineer', 'scientist', 'manager'];
  const EXP_APPROVAL_CONFIGURED = C.tech && C.tech.experimental && C.tech.experimental.approvalRoles;
  const EXP_APPROVAL_ROLES = (Array.isArray(EXP_APPROVAL_CONFIGURED) && EXP_APPROVAL_CONFIGURED.length
    ? EXP_APPROVAL_CONFIGURED
    : EXP_APPROVAL_FALLBACK).slice();
  const EXP_APPROVAL_LABELS = { engineer: 'Engineer', scientist: 'Scientist', manager: 'Manager' };
  const TEST_LABELS = {
    flightRocket: 'Launcher flight test',
    stand: 'Instrument test stand',
    flightInstrument: 'Instrument flight test'
  };

  function blankSignatures() {
    const out = {};
    EXP_APPROVAL_ROLES.forEach(function (role) { out[role] = false; });
    return out;
  }

  function approvalStore() {
    const s = APP.state;
    if (!s) return null;
    if (!s.expApprovals || typeof s.expApprovals !== 'object') s.expApprovals = {};
    if (!s.expApprovals.tests || typeof s.expApprovals.tests !== 'object') s.expApprovals.tests = {};
    if (!s.expApprovals.launches || typeof s.expApprovals.launches !== 'object') s.expApprovals.launches = {};
    return s.expApprovals;
  }

  function approvalBucket(scope) {
    const store = approvalStore();
    if (!store) return null;
    return scope === 'launch' ? store.launches : store.tests;
  }

  function normalizeRequest(req) {
    if (!req) return req;
    if (!req.signatures || typeof req.signatures !== 'object') req.signatures = blankSignatures();
    EXP_APPROVAL_ROLES.forEach(function (role) {
      if (req.signatures[role] == null) req.signatures[role] = false;
    });
    if (!Array.isArray(req.cards)) req.cards = [];
    return req;
  }

  function approvalSigned(req) {
    if (!req) return 0;
    normalizeRequest(req);
    return EXP_APPROVAL_ROLES.filter(function (role) { return !!req.signatures[role]; }).length;
  }

  function approvalReady(req) {
    return !!req && approvalSigned(req) === EXP_APPROVAL_ROLES.length;
  }

  function approvalMissing(req) {
    normalizeRequest(req);
    return EXP_APPROVAL_ROLES.filter(function (role) { return !req || !req.signatures[role]; })
      .map(function (role) { return EXP_APPROVAL_LABELS[role] || role; });
  }

  function pushExpCard(list, id) {
    const card = E.card(id);
    if (!card || !E.isExpCard(card)) return;
    if (!list.some(function (c) { return c.id === card.id; })) list.push(card);
  }

  function testCards(kind, opts) {
    const out = [];
    opts = opts || {};
    if (kind === 'flightRocket') {
      pushExpCard(out, opts.rocketId);
    } else if (kind === 'stand') {
      pushExpCard(out, opts.cardId);
    } else if (kind === 'flightInstrument') {
      pushExpCard(out, opts.rocketId);
      pushExpCard(out, opts.instrumentId);
    }
    return out;
  }

  function entryExpCards(p) {
    if (!p) return [];
    if (!p.compute) APP.recomputeEntry(p);
    if (!p.compute || !p.compute.build) return [];
    return E.devExpCards(p.compute.build).map(function (id) { return E.card(id); })
      .filter(Boolean);
  }

  function testApprovalKey(kind, opts) {
    opts = opts || {};
    return ['test', kind, opts.rocketId || '', opts.instrumentId || '', opts.cardId || '', opts.cls || ''].join('|');
  }

  function launchApprovalKey(p) {
    return ['launch', p && p.missionId ? p.missionId : '', p && p.startedStep != null ? p.startedStep : ''].join('|');
  }

  function makeApproval(scope, key, meta, initiator) {
    const bucket = approvalBucket(scope);
    if (!bucket) return null;
    let req = normalizeRequest(bucket[key]);
    if (!req) {
      req = {
        scope: scope, key: key, step: APP.state.step,
        title: meta.title, detail: meta.detail || '',
        cards: (meta.cards || []).slice(), params: meta.params || null,
        signatures: blankSignatures()
      };
      bucket[key] = req;
    } else {
      req.scope = scope;
      req.key = key;
      req.step = APP.state.step;
      req.title = meta.title;
      req.detail = meta.detail || '';
      req.cards = (meta.cards || []).slice();
      req.params = meta.params || null;
    }
    if (EXP_APPROVAL_ROLES.indexOf(initiator) !== -1) req.signatures[initiator] = true;
    return req;
  }

  function testApprovalRequest(kind, opts) {
    const cards = testCards(kind, opts);
    if (!cards.length) {
      clearTestApprovals();
      return { required: false, ready: true, cards: [] };
    }
    const key = testApprovalKey(kind, opts);
    const bucket = approvalBucket('test');
    Object.keys(bucket).forEach(function (k) { if (k !== key) delete bucket[k]; });
    const names = cards.map(function (c) { return c.name; }).join(', ');
    const req = makeApproval('test', key, {
      title: TEST_LABELS[kind] || 'Test',
      detail: 'Step ' + APP.state.step + ' · cards: ' + names,
      cards: cards.map(function (c) { return c.id; }),
      params: { kind: kind, opts: opts }
    }, APP.ui.role);
    return { required: true, key: key, request: req, cards: cards, ready: approvalReady(req) };
  }

  function launchApprovalInfo(p) {
    const cards = entryExpCards(p);
    if (!cards.length) return { required: false, ready: true, signed: 0, cards: [] };
    const key = launchApprovalKey(p);
    const req = normalizeRequest((approvalBucket('launch') || {})[key]);
    return {
      required: true, key: key, cards: cards, request: req,
      ready: approvalReady(req), signed: approvalSigned(req)
    };
  }

  function launchApprovalRequest(p, initiator) {
    const info = launchApprovalInfo(p);
    if (!info.required) return info;
    const mission = APP.mission(p.missionId);
    const names = info.cards.map(function (c) { return c.name; }).join(', ');
    const req = makeApproval('launch', info.key, {
      title: 'Launch · ' + (mission ? mission.name : p.missionId),
      detail: 'Step ' + APP.state.step + ' · ready ' + p.readyStep +
        ' · deadline ' + p.deadlineStep + ' · cards: ' + names,
      cards: info.cards.map(function (c) { return c.id; }),
      params: { missionId: p.missionId, startedStep: p.startedStep }
    }, initiator);
    return Object.assign(info, { request: req, ready: approvalReady(req), signed: approvalSigned(req) });
  }

  function pendingApproval(gate, label) {
    const missing = approvalMissing(gate.request);
    return {
      ok: false, type: 'mid', needsApproval: true, requestKey: gate.key,
      message: 'Approval required: ' + label + '. Signatures ' + approvalSigned(gate.request) +
        '/' + EXP_APPROVAL_ROLES.length + '; still missing: ' + missing.join(', ') + '.'
    };
  }

  function clearTestApprovals() {
    const store = approvalStore();
    if (store) store.tests = {};
  }

  function clearLaunchApprovals() {
    const store = approvalStore();
    if (store) store.launches = {};
  }

  function pruneLaunchApprovals() {
    const bucket = approvalBucket('launch');
    if (!bucket) return;
    const ready = APP.state.ready || [];
    Object.keys(bucket).forEach(function (key) {
      const live = ready.some(function (p) { return launchApprovalKey(p) === key; });
      if (!live) delete bucket[key];
    });
  }

  function dropApproval(scope, key) {
    const bucket = approvalBucket(scope);
    if (bucket && key) delete bucket[key];
  }

  function dropLaunchedApprovals(reports) {
    const ids = (reports || []).map(function (r) { return r && r.missionId; }).filter(Boolean);
    if (!ids.length) return;
    const bucket = approvalBucket('launch');
    Object.keys(bucket).forEach(function (key) {
      const req = bucket[key];
      if (req && req.params && ids.indexOf(req.params.missionId) !== -1) delete bucket[key];
    });
  }

  function testRunOptions(kind, action) {
    const s = APP.state;
    action = action || {};
    if (kind === 'flightRocket') {
      const pool = E.rocketPool(s);
      return { rocketId: action.rocketId || (pool[0] || {}).id };
    }
    if (kind === 'stand') {
      return {
        ipKind: 'instrument', ipClass: action.cls || 'camera',
        cardId: action.cardId || null, cls: action.cls || 'camera'
      };
    }
    const rockets = E.rocketPool(s);
    const instruments = E.instrumentPool(s);
    return {
      rocketId: action.rocketId || (rockets[0] || {}).id,
      instrumentId: action.instrumentId || (instruments[0] || {}).id
    };
  }

  APP.expApprovalRoles = EXP_APPROVAL_ROLES.slice();
  APP.expApprovalLabels = EXP_APPROVAL_LABELS;
  APP.expApprovalSigned = approvalSigned;
  APP.expApprovalReady = approvalReady;
  APP.expApprovalMissing = approvalMissing;
  APP.expApprovalCards = function (req) {
    return ((req && req.cards) || []).map(function (id) { return E.card(id); }).filter(Boolean);
  };
  APP.launchApprovalInfo = launchApprovalInfo;
  APP.listExpApprovals = function (scope) {
    const bucket = approvalBucket(scope === 'launch' ? 'launch' : 'test');
    if (!bucket) return [];
    const list = Object.keys(bucket).map(function (key) { return normalizeRequest(bucket[key]); });
    if (scope === 'launch') {
      return list.filter(function (req) {
        return (APP.state.ready || []).some(function (p) { return launchApprovalKey(p) === req.key; });
      });
    }
    return list.filter(function (req) { return req.step === APP.state.step; });
  };
  APP.signExpApproval = function (action) {
    if (APP.finished) return fail('The campaign is over.');
    const scope = action && action.scope === 'launch' ? 'launch' : 'test';
    const key = String((action && action.key) || '');
    const bucket = approvalBucket(scope);
    const req = normalizeRequest(bucket && bucket[key]);
    if (!req) return fail('Approval request not found. Request a launch or a test first.');
    if (scope === 'test' && req.step !== APP.state.step) {
      return fail('The test request has expired: signatures are valid only within the step.');
    }
    if (scope === 'launch') {
      const ready = (APP.state.ready || []).some(function (p) { return launchApprovalKey(p) === key; });
      if (!ready) return fail('The mission is no longer awaiting launch — the request is closed.');
    }
    const role = APP.ui.role;
    if (EXP_APPROVAL_ROLES.indexOf(role) === -1) {
      return fail('The approval is signed by the engineer, the scientist and the manager.');
    }
    if (req.signatures[role]) return done('Your signature is already on the request “' + req.title + '”.', 'mid');
    APP.snapshot();
    req.signatures[role] = true;
    const signed = approvalSigned(req);
    APP.pushJournal('Approval “' + req.title + '”: ' + (EXP_APPROVAL_LABELS[role] || role) +
      ' signed (' + signed + '/' + EXP_APPROVAL_ROLES.length + ').', role);
    APP.say(role, 'Approved: ' + req.title + ' (' + signed + '/' + EXP_APPROVAL_ROLES.length + ').');
    return done(approvalReady(req)
      ? 'Approval for “' + req.title + '” granted (' + EXP_APPROVAL_ROLES.length + '/' + EXP_APPROVAL_ROLES.length + '). You can proceed.'
      : 'Signature added: “' + req.title + '” (' + signed + '/' + EXP_APPROVAL_ROLES.length +
        '). Still missing: ' + approvalMissing(req).join(', ') + '.', approvalReady(req) ? 'ok' : 'mid');
  };

  function makeLcg(seed) {
    let s = (seed >>> 0) || 1;
    return {
      next: function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; },
      get state() { return s; },
      set state(v) { s = (v >>> 0) || 1; }
    };
  }
  APP.makeLcg = makeLcg;

  /* ---------- initial state ---------- */
  APP.state = null;
  APP.rnd = null;
  APP.seed = 20260101;
  APP.actionsLeft = C.campaign.skipPrepActions;
  APP.finished = false;
  APP.selectedMissionId = null;
  APP.builds = {};
  APP.chat = [];
  APP.journal = [];
  APP.reports = [];
  APP.rolePoints = { eng: 0, sci: 0, man: 0 };
  APP.ui = { role: 'manager', consultantOpen: true, chatOpen: false, tab: 'offers' };
  APP.lastReportStep = 0;

  APP.newCampaign = function (seed, maxSteps) {
    seed = Number(seed) || 20260101;
    APP.seed = seed;
    APP.state = E.campaignSetup(seed);
    APP.state.maxSteps = Number(maxSteps) || C.campaign.steps;
    APP.state.expApprovals = { tests: {}, launches: {} };
    APP.rnd = makeLcg((seed * 2654435761) >>> 0 || 7);
    APP.actionsLeft = C.campaign.skipPrepActions;
    APP.finished = false;
    APP.selectedMissionId = null;
    APP.builds = {};
    APP.chat = [];
    APP.journal = [];
    APP.reports = [];
    APP.rolePoints = { eng: 0, sci: 0, man: 0 };
    APP.lastReportStep = 0;
    APP.undoStack = [];
    APP.ui.role = 'manager';
    APP.ui.tab = 'offers';
    APP.ensureOfferBuilds();
    APP.ensureSelection();
    APP.pushJournal('Campaign ' + seed + ' started. Steps: ' + APP.state.maxSteps + '.', 'system');
    APP.say('system', 'Campaign ' + seed + ' started. The mission showcase is open.');
    APP.ui.chatSeen = APP.chat.length;
    APP.save();
    return APP.state;
  };

  APP.ensureOfferBuilds = function () {
    (APP.state.offers || []).forEach(function (id) { APP.ensureBuild(id); });
  };

  APP.defaultSel = function (mission) {
    const physical = (mission.requires || []).map(function (k) { return PHYS_BY_KEY[k]; }).filter(Boolean);
    const ins = DATA_INSTRUMENT[mission.dataType] || 'ins_camera';
    return {
      rocketId: 'rocket_light',
      reservationId: 'res_single',
      controlId: 'ctrl_basic',
      antennaId: 'ant_small',
      antennaDup: false,
      powerId: 'pwr_solar_small',
      bufferId: null,
      instruments: [{ id: ins, count: 1 }],
      physical: physical,
      moduleBuild: false,
      schoolLevel: APP.state ? (APP.state.school || 0) : 0
    };
  };

  APP.ensureBuild = function (missionId) {
    const mission = APP.mission(missionId);
    if (!mission) return null;
    let b = APP.builds[missionId];
    if (!b) {
      const traj = (mission.trajectories || ['direct'])[0];
      b = APP.builds[missionId] = {
        sel: APP.defaultSel(mission),
        trajId: traj,
        ready: { engineer: false, scientist: false },
        rev: 1
      };
    }
    b.sel = b.sel || APP.defaultSel(mission);
    b.sel.schoolLevel = APP.state ? (APP.state.school || 0) : 0;
    b.ready = b.ready || { engineer: false, scientist: false };
    if (!b.trajId || (mission.trajectories || []).indexOf(b.trajId) === -1) {
      b.trajId = (mission.trajectories || ['direct'])[0];
    }
    return b;
  };

  APP.ensureSelection = function () {
    const offers = APP.state ? (APP.state.offers || []) : [];
    if (!offers.length) { APP.selectedMissionId = null; return null; }
    if (!APP.selectedMissionId || offers.indexOf(APP.selectedMissionId) === -1) {
      APP.selectedMissionId = offers[0];
    }
    APP.ensureBuild(APP.selectedMissionId);
    return APP.selectedMissionId;
  };

  APP.selectedMission = function () {
    const id = APP.ensureSelection();
    return id ? APP.mission(id) : null;
  };

  /* ---------- build and its checks ---------- */
  APP.manualFor = function (missionId, build) {
    const mission = APP.mission(missionId);
    if (!mission || !APP.state) return null;
    const b = build || APP.ensureBuild(missionId);
    let manual = E.campaignManual(APP.state, mission, b.sel, b.trajId);
    if (!manual.ok) {
      const fallback = (mission.trajectories || ['direct'])[0];
      if (fallback && fallback !== b.trajId) {
        b.trajId = fallback;
        manual = E.campaignManual(APP.state, mission, b.sel, b.trajId);
      }
    }
    return manual;
  };

  function checkFix(id) {
    const map = {
      mass: 'Take a launcher with more payload capacity, a lighter trajectory or drop modules.',
      power: 'Install more powerful panels/an RTG or reduce the power draw.',
      slots: 'Remove instruments or take an FCS with more slots.',
      deadline: 'You need a launcher with fewer cycles or a trajectory with a later deadline.',
      pm: 'Reduce the assembly workload or upgrade the school.',
      modules: 'Add the physical modules the trajectory requires.',
      money: 'Make the build cheaper or pick a mission with a larger advance.'
    };
    return map[id] || '';
  }

  APP.buildAnalysis = function (missionId) {
    const mission = APP.mission(missionId);
    const build = APP.ensureBuild(missionId);
    const manual = APP.manualFor(missionId, build);
    const out = {
      mission: mission, build: build, manual: manual, compute: null,
      blockers: [], warnings: [], suggestions: [], score: 'bad'
    };
    if (!manual) {
      out.blockers.push({ id: 'mission', text: 'Mission not found.' });
      return out;
    }
    if (!manual.ok) {
      out.blockers.push({ id: 'trajectory', text: manual.reason || 'The build is not computed.' });
      return out;
    }
    const c = out.compute = manual.compute;
    const s = APP.state;
    const push = function (arr, id, text) { arr.push({ id: id, text: text }); };

    (c.checks || []).forEach(function (ch) {
      if (ch.ok) return;
      if (ch.id === 'data') {
        push(out.warnings, 'data-check', ch.label + ': ' + ch.detail + '. Full success will be unavailable.');
      } else {
        push(out.blockers, 'check-' + ch.id, ch.label + ': ' + ch.detail + '. ' + checkFix(ch.id));
      }
    });
    if (!manual.budgetOk) {
      push(out.blockers, 'budget', 'Price ' + manual.price + ' $ is above the contract limit ' + Math.round(manual.cap) + ' $.');
    }
    if (!manual.cashOk) {
      push(out.blockers, 'cash', 'After the advance and the purchase the treasury goes negative: ' + Math.round(manual.cashAfter) + ' $.');
    }
    if (manual.pmRate > manual.pmFree) {
      push(out.blockers, 'pm-step', 'Needs ' + manual.pmRate + ' PM/step, ' + manual.pmFree + ' free.');
    }
    if (manual.prodTime > c.deadline) {
      push(out.blockers, 'prod-deadline', 'Production takes ' + manual.prodTime + ' step(s) and misses the deadline ' + c.deadline + '.');
    }
    if (s.step + manual.prodTime > s.maxSteps) {
      push(out.blockers, 'campaign-end', 'Readiness at step ' + (s.step + manual.prodTime) + ' — after the end of the campaign (' + s.maxSteps + ').');
    }
    if ((s.production || []).length >= C.campaign.productionSlots) {
      push(out.blockers, 'slots-production', 'All ' + C.campaign.productionSlots + ' production slots are taken.');
    }
    if (c.missingMission && c.missingMission.length) {
      push(out.warnings, 'mission-modules', 'The mission is missing mandatory modules: ' + c.missingMission.join(', ') + '. Each one halves S.');
    }
    if (!c.data.typeMatch) {
      push(out.warnings, 'data-type', 'No instrument provides the data type “' + (C.dataTypes[mission.dataType] || {}).name + '”: S ×0.5.');
    }
    if (!c.slots.used) {
      push(out.warnings, 'no-instruments', 'The build has no instruments: there will be no scientific return.');
    }
    if (c.pSuccess < 0.5) {
      push(out.warnings, 'p-success', 'P of success ' + APP.pct(c.pSuccess) + ' < 50%: the engine will count the mission as a failure.');
    } else if (c.pSuccess < 0.6) {
      push(out.warnings, 'p-low', 'P of success ' + APP.pct(c.pSuccess) + ' — the risk is high.');
    }
    if (c.data.ratio < 0.5) {
      push(out.warnings, 'data-ratio', 'Sent ' + APP.pct(c.data.ratio) + ' of the data: full success is forbidden.');
    }
    if (c.pChannel < 0.6) {
      push(out.warnings, 'p-channel', 'Channel reliability ' + APP.pct(c.pChannel) + ' is the bottleneck.');
    }
    if (c.sDet < c.target) {
      push(out.warnings, 's-target', 'S ' + APP.fmt(c.sDet, 1) + ' is below the target ' + c.target + ': success/partial success, not “full”.');
    }
    if (!build.ready.engineer) {
      push(out.warnings, 'eng-ready', 'The engineer has not confirmed the launcher, the redundancy and the trajectory yet.');
    }
    if (!build.ready.scientist) {
      push(out.warnings, 'sci-ready', 'The scientist has not confirmed the FCS, the instruments, the power and the antenna yet.');
    }
    out.score = out.blockers.length ? 'bad' : (out.warnings.length ? 'mid' : 'ok');
    return out;
  };

  APP.roleReadyText = function (build, role) {
    if (!build) return 'no build';
    return build.ready[role] ? 'confirmed' : 'waiting';
  };

  /* ---------- journal and chat ---------- */
  APP.pushJournal = function (text, role) {
    APP.journal.unshift({
      step: APP.state ? APP.state.step : 0,
      role: role || 'system',
      text: String(text || '')
    });
    APP.journal = APP.journal.slice(0, 120);
  };

  APP.say = function (role, text) {
    if (!text) return;
    APP.chat.push({
      role: role || APP.ui.role || 'system',
      step: APP.state ? APP.state.step : 0,
      text: String(text),
      at: Date.now()
    });
    APP.chat = APP.chat.slice(-160);
  };

  APP.consumeReports = function (reports) {
    (reports || []).forEach(function (r) {
      if (!r || !r.result) return;
      const result = r.result;
      const roles = E.rolesFor(result.key, result.stage);
      APP.rolePoints.eng += roles.eng;
      APP.rolePoints.sci += roles.sci;
      APP.rolePoints.man += roles.man;
    });
    if (reports && reports.length) {
      APP.reports = reports.concat(APP.reports).slice(0, 40);
      const first = reports.find(function (r) { return r && r.step != null; });
      APP.lastReportStep = first ? first.step : APP.state.step;
    }
  };

  APP.recomputeEntry = function (p) {
    if (!p || p.compute || !p.sel) return p;
    const mission = APP.mission(p.missionId);
    if (!mission) return p;
    p.compute = E.campaignCompute(APP.state, p.sel, mission, p.trajectoryId,
      { unique: p.unique, money: p.cap });
    return p;
  };

  /* ---------- saving ---------- */
  APP.serialize = function () {
    const clean = JSON.parse(JSON.stringify(APP.state, function (k, v) {
      if (k === 'compute') return undefined;
      return v;
    }));
    return {
      app: APP.version,
      engine: C.version,
      seed: APP.seed,
      maxSteps: APP.state.maxSteps,
      rng: APP.rnd ? APP.rnd.state : 1,
      actionsLeft: APP.actionsLeft,
      finished: APP.finished,
      state: clean,
      builds: APP.builds,
      selectedMissionId: APP.selectedMissionId,
      chat: APP.chat,
      journal: APP.journal,
      reports: APP.reports,
      rolePoints: APP.rolePoints,
      lastReportStep: APP.lastReportStep,
      ui: { role: APP.ui.role, tab: APP.ui.tab }
    };
  };

  APP.hydrate = function (data, keepUndo) {
    if (!data || !data.state || !data.seed) throw new Error('Invalid save file');
    APP.seed = Number(data.seed) || 20260101;
    APP.state = E.campaignSetup(APP.seed);
    APP.state.maxSteps = Number(data.maxSteps) || APP.state.maxSteps;
    Object.assign(APP.state, data.state);
    approvalStore();
    Object.keys(APP.state.expApprovals.tests).forEach(function (key) {
      const req = APP.state.expApprovals.tests[key];
      if (!req || req.step !== APP.state.step) delete APP.state.expApprovals.tests[key];
    });
    pruneLaunchApprovals();
    if (!APP.state._deck) APP.state._deck = E.campaignSetup(APP.seed)._deck;
    APP.rnd = makeLcg(data.rng || 1);
    APP.actionsLeft = data.actionsLeft == null ? C.campaign.skipPrepActions : data.actionsLeft;
    APP.finished = !!data.finished;
    APP.builds = data.builds || {};
    APP.selectedMissionId = data.selectedMissionId || null;
    APP.chat = data.chat || [];
    APP.journal = data.journal || [];
    APP.reports = data.reports || [];
    APP.rolePoints = data.rolePoints || { eng: 0, sci: 0, man: 0 };
    APP.lastReportStep = data.lastReportStep || 0;
    APP.ui.chatSeen = APP.chat.length;
    APP.ui.role = (data.ui && data.ui.role) || 'manager';
    APP.ui.tab = (data.ui && data.ui.tab) || 'offers';
    if (!keepUndo) APP.undoStack = [];
    (APP.state.flights || []).forEach(APP.recomputeEntry);
    (APP.state.production || []).forEach(APP.recomputeEntry);
    (APP.state.ready || []).forEach(APP.recomputeEntry);
    APP.ensureOfferBuilds();
    APP.ensureSelection();
    return APP.state;
  };

  APP.save = function () {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(APP.serialize()));
      APP.storageOk = true;
    } catch (err) {
      APP.storageOk = false;
    }
  };

  APP.load = function () {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      APP.hydrate(JSON.parse(raw));
      APP.storageOk = true;
      return true;
    } catch (err) {
      APP.storageOk = false;
      return false;
    }
  };

  APP.exportFile = function () {
    const text = JSON.stringify(APP.serialize(), null, 1);
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'smd-session-' + APP.seed + '-step' + APP.state.step + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    return { ok: true, message: 'Save exported.', type: 'ok' };
  };

  APP.importJSON = function (text) {
    try {
      APP.hydrate(JSON.parse(text));
      APP.save();
      return { ok: true, message: 'Save loaded: step ' + APP.state.step + '.', type: 'ok' };
    } catch (err) {
      return { ok: false, message: 'Import failed: ' + err.message, type: 'bad' };
    }
  };

  APP.snapshot = function () {
    try {
      APP.undoStack.push(JSON.stringify(APP.serialize()));
      if (APP.undoStack.length > 20) APP.undoStack.shift();
    } catch (err) { /* serialisation is not critical for the turn */ }
  };

  APP.undo = function () {
    const raw = APP.undoStack.pop();
    if (!raw) return { ok: false, message: 'Nothing to undo.', type: 'mid' };
    try {
      APP.hydrate(JSON.parse(raw), true);
      APP.save();
      return { ok: true, message: 'Undo done: step ' + APP.state.step + '.', type: 'mid' };
    } catch (err) {
      return { ok: false, message: 'Undo failed: ' + err.message, type: 'bad' };
    }
  };

  /* ---------- role permissions ---------- */
  const ALLOWED = {
    manager: ['select-mission', 'accept', 'recommend', 'launch', 'launch-all', 'next-step', 'finish',
      'prep-hire', 'prep-mcs', 'prep-pr', 'ground', 'approve-exp'],
    engineer: ['select-mission', 'recommend', 'patch-engineer', 'confirm-engineer',
      'prep-factory', 'test-rocket', 'tech-rocket', 'standardize', 'approve-exp'],
    scientist: ['select-mission', 'recommend', 'patch-scientist', 'confirm-scientist',
      'prep-school', 'test-stand', 'test-instrument', 'tech-instrument', 'standardize', 'approve-exp'],
    ops: ['select-mission', 'launch', 'launch-all', 'next-step', 'finish', 'overtime', 'close-flight']
  };
  const COMMON = ['set-role', 'toggle-panel', 'chat', 'save', 'export', 'undo', 'import'];

  APP.permitted = function (action) {
    const role = APP.ui.role;
    if (COMMON.indexOf(action) !== -1 || action === 'new-campaign') return true;
    return (ALLOWED[role] || []).indexOf(action) !== -1;
  };

  function permError() {
    return { ok: false, noSave: true, message: 'This action belongs to another role. Switch to the right tab.', type: 'bad' };
  }
  function fail(reason) {
    return { ok: false, noSave: true, message: reason, type: 'bad' };
  }
  function done(message, type) {
    return { ok: true, message: message, type: type || 'ok' };
  }

  APP.afterChange = function (res) {
    if (res && res.noSave !== true) APP.save();
    if (root.APP.renderAll) root.APP.renderAll();
    if (res && res.message && root.APP.toast) root.APP.toast(res.message, res.type);
    return res;
  };

  function resetReady(build) {
    build.ready.engineer = false;
    build.ready.scientist = false;
    build.rev = (build.rev || 0) + 1;
  }

  function validCard(id, group) {
    const card = E.card(id);
    if (!card) return false;
    if (group && CARDS[group]) return CARDS[group].some(function (x) { return x.id === id; });
    return true;
  }

  function sanitizeInstruments(list) {
    const seen = {};
    const out = [];
    (list || []).forEach(function (o) {
      if (!o || !o.id) return;
      const card = E.card(o.id);
      if (!card || card.kind !== 'instrument') return;
      const count = Math.max(0, Math.min(99, Math.round(Number(o.count) || 0)));
      if (!count) return;
      seen[o.id] = (seen[o.id] || 0) + count;
    });
    Object.keys(seen).forEach(function (id) { out.push({ id: id, count: seen[id] }); });
    return out;
  }

  function patchBuild(action) {
    const missionId = action.missionId || APP.selectedMissionId;
    const build = APP.ensureBuild(missionId);
    if (!build) return fail('The build was not found.');
    const role = action.actor || APP.ui.role;
    if (role !== APP.ui.role) return permError();
    if (role !== 'engineer' && role !== 'scientist') return permError();
    const patch = action.patch || {};
    const next = Object.assign({}, build.sel);

    if (role === 'engineer') {
      ['rocketId', 'reservationId', 'trajId', 'moduleBuild'].forEach(function (k) {
        if (patch[k] !== undefined) next[k] = patch[k];
      });
      if (patch.physical !== undefined) next.physical = patch.physical;
    } else {
      ['controlId', 'antennaId', 'antennaDup', 'powerId', 'bufferId', 'moduleBuild'].forEach(function (k) {
        if (patch[k] !== undefined) next[k] = patch[k];
      });
      if (patch.instruments !== undefined) next.instruments = patch.instruments;
    }

    if (next.rocketId && !validCard(next.rocketId, 'rockets')) return fail('Unknown launcher.');
    if (next.reservationId && !validCard(next.reservationId, 'reservations')) return fail('Unknown reservation unit.');
    if (next.controlId && !validCard(next.controlId, 'control')) return fail('Unknown FCS.');
    if (next.antennaId && !validCard(next.antennaId, 'antennas')) return fail('Unknown antenna.');
    if (next.powerId && !validCard(next.powerId, 'power')) return fail('Unknown power source.');
    if (next.bufferId && !validCard(next.bufferId, 'buffers')) return fail('Unknown buffer.');
    if (next.physical) {
      next.physical = next.physical.filter(function (id) {
        return CARDS.physical.some(function (c) { return c.id === id; });
      });
    }
    if (next.instruments) next.instruments = sanitizeInstruments(next.instruments);
    next.schoolLevel = APP.state.school || 0;

    if (patch.trajId !== undefined) {
      const mission = APP.mission(missionId);
      if (mission && (mission.trajectories || []).indexOf(patch.trajId) === -1) {
        return fail('This trajectory is not offered by the mission.');
      }
    }
    APP.snapshot();
    if (patch.trajId !== undefined) build.trajId = patch.trajId;
    build.sel = next;
    resetReady(build);
    return done('Build updated. The engineer and scientist confirmations are reset.', 'mid');
  }

  function confirmBuild(action) {
    const missionId = action.missionId || APP.selectedMissionId;
    const build = APP.ensureBuild(missionId);
    if (!build) return fail('The build was not found.');
    if (action.actor && action.actor !== APP.ui.role) return permError();
    if (APP.ui.role !== 'engineer' && APP.ui.role !== 'scientist') return permError();
    const role = APP.ui.role;
    const mission = APP.mission(missionId);
    APP.snapshot();
    if (role === 'engineer') {
      if (!build.sel.rocketId) return fail('The engineer has to pick a launcher.');
      build.ready.engineer = true;
      APP.say('engineer', 'Engineering part confirmed: launcher, redundancy, physical modules and trajectory.');
      APP.pushJournal('The engineer confirmed the build ' + (mission ? mission.name : missionId) + '.', 'engineer');
    } else {
      if (!(build.sel.instruments || []).length) return fail('The scientist has to install at least one instrument.');
      build.ready.scientist = true;
      APP.say('scientist', 'Scientific part confirmed: FCS, instruments, power, antenna and buffer.');
      APP.pushJournal('The scientist confirmed the build ' + (mission ? mission.name : missionId) + '.', 'scientist');
    }
    build.rev = (build.rev || 0) + 1;
    return done((role === 'engineer' ? 'The engineer' : 'The scientist') + ' confirmed the build.', 'ok');
  }

  function recommendBuild(action) {
    const missionId = action.missionId || APP.selectedMissionId;
    const mission = APP.mission(missionId);
    if (!mission) return fail('Mission not found.');
    const choice = E.campaignBuild(APP.state, mission);
    if (!choice) return fail('The fitter found no build within the budget. Assemble it manually.');
    const build = APP.ensureBuild(missionId);
    APP.snapshot();
    build.sel = JSON.parse(JSON.stringify(choice.sel));
    build.sel.schoolLevel = APP.state.school || 0;
    build.trajId = choice.trajectoryId;
    resetReady(build);
    return done('Recommended build applied: P ' + APP.pct(choice.compute.pSuccess) +
      ', S ' + APP.fmt(choice.compute.sDet, 1) + '. Role confirmations are needed.', 'mid');
  }

  function autoReply(text) {
    const lower = String(text).toLowerCase();
    const missionId = APP.selectedMissionId;
    if (!missionId) return 'The showcase is empty right now — close the step to get new missions.';
    const a = APP.buildAnalysis(missionId);
    if (!a.manual || !a.manual.ok) {
      return 'The build is not computed: ' + (a.blockers[0] ? a.blockers[0].text : 'check the data.');
    }
    const c = a.compute;
    if (/mass|launch|heavy/.test(lower)) {
      return 'Mass ' + APP.fmt(c.massKg / 1000, 2) + ' t against a limit of ' + APP.fmt(c.capacityKg / 1000, 2) +
        ' t. ' + (c.massOk ? 'It fits by mass; if you want margin, take a heavier class.' : 'You need a launcher with more payload capacity or fewer modules.');
    }
    if (/power|energy|panel|rtg/.test(lower)) {
      return 'Power: ' + APP.fmt(c.power.available, 0) + ' W available, ' +
        APP.fmt(c.power.required, 0) + ' W needed. ' + (c.power.ok ? 'There is margin.' : 'Install an RTG or more powerful panels.');
    }
    if (/data|channel|antenna/.test(lower)) {
      return 'Channel ' + APP.fmt(c.data.ratio * 100, 0) + '% of the data, P_channel ' + APP.pct(c.pChannel) +
        '. ' + (c.data.typeMatch ? 'The mission data type is covered.' : 'No instrument matches the mission data type — S ×0.5.');
    }
    if (/ready|accept|take/.test(lower)) {
      return 'Readiness: engineer — ' + (a.build.ready.engineer ? 'yes' : 'no') +
        ', scientist — ' + (a.build.ready.scientist ? 'yes' : 'no') +
        '. Blockers: ' + a.blockers.length + ', warnings: ' + a.warnings.length + '.';
    }
    return 'Summary: P ' + APP.pct(c.pSuccess) + ', S ' + APP.fmt(c.sDet, 1) + ' / ' + c.target +
      ', price ' + APP.num(c.price) + ' $, blockers ' + a.blockers.length + '.';
  }

  function chat(action) {
    const text = String(action.text || '').trim();
    if (!text) return { ok: false, noSave: true };
    APP.say(APP.ui.role, text);
    if (action.autoReply !== false) APP.say('consultant', autoReply(text));
    return { ok: true, message: '', noSave: false };
  }

  /* ---------- missions ---------- */
  function acceptMission(action) {
    if (APP.finished) return fail('The campaign is over.');
    const missionId = action.missionId || APP.selectedMissionId;
    const mission = APP.mission(missionId);
    if (!mission) return fail('Mission not found.');
    if ((APP.state.offers || []).indexOf(missionId) === -1) return fail('The mission is no longer in the showcase.');
    const build = APP.ensureBuild(missionId);
    if (!build.ready.engineer || !build.ready.scientist) {
      return fail('The build must be confirmed by the engineer and the scientist: ' +
        'engineer — ' + (build.ready.engineer ? 'yes' : 'no') +
        ', scientist — ' + (build.ready.scientist ? 'yes' : 'no') + '.');
    }
    const analysis = APP.buildAnalysis(missionId);
    if (!analysis.manual || !analysis.manual.ok) {
      return fail(analysis.blockers[0] ? analysis.blockers[0].text : 'The build is not computed.');
    }
    if (analysis.blockers.length) {
      return fail('Clear the blockers first: ' + analysis.blockers.map(function (b) { return b.text; }).join(' '));
    }
    if (analysis.warnings.length && !action.allowWarnings) {
      return { ok: false, needsConfirm: true, missionId: missionId, analysis: analysis, noSave: true };
    }
    APP.snapshot();
    const res = E.acceptMission(APP.state, missionId, analysis.manual.choice);
    if (!res.ok) {
      APP.undoStack.pop();
      return fail('Accept: ' + res.reason);
    }
    APP.state.tookMission = true;
    APP.pushJournal('Mission accepted ' + mission.name + ': advance ' + res.entry.advance + ' $, ' +
      res.entry.pmRate + ' PM/step, production ' + res.entry.prodTime + ' step(s).', 'manager');
    APP.say('manager', 'Mission “' + mission.name + '” accepted. Advance ' + res.entry.advance +
      ' $, ready at step ' + res.entry.readyStep + ', deadline ' + res.entry.deadlineStep + '.');
    APP.selectedMissionId = null;
    APP.ensureOfferBuilds();
    APP.ensureSelection();
    return done('Mission “' + mission.name + '” accepted. Advance ' + res.entry.advance +
      ' $, ready at step ' + res.entry.readyStep + '.', 'ok');
  }

  function launchMission(action) {
    if (APP.finished) return fail('The campaign is over.');
    const id = action.missionId;
    const ready = APP.state.ready || [];
    if (id && !ready.some(function (p) { return p.missionId === id; })) {
      return fail('This mission is not ready for launch yet.');
    }
    const ids = [];
    const waiting = [];
    ready.forEach(function (p) {
      if (id && p.missionId !== id) return;
      const gate = launchApprovalRequest(p, APP.ui.role);
      if (gate.required && !gate.ready) waiting.push(gate);
      else ids.push(p.missionId);
    });
    if (!ids.length && waiting.length) {
      const res = pendingApproval(waiting[0], waiting[0].request.title);
      res.message = 'The experimental launch awaits approval: ' + waiting.length +
        '. ' + res.message;
      return res;
    }
    APP.snapshot();
    const reports = [];
    const n = E.launchReady(APP.state, ids, function () { return APP.rnd.next(); }, false, reports);
    if (!n) {
      APP.undoStack.pop();
      return fail('No launch: there are no ready missions or the MCC channel limit is exhausted (' +
        E.mcsFor(APP.state).capacity + ').');
    }
    dropLaunchedApprovals(reports);
    pruneLaunchApprovals();
    APP.consumeReports(reports);
    const launched = reports.filter(function (r) { return r.result && r.result.key === 'inflight'; });
    const failed = reports.filter(function (r) { return r.result && r.result.key === 'fail'; });
    launched.forEach(function (r) {
      APP.say('ops', '“' + r.name + '” is off the ground. Flight ' + r.flight + ' step(s), acceptance ~step ' +
        r.flightEndStep + ', channel ' + r.load + '.');
    });
    failed.forEach(function (r) {
      APP.say('ops', '“' + r.name + '”: failure at stage ' + r.result.stage + '.');
    });
    APP.pushJournal('Launch: ' + n + ' mission(s) (' + launched.length + ' in flight, ' + failed.length + ' failures).', 'ops');
    return done('Launched: ' + n + '.' + (launched.length ? ' In flight: ' + launched.length + '.' : '') +
      (failed.length ? ' Failures: ' + failed.length + '.' : '') +
      (waiting.length ? ' Awaiting approval: ' + waiting.length + '.' : '') +
      (APP.state.ready.length ? ' Still ready: ' + APP.state.ready.length + '.' : ''), failed.length || waiting.length ? 'mid' : 'ok');
  }

  /* ---------- campaign step ---------- */
  function nextStep() {
    if (APP.finished) return fail('The campaign is over.');
    if (APP.state.step >= APP.state.maxSteps) return fail('This is the last step — wrap up the final score.');
    APP.snapshot();
    const s = APP.state;
    s.hadMissionLast = !!s.tookMission;
    const launchIds = [];
    (s.ready || []).forEach(function (p) {
      const gate = launchApprovalRequest(p, APP.ui.role);
      if (!gate.required || gate.ready) launchIds.push(p.missionId);
    });
    const reports = [];
    E.launchReady(s, launchIds, function () { return APP.rnd.next(); }, false, reports);
    dropLaunchedApprovals(reports);
    const ops = E.stepFlights(s, function () { return APP.rnd.next(); });
    const expenses = E.endStep(s, function () { return APP.rnd.next(); }, { skipExpire: false });
    E.advanceProduction(s);
    pruneLaunchApprovals();
    clearTestApprovals();
    APP.actionsLeft = s.hadMissionLast ? C.campaign.prepActions : C.campaign.skipPrepActions;
    APP.consumeReports(reports.concat(ops));
    const receptions = ops.filter(function (r) { return r.reception; });
    APP.pushJournal('Step ' + s.step + ': preparation actions ' + APP.actionsLeft + '; receptions ' +
      receptions.length + '.', 'system');
    APP.say('system', 'Step ' + s.step + ' has begun. Preparation actions: ' + APP.actionsLeft +
      '. Events: ' + (ops.length - receptions.length) + ', receptions: ' + receptions.length +
      '. Salary ' + (expenses.salary || 0) + ' $, MCC upkeep ' + (expenses.upkeep || 0) + ' $.');
    APP.ensureOfferBuilds();
    APP.ensureSelection();
    return done('Step ' + s.step + ': actions ' + APP.actionsLeft +
      (receptions.length ? ', receptions ' + receptions.length : '') +
      (ops.length - receptions.length ? ', events ' + (ops.length - receptions.length) : '') + '.', 'mid');
  }

  function finishCampaign(action) {
    if (APP.finished) return fail('The campaign is already over.');
    if (!action.force) {
      return { ok: false, needsConfirm: true, finish: true, noSave: true,
        message: 'Wrap up the final score? Unfinished missions will be closed.' };
    }
    APP.snapshot();
    const s = APP.state;
    s.hadMissionLast = !!s.tookMission;
    const reports = [];
    E.advanceProduction(s);
    const launchIds = [];
    (s.ready || []).forEach(function (p) {
      const gate = launchApprovalRequest(p, APP.ui.role);
      if (!gate.required || gate.ready) launchIds.push(p.missionId);
    });
    const waitingExp = (s.ready || []).length - launchIds.length;
    E.launchReady(s, launchIds, function () { return APP.rnd.next(); }, true, reports);
    dropLaunchedApprovals(reports);
    clearTestApprovals();
    clearLaunchApprovals();
    const ops = E.stepFlights(s, function () { return APP.rnd.next(); });
    const last = E.finalizeFlights(s, function () { return APP.rnd.next(); });
    E.failRemaining(s, 'end of the campaign');
    s.score = E.finalScore(s);
    APP.finished = true;
    APP.consumeReports(reports.concat(ops).concat(last || []));
    if (waitingExp) {
      APP.pushJournal('Final: ' + waitingExp + ' experimental mission(s) closed without approval.', 'system');
    }
    APP.pushJournal('Campaign finished: ' + APP.fmt(s.score.total, 1) + ' points.', 'system');
    APP.say('system', 'The campaign is over. Total: ' + APP.fmt(s.score.total, 1) +
      ' points; missions ' + s.stats.missions + ', successes ' + s.stats.success + '.');
    return done('Campaign finished: ' + APP.fmt(s.score.total, 1) + ' points.', 'ok');
  }

  /* ---------- preparation ---------- */
  function prepAction(action) {
    if (APP.finished) return fail('The campaign is over.');
    if (APP.actionsLeft <= 0) return fail('The preparation actions for this step are used up.');
    const s = APP.state;
    const rnd = function () { return APP.rnd.next(); };
    let label = '';
    let run = null;
    let approvalGate = null;

    switch (action.type) {
      case 'prep-hire':
        label = 'Hire a manager'; run = function () { return E.hireManager(s); }; break;
      case 'prep-mcs':
        label = 'MCC upgrade'; run = function () { return E.mcsUpgrade(s); }; break;
      case 'prep-pr':
        label = 'PR'; run = function () { return E.prAction(s); }; break;
      case 'prep-factory':
        label = 'Factory'; run = function () { return E.upgradeFactory(s); }; break;
      case 'prep-school':
        label = 'Science school'; run = function () { return E.upgradeSchool(s); }; break;
      case 'test-rocket': {
        label = 'Launcher flight test';
        const opts = testRunOptions('flightRocket', action);
        approvalGate = { kind: 'flightRocket', opts: opts };
        run = function () { return E.testLaunch(s, 'flightRocket', opts, rnd); };
        break;
      }
      case 'test-stand': {
        label = 'Instrument test stand';
        const opts = testRunOptions('stand', action);
        approvalGate = { kind: 'stand', opts: opts };
        run = function () { return E.testLaunch(s, 'stand', opts, rnd); };
        break;
      }
      case 'test-instrument': {
        label = 'Instrument flight test';
        const opts = testRunOptions('flightInstrument', action);
        approvalGate = { kind: 'flightInstrument', opts: opts };
        run = function () { return E.testLaunch(s, 'flightInstrument', opts, rnd); };
        break;
      }
      case 'tech-rocket':
        label = 'Launcher R&D';
        run = function () { return E.upgradeTech(s, 'rocket', action.cls); };
        break;
      case 'tech-instrument':
        label = 'Instrument R&D';
        run = function () { return E.upgradeTech(s, 'instrument', action.cls); };
        break;
      case 'ground':
        label = 'Ground contract';
        run = function () { return E.groundContract(s, action.cardId, { ipKind: 'instrument', ipClass: action.cls || 'camera' }); };
        break;
      case 'standardize': {
        const card = E.card(action.cardId);
        if (!card) return fail('Card not found.');
        const needed = card.kind === 'rocket' ? 'engineer' : 'scientist';
        if (APP.ui.role !== needed) return fail('This card is standardised by the ' + (needed === 'engineer' ? 'engineer' : 'scientist') + '.');
        label = 'Standardisation';
        run = function () { return E.standardize(s, action.cardId); };
        break;
      }
      default:
        return fail('Unknown preparation action.');
    }

    let gate = null;
    if (approvalGate) {
      if (s.testUsed) return fail('A test has already happened this step.');
      gate = testApprovalRequest(approvalGate.kind, approvalGate.opts);
      if (gate.required && !gate.ready) {
        return pendingApproval(gate, 'test “' + label + '”');
      }
    }

    APP.snapshot();
    const res = run();
    if (!res || !res.ok) {
      APP.undoStack.pop();
      return fail(label + ': ' + ((res && res.reason) || 'unavailable'));
    }
    if (gate && gate.required) dropApproval('test', gate.key);
    APP.actionsLeft = Math.max(0, APP.actionsLeft - 1);
    const extra = res.success === false ? 'failure' : (res.success === true ? 'success' : 'done');
    APP.pushJournal('Step ' + s.step + ': ' + label + ' — ' + extra +
      (res.ip ? ' (+' + res.ip + ' IP)' : '') + '.', APP.ui.role);
    return done(label + ': ' + extra +
      (res.ip ? ', +' + res.ip + ' IP' : '') +
      (res.refund ? ', refund ' + res.refund + ' $' : ''), res.success === false ? 'mid' : 'ok');
  }

  function overtimeFlight(action) {
    APP.snapshot();
    const res = E.overtime(APP.state, action.missionId);
    if (!res.ok) {
      APP.undoStack.pop();
      return fail('Overtime: ' + res.reason);
    }
    APP.pushJournal('Acceptance of “' + res.flight.name + '” extended to step ' + res.flight.endStep +
      ' (−' + res.cost + ' $).', 'ops');
    return done('Acceptance extended: ' + res.overtime + ' / ' + C.campaign.ops.overtime.max +
      ' (−' + res.cost + ' $).', 'mid');
  }

  function closeFlight(action) {
    APP.snapshot();
    const res = E.closeEarly(APP.state, action.missionId, function () { return APP.rnd.next(); });
    if (!res.ok) {
      APP.undoStack.pop();
      return fail('Early acceptance: ' + res.reason);
    }
    APP.consumeReports([res.report]);
    const key = res.report && res.report.result ? res.report.result.key : 'done';
    APP.pushJournal('Early acceptance: ' + key + '.', 'ops');
    return done('Early acceptance: ' + key + '.', 'mid');
  }

  /* ---------- selector and panels ---------- */
  function selectMission(action) {
    const id = action.missionId;
    if (!APP.mission(id)) return fail('Mission not found.');
    APP.selectedMissionId = id;
    APP.ensureBuild(id);
    return { ok: true, noSave: false };
  }

  function setRole(action) {
    if (['manager', 'engineer', 'scientist', 'ops'].indexOf(action.role) === -1) return fail('Unknown role.');
    APP.ui.role = action.role;
    return { ok: true, noSave: false };
  }

  function togglePanel(action) {
    const panel = action.panel;
    if (panel === 'chat') APP.ui.chatOpen = !APP.ui.chatOpen;
    else if (panel === 'consultant') APP.ui.consultantOpen = !APP.ui.consultantOpen;
    else return fail('Unknown panel.');
    return { ok: true, noSave: true };
  }

  APP.dispatch = function (type, payload) {
    if (!APP.permitted(type)) return APP.afterChange(permError());
    const action = Object.assign({ type: type }, payload || {});
    let res = null;
    switch (type) {
      case 'new-campaign':
        if (APP.state && !action.force) {
          return { ok: false, needsConfirm: true, newCampaign: true, noSave: true,
            message: 'Start a new campaign? The current progress will be replaced.' };
        }
        APP.newCampaign(action.seed, action.maxSteps);
        res = done('Campaign ' + APP.seed + ' started.', 'ok');
        break;
      case 'select-mission': res = selectMission(action); break;
      case 'set-role': res = setRole(action); break;
      case 'toggle-panel': res = togglePanel(action); break;
      case 'patch-engineer':
      case 'patch-scientist':
        action.actor = type === 'patch-engineer' ? 'engineer' : 'scientist';
        res = patchBuild(action); break;
      case 'confirm-engineer':
      case 'confirm-scientist':
        action.actor = type === 'confirm-engineer' ? 'engineer' : 'scientist';
        res = confirmBuild(action); break;
      case 'recommend': res = recommendBuild(action); break;
      case 'accept': res = acceptMission(action); break;
      case 'launch': res = launchMission(action); break;
      case 'launch-all': res = launchMission({ missionId: null }); break;
      case 'approve-exp': res = APP.signExpApproval(action); break;
      case 'next-step': res = nextStep(); break;
      case 'finish': res = finishCampaign(action); break;
      case 'prep-hire':
      case 'prep-mcs':
      case 'prep-pr':
      case 'prep-factory':
      case 'prep-school':
      case 'test-rocket':
      case 'test-stand':
      case 'test-instrument':
      case 'tech-rocket':
      case 'tech-instrument':
      case 'ground':
      case 'standardize':
        res = prepAction(action); break;
      case 'overtime': res = overtimeFlight(action); break;
      case 'close-flight': res = closeFlight(action); break;
      case 'chat': res = chat(action); break;
      case 'save':
        APP.save(); res = done('Saved in the browser.', 'ok'); break;
      case 'export': res = APP.exportFile(); break;
      case 'import': res = APP.importJSON(action.text); break;
      case 'undo':
        res = APP.undo();
        if (res.ok) { APP.ensureOfferBuilds(); APP.ensureSelection(); }
        break;
      default: res = fail('Unknown action: ' + type);
    }
    if (!res) res = fail('The action was not performed.');
    if (res.needsConfirm) return res;
    return APP.afterChange(res);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
