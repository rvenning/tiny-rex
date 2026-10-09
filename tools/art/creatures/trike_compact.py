"""Retain native Trike frames and derive the compact default atlas source."""
import json
from pathlib import Path
from PIL import Image, ImageOps

src=Path('art-build/creatures/trike')
dest=Path('art-build/creatures/trike-compact')
dest.mkdir(parents=True,exist_ok=True)
data=json.loads((src/'frames.json').read_text())
scale=.75
for f in data['frames']:
    # Eight transparent source pixels become six compact pixels. This leaves
    # enough room for the Lanczos kernel before atlas alpha trimming.
    im=ImageOps.expand(Image.open(src/f['file']).convert('RGBA'),border=8,fill=(0,0,0,0))
    im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
    im.save(dest/f['file'])
    f['ax']=round((f['ax']+8)*scale)
    f['ay']=round((f['ay']+8)*scale)
data['meta']['renderScale']=scale
(dest/'frames.json').write_text(json.dumps(data,indent=1))
print('Compact Trike frames',len(data['frames']))
