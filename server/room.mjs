/* Space Mission Design — one isolated game room per team.
 *
 * The room owns a node:vm context with config, cards, missions, the English
 * content pack, the engine and app/core.js (no UI files). The server is the only
 * mutator: every action is validated by the caller's role and applied through
 * APP.dispatch. Clients receive serialised snapshots and hydrate them locally.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { readJson, writeJson, nowIso } from './util.mjs';
import { buildMissionEntry, buildCampaignNarrative } from './history.mjs';
import { saveTeamResult } from './results.mjs';

const CORE_FILES = [
  'data/config.js',
  'data/cards.js',
  'data/missions.js',
  'data/en.js',
  'data/engine.js',
  'app/core.js'
];

export class Room {
  constructor(opts) {
    this.rootDir = opts.rootDir;
    this.dataDir = opts.dataDir;
    this.team = opts.team;
    this.onEvent = opts.onEvent || function () {};
    this.rev = 0;
    this.history = [];
    this.reportsSeen = 0;
    this.boot();
  }

  teamDir() {
    return path.join(this.dataDir, 'teams', this.team.id);
  }

  boot() {
    const self = this;
    const ctx = vm.createContext({
      console: console,
      localStorage: {
        getItem: function () { return null; },
        setItem: function () {},
        removeItem: function () {}
      }
    });
    CORE_FILES.forEach(function (rel) {
      const file = path.join(self.rootDir, rel);
      if (!fs.existsSync(file)) return;
      vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: rel });
    });
    this.ctx = ctx;
    this.APP = ctx.APP;
    this.ENGINE = ctx.ENGINE;
    this.CONFIG = ctx.CONFIG;
    this.MISSIONS = ctx.MISSIONS;
    if (!this.APP) throw new Error('core.js did not expose APP');

    const saved = readJson(path.join(this.teamDir(), 'state.json'), null);
    if (saved && saved.state) {
      this.APP.hydrate(saved);
      this.rev = Number(saved.rev) || 0;
    } else {
      this.APP.newCampaign(this.team.seed, this.team.maxSteps);
      this.rev = 1;
    }
    this.APP.ui.role = 'manager';
    this.history = readJson(path.join(this.teamDir(), 'history.json'), []);
    /* core.js prepends new reports to APP.reports and caps the list at 40, so we
     * intercept consumeReports instead of diffing the array. */
    const originalConsume = this.APP.consumeReports;
    this.pendingReceptions = [];
    this.APP.consumeReports = function (reports) {
      originalConsume.call(self.APP, reports);
      (reports || []).forEach(function (report) {
        if (report && report.reception) self.pendingReceptions.push(report);
      });
    };
  }

  look() {
    const self = this;
    return {
      mission: function (id) { return self.APP.mission(id); },
      point: function (id) {
        const p = self.CONFIG && self.CONFIG.points ? self.CONFIG.points[id] : null;
        return p && p.name ? p.name : String(id || 'unknown destination');
      },
      trajectory: function (id) {
        const t = self.CONFIG && self.CONFIG.trajectories ? self.CONFIG.trajectories[id] : null;
        return t && t.name ? t.name : String(id || 'direct');
      },
      card: function (id) {
        const idx = self.ctx && self.ctx.CARDS_BY_ID;
        return (idx && idx[id]) || null;
      }
    };
  }

  snapshot() {
    return this.APP.serialize();
  }

  /** Compact, language-neutral view of the selected mission's build. Clients
   *  render their own copy from ids and numbers: check codes, card ids and the
   *  key figures, never the Russian sentences core.js composes. */
  analysis() {
    const APP = this.APP;
    if (!APP || !APP.state) return null;
    const missionId = APP.selectedMissionId;
    if (!missionId) return null;
    let a = null;
    try { a = APP.buildAnalysis(missionId); } catch (err) { return null; }
    if (!a) return null;
    const manual = a.manual || {};
    const c = a.compute || {};
    const build = a.build || {};
    const sel = build.sel || {};
    const num = function (v) {
      if (typeof v !== 'number' || !isFinite(v)) return null;
      return Math.round(v * 1000) / 1000;
    };
    const codes = function (list) {
      return (list || []).map(function (x) { return x && x.id; }).filter(Boolean);
    };
    const instruments = (sel.instruments || []).map(function (row) {
      if (!row) return null;
      if (typeof row === 'string') return { id: row, count: 1 };
      return { id: row.id, count: Number(row.count) || 1 };
    }).filter(Boolean);
    const physical = (sel.physical || []).map(function (row) {
      if (!row) return null;
      return typeof row === 'string' ? row : row.id;
    }).filter(Boolean);
    return {
      missionId: missionId,
      score: a.score || 'bad',
      computed: !!manual.ok,
      checks: (c.checks || []).map(function (ch) {
        return { id: ch.id, ok: !!ch.ok };
      }),
      blockers: codes(a.blockers),
      warnings: codes(a.warnings),
      ready: {
        engineer: !!(build.ready && build.ready.engineer),
        scientist: !!(build.ready && build.ready.scientist)
      },
      selection: {
        rocket: sel.rocketId || null,
        reservation: sel.reservationId || null,
        control: sel.controlId || null,
        antenna: sel.antennaId || null,
        antennaDup: !!sel.antennaDup,
        moduleBuild: !!sel.moduleBuild,
        trajectory: build.trajId || null,
        physical: physical,
        instruments: instruments
      },
      numbers: {
        pSuccess: num(c.pSuccess),
        sDet: num(c.sDet),
        target: num(c.target),
        pChannel: num(c.pChannel),
        dataRatio: num(c.data && c.data.ratio),
        massKg: num(c.massKg),
        capacityKg: num(c.capacityKg),
        powerAvailable: num(c.power && c.power.available),
        powerRequired: num(c.power && c.power.required),
        slotsUsed: num(c.slots && c.slots.used),
        slotsTotal: num(c.slots && c.slots.total),
        price: num(manual.price),
        cap: num(manual.cap),
        prodTime: num(manual.prodTime),
        pmRate: num(manual.pmRate),
        pmFree: num(manual.pmFree),
        cashAfter: num(manual.cashAfter),
        deadline: num(c.deadline)
      }
    };
  }

  persist() {
    writeJson(path.join(this.teamDir(), 'state.json'), {
      rev: this.rev,
      savedAt: nowIso(),
      state: this.snapshot()
    });
  }

  recordReceptions() {
    const pending = this.pendingReceptions || [];
    this.pendingReceptions = [];
    const fresh = [];
    const self = this;
    pending.forEach(function (report) {
      if (!report || !report.reception) return;
      const entry = buildMissionEntry(report, self.look());
      if (self.history.some(function (h) { return h.id === entry.id; })) return;
      self.history.push(entry);
      fresh.push(entry);
    });
    if (fresh.length) writeJson(path.join(this.teamDir(), 'history.json'), this.history);
    return fresh;
  }

  dispatch(type, payload, role) {
    this.APP.ui.role = role;
    const res = this.APP.dispatch(type, payload || {});
    if (res && res.needsConfirm) return { res: res, fresh: [], record: null };
    this.rev += 1;
    const fresh = this.recordReceptions();
    this.persist();
    let record = null;
    if (this.APP.finished) record = this.finish();
    return { res: res, fresh: fresh, record: record };
  }

  finish() {
    const s = this.APP.state;
    if (!s) return null;
    const score = s.score || this.ENGINE.finalScore(s);
    const stats = s.stats || {};
    const participants = (this.team.roster || []).map(function (m) {
      return { name: m.name || maskEmail(m.email), roles: m.roles.slice() };
    });
    const record = {
      teamId: this.team.id,
      teamName: this.team.name,
      logo: this.team.logo || '',
      creator: maskEmail(this.team.creator),
      seed: this.team.seed,
      maxSteps: this.team.maxSteps,
      status: 'finished',
      createdAt: this.team.createdAt,
      finishedAt: nowIso(),
      participants: participants,
      rosterSize: participants.length,
      history: this.history.slice(),
      missions: this.history.slice(),
      score: score,
      stats: stats,
      rolePoints: this.APP.rolePoints || {},
      tieBreak: { total: score.total, vchk: s.vchk || 0, missions: stats.missions || 0 }
    };
    record.missionCount = record.missions.length;
    record.vchk = Math.round((s.vchk || 0) * 10) / 10;
    record.campaignNarrative = buildCampaignNarrative(record);
    saveTeamResult(this.dataDir, record);
    this.team.status = 'finished';
    this.team.finishedAt = record.finishedAt;
    this.onEvent({ type: 'finished', record: record });
    return record;
  }


  mask() {
    return {
      id: this.team.id,
      name: this.team.name,
      logo: this.team.logo || '',
      creator: this.team.creator,
      seed: this.team.seed,
      maxSteps: this.team.maxSteps,
      status: this.team.status,
      createdAt: this.team.createdAt,
      finishedAt: this.team.finishedAt || null,
      roster: (this.team.roster || []).map(function (m) {
        return { email: m.email, name: m.name || '', roles: m.roles.slice() };
      })
    };
  }
}


/** Replace an e-mail with a privacy-safe label: a***@domain. */
export function maskEmail(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at < 1) return 'participant';
  return s.slice(0, 1) + '***' + s.slice(at);
}
