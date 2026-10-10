"""Export the generated world for the game: public/world/world.json + world.bin.gz

world.bin.gz = gzip of 4 planes, each nx*ny bytes, row-major [iy][ix]:
    flags  bit0 walkable  bit1 water present  bit2 deep (not wadeable)  bit3 steep/cliff
    surf   dominant surface index (see SURF)
    zlo, zhi   height in centimetres, int16 little endian split into two byte planes
The ground tiles are rendered from the SAME terrain.npz, so heights, feet and collision cannot drift.
Run:  python tools/world/export.py [art-build/world] [public/world]
"""
import gzip
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from worldgen import SURF  # noqa


# (x0, y0, x1, y1) in world units. The Hollow creek ford route runs along the north bank to the shallows near x=51-60;
# in the connected river layout that crossing narrowed to a half-unit gap, stranding the ford and the fossil shelf.
CARVES = [(50.5, 26.2, 54.5, 28.2), (56.6, 27.0, 60.4, 29.2)]


def export(src, dst):
    d = np.load(os.path.join(src, "terrain.npz"))
    props = json.load(open(os.path.join(src, "props.json")))
    x0, y0, x1, y1, cell = [float(v) for v in d["bounds"]]
    z = d["z"]
    ny, nx = z.shape
    surf = d["surf"].astype(np.float32)
    opn = d["opn"]
    water = d["water"]
    xs = x0 + (np.arange(nx) + 0.5) * cell
    ys = y0 + (np.arange(ny) + 0.5) * cell
    X, Y = np.meshgrid(xs, ys)
    walk = opn > 0.35
    # solid prop circles (trunks, boulders, nests) block movement
    for sx, sy, sr in props["solids"]:
        m = (X - sx) ** 2 + (Y - sy) ** 2 < (sr * 0.9) ** 2
        walk &= ~m
    gy, gx = np.gradient(z, cell)
    slope = np.hypot(gx, gy)
    steep = slope > 1.25
    walk &= ~steep
    wet = ~np.isnan(water)
    depth = np.where(wet, water - z, 0.0)
    deep = wet & (depth > 0.55)
    walk &= ~deep
    # Guaranteed connections the generator's rivers can pinch to diagonal-only: wade-able gaps (never through deep water).
    for (cx0, cy0, cx1, cy1) in CARVES:
        m = (X >= cx0) & (X <= cx1) & (Y >= cy0) & (Y <= cy1) & ~deep
        walk |= m
    flags = (walk * 1 | wet * 2 | deep * 4 | steep * 8).astype(np.uint8)
    dom = np.argmax(surf, axis=0).astype(np.uint8)
    zc = np.clip(np.round(z * 100), -32000, 32000).astype(np.int16)
    zb = zc.view(np.uint8).reshape(ny, nx, 2)
    blob = np.concatenate([flags.ravel(), dom.ravel(), zb[..., 0].ravel(), zb[..., 1].ravel()]).tobytes()
    os.makedirs(dst, exist_ok=True)
    with gzip.open(os.path.join(dst, "world.bin.gz"), "wb", 9) as f:
        f.write(blob)
    sprites = [[p["n"], p["v"], p["x"], p["y"], p["z"], p["s"]] for p in props["props"] if not p["b"]]
    sprites.sort(key=lambda a: (a[2] + a[3]))
    meta = dict(
        version=1,
        bounds=[x0, y0, x1, y1],
        cell=cell,
        nx=nx,
        ny=ny,
        surf=SURF,
        pois=props["pois"],
        features=props.get("features", []),
        props=sprites,
        water=[[round(float(a), 2), round(float(b), 2)] for a, b in (props.get("creek") or [])],
    )
    canvas = os.path.join(src, "tiles", "canvas.json")
    if os.path.exists(canvas):
        meta["canvas"] = json.load(open(canvas))
    tj = os.path.join(src, "tiles", "tiles.json")
    if os.path.exists(tj):
        meta["tiles"] = json.load(open(tj))
    json.dump(meta, open(os.path.join(dst, "world.json"), "w"), separators=(",", ":"))
    print(f"world: {nx}x{ny} cells, {len(sprites)} sprite props, walkable {walk.mean()*100:.1f}%")
    return walk


if __name__ == "__main__":
    here = os.path.abspath(os.path.join(HERE, "..", ".."))
    export(sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "art-build", "world"), sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, "public", "world"))
