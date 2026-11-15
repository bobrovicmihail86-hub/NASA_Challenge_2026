/* Space Mission Design — card art generation through ComfyUI (Z-Image Turbo).
 *
 *   node tools/gen-art.mjs --dry-run
 *   node tools/gen-art.mjs --write-manifest
 *   node tools/gen-art.mjs --only rocket_ --limit 2
 *   node tools/gen-art.mjs --with-aux --skip-existing
 *
 * A running ComfyUI with the models from comui.json is required:
 *   unet  z_image_bf16.safetensors
 *   clip  qwen_3_4b.safetensors (type lumina2)
 *   vae   ae.safetensors
 * The files are stored in art/assets/<id>.png, the manifest — art/manifest.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- arguments ---------- */
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  if (i === -1) return def;
  const next = argv[i + 1];
  return (next && !next.startsWith('--')) ? next : true;
};
const defaultWorkflow = (function () {
  const candidates = [
    path.join(root, '..', 'rules', 'comui.json'),
    path.join(root, 'comui.json'),
    path.join(root, 'art', 'comui.json')
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
})();

const OPTS = {
  url: String(arg('url', process.env.COMFY_URL || 'http://127.0.0.1:8000')),
  workflow: String(arg('workflow', defaultWorkflow)),
  only: arg('only', null),
  limit: Number(arg('limit', 0)),
  seed: Number(arg('seed', 20250101)),
  width: Number(arg('width', 0)),
  height: Number(arg('height', 0)),
  steps: Number(arg('steps', 0)),
  cfg: Number(arg('cfg', 0)),
  dryRun: !!arg('dry-run', false),
  writeManifest: !!arg('write-manifest', false),
  skipExisting: !!arg('skip-existing', false),
  withAux: !!arg('with-aux', false),
  outDir: path.join(root, 'art', 'assets'),
  timeoutSec: Number(arg('timeout', 600))
};

/* ---------- data ---------- */
function loadData() {
  const ctx = { console };
  vm.createContext(ctx);
  ['data/config.js', 'data/cards.js', 'data/missions.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  });
  return ctx;
}

function collectEntries(data) {
  const { CARDS, MISSIONS, SALVAGE } = data;
  const entries = [];
  Object.keys(CARDS).forEach((deck) => {
    CARDS[deck].forEach((c) => {
      if (c.kind === 'auxiliary' && !OPTS.withAux) return;
      entries.push({
        id: c.id, kind: c.kind || deck.replace(/s$/, ''), name: c.name,
        fields: c, point: null, year: null, agency: null
      });
    });
  });
  MISSIONS.forEach((m) => entries.push({
    id: m.id, kind: 'mission', name: m.name, fields: m,
    point: m.point, year: m.year, agency: m.agency
  }));
  (SALVAGE || []).forEach((s) => entries.push({
    id: s.id, kind: 'salvage', name: s.name, fields: s,
    point: s.point, year: null, agency: null
  }));
  return entries;
}

function describe(entry, P) {
  const d = P.descriptors || {};
  const f = entry.fields || {};
  const pick = (obj, key, def) => (obj && obj[key]) || def;
  switch (entry.kind) {
    case 'rocket': return { clsEn: pick(d.clsEn, f.cls, 'a medium-lift') };
    case 'reservation': return { resEn: pick(d.resEn, f.t, 'a single-string') };
    case 'instrument': return { insEn: pick(d.insEn, entry.id, 'a scientific instrument') };
    case 'antenna': return { antEn: pick(d.antEn, entry.id, 'a parabolic') };
    case 'power': return { pwrEn: pick(d.pwrEn, entry.id, 'a solar') };
    case 'physical': return { phyEn: pick(d.phyEn, f.key, 'a planetary surface') };
    case 'facility': return { facEn: pick(d.facEn, entry.id, 'an aerospace') };
    case 'mission': return { agencyEn: pick(d.agencyEn, f.agency, 'an international') };
    default: return {};
  }
}

/* ---------- prompts ---------- */
function isScene(entry) {
  return !!entry.point || entry.kind === 'facility' || entry.kind === 'event';
}

function negativeFor(entry, P) {
  return isScene(entry) ? (P.negativeSpace || P.negative) : P.negative;
}

function makePrompt(entry, P, CONFIG) {
  const subject = P.subjects[entry.kind] || P.subjects.auxiliary;
  const f = entry.fields || {};
  const pointName = entry.point ? (CONFIG.points[entry.point] || {}).name : '';
  const vars = Object.assign({
    name: entry.name,
    payload: f.payload != null ? f.payload : '',
    watts: f.watts != null ? f.watts : '',
    bw: f.bw != null ? f.bw : '',
    slots: f.slots != null ? f.slots : '',
    mass: f.mass != null ? f.mass : '',
    kwh: f.kwh != null ? f.kwh : '',
    year: entry.year || '',
    agency: entry.agency || '',
    point: pointName,
    pointEn: entry.point ? ((P.descriptors && P.descriptors.pointEn || {})[entry.point] || pointName) : ''
  }, describe(entry, P));
  let text = subject.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : ''));
  if (entry.point) text += '. ' + (P.pointScenes[entry.point] || '');
  const scene = isScene(entry);
  const background = scene ? '' : (P.background || '');
  const style = scene ? (P.sceneStyle || P.style) : P.style;
  return [text, background, style, P.suffix].filter(Boolean).join('. ') + '.';
}

