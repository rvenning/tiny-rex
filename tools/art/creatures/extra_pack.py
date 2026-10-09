"""Pack authored creature frames, aliasing only exact pixel-identical images.

python extra_pack.py art-build/creatures/dilophosaurus public/art/creatures/dilophosaurus
Every pose/direction key remains in the Phaser multiatlas array. Rendered PNGs
are retained; aliases share the same rectangle, pivot and source dimensions.
"""
import hashlib,importlib.util,json,sys
from pathlib import Path
from PIL import Image

root=Path(sys.argv[1]);out=Path(sys.argv[2]);data=json.loads((root/'frames.json').read_text())
unique=[];hashes={};aliases={}
for f in data['frames']:
    im=Image.open(root/f['file']).convert('RGBA')
    digest=hashlib.sha256(str(im.size).encode()+im.tobytes()+str((f['ax'],f['ay'])).encode()).hexdigest()
    if digest in hashes:aliases[f['key']]=hashes[digest]
    else:hashes[digest]=f['key'];unique.append(f)
manifest=root/'unique-frames.json';manifest.write_text(json.dumps(dict(data,frames=unique)))
packfile=Path(__file__).resolve().parents[1]/'pack.py'
spec=importlib.util.spec_from_file_location('creature_pack',packfile);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
mod.pack(str(manifest),str(out))
atlas=json.loads(out.with_suffix('.json').read_text())
lookup={f['filename']:(t,f) for t in atlas['textures'] for f in t['frames']}
for name,original in aliases.items():
    page,frame=lookup[original]
    page['frames'].append(dict(frame,filename=name))
atlas['meta']['exactFrameAliases']=len(aliases)
out.with_suffix('.json').write_text(json.dumps(atlas,separators=(',',':')))
print('Pose keys',len(data['frames']),'unique images',len(unique),'exact aliases',len(aliases))
