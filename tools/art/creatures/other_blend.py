"""Blender side of the herbivore/insect creature pipeline (other_core models -> sprites).

    blender -b -P tools/art/creatures/other_blend.py -- --id trike --mode turntable --scale 3
    blender -b -P tools/art/creatures/other_blend.py -- --id trike --mode anim [--poses idle,run]
    blender -b -P tools/art/creatures/other_blend.py -- --id beetle --mode marker

modes
  turntable : pose `--pose idle --frame 0` in 8 directions -> .scratch/other/<id>_tt/
  marker    : direction check (emissive bead on the nose) -> prints screen bearings
  anim      : all poses x 8 dirs -> art-build/creatures/<id>/ + frames.json (resumable:
              existing PNGs are kept; the frame size is fixed by a deterministic pre-pass)
  sheet     : like anim but into .scratch/other/<id>_anim/ (use with --scale / --dirs for review)
"""
import argparse
import importlib
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(ART))
sys.path.insert(0, ART)
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from common import (  # noqa: E402
    args_after_dashes,
    frame_camera,
    reset_scene,
    setup_lighting,
    setup_render,
    sun_vector,
)
import other_core as oc  # noqa: E402


# --------------------------------------------------------------------------- materials
def _n(nt, kind, loc=(0, 0), **props):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, v in props.items():
        setattr(n, k, v)
    return n


