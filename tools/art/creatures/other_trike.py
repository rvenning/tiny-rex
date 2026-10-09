"""Triceratops - player species 3 and the armoured wild neighbour. 4.2u nose-to-tail, 1.6u tall.
Teal-green hide with golden-yellow patches, cream horns and nails, dark beak, big scalloped frill."""
import math

import numpy as np

import other_core as oc
from other_core import Chain, Cone, Ell, Fn, smoothstep

META = dict(r=0.85, length=4.2, height=1.6)
NOSE = (0.0, 2.0, 0.45)


def srgb(*c):
    c = np.asarray(c, float) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


MATERIALS = {
    "hide": dict(kind="skin", scale=34.0, scale2=17.0, groove=0.22, bump=0.35, bump_dist=0.015, rough=0.55,
                 spec=0.45, jitter=0.08, groove_dark=0.14, ao=0.5, ao_dist=0.25, wrinkle=0.25, wrinkle_scale=9.0,
                 sss=0.06, sss_scale=0.05, coat=0.12, coat_rough=0.35),
    "horn": dict(kind="skin", scale=30.0, groove=0.12, bump=0.25, bump_dist=0.01, rough=0.38, spec=0.5,
                 jitter=0.04, groove_dark=0.05, ao=0.4, ao_dist=0.12, wrinkle=0.8, wrinkle_scale=14.0, coat=0.3, coat_rough=0.2),
    "beak": dict(kind="skin", scale=40.0, groove=0.1, bump=0.2, bump_dist=0.01, rough=0.3, spec=0.5, jitter=0.03,
                 groove_dark=0.05, ao=0.3, ao_dist=0.1, wrinkle=0.6, wrinkle_scale=20.0, coat=0.5, coat_rough=0.1),
    "eye": dict(kind="skin", scale=200.0, bump=0.0, rough=0.1, coat=1.0, coat_rough=0.01, spec=0.8, ao=0.2, ao_dist=0.03),
}

# ---------------------------------------------------------------- skeleton layout (right side x>0)
SH = (0.4, 0.62, 0.88)   # shoulder
EL = (0.46, 0.47, 0.5)  # elbow
WR = (0.47, 0.6, 0.16)   # wrist (front foot bone head)
HP = (0.41, -0.62, 1.08)  # hip
KN = (0.44, -0.4, 0.6)  # knee
AN = (0.44, -0.7, 0.19)  # ankle (hind foot bone head)
HEAD = (0.0, 1.0, 1.0)


def mx(p, s):
    return np.array((p[0] * s, p[1], p[2]), float)


FR_O = np.array([0.0, 1.0, 1.08])
FR_U = np.array([0.0, -0.8, 1.0]) / np.linalg.norm([0.0, -0.8, 1.0])
FR_N = np.array([0.0, 1.0, 0.8]) / np.linalg.norm([0.0, 1.0, 0.8])


def frill_sdf(P):
    """Shield-shaped frill rising up/back from the skull, in model space (rest)."""
    O, u, nrm = FR_O, FR_U, FR_N
    q = P - O
    x = q[:, 0]
    s = q @ u
    w = q @ nrm
    # cupped forward at the sides, rim thickened
    w0 = -0.22 * (x / 0.7) ** 2 + 0.04 * s
    th = np.arctan2(s - 0.3, x)
    scallop = 1 + 0.045 * np.cos(np.abs(th) * 9.0 + 0.4)
    ax, asz = 0.72 * scallop, 0.58 * scallop
    xx, ss = x / ax, (s - 0.3) / asz
    k0 = np.sqrt(xx * xx + ss * ss)
    k1 = np.sqrt((x / ax**2) ** 2 + ((s - 0.3) / asz**2) ** 2)
    d2 = k0 * (k0 - 1) / np.maximum(k1, 1e-9)
    t = 0.035 + 0.025 * smoothstep(0.75, 1.0, k0)
    dz = np.abs(w - w0) - t
    a = np.maximum(d2, dz)
    return np.minimum(a, 0) + np.sqrt(np.maximum(d2, 0) ** 2 + np.maximum(dz, 0) ** 2)


