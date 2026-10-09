"""Pack canonical portrait renders; Trike uses a calibrated native head crop."""
from PIL import Image
import os,sys,json,math
root=os.path.abspath(sys.argv[1]);source=os.path.join(root,'.scratch','portraits');dest=os.path.join(root,'public','art','portraits')
os.makedirs(dest,exist_ok=True)
for id in ['rex_0','rex_1','rex_2','rex_3','raptor','trike']:
    image=Image.open(os.path.join(source,id+'.png')).convert('RGBA')
    assert image.size==(240,240)
    image.save(os.path.join(dest,id+'.webp'),quality=95,method=6)
print('Six transparent240px head portraits saved to '+dest)
