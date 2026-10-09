"""Beetle - the first prey. Glossy chestnut rhinoceros beetle, 0.55u nose-to-tail."""
import math

import numpy as np

import other_core as oc
from other_core import Chain, Cone, Ell, Fn, Plane

META = dict(r=0.18, length=0.55, height=0.25)
NOSE = (0.0, 0.28, 0.2)


def srgb(*c):
    c = np.asarray(c, float) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


MATERIALS = {
    "chitin": dict(kind="skin", scale=220.0, scale2=120.0, groove=0.15, bump=0.06, bump_dist=0.002, rough=0.45,
                   coat=0.8, coat_rough=0.03, spec=0.25, coat_tint=(1.0, 0.72, 0.5), jitter=0.03, groove_dark=0.05, ao=0.55, ao_dist=0.04,
                   wrinkle=0.0, wrinkle_scale=60.0),
    "leg": dict(kind="skin", scale=200.0, groove=0.2, bump=0.1, bump_dist=0.003, rough=0.4, coat=0.7,
                coat_rough=0.12, spec=0.5, jitter=0.04, ao=0.4, ao_dist=0.03, wrinkle=0.0),
    "eye": dict(kind="skin", scale=400.0, bump=0.0, rough=0.12, coat=1.0, coat_rough=0.02, spec=0.8, ao=0.2, ao_dist=0.02),
}

LEGS = {
    # name: coxa, knee, foot, toe   (right side, x > 0; left mirrored)
    "1": ((0.055, 0.115, 0.06), (0.125, 0.16, 0.1), (0.16, 0.215, 0.0), (0.168, 0.252, 0.0)),
    "2": ((0.07, 0.01, 0.06), (0.15, 0.03, 0.105), (0.198, 0.012, 0.0), (0.228, -0.004, 0.0)),
    "3": ((0.075, -0.05, 0.06), (0.15, -0.1, 0.105), (0.182, -0.185, 0.0), (0.196, -0.228, 0.0)),
}


def mirror(p, s):
    return (p[0] * s, p[1], p[2])