def frill_rim_points(n=15):
    O, u, nrm = FR_O, FR_U, FR_N
    xa = np.array([1.0, 0, 0])
    out = []
    for th in np.linspace(math.radians(-30), math.radians(210), n):
        x, s = 0.74 * math.cos(th), 0.3 + 0.6 * math.sin(th)
        x2, s2 = 0.86 * math.cos(th), 0.3 + 0.72 * math.sin(th)
        w0 = -0.22 * (x / 0.7) ** 2 + 0.04 * s
        w1 = -0.22 * (x2 / 0.7) ** 2 + 0.04 * s2
        out.append((O + x * xa + s * u + w0 * nrm, O + x2 * xa + s2 * u + w1 * nrm))
    return out


def build():
    m = oc.Model("trike")
    sk = m.skel
    sk.add("root", None, (0, -0.15, 1.05))
    sk.add("chest", "root", (0, 0.35, 1.0))
    sk.add("neck", "chest", (0, 0.72, 0.98))
    sk.add("head", "neck", HEAD)
    sk.add("tail1", "root", (0, -0.85, 1.1))
    sk.add("tail2", "tail1", (0, -1.3, 0.92))
    sk.add("tail3", "tail2", (0, -1.7, 0.68))
    for side, s in (("R", 1), ("L", -1)):
        sk.add("ua" + side, "chest", mx(SH, s))
        sk.add("fa" + side, "ua" + side, mx(EL, s))
        sk.add("ff" + side, "fa" + side, mx(WR, s))
        sk.add("th" + side, "root", mx(HP, s))
        sk.add("sh" + side, "th" + side, mx(KN, s))
        sk.add("hf" + side, "sh" + side, mx(AN, s))

    vb = 0.016

    def body_detail(P, D):
        # dorsal osteoderm bumps + neck folds + knee/elbow creases
        dorsal = smoothstep(0.95, 1.3, P[:, 2]) * (P[:, 1] < 0.8)
        tail_top = smoothstep(0.55, 0.9, P[:, 2]) * (P[:, 1] < -0.9)
        f1, cid = oc.cell_noise(P, 9.0, seed=5)
        bumps = np.clip(1 - f1 / 0.55, 0, 1) ** 2 * (0.6 + 0.4 * cid)
        out = -0.016 * bumps * np.maximum(dorsal, tail_top)
        neck = np.exp(-((P[:, 1] - 0.85) / 0.18) ** 2) * (P[:, 2] < 1.05)
        out += 0.006 * neck * np.maximum(0, np.sin(P[:, 1] * 2 * math.pi / 0.07))
        out += 0.004 * oc.fbm(P, 6.0, 2, seed=9)
        return out

    body = m.group("body", "hide", vb, detail=body_detail, smooth=2)
    body.falloff = 0.07
    body.add(
        Ell((0, -0.22, 1.08), (0.56, 0.95, 0.46), "root", tag="torso"),
        Ell((0, -0.68, 1.14), (0.44, 0.45, 0.38), "root", k=0.15, tag="torso"),
        Ell((0, -0.05, 0.86), (0.47, 0.72, 0.28), "root", k=0.2, tag="torso"),
        Ell((0, 0.4, 0.98), (0.5, 0.48, 0.42), "chest", k=0.22, tag="torso"),
        Ell((0, 0.78, 0.96), (0.36, 0.3, 0.33), "neck", k=0.16, tag="neck"),
        # skull, deep snout, cheeks
        Ell((0, 1.17, 0.9), (0.3, 0.4, 0.34), "head", rot=(-18, 0, 0), k=0.1, tag="head"),
        Cone((0, 1.33, 0.82), (0, 1.7, 0.62), 0.25, 0.14, "head", k=0.1, tag="snout"),
        Ell((0.23, 1.1, 0.77), (0.14, 0.21, 0.18), "head", k=0.08, tag="cheek"),
        Ell((-0.23, 1.1, 0.77), (0.14, 0.21, 0.18), "head", k=0.08, tag="cheek"),
        Ell((0.16, 1.24, 1.06), (0.11, 0.13, 0.1), "head", k=0.07, tag="brow"),
        Ell((-0.16, 1.24, 1.06), (0.11, 0.13, 0.1), "head", k=0.07, tag="brow"),
        # tail: thick root, curving down, shorter
        Cone((0, -0.8, 1.12), (0, -1.3, 0.92), 0.36, 0.23, "tail1", k=0.12, tag="tail"),
        Cone((0, -1.3, 0.92), (0, -1.7, 0.68), 0.23, 0.12, "tail2", k=0.05, tag="tail"),
        Chain([(0, -1.7, 0.68), (0, -1.98, 0.5), (0, -2.2, 0.4)], [0.12, 0.06, 0.02], "tail3", k=0.04, tag="tail"),
    )
    # mouth line (subtle smile) along both sides of the snout
    for s in (1, -1):
        body.add(Chain([(0.2 * s, 1.34, 0.64), (0.16 * s, 1.56, 0.56), (0.1 * s, 1.68, 0.52)], [0.013, 0.013, 0.01], "", n=3, k=0.02, sub=True))
    for side, s in (("R", 1), ("L", -1)):
        sh, el, wr = mx(SH, s), mx(EL, s), mx(WR, s)
        hp, kn, an = mx(HP, s), mx(KN, s), mx(AN, s)
        body.add(
            Ell(mx((0.37, 0.58, 0.84), s), (0.22, 0.28, 0.32), "ua" + side, k=0.12, tag="leg"),
            Cone(sh, el, 0.2, 0.165, "ua" + side, k=0.06, tag="leg"),
            Cone(el, wr, 0.16, 0.13, "fa" + side, k=0.05, tag="leg"),
            Cone(wr, wr + np.array([0, 0.04, -0.07]), 0.125, 0.15, "ff" + side, k=0.04, tag="foot"),
            Ell(wr + np.array([0, 0.05, -0.07]), (0.155, 0.17, 0.085), "ff" + side, k=0.04, tag="foot"),
            Ell(mx((0.39, -0.56, 0.95), s), (0.26, 0.43, 0.46), "th" + side, k=0.14, tag="leg"),
            Cone(kn, an, 0.2, 0.15, "sh" + side, k=0.07, tag="leg"),
            Cone(an, an + np.array([0, 0.06, -0.1]), 0.145, 0.165, "hf" + side, k=0.04, tag="foot"),
            Ell(an + np.array([0, 0.07, -0.1]), (0.165, 0.19, 0.085), "hf" + side, k=0.04, tag="foot"),
        )
        # a flat sole so the feet stand on the ground
    body.add(oc.Plane((0, 0, -1), -0.004, k=0.01))

    frill = m.group("frill", "hide", 0.012, smooth=2, rigid="head")
    frill.add(Fn(frill_sdf, (-0.95, 0.2, 0.75), (0.95, 1.45, 1.9), "head", tag="frill"))
    # ridge where frill meets the skull
    frill.add(Ell((0, 1.03, 1.08), (0.22, 0.1, 0.12), "head", k=0.06, tag="frillbase"))
    for a, b in frill_rim_points(13):
        frill.add(Cone(a, b, 0.055, 0.012, "head", k=0.03, tag="epo"))

    horns = m.group("horns", "horn", 0.01, smooth=2, rigid="head")
    for s in (1, -1):
        horns.add(Chain([(0.16 * s, 1.24, 1.09), (0.2 * s, 1.42, 1.22), (0.23 * s, 1.7, 1.33), (0.22 * s, 1.97, 1.42)],
                        [0.08, 0.062, 0.036, 0.008], "head", n=6, tag="horn"))
        # small jugal horn on the cheek
        horns.add(Cone((0.32 * s, 1.08, 0.72), (0.42 * s, 1.06, 0.6), 0.055, 0.012, "head", tag="jugal"))
    horns.add(Chain([(0, 1.6, 0.8), (0, 1.67, 0.9), (0, 1.69, 0.98)], [0.07, 0.042, 0.01], "head", n=4, tag="nose"))

    beak = m.group("beak", "beak", 0.008, smooth=2, rigid="head")
    beak.add(
        Chain([(0, 1.64, 0.7), (0, 1.8, 0.64), (0, 1.9, 0.54), (0, 1.9, 0.44)], [0.13, 0.105, 0.06, 0.018], "head", n=5, tag="beak"),
        Chain([(0, 1.62, 0.52), (0, 1.76, 0.48), (0, 1.83, 0.45)], [0.1, 0.07, 0.025], "head", k=0.03, n=4, tag="beak"),
    )

    eyes = m.group("eyes", "eye", 0.006, smooth=1, rigid="head")
    for s in (1, -1):
        eyes.add(Ell((0.258 * s, 1.2, 0.96), (0.06, 0.078, 0.07), "head", rot=(0, 0, 18 * s), tag="eye"))
    lids = m.group("lids", "hide", 0.008, smooth=2, rigid="head")
    for s in (1, -1):
        # heavy upper lid / brow shelf gives the eye its expression
        lids.add(Ell((0.245 * s, 1.195, 1.02), (0.07, 0.095, 0.038), "head", rot=(-12, 0, 18 * s), tag="lid"))

    nails = m.group("nails", "horn", 0.006, smooth=1)
    nails.falloff = 0.03
    for side, s in (("R", 1), ("L", -1)):
        for foot, base, n_toes in (("ff" + side, mx(WR, s) + np.array([0, 0.05, -0.07]), 4), ("hf" + side, mx(AN, s) + np.array([0, 0.07, -0.1]), 3)):
            r = 0.16 if n_toes == 4 else 0.18
            for i in range(n_toes):
                a = math.radians(-50 + 100 * i / (n_toes - 1))
                c = base + np.array([r * math.sin(a), r * math.cos(a) * 0.95, -0.02])
                nails.add(Ell(c, (0.05, 0.045, 0.045), foot, rot=(0, 0, -math.degrees(a)), tag="nail"))
    nails.add(oc.Plane((0, 0, -1), -0.002, k=0.004))
    return m


