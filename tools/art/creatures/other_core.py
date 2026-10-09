"""Creature construction kit (pure numpy; imported inside Blender).

Owned by the herbivore/insect artist (files tools/art/creatures/other_*.py).

A creature is described as signed-distance primitives grouped into *groups*.
Each group is meshed on its own voxel grid (openvdb level-set -> quads), so
parts inside a group blend organically (smooth-min) while separate groups stay
crisp (horns, claws, eyes, beetle leg segments). Every primitive is tagged with
a bone; per-vertex skin weights come from the distance to each bone's
primitives. Animation is plain linear-blend skinning done in numpy, so the rest
pose is also the texture space (the "rest" attribute) and patterns never swim.

Model space: the creature faces +Y, X is lateral, Z up, ground at z = 0
(Blender object space - the render driver rotates the object by -heading).
"""
import math

import numpy as np


# --------------------------------------------------------------------------- math
def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], float)


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], float)


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], float)


def euler(rx=0.0, ry=0.0, rz=0.0):
    """Degrees. Yaw (Z) outermost, then pitch (X), then roll (Y)."""
    return rot_z(math.radians(rz)) @ rot_x(math.radians(rx)) @ rot_y(math.radians(ry))


def axis_angle(axis, deg):
    a = np.asarray(axis, float)
    a = a / np.linalg.norm(a)
    t = math.radians(deg)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(t) * K + (1 - math.cos(t)) * K @ K


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def catmull(points, n=8):
    """Resample a polyline through `points` with a Catmull-Rom spline."""
    P = np.asarray(points, float)
    if len(P) < 3:
        t = np.linspace(0, 1, n * (len(P) - 1) + 1)[:, None]
        return P[0] * (1 - t) + P[-1] * t
    ext = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-1])
    return np.array(out)


def interp_radii(radii, n_out):
    r = np.asarray(radii, float)
    x = np.linspace(0, 1, len(r))
    return np.interp(np.linspace(0, 1, n_out), x, r)


