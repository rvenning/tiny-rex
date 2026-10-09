"""Check full directional pose contracts and native alpha; make contact sheets."""
import json,sys
from pathlib import Path
from PIL import Image,ImageDraw

raw=Path(sys.argv[1]);base=Path(sys.argv[2]);data=json.loads((raw/'frames.json').read_text())
meta=data['meta'];species=meta['id']
expected={f'{species}/{p}/{k}/{f}' for p,d in meta['poses'].items() for k in range(8) for f in range(d['frames'])}
actual={f['key'] for f in data['frames']};empty=[];clipped=[];bounds={}
for frame in data['frames']:
    im=Image.open(raw/frame['file']).convert('RGBA')
    b=im.getchannel('A').point(lambda v:255 if v>6 else 0).getbbox()
    if b is None:empty.append(frame['key']);continue
    if b[0]<=0 or b[1]<=0 or b[2]>=im.width or b[3]>=im.height:clipped.append(frame['key'])
    bounds[frame['key']]=b
atlas=json.loads(base.with_suffix('.json').read_text())
packed={f['filename'] for page in atlas['textures'] for f in page['frames']}
decoded=sum(t['size']['w']*t['size']['h']*4 for t in atlas['textures'])
report=dict(id=species,frames=len(actual),expected=len(expected),missing=sorted(expected-actual),
            packedMissing=sorted(expected-packed),empty=empty,clipped=clipped,
            renderScale=meta.get('renderScale'),decodedMiB=decoded/2**20,
            exactFrameAliases=atlas['meta'].get('exactFrameAliases',0),pages=len(atlas['textures']))

def sheet(keys,name):
    images=[]
    for key in keys:
        p,k,f=key.split('/')[1:];path=raw/f'{p}_{k}_{f}.png'
        if path.exists():images.append((key,Image.open(path).convert('RGBA')))
    w=max(im.width for _,im in images)+16;h=max(im.height for _,im in images)+32;cols=4
    out=Image.new('RGB',(cols*w,((len(images)+cols-1)//cols)*h),(48,57,42));draw=ImageDraw.Draw(out)
    for i,(key,im) in enumerate(images):
        x=i%cols*w;y=i//cols*h
        out.paste(im,(x+8,y+24),im);draw.text((x+8,y+6),key.split('/',1)[1],fill=(225,226,210))
    out.save(raw/name)
sheet([f'{species}/idle/{k}/0' for k in range(8)],'direction-review.png')
sheet([f'{species}/{p}/3/{f}' for p in meta['poses'] for f in range(meta['poses'][p]['frames'])],'action-review.png')
(raw/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
if any(report[k] for k in ('missing','packedMissing','empty','clipped')):raise SystemExit(1)
