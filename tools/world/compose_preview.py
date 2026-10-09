"""Cheap composed preview: Blender ground render + prop sprites placed from the world data (no 3D re-render).

    python tools/world/compose_preview.py --ground .scratch/world/t1.png --center 32,32 --size 1448,1086 \
        --out .scratch/preview.png [--props art-build/props/frames.json art-build/props_rocks/frames.json]
Uses exactly the projection/anchor maths the game uses, so what you see is what the game will draw.
"""
import argparse
import json
import math
import os

from PIL import Image

PPU = 80.0
COS45 = math.cos(math.radians(45))
ELEV = math.radians(35.264)
SQ, VS = math.sin(ELEV), math.cos(ELEV)


def proj(gx, gy, gz=0.0):
    return ((gx - gy) * COS45 * PPU, (gx + gy) * COS45 * PPU * SQ - gz * PPU * VS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ground", required=True)
    ap.add_argument("--center", required=True)
    ap.add_argument("--size", default="1448,1086")
    ap.add_argument("--world", default="art-build/world")
    ap.add_argument("--props", nargs="*", default=["art-build/props/frames.json", "art-build/props_rocks/frames.json"])
    ap.add_argument("--out", required=True)
    ap.add_argument("--actors", default="", help="name:gx:gy:png:ax:ay,...")
    a = ap.parse_args()
    cx, cy = [float(v) for v in a.center.split(",")]
    W, H = [int(v) for v in a.size.split(",")]
    img = Image.open(a.ground).convert("RGBA")
    frames = {}
    for fp in a.props:
        if not os.path.exists(fp):
            continue
        root = os.path.dirname(fp)
        for f in json.load(open(fp))["frames"]:
            frames[f["key"]] = (os.path.join(root, f["file"]), f["ax"], f["ay"])
    nvar = {}
    for k in frames:
        n, v = k.split("/")
        nvar[n] = max(nvar.get(n, 0), int(v) + 1)
    props = json.load(open(os.path.join(a.world, "props.json")))["props"]
    ox, oy = proj(cx, cy, 0)
    cache = {}
    drawn = missing = 0
    items = [p for p in props if not p["b"]]
    items.sort(key=lambda p: p["x"] + p["y"])
    for p in items:
        sx, sy = proj(p["x"], p["y"], p["z"])
        sx, sy = sx - ox + W / 2, sy - oy + H / 2
        if sx < -300 or sx > W + 300 or sy < -300 or sy > H + 500:
            continue
        n = p["n"]
        if n not in nvar:
            missing += 1
            continue
        key = f"{n}/{p['v'] % nvar[n]}"
        path, ax, ay = frames[key]
        if key not in cache:
            cache[key] = Image.open(path).convert("RGBA")
        sp = cache[key]
        s = p.get("s", 1.0)
        if abs(s - 1) > 0.01:
            sp = sp.resize((max(1, int(sp.width * s)), max(1, int(sp.height * s))), Image.LANCZOS)
        img.alpha_composite(sp, (int(sx - ax * s), int(sy - ay * s))) if (0 <= sx - ax * s and sx - ax * s + sp.width <= img.width and 0 <= sy - ay * s and sy - ay * s + sp.height <= img.height) else _paste_clipped(img, sp, int(sx - ax * s), int(sy - ay * s))
        drawn += 1
    img.convert("RGB").save(a.out)
    print(f"{a.out}: drew {drawn} props, {missing} lack art yet")


def _paste_clipped(dst, src, x, y):
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(dst.width, x + src.width), min(dst.height, y + src.height)
    if x1 <= x0 or y1 <= y0:
        return
    dst.alpha_composite(src.crop((x0 - x, y0 - y, x1 - x, y1 - y)), (x0, y0))


main()
