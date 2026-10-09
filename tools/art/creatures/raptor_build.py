"""Generic feathered-theropod assembly used by every species in raptor_species.py.

build(P) -> Creature with
  sk       Skeleton (rest = the modelled stance)
  parts    skinned mesh objects: (obj, rest_co, W)
  rigid    objects carried rigidly by a bone (eyes): (obj, bone, rest_matrix)
  root     empty that is rotated per direction (rotation_euler.z = -phi)
  offset   child empty translating "hip space" so the game origin sits between the feet
Everything below is built in HIP SPACE: hip joint at y = 0, X right, Y forward, Z up.
"""
import math

import bpy
import numpy as np

from raptor_geo import (
    Sweep, FeatherSet, claw, concat, ellipsoid, eye_mesh, mesh_co, new_mesh_obj, set_mesh_co,
    set_point_color, set_point_float, shade_smooth, smoothstep, unit, v3, voxel_union, rot_axis,
)
from raptor_rig import Chain, Skeleton, compute_weights, frame_from, skin, T

UP = v3(0, 0, 1)
FWD = v3(0, 1, 0)
LAT = v3(1, 0, 0)
MX = np.diag([-1.0, 1.0, 1.0])


def mirror_mesh(V, F):
    V = np.asarray(V, float).copy()
    V[:, 0] *= -1
    return V, [tuple(reversed(f)) for f in F]


def mx(v):
    v = np.asarray(v, float).copy()
    v[..., 0] *= -1
    return v


class Creature:
    def __init__(self, P):
        self.P = P
        self.sk = Skeleton()
        self.parts = []
        self.rigid = []
        self.chains = {}
        self.joints = {}
        self.objs = []


def ctrl_rows(rows, x=0.0):
    """(name, y, z, rxt, rxb, zt, zb, n) -> names, ndarray rows for Sweep"""
    names = [r[0] for r in rows]
    arr = np.array([[x, r[1], r[2], r[3], r[4], r[5], r[6], r[7] if len(r) > 7 else 2.0] for r in rows])
    return names, arr


def limb_sweep(pts, profs, side_ref=(1, 0, 0), spacing=0.006, nseg=24):
    """pts: joint positions, profs: per-joint (rxt, rxb, zt, zb, n)"""
    rows = [np.r_[p, pr] for p, pr in zip(pts, profs)]
    return Sweep(np.array(rows), side_ref=side_ref, spacing=spacing, nseg=nseg, per=12)


