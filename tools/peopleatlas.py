#!/usr/bin/env python3
"""Packs assets/person/NN.png into one atlas (client/public/assets/atlas/people.png): 12 x 8 cells of 60x60, portrait N in slot N, free slots transparent.
usage: peopleatlas.py <assets dir> <out.png> <cols> <rows> <cell>"""
import sys, glob, os
from PIL import Image
assets, out, cols, rows, cell = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
atlas = Image.new('RGBA', (cols * cell, rows * cell), (0, 0, 0, 0)); n = 0
for f in sorted(glob.glob(os.path.join(assets, 'person', '[0-9][0-9]*.png'))):
    k = int(os.path.basename(f).split('.')[0]); im = Image.open(f).convert('RGBA')
    if k >= cols * rows: raise SystemExit(f'portrait {k} does not fit: make the atlas bigger')
    if im.size != (cell, cell): im = im.resize((cell, cell), Image.NEAREST)
    atlas.paste(im, ((k % cols) * cell, (k // cols) * cell)); n += 1
atlas.save(out, optimize=True); print(f'people atlas {atlas.width}x{atlas.height}: {n} portraits in {cols * rows} slots ({cols * rows - n} free)')
