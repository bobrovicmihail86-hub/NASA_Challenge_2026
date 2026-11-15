# Mission emblem “TO SPACE!” — Vasya Lozhkin style

Pipeline: ComfyUI (SDXL) → `tools/gen-emblem.mjs` → `art/emblem/*.png`.

| What | Where |
|-----|-----|
| Graph (API format) | `art/workflows/emblem_sdxl.api.json` |
| Prompts and settings | `art/emblem/prompts.json` |
| Generation script | `tools/gen-emblem.mjs` |
| Contact sheet | `tools/emblem-sheet.py` → `art/emblem/preview/contact_sheet.png` |
| Variants | `art/emblem/<variant>[_<tag>]_<seed>.png` |

## Models

* checkpoint `NoobAI-XL-v1.1.safetensors` — Illustrious/SDXL, epsilon-prediction,
  7 105 349 958 bytes, 2514 tensors (`C:\Users\Admin\Documents\ComfyUI\models\checkpoints\`).
* LoRA `Lozhkin_style_Illustrious.safetensors` — 217.9 MB, base `sdxl_base_v1-0`,
  activation tag `lozhkin` (109 hits in `ss_tag_frequency`), working range 0.8–1.5
  (`C:\Users\Admin\Documents\ComfyUI\models\loras\`).

## Default parameters

`dpmpp_2m` / `karras`, 28 steps, cfg 5.0, 1024×1024, LoRA 1.0, no quality tags
(the LoRA author: without `masterpiece/best quality` the style transfers more precisely).
Negative: `jpeg artifacts, cropped, signature, watermark, text, letters, numbers, words,
typography, cyrillic, blurry, low contrast, photorealistic, 3d render, anime screencap,
deformed hands, extra fingers, extra limbs, cluttered`.

## What has been generated

| File | Seed | LoRA | Assessment |
|------|-----|------|--------|
| `emblem_103.png` | 103 | 1.0 | round emblem, a cat in a spacesuit, but the "box" covers the muzzle |
| `emblem_s09_103.png` | 103 | 0.9 | **best badge**: a cat in a green spacesuit, stars, an orange rim, painterly |
| `emblem_s12_103.png` | 103 | 1.2 | a large nose-character in a circle, the rim is blurred |
| `emblem_101.png` | 101 | 1.0 | a flat pattern of tokens, not an emblem |
| `emblem_102.png` | 102 | 1.0 | bright lubok, chaos + the random text "ESTAR" |
| `emblem_104.png` | 104 | 1.0 | a lone astronaut fellow, great style, the composition is not an emblem |
| `emblem_207/208`, `emblem_b09_401..404` | — | 1.0 / 0.9 | the second wave on a refined prompt |
| `patch_301/302.png` | 301/302 | 1.0 | the "embroidered patch" idea did not work: an abstract cube with a face |

## Findings

* The `lozhkin` tag works immediately; the style (lubok, rough shapes, thick outline, painting)
  transfers confidently onto NoobAI-XL v1.1.
* `strength 0.9` gives a tidier round composition, `1.2` stylises harder
  but blurs the rim of the badge.
* "A board game box in its hands" often turns into a flat plane in front of the muzzle — the wording
  was replaced with `hugging a small board game box in its paws at chest level`.
* SDXL does not write Cyrillic: the “TO SPACE!” lettering is laid over the clean badge
  (Photoshop / Pillow, the `arialbd` / `segoeuib` fonts).

## Re-running

```powershell
node tools/gen-emblem.mjs --dry-run
node tools/gen-emblem.mjs --seeds 401,402,403,404 --lora-strength 0.9 --tag b09
python tools/emblem-sheet.py --cols 3 --tile 512
```
