/* Language gate: node tools/lang-check.mjs [--all] [--list]
 *
 * The English edition keeps every display string in Latin script. The frozen
 * Russian fork lives in ru/ and is the only place where Cyrillic is expected.
 *
 *   default  — scans code strings, HTML text and Markdown (comments ignored);
 *   --all    — also reports comments (used for the final cleanup pass);
 *   --list   — prints every offending line, not just a per-file sample.
 *
 * Exit code 1 means Cyrillic leaked outside ru/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const withComments = args.includes('--all');
const listAll = args.includes('--list');

const SKIP_DIRS = new Set(['node_modules', '.git', 'ru', 'art', 'doc NASA', 'assets']);
const SKIP_FILES = /(session-.*\.json|history.*\.json|package-lock\.json)$/i;
const EXTS = new Set(['.js', '.mjs', '.html', '.css', '.md', '.json']);
const CYR = new RegExp('[\\u0401\\u0410-\\u044F\\u0451]');

function walk(dir, acc) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (entry.name.startsWith('.')) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) return;
      walk(full, acc);
      return;
    }
    if (!EXTS.has(path.extname(entry.name).toLowerCase())) return;
    if (SKIP_FILES.test(entry.name)) return;
    acc.push(full);
  });
  return acc;
}

const blank = (text) => text.replace(/[^\n]/g, ' ');

function stripComments(text, ext) {
  let out = text;
  if (ext === '.html' || ext === '.md') out = out.replace(/<!--[\s\S]*?-->/g, blank);
  if (ext === '.css') return out.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (ext === '.js' || ext === '.mjs') {
    out = out.replace(/\/\*[\s\S]*?\*\//g, blank);
    out = out.replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, head) => head + blank(m.slice(head.length)));
  }
  return out;
}

const files = walk(root, []).sort();
const offenders = [];

files.forEach((file) => {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const ext = path.extname(file).toLowerCase();
  const raw = fs.readFileSync(file, 'utf8');
  const text = withComments ? raw : stripComments(raw, ext);
  const rawLines = raw.split(/\r?\n/);
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (CYR.test(line)) hits.push([i + 1, (rawLines[i] || '').trim()]);
  });
  if (hits.length) offenders.push({ rel, hits });
});

if (!offenders.length) {
  console.log('lang-check: no Cyrillic outside ru/ — ok');
  process.exit(0);
}

let total = 0;
offenders.forEach(({ rel, hits }) => {
  total += hits.length;
  console.log(rel + ' — ' + hits.length + ' Cyrillic line(s)');
  const shown = listAll ? hits : hits.slice(0, 5);
  shown.forEach(([n, line]) => console.log('  ' + n + ': ' + line.slice(0, 110)));
  if (!listAll && hits.length > shown.length) console.log('  … ' + (hits.length - shown.length) + ' more');
});

console.log('\nfiles with Cyrillic: ' + offenders.length + ', lines: ' + total +
  (withComments ? ' (comments included)' : ' (comments excluded)'));
process.exit(1);
