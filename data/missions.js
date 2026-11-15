/* Space Mission Design — the mission cards (v1.5)
* Real missions: a point, trajectory options, data, a deadline, requirements.
 * targetValue = 20 + 10·complexity (§15.3).
 * v1.5: flight — the flight duration in steps (1-4) for the campaign mode.
 */
(function (root) {
  const missions = [

    /* ---------------- Moon ---------------- */
    { id: 'm_luna3', name: 'Luna 3', agency: 'USSR', year: 1959, point: 'moon', complexity: 1.3,
      dataType: 'video', observeTime: 4, missionTime: 20, deadline: 6, targetValue: 33,
      requires: [], farSide: true, trajectories: ['assist', 'direct'],
      history: 'The first spacecraft to photograph the far side of the Moon; the pictures were radioed back to Earth.',
      realOutcome: 'success', realNote: 'The photography worked, but part of the frames was lost to a transmission failure - an example of D_ratio < 1.',
      art: 'assets/m_luna3.png' },

    { id: 'm_luna9', name: 'Luna 9', agency: 'USSR', year: 1966, point: 'moon', complexity: 1.3,
      dataType: 'video', observeTime: 5, missionTime: 24, deadline: 6, targetValue: 33,
      requires: ['lander'], farSide: false, trajectories: ['landing', 'orbit'],
      history: 'The first soft landing on the Moon. A panorama of the lunar surface was transmitted to Earth.',
      realOutcome: 'success', realNote: 'The landing and the panorama transmission both worked - the reference case for the "direct landing" profile.',
      art: 'assets/m_luna9.png' },

    { id: 'm_luna16', name: 'Luna 16', agency: 'USSR', year: 1970, point: 'moon', complexity: 1.6,
      dataType: 'video', observeTime: 6, missionTime: 20, deadline: 7, targetValue: 36,
      requires: ['lander', 'capsule', 'manipulator'], farSide: false, trajectories: ['landing'],
      history: 'Automated return of lunar soil: landing, sampling, lift-off and delivery of the capsule to Earth.',
      realOutcome: 'success', realNote: 'The first automated sample return - the mission needs both a capsule and a sampling arm.',
      art: 'assets/m_luna16.png' },

    { id: 'm_apollo11', name: 'Apollo 11', agency: 'USA', year: 1969, point: 'moon', complexity: 1.6,
      dataType: 'video', observeTime: 8, missionTime: 30, deadline: 7, targetValue: 36,
      requires: ['lander', 'capsule', 'manipulator'], farSide: false, trajectories: ['landing'],
      history: 'The first crewed landing: television pictures, soil samples and a scientific instrument package.',
      realOutcome: 'success', realNote: 'Samples and video were delivered; in the game this is the upper bar for S and mass.',
      art: 'assets/m_apollo11.png' },

    { id: 'm_change4', name: 'Chang\'e 4', agency: 'China', year: 2018, point: 'moon', complexity: 1.3,
      dataType: 'video', observeTime: 6, missionTime: 26, deadline: 7, targetValue: 33,
      requires: ['lander', 'relay'], farSide: true, trajectories: ['relay'],
      history: 'The first landing on the far side of the Moon; the Queqiao relay satellite carried the link to Earth.',
      realOutcome: 'success', realNote: 'Without a relay the mission is impossible - the "relay" badge is mandatory.',
      art: 'assets/m_change4.png' },

    { id: 'm_change5', name: 'Chang\'e 5', agency: 'China', year: 2020, point: 'moon', complexity: 1.6,
      dataType: 'video', observeTime: 7, missionTime: 22, deadline: 7, targetValue: 36,
      requires: ['lander', 'capsule', 'manipulator'], farSide: false, trajectories: ['landing'],
      history: 'Lunar sample return: drilling, lift-off, docking in lunar orbit and capsule delivery.',
      realOutcome: 'success', realNote: 'A capsule plus a sampling arm give +60% to S, but add noticeable mass.',
      art: 'assets/m_change5.png' },
    /* ---------------- Earth orbit / GEO ---------------- */
    { id: 'm_hubble', name: 'Hubble', agency: 'USA/ESA', year: 1990, point: 'leo', complexity: 1.0,
      dataType: 'video', observeTime: 10, missionTime: 36, deadline: 5, targetValue: 30,
      requires: [], farSide: false, trajectories: ['low', 'polar', 'direct'],
      history: 'A space telescope in low Earth orbit: an enormous data stream and a long service life.',
      realOutcome: 'success', realNote: 'The perfect example of "a lot of data - you need a wide channel and a buffer".',
      art: 'assets/m_hubble.png' },

    { id: 'm_grace', name: 'GRACE', agency: 'USA/Germany', year: 2002, point: 'leo', complexity: 1.0,
      dataType: 'telemetry', observeTime: 8, missionTime: 30, deadline: 5, targetValue: 30,
      requires: [], farSide: false, trajectories: ['polar', 'low'],
      history: 'Two satellites measure the Earth gravity field from the changing distance between them.',
      realOutcome: 'success', realNote: 'Polar orbit and telemetry: a 0.6 window, but almost no channel is needed.',
      art: 'assets/m_grace.png' },

    { id: 'm_goes', name: 'GOES-R', agency: 'USA', year: 2016, point: 'geo', complexity: 1.0,
      dataType: 'video', observeTime: 8, missionTime: 40, deadline: 6, targetValue: 30,
      requires: [], farSide: false, trajectories: ['geo', 'direct'],
      history: 'A geostationary weather satellite: continuous observation of a hemisphere through a wide channel.',
      realOutcome: 'success', realNote: 'GEO costs k=2.0 in mass, but delivers a 1.0 window and a permanent link.',
      art: 'assets/m_goes.png' },

    /* ---------------- Mars ---------------- */
    { id: 'm_mars3', name: 'Mars 3', agency: 'USSR', year: 1971, point: 'mars', complexity: 1.6,
      dataType: 'video', observeTime: 5, missionTime: 24, deadline: 8, targetValue: 36,
      requires: ['lander'], farSide: false, trajectories: ['landing', 'orbit'],
      history: 'The descent module landed on Mars, but the surface transmission died after 20 seconds.',
      realOutcome: 'partial success', realNote: 'The reference transmission failure: the launcher and the landing worked, the data did not.',
      art: 'assets/m_mars3.png' },

    { id: 'm_viking1', name: 'Viking 1', agency: 'USA', year: 1976, point: 'mars', complexity: 1.3,
      dataType: 'video', observeTime: 6, missionTime: 26, deadline: 8, targetValue: 33,
      requires: ['lander'], farSide: false, trajectories: ['landing', 'orbit'],
      history: 'The first long successful surface operation on Mars: panoramas, meteorology and the search for life.',
      realOutcome: 'success', realNote: 'Descent module plus camera plus spectrometer - the typical Mars kit.',
      art: 'assets/m_viking1.png' },

    { id: 'm_mgs', name: 'Mars Global Surveyor', agency: 'USA', year: 1996, point: 'mars', complexity: 1.0,
      dataType: 'telemetry', observeTime: 10, missionTime: 30, deadline: 8, targetValue: 30,
      requires: [], farSide: false, trajectories: ['orbit', 'assist'],
      history: 'Orbital mapping of Mars: relief, magnetic field and climate.',
      realOutcome: 'success', realNote: 'An orbiter: no landing, but a long transmission.',
      art: 'assets/m_mgs.png' },

    { id: 'm_pathfinder', name: 'Mars Pathfinder', agency: 'USA', year: 1997, point: 'mars', complexity: 1.3,
      dataType: 'telemetry', observeTime: 8, missionTime: 20, deadline: 8, targetValue: 33,
      requires: ['lander', 'rover'], farSide: false, trajectories: ['landing'],
      history: 'The first Mars rover, Sojourner: deployment of a surface asset and work on the surface.',
      realOutcome: 'success', realNote: 'The rover adds +20 to S, but demands a landing platform and the mass for it.',
      art: 'assets/m_pathfinder.png' },

    { id: 'm_beagle2', name: 'Beagle 2', agency: 'ESA', year: 2003, point: 'mars', complexity: 1.3,
      dataType: 'telemetry', observeTime: 6, missionTime: 18, deadline: 8, targetValue: 33,
      requires: ['lander'], farSide: false, trajectories: ['landing'],
      history: 'A European lander; after separation from Mars Express it never called home again.',
      realOutcome: 'failure', realNote: 'The landing happened, but the transmission never started - the mission was lost at the communication stage.',
      art: 'assets/m_beagle2.png' },
    { id: 'm_insight', name: 'InSight', agency: 'USA', year: 2018, point: 'mars', complexity: 1.3,
      dataType: 'telemetry', observeTime: 8, missionTime: 24, deadline: 8, targetValue: 33,
      requires: ['lander'], farSide: false, trajectories: ['landing'],
      history: 'A seismometer on Mars; the heat-flow probe got stuck in the soil.',
      realOutcome: 'partial success', realNote: 'Landing and communications succeeded, but part of the science programme was never done - a shortfall in S.',
      art: 'assets/m_insight.png' },

    { id: 'm_perseverance', name: 'Perseverance + Ingenuity', agency: 'USA', year: 2021, point: 'mars', complexity: 1.6,
      dataType: 'video', observeTime: 8, missionTime: 26, deadline: 8, targetValue: 36,
      requires: ['lander', 'rover'], farSide: false, trajectories: ['landing'],
      history: 'A rover and the first helicopter on another planet, caching samples for a future return.',
      realOutcome: 'success', realNote: 'The flagship: maximum S, but mass and channel push the team to a heavy launcher.',
      art: 'assets/m_perseverance.png' },

    { id: 'm_phobos_grunt', name: 'Phobos-Grunt', agency: 'Russia', year: 2011, point: 'mars', complexity: 1.6,
      dataType: 'video', observeTime: 6, missionTime: 20, deadline: 8, targetValue: 36,
      requires: ['capsule', 'manipulator'], farSide: false, trajectories: ['assist', 'direct'],
      history: 'A Phobos sample return; the spacecraft stayed in Earth orbit after the upper stage failed.',
      realOutcome: 'failure', realNote: 'A launch-stage failure: p_launch = 0, the whole contract is written off, no rescue mission is possible.',
      art: 'assets/m_phobos_grunt.png' },

    { id: 'm_mars96', name: 'Mars 96', agency: 'Russia', year: 1996, point: 'mars', complexity: 1.6,
      dataType: 'spectrum', observeTime: 6, missionTime: 24, deadline: 8, targetValue: 36,
      requires: ['lander'], farSide: false, trajectories: ['direct'],
      history: 'An ambitious mission with an orbiter and four surface penetrators.',
      realOutcome: 'failure', realNote: 'The upper stage failed: lost at launch, a lesson in launcher reliability.',
      art: 'assets/m_mars96.png' },

    /* ---------------- Asteroid belt ---------------- */
    { id: 'm_hayabusa2', name: 'Hayabusa 2', agency: 'JAXA', year: 2014, point: 'belt', complexity: 1.6,
      dataType: 'video', observeTime: 8, missionTime: 30, deadline: 9, targetValue: 36,
      requires: ['capsule', 'manipulator'], farSide: false, trajectories: ['assist', 'orbit'],
      history: 'Sample return from asteroid Ryugu: soil collection, capsule separation and a landing in Australia.',
      realOutcome: 'success', realNote: 'The belt costs k=20: even a 400 kg payload demands a heavy launcher.',
      art: 'assets/m_hayabusa2.png' },

    { id: 'm_osirisrex', name: 'OSIRIS-REx', agency: 'USA', year: 2016, point: 'belt', complexity: 1.6,
      dataType: 'spectrum', observeTime: 8, missionTime: 34, deadline: 9, targetValue: 36,
      requires: ['capsule', 'manipulator'], farSide: false, trajectories: ['assist'],
      history: 'Samples of asteroid Bennu: mapping, collection and the return of the capsule to Earth.',
      realOutcome: 'success', realNote: 'A long transmission plus a capsule return: the hardest mass problem in the deck.',
      art: 'assets/m_osirisrex.png' },
    /* ---------------- Deep space ---------------- */
    { id: 'm_newhorizons', name: 'New Horizons', agency: 'USA', year: 2006, point: 'deep', complexity: 1.3,
      dataType: 'video', observeTime: 6, missionTime: 40, deadline: 8, targetValue: 33,
      requires: [], farSide: false, trajectories: ['fast', 'direct'],
      history: 'The first mission to Pluto: a fast direct transfer, the deep-space network and a tight deadline.',
      realOutcome: 'success', realNote: 'The deep-space network costs x0.85 of the channel - the antenna has to be large.',
      art: 'assets/m_newhorizons.png' },

    { id: 'm_voyager2', name: 'Voyager 2', agency: 'USA', year: 1977, point: 'deep', complexity: 1.3,
      dataType: 'telemetry', observeTime: 8, missionTime: 44, deadline: 8, targetValue: 33,
      requires: [], farSide: false, trajectories: ['assist'],
      history: 'A grand tour of the outer planets - Uranus and Neptune - then out into interstellar space.',
      realOutcome: 'success', realNote: 'The gravity assist saves 15% of the power budget but adds two cycles.',
      art: 'assets/m_voyager2.png' },

    { id: 'm_galileo', name: 'Galileo', agency: 'USA', year: 1989, point: 'deep', complexity: 1.6,
      dataType: 'video', observeTime: 8, missionTime: 36, deadline: 8, targetValue: 36,
      requires: [], farSide: false, trajectories: ['assist'],
      history: 'The Jupiter orbiter; the main antenna never unfurled and the data went through the spare.',
      realOutcome: 'partial success', realNote: 'The perfect example of D_ratio much smaller than 1 and "retransmit for 1 cycle and $20".',
      art: 'assets/m_galileo.png' },

    { id: 'm_cassini', name: 'Cassini-Huygens', agency: 'USA/ESA', year: 1997, point: 'deep', complexity: 1.6,
      dataType: 'video', observeTime: 8, missionTime: 40, deadline: 8, targetValue: 36,
      requires: ['lander'], farSide: false, trajectories: ['assist'],
      history: 'Saturn and the Huygens landing on Titan: a descent module released in deep space.',
      realOutcome: 'success', realNote: 'A descent module in the deep-space network - the maximum of mass and risk.',
      art: 'assets/m_cassini.png' },

    { id: 'm_jwst', name: 'James Webb', agency: 'USA/ESA/CSA', year: 2021, point: 'deep', complexity: 1.3,
      dataType: 'spectrum', observeTime: 10, missionTime: 44, deadline: 8, targetValue: 33,
      requires: [], farSide: false, trajectories: ['direct'],
      history: 'An infrared telescope at L2: sunshield deployment and a huge stream of spectra.',
      realOutcome: 'success', realNote: 'Solar panels in deep space deliver x0.1 - the mission needs an RTG or a reactor.',
      art: 'assets/m_jwst.png' },

    { id: 'm_spektr_rg', name: 'Spektr-RG', agency: 'Russia/Germany', year: 2019, point: 'deep', complexity: 1.0,
      dataType: 'spectrum', observeTime: 10, missionTime: 40, deadline: 8, targetValue: 30,
      requires: [], farSide: false, trajectories: ['direct'],
      history: 'An X-ray observatory at L2: an all-sky survey and a very long transmission.',
      realOutcome: 'success', realNote: 'The deep-space network and constant power are the key constraints.',
      art: 'assets/m_spektr_rg.png' },

    { id: 'm_bepicolombo', name: 'BepiColombo', agency: 'ESA/JAXA', year: 2018, point: 'deep', complexity: 1.3,
      dataType: 'telemetry', observeTime: 10, missionTime: 44, deadline: 9, targetValue: 33,
      requires: [], farSide: false, trajectories: ['assist'],
      history: 'The Mercury mission: a chain of gravity assists at Earth, Venus and Mercury.',
      realOutcome: 'in progress', realNote: 'A classic long transfer: deadline +2, but -15% on k.',
      art: 'assets/m_bepicolombo.png' }
  ];

  /* ---------------- Salvage missions (a special deck, not part of the 10-mission limit) ---------------- */
  const salvage = [
    { id: 's_leo', name: 'Salvage: Earth orbit', point: 'leo', cost: 50, p: 0.75,
      text: 'Instrument recovery from orbit: the instruments go back to the store, 50% of the data. Failure costs $50 and the instruments are lost.' },
    { id: 's_moon', name: 'Salvage: the Moon', point: 'moon', cost: 50, p: 0.70,
      text: 'Interception in lunar orbit. Requires an antenna of medium class or better.' },
    { id: 's_mars', name: 'Salvage: Mars', point: 'mars', cost: 50, p: 0.65,
      text: 'A long interception: deadline +4 cycles, the instruments come back, 50% of the data.' },
    { id: 's_deep', name: 'Salvage: deep space', point: 'deep', cost: 50, p: 0.60,
      text: 'The riskiest option: the deep-space network is not enough, chance 0.60.' }
  ];

  /* ---------------- v1.5: flight duration ----------------
  * flight = base[point] + (missionTime ≥ 36 ? 1 : 0), clamped to 1-4.
  * The formula is duplicated in E.flightSteps (the engine); the card stores the ready number.
   */
  const FLIGHT_BASE = { leo: 1, geo: 2, moon: 2, mars: 3, deep: 3, belt: 3 };
  missions.forEach(function (m) {
    if (m.flight != null) return;
    const base = FLIGHT_BASE[m.point] == null ? 1 : FLIGHT_BASE[m.point];
    const extra = (m.missionTime || 0) >= 36 ? 1 : 0;
    m.flight = Math.max(1, Math.min(4, base + extra));
  });

  root.MISSIONS = missions;
  root.SALVAGE = salvage;
})(typeof globalThis !== 'undefined' ? globalThis : this);


