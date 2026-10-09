"""Species definitions for the feathered-theropod family (owned by the raptor artist).

Each species is a parameter dict for raptor_build.build(): body spine sections,
jaw, legs, arms, eye, teeth, extra blobs, a palette function and a feather layout
function.  Coordinates are HIP SPACE (hip joint at y=0), X right, Y forward, Z up.
"""
import math
import random

import numpy as np

from raptor_geo import FeatherSet, rot_axis, smoothstep, unit, v3

UP = v3(0, 0, 1)


def lin(c):
    """sRGB 0-255 -> linear"""
    c = np.asarray(c, float) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def mixc(a, b, t):
    t = np.asarray(t, float)[..., None]
    return np.asarray(a) * (1 - t) + np.asarray(b) * t


# ============================================================================ helpers for layouts
def t_of(sw, p):
    return float(np.argmin(np.linalg.norm(sw.p - np.asarray(p), axis=1)))


def t_at_arc(sw, a):
    return float(np.interp(a, sw.arc, np.arange(len(sw.p))))


def arc_of(sw, p):
    return float(sw.arc[int(t_of(sw, p))])


def tangent_dir(n, want):
    """Project 'want' onto the plane perpendicular to normal n."""
    want = np.asarray(want, float)
    return unit(want - n * np.dot(want, n))


def mirror_add(fs, sym, root, d, n, *a, **k):
    fs.add(root, d, n, *a, **k)
    if sym:
        f = lambda v: np.asarray(v, float) * np.array([-1, 1, 1])
        host = k.pop("host", None)
        if host:
            host = tuple(h[:-1] + {"R": "L", "L": "R"}[h[-1]] if h[-1] in "RL" and h not in ("body",) else h
                         for h in host)
        k["host"] = host
        if "twist" in k:
            k["twist"] = -k["twist"]
        if "droop" in k:
            k["droop"] = -k["droop"]
        if "asym" in k:
            k["asym"] = -k["asym"]
        fs.add(f(root), f(d), f(n), *a, **k)


# ============================================================================ RAPTOR
R_RED_OR = lin((228, 92, 44))
R_RED = lin((196, 38, 30))
R_DEEP = lin((150, 30, 22))
R_ORANGE = lin((240, 128, 52))
R_CREAM = lin((244, 222, 186))
R_CREAM2 = lin((236, 200, 156))
R_TAN = lin((214, 120, 70))
R_LEG = lin((96, 70, 56))
R_LEG_D = lin((62, 44, 36))
R_DARK = lin((28, 20, 20))
R_MOUTH = lin((120, 30, 34))
R_TONGUE = lin((176, 70, 74))


