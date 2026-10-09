"""Compact asset review with alpha bounds and coverage diagnostics."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw

paths=[Path(p) for p in sys.argv[1:]]
frames=[]
for path in paths:
    if not path.exists(): continue
    frames.extend((path.parent,f) for f in json.loads(path.read_text())["frames"])
first=[(p,f) for p,f in frames if f["key"].endswith("/0")]
w,h,cols=250,250,5
sheet=Image.new("RGB",(w*cols,h*((len(first)+cols-1)//cols)),(65,81,54))
d=ImageDraw.Draw(sheet)
for i,(p,f) in enumerate(first):
    im=Image.open(p/f["file"]).convert("RGBA")
    box=im.getchannel("A").point(lambda x:255 if x>6 else 0).getbbox()
    if box:
        if box[0]==0 or box[1]==0 or box[2]==im.width or box[3]==im.height: print("CLIPPED?",f["key"],box,im.size)
        im=im.crop(box);im.thumbnail((w-12,h-35))
        x,y=i%cols*w,i//cols*h
        sheet.paste(im,(x+(w-im.width)//2,y+25+(h-30-im.height)//2),im)
        d.text((x+8,y+8),f["key"],fill=(246,236,206))
out=Path("art-build/props-review.png")
sheet.save(out)
print(out,len(frames),"frames",len(first),"unique assets")
