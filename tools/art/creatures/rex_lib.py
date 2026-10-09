"""Tiny Rex hero: procedural model + rig + animation + sprite render, four growth stages.

    blender -b -P tools/art/creatures/rex_2.py -- --mode still
    blender -b -P tools/art/creatures/rex_2.py -- --mode render

Modelling: the body is a signed-distance field built from swept super-elliptic tubes
(head / neck / torso / tail spine, thigh-shin-metatarsus-toes, arms) plus sculpt
ellipsoids (brows, cheeks, dorsal scutes, eye sockets, nostrils), smooth-unioned and
meshed with OpenVDB. The lower jaw is a separate field so the bite can open. Eyes,
teeth, claws and the mouth interior are explicit meshes.
Rig: a numpy skeleton (world-aligned rest frames), linear-blend skinning with weights
taken from each tube's arc-length bone stations, softly blended across parts by SDF
distance; 2-bone IK legs. No Blender armature is needed: frames are posed in numpy and
written straight into the mesh before each render.
"""
import json
import math
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(ART))
if ART not in sys.path:
    sys.path.insert(0, ART)

import bpy  # noqa: E402
from common import (  # noqa: E402
    COS45, PPU, SQUASH, VSCALE, args_after_dashes, frame_camera, render_to, reset_scene,
    setup_lighting, setup_render,
)

BIG = 1e3
DORS_DEFAULT = dict(crest=1.0, scute=0.75, brow=0.75, boss=0.8, lid=0.15, cheek=-0.05, nrim=0.6, thigh=0.25, shin=0.3,
                    met=0.3, ankle=0.3, pad=-0.3, toe=0.3, uarm=0.2, farm=0.2, finger=0.2, jawswell=-0.6)
F = np.float32

# =========================================================================== stages
# One animal at four ages. Everything is authored relative to H (hip height) for the
# body and HL (head length) for the head; "baby" morphs the head toward a domed, short
# snouted hatchling head, "apex" toward a massive ridged adult skull.
STAGES = {
    0: dict(name="Hatchling", L=2.0, H=0.75, head=0.35, r=0.45, baby=1.0, apex=0.0, lean=0.0,
            pitch=8.0, head_pitch=-2.0, eye=0.125, brow=0.45, crest=0.55, spike=0.0, jaw=0.85,
            neck=1.12, torso_w=1.16, torso_d=1.08, torso_len=0.86, belly=1.12, thigh=1.12, tail_w=1.15,
            tail_up=0.16, arm=1.15, toe=1.15, teeth=7, scars=False, energy=1.2),
    1: dict(name="Juvenile", L=3.0, H=1.1, head=0.28, r=0.65, baby=0.4, apex=0.0, lean=1.0,
            pitch=4.0, head_pitch=-5.0, eye=0.088, brow=0.75, crest=0.8, spike=0.2, jaw=0.93,
            neck=0.84, torso_w=0.84, torso_d=0.88, torso_len=0.94, belly=0.82, thigh=0.84, tail_w=0.82,
            tail_up=0.06, arm=1.0, toe=0.95, teeth=10, scars=False, energy=1.1),
    2: dict(name="Hunter", L=4.2, H=1.6, head=0.25, r=0.9, baby=0.0, apex=0.25, lean=0.0,
            pitch=0.0, head_pitch=-7.0, eye=0.068, brow=1.0, crest=1.0, spike=0.5, jaw=1.0,
            neck=1.0, torso_w=1.0, torso_d=1.0, torso_len=1.0, belly=1.0, thigh=1.0, tail_w=1.0,
            tail_up=0.0, arm=0.9, toe=1.0, teeth=12, scars=False, energy=1.0),
    3: dict(name="Apex", L=5.6, H=2.2, head=0.26, r=1.2, baby=0.0, apex=1.0, lean=0.0,
            pitch=-3.0, head_pitch=-8.0, eye=0.058, brow=1.45, crest=1.4, spike=1.0, jaw=1.28,
            neck=1.28, torso_w=1.12, torso_d=1.08, torso_len=1.0, belly=1.06, thigh=1.18, tail_w=1.22,
            tail_up=-0.02, arm=0.78, toe=1.08, teeth=13, scars=True, energy=0.85),
}

POSES = {  # README contract: player species
    "idle": dict(frames=6, fps=6, loop=True),
    "run": dict(frames=8, fps=12, loop=True),
    "bite": dict(frames=6, fps=18, loop=False),
    "dodge": dict(frames=4, fps=16, loop=False),
    "hurt": dict(frames=3, fps=12, loop=False),
    "skill": dict(frames=6, fps=12, loop=False),
}

# --------------------------------------------------------------------------- math utils


def nrm(v):
    v = np.asarray(v, dtype=np.float64)
    return v / max(np.linalg.norm(v), 1e-12)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a, b, k):
    return -smin(-a, -b, k)