def raptor_colors(C, ctx, kind):
    P = C.P
    X = ctx["pos"]
    n = len(X)
    scaly = np.zeros(n)
    mouth = np.zeros(n)
    if kind == "skin":
        zl, af = ctx["zl"], ctx["arc_frac"]
        J = C.joints
        body = C.body
        a_occ = body.arc[int(np.argmin(np.linalg.norm(body.p - J["occ"], axis=1)))] / body.arc[-1]
        a_nb = body.arc[int(np.argmin(np.linalg.norm(body.p - J["nb"], axis=1)))] / body.arc[-1]
        head = smoothstep(a_occ - 0.01, a_occ + 0.03, af)
        neck = smoothstep(a_nb - 0.03, a_nb + 0.02, af) * (1 - head)
        dorsal = smoothstep(-0.55, 0.15, zl)
        # head: cream lower face rising toward the eye line, warm tan snout top
        dorsal_h = smoothstep(0.05, 0.6, zl)
        dorsal = dorsal * (1 - head) + dorsal_h * head
        # throat stays cream
        dorsal = dorsal * (1 - neck * smoothstep(0.1, -0.5, zl))
        top = mixc(R_RED_OR, R_RED, smoothstep(0.4, 1.0, zl) * 0.5)
        top = mixc(top, R_TAN, head * smoothstep(0.85, 0.95, af))
        # subtle dorsal stripes on the tail
        tail_band = (1 - smoothstep(0.30, 0.42, af)) * (0.5 + 0.5 * np.sin(af * 110.0))
        top = mixc(top, R_DEEP, tail_band * 0.35 * smoothstep(0.0, 0.8, zl))
        under = mixc(R_CREAM, R_CREAM2, smoothstep(-0.2, 0.2, zl))
        col = mixc(under, top, dorsal)
        # legs: feathered thigh, scaly shin/foot
        z = X[:, 2]
        legw = np.clip(ctx["leg"], 0, 1)
        sc = np.clip(smoothstep(0.50, 0.36, z) * legw + ctx["foot"], 0, 1)
        legcol = mixc(R_RED_OR, R_LEG, sc)
        legcol = mixc(legcol, R_LEG_D, smoothstep(0.08, 0.0, z) * sc)
        col = mixc(col, legcol, legw)
        scaly = sc
        # eye ring and nostrils
        E = P["eye"]
        for sx in (1, -1):
            ec = np.array(E["c"]) * [sx, 1, 1]
            d = np.linalg.norm(X - ec, axis=1)
            col = mixc(col, R_DARK, smoothstep(E["r"] * 1.55, E["r"] * 1.2, d))
            nc = np.array(P["nostril"]) * [sx, 1, 1]
            d = np.linalg.norm(X - nc, axis=1)
            col = mixc(col, R_DARK, smoothstep(0.012, 0.006, d))
        # mouth interior: underside of the upper head
        jp = J["jaw_pivot"]
        m = head * smoothstep(-0.75, -0.95, zl) * (X[:, 1] > jp[1] - 0.01)
        col = mixc(col, R_MOUTH, m)
        mouth = m
        return col, scaly, mouth
    if kind == "jaw":
        jaw = ctx["jaw"]
        d = np.linalg.norm(X[:, None, :] - jaw.p[None, ::4, :], axis=2)
        i = np.argmin(d, 1) * 4
        i = np.clip(i, 0, len(jaw.p) - 1)
        o = X - jaw.p[i]
        zl = (o * jaw.u[i]).sum(1) / np.maximum(jaw.d[i, 5], 1e-3)
        xl = np.abs((o * jaw.s[i]).sum(1)) / np.maximum(jaw.d[i, 3], 1e-3)
        m = smoothstep(0.3, 0.8, zl) * smoothstep(0.95, 0.7, xl)
        col = mixc(R_CREAM, R_TONGUE, m)
        lip = smoothstep(0.0, 0.5, zl) * smoothstep(0.6, 0.95, xl)
        col = mixc(col, R_CREAM2, lip)
        return col, scaly, m
    if kind == "arm":
        W, bn = ctx["W"], ctx["bnames"]
        hand = sum(W[:, bn.index(b)] for b in ("handR", "handL"))
        col = mixc(R_RED_OR, mixc(R_RED_OR, R_LEG, 0.45), hand)
        return col, hand, mouth
    raise KeyError(kind)


from raptor_plumage import raptor_feathers  # noqa: E402

RAPTOR_FPAL = dict(
    cov=[(0, R_RED_OR * 0.8), (0.55, R_RED_OR), (0.85, R_ORANGE * 0.95), (1, R_RED_OR * 0.75)],
    cov_low=[(0, R_RED_OR), (0.6, mixc(R_RED_OR, R_CREAM, 0.5)), (1, mixc(R_RED_OR, R_CREAM, 0.7))],
    crest=[(0, R_RED * 0.85), (0.5, R_RED), (0.82, R_RED_OR), (1.0, R_DEEP * 0.75)],
    ruff=[(0, R_RED_OR), (0.6, R_RED), (1.0, R_DEEP * 0.9)],
    wing=[(0, R_RED * 0.9), (0.45, R_RED_OR), (0.6, R_RED * 0.8), (0.7, R_DARK * 1.6), (1, R_DARK)],
    wcov=[(0, R_RED), (0.6, mixc(R_RED, R_RED_OR, 0.5)), (1.0, R_RED * 0.8)],
    tail=[(0, R_RED_OR * 0.9), (0.42, R_ORANGE), (0.6, mixc(R_ORANGE, R_CREAM, 0.45)), (0.7, R_DARK * 2.2),
          (1, R_DARK)],
    thigh=[(0, R_RED_OR * 0.9), (0.7, R_RED_OR), (1.0, R_RED * 0.85)],
    fluff=[(0, R_CREAM2), (0.7, R_CREAM), (1.0, R_CREAM * 0.95)],
)