def build():
    m = oc.Model("beetle")
    sk = m.skel
    sk.add("root", None, (0, 0, 0.08))
    sk.add("head", "root", (0, 0.15, 0.09))
    for side, s in (("R", 1), ("L", -1)):
        sk.add("ant" + side, "head", mirror((0.03, 0.205, 0.078), s))
        for n, (cx, kn, ft, toe) in LEGS.items():
            sk.add(f"cox{side}{n}", "root", mirror(cx, s))
            sk.add(f"tib{side}{n}", f"cox{side}{n}", mirror(kn, s))

    vb = 0.0035

    def body_detail(P, D):
        # elytral striae (longitudinal grooves) + a few dimples on the pronotum
        on_ely = (P[:, 1] < 0.035) & (P[:, 2] > 0.08)
        st = 0.0006 * (0.5 + 0.5 * np.cos(np.abs(P[:, 0]) * 2 * math.pi / 0.03)) ** 4
        return np.where(on_ely, st, 0.0)

    body = m.group("body", "chitin", vb, detail=body_detail, smooth=2)
    body.add(
        # elytra dome, slightly wider behind the shoulders
        Ell((0, -0.07, 0.098), (0.124, 0.18, 0.096), "root", k=0.0, tag="ely"),
        Ell((0, -0.02, 0.09), (0.122, 0.09, 0.08), "root", k=0.02, tag="ely"),
        # pronotum (shield) - a separate rounded plate with a crease to the elytra
        Ell((0, 0.095, 0.105), (0.102, 0.072, 0.074), "root", rot=(-8, 0, 0), k=0.006, tag="pro"),
        # thoracic horn curving forward over the head
        Chain([(0, 0.11, 0.16), (0, 0.155, 0.19), (0, 0.205, 0.195), (0, 0.235, 0.18)],
              [0.026, 0.016, 0.009, 0.004], "root", k=0.02, tag="horn"),
        # underside (abdomen) fill so the legs root into something
        Ell((0, 0.0, 0.055), (0.085, 0.17, 0.035), "root", k=0.02, tag="under"),
        Plane((0, 0, -1), -0.028, k=0.006),
    )
    # elytral suture (seam) and the pronotum/elytra border
    body.add(
        Fn(lambda P: np.maximum(np.abs(P[:, 0]) - 0.0015, -(P[:, 2] - 0.12)), (-0.01, -0.26, 0.11), (0.01, 0.03, 0.2), "", k=0.004, sub=True),
    )

    head = m.group("head", "chitin", vb, smooth=2, rigid="head")
    head.add(
        Ell((0, 0.175, 0.08), (0.058, 0.05, 0.042), "head", rot=(15, 0, 0), tag="head"),
        Ell((0, 0.205, 0.072), (0.04, 0.03, 0.026), "head", k=0.01, tag="head"),
        Chain([(0, 0.2, 0.085), (0, 0.245, 0.108), (0, 0.282, 0.15), (0, 0.293, 0.2), (0, 0.283, 0.235)],
              [0.024, 0.019, 0.013, 0.008, 0.004], "head", k=0.012, tag="horn"),
        # little forked tip on the head horn
        Cone((0, 0.288, 0.215), (0.012, 0.296, 0.232), 0.005, 0.002, "head", k=0.003, tag="horn"),
        Cone((0, 0.288, 0.215), (-0.012, 0.296, 0.232), 0.005, 0.002, "head", k=0.003, tag="horn"),
        # mandibles
        Chain([(0.02, 0.22, 0.06), (0.028, 0.24, 0.055), (0.012, 0.252, 0.05)], [0.007, 0.005, 0.002], "head", k=0.004, tag="mand"),
        Chain([(-0.02, 0.22, 0.06), (-0.028, 0.24, 0.055), (-0.012, 0.252, 0.05)], [0.007, 0.005, 0.002], "head", k=0.004, tag="mand"),
    )
    eyes = m.group("eyes", "eye", 0.0025, smooth=1, rigid="head")
    eyes.add(Ell((0.047, 0.19, 0.085), (0.013, 0.014, 0.013), "head", tag="eye"),
             Ell((-0.047, 0.19, 0.085), (0.013, 0.014, 0.013), "head", tag="eye"))

    for side, s in (("R", 1), ("L", -1)):
        ant = m.group("ant" + side, "leg", 0.0025, smooth=1, rigid="ant" + side)
        ant.add(
            Chain([mirror((0.03, 0.205, 0.078), s), mirror((0.055, 0.235, 0.09), s), mirror((0.068, 0.258, 0.088), s)],
                  [0.006, 0.005, 0.0045], "ant" + side, n=4, tag="ant"),
            Chain([mirror((0.068, 0.258, 0.088), s), mirror((0.082, 0.272, 0.094), s)], [0.008, 0.013], "ant" + side, n=1, k=0.004, tag="club"),
        )
        for n, (cx, kn, ft, toe) in LEGS.items():
            cx, kn, ft, toe = (np.array(mirror(p, s)) for p in (cx, kn, ft, toe))
            fem = m.group(f"fem{side}{n}", "leg", 0.003, smooth=1, rigid=f"cox{side}{n}")
            fem.add(Chain([cx, (cx + kn) / 2 + np.array([0, 0, 0.012]), kn], [0.02, 0.025, 0.018], f"cox{side}{n}", n=4, tag="leg"))
            tib = m.group(f"tib{side}{n}", "leg", 0.003, smooth=1, rigid=f"tib{side}{n}")
            mid = kn + (ft - kn) * 0.55
            tib.add(
                Chain([kn, mid + np.array([0.0, 0.0, 0.004]), ft + np.array([0, 0, 0.012])], [0.017, 0.018, 0.013], f"tib{side}{n}", n=4, tag="leg"),
                # tibial teeth (digging spurs) on the outer edge
                Cone(mid, mid + np.array([0.018 * s, 0.006, 0.01]), 0.006, 0.0015, f"tib{side}{n}", k=0.003, tag="leg"),
                Cone(ft + np.array([0, 0, 0.012]), ft + np.array([0.02 * s, 0.004, 0.022]), 0.006, 0.0015, f"tib{side}{n}", k=0.003, tag="leg"),
                # tarsus (segmented) + claw
                Chain([ft + np.array([0, 0, 0.012]), ft + (toe - ft) * 0.5 + np.array([0, 0, 0.007]), toe + np.array([0, 0, 0.006])],
                      [0.0085, 0.007, 0.006], f"tib{side}{n}", n=3, tag="tars"),
                Ell(ft + (toe - ft) * 0.33 + np.array([0, 0, 0.009]), (0.008, 0.008, 0.007), f"tib{side}{n}", k=0.002, tag="tars"),
                Ell(ft + (toe - ft) * 0.66 + np.array([0, 0, 0.007]), (0.007, 0.007, 0.006), f"tib{side}{n}", k=0.002, tag="tars"),
                Cone(toe + np.array([0, 0, 0.006]), toe + (toe - ft) * 0.25 + np.array([0, 0, -0.004]), 0.004, 0.0012, f"tib{side}{n}", k=0.002, tag="claw"),
            )
    return m


