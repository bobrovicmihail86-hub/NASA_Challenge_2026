/* Space Mission Design — the calculation engine (v1.3, variant B)
* The same code is used by the calculator (calc/index.html) and the checks (tools/check.mjs).
* The formulas are the ones documented in docs/RULES_V15.md §1–§13.
 */
(function (root) {
  const C = root.CONFIG;
  const CARDS = root.CARDS;
  const IDX = root.CARDS_BY_ID;
  const E = {};

  E.round = function (x, d) { const m = Math.pow(10, d == null ? 3 : d); return Math.round(x * m) / m; };
  E.card = function (id) { return IDX[id] || null; };
  E.pDouble = function (p) { return 1 - Math.pow(1 - p, 2); };
  E.clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };

  /* ---------- v1.4: MCC, R&D and the campaign ---------- */
  E.techClassOf = function (card) {
    if (!card) return null;
    /* exp/std cards always lean on a base class, so their R&D
    * levels up with the ordinary launchers/instruments rather than as a separate branch.
     */
    if (card.baseClass) return card.baseClass;
    if (card.kind === 'rocket') return card.cls || 'light';
    if (card.kind === 'instrument') return card.techClass || 'camera';
    if (card.kind === 'facility') return card.obj;
    return card.techClass || null;
  };

  /* The tech-class bonus. kind: 'rocket' | 'instrument'. */
  E.techMods = function (kind, level) {
    const T = C.tech;
    const lvl = E.clamp(Math.round(level == null ? T.baseLevel : level), T.baseLevel, T.maxLevel);
    const p = Math.min(T.pCap, T.pPerLevel * Math.max(0, lvl - 1));
    return {
      level: lvl,
      p: p,
      valueFactor: kind === 'instrument' && lvl >= 4 ? 1.10 : 1.0,
      cycleReduction: kind === 'rocket' && lvl >= 4 ? 1 : 0
    };
  };

  E.techLevel = function (state, kind, cls) {
    const tree = state && state.tech ? state.tech[kind] : null;
    return (tree && tree[cls] != null) ? tree[cls] : C.tech.baseLevel;
  };

  E.ipFor = function (state, kind, cls) {
    const tree = state && state.ip ? state.ip[kind] : null;
    return (tree && tree[cls] != null) ? tree[cls] : 0;
  };

  /* ---------- Experimental cards: risk and the generation ladder ----------
  * exp1 → std1 → exp2 → std2. An experimental card takes −10 pp on p;
  * every launch/flight test/stand run removes 1/3 of the penalty (3 runs to zero).
  * standardP[expId] fixes p at the moment of standardisation, so the residual
  * risk carries over into the std card and is not cleared automatically.
   */
  E.isExpCard = function (card) { return !!(card && card.experimental); };

  E.expRiskPenalty = function (state, cardOrId) {
    const card = typeof cardOrId === 'string' ? E.card(cardOrId) : cardOrId;
    if (!state || !E.isExpCard(card)) return 0;
    const T = C.tech.experimental || {};
    const max = T.riskRuns || 3;
    const runs = state.expRuns ? (state.expRuns[card.id] || 0) : 0;
    return -(T.riskPenalty == null ? 0.10 : T.riskPenalty) * (1 - Math.min(max, Math.max(0, runs)) / max);
  };

  E.expRiskInfo = function (state, cardOrId) {
    const card = typeof cardOrId === 'string' ? E.card(cardOrId) : cardOrId;
    const T = C.tech.experimental || {};
    const max = T.riskRuns || 3;
    const runs = state && state.expRuns && card ? (state.expRuns[card.id] || 0) : 0;
    return {
      experimental: E.isExpCard(card),
      runs: Math.min(max, runs),
      max: max,
      remaining: Math.max(0, max - runs),
      penalty: E.expRiskPenalty(state, card),
      penaltyPct: -E.expRiskPenalty(state, card) * 100
    };
  };

  E.addExpRun = function (state, cardOrId, source) {
    const card = typeof cardOrId === 'string' ? E.card(cardOrId) : cardOrId;
    if (!state || !E.isExpCard(card)) return null;
    const T = C.tech.experimental || {};
    const max = T.riskRuns || 3;
    if (!state.expRuns) state.expRuns = {};
    const before = state.expRuns[card.id] || 0;
    if (before < max) {
      state.expRuns[card.id] = before + 1;
      state.stats.expRuns = (state.stats.expRuns || 0) + 1;
    }
    const info = E.expRiskInfo(state, card);
    info.cardId = card.id;
    info.before = before;
    info.source = source || null;
    return info;
  };

  E.addExpRunsForBuild = function (state, build, source) {
    if (!state || !build) return [];
    const b = build.build || build;
    const seen = {};
    const out = [];
    E.devExpCards(b).forEach(function (id) {
      if (seen[id]) return;
      seen[id] = true;
      const info = E.addExpRun(state, id, source);
      if (info) out.push(info);
    });
    return out;
  };

  /* The base p of a card without R&D/school/risk: for a std card — the fixed p,
  * for exp2 — the p of the previous std card, for exp1 — the printed one.
   */
  E.cardBaseP = function (state, card) {
    if (!card) return 0;
    if (card.standard) {
      const fixed = state && state.standardP ? state.standardP[card.sourceId] : null;
      return fixed == null ? (card.p == null ? 0 : card.p) : fixed;
    }
    if (card.experimental && card.generation > 1 && card.sourceId) {
      return E.cardBaseP(state, E.card(card.sourceId));
    }
    return card.p == null ? 0 : card.p;
  };

  E.effectiveCardP = function (state, card) {
    if (!card) return 0;
    return E.clamp(E.cardBaseP(state, card) + E.expRiskPenalty(state, card), 0.02, 0.995);
  };

  /* The final p of a card with the class R&D and (for instruments) the science school. */
  E.cardPFor = function (state, card, opts) {
    opts = opts || {};
    if (!card) return 0;
    const kind = opts.kind || (card.kind === 'rocket' ? 'rocket' : 'instrument');
    const techState = opts.tech || (state && state.tech) || null;
    const cls = E.techClassOf(card);
    const lvl = techState
      ? ((techState[kind] || {})[cls] == null ? C.tech.baseLevel : (techState[kind] || {})[cls])
      : C.tech.baseLevel;
    const mods = E.techMods(kind, lvl);
    const school = opts.schoolLevel == null
      ? (kind === 'instrument' ? E.schoolMods(state ? state.school : 0).reliability : 0)
      : (kind === 'instrument' ? E.schoolMods(opts.schoolLevel).reliability : 0);
    return E.clamp(E.effectiveCardP(state, card) + mods.p + school, 0.02, 0.995);
  };

  E.isCardAvailable = function (state, card) {
    if (!card) return false;
    if (card.standard) return !!(state && state.standardized && state.standardized[card.sourceId]);
    if (!card.experimental) return true;
    if ((card.generation || 1) <= 1) return true;
    if (state && state.expUnlocked && state.expUnlocked[card.id]) return true;
    return !!(state && state.standardized && card.unlockAfter && state.standardized[card.unlockAfter]);
  };

  E.cardPool = function (state, kind) {
    if (kind === 'rocket') {
      return CARDS.rockets.concat(
        (CARDS.standardRockets || []).concat(CARDS.experimentalRockets || [])
          .filter(function (c) { return E.isCardAvailable(state, c); }));
    }
    return CARDS.instruments.concat(
      (CARDS.standardInstruments || []).concat(CARDS.experimentalInstruments || [])
        .filter(function (c) { return E.isCardAvailable(state, c); }));
  };
  E.rocketPool = function (state) { return E.cardPool(state, 'rocket'); };
  E.instrumentPool = function (state) { return E.cardPool(state, 'instrument'); };

  E.techUpgradeCost = function (targetLevel) {
    const u = C.tech.upgradeCost;
    return { money: u.money * targetLevel, np: u.np * targetLevel, pm: u.pm * targetLevel };
  };

  E.mcsMods = function (level, managers) {
    const M = C.mcs;
    const nominal = E.clamp(Math.round(level || 0), 0, M.maxLevel);
    const req = M.managersRequired[nominal] || 0;
    const deficit = Math.max(0, req - (managers == null ? 0 : managers));
    const eff = Math.max(0, nominal - Math.ceil(deficit / 2));
    return {
      level: nominal,
      levelEff: eff,
      capacity: M.capacity[eff],
      pChannel: M.pChannel[eff],
      sFactor: M.sFactor[eff],
      vchk: M.vchkPerSuccess[eff],
      deepChRel: M.deepChannel[eff],
      upkeep: M.upkeep[nominal] || 0,
      managersRequired: req,
      managerDeficit: deficit
    };
  };

  E.effectiveMcsLevel = function (state) {
    if (!state) return 0;
    return Math.max(0, (state.mcsLevel || 0) - (state.mcsPenalty || 0));
  };

  E.mcsFor = function (state) {
    return E.mcsMods(E.effectiveMcsLevel(state), state ? state.managers : 0);
  };

  E.factoryPm = function (state) {
    const level = state && state.factory != null ? state.factory : C.campaign.startFactory;
    return (C.facilities.factory.stages[level] || C.facilities.factory.stages[0]).pm;
  };

  /* ---------- Science school (§18): instrument p, PM, standardisation, slots ---------- */
  E.schoolMods = function (level) {
    const stages = C.facilities.school.stages;
    const lvl = E.clamp(Math.round(level || 0), 0, stages.length - 1);
    const st = stages[lvl] || stages[0];
    return {
      level: lvl,
      name: st.name,
      reliability: st.reliability || 0,
      pmFactor: st.pmFactor == null ? 1 : st.pmFactor,
      standardize: !!st.standardize,
      standardizeDiscount: st.standardizeDiscount || 0,
      slotsBonus: st.slotsBonus || 0,
      overloadRelief: E.opsIncidentRelief(lvl)
    };
  };

  E.schoolFor = function (state) {
    return E.schoolMods(state && state.school != null ? state.school : C.campaign.startSchool);
  };

  E.schoolUpgradeCost = function (targetLevel) {
    const list = C.campaign.schoolUpgrades || [];
    return list.find(function (u) { return u.level === targetLevel; }) || null;
  };

  E.pmLimit = function (state) {
    return C.start.pm + E.factoryPm(state);
  };

  E.activePm = function (state) {
    if (!state) return 0;
    let sum = 0;
    const all = (state.production || []).concat(state.ready || []);
    all.forEach(function (p) {
      if (p.pmEndStep != null && state.step > p.pmEndStep) return;
      sum += p.pmRate || 0;
    });
    return sum;
  };

  E.pmAvailable = function (state) {
    if (!state) return 0;
    return Math.max(0, E.pmLimit(state) - E.activePm(state) - (state.pmPrepUsed || 0));
  };

  E.salaryDue = function (state) {
    let sum = 0;
    const staff = (state && state.staff) || C.campaign.staff;
    Object.keys(staff).forEach(function (lvl) { sum += (C.salaries[lvl] || 0) * staff[lvl]; });
    return sum;
  };

  E.canPay = function (state, cost) {
    const fund = Math.min(state.groundFund || 0, cost || 0);
    return (state.groundFund || 0) + (state.money || 0) >= (cost || 0);
  };

  E.pay = function (state, cost) {
    cost = Math.max(0, cost || 0);
    const fromFund = Math.min(state.groundFund || 0, cost);
    state.groundFund = (state.groundFund || 0) - fromFund;
    const rest = cost - fromFund;
    state.money -= rest;
    return { fund: fromFund, cash: rest };
  };

  /* Role points by the actual outcome (§10), not by the planned verdict. */
  E.rolesFor = function (key, stage) {
    const r = { eng: 0, sci: 0, man: 0 };
    if (key === 'full' || key === 'success') { r.eng = 2; r.sci = 2; r.man = 2; }
    else if (key === 'partial') { r.eng = 1; r.sci = 1; r.man = 1; }
    else if (key === 'fail') {
      if (stage === 'launch') { r.eng = -2; r.man = -1; }
      else { r.eng = 1; r.sci = -1; }
    }
    return r;
  };

  /* An experimental build: reliability/science cards with the _exp suffix.
  * pwr_exp — a cheap power source the policy picks automatically on distant
  * missions; powerExpRate counts it separately so that O1 is not inflated.
   */
  E.expCards = function (b) {
    if (!b) return [];
    if (b.build) b = b.build;
    const out = [];
    const add = function (c) {
      if (c && (c.experimental || /_exp$/.test(c.id))) out.push(c.id);
    };
    [b.rocket, b.res, b.control, b.antenna].forEach(add);
    b.instruments.forEach(function (o) { add(o.card); });
    return out;
  };
  /* Only the cards of the experimental ladder (launcher/instrument): they get the
  * launch risk and take part in standardisation. Experimental subsystems
  * (reservation/FCS/antenna) remain a separate decision, O1.
   */
  E.devExpCards = function (b) {
    if (!b) return [];
    if (b.build) b = b.build;
    const out = [];
    if (b.rocket && E.isExpCard(b.rocket)) out.push(b.rocket.id);
    b.instruments.forEach(function (o) { if (o.card && E.isExpCard(o.card)) out.push(o.card.id); });
    return out;
  };
  E.isExperimental = function (b) {
    if (b && b.build) b = b.build;
    return !!b && E.devExpCards(b).length > 0;
  };

  /* ---------- Build: resolving the selected cards ---------- */
  E.resolveBuild = function (sel, schoolLevel) {
    sel = sel || {};
    const instruments = (sel.instruments || [])
      .map(function (o) { return { card: E.card(o.id), count: Math.max(0, Math.round(o.count || 0)) }; })
      .filter(function (o) { return o.card && o.count > 0; });
    const physical = (sel.physical || []).map(E.card).filter(Boolean);
    return {
      rocket: E.card(sel.rocketId) || CARDS.rockets[0],
      res: E.card(sel.reservationId) || CARDS.reservations[0],
      control: E.card(sel.controlId) || CARDS.control[0],
      antenna: E.card(sel.antennaId) || CARDS.antennas[0],
      antennaDup: sel.antennaDup ? E.card('ant_dup') : null,
      power: E.card(sel.powerId) || CARDS.power[0],
      buffer: sel.bufferId ? E.card(sel.bufferId) : null,
      instruments: instruments,
      physical: physical,
      moduleBuild: !!sel.moduleBuild,
      schoolLevel: schoolLevel == null ? (sel.schoolLevel || 0) : schoolLevel
    };
  };

  /* ---------- Payload mass (kg) ---------- */
  E.massKg = function (b) {
    let m = b.control.mass + b.power.mass + (b.buffer ? b.buffer.mass : 0);
    m += b.antenna.mass * (b.antennaDup ? b.antennaDup.massFactor : 1);
    b.instruments.forEach(function (o) { m += o.card.mass * o.count; });
    b.physical.forEach(function (p) { m += p.mass; });
    return m * C.mass.serviceFactor + C.mass.adapterKg;
  };

  /* ---------- Price ---------- */
  E.price = function (b) {
    let p = b.rocket.price * b.res.priceFactor + b.control.price + b.power.price;
    if (b.buffer) p += b.buffer.price;
    p += b.antenna.price * (b.antennaDup ? b.antennaDup.priceFactor : 1);
    b.instruments.forEach(function (o) { p += o.card.price * o.count; });
    b.physical.forEach(function (x) { p += x.price; });
    return Math.round(p);
  };
  E.np = function (b) {
    let n = b.control.np + b.power.np + b.antenna.np;
    b.instruments.forEach(function (o) { n += o.card.np * o.count; });
    b.physical.forEach(function (x) { n += x.np || 0; });
    return Math.round(n);
  };
  /* ---------- Workload: the school discount on preparation (§18) ---------- */
  E.pm = function (b) {
    let n = b.rocket.pm + b.control.pm;
    b.instruments.forEach(function (o) { n += o.card.pm * o.count; });
    b.physical.forEach(function (x) { n += x.pm || 0; });
    const factor = E.schoolMods(b.schoolLevel || 0).pmFactor;
    return Math.round(n * factor);
  };

  /* ---------- Power (W) ---------- */
  E.power = function (b, pointKey) {
    const pt = C.points[pointKey] || C.points.leo;
    const factor = b.power.source === 'reactor' ? 1.0 : pt.solar;
    const sourceW = b.power.watts * factor;
    const available = Math.min(b.rocket.busPower, sourceW);
    let need = C.power.overheadW + b.control.watts + b.antenna.watts;
    b.instruments.forEach(function (o) { need += o.card.watts * o.count; });
    return {
      factor: factor, sourceW: sourceW, available: available, need: need,
      required: need * C.power.margin, ok: available >= need * C.power.margin
    };
  };

  /* ---------- Channel and data ---------- */
  E.channel = function (b, pointKey, traj, opts) {
    const pt = C.points[pointKey] || C.points.leo;
    const t = traj || C.trajectories.direct;
    const mcs = (opts && opts.mcs) || { pChannel: 0, deepChRel: 0 };
    let pAnt = b.antenna.p;
    if (b.antennaDup) pAnt = E.pDouble(pAnt);
    const bandwidth = Math.min(b.antenna.bw, b.rocket.busChannel) * pt.channel;
    const deep = pointKey === 'deep' || pointKey === 'mars' || pointKey === 'belt';
    const chRel = E.clamp(pt.chRel + (deep ? (mcs.deepChRel || 0) : 0), 0.01, 1.0);
    const pChannel = E.clamp(pAnt * chRel * (t.channelFactor || 1) + (mcs.pChannel || 0), 0.01, 0.995);
    return { bandwidth: bandwidth, pChannel: pChannel, antennaP: pAnt, chRel: chRel };
  };

  E.data = function (b, mission, pointKey, traj, channel) {
    const pt = C.points[pointKey] || C.points.leo;
    let dGen = 0;
    const types = {};
    b.instruments.forEach(function (o) {
      const dt = C.dataTypes[o.card.dataType];
      dGen += o.card.bw * o.count * mission.observeTime * dt.coeff;
      types[o.card.dataType] = (types[o.card.dataType] || 0) + o.count;
    });
    const eff = b.buffer ? C.buffer.efficiencyWith : C.buffer.efficiencyWithout;
    const window = (traj && traj.window != null) ? traj.window : 1.0;
    const dTx = channel.bandwidth * window * mission.missionTime * eff;
    const ratio = dGen > 0 ? Math.min(1, dTx / dGen) : 1;
    return { dGen: dGen, dTx: dTx, ratio: ratio, typeMatch: !!types[mission.dataType], window: window, eff: eff };
  };

  /* ---------- Trajectory availability (§4) ---------- */
  E.trajectoriesFor = function (sel, mission, opts) {
    opts = opts || {};
    const b = E.resolveBuild(sel, opts.schoolLevel);
    const massKg = E.massKg(b);
    const pmCost = E.pm(b);
    const rocketTech = opts.tech
      ? E.techMods('rocket', (opts.tech.rocket || {})[E.techClassOf(b.rocket)] || C.tech.baseLevel)
      : E.techMods('rocket', C.tech.baseLevel);
    const cycles = Math.max(1, b.rocket.cycles - rocketTech.cycleReduction);
    const pmStep = opts.pmPerStep == null ? C.start.pm : opts.pmPerStep;
    const pmOverhead = opts.pmOverhead == null ? 0 : opts.pmOverhead;
    const have = {};
    b.physical.forEach(function (p) { have[p.key] = true; });
    return (mission.trajectories || ['direct']).map(function (tid) {
      const t = C.trajectories[tid] || C.trajectories.direct;
      const pt = C.points[mission.point] || C.points.leo;
      const k = pt.k * (t.kMult || 1);
      const capacityKg = (b.rocket.payload * 1000) / k;
      const deadline = mission.deadline + (t.deadlineDelta || 0);
      const missing = (t.requires || []).filter(function (r) { return !have[r]; });
      const spread = Math.max(cycles, Math.ceil(deadline * (C.campaign.pmSpread || 0)));
      const pmRate = Math.ceil((pmCost + pmOverhead) / Math.max(1, spread));
      return {
        id: tid, name: t.name, k: k, kMult: t.kMult, window: t.window,
        deadline: deadline, capacityKg: capacityKg, massOk: massKg <= capacityKg,
        cycles: cycles, pmRate: pmRate,
        cyclesOk: cycles <= deadline,
        pmOk: pmCost <= pmStep * deadline,
        missing: missing, requires: t.requires || [],
        available: missing.length === 0 && massKg <= capacityKg && cycles <= deadline && pmCost <= pmStep * deadline
      };
    });
  };

  /* ---------- The full build calculation ---------- */
  E.compute = function (sel, mission, trajId, opts) {
    opts = opts || {};
    const b = E.resolveBuild(sel, opts.schoolLevel);
    const schoolMods = E.schoolMods(b.schoolLevel || 0);
    let trajKey = C.trajectories[trajId] ? trajId : null;
    if (!trajKey) {
      trajKey = (mission.trajectories || ['direct']).find(function (t) { return !!C.trajectories[t]; }) || 'direct';
    }
    const traj = C.trajectories[trajKey] || C.trajectories.direct;
    const pointKey = mission.point;
    const pt = C.points[pointKey] || C.points.leo;
    const k = pt.k * (traj.kMult || 1);

    const mcs = E.mcsMods(opts.mcsLevel == null ? 0 : opts.mcsLevel, opts.managers == null ? 0 : opts.managers);
    const state = opts.state || null;
    const techState = opts.tech || (state && state.tech) || null;
    const rocketCls = E.techClassOf(b.rocket);
    const rocketTech = E.techMods('rocket',
      techState ? ((techState.rocket || {})[rocketCls] || C.tech.baseLevel) : C.tech.baseLevel);
    const cycles = Math.max(1, b.rocket.cycles - rocketTech.cycleReduction);

    const massKg = E.massKg(b);
    const capacityKg = (b.rocket.payload * 1000) / k;
    const massOk = massKg <= capacityKg;

    const power = E.power(b, pointKey);
    const channel = E.channel(b, pointKey, traj, { mcs: mcs });
    const data = E.data(b, mission, pointKey, traj, channel);

    /* --- reliability --- */
    let pLaunch = E.cardPFor(state, b.rocket, { kind: 'rocket', tech: techState });
    if (b.res.t === 'double') pLaunch = E.pDouble(pLaunch);
    if (b.res.t === 'plus') pLaunch = Math.min(0.99, pLaunch + 0.05);
    pLaunch = E.clamp(pLaunch + (traj.pBonus || 0), 0.02, 0.995);

    const ps = [];
    b.instruments.forEach(function (o) {
      const pIns = E.cardPFor(state, o.card, {
        kind: 'instrument', tech: techState, schoolLevel: b.schoolLevel || 0
      });
      for (let i = 0; i < o.count; i++) ps.push(pIns);
    });
    let pCollect = 0;
    if (ps.length) {
      if (b.moduleBuild) pCollect = Math.min.apply(null, ps) * Math.pow(0.95, ps.length - 1);
      else pCollect = ps.reduce(function (a, v) { return a * v; }, 1);
      if (b.control.dup === 'double') pCollect = E.pDouble(pCollect);
      if (b.control.dup === 'exp') pCollect = Math.min(0.99, pCollect + 0.05);
    }
    pCollect = E.clamp(pCollect, 0, 0.995);

    const pSuccess = E.clamp(pLaunch * pCollect * channel.pChannel, 0, 0.995);

    /* --- scientific result --- */
    let sRaw = 0;
    b.instruments.forEach(function (o) {
      const insTech = E.techMods('instrument',
        techState ? ((techState.instrument || {})[E.techClassOf(o.card)] || C.tech.baseLevel) : C.tech.baseLevel);
      sRaw += o.card.value * o.count * insTech.valueFactor;
    });
    const missingMission = (mission.requires || []).filter(function (r) {
      return !b.physical.some(function (p) { return p.key === r; });
    });
    b.physical.forEach(function (p) {
      if ((mission.requires || []).indexOf(p.key) === -1) return;
      const bonus = p.bonusS || 0;
      sRaw = (bonus > 0 && bonus < 1) ? sRaw * (1 + bonus) : sRaw + bonus;
    });
    if (!data.typeMatch && sRaw > 0) sRaw *= 0.5;
    if (missingMission.length) sRaw *= Math.pow(0.5, missingMission.length);
    const unique = opts.unique == null ? 1.0 : opts.unique;
    sRaw *= unique * mcs.sFactor;
    const sDet = sRaw * data.ratio;      // S on a completed success (the deterministic part)
    const s = sDet * pSuccess;           // S per §9 — already weighted by P_success

    /* --- checks --- */
    const totalSlots = b.instruments.reduce(function (a, o) { return a + o.count; }, 0);
    const slotsTotal = b.control.slots + schoolMods.slotsBonus;
    const slotsOk = totalSlots <= slotsTotal;
    const deadline = mission.deadline + (traj.deadlineDelta || 0);
    const cyclesOk = cycles <= deadline;
    const pmCost = E.pm(b);
    const pmOk = pmCost <= C.start.pm * deadline;
    const price = E.price(b);
    const moneyOk = price <= (opts.money == null ? Infinity : opts.money);
    const reqOk = (traj.requires || []).every(function (r) {
      return b.physical.some(function (p) { return p.key === r; });
    });
    const feasible = massOk && power.ok && slotsOk && cyclesOk && pmOk && reqOk && moneyOk;

    /* --- verdict §9 plus the v1.3 correction ---
    * D_ratio < 0.5 forbids a full success only; success and partial success stay
    * possible (the soft model of §7).
     */
    const target = mission.targetValue;
    const S = C.success;
    let verdict, verdictKey;
    if (!feasible) { verdict = 'impossible'; verdictKey = 'infeasible'; }
    else if (pSuccess < S.pMin) { verdict = 'failure (P < 0.5)'; verdictKey = 'fail'; }
    else if (sDet >= target && data.ratio >= S.minDataRatioForFull) { verdict = 'full success + bonus'; verdictKey = 'full'; }
    else if (sDet >= target * S.sMinFactor) { verdict = 'success'; verdictKey = 'success'; }
    else if (sDet >= target * S.partialFactor) { verdict = 'partial success'; verdictKey = 'partial'; }
    else { verdict = 'failure (S < 0.3·target)'; verdictKey = 'fail'; }

    /* --- points --- */
    const sc = C.score;
    let dRating, dVchk;
    if (verdictKey === 'full') { dRating = sc.ratingPerS * s * (1 + S.bonus); dVchk = sc.vchkPerS * s; }
    else if (verdictKey === 'success') { dRating = sc.ratingPerS * s; dVchk = sc.vchkPerS * s; }
    else if (verdictKey === 'partial') { dRating = sc.partialRatingFactor * sc.ratingPerS * s; dVchk = sc.partialVCHKFactor * sc.vchkPerS * s; }
    else { dRating = sc.failRating; dVchk = sc.failVCHK; }

    const roles = E.rolesFor(verdictKey, verdictKey === 'fail' && pLaunch < S.pMin ? 'launch' : 'collect');

    const contract = E.contract(mission);
    const advance = contract.advance;
    const bonus = contract.bonus * (verdictKey === 'full' || verdictKey === 'success' ? 1
      : verdictKey === 'partial' ? contract.partialBonus : 0);

    return {
      build: b, mission: mission, trajectory: traj, trajectoryId: trajKey,
      point: pointKey, pointName: pt.name, k: k, capacityKg: capacityKg, massKg: massKg,
      massOk: massOk, power: power, channel: channel, data: data,
      pLaunch: pLaunch, pCollect: pCollect, pChannel: channel.pChannel, pSuccess: pSuccess,
      sRaw: sRaw, sDet: sDet, s: s, target: target, verdict: verdict, verdictKey: verdictKey,
      feasible: feasible, missingMission: missingMission, unique: unique,
      slots: { used: totalSlots, total: slotsTotal, bonus: schoolMods.slotsBonus, ok: slotsOk },
      school: schoolMods,
      deadline: deadline, pmCost: pmCost, pmOk: pmOk, cycles: cycles, baseCycles: b.rocket.cycles, cyclesOk: cyclesOk,
      mcs: mcs, tech: { rocket: rocketTech },
      price: price, np: E.np(b), pm: pmCost, moneyOk: moneyOk,
      dRating: E.round(dRating, 2), dVchk: E.round(dVchk, 2), roles: roles,
      advance: Math.round(advance), bonus: Math.round(bonus), reward: Math.round(advance + bonus),
      checks: [
        { id: 'mass', label: 'Mass to destination', ok: massOk, detail: E.round(massKg / 1000, 3) + ' t / ' + E.round(capacityKg / 1000, 3) + ' t (k=' + E.round(k, 2) + ')' },
        { id: 'power', label: 'Power', ok: power.ok, detail: E.round(power.available, 0) + ' W ≥ ' + E.round(power.required, 0) + ' W' },
        { id: 'slots', label: 'Control slots', ok: slotsOk, detail: totalSlots + ' / ' + slotsTotal },
        { id: 'data', label: 'Data downlink (soft)', ok: data.ratio >= S.minDataRatioForFull, soft: true, detail: 'D_ratio = ' + E.round(data.ratio, 2) + '; < 0.5 rules out a full success only' },
        { id: 'deadline', label: 'Deadline (cycles)', ok: cyclesOk, detail: cycles + ' / ' + deadline },
        { id: 'pm', label: 'PM', ok: pmOk, detail: pmCost + ' / ' + (C.start.pm * deadline) },
        { id: 'modules', label: 'Profile modules', ok: reqOk, detail: (traj.requires || []).join(', ') || '—' },
        { id: 'money', label: 'Budget', ok: moneyOk, detail: price + ' $' }
      ]
    };
  };

  /* ---------- Reference builds (§12) ---------- */
  E.REFERENCE_MISSION = {
    id: 'ref_leo', name: 'LEO reference', point: 'leo', complexity: 1.0, dataType: 'video',
    observeTime: 6, missionTime: 30, deadline: 5, targetValue: 30, requires: [], trajectories: ['direct']
  };
  E.referenceBuilds = function () {
    const m = E.REFERENCE_MISSION;
    const mk = function (o) {
      return {
        rocketId: o.rocket, reservationId: o.res, controlId: o.control,
        instruments: [{ id: 'ins_camera', count: o.cameras }],
        antennaId: o.antenna || 'ant_small', powerId: o.power || 'pwr_solar_small',
        bufferId: null, physical: [], moduleBuild: !!o.moduleBuild
      };
    };
    const rows = [
      { label: '1 camera, no redundancy', expected: 0.68, sel: mk({ rocket: 'rocket_light', res: 'res_single', control: 'ctrl_basic', cameras: 1 }) },
      { label: '1 camera, double launcher redundancy', expected: 0.76, sel: mk({ rocket: 'rocket_light', res: 'res_double', control: 'ctrl_basic', cameras: 1 }) },
      { label: '3 cameras, no redundancy', expected: 0.50, sel: mk({ rocket: 'rocket_light', res: 'res_single', control: 'ctrl_basic', cameras: 3 }) },
      { label: '3 cameras, launcher + control redundancy (platform)', expected: 0.77, sel: mk({ rocket: 'rocket_light', res: 'res_double', control: 'ctrl_redundant', cameras: 3 }) },
      { label: '3 cameras, same + modular build', expected: 0.84, sel: mk({ rocket: 'rocket_light', res: 'res_double', control: 'ctrl_redundant', cameras: 3, moduleBuild: true }) },
      { label: 'Experimental launcher (p=0.58), 1 camera', expected: 0.45, sel: mk({ rocket: 'rocket_exp', res: 'res_single', control: 'ctrl_basic', cameras: 1 }) }
    ];
    return rows.map(function (r) {
      const c = E.compute(r.sel, m, 'direct', { unique: 1.0 });
      return {
        label: r.label, expected: r.expected, pLaunch: E.round(c.pLaunch, 3),
        pCollect: E.round(c.pCollect, 3), pChannel: E.round(c.pChannel, 3),
        computed: E.round(c.pSuccess, 3), delta: E.round(c.pSuccess - r.expected, 3), sel: r.sel
      };
    });
  };

  /* ---------- Mission contract ---------- */
  E.contract = function (mission) {
    const r = C.contractReward;
    let modules = 0;
    (mission.requires || []).forEach(function (k) {
      const id = PHYS_BY_KEY[k];
      const card = id ? E.card(id) : null;
      if (card) modules += card.price;
    });
    const advance = r.base + r.perComplexity * mission.complexity + (r.point[mission.point] || 0) + modules;
    return { advance: Math.round(advance), bonus: Math.round(advance * r.bonusFactor), partialBonus: r.partialBonus, modules: modules };
  };

  /* ---------- Monte Carlo: a game of 10 missions ---------- */
  E.makeRng = function (seed) {
    let s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  };

  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  const INSTRUMENT_IDS = ['ins_camera', 'ins_spectrometer', 'ins_radiometer', 'ins_magnetometer', 'ins_exp'];
  function buildCombos(ids) {
    const buckets = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    (function rec(i, arr) {
      if (i === ids.length) {
        const n = arr.reduce(function (a, c) { return a + c.count; }, 0);
        if (!n || n > 6) return;
        let value = 0, price = 0;
        arr.forEach(function (c) {
          if (!c.count) return;
          const card = E.card(c.id);
          value += card.value * c.count; price += card.price * c.count;
        });
        buckets[n].push({ instruments: arr.filter(function (c) { return c.count > 0; }), n: n, value: value, price: price });
        return;
      }
      for (let c = 0; c <= 2; c++) { arr.push({ id: ids[i], count: c }); rec(i + 1, arr); arr.pop(); }
    })(0, []);
    const out = [];
    Object.keys(buckets).forEach(function (n) {
      buckets[n].sort(function (a, b) { return b.value - a.value || a.price - b.price; });
      out.push.apply(out, buckets[n].slice(0, 8));
    });
    return out;
  }
  const COMBOS = buildCombos(INSTRUMENT_IDS);
  const COMBO_CACHE = {};
  E.COMBOS = COMBOS;
  /* Instrument combinations taking the unlocked std/exp cards into account. The cache is
  * keyed by the available id set: the ladder changes at most 4 times per campaign.
   */
  E.combosFor = function (state) {
    const ids = INSTRUMENT_IDS.slice();
    E.instrumentPool(state).forEach(function (card) {
      if (!card || (!card.experimental && !card.standard)) return;
      if (ids.indexOf(card.id) === -1) ids.push(card.id);
    });
    const key = ids.join('|');
    if (!COMBO_CACHE[key]) COMBO_CACHE[key] = buildCombos(ids);
    return COMBO_CACHE[key];
  };

  const PHYS_BY_KEY = { capsule: 'phy_capsule', lander: 'phy_lander', rover: 'phy_rover', manipulator: 'phy_manipulator', relay: 'phy_relay' };

  function pickPower(b, pt, budget) {
    const need = C.power.overheadW + b.control.watts + b.antenna.watts +
      b.instruments.reduce(function (a, o) { return a + o.card.watts * o.count; }, 0);
    const req = need * C.power.margin;
    if (pt.solar < 0.35) return (budget >= 450) ? 'pwr_reactor' : 'pwr_exp';
    const solars = CARDS.power.filter(function (p) { return p.source === 'solar'; })
      .sort(function (a, b2) { return a.price - b2.price; });
    for (const s of solars) {
      if (s.watts * pt.solar >= req && s.price <= budget && s.watts * pt.solar <= b.rocket.busPower * 1.2) return s.id;
    }
    if (budget >= 450) return 'pwr_reactor';
    return solars[solars.length - 1].id;
  }

  function pickAntenna(b, mission, traj, buffer, budget) {
    const t = traj || C.trajectories.direct;
    let dGen = 0;
    b.instruments.forEach(function (o) {
      dGen += o.card.bw * o.count * mission.observeTime * C.dataTypes[o.card.dataType].coeff;
    });
    const eff = buffer ? C.buffer.efficiencyWith : C.buffer.efficiencyWithout;
    const needBw = dGen / Math.max(1, (t.window || 1) * mission.missionTime * eff) * 1.05;
    const sorted = CARDS.antennas.slice().sort(function (a, c) { return a.price - c.price; });
    const fit = sorted.filter(function (a) {
      return Math.min(a.bw, b.rocket.busChannel) >= needBw && a.price <= budget;
    });
    if (fit.length) return fit[0].id;
    // the bus is narrower than needed: a wider antenna is useless, so take the cheap one
    if (b.rocket.busChannel < needBw) return sorted[0].id;
    const byBw = CARDS.antennas.slice().sort(function (a, c) { return c.bw - a.bw; });
    return byBw[0].id;
  }

  E.chooseBuild = function (mission, state, unique) {
    const pt = C.points[mission.point];
    const uni = unique == null ? 1.0 : unique;
    const used = state.used || {};
    const schoolLevel = state.school || 0;
    const slotsBonus = E.schoolMods(schoolLevel).slotsBonus;
    const left = function (card) { return card.copies == null ? 99 : card.copies - (used[card.id] || 0); };
    const phys = (mission.requires || []).map(function (k) { return PHYS_BY_KEY[k]; }).filter(Boolean);
    // The advance is already inside state.cap (see §11); the cash on hand may be below the cap.
    const cap = state.cap == null ? state.money : state.cap;
    let best = null;
    let fallback = null;
    const rockets = state.rockets || E.rocketPool(state);
    rockets.forEach(function (rocket) {
      if (rocket.price > cap || left(rocket) <= 0) return;
      CARDS.reservations.forEach(function (res) {
        if (left(res) <= 0) return;
        CARDS.control.forEach(function (control) {
          if (left(control) <= 0) return;
          E.combosFor(state).forEach(function (combo) {
            if (combo.n > control.slots + slotsBonus) return;
            const sel = {
              rocketId: rocket.id, reservationId: res.id, controlId: control.id,
              instruments: combo.instruments.map(function (c) { return { id: c.id, count: c.count }; }),
              antennaId: 'ant_small', powerId: 'pwr_solar_small', bufferId: null,
              physical: phys.slice(), moduleBuild: false, schoolLevel: schoolLevel
            };
            const b0 = E.resolveBuild(sel, schoolLevel);
            if (E.price(b0) > cap) return;
            const trajs = E.trajectoriesFor(sel, mission, { schoolLevel: schoolLevel });
            const tr = trajs.filter(function (t) { return t.available; })
              .sort(function (a, c) { return (c.window - c.k / 20) - (a.window - a.k / 20); })[0];
            if (!tr) return;
            const budget = cap - E.price(b0);
            sel.bufferId = (budget > 80) ? 'buf_2' : null;
            sel.antennaId = pickAntenna(b0, mission, C.trajectories[tr.id], !!sel.bufferId, budget);
            sel.powerId = pickPower(E.resolveBuild(sel, schoolLevel), pt, budget);
            const c = E.compute(sel, mission, tr.id, { unique: uni, money: cap, schoolLevel: schoolLevel, state: state });
            if (!c.feasible || c.price > cap || c.pSuccess < 0.45) return;
            let chosen = c;
            let chosenSel = sel;
            // when the channel is weak and the budget allows, consider the antenna duplication module
            if (c.pChannel < 0.9 && budget > 80) {
              const sel2 = Object.assign({}, sel, { antennaDup: true });
              const c2 = E.compute(sel2, mission, tr.id, { unique: uni, money: cap, schoolLevel: schoolLevel, state: state });
              if (c2.feasible && c2.price <= cap && c2.pSuccess > c.pSuccess) {
                chosen = c2;
                chosenSel = sel2;
              }
            }
            const build = chosen;
            if (build.pSuccess < 0.6 || build.sDet < build.target * 0.7) {
              if (build.pSuccess >= 0.5 && build.sDet >= build.target * 0.5) {
                const fbScore = build.pSuccess * 50 + build.sDet / 2 - build.price / 50;
                if (!fallback || fbScore > fallback.score) {
                  fallback = { score: fbScore, compute: build, sel: chosenSel, res: res, exp: E.isExperimental(build) };
                }
              }
              return;
            }
            const score = build.pSuccess * 160 - build.price / 25 + Math.min(90, build.sDet / 1.2)
              + (build.sDet >= build.target ? 25 : 0) + (build.data.typeMatch ? 10 : 0);
            if (!best || score > best.score) {
              best = {
                score: score, compute: build, sel: chosenSel,
                res: res, exp: E.isExperimental(build)
              };
            }
          });
        });
      });
    });
    return best || fallback;
  };

  /* ---------- One launch: the stage rolls ----------
  * trace (optional) — an array for the chat-GM: { stage, p, roll, ok }.
  * v1.5: a launch is split into lift-off (playLaunch) and acceptance (playReception),
  * so that the flight runs for several steps while p_channel is rolled exactly once.
   */
  function traceLog(trace, stage, p, roll) {
    if (!trace) return;
    trace.push({ stage: stage, p: E.round(p, 3), roll: E.round(roll, 3), ok: roll < p });
  }

  E.playLaunch = function (c, rnd, trace) {
    const rLaunch = rnd();
    traceLog(trace, 'launch', c.pLaunch, rLaunch);
    if (rLaunch >= c.pLaunch) return { ok: false, stage: 'launch' };
    const rCollect = rnd();
    traceLog(trace, 'collect', c.pCollect, rCollect);
    if (rCollect >= c.pCollect) return { ok: false, stage: 'collect' };
    let physOk = true;
    c.build.physical.forEach(function (p) {
      if (p.p >= 1) { if (trace) trace.push({ stage: 'physical:' + p.key, p: 1, roll: null, ok: true }); return; }
      const roll = rnd();
      traceLog(trace, 'physical:' + p.key, p.p, roll);
      if (roll > p.p) physOk = false;
    });
    return { ok: true, physOk: physOk };
  };

  E.verdictFor = function (c, sAct, ratio) {
    const t = c.target;
    const S = C.success;
    if (sAct >= t && ratio >= S.minDataRatioForFull) return 'full';
    if (sAct >= t * S.sMinFactor) return 'success';
    if (sAct >= t * S.partialFactor) return 'partial';
    return 'fail';
  };

  E.playReception = function (c, physOk, rnd, trace, opts) {
    opts = opts || {};
    const rChannel = rnd();
    traceLog(trace, 'channel', c.pChannel, rChannel);
    if (rChannel >= c.pChannel) return { key: 'fail', stage: 'channel', sAct: 0 };
    const ratio = E.clamp(opts.ratio == null ? c.data.ratio : opts.ratio, 0, c.data.ratio);
    let sAct = c.sRaw * ratio * (physOk ? 1 : 0.6);
    if (opts.sFactor != null) sAct *= opts.sFactor;
    const key = E.verdictFor(c, sAct, ratio);
    if (trace) {
      trace.push({
        stage: 'result', p: null, roll: null, ok: key !== 'fail', key: key,
        sAct: E.round(sAct, 2), target: c.target, ratio: E.round(ratio, 3),
        physicalOk: physOk
      });
    }
    return { key: key, stage: physOk ? 'ok' : 'physical', sAct: sAct };
  };

  E.playMission = function (c, rnd, trace) {
    const l = E.playLaunch(c, rnd, trace);
    if (!l.ok) return { key: 'fail', stage: l.stage, sAct: 0 };
    return E.playReception(c, l.physOk, rnd, trace);
  };

  /* ---------- A game: 10 missions ---------- */
  E.simulateGame = function (seed) {
    const rnd = E.makeRng(seed);
    const C_ = C;
    const st = {
      money: C_.start.money, np: C_.start.np, vchk: C_.start.vchk, rating: C_.start.rating,
      succ: 0, partial: 0, fail: 0, skipped: 0, dup: 0, dupRocket: 0, dupCtrl: 0, exp: 0, expSubsystem: 0, powerExp: 0, salvage: 0,
      spent: 0, earned: 0, pSum: 0, priceSum: 0, missions: 0, used: {}, expCards: {},
      roles: { eng: 0, sci: 0, man: 0 }, log: [],
      stages: { launch: 0, collect: 0, channel: 0, physical: 0, ok: 0 }
    };
    const pool = shuffle(root.MISSIONS.slice(), rnd).slice(0, C_.missionsTotal);
    const visited = {};
    pool.forEach(function (m) {
      const contract = E.contract(m);
      st.cap = Math.min(st.money + contract.advance, contract.advance * C_.contractReward.capFactor);
      const uni = visited[m.point] ? C_.uniqueness.repeat : C_.uniqueness.first;
      const choice = E.chooseBuild(m, st, uni);
      if (!choice) { st.skipped++; st.log.push(m.id + ': no build fits the budget of ' + Math.round(st.cap) + '$'); return; }
      visited[m.point] = true;
      st.money += contract.advance; st.earned += contract.advance;
      st.used[choice.compute.build.rocket.id] = (st.used[choice.compute.build.rocket.id] || 0) + 1;
      st.used[choice.compute.build.res.id] = (st.used[choice.compute.build.res.id] || 0) + 1;
      st.used[choice.compute.build.control.id] = (st.used[choice.compute.build.control.id] || 0) + 1;
      const c = choice.compute;
      st.money -= c.price; st.spent += c.price; st.missions++;
      st.pSum += c.pSuccess; st.priceSum += c.price;
      if (choice.res.t === 'double') st.dupRocket++;
      if (c.build.control.dup === 'double') st.dupCtrl++;
      if (choice.res.t === 'double' || c.build.control.dup === 'double') st.dup++;
      if (choice.exp) st.exp++;
      const expIds = E.expCards(c.build);
      expIds.forEach(function (id) { st.expCards[id] = (st.expCards[id] || 0) + 1; });
      if (expIds.some(function (id) { return id === 'res_exp' || id === 'ctrl_exp' || id === 'ant_exp'; })) st.expSubsystem++;
      if (c.build.power && c.build.power.id === 'pwr_exp') st.powerExp++;
      const r = E.playMission(c, rnd);
      st.stages[r.stage] = (st.stages[r.stage] || 0) + 1;
      let dR = 0, dV = 0;
      if (r.key === 'full' || r.key === 'success') {
        dR = C_.score.ratingPerS * r.sAct * (r.key === 'full' ? 1.1 : 1);
        dV = C_.score.vchkPerS * r.sAct;
        st.succ++;
      } else if (r.key === 'partial') {
        dR = C_.score.partialRatingFactor * C_.score.ratingPerS * r.sAct;
        dV = C_.score.partialVCHKFactor * C_.score.vchkPerS * r.sAct;
        st.partial++;
      } else {
        dR = C_.score.failRating; dV = C_.score.failVCHK; st.fail++;
        if (rnd() < C_.salvage.chance) {
          st.salvage++;
          dR += 0.5 * C_.score.ratingPerS * c.sRaw * c.data.ratio;
          dV += 0.5 * C_.score.vchkPerS * c.sRaw * c.data.ratio;
        }
      }
      st.rating += dR; st.vchk += dV;
      const bonus = (r.key === 'full' || r.key === 'success') ? contract.bonus
        : (r.key === 'partial' ? contract.bonus * contract.partialBonus : 0);
      st.money += bonus; st.earned += bonus;
      if ((r.key === 'full' || r.key === 'success') && rnd() < C_.events.advertising.chance) {
        st.money += C_.events.advertising.moneyBase + C_.events.advertising.moneyPerRating * st.rating;
      }
      const roles = E.rolesFor(r.key, r.stage);
      st.roles.eng += roles.eng; st.roles.sci += roles.sci; st.roles.man += roles.man;
      st.log.push(m.id + ': ' + r.key + (r.key === 'fail' ? '[' + r.stage + ']' : '') +
        ' (P=' + E.round(c.pSuccess, 2) + ', S=' + E.round(r.sAct, 1) + ', ' + c.price + '$)');
    });
    return st;
  };

  /* ======================================================================
   * v1.4: THE CAMPAIGN
   * ==================================================================== */

  function emptyTree(classes) {
    const out = {};
    classes.forEach(function (c) { out[c] = C.tech.baseLevel; });
    return out;
  }
  function emptyIp(classes) {
    const out = {};
    classes.forEach(function (c) { out[c] = 0; });
    return out;
  }

  E.campaignSetup = function (seed) {
    const rnd = E.makeRng(seed == null ? 1 : seed);
    const state = {
      seed: seed == null ? 1 : seed,
      version: C.version,
      step: 1,
      maxSteps: C.campaign.steps,
      money: C.start.money,
      np: C.start.np,
      vchk: C.start.vchk,
      rating: C.start.rating,
      groundFund: C.campaign.groundFundStart,
      mcsLevel: 0,
      mcsPenalty: 0,
      managers: C.campaign.startManagers,
      factory: C.campaign.startFactory,
      school: C.campaign.startSchool,
      staff: Object.assign({}, C.campaign.staff),
      tech: {
        rocket: emptyTree(C.tech.rocketClasses),
        instrument: emptyTree(C.tech.instrumentClasses)
      },
      ip: {
        rocket: emptyIp(C.tech.rocketClasses),
        instrument: emptyIp(C.tech.instrumentClasses)
      },
      visited: {},
      standardized: {},
      standardP: {},
      expSeen: {},
      expRuns: {},
      expUnlocked: { rocket_exp: true, ins_exp: true },
      offers: [],
      production: [],
      ready: [],
      flights: [],
      pmPrepUsed: 0,
      testUsed: false,
      tookMission: false,
      stats: {
        accepted: 0, missions: 0, success: 0, partial: 0, fail: 0,
        launches: 0, expired: 0, rescues: 0, testLaunches: 0,
        cmlUps: 0, mcsUps: 0, factoryUps: 0, schoolUps: 0, managersHired: 0,
        prepSteps: 0, prActions: 0, standardized: 0, expRuns: 0, groundContracts: 0,
        failStreak: 0, maxFailStreak: 0, failStreakPenalties: 0,
        advances: 0, bonuses: 0, spent: 0, salaries: 0, upkeep: 0,
        mcsSpent: 0, factorySpent: 0, schoolSpent: 0, techSpent: 0, testSpent: 0,
        pSum: 0, priceSum: 0, launchesByMcs: 0,
        opsFlights: 0, opsSessions: 0, opsEvents: 0, opsIncidents: 0, opsLostSessions: 0,
        opsEarlyEnds: 0, opsOvertime: 0, opsOvertimeSpent: 0, opsEventSpent: 0,
        opsMaxLoad: 0, opsOverloadSteps: 0
      },
      log: []
    };
    state._deck = shuffle(MISSIONS.slice(), rnd);
    E.refillOffers(state, rnd);
    return state;
  };

  E.refillOffers = function (state, rnd) {
    const showcase = C.campaign.showcase;
    const busy = {};
    state.production.forEach(function (p) { busy[p.missionId] = true; });
    state.ready.forEach(function (p) { busy[p.missionId] = true; });
    while (state.offers.length < showcase) {
      let mission = null;
      let tries = 0;
      while (tries++ < 80) {
        if (!state._deck || !state._deck.length) {
          state._deck = shuffle(MISSIONS.slice(), rnd || E.makeRng((state.seed || 1) + state.step * 977));
        }
        const candidate = state._deck.pop();
        if (!candidate) continue;
        if (busy[candidate.id]) continue;
        if (state.offers.some(function (id) { return id === candidate.id; })) continue;
        mission = candidate;
        break;
      }
      if (!mission) break;
      state.offers.push(mission.id);
    }
    return state.offers;
  };

  E.campaignCompute = function (state, sel, mission, trajId, opts) {
    opts = opts || {};
    const uni = opts.unique == null
      ? (state.visited[mission.point] ? C.uniqueness.repeat : C.uniqueness.first)
      : opts.unique;
    return E.compute(sel, mission, trajId, {
      unique: uni,
      money: opts.money == null ? Infinity : opts.money,
      mcsLevel: E.effectiveMcsLevel(state),
      managers: state.managers,
      tech: state.tech,
      state: state,
      schoolLevel: state.school || 0
    });
  };

  E.campaignBuild = function (state, mission) {
    const contract = E.contract(mission);
    const cap = Math.min(state.money + contract.advance, contract.advance * C.contractReward.capFactor);
    const uni = state.visited[mission.point] ? C.uniqueness.repeat : C.uniqueness.first;
    const choice = E.chooseBuild(mission, {
      money: state.money, cap: cap, used: {}, school: state.school || 0,
      tech: state.tech, standardized: state.standardized, standardP: state.standardP,
      expRuns: state.expRuns, expUnlocked: state.expUnlocked
    }, uni);
    if (!choice) return null;
    const sel = choice.sel;
    const trOpts = {
      tech: state.tech,
      pmPerStep: E.pmLimit(state),
      pmOverhead: C.campaign.pmOverhead,
      schoolLevel: state.school || 0
    };
    const trajs = E.trajectoriesFor(sel, mission, trOpts);
    let best = null;
    trajs.forEach(function (tr) {
      if (!tr.available) return;
      const c = E.campaignCompute(state, sel, mission, tr.id, { unique: uni, money: cap });
      if (!c.feasible || c.price > cap) return;
      if (c.pSuccess < 0.45 || c.sDet < c.target * 0.5) return;
      const score = c.pSuccess * 160 - c.price / 25 + Math.min(90, c.sDet / 1.2)
        + (c.sDet >= c.target ? 25 : 0) + (c.data.typeMatch ? 10 : 0);
      if (!best || score > best.score) {
        const prodTime = Math.max(1, c.cycles - (state.factory >= 4 ? 1 : 0));
        const spread = Math.max(prodTime, Math.ceil(c.deadline * (C.campaign.pmSpread || 0)));
        best = {
          score: score, sel: sel, compute: c, trajectoryId: tr.id,
          cap: cap, advance: contract.advance, unique: uni,
          prodTime: prodTime,
          pmRate: Math.ceil((c.pm + C.campaign.pmOverhead) / spread)
        };
      }
    });
    return best;
  };

  /* A manual build for a mission (chat-GM, the future manual UI mode):
  * the same checks and formulas as in E.campaignBuild, but without the bot search.
   */
  E.campaignManual = function (state, mission, sel, trajId) {
    if (!mission) return { ok: false, reason: 'no mission' };
    const contract = E.contract(mission);
    const cap = Math.min(state.money + contract.advance, contract.advance * C.contractReward.capFactor);
    const uni = state.visited[mission.point] ? C.uniqueness.repeat : C.uniqueness.first;
    const schoolLevel = state.school || 0;
    const trOpts = {
      tech: state.tech, pmPerStep: E.pmLimit(state),
      pmOverhead: C.campaign.pmOverhead, schoolLevel: schoolLevel
    };
    const traj = trajId || (mission.trajectories || ['direct'])[0];
    const trajectories = E.trajectoriesFor(sel, mission, trOpts);
    const trajInfo = trajectories.find(function (t) { return t.id === traj; });
    if (!trajInfo) return { ok: false, reason: 'profile unavailable: ' + traj, trajectories: trajectories };
    const c = E.campaignCompute(state, sel, mission, traj, { unique: uni, money: cap });
    const prodTime = Math.max(1, c.cycles - (state.factory >= 4 ? 1 : 0));
    const spread = Math.max(prodTime, Math.ceil(c.deadline * (C.campaign.pmSpread || 0)));
    const pmRate = Math.ceil((c.pm + C.campaign.pmOverhead) / spread);
    const choice = {
      sel: sel, compute: c, trajectoryId: traj, cap: cap,
      advance: contract.advance, unique: uni, prodTime: prodTime, pmRate: pmRate
    };
    const cashAfter = state.money + contract.advance - c.price;
    return {
      ok: true, choice: choice, compute: c, traj: trajInfo, trajectories: trajectories,
      cap: cap, advance: contract.advance, price: c.price, cashAfter: cashAfter,
      budgetOk: c.price <= cap, cashOk: cashAfter >= 0,
      pmRate: pmRate, pmFree: E.pmAvailable(state), prodTime: prodTime,
      flight: E.flightSteps(mission)
    };
  };

  E.acceptMission = function (state, missionId, build) {
    const mission = MISSIONS.find(function (m) { return m.id === missionId; });
    if (!mission) return { ok: false, reason: 'no mission' };
    if (state.offers.indexOf(missionId) === -1) return { ok: false, reason: 'the mission is not on offer' };
    if (state.production.length >= C.campaign.productionSlots) return { ok: false, reason: 'no free production slot' };
    const choice = (build && build.sel && build.compute) ? build : E.campaignBuild(state, mission);
    if (!choice) return { ok: false, reason: 'no build fits the budget' };
    if (choice.pmRate > E.pmAvailable(state)) return { ok: false, reason: 'not enough PM' };
    if (choice.prodTime > choice.compute.deadline) return { ok: false, reason: 'production misses the deadline' };

    const advance = choice.advance;
    state.money += advance;
    state.groundFund += Math.round(advance * C.campaign.groundFundShare);
    state.stats.advances += advance;
    state.stats.accepted++;
    state.visited[mission.point] = true;
    if (E.isExperimental(choice.compute)) {
      E.expCards(choice.compute.build).forEach(function (id) { state.expSeen[id] = true; });
    }
    const entry = {
      missionId: mission.id,
      sel: choice.sel,
      trajectoryId: choice.trajectoryId,
      compute: choice.compute,
      unique: choice.unique,
      cap: choice.cap,
      advance: advance,
      price: choice.compute.price,
      pmRate: choice.pmRate,
      prodTime: choice.prodTime,
      startedStep: state.step,
      readyStep: state.step + choice.prodTime,
      deadlineStep: state.step + choice.compute.deadline,
      pmEndStep: state.step + choice.compute.deadline
    };
    state.money -= entry.price;
    state.stats.spent += entry.price;
    state.production.push(entry);
    state.offers = state.offers.filter(function (id) { return id !== missionId; });
    E.refillOffers(state, E.makeRng((state.seed || 1) + state.step * 31 + state.stats.accepted));
    state.log.push('step ' + state.step + ': accepted ' + mission.name + ' (' + advance + ' $, ' +
      choice.pmRate + ' PM/step, ' + choice.prodTime + ' steps.)');
    return { ok: true, entry: entry };
  };

  E.advanceProduction = function (state) {
    const still = [];
    state.production.forEach(function (p) {
      if (p.readyStep <= state.step) state.ready.push(p);
      else still.push(p);
    });
    state.production = still;
    return state.ready;
  };

  E.addIp = function (state, kind, cls, n) {
    if (!state.ip[kind] || state.ip[kind][cls] == null) return;
    state.ip[kind][cls] = Math.max(0, state.ip[kind][cls] + (n || 0));
  };

  E.missionIp = function (state, c, key) {
    const rocketCls = E.techClassOf(c.build.rocket);
    const ins = c.build.instruments[0];
    const insCls = ins ? E.techClassOf(ins.card) : 'camera';
    if (key === 'full' || key === 'success') {
      E.addIp(state, 'rocket', rocketCls, 1);
      E.addIp(state, 'instrument', insCls, 1);
      if (key === 'full') E.addIp(state, 'instrument', insCls, 1);
    } else if (key === 'partial') {
      E.addIp(state, 'rocket', rocketCls, 1);
    }
  };

  E.applyMissionResult = function (state, c, r, rnd) {
    const sc = C.score;
    let dR = 0, dV = 0;
    if (r.key === 'full' || r.key === 'success') {
      dR = sc.ratingPerS * r.sAct * (r.key === 'full' ? 1.1 : 1);
      dV = sc.vchkPerS * r.sAct + E.mcsFor(state).vchk;
      state.stats.success++;
      state.stats.failStreak = 0;
    } else if (r.key === 'partial') {
      dR = sc.partialRatingFactor * sc.ratingPerS * r.sAct;
      dV = sc.partialVCHKFactor * sc.vchkPerS * r.sAct;
      state.stats.partial++;
      state.stats.failStreak = 0;
    } else {
      dR = sc.failRating;
      dV = sc.failVCHK;
      state.stats.fail++;
      state.stats.failStreak++;
      state.stats.maxFailStreak = Math.max(state.stats.maxFailStreak, state.stats.failStreak);
      if (state.stats.failStreak % 3 === 0) state.stats.failStreakPenalties++;
      if (rnd() < C.salvage.chance) {
        state.stats.rescues++;
        dR += 0.5 * sc.ratingPerS * c.sRaw * c.data.ratio;
        dV += 0.5 * sc.vchkPerS * c.sRaw * c.data.ratio;
      }
    }
    state.rating += dR;
    state.vchk += dV;

    const contract = E.contract(c.mission);
    const bonus = (r.key === 'full' || r.key === 'success') ? contract.bonus
      : (r.key === 'partial' ? contract.bonus * contract.partialBonus : 0);
    state.money += bonus;
    state.stats.bonuses += bonus;
    if ((r.key === 'full' || r.key === 'success') && rnd() < C.events.advertising.chance) {
      const ad = C.events.advertising.moneyBase + C.events.advertising.moneyPerRating * state.rating;
      state.money += ad;
      state.stats.bonuses += ad;
    }
    E.missionIp(state, c, r.key);
    return { dRating: dR, dVchk: dV, bonus: bonus };
  };

  /* ======================================================================
   * v1.5: FLIGHT OPERATIONS (§26–§31)
   * After lift-off a mission flies for `flight` steps. Every step is a communication
   * session, a possible flight event and the human-factor risk of an MCC overload.
   * Acceptance is a single p_channel roll (no repeated rolls per session).
   * ==================================================================== */

  E.flightSteps = function (mission) {
    if (!mission) return 1;
    if (mission.flight != null) return mission.flight;
    const O = C.campaign.ops;
    const base = O.flightBase[mission.point] == null ? 1 : O.flightBase[mission.point];
    const extra = (mission.missionTime || 0) >= O.flightLongMissionTime ? 1 : 0;
    return E.clamp(base + extra, 1, O.flightMax);
  };

  E.flightVideo = function (c) {
    return (c.build.instruments || []).some(function (o) { return (o.card.bw || 0) >= 20; });
  };

  E.flightLoad = function (c, mission, levelEff) {
    const O = C.campaign.ops;
    let load = 1;
    if (E.flightVideo(c)) load += O.loadVideo;
    const deep = ['deep', 'mars', 'belt'].indexOf(mission.point) !== -1;
    if (deep && levelEff < O.deepFromLevel) load += O.loadDeep;
    return load;
  };

  E.opsCapacity = function (state) {
    const O = C.campaign.ops;
    const lvl = E.clamp(E.effectiveMcsLevel(state) - (state.mcsPenalty || 0), 0, O.capacity.length - 1);
    return O.capacity[lvl];
  };

  E.opsLoad = function (state) {
    const active = (state.flights || []).filter(function (f) { return !f.ended; });
    const byFlight = active.map(function (f) {
      return {
        missionId: f.missionId, name: f.name, load: f.load, endStep: f.endStep,
        done: (f.sessions || []).length, need: f.flight + (f.overtime || 0)
      };
    });
    const load = byFlight.reduce(function (a, f) { return a + f.load; }, 0);
    const cap = E.opsCapacity(state);
    return {
      load: load, cap: cap, overload: Math.max(0, load - cap),
      byFlight: byFlight, flights: active.length
    };
  };

  E.mcsLoadPlan = function (state, n) {
    const steps = Math.max(1, n || C.campaign.ops.loadPlanSteps);
    const cap = E.opsCapacity(state);
    const out = [];
    for (let i = 0; i < steps; i++) {
      const step = state.step + i;
      const active = (state.flights || []).filter(function (f) {
        return !f.ended && step <= f.endStep;
      });
      const load = active.reduce(function (a, f) { return a + f.load; }, 0);
      out.push({ step: step, load: load, cap: cap, overload: Math.max(0, load - cap), flights: active.length });
    }
    return out;
  };

  /* The school trains the MCC shift: every level lowers the overloaded-channel penalty.
  * The 0.05 base and the 0.30 ceiling never change — the school teaches how not to
  * create an overload, it does not cancel the consequences.
   */
  E.opsIncidentRelief = function (school) {
    const O = C.campaign.ops;
    return E.clamp((O.pIncidentSchoolRelief || 0) * (school || 0), 0,
      O.pIncidentSchoolReliefMax || 0);
  };

  E.opsIncidentP = function (overload, bonus, school) {
    const O = C.campaign.ops;
    const perOverload = O.pIncidentPerOverload * (1 - E.opsIncidentRelief(school));
    return Math.min(O.pIncidentCap,
      O.pIncidentBase + perOverload * Math.max(0, overload) + (bonus || 0));
  };

  E.opsEventChance = function (state) {
    const O = C.campaign.ops;
    return Math.max(O.opsEventMinChance,
      O.opsEventChance - O.opsEventSchoolReduction * (state.school || 0));
  };

  E.drawOpsEvent = function (rnd) {
    const deck = CARDS.opsEvents || [];
    const total = deck.reduce(function (a, card) { return a + (card.copies || 1); }, 0);
    if (!total) return null;
    let roll = rnd() * total;
    for (let i = 0; i < deck.length; i++) {
      roll -= deck[i].copies || 1;
      if (roll < 0) return deck[i];
    }
    return deck[deck.length - 1];
  };

  E.applyOpsEvent = function (state, f, card) {
    const c = f.compute;
    const res = { id: card.id, name: card.name, quality: 1, lost: false, note: '' };
    if (card.id === 'oe_flare') {
      if (!c.build.buffer) { res.quality = 0; res.lost = true; res.note = 'no buffer'; }
    } else if (card.id === 'oe_dsn') {
      res.quality = 0.5; res.note = 'narrow window';
    } else if (card.id === 'oe_thermal') {
      if (!c.build.buffer) { res.quality = 0.5; res.note = 'no thermal control'; }
    } else if (card.id === 'oe_software') {
      const req = C.mcs.managersRequired[E.effectiveMcsLevel(state)] || 0;
      if ((state.managers || 0) < req) {
        if (state.money >= 50) {
          state.money -= 50;
          state.stats.opsEventSpent = (state.stats.opsEventSpent || 0) + 50;
          res.note = '−$50 for a patch';
        } else {
          res.quality = 0.5; res.note = 'the patch was not paid';
        }
      }
    } else if (card.id === 'oe_debris') {
      if (c.build.control.dup !== 'double') { f.earlyEnd = true; res.note = 'hull breach'; }
    } else if (card.id === 'oe_overload') {
      if (E.opsLoad(state).overload > 0) {
        f.incidentBonus += 0.10;
        res.note = '+10% incident risk';
      }
    } else if (card.id === 'oe_calib') {
      const ins = c.build.instruments[0];
      if (ins) E.addIp(state, 'instrument', E.techClassOf(ins.card), 1);
      res.note = '+1 IP';
    } else if (card.id === 'oe_press') {
      state.money += 50;
      state.stats.bonuses += 50;
      state.vchk += 1;
      res.note = '+$50, +1 VChK';
    }
    state.stats.opsEvents = (state.stats.opsEvents || 0) + 1;
    return res;
  };

  E.enterFlight = function (state, p, c, launch) {
    const mission = c.mission;
    const flight = E.flightSteps(mission);
    const level = E.effectiveMcsLevel(state);
    const f = {
      missionId: p.missionId, name: mission.name,
      compute: c, physOk: launch.physOk !== false, launchTrace: launch.trace || null,
      flight: flight, overtime: 0, sessions: [], events: [], accrued: 0, ratioOps: 0,
      price: p.price, advance: p.advance, prodTime: p.prodTime, point: mission.point,
      sel: p.sel, unique: p.unique, cap: p.cap, trajectoryId: p.trajectoryId,
      load: E.flightLoad(c, mission, level),
      incidentBonus: 0, earlyEnd: false, ended: false,
      startedStep: state.step, launchStep: state.step, lastSessionStep: null,
      endStep: state.step + flight - 1,
      nominalEndStep: state.step + flight - 1
    };
    state.flights.push(f);
    state.stats.opsFlights = (state.stats.opsFlights || 0) + 1;
    state.log.push('step ' + state.step + ': ' + mission.name + ' → launched, flight ' +
      flight + ' steps. (acceptance ~step ' + f.endStep + ', channel ' + f.load + ')');
    return f;
  };

  E.stepFlights = function (state, rnd, trace) {
    const O = C.campaign.ops;
    const reports = [];
    const ld = E.opsLoad(state);
    state.stats.opsMaxLoad = Math.max(state.stats.opsMaxLoad || 0, ld.load);
    if (ld.overload > 0) state.stats.opsOverloadSteps = (state.stats.opsOverloadSteps || 0) + 1;

    /* A human-factor incident — at most one per MCC step. */
    const active = state.flights.filter(function (f) { return !f.ended; });
    let incident = null;
    if (active.length) {
      const bonus = Math.max.apply(null, active.map(function (f) { return f.incidentBonus || 0; }));
      const pInc = E.opsIncidentP(ld.overload, bonus, state.school);
      if (rnd() < pInc) {
        const w = O.incidentWeights;
        const roll = rnd();
        const kind = roll < w.lostSession ? 'lostSession'
          : (roll < w.lostSession + w.commandError ? 'commandError' : 'instrumentFault');
        const weighted = active.filter(function (f) { return (f.incidentBonus || 0) === bonus; });
        const target = bonus > 0 ? weighted[0]
          : active[Math.floor(rnd() * active.length)];
        incident = { flight: target, kind: kind, p: pInc };
        if (trace) {
          trace.push({ stage: 'ops:' + kind, p: E.round(pInc, 3), roll: E.round(roll, 3), ok: false });
        }
      }
    }

    state.flights.slice().forEach(function (f) {
      if (f.ended || f.lastSessionStep === state.step) return;
      f.lastSessionStep = state.step;
      const c = f.compute;
      const session = { step: state.step, quality: 1, event: null, incident: null, note: '', accrued: 0 };
      if (rnd() < E.opsEventChance(state)) {
        const card = E.drawOpsEvent(rnd);
        if (card) {
          const ev = E.applyOpsEvent(state, f, card);
          session.event = card.id;
          session.note = ev.note;
          session.quality *= ev.quality;
          if (ev.lost) session.lost = true;
          f.events.push({ step: state.step, id: card.id, name: card.name, note: ev.note });
        }
      }
      if (incident && incident.flight === f) {
        const kind = incident.kind;
        session.incident = kind;
        state.stats.opsIncidents = (state.stats.opsIncidents || 0) + 1;
        if (kind === 'lostSession') {
          session.quality = 0;
          session.lost = true;
          state.stats.opsLostSessions = (state.stats.opsLostSessions || 0) + 1;
        } else if (kind === 'commandError') {
          if (state.money >= 50) {
            state.money -= 50;
            session.note = 'crew error: −$50';
          } else {
            session.quality *= 0.5;
            session.note = 'crew error: slice ×0.5';
          }
        } else {
          session.quality *= 0.5;
          session.note = 'instrument fault: slice ×0.5';
        }
      }
      const slice = (c.sRaw / Math.max(1, f.flight)) * c.data.ratio * session.quality;
      if (!f.earlyEnd) f.accrued += slice;
      session.accrued = slice;
      f.sessions.push(session);
      state.stats.opsSessions = (state.stats.opsSessions || 0) + 1;
      reports.push({ missionId: f.missionId, name: f.name, step: state.step, session: session });
    });

    state.flights.slice().forEach(function (f) {
      if (f.ended) return;
      const need = f.flight + (f.overtime || 0);
      if (f.earlyEnd || (f.sessions || []).length >= need) {
        const rec = E.acceptFlight(state, f, rnd, { trace: trace });
        if (rec) reports.push(rec);
      }
    });
    state.flights = state.flights.filter(function (f) { return !f.ended; });
    return reports;
  };

  E.acceptFlight = function (state, f, rnd, opts) {
    opts = opts || {};
    if (!f || f.ended) return null;
    const c = f.compute;
    const O = C.campaign.ops;
    const full = c.sRaw * c.data.ratio;
    const share = full > 0 ? E.clamp(f.accrued / full, 0, 1) : 0;
    const ratioOps = c.data.ratio * (O.dataFloor + (1 - O.dataFloor) * share);
    let sFactor = (O.accrualBonus || 1) * (1 + O.overtime.sBonusPerStep * (f.overtime || 0));
    if (f.earlyEnd) sFactor *= O.earlyEndSFactor;
    const r = E.playReception(c, f.physOk, rnd, opts.trace || null, { ratio: ratioOps, sFactor: sFactor });
    const reward = E.applyMissionResult(state, c, r, rnd);
    f.ended = true;
    f.endedStep = state.step;
    f.ratioOps = ratioOps;
    f.result = r;
    f.reward = reward;
    if (f.earlyEnd) state.stats.opsEarlyEnds = (state.stats.opsEarlyEnds || 0) + 1;
    state.log.push('step ' + state.step + ': ' + f.name + ' → acceptance ' + r.key +
      (r.key === 'fail' ? '[' + r.stage + ']' : '') +
      ' (sessions ' + f.sessions.length + '/' + (f.flight + (f.overtime || 0)) +
      ', data ' + E.round(100 * ratioOps / (c.data.ratio || 1), 0) + '%' +
      (f.overtime ? ', overtime ' + f.overtime : '') + (f.earlyEnd ? ', early end' : '') + ')');
    return {
      reception: true, missionId: f.missionId, name: f.name, step: state.step,
      result: r, reward: reward, compute: c, flight: f.flight, overtime: f.overtime || 0,
      sessions: f.sessions, events: f.events, ratioOps: ratioOps, earlyEnd: !!f.earlyEnd,
      launchTrace: f.launchTrace, final: !!opts.final,
      price: f.price, advance: f.advance, point: f.point, trajectoryId: f.trajectoryId
    };
  };

  E.findFlight = function (state, missionId) {
    return (state.flights || []).find(function (f) {
      return !f.ended && (!missionId || f.missionId === missionId);
    }) || null;
  };

  E.overtime = function (state, missionId) {
    const O = C.campaign.ops.overtime;
    const f = E.findFlight(state, missionId);
    if (!f) return { ok: false, reason: 'no active flight' };
    if (f.earlyEnd) return { ok: false, reason: 'the flight is already ending' };
    if ((f.overtime || 0) >= O.max) return { ok: false, reason: 'overtime limit: ' + O.max };
    if (state.money < O.money) return { ok: false, reason: 'not enough money' };
    state.money -= O.money;
    f.overtime = (f.overtime || 0) + 1;
    f.endStep++;
    state.stats.opsOvertime = (state.stats.opsOvertime || 0) + 1;
    state.stats.opsOvertimeSpent = (state.stats.opsOvertimeSpent || 0) + O.money;
    state.log.push('step ' + state.step + ': ' + f.name + ' → acceptance extended (+' +
      Math.round(O.sBonusPerStep * 100) + '% S, ' + O.money + ' $)');
    return { ok: true, flight: f, cost: O.money, overtime: f.overtime };
  };

  E.closeEarly = function (state, missionId, rnd) {
    const f = E.findFlight(state, missionId);
    if (!f) return { ok: false, reason: 'no active flight' };
    if (!(f.sessions || []).length) return { ok: false, reason: 'the flight has not brought data yet' };
    f.earlyEnd = true;
    const rec = E.acceptFlight(state, f, rnd);
    state.flights = state.flights.filter(function (x) { return !x.ended; });
    return { ok: true, report: rec };
  };

  E.finalizeFlights = function (state, rnd) {
    const out = [];
    state.flights.slice().forEach(function (f) {
      if (f.ended) return;
      const rec = E.acceptFlight(state, f, rnd, { final: true });
      if (rec) out.push(rec);
    });
    state.flights = state.flights.filter(function (f) { return !f.ended; });
    return out;
  };

  E.launchReady = function (state, missionIds, rnd, unlimited, report) {
    const mcs = E.mcsFor(state);
    const cap = unlimited ? Infinity : mcs.capacity;
    const wanted = missionIds ? missionIds.slice() : null;
    const list = state.ready.slice().sort(function (a, b) {
      return a.deadlineStep - b.deadlineStep || a.readyStep - b.readyStep;
    });
    let launched = 0;
    const done = [];
    for (const p of list) {
      if (launched >= cap) break;
      if (wanted && wanted.indexOf(p.missionId) === -1) continue;
      const mission = MISSIONS.find(function (m) { return m.id === p.missionId; });
      if (!mission) { done.push(p); continue; }
      const c = E.campaignCompute(state, p.sel, mission, p.trajectoryId, { unique: p.unique, money: p.cap });
      /* The risk is removed by a run: one run per exp card in the build. */
      const expRuns = E.addExpRunsForBuild(state, c.build, 'launch');
      const tr = report ? [] : null;
      const moneyBefore = state.money, ratingBefore = state.rating, vchkBefore = state.vchk;
      const launch = E.playLaunch(c, rnd, tr);
      state.stats.missions++;
      state.stats.launches++;
      state.stats.launchesByMcs++;
      state.stats.pSum += c.pSuccess;
      state.stats.priceSum += c.price;
      if (!launch.ok) {
        const r = { key: 'fail', stage: launch.stage, sAct: 0 };
        const reward = E.applyMissionResult(state, c, r, rnd);
        if (report) {
          report.push({
            missionId: mission.id, name: mission.name, step: state.step, trace: tr,
            result: r, reward: reward, compute: c, reception: false,
            point: mission.point, trajectoryId: p.trajectoryId,
            price: p.price, advance: p.advance, prodTime: p.prodTime,
            dMoney: state.money - moneyBefore, dRating: state.rating - ratingBefore,
            dVchk: state.vchk - vchkBefore, p: c.pSuccess, sAct: 0, expRuns: expRuns
          });
        }
        state.log.push('step ' + state.step + ': ' + mission.name + ' → fail[' + launch.stage + ']' +
          ' (P=' + E.round(c.pSuccess, 2) + ', S=0, ' +
          (reward.dRating > 0 ? '+' : '') + E.round(reward.dRating, 1) + ' rating)');
      } else {
        const flight = E.enterFlight(state, p, c, { physOk: launch.physOk, trace: tr });
        if (report) {
          report.push({
            missionId: mission.id, name: mission.name, step: state.step, trace: tr,
            result: { key: 'inflight', stage: 'flight', sAct: 0 }, reward: null, compute: c,
            reception: false, pending: true, flight: flight.flight, load: flight.load,
            flightEndStep: flight.endStep,
            point: mission.point, trajectoryId: p.trajectoryId,
            price: p.price, advance: p.advance, prodTime: p.prodTime,
            dMoney: state.money - moneyBefore, dRating: 0, dVchk: 0, p: c.pSuccess, sAct: 0, expRuns: expRuns
          });
        }
      }
      done.push(p);
      launched++;
    }
    state.ready = state.ready.filter(function (p) { return done.indexOf(p) === -1; });
    return launched;
  };

  E.expireMission = function (state, p, reason) {
    const mission = MISSIONS.find(function (m) { return m.id === p.missionId; });
    state.stats.fail++;
    state.stats.expired++;
    state.stats.failStreak++;
    state.stats.maxFailStreak = Math.max(state.stats.maxFailStreak, state.stats.failStreak);
    if (state.stats.failStreak % 3 === 0) state.stats.failStreakPenalties++;
    state.rating += C.score.failRating;
    state.vchk += C.score.failVCHK;
    if (mission) state.log.push('step ' + state.step + ': ' + mission.name + ' → expired (' + (reason || 'deadline') + ')');
  };

  E.failRemaining = function (state, reason) {
    const all = state.production.concat(state.ready);
    all.forEach(function (p) { E.expireMission(state, p, reason || 'end of campaign'); });
    state.production = [];
    state.ready = [];
    return all.length;
  };

  /* ---------- Preparation: MCC, factory, R&D, tests ---------- */
  E.mcsUpgrade = function (state) {
    const next = (state.mcsLevel || 0) + 1;
    if (next > C.mcs.maxLevel) return { ok: false, reason: 'already at the maximum level' };
    const cost = C.mcs.upgradeCost[next];
    const req = C.mcs.managersRequired[next] || 0;
    if ((state.managers || 0) < req) return { ok: false, reason: 'managers required: ' + req };
    if (state.rating < cost.rating) return { ok: false, reason: 'rating required: ' + cost.rating };
    if (E.pmAvailable(state) < cost.pm) return { ok: false, reason: 'not enough PM' };
    if (state.np < cost.np) return { ok: false, reason: 'not enough NP' };
    if (!E.canPay(state, cost.money)) return { ok: false, reason: 'not enough money' };
    E.pay(state, cost.money);
    state.np -= cost.np;
    state.pmPrepUsed += cost.pm;
    state.mcsLevel = next;
    state.stats.mcsUps++;
    state.stats.mcsSpent += cost.money;
    state.log.push('step ' + state.step + ': MCC → ' + next + ' (' + cost.money + ' $, ' + cost.pm + ' PM)');
    return { ok: true, level: next, cost: cost };
  };

  E.upgradeFactory = function (state) {
    const next = (state.factory || 0) + 1;
    const cost = C.campaign.factoryUpgrades[next - 1];
    if (!cost) return { ok: false, reason: 'already at the maximum level' };
    if (state.rating < cost.rating) return { ok: false, reason: 'rating required: ' + cost.rating };
    if (E.pmAvailable(state) < cost.pm) return { ok: false, reason: 'not enough PM' };
    if (state.money < cost.money) return { ok: false, reason: 'not enough money' };
    state.money -= cost.money;
    state.pmPrepUsed += cost.pm;
    state.factory = next;
    state.stats.factoryUps++;
    state.stats.factorySpent += cost.money;
    state.log.push('step ' + state.step + ': factory → ' + next + ' (' + cost.money + ' $, ' + cost.pm + ' PM)');
    return { ok: true, level: next, cost: cost };
  };

  E.upgradeSchool = function (state) {
    const next = (state.school || 0) + 1;
    const cost = E.schoolUpgradeCost(next);
    if (!cost) return { ok: false, reason: 'already at the maximum level' };
    if (state.rating < cost.rating) return { ok: false, reason: 'rating required: ' + cost.rating };
    if (E.pmAvailable(state) < cost.pm) return { ok: false, reason: 'not enough PM' };
    if (state.np < cost.np) return { ok: false, reason: 'not enough NP' };
    if (!E.canPay(state, cost.money)) return { ok: false, reason: 'not enough money' };
    E.pay(state, cost.money);
    state.np -= cost.np;
    state.pmPrepUsed += cost.pm;
    state.school = next;
    state.stats.schoolUps++;
    state.stats.schoolSpent += cost.money;
    state.log.push('step ' + state.step + ': school → ' + next + ' (' + cost.money + ' $, ' + cost.pm + ' PM)');
    return { ok: true, level: next, cost: cost, mods: E.schoolFor(state) };
  };

  E.upgradeTech = function (state, kind, cls) {
    if (!state.tech[kind] || state.tech[kind][cls] == null) return { ok: false, reason: 'unknown class' };
    const target = state.tech[kind][cls] + 1;
    if (target > C.tech.maxLevel) return { ok: false, reason: 'CML 4 already reached' };
    const needIp = C.tech.ipThresholds[target] || 0;
    if (E.ipFor(state, kind, cls) < needIp) return { ok: false, reason: 'IP required: ' + needIp };
    const cost = E.techUpgradeCost(target);
    if (state.money < cost.money) return { ok: false, reason: 'not enough money' };
    if (state.np < cost.np) return { ok: false, reason: 'not enough NP' };
    if (E.pmAvailable(state) < cost.pm) return { ok: false, reason: 'not enough PM' };
    state.money -= cost.money;
    state.np -= cost.np;
    state.pmPrepUsed += cost.pm;
    state.tech[kind][cls] = target;
    state.stats.cmlUps++;
    state.stats.techSpent += cost.money;
    state.log.push('step ' + state.step + ': CML ' + (kind === 'rocket' ? 'launcher ' : 'instrument ') +
      cls + ' → ' + target + ' (' + cost.money + ' $, ' + cost.pm + ' PM)');
    return { ok: true, level: target, cost: cost };
  };

  E.hireManager = function (state) {
    const cost = C.campaign.hireManager;
    if (state.money < cost.money) return { ok: false, reason: 'not enough money' };
    if (state.np < cost.np) return { ok: false, reason: 'not enough NP' };
    state.money -= cost.money;
    state.np -= cost.np;
    state.managers++;
    state.stats.managersHired++;
    state.log.push('step ' + state.step + ': manager hired (' + cost.money + ' $)');
    return { ok: true, managers: state.managers };
  };

  E.prAction = function (state) {
    const cost = C.campaign.pr;
    if (state.money < cost.money) return { ok: false, reason: 'not enough money' };
    state.money -= cost.money;
    state.vchk += cost.vchk;
    state.rating += cost.rating;
    state.stats.prActions++;
    state.log.push('step ' + state.step + ': PR (+' + cost.vchk + ' VChK)');
    return { ok: true };
  };

  /* A ground contract: 1 preparation action, it does not count as a mission. */
  E.groundContract = function (state, cardId, opts) {
    opts = opts || {};
    const card = E.card(cardId);
    if (!card || card.kind !== 'groundContract') return { ok: false, reason: 'no ground contract' };
    const npDelta = card.npDelta || 0;
    if (npDelta < 0 && state.np < -npDelta) return { ok: false, reason: 'not enough NP' };
    const fund = card.fund || 0;
    state.groundFund += fund;
    state.np = Math.max(0, state.np + npDelta);
    state.vchk = Math.max(0, state.vchk + (card.vchkDelta || 0));
    let ip = 0;
    if (card.ipDelta) {
      const kind = opts.ipKind || 'instrument';
      const cls = opts.ipClass || 'camera';
      if (state.ip[kind] && state.ip[kind][cls] != null) {
        E.addIp(state, kind, cls, card.ipDelta);
        ip = card.ipDelta;
      }
    }
    state.stats.groundContracts = (state.stats.groundContracts || 0) + 1;
    state.log.push('step ' + state.step + ': ground contract ' + card.name +
      ' (+' + fund + ' $ into the fund' + (ip ? ', +' + ip + ' IP' : '') + ')');
    return { ok: true, fund: fund, np: npDelta, vchk: card.vchkDelta || 0, ip: ip };
  };

  E.testLaunch = function (state, kind, opts, rnd) {
    opts = opts || {};
    if (state.testUsed) return { ok: false, reason: 'a test was already run this step' };
    const T = C.testLaunch;
    let cost = 0, np = 0, pm = 0, p = 0, ipKey = null, ipCls = null, spec = null;
    let testedCard = null;
    if (kind === 'stand') {
      spec = T.stand;
      cost = spec.money; pm = spec.pm; np = spec.np;
      p = E.clamp(spec.qBase + spec.qSchool * (state.school || 0), 0.02, spec.qCap);
      testedCard = opts.cardId ? E.card(opts.cardId) : null;
      if (testedCard && !E.isExpCard(testedCard)) testedCard = null;
      ipKey = opts.ipKind || 'instrument';
      ipCls = testedCard ? E.techClassOf(testedCard) : (opts.ipClass || 'camera');
    } else if (kind === 'flightRocket') {
      spec = T.flightRocket;
      const rocket = E.card(opts.rocketId) || CARDS.rockets[0];
      cost = Math.round(rocket.price * spec.rocketShare) + spec.moneyBase;
      pm = spec.pm; np = spec.np;
      p = E.cardPFor(state, rocket, { kind: 'rocket' });
      ipKey = 'rocket'; ipCls = E.techClassOf(rocket);
      testedCard = rocket;
    } else if (kind === 'flightInstrument') {
      spec = T.flightInstrument;
      const rocket = E.card(opts.rocketId) || CARDS.rockets[0];
      const ins = E.card(opts.instrumentId) || CARDS.instruments[0];
      cost = Math.round(rocket.price * spec.rocketShare + ins.price * spec.instrumentShare) + spec.moneyBase;
      pm = spec.pm; np = spec.np;
      p = E.cardPFor(state, ins, { kind: 'instrument' });
      ipKey = 'instrument'; ipCls = E.techClassOf(ins);
      testedCard = ins;
    } else {
      return { ok: false, reason: 'unknown test type' };
    }
    if (cost > state.money) return { ok: false, reason: 'not enough money' };
    if (np > state.np) return { ok: false, reason: 'not enough NP' };
    if (E.pmAvailable(state) < pm) return { ok: false, reason: 'not enough PM' };
    state.money -= cost;
    state.np -= np;
    state.pmPrepUsed += pm;
    state.testUsed = true;
    state.stats.testLaunches++;
    state.stats.testSpent += cost;
    const success = (rnd ? rnd() : Math.random()) < p;
    const ip = success ? spec.ipSuccess : spec.ipFail;
    if (ipKey) E.addIp(state, ipKey, ipCls, ip);
    const expRun = testedCard ? E.addExpRun(state, testedCard, kind) : null;
    let refund = 0;
    if (success && spec.refund) {
      refund = Math.round(cost * spec.refund);
      state.money += refund;
    }
    state.log.push('step ' + state.step + ': test ' + kind + ' → ' + (success ? 'success' : 'failure') +
      ' (+' + ip + ' IP' + (refund ? ', refund ' + refund + ' $' : '') +
      (expRun && expRun.before < expRun.max ? ', risk ' + expRun.runs + '/' + expRun.max : '') + ')');
    return { ok: true, success: success, ip: ip, refund: refund, p: p, cost: cost, expRun: expRun };
  };

  E.standardize = function (state, cardId) {
    const card = E.card(cardId);
    if (!card || !E.isExpCard(card)) return { ok: false, reason: 'not an experimental card' };
    if (!E.isCardAvailable(state, card)) return { ok: false, reason: 'the card is not unlocked yet' };
    if (!state.expSeen || !state.expSeen[cardId]) return { ok: false, reason: 'the card has not been seen in any mission yet' };
    if (!state.standardized) state.standardized = {};
    if (state.standardized[cardId]) return { ok: false, reason: 'already standardised' };
    const kind = card.kind === 'rocket' ? 'rocket' : (card.kind === 'instrument' ? 'instrument' : null);
    if (!kind) return { ok: false, reason: 'not an experimental card' };
    const school = E.schoolFor(state);
    /* Launchers only through CML 3; instruments are opened by school 1+ (or CML 3). */
    const cmlOk = E.techLevel(state, kind, E.techClassOf(card)) >= 3;
    if (!cmlOk && !(kind === 'instrument' && school.standardize)) {
      return { ok: false, reason: kind === 'instrument' ? 'requires CML 3 or school level 1' : 'requires CML 3' };
    }
    const cost = {
      money: Math.round(C.tech.standardizeCost.money * (1 - school.standardizeDiscount)),
      pm: C.tech.standardizeCost.pm || 0,
      np: C.tech.standardizeCost.np || 0
    };
    if (cost.money > state.money) return { ok: false, reason: 'not enough money' };
    const fixedP = E.effectiveCardP(state, card);
    const runs = state.expRuns ? (state.expRuns[cardId] || 0) : 0;
    state.money -= cost.money;
    if (!state.standardP) state.standardP = {};
    /* p is fixed together with the residual risk: standardisation does not "heal" the card. */
    state.standardP[cardId] = fixedP;
    state.standardized[cardId] = true;
    if (!state.expUnlocked) state.expUnlocked = {};
    if (card.nextId) state.expUnlocked[card.nextId] = true;
    state.stats.standardized++;
    state.log.push('step ' + state.step + ': standardised ' + card.name + ' (' + cost.money + ' $, p=' +
      E.round(fixedP, 2) + ', risk ' + runs + '/' + (C.tech.experimental ? C.tech.experimental.riskRuns : 3) + ')' +
      (card.nextId ? '; unlocked: ' + (E.card(card.nextId) ? E.card(card.nextId).name : card.nextId) : ''));
    return {
      ok: true, cost: cost, standardP: fixedP, runs: runs,
      stdId: card.stdId || null, nextId: card.nextId || null
    };
  };

  E.endStep = function (state, rnd, opts) {
    opts = opts || {};
    const expenses = {};
    if (!opts.skipExpire) {
      const deadline = state.production.concat(state.ready).filter(function (p) {
        return p.deadlineStep <= state.step;
      });
      deadline.forEach(function (p) { E.expireMission(state, p, 'deadline'); });
      state.production = state.production.filter(function (p) { return p.deadlineStep > state.step; });
      state.ready = state.ready.filter(function (p) { return p.deadlineStep > state.step; });
    }
    const salary = E.salaryDue(state);
    const paid = Math.min(state.money, salary);
    state.money -= paid;
    state.stats.salaries += paid;
    if (paid < salary) {
      state.vchk = Math.max(0, state.vchk - 1);
      state.log.push('step ' + state.step + ': payroll delayed (−1 VChK)');
    }
    expenses.salary = salary;
    const mcs = E.mcsFor(state);
    if (mcs.upkeep > 0) {
      if (E.canPay(state, mcs.upkeep)) {
        E.pay(state, mcs.upkeep);
        state.stats.upkeep += mcs.upkeep;
        state.mcsPenalty = 0;
      } else {
        state.mcsPenalty = 1;
        state.log.push('step ' + state.step + ': MCC upkeep unpaid until the next step');
      }
      expenses.upkeep = mcs.upkeep;
    }
    E.refillOffers(state, rnd || E.makeRng((state.seed || 1) + state.step * 197));
    state.step++;
    state.pmPrepUsed = 0;
    state.testUsed = false;
    state.tookMission = false;
    return expenses;
  };

  E.finalScore = function (state) {
    const sc = C.campaignScore;
    let techLevels = 0;
    Object.keys(state.tech || {}).forEach(function (kind) {
      Object.keys(state.tech[kind] || {}).forEach(function (cls) {
        techLevels += Math.max(0, state.tech[kind][cls] - C.tech.baseLevel);
      });
    });
    const standardized = Object.keys(state.standardized || {}).length;
    const rescues = state.stats ? state.stats.rescues : 0;
    const penalties = state.stats ? state.stats.failStreakPenalties : 0;
    const rating = state.rating || 0;
    const vchkPart = 0.5 * (state.vchk || 0);
    const techPart = sc.perTechLevel * techLevels;
    const stdPart = sc.perStandardized * standardized;
    const mcsPart = sc.perMcsLevel * (state.mcsLevel || 0);
    const schoolLevel = state.school || 0;
    const schoolPart = sc.perSchoolLevel * schoolLevel;
    const rescuePart = sc.perRescue * rescues;
    const penaltyPart = sc.perFailStreak * penalties;
    return {
      rating: E.round(rating, 1),
      vchk: E.round(state.vchk || 0, 1),
      vchkPart: E.round(vchkPart, 1),
      techLevels: techLevels,
      techPart: techPart,
      standardized: standardized,
      stdPart: stdPart,
      mcsLevel: state.mcsLevel || 0,
      mcsPart: mcsPart,
      schoolLevel: schoolLevel,
      schoolPart: schoolPart,
      rescues: rescues,
      rescuePart: rescuePart,
      failStreakPenalties: penalties,
      penaltyPart: penaltyPart,
      total: E.round(rating + vchkPart + techPart + stdPart + mcsPart + schoolPart + rescuePart + penaltyPart, 1)
    };
  };

  /* ---------- The campaign bot policy ---------- */
  E.policyChooseMission = function (state) {
    if (state.production.length >= C.campaign.productionSlots) return null;
    let best = null;
    state.offers.slice().forEach(function (id) {
      const mission = MISSIONS.find(function (m) { return m.id === id; });
      if (!mission) return;
      const choice = E.campaignBuild(state, mission);
      if (!choice) return;
      if (choice.pmRate > E.pmAvailable(state)) return;
      if (choice.prodTime > choice.compute.deadline) return;
      if (state.step + choice.prodTime > state.maxSteps) return;
      const c = choice.compute;
      const expected = c.pSuccess * c.dRating + 0.5 * c.pSuccess * c.dVchk
        + (c.pSuccess >= 0.65 ? 12 : 0) + (state.visited[mission.point] ? 0 : 8)
        - c.price / 120 - choice.pmRate * 0.18;
      if (expected < 1.5) return;
      if (!best || expected > best.expected) best = { mission: mission, choice: choice, expected: expected };
    });
    return best;
  };

  E.policyPrepare = function (state, rnd) {
    state.stats.prepSteps++;
    const nextMcs = (state.mcsLevel || 0) + 1;
    const reqManagers = nextMcs <= C.mcs.maxLevel ? C.mcs.managersRequired[nextMcs] : 0;

    /* 1. A manager, if one is missing for the next MCC level. */
    if (nextMcs <= C.mcs.maxLevel && (state.managers || 0) < reqManagers) {
      if (E.hireManager(state).ok) return 'hire';
    }

    /* 1b. MCC overload: widen the channels before the factory. */
    const load = E.opsLoad(state);
    if (load.overload > 0 && nextMcs <= C.mcs.maxLevel && E.mcsUpgrade(state).ok) return 'mcs';

    /* 2. Factory: the main constraint is the production load. */
    const nextFactory = (state.factory || 0) + 1;
    if (nextFactory <= 4) {
      const fc = C.campaign.factoryUpgrades[nextFactory - 1];
      if (state.rating >= fc.rating && state.money >= fc.money && E.pmAvailable(state) >= fc.pm) {
        if (E.upgradeFactory(state).ok) return 'factory';
      }
    }

    /* 3. MCC. */
    if (nextMcs <= C.mcs.maxLevel && E.mcsUpgrade(state).ok) return 'mcs';

    /* 4. School: instrument reliability and the preparation PM discount. */
    const nextSchool = (state.school || 0) + 1;
    const schoolCost = E.schoolUpgradeCost(nextSchool);
    if (schoolCost && state.step <= state.maxSteps - 4 && state.rating >= schoolCost.rating &&
      state.money >= schoolCost.money + 60 && state.np >= schoolCost.np && E.pmAvailable(state) >= schoolCost.pm) {
      if (E.upgradeSchool(state).ok) return 'school';
    }

    /* 5. R&D: the class with the largest IP reserve. */
    let techBest = null;
    ['rocket', 'instrument'].forEach(function (kind) {
      Object.keys(state.tech[kind]).forEach(function (cls) {
        const lvl = state.tech[kind][cls];
        if (lvl >= C.tech.maxLevel) return;
        const target = lvl + 1;
        const ip = E.ipFor(state, kind, cls);
        const need = C.tech.ipThresholds[target] || 0;
        if (ip < need) return;
        const cost = E.techUpgradeCost(target);
        if (state.money < cost.money || state.np < cost.np || E.pmAvailable(state) < cost.pm) return;
        const score = ip - need + (kind === 'instrument' ? 0.1 : 0);
        if (!techBest || score > techBest.score) techBest = { kind: kind, cls: cls, score: score };
      });
    });
    if (techBest && E.upgradeTech(state, techBest.kind, techBest.cls).ok) return 'tech';

    /* 6. Standardisation: launchers — CML 3, instruments — school 1+. */
    const expId = Object.keys(state.expSeen || {}).find(function (id) {
      if (state.standardized[id]) return false;
      const card = E.card(id);
      if (!card || !E.isExpCard(card)) return false;
      const kind = card.kind === 'rocket' ? 'rocket' : 'instrument';
      const cmlOk = E.techLevel(state, kind, E.techClassOf(card)) >= 3;
      const schoolOk = kind === 'instrument' && E.schoolFor(state).standardize;
      if (!cmlOk && !schoolOk) return false;
      const price = Math.round(C.tech.standardizeCost.money * (1 - E.schoolFor(state).standardizeDiscount));
      return state.money >= price;
    });
    if (expId && E.standardize(state, expId).ok) return 'standardize';

    /* 7. Tests: a stand run in the first half of the campaign. */
    if ((state.stats.testLaunches || 0) < 3 && state.step <= 10 && state.money >= 250) {
      if (E.testLaunch(state, 'stand', { ipKind: 'instrument', ipClass: 'camera' }, rnd).ok) return 'test';
    }

    /* 7b. Acceptance overtime: a cheap S gain on a promising flight. */
    if (state.money >= 500 && state.step < state.maxSteps) {
      const target = state.flights.find(function (f) {
        return !f.ended && !f.earlyEnd && (f.overtime || 0) === 0 &&
          f.compute.sDet >= f.compute.target;
      });
      if (target && E.overtime(state, target.missionId).ok) return 'overtime';
    }

    /* 8. PR — a sink for surplus money into VChK. */
    if (state.money >= 900 && state.step <= state.maxSteps - 2) {
      if (E.prAction(state).ok) return 'pr';
    }
    return 'save';
  };

  E.simulateCampaign = function (seed) {
    const state = E.campaignSetup(seed);
    const rnd = E.makeRng(((seed == null ? 1 : seed) * 2654435761) >>> 0 || 7);
    const steps = C.campaign.steps;
    for (let step = 1; step <= steps; step++) {
      state.step = step;
      state.pmPrepUsed = 0;
      state.testUsed = false;
      state.tookMission = false;
      E.advanceProduction(state);
      E.launchReady(state, null, rnd);
      E.stepFlights(state, rnd);
      if (step === steps && C.campaign.finalWindow) E.launchReady(state, null, rnd, true);
      const actions = state.hadMissionLast ? C.campaign.prepActions : C.campaign.skipPrepActions;
      for (let a = 0; a < actions; a++) E.policyPrepare(state, rnd);
      let guard = 0;
      while (guard++ < C.campaign.productionSlots + 1) {
        const pick = E.policyChooseMission(state);
        if (!pick) break;
        const res = E.acceptMission(state, pick.mission.id, pick.choice);
        if (!res.ok) break;
        state.tookMission = true;
      }
      state.hadMissionLast = state.tookMission;
      E.endStep(state, rnd, { skipExpire: step === steps && C.campaign.finalWindow });
    }
    E.advanceProduction(state);
    E.launchReady(state, null, rnd, true);
    E.stepFlights(state, rnd);
    E.finalizeFlights(state, rnd);
    E.failRemaining(state, 'end of campaign');
    state.step = steps;
    state.score = E.finalScore(state);
    return state;
  };

  E.runCampaignMonteCarlo = function (games, baseSeed) {
    games = games || 100; baseSeed = baseSeed || 20260101;
    const acc = {
      score: 0, rating: 0, vchk: 0, missions: 0, success: 0, partial: 0, fail: 0,
      money: 0, fund: 0, mcs: 0, tech: 0, std: 0, tests: 0, rescues: 0,
      expired: 0, p: 0, price: 0, accepted: 0, maxStreak: 0, failStreakPenalties: 0,
      factory: 0, managers: 0, prep: 0, school: 0
    };
    const gamesArr = [];
    for (let i = 0; i < games; i++) {
      const g = E.simulateCampaign(baseSeed + i * 7919);
      acc.score += g.score.total; acc.rating += g.rating; acc.vchk += g.vchk;
      acc.missions += g.stats.missions; acc.success += g.stats.success;
      acc.partial += g.stats.partial; acc.fail += g.stats.fail;
      acc.money += g.money; acc.fund += g.groundFund; acc.mcs += g.mcsLevel;
      acc.tech += g.score.techLevels; acc.std += g.stats.standardized;
      acc.tests += g.stats.testLaunches; acc.rescues += g.stats.rescues;
      acc.expired += g.stats.expired; acc.p += g.stats.pSum; acc.price += g.stats.priceSum;
      acc.accepted += g.stats.accepted; acc.maxStreak += g.stats.maxFailStreak;
      acc.failStreakPenalties += g.stats.failStreakPenalties;
      acc.factory += g.factory; acc.managers += g.managers; acc.prep += g.stats.prepSteps;
      acc.school += g.school || 0;
      gamesArr.push(g);
    }
    const n = games, nm = Math.max(1, acc.missions);
    const pct = function (x) { return E.round(100 * x / nm, 1); };
    return {
      games: n,
      avgScore: E.round(acc.score / n, 1),
      avgRating: E.round(acc.rating / n, 1),
      avgVchk: E.round(acc.vchk / n, 1),
      avgMissions: E.round(acc.missions / n, 1),
      avgAccepted: E.round(acc.accepted / n, 1),
      successRate: pct(acc.success),
      partialRate: pct(acc.partial),
      failRate: pct(acc.fail),
      expiredRate: pct(acc.expired),
      avgMoney: E.round(acc.money / n, 0),
      avgFund: E.round(acc.fund / n, 0),
      avgMcs: E.round(acc.mcs / n, 1),
      avgTech: E.round(acc.tech / n, 1),
      avgStandardized: E.round(acc.std / n, 1),
      avgTests: E.round(acc.tests / n, 1),
      avgRescues: E.round(acc.rescues / n, 1),
      avgFactory: E.round(acc.factory / n, 1),
      avgManagers: E.round(acc.managers / n, 1),
      avgSchool: E.round(acc.school / n, 2),
      avgPrice: E.round(acc.price / nm, 0),
      avgPSuccess: E.round(acc.p / nm, 3),
      avgMaxFailStreak: E.round(acc.maxStreak / n, 1),
      avgStreakPenalties: E.round(acc.failStreakPenalties / n, 1),
      gamesArr: gamesArr,
      scoreOk: acc.score / n >= 80,
      missionOk: acc.missions / n >= 9 && acc.missions / n <= 14,
      failOk: pct(acc.fail) >= 13 && pct(acc.fail) <= 33,
      moneyOk: Math.abs(acc.money / n) <= 2000
    };
  };

  /* ---------- The §25 validator ---------- */
  E.runMonteCarlo = function (games, baseSeed) {
    games = games || 200; baseSeed = baseSeed || 1;
    const acc = {
      rating: 0, vchk: 0, fail: 0, partial: 0, succ: 0, skipped: 0, dup: 0, exp: 0, expSubsystem: 0, powerExp: 0,
      salvage: 0, money: 0, missions: 0, p: 0, price: 0, eng: 0, sci: 0, man: 0,
      launch: 0, collect: 0, channel: 0, physical: 0, ok: 0, dupRocket: 0, dupCtrl: 0,
      expCards: {}
    };
    const gamesArr = [];
    for (let i = 0; i < games; i++) {
      const g = E.simulateGame(baseSeed + i * 7919);
      acc.rating += g.rating; acc.vchk += g.vchk;
      acc.fail += g.fail; acc.partial += g.partial; acc.succ += g.succ;
      acc.skipped += g.skipped; acc.dup += g.dup; acc.exp += g.exp; acc.expSubsystem += g.expSubsystem; acc.powerExp += g.powerExp; acc.salvage += g.salvage;
      Object.keys(g.expCards).forEach(function (id) { acc.expCards[id] = (acc.expCards[id] || 0) + g.expCards[id]; });
      acc.dupRocket += g.dupRocket; acc.dupCtrl += g.dupCtrl;
      acc.money += g.money; acc.missions += g.missions; acc.p += g.pSum; acc.price += g.priceSum;
      acc.eng += g.roles.eng; acc.sci += g.roles.sci; acc.man += g.roles.man;
      acc.launch += g.stages.launch; acc.collect += g.stages.collect;
      acc.channel += g.stages.channel; acc.physical += g.stages.physical; acc.ok += g.stages.ok;
      gamesArr.push(g);
    }
    const n = games, nm = Math.max(1, acc.missions);
    const pct = function (x) { return E.round(100 * x / nm, 1); };
    return {
      games: n,
      avgRating: E.round(acc.rating / n, 1),
      avgVchk: E.round(acc.vchk / n, 1),
      failRate: pct(acc.fail),
      partialRate: pct(acc.partial),
      successRate: pct(acc.succ),
      dupRate: pct(acc.dup),
      dupRocketRate: pct(acc.dupRocket),
      dupCtrlRate: pct(acc.dupCtrl),
      expRate: pct(acc.exp),
      expSubsystemRate: pct(acc.expSubsystem),
      powerExpRate: pct(acc.powerExp),
      expCards: acc.expCards,
      salvageRate: pct(acc.salvage),
      skipRate: pct(acc.skipped),
      avgMoney: E.round(acc.money / n, 0),
      avgMissions: E.round(acc.missions / n, 1),
      avgPrice: E.round(acc.price / nm, 0),
      avgPSuccess: E.round(acc.p / nm, 3),
      stages: { launch: pct(acc.launch), collect: pct(acc.collect), channel: pct(acc.channel), physical: pct(acc.physical), ok: pct(acc.ok) },
      avgRoles: { eng: E.round(acc.eng / n, 1), sci: E.round(acc.sci / n, 1), man: E.round(acc.man / n, 1) },
      ratingOk: acc.rating / n > 40,
      failOk: pct(acc.fail) >= 15 && pct(acc.fail) <= 35,
      gamesArr: gamesArr
    };
  };

  root.ENGINE = E;
})(typeof globalThis !== 'undefined' ? globalThis : this);
