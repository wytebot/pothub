#!/usr/bin/env python3
"""Renders every pot-form x colour combination to static PNGs + web manifests in
public/icons/themes/. Run from the repo root after changing src/lib/app-icon-data.js:
    python3 design/icons/render-icons.py          # everything
    python3 design/icons/render-icons.py --sheet  # only write design/icons/contact-sheet.png
Requires: node, python3 with playwright + chromium + Pillow."""
import json, subprocess, io, sys, os
from PIL import Image
from playwright.sync_api import sync_playwright

root = os.getcwd()
data = json.loads(subprocess.check_output(['node','-e',
 "import('./src/lib/app-icon-data.js').then(m=>{const o=[];for(const f of m.POT_FORMS)for(const c of m.ICON_COLORS)o.push({id:m.iconId({form:f.id,color:c.id}),form:f.id,color:c.id,svg:m.iconSvgString({form:f.id,color:c.id}),def:m.isDefaultIcon({form:f.id,color:c.id}),name:f.name+' / '+c.name});console.log(JSON.stringify(o))})"]))
out = os.path.join(root,'public','icons','themes'); os.makedirs(out, exist_ok=True)
sheet_only = '--sheet' in sys.argv

def manifest(i):
    return {
      "id": "/", "name": "Pothub", "short_name": "Pothub", "description": "Diagnose code. Build ideas.",
      "start_url": "/", "scope": "/", "display": "standalone", "orientation": "any",
      "background_color": "#0d1117", "theme_color": "#0d1117", "categories": ["developer","productivity","utilities"],
      "icons": [
        {"src": f"/icons/themes/{i}-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
        {"src": f"/icons/themes/{i}-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
      ]}

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width':512,'height':512})
    sheet = []
    for it in data:
        pg.set_content(f'<html><body style="margin:0">{it["svg"]}</body></html>')
        png = pg.screenshot(clip={'x':0,'y':0,'width':512,'height':512})
        im = Image.open(io.BytesIO(png)).convert('RGB')
        sheet.append((it, im))
        if sheet_only or it['def']: continue
        im.save(os.path.join(out, f'{it["id"]}-512.png'), optimize=True)
        im.resize((192,192), Image.LANCZOS).save(os.path.join(out, f'{it["id"]}-192.png'), optimize=True)
        with open(os.path.join(out, f'{it["id"]}.webmanifest'),'w') as f: json.dump(manifest(it['id']), f, indent=2); f.write('\n')
    b.close()

forms = sorted({s[0]['form'] for s in sheet}, key=[s[0]['form'] for s in sheet].index)
colors = sorted({s[0]['color'] for s in sheet}, key=[s[0]['color'] for s in sheet].index)
T=128; sh = Image.new('RGB',(T*len(colors), T*len(forms)),(22,27,34))
for it, im in sheet:
    x = colors.index(it['color'])*T; y = forms.index(it['form'])*T
    sh.paste(im.resize((T-8,T-8), Image.LANCZOS),(x+4,y+4))
sh.save(os.path.join(root,'design','icons','contact-sheet.png'))
print('rendered', len(sheet), 'icons;', 'sheet only' if sheet_only else f'files in {out}')