function buildManifest(entries, P, CONFIG) {
  return entries.map((e) => ({
    id: e.id,
    kind: e.kind,
    name: e.name,
    point: e.point,
    prompt: makePrompt(e, P, CONFIG),
    negative: negativeFor(e, P),
    file: 'art/assets/' + e.id + '.png',
    status: fs.existsSync(path.join(OPTS.outDir, e.id + '.png')) ? 'done' : 'pending'
  }));
}

/* ---------- ComfyUI: UI workflow → API format ---------- */
const WIDGETS = {
  UNETLoader: ['unet_name', 'weight_dtype'],
  CLIPLoader: ['clip_name', 'type', 'device'],
  VAELoader: ['vae_name'],
  CLIPTextEncode: ['text'],
  EmptySD3LatentImage: ['width', 'height', 'batch_size'],
  ModelSamplingAuraFlow: ['shift'],
  SaveImage: ['filename_prefix'],
  VAEDecode: [],
  // KSampler: widgets_values holds control_after_generate after the seed
  KSampler: ['seed', 'steps', 'cfg', 'sampler_name', 'scheduler', 'denoise']
};

function uiToApi(ui) {
  const nodes = (ui.nodes || []).filter((n) => n.type !== 'MarkdownNote' && n.type !== 'Note');
  const link = {};
  (ui.links || []).forEach((l) => { link[l[0]] = { from: l[1], slot: l[2] }; });

  const api = {};
  nodes.forEach((n) => {
    const names = WIDGETS[n.type];
    if (!names) return;
    const inputs = {};
    (n.inputs || []).forEach((inp) => {
      if (inp.link == null || !link[inp.link]) return;
      inputs[inp.name] = [String(link[inp.link].from), link[inp.link].slot];
    });
    let wv = Array.isArray(n.widgets_values) ? n.widgets_values.slice() : [];
    if (n.type === 'KSampler') wv = [wv[0], wv[2], wv[3], wv[4], wv[5], wv[6]];
    names.forEach((name, i) => {
      if (wv[i] !== undefined) inputs[name] = wv[i];
    });
    api[String(n.id)] = { class_type: n.type, inputs: inputs, _meta: { title: n.title || n.type } };
  });
  return api;
}

function findNodes(api, type) {
  return Object.keys(api).filter((id) => api[id].class_type === type);
}

function linkTarget(api, linkRef) {
  return linkRef && linkRef[0] ? api[String(linkRef[0])] : null;
}

function prepareWorkflow(base, entry, prompt, P) {
  const api = JSON.parse(JSON.stringify(base));
  const samplers = findNodes(api, 'KSampler');
  if (!samplers.length) throw new Error('the workflow has no KSampler');
  const sampler = api[samplers[0]];
  const positive = linkTarget(api, sampler.inputs.positive);
  const negative = linkTarget(api, sampler.inputs.negative);
  if (positive) positive.inputs.text = prompt;
  if (negative) negative.inputs.text = negativeFor(entry, P);

  sampler.inputs.seed = OPTS.seed;
  if (OPTS.steps) sampler.inputs.steps = OPTS.steps;
  if (OPTS.cfg) sampler.inputs.cfg = OPTS.cfg;

  const latents = findNodes(api, 'EmptySD3LatentImage');
  if (latents.length) {
    if (OPTS.width) api[latents[0]].inputs.width = OPTS.width;
    if (OPTS.height) api[latents[0]].inputs.height = OPTS.height;
  }
  findNodes(api, 'SaveImage').forEach((id) => {
    api[id].inputs.filename_prefix = 'smd/' + entry.id;
  });
  return api;
}

async function postPrompt(api) {
  const res = await fetch(OPTS.url + '/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: api, client_id: 'smd-gen-art' })
  });
  const json = await res.json().catch(() => ({}));
  const nodeErrors = json.node_errors && Object.keys(json.node_errors).length;
  if (!res.ok || json.error || nodeErrors) {
    throw new Error('ComfyUI refused: ' + JSON.stringify(json.error || json.node_errors || json).slice(0, 600));
  }
  return json.prompt_id;
}

