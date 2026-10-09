"""Art-only dressing for the Fern Hollow opening: start nest, framing rocks/logs, denser fringe.

Edits public/world/world.json props in place (idempotent via meta['dressed']); collision data is untouched, so
only things that sit outside the combat lane (or are soft) are added. Heights come from world.bin.gz.
Run:  python tools/world/dress_hollow.py [public/world]
"""
import gzip
import json
import math
import sys
from pathlib import Path

import numpy as np

root = Path(sys.argv[1] if len(sys.argv) > 1 else "public/world")
meta = json.loads((root / "world.json").read_text())
if meta.get("dressed") == 2:
    print("already dressed")
    raise SystemExit
raw = np.frombuffer(gzip.open(root / "world.bin.gz").read(), np.uint8)
nx, ny, cell = meta["nx"], meta["ny"], meta["cell"]
x0, y0 = meta["bounds"][0], meta["bounds"][1]
n = nx * ny
flags = raw[:n].reshape(ny, nx)
z = (raw[2 * n : 3 * n].astype(np.int32) | (raw[3 * n : 4 * n].astype(np.int32) << 8)).astype(np.int16).reshape(ny, nx) / 100.0


def zat(x, y):
    ix, iy = int((x - x0) / cell), int((y - y0) / cell)
    return float(z[min(ny - 1, max(0, iy)), min(nx - 1, max(0, ix))])


def wet(x, y):
    ix, iy = int((x - x0) / cell), int((y - y0) / cell)
    return bool(flags[iy, ix] & 2)


props = meta["props"]
# drop earlier art-only polish ferns that crowd the lane edge less than the new composition wants? keep them.
rng = np.random.default_rng(2024)
CLEAR = (31.0, 35.0)
LANE = [(23, 37), (27, 35), (31, 36), (35, 35), (39, 34), (44, 34)]


def lane_d(x, y):
    best = 1e9
    for a, b in zip(LANE, LANE[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        u = max(0, min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(x - a[0] - u * dx, y - a[1] - u * dy))
    return best


def add(name, v, x, y, s=1.0):
    props.append([name, int(v), round(float(x), 3), round(float(y), 3), round(zat(x, y), 3), round(float(s), 3)])


# 1. the refuge the player hatched in: a real nest, just beside the start point
add("nest_big", 1, 25.2, 36.9, 0.62)
add("egg_single", 0, 25.9, 36.4, 0.9)
add("egg_single", 2, 24.6, 37.3, 0.8)

# 2. rocks and stones ringing the clearing at varied sizes (clustered, not evenly spaced)
for _ in range(7):
    a = rng.uniform(0, 2 * math.pi)
    r = rng.uniform(8.5, 11.5)
    cx, cy = CLEAR[0] + math.cos(a) * r, CLEAR[1] + math.sin(a) * r * 0.9
    if wet(cx, cy) or lane_d(cx, cy) < 3.2:
        continue
    add("boulder_m" if rng.random() < 0.4 else "boulder_s", rng.integers(0, 3), cx, cy, rng.uniform(0.8, 1.15))
    for _k in range(rng.integers(2, 5)):
        px, py = cx + rng.normal(0, 0.9), cy + rng.normal(0, 0.9)
        if lane_d(px, py) > 2.6 and not wet(px, py):
            add("boulder_s", rng.integers(0, 4), px, py, rng.uniform(0.35, 0.6))

# 3. a denser, layered fringe: big ferns and broadleaf plants behind, flowers and small ferns in front
placed = [(p[2], p[3]) for p in props if p[0] in ("fern_large", "broadleaf", "cycad", "palm_small", "tree_fern", "palm_tall")]
for ring, (name, count, smin, smax) in enumerate([("broadleaf", 14, 0.7, 1.0), ("fern_large", 26, 0.7, 1.0), ("flower_red_spike", 14, 0.8, 1.0), ("fern_medium", 30, 0.6, 0.9), ("cycad", 6, 0.8, 1.0)]):
    got = tries = 0
    while got < count and tries < 4000:
        tries += 1
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(8.0, 12.5)
        x, y = CLEAR[0] + math.cos(a) * r, CLEAR[1] + math.sin(a) * r * 0.85
        if wet(x, y) or lane_d(x, y) < 3.0 or any(math.hypot(x - px, y - py) < 0.9 for px, py in placed):
            continue
        # keep the player-lane to the east trail and creek approach readable
        if x > 36 and 31 < y < 38.5:
            continue
        add(name, rng.integers(0, 3), x, y, rng.uniform(smin, smax))
        placed.append((x, y))
        got += 1

props.sort(key=lambda p: p[2] + p[3])
meta["dressed"] = 2
(root / "world.json").write_text(json.dumps(meta, separators=(",", ":")))
print("props now", len(props))