def make_material(name, spec):
    """spec keys: kind (skin|gloss|eye|wing|flat), rough, coat, coat_rough, bump, scale,
    scale2, sss, spec, ao, wrinkle, sheen"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = _n(nt, "ShaderNodeOutputMaterial", (900, 0))
    kind = spec.get("kind", "skin")
    col = _n(nt, "ShaderNodeAttribute", (-900, 200), attribute_name="col")
    rest = _n(nt, "ShaderNodeAttribute", (-1200, -200), attribute_name="rest")
    aux = _n(nt, "ShaderNodeAttribute", (-1200, -500), attribute_name="aux")
    bsdf = _n(nt, "ShaderNodeBsdfPrincipled", (500, 0))
    L = nt.links.new
    base = col.outputs["Color"]

    if kind == "wing":
        # aux.x = vein mask, aux.y = membrane tint
        sep = _n(nt, "ShaderNodeSeparateXYZ", (-900, -500))
        L(aux.outputs["Vector"], sep.inputs[0])
        bsdf.inputs["Roughness"].default_value = 0.15
        bsdf.inputs["Coat Weight"].default_value = 0.0
        bsdf.inputs["Specular IOR Level"].default_value = 0.9
        L(base, bsdf.inputs["Base Color"])
        # thin-film-ish iridescence: hue shift from facing ratio
        lw = _n(nt, "ShaderNodeLayerWeight", (-600, -800))
        lw.inputs["Blend"].default_value = 0.4
        ramp = _n(nt, "ShaderNodeValToRGB", (-300, -800))
        cr = ramp.color_ramp
        cr.elements[0].color = (0.55, 0.85, 0.80, 1)
        cr.elements[1].color = (0.95, 0.55, 0.85, 1)
        cr.elements.new(0.5).color = (0.75, 0.95, 0.55, 1)
        L(lw.outputs["Facing"], ramp.inputs[0])
        gl = _n(nt, "ShaderNodeBsdfGlossy", (300, -600))
        gl.inputs["Roughness"].default_value = 0.12
        L(ramp.outputs["Color"], gl.inputs["Color"])
        tr = _n(nt, "ShaderNodeBsdfTransparent", (300, -350))
        tr.inputs["Color"].default_value = (0.92, 1.0, 0.97, 1)
        # membrane: mostly transparent with glossy sheen; veins opaque principled
        memb = _n(nt, "ShaderNodeMixShader", (600, -450))
        memb.inputs[0].default_value = spec.get("membrane_gloss", 0.28)
        L(tr.outputs[0], memb.inputs[1])
        L(gl.outputs[0], memb.inputs[2])
        mix = _n(nt, "ShaderNodeMixShader", (750, -100))
        L(sep.outputs["X"], mix.inputs[0])
        L(memb.outputs[0], mix.inputs[1])
        L(bsdf.outputs[0], mix.inputs[2])
        L(mix.outputs[0], out.inputs["Surface"])
        return m

    # base colour x per-scale jitter x AO
    vor = _n(nt, "ShaderNodeTexVoronoi", (-900, -200))
    vor.feature = "DISTANCE_TO_EDGE"
    vor.inputs["Scale"].default_value = spec.get("scale", 40.0)
    vor.inputs["Randomness"].default_value = 0.9
    L(rest.outputs["Vector"], vor.inputs["Vector"])
    vor2 = _n(nt, "ShaderNodeTexVoronoi", (-900, -450))
    vor2.feature = "DISTANCE_TO_EDGE"
    vor2.inputs["Scale"].default_value = spec.get("scale2", spec.get("scale", 40.0) * 0.5)
    L(rest.outputs["Vector"], vor2.inputs["Vector"])
    sep = _n(nt, "ShaderNodeSeparateXYZ", (-900, -700))
    L(aux.outputs["Vector"], sep.inputs[0])
    # aux.y blends small scales -> big scales
    msel = _n(nt, "ShaderNodeMix", (-650, -300))
    msel.data_type = "FLOAT"
    L(sep.outputs["Y"], msel.inputs["Factor"])
    L(vor.outputs["Distance"], msel.inputs[2])
    L(vor2.outputs["Distance"], msel.inputs[3])
    # scale groove profile
    mr = _n(nt, "ShaderNodeMapRange", (-450, -300))
    mr.inputs["From Min"].default_value = 0.0
    mr.inputs["From Max"].default_value = spec.get("groove", 0.22)
    L(msel.outputs[0], mr.inputs["Value"])
    # wrinkle noise
    nz = _n(nt, "ShaderNodeTexNoise", (-650, -650))
    nz.inputs["Scale"].default_value = spec.get("wrinkle_scale", 25.0)
    nz.inputs["Detail"].default_value = 3.0
    L(rest.outputs["Vector"], nz.inputs["Vector"])
    hsum = _n(nt, "ShaderNodeMath", (-250, -400), operation="MULTIPLY_ADD")
    L(nz.outputs["Fac"], hsum.inputs[0])
    hsum.inputs[1].default_value = spec.get("wrinkle", 0.3)
    L(mr.outputs[0], hsum.inputs[2])
    bump = _n(nt, "ShaderNodeBump", (200, -300))
    bump.inputs["Strength"].default_value = spec.get("bump", 0.35)
    bump.inputs["Distance"].default_value = spec.get("bump_dist", 0.02)
    L(hsum.outputs[0], bump.inputs["Height"])
    # bump strength scaled by aux.z (0 = smooth areas like eyes/beak tips)
    bmul = _n(nt, "ShaderNodeMath", (0, -500), operation="MULTIPLY")
    bmul.inputs[1].default_value = spec.get("bump", 0.35)
    L(sep.outputs["Z"], bmul.inputs[0])
    L(bmul.outputs[0], bump.inputs["Strength"])
    L(bump.outputs["Normal"], bsdf.inputs["Normal"])

    # colour: per-cell jitter (from the active voronoi cell colour) + groove darkening
    vcol = _n(nt, "ShaderNodeTexVoronoi", (-900, 500))
    vcol.inputs["Scale"].default_value = spec.get("scale", 40.0)
    vcol.inputs["Randomness"].default_value = 0.9
    L(rest.outputs["Vector"], vcol.inputs["Vector"])
    jit = _n(nt, "ShaderNodeMapRange", (-650, 500))
    jit.inputs["To Min"].default_value = 1.0 - spec.get("jitter", 0.12)
    jit.inputs["To Max"].default_value = 1.0 + spec.get("jitter", 0.12)
    sepc = _n(nt, "ShaderNodeSeparateColor", (-750, 650))
    L(vcol.outputs["Color"], sepc.inputs[0])
    L(sepc.outputs[0], jit.inputs["Value"])
    groove = _n(nt, "ShaderNodeMapRange", (-250, 100))
    groove.inputs["To Min"].default_value = 1.0 - spec.get("groove_dark", 0.25)
    groove.inputs["To Max"].default_value = 1.0
    L(mr.outputs[0], groove.inputs["Value"])
    m1 = _n(nt, "ShaderNodeMix", (-300, 300))
    m1.data_type = "RGBA"
    m1.blend_type = "MULTIPLY"
    m1.inputs["Factor"].default_value = 1.0
    L(base, m1.inputs[6])
    L(jit.outputs[0], m1.inputs[7])
    m2 = _n(nt, "ShaderNodeMix", (-50, 300))
    m2.data_type = "RGBA"
    m2.blend_type = "MULTIPLY"
    L(sep.outputs["Z"], m2.inputs["Factor"])
    L(m1.outputs[2], m2.inputs[6])
    L(groove.outputs[0], m2.inputs[7])
    ao = _n(nt, "ShaderNodeAmbientOcclusion", (-50, 600))
    ao.samples = 8
    ao.only_local = True
    ao.inputs["Distance"].default_value = spec.get("ao_dist", 0.12)
    aor = _n(nt, "ShaderNodeMapRange", (150, 600))
    aor.inputs["To Min"].default_value = 1.0 - spec.get("ao", 0.45)
    aor.inputs["To Max"].default_value = 1.0
    L(ao.outputs["AO"], aor.inputs["Value"])
    m3 = _n(nt, "ShaderNodeMix", (300, 300))
    m3.data_type = "RGBA"
    m3.blend_type = "MULTIPLY"
    m3.inputs["Factor"].default_value = 1.0
    L(m2.outputs[2], m3.inputs[6])
    L(aor.outputs[0], m3.inputs[7])
    L(m3.outputs[2], bsdf.inputs["Base Color"])

    rough = _n(nt, "ShaderNodeMath", (200, -100), operation="ADD")
    rough.inputs[1].default_value = spec.get("rough", 0.55)
    L(sep.outputs["X"], rough.inputs[0])
    L(rough.outputs[0], bsdf.inputs["Roughness"])
    bsdf.inputs["Specular IOR Level"].default_value = spec.get("spec", 0.5)
    bsdf.inputs["Coat Weight"].default_value = spec.get("coat", 0.0)
    bsdf.inputs["Coat Roughness"].default_value = spec.get("coat_rough", 0.1)
    if spec.get("coat", 0) > 0:
        L(bump.outputs["Normal"], bsdf.inputs["Coat Normal"])
        if "coat_tint" in spec:
            bsdf.inputs["Coat Tint"].default_value = (*spec["coat_tint"], 1)
    if spec.get("sss", 0) > 0:
        bsdf.inputs["Subsurface Weight"].default_value = spec["sss"]
        bsdf.inputs["Subsurface Radius"].default_value = spec.get("sss_radius", (1.0, 0.45, 0.25))
        bsdf.inputs["Subsurface Scale"].default_value = spec.get("sss_scale", 0.03)
    if spec.get("sheen", 0) > 0:
        bsdf.inputs["Sheen Weight"].default_value = spec["sheen"]
        bsdf.inputs["Sheen Roughness"].default_value = 0.4
    L(bsdf.outputs[0], out.inputs["Surface"])
    return m


# --------------------------------------------------------------------------- mesh
class Built:
    pass


def build_creature(mod, report=True):
    t0 = time.time()
    model = mod.build()
    bidx = model.skel.index()
    Vs, Qs, Ws, Cs, As, Ms = [], [], [], [], [], []
    mats = {}
    off = 0
    for g in model.groups:
        V, Q = oc.mesh_group(g)
        W = oc.skin_weights(g, V, bidx, falloff=getattr(g, "falloff", 0.03))
        tags = oc.nearest_tag(g, V)
        C, A = mod.colorize(g, V, tags)
        if g.material not in mats:
            mats[g.material] = len(mats)
        Vs.append(V)
        Qs.append(Q + off)
        Ws.append(W)
        Cs.append(C)
        As.append(A)
        Ms.append(np.full(len(Q), mats[g.material]))
        off += len(V)
        if report:
            print(f"  group {g.name}: {len(V)} verts {len(Q)} quads", flush=True)
    b = Built()
    b.model, b.V, b.Q = model, np.vstack(Vs), np.vstack(Qs)
    b.W, b.C, b.A, b.M = np.vstack(Ws), np.vstack(Cs), np.vstack(As), np.concatenate(Ms)
    b.mats = mats
    if report:
        print(f"built {model.name}: {len(b.V)} verts, {len(b.Q)} quads in {time.time()-t0:.1f}s", flush=True)
    return b


def to_blender(b, mod):
    me = bpy.data.meshes.new(b.model.name)
    me.from_pydata(b.V.tolist(), [], b.Q.tolist())
    me.polygons.foreach_set("material_index", b.M.astype(np.int32))
    me.polygons.foreach_set("use_smooth", np.ones(len(b.Q), bool))
    a = me.attributes.new("rest", "FLOAT_VECTOR", "POINT")
    a.data.foreach_set("vector", b.V.astype(np.float32).ravel())
    c = me.color_attributes.new("col", "FLOAT_COLOR", "POINT")
    rgba = np.concatenate([b.C, np.ones((len(b.C), 1))], 1).astype(np.float32)
    c.data.foreach_set("color", rgba.ravel())
    x = me.attributes.new("aux", "FLOAT_VECTOR", "POINT")
    x.data.foreach_set("vector", b.A.astype(np.float32).ravel())
    me.update()
    ob = bpy.data.objects.new(b.model.name, me)
    bpy.context.scene.collection.objects.link(ob)
    inv = {v: k for k, v in b.mats.items()}
    for i in range(len(inv)):
        me.materials.append(make_material(inv[i], mod.MATERIALS[inv[i]]))
    return ob


def posed_verts(b, pose):
    S, _ = b.model.skel.fk(pose)
    Sl = np.stack([S[n] for n in b.model.skel.names])
    return oc.skin(b.V, b.W, Sl)


def set_verts(ob, V):
    ob.data.vertices.foreach_set("co", V.astype(np.float32).ravel())
    ob.data.update()


# --------------------------------------------------------------------------- scene
def add_rig(sc):
    setup_lighting(sc)
    # warm ground bounce, invisible to the camera
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.002))
    g = bpy.context.object
    g.visible_camera = False
    g.visible_shadow = False
    m = bpy.data.materials.new("bounce")
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (0.42, 0.30, 0.16, 1)
    p.inputs["Roughness"].default_value = 1.0
    g.data.materials.append(m)
    # subtle camera-side fill (no shadows) + warm rim from behind, characters only
    from mathutils import Vector

    def sun(name, v, e, col, shadow):
        d = bpy.data.lights.new(name, "SUN")
        d.energy = e
        d.color = col
        d.angle = math.radians(10)
        d.use_shadow = shadow
        o = bpy.data.objects.new(name, d)
        sc.collection.objects.link(o)
        o.rotation_euler = (-Vector(v).normalized()).to_track_quat("-Z", "Y").to_euler()

    sun("fill", (1.0, 1.0, 0.9), 0.7, (0.75, 0.85, 1.0), False)
    sv = sun_vector()
    sun("rim", (-sv.x * 0.2 - 0.7, -sv.y * 0.2 - 0.7, 0.6), 1.2, (1.0, 0.85, 0.6), False)


def compute_frame(b, poses, margin=3):
    xs, ys = [], []
    for pname, pdef in poses.items():
        for f in range(pdef["frames"]):
            V = posed_verts(b, pdef["fn"](f))
            for k in range(8):
                R = oc.heading_rot(k * math.pi / 4)
                sx, sy = oc.project_blender(V @ R.T)
                xs += [sx.min(), sx.max()]
                ys += [sy.min(), sy.max()]
    x0, x1 = math.floor(min(xs)) - margin, math.ceil(max(xs)) + margin
    y0, y1 = math.floor(min(ys)) - margin, math.ceil(max(ys)) + margin
    w, h = x1 - x0, y1 - y0
    return dict(w=int(w), h=int(h), ax=int(-x0), ay=int(-y0))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True)
    ap.add_argument("--mode", default="turntable")
    ap.add_argument("--pose", default="idle")
    ap.add_argument("--frame", type=int, default=0)
    ap.add_argument("--poses", default="")
    ap.add_argument("--dirs", default="0,1,2,3,4,5,6,7")
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--samples", type=int, default=40)
    ap.add_argument("--out", default="")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args(args_after_dashes())
    mod = importlib.import_module("other_" + a.id)
    poses = mod.POSES
    sc = reset_scene()
    b = build_creature(mod)
    ob = to_blender(b, mod)
    dirs = [int(d) for d in a.dirs.split(",") if d != ""]
    if a.mode in ("turntable", "marker"):
        jobs = [(a.pose, a.frame)]
    else:
        names = [p for p in a.poses.split(",") if p] or list(poses)
        jobs = [(p, f) for p in names for f in range(poses[p]["frames"])]
    fr = compute_frame(b, poses)
    print("FRAME", fr, flush=True)
    out = os.path.join(ROOT, a.out) if a.out else (
        os.path.join(ROOT, "art-build", "creatures", a.id)
        if a.mode == "anim"
        else os.path.join(ROOT, ".scratch", "other", f"{a.id}_{a.mode}")
    )
    os.makedirs(out, exist_ok=True)
    size_path = os.path.join(out, "_size.json")
    if a.mode == "anim" and os.path.exists(size_path):
        old = json.load(open(size_path))
        if old != fr:
            if not a.force:
                raise SystemExit(f"frame size changed {old} -> {fr}; rerun with --force (wipes frames)")
            for fn in os.listdir(out):
                if fn.endswith(".png"):
                    os.remove(os.path.join(out, fn))
    json.dump(fr, open(size_path, "w"))
    setup_render(sc, fr["w"], fr["h"], samples=a.samples)
    sc.cycles.use_auto_tile = False
    frame_camera(sc, fr["w"], fr["h"], (fr["ax"] / fr["w"], fr["ay"] / fr["h"]))
    sc.render.resolution_percentage = int(round(100 * a.scale))
    add_rig(sc)
    if a.mode == "marker":
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04 * max(1.0, mod.META["length"] / 0.6), location=(0, 0, 0))
        mk = bpy.context.object
        mm = bpy.data.materials.new("mk")
        mm.use_nodes = True
        e = mm.node_tree.nodes["Principled BSDF"]
        e.inputs["Emission Color"].default_value = (1, 0, 0, 1)
        e.inputs["Emission Strength"].default_value = 50
        mk.data.materials.append(mm)
        mk.parent = ob
        mk.location = mod.NOSE
    t_all = time.time()
    n = 0
    for pname, f in jobs:
        V = posed_verts(b, poses[pname]["fn"](f))
        set_verts(ob, V)
        for k in dirs:
            ob.rotation_euler = (0, 0, -k * math.pi / 4)
            fn = f"{pname}_{k}_{f}.png"
            path = os.path.join(out, fn)
            if a.mode == "anim" and os.path.exists(path):
                continue
            t = time.time()
            sc.render.filepath = path
            bpy.ops.render.render(write_still=True)
            n += 1
            print(f"RENDERED {fn} {time.time()-t:.1f}s", flush=True)
            if a.mode == "marker":
                img = bpy.data.images.load(path)
                W, H = img.size
                px = np.array(img.pixels[:]).reshape(H, W, 4)
                red = (px[:, :, 0] > 0.9) & (px[:, :, 1] < 0.3) & (px[:, :, 3] > 0.5)
                yy, xx = np.nonzero(red)
                if len(xx):
                    cx = xx.mean() / a.scale - fr["ax"]
                    cy = (H - 1 - yy.mean()) / a.scale - fr["ay"]
                    ang = math.degrees(math.atan2(cy, cx))
                    print(f"MARKER dir {k}: dx={cx:.1f} dy={cy:.1f} screen-angle={ang:.0f}deg (0=right,90=down)", flush=True)
                bpy.data.images.remove(img)
    print(f"DONE {n} renders in {time.time()-t_all:.1f}s", flush=True)
    # manifest (anim: every frame, whether rendered now or before)
    if a.mode in ("anim", "sheet"):
        frames = []
        names = [p for p in a.poses.split(",") if p] or list(poses)
        if a.mode == "anim":
            names = list(poses)
        for p in names:
            for k in dirs if a.mode == "sheet" else range(8):
                for f in range(poses[p]["frames"]):
                    fn = f"{p}_{k}_{f}.png"
                    if not os.path.exists(os.path.join(out, fn)):
                        continue
                    frames.append(dict(key=f"{a.id}/{p}/{k}/{f}", file=fn, ax=round(fr["ax"] * a.scale), ay=round(fr["ay"] * a.scale)))
        meta = dict(
            id=a.id,
            poses={p: dict(frames=d["frames"], fps=d["fps"], loop=d["loop"]) for p, d in poses.items()},
            **mod.META,
        )
        json.dump(dict(frames=frames, meta=meta), open(os.path.join(out, "frames.json"), "w"), indent=1)
    else:
        frames = [dict(key=f"{a.id}/{a.pose}/{k}/{a.frame}", file=f"{a.pose}_{k}_{a.frame}.png", ax=round(fr["ax"] * a.scale), ay=round(fr["ay"] * a.scale)) for k in dirs]
        json.dump(dict(frames=frames), open(os.path.join(out, "frames.json"), "w"), indent=1)


main()
