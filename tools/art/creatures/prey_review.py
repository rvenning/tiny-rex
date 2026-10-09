"""Native-scale pose review and complete frame/atlas/ground-anchor checks."""
from PIL import Image,ImageDraw
import os,sys,json
root,id=sys.argv[1:3];base=os.path.join(root,'art-build','creatures',id)
data=json.load(open(os.path.join(base,'frames.json')))
atlas=json.load(open(os.path.join(root,'public','art','creatures',id+'.json')))
expected={f'{id}/{pose}/{direction}/{frame}' for pose,info in data['meta']['poses'].items() for direction in range(8) for frame in range(info['frames'])}
frames={f['key']:f for f in data['frames']}
assert all(isinstance(page['frames'],list) for page in atlas['textures']), 'Phaser MultiAtlas requires frame arrays with filename'
packed={frame['filename']:frame for page in atlas['textures'] for frame in page['frames']}
assert sum(len(page['frames']) for page in atlas['textures'])==len(expected)
assert set(frames)==expected and set(packed)==expected
for page in atlas['textures']:
    image=Image.open(os.path.join(root,'public','art','creatures',page['image']))
    assert image.size==(page['size']['w'],page['size']['h'])
    for frame in page['frames']:
        dim=frame['frame']
        assert 0<=dim['x'] and 0<=dim['y'] and dim['x']+dim['w']<=image.width and dim['y']+dim['h']<=image.height
for key,f in frames.items():
    image=Image.open(os.path.join(base,f['file'])).convert('RGBA')
    box=image.getchannel('A').point(lambda a:255 if a>6 else 0).getbbox()
    assert box and box[0]>0 and box[1]>0 and box[2]<image.width and box[3]<image.height,(key,box)
    frame=packed[key];dim=frame['frame'];pivot=frame['pivot']
    assert dim['w']==box[2]-box[0] and dim['h']==box[3]-box[1]
    assert abs(pivot['x']*dim['w']-(f['ax']-box[0]))<.01
    assert abs(pivot['y']*dim['h']-(f['ay']-box[1]))<.01
images=[]
for pose,info in data['meta']['poses'].items():
    f=frames[f'{id}/{pose}/0/{info["frames"]//2}'];images.append((pose,Image.open(os.path.join(base,f['file'])).convert('RGBA')))
w,h=images[0][1].size
sheet=Image.new('RGB',(len(images)*w,h+24),(36,47,39));draw=ImageDraw.Draw(sheet)
for i,(pose,image) in enumerate(images):sheet.paste(image,(i*w,24),image);draw.text((i*w+5,5),pose,fill=(231,224,196))
sheet.save(os.path.join(root,'tools','art','creatures',id+'_review.webp'),quality=95)
print(id,len(frames),'verified frames;',atlas['meta']['decodedBytes']/2**20,'MiB decoded')