# ---------------------------------------------------------------- colour
def colorize(g, V, tags):
    n = len(V)
    A = np.zeros((n, 3))
    A[:, 2] = 1.0
    if g.material == "eye":
        # amber iris facing outward, black pupil, glossy
        C = np.zeros((n, 3))
        for s in (1, -1):
            c = np.array([0.258 * s, 1.2, 0.96])
            d = V - c
            side = (np.sign(V[:, 0]) == s)
            dirv = np.array([s * math.cos(math.radians(18)), math.sin(math.radians(18)), 0.05])
            dirv /= np.linalg.norm(dirv)
            cosang = (d @ dirv) / np.maximum(np.linalg.norm(d, axis=1), 1e-6)
            iris = smoothstep(0.35, 0.5, cosang)
            pupil = smoothstep(0.86, 0.9, cosang)
            col = srgb(30, 20, 14) * (1 - iris[:, None]) + srgb(236, 150, 24) * iris[:, None]
            col = col * (1 - pupil[:, None]) + srgb(8, 6, 5) * pupil[:, None]
            C[side] = col[side]
        A[:, 2] = 0
        return C, A
    if g.material == "horn":
        cream = srgb(236, 222, 184)
        base = srgb(176, 150, 104)
        if g.name == "nails":
            t = smoothstep(0.0, 0.07, V[:, 2])[:, None]
            C = base * (1 - t) + cream * t
            return C, A
        # darker at the root, ivory at the tip
        tg = np.array(tags)
        C = np.zeros((n, 3))
        for name, root in (("horn", None), ("jugal", None), ("nose", None)):
            pass
        root_d = np.minimum(np.linalg.norm(V - np.array([0.16, 1.24, 1.09]), axis=1),
                            np.linalg.norm(V - np.array([-0.16, 1.24, 1.09]), axis=1))
        root_d = np.minimum(root_d, np.linalg.norm(V - np.array([0, 1.6, 0.8]), axis=1) * 2.5)
        root_d = np.minimum(root_d, np.minimum(np.linalg.norm(V - np.array([0.32, 1.08, 0.72]), axis=1),
                                               np.linalg.norm(V - np.array([-0.32, 1.08, 0.72]), axis=1)) * 3)
        t = smoothstep(0.03, 0.35, root_d)[:, None]
        C = base * (1 - t) + cream * t
        C = C * (1 + 0.05 * oc.fbm(V, 30, 2, seed=4)[:, None])
        return C, A
    if g.material == "beak":
        t = smoothstep(0.42, 0.68, V[:, 2])[:, None]
        C = srgb(40, 42, 46) * (1 - t) + srgb(78, 80, 84) * t
        A[:, 2] = 0.4
        return C, A

    N = oc.sdf_normals(g, V)
    teal = srgb(34, 132, 114)
    teal_d = srgb(18, 88, 92)
    teal_l = srgb(70, 160, 112)
    cream = srgb(226, 208, 152)
    gold = srgb(232, 176, 40)
    gold_d = srgb(196, 132, 28)
    tg = np.array(tags)
    up = N[:, 2]
    # base: lighter yellow-green toward the sunlit top, blue-teal toward the flanks
    t = smoothstep(-0.4, 0.8, up)[:, None]
    C = teal_d * (1 - t) + teal * t
    mott = oc.fbm(V, 3.0, 3, seed=21)
    C = C * (1 - 0.25 * np.clip(mott, -1, 1)[:, None] * 0.5)
    C = C + (teal_l - teal) * np.clip(mott, 0, 1)[:, None] * 0.6
    # cream belly / throat / underside of tail and inner legs
    belly = smoothstep(-0.15, -0.6, up)
    lowbody = (np.isin(tg, ["torso", "neck"]) & (V[:, 2] < 0.95))
    belly = belly * np.where(lowbody | np.isin(tg, ["head", "snout", "cheek", "tail"]), 1.0, 0.5)
    jaw = np.isin(tg, ["snout", "cheek", "head"]) & (V[:, 2] < 0.72)
    belly = np.maximum(belly, jaw * smoothstep(0.75, 0.55, V[:, 2]))
    C = C * (1 - belly[:, None]) + cream * belly[:, None]
    # golden patches: clusters of scales on the back, flanks, tail and head
    f1, cid = oc.cell_noise(V, 7.0, seed=31)
    dens = 0.45 + 0.55 * oc.fbm(V, 1.4, 2, seed=41)
    dorsal = smoothstep(0.0, 0.7, up) * (1 - belly)
    spine = smoothstep(0.45, 0.05, np.abs(V[:, 0]))
    pmask = (cid < (0.75 * dens * dorsal * (0.45 + 0.55 * spine))) * smoothstep(0.55, 0.32, f1)
    # small speckles everywhere on the upper body
    f2, cid2 = oc.cell_noise(V, 26.0, seed=51)
    speck = (cid2 < 0.16 * dorsal) * smoothstep(0.45, 0.25, f2)
    gm = np.clip(np.maximum(pmask, 0.8 * speck), 0, 1)
    gcol = gold * (1 - cid[:, None] * 0.5) + gold_d * cid[:, None] * 0.5
    C = C * (1 - gm[:, None]) + gcol * gm[:, None]
    # darker toes area and feet
    foot = np.isin(tg, ["foot"])
    C[foot] *= 0.75
    # roughness: belly slightly smoother; big scales on the back
    A[:, 0] = 0.1 * belly
    A[:, 1] = smoothstep(0.1, 0.8, up) * (1 - belly)
    if g.name == "frill":
        C = colorize_frill(V, N, tg)
        A[:, 1] = 0.5
    if g.name == "lids":
        C[:] = teal_d * 0.8
    return np.clip(C, 0, 1), A