def colorize(g, V, tags):
    n = len(V)
    C = np.zeros((n, 3))
    A = np.zeros((n, 3))  # x: roughness add, y: big-scale mask, z: bump mask
    A[:, 2] = 1.0
    noise = oc.fbm(V, 40, 3, seed=11)
    if g.material == "eye":
        C[:] = srgb(14, 10, 8)
        A[:, 2] = 0.0
        return C, A
    if g.name.startswith(("fem", "tib", "ant")):
        base = srgb(44, 16, 8)
        dark = srgb(18, 8, 5)
        t = np.clip((V[:, 2] - 0.0) / 0.12, 0, 1)[:, None]
        C[:] = dark * (1 - t) + base * t
        club = np.array([t == "club" for t in tags])
        C[club] = srgb(80, 30, 12)
        return C * (1 + 0.1 * noise[:, None]), A
    chest = srgb(124, 30, 6)
    deep = srgb(52, 13, 5)
    blackish = srgb(24, 9, 5)
    # elytra: rich chestnut, darker toward the rims and the seam, warmer on the crown
    lat = np.clip(np.abs(V[:, 0]) / 0.12, 0, 1)
    crown = np.clip((V[:, 2] - 0.06) / 0.12, 0, 1)
    t = (0.55 * crown + 0.45 * (1 - lat))[:, None]
    C[:] = deep * (1 - t) + chest * t
    seam = np.clip(1 - np.abs(V[:, 0]) / 0.008, 0, 1)[:, None] * (V[:, 1] < 0.03)[:, None]
    C = C * (1 - 0.5 * seam)
    pro = np.array([tg in ("pro",) for tg in tags])
    C[pro] = (C[pro] * 0.82)
    horn = np.array([tg in ("horn", "head", "mand") for tg in tags])
    ht = np.clip((V[:, 2] - 0.08) / 0.15, 0, 1)[:, None]
    hc = blackish * (1 - ht) + deep * ht
    C[horn] = hc[horn]
    under = V[:, 2] < 0.05
    C[under] = blackish
    C = C * (1 + 0.08 * noise[:, None])
    A[:, 0] = 0.05 * noise
    return np.clip(C, 0, 1), A


# --------------------------------------------------------------------------- animation
def pose_base():
    return {}


def leg_pose(p, side, n, yaw, lift, fold=0.0):
    s = 1 if side == "R" else -1
    p[f"cox{side}{n}"] = {"r": oc.rot_z(math.radians(yaw * s)) @ oc.rot_y(math.radians(-lift * s))}
    p[f"tib{side}{n}"] = {"r": oc.rot_y(math.radians(-fold * s))}


def idle(f):
    t = f / 4.0
    w = 2 * math.pi * t
    p = {}
    p["root"] = {"t": (0, 0, 0.002 * math.sin(w)), "r": (0.8 * math.sin(w), 0, 0)}
    # feeding bob: head dips twice per loop
    p["head"] = {"r": (-10 * (0.5 + 0.5 * math.sin(2 * w)), 0, 2 * math.sin(w))}
    p["antR"] = {"r": (12 * math.sin(w + 0.4), 0, 18 * math.sin(2 * w + 1.0))}
    p["antL"] = {"r": (12 * math.sin(w + 2.1), 0, -18 * math.sin(2 * w + 2.6))}
    for side in "RL":
        for n in "123":
            leg_pose(p, side, n, 0, 0)
    leg_pose(p, "R", "1", 6 * math.sin(w), 4 * max(0, math.sin(w)))
    return p


TRIPOD = {("L", "1"): 0, ("R", "2"): 0, ("L", "3"): 0, ("R", "1"): 0.5, ("L", "2"): 0.5, ("R", "3"): 0.5}


def run(f):
    t = f / 6.0
    p = {}
    w = 2 * math.pi * t
    p["root"] = {"t": (0, 0, 0.006 + 0.004 * abs(math.sin(2 * w))), "r": (2.0, 3.0 * math.sin(w), 4 * math.sin(w))}
    p["head"] = {"r": (4 * math.sin(2 * w), 0, -3 * math.sin(w))}
    p["antR"] = {"r": (-15, 0, -20 + 6 * math.sin(2 * w))}
    p["antL"] = {"r": (-15, 0, 20 - 6 * math.sin(2 * w + 1))}
    for (side, n), off in TRIPOD.items():
        ph = (t + off) % 1.0
        if ph < 0.5:  # stance: sweep back
            u = ph / 0.5
            yaw = 26 * (1 - 2 * u)
            lift = -3
            fold = 0
        else:  # swing: lift and return
            u = (ph - 0.5) / 0.5
            yaw = -26 * math.cos(math.pi * u)
            lift = 22 * math.sin(math.pi * u)
            fold = 14 * math.sin(math.pi * u)
        leg_pose(p, side, n, yaw, lift, fold)
    return p


def hurt(f):
    a = (1.0, 0.45)[f]
    p = {"root": {"t": (0, -0.03 * a, 0.025 * a), "r": (14 * a, -16 * a, 6 * a)}}
    p["head"] = {"r": (18 * a, 0, 0)}
    p["antR"] = {"r": (30 * a, 0, -35 * a)}
    p["antL"] = {"r": (30 * a, 0, 35 * a)}
    for side in "RL":
        for n in "123":
            leg_pose(p, side, n, (8 if n == "1" else -8) * a, 26 * a, 30 * a)
    return p


POSES = {
    "idle": dict(frames=4, fps=6, loop=True, fn=idle),
    "run": dict(frames=6, fps=14, loop=True, fn=run),
    "hurt": dict(frames=2, fps=12, loop=False, fn=hurt),
}
