/* Space Mission Design — mission emblem in the Vasya Lozhkin style through ComfyUI.
 *
 *   node tools/gen-emblem.mjs --dry-run
 *   node tools/gen-emblem.mjs --seeds 101,102 --variant emblem
 *   node tools/gen-emblem.mjs --seeds 201,202 --variant patch --lora-strength 1.2
 *
 * A running ComfyUI is required (http://127.0.0.1:8000 by default) with the models:
 *   checkpoints  NoobAI-XL-v1.1.safetensors           (Illustrious/SDXL, epsilon)
 *   loras        Lozhkin_style_Illustrious.safetensors  (activation tag: lozhkin)
 * The graph is art/workflows/emblem_sdxl.api.json (API format), the prompts are art/emblem/prompts.json.
 * The files are stored in art/emblem/<variant>_<seed>.png.
 */
import fs from 'node:fs';
import path from 'node:path';
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

const P = JSON.parse(fs.readFileSync(path.join(root, 'art', 'emblem', 'prompts.json'), 'utf8'));
const S = P.settings || {};
const variant = String(arg('variant', P.defaultSubject || 'emblem'));
const tag = String(arg('tag', ''));

const OPTS = {
  url: String(arg('url', process.env.COMFY_URL || 'http://127.0.0.1:8000')),
  workflow: String(arg('workflow', path.join(root, 'art', 'workflows', 'emblem_sdxl.api.json'))),
  variant: variant,
  seeds: String(arg('seeds', (S.seeds || [101]).join(',')))
    .split(',').map((s) => Number(String(s).trim())).filter((n) => Number.isFinite(n)),
  prompt: arg('prompt', null),
  negative: arg('negative', null),
  checkpoint: String(arg('checkpoint', S.checkpoint || 'NoobAI-XL-v1.1.safetensors')),
  lora: String(arg('lora', S.lora || 'Lozhkin_style_Illustrious.safetensors')),
  loraStrength: Number(arg('lora-strength', S.loraStrength != null ? S.loraStrength : 1.0)),
  steps: Number(arg('steps', S.steps || 28)),
  cfg: Number(arg('cfg', S.cfg || 5)),
  width: Number(arg('width', S.width || 1024)),
  height: Number(arg('height', S.height || 1024)),
  sampler: String(arg('sampler', S.sampler || 'dpmpp_2m')),
  scheduler: String(arg('scheduler', S.scheduler || 'karras')),
  tag: tag,
  prefix: String(arg('prefix', 'emblem/' + variant + (tag ? '_' + tag : ''))),
  outDir: path.join(root, 'art', 'emblem'),
  dryRun: !!arg('dry-run', false),
  timeoutSec: Number(arg('timeout', 600))
};

function makePrompt(name) {
  const subject = (P.subjects || {})[name];
  if (!subject) {
    throw new Error('no variant “' + name + '” in art/emblem/prompts.json: ' +
      Object.keys(P.subjects || {}).join(', '));
  }
  return [subject, P.style, P.suffix].filter(Boolean).join('. ') + '.';
}

/* ---------- ComfyUI: the graph ---------- */
function findNodes(api, type) {
  return Object.keys(api).filter((id) => api[id].class_type === type);
}

function prepare(base, prompt, negative, seed) {
  const api = JSON.parse(JSON.stringify(base));

  const ckpt = findNodes(api, 'CheckpointLoaderSimple')[0];
  if (!ckpt) throw new Error('the graph has no CheckpointLoaderSimple');
  api[ckpt].inputs.ckpt_name = OPTS.checkpoint;

  const lorae = findNodes(api, 'LoraLoaderModelOnly')[0];
  if (!lorae) throw new Error('the graph has no LoraLoaderModelOnly');
  api[lorae].inputs.lora_name = OPTS.lora;
  api[lorae].inputs.strength_model = OPTS.loraStrength;

  const samplerId = findNodes(api, 'KSampler')[0];
  if (!samplerId) throw new Error('the graph has no KSampler');
  const sampler = api[samplerId];
  const pos = api[String(sampler.inputs.positive[0])];
  const neg = api[String(sampler.inputs.negative[0])];
  if (!pos || !neg) throw new Error('the KSampler is not linked to CLIPTextEncode');
  pos.inputs.text = prompt;
  neg.inputs.text = negative;

  sampler.inputs.seed = seed;
  sampler.inputs.steps = OPTS.steps;
  sampler.inputs.cfg = OPTS.cfg;
  sampler.inputs.sampler_name = OPTS.sampler;
  sampler.inputs.scheduler = OPTS.scheduler;

  const latentId = findNodes(api, 'EmptyLatentImage')[0];
  if (!latentId) throw new Error('the graph has no EmptyLatentImage');
  api[latentId].inputs.width = OPTS.width;
  api[latentId].inputs.height = OPTS.height;

  findNodes(api, 'SaveImage').forEach((id) => { api[id].inputs.filename_prefix = OPTS.prefix; });
  return api;
}

