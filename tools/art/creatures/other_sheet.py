"""Review contact sheet: python -I other_sheet.py frames.json out.png [cols] [zoom] [filter] [bg]
Frames composited on a warm dirt colour (like the mockup paths) with an anchor tick; zoom
upsamples (LANCZOS) for inspection. Use zoom 1 to judge in-game readability."""
import json
import os
import sys

from PIL import Image, ImageDraw

mp, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 8
zoom = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
flt = sys.argv[5] if len(sys.argv) > 5 else ""
bg = tuple(int(x) for x in sys.argv[6].split(",")) if len(sys.argv) > 6 else (176, 132, 82)
root = os.path.dirname(mp)
fr = [f for f in json.load(open(mp))["frames"] if flt in f["key"]]
ims = []
for f in fr:
    im = Image.open(os.path.join(root, f["file"])).convert("RGBA")
    if zoom != 1:
        im = im.resize((round(im.size[0] * zoom), round(im.size[1] * zoom)), Image.LANCZOS)
    ims.append(im)
cw = max(i.size[0] for i in ims)
ch = max(i.size[1] for i in ims) + 12
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGBA", (cols * cw, rows * ch), (*bg, 255))
d = ImageDraw.Draw(sheet)
for n, (f, im) in enumerate(zip(fr, ims)):
    x, y = (n % cols) * cw, (n // cols) * ch
    # soft ground shadow ellipse under the anchor (game draws its own; this is for reading)
    ax, ay = f["ax"] * (zoom if "scaled" not in f else 1), f["ay"] * (zoom if "scaled" not in f else 1)
    sheet.alpha_composite(im, (x, y + 12))
    d.line([(x + ax - 3, y + 12 + ay), (x + ax + 3, y + 12 + ay)], fill=(255, 255, 255, 120))
    d.text((x + 2, y), f["key"].split("/", 1)[1], fill=(255, 255, 255, 255))
sheet.convert("RGB").save(out)
print(out, sheet.size)