# --------------------------------------------------------------------------- noise
def _hash3(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    h = h & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return (h & 0xFFFF).astype(np.float32) / 65535.0


def vnoise(P, freq=1.0, seed=0):
    """Smooth value noise in [-1, 1]."""
    Q = np.asarray(P, np.float64) * freq + 1000.0
    i = np.floor(Q).astype(np.int64)
    f = (Q - i).astype(np.float32)
    u = f * f * (3 - 2 * f)
    out = np.zeros(len(Q), np.float32)
    for dx in (0, 1):
        wx = u[:, 0] if dx else 1 - u[:, 0]
        for dy in (0, 1):
            wy = u[:, 1] if dy else 1 - u[:, 1]
            for dz in (0, 1):
                wz = u[:, 2] if dz else 1 - u[:, 2]
                out += wx * wy * wz * _hash3(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return out * 2 - 1


def fbm(P, freq=1.0, octaves=3, seed=0, gain=0.5):
    tot, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        tot = tot + amp * vnoise(P, freq * (2.0 ** o), seed + 17 * o)
        norm += amp
        amp *= gain
    return tot / norm


def cell_noise(P, freq=1.0, seed=0):
    """Voronoi F1 distance and a per-cell random id (both arrays)."""
    Q = np.asarray(P, np.float64) * freq + 1000.0
    i = np.floor(Q).astype(np.int64)
    best = np.full(len(Q), 9.0)
    cid = np.zeros(len(Q), np.float32)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                c = i + np.array([dx, dy, dz])
                jit = np.stack([_hash3(c[:, 0], c[:, 1], c[:, 2], seed + k) for k in range(3)], 1)
                d = np.linalg.norm(c + jit - Q, axis=1)
                m = d < best
                best = np.where(m, d, best)
                cid = np.where(m, _hash3(c[:, 0], c[:, 1], c[:, 2], seed + 7), cid)
    return best, cid


# --------------------------------------------------------------------------- primitives
class Prim:
    """Base: dist(P) -> signed distance (N,), aabb -> (lo, hi). `bone` for skinning."""

    k = 0.0
    sub = False
    inter = False

    def __init__(self, bone, k=0.0, tag="", sub=False, inter=False, weight_bias=0.0):
        self.bone, self.k, self.tag, self.sub, self.inter = bone, k, tag, sub, inter
        self.weight_bias = weight_bias


class Ell(Prim):
    def __init__(self, c, r, bone, rot=None, k=0.0, **kw):
        super().__init__(bone, k, **kw)
        self.c = np.asarray(c, float)
        self.r = np.asarray(r, float)
        self.R = np.eye(3) if rot is None else (euler(*rot) if len(np.shape(rot)) == 1 else np.asarray(rot))

    def dist(self, P):
        q = (P - self.c) @ self.R  # into local frame
        k0 = np.linalg.norm(q / self.r, axis=1)
        k1 = np.linalg.norm(q / (self.r * self.r), axis=1)
        return (k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)).astype(np.float32)

    def aabb(self):
        e = np.abs(self.R) @ self.r
        return self.c - e, self.c + e


class Cone(Prim):
    """Round cone between a (radius ra) and b (radius rb) - iq's exact SDF."""

    def __init__(self, a, b, ra, rb, bone, k=0.0, **kw):
        super().__init__(bone, k, **kw)
        self.a, self.b = np.asarray(a, float), np.asarray(b, float)
        self.ra, self.rb = float(ra), float(rb)

    def dist(self, P):
        return round_cone(P, self.a, self.b, self.ra, self.rb)

    def aabb(self):
        m = max(self.ra, self.rb)
        return np.minimum(self.a, self.b) - m, np.maximum(self.a, self.b) + m


def round_cone(P, a, b, r1, r2):
    ba = b - a
    l2 = float(ba @ ba)
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / max(l2, 1e-12)
    pa = P - a
    y = pa @ ba
    z = y - l2
    xv = pa * l2 - np.outer(y, ba)
    x2 = np.einsum("ij,ij->i", xv, xv)
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    out = np.empty(len(P), np.float64)
    m1 = np.sign(z) * a2 * z2 > k
    m2 = (~m1) & (np.sign(y) * a2 * y2 < k)
    m3 = ~(m1 | m2)
    out[m1] = np.sqrt(x2[m1] + z2[m1]) * il2 - r2
    out[m2] = np.sqrt(x2[m2] + y2[m2]) * il2 - r1
    out[m3] = (np.sqrt(x2[m3] * a2 * il2) + y[m3] * rr) * il2 - r1
    return out.astype(np.float32)


class Chain(Prim):
    """Tube through `points` with per-point radii (spline-resampled)."""

    def __init__(self, points, radii, bone, k=0.0, n=6, **kw):
        super().__init__(bone, k, **kw)
        P = catmull(points, n) if n > 1 else np.asarray(points, float)
        self.pts = P
        self.rad = interp_radii(radii, len(P))

    def dist(self, P):
        d = None
        for i in range(len(self.pts) - 1):
            di = round_cone(P, self.pts[i], self.pts[i + 1], self.rad[i], self.rad[i + 1])
            d = di if d is None else np.minimum(d, di)
        return d

    def aabb(self):
        m = self.rad.max()
        return self.pts.min(0) - m, self.pts.max(0) + m


class Fn(Prim):
    """Arbitrary SDF function with an explicit bounding box."""

    def __init__(self, fn, lo, hi, bone, k=0.0, **kw):
        super().__init__(bone, k, **kw)
        self.fn, self.lo, self.hi = fn, np.asarray(lo, float), np.asarray(hi, float)

    def dist(self, P):
        return self.fn(P).astype(np.float32)

    def aabb(self):
        return self.lo, self.hi


class Plane(Prim):
    """Half-space cut used with inter=True (keeps the side where n.p < h)."""

    def __init__(self, n, h, bone="", k=0.0, lo=None, hi=None, **kw):
        super().__init__(bone, k, inter=True, **kw)
        self.n = np.asarray(n, float) / np.linalg.norm(n)
        self.h = h
        self.lo = lo
        self.hi = hi

    def dist(self, P):
        return (P @ self.n - self.h).astype(np.float32)

    def aabb(self):
        return self.lo, self.hi


# --------------------------------------------------------------------------- groups
class Group:
    """Primitives meshed together. `detail(P, D)` may return a displacement added to D
    near the surface (positive pushes inward). `color(V, part, model)` -> (N,3) linear RGB."""

    def __init__(self, name, material, voxel, prims=None, detail=None, smooth=2, rigid=None):
        self.name, self.material, self.voxel = name, material, voxel
        self.prims = prims or []
        self.detail = detail
        self.smooth = smooth
        self.rigid = rigid  # bone name -> every vertex fully on that bone

    def add(self, *ps):
        self.prims.extend(ps)
        return self


def eval_group(group, P):
    """Evaluate the group SDF at arbitrary points (used for weights / masks)."""
    D = np.full(len(P), 1e3, np.float32)
    for p in group.prims:
        d = p.dist(P)
        if p.inter:
            D = smax(D, d, p.k)
        elif p.sub:
            D = smax(D, -d, p.k)
        else:
            D = smin(D, d, p.k)
    return D


def mesh_group(group, pad=None):
    """Voxelise + mesh one group. Returns verts (N,3), quads (M,4)."""
    import openvdb as vdb

    vs = group.voxel
    los, his = [], []
    for p in group.prims:
        if p.inter or p.sub:
            continue
        lo, hi = p.aabb()
        los.append(lo)
        his.append(hi)
    pad = pad if pad is not None else 4 * vs + max([p.k for p in group.prims] + [0])
    lo = np.min(los, 0) - pad
    hi = np.max(his, 0) + pad
    n = np.ceil((hi - lo) / vs).astype(int) + 1
    D = np.full(tuple(n), 1e3, np.float32)

    def block(plo, phi, extra):
        i0 = np.clip(np.floor((plo - extra - lo) / vs).astype(int), 0, n - 1)
        i1 = np.clip(np.ceil((phi + extra - lo) / vs).astype(int) + 1, 0, n)
        sl = tuple(slice(a, b) for a, b in zip(i0, i1))
        xs = [lo[d] + vs * np.arange(i0[d], i1[d]) for d in range(3)]
        X, Y, Z = np.meshgrid(*xs, indexing="ij")
        return sl, np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1), X.shape

    for p in group.prims:
        if p.inter or p.sub:
            if p.inter and p.lo is None:
                sl = tuple(slice(0, m) for m in n)
                xs = [lo[d] + vs * np.arange(n[d]) for d in range(3)]
                X, Y, Z = np.meshgrid(*xs, indexing="ij")
                P = np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1)
                shp = X.shape
            else:
                plo, phi = p.aabb()
                sl, P, shp = block(plo, phi, p.k + 3 * vs)
            d = p.dist(P).reshape(shp)
            if p.inter:
                D[sl] = smax(D[sl], d, p.k)
            else:
                D[sl] = smax(D[sl], -d, p.k)
            continue
        plo, phi = p.aabb()
        sl, P, shp = block(plo, phi, p.k + 3 * vs)
        d = p.dist(P).reshape(shp)
        D[sl] = smin(D[sl], d, p.k)
    if group.detail is not None:
        band = np.abs(D) < 6 * vs
        idx = np.nonzero(band)
        P = np.stack([lo[d] + vs * idx[d] for d in range(3)], 1)
        D[idx] += group.detail(P, D[idx]).astype(np.float32)
    g = vdb.FloatGrid(1e3)
    g.copyFromArray(np.ascontiguousarray(D))
    pts, quads = g.convertToQuads(0.0)
    verts = lo + pts.astype(np.float64) * vs
    quads = quads.astype(np.int64)
    if len(quads) == 0:
        raise RuntimeError(f"group {group.name} produced no surface")
    # outward winding check
    v0, v1, v2 = verts[quads[:, 0]], verts[quads[:, 1]], verts[quads[:, 2]]
    vol = np.einsum("ij,ij->i", v0, np.cross(v1, v2)).sum()
    if vol < 0:
        quads = quads[:, ::-1].copy()
    if group.smooth:
        verts = taubin(verts, quads, group.smooth)
    return verts, quads


