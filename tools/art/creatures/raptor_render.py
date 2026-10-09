"""Render driver for the feathered-theropod family.

  blender -b -P tools/art/creatures/raptor_render.py -- --id raptor --mode look --out .scratch/raptor/look
  blender -b -P tools/art/creatures/raptor_render.py -- --id raptor --mode turn --out .scratch/raptor/turn
  blender -b -P tools/art/creatures/raptor_render.py -- --id raptor --mode poses --out art-build/creatures/raptor [--only run,idle] [--dirs 0,1]

Modes
  look   big side/front/3-4 beauty renders (not game camera) for model review
  turn   game camera, 8 directions, rest pose, at PPU and 2x, plus a direction marker test
  poses  the real sprite frames + frames.json (resumable: existing PNGs are skipped)
  sheet  game camera, every pose frame for chosen dirs at 2x for animation review
"""
import argparse
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Euler, Vector  # noqa: E402

import common  # noqa: E402
from common import PPU, COS45, SQUASH, VSCALE, frame_camera, reset_scene, setup_lighting, setup_render, render_to  # noqa: E402
import raptor_build as RB  # noqa: E402
import raptor_geo as RG  # noqa: E402
import raptor_species as RS  # noqa: E402
import raptor_poses as RP  # noqa: E402


def add_bounce_ground(color=(0.30, 0.22, 0.12)):
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.005))
    g = bpy.context.object
    g.visible_camera = False
    g.visible_shadow = False
    m = bpy.data.materials.new("bounce")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*color, 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
    g.data.materials.append(m)
    return g


def add_fill(strength=0.0):
    """Subtle camera-side cool fill (allowed on characters). Area light far away toward the camera."""
    if strength <= 0:
        return None
    ld = bpy.data.lights.new("Fill", "SUN")
    ld.energy = strength
    ld.color = (0.75, 0.85, 1.0)
    ld.angle = math.radians(30)
    ob = bpy.data.objects.new("Fill", ld)
    bpy.context.scene.collection.objects.link(ob)
    # from the camera direction, a bit lower
    v = Vector((COS45, COS45, 0.45)).normalized()
    ob.rotation_euler = (-v).to_track_quat("-Z", "Y").to_euler()
    ob.visible_shadow = False if hasattr(ob, "visible_shadow") else None
    ld.use_shadow = False
    return ob


def assign_materials(C, P):
    pal = P.get("mat", {})
    skin = RG.skin_material(P["id"] + "_skinmat", **pal.get("skin", {}))
    claws = RG.claw_material(P["id"] + "_clawmat", **pal.get("claw", {}))
    teeth = RG.claw_material(P["id"] + "_teethmat", base=(0.80, 0.74, 0.62), tip=(0.9, 0.86, 0.78))
    feath = RG.feather_material(P["id"] + "_feathmat", **pal.get("feather", {}))
    feath_small = RG.feather_material(P["id"] + "_feathmat_s", **{**pal.get("feather", {}), "translucency": 0.15})
    eye = RG.eye_material(P["id"] + "_eyemat", **pal.get("eye", {}))
    for ob in (C.skin_ob, C.jaw_ob, C.arm_ob):
        ob.data.materials.append(skin)
    C.claw_ob.data.materials.append(claws)
    if C.teeth_ob:
        C.teeth_ob.data.materials.append(teeth)
    for name, ob in C.feather_sets:
        ob.data.materials.append(feath_small if name.endswith("_fcov") else feath)
    for ob, _, _ in C.rigid:
        ob.data.materials.append(eye)


def scene_setup(w, h, samples, anchor=None, transparent=True):
    sc = bpy.context.scene
    setup_render(sc, w, h, samples=samples, transparent=transparent)
    sc.render.use_persistent_data = True
    if anchor is not None:
        frame_camera(sc, w, h, anchor)
    return sc


def build(species_id):
    reset_scene()
    P = RS.SPECIES[species_id]
    t0 = time.time()
    C = RB.build(P)
    assign_materials(C, P)
    print(f"BUILD {species_id}: {time.time() - t0:.1f}s; tris:",
          {ob.name: sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob, _, _ in C.parts}, flush=True)
    return C, P


def set_dir(C, k):
    phi = k * math.pi / 4
    C.root.rotation_euler = (0, 0, -phi)