def colorize_frill(V, N, tg):
    teal = srgb(30, 128, 112)
    teal_d = srgb(16, 82, 88)
    gold = srgb(236, 184, 46)
    cream = srgb(214, 196, 138)
    O, u = FR_O, FR_U
    q = V - O
    x, s = q[:, 0], q @ u
    r = np.sqrt((x / 0.72) ** 2 + ((s - 0.3) / 0.58) ** 2)
    front = N @ FR_N
    C = teal_d[None, :] * np.ones((len(V), 1))
    t = smoothstep(0.1, 0.9, r)[:, None]
    C = teal * (1 - t) + teal_d * t
    # golden rim band and radial streaks on the face of the frill
    th = np.arctan2(s - 0.3, x)
    streak = smoothstep(0.8, 0.98, np.cos(th * 8.0)) * smoothstep(0.55, 0.8, r) * 0.6
    rim = smoothstep(0.86, 0.97, r)
    f1, cid = oc.cell_noise(V, 16.0, seed=61)
    dots = (cid < 0.3) * smoothstep(0.42, 0.22, f1) * smoothstep(0.3, 0.6, r)
    gm = np.clip(np.maximum.reduce([rim, 0.75 * streak, dots]), 0, 1)
    C = C * (1 - gm[:, None]) + gold * gm[:, None]
    epo = tg == "epo"
    C[epo] = gold
    base = tg == "frillbase"
    C[base] = teal
    # back side of the frill a little darker / duller
    back = smoothstep(0.1, -0.4, front)[:, None]
    C = C * (1 - 0.25 * back)
    return C


