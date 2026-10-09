"""Vegetation kit: numpy geometry helpers (vectorised curves, ribbons, tubes, lathes).

Everything here is pure numpy until `Bufs.objects()`, which turns the accumulated
vertex/face/attribute arrays into Blender mesh objects (one per material).

Per-vertex colour attribute ATTR = (t, across, r1, r2), read by veg_mat shaders:
    t       0 at the base of an organ -> 1 at its tip (drives the dark-base / sunlit-tip ramp)
    across  0 on a midrib / vein -> 1 at the leaf edge
    r1      per-leaf random (hue / value jitter)
    r2      per-frond / per-plant random (age, saturation)
"""
import math

import numpy as np

ATTR = "veg"
TAU = 2.0 * math.pi


def nrm(v):
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-9)


def _k(*xs):
    """Broadcast scalars / arrays to a common (K,) float vector each."""
    arrs = [np.atleast_1d(np.asarray(x, float)) for x in xs]
    K = max(len(a) for a in arrs)
    return K, [np.broadcast_to(a, (K,)).astype(float) for a in arrs]


# --------------------------------------------------------------------------- curves
def curves(L, n, pitch, droop, yaw, start=(0.0, 0.0, 0.0), sweep=0.0, power=1.6, roll=0.0, roll_end=None):
    """K gravity-drooped curves sampled at n points.

    pitch: start angle above horizontal (rad); droop: pitch lost by the tip
    (power shapes where the bend happens); yaw: heading in Blender XY; sweep:
    heading change along the curve; roll: rotation of the side vector about
    the tangent (start -> roll_end at the tip).
    Returns P, T, S, N  each (K, n, 3) and s (n,).
    S is the 'left' side vector (horizontal before roll), N = T x S is 'up'.
    """
    if roll_end is None:
        roll_end = roll
    K, (L, pitch, droop, yaw, sweep, roll, roll_end) = _k(L, pitch, droop, yaw, sweep, roll, roll_end)
    s = np.linspace(0.0, 1.0, n)[None, :]
    th = pitch[:, None] - droop[:, None] * s ** power
    ph = yaw[:, None] + sweep[:, None] * s
    T = np.stack([np.cos(th) * np.cos(ph), np.cos(th) * np.sin(ph), np.sin(th)], -1)
    seg = (L / (n - 1))[:, None, None]
    mid = 0.5 * (T[:, 1:] + T[:, :-1])
    P = np.concatenate([np.zeros((K, 1, 3)), np.cumsum(mid * seg, axis=1)], axis=1)
    st = np.asarray(start, float).reshape(-1, 3)
    P = P + np.broadcast_to(st, (K, 3))[:, None, :]
    S0 = np.stack([-np.sin(ph), np.cos(ph), np.zeros_like(ph)], -1)
    N0 = np.cross(T, S0)
    r = (roll[:, None] + (roll_end - roll)[:, None] * s)[..., None]
    S = np.cos(r) * S0 + np.sin(r) * N0
    N = nrm(np.cross(T, S))
    return P, T, S, N, s[0]


def sample(arr, s):
    """Linear-interpolate a (n, 3) per-curve array at parameters s (M,) in [0,1]."""
    n = arr.shape[0]
    x = np.clip(np.asarray(s, float), 0, 1) * (n - 1)
    i0 = np.minimum(np.floor(x).astype(int), n - 2)
    f = (x - i0)[:, None]
    return arr[i0] * (1 - f) + arr[i0 + 1] * f


# --------------------------------------------------------------------------- topology
def grid_quads(K, nu, nv, wrap=False):
    """Quads for K stacked (nu x nv) vertex grids (vertex index = k*nu*nv + i*nv + j)."""
    jn = nv if wrap else nv - 1
    kk, ii, jj = np.meshgrid(np.arange(K), np.arange(nu - 1), np.arange(jn), indexing="ij")
    base = kk * nu * nv
    j1 = (jj + 1) % nv
    q = np.stack(
        [base + ii * nv + jj, base + (ii + 1) * nv + jj, base + (ii + 1) * nv + j1, base + ii * nv + j1], -1
    )
    return q.reshape(-1, 4)


# --------------------------------------------------------------------------- surfaces
def ribbon(P, S, N, w, nv=3, fold=0.0, cup=0.0):
    """Leaf blades along K centre lines. P,S,N (K,n,3); w (K,n) half width.
    fold lowers the edges along -N (a Λ keel, positive) and cup raises the
    quarter lines (dish).  Returns V (K,n,nv,3), quads, v (nv,)."""
    v = np.linspace(-1.0, 1.0, nv)
    wv = w[..., None, None] * v[None, None, :, None]
    av = np.abs(v)[None, None, :, None]
    lift = -fold * w[..., None, None] * av + cup * w[..., None, None] * (av * (1 - av)) * 4
    V = P[:, :, None, :] + S[:, :, None, :] * wv + N[:, :, None, :] * lift
    K, n = P.shape[:2]
    return V, grid_quads(K, n, nv), v


def tubes(P, S, N, r, sides=4, phase=0.0):
    """Tubes around K centre lines. r (K,n). Returns V (K,n,sides,3), quads."""
    a = phase + np.arange(sides) * TAU / sides
    ca, sa = np.cos(a)[None, None, :, None], np.sin(a)[None, None, :, None]
    V = P[:, :, None, :] + r[..., None, None] * (ca * S[:, :, None, :] + sa * N[:, :, None, :])
    K, n = P.shape[:2]
    return V, grid_quads(K, n, sides, wrap=True)


