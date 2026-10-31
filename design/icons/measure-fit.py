#!/usr/bin/env python3
"""Measures each pot glyph and prints the fit {s,cx,cy} that centres it inside the
maskable-safe circle. Run from the repo root:  python3 design/icons/measure-fit.py
Requires: node, python3 with playwright + chromium + Pillow + numpy."""
import json, subprocess, io, sys
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

forms = json.loads(subprocess.check_output(['node','-e',"import('./src/lib/app-icon-data.js').then(m=>console.log(JSON.stringify(m.POT_FORMS)))"]))
TARGET = 188  # px radius from centre (safe circle is 205)
out = {}
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width':512,'height':512})
    for f in forms:
        paths = ''.join(f'<path fill="#fff" d="{s["d"]}"/>' for s in f['shapes'] if s['r']=='main')
        pg.set_content(f'<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">{paths}</svg></body></html>')
        im = Image.open(io.BytesIO(pg.screenshot(omit_background=True))).convert('RGBA')
        a = np.array(im)[:,:,3] > 20
        ys, xs = np.nonzero(a)
        cx, cy = (xs.min()+xs.max()+1)/2, (ys.min()+ys.max()+1)/2
        r = np.sqrt((xs-cx)**2 + (ys-cy)**2).max()
        s = 1.0 if f['id']=='classic' else round(min(1.12, TARGET/r), 3)
        if f['id']=='classic': cx, cy = 256, 256
        out[f['id']] = {'s': s, 'cx': round(float(cx),1), 'cy': round(float(cy),1), 'bbox': [int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())], 'maxr': round(float(r),1)}
    b.close()
print(json.dumps(out, indent=1))