def taubin(V, Q, iters=2, lam=0.5, mu=-0.53):
    e = np.concatenate([Q[:, [0, 1]], Q[:, [1, 2]], Q[:, [2, 3]], Q[:, [3, 0]]])
    e = np.concatenate([e, e[:, ::-1]])
    deg = np.bincount(e[:, 0], minlength=len(V)).astype(float)[:, None]
    deg[deg == 0] = 1
    V = V.copy()
    for _ in range(iters):
        for f in (lam, mu):
            acc = np.zeros_like(V)
            np.add.at(acc, e[:, 0], V[e[:, 1]])
            V = V + f * (acc / deg - V)
    return V


# --------------------------------------------------------------------------- skeleton
class Skel:
    def __init__(self):
        self.names, self.parent, self.head = [], {}, {}

    def add(self, name, parent, head):
        assert parent is None or parent in self.parent, parent
        self.names.append(name)
        self.parent[name] = parent
        self.head[name] = np.asarray(head, float)
        return name

    def index(self):
        return {n: i for i, n in enumerate(self.names)}

    def fk(self, pose):
        """pose: {bone: {"r": 3x3 or (rx,ry,rz) deg, "t": (x,y,z)}, "_ik": {thigh: IK}}
        Returns {bone: 4x4 skinning matrix} (rest -> posed) and world joint matrices."""
        ik = pose.get("_ik", {})
        over = {}
        M, S = {}, {}
        for n in self.names:
            p = self.parent[n]
            hp = self.head[p] if p else np.zeros(3)
            Mp = M[p] if p else np.eye(4)
            if n in ik:
                over.update(solve_ik(self, Mp, n, ik[n]))
            spec = pose.get(n, {})
            R = spec.get("r", np.eye(3))
            if not hasattr(R, "shape"):
                R = euler(*R)
            if n in over:
                R = over[n] @ R if spec.get("ik_post", False) else over[n] @ R
            t = np.asarray(spec.get("t", (0, 0, 0)), float)
            L = np.eye(4)
            L[:3, :3] = R
            L[:3, 3] = self.head[n] - hp + t
            M[n] = Mp @ L
            T = np.eye(4)
            T[:3, 3] = -self.head[n]
            S[n] = M[n] @ T
        return S, M


