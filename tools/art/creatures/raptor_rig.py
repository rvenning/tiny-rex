"""Skeleton, IK and numpy linear-blend skinning for the theropod family.

Bones live in creature space (X right, Y forward, Z up).  Each bone frame has
x = lateral (side), y = along the bone, z = x cross y.  Local pose rotations are
(pitch about x, yaw about z, roll about y), applied at the bone head.
Positive pitch lifts the bone's tip (for bones whose z points up).
Left-side limb angles are the mirror of the right side's: callers give the right
side's numbers, `mirror()` derives the left.
"""
import math

import numpy as np

from raptor_geo import unit


def frame_from(head, tail, side_ref):
    y = unit(np.asarray(tail, float) - np.asarray(head, float))
    s = np.asarray(side_ref, float)
    x = unit(s - y * np.dot(s, y))
    z = np.cross(x, y)
    M = np.eye(4)
    M[:3, 0], M[:3, 1], M[:3, 2], M[:3, 3] = x, y, z, head
    return M


def frame_dir(head, y, side_ref):
    return frame_from(head, np.asarray(head) + np.asarray(y), side_ref)


def rot_local(p=0.0, y=0.0, r=0.0):
    cp, sp = math.cos(p), math.sin(p)
    cy, sy = math.cos(y), math.sin(y)
    cr, sr = math.cos(r), math.sin(r)
    Rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
    Rz = np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]])
    Ry = np.array([[cr, 0, sr], [0, 1, 0], [-sr, 0, cr]])
    M = np.eye(4)
    M[:3, :3] = Rz @ Rx @ Ry
    return M


def mirror(t):
    p, y, r = (tuple(t) + (0.0, 0.0, 0.0))[:3]
    return (p, -y, -r)


def T(v):
    M = np.eye(4)
    M[:3, 3] = v
    return M


class Skeleton:
    def __init__(self):
        self.names, self.parent, self.rest, self.side = [], {}, {}, {}
        self.legs = {}  # side -> dict(bones, params) for IK

    def add(self, name, parent, head, tail, side_ref=(1, 0, 0)):
        self.names.append(name)
        self.parent[name] = parent
        self.rest[name] = frame_from(head, tail, side_ref)
        self.side[name] = np.asarray(side_ref, float)
        return name

    def index(self, name):
        return self.names.index(name)

    def head(self, name):
        return self.rest[name][:3, 3].copy()

    def solve(self, pose):
        """pose: dict with 'root' (translation), bone-name -> (p, y, r) local rotations,
        and 'legs' -> {side: dict(ball=(x,y,z), beta, toe, toe_yaw)} for IK legs.
        Returns {bone: 4x4 posed world matrix} and skin matrices."""
        M = {}
        legs_done = set()
        for b in self.names:
            par = self.parent[b]
            R = rot_local(*pose.get(b, (0.0, 0.0, 0.0)))
            if b in M:
                continue
            if par is None:
                M[b] = T(pose.get("root", (0, 0, 0))) @ self.rest[b] @ R
                continue
            leg = self._leg_of(b)
            if leg and leg not in legs_done:
                self._solve_leg(leg, pose, M)
                legs_done.add(leg)
                if b in M:
                    continue
            rel = np.linalg.inv(self.rest[par]) @ self.rest[b]
            M[b] = M[par] @ rel @ R
        S = {b: M[b] @ np.linalg.inv(self.rest[b]) for b in self.names}
        return M, S

    def _leg_of(self, b):
        for side, L in self.legs.items():
            if b in (L["thigh"], L["shin"], L["meta"], L["toe"]):
                return side
        return None

    def add_leg(self, side, thigh, shin, meta, toe, lens, rest_target):
        self.legs[side] = dict(thigh=thigh, shin=shin, meta=meta, toe=toe, lens=lens, rest=rest_target)

    def leg_ik(self, H, fwd, lat, ball, beta, toe_pitch, toe_yaw, lens, knee_out=0.0):
        """Returns joint positions (H, K, A, P) and toe direction for a digitigrade leg."""
        Lf, Lt, Lm, Ltoe = lens
        up = np.array([0.0, 0.0, 1.0])
        P = np.asarray(ball, float)
        mdir = math.cos(beta) * up - math.sin(beta) * fwd  # ball -> ankle
        A = P + Lm * mdir
        HA = A - H
        D = np.linalg.norm(HA)
        Dmax = (Lf + Lt) * 0.995
        Dmin = abs(Lf - Lt) + 0.02
        if D > Dmax:  # pull the foot up toward the hip
            A = H + HA / D * Dmax
            P = A - Lm * mdir
            D = Dmax
        D = max(D, Dmin)
        u = unit(A - H)
        kd = unit(fwd + lat * knee_out)
        v = unit(kd - u * np.dot(kd, u))
        ca = np.clip((Lf * Lf + D * D - Lt * Lt) / (2 * Lf * D), -1, 1)
        a = math.acos(ca)
        K = H + Lf * (ca * u + math.sin(a) * v)
        td = math.cos(toe_pitch) * fwd + math.sin(toe_pitch) * up
        if toe_yaw:
            c, s = math.cos(toe_yaw), math.sin(toe_yaw)
            td = c * td + s * np.cross(up, td)
        return H, K, A, P, unit(td)

    def _solve_leg(self, side, pose, M):
        L = self.legs[side]
        th, sh, me, to = L["thigh"], L["shin"], L["meta"], L["toe"]
        par = self.parent[th]
        Mp = M[par]
        Sp = Mp @ np.linalg.inv(self.rest[par])
        H = (Sp @ np.r_[self.head(th), 1])[:3]
        fwd = Mp[:3, 1].copy()
        fwd[2] = 0
        fwd = unit(fwd)
        lat = unit(np.cross(fwd, [0, 0, 1]))
        lp = pose.get("legs", {}).get(side, {})
        rest = L["rest"]
        ball = lp.get("ball", rest["ball"])
        beta = lp.get("beta", rest["beta"])
        tp = lp.get("toe", rest.get("toe", 0.0))
        ty = lp.get("toe_yaw", 0.0)
        H, K, A, P, td = self.leg_ik(H, fwd, lat, ball, beta, tp, ty, L["lens"], lp.get("knee_out", 0.0))
        M[th] = frame_from(H, K, lat)
        M[sh] = frame_from(K, A, lat)
        M[me] = frame_from(A, P, lat)
        M[to] = frame_dir(P, td, lat)


