"""Geometry helpers for the rocks/logs/structures kit (kit/rocks_logs.py).

No PROPS here. Everything is numpy + mathutils.noise so builds are deterministic
from the caller's rng (noise is sampled at rng-derived offsets).

Every mesh made here carries three point attributes that the rock_ materials read:
  cav  (float)   0 = deep crevice / fissure, 1 = exposed ridge (from the displacement)
  tint (float)   per-element random 0..1 (one value per leaf / twig / egg)
  bk   (vector)  seamless "bark space" coords for tubes: (cos t * Rref, sin t * Rref, s)
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, noise
from mathutils.bvhtree import BVHTree

NB = "PERLIN_NEW"


# --------------------------------------------------------------------------- tiny math
def sstep(a, b, x):
    if a == b:
        return 1.0 if x >= b else 0.0
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def rvec(rng, s=100.0):
    return Vector((rng.uniform(-s, s), rng.uniform(-s, s), rng.uniform(-s, s)))


def nz(p, off=None):
    return noise.noise(p + off if off is not None else p, noise_basis=NB)


def frac(p, octaves=3, H=0.6, lac=2.0):
    return noise.fractal(p, H, lac, octaves, noise_basis=NB)


def unit(v):
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-9)


# --------------------------------------------------------------------------- objects
def link(o):
    bpy.context.scene.collection.objects.link(o)
    return o


def ensure_attrs(me):
    a = me.attributes
    if "cav" not in a:
        x = a.new("cav", "FLOAT", "POINT")
        x.data.foreach_set("value", np.full(len(me.vertices), 0.6, np.float32))
    if "tint" not in a:
        x = a.new("tint", "FLOAT", "POINT")
        x.data.foreach_set("value", np.full(len(me.vertices), 0.5, np.float32))
    if "bk" not in a:
        a.new("bk", "FLOAT_VECTOR", "POINT")


def set_attr(me, name, arr):
    a = me.attributes[name]
    a.data.foreach_set("vector" if a.data_type == "FLOAT_VECTOR" else "value", np.asarray(arr, np.float32).ravel())


def mesh_obj(name, verts, faces, mats, mat_idx=None, cav=None, tint=None, bk=None, smooth=True):
    me = bpy.data.meshes.new(name)
    verts = np.asarray(verts, np.float64).reshape(-1, 3)
    me.from_pydata(verts.tolist(), [], [list(map(int, f)) for f in faces])
    for m in mats:
        me.materials.append(m)
    if mat_idx is not None and len(me.polygons):
        me.polygons.foreach_set("material_index", np.asarray(mat_idx, np.int32))
    ensure_attrs(me)
    if cav is not None:
        set_attr(me, "cav", cav)
    if tint is not None:
        set_attr(me, "tint", tint)
    if bk is not None:
        set_attr(me, "bk", bk)
    if smooth:
        me.shade_smooth()
    me.update()
    o = bpy.data.objects.new(name, me)
    return link(o)


class MB:
    """Accumulates many small parts into one mesh object."""

    def __init__(self):
        self.V, self.F, self.cav, self.tint, self.bk, self.mi = [], [], [], [], [], []
        self.n = 0

    def add(self, V, F, cav=0.6, tint=0.5, bk=None, mat=0):
        V = np.asarray(V, np.float64).reshape(-1, 3)
        k = len(V)
        if k == 0:
            return
        self.V.append(V)
        for f in F:
            self.F.append([int(i) + self.n for i in f])
        self.cav.append(np.broadcast_to(np.asarray(cav, np.float32), (k,)).copy())
        self.tint.append(np.broadcast_to(np.asarray(tint, np.float32), (k,)).copy())
        self.bk.append(np.zeros((k, 3), np.float32) if bk is None else np.asarray(bk, np.float32).reshape(k, 3))
        if isinstance(mat, (list, tuple, np.ndarray)):
            self.mi.extend(int(m) for m in mat)
        else:
            self.mi.extend([int(mat)] * len(F))
        self.n += k

    def empty(self):
        return self.n == 0

    def obj(self, name, mats, smooth=True):
        if self.n == 0:
            return None
        return mesh_obj(
            name,
            np.concatenate(self.V),
            self.F,
            mats,
            mat_idx=self.mi,
            cav=np.concatenate(self.cav),
            tint=np.concatenate(self.tint),
            bk=np.concatenate(self.bk),
            smooth=smooth,
        )


def apply_mods(o):
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    oe = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(oe)
    o.modifiers.clear()
    old = o.data
    o.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return o


def get_co(o):
    a = np.empty(len(o.data.vertices) * 3, np.float32)
    o.data.vertices.foreach_get("co", a)
    return a.reshape(-1, 3).astype(np.float64)


def get_nrm(o):
    a = np.empty(len(o.data.vertices) * 3, np.float32)
    o.data.vertex_normals.foreach_get("vector", a)
    return a.reshape(-1, 3).astype(np.float64)


def set_co(o, co):
    o.data.vertices.foreach_set("co", np.asarray(co, np.float32).ravel())
    o.data.update()


def transform(objs, mat):
    for o in objs:
        o.data.transform(mat)
        o.data.update()


def rot_z(objs, ang):
    transform(objs, Matrix.Rotation(ang, 4, "Z"))


def clamp_ground(objs, z0=0.0):
    for o in objs:
        co = get_co(o)
        if (co[:, 2] < z0).any():
            co[:, 2] = np.maximum(co[:, 2], z0)
            set_co(o, co)


def tri_count(objs):
    t = 0
    for o in objs:
        o.data.calc_loop_triangles()
        t += len(o.data.loop_triangles)
    return t


def budget(objs, limit=58000):
    """Decimate the heaviest meshes until the prop fits the triangle budget."""
    for _ in range(4):
        t = tri_count(objs)
        if t <= limit:
            return t
        big = sorted(objs, key=lambda o: -len(o.data.polygons))[0]
        bt = tri_count([big])
        ratio = max(0.2, 1.0 - (t - limit) / bt - 0.02)
        m = big.modifiers.new("dec", "DECIMATE")
        m.ratio = ratio
        apply_mods(big)
    return tri_count(objs)


def bvh_of(objs):
    V, P = [], []
    n = 0
    for o in objs:
        co = get_co(o)
        V.extend(map(tuple, co))
        for p in o.data.polygons:
            P.append([i + n for i in p.vertices])
        n += len(co)
    return BVHTree.FromPolygons(V, P)


# --------------------------------------------------------------------------- rock body
def rock_points(rng, size, style="round", n=26, top_flat=0.0):
    """Random points whose convex hull is the rock's big-facet silhouette.
    size = half extents (sx, sy, sz); the hull spans z in [-sz*0.2, sz*1.8]-ish around centre sz."""
    sx, sy, sz = size
    pts = []
    if style == "block":
        for _ in range(n):
            ax = rng.randrange(3)
            p = [rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)]
            p[ax] = rng.choice((-1, 1)) * rng.uniform(0.82, 1.0)
            # chamfer corners so blocks are not boxes
            m = abs(p[0]) + abs(p[1]) + abs(p[2])
            if m > 2.3:
                k = 2.3 / m
                p = [c * k for c in p]
            pts.append(p)
    elif style == "slab":
        for _ in range(n):
            a = rng.uniform(0, 2 * math.pi)
            r = rng.uniform(0.75, 1.0) ** 0.5
            z = rng.choice((-1, 1)) * rng.uniform(0.6, 1.0)
            if rng.random() < 0.35:
                z = rng.uniform(-0.6, 0.6)
                r = rng.uniform(0.92, 1.05)
            pts.append([math.cos(a) * r, math.sin(a) * r, z])
    else:
        for _ in range(n):
            v = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()
            r = rng.uniform(0.84, 1.0)
            pts.append([v.x * r, v.y * r, v.z * r])
    out = []
    for p in pts:
        x, y, z = p[0] * sx, p[1] * sy, p[2] * sz
        out.append((x, y, z))
    if top_flat > 0:
        cap = sz * (1.0 - top_flat)
        out = [(x, y, min(z, cap + rng.uniform(-0.03, 0.03) * sz)) for x, y, z in out]
    return out


def rock_hull_obj(name, pts, mats):
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    res = bmesh.ops.convex_hull(bm, input=list(bm.verts))
    junk = list({g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, bmesh.types.BMVert)})
    if junk:
        bmesh.ops.delete(bm, geom=junk, context="VERTS")
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(7), verts=list(bm.verts), edges=list(bm.edges))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    return link(o)


def rock_remesh(o, voxel, bevel):
    if bevel > 0:
        b = o.modifiers.new("bev", "BEVEL")
        b.width = bevel
        b.segments = 3
        b.limit_method = "ANGLE"
        b.angle_limit = math.radians(20)
    r = o.modifiers.new("rm", "REMESH")
    r.mode = "VOXEL"
    r.voxel_size = voxel
    r.adaptivity = 0.0
    s = o.modifiers.new("sm", "SMOOTH")
    s.factor = 0.5
    s.iterations = 2
    apply_mods(o)
    return o


def rock_displace(o, rng, amp=0.05, fine=0.012, crack=0.035, crack_scale=2.2, crack_w=0.07, crack_cov=0.55,
                  feat=1.0, strata=0.0, strata_f=6.0, erode_top=0.0, n_split=2, split_w=0.03, pits=0.0):
    """Multi-octave + ridged noise along normals, voronoi crack grooves, optional strata bands.
    Writes the cav attribute (0 = crack/crevice)."""
    co = get_co(o)
    nr = get_nrm(o)
    o1, o2, o3, o4, o5, o6 = (rvec(rng) for _ in range(6))
    disp = np.empty(len(co))
    cav = np.empty(len(co), np.float32)
    ctr = co.mean(axis=0)
    ext = (co.max(axis=0) - co.min(axis=0)) * 0.5
    # a few long fissures: wobbly planes through the rock (mostly vertical splits)
    planes = []
    for _ in range(n_split):
        nv = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.5, 0.5) if rng.random() < 0.6 else rng.uniform(-2, 2))).normalized()
        p0 = Vector(ctr) + Vector([rng.uniform(-0.5, 0.5) * e for e in ext])
        planes.append((p0, nv, rng.uniform(0.6, 1.4) * split_w, rvec(rng)))
    for i in range(len(co)):
        p = Vector(co[i]) * feat
        l = frac(p * 1.1 + o1, 3)
        m = frac(p * 3.3 + o2, 3, 0.5)
        r = 1.0 - abs(noise.noise(p * 2.0 + o6, noise_basis=NB))  # ridged: sharp ridges -> chiselled
        qd = p * crack_scale + noise.noise_vector(p * 1.3 + o3, noise_basis=NB) * 0.45
        d, _ = noise.voronoi(qd, distance_metric="DISTANCE", exponent=2.5)
        edge = d[1] - d[0]
        c = 1.0 - sstep(0.0, crack_w * (0.5 + 0.5 * abs(noise.noise(p * 1.7 + o5, noise_basis=NB))), edge)
        c *= sstep(0.5 - crack_cov, 0.62 - crack_cov, 0.5 + 0.5 * noise.noise(p * 0.7 + o4, noise_basis=NB))
        pw = Vector(co[i])
        for p0, nv, w, po in planes:
            dist = abs((pw - p0).dot(nv) + 0.09 * noise.noise(pw * 2.5 + po, noise_basis=NB) * (1 + 3 * w))
            ww = w * (0.45 + 0.55 * (0.5 + 0.5 * noise.noise(pw * 1.2 + po * 0.7, noise_basis=NB)))
            c = max(c, 1.0 - sstep(0.0, ww, dist))
        pit = noise.voronoi(p * 9.0 + o5, distance_metric="DISTANCE", exponent=2.5)[0][0]
        c = max(c, (1.0 - sstep(0.05, 0.16, pit)) * pits)
        f = noise.noise(p * 11.0 + o5, noise_basis=NB)
        s = 0.0
        if strata > 0:
            band = math.sin((co[i][2] + 0.15 * noise.noise(p * 1.5 + o4, noise_basis=NB)) * strata_f * 2 * math.pi)
            s = strata * (sstep(0.55, 0.95, band) * -1.0)
            c = max(c, sstep(0.75, 0.97, band) * 0.6)
        dd = amp * (0.8 * l + 0.35 * m + 0.25 * (r - 0.5)) - crack * c + fine * f + s
        if erode_top > 0 and nr[i][2] > 0.5:
            dd -= erode_top * (nr[i][2] - 0.5) * (0.5 + 0.5 * l)
        disp[i] = dd
        cav[i] = min(1.0, max(0.0, 0.6 + 0.35 * m + 0.25 * (r - 0.5) - 0.9 * c + 2.0 * s))
    co = co + nr * disp[:, None]
    set_co(o, co)
    ensure_attrs(o.data)
    set_attr(o.data, "cav", cav)
    return o


def rock_body(rng, name, mats, size, style="round", n=26, voxel=0.035, bevel=0.06, top_flat=0.0, sink=0.12,
              zc=None, **disp):
    """Hull -> bevel -> voxel remesh -> noise/crack displacement. Ground contact at z=0 (sunk by `sink`)."""
    pts = rock_points(rng, size, style, n, top_flat)
    o = rock_hull_obj(name, pts, mats)
    rock_remesh(o, voxel, bevel * min(size))
    rock_displace(o, rng, **disp)
    co = get_co(o)
    zmin = co[:, 2].min()
    co[:, 2] += -zmin - sink * size[2] * 2 if zc is None else zc
    set_co(o, co)
    return o


# --------------------------------------------------------------------------- curves & tubes
def catmull(ctrl, n):
    """Centripetal-ish Catmull-Rom through control points -> n evenly spaced-by-param points."""
    P = np.asarray(ctrl, np.float64)
    P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    segs = len(P) - 3
    out = []
    for k in range(n):
        u = k / (n - 1) * segs
        i = min(int(u), segs - 1)
        t = u - i
        p0, p1, p2, p3 = P[i], P[i + 1], P[i + 2], P[i + 3]
        t2, t3 = t * t, t * t * t
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return np.array(out)


def resample(pts, step):
    pts = np.asarray(pts, np.float64)
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    n = max(2, int(math.ceil(s[-1] / step)) + 1)
    ss = np.linspace(0, s[-1], n)
    return np.stack([np.interp(ss, s, pts[:, k]) for k in range(3)], axis=1)


def frames(pts, up=(0, 0, 1)):
    """Rotation-minimising frames (T, N, B) along a polyline."""
    pts = np.asarray(pts, np.float64)
    T = np.gradient(pts, axis=0)
    T = unit(T)
    up = np.array(up, np.float64)
    N = np.cross(T[0], up)
    if np.linalg.norm(N) < 1e-4:
        N = np.cross(T[0], np.array([1.0, 0, 0]))
    N = N / np.linalg.norm(N)
    Ns = [N]
    for i in range(1, len(pts)):
        n = Ns[-1] - np.dot(Ns[-1], T[i]) * T[i]
        ln = np.linalg.norm(n)
        n = n / ln if ln > 1e-9 else Ns[-1]
        Ns.append(n)
    N = np.array(Ns)
    B = np.cross(T, N)
    return T, N, B


def arclen(pts):
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    return np.concatenate([[0], np.cumsum(seg)])


def tube(pts, radii, m, disp=None, rref=None, theta0=0.0):
    """Ring-tube around polyline `pts` with per-ring radius. disp(s, th, i) -> (dr, cav).
    Returns dict(V, F, cav, bk, rings=(n,m) index grid, T, N, B, s)."""
    pts = np.asarray(pts, np.float64)
    n = len(pts)
    T, N, B = frames(pts)
    s = arclen(pts)
    rref = rref or float(np.mean(radii))
    V = np.empty((n * m, 3))
    cav = np.full(n * m, 0.6, np.float32)
    bk = np.empty((n * m, 3), np.float32)
    for i in range(n):
        for j in range(m):
            th = theta0 + 2 * math.pi * j / m
            c, sn = math.cos(th), math.sin(th)
            d = c * N[i] + sn * B[i]
            r = radii[i]
            if disp is not None:
                dr, cv = disp(s[i], th, i, r)
                r = r + dr
                cav[i * m + j] = cv
            V[i * m + j] = pts[i] + d * r
            bk[i * m + j] = (c * rref, sn * rref, s[i])
    F = []
    for i in range(n - 1):
        for j in range(m):
            a, b = i * m + j, i * m + (j + 1) % m
            F.append((a, b, b + m, a + m))
    return dict(V=V, F=F, cav=cav, bk=bk, T=T, N=N, B=B, s=s, n=n, m=m)


def tube_mb(mb, pts, radii, m, mat=0, disp=None, tint=0.5, cap_end=True, cap_start=False, rref=None):
    t = tube(pts, radii, m, disp, rref)
    F = list(t["F"])
    V = t["V"]
    n = t["n"]
    extra = []
    if cap_end:
        c = len(V) + len(extra)
        extra.append(pts[-1] + t["T"][-1] * radii[-1] * 0.3)
        for j in range(m):
            F.append(((n - 1) * m + j, (n - 1) * m + (j + 1) % m, c))
    if cap_start:
        c = len(V) + len(extra)
        extra.append(pts[0] - t["T"][0] * radii[0] * 0.3)
        for j in range(m):
            F.append(((j + 1) % m, j, c))
    if extra:
        V = np.vstack([V, np.array(extra)])
        cav = np.concatenate([t["cav"], np.full(len(extra), 0.5, np.float32)])
        bk = np.vstack([t["bk"], np.zeros((len(extra), 3), np.float32)])
    else:
        cav, bk = t["cav"], t["bk"]
    mb.add(V, F, cav=cav, tint=tint, bk=bk, mat=mat)
    return t


def bark_disp(rng, rref, amp=0.04, around=7.0, along=1.2, cross=2.6, plates=1.0, flare=None):
    """Furrowed bark: long fissures along the length, broken by crossing cracks into plates."""
    o1, o2, o3 = rvec(rng), rvec(rng), rvec(rng)

    def f(s, th, i, r):
        c, sn = math.cos(th), math.sin(th)
        q = Vector((c * rref * around, sn * rref * around, s * along)) + o1
        n1 = noise.noise(q, noise_basis=NB) + 0.35 * noise.noise(q * 2.3, noise_basis=NB)
        fiss = min(1.0, abs(n1) * 1.6) ** 0.55
        q2 = Vector((c * rref * around * 0.5, sn * rref * around * 0.5, s * cross)) + o2
        d, _ = noise.voronoi(q2, distance_metric="DISTANCE", exponent=2.5)
        cr = sstep(0.0, 0.10, d[1] - d[0])
        h = fiss * (1.0 - plates * 0.55 * (1.0 - cr))
        big = noise.noise(Vector((c * rref * 1.6, sn * rref * 1.6, s * 0.45)) + o3, noise_basis=NB)
        dr = amp * (h - 0.55) + amp * 0.9 * big
        if flare is not None:
            dr += flare(s, th, r)
        return dr, min(1.0, max(0.0, 0.08 + h * 0.92))

    return f


# --------------------------------------------------------------------------- greenery
def leaf_quad(p, nrm, d, L, W, droop=0.3):
    nrm = unit(np.asarray(nrm, float))
    d = np.asarray(d, float)
    d = unit(d - np.dot(d, nrm) * nrm * 0.7)
    side = unit(np.cross(nrm, d))
    tip = p + d * L - nrm * L * droop * 0.5
    mid = p + d * L * 0.45 + nrm * L * 0.08
    V = [p, mid + side * W, tip, mid - side * W]
    return V, [(0, 1, 2), (0, 2, 3)]


def ivy(mb, rng, bvh, start, steps=30, step=0.05, leaf=0.075, wander=0.6, density=1.0, hang=False, gravity=(0, 0, -1),
        mat=0, stem_mat=None, ground=0.02):
    """Walk a creeper over a surface (bvh) downwards from `start`, dropping leaves.
    hang=True lets it fall free (vines off a cliff lip) when no surface is near."""
    p = Vector(start)
    g = Vector(gravity)
    dirv = (g + Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)) * 0.5).normalized()
    stem = [tuple(p)]
    for k in range(steps):
        loc, nrm, _, dist = bvh.find_nearest(p)
        if loc is None:
            break
        if dist is not None and dist < 0.25:
            p = loc + nrm * 0.018
            surf_n = nrm
        else:
            surf_n = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0.3)).normalized()
            if not hang:
                break
        jitter = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.3, 0.3)))
        dirv = (dirv * 0.6 + g * 0.55 + jitter * wander * 0.5)
        dirv = (dirv - surf_n * dirv.dot(surf_n) * (0.0 if hang and (dist or 1) > 0.25 else 1.0)).normalized()
        p = p + dirv * step
        stem.append(tuple(p))
        n_leaves = int(density * 2 + rng.random())
        for _ in range(n_leaves):
            d = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 0.5))).normalized()
            L = leaf * rng.uniform(0.65, 1.25) * (0.7 + 0.3 * min(1.0, k / 5))
            V, F = leaf_quad(np.array(p) + np.array(surf_n) * 0.01, np.array(surf_n), np.array(d), L, L * 0.42)
            mb.add(V, F, cav=0.6, tint=rng.random(), mat=mat)
        if p.z < ground:
            break
    if stem_mat is not None and len(stem) > 2:
        pts = np.array(stem)
        tube_mb(mb, pts, np.linspace(0.012, 0.006, len(pts)), 4, mat=stem_mat, cap_end=False)
    return stem


def fern_sprig(mb, rng, base, up=(0, 0, 1), n=6, L=0.4, mat=0, spread=1.0, tint=None):
    """A clump of small fern fronds (rachis + alternating leaflet triangles)."""
    base = np.asarray(base, float)
    up = unit(np.asarray(up, float))
    t0 = rng.random() if tint is None else tint
    a0 = rng.uniform(0, 2 * math.pi)
    for k in range(n):
        a = a0 + 2 * math.pi * k / n + rng.uniform(-0.3, 0.3)
        out = np.array([math.cos(a), math.sin(a), 0.0])
        out = unit(out - np.dot(out, up) * up)
        lift = rng.uniform(0.55, 1.1) * spread
        ln = L * rng.uniform(0.7, 1.2)
        K = 9
        pts = []
        for i in range(K + 1):
            u = i / K
            # arching frond: rises then droops
            pts.append(base + out * ln * u * 0.9 + up * ln * (lift * u - (0.55 + 0.3 * lift) * u * u))
        pts = np.array(pts)
        V, F = [], []
        side = unit(np.cross(up, out))
        for i in range(1, K):
            u = i / K
            w = ln * 0.22 * math.sin(math.pi * min(1.0, u * 1.15)) + 0.004
            fwd = pts[min(K, i + 1)] - pts[i]
            for sgn in (-1, 1):
                b = len(V)
                tipp = pts[i] + side * sgn * w + fwd * 0.6 - up * w * 0.25
                V.extend([pts[i], tipp, pts[i + 1]])
                F.append((b, b + 1, b + 2))
        V.append(pts[0])
        V.append(pts[0] + side * 0.006)
        V.append(pts[-1])
        F.append((len(V) - 3, len(V) - 2, len(V) - 1))
        mb.add(V, F, cav=0.6, tint=min(1.0, max(0.0, t0 + rng.uniform(-0.12, 0.12))), mat=mat)


def grass_tuft(mb, rng, base, n=10, h=0.22, mat=0, spread=0.12):
    base = np.asarray(base, float)
    t0 = rng.random()
    for _ in range(n):
        a = rng.uniform(0, 2 * math.pi)
        lean = np.array([math.cos(a), math.sin(a), 0]) * rng.uniform(0.15, 0.6)
        p0 = base + np.array([math.cos(a), math.sin(a), 0]) * rng.uniform(0, spread)
        hh = h * rng.uniform(0.5, 1.2)
        w = 0.012 * rng.uniform(0.7, 1.3)
        side = np.array([-math.sin(a), math.cos(a), 0])
        pts = [p0 + (lean * (u * u) + np.array([0, 0, 1.0]) * u) * hh for u in (0, 0.35, 0.7, 1.0)]
        V = [pts[0] - side * w, pts[0] + side * w, pts[1] - side * w * 0.8, pts[1] + side * w * 0.8,
             pts[2] - side * w * 0.5, pts[2] + side * w * 0.5, pts[3]]
        F = [(0, 1, 3, 2), (2, 3, 5, 4), (4, 5, 6)]
        mb.add(V, F, cav=0.6, tint=min(1, max(0, t0 + rng.uniform(-0.2, 0.2))), mat=mat)


_ICO = {}


def ico(sub):
    if sub not in _ICO:
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        V = np.array([v.co[:] for v in bm.verts])
        F = [[v.index for v in f.verts] for f in bm.faces]
        bm.free()
        _ICO[sub] = (V, F)
    return _ICO[sub]


def blob(rng, center, size, nrm=(0, 0, 1), sub=2, rough=0.35, freq=2.5, flat_bottom=False):
    """Noise-displaced ellipsoid oriented to nrm (moss cushions, eggs-in-dirt, clods)."""
    V, F = ico(sub)
    V = V.copy()
    off = rvec(rng)
    cav = np.empty(len(V), np.float32)
    for i, v in enumerate(V):
        p = Vector(v)
        d = 1.0 + rough * frac(p * freq + off, 3)
        V[i] = v * d
        cav[i] = 0.45 + 0.5 * (d - 1.0) / max(rough, 1e-3)
    V = V * np.asarray(size, float)
    if flat_bottom:
        V[:, 2] = np.maximum(V[:, 2], -size[2] * 0.15)
    nrm = Vector(nrm).normalized()
    R = nrm.to_track_quat("Z", "Y").to_matrix()
    R = np.array(R) @ np.array(Matrix.Rotation(rng.uniform(0, 6.283), 3, "Z"))
    V = V @ R.T + np.asarray(center, float)
    return V, F, np.clip(cav, 0, 1)


def pick_surface(o, rng, k, nz_min=0.6, z_min=0.0, z_max=1e9, cav_max=1.1, cav_min=-1.0):
    """k random (pos, normal) samples from vertices satisfying the conditions."""
    co = get_co(o)
    nr = get_nrm(o)
    cav = np.empty(len(co), np.float32)
    o.data.attributes["cav"].data.foreach_get("value", cav)
    ok = np.where((nr[:, 2] >= nz_min) & (co[:, 2] >= z_min) & (co[:, 2] <= z_max) & (cav <= cav_max) & (cav >= cav_min))[0]
    if len(ok) == 0:
        return []
    out = []
    for _ in range(k):
        i = int(ok[rng.randrange(len(ok))])
        out.append((co[i], nr[i]))
    return out


# --------------------------------------------------------------------------- framing
def frame_for(gx0, gx1, gy0, gy1, h, margin=14, zmin=0.0):
    """Frame size + anchor that contains the game-space box (sprite never clipped)."""
    from common import proj

    xs, ys = [], []
    for gx in (gx0, gx1):
        for gy in (gy0, gy1):
            for gz in (zmin, h):
                sx, sy = proj(gx, gy, gz)
                xs.append(sx)
                ys.append(sy)
    x0, x1, y0, y1 = min(xs) - margin, max(xs) + margin, min(ys) - margin, max(ys) + margin
    w = int(math.ceil((x1 - x0) / 2) * 2)
    hh = int(math.ceil((y1 - y0) / 2) * 2)
    return (w, hh), (round(-x0) / w, round(-y0) / hh)