# ---------------------------------------------------------------- animation
FOOT_F = {s: mx(WR, k) for s, k in (("R", 1), ("L", -1))}
FOOT_H = {s: mx(AN, k) for s, k in (("R", 1), ("L", -1))}


def stand(p, root_t=(0, 0, 0), root_r=(0, 0, 0), feet=None, lifts=None):
    """Plant all four feet (IK) with optional per-foot offsets {name: (dy, dz, pitch)}."""
    feet = feet or {}
    p["root"] = {"t": root_t, "r": root_r}
    ik = {}
    for side in "RL":
        for leg, rest, thigh, shin, foot, knee in (("f", FOOT_F[side], "ua", "fa", "ff", -1), ("h", FOOT_H[side], "th", "sh", "hf", 1)):
            dy, dz, pitch = feet.get(leg + side, (0, 0, 0))
            tgt = rest + np.array([0, dy, dz])
            ik[thigh + side] = oc.IK(shin + side, foot + side, tgt, knee=knee, flat=True, foot_pitch=pitch)
    p["_ik"] = ik
    return p


def idle(f):
    w = 2 * math.pi * f / 6
    p = {}
    br = math.sin(w)
    stand(p, root_t=(0, 0, 0.012 * br), root_r=(0.6 * br, 0, 0))
    p["chest"] = {"r": (0.8 * br, 0, 0)}
    p["neck"] = {"r": (-2 + 2.5 * math.sin(w - 0.6), 0, 4 * math.sin(w * 0.5 + 0.3) if False else 3 * math.sin(w))}
    p["head"] = {"r": (2 * math.sin(w - 1.2), 0, 2 * math.sin(w))}
    p["tail1"] = {"r": (1.5 * br, 0, 4 * math.sin(w + 0.5))}
    p["tail2"] = {"r": (1.0 * br, 0, 6 * math.sin(w))}
    p["tail3"] = {"r": (0, 0, 8 * math.sin(w - 0.6))}
    return p


