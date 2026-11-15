/* Space Mission Design — deck backgrounds through ComfyUI (Z-Image).
 *
 *   node tools/gen-slides.mjs --dry-run
 *   node tools/gen-slides.mjs --only 01_title,02_problem
 *   node tools/gen-slides.mjs --skip-existing
 *
 * A running ComfyUI with these models is required:
 *   unet  z_image_bf16.safetensors
 *   clip  qwen_3_4b.safetensors (type lumina2)
 *   vae   ae.safetensors
 * The prompts live in demo/prompts.json, the images go to demo/art/<id>.png and are used
 * as slide backgrounds by demo/slides.html. The workflow is built in the API format, so no
 * ComfyUI workflow file is needed. Every image is AI-generated and the slide marks it.
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

const OPTS = {
  url: String(arg('url', process.env.COMFY_URL || 'http://127.0.0.1:8000')).replace(/\/+$/, ''),
  prompts: path.join(root, 'demo', 'prompts.json'),
  outDir: path.join(root, 'demo', 'art'),
  only: arg('only', null),
  seed: Number(arg('seed', 0)),
  skipExisting: !!arg('skip-existing', false),
  dryRun: !!arg('dry-run', false),
  timeoutSec: Number(arg('timeout', 900)),
  unet: 'z_image_bf16.safetensors',
  clip: 'qwen_3_4b.safetensors',
  vae: 'ae.safetensors'
};

/* ---------- prompts ---------- */
const P = JSON.parse(fs.readFileSync(OPTS.prompts, 'utf8'));
const S = P.settings || {};
const SIZE = {
  width: Number(S.width) || 1280,
  height: Number(S.height) || 720,
  steps: Number(S.steps) || 30,
  cfg: Number(S.cfg) || 5,
  shift: Number(S.shift) || 3
};
if (!OPTS.seed) OPTS.seed = Number(S.seed) || 20261115;

const fullPrompt = (entry) => [P.style || '', entry.prompt].filter(Boolean).join(' ');

/* ---------- ComfyUI API workflow ---------- */
function graph(entry, seed) {
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: OPTS.unet, weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: OPTS.clip, type: 'lumina2' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: OPTS.vae } },
    '4': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: SIZE.shift } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: fullPrompt(entry) } },
    '6': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: P.negative || '' } },
    '7': { class_type: 'EmptySD3LatentImage', inputs: { width: SIZE.width, height: SIZE.height, batch_size: 1 } },
    '8': {
      class_type: 'KSampler',
      inputs: {
        model: ['4', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0],
        seed, steps: SIZE.steps, cfg: SIZE.cfg,
        sampler_name: 'res_multistep', scheduler: 'simple', denoise: 1
      }
    },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } },
    '10': { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: 'slides/' + entry.id } }
  };
}

/* ---------- transport ---------- */
async function postPrompt(wf) {
  const res = await fetch(OPTS.url + '/prompt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: wf, client_id: 'smd-gen-slides' })
  });
  if (!res.ok) throw new Error('POST /prompt HTTP ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const data = await res.json();
  if (data.node_errors && Object.keys(data.node_errors).length) {
    throw new Error('workflow errors: ' + JSON.stringify(data.node_errors).slice(0, 400));
  }
  if (!data.prompt_id) throw new Error('no prompt_id in the response');
  return data.prompt_id;
}

async function waitFor(promptId) {
  const started = Date.now();
  for (;;) {
    const res = await fetch(OPTS.url + '/history/' + promptId);
    if (res.ok) {
      const item = (await res.json())[promptId];
      if (item) {
        const status = item.status || {};
        if (status.status_str === 'error') {
          throw new Error('generation failed: ' + JSON.stringify(status.messages || {}).slice(0, 400));
        }
        for (const out of Object.values(item.outputs || {})) {
          if (out && Array.isArray(out.images) && out.images.length) return out.images[0];
        }
        if (status.completed) throw new Error('completed without images');
      }
    }
    if (Date.now() - started > OPTS.timeoutSec * 1000) throw new Error('timeout after ' + OPTS.timeoutSec + ' s');
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function download(image, dest) {
  const q = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder || '',
    type: image.type || 'output'
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
  if (!Array.isArray(P.slides) || !P.slides.length) throw new Error('no slides in ' + OPTS.prompts);

  let queue = P.slides;
  if (OPTS.only) {
    const ids = String(OPTS.only).split(',').map((s) => s.trim()).filter(Boolean);
    queue = queue.filter((s) => ids.some((id) => s.id === id || s.id.startsWith(id)));
  }
  if (OPTS.skipExisting) queue = queue.filter((s) => !fs.existsSync(path.join(OPTS.outDir, s.id + '.png')));
  if (!queue.length) { console.log('nothing to generate'); return; }

  const sample = graph(queue[0], OPTS.seed);
  if (OPTS.dryRun) {
    console.log('backgrounds in the queue: ' + queue.length);
    console.log('ComfyUI: ' + OPTS.url);
    console.log('API nodes: ' + Object.values(sample).map((n) => n.class_type).join(', '));
    console.log('prompt (' + queue[0].id + '):\n  ' + fullPrompt(queue[0]));
    console.log('seed ' + OPTS.seed + ', steps ' + SIZE.steps + ', cfg ' + SIZE.cfg + ', shift ' + SIZE.shift +
      ', ' + SIZE.width + '×' + SIZE.height + ' → demo/art/');
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const entry of queue) {
    const dest = path.join(OPTS.outDir, entry.id + '.png');
    process.stdout.write(entry.id + ' ');
    try {
      const id = await postPrompt(graph(entry, OPTS.seed));
      const image = await waitFor(id);
      const size = await download(image, dest);
      ok++;
      console.log('ok ' + Math.round(size / 1024) + ' KB');
    } catch (err) {
      fail++;
      console.log('FAIL ' + err.message);
    }
    OPTS.seed++;
  }
  console.log('total: ' + ok + ' ok, ' + fail + ' errors → demo/art/');
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