def side_camera(sc, w, h, scale_ppu, center, view="side"):
    cam_d = bpy.data.cameras.new("LookCam")
    cam_d.type = "ORTHO"
    cam_d.ortho_scale = w / scale_ppu
    cam = bpy.data.objects.new("LookCam", cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cx, cy, cz = center
    if view == "side":  # look from +X toward -X (see the creature's right side)
        cam.location = (cx + 20, cy, cz)
        cam.rotation_euler = (math.radians(90), 0, math.radians(90))
    elif view == "front":
        cam.location = (cx, cy + 20, cz)
        cam.rotation_euler = (math.radians(90), 0, math.radians(180))
    elif view == "34":
        el = math.radians(18)
        az = math.radians(55)
        d = 20
        cam.location = (cx + d * math.cos(el) * math.sin(az), cy + d * math.cos(el) * math.cos(az), cz + d * math.sin(el))
        cam.rotation_euler = (math.radians(90) - el, 0, math.radians(180) - az)
    elif view == "top":
        cam.location = (cx, cy, cz + 20)
        cam.rotation_euler = (0, 0, 0)
    cam_d.clip_end = 100
    return cam


def mode_look(a):
    C, P = build(a.id)
    pose = RP.rest_pose(C) if not a.pose else RP.POSES[a.pose](C, a.frame, RP.NFR[a.pose])
    RB.apply_pose(C, RB.pose_creature(C, pose))
    sc = bpy.context.scene
    setup_lighting(sc)
    add_bounce_ground()
    add_fill(a.fill)
    s = a.scale
    L = P["meta"]["length"]
    w = int(L * s * 1.08)
    h = int(L * 0.62 * s)
    setup_render(sc, w, h, samples=a.samples)
    for view in a.views.split(","):
        for ob in [o for o in sc.objects if o.name.startswith("LookCam")]:
            bpy.data.objects.remove(ob)
        C.root.rotation_euler = (0, 0, 0)
        cen = (0, C.dy - 0.18, 0.72) if view != "front" else (0, 0, 0.72)
        side_camera(sc, w if view != "front" else h, h, s, cen, view)
        if view == "front":
            sc.render.resolution_x = h
        else:
            sc.render.resolution_x = w
        render_to(sc, os.path.join(a.out, f"look_{view}.png"))


# ------------------------------------------------------------------------------- frame layout
def project_bounds(points_list):
    """Screen bounds (px at PPU) of creature-space points over all 8 directions."""
    mnx = mny = 1e9
    mxx = mxy = -1e9
    for X in points_list:
        for k in range(8):
            phi = k * math.pi / 4
            c, s = math.cos(-phi), math.sin(-phi)
            bx = X[:, 0] * c - X[:, 1] * s
            by = X[:, 0] * s + X[:, 1] * c
            gx, gy, gz = by, bx, X[:, 2]  # Blender Y = gx, Blender X = gy
            sx = (gx - gy) * COS45 * PPU
            sy = (gx + gy) * COS45 * PPU * SQUASH - gz * PPU * VSCALE
            mnx, mxx = min(mnx, sx.min()), max(mxx, sx.max())
            mny, mxy = min(mny, sy.min()), max(mxy, sy.max())
    return mnx, mny, mxx, mxy


def all_pose_frames(C, poses):
    for name in poses:
        n = RP.NFR[name]
        for f in range(n):
            yield name, f, RP.POSES[name](C, f, n)


def creature_points(C, posed, stride=7):
    out, rig, _ = posed
    pts = [co[::stride] for co in out]
    X = np.vstack(pts)
    X = X + np.array([0, C.dy, 0])
    return X


def layout(C, poses, margin=6):
    pts = []
    for name, f, pose in all_pose_frames(C, poses):
        pts.append(creature_points(C, RB.pose_creature(C, pose)))
    mnx, mny, mxx, mxy = project_bounds(pts)
    w = int(math.ceil(mxx - mnx)) + 2 * margin
    h = int(math.ceil(mxy - mny)) + 2 * margin
    w += w % 2
    h += h % 2
    ax = -mnx + margin
    ay = -mny + margin
    return w, h, ax, ay


def mode_turn(a):
    C, P = build(a.id)
    pose = RP.rest_pose(C) if not a.pose else RP.POSES[a.pose](C, a.frame, RP.NFR[a.pose])
    posed = RB.pose_creature(C, pose)
    RB.apply_pose(C, posed)
    pts = [creature_points(C, posed)]
    mnx, mny, mxx, mxy = project_bounds(pts)
    m = 6
    w, h = int(mxx - mnx) + 2 * m, int(mxy - mny) + 2 * m
    ax, ay = -mnx + m, -mny + m
    sc = bpy.context.scene
    scale = a.zoom
    setup_render(sc, int(w * scale), int(h * scale), samples=a.samples)
    sc.render.use_persistent_data = True
    # zoomed game camera: same projection, more pixels
    common_ppu = common.PPU
    frame_camera(sc, int(w * scale), int(h * scale), (ax / w, ay / h))
    sc.camera.data.ortho_scale = w / common_ppu
    setup_lighting(sc)
    add_bounce_ground()
    add_fill(a.fill)
    # direction marker: a small red sphere at the snout tip in creature space
    for k in [int(x) for x in a.dirs.split(",")]:
        set_dir(C, k)
        render_to(sc, os.path.join(a.out, f"turn_{k}.png"))
        print("TURN", k, flush=True)
    json.dump(dict(w=w, h=h, ax=ax, ay=ay, zoom=scale), open(os.path.join(a.out, "turn.json"), "w"))


def mode_frames(a, review=False):
    C, P = build(a.id)
    poses = RP.SPECIES_POSES[a.id]
    lay_path = os.path.join(a.out, "layout.json")
    w, h, ax, ay = layout(C, poses)
    if os.path.exists(lay_path) and not a.relayout:
        old = json.load(open(lay_path))
        if (old["w"], old["h"]) != (w, h) or abs(old["ax"] - ax) > 0.5 or abs(old["ay"] - ay) > 0.5:
            print(f"LAYOUT CHANGED {old} -> {(w, h, ax, ay)}; using OLD layout unless --relayout", flush=True)
            w, h, ax, ay = old["w"], old["h"], old["ax"], old["ay"]
    os.makedirs(a.out, exist_ok=True)
    json.dump(dict(w=w, h=h, ax=ax, ay=ay), open(lay_path, "w"))
    print("LAYOUT", w, h, ax, ay, flush=True)
    sc = bpy.context.scene
    zoom = a.zoom if review else 1.0
    setup_render(sc, int(w * zoom), int(h * zoom), samples=a.samples)
    sc.render.use_persistent_data = True
    frame_camera(sc, int(w * zoom), int(h * zoom), (ax / w, ay / h))
    sc.camera.data.ortho_scale = w / PPU
    setup_lighting(sc)
    add_bounce_ground()
    add_fill(a.fill)
    only = [s for s in a.only.split(",") if s]
    dirs = [int(x) for x in a.dirs.split(",")] if a.dirs else list(range(8))
    frames = []
    t_start = time.time()
    nrend = 0
    for name in poses:
        n = RP.NFR[name]
        for f in range(n):
            pose = RP.POSES[name](C, f, n)
            need = []
            for k in dirs:
                fn = f"{name}_{k}_{f}.png"
                frames.append(dict(key=f"{a.id}/{name}/{k}/{f}", file=fn, ax=round(ax), ay=round(ay)))
                if only and name not in only:
                    continue
                path = os.path.join(a.out, fn)
                if os.path.exists(path) and not a.force:
                    continue
                need.append((k, path))
            if not need:
                continue
            RB.apply_pose(C, RB.pose_creature(C, pose))
            for k, path in need:
                set_dir(C, k)
                render_to(sc, path)
                nrend += 1
            print(f"FRAME {name} {f} ({len(need)} dirs) {time.time() - t_start:.0f}s total, {nrend} renders", flush=True)
    if not review:
        meta = dict(id=a.id, poses={nm: dict(frames=RP.NFR[nm], fps=RP.FPS[nm], loop=RP.LOOP[nm]) for nm in poses},
                    **P["meta"])
        json.dump(dict(frames=frames, meta=meta), open(os.path.join(a.out, "frames.json"), "w"), indent=1)
    else:
        json.dump(dict(frames=[f for f in frames if os.path.exists(os.path.join(a.out, f["file"]))]),
                  open(os.path.join(a.out, "frames.json"), "w"), indent=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", default="raptor")
    ap.add_argument("--mode", default="look")
    ap.add_argument("--out", required=True)
    ap.add_argument("--samples", type=int, default=40)
    ap.add_argument("--scale", type=float, default=320.0)
    ap.add_argument("--views", default="side,34,front")
    ap.add_argument("--zoom", type=float, default=1.0)
    ap.add_argument("--dirs", default="")
    ap.add_argument("--only", default="")
    ap.add_argument("--pose", default="")
    ap.add_argument("--frame", type=int, default=0)
    ap.add_argument("--fill", type=float, default=0.0)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--relayout", action="store_true")
    a = ap.parse_args(common.args_after_dashes())
    os.makedirs(a.out, exist_ok=True)
    if a.mode == "look":
        mode_look(a)
    elif a.mode == "turn":
        if not a.dirs:
            a.dirs = "0,1,2,3,4,5,6,7"
        mode_turn(a)
    elif a.mode == "poses":
        mode_frames(a)
    elif a.mode == "sheet":
        mode_frames(a, review=True)


main()
