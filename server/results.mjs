/* Space Mission Design — per-team and global results archive. */
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, ensureDir, nowIso, round } from './util.mjs';

function sortKey(a, b) {
  if ((b.total || 0) !== (a.total || 0)) return (b.total || 0) - (a.total || 0);
  if ((b.vchk || 0) !== (a.vchk || 0)) return (b.vchk || 0) - (a.vchk || 0);
  if ((b.missionCount || 0) !== (a.missionCount || 0)) return (b.missionCount || 0) - (a.missionCount || 0);
  return String(a.finishedAt || '').localeCompare(String(b.finishedAt || ''));
}

export function summarize(record) {
  const stats = record.stats || {};
  return {
    teamId: record.teamId,
    teamName: record.teamName,
    total: round(record.score && record.score.total, 1),
    rating: round(record.score && record.score.rating, 1),
    vchk: round(record.vchk != null ? record.vchk : (record.score && record.score.vchk), 1),
    missionCount: record.missionCount || (record.missions || []).length,
    success: stats.success || 0,
    partial: stats.partial || 0,
    fail: stats.fail || 0,
    rosterSize: record.rosterSize || (record.participants || []).length,
    seed: record.seed,
    maxSteps: record.maxSteps,
    finishedAt: record.finishedAt
  };
}

export function globalPath(dataDir) {
  return path.join(dataDir, 'results', 'global.json');
}

export function loadGlobal(dataDir) {
  const g = readJson(globalPath(dataDir), null);
  if (g && Array.isArray(g.teams)) return g;
  return { updatedAt: null, teams: [] };
}

export function saveTeamResult(dataDir, record) {
  const dir = path.join(dataDir, 'results');
  ensureDir(dir);
  writeJson(path.join(dir, record.teamId + '.json'), record);
  const global = loadGlobal(dataDir);
  const summary = summarize(record);
  global.teams = (global.teams || []).filter(function (t) { return t.teamId !== summary.teamId; });
  global.teams.push(summary);
  global.teams.sort(sortKey);
  global.updatedAt = nowIso();
  writeJson(globalPath(dataDir), global);
  return summary;
}

export function loadTeamResult(dataDir, teamId) {
  const file = path.join(dataDir, 'results', String(teamId).replace(/[^a-zA-Z0-9_-]/g, '') + '.json');
  if (!fs.existsSync(file)) return null;
  return readJson(file, null);
}

export function hasTeamResult(dataDir, teamId) {
  const file = path.join(dataDir, 'results', String(teamId).replace(/[^a-zA-Z0-9_-]/g, '') + '.json');
  return fs.existsSync(file);
}