def rx(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def ry(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rz(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def euler(r):
    return rz(r[2]) @ ry(r[1]) @ rx(r[0])


def rot_between(a, b):
    a, b = nrm(a), nrm(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    s = np.linalg.norm(v)
    if s < 1e-9:
        return np.eye(3)
    k = v / s
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    ang = math.atan2(s, c)
    return np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * (K @ K)


def catmull(rows, per=4):
    """Catmull-Rom densify an (R, D) table (uniform parameter)."""
    rows = np.asarray(rows, dtype=np.float64)
    P = np.vstack([2 * rows[0] - rows[1], rows, 2 * rows[-1] - rows[-2]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for j in range(per):
            t = j / per
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-2])
    return np.array(out)


# =========================================================================== SDF parts


class Tube:
    """Swept super-ellipse tube. rows: (x, y, z, a, bt, bb, n) where a = lateral half
    width, bt/bb = half heights toward the local 'up' (cross(X, tangent)) and away."""

    kind = "tube"

    def __init__(self, name, rows, per=4, k=0.0, mode="union", stations=None, attrs=None, dors=False,
                 lateral=(1.0, 0.0, 0.0)):
        R = catmull(rows, per) if per > 1 else np.asarray(rows, dtype=np.float64)
        R[:, 3:6] = np.maximum(R[:, 3:6], 1e-4)
        self.name, self.k, self.mode = name, k, mode
        self.c = R[:, :3]
        self.a, self.bt, self.bb, self.n = R[:, 3], R[:, 4], R[:, 5], np.maximum(R[:, 6], 1.5)
        t = np.gradient(self.c, axis=0)
        t /= np.linalg.norm(t, axis=1, keepdims=True)
        X = np.array(lateral, dtype=np.float64)
        b = X[None, :] - (t @ X)[:, None] * t
        b /= np.linalg.norm(b, axis=1, keepdims=True)
        self.b = b
        self.u = np.cross(b, t)
        seg = np.linalg.norm(np.diff(self.c, axis=0), axis=1)
        self.s = np.concatenate([[0.0], np.cumsum(seg)])
        r = np.maximum(self.a, np.maximum(self.bt, self.bb))
        self.lo = (self.c - r[:, None]).min(0)
        self.hi = (self.c + r[:, None]).max(0)
        self.stations = stations
        self.attrs = attrs or {}
        self.dors = dors
        self.ks = F(max(float(np.mean(seg)) * 0.35, 1e-4))

    def arc_of(self, p):
        d, s, *_ = self.eval(np.asarray(p, dtype=F)[None, :], local=True)
        return float(s[0])

    def eval(self, P, local=False):
        P = P.astype(F)
        c0 = self.c[:-1].astype(F)
        dv = np.diff(self.c, axis=0).astype(F)
        L2 = (dv * dv).sum(1)
        Ls = np.sqrt(L2)
        S = len(c0)
        out_d = np.empty(len(P), F)
        if local:
            out_s = np.empty(len(P), F)
            out_v = np.empty(len(P), F)
            out_w = np.empty(len(P), F)
        chunk = max(2000, int(1_500_000 / S))
        A = [x.astype(F) for x in (self.a, self.bt, self.bb, self.n)]
        Bv, Uv = self.b.astype(F), self.u.astype(F)
        for i0 in range(0, len(P), chunk):
            p = P[i0:i0 + chunk]
            rel = p[:, None, :] - c0[None]
            tu = (rel * dv[None]).sum(2) / L2[None]
            tc = np.clip(tu, 0, 1)
            es = np.maximum(-tu, tu - 1) * Ls[None]
            pq = rel - tc[..., None] * dv[None]

            def lerp(arr):
                return arr[:-1][None] + tc * (arr[1:] - arr[:-1])[None]

            def lerpv(arr):
                return arr[:-1][None] + tc[..., None] * (arr[1:] - arr[:-1])[None]

            v = (pq * lerpv(Bv)).sum(2)
            w = (pq * lerpv(Uv)).sum(2)
            a = lerp(A[0])
            bsel = np.where(w > 0, lerp(A[1]), lerp(A[2]))
            n = lerp(A[3])
            X = np.abs(v) / a + 1e-6
            Y = np.abs(w) / bsel + 1e-6
            Xn, Yn = X ** n, Y ** n
            k0 = (Xn + Yn) ** (1.0 / n)
            gx = Xn / X / a
            gy = Yn / Y / bsel
            g = k0 ** (1.0 - n) * np.sqrt(gx * gx + gy * gy)
            d2 = (k0 - 1.0) / np.maximum(g, 1e-6)
            piece = np.minimum(np.maximum(d2, es), 0) + np.sqrt(np.maximum(d2, 0) ** 2 + np.maximum(es, 0) ** 2)
            j = np.argmin(piece, axis=1)
            rr = np.arange(len(p))
            pm = piece[rr, j]
            ks = self.ks
            out_d[i0:i0 + chunk] = pm - ks * np.log(np.exp(-np.minimum(piece - pm[:, None], 30 * ks) / ks).sum(1))
            if local:
                tj = tc[rr, j]
                out_s[i0:i0 + chunk] = self.s[j] + tj * Ls[j]
                out_v[i0:i0 + chunk] = v[rr, j] / a[rr, j]
                out_w[i0:i0 + chunk] = w[rr, j] / bsel[rr, j]
        if local:
            return out_d, out_s, out_v, out_w
        return out_d

    def ring(self, s):
        """centre, lateral, up, a, bt, bb at arc length s."""
        i = int(np.clip(np.searchsorted(self.s, s) - 1, 0, len(self.s) - 2))
        t = (s - self.s[i]) / max(self.s[i + 1] - self.s[i], 1e-9)
        t = float(np.clip(t, 0, 1))
        L = lambda arr: arr[i] + t * (arr[i + 1] - arr[i])  # noqa: E731
        return L(self.c), nrm(L(self.b)), nrm(L(self.u)), L(self.a), L(self.bt), L(self.bb), L(self.n)

    def surface(self, s, theta):
        """point on the surface at arc length s, angle theta from 'up' toward +lateral."""
        c, b, u, a, bt, bb, n = self.ring(s)
        sv, cw = math.sin(theta), math.cos(theta)
        hh = bt if cw > 0 else bb
        r = (abs(sv) ** n + abs(cw) ** n) ** (-1.0 / n)
        p = c + b * (sv * r * a) + u * (cw * r * hh)
        nn = nrm(b * (sv / a) + u * (cw / hh))
        return p, nn


class Ell:
    kind = "ell"

    def __init__(self, name, c, radii, R=None, k=0.0, mode="union", stations=None, attrs=None):
        self.name, self.k, self.mode = name, k, mode
        self.c = np.asarray(c, dtype=np.float64)
        self.r = np.asarray(radii, dtype=np.float64)
        self.R = np.eye(3) if R is None else np.asarray(R, dtype=np.float64)
        m = self.r.max()
        self.lo, self.hi = self.c - m, self.c + m
        self.stations = stations  # {bone: w} constant or None
        self.attrs = attrs or {}
        self.dors = False

    def eval(self, P, local=False):
        q = ((P.astype(np.float64) - self.c) @ self.R) / self.r
        k0 = np.linalg.norm(q, axis=1)
        k1 = np.linalg.norm(q / self.r, axis=1)
        d = (k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)).astype(F)
        if local:
            z = np.zeros(len(P), F)
            return d, z, z, z
        return d


def eval_field(ops, P, margin):
    f = np.full(len(P), BIG, F)
    for op in ops:
        m = op.k + margin
        mask = np.all((P >= op.lo - m) & (P <= op.hi + m), axis=1)
        idx = np.nonzero(mask)[0]
        if not len(idx):
            continue
        d = op.eval(P[idx])
        if op.mode == "union":
            f[idx] = smin(f[idx], d, op.k)
        elif op.mode == "sub":
            f[idx] = smax(f[idx], -d, op.k)
    return f


def mesh_field(ops, voxel, pad=0.05, smooth_iters=3, label=""):
    t0 = time.time()
    lo = np.min([op.lo for op in ops if op.mode == "union"], axis=0) - pad
    hi = np.max([op.hi for op in ops if op.mode == "union"], axis=0) + pad
    vc = voxel * 3
    cn = np.ceil((hi - lo) / vc).astype(int) + 1
    cg = [lo[i] + np.arange(cn[i]) * vc for i in range(3)]
    CP = np.stack(np.meshgrid(*cg, indexing="ij"), -1).reshape(-1, 3).astype(F)
    coarse = eval_field(ops, CP, 3 * vc).reshape(cn)
    fn = np.ceil((hi - lo) / voxel).astype(int) + 1
    idx = [np.clip(np.round(np.arange(fn[i]) * voxel / vc).astype(int), 0, cn[i] - 1) for i in range(3)]
    fine = coarse[np.ix_(*idx)].astype(F)
    band = np.abs(fine) < 1.7 * vc
    bi = np.nonzero(band)
    FP = np.stack([lo[i] + bi[i] * voxel for i in range(3)], -1).astype(F)
    fine[bi] = eval_field(ops, FP, 3 * vc)
    fine = np.clip(fine, -4 * vc, 4 * vc)
    import openvdb as vdb
    g = vdb.FloatGrid(float(4 * vc))
    g.copyFromArray(np.ascontiguousarray(fine), ijk=(0, 0, 0), tolerance=0)
    pts, quads = g.convertToQuads(isovalue=0.0)
    V = pts.astype(np.float64) * voxel + lo
    Q = quads.astype(np.int64)
    # orientation: outward normals => positive signed volume
    tri = np.concatenate([Q[:, [0, 1, 2]], Q[:, [0, 2, 3]]])
    vol = np.einsum("ij,ij->i", V[tri[:, 0]], np.cross(V[tri[:, 1]], V[tri[:, 2]])).sum() / 6
    if vol < 0:
        Q = Q[:, ::-1].copy()
    V = taubin(V, Q, smooth_iters)
    print(f"  mesh {label}: {fn.tolist()} voxels, band {len(FP)}, {len(V)} verts, {time.time() - t0:.1f}s", flush=True)
    return V, Q


def taubin(V, Q, iters, lam=0.5, mu=-0.53):
    if iters <= 0:
        return V
    e = np.concatenate([Q[:, [0, 1]], Q[:, [1, 2]], Q[:, [2, 3]], Q[:, [3, 0]]])
    e = np.concatenate([e, e[:, ::-1]])
    deg = np.bincount(e[:, 0], minlength=len(V)).astype(np.float64)
    deg = np.maximum(deg, 1)
    for _ in range(iters):
        for f in (lam, mu):
            acc = np.zeros_like(V)
            np.add.at(acc, e[:, 0], V[e[:, 1]])
            V = V + f * (acc / deg[:, None] - V)
    return V


# =========================================================================== anatomy


class Rex:
    BONES = [  # name, parent
        ("root", None), ("pelvis", "root"), ("spine", "pelvis"), ("chest", "spine"),
        ("neck1", "chest"), ("neck2", "neck1"), ("head", "neck2"), ("jaw", "head"),
        ("tail1", "pelvis"), ("tail2", "tail1"), ("tail3", "tail2"), ("tail4", "tail3"),
        ("thigh_L", "pelvis"), ("shin_L", "thigh_L"), ("foot_L", "shin_L"), ("toes_L", "foot_L"),
        ("thigh_R", "pelvis"), ("shin_R", "thigh_R"), ("foot_R", "shin_R"), ("toes_R", "foot_R"),
        ("arm_L", "chest"), ("fore_L", "arm_L"), ("hand_L", "fore_L"),
        ("arm_R", "chest"), ("fore_R", "arm_R"), ("hand_R", "fore_R"),
    ]

    def __init__(self, stage):
        self.stage = stage
        P = self.P = STAGES[stage]
        self.L, self.H = P["L"], P["H"]
        self.HL = P["head"] * self.L
        self.bi = {b: i for i, (b, _) in enumerate(self.BONES)}
        self.rest = {}
        self.build()

    # ---------------------------------------------------------------- helpers
    def W(self, **kw):
        return dict(kw)

    def hp(self, u, lat, z):
        """head space (HL units, u forward along skull, lat +X, z up) -> model space"""
        return self.O + self.HL * (u * self.hf + lat * np.array([1.0, 0, 0]) + z * self.hu)

    def body_pitch(self, y, z):
        """rotate a mid-sagittal (y, z) point about the hip by the stage's body pitch"""
        H = self.H
        a = math.radians(self.P["pitch"]) * (1.0 if y > 0 else 0.35)
        dy, dz = y, z - H
        return dy * math.cos(a) - dz * math.sin(a), H + dy * math.sin(a) + dz * math.cos(a)

    def head_rows(self):
        P = self.P
        adult = np.array([
            # u      zc     a      bt     bb    n
            [-0.07, 0.01, 0.15, 0.14, 0.11, 2.2],
            [0.03, 0.025, 0.215, 0.19, 0.145, 2.4],
            [0.15, 0.025, 0.245, 0.205, 0.16, 2.6],
            [0.28, 0.010, 0.232, 0.19, 0.157, 2.7],
            [0.43, -0.015, 0.192, 0.165, 0.148, 2.8],
            [0.60, -0.035, 0.168, 0.146, 0.134, 2.8],
            [0.76, -0.050, 0.155, 0.132, 0.122, 2.7],
            [0.88, -0.060, 0.140, 0.118, 0.11, 2.6],
            [0.95, -0.066, 0.112, 0.094, 0.086, 2.4],
            [0.99, -0.070, 0.062, 0.05, 0.045, 2.1],
            [1.00, -0.071, 0.025, 0.02, 0.018, 2.0],
        ])
        baby = np.array([
            [-0.07, 0.02, 0.15, 0.15, 0.10, 2.2],
            [0.03, 0.035, 0.23, 0.215, 0.13, 2.3],
            [0.17, 0.035, 0.262, 0.245, 0.14, 2.4],
            [0.32, 0.005, 0.245, 0.205, 0.137, 2.5],
            [0.47, -0.030, 0.205, 0.152, 0.128, 2.5],
            [0.62, -0.050, 0.178, 0.126, 0.117, 2.5],
            [0.77, -0.060, 0.162, 0.114, 0.106, 2.4],
            [0.89, -0.066, 0.143, 0.100, 0.096, 2.3],
            [0.95, -0.068, 0.118, 0.085, 0.078, 2.2],
            [0.99, -0.071, 0.066, 0.05, 0.045, 2.1],
            [1.00, -0.072, 0.03, 0.024, 0.02, 2.0],
        ])
        h = adult * (1 - P["baby"]) + baby * P["baby"]
        ap = P["apex"]
        back = smoothstep(0.55, 0.05, h[:, 0])  # 1 at the back of the skull
        h[:, 2] *= 1 + ap * (0.10 + 0.10 * back)  # wide at the back
        h[:, 3] *= 1 + ap * 0.06
        h[:, 4] *= 1 + ap * 0.05
        return h

    def jaw_rows(self, head):
        P = self.P
        jd = P["jaw"]
        rows = []
        for u, depth, wf in [(0.0, 0.17, 0.74), (0.10, 0.235, 0.78), (0.28, 0.215, 0.76), (0.48, 0.17, 0.75),
                             (0.70, 0.14, 0.76), (0.86, 0.12, 0.78), (0.95, 0.095, 0.8), (0.99, 0.05, 0.72)]:
            zc, a, bt, bb = self.head_at(head, u)
            mouth = zc - bb  # the mouth line (bottom of the upper jaw)
            rows.append((u, mouth + 0.012, a * wf, 0.03, depth * jd * (1 + 0.15 * P["apex"] * (u < 0.4)), 2.3))
        return rows

    @staticmethod
    def head_at(head, u):
        return tuple(np.interp(u, head[:, 0], head[:, i]) for i in (1, 2, 3, 4))

    # ---------------------------------------------------------------- build
    def build(self):
        P, H, L, HL = self.P, self.H, self.L, self.HL
        tl = P["torso_len"]
        X = np.array([1.0, 0, 0])
        # ---- head frame
        hp_deg = P["head_pitch"] + P["pitch"] * 0.5
        a = math.radians(hp_deg)
        self.hf = np.array([0.0, math.cos(a), math.sin(a)])
        self.hu = np.array([0.0, -math.sin(a), math.cos(a)])
        oy, oz = self.body_pitch(0.63 * H * tl, (1.36 + 0.06 * P["baby"]) * H)
        self.O = np.array([0.0, oy, oz])
        head = self.head_rows()
        self.head_tab = head
        y_nose = self.hp(1.0, 0, 0)[1]
        T = L - y_nose  # tail length from the hip
        self.T, self.y_nose = T, y_nose
        # ---- torso / neck / tail rows (H units)
        tw, td, nk, bl = P["torso_w"], P["torso_d"], P["neck"], P["belly"]
        rows = []
        for f, z, aa, bt, bb in [(1.00, 0.80, .008, .008, .008), (0.97, 0.805, .022, .022, .022), (0.90, 0.815, .042, .046, .042),
                                 (0.76, 0.845, .078, .088, .078), (0.56, 0.895, .13, .145, .13), (0.36, 0.945, .185, .195, .19),
                                 (0.17, 0.985, .235, .22, .25)]:
            z = z + P["tail_up"] * f * f
            w = P["tail_w"] * (1 + 0.5 * (P["tail_w"] - 1) * (1 - f))
            rows.append((0, -f * T, z * H, aa * w * H, bt * w * H * (0.92 + 0.08 * td), bb * w * H, 2.1))
        for y, z, aa, bt, bb in [(0.0, 1.0, .29, .21, .31), (0.2, 1.0, .31, .21, .38), (0.38, 1.04, .30, .2, .41),
                                 (0.52, 1.12, .25, .17, .34)]:
            yy, zz = self.body_pitch(y * H * tl, z * H)
            belly = bb * bl * td
            rows.append((0, yy, zz, aa * tw * H, bt * td * H, belly * H, 2.1))
        # neck: shoulder -> into the back of the skull, S-curved
        S = np.array(rows[-1][:3])
        E = self.hp(0.07, 0, -0.09)
        ha = self.head_at(head, 0.07)
        for f, aa, bt, bb in [(0.33, .19, .15, .245), (0.66, .16, .135, .19), (1.0, .14, .12, .15)]:
            p = S + (E - S) * f + np.array([0, -0.06 * H * math.sin(math.pi * f), 0.025 * H * math.sin(math.pi * f)])
            if f == 1.0:
                p = E
            aw = min(aa * nk * H, ha[1] * HL * 0.95) if f == 1.0 else aa * nk * H
            bbw = min(bb * nk * H, (ha[3] + 0.1) * HL) if f == 1.0 else bb * nk * H
            rows.append((0, p[1], p[2], aw, bt * nk * H, bbw, 2.15))
        rows = np.array(rows)
        self.torso_rows = rows
        # bones on the spine (rest heads)
        torso_tmp = Tube("tmp", rows, per=4)
        self.rest["root"] = np.zeros(3)
        self.rest["pelvis"] = np.array([0.0, 0.0, H])

        def spine_at_y(y):
            i = np.argmin(np.abs(torso_tmp.c[:, 1] - y))
            return torso_tmp.c[i].copy()

        for nm, f in [("tail1", 0.13), ("tail2", 0.36), ("tail3", 0.58), ("tail4", 0.78)]:
            self.rest[nm] = spine_at_y(-f * T)
        self.rest["spine"] = spine_at_y(self.body_pitch(0.2 * H * tl, H)[0])
        self.rest["chest"] = spine_at_y(self.body_pitch(0.4 * H * tl, H)[0])
        self.rest["neck1"] = S.copy()
        self.rest["neck2"] = np.array(torso_tmp.c[np.argmin(np.linalg.norm(torso_tmp.c - (S + (E - S) * 0.55), axis=1))])
        self.rest["head"] = self.hp(0.04, 0, -0.03)
        self.rest["jaw"] = self.hp(0.04, 0, self.head_at(head, 0.04)[0] - self.head_at(head, 0.04)[3] - 0.02)
        names_s = ["tail4", "tail3", "tail2", "tail1", "pelvis", "spine", "chest", "neck1", "neck2", "head"]
        sb = {nm: torso_tmp.arc_of(self.rest[nm]) for nm in names_s}
        stip = 0.0
        st = []
        st.append((stip, {"tail4": 1}))
        st.append((sb["tail4"] / 2, {"tail4": 1}))
        st.append(((sb["tail4"] + sb["tail3"]) / 2, {"tail3": 1}))
        st.append(((sb["tail3"] + sb["tail2"]) / 2, {"tail2": 1}))
        st.append(((sb["tail2"] + sb["tail1"]) / 2, {"tail1": 1}))
        st.append(((sb["tail1"] + sb["spine"]) / 2, {"pelvis": 1}))
        st.append(((sb["spine"] + sb["chest"]) / 2, {"spine": 1}))
        st.append(((sb["chest"] + sb["neck1"]) / 2, {"chest": 1}))
        st.append(((sb["neck1"] + sb["neck2"]) / 2, {"neck1": 1}))
        st.append(((sb["neck2"] + sb["head"]) / 2, {"neck2": 1}))
        st.append((sb["head"], {"neck2": 0.5, "head": 0.5}))
        st.append((torso_tmp.s[-1] + 1, {"head": 1}))
        torso = Tube("torso", rows, per=8, k=0, stations=st, dors=True, attrs=dict(part=1.0))
        self.torso = torso
        ops = [torso]
        # ---- skull
        hrows = []
        for u, zc, aa, bt, bb, n in head:
            c = self.hp(u, 0, zc)
            hrows.append((0, c[1], c[2], aa * HL, bt * HL, bb * HL, n))
        skull = Tube("skull", hrows, per=4, k=0.07 * H, stations=[(0, {"head": 0.8, "neck2": 0.2}), (0.15 * HL, {"head": 1}), (9, {"head": 1})],
                     dors=True, attrs=dict(face=1.0, part=2.0))
        self.skull = skull
        ops.append(skull)
        # cheek / jaw-muscle bulges (wide at the back of the head)
        ap, by = P["apex"], P["baby"]
        for sgn in (1, -1):
            zc, aa, bt, bb = self.head_at(head, 0.12)
            ops.append(Ell("cheek", self.hp(0.13, sgn * aa * 0.62, zc - bb * 0.35),
                           np.array([0.085, 0.15, 0.10]) * HL * (1 + 0.25 * ap - 0.3 * by), k=0.04 * HL, attrs=dict(face=1.0)))
        # eyes: socket, brow ridge, lower lid
        self.eyes = []
        eye_u = 0.25 + 0.03 * by
        zc, aa, bt, bb = self.head_at(head, eye_u)
        er = P["eye"] * HL
        ez = zc + bt * (0.35 + 0.1 * by)
        n_e = np.interp(eye_u, head[:, 0], head[:, 5])
        xs = aa * (1 - min(abs((ez - zc) / bt), 0.98) ** n_e) ** (1 / n_e)
        for sgn in (1, -1):
            gaze = nrm([sgn * 0.84, 0.50 + 0.1 * by, 0.08])
            gaze = np.array([gaze[0], *(np.array([[self.hf[1], self.hu[1]], [self.hf[2], self.hu[2]]]) @ gaze[1:])])
            ctr = self.hp(eye_u, 0, ez) + X * sgn * (xs * HL - er * 0.42)
            self.eyes.append((ctr, nrm(gaze), er))
            ops.append(Ell("socket", ctr + gaze * er * 0.3, [er * 1.12] * 3, k=0.012 * HL, mode="sub"))
            # brow ridge: long, overhanging the eye, front end lower
            bs = P["brow"]
            Rb = rot_between([0, 1, 0], nrm(self.hf + self.hu * 0.12)) @ rz(-sgn * 8)
            ops.append(Ell("brow", ctr + self.hu * er * (0.95 + 0.1 * bs) + X * sgn * (-er * 0.15) + self.hf * er * 0.15,
                           np.array([er * 0.62, er * (1.5 + 0.35 * bs), er * (0.42 + 0.12 * bs)]) * (0.9 + 0.1 * bs),
                           R=Rb, k=0.03 * HL, attrs=dict(face=1.0)))
            if ap > 0.2:  # postorbital boss behind the eye
                ops.append(Ell("boss", ctr + self.hu * er * 0.9 - self.hf * er * 1.25 + X * sgn * (-er * 0.1),
                               np.array([0.7, 0.8, 0.65]) * er * (0.6 + 0.6 * ap), k=0.03 * HL, attrs=dict(face=1.0)))
            # lower lid
            ops.append(Ell("lid", ctr - self.hu * er * 0.85 + X * sgn * (-er * 0.2) + self.hf * er * 0.05,
                           np.array([er * 0.45, er * 1.05, er * 0.32]), k=0.02 * HL, attrs=dict(face=1.0)))
            # nostril: rim bump + pit
            zc2, a2, bt2, bb2 = self.head_at(head, 0.9)
            nc = self.hp(0.905, sgn * a2 * 0.45, zc2 + bt2 * 0.62)
            ops.append(Ell("nrim", nc, np.array([0.04, 0.055, 0.03]) * HL, k=0.015 * HL, attrs=dict(face=1.0)))
            ops.append(Ell("nostril", nc + X * sgn * 0.012 * HL + self.hu * 0.014 * HL, np.array([0.02, 0.03, 0.016]) * HL,
                           k=0.008 * HL, mode="sub"))
            self.nostrils = getattr(self, "nostrils", []) + [nc]
        # ---- dorsal scutes (part of the skin: small fused bumps, not stuck-on discs)
        self.crest_pts = []
        cs = P["crest"]
        spike = P["spike"]
        hb = H * 0.036 * cs
        sp = H * 0.085 * (0.85 + 0.15 * cs)
        s0 = torso.arc_of(self.rest["tail1"] + np.array([0, -0.55 * T, 0]))
        s1 = torso.s[-1] - 0.02 * H
        s = s1
        i = 0
        while s > s0:
            c, b, u, aa, bt, bb, n = torso.ring(s)
            frac = (s - s0) / (s1 - s0)
            prof = (0.55 + 0.45 * smoothstep(0.0, 0.35, frac)) * (1.0 - 0.25 * smoothstep(0.8, 1.0, frac))
            prof *= 1.0 + 0.15 * math.sin(i * 1.7)  # irregular
            p, nn = torso.surface(s, 0.0)
            tdir = nrm(np.cross(u, b))
            Rm = np.column_stack([b, tdir, u]) @ rx(18 + 15 * spike)
            r3 = np.array([hb * 0.7, hb * (1.05 - 0.2 * spike), hb * (1.5 + 0.8 * spike)]) * prof
            ops.append(Ell("crest", p - nn * hb * 0.6 * prof, r3, R=Rm, k=0.006 * H, attrs=dict(crest=1.0)))
            self.crest_pts.append(p)
            # paramedian rows of osteoderm bumps over neck / back / tail base
            if i % 2 == 0 and frac > 0.25:
                for sgn in (1, -1):
                    pp, n2 = torso.surface(s - sp * 0.5, sgn * 0.62)
                    Rm2 = rot_between([0, 0, 1], n2)
                    ops.append(Ell("scute", pp - n2 * hb * 0.35 * prof, np.array([hb * 0.8, hb * 1.0, hb * 0.8]) * prof * 0.75,
                                   R=Rm2, k=0.012 * H, attrs=dict(crest=0.6)))
            s -= sp * (0.8 + 0.2 * prof)
            i += 1
        # scutes over the skull top, behind the brows
        for j, u in enumerate([0.36, 0.25, 0.14, 0.04]):
            zc, aa, bt, bb = self.head_at(head, u)
            p = self.hp(u, 0, zc + bt * 0.98)
            r3 = np.array([hb * 0.7, hb * 1.0, hb * (1.1 + 0.6 * spike)]) * (0.6 + 0.12 * j)
            ops.append(Ell("crest", p - self.hu * hb * 0.5, r3, R=np.column_stack([X, self.hf, self.hu]) @ rx(25), k=0.01 * H,
                           attrs=dict(crest=1.0)))
        # ---- legs
        th = P["thigh"]
        legs = {
            0: dict(knee=(.24, .17, .55), ankle=(.22, -.10, .225), ball=(.21, .03, .05)),
            1: dict(knee=(.225, .15, .60), ankle=(.205, -.15, .27), ball=(.20, .015, .045)),
            2: dict(knee=(.235, .17, .56), ankle=(.215, -.13, .235), ball=(.205, .03, .045)),
            3: dict(knee=(.245, .18, .55), ankle=(.22, -.12, .225), ball=(.215, .04, .045)),
        }[self.stage]
        hipx = 0.2 * (0.75 + 0.25 * tw)
        self.leg_info = {}
        for side, sgn in (("L", -1), ("R", 1)):
            hip = np.array([sgn * hipx, 0.0, 1.0]) * H
            knee = np.array([sgn * legs["knee"][0] * (0.8 + 0.2 * tw), legs["knee"][1], legs["knee"][2]]) * H
            ankle = np.array([sgn * legs["ankle"][0] * (0.8 + 0.2 * tw), legs["ankle"][1], legs["ankle"][2]]) * H
            ball = np.array([sgn * legs["ball"][0] * (0.8 + 0.2 * tw), legs["ball"][1], legs["ball"][2]]) * H
            self.rest["thigh_" + side], self.rest["shin_" + side] = hip, knee
            self.rest["foot_" + side], self.rest["toes_" + side] = ankle, ball
            self.leg_info[side] = (hip, knee, ankle, ball)
            tdir = nrm(knee - hip)
            top = hip + np.array([-sgn * 0.06, -0.02, 0.17]) * H
            T_ = lambda p, aa, bt, bb, n=2.1: (p[0], p[1], p[2], aa * H * th, bt * H * th, bb * H * th, n)  # noqa: E731
            thigh_rows = [
                T_(top, .04, .04, .04), T_((top + hip) / 2, .15, .17, .2), T_(hip, .205, .22, .265),
                T_(hip + (knee - hip) * 0.35, .19, .2, .23), T_(hip + (knee - hip) * 0.7, .135, .13, .155), T_(knee, .09, .088, .095),
                T_(knee + tdir * 0.05 * H, .05, .05, .05),
            ]
            sh = np.linalg.norm(knee - hip)
            thigh = Tube("thigh", thigh_rows, per=3, k=0.10 * H,
                         stations=[(0, {"pelvis": 0.65, "thigh_" + side: 0.35}), (0.16 * H, {"pelvis": 0.25, "thigh_" + side: 0.75}),
                                   (0.3 * H, {"thigh_" + side: 1}), (0.14 * H + sh * 0.8, {"thigh_" + side: 1}),
                                   (0.14 * H + sh * 1.0, {"thigh_" + side: 0.5, "shin_" + side: 0.5}), (9, {"shin_" + side: 1})],
                         attrs=dict(limb=0.35))
            ops.append(thigh)
            sdir = nrm(ankle - knee)
            ls = np.linalg.norm(ankle - knee)
            th2 = (0.85 + 0.15 * th) * 1.18
            S_ = lambda p, aa, bt, bb: (p[0], p[1], p[2], aa * H * th2, bt * H * th2, bb * H * th2, 2.1)  # noqa: E731
            shin_rows = [S_(knee - sdir * 0.03 * H, .085, .075, .095), S_(knee + sdir * ls * 0.25, .088, .068, .118),
                         S_(knee + sdir * ls * 0.6, .066, .055, .075), S_(ankle, .056, .05, .055), S_(ankle + sdir * 0.04 * H, .04, .04, .04)]
            ops.append(Tube("shin", shin_rows, per=3, k=0.04 * H,
                            stations=[(0, {"thigh_" + side: 0.45, "shin_" + side: 0.55}), (ls * 0.3, {"shin_" + side: 1}),
                                      (ls * 0.85, {"shin_" + side: 1}), (ls * 1.03, {"shin_" + side: 0.5, "foot_" + side: 0.5}),
                                      (9, {"foot_" + side: 1})],
                            attrs=dict(limb=1.0)))
            mdir = nrm(ball - ankle)
            lm = np.linalg.norm(ball - ankle)
            to = P["toe"]
            M_ = lambda p, aa, bt, bb: (p[0], p[1], p[2], aa * H * to, bt * H * to, bb * H * to, 2.1)  # noqa: E731
            met_rows = [M_(ankle - mdir * 0.02 * H, .055, .05, .052), M_(ankle + mdir * lm * 0.5, .05, .045, .046),
                        M_(ball, .056, .05, .045)]
            ops.append(Tube("met", met_rows, per=3, k=0.03 * H,
                            stations=[(0, {"shin_" + side: 0.5, "foot_" + side: 0.5}), (lm * 0.3, {"foot_" + side: 1}),
                                      (lm * 0.95, {"foot_" + side: 0.7, "toes_" + side: 0.3}), (9, {"toes_" + side: 0.5, "foot_" + side: 0.5})],
                            attrs=dict(limb=1.0)))
            ops.append(Ell("ankle", ankle, np.array([0.052, 0.06, 0.06]) * H * th2, k=0.03 * H, attrs=dict(limb=1.0)))
            ops.append(Ell("pad", ball + np.array([0, 0.01, -0.005]) * H, np.array([0.075, 0.085, 0.045]) * H * to, k=0.03 * H,
                           stations={"foot_" + side: 0.4, "toes_" + side: 0.6}, attrs=dict(limb=1.0)))
            claws = []
            for ang, ln, wf in [(-17, 0.17, 0.85), (3, 0.225, 1.0), (23, 0.19, 0.9)]:
                d = rz(-sgn * ang) @ np.array([0, 1.0, 0])
                ln = ln * H * to * (1.0 - 0.1 * P["baby"])
                base = ball + np.array([sgn * 0.012 * H * (ang / 20), 0, 0])
                z0, z1 = 0.045 * H * to, 0.022 * H * to
                pts = [base, base + d * ln * 0.4, base + d * ln * 0.75, base + d * ln]
                zz = [z0, z0 * 0.92, z0 * 0.7, z1]
                rr = [(.046, .038, .032), (.04, .034, .028), (.036, .03, .024), (.022, .02, .016)]
                trows = [(p[0], p[1], zq, r[0] * H * to * wf, r[1] * H * to * wf, r[2] * H * to * wf, 2.2) for p, zq, r in zip(pts, zz, rr)]
                q = pts[-1] + d * 0.012 * H
                trows.append((q[0], q[1], z1 * 0.9, .01 * H, .01 * H, .008 * H, 2.0))
                ops.append(Tube("toe", trows, per=3, k=0.022 * H,
                                stations=[(0, {"foot_" + side: 0.3, "toes_" + side: 0.7}), (0.05 * H, {"toes_" + side: 1}), (9, {"toes_" + side: 1})],
                                attrs=dict(limb=1.0)))
                tip = pts[-1].copy()
                tip[2] = z1
                claws.append((tip + d * 0.004 * H, d, 0.07 * H * to * wf, 0.02 * H * to * wf, "toes_" + side))
            self.leg_info[side] = (hip, knee, ankle, ball, claws)
        # ---- arms (tiny, two-fingered)
        am = P["arm"]
        self.arm_claws = []
        for side, sgn in (("L", -1), ("R", 1)):
            sh = self.rest["chest"] + np.array([sgn * 0.17 * tw, 0.08 * tl, -0.11]) * H
            el = sh + np.array([sgn * 0.045, 0.03, -0.16]) * H * am
            wr = el + np.array([-sgn * 0.01, 0.11, -0.02]) * H * am
            self.rest["arm_" + side], self.rest["fore_" + side], self.rest["hand_" + side] = sh, el, wr
            A_ = lambda p, r: (p[0], p[1], p[2], r * H * am, r * H * am, r * H * am, 2.0)  # noqa: E731
            ops.append(Tube("uarm", [A_(sh - (el - sh) * 0.3, .06), A_(sh, .055), A_((sh + el) / 2, .045), A_(el, .036)], per=3, k=0.04 * H,
                            stations=[(0, {"chest": 1}), (0.05 * H * am, {"chest": 0.4, "arm_" + side: 0.6}),
                                      (0.1 * H * am, {"arm_" + side: 1}), (0.2 * H * am, {"arm_" + side: 0.6, "fore_" + side: 0.4}),
                                      (9, {"fore_" + side: 1})],
                            attrs=dict(limb=0.6)))
            ops.append(Tube("farm", [A_(el, .036), A_((el + wr) / 2, .03), A_(wr, .027), A_(wr + (wr - el) * 0.15, .02)], per=3, k=0.015 * H,
                            stations=[(0, {"arm_" + side: 0.4, "fore_" + side: 0.6}), (0.04 * H * am, {"fore_" + side: 1}),
                                      (0.1 * H * am, {"fore_" + side: 0.6, "hand_" + side: 0.4}), (9, {"hand_" + side: 1})],
                            attrs=dict(limb=0.8)))
            for fa in (-14, 14):
                d = nrm(rz(fa) @ nrm(wr - el) + np.array([0, 0, -0.55]))
                f0 = wr + d * 0.01 * H
                f1 = wr + d * 0.07 * H * am
                ops.append(Tube("finger", [A_(f0, .02), A_((f0 + f1) / 2, .017), A_(f1, .013), A_(f1 + d * 0.01 * H, .008)], per=2,
                                k=0.01 * H, stations=[(0, {"hand_" + side: 1}), (9, {"hand_" + side: 1})], attrs=dict(limb=0.9)))
                cd = nrm(d + np.array([0, 0, -0.5]))
                self.arm_claws.append((f1 + d * 0.006 * H, cd, 0.04 * H * am, 0.011 * H * am, "hand_" + side))
        self.body_ops = ops
        # ---- lower jaw (separate field)
        jrows = []
        for u, zt, aa, bt, bb, n in self.jaw_rows(head):
            c = self.hp(u, 0, zt - bt)
            jrows.append((0, c[1], c[2], aa * HL, bt * HL, bb * HL, n))
        self.jaw_tube = Tube("jaw", jrows, per=4, stations=[(0, {"jaw": 1}), (9, {"jaw": 1})], dors=True, attrs=dict(face=1.0, part=3.0))
        jaw_ops = [self.jaw_tube]
        for sgn in (1, -1):  # chin / jaw-muscle swell at the back of the jaw
            zc, aa, bt, bb = self.head_at(head, 0.12)
            ops_c = self.hp(0.16, sgn * aa * 0.55, zc - bb - 0.11 * P["jaw"])
            jaw_ops.append(Ell("jawswell", ops_c, np.array([0.07, 0.16, 0.08]) * HL * (1 + 0.25 * ap), k=0.03 * HL,
                               stations={"jaw": 1}, attrs=dict(face=1.0)))
        self.jaw_ops = jaw_ops

    # ---------------------------------------------------------------- mesh + attributes
    def voxel(self):
        return max(self.L / 330.0, 0.0055)

    def make(self):
        P, H, HL = self.P, self.H, self.HL
        vx = self.voxel()
        V, Q = mesh_field(self.body_ops, vx, smooth_iters=3, label="body")
        VJ, QJ = mesh_field(self.jaw_ops, vx, smooth_iters=3, label="jaw")
        parts = []  # (verts, faces, material, weightsW, attrs dict)
        Wb, Ab = self.skin(V, self.body_ops)
        parts.append((V, Q, 0, Wb, Ab))
        Wj, Aj = self.skin(VJ, self.jaw_ops)
        Wj[:] = 0
        Wj[:, self.bi["jaw"]] = 1
        parts.append((VJ, QJ, 0, Wj, Aj))
        parts += self.extras()
        return parts

    def skin(self, V, ops):
        """bone weights (N, B) + skin attributes by soft membership over parts."""
        B = len(self.BONES)
        N = len(V)
        H = self.H
        tau = 0.035 * H
        tau_a = 0.012 * H
        wparts, aparts = [], []
        for op in ops:
            if op.mode != "union":
                continue
            m = 0.25 * H
            mask = np.all((V >= op.lo - m) & (V <= op.hi + m), axis=1)
            idx = np.nonzero(mask)[0]
            d = np.full(N, BIG, np.float64)
            s = np.zeros(N)
            vv = np.zeros(N)
            ww = np.zeros(N)
            if len(idx):
                r = op.eval(V[idx].astype(F), local=True)
                d[idx], s[idx], vv[idx], ww[idx] = r
            if op.stations is not None:
                Wp = np.zeros((N, B))
                if isinstance(op.stations, dict):
                    for bn, w in op.stations.items():
                        Wp[:, self.bi[bn]] = w
                else:
                    xs = np.array([x for x, _ in op.stations])
                    for bn in {b for _, dct in op.stations for b in dct}:
                        ys = np.array([dct.get(bn, 0.0) for _, dct in op.stations])
                        Wp[:, self.bi[bn]] = np.interp(s, xs, ys)
                wparts.append((d, Wp))
            at = dict(op.attrs)
            if op.dors:
                at["dors"] = ww / np.sqrt(vv * vv + ww * ww + 1e-6)
            else:
                at.setdefault("dors", DORS_DEFAULT.get(op.name, 0.3))
            aparts.append((d, at))
        dmin = np.min([d for d, _ in wparts], axis=0)
        Wsum = np.zeros((N, B))
        msum = np.zeros(N)
        for d, Wp in wparts:
            m = np.exp(-np.clip(d - dmin, 0, 50 * tau) / tau)
            Wsum += m[:, None] * Wp
            msum += m
        W = Wsum / msum[:, None]
        W[W < 0.02] = 0
        W /= W.sum(1, keepdims=True)
        # attributes
        keys = ["dors", "limb", "crest", "face", "part"]
        acc = {k: np.zeros(N) for k in keys}
        dmin = np.min([d for d, _ in aparts], axis=0)
        msum = np.zeros(N)
        for d, at in aparts:
            m = np.exp(-np.clip(d - dmin, 0, 50 * tau_a) / tau_a)
            msum += m
            for k in keys:
                acc[k] += m * at.get(k, 0.0)
        for k in keys:
            acc[k] = acc[k] / msum
        # primary part id (for masks): torso 1, skull 2, jaw 3, other 0
        return W, acc

    def extras(self):
        """eyes, teeth, claws, mouth interior: explicit meshes, rigidly weighted."""
        P, H, HL = self.P, self.H, self.HL
        B = len(self.BONES)
        out = []

        def rigid(n, bone):
            W = np.zeros((n, B))
            W[:, self.bi[bone]] = 1
            return W

        # eyes
        for ctr, gaze, r in self.eyes:
            ex = nrm(np.cross([0, 0, 1.0], gaze))
            ey = np.cross(gaze, ex)
            nu, nv = 28, 18
            vs, loc = [], []
            for j in range(nv + 1):
                th = math.pi * j / nv
                for i in range(nu):
                    ph = 2 * math.pi * i / nu
                    l = np.array([math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph)])
                    loc.append(l)
                    vs.append(ctr + r * (l[0] * ex + l[1] * ey + l[2] * gaze))
            fs = []
            for j in range(nv):
                for i in range(nu):
                    a, b = j * nu + i, j * nu + (i + 1) % nu
                    fs.append((a, a + nu, b + nu, b))
            V = np.array(vs)
            out.append((V, np.array(fs), 1, rigid(len(V), "head"), dict(eyeloc=np.array(loc))))
        # teeth
        head = self.head_tab
        nt = P["teeth"]
        tl_ = HL * (0.062 - 0.014 * P["baby"])
        for upper in (True, False):
            for sgn in (1, -1):
                us = np.linspace(0.30 if upper else 0.36, 0.95, nt)
                for j, u in enumerate(us):
                    zc, aa, bt, bb = self.head_at(head, u)
                    sz = (0.75 + 0.45 * math.sin(math.pi * (j + 0.5) / nt)) * (1.0 if j % 3 else 0.85)
                    ln = tl_ * sz * (1.0 if upper else 0.8)
                    if upper:
                        base = self.hp(u, sgn * aa * 0.76, zc - bb + 0.022)
                        tipd = nrm(-self.hu - self.hf * 0.22 + np.array([sgn * 0.22, 0, 0]))
                        bone = "head"
                    else:
                        jt = self.jaw_tube
                        base = self.hp(u, sgn * aa * 0.62, zc - bb + 0.0)
                        tipd = nrm(self.hu - self.hf * 0.15)
                        bone = "jaw"
                    V, Fc = cone(base, tipd, ln, ln * 0.33, curve=0.2, back=-self.hf)
                    out.append((V, Fc, 2, rigid(len(V), bone), {}))
        # claws
        for side in ("L", "R"):
            for tip, d, ln, r0, bone in self.leg_info[side][4]:
                dd = nrm(d + np.array([0, 0, -0.35]))
                V, Fc = cone(tip - dd * ln * 0.25, dd, ln, r0, curve=0.45, back=np.array([0, 0, 1.0]), seg=10)
                out.append((V, Fc, 3, rigid(len(V), bone), {}))
        for tip, d, ln, r0, bone in self.arm_claws:
            V, Fc = cone(tip - d * ln * 0.2, d, ln, r0, curve=0.45, back=np.array([0, 0, 1.0]), seg=8)
            out.append((V, Fc, 3, rigid(len(V), bone), {}))
        # mouth interior: a soft wall between palate and tongue, inset from the lips
        rows, wj = [], []
        nring = 20
        us = np.linspace(0.02, 0.86, 16)
        for u in us:
            zc, aa, bt, bb = self.head_at(head, u)
            m = zc - bb
            w = aa * 0.62 * (1 - 0.5 * smoothstep(0.6, 0.86, u))
            for i in range(nring):
                ph = 2 * math.pi * i / nring
                lat, z = math.sin(ph) * w, math.cos(ph) * 0.05
                rows.append(self.hp(u, lat, m + z))
                wj.append(smoothstep(0.035, -0.035, z))
        V = np.array(rows)
        fs = []
        for j in range(len(us) - 1):
            for i in range(nring):
                a, b = j * nring + i, j * nring + (i + 1) % nring
                fs.append((a, b, b + nring, a + nring))
        fs.append(tuple(range(nring))[::-1])
        fs.append(tuple(range((len(us) - 1) * nring, len(us) * nring)))
        W = np.zeros((len(V), B))
        W[:, self.bi["jaw"]] = wj
        W[:, self.bi["head"]] = 1 - np.array(wj)
        out.append((V, fs, 4, W, {}))
        return out


def cone(base, d, ln, r0, curve=0.2, back=None, seg=8, rings=4):
    d = nrm(d)
    side = nrm(np.cross(d, back if back is not None else [0, 0, 1.0]))
    if np.linalg.norm(side) < 1e-6:
        side = nrm(np.cross(d, [1.0, 0, 0]))
    up = np.cross(side, d)
    vs = []
    for j in range(rings):
        t = j / rings
        c = base + d * ln * t + (-up) * curve * ln * t * t
        r = r0 * (1 - t) ** 0.9
        for i in range(seg):
            ph = 2 * math.pi * i / seg
            vs.append(c + (side * math.cos(ph) + up * math.sin(ph)) * r)
    vs.append(base + d * ln + (-up) * curve * ln)
    fs = []
    for j in range(rings - 1):
        for i in range(seg):
            a, b = j * seg + i, j * seg + (i + 1) % seg
            fs.append((a, b, b + seg, a + seg))
    tip = len(vs) - 1
    for i in range(seg):
        a, b = (rings - 1) * seg + i, (rings - 1) * seg + (i + 1) % seg
        fs.append((a, b, tip))
    fs.append(tuple(range(seg))[::-1])
    return np.array(vs), fs


# =========================================================================== assembly + cache


def cache_path(stage):
    return os.path.join(REPO, ".scratch", "rex", "cache", f"rex_{stage}.npz")


def build_model(stage, rebuild=False):
    rex = Rex(stage)
    path = cache_path(stage)
    if os.path.exists(path) and not rebuild:
        z = np.load(path, allow_pickle=True)
        return rex, dict(z)
    t0 = time.time()
    parts = rex.make()
    Vs, faces, mats, Ws = [], [], [], []
    attrs = {k: [] for k in ("dors", "limb", "crest", "face", "part", "cream", "mouth", "scar", "nost")}
    eyeloc = []
    off = 0
    for V, Fc, mat, W, at in parts:
        n = len(V)
        Vs.append(V)
        Ws.append(W)
        for f in Fc:
            faces.append([int(x) + off for x in f])
            mats.append(mat)
        for k in ("dors", "limb", "crest", "face", "part"):
            attrs[k].append(np.asarray(at.get(k, np.zeros(n))) * np.ones(n))
        eyeloc.append(at.get("eyeloc", np.zeros((n, 3))))
        off += n
    V = np.concatenate(Vs)
    W = np.concatenate(Ws)
    A = {k: np.concatenate(v) for k, v in attrs.items() if v}
    ns = [len(p[0]) for p in parts]
    # derived masks (skin only)
    nb, nj = ns[0], ns[1]
    dors = A["dors"]
    part = A["part"]
    cream = np.zeros(len(V))
    mouth = np.zeros(len(V))
    body = slice(0, nb)
    jaw = slice(nb, nb + nj)
    H = rex.H
    # belly/throat/tail-underside cream on the torso tube
    torso_m = smoothstep(0.5, 0.9, part[body]) * (1 - smoothstep(1.2, 1.6, part[body]))
    limb = A["limb"][body]
    cream_b = smoothstep(-0.12, -0.5, dors[body]) * (1 - smoothstep(0.2, 0.6, limb))
    # skull: cream lip band low on the upper jaw; palate (bottom face) = mouth
    sk = smoothstep(1.5, 1.9, part[body])
    lip = smoothstep(-0.30, -0.55, dors[body])
    palate = smoothstep(-0.80, -0.92, dors[body])
    cream[body] = cream_b * (1 - sk) + sk * lip * (1 - palate)
    mouth[body] = sk * palate
    # jaw: cream except the top (tongue/gum)
    mj = smoothstep(0.55, 0.85, dors[jaw])
    cream[jaw] = 1 - mj
    mouth[jaw] = mj
    A["cream"], A["mouth"] = cream, mouth
    # nostril dark mask
    nost = np.zeros(len(V))
    for nc in rex.nostrils:
        dd = np.linalg.norm(V - nc, axis=1)
        nost = np.maximum(nost, smoothstep(0.045 * rex.HL, 0.02 * rex.HL, dd))
    nost[nb + nj:] = 0
    A["nost"] = nost
    # scars (apex): three claw rakes across the right cheek, two across the right shoulder
    scar = np.zeros(len(V))
    if rex.P["scars"]:
        segs = []
        for k in range(3):
            o = k * 0.075
            segs.append((rex.hp(0.40 + o, 0, 0.13), rex.hp(0.55 + o, 0, -0.10)))
        for k in range(2):
            o = k * 0.07 * H
            segs.append((np.array([0, 0.28 * H + o, 1.25 * H]), np.array([0, 0.40 * H + o, 0.95 * H])))
        sel = np.zeros(len(V), bool)
        sel[:nb + nj] = V[:nb + nj, 0] > 0.0
        P2 = V[:, 1:]
        for a, b in segs:
            a2, b2 = a[1:], b[1:]
            ab = b2 - a2
            t = np.clip(((P2 - a2) @ ab) / (ab @ ab), 0, 1)
            dd = np.linalg.norm(P2 - (a2 + t[:, None] * ab), axis=1)
            w = 0.012 * rex.L * (1 - 0.6 * np.abs(2 * t - 1))
            scar = np.maximum(scar, smoothstep(w, w * 0.3, dd) * sel)
    A["scar"] = scar
    E = np.concatenate(eyeloc)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fl = np.array([len(f) for f in faces], np.int32)
    fi = np.concatenate([np.array(f, np.int64) for f in faces])
    out = dict(V=V.astype(np.float32), W=W.astype(np.float32), fl=fl, fi=fi, mat=np.array(mats, np.int16),
               eyeloc=E.astype(np.float32), ns=np.array(ns), **{k: v.astype(np.float32) for k, v in A.items()})
    np.savez_compressed(path, **out)
    print(f"model rex_{stage}: {len(V)} verts, {len(faces)} faces, built in {time.time() - t0:.1f}s", flush=True)
    return rex, out


# =========================================================================== rig / pose


class Rig:
    def __init__(self, rex, model):
        self.rex = rex
        self.names = [b for b, _ in rex.BONES]
        self.parent = {b: p for b, p in rex.BONES}
        self.rest = {b: np.asarray(rex.rest[b], dtype=np.float64) for b in self.names}
        self.V0 = model["V"].astype(np.float64)
        self.W = model["W"].astype(np.float64)
        self.active = [j for j in range(len(self.names)) if self.W[:, j].max() > 0]
        self.idx = {j: np.nonzero(self.W[:, j] > 0)[0] for j in self.active}

    def solve(self, pose):
        H = self.rex.H
        rot = pose.get("rot", {})
        Rg, Pg = {}, {}
        for b in self.names:
            p = self.parent[b]
            Rl = euler(rot.get(b, (0, 0, 0)))
            if p is None:
                Rg[b] = Rl
                Pg[b] = self.rest[b] + np.asarray(pose.get("off", (0, 0, 0))) * H
            else:
                Rg[b] = Rg[p] @ Rl
                Pg[b] = Pg[p] + Rg[p] @ (self.rest[b] - self.rest[p])
        feet = pose.get("feet", {})
        for side in ("L", "R"):
            hip0, knee0, ank0, ball0 = [self.rest[n + "_" + side] for n in ("thigh", "shin", "foot", "toes")]
            ft = feet.get(side, {})
            hip = Pg["thigh_" + side]
            B = ball0 + np.array([ft.get("dx", 0.0), ft.get("dy", 0.0), ft.get("dz", 0.0)]) * H
            yaw = ft.get("yaw", 0.0)
            Rm = rz(yaw) @ rx(ft.get("pitch", 0.0))
            A = B + Rm @ (ank0 - ball0)
            l1, l2, l3 = (np.linalg.norm(knee0 - hip0), np.linalg.norm(ank0 - knee0), np.linalg.norm(ball0 - ank0))
            D = A - hip
            d = np.linalg.norm(D)
            dcl = np.clip(d, abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9995)
            Dn = D / max(d, 1e-9)
            pole0 = (knee0 - hip0) - np.dot(knee0 - hip0, nrm(ank0 - hip0)) * nrm(ank0 - hip0)
            pole = Rg["pelvis"] @ rz(yaw * 0.6) @ nrm(pole0)
            pole = nrm(pole - np.dot(pole, Dn) * Dn)
            ca = (l1 * l1 + dcl * dcl - l2 * l2) / (2 * l1 * dcl)
            sa = math.sqrt(max(0.0, 1 - ca * ca))
            tdir = ca * Dn + sa * pole
            knee = hip + l1 * tdir
            sdir = nrm(A - knee)
            ank = knee + l2 * sdir
            mdir = nrm(B - ank)
            ball = ank + l3 * mdir
            Rg["thigh_" + side] = rot_between(knee0 - hip0, tdir)
            Rg["shin_" + side] = rot_between(ank0 - knee0, sdir)
            Rg["foot_" + side] = rot_between(ball0 - ank0, mdir)
            Rg["toes_" + side] = rz(yaw) @ rx(-ft.get("curl", 0.0))
            Pg["shin_" + side], Pg["foot_" + side], Pg["toes_" + side] = knee, ank, ball
        return Rg, Pg

    def deform(self, pose):
        Rg, Pg = self.solve(pose)
        sc = pose.get("scale", {})
        out = np.zeros_like(self.V0)
        for j in self.active:
            b = self.names[j]
            ii = self.idx[j]
            s = sc.get(b, 1.0)
            v = (self.V0[ii] - self.rest[b]) * s
            out[ii] += self.W[ii, j:j + 1] * (v @ Rg[b].T + Pg[b])
        return out


# --------------------------------------------------------------------------- poses


def lerpk(keys, i):
    return keys[i]


def base_pose():
    return dict(off=np.zeros(3), rot={}, scale={}, feet={"L": {}, "R": {}})


def addrot(p, b, r):
    o = p["rot"].get(b, (0, 0, 0))
    p["rot"][b] = (o[0] + r[0], o[1] + r[1], o[2] + r[2])


def tail_wave(p, yaw, pitch, phase=0.0, lag=0.12, t=0.0):
    for k, b in enumerate(("tail1", "tail2", "tail3", "tail4")):
        ph = 2 * math.pi * (t - lag * (k + 1)) + phase
        addrot(p, b, (pitch * (0.6 + 0.2 * k) * math.cos(ph * 2), 0, yaw * (0.5 + 0.25 * k) * math.sin(ph)))


def pose_idle(i, n, P):
    t = i / n
    br = math.sin(2 * math.pi * t)
    p = base_pose()
    p["off"] = np.array([0, 0, 0.006 * br - 0.004])
    p["scale"] = {"chest": 1 + 0.018 * br, "spine": 1 + 0.008 * br}
    addrot(p, "pelvis", (0.6 * br, 0, 0))
    addrot(p, "neck1", (1.5 * br, 0, 1.2 * math.sin(2 * math.pi * t + 0.8)))
    addrot(p, "head", (-1.4 * br, 1.0 * math.sin(2 * math.pi * t + 1.6), 2.5 * math.sin(2 * math.pi * t + 1.0)))
    addrot(p, "jaw", (-(2.0 + 2.0 * max(0.0, br)), 0, 0))
    for k, b in enumerate(("tail1", "tail2", "tail3", "tail4")):
        ph = 2 * math.pi * (t - 0.1 * k)
        addrot(p, b, (1.2 * math.cos(ph), 0, (2.0 + 1.2 * k) * math.sin(ph)))
    for s, sg in (("L", -1), ("R", 1)):
        addrot(p, "arm_" + s, (6 + 3 * br, 0, 0))
        addrot(p, "fore_" + s, (12 + 4 * math.sin(2 * math.pi * t + 0.5 + sg), 0, 0))
    return p


def pose_run(i, n, P):
    e = P["energy"]
    t = i / n
    beta = 0.42
    sr = 0.34 * (0.9 + 0.1 * e)
    lift = 0.2 * e
    p = base_pose()

    def foot(ph):
        if ph < beta:
            tau = ph / beta
            return dict(dy=sr * (1 - 2 * tau) + 0.04, dz=0.0, pitch=8 - 38 * tau, curl=0.0)
        tau = (ph - beta) / (1 - beta)
        ease = tau * tau * (3 - 2 * tau)
        return dict(dy=-sr + 2 * sr * ease + 0.04, dz=lift * math.sin(math.pi * tau) ** 0.85 + 0.01,
                    pitch=-30 - 25 * math.sin(math.pi * min(1, tau * 1.3)) + 40 * tau ** 2, curl=45 * math.sin(math.pi * tau))

    p["feet"]["L"] = foot(t % 1)
    p["feet"]["R"] = foot((t + 0.5) % 1)
    bob = math.cos(4 * math.pi * (t - beta / 2))
    p["off"] = np.array([0, 0.02, -0.045 - 0.035 * e * bob])
    yaw = 5.5 * math.sin(2 * math.pi * (t + 0.03))
    addrot(p, "pelvis", (-7 - 1.5 * bob, 3.0 * math.sin(2 * math.pi * t), yaw))
    addrot(p, "spine", (1.0, -1.5 * math.sin(2 * math.pi * t), -yaw * 0.4))
    addrot(p, "chest", (1.0, -1.0 * math.sin(2 * math.pi * t), -yaw * 0.4))
    addrot(p, "neck1", (-3 + 1.5 * bob, 0, -yaw * 0.2))
    addrot(p, "neck2", (-1 + 1.0 * math.cos(4 * math.pi * (t - beta / 2 - 0.08)), 0, 0))
    addrot(p, "head", (8 - 3.0 * math.cos(4 * math.pi * (t - beta / 2 - 0.12)), 0, -yaw * 0.25))
    addrot(p, "jaw", (-(5 + 3 * math.sin(4 * math.pi * t)), 0, 0))
    for k, b in enumerate(("tail1", "tail2", "tail3", "tail4")):
        ph = 2 * math.pi * (t - 0.09 * (k + 1))
        addrot(p, b, (2.5 + 2.5 * math.cos(2 * ph - 4 * math.pi * beta / 2), 0, -(4.0 + 2.0 * k) * math.sin(ph)))
    for s, sg in (("L", -1), ("R", 1)):
        sw = math.sin(2 * math.pi * t + (0 if s == "L" else math.pi))
        addrot(p, "arm_" + s, (28 + 10 * sw, 0, 0))
        addrot(p, "fore_" + s, (45 + 8 * sw, 0, 0))
        addrot(p, "hand_" + s, (20, 0, 0))
    return p


def keyed(keys, i):
    k = keys[i]
    p = base_pose()
    p["off"] = np.array([k.get("dx", 0), k.get("dy", 0), k.get("dz", 0)])
    for b in ("pelvis", "spine", "chest", "neck1", "neck2", "head"):
        if b in k:
            addrot(p, b, k[b])
    if "jaw" in k:
        addrot(p, "jaw", (-k["jaw"], 0, 0))
    if "tail" in k:
        for j, b in enumerate(("tail1", "tail2", "tail3", "tail4")):
            tr = k["tail"]
            addrot(p, b, (tr[0] * (0.7 + 0.2 * j), 0, tr[1] * (0.6 + 0.25 * j)))
    for s, sg in (("L", -1), ("R", 1)):
        ar = k.get("arm", (8, 0, 0))
        addrot(p, "arm_" + s, (ar[0], 0, sg * ar[2]))
        addrot(p, "fore_" + s, (k.get("fore", 14), 0, 0))
    if "chest_s" in k:
        p["scale"]["chest"] = k["chest_s"]
        p["scale"]["neck1"] = 1 + (k["chest_s"] - 1) * 0.6
    for s in ("L", "R"):
        if "feet" in k:
            p["feet"][s] = dict(k["feet"].get(s, {}))
    return p


def pose_bite(i, n, P):
    keys = [
        dict(dy=-0.03, dz=-0.03, pelvis=(5, 0, 0), neck1=(7, 0, 0), neck2=(6, 0, 0), head=(9, 0, 0), jaw=16, tail=(4, 0), arm=(14, 0, 0)),
        dict(dy=-0.06, dz=-0.055, pelvis=(8, 0, 0), neck1=(11, 0, 0), neck2=(8, 0, 0), head=(12, 0, 0), jaw=40, tail=(6, 0), arm=(18, 0, 0)),
        dict(dy=0.10, dz=-0.07, pelvis=(-9, 0, 0), neck1=(-14, 0, 0), neck2=(-8, 0, 0), head=(-1, 0, 0), jaw=46, tail=(-5, 0), arm=(-8, 0, 0),
             feet={"L": dict(dy=0.0, pitch=-8), "R": dict(dy=0.0, pitch=-14)}),
        dict(dy=0.14, dz=-0.075, pelvis=(-11, 0, 0), neck1=(-17, 0, 0), neck2=(-10, 0, 0), head=(-6, 0, 0), jaw=0, tail=(-8, 0), arm=(-10, 0, 0),
             feet={"L": dict(dy=0.0, pitch=-10), "R": dict(dy=0.0, pitch=-18)}),
        dict(dy=0.07, dz=-0.045, pelvis=(-5, 0, 0), neck1=(-8, 0, 0), neck2=(-5, 0, 0), head=(-3, 0, 0), jaw=4, tail=(-4, 0), arm=(0, 0, 0)),
        dict(dy=0.02, dz=-0.012, pelvis=(-1.5, 0, 0), neck1=(-2, 0, 0), neck2=(-1, 0, 0), head=(-1, 0, 0), jaw=2, tail=(-1, 0), arm=(6, 0, 0)),
    ]
    return keyed(keys, i)


def pose_dodge(i, n, P):
    keys = [
        dict(dx=-0.02, dz=-0.075, pelvis=(-3, -9, 4), spine=(0, -3, 0), neck1=(0, 0, -4), head=(0, 4, 6), tail=(2, 10), jaw=3,
             feet={"L": dict(dx=-0.01), "R": dict(dx=-0.01)}),
        dict(dx=-0.06, dz=0.11, pelvis=(-6, -17, 9), spine=(0, -4, 0), neck1=(-4, 0, -6), head=(4, 6, 8), tail=(-4, 16), jaw=6, arm=(30, 0, 12),
             feet={"L": dict(dx=-0.09, dz=0.16, dy=0.06, pitch=-25, curl=35), "R": dict(dx=-0.03, dz=0.12, dy=-0.05, pitch=-35, curl=40)}),
        dict(dx=-0.075, dz=0.05, pelvis=(-4, -12, 6), spine=(0, -3, 0), neck1=(-2, 0, -4), head=(2, 4, 6), tail=(-2, 12), jaw=5, arm=(22, 0, 8),
             feet={"L": dict(dx=-0.1, dz=0.05, dy=0.05, pitch=-10, curl=15), "R": dict(dx=-0.05, dz=0.07, dy=-0.03, pitch=-25, curl=25)}),
        dict(dx=-0.05, dz=-0.07, pelvis=(-2, -5, 3), spine=(0, -1, 0), neck1=(2, 0, -2), head=(0, 2, 3), tail=(3, 6), jaw=3,
             feet={"L": dict(dx=-0.09, dy=0.04), "R": dict(dx=-0.03, dy=-0.03)}),
    ]
    return keyed(keys, i)


def pose_hurt(i, n, P):
    keys = [
        dict(dy=-0.05, dz=-0.02, pelvis=(8, 4, -3), neck1=(14, 0, -4), neck2=(6, 0, -3), head=(14, 6, -10), jaw=24, tail=(10, -6), arm=(32, 0, 10), fore=30),
        dict(dy=-0.075, dz=-0.07, pelvis=(4, 6, -5), spine=(0, 3, 0), neck1=(4, 0, -6), neck2=(0, 0, -4), head=(-6, 8, -14), jaw=14, tail=(5, -9),
             arm=(24, 0, 6), fore=26, feet={"L": dict(pitch=6), "R": dict(dy=-0.04, pitch=8)}),
        dict(dy=-0.035, dz=-0.03, pelvis=(2, 2, -2), neck1=(2, 0, -2), head=(-1, 3, -6), jaw=6, tail=(2, -3), arm=(14, 0, 0)),
    ]
    return keyed(keys, i)


def pose_skill(i, n, P):
    a = 0.8 if P["baby"] > 0.5 else 1.0
    jm = 0.78 if P["baby"] > 0.5 else 1.0
    hop = 0.05 if P["baby"] > 0.5 else 0.0
    keys = [
        dict(dz=-0.045, pelvis=(-4, 0, 0), neck1=(-10, 0, 0), neck2=(-6, 0, 0), head=(-8, 0, 0), jaw=6, tail=(4, 0), chest_s=1.04, arm=(10, 0, 0)),
        dict(dz=-0.015, pelvis=(4 * a, 0, 0), neck1=(8 * a, 0, 0), neck2=(8 * a, 0, 0), head=(14 * a, 0, 0), jaw=30 * jm, tail=(-2, 0), chest_s=1.08,
             arm=(24, 0, 10)),
        dict(dz=0.015 + hop, pelvis=(9 * a, 0, 0), neck1=(16 * a, 0, 0), neck2=(12 * a, 0, 0), head=(24 * a, 0, 0), jaw=54 * jm, tail=(-6, 0),
             chest_s=1.12, arm=(40, 0, 22), fore=-5, feet={"L": dict(pitch=-16 - 20 * hop / 0.05), "R": dict(pitch=-16 - 20 * hop / 0.05)}),
        dict(dz=0.012 + hop, pelvis=(9 * a, 0, 0), neck1=(16 * a, 0, 3), neck2=(12 * a, 0, 3), head=(22 * a, 4, 6), jaw=56 * jm, tail=(-6, 4),
             chest_s=1.12, arm=(42, 0, 24), fore=-5, feet={"L": dict(pitch=-16 - 20 * hop / 0.05), "R": dict(pitch=-16 - 20 * hop / 0.05)}),
        dict(dz=0.008 + hop * 0.5, pelvis=(8 * a, 0, 0), neck1=(15 * a, 0, -3), neck2=(11 * a, 0, -3), head=(21 * a, -4, -6), jaw=50 * jm,
             tail=(-5, -4), chest_s=1.11, arm=(38, 0, 20), fore=-3, feet={"L": dict(pitch=-12), "R": dict(pitch=-12)}),
        dict(dz=-0.01, pelvis=(3 * a, 0, 0), neck1=(5 * a, 0, 0), neck2=(4 * a, 0, 0), head=(8 * a, 0, 0), jaw=16 * jm, tail=(-2, 0), chest_s=1.04,
             arm=(16, 0, 6)),
    ]
    return keyed(keys, i)


POSE_FN = dict(idle=pose_idle, run=pose_run, bite=pose_bite, dodge=pose_dodge, hurt=pose_hurt, skill=pose_skill)


# =========================================================================== blender scene


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c) + (1.0,)


class G:
    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        self.nt.nodes.clear()

    def n(self, t, **kw):
        nd = self.nt.nodes.new(t)
        for k, v in kw.items():
            setattr(nd, k, v)
        return nd

    def put(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.nt.links.new(v, sock)
        else:
            sock.default_value = v

    def attr(self, name, out="Fac"):
        return self.n("ShaderNodeAttribute", attribute_name=name).outputs[out]

    def math(self, op, a, b=0.0, c=0.0, clamp=False):
        nd = self.n("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.put(nd.inputs[0], a)
        self.put(nd.inputs[1], b)
        self.put(nd.inputs[2], c)
        return nd.outputs[0]

    def hsv(self, col, h=0.5, s=1.0, v=1.0):
        nd = self.n("ShaderNodeHueSaturation")
        self.put(nd.inputs["Color"], col)
        self.put(nd.inputs["Hue"], h)
        self.put(nd.inputs["Saturation"], s)
        self.put(nd.inputs["Value"], v)
        return nd.outputs[0]

    def mr(self, v, a, b, c=0.0, d=1.0, interp="LINEAR"):
        nd = self.n("ShaderNodeMapRange", interpolation_type=interp, clamp=True)
        self.put(nd.inputs["Value"], v)
        nd.inputs["From Min"].default_value = a
        nd.inputs["From Max"].default_value = b
        nd.inputs["To Min"].default_value = c
        nd.inputs["To Max"].default_value = d
        return nd.outputs[0]

    def mix(self, fac, a, b, blend="MIX"):
        nd = self.n("ShaderNodeMix", data_type="RGBA", blend_type=blend, clamp_result=True)
        ins = {s.identifier: s for s in nd.inputs}
        self.put(ins["Factor_Float"], fac)
        self.put(ins["A_Color"], a)
        self.put(ins["B_Color"], b)
        return [s for s in nd.outputs if s.identifier == "Result_Color"][0]

    def ramp(self, fac, stops, interp="LINEAR"):
        nd = self.n("ShaderNodeValToRGB")
        cr = nd.color_ramp
        cr.interpolation = interp
        cr.elements[0].position, cr.elements[0].color = stops[0][0], stops[0][1]
        cr.elements[1].position, cr.elements[1].color = stops[-1][0], stops[-1][1]
        for pos, col in stops[1:-1]:
            e = cr.elements.new(pos)
            e.color = col
        self.put(nd.inputs[0], fac)
        return nd.outputs[0]

    def vor(self, vec, scale, feature="F1", out="Distance", rnd=1.0, dim="3D"):
        nd = self.n("ShaderNodeTexVoronoi", feature=feature, voronoi_dimensions=dim)
        self.put(nd.inputs["Vector"], vec)
        nd.inputs["Scale"].default_value = scale
        nd.inputs["Randomness"].default_value = rnd
        return nd.outputs[out]

    def noise(self, vec, scale, detail=2.0, rough=0.5, out="Fac", distort=0.0):
        nd = self.n("ShaderNodeTexNoise")
        self.put(nd.inputs["Vector"], vec)
        nd.inputs["Scale"].default_value = scale
        nd.inputs["Detail"].default_value = detail
        nd.inputs["Roughness"].default_value = rough
        nd.inputs["Distortion"].default_value = distort
        return nd.outputs[out]

    def vadd(self, a, b):
        nd = self.n("ShaderNodeVectorMath", operation="ADD")
        self.put(nd.inputs[0], a)
        self.put(nd.inputs[1], b)
        return nd.outputs[0]

    def vscale(self, a, s):
        nd = self.n("ShaderNodeVectorMath", operation="SCALE")
        self.put(nd.inputs[0], a)
        nd.inputs["Scale"].default_value = s
        return nd.outputs[0]

    def sep(self, v):
        nd = self.n("ShaderNodeSeparateXYZ")
        self.put(nd.inputs[0], v)
        return nd.outputs

    def bsdf(self, **kw):
        nd = self.n("ShaderNodeBsdfPrincipled")
        for k, v in kw.items():
            self.put(nd.inputs[k], v)
        out = self.n("ShaderNodeOutputMaterial")
        self.nt.links.new(nd.outputs[0], out.inputs[0])
        return nd


def skin_material(rex):
    m = bpy.data.materials.new("rex_skin")
    g = G(m)
    L = rex.L
    rest = g.attr("rest", "Vector")  # normalised: same markings at every age
    dors, cream, limb, crest = g.attr("dors"), g.attr("cream"), g.attr("limb"), g.attr("crest")
    face, mouth, scar, nost = g.attr("face"), g.attr("mouth"), g.attr("scar"), g.attr("nost")
    # ---- base green: counter-shaded by dorsal angle
    d01 = g.math("MULTIPLY_ADD", dors, 0.5, 0.5)
    green = g.ramp(d01, [(0.0, srgb("#A3BE40")), (0.30, srgb("#8DB23A")), (0.46, srgb("#56A043")),
                         (0.62, srgb("#2A8A63")), (0.80, srgb("#1B6C61")), (1.0, srgb("#14524F"))])
    limbc = g.ramp(d01, [(0.0, srgb("#5E9A3A")), (0.5, srgb("#3F8240")), (1.0, srgb("#2C6A48"))])
    limb_f = g.mr(limb, 0.25, 0.9)
    col = g.mix(limb_f, green, limbc)
    # large + medium variation
    n1 = g.noise(rest, 2.2, 3.0, 0.55)
    col = g.hsv(col, g.mr(n1, 0.3, 0.7, 0.488, 0.512), 1.0, g.mr(n1, 0.3, 0.7, 0.9, 1.1))
    n2 = g.noise(rest, 7.0, 2.0, 0.5)
    col = g.mix(g.mr(n2, 0.35, 0.7, 0.0, 0.16), col, srgb("#174B44"), "MIX")
    # scale clusters: darker / lighter scale cells
    vrest = g.vadd(rest, g.vscale(g.noise(rest, 6.0, 2.0, 0.5, out="Color"), 0.02))
    cellc = g.vor(vrest, 26.0, "F1", "Color")
    cellv = g.sep(cellc)[0]
    col = g.mix(g.mr(cellv, 0.0, 1.0, 0.0, 0.18), col, srgb("#16463F"), "MIX")
    # ---- amber dorsal patches: whole scale cells along the midline, shoulders and hips
    pc = g.vor(vrest, 13.0, "F1", "Color")
    pr = g.sep(pc)[0]
    pedge = g.vor(vrest, 13.0, "DISTANCE_TO_EDGE", "Distance")
    # probability rises toward the dorsal midline
    prob = g.mr(dors, 0.45, 0.97, 0.04, 0.8, "SMOOTHSTEP")
    blot = g.noise(rest, 3.2, 2.0, 0.5)
    prob = g.math("ADD", prob, g.mr(blot, 0.42, 0.62, -0.45, 0.2), clamp=True)
    prob = g.math("MULTIPLY", prob, g.math("SUBTRACT", 1.0, g.math("MULTIPLY", face, 0.55)))
    prob = g.math("MULTIPLY", prob, g.math("SUBTRACT", 1.0, limb))
    patch = g.math("LESS_THAN", pr, prob)
    patch = g.math("MULTIPLY", patch, g.mr(pedge, 0.03, 0.12, 0.0, 1.0))
    patch = g.math("MAXIMUM", patch, g.mr(crest, 0.35, 0.8))
    amber = g.mix(g.noise(rest, 9.0, 2.0, 0.5), srgb("#F2A124"), srgb("#D9701A"))
    col = g.mix(patch, col, amber)
    # ---- cream belly / throat / jaw
    creamc = g.mix(g.noise(rest, 5.0, 2.0, 0.5), srgb("#F1E3B6"), srgb("#E3CA8C"))
    cr = g.mr(cream, 0.15, 0.85, 0.0, 1.0, "SMOOTHSTEP")
    col = g.mix(cr, col, creamc)
    # mouth / nostrils / scars
    col = g.mix(mouth, col, g.mix(g.noise(rest, 14.0), srgb("#8E2F38"), srgb("#B9505A")))
    col = g.mix(g.math("MULTIPLY", nost, 0.85), col, srgb("#1C2A22"))
    col = g.mix(g.math("MULTIPLY", scar, 0.9), col, srgb("#E7C9A6"))
    # crevice darkening with a cool teal tint (AO)
    ao = g.n("ShaderNodeAmbientOcclusion", samples=8)
    ao.inputs["Distance"].default_value = 0.06 * L / 4.2 + 0.04
    aof = g.mr(ao.outputs["AO"], 0.2, 1.0, 0.0, 1.0)
    col = g.mix(aof, g.mix(0.5, col, srgb("#0F3A3A"), "MULTIPLY"), col)
    # ---- surface: scales as bump (softer on the face and belly)
    sc_edge = g.vor(vrest, 26.0, "DISTANCE_TO_EDGE", "Distance")
    sc_h = g.mr(sc_edge, 0.0, 0.10, 0.0, 1.0, "SMOOTHSTEP")
    big_edge = g.vor(vrest, 13.0, "DISTANCE_TO_EDGE", "Distance")
    big_h = g.mr(big_edge, 0.0, 0.08, 0.0, 1.0, "SMOOTHSTEP")
    height = g.math("ADD", g.math("MULTIPLY", sc_h, 0.6), g.math("MULTIPLY", big_h, g.math("MULTIPLY", patch, 0.8)))
    soft = g.math("SUBTRACT", 1.0, g.math("ADD", g.math("MULTIPLY", face, 0.45), g.math("MULTIPLY", cr, 0.35)))
    bump = g.n("ShaderNodeBump")
    g.put(bump.inputs["Strength"], g.math("MULTIPLY", soft, 0.32))
    bump.inputs["Distance"].default_value = 0.01 * L / 4.2
    g.put(bump.inputs["Height"], height)
    bump2 = g.n("ShaderNodeBump")
    bump2.inputs["Strength"].default_value = 0.2
    bump2.inputs["Distance"].default_value = 0.02 * L / 4.2
    g.put(bump2.inputs["Height"], g.math("MULTIPLY", scar, -1.0))
    g.put(bump2.inputs["Normal"], bump.outputs["Normal"])
    rough = g.mr(n2, 0.3, 0.7, 0.42, 0.62)
    g.bsdf(**{"Base Color": col, "Roughness": rough, "Normal": bump2.outputs["Normal"], "Subsurface Weight": 0.08,
              "Subsurface Radius": (1.0, 0.45, 0.25), "Subsurface Scale": 0.04 * L / 4.2, "Specular IOR Level": 0.45,
              "Coat Weight": 0.12, "Coat Roughness": 0.35})
    return m


def eye_material():
    m = bpy.data.materials.new("rex_eye")
    g = G(m)
    loc = g.attr("eyeloc", "Vector")
    x, y, z = g.sep(loc)
    r = g.math("SQRT", g.math("ADD", g.math("MULTIPLY", x, x), g.math("MULTIPLY", y, y)))
    iris = g.ramp(z, [(0.0, srgb("#2A1406")), (0.30, srgb("#3A1A06")), (0.42, srgb("#B4520C")), (0.62, srgb("#E9861A")),
                      (0.85, srgb("#FFB833")), (1.0, srgb("#FFD060"))])
    # vertical slit pupil
    sx = g.math("ABSOLUTE", x)
    lens = g.math("SQRT", g.math("MAXIMUM", g.math("SUBTRACT", 1.0, g.math("MULTIPLY", g.math("MULTIPLY", y, y), 3.2)), 0.0))
    pup = g.math("LESS_THAN", sx, g.math("MULTIPLY", lens, 0.13))
    pup = g.math("MULTIPLY", pup, g.math("GREATER_THAN", z, 0.5))
    col = g.mix(pup, iris, srgb("#050302"))
    # fine radial iris fibres
    fib = g.noise(g.vscale(loc, 1.0), 22.0, 2.0, 0.6)
    col = g.mix(g.mr(fib, 0.4, 0.7, 0.0, 0.25), col, srgb("#7A3608"))
    g.bsdf(**{"Base Color": col, "Roughness": 0.25, "Coat Weight": 1.0, "Coat Roughness": 0.02, "Specular IOR Level": 0.6,
              "Emission Color": col, "Emission Strength": 0.25})
    return m


def simple_material(name, col, rough, **kw):
    m = bpy.data.materials.new(name)
    g = G(m)
    g.bsdf(**{"Base Color": srgb(col), "Roughness": rough, **kw})
    return m


def claw_material():
    m = bpy.data.materials.new("rex_claw")
    g = G(m)
    geo = g.n("ShaderNodeNewGeometry")
    n = g.noise(geo.outputs["Position"], 40.0)
    col = g.mix(g.mr(n, 0.3, 0.7), srgb("#2A2320"), srgb("#4A3C33"))
    g.bsdf(**{"Base Color": col, "Roughness": 0.38, "Specular IOR Level": 0.5})
    return m


def build_scene(rex, model, samples):
    sc = reset_scene()
    setup_render(sc, 64, 64, samples=samples)
    sc.render.use_persistent_data = True
    setup_lighting(sc)
    # subtle camera-side fill (allowed for characters)
    fd = bpy.data.lights.new("Fill", "SUN")
    fd.energy = 0.55
    fd.color = (0.85, 0.93, 1.0)
    fd.angle = math.radians(25)
    for obj, attr in ((fd, "use_shadow"), (getattr(fd, "cycles", None), "cast_shadow")):
        try:
            setattr(obj, attr, False)
        except Exception:
            pass
    fo = bpy.data.objects.new("Fill", fd)
    sc.collection.objects.link(fo)
    from mathutils import Vector
    v = Vector((COS45 * 0.8, COS45 * 0.8, 0.6)).normalized()
    fo.rotation_euler = (-v).to_track_quat("-Z", "Y").to_euler()
    # warm bounce ground, invisible to camera
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.005))
    gnd = bpy.context.object
    gnd.visible_camera = False
    gm = bpy.data.materials.new("bounce")
    gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.32, 0.23, 0.12, 1)
    gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
    gnd.data.materials.append(gm)
    # the creature mesh
    V = model["V"].astype(np.float64)
    fl, fi = model["fl"], model["fi"]
    me = bpy.data.meshes.new("rex")
    me.vertices.add(len(V))
    me.vertices.foreach_set("co", V.astype(np.float32).ravel())
    me.loops.add(len(fi))
    me.loops.foreach_set("vertex_index", fi.astype(np.int32))
    me.polygons.add(len(fl))
    starts = np.concatenate([[0], np.cumsum(fl)[:-1]]).astype(np.int32)
    me.polygons.foreach_set("loop_start", starts)
    me.polygons.foreach_set("material_index", model["mat"].astype(np.int32))
    me.update(calc_edges=True)
    me.validate(verbose=False)
    me.polygons.foreach_set("use_smooth", np.ones(len(fl), bool))
    for k in ("dors", "cream", "limb", "crest", "face", "mouth", "scar", "nost"):
        a = me.attributes.new(k, "FLOAT", "POINT")
        a.data.foreach_set("value", model[k].astype(np.float32))
    a = me.attributes.new("rest", "FLOAT_VECTOR", "POINT")
    a.data.foreach_set("vector", (V * (4.2 / rex.L)).astype(np.float32).ravel())
    a = me.attributes.new("eyeloc", "FLOAT_VECTOR", "POINT")
    a.data.foreach_set("vector", model["eyeloc"].astype(np.float32).ravel())
    for mt in (skin_material(rex), eye_material(),
               simple_material("rex_teeth", "#F3E7C6", 0.32, **{"Subsurface Weight": 0.15, "Subsurface Radius": (1, 0.8, 0.5),
                                                                 "Subsurface Scale": 0.01, "Specular IOR Level": 0.6}),
               claw_material(),
               simple_material("rex_mouth", "#5E1820", 0.45)):
        me.materials.append(mt)
    ob = bpy.data.objects.new("rex", me)
    sc.collection.objects.link(ob)
    return sc, ob


