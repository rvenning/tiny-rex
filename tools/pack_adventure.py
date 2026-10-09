"""Pack Blender frames without changing their calibrated camera/foot origin."""
from PIL import Image
import os,sys,json
source,dest=sys.argv[1:3]
os.makedirs(dest,exist_ok=True)
manifest={}
for model in ['rex-0','rex-1','rex-2','rex-3','raptor-2','trike-2']:
    atlas=Image.new('RGBA',(1152,1152))
    for pose in range(8):
        for direction in range(8):
            image=Image.open(os.path.join(source,model,f'{direction}-{pose}.png')).convert('RGBA')
            assert image.size==(192,192)
            atlas.paste(image.resize((144,144),Image.Resampling.LANCZOS),(direction*144,pose*144))
    path=os.path.join(dest,model+'.webp');atlas.save(path,quality=92,method=6)
    manifest[model]={'bytes':os.path.getsize(path),'decodedBytes':1152*1152*4,'frames':64,'frameSize':144}
for name in ['rock','fern','palm','log','nest','basalt','bone','flower']:
    Image.open(os.path.join(source,'prop-'+name+'.png')).save(os.path.join(dest,'prop-'+name+'.webp'),quality=92,method=6)
with open(os.path.join(dest,'manifest.json'),'w') as f:json.dump(manifest,f,indent=2)
print(json.dumps(manifest,indent=2))
