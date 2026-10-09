"""Publish a subset of re-rendered ground tiles into public/world/ground with the 1px seam gutter.

    python tools/art/publish_tiles.py .scratch/ground_native public/world [quality]

Tiles found as t_<tx>_<ty>.png in the native directory replace the shipped WebP. Gutters copy the adjacent row/column
of the neighbouring tile's core (native PNG when re-rendered, otherwise the shipped WebP's core), matching
tools/art/publish_ground.py so there are no seams between old and new tiles beyond their different content.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

native, world = Path(sys.argv[1]), Path(sys.argv[2])
quality = int(sys.argv[3]) if len(sys.argv) > 3 else 88
meta = json.loads((world / "world.json").read_text())
have = {(t["tx"], t["ty"]) for t in meta["tiles"]}
fresh = {}
for p in native.glob("t_*_*.png"):
    m = re.match(r"t_(\d+)_(\d+)\.png", p.name)
    if m and (int(m[1]), int(m[2])) in have:
        fresh[(int(m[1]), int(m[2]))] = p
cache = {}


def core(tx, ty):
    key = (tx, ty)
    if key in cache:
        return cache[key]
    img = None
    if key in fresh:
        img = Image.open(fresh[key]).convert("RGB")
    elif key in have:
        s = Image.open(world / "ground" / f"t_{tx}_{ty}.webp").convert("RGB")
        img = s.crop((1, 1, s.width - 1, s.height - 1))
    if len(cache) > 40:
        cache.clear()
    cache[key] = img
    return img


n = 0
for (tx, ty), src in sorted(fresh.items()):
    c = core(tx, ty)
    w, h = c.size
    out = Image.new("RGB", (w + 2, h + 2))
    out.paste(c, (1, 1))
    for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]:
        nb = core(tx + dx, ty + dy) or c
        nw, nh = nb.size
        sx = nw - 1 if dx < 0 else 0
        sy = nh - 1 if dy < 0 else 0
        if (tx + dx, ty + dy) not in have:
            sx = 0 if dx < 0 else nw - 1 if dx > 0 else 0
            sy = 0 if dy < 0 else nh - 1 if dy > 0 else 0
        sw, sh = (1 if dx else w), (1 if dy else h)
        x, y = (0 if dx < 0 else w + 1 if dx > 0 else 1), (0 if dy < 0 else h + 1 if dy > 0 else 1)
        out.paste(nb.crop((sx, sy, sx + sw, sy + sh)), (x, y))
    out.save(world / "ground" / f"t_{tx}_{ty}.webp", "WEBP", quality=quality, method=5)
    n += 1
print(f"published {n} tiles")