def set_verts(ob, V):
    me = ob.data
    me.vertices.foreach_set("co", V.astype(np.float32).ravel())
    me.update()


# =========================================================================== framing


def project(V, k):
    phi = k * math.pi / 4
    c, s = math.cos(-phi), math.sin(-phi)
    X = V[:, 0] * c - V[:, 1] * s
    Y = V[:, 0] * s + V[:, 1] * c
    gx, gy, gz = Y, X, V[:, 2]
    sx = (gx - gy) * COS45 * PPU
    sy = (gx + gy) * COS45 * PPU * SQUASH - gz * PPU * VSCALE
    return sx, sy


def frame_size(rig, poses):
    lo = np.array([1e9, 1e9])
    hi = -lo
    for name in poses:
        for i in range(POSES[name]["frames"]):
            V = rig.deform(POSE_FN[name](i, POSES[name]["frames"], rig.rex.P))[::3]
            for k in range(8):
                sx, sy = project(V, k)
                lo = np.minimum(lo, [sx.min(), sy.min()])
                hi = np.maximum(hi, [sx.max(), sy.max()])
    m = 6
    w = int(math.ceil(hi[0] - lo[0])) + 2 * m
    h = int(math.ceil(hi[1] - lo[1])) + 2 * m
    w += w % 2
    h += h % 2
    ax = int(round(-lo[0])) + m
    ay = int(round(-lo[1])) + m
    return w, h, ax, ay


