"""Contact sheet of raw frames on a neutral game-green: python sheet.py frames.json out.png [cols] [filter]"""
import json, os, sys
from PIL import Image, ImageDraw
mp, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 6
flt = sys.argv[4] if len(sys.argv) > 4 else ""
root = os.path.dirname(mp)
fr = [f for f in json.load(open(mp))["frames"] if flt in f["key"]]
ims = [Image.open(os.path.join(root, f["file"])).convert("RGBA") for f in fr]
if not ims: raise SystemExit("no frames")
cw = max(i.size[0] for i in ims); ch = max(i.size[1] for i in ims)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGBA", (cols * cw, rows * ch), (96, 120, 64, 255))
d = ImageDraw.Draw(sheet)
for n, (f, im) in enumerate(zip(fr, ims)):
    x, y = (n % cols) * cw, (n // cols) * ch
    sheet.alpha_composite(im, (x, y))
    d.text((x + 4, y + 4), f["key"], fill=(255, 255, 255, 255))
sheet.convert("RGB").save(out)
print(out, sheet.size)