/* ---------- ComfyUI: HTTP ---------- */
async function checkModels() {
  const wanted = [
    ['CheckpointLoaderSimple', 'ckpt_name', OPTS.checkpoint],
    ['LoraLoaderModelOnly', 'lora_name', OPTS.lora]
  ];
  const problems = [];
  for (const [node, key, name] of wanted) {
    const res = await fetch(OPTS.url + '/object_info/' + node).catch((e) => {
      throw new Error('ComfyUI does not answer at ' + OPTS.url + ': ' + e.message);
    });
    if (!res.ok) throw new Error('ComfyUI answered HTTP ' + res.status + ' on /object_info/' + node);
    const json = await res.json();
    const spec = (((json[node] || {}).input || {}).required || {})[key];
    const list = (spec && spec[0]) || [];
    if (!list.includes(name)) problems.push(name + ' (not in the ' + node + ' list)');
  }
  if (problems.length) {
    throw new Error('ComfyUI cannot see the models: ' + problems.join('; ') +
      '\n  → check models/checkpoints and models/loras, then restart the server');
  }
}

async function postPrompt(api) {
  const res = await fetch(OPTS.url + '/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: api, client_id: 'smd-gen-emblem' })
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
  const prompt = OPTS.prompt ? String(OPTS.prompt) : makePrompt(OPTS.variant);
  const negative = OPTS.negative ? String(OPTS.negative) : P.negative;
  if (!OPTS.seeds.length) throw new Error('no seed given');

  const base = JSON.parse(fs.readFileSync(OPTS.workflow, 'utf8'));
  const sample = prepare(base, prompt, negative, OPTS.seeds[0]);
  const sampler = sample[findNodes(sample, 'KSampler')[0]];
  const latent = sample[findNodes(sample, 'EmptyLatentImage')[0]];

  console.log('variant: ' + OPTS.variant + ', seeds: ' + OPTS.seeds.join(', '));
  console.log('API nodes: ' + Object.keys(base).map((k) => base[k].class_type).join(', '));
  console.log('checkpoint: ' + OPTS.checkpoint + ', LoRA: ' + OPTS.lora + ' @ ' + OPTS.loraStrength);
  console.log('seed ' + sampler.inputs.seed + ', steps ' + sampler.inputs.steps + ', cfg ' + sampler.inputs.cfg +
    ', sampler ' + sampler.inputs.sampler_name + '/' + sampler.inputs.scheduler +
    ', ' + latent.inputs.width + '×' + latent.inputs.height);
  console.log('prompt:\n  ' + prompt);
  console.log('negative:\n  ' + negative);
  if (arg('dump', false)) console.log(JSON.stringify(sample, null, 2));
  if (OPTS.dryRun) return;

  await checkModels();

  let ok = 0, fail = 0;
  for (const seed of OPTS.seeds) {
    const wf = prepare(base, prompt, negative, seed);
    const dest = path.join(OPTS.outDir, OPTS.variant + (OPTS.tag ? '_' + OPTS.tag : '') + '_' + seed + '.png');
    process.stdout.write(OPTS.variant + '_' + seed + ' ');
    try {
      const id = await postPrompt(wf);
      const image = await waitFor(id);
      const size = await download(image, dest);
      ok++;
      console.log(' ok ' + Math.round(size / 1024) + ' KB → ' + path.relative(root, dest));
    } catch (err) {
      fail++;
      console.log(' FAIL ' + err.message);
    }
  }
  console.log('total: ' + ok + ' ok, ' + fail + ' errors → art/emblem/');
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