# =========================================================================== driver


def main(stage):
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default="still", choices=["build", "still", "marker", "anim", "render"])
    ap.add_argument("--poses", default="")
    ap.add_argument("--dirs", default="")
    ap.add_argument("--frames", default="")
    ap.add_argument("--samples", type=int, default=40)
    ap.add_argument("--out", default="")
    ap.add_argument("--rebuild", action="store_true")
    ap.add_argument("--scale", type=float, default=1.0)
    a = ap.parse_args(args_after_dashes())
    rex, model = build_model(stage, rebuild=a.rebuild or a.mode == "build")
    if a.mode == "build":
        return
    rig = Rig(rex, model)
    poses = [p for p in (a.poses.split(",") if a.poses else POSES)]
    dirs = [int(x) for x in a.dirs.split(",")] if a.dirs else list(range(8))
    sid = f"rex_{stage}"
    fs_path = os.path.join(REPO, ".scratch", "rex", "cache", f"{sid}_frame.json")
    if os.path.exists(fs_path) and not a.rebuild:
        w, h, ax, ay = json.load(open(fs_path))
    else:
        w, h, ax, ay = frame_size(rig, list(POSES))
        json.dump([w, h, ax, ay], open(fs_path, "w"))
    print(f"{sid}: frame {w}x{h} anchor {ax},{ay}", flush=True)
    sc, ob = build_scene(rex, model, a.samples)
    cam_w, cam_h = int(w * a.scale), int(h * a.scale)
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = int(round(100 * a.scale))
    frame_camera(sc, w, h, (ax / w, ay / h))
    if a.mode == "marker":
        # bright marker on the snout: report where the nose lands for each direction
        V = rig.deform(base_pose())
        nose = rex.hp(1.0, 0, -0.07)
        for k in range(8):
            sx, sy = project(nose[None, :], k)
            print(f"MARKER k={k}: nose at screen ({sx[0]:+.0f}, {sy[0]:+.0f}) from the anchor", flush=True)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.06 * rex.H, location=tuple(nose))
        mk = bpy.context.object
        mk.parent = ob
        mm = bpy.data.materials.new("mk")
        mm.use_nodes = True
        mm.node_tree.nodes["Principled BSDF"].inputs["Emission Color"].default_value = (1, 0, 0, 1)
        mm.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 8
        mk.data.materials.append(mm)
        poses, a.frames = ["idle"], "0"
    if a.mode in ("still",):
        poses, a.frames = ["idle"], "0"
    out = a.out or (os.path.join(REPO, "art-build", "creatures", sid) if a.mode == "render"
                    else os.path.join(REPO, ".scratch", "rex", a.mode, sid))
    os.makedirs(out, exist_ok=True)
    frames = []
    t0 = time.time()
    nr = 0
    for pname in poses:
        nf = POSES[pname]["frames"]
        fl = [int(x) for x in a.frames.split(",")] if a.frames else list(range(nf))
        for i in fl:
            V = None
            for k in dirs:
                fname = f"{pname}_{k}_{i}.png"
                fpath = os.path.join(out, fname)
                frames.append(dict(key=f"{sid}/{pname}/{k}/{i}", file=fname, ax=ax, ay=ay,
                                   meta=dict(pose=pname, dir=k, frame=i)))
                if os.path.exists(fpath) and a.mode == "render":
                    continue
                if V is None:
                    V = rig.deform(POSE_FN[pname](i, nf, rex.P))
                    set_verts(ob, V)
                ob.rotation_euler = (0, 0, -k * math.pi / 4)
                render_to(sc, fpath)
                nr += 1
                print(f"RENDERED {fname} ({(time.time() - t0) / nr:.1f}s/frame)", flush=True)
    meta = dict(id=sid, name=rex.P["name"], stage=stage, poses={p: POSES[p] for p in POSES}, r=rex.P["r"], length=rex.L,
                height=rex.H, frame=[w, h])
    if a.mode == "render":
        frames = []
        for pname in POSES:
            for k in range(8):
                for i in range(POSES[pname]["frames"]):
                    fname = f"{pname}_{k}_{i}.png"
                    if os.path.exists(os.path.join(out, fname)):
                        frames.append(dict(key=f"{sid}/{pname}/{k}/{i}", file=fname, ax=ax, ay=ay,
                                           meta=dict(pose=pname, dir=k, frame=i)))
    json.dump(dict(frames=frames, meta=meta), open(os.path.join(out, "frames.json"), "w"), indent=1)
    print(f"done: {nr} rendered in {time.time() - t0:.0f}s -> {out}", flush=True)