class IK:
    """Planar (YZ) two-bone IK for a leg: thigh -> shin -> foot. target in model space.
    knee: +1 knee bends forward (+Y), -1 backward. foot_pitch: extra foot angle (deg);
    flat=True keeps the foot level relative to the ground."""

    def __init__(self, shin, foot, target, knee=1, flat=True, foot_pitch=0.0, toe=None, toe_pitch=0.0):
        self.shin, self.foot, self.target = shin, foot, np.asarray(target, float)
        self.knee, self.flat, self.foot_pitch = knee, flat, foot_pitch
        self.toe, self.toe_pitch = toe, toe_pitch


def solve_ik(sk, Mp, thigh, ik):
    p = sk.parent[thigh]
    hp = sk.head[p] if p else np.zeros(3)
    h = sk.head[thigh]
    kn = sk.head[ik.shin]
    an = sk.head[ik.foot]
    a = kn - h
    b = an - kn
    inv = np.linalg.inv(Mp)
    tl = (inv @ np.append(ik.target, 1.0))[:3]
    v = tl - (h - hp)
    L1 = math.hypot(a[1], a[2])
    L2 = math.hypot(b[1], b[2])
    d = math.hypot(v[1], v[2])
    d = min(max(d, abs(L1 - L2) + 1e-4), L1 + L2 - 1e-4)
    tv = math.atan2(v[2], v[1])
    al = math.acos(max(-1.0, min(1.0, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))))
    # knee forward (+Y) when the leg hangs down (tv ~ -90deg) means thigh angle > tv
    th1 = tv + al * ik.knee
    kpos = np.array([L1 * math.cos(th1), L1 * math.sin(th1)])
    end = np.array([d * math.cos(tv), d * math.sin(tv)])
    th2 = math.atan2(end[1] - kpos[1], end[0] - kpos[0])
    ta = math.atan2(a[2], a[1])
    tb = math.atan2(b[2], b[1])
    r1 = th1 - ta
    r2 = th2 - tb - r1
    out = {thigh: rot_x(r1), ik.shin: rot_x(r2)}
    parent_pitch = math.atan2(Mp[2, 1], Mp[1, 1])
    fp = math.radians(ik.foot_pitch)
    if ik.flat:
        out[ik.foot] = rot_x(-(r1 + r2 + parent_pitch) + fp)
    else:
        out[ik.foot] = rot_x(fp)
    if ik.toe:
        out[ik.toe] = rot_x(math.radians(ik.toe_pitch))
    return out