async function waitFor(promptId) {
  const deadline = Date.now() + OPTS.timeoutSec * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(OPTS.url + '/history/' + promptId);
    const json = await res.json().catch(() => ({}));
    const item = json[promptId];
    if (item) {
      if (item.status && item.status.status_str === 'error') {
        throw new Error('execution error: ' + JSON.stringify(item.status.messages || item.status).slice(0, 600));
      }
      const outs = item.outputs || {};
      const images = Object.keys(outs).reduce((a, k) => a.concat(outs[k].images || []), []);
      if (images.length) return images[images.length - 1];
    }
    process.stdout.write('.');
  }
  throw new Error('timeout ' + OPTS.timeoutSec + ' s');
}

async function download(image, dest) {
  const q = new URLSearchParams({
    filename: image.filename, subfolder: image.subfolder || '', type: image.type || 'output'
  });
  const res = await fetch(OPTS.url + '/view?' + q.toString());
  if (!res.ok) throw new Error('failed to download ' + image.filename + ': HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

/* ---------- main ---------- */
async function main() {
  const data = loadData();
  const P = JSON.parse(fs.readFileSync(path.join(root, 'art', 'prompts.json'), 'utf8'));

  /* prompts.json settings — the defaults; CLI flags win over them. */
  const settings = P.settings || {};
  if (!OPTS.width) OPTS.width = Number(settings.width) || 0;
  if (!OPTS.height) OPTS.height = Number(settings.height) || 0;
  if (!OPTS.steps) OPTS.steps = Number(settings.steps) || 0;
  if (!OPTS.cfg) OPTS.cfg = Number(settings.cfg) || 0;

  const entries = collectEntries(data);

  const manifest = buildManifest(entries, P, data.CONFIG);

  let queue = entries;
  if (OPTS.only) {
    const prefixes = String(OPTS.only).split(',');
    queue = queue.filter((e) => prefixes.some((p) => e.id.startsWith(p) || e.kind === p));
  }
  if (OPTS.skipExisting) queue = queue.filter((e) => !fs.existsSync(path.join(OPTS.outDir, e.id + '.png')));
  if (OPTS.limit) queue = queue.slice(0, OPTS.limit);
  if (!queue.length) { console.log('nothing to generate'); return; }

  const ui = JSON.parse(fs.readFileSync(OPTS.workflow, 'utf8'));
  const base = uiToApi(ui);
  const sample = prepareWorkflow(base, queue[0], makePrompt(queue[0], P, data.CONFIG), P);
  const ks = sample[findNodes(sample, 'KSampler')[0]];
  const lat = sample[findNodes(sample, 'EmptySD3LatentImage')[0]];

  if (OPTS.dryRun || OPTS.writeManifest) {
    console.log('cards in the queue: ' + queue.length);
    console.log('API nodes: ' + Object.keys(base).map((k) => base[k].class_type).join(', '));
    console.log('prompt (' + queue[0].id + '):\n  ' + makePrompt(queue[0], P, data.CONFIG));
    console.log('seed ' + ks.inputs.seed + ', steps ' + ks.inputs.steps + ', cfg ' + ks.inputs.cfg +
      ', sampler ' + ks.inputs.sampler_name + '/' + ks.inputs.scheduler + ', ' + lat.inputs.width + '×' + lat.inputs.height);
    if (arg('dump', false)) console.log(JSON.stringify(sample, null, 2));
    if (OPTS.dryRun) return;
  }

  const writeManifest = (items) => {
    fs.mkdirSync(path.join(root, 'art'), { recursive: true });
    fs.writeFileSync(path.join(root, 'art', 'manifest.json'), JSON.stringify({
      generatedAt: new Date().toISOString(), count: items.length, items
    }, null, 2) + '\n', 'utf8');
    console.log('manifest: art/manifest.json — ' + items.length + ' cards');
  };

  writeManifest(manifest);
  if (OPTS.writeManifest) return;

  let ok = 0, fail = 0;
  for (const e of queue) {
    const dest = path.join(OPTS.outDir, e.id + '.png');
    const prompt = makePrompt(e, P, data.CONFIG);
    const wf = prepareWorkflow(base, e, prompt, P);
    process.stdout.write(e.id + ' ');
    try {
      const id = await postPrompt(wf);
      const image = await waitFor(id);
      const size = await download(image, dest);
      ok++;
      console.log(' ok ' + Math.round(size / 1024) + ' KB');
    } catch (err) {
      fail++;
      console.log(' FAIL ' + err.message);
    }
    OPTS.seed++;
  }
  writeManifest(buildManifest(entries, P, data.CONFIG));
  console.log('total: ' + ok + ' ok, ' + fail + ' errors → art/assets/');
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });


