/* Space Mission Design — CONFIG v1.5 (variant B: "payload to the target")
* The single source of numbers for the calculator, the printed cards and Monte Carlo.
* Base: the paper rules v1.1 §13 + CONFIG_V12.
* New in v1.3: points with a k factor, trajectories, power/channel buses,
* the mission contract, physical modules, facility stages 0-4.
* New in v1.4: a 15-step campaign, MCC 0-4, R&D/CML, tests,
* the science school 0-4, the ground-segment fund and the final score.
* New in v1.5: flight operations — flight steps, MCC channels, communication
* sessions, flight events, acceptance with overtime and early closing (campaign.ops).
 */
(function (root) {
  const CONFIG = {
    version: 'v1.5',
    rules: 'rul.txt v1.1 + 15.txt v1.2 + v1.3 §16-§19 + v1.4 §1-§10 + v1.5 §11',

    start: { money: 1200, np: 50, pm: 40, vchk: 10, rating: 0 },
    missionsTotal: 10,

    /* ---------- Campaign v1.4 ---------- */
    campaign: {
      steps: 15,
      shortSteps: 12,
      longSteps: 18,
      showcase: 3,
      productionSlots: 3,
      prepActions: 1,
      skipPrepActions: 2,
      pmOverhead: 10,          // integration and tests for every mission
      groundFundStart: 150,
      groundFundShare: 0.10,   // the share of every advance
      groundFundTopUp: 1.0,    // 1 $ of cash per 1 $ of the fund
      preparationPm: 0,        // the preparation PM comes from the free step limit
      pmSpread: 0.40,          // the share of the deadline over which the mission PM is spread
      finalWindow: true,
      startManagers: 2,
      startFactory: 0,
      startSchool: 0,
      staff: { 1: 4, 2: 3, 3: 1 },
      factoryUpgrades: [
        { level: 1, money: 150, pm: 30, np: 0, rating: 60, effect: '+10 PM/step' },
        { level: 2, money: 250, pm: 40, np: 0, rating: 70, effect: '+20 PM/step, −10% engineer attrition' },
        { level: 3, money: 400, pm: 50, np: 0, rating: 80, effect: '+30 PM/step' },
        { level: 4, money: 600, pm: 60, np: 0, rating: 90, effect: '+40 PM/step, −1 production cycle' }
      ],
      schoolUpgrades: [
        { level: 1, money: 200, pm: 25, np: 20, rating: 0,  effect: '+3% instrument p, −5% preparation PM, instrument standardisation, −15% MCC overload penalty' },
        { level: 2, money: 300, pm: 35, np: 30, rating: 0,  effect: '+4% p, −10% preparation PM, −30% MCC overload penalty' },
        { level: 3, money: 450, pm: 45, np: 35, rating: 30, effect: '+5% p, −15% preparation PM, standardisation −20% price, −45% MCC overload penalty' },
        { level: 4, money: 650, pm: 55, np: 40, rating: 55, effect: '+6% p, −20% preparation PM, +1 control slot, −60% MCC overload penalty' }
      ],
      hireManager: { money: 100, np: 10 },
      pr: { money: 100, vchk: 2, rating: 1 },

      /* ---------- v1.5: flight operations (§26–§31) ----------
      * After lift-off a mission flies for `flight` steps. Every step is a communication
      * session (a slice of science), a possible flight event and the human-factor risk
      * of an MCC overload. p_channel is still rolled once — at acceptance.
       */
      ops: {
        capacity: [2, 3, 4, 5, 6],      // MCC "channels" at the same time, levels 0-4
        loadVideo: 1,                    // video/a large stream takes +1 channel
        loadDeep: 1,                     // deep space +1 channel while the MCC is below deepFromLevel
        deepFromLevel: 3,
        flightBase: { leo: 1, geo: 2, moon: 2, mars: 3, deep: 3, belt: 3 },
        flightLongMissionTime: 36,       // missionTime ≥ the threshold → +1 flight step
        flightMax: 4,
        pIncidentBase: 0.05,
        pIncidentPerOverload: 0.04,
        pIncidentCap: 0.30,
        pIncidentSchoolRelief: 0.15,     // −15% of the channel penalty per school level
        pIncidentSchoolReliefMax: 0.60,  // in total no more than −60%
        incidentWeights: { lostSession: 0.5, commandError: 0.3, instrumentFault: 0.2 },
        opsEventChance: 0.18,            // per flight step
        opsEventSchoolReduction: 0.01,   // per school level
        opsEventMinChance: 0.12,
        earlyEndSFactor: 0.6,            // early end of the flight
        dataFloor: 0.75,                 // the share of data that survives lost sessions (onboard storage)
        accrualBonus: 1.07,              // continuous flight tracking: +7% to S at acceptance
        overtime: { money: 50, max: 2, sBonusPerStep: 0.08 },
        loadPlanSteps: 3
      }
    },

    /* ---------- MCC: levels 0-4 ---------- */
    mcs: {
      maxLevel: 4,
      capacity: [1, 2, 2, 3, 3],
      pChannel: [0.00, 0.02, 0.04, 0.06, 0.08],
      sFactor: [1.00, 1.03, 1.06, 1.09, 1.12],
      vchkPerSuccess: [0.0, 0.5, 1.0, 1.5, 2.0],
      deepChannel: [0.00, 0.00, 0.00, 0.05, 0.10],
      managersRequired: [0, 2, 3, 4, 5],
      upgradeCost: [
        null,
        { money: 200, pm: 20, np: 15, rating: 30 },
        { money: 350, pm: 30, np: 25, rating: 50 },
        { money: 500, pm: 40, np: 35, rating: 70 },
        { money: 700, pm: 50, np: 45, rating: 90 }
      ],
      upkeep: [0, 5, 10, 15, 20],
      names: ['Rented station', 'Tracking station', 'Mission control centre', 'Deep-space network', 'Global network']
    },

    /* ---------- R&D / CML ---------- */
    tech: {
      baseLevel: 1,
      maxLevel: 4,
      pPerLevel: 0.02,
      pCap: 0.06,
      ipThresholds: { 2: 2, 3: 3, 4: 4 },
      upgradeCost: { money: 100, np: 10, pm: 5 }, // × the target level
      standardizeCost: { money: 100, pm: 0, np: 0 },
      /* The experimental ladder: exp1 → std1 → exp2 → std2.
      * The risk applies only to the experimental card and drops over 3 runs
      * (launch, flight test, stand). Standardisation fixes the current p
      * without clearing the residual risk.
       */
      experimental: {
        riskPenalty: 0.10,
        riskRuns: 3,
        nextFactor: 1.2,
        priceFactor: 1.1,
        maxGeneration: 2,
        /* An experimental launch/test draws on shared resources, so the approval is
        * signed by all three headquarters specialists. */
        approvalRoles: ['engineer', 'scientist', 'manager']
      },
      rocketClasses: ['light', 'medium', 'heavy', 'superheavy'],
      instrumentClasses: ['camera', 'spectrometer', 'radiometer', 'magnetometer'],
      names: {
        light: 'Light launcher', medium: 'Medium launcher', heavy: 'Heavy launcher',
        superheavy: 'Super-heavy launcher',
        camera: 'Camera', spectrometer: 'Spectrometer', radiometer: 'Radiometer',
        magnetometer: 'Magnetometer'
      }
    },

    /* ---------- Salaries and tests ---------- */
    salaries: { 1: 3, 2: 5, 3: 8 },
    testLaunch: {
      stand: { money: 50, pm: 10, np: 5, ipSuccess: 1, ipFail: 0, qBase: 0.75, qSchool: 0.05, qCap: 0.95 },
      flightRocket: { moneyBase: 20, rocketShare: 0.50, pm: 10, np: 0, ipSuccess: 2, ipFail: 1, refund: 0.50 },
      flightInstrument: { moneyBase: 20, rocketShare: 0.50, instrumentShare: 0.50, pm: 10, np: 0, ipSuccess: 2, ipFail: 1, refund: 0.50 }
    },

    /* ---------- Final score v1.4 ---------- */
    campaignScore: {
      perTechLevel: 5,
      perStandardized: 5,
      perMcsLevel: 5,
      perSchoolLevel: 5,
      perRescue: 20,
      perFailStreak: -10
    },

    /* ---------- Launchers: the base set of the paper rules ---------- */
    capacity: { light: 2, medium: 6, heavy: 15, superheavy: 30 },
    busPower: { light: 150, medium: 300, heavy: 600, superheavy: 1000 },
    busChannel: { light: 5, medium: 10, heavy: 25, superheavy: 50 },

    /* ---------- Points: k is how many times a point is "more expensive" than LEO in mass ---------- */
    points: {
      leo:  { name: 'Earth orbit',    k: 1.0,  solar: 1.00, channel: 1.00, chRel: 1.00 },
      geo:  { name: 'Geostationary orbit',    k: 2.0,  solar: 1.00, channel: 1.00, chRel: 1.00 },
      moon: { name: 'the Moon',            k: 6.0,  solar: 0.70, channel: 0.90, chRel: 0.95 },
      deep: { name: 'deep space', k: 8.0,  solar: 0.10, channel: 0.50, chRel: 0.85 },
      mars: { name: 'Mars',            k: 12.0, solar: 0.45, channel: 0.80, chRel: 0.92 },
      belt: { name: 'the asteroid belt', k: 20.0, solar: 0.20, channel: 0.60, chRel: 0.88 }
    },

    /* ---------- Trajectories: a multiplier on k, a deadline, a window, requirements ---------- */
    trajectories: {
      direct:  { name: 'direct transfer',        kMult: 1.00, deadlineDelta: 0,  pBonus: 0, window: 1.00, requires: [] },
      fast:    { name: 'fast transfer',       kMult: 1.15, deadlineDelta: -1, pBonus: 0, window: 1.00, requires: [] },
      assist:  { name: 'gravity assist', kMult: 0.85, deadlineDelta: 2,  pBonus: 0, window: 1.00, requires: [] },
      orbit:   { name: 'orbital insertion',       kMult: 0.90, deadlineDelta: 1,  pBonus: 0, window: 1.00, requires: [] },
      landing: { name: 'direct landing',        kMult: 1.00, deadlineDelta: 0,  pBonus: 0, window: 1.00, requires: ['lander'] },
      relay:   { name: 'relay link',    kMult: 1.05, deadlineDelta: 1,  pBonus: 0, window: 1.00, requires: ['relay'] },
      polar:   { name: 'polar orbit',       kMult: 1.03, deadlineDelta: 0,  pBonus: 0, window: 0.60, requires: [] },
      low:     { name: 'low periodic orbit',  kMult: 1.00, deadlineDelta: -1, pBonus: 0, window: 0.35, requires: [] },
      geo:     { name: 'GEO insertion',          kMult: 1.00, deadlineDelta: 0,  pBonus: 0, window: 1.00, requires: [] }
    },

    /* ---------- Data ---------- */
    dataTypes: {
      video:     { name: 'video',      coeff: 1.0 },
      spectrum:  { name: 'spectrum',     coeff: 0.4 },
      telemetry: { name: 'telemetry', coeff: 0.1 }
    },
    buffer: { efficiencyWithout: 0.8, efficiencyWith: 1.0 },

    /* ---------- Mass and power ---------- */
    mass: { serviceFactor: 1.10, adapterKg: 10 },
    power: { overheadW: 20, margin: 1.2 },

    /* ---------- Success criteria §9 plus the v1.3 correction ---------- */
    success: {
      pMin: 0.5,
      sMinFactor: 0.7,
      partialFactor: 0.3,
      bonus: 0.1,
      minDataRatioForFull: 0.5  // a soft check: below it a full success is simply forbidden
    },

    /* ---------- Points ---------- */
    score: {
      ratingPerS: 0.21,   // v1.3 calibration: the target is rating > 40; at 0.10 the average is ≈ 12
      vchkPerS: 0.05,
      failRating: -4,     // the paper says −5; −4 keeps the failure share inside 15-35%
      failVCHK: -3,
      partialRatingFactor: 0.5,
      partialVCHKFactor: 0.5
    },
    uniqueness: { first: 1.5, repeat: 0.8 },

    /* ---------- Mission contract (§11) ----------
    * The original rules had no income, while ten missions cost $4000-9000.
    * The decision: the contract advance pays for the hardware, the bonus is the profit.
     */
    contractReward: {
      base: 250,
      perComplexity: 200,
      point: { leo: 0, geo: 80, moon: 250, mars: 500, deep: 700, belt: 800 },
      bonusFactor: 0.25,
      partialBonus: 0.5,
      capFactor: 1.35
    },
    // Not used by the v1.3 engine; kept for compatibility and a future campaign.
    priceAdjust: { success: -0.05, fail: 0.05 },

    /* ---------- Salvage missions ---------- */
    salvage: { money: 50, np: 10, pm: 15, dataRecovery: 0.5, chance: 0.35, p: 0.75 },

    /* ---------- Facilities: stages 0-4 (§18) ---------- */
    facilities: {
      factory: {
        name: 'Factory',
        stages: [
          { level: 0, name: 'No factory',                pm: 0,  effect: '—' },
          { level: 1, name: 'Assembly shop',             pm: 10, effect: '+10 PM/cycle, launcher standardisation' },
          { level: 2, name: 'Factory upgrade',            pm: 20, effect: '+20 PM/cycle, −10% engineer attrition' },
          { level: 3, name: 'Automated line',  pm: 30, effect: '+30 PM/cycle, standardisation −20% price' },
          { level: 4, name: 'Orbital shipyard',         pm: 40, effect: '+40 PM/cycle, −1 launcher production cycle' }
        ]
      },
      school: {
        name: 'Science school',
        stages: [
          { level: 0, name: 'No school',               reliability: 0.00, pmFactor: 1.00, standardize: false, standardizeDiscount: 0,    slotsBonus: 0, effect: '—' },
          { level: 1, name: 'Institute',                reliability: 0.03, pmFactor: 0.95, standardize: true,  standardizeDiscount: 0,    slotsBonus: 0, effect: '+3% instrument p, −5% preparation PM, instrument standardisation, −15% MCC overload penalty' },
          { level: 2, name: 'School upgrade',           reliability: 0.04, pmFactor: 0.90, standardize: true,  standardizeDiscount: 0,    slotsBonus: 0, effect: '+4% p, −10% preparation PM, −30% MCC overload penalty' },
          { level: 3, name: 'Campus with observatories', reliability: 0.05, pmFactor: 0.85, standardize: true,  standardizeDiscount: 0.20, slotsBonus: 0, effect: '+5% p, −15% preparation PM, standardisation −20% price, −45% MCC overload penalty' },
          { level: 4, name: 'Science megacomplex',    reliability: 0.06, pmFactor: 0.80, standardize: true,  standardizeDiscount: 0.20, slotsBonus: 1, effect: '+6% p, −20% preparation PM, +1 control slot, −60% MCC overload penalty' }
        ]
      }
    },

    /* ---------- Events ---------- */
    events: {
      advertising: { chance: 0.30, moneyBase: 10, moneyPerRating: 0.3 },
      accident: { chance: 0.10, extraCycles: 1, pmPenalty: 5 },
      breakthrough: { chance: 0.05, npMin: 80, factor: 1.1 },
      popularity: { ratingMin: 40, vchkMin: 30 }
    },

    missionDefaults: { observeTime: 6, missionTime: 30, complexity: 1.0 },

    /* ---------- Print runs for the cards (print/cards.html) ----------
    * Launchers, reservations and FCS keep their copies inside the card (consumables).
    * Here — the print runs of the remaining decks.
     */
    deckCopies: {
      ins_camera: 8, ins_spectrometer: 7, ins_radiometer: 6, ins_magnetometer: 6, ins_exp: 1,
      ant_small: 6, ant_medium: 5, ant_large: 4, ant_xl: 2, ant_exp: 2, ant_dup: 2,
      pwr_solar_small: 6, pwr_solar_medium: 4, pwr_solar_large: 3, pwr_reactor: 2, pwr_exp: 2,
      buf_1: 6, buf_2: 4, buf_5: 2, buf_10: 1,
      phy_capsule: 3, phy_lander: 4, phy_rover: 3, phy_manipulator: 4, phy_relay: 2,
      aux_fairing: 2, aux_adapter: 2, aux_truss: 2, aux_radiator: 2, aux_boom: 2,
      aux_cover: 2, aux_solar_drive: 2, aux_flag: 2
    }
  };

  root.CONFIG = CONFIG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
