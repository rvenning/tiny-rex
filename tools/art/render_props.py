"""Render prop kit sprites.

  blender -b -P tools/art/render_props.py -- --out art-build/props [--only a,b] [--samples 64]

Writes <out>/<name>_<variant>.png (raw frames, origin at the anchor pixel) and
<out>/frames.json for tools/art/pack.py.
"""
import importlib
import json
import os
import pkgutil
import random
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # noqa: E402
from common import *  # noqa: E402,F401
import kit  # noqa: E402


def load_registry():
    reg = {}
    for m in pkgutil.iter_modules(kit.__path__):
        if m.name.startswith("_"):
            continue
        mod = importlib.import_module("kit." + m.name)
        for k, v in getattr(mod, "PROPS", {}).items():
            reg[k] = v
    return reg


def add_bounce_ground(color=(0.30, 0.22, 0.12)):
    """Invisible to the camera, bounces warm light onto the prop base."""
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.01))
    g = bpy.context.object
    g.visible_camera = False
    m = bpy.data.materials.new("bounce")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*color, 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
    g.data.materials.append(m)


def render_one(name, prop, variant, out, samples):
    sc = reset_scene()
    w, h = prop.frame
    setup_render(sc, w, h, samples=samples)
    frame_camera(sc, w, h, prop.anchor)
    setup_lighting(sc)
    add_bounce_ground()
    rng = random.Random(zlib.crc32(f"{name}:{variant}".encode()))
    objs = prop.build(rng)
    join_all(objs)  # what is rendered is exactly what the world renderer instances
    fname = f"{name}_{variant}.png"
    render_to(sc, os.path.join(out, fname))
    return dict(
        key=f"{name}/{variant}",
        file=fname,
        ax=round(w * prop.anchor[0]),
        ay=round(h * prop.anchor[1]),
        meta=dict(r=prop.r, h=prop.h, kind=prop.kind, bake=prop.bake, tags=list(prop.tags), **prop.extra),
    )


def main():
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--samples", type=int, default=64)
    a = ap.parse_args(args_after_dashes())
    reg = load_registry()
    only = [s for s in a.only.split(",") if s]
    mpath = os.path.join(a.out, "frames.json")
    prior = json.load(open(mpath))["frames"] if os.path.exists(mpath) and only else []
    prior = [f for f in prior if f["key"].split("/")[0] not in (only or [])]
    frames = prior
    for name, prop in reg.items():
        if only and name not in only:
            continue
        for v in range(prop.variants):
            frames.append(render_one(name, prop, v, a.out, a.samples))
            print("RENDERED", name, v, flush=True)
    os.makedirs(a.out, exist_ok=True)
    json.dump({"frames": frames}, open(mpath, "w"), indent=1)


main()
