"""Contact sheet of the emblems: art/emblem/preview/contact_sheet.png

    & '...\\ComfyUI\\.venv\\Scripts\\python.exe' tools/emblem-sheet.py [--cols 3] [--tile 512]

Draws captions with the file names and the parameters parsed from the name, plus separate
reduced previews in art/emblem/preview/ (jpeg, for a quick look).
Run from the project root (d:\\XAKATOH\\game).
"""
import glob
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.getcwd()
SRC = os.path.join(ROOT, 'art', 'emblem')
OUT = os.path.join(SRC, 'preview')
FONT = r'C:\Windows\Fonts\arialbd.ttf'


def opt(name, default):
    if name in sys.argv:
        return int(sys.argv[sys.argv.index(name) + 1])
    return default


COLS, TILE, PAD, LABEL = opt('--cols', 3), opt('--tile', 512), 10, 26


def load_font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(glob.glob(os.path.join(SRC, '*.png')))
    if not files:
        raise SystemExit('no PNG files in art/emblem')

    tiles = []
    for path in files:
        name = os.path.splitext(os.path.basename(path))[0]
        im = Image.open(path).convert('RGB')
        im.thumbnail((TILE, TILE), Image.LANCZOS)
        im.save(os.path.join(OUT, name + '.jpg'), quality=82)
        tiles.append((name, im))

    rows = (len(tiles) + COLS - 1) // COLS
    cell_w = max(im.width for _, im in tiles)
    cell_h = max(im.height for _, im in tiles)
    sheet = Image.new('RGB', (COLS * cell_w + PAD * (COLS + 1),
                              rows * (cell_h + LABEL) + PAD * (rows + 1)), (28, 28, 30))
    draw = ImageDraw.Draw(sheet)
    font = load_font(18)
    for i, (name, im) in enumerate(tiles):
        c, r = i % COLS, i // COLS
        x = PAD + c * (cell_w + PAD)
        y = PAD + r * (cell_h + LABEL + PAD)
        sheet.paste(im, (x + (cell_w - im.width) // 2, y + LABEL))
        draw.text((x + 2, y + 4), name, fill=(240, 240, 240), font=font)
    dest = os.path.join(OUT, 'contact_sheet.png')
    sheet.save(dest, optimize=True)
    sheet.convert('RGB').save(os.path.join(OUT, 'contact_sheet.jpg'), quality=88)
    print('files: %d -> %s (%d KB)' % (len(tiles), dest, os.path.getsize(dest) // 1024))


if __name__ == '__main__':
    main()
