/* Space Mission Design — historical briefs written into the results archive.
 *
 * Every finished mission gets a "historical reference": what was flown, which
 * launcher and profile the crew committed, how the communication sessions and
 * flight events went, what the reception board delivered and how it changed the
 * programme rating. A campaign-level brief is written when the team finishes.
 *
 * The module is pure (no I/O): it receives engine reports and lookup helpers.
 */
import { round, signed } from './util.mjs';

const VERDICTS = {
  full: 'a full success with the bonus',
  success: 'a success',
  partial: 'a partial success',
  fail: 'a failure'
};

const STAGES = {
  launch: 'launch vehicle',
  channel: 'communication channel',
  physical: 'physical compatibility'
};

const INCIDENTS = {
  lostSession: 'a communication session lost to the human factor',
  commandError: 'a flight-director command error that cost $50',
  instrumentFault: 'an instrument fault that halved the session'
};

function pct(x) {
  return Math.round((Number(x) || 0) * 100) + '%';
}

function safeName(obj, fallback) {
  return obj && obj.name ? obj.name : (fallback || '');
}

/* Build entries store instruments as { id, count } and physical modules as ids,
 * so every reference has to be resolved through the room's card lookup. */
function listNames(list, look) {
  const out = [];
  (list || []).forEach(function (x) {
    if (!x) return;
    if (typeof x === 'string') {
      const card = look && look.card ? look.card(x) : null;
      out.push(card && card.name ? card.name : x);
      return;
    }
    if (x.name) {
      out.push(x.name + (x.count > 1 ? ' x' + x.count : ''));
      return;
    }
    const id = x.id || x.cardId;
    if (!id) return;
    const card = look && look.card ? look.card(id) : null;
    out.push((card && card.name ? card.name : String(id)) + (x.count > 1 ? ' x' + x.count : ''));
  });
  return out;
}

export function verdictLabel(key, stage) {
  const base = VERDICTS[key] || String(key || 'unknown outcome');
  if (key === 'fail' && stage && STAGES[stage]) return base + ' at the ' + STAGES[stage] + ' stage';
  return base;
}

export function verdictKey(key) {
  return key === 'full' || key === 'success' || key === 'partial' ? key : 'fail';
}

export function buildMissionEntry(report, look) {
  const r = report || {};
  const c = r.compute || {};
  const res = r.result || {};
  const reward = r.reward || {};
  const mission = look.mission(r.missionId) || {};
  const point = look.point(mission.point);
  const trajectory = look.trajectory(r.trajectoryId);
  const sessions = r.sessions || [];
  const events = (r.events || []).map(function (e) { return e.name || e.id; }).filter(Boolean);
  const incidents = [];
  sessions.forEach(function (s) {
    if (s && s.incident && INCIDENTS[s.incident]) incidents.push(INCIDENTS[s.incident]);
  });
  const lost = sessions.filter(function (s) { return s && s.lost; }).length;
  const build = c.build || {};
  const rocket = safeName(build.rocket, '');
  const instruments = listNames(build.instruments, look);
  const physical = listNames(build.physical, look);

  const sentences = [];
  sentences.push((mission.name || r.name || 'Mission') +
    (mission.agency ? ' (' + mission.agency + (mission.year ? ', ' + mission.year : '') + ')' : '') +
    ' was flown to ' + point + ' along the ' + trajectory.toLowerCase() +
    ' profile; the contract promised ' + (c.target != null ? c.target : '?') + ' scientific points.');

  if (mission.history) sentences.push('Historical brief: ' + String(mission.history).trim());

  const hardware = [];
  if (rocket) hardware.push('the ' + rocket);
  if (instruments.length) hardware.push('instruments: ' + instruments.join(', '));
  if (physical.length) hardware.push('modules: ' + physical.join(', '));
  if (hardware.length) sentences.push('The assembly comprised ' + hardware.join('; ') + '.');

  sentences.push('The vehicle left the pad on step ' + (r.launchStep || r.step || '?') +
    ' with a ' + pct(c.pLaunch) + ' launch estimate and a ' + pct(c.pChannel) +
    ' channel estimate; the flight ran ' + (r.flight || 1) + ' step(s) and ' + sessions.length +
    ' communication session(s)' +
    (r.overtime ? ', extended ' + r.overtime + ' time(s) by the flight director' : '') +
    (r.earlyEnd ? ', closed early on the flight director\'s order' : '') + '.');

  if (events.length) sentences.push('Flight events: ' + events.join('; ') + '.');
  if (incidents.length) sentences.push('Human-factor incidents: ' + incidents.join('; ') + '.');
  if (lost) sentences.push(lost + ' communication session(s) were lost altogether.');

  sentences.push('Reception delivered ' + round(res.sAct, 1) + ' of ' +
    (c.target != null ? c.target : '?') + ' S (data ratio ' +
    pct(r.ratioOps != null ? r.ratioOps : (c.data && c.data.ratio)) + ', physical check ' +
    (c.physOk === false ? 'failed' : 'passed') + ') — ' + verdictLabel(res.key, res.stage) + '.');

  sentences.push('Programme effect: ' + signed(reward.dRating, 1) + ' rating, ' +
    signed(reward.dVchk, 1) + ' VChK, contract bonus $' + Math.round(reward.bonus || 0) + '.');

  if (mission.realNote) sentences.push('Historical note: ' + String(mission.realNote).trim());

  return {
    id: String(r.missionId || '') + '@' + String(r.step == null ? '' : r.step) + '#' + String(res.key || ''),
    step: r.step == null ? null : r.step,
    missionId: r.missionId || null,
    missionName: mission.name || r.name || '',
    agency: mission.agency || '',
    year: mission.year || null,
    point: mission.point || r.point || null,
    pointName: point,
    trajectoryId: r.trajectoryId || null,
    trajectoryName: trajectory,
    flightSteps: r.flight || 1,
    overtime: r.overtime || 0,
    earlyEnd: !!r.earlyEnd,
    launchStep: r.launchStep || r.step || null,
    sessions: sessions.length,
    events: events,
    incidents: incidents,
    lostSessions: lost,
    pLaunch: round(c.pLaunch, 3),
    pChannel: round(c.pChannel, 3),
    pSuccess: round(c.pSuccess, 3),
    target: c.target == null ? null : c.target,
    sRaw: round(c.sRaw, 1),
    dataRatio: round(c.data && c.data.ratio, 3),
    ratioOps: round(r.ratioOps, 3),
    sAct: round(res.sAct, 1),
    verdictKey: verdictKey(res.key),
    verdict: verdictLabel(res.key, res.stage),
    stage: res.stage || null,
    dRating: round(reward.dRating, 1),
    dVchk: round(reward.dVchk, 1),
    bonus: Math.round(reward.bonus || 0),
    price: Math.round(r.price || 0),
    advance: Math.round(r.advance || 0),
    narrative: sentences.join(' '),
    recordedAt: new Date().toISOString()
  };
}


