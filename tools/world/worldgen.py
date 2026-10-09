"""World generator: authored vector features -> terrain fields + prop placements.

Output (art-build/world/):
    terrain.npz   z, surf weights, water level  (consumed by tools/art/render_world.py)
    props.json    placed props (name, variant, x, y, z, scale)
    layout.png    top-down debug picture
The game reads a compact export made by tools/world/export.py from the same arrays,
so ground pixels, collision and props can never disagree.

Run:  D:/dev/ComfyUI_windows_portable/python_embeded/python.exe -I tools/world/worldgen.py
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fields import *  # noqa

SURF = ["grass", "dirt", "moss", "rock", "mud", "gravel", "sand", "basalt", "lava", "ash"]
SI = {n: i for i, n in enumerate(SURF)}
CELL = 0.25
BAKE = {"grass_tuft", "clover_patch", "moss_clump", "mushroom_cluster", "flower_purple", "fern_small", "rock_pebbles"}

# World frame (game units). Fern Hollow occupies [0,64]^2; the apron is rendered but never walkable.
BOUNDS = (-20.0, -20.0, 90.0, 90.0)


class Terrain:
    def __init__(self, bounds=BOUNDS, cell=CELL, seed=7):
        self.g = Grid(*bounds, cell)
        self.seed = seed
        self.z = self.g.zeros()
        self.w = {n: self.g.zeros() for n in SURF}
        self.water = self.g.zeros(np.nan)  # water surface height where wet
        self.open = self.g.zeros()  # 0..1 walkable open ground (paths, clearings, banks)
        self.keep = self.g.zeros()  # 0..1 keep-clear zones for combat lanes (props thin out)
        self.props = []
        self.rng = np.random.default_rng(seed)
        self.solids = []  # (x, y, r) circles that block movement
        self.pois = {}
        self.features = []

    # ---- surface painting -------------------------------------------------
    def paint(self, name, mask, strength=1.0):
        self.w[name] = np.clip(self.w[name] + mask * strength, 0, 1)

    def normalise(self):
        tot = sum(self.w.values()) + 1e-6
        # grass is the default filler
        rest = np.clip(1 - tot, 0, 1)
        self.w["grass"] = self.w["grass"] + rest
        tot = sum(self.w.values())
        for n in SURF:
            self.w[n] = (self.w[n] / tot).astype(np.float32)


def build(seed=7):
    T = Terrain(seed=seed)
    import hollow
    hollow.terrain(T)
    T.normalise()
    hollow.scatter(T)
    return T


def save(T, out):
    os.makedirs(out, exist_ok=True)
    np.savez_compressed(
        os.path.join(out, "terrain.npz"),
        z=T.z,
        surf=np.stack([T.w[n] for n in SURF]).astype(np.float16),
        water=T.water,
        opn=T.open,
        keep=T.keep,
        forest=T.forest,
        bounds=np.array(T.g.__dict__ and [T.g.x0, T.g.y0, T.g.x1, T.g.y1, T.g.cell], np.float32),
    )
    json.dump(dict(props=T.props, solids=T.solids, pois=T.pois, features=T.features, creek=getattr(T, "creek_pts", [])), open(os.path.join(out, "props.json"), "w"))
    # debug layout picture
    from PIL import Image
    g = T.g
    img = np.zeros((g.ny, g.nx, 3), np.float32)
    cols = {"grass": (0.35, 0.5, 0.18), "dirt": (0.8, 0.55, 0.3), "moss": (0.12, 0.3, 0.1), "rock": (0.5, 0.48, 0.45), "mud": (0.4, 0.3, 0.2), "gravel": (0.6, 0.58, 0.5), "sand": (0.9, 0.8, 0.5), "basalt": (0.2, 0.18, 0.2), "lava": (1, 0.3, 0), "ash": (0.4, 0.4, 0.4)}
    for n, c in cols.items():
        img += T.w[n][..., None] * np.array(c, np.float32)
    shade = np.clip(0.8 + (T.z - T.z.mean()) * 0.2, 0.5, 1.2)[..., None]
    img *= shade
    wet = ~np.isnan(T.water)
    img[wet] = img[wet] * 0.3 + np.array((0.1, 0.55, 0.65), np.float32) * 0.7
    img[T.open > 0.35] = img[T.open > 0.35] * 0.8 + np.array([0.2, 0.0, 0.0], np.float32) * 0.0 + 0.1
    pic = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    from PIL import ImageDraw
    d = ImageDraw.Draw(pic)
    for p in T.props:
        if p["b"]:
            continue
        px, py = (p["x"] - g.x0) / g.cell, (p["y"] - g.y0) / g.cell
        d.ellipse((px - 2, py - 2, px + 2, py + 2), fill=(255, 255, 255) if p["n"].startswith(("palm", "tree")) else (200, 40, 40) if "boulder" in p["n"] else (255, 220, 0))
    pic.save(os.path.join(out, "layout.png"))


if __name__ == "__main__":
    T = build()
    out = os.path.join(os.path.dirname(__file__), "..", "..", "art-build", "world")
    save(T, os.path.abspath(out))
    print("props", len(T.props), "solids", len(T.solids))
