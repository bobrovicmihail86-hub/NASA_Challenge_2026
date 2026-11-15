/* Space Mission Design — server utilities (zero dependencies).
 * Atomic JSON storage, id/token helpers, HTTP body + response helpers.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf8');
  fs.renameSync(tmp, file);
}

export function makeId(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

export function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function normEmail(value) {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 120 ? s : null;
}

export function cleanText(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max || 120);
}

export function cleanId(value, max) {
  return String(value == null ? '' : value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, max || 40);
}

export function nowIso() {
  return new Date().toISOString();
}

export function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

export function readBody(req, limit) {
  const cap = limit || 2 * 1024 * 1024;
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > cap) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

export function round(x, d) {
  const f = Math.pow(10, d == null ? 1 : d);
  return Math.round((Number(x) || 0) * f) / f;
}

export function signed(x, d) {
  const v = round(x, d == null ? 1 : d);
  return (v >= 0 ? '+' : '') + v;
}