# --------------------------------------------------------------------------- skin weights
class Chain:
    """A polyline with radii whose arc length is split between bones.

    pts (m,3), rad (m,), bones: list of bone names, breaks: arc positions between
    consecutive bones (len = len(bones)-1), widths: blend half-widths per break."""

    def __init__(self, name, pts, rad, bones, breaks, widths, exclusive=False):
        self.name = name
        self.pts = np.asarray(pts, float)
        self.rad = np.asarray(rad, float)
        self.bones = bones
        self.breaks = np.asarray(breaks, float)
        self.widths = np.asarray(widths, float)
        seg = np.linalg.norm(np.diff(self.pts, axis=0), axis=1)
        self.arc = np.concatenate([[0], np.cumsum(seg)])

    def arc_of_point(self, p):
        d = np.linalg.norm(self.pts - np.asarray(p), axis=1)
        return self.arc[int(np.argmin(d))]

    def nearest(self, X, chunk=4000):
        """Return (dist, arc, radius) of the nearest polyline point for each row of X."""
        A, B = self.pts[:-1], self.pts[1:]
        AB = B - A
        L2 = np.maximum((AB * AB).sum(1), 1e-12)
        out_d, out_a, out_r = [], [], []
        for i in range(0, len(X), chunk):
            x = X[i : i + chunk]
            AX = x[:, None, :] - A[None, :, :]
            t = np.clip((AX * AB[None]).sum(2) / L2[None], 0, 1)
            P = A[None] + t[..., None] * AB[None]
            d = np.linalg.norm(x[:, None, :] - P, axis=2)
            j = np.argmin(d, axis=1)
            tt = t[np.arange(len(x)), j]
            out_d.append(d[np.arange(len(x)), j])
            out_a.append(self.arc[j] + tt * (self.arc[j + 1] - self.arc[j]))
            out_r.append(self.rad[j] * (1 - tt) + self.rad[j + 1] * tt)
        return np.concatenate(out_d), np.concatenate(out_a), np.concatenate(out_r)

    def bone_weights(self, arc):
        """(N, len(bones)) weights along the chain from arc positions."""
        n = len(self.bones)
        W = np.zeros((len(arc), n))
        if n == 1:
            W[:, 0] = 1
            return W
        # cumulative "how far past break k" in 0..1
        g = [np.clip((arc - (b - w)) / (2 * w), 0, 1) for b, w in zip(self.breaks, self.widths)]
        g = [x * x * (3 - 2 * x) for x in g]
        prev = np.ones(len(arc))
        for k in range(n):
            nxt = g[k] if k < n - 1 else np.zeros(len(arc))
            W[:, k] = prev - nxt if k == 0 else (g[k - 1] - nxt)
            if k == 0:
                W[:, 0] = 1 - nxt
        return np.clip(W, 0, 1)


def compute_weights(X, chains, bone_names, k=7.0, allowed=None, boost=None):
    """Soft partition of points X between chains (by radius-normalised distance),
    then along-chain bone weights.  Returns (N, nbones)."""
    allowed = allowed or [c.name for c in chains]
    cs = [c for c in chains if c.name in allowed]
    dn, arcs = [], []
    for c in cs:
        d, a, r = c.nearest(X)
        q = d / np.maximum(r, 1e-3)
        if boost and c.name in boost:
            q = q * boost[c.name]
        dn.append(q)
        arcs.append(a)
    dn = np.stack(dn, 1)
    w = np.exp(-k * (dn - dn.min(1, keepdims=True)))
    w /= w.sum(1, keepdims=True)
    W = np.zeros((len(X), len(bone_names)))
    for ci, c in enumerate(cs):
        bw = c.bone_weights(arcs[ci])
        for bi, b in enumerate(c.bones):
            W[:, bone_names.index(b)] += w[:, ci] * bw[:, bi]
    # prune tiny weights
    W[W < 0.01] = 0
    W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
    return W


def skin(rest, W, S, bone_names):
    """Linear blend skinning: rest (N,3), W (N,B), S {bone: 4x4}."""
    out = np.zeros_like(rest)
    for bi, b in enumerate(bone_names):
        w = W[:, bi]
        idx = np.nonzero(w)[0]
        if len(idx) == 0:
            continue
        M = S[b]
        out[idx] += w[idx, None] * (rest[idx] @ M[:3, :3].T + M[:3, 3])
    return out