def gait(t, stride, lift, phases):
    """Foot offsets for a cycle phase t. stance = first 60%, swing = last 40%."""
    out = {}
    for name, off in phases.items():
        ph = (t + off) % 1.0
        duty = 0.6
        if ph < duty:
            u = ph / duty
            dy = stride * (0.5 - u)
            dz = 0.0
            pitch = 0.0
        else:
            u = (ph - duty) / (1 - duty)
            dy = stride * (-0.5 + u)
            dz = lift * math.sin(math.pi * u)
            pitch = -25 * math.sin(math.pi * u)
        out[name] = (dy, dz, pitch)
    return out


TROT = {"fL": 0.0, "hR": 0.0, "fR": 0.5, "hL": 0.5}


def run(f):
    t = f / 8
    w = 2 * math.pi * t
    p = {}
    feet = gait(t, 0.62, 0.16, {k: v + 0.05 * (k[0] == "h") for k, v in TROT.items()})
    bob = 0.035 * math.cos(2 * w)
    stand(p, root_t=(0, 0, -0.02 + bob), root_r=(1.5 * math.sin(2 * w), 2.5 * math.sin(w), 2 * math.sin(w)), feet=feet)
    p["chest"] = {"r": (-1.2 * math.sin(2 * w), -1.5 * math.sin(w), 0)}
    p["neck"] = {"r": (-3 + 3 * math.sin(2 * w + 0.8), 0, -2 * math.sin(w))}
    p["head"] = {"r": (3 * math.sin(2 * w + 1.4), 0, 0)}
    p["tail1"] = {"r": (2 * math.sin(2 * w), 0, -6 * math.sin(w))}
    p["tail2"] = {"r": (2 * math.sin(2 * w - 0.6), 0, -8 * math.sin(w - 0.6))}
    p["tail3"] = {"r": (0, 0, -10 * math.sin(w - 1.2))}
    return p