def frames_from_path(P):
    """Tangent/side/normal frames for arbitrary (K,n,3) paths (no roll control)."""
    T = np.gradient(P, axis=1)
    T = nrm(T)
    ref = np.zeros_like(T)
    ref[..., 2] = 1.0
    par = np.abs(T[..., 2]) > 0.95
    ref[par] = (1.0, 0.0, 0.0)
    S = nrm(np.cross(ref, T))
    N = nrm(np.cross(T, S))
    return T, S, N


def lathe(radius, z, sides=12, center=(0, 0, 0), wobble=None):
    """Surface of revolution. radius,z (n,). Returns V (1,n,sides,3), quads."""
    a = np.arange(sides) * TAU / sides
    r = np.asarray(radius, float)[:, None]
    if wobble is not None:
        r = r * (1 + wobble)
    V = np.stack([r * np.cos(a)[None], r * np.sin(a)[None], np.broadcast_to(np.asarray(z, float)[:, None], r.shape)], -1)
    V = V + np.asarray(center, float)
    return V[None], grid_quads(1, len(z), sides, wrap=True)


def cards(C, size, rng, aspect=1.0):
    """Two crossed triangles per point (tiny florets / spores). C (M,3), size (M,)."""
    M = len(C)
    rs = np.random.default_rng(rng.randrange(1 << 30))
    a = nrm(rs.normal(size=(M, 3)))
    b = nrm(np.cross(a, rs.normal(size=(M, 3))))
    c = np.cross(a, b)
    s = np.asarray(size, float)[:, None]
    V = np.stack([C + a * s, C - a * s * 0.5 + b * s * aspect, C - a * s * 0.5 - b * s * aspect,
                  C + c * s, C - c * s * 0.5 + b * s * aspect, C - c * s * 0.5 - b * s * aspect], 1)
    base = np.arange(M)[:, None] * 6
    F = np.concatenate([base + np.array([0, 1, 2]), base + np.array([3, 4, 5])], 0)
    return V, F


# --------------------------------------------------------------------------- noise
class Noise:
    """Cheap smooth 3D noise: a sum of random-direction sine waves, ~[-1, 1]."""

    def __init__(self, rng, octaves=4, freq=1.0):
        rs = np.random.default_rng(rng.randrange(1 << 30))
        self.d = nrm(rs.normal(size=(octaves * 3, 3)))
        self.f = freq * np.repeat(2.0 ** np.arange(octaves), 3) * rs.uniform(0.8, 1.25, octaves * 3)
        self.p = rs.uniform(0, TAU, octaves * 3)
        self.a = np.repeat(0.5 ** np.arange(octaves), 3)
        self.norm = 1.0 / (np.sum(self.a) * 0.55)

    def __call__(self, X):
        X = np.asarray(X, float)
        ph = X @ (self.d * self.f[:, None]).T + self.p
        return (np.sin(ph) @ self.a) * self.norm


# --------------------------------------------------------------------------- buffers
class Buf:
    def __init__(self):
        self.v, self.q, self.t, self.a, self.n = [], [], [], [], 0

    def add(self, V, F, A):
        V = np.asarray(V, float).reshape(-1, 3)
        A = np.asarray(A, float)
        if A.ndim == 1:
            A = np.broadcast_to(A, (len(V), 4))
        A = A.reshape(-1, 4)
        assert len(A) == len(V), (A.shape, V.shape)
        F = np.asarray(F, np.int64)
        (self.q if F.shape[1] == 4 else self.t).append(F + self.n)
        self.v.append(V)
        self.a.append(A)
        self.n += len(V)

    def tris(self):
        return sum(len(q) * 2 for q in self.q) + sum(len(t) for t in self.t)


class Bufs(dict):
    """material name -> Buf."""

    def __missing__(self, key):
        b = self[key] = Buf()
        return b

    def tris(self):
        return sum(b.tris() for b in self.values())

    def transform(self, M3=None, offset=(0, 0, 0)):
        for b in self.values():
            for i, V in enumerate(b.v):
                if M3 is not None:
                    V = V @ np.asarray(M3).T
                b.v[i] = V + np.asarray(offset, float)

    def clamp_ground(self, zmin=0.004):
        for b in self.values():
            for V in b.v:
                np.maximum(V[:, 2], zmin, out=V[:, 2])

    def objects(self, materials, name="veg"):
        """materials: name -> bpy material (or callable returning one)."""
        import bpy

        out = []
        for mname, b in self.items():
            if b.n == 0:
                continue
            V = np.concatenate(b.v)
            A = np.concatenate(b.a).astype(np.float32)
            polys = []
            if b.q:
                polys += np.concatenate(b.q).tolist()
            if b.t:
                polys += np.concatenate(b.t).tolist()
            me = bpy.data.meshes.new(f"{name}_{mname}")
            me.from_pydata(V.tolist(), [], polys)
            me.update()
            me.polygons.foreach_set("use_smooth", np.ones(len(me.polygons), dtype=bool))
            ca = me.color_attributes.new(ATTR, "FLOAT_COLOR", "POINT")
            ca.data.foreach_set("color", A.ravel())
            m = materials[mname]
            if callable(m):
                m = m()
            me.materials.append(m)
            ob = bpy.data.objects.new(f"{name}_{mname}", me)
            bpy.context.scene.collection.objects.link(ob)
            out.append(ob)
        return out
