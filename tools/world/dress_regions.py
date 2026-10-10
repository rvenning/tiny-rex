"""Art-only dressing for Riverbend and Reed Marsh: reed lanes, cattail stands, horsetails, lily pads and fern thickets.

Edits <world>/world.json props (idempotent via meta['dressedRegions']). Collision is untouched: everything goes on blocked,
non-deep ground within a few units of the walkable lanes (so it frames trails instead of covering them), plus lily pads on
shallows. Run:  python tools/world/dress_regions.py public/world
"""
import gzip
import json
import math
import sys
from pathlib import Path

import numpy as np

root = Path(sys.argv[1] if len(sys.argv) > 1 else "public/world")
meta = json.loads((root / "world.json").read_text())
if meta.get("dressedRegions") == 1:
    print("already dressed")
    raise SystemExit
raw = np.frombuffer(gzip.open(root / "world.bin.gz").read(), np.uint8)
nx, ny, cell = meta["nx"], meta["ny"], meta["cell"]
x0, y0 = meta["bounds"][0], meta["bounds"][1]
n = nx * ny
flags = raw[:n].reshape(ny, nx)
z = (raw[2 * n : 3 * n].astype(np.int32) | (raw[3 * n : 4 * n].astype(np.int32) << 8)).astype(np.int16).reshape(ny, nx) / 100.0
walk = (flags & 1) > 0
deep = (flags & 4) > 0
steep = (flags & 8) > 0
# distance (units) to the nearest walkable cell: two chamfer sweeps
D = np.where(walk, 0.0, 1e4).astype(np.float32)
for _ in range(2):
    for iy in range(1, ny):
        D[iy] = np.minimum(D[iy], D[iy - 1] + cell)
    for iy in range(ny - 2, -1, -1):
        D[iy] = np.minimum(D[iy], D[iy + 1] + cell)
    for ix in range(1, nx):
        D[:, ix] = np.minimum(D[:, ix], D[:, ix - 1] + cell)
    for ix in range(nx - 2, -1, -1):
        D[:, ix] = np.minimum(D[:, ix], D[:, ix + 1] + cell)


def cellof(x, y):
    return min(ny - 1, max(0, int((y - y0) / cell))), min(nx - 1, max(0, int((x - x0) / cell)))


def zat(x, y):
    return float(z[cellof(x, y)])


rng = np.random.default_rng(777)
props = meta["props"]
taken = [(p[2], p[3]) for p in props]


def free(x, y, r):
    return all((x - a) ** 2 + (y - b) ** 2 > r * r for a, b in taken[-3000:])


def add(name, x, y, s):
    nv = {"reed_clump": 3, "cattail_clump": 3, "horsetail": 3, "lily_pad": 3, "fern_medium": 4, "fern_large": 4, "cycad": 3, "boulder_s": 4, "flower_red_spike": 3, "broadleaf": 3, "flat_stone": 4}[name]
    props.append([name, int(rng.integers(0, nv)), round(float(x), 3), round(float(y), 3), round(zat(x, y), 3), round(float(s), 3)])
    taken.append((x, y))


REGIONS = {"river": (66, -2, 130, 66), "marsh": (66, 66, 130, 130)}
PLAN = {
    # name: (clusters, members range, list of (prop, weight))
    "marsh": (230, (3, 7), [("reed_clump", 4), ("cattail_clump", 3), ("horsetail", 2), ("fern_medium", 2), ("cycad", 0.5)]),
    "river": (130, (3, 6), [("reed_clump", 3), ("fern_large", 2), ("fern_medium", 3), ("flower_red_spike", 2), ("broadleaf", 1), ("horsetail", 1)]),
}
added = 0
for rid, (rx0, ry0, rx1, ry1) in REGIONS.items():
    count, (lo, hi), mix = PLAN[rid]
    names = [m[0] for m in mix]
    wts = np.array([m[1] for m in mix], float)
    wts /= wts.sum()
    placed = tries = 0
    while placed < count and tries < count * 80:
        tries += 1
        cx, cy = rng.uniform(rx0, rx1), rng.uniform(ry0, ry1)
        iy, ix = cellof(cx, cy)
        if walk[iy, ix] or deep[iy, ix] or steep[iy, ix] or D[iy, ix] > 7.5 or D[iy, ix] < 0.9:
            continue
        for _ in range(int(rng.integers(lo, hi + 1))):
            x, y = cx + rng.normal(0, 1.1), cy + rng.normal(0, 1.1)
            iy, ix = cellof(x, y)
            if walk[iy, ix] or deep[iy, ix] or steep[iy, ix] or not free(x, y, 0.55):
                continue
            add(str(rng.choice(names, p=wts)), x, y, rng.uniform(0.8, 1.15))
            added += 1
        placed += 1
    # lily pads on the shallows
    wet = np.argwhere(((flags & 2) > 0) & ~deep)
    wet = [(y0 + (a + 0.5) * cell, x0 + (b + 0.5) * cell) for a, b in wet]
    wet = [(wx, wy) for wy, wx in wet if rx0 <= wx < rx1 and ry0 <= wy < ry1]
    rng.shuffle(wet)
    lilies = 0
    for wx, wy in wet:
        if lilies >= (70 if rid == "marsh" else 30):
            break
        if free(wx, wy, 1.6):
            add("lily_pad", wx, wy, rng.uniform(0.8, 1.1))
            lilies += 1
            added += 1
props.sort(key=lambda p: p[2] + p[3])
meta["dressedRegions"] = 1
(root / "world.json").write_text(json.dumps(meta, separators=(",", ":")))
print("added", added, "props now", len(props))