def _curve(keys, f):
    """Piecewise-linear lookup in a list of per-frame values (allows held frames)."""
    return keys[min(f, len(keys) - 1)]


def bite(f):
    # horn strike: dip (0-1), toss up and to the side (2-3), settle (4-5)
    neck = [-14, -22, 8, 22, 10, 2][f]
    head = [-10, -16, 10, 24, 12, 3][f]
    yaw = [0, -4, 10, 16, 8, 2][f]
    fwd = [0.0, 0.05, 0.16, 0.12, 0.05, 0.01][f]
    dip = [-0.03, -0.06, 0.01, 0.03, 0.0, 0.0][f]
    p = {}
    stand(p, root_t=(0, fwd, dip), root_r=([-2, -4, 2, 4, 1, 0][f], [0, 0, -3, -5, -2, 0][f], 0),
          feet={"fR": (-fwd, 0, 0), "fL": (-fwd, 0, 0), "hR": (-fwd, 0, 0), "hL": (-fwd, 0, 0)})
    p["chest"] = {"r": ([-3, -5, 3, 6, 2, 0][f], 0, yaw * 0.3)}
    p["neck"] = {"r": (neck, 0, yaw * 0.5)}
    p["head"] = {"r": (head, -yaw * 0.6, yaw * 0.5)}
    p["tail1"] = {"r": ([2, 4, -3, -4, 0, 1][f], 0, -yaw * 0.4)}
    p["tail2"] = {"r": (0, 0, -yaw * 0.6)}
    p["tail3"] = {"r": (0, 0, -yaw * 0.8)}
    return p


def dodge(f):
    # quick side-hop: crouch, airborne lean, land, recover
    side = [0.0, 0.12, 0.2, 0.1][f]
    up = [-0.07, 0.1, -0.04, 0.0][f]
    roll = [0, -10, 6, 2][f]
    p = {}
    lift = [0, 0.12, 0, 0][f]
    stand(p, root_t=(side, -0.04 * (f in (1, 2)), up), root_r=([-3, 4, -2, 0][f], roll, [0, 6, 3, 1][f]),
          feet={k: (0, lift, -10 if lift else 0) for k in ("fR", "fL", "hR", "hL")})
    p["neck"] = {"r": ([-6, 8, -4, 0][f], 0, [0, -8, -4, 0][f])}
    p["head"] = {"r": ([-4, 6, -2, 0][f], 0, 0)}
    p["tail1"] = {"r": ([0, 8, -4, 0][f], 0, [0, 10, 6, 2][f])}
    p["tail2"] = {"r": (0, 0, [0, 12, 8, 2][f])}
    p["tail3"] = {"r": (0, 0, [0, 14, 10, 3][f])}
    return p


def hurt(f):
    a = [1.0, 0.6, 0.25][f]
    p = {}
    stand(p, root_t=(0, -0.08 * a, 0.02 * a), root_r=(5 * a, 6 * a, -4 * a),
          feet={"fR": (0.05 * a, 0.14 * a, -15 * a)})
    p["chest"] = {"r": (4 * a, 0, 0)}
    p["neck"] = {"r": (14 * a, 0, 10 * a)}
    p["head"] = {"r": (12 * a, 8 * a, 8 * a)}
    p["tail1"] = {"r": (8 * a, 0, -6 * a)}
    p["tail2"] = {"r": (6 * a, 0, -8 * a)}
    p["tail3"] = {"r": (4 * a, 0, -10 * a)}
    return p


