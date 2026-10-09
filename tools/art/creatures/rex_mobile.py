"""Compact Hunter/Apex Rex atlases. Logical frame keys remain rex_<stage>.

Runtime divides ActorView sprite scale by meta.renderScale. World lengths,
radii, pose durations and ground anchors remain unchanged. Native atlases are
preserved in art-build/creatures/native-packed rather than the public payload.
"""
import os,sys,json,shutil,glob
from PIL import Image,ImageOps
sys.path.insert(0,os.path.dirname(os.path.dirname(__file__)))
from pack import pack
root=os.path.abspath(sys.argv[1])
native=os.path.join(root,'art-build','creatures','native-packed');os.makedirs(native,exist_ok=True)
for stage,scale in [(2,.6),(3,.5)]:
    public=os.path.join(root,'public','art','creatures')
    prior=json.load(open(os.path.join(public,f'rex_{stage}.json')))
    # Preserve original authored-resolution packed assets once.
    if 'renderScale' not in prior['meta']:
        shutil.copy2(os.path.join(public,f'rex_{stage}.json'),native)
        for page in prior['textures']:shutil.copy2(os.path.join(public,page['image']),native)
    source=os.path.join(root,'art-build','creatures',f'rex_{stage}')
    destination=os.path.join(root,'art-build','creatures',f'rex_{stage}_compact')
    os.makedirs(destination,exist_ok=True)
    manifest=json.load(open(os.path.join(source,'frames.json')))
    manifest['meta']['renderScale']=scale
    for f in manifest['frames']:
        image=Image.open(os.path.join(source,f['file'])).convert('RGBA')
        small=image.resize((round(image.width*scale),round(image.height*scale)),Image.Resampling.LANCZOS)
        ImageOps.expand(small,border=4,fill=(0,0,0,0)).save(os.path.join(destination,f['file']))
        f['ax']=f['ax']*scale+4;f['ay']=f['ay']*scale+4
    path=os.path.join(destination,'frames.json');json.dump(manifest,open(path,'w'))
    pack(path,os.path.join(public,f'rex_{stage}'),95)
    packed=json.load(open(os.path.join(public,f'rex_{stage}.json')))
    keep={page['image'] for page in packed['textures']}
    for page in glob.glob(os.path.join(public,f'rex_{stage}-*.webp')):
        if os.path.basename(page) not in keep:os.remove(page)
# Obsolete optional mobile variants are deliberately excluded from publication.
for path in glob.glob(os.path.join(root,'public','art','creatures','rex_*_mobile*')):
    if os.path.isfile(path):os.remove(path)
