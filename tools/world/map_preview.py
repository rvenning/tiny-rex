"""Top-down map of the connected world for authoring quests, landmarks and encounters.

  python tools/world/map_preview.py <out.png> [x0 y0 x1 y1] [--scale 8] [--grid 10]

Colours: green land, tan dirt/sand, grey rock, blue shallow, dark blue deep, black blocked (forest/cliff). Props are dots,
named positions (nests, discoveries, gates, spawns) are labelled. Run with the embedded ComfyUI python (has PIL + numpy):
  D:/dev/ComfyUI_windows_portable/python_embeded/python.exe -c "import sys,runpy; sys.argv=['map_preview.py','out.png','0','0','70','70']; runpy.run_path('tools/world/map_preview.py', run_name='__main__')"
"""
import gzip
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

args = [a for a in sys.argv[1:] if not a.startswith("--")]
opts = {sys.argv[i]: sys.argv[i + 1] for i in range(1, len(sys.argv) - 1) if sys.argv[i].startswith("--")}
out = args[0] if args else ".scratch/map.png"
root = Path("public/world")
meta = json.loads((root / "world.json").read_text())
raw = np.frombuffer(gzip.open(root / "world.bin.gz").read(), np.uint8)
nx, ny, cell = meta["nx"], meta["ny"], meta["cell"]
bx0, by0 = meta["bounds"][0], meta["bounds"][1]
n = nx * ny
flags = raw[:n].reshape(ny, nx)
surf = raw[n : 2 * n].reshape(ny, nx)
zlo = (raw[2 * n : 3 * n].astype(np.int32) | (raw[3 * n : 4 * n].astype(np.int32) << 8)).astype(np.int16).reshape(ny, nx) / 100.0
x0, y0, x1, y1 = (float(v) for v in args[1:5]) if len(args) >= 5 else (bx0, by0, meta["bounds"][2], meta["bounds"][3])
scale = int(opts.get("--scale", 6))
grid = float(opts.get("--grid", 10))
W, H = int((x1 - x0) * scale), int((y1 - y0) * scale)
img = Image.new("RGB", (W, H), (10, 20, 14))
px = img.load()
walk, water, deep, steep = (flags & 1) > 0, (flags & 2) > 0, (flags & 4) > 0, (flags & 8) > 0
names = meta["surf"]
palette = {"grass": (92, 140, 70), "dirt": (186, 140, 90), "moss": (60, 100, 54), "rock": (140, 136, 128), "mud": (112, 86, 58), "gravel": (168, 160, 140), "sand": (214, 190, 130), "basalt": (80, 74, 84), "lava": (255, 122, 42), "ash": (120, 116, 112)}
for iy in range(H):
    gy = y0 + (iy + 0.5) / scale
    cy = int((gy - by0) / cell)
    if not 0 <= cy < ny:
        continue
    for ix in range(W):
        gx = x0 + (ix + 0.5) / scale
        cx = int((gx - bx0) / cell)
        if not 0 <= cx < nx:
            continue
        if water[cy, cx]:
            c = (28, 90, 130) if deep[cy, cx] else (88, 190, 196)
        elif walk[cy, cx]:
            s = names[surf[cy, cx]] if surf[cy, cx] < len(names) else "grass"
            c = palette.get(s, (92, 140, 70))
            if steep[cy, cx]:
                c = tuple(int(v * 0.6) for v in c)
        else:
            c = (22, 44, 30)
        px[ix, iy] = c
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype("arial.ttf", 11)
    big = ImageFont.truetype("arial.ttf", 14)
except Exception:
    font = big = ImageFont.load_default()
# props (sorted for a stable look)
for p in meta["props"]:
    name, _, x, y = p[0], p[1], p[2], p[3]
    if not (x0 <= x < x1 and y0 <= y < y1):
        continue
    sx, sy = (x - x0) * scale, (y - y0) * scale
    big_prop = name.startswith(("boulder_l", "log_arch", "cliff", "rock_outcrop", "palm_tall", "root_arch", "waterfall", "stump", "nest_big", "fossil", "river_bank"))
    r = 3 if big_prop else 1
    d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(255, 255, 255) if big_prop else (20, 60, 24))
# grid
g = grid
gx = int(x0 // g * g)
while gx <= x1:
    sx = (gx - x0) * scale
    d.line([sx, 0, sx, H], fill=(255, 255, 255, 40), width=1)
    d.text((sx + 2, 2), str(gx), fill=(255, 240, 160), font=font)
    gx += g
gy = int(y0 // g * g)
while gy <= y1:
    sy = (gy - y0) * scale
    d.line([0, sy, W, sy], fill=(255, 255, 255, 40), width=1)
    d.text((2, sy + 2), str(gy), fill=(255, 240, 160), font=font)
    gy += g
# markers from the generated content and the pois
marks = []
for k, v in meta.get("pois", {}).items():
    if isinstance(v, list):
        marks.append((k, v[0], v[1], (255, 220, 120)))
    elif isinstance(v, dict) and "x" in v:
        marks.append((k, v["x"], v["y"], (255, 150, 90) if v.get("kind") == "nest" else (150, 230, 255)))
for f in meta.get("features", []):
    if "x" in f:
        marks.append((f.get("id") or f.get("kind") or "?", f["x"], f["y"], (255, 90, 200)))
extra = json.loads(Path(opts["--marks"]).read_text()) if "--marks" in opts else []
for m in extra:
    marks.append((m["id"], m["x"], m["y"], tuple(m.get("color", (255, 255, 255)))))
for name, x, y, col in marks:
    if not (x0 <= x < x1 and y0 <= y < y1):
        continue
    sx, sy = (x - x0) * scale, (y - y0) * scale
    d.ellipse([sx - 4, sy - 4, sx + 4, sy + 4], outline=col, width=2)
    d.text((sx + 6, sy - 6), name, fill=col, font=font)
Path(out).parent.mkdir(parents=True, exist_ok=True)
img.save(out)
print("wrote", out, img.size)
