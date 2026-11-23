#!/usr/bin/env python3
"""Draws the product atlas from the manifest written by tools/atlas.ts: usage: atlas.py manifest.json out.png
Cells are packed edge to edge (no padding). A product with a photo gets it (cropped to the cell); one without gets a framed cell with its name
in the middle. Slots with no product (room for future ones) stay transparent."""
import json, sys, textwrap
from PIL import Image, ImageDraw, ImageFont

m = json.load(open(sys.argv[1]))
cols, rows, cw, ch = m['cols'], m['rows'], m['cellW'], m['cellH']
FONTS = ['/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']
def font(size):
    for f in FONTS:
        try: return ImageFont.truetype(f, size)
        except OSError: pass
    return ImageFont.load_default(size)

atlas = Image.new('RGBA', (cols * cw, rows * ch), (0, 0, 0, 0))
d = ImageDraw.Draw(atlas)
for slot, p in enumerate(m['products']):
    x, y = (slot % cols) * cw, (slot // cols) * ch
    if p.get('photo'):
        im = Image.open(m['assets'] + '/' + p['photo']).convert('RGBA')
        s = max(cw / im.width, ch / im.height)           # cover
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        ox, oy = (im.width - cw) // 2, (im.height - ch) // 2
        atlas.paste(im.crop((ox, oy, ox + cw, oy + ch)), (x, y))
        continue
    d.rectangle([x, y, x + cw - 1, y + ch - 1], fill=(239, 236, 224, 255))           # paper
    d.rectangle([x + 1, y + 1, x + cw - 2, y + ch - 2], outline=(107, 102, 80, 255), width=2)  # the stroke
    name = p['name']; lines = None
    for size in range(26, 8, -1):                                                    # biggest font whose wrapped name fits, never splitting a word
        f = font(size)
        for width in range(len(name), 0, -1):                                        # fewest lines first
            cand = textwrap.wrap(name, width, break_long_words=False)
            if len(cand) > 4: break
            if all(d.textlength(l, font=f) <= cw - 14 for l in cand) and len(cand) * size * 1.15 <= ch - 14: lines = cand; break
        if lines: break
    lines = lines or [name]
    lh = size * 1.15; top = y + (ch - lh * len(lines)) / 2
    for i, l in enumerate(lines):
        w = d.textlength(l, font=f); d.text((x + (cw - w) / 2, top + i * lh), l, font=f, fill=(40, 38, 28, 255))
atlas.save(sys.argv[2], optimize=True)
print(f'atlas {atlas.width}x{atlas.height}: {len(m["products"])} products in {cols * rows} slots ({cols * rows - len(m["products"])} free)')
