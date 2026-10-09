"""Art-only fern gardens frame the Hollow hunt lane without changing collision.

Uses the canonical Blender prop atlas and the exported terrain's exact height
samples. Kept separate from terrain baking so authored soft foliage can be
reviewed cheaply. The combat lane, refuge and discovery pockets stay clear.
"""
import argparse
import json
import math
from pathlib import Path
import numpy as np

LANE = [(23, 37), (27, 35), (31, 36), (35, 35), (39, 34), (44, 34)]
GARDENS = [(23, 40, 2.4), (28, 43, 3.0), (34, 43, 2.7), (39, 40, 2.4), (36.5, 38.5, 2.8), (24, 31, 1.8)]
POCKETS = [(27, 35, 3.0), (32, 38, 2.0), (35, 33, 1.8), (31, 39, 1.8), (43, 35, 1.8)]

def distance_to_lane(x, y):
    best = 1e9
    for a, b in zip(LANE, LANE[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        u = max(0, min(1, ((x-a[0])*dx + (y-a[1])*dy)/(dx*dx+dy*dy)))
        best = min(best, math.hypot(x-a[0]-u*dx, y-a[1]-u*dy))
    return best

def decorate(meta, terrain):
    if meta.get("openingFoliage") == 1:
        return meta
    rng = np.random.default_rng(1909)
    x0, y0, _, _, cell = terrain["bounds"]
    height = np.round(terrain["z"] * 100) / 100
    chosen = []
    for cx, cy, radius in GARDENS:
        for _ in range(60):
            x, y = rng.uniform(cx-radius, cx+radius), rng.uniform(cy-radius, cy+radius)
            if math.hypot(x-cx, y-cy) > radius or distance_to_lane(x,y) < 2.2:
                continue
            if any(math.hypot(x-px,y-py)<r for px,py,r in POCKETS):
                continue
            if any(math.hypot(x-px,y-py)<1.0 for px,py in chosen):
                continue
            ix, iy = int((x-x0)/cell), int((y-y0)/cell)
            if not np.isnan(terrain["water"][iy,ix]):
                continue
            # Bilinear cell-centre heights, matching the runtime grid.
            fx, fy = (x-x0)/cell-.5, (y-y0)/cell-.5
            ax, ay = int(math.floor(fx)), int(math.floor(fy))
            tx, ty = fx-ax, fy-ay
            z = (height[ay,ax]*(1-tx)+height[ay,ax+1]*tx)*(1-ty)+(height[ay+1,ax]*(1-tx)+height[ay+1,ax+1]*tx)*ty
            name = "fern_large" if rng.random()<.22 else "fern_medium"
            meta["props"].append([name, int(rng.integers(0,4)), round(x,3), round(y,3), round(float(z),3), round(float(rng.uniform(.58,.85)),3)])
            chosen.append((x,y))
    meta["props"].sort(key=lambda p: p[2]+p[3])
    meta["openingFoliage"] = 1
    return meta

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("meta")
    parser.add_argument("terrain")
    parser.add_argument("out")
    args = parser.parse_args()
    meta = json.loads(Path(args.meta).read_text())
    count = len(meta["props"])
    decorate(meta,np.load(args.terrain))
    Path(args.out).write_text(json.dumps(meta,separators=(",",":")))
    print(f"Added {len(meta['props'])-count} authored soft fern plants; collision unchanged")