RAPTOR = dict(
    id="raptor",
    length=2.6,
    voxel=0.0075,
    spacing=0.007,
    # name, y, z, rx_top, rx_bot, z_top, z_bot, n
    body=[
        ("ttip", -1.24, 1.13, 0.012, 0.012, 0.012, 0.012, 2),
        ("t6", -1.07, 1.10, 0.02, 0.02, 0.022, 0.02, 2),
        ("t5", -0.90, 1.07, 0.03, 0.03, 0.032, 0.03, 2),
        ("t4", -0.73, 1.045, 0.042, 0.042, 0.044, 0.042, 2),
        ("t3", -0.56, 1.025, 0.055, 0.055, 0.058, 0.056, 2),
        ("t2", -0.39, 1.01, 0.07, 0.072, 0.074, 0.078, 2),
        ("t1", -0.20, 1.0, 0.088, 0.095, 0.088, 0.10, 2.1),
        ("hip", 0.0, 1.0, 0.10, 0.112, 0.09, 0.13, 2.2),
        ("mid", 0.15, 0.985, 0.104, 0.118, 0.09, 0.17, 2.2),
        ("chest", 0.29, 0.99, 0.094, 0.108, 0.085, 0.175, 2.2),
        ("nb", 0.40, 1.055, 0.075, 0.085, 0.075, 0.11, 2),
        ("n1", 0.46, 1.13, 0.066, 0.072, 0.064, 0.082, 2),
        ("n2", 0.51, 1.20, 0.062, 0.066, 0.062, 0.07, 2),
        ("n3", 0.56, 1.26, 0.064, 0.066, 0.066, 0.062, 2),
        ("occ", 0.62, 1.30, 0.07, 0.078, 0.085, 0.05, 2.3),
        ("eye", 0.71, 1.31, 0.06, 0.076, 0.075, 0.062, 2.4),
        ("sn1", 0.81, 1.295, 0.048, 0.06, 0.06, 0.052, 2.4),
        ("sn2", 0.90, 1.275, 0.04, 0.05, 0.048, 0.04, 2.3),
        ("snt", 0.97, 1.258, 0.03, 0.036, 0.036, 0.028, 2.2),
        ("tip", 1.005, 1.25, 0.012, 0.012, 0.014, 0.012, 2),
    ],
    front_joints=["hip", "mid", "chest", "nb", "n1", "n2", "occ", "tip"],
    front_bones=["pelvis", "torso", "chest", "neck1", "neck2", "neck3", "head"],
    tail_joints=["hip", "t1", "t2", "t3", "t4", "t5", "t6", "ttip"],
    tail_bones=["tail1", "tail2", "tail3", "tail4", "tail5", "tail6", "tail7"],
    break_widths={"hip": (0.0, 0.07), "mid": (0.0, 0.07), "chest": (0.0, 0.06), "nb": (0.0, 0.05),
                  "n1": (0.0, 0.04), "n2": (0.0, 0.04), "occ": (-0.03, 0.03)},
    jaw=[
        ("j0", 0.59, 1.246, 0.052, 0.056, 0.012, 0.04, 2.2),
        ("j1", 0.70, 1.235, 0.056, 0.06, 0.012, 0.046, 2.2),
        ("j2", 0.81, 1.229, 0.048, 0.052, 0.011, 0.038, 2.2),
        ("j3", 0.90, 1.222, 0.038, 0.04, 0.010, 0.03, 2.2),
        ("j4", 0.965, 1.217, 0.028, 0.03, 0.009, 0.022, 2.1),
        ("j5", 0.995, 1.217, 0.01, 0.01, 0.007, 0.007, 2),
    ],
    eye=dict(c=(0.06, 0.70, 1.336), r=0.03, dir=(1.0, 0.3, 0.14)),
    nostril=(0.026, 0.962, 1.272),
    blobs=[
        # brow ridge: scowl that shades the eye
        dict(c=(0.054, 0.705, 1.372), r=(0.027, 0.056, 0.017), rot=((1, 0, 0), -0.18)),
        # cheek/jugal under the eye
        dict(c=(0.066, 0.665, 1.282), r=(0.02, 0.06, 0.028)),
    ],
    teeth=[
        dict(on="head", n=12, y0=0.655, y1=0.975, th=-1.38, dir=(0, 0.12, -1), len=(0.022, 0.013), rad=0.0052,
             curl=0.35, out=0.0),
    ],
    leg=dict(
        hip_x=0.10, hip_z=0.95, femur=0.38, tibia=0.46, meta=0.24, toe=0.12,
        ball_x=0.088, ball_y=0.07, ball_z=0.024, beta=0.36,
        thigh_top_y=0.02, thigh_top_z=0.05,
        prof=dict(
            # (rx_top, rx_bot, z_top(front), z_bot(back), n) at each sweep joint
            thigh=[(0.05, 0.05, 0.07, 0.08, 2.2), (0.08, 0.084, 0.10, 0.12, 2.2), (0.072, 0.075, 0.085, 0.10, 2.2),
                   (0.052, 0.054, 0.055, 0.062, 2.1), (0.044, 0.044, 0.044, 0.044, 2)],
            shin=[(0.05, 0.05, 0.046, 0.056, 2), (0.048, 0.05, 0.04, 0.066, 2), (0.036, 0.036, 0.03, 0.04, 2),
                  (0.031, 0.031, 0.028, 0.032, 2)],
            meta=[(0.031, 0.031, 0.026, 0.03, 2), (0.027, 0.027, 0.023, 0.026, 2), (0.027, 0.027, 0.024, 0.024, 2)],
            knee=0.052, ankle=0.037, ball=0.028,
        ),
        toes=dict(
            d3=dict(yaw=0.04, segs=(0.045, 0.04, 0.035), rad=(0.022, 0.018, 0.015, 0.011), claw=0.04,
                    claw_r=0.009, curl=1.2, claw_up=(0, 0, 1)),
            d4=dict(yaw=0.32, x=0.006, segs=(0.042, 0.035, 0.03), rad=(0.02, 0.016, 0.013, 0.01), claw=0.034,
                    claw_r=0.008, curl=1.2, claw_up=(0, 0, 1)),
            d2=dict(yaw=-0.18, x=-0.01, segs=(0.035, 0.032), lift=(0.75, 1.1), rad=(0.02, 0.018, 0.015),
                    claw=0.095, claw_r=0.0145, curl=2.1, claw_dir=(0, 0.3, 1.0), claw_up=(0, -1, 0.2),
                    ground=False),
            d1=dict(yaw=2.6, x=-0.012, segs=(0.03,), lift=(-0.5,), rad=(0.012, 0.009), claw=0.02,
                    claw_r=0.005, curl=1.0, claw_up=(0, 0, 1), ground=False),
        ),
    ),
    arm=dict(
        shoulder=(0.08, 0.30, 0.94), elbow=(0.15, 0.21, 0.81), wrist=(0.165, 0.36, 0.74),
        knuckle=(0.158, 0.42, 0.705),
        prof=dict(
            hum=[(0.038, 0.038, 0.036, 0.04, 2), (0.03, 0.03, 0.028, 0.03, 2), (0.024, 0.024, 0.022, 0.024, 2)],
            fore=[(0.024, 0.024, 0.022, 0.024, 2), (0.022, 0.022, 0.02, 0.022, 2), (0.018, 0.018, 0.017, 0.018, 2)],
            hand=[(0.017, 0.017, 0.015, 0.017, 2), (0.013, 0.013, 0.012, 0.013, 2)],
            elbow=0.026, wrist=0.02,
        ),
        fingers=[
            dict(dir=(0.1, 0.75, -0.65), off=(0.0, 0.0, 0.0), segs=(0.022, 0.02), rad=0.011, bend=0.5, claw=0.04,
                 claw_r=0.009, curl=1.9, claw_up=(0, 1, 0.3)),
            dict(dir=(0.0, 0.8, -0.6), off=(-0.01, 0.004, 0.0), segs=(0.026, 0.022), rad=0.0115, bend=0.5,
                 claw=0.045, claw_r=0.0095, curl=1.9, claw_up=(0, 1, 0.3)),
            dict(dir=(-0.12, 0.75, -0.65), off=(-0.02, 0.0, 0.004), segs=(0.02, 0.018), rad=0.01, bend=0.5,
                 claw=0.036, claw_r=0.008, curl=1.9, claw_up=(0, 1, 0.3)),
        ],
    ),
    colors=raptor_colors,
    feathers=raptor_feathers,
    fpal=RAPTOR_FPAL,
    fl=dict(
        cov_from="t6", cov_len=0.105, cov_th_min=-24, ruff_len=0.11, ruff_th_min=-35,
        crest_front=0.0, crest_back="n2", crest_peak=0.55, crest_len=0.2, crest_up=0.85, crest_step=0.02,
        cheek_len=0.075, cheek_n=4, thigh_len=0.09,
        wing_n=11, wing_ang0=14, wing_ang1=42, wing_len0=0.2, wing_len1=0.31,
        tail_from="t3", tail_n=13, tail_len0=0.11, tail_len1=0.29, tail_spread0=55, tail_spread1=10,
        tail_tip_n=5,
    ),
    meta=dict(r=0.42, length=2.6, height=1.0),
)

SPECIES = {"raptor": RAPTOR}