# --------------------------------------------------------------------------- model
class Model:
    def __init__(self, name):
        self.name = name
        self.skel = Skel()
        self.groups = []
        self.meta = {}

    def group(self, *a, **kw):
        g = Group(*a, **kw)
        self.groups.append(g)
        return g


def skin_weights(group, V, bone_index, falloff=0.03, top=3):
    """(N, B) weights from distance to each bone's primitives."""
    B = len(bone_index)
    W = np.zeros((len(V), B), np.float32)
    if group.rigid:
        W[:, bone_index[group.rigid]] = 1.0
        return W
    per_bone = {}
    for p in group.prims:
        if p.inter or p.sub or not p.bone:
            continue
        d = p.dist(V) - p.weight_bias
        per_bone[p.bone] = d if p.bone not in per_bone else np.minimum(per_bone[p.bone], d)
    names = list(per_bone)
    Dm = np.stack([per_bone[n] for n in names], 1)
    dmin = Dm.min(1, keepdims=True)
    w = np.exp(-(Dm - dmin) / falloff)
    if top and w.shape[1] > top:
        thr = -np.sort(-w, 1)[:, top - 1 : top]
        w = np.where(w >= thr, w, 0)
    w[w < 0.02] = 0
    w /= w.sum(1, keepdims=True)
    for j, n in enumerate(names):
        W[:, bone_index[n]] = w[:, j]
    return W


def sdf_normals(group, V, eps=None):
    eps = eps or group.voxel
    g = np.zeros_like(V)
    for i in range(3):
        d = np.zeros(3)
        d[i] = eps
        g[:, i] = eval_group(group, V + d) - eval_group(group, V - d)
    n = np.linalg.norm(g, axis=1, keepdims=True)
    return g / np.maximum(n, 1e-9)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def nearest_tag(group, V):
    """Tag string of the closest primitive per vertex (for colouring)."""
    best = np.full(len(V), 1e9)
    tags = np.array([""] * len(V), dtype=object)
    for p in group.prims:
        if p.inter or p.sub:
            continue
        d = p.dist(V)
        m = d < best
        best = np.where(m, d, best)
        tags[m] = p.tag
    return tags


def skin(V, W, S_list):
    """Linear blend skinning. S_list: (B,4,4)."""
    out = np.zeros_like(V)
    Vh = V
    for b in np.nonzero(W.sum(0) > 0)[0]:
        w = W[:, b]
        m = w > 0
        S = S_list[b]
        out[m] += w[m, None] * (Vh[m] @ S[:3, :3].T + S[:3, 3])
    return out


# --------------------------------------------------------------------------- screen
COS45 = math.cos(math.radians(45))
SQUASH = math.sin(math.radians(35.264))
VSCALE = math.cos(math.radians(35.264))
PPU = 80.0


def heading_rot(phi):
    """Blender object rotation for game heading phi: rotation_euler.z = -phi."""
    return rot_z(-phi)


def project_blender(P):
    """Blender-space points -> screen px offsets (sx, sy) from the origin, y down."""
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    sx = (Y - X) * COS45 * PPU
    sy = (Y + X) * COS45 * PPU * SQUASH - Z * PPU * VSCALE
    return sx, sy