def build(P, coll=None):
    C = Creature(P)
    sk = C.sk
    coll = coll or bpy.context.scene.collection
    J = C.joints

    # ------------------------------------------------------------- body sweep
    names, rows = ctrl_rows(P["body"])
    body = Sweep(rows, spacing=P.get("spacing", 0.008), nseg=40, per=20)
    C.body = body
    for nm, r in zip(names, rows):
        J[nm] = r[:3].copy()

    # ------------------------------------------------------------- skeleton: spine
    fj = P["front_joints"]  # hip -> snout names
    fb = P["front_bones"]  # bone names between them (first one is the root 'pelvis')
    for i, b in enumerate(fb):
        sk.add(b, None if i == 0 else fb[i - 1], J[fj[i]], J[fj[i + 1]])
    tj = P["tail_joints"]  # hip -> tail tip
    tb = P["tail_bones"]
    for i, b in enumerate(tb):
        sk.add(b, fb[0] if i == 0 else tb[i - 1], J[tj[i]], J[tj[i + 1]], side_ref=(-1, 0, 0))
    head_bone = fb[-1]

    # jaw
    jn, jrows = ctrl_rows(P["jaw"])
    jaw = Sweep(jrows, spacing=0.006, nseg=28, per=16)
    J["jaw_pivot"] = jrows[0, :3] + v3(0, 0.0, 0.0)
    J["chin"] = jrows[-1, :3]
    sk.add("jaw", head_bone, J["jaw_pivot"], J["chin"])

    # ------------------------------------------------------------- legs (rest IK)
    L = P["leg"]
    lens = (L["femur"], L["tibia"], L["meta"], L["toe"])
    hipR = v3(L["hip_x"], L.get("hip_y", 0.0), L["hip_z"])
    ballR = v3(L["ball_x"], L["ball_y"], L["ball_z"])
    H, K, A, Pb, td = sk.leg_ik(hipR, FWD, LAT, ballR, L["beta"], 0.0, 0.0, lens)
    J.update(hipR=H, kneeR=K, ankleR=A, ballR=Pb)
    foot_center_y = Pb[1] + L["toe"] * 0.45
    C.dy = -foot_center_y
    for s, sg in (("R", 1), ("L", -1)):
        f = (lambda v: v) if sg > 0 else mx
        sk.add("thigh" + s, fb[0], f(H), f(K))
        sk.add("shin" + s, "thigh" + s, f(K), f(A))
        sk.add("meta" + s, "shin" + s, f(A), f(Pb))
        sk.add("toe" + s, "meta" + s, f(Pb), f(Pb + FWD * L["toe"]))
        sk.add_leg(s, "thigh" + s, "shin" + s, "meta" + s, "toe" + s, lens,
                   dict(ball=f(ballR), beta=L["beta"], toe=0.0))
    # digit II (sickle) bone, child of meta, built below once we know its joints

    # ------------------------------------------------------------- leg geometry (right side, mirrored)
    lp = L["prof"]
    thigh_top = H + v3(0, L.get("thigh_top_y", 0.03), L.get("thigh_top_z", 0.10))
    th_dir = unit(K - H)
    leg_parts = []
    thigh = limb_sweep(
        [thigh_top, H, H + (K - H) * 0.45, H + (K - H) * 0.8, K + th_dir * 0.02],
        lp["thigh"], spacing=0.007, nseg=28)
    shin = limb_sweep(
        [K - unit(A - K) * 0.02, K + (A - K) * 0.25, K + (A - K) * 0.6, A],
        lp["shin"], spacing=0.006, nseg=22)
    meta = limb_sweep([A + unit(A - Pb) * 0.01, A + (Pb - A) * 0.5, Pb], lp["meta"], spacing=0.006, nseg=18)
    leg_parts += [thigh.mesh_data(), shin.mesh_data(), meta.mesh_data()]
    C.thigh_sweep = thigh
    leg_parts.append(ellipsoid(K, (lp["knee"], lp["knee"], lp["knee"]), nseg=16, nring=10))
    leg_parts.append(ellipsoid(A, (lp["ankle"], lp["ankle"] * 1.1, lp["ankle"] * 1.05), nseg=16, nring=10))
    leg_parts.append(ellipsoid(Pb + v3(0, 0.005, 0), (lp["ball"] * 1.15, lp["ball"] * 1.2, lp["ball"]), nseg=16, nring=10))
    # toes
    claws_R = []
    toe_chain_pts = {}
    for tname, ts in L["toes"].items():
        yaw = ts["yaw"]
        d = rot_axis(UP, -yaw) @ FWD  # positive yaw = outward (+x)
        segs = ts["segs"]
        pts = [Pb + v3(ts.get("x", 0), 0, 0)]
        lift = ts.get("lift", [0.0] * len(segs))
        z0 = Pb[2]
        cur = pts[0].copy()
        for k, (sl, lf) in enumerate(zip(segs, lift)):
            dd = unit(d * math.cos(lf) + UP * math.sin(lf))
            cur = cur + dd * sl
            pts.append(cur.copy())
        pts = np.array(pts)
        if ts.get("ground", True):
            # settle toe pads on the ground: last joints at radius height
            for k in range(1, len(pts)):
                pts[k, 2] = max(ts["rad"][k] * 0.95, pts[k, 2] if ts.get("lift") else ts["rad"][k] * 0.95)
        profs = [(r, r * 1.05, r * 0.9, r, 2.0) for r in ts["rad"]]
        sw = limb_sweep(pts, profs, spacing=0.004, nseg=14)
        leg_parts.append(sw.mesh_data())
        for k in range(1, len(pts) - 1):
            r = ts["rad"][k] * 1.12
            leg_parts.append(ellipsoid(pts[k], (r, r, r * 0.95), nseg=12, nring=8))
        cd = ts.get("claw_dir")
        cdir = unit(pts[-1] - pts[-2]) if cd is None else unit(cd)
        cup = ts.get("claw_up", UP)
        claws_R.append((pts[-1] - cdir * ts["rad"][-1] * 0.6, cdir, cup, ts["claw"], ts["claw_r"],
                        ts.get("curl", 1.2), tname))
        toe_chain_pts[tname] = (pts, ts["rad"])
    C.toe_pts = toe_chain_pts

    # ------------------------------------------------------------- head extras (brow, crests...)
    extras = []
    for e in P.get("blobs", []):
        c, r = v3(*e["c"]), e["r"]
        R = np.eye(3)
        if "rot" in e:
            ax, ang = e["rot"]
            R = rot_axis(ax, ang)
        if e.get("sym", True) and abs(c[0]) > 1e-6:
            extras.append(ellipsoid(c, r, R, nseg=18, nring=10))
            extras.append(mirror_mesh(*ellipsoid(c, r, R, nseg=18, nring=10)))
        else:
            extras.append(ellipsoid(c, r, R, nseg=18, nring=10))
    for sw_rows in P.get("extra_sweeps", []):
        nm, rr = ctrl_rows(sw_rows["rows"], x=sw_rows.get("x", 0.0))
        sw = Sweep(rr, spacing=0.005, nseg=24, per=12, side_ref=sw_rows.get("side", (1, 0, 0)))
        extras.append(sw.mesh_data())
        if sw_rows.get("sym") and abs(sw_rows.get("x", 0.0)) > 1e-6:
            extras.append(mirror_mesh(*sw.mesh_data()))

    # ------------------------------------------------------------- union skin
    legR = concat(leg_parts)
    legL = mirror_mesh(*legR)
    skin_ob = voxel_union(P["id"] + "_skin", [body.mesh_data(), legR, legL] + extras,
                          voxel=P.get("voxel", 0.008), smooth_iter=P.get("smooth_iter", 6))
    C.skin = skin_ob

    # jaw object (separate so the mouth can open)
    jV, jF = jaw.mesh_data()
    jaw_ob = voxel_union(P["id"] + "_jaw", [(jV, jF)] + [e for e in P.get("jaw_extras", [])],
                         voxel=P.get("voxel", 0.008) * 0.75, smooth_iter=4)
    C.jaw = jaw

    # ------------------------------------------------------------- arms
    A_ = P["arm"]
    sh, el, wr, kn = (v3(*A_[k]) for k in ("shoulder", "elbow", "wrist", "knuckle"))
    J.update(shoulderR=sh, elbowR=el, wristR=wr, knuckleR=kn)
    for s, f in (("R", lambda v: v), ("L", mx)):
        sk.add("hum" + s, A_.get("parent", "chest"), f(sh), f(el))
        sk.add("fore" + s, "hum" + s, f(el), f(wr))
        sk.add("hand" + s, "fore" + s, f(wr), f(kn))
    ap = A_["prof"]
    arm_parts = [
        limb_sweep([sh - unit(el - sh) * 0.02, sh + (el - sh) * 0.5, el], ap["hum"], spacing=0.005, nseg=18).mesh_data(),
        limb_sweep([el, el + (wr - el) * 0.5, wr], ap["fore"], spacing=0.005, nseg=16).mesh_data(),
        limb_sweep([wr, kn], ap["hand"], spacing=0.004, nseg=14).mesh_data(),
        ellipsoid(el, (ap["elbow"],) * 3, nseg=12, nring=8),
        ellipsoid(wr, (ap["wrist"],) * 3, nseg=12, nring=8),
    ]
    finger_claws = []
    fingers = []
    for fs in A_["fingers"]:
        d = unit(v3(*fs["dir"]))
        pts = [kn + v3(*fs.get("off", (0, 0, 0)))]
        for sl in fs["segs"]:
            pts.append(pts[-1] + d * sl)
            d = unit(rot_axis(LAT, -fs.get("bend", 0.3)) @ d)
        pts = np.array(pts)
        r = fs["rad"]
        arm_parts.append(limb_sweep(pts, [(r, r, r, r, 2.0)] * (len(pts) - 1) + [(r * 0.8,) * 4 + (2.0,)],
                                    spacing=0.004, nseg=10).mesh_data())
        finger_claws.append((pts[-1], unit(pts[-1] - pts[-2]), v3(*fs.get("claw_up", (0, 1, 0))), fs["claw"],
                             fs["claw_r"], fs.get("curl", 1.4)))
        fingers.append(pts)
    armR = concat(arm_parts)
    armL = mirror_mesh(*armR)
    arm_ob = voxel_union(P["id"] + "_arms", [armR, armL], voxel=P.get("voxel", 0.008) * 0.6, smooth_iter=4)
    C.fingers = fingers

    # ------------------------------------------------------------- sickle bone (digit II) + claws/teeth objects
    sick = L["toes"].get("d2")
    if sick:
        p2 = toe_chain_pts["d2"][0]
        for s, f in (("R", lambda v: v), ("L", mx)):
            sk.add("sickle" + s, "meta" + s, f(p2[0]), f(p2[-1]))
    claw_parts, claw_t = [], []
    claw_host = []  # (vertex range, chain/bone tag)

    def add_claw(base, d, up, length, rad, curl, tag, nseg=12):
        V, F = claw(base, d, up, length, rad, curl=curl, nseg=nseg)
        n = len(V)
        # ctip param: projection along the claw's arc ~ ring index
        rings = (n - 2) // nseg
        t = np.r_[np.repeat(np.linspace(0, 1, rings), nseg), 0.0, 1.0]
        claw_parts.append((V, F))
        claw_t.append(t)
        claw_host.append((n, tag))

    for (b, d, up, ln, rd, cu, tn) in claws_R:
        for s, f in (("R", lambda v: v), ("L", mx)):
            bone = {"d2": "sickle", "d1": "meta"}.get(tn, "toe") + s
            add_claw(f(b), f(d), f(up), ln, rd, cu, bone)
    for (b, d, up, ln, rd, cu) in finger_claws:
        for s, f in (("R", lambda v: v), ("L", mx)):
            add_claw(f(b), f(d), f(up), ln, rd, cu, "hand" + s, nseg=10)
    V, F = concat(claw_parts)
    claw_ob = new_mesh_obj(P["id"] + "_claws", V, F, coll)
    shade_smooth(claw_ob)
    set_point_float(claw_ob, "ctip", np.concatenate(claw_t))
    claw_bones = np.concatenate([[tag] * n for n, tag in claw_host])

    # teeth
    teeth_parts, teeth_bone = [], []
    for tr in P.get("teeth", []):
        sw = body if tr["on"] == "head" else jaw
        n = tr["n"]
        lo = int(np.argmin(np.abs(sw.p[:, 1] - tr["y0"]) + (sw.p[:, 1] < J["occ"][1] - 0.1) * 9)) if sw is body else 0
        ys = sw.p[lo:, 1]
        for i in range(n):
            fr = i / max(n - 1, 1)
            y = tr["y0"] + (tr["y1"] - tr["y0"]) * fr
            tt = lo + float(np.interp(y, ys, np.arange(len(ys))))
            for sgn in (1, -1):
                th = tr["th"] if sgn > 0 else math.pi - tr["th"]
                p, nrm, fw = sw.point(tt, th)
                d = v3(*tr["dir"])
                ln = tr["len"][0] + (tr["len"][1] - tr["len"][0]) * (1 - abs(2 * fr - 1) if tr.get("mid") else fr)
                V, F = claw(p - d * ln * 0.25 + nrm * tr.get("out", 0.0), d, fw, ln, tr["rad"] * (ln / tr["len"][0]) ** 0.5,
                            curl=tr.get("curl", 0.4), nseg=6, segs=4)
                teeth_parts.append((V, F))
                teeth_bone += [head_bone if tr["on"] == "head" else "jaw"] * len(V)
    teeth_ob = None
    if teeth_parts:
        V, F = concat(teeth_parts)
        teeth_ob = new_mesh_obj(P["id"] + "_teeth", V, F, coll)
        shade_smooth(teeth_ob)
        set_point_float(teeth_ob, "ctip", np.zeros(len(V)))

    # ------------------------------------------------------------- chains for weights
    bnames = sk.names
    C.bnames = bnames
    # body chain: order tail tip -> snout
    order = list(reversed(tj)) + fj[1:]
    bone_order = list(reversed(tb)) + fb
    arc = {nm: float(body.arc[np.argmin(np.linalg.norm(body.p - J[nm], axis=1))]) for nm in order}
    brk, wid = [], []
    bw = P.get("break_widths", {})
    for nm in order[1:-1]:
        o, w = bw.get(nm, (0.0, 0.05))
        brk.append(arc[nm] + o)
        wid.append(w)
    chains = [Chain("body", body.p, body.mean_radius(), bone_order, brk, wid)]
    for s, f in (("R", lambda v: v), ("L", mx)):
        Hs, Ks, As, Ps = f(H), f(K), f(A), f(Pb)
        tip3 = f(toe_chain_pts["d3"][0][-1])
        pts = np.array([Hs, Ks, As, Ps, tip3])
        rad = [lp["thigh"][1][0] * 1.1, lp["knee"], lp["ankle"], lp["ball"], toe_chain_pts["d3"][1][-1]]
        ch = Chain("leg" + s, pts, rad, ["thigh" + s, "shin" + s, "meta" + s, "toe" + s],
                   [np.linalg.norm(Ks - Hs), np.linalg.norm(Ks - Hs) + np.linalg.norm(As - Ks),
                    np.linalg.norm(Ks - Hs) + np.linalg.norm(As - Ks) + np.linalg.norm(Ps - As)],
                   [0.05, 0.03, 0.015])
        chains.append(ch)
        for tn, (pts_t, rads) in toe_chain_pts.items():
            if tn == "d3":
                continue
            bone = {"d2": "sickle", "d1": "meta"}.get(tn, "toe") + s
            chains.append(Chain(tn + s, f(pts_t), rads, [bone], [], []))
    C.chains = {c.name: c for c in chains}
    arm_chains = []
    for s, f in (("R", lambda v: v), ("L", mx)):
        pts = np.array([f(sh), f(el), f(wr), f(kn), f(fingers[len(fingers) // 2][-1])])
        r = [ap["hum"][0][0], ap["elbow"], ap["wrist"], ap["hand"][-1][0], A_["fingers"][0]["rad"]]
        l1 = np.linalg.norm(pts[1] - pts[0])
        l2 = l1 + np.linalg.norm(pts[2] - pts[1])
        arm_chains.append(Chain("arm" + s, pts, r, ["hum" + s, "fore" + s, "hand" + s], [l1, l2], [0.02, 0.015]))
    for c in arm_chains:
        C.chains[c.name] = c

    # ------------------------------------------------------------- colours + weights per object
    skin_co = mesh_co(skin_ob)
    leg_names = [c.name for c in chains if c.name != "body"]
    Wskin = compute_weights(skin_co, chains, bnames, k=P.get("partition_k", 7.0))
    C.parts.append((skin_ob, skin_co, Wskin))
    jaw_co = mesh_co(jaw_ob)
    Wj = np.zeros((len(jaw_co), len(bnames)))
    Wj[:, bnames.index("jaw")] = 1
    C.parts.append((jaw_ob, jaw_co, Wj))
    arm_co = mesh_co(arm_ob)
    Wa = compute_weights(arm_co, arm_chains + [chains[0]], bnames, k=9.0, boost={"body": 1.6})
    C.parts.append((arm_ob, arm_co, Wa))
    claw_co = mesh_co(claw_ob)
    Wc = np.zeros((len(claw_co), len(bnames)))
    for b in set(claw_bones):
        Wc[claw_bones == b, bnames.index(b)] = 1
    C.parts.append((claw_ob, claw_co, Wc))
    if teeth_ob:
        tco = mesh_co(teeth_ob)
        Wt = np.zeros((len(tco), len(bnames)))
        tb_arr = np.array(teeth_bone)
        for b in set(teeth_bone):
            Wt[tb_arr == b, bnames.index(b)] = 1
        C.parts.append((teeth_ob, tco, Wt))
    C.skin_ob, C.jaw_ob, C.arm_ob, C.claw_ob, C.teeth_ob = skin_ob, jaw_ob, arm_ob, claw_ob, teeth_ob

    # colour context for the species palette
    ctx = color_context(C, skin_co, Wskin)
    cols, scaly, mouth = P["colors"](C, ctx, "skin")
    set_point_color(skin_ob, "Col", cols)
    set_point_float(skin_ob, "scaly", scaly)
    set_point_float(skin_ob, "mouth", mouth)
    jctx = dict(pos=jaw_co, jaw=jaw)
    cols, scaly, mouth = P["colors"](C, jctx, "jaw")
    set_point_color(jaw_ob, "Col", cols)
    set_point_float(jaw_ob, "scaly", scaly)
    set_point_float(jaw_ob, "mouth", mouth)
    actx = dict(pos=arm_co, W=Wa, bnames=bnames)
    cols, scaly, mouth = P["colors"](C, actx, "arm")
    set_point_color(arm_ob, "Col", cols)
    set_point_float(arm_ob, "scaly", scaly)
    set_point_float(arm_ob, "mouth", mouth)
    for ob, co in ((skin_ob, skin_co), (jaw_ob, jaw_co), (arm_ob, arm_co), (claw_ob, claw_co)):
        rest_attr(ob, co)
    if teeth_ob:
        rest_attr(teeth_ob, mesh_co(teeth_ob))

    # ------------------------------------------------------------- eyes
    E = P["eye"]
    for s, f in (("R", lambda v: v), ("L", mx)):
        V, F, R, c, r = eye_mesh(f(v3(*E["c"])), E["r"], f(v3(*E["dir"])))
        ob = new_mesh_obj(P["id"] + "_eye" + s, V, F, coll)
        shade_smooth(ob)
        M = np.eye(4)
        M[:3, :3] = R * r
        M[:3, 3] = c
        C.rigid.append((ob, head_bone, M))
        C.objs.append(ob)

    # ------------------------------------------------------------- feathers
    C.feather_sets = []
    for fs in P["feathers"](C):
        ob = fs.build(coll)
        if ob is None:
            continue
        co = mesh_co(ob)
        roots = np.array([r for r, _ in fs.roots])
        hosts = [h for _, h in fs.roots]
        Wr = np.zeros((len(roots), len(bnames)))
        groups = {}
        for i, h in enumerate(hosts):
            groups.setdefault(tuple(h), []).append(i)
        for h, idx in groups.items():
            allowed = list(h)
            Wr[idx] = compute_weights(roots[idx], [c for c in C.chains.values()], bnames, k=7.0, allowed=allowed)
        W = Wr[fs.fid_arr]
        C.parts.append((ob, co, W))
        C.feather_sets.append((fs.name, ob))

    # ------------------------------------------------------------- hierarchy
    root = bpy.data.objects.new(P["id"] + "_root", None)
    coll.objects.link(root)
    off = bpy.data.objects.new(P["id"] + "_offset", None)
    coll.objects.link(off)
    off.parent = root
    off.location = (0, C.dy, 0)
    for ob, _, _ in C.parts:
        ob.parent = off
    for ob, _, _ in C.rigid:
        ob.parent = off
    C.root, C.offset = root, off
    C.head_bone = head_bone
    return C


def rest_attr(ob, co):
    me = ob.data
    if "rest" in me.attributes:
        me.attributes.remove(me.attributes["rest"])
    at = me.attributes.new("rest", "FLOAT_VECTOR", "POINT")
    at.data.foreach_set("vector", np.asarray(co, float).ravel())


def color_context(C, X, W):
    """Per-vertex geometric descriptors for palette functions."""
    body = C.body
    ch = C.chains["body"]
    d, a, r = ch.nearest(X)
    i = np.clip(np.searchsorted(body.arc, a), 0, len(body.p) - 1)
    o = X - body.p[i]
    zl_raw = (o * body.u[i]).sum(1)
    xl_raw = (o * body.s[i]).sum(1)
    zt, zb = body.d[i, 5], body.d[i, 6]
    zl = np.where(zl_raw > 0, zl_raw / zt, zl_raw / zb)
    rx = 0.5 * (body.d[i, 3] + body.d[i, 4])
    xl = xl_raw / rx
    bn = C.bnames
    leg_w = sum(W[:, bn.index(b)] for b in bn if b[:-1] in ("thigh", "shin", "meta", "toe", "sickle"))
    shin_w = sum(W[:, bn.index(b)] for b in bn if b[:-1] in ("shin",))
    foot_w = sum(W[:, bn.index(b)] for b in bn if b[:-1] in ("meta", "toe", "sickle"))
    return dict(pos=X, arc=a, arc_frac=a / body.arc[-1], zl=zl, xl=xl, leg=leg_w, shin=shin_w, foot=foot_w,
                W=W, bnames=bn, idx=i)


def pose_creature(C, pose):
    """Skin every part for a pose dict; returns posed coordinates per part (hip space)."""
    M, S = C.sk.solve(pose)
    out = []
    for ob, rest, W in C.parts:
        out.append(skin(rest, W, S, C.bnames))
    rig = []
    for ob, bone, Mr in C.rigid:
        rig.append(S[bone] @ Mr)
    return out, rig, M


def apply_pose(C, posed):
    out, rig, _ = posed
    for (ob, _, _), co in zip(C.parts, out):
        set_mesh_co(ob, co)
    from mathutils import Matrix
    for (ob, _, _), Mw in zip(C.rigid, rig):
        ob.matrix_basis = Matrix(Mw.tolist())