export function buildCampaignNarrative(record) {
  const missions = record.missions || [];
  const score = record.score || {};
  const stats = record.stats || {};
  const lines = [];
  const name = record.teamName || 'The team';
  lines.push(name + ' closed the campaign of seed ' + record.seed + ' after ' +
    (record.maxSteps || '?') + ' steps with ' + missions.length + ' finished mission(s).');

  if (missions.length) {
    const ok = missions.filter(function (m) { return m.verdictKey === 'full' || m.verdictKey === 'success'; }).length;
    const partial = missions.filter(function (m) { return m.verdictKey === 'partial'; }).length;
    const fail = missions.filter(function (m) { return m.verdictKey === 'fail'; }).length;
    lines.push('The record shows ' + ok + ' success(es), ' + partial + ' partial success(es) and ' +
      fail + ' failure(s); launches: ' + (stats.launches || 0) + ', lost sessions: ' +
      (stats.opsLostSessions || 0) + ', human-factor incidents: ' + (stats.opsIncidents || 0) + '.');
    const best = missions.slice().sort(function (a, b) { return (b.sAct || 0) - (a.sAct || 0); })[0];
    if (best) {
      lines.push('The strongest result was ' + best.missionName + ' on step ' + best.step +
        ': ' + best.sAct + ' of ' + (best.target == null ? '?' : best.target) + ' S, ' +
        best.verdict + '.');
    }
    const visited = {};
    missions.forEach(function (m) { if (m.pointName) visited[m.pointName] = true; });
    lines.push('Destinations covered: ' + (Object.keys(visited).join(', ') || 'none') + '.');
  }

  lines.push('Final score ' + round(score.total, 1) + ' points (rating ' + round(score.rating, 1) +
    ', VChK part ' + round(score.vchkPart, 1) + ', technology ' + signed(score.techPart, 1) +
    ', standardisation ' + signed(score.stdPart, 1) + ', MCC ' + signed(score.mcsPart, 1) +
    ', school ' + signed(score.schoolPart, 1) + ', rescues ' + signed(score.rescuePart, 1) +
    ', penalty ' + signed(score.penaltyPart, 1) + ').');

  const tie = record.tieBreak || {};
  if (tie.total != null) {
    lines.push('Ranking keys: total ' + round(tie.total, 1) + ', VChK ' + round(tie.vchk, 1) +
      ', missions ' + (tie.missions == null ? '?' : tie.missions) + '.');
  }
  return lines.join(' ');
}