def skill(f):
    # committed charge: low head, horns forward, driving gallop
    t = f / 6
    w = 2 * math.pi * t
    p = {}
    feet = gait(t, 0.8, 0.2, {"fL": 0.0, "fR": 0.12, "hL": 0.5, "hR": 0.62})
    stand(p, root_t=(0, 0.04, -0.06 + 0.04 * math.cos(2 * w)), root_r=(-5 + 2 * math.sin(w), 1.5 * math.sin(w), 0), feet=feet)
    p["chest"] = {"r": (-5 + 2 * math.sin(w + 0.5), 0, 0)}
    p["neck"] = {"r": (-16 + 2 * math.sin(w + 1), 0, 0)}
    p["head"] = {"r": (-14 + 2 * math.sin(w + 1.5), 0, 0)}
    p["tail1"] = {"r": (6 + 3 * math.sin(w), 0, -3 * math.sin(w))}
    p["tail2"] = {"r": (4, 0, -5 * math.sin(w - 0.6))}
    p["tail3"] = {"r": (2, 0, -6 * math.sin(w - 1.2))}
    return p


def windup(f):
    # braced: haunches down, head low, front-right foot paws the ground (lift, scrape back)
    paw = [(0.08, 0.16, -20), (0.0, 0.08, -10), (-0.12, 0.0, 0), (0.06, 0.18, -25)][f]
    p = {}
    stand(p, root_t=(0, -0.08, -0.07), root_r=(-6, 0, 0),
          feet={"fR": paw, "fL": (0.08, 0, 0), "hR": (0.08, 0, 0), "hL": (0.08, 0, 0)})
    p["chest"] = {"r": (-5, 0, 0)}
    p["neck"] = {"r": (-18 + [0, 1, 2, 0][f], 0, [-3, 0, 3, 0][f])}
    p["head"] = {"r": (-16 + [0, -2, 0, 2][f], [0, 2, 0, -2][f], 0)}
    p["tail1"] = {"r": (8, 0, [4, 0, -4, 0][f])}
    p["tail2"] = {"r": (6, 0, [6, 2, -6, -2][f])}
    p["tail3"] = {"r": (4, 0, [8, 4, -8, -4][f])}
    return p


def strike(f):
    # explosive lunge from the brace: drive forward head-low, then toss
    fwd = [0.0, 0.22, 0.38, 0.3, 0.12][f]
    neck = [-18, -20, -6, 16, 6][f]
    head = [-16, -18, -4, 18, 6][f]
    p = {}
    stand(p, root_t=(0, fwd - 0.08, [-0.07, -0.04, 0.03, 0.05, 0.0][f]), root_r=([-6, -8, -2, 4, 0][f], 0, 0),
          feet={"fR": (0.2 - fwd, [0.1, 0.12, 0, 0, 0][f], 0), "fL": (0.08 - fwd + 0.2, 0, 0),
                "hR": (0.08 - fwd, 0, 0), "hL": (0.08 - fwd, [0, 0.1, 0.05, 0, 0][f], 0)})
    p["chest"] = {"r": ([-5, -6, 0, 4, 0][f], 0, 0)}
    p["neck"] = {"r": (neck, 0, 0)}
    p["head"] = {"r": (head, 0, 0)}
    p["tail1"] = {"r": ([8, 12, 4, -4, 0][f], 0, 0)}
    p["tail2"] = {"r": ([6, 10, 6, -2, 0][f], 0, 0)}
    p["tail3"] = {"r": ([4, 8, 8, 0, 0][f], 0, 0)}
    return p


POSES = {
    "idle": dict(frames=6, fps=6, loop=True, fn=idle),
    "run": dict(frames=8, fps=12, loop=True, fn=run),
    "bite": dict(frames=6, fps=18, loop=False, fn=bite),
    "dodge": dict(frames=4, fps=16, loop=False, fn=dodge),
    "hurt": dict(frames=3, fps=12, loop=False, fn=hurt),
    "skill": dict(frames=6, fps=12, loop=True, fn=skill),
    "windup": dict(frames=4, fps=10, loop=True, fn=windup),
    "strike": dict(frames=5, fps=20, loop=False, fn=strike),
}
