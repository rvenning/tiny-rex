"""Review native game-scale frames and verify complete animation atlas contracts."""
from PIL import Image, ImageDraw
import json, os, sys
root=sys.argv[1]
stage=int(sys.argv[2]) if len(sys.argv)>2 else 0
atlas=json.load(open(os.path.join(root,'public','art','creatures',f'rex_{stage}.json')))
renderScale=atlas['meta'].get('renderScale',1)
base=os.path.join(root,'art-build','creatures',f'rex_{stage}'+('_compact' if renderScale!=1 else ''))
manifest=json.load(open(os.path.join(base,'frames.json')))
assert len(manifest['frames'])==264, len(manifest['frames'])
for pose,info in manifest['meta']['poses'].items():
    expected={f'rex_{stage}/{pose}/{direction}/{frame}' for direction in range(8) for frame in range(info['frames'])}
    actual={f['key'] for f in manifest['frames'] if f['meta']['pose']==pose}
    assert actual==expected,(pose,expected-actual)
for f in manifest['frames']:
    im=Image.open(os.path.join(base,f['file']))
    box=im.getchannel('A').getbbox()
    assert box and box[0]>0 and box[1]>0 and box[2]<im.width and box[3]<im.height,(f['key'],box)
assert all(isinstance(page['frames'],list) for page in atlas['textures']), 'Phaser MultiAtlas requires frame arrays with filename'
packed={frame['filename']:frame for page in atlas['textures'] for frame in page['frames']}
assert sum(len(page['frames']) for page in atlas['textures'])==264
assert set(packed)=={f['key'] for f in manifest['frames']}
for page in atlas['textures']:
    image=Image.open(os.path.join(root,'public','art','creatures',page['image']))
    assert image.size==(page['size']['w'],page['size']['h'])
    for frame in page['frames']:
        dim=frame['frame']
        assert 0<=dim['x'] and 0<=dim['y'] and dim['x']+dim['w']<=image.width and dim['y']+dim['h']<=image.height
for f in manifest['frames']:
    image=Image.open(os.path.join(base,f['file'])).convert('RGBA')
    box=image.getchannel('A').point(lambda a:255 if a>6 else 0).getbbox()
    frame=packed[f['key']];dimensions=frame['frame']
    assert dimensions['w']==box[2]-box[0] and dimensions['h']==box[3]-box[1]
    assert abs(frame['pivot']['x']*dimensions['w']-(f['ax']-box[0]))<.01
    assert abs(frame['pivot']['y']*dimensions['h']-(f['ay']-box[1]))<.01
poses=[('idle',0),('run',0),('run',2),('run',5),('bite',2),('dodge',1),('hurt',0),('skill',3)]
first=Image.open(os.path.join(base,'idle_0_0.png'))
width,height=[round(size/renderScale) for size in first.size]
sheet=Image.new('RGB',(4*width,2*(height+28)),(37,48,39));draw=ImageDraw.Draw(sheet)
for i,(pose,frame) in enumerate(poses):
    im=Image.open(os.path.join(base,f'{pose}_0_{frame}.png')).convert('RGBA')
    if renderScale!=1:im=im.resize((width,height),Image.Resampling.BILINEAR)
    x,y=(i%4)*width,(i//4)*(height+28)
    sheet.paste(im,(x,y+24),im);draw.text((x+8,y+6),f'{pose} {frame}',fill=(237,225,188))
out=os.path.join(root,'tools','art','creatures',f'rex_{stage}_review.webp')
sheet.save(out,quality=95)
print(f'PASS:264 complete unclipped frames; packed keys, page bounds and ground anchors match. Review:{out}')
