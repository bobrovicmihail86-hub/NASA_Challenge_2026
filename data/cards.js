/* Space Mission Design — the card decks (v1.3, variant B)
* The source of the numbers: docs/RULES_V15.md §1–§13, §18.
* Every card is a plain object; printing in print/cards.html, calculation in calc/index.html.
 */
(function (root) {
  const cards = {

    /* ================= UPPER STAGES (engineer) ================= */
    rockets: [
      { id: 'rocket_light', kind: 'rocket', name: 'Upper stage "Light"', cls: 'light', copies: 8,
        payload: 2, p: 0.88, price: 110, cycles: 1, pm: 8, np: 5, busPower: 150, busChannel: 5,
        art: 'assets/rocket_light.png',
        text: 'Up to 2 t to LEO. The workhorse of near-Earth missions: cheap and fast, but only a 150 W bus and a 5 Mbit/s channel. The card is spent on launch.' },
      { id: 'rocket_medium', kind: 'rocket', name: 'Upper stage "Medium"', cls: 'medium', copies: 6,
        payload: 6, p: 0.85, price: 200, cycles: 2, pm: 14, np: 10, busPower: 300, busChannel: 10,
        art: 'assets/rocket_medium.png',
        text: 'Up to 6 t to LEO. Carries 2-3 instruments and reaches the Moon or Mars under a moderate load.' },
      { id: 'rocket_heavy', kind: 'rocket', name: 'Upper stage "Heavy"', cls: 'heavy', copies: 5,
        payload: 15, p: 0.82, price: 370, cycles: 3, pm: 24, np: 18, busPower: 600, busChannel: 25,
        art: 'assets/rocket_heavy.png',
        text: 'Up to 15 t to LEO. Return capsule, rover, a full science suite.' },
      { id: 'rocket_superheavy', kind: 'rocket', name: 'Upper stage "Super-heavy"', cls: 'superheavy', copies: 2,
        payload: 30, p: 0.78, price: 660, cycles: 4, pm: 40, np: 30, busPower: 1000, busChannel: 50,
        art: 'assets/rocket_superheavy.png',
        text: 'Up to 30 t to LEO. Flagship missions to the asteroid belt and deep space.' },
      { id: 'rocket_exp', kind: 'rocket', name: 'Upper stage "Experimental I"', cls: 'exp', copies: 1,
        payload: 12, p: 0.58, price: 140, cycles: 4, pm: 20, np: 16, busPower: 390, busChannel: 13,
        art: 'assets/rocket_exp.png',
        experimental: true, generation: 1, baseClass: 'medium',
        stdId: 'rocket_std1', nextId: 'rocket_exp2',
        text: 'First generation: +20% to the base class, but p is 10 points lower. The risk falls over 3 launches; standardisation freezes the current p.' }
    ],

    /* ================= EXPERIMENTAL LADDER: LAUNCHERS =================
     * exp1 (rocket_exp) → std1 → exp2 → std2.
     * The std cards become available after the source exp card is standardised; exp2
     * opens together with std1. The p of a std card comes from state.standardP,
     * so the residual risk cannot be cleared by standardisation.
     */
    standardRockets: [
      { id: 'rocket_std1', kind: 'rocket', name: 'Upper stage "Standard I"', cls: 'exp',
        payload: 12, p: 0.58, price: 140, cycles: 4, pm: 20, np: 16, busPower: 390, busChannel: 13,
        art: 'assets/rocket_exp.png',
        standard: true, sourceId: 'rocket_exp', generation: 1, baseClass: 'medium',
        text: 'The standardised first generation: p is frozen at the moment of standardisation, the launch risk is gone.' },
      { id: 'rocket_std2', kind: 'rocket', name: 'Upper stage "Standard II"', cls: 'exp',
        payload: 14.4, p: 0.58, price: 154, cycles: 4, pm: 24, np: 19, busPower: 468, busChannel: 15.6,
        art: 'assets/rocket_exp.png',
        standard: true, sourceId: 'rocket_exp2', generation: 2, baseClass: 'medium',
        text: 'The standardised second generation: +20% over std1, p frozen after the test flights.' }
    ],
    experimentalRockets: [
      { id: 'rocket_exp2', kind: 'rocket', name: 'Upper stage "Experimental II"', cls: 'exp',
        payload: 14.4, p: 0.58, price: 154, cycles: 4, pm: 24, np: 19, busPower: 468, busChannel: 15.6,
        art: 'assets/rocket_exp.png',
        experimental: true, generation: 2, sourceId: 'rocket_std1', unlockAfter: 'rocket_exp',
        baseClass: 'medium', stdId: 'rocket_std2',
        text: 'Second generation: +20% over std1, p is 10 points lower again and recovers over 3 launches.' }
    ],

    /* ================= RESERVATION UNITS (engineer) ================= */
    reservations: [
      { id: 'res_single', kind: 'reservation', name: 'Reservation unit "Single"', t: 'none', copies: 8,
        priceFactor: 1.0, massFactor: 1.0, dispersion: 1.0,
        text: 'p\' = p. Baseline reliability, no surcharge and no extra mass. The card is spent on launch.' },
      { id: 'res_double', kind: 'reservation', name: 'Reservation unit "Double"', t: 'double', copies: 3,
        priceFactor: 1.6, massFactor: 1.15, dispersion: 1.0,
        text: 'p\' = 1 - (1 - p)^2. The light launcher goes from 0.88 to 0.986. Price x1.6, mass x1.15. 3 copies in the deck, spent on launch.' },
      { id: 'res_exp', kind: 'reservation', name: 'Reservation unit "Experimental"', t: 'plus', copies: 4,
        priceFactor: 1.6, massFactor: 1.10, dispersion: 1.5,
        text: 'p\' = p + 0.05, but sigma x1.5. Price x1.6, mass x1.10.' }
    ],

    /* ================= FLIGHT CONTROL SYSTEMS (scientist) ================= */
    control: [
      { id: 'ctrl_basic', kind: 'control', name: 'Flight control system "Basic"', slots: 3, mass: 20, copies: 8,
        watts: 20, price: 60, np: 6, pm: 4, dup: 'none',
        text: '3 instrument slots. No redundancy: P_assembly = product of p. Spent on launch.' },
      { id: 'ctrl_advanced', kind: 'control', name: 'Flight control system "Advanced"', slots: 5, mass: 35, copies: 6,
        watts: 30, price: 120, np: 10, pm: 6, dup: 'none',
        text: '5 slots, more mass and power, but no redundancy.' },
      { id: 'ctrl_redundant', kind: 'control', name: 'Flight control system "Redundant"', slots: 5, mass: 50, copies: 3,
        watts: 40, price: 200, np: 16, pm: 8, dup: 'double',
        text: '5 slots. Duplicates the WHOLE instrument assembly: P_assembly\' = 1 - (1 - P_assembly)^2. 3 copies in the deck.' },
      { id: 'ctrl_exp', kind: 'control', name: 'Flight control system "Experimental"', slots: 6, mass: 45, copies: 2,
        watts: 45, price: 200, np: 12, pm: 8, dup: 'exp',
        text: '6 slots. P_assembly + 0.05, but the variance is x1.5. Priced like the redundant FCS.' }
    ],

    /* ================= INSTRUMENTS (scientist) ================= */
    instruments: [
      { id: 'ins_camera', kind: 'instrument', techClass: 'camera', name: 'Video camera', mass: 40, watts: 60, bw: 20,
        price: 75, np: 10, pm: 6, p: 0.86, value: 30, dataType: 'video',
        text: 'The main data generator: 20 Mbit/s, value 30. The biggest channel hog.' },
      { id: 'ins_spectrometer', kind: 'instrument', techClass: 'spectrometer', name: 'Spectrometer', mass: 25, watts: 40, bw: 5,
        price: 55, np: 8, pm: 4, p: 0.89, value: 20, dataType: 'spectrum',
        text: 'Spectrum x0.4 - a lot of value on a moderate channel.' },
      { id: 'ins_radiometer', kind: 'instrument', techClass: 'radiometer', name: 'Radiometer', mass: 15, watts: 20, bw: 2,
        price: 32, np: 5, pm: 3, p: 0.91, value: 10, dataType: 'telemetry',
        text: 'Telemetry x0.1: almost no channel load at all.' },
      { id: 'ins_magnetometer', kind: 'instrument', techClass: 'magnetometer', name: 'Magnetometer', mass: 10, watts: 10, bw: 1,
        price: 22, np: 4, pm: 2, p: 0.93, value: 8, dataType: 'telemetry',
        text: 'The lightest and cheapest instrument, almost no data.' },
      { id: 'ins_exp', kind: 'instrument', techClass: 'exp', name: 'Instrument "Experimental I"', mass: 48, watts: 72, bw: 26, copies: 1,
        price: 80, np: 12, pm: 7, p: 0.72, value: 31, dataType: 'video',
        experimental: true, generation: 1, baseClass: 'camera',
        stdId: 'ins_std1', nextId: 'ins_exp2',
        text: 'First generation: +20% to the camera performance, p is 10 points lower. The risk falls over 3 launches, standardisation freezes p.' }
    ],

    /* ================= EXPERIMENTAL LADDER: INSTRUMENTS ================= */
    standardInstruments: [
      { id: 'ins_std1', kind: 'instrument', techClass: 'exp', name: 'Instrument "Standard I"', mass: 48, watts: 72, bw: 26,
        price: 80, np: 12, pm: 7, p: 0.72, value: 31, dataType: 'video',
        standard: true, sourceId: 'ins_exp', generation: 1, baseClass: 'camera',
        text: 'The standardised experimental instrument: p frozen, the launch risk is gone.' },
      { id: 'ins_std2', kind: 'instrument', techClass: 'exp', name: 'Instrument "Standard II"', mass: 57.6, watts: 86.4, bw: 31.2,
        price: 88, np: 14, pm: 8, p: 0.72, value: 37.2, dataType: 'video',
        standard: true, sourceId: 'ins_exp2', generation: 2, baseClass: 'camera',
        text: 'The standardised second generation: +20% over std1, p frozen after the test flights.' }
    ],
    experimentalInstruments: [
      { id: 'ins_exp2', kind: 'instrument', techClass: 'exp', name: 'Instrument "Experimental II"', mass: 57.6, watts: 86.4, bw: 31.2,
        price: 88, np: 14, pm: 8, p: 0.72, value: 37.2, dataType: 'video',
        experimental: true, generation: 2, sourceId: 'ins_std1', unlockAfter: 'ins_exp',
        baseClass: 'camera', stdId: 'ins_std2',
        text: 'Second generation: +20% over std1, p is 10 points lower again and recovers over 3 launches.' }
    ],

    /* ================= ANTENNAS (scientist) ================= */
    antennas: [
      { id: 'ant_small', kind: 'antenna', name: 'Antenna "Small"', bw: 5, p: 0.90, mass: 8, watts: 15,
        price: 40, np: 4, pm: 2,
        text: '5 Mbit/s. Enough for one camera with a long transmission.' },
      { id: 'ant_medium', kind: 'antenna', name: 'Antenna "Medium"', bw: 10, p: 0.92, mass: 15, watts: 25,
        price: 70, np: 6, pm: 4,
        text: '10 Mbit/s. The usual choice for 2-3 instruments.' },
      { id: 'ant_large', kind: 'antenna', name: 'Antenna "Large"', bw: 25, p: 0.94, mass: 30, watts: 40,
        price: 130, np: 10, pm: 6,
        text: '25 Mbit/s. Needed for 3+ cameras and for the deep-space network.' },
      { id: 'ant_xl', kind: 'antenna', name: 'Antenna "Extra large"', bw: 50, p: 0.95, mass: 50, watts: 60,
        price: 220, np: 16, pm: 10,
        text: '50 Mbit/s. Unlocks the full video stream.' },
      { id: 'ant_exp', kind: 'antenna', name: 'Antenna "Experimental"', bw: 13, p: 0.97, mass: 17, watts: 30,
        price: 84, np: 8, pm: 5,
        text: 'Medium base: 13 Mbit/s, p 0.97 (base +0.05), sigma x1.5.' }
    ],
    antennaDup: [
      { id: 'ant_dup', kind: 'antennaDup', name: 'Antenna duplication module', t: 'double',
        priceFactor: 1.6, massFactor: 1.15, dispersion: 1.0,
        text: 'p\' = 1 - (1 - p)^2. Price x1.6, mass x1.15. Duplicates the antenna itself only.' }
    ],

    /* ================= POWER AND BUFFERS ================= */
    power: [
      { id: 'pwr_solar_small', kind: 'power', name: 'Solar panels "Small"', source: 'solar',
        watts: 160, mass: 10, price: 25, np: 2, pm: 0,
        text: '160 W near Earth. In deep space x0.1 - useless there.' },
      { id: 'pwr_solar_medium', kind: 'power', name: 'Solar panels "Medium"', source: 'solar',
        watts: 320, mass: 22, price: 55, np: 4, pm: 0,
        text: '320 W. At Mars x0.45 = 144 W, in the belt x0.2 - not enough.' },
      { id: 'pwr_solar_large', kind: 'power', name: 'Solar panels "Large"', source: 'solar',
        watts: 620, mass: 45, price: 100, np: 7, pm: 0,
        text: '620 W. For a heavy bus and 5-6 instruments near Earth.' },
      { id: 'pwr_reactor', kind: 'power', name: 'RTG / reactor', source: 'reactor',
        watts: 400, mass: 45, price: 500, np: 20, pm: 8,
        text: '400 W regardless of destination (x1.0). The only way to work in deep space and in the belt.' },
      { id: 'pwr_exp', kind: 'power', name: 'Power source "Experimental"', source: 'exp',
        watts: 416, mass: 26, price: 66, np: 6, pm: 0,
        text: '416 W, light and cheap, but a 5% chance of a failure: -50% power for the mission.' }
    ],
    buffers: [
      { id: 'buf_1', kind: 'buffer', name: 'Buffer 1 kWh', kwh: 1, mass: 5, price: 20,
        text: 'Transmission efficiency 0.8 -> 1.0. 5 kg per kWh.' },
      { id: 'buf_2', kind: 'buffer', name: 'Buffer 2 kWh', kwh: 2, mass: 10, price: 40,
        text: 'For 20-30 cycle missions with peak consumption.' },
      { id: 'buf_5', kind: 'buffer', name: 'Buffer 5 kWh', kwh: 5, mass: 25, price: 100,
        text: 'Heavy instruments and long transmissions.' },
      { id: 'buf_10', kind: 'buffer', name: 'Buffer 10 kWh', kwh: 10, mass: 50, price: 200,
        text: 'The maximum reserve: 50 kg, $200.' }
    ],

    /* ================= PHYSICAL MODULES (§2) ================= */
    physical: [
      { id: 'phy_capsule', kind: 'physical', key: 'capsule', name: 'Return capsule', mass: 60,
        price: 400, np: 20, pm: 10, p: 0.85, bonusS: 0.6,
        text: 'Sample return: S x1.6 on success (a separate p 0.85 roll). Required by missions that demand a capsule.' },
      { id: 'phy_lander', kind: 'physical', key: 'lander', name: 'Descent module', mass: 120,
        price: 600, np: 25, pm: 14, p: 0.80, bonusS: 0,
        text: 'Mandatory for the "direct landing" profile. The landing risk is 0.80 - a separate roll.' },
      { id: 'phy_rover', kind: 'physical', key: 'rover', name: 'Rover / drone', mass: 80,
        price: 450, np: 18, pm: 10, p: 0.85, bonusS: 20,
        text: 'Deploys a surface asset: +20 to S, deployment risk 0.85.' },
      { id: 'phy_manipulator', kind: 'physical', key: 'manipulator', name: 'Sampling arm', mass: 25,
        price: 150, np: 8, pm: 4, p: 1.0, bonusS: 10,
        text: '+10 to S, mandatory for missions that bring soil or samples back.' },
      { id: 'phy_relay', kind: 'physical', key: 'relay', name: 'Relay satellite', mass: 150,
        price: 500, np: 22, pm: 12, p: 1.0, bonusS: 0,
        text: 'Unlocks the "relay link" profile (the far side of the Moon and similar).' }
    ],

    /* ================= FACILITIES: FACTORY and SCHOOL (stages 0-4) ================= */
    facilities: [
      { id: 'fac_factory_0', kind: 'facility', obj: 'factory', level: 0, name: 'Factory: none',
        text: 'No production base. +0 PM per cycle.' },
      { id: 'fac_factory_1', kind: 'facility', obj: 'factory', level: 1, name: 'Factory: assembly shop',
        text: '+10 PM/cycle, unlocks launcher standardisation. Needs at least 8 engineers (weighted), $150 + 30 PM.' },
      { id: 'fac_factory_2', kind: 'facility', obj: 'factory', level: 2, name: 'Factory: upgrade',
        text: '+20 PM/cycle, -10% engineer attrition.' },
      { id: 'fac_factory_3', kind: 'facility', obj: 'factory', level: 3, name: 'Factory: automated line',
        text: '+30 PM/cycle, standardisation costs 20% less.' },
      { id: 'fac_factory_4', kind: 'facility', obj: 'factory', level: 4, name: 'Factory: orbital shipyard',
        text: '+40 PM/cycle, -1 launcher production cycle (minimum 1).' },
      { id: 'fac_school_0', kind: 'facility', obj: 'school', level: 0, name: 'School: none',
        text: 'No science base. Instrument standardisation is unavailable and the MCC overload penalty is full.' },
      { id: 'fac_school_1', kind: 'facility', obj: 'school', level: 1, name: 'School: institute',
        text: '+3% instrument p, -5% preparation PM, unlocks instrument standardisation, -15% MCC overload penalty. $200 + 25 PM + 20 NP.' },
      { id: 'fac_school_2', kind: 'facility', obj: 'school', level: 2, name: 'School: upgrade',
        text: '+4% instrument p, -10% preparation PM, -30% MCC overload penalty. $300 + 35 PM + 30 NP.' },
      { id: 'fac_school_3', kind: 'facility', obj: 'school', level: 3, name: 'School: campus with observatories',
        text: '+5% p, -15% preparation PM, instrument standardisation 20% cheaper, -45% MCC overload penalty. $450 + 45 PM + 35 NP.' },
      { id: 'fac_school_4', kind: 'facility', obj: 'school', level: 4, name: 'School: science megacomplex',
        text: '+6% p, -20% preparation PM, +1 FCS slot, -60% MCC overload penalty. $650 + 55 PM + 40 NP.' }
    ],

    /* ================= EVENTS ================= */
    events: [
      { id: 'ev_popularity', kind: 'event', name: 'Popularisation', copies: 4,
        text: 'rating ≥ 40 and (VChK gained over the last 2 missions, or VChK ≥ 30). Accept: X NP or PM for 1 cycle (10/15/20 by rating). Effect: +(20+0.5·rating) $, +(3+0.05·rating) VChK, +2 rating; 15% chance of x0.5; 2X spare resources give x1.3. Decline: -1 VChK momentum, blocked for 3 missions.' },
      { id: 'ev_advertising', kind: 'event', name: 'Advertising', copies: 3,
        text: '30% after a successful mission: +(10+0.3·rating) $; the next failure takes it back, -(10+0.3·rating) $.' },
      { id: 'ev_accident', kind: 'event', name: 'Production accident', copies: 3,
        text: '10%: the current item needs +1 cycle and -5 PM. If nothing is in production the event is postponed.' },
      { id: 'ev_breakthrough', kind: 'event', name: 'Scientific breakthrough', copies: 2,
        text: '5% with NP ≥ 80: S x1.1 once (bonuses do not stack).' },
      { id: 'ev_poach', kind: 'event', name: 'Specialist poached', copies: 2,
        text: 'L2 and above: 5% per cycle - 0.02% per rating point (minimum 1%). Retention: 2 manager points postpone it by 1 cycle.' },
      { id: 'ev_quit_rating', kind: 'event', name: 'Resignation after a rating drop', copies: 2,
        text: 'rating below 30 per level: p = 0.25 + 0.15·(threshold - rating)/threshold, capped at 0.9.' },
      { id: 'ev_join_specialist', kind: 'event', name: 'Specialist joins', copies: 2,
        text: 'rating ≥ 60 and 3 successes in a row: p = 0.2 + 0.005·(rating - 60), capped at 0.6. A mid+1 specialist in the scarce domain.' },
      { id: 'ev_join_novice', kind: 'event', name: 'Volunteer novice', copies: 2,
        text: 'VChK ≥ 30 or momentum 2+: p = 0.15 + 0.003·(VChK - 30), +0.1 at momentum 3+. One or two L1 specialists.' },
      { id: 'ev_dream_team', kind: 'event', name: 'Dream team', copies: 1,
        text: 'rating ≥ 60 and VChK ≥ 40: 10% chance of 1xL2 (scarce domain) + 1xL1 (another domain).' },
      { id: 'ev_salary_delay', kind: 'event', name: 'Salary delay', copies: 2,
        text: 'Cash below the total salary bill: one random hire leaves.' },
      { id: 'ev_flare', kind: 'event', name: 'Solar flare', copies: 2,
        text: 'Flavour: -5% instrument p for the current mission (optional rule).' },
      { id: 'ev_window', kind: 'event', name: 'Launch window closing', copies: 2,
        text: 'Flavour: the current mission deadline shrinks by 1 cycle (optional rule).' },
      { id: 'ev_standard_offer', kind: 'event', name: 'Standardisation offer', copies: 1,
        text: '50% discount on one standardisation while the school or the factory is running.' }
    ],

    /* ================= AUXILIARY CARDS (decor, mass 0) ================= */
    auxiliary: [
      { id: 'aux_fairing', kind: 'auxiliary', name: 'Fairing', mass: 0, text: 'Decor: affects only the silhouette of the assembly.' },
      { id: 'aux_adapter', kind: 'auxiliary', name: 'Adapter', mass: 0, text: 'Decor: joins the blocks on the table.' },
      { id: 'aux_truss', kind: 'auxiliary', name: 'Truss', mass: 0, text: 'Decor: the frame of the science platform.' },
      { id: 'aux_radiator', kind: 'auxiliary', name: 'Radiator', mass: 0, text: 'Decor: heat rejection.' },
      { id: 'aux_boom', kind: 'auxiliary', name: 'Boom', mass: 0, text: 'Decor: magnetometer on a boom.' },
      { id: 'aux_cover', kind: 'auxiliary', name: 'Heat shield', mass: 0, text: 'Decor: for the return capsule.' },
      { id: 'aux_solar_drive', kind: 'auxiliary', name: 'Panel drive', mass: 0, text: 'Decor: solar array orientation.' },
      { id: 'aux_flag', kind: 'auxiliary', name: 'Pennant / emblem', mass: 0, text: 'Decor: mission marking.' }
    ],

    /* ================= CAMPAIGN v1.4: MCC (reference cards) ================= */
    campaignMcs: [
      { id: 'mcs_0', kind: 'mcs', level: 0, name: 'MCC 0 - rented station',
        text: '1 launch per step. No bonuses. Upkeep $0.' },
      { id: 'mcs_1', kind: 'mcs', level: 1, name: 'MCC 1 - tracking station',
        text: '2 launches per step, +0.02 channel p, S +3%, +0.5 VChK per success, upkeep $5.' },
      { id: 'mcs_2', kind: 'mcs', level: 2, name: 'MCC 2 - flight control centre',
        text: '2 launches per step, +0.04 channel p, S +6%, +1.0 VChK per success, upkeep $10.' },
      { id: 'mcs_3', kind: 'mcs', level: 3, name: 'MCC 3 - deep-space network',
        text: '3 launches per step, +0.06 channel p, S +9%, +1.5 VChK, +0.05 deep-space margin, upkeep $15.' },
      { id: 'mcs_4', kind: 'mcs', level: 4, name: 'MCC 4 - global network',
        text: '3 launches per step, +0.08 channel p, S +12%, +2.0 VChK, +0.10 deep-space margin, upkeep $20.' }
    ],

    /* ================= CAMPAIGN v1.4: TESTS ================= */
    campaignTests: [
      { id: 'test_stand', kind: 'test', name: 'Bench test',
        text: '$50 + 10 PM + 5 NP. q = 0.75 + 0.05 per school level (capped at 0.95). Success +1 IP, failure 0 IP.' },
      { id: 'test_flight_rocket', kind: 'test', name: 'Launcher test flight',
        text: '50% of the launcher price + $20 + 10 PM. Success +2 IP and half the money back; failure +1 IP. The launcher is lost either way.' },
      { id: 'test_flight_instrument', kind: 'test', name: 'Instrument test flight',
        text: '50% of the launcher + 50% of the instrument + $20 + 10 PM. Success +2 IP, half the money back and the instrument survives; failure +1 IP.' }
    ],

    /* ================= CAMPAIGN v1.4: GROUND CONTRACTS ================= */
    groundContracts: [
      { id: 'gc_survey', kind: 'groundContract', name: 'Geodetic contract', fund: 80,
        text: '1 action: +$80 into the ground-segment fund. Does not count as a mission.' },
      { id: 'gc_tracking', kind: 'groundContract', name: 'Tracking agreement', fund: 120, npDelta: -1,
        text: '1 action: +$120 into the fund, but -1 NP. Does not count as a mission.' },
      { id: 'gc_telemetry', kind: 'groundContract', name: 'Telemetry service',
        fund: 100, ipDelta: 1,
        text: '1 action: +$100 into the fund and +1 IP for an instrument of your choice.' },
      { id: 'gc_launch_range', kind: 'groundContract', name: 'Range lease', fund: 150,
        text: '1 action: +$150 into the ground-segment fund. Does not count as a mission.' },
      { id: 'gc_science', kind: 'groundContract', name: 'Science grant', fund: 60, npDelta: 10,
        text: '1 action: +$60 into the fund and +10 NP.' },
      { id: 'gc_press', kind: 'groundContract', name: 'Press contract', fund: 40, vchkDelta: 1,
        text: '1 action: +$40 into the fund and +1 VChK.' }
    ],

    /* ================= CAMPAIGN v1.5: FLIGHT EVENTS =================
    * Drawn on a flight step (chance campaign.ops.opsEventChance).
    * The check runs against the mission build; no player choice is required.
     */
    opsEvents: [
      { id: 'oe_flare', kind: 'opsEvent', name: 'Solar flare', copies: 2,
        text: 'Check: a buffer is present -> automatic pass. Without a buffer the session of the step is lost (slice x0).' },
      { id: 'oe_dsn', kind: 'opsEvent', name: 'Deep-space network window', copies: 2,
        text: 'The session of the step is cut short: slice x0.5. The deep-space network needs a long transmission.' },
      { id: 'oe_thermal', kind: 'opsEvent', name: 'Thermal regime', copies: 2,
        text: 'Check: a storage buffer is present -> automatic pass. Otherwise slice x0.5.' },
      { id: 'oe_software', kind: 'opsEvent', name: 'Software fault', copies: 2,
        text: 'Check: enough managers for the MCC level -> automatic pass. Otherwise $50 for a patch; without the money slice x0.5.' },
      { id: 'oe_debris', kind: 'opsEvent', name: 'Micrometeorite', copies: 1,
        text: 'Check: a redundant FCS -> automatic pass. Otherwise the flight ends early (S x0.6).' },
      { id: 'oe_overload', kind: 'opsEvent', name: 'Shift overload', copies: 2,
        text: 'If the MCC is overloaded, +0.10 to the incident risk until the end of the flight. Otherwise automatic pass.' },
      { id: 'oe_calib', kind: 'opsEvent', name: 'Instrument calibration', copies: 2,
        text: 'Bonus: +1 IP to an instrument, the slice of the step stays full (x1.0).' },
      { id: 'oe_press', kind: 'opsEvent', name: 'Press interest', copies: 1,
        text: 'Bonus: +$50 and +1 VChK.' }
    ]
  };

  root.CARDS = cards;
  root.CARDS_BY_ID = (function () {
    const idx = {};
    Object.keys(cards).forEach(function (deck) {
      cards[deck].forEach(function (card) { idx[card.id] = card; });
    });
    return idx;
  })();
})(typeof globalThis !== 'undefined' ? globalThis : this);

