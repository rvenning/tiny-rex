"""Rocks, logs and structures for Fern Hollow + Riverbend (wave 1).

Helpers live in rock_util.py (geometry) and rock_materials.py (shaders).
Every builder: fn(rng) -> [mesh objects], ground contact z=0, +Z up,
Blender X = gy, Blender Y = gx (see common.b_xy).
"""
import math
import random
import zlib

import numpy as np
from mathutils import Matrix, Vector, noise

from . import Prop
from . import rock_materials as M
from . import rock_util as U

TAU = 2 * math.pi


def variant_of(rng, name, n):
    """Recover the variant index render_props seeded `rng` with (call before using rng)."""
    st = rng.getstate()
    for v in range(n):
        if random.Random(zlib.crc32(f"{name}:{v}".encode())).getstate() == st:
            return v
    return 0


def gxy(objs_or_pts):
    """Swap a builder's local (x=gx, y=gy) into Blender (X=gy, Y=gx) for point arrays."""
    return np.asarray(objs_or_pts)[..., [1, 0, 2]]


# =========================================================================== shared dressing
class Greens:
    """Lazily created greenery materials for one build (materials die with the scene)."""

    def __init__(self):
        self._m = {}

    def _get(self, k, fn):
        if k not in self._m:
            self._m[k] = fn()
        return self._m[k]

    @property
    def leaf(self):
        return self._get("leaf", lambda: M.leaf_mat("ivy", light=(0.30, 0.46, 0.06), dark=(0.06, 0.20, 0.05), trans=0.3))

    @property
    def vine(self):
        return self._get("vine", lambda: M.leaf_mat("vine", light=(0.58, 0.64, 0.10), dark=(0.16, 0.34, 0.05), trans=0.45))

    @property
    def fern(self):
        return self._get("fern", lambda: M.leaf_mat("fern", light=(0.40, 0.56, 0.08), dark=(0.08, 0.26, 0.05), trans=0.4))

    @property
    def grass(self):
        return self._get("grass", lambda: M.leaf_mat("grass", light=(0.50, 0.55, 0.12), dark=(0.20, 0.34, 0.07), trans=0.3))

    @property
    def moss(self):
        return self._get("moss", M.moss_mat)

    @property
    def stem(self):
        return self._get("stem", lambda: M.bark_mat(moss=0.0, lichen=0.0, grey=0.0))


def moss_tufts(rng, host, k, size, gr, z_min=0.0, nz_min=0.7, flat=0.16, cav_max=1.1, name="moss"):
    """Small low-relief moss tufts (break the silhouette slightly; most moss is in the shader)."""
    if k <= 0:
        return []
    mb = U.MB()
    for pos, nrm in U.pick_surface(host, rng, k, nz_min=nz_min, z_min=z_min, cav_max=cav_max):
        s = size * rng.uniform(0.5, 1.2)
        sz = (s * rng.uniform(0.9, 1.6), s * rng.uniform(0.7, 1.1), s * flat)
        V, F, cav = U.blob(rng, pos - nrm * sz[2] * 0.4, sz, nrm, sub=2, rough=0.5, freq=4.0)
        mb.add(V, F, cav=cav, tint=rng.random())
    o = mb.obj(name, [gr.moss])
    return [o] if o else []


def crevice_ferns(rng, host, k, gr, L=0.35, z_max=1e9, z_min=-1.0, nz=(-0.3, 0.75), cav_max=0.75, name="ferns"):
    if k <= 0:
        return []
    mb = U.MB()
    for pos, nrm in U.pick_surface(host, rng, k * 2, nz_min=nz[0], z_max=z_max, z_min=z_min, cav_max=cav_max):
        if nrm[2] > nz[1] or k <= 0:
            continue
        k -= 1
        up = U.unit(np.array(nrm) * 0.55 + np.array([0, 0, 1.0]))
        U.fern_sprig(mb, rng, pos - nrm * 0.02, up, n=rng.randint(4, 7), L=L * rng.uniform(0.7, 1.2), spread=0.9)
    o = mb.obj(name, [gr.fern], smooth=False)
    return [o] if o else []


def base_grass(rng, host, k, gr, h=0.22, name="grass"):
    """Grass tufts around the foot of `host` (where it meets the ground)."""
    co = U.get_co(host)
    low = co[co[:, 2] < 0.04]
    if len(low) == 0 or k <= 0:
        return []
    c = co[:, :2].mean(axis=0)
    mb = U.MB()
    for _ in range(k):
        p = low[rng.randrange(len(low))].copy()
        d = p[:2] - c
        d = d / max(1e-6, np.linalg.norm(d))
        p[:2] += d * rng.uniform(0.0, 0.08)
        p[2] = 0.0
        U.grass_tuft(mb, rng, p, n=rng.randint(6, 12), h=h * rng.uniform(0.6, 1.2))
    o = mb.obj(name, [gr.grass], smooth=False)
    return [o] if o else []


def ivy_over(rng, hosts, k, gr, steps=34, leaf=0.075, z_min=0.3, hang=False, vine=False, start_pts=None, name="ivy",
             density=(0.9, 1.6)):
    bvh = U.bvh_of(hosts)
    mb = U.MB()
    starts = start_pts if start_pts is not None else [p + n * 0.02 for p, n in U.pick_surface(hosts[0], rng, k, nz_min=0.55, z_min=z_min)]
    for st in starts:
        U.ivy(mb, rng, bvh, Vector(st), steps=rng.randint(max(2, steps // 2), steps), leaf=leaf, hang=hang,
              density=rng.uniform(*density), mat=0, stem_mat=1)
    o = mb.obj(name, [gr.vine if vine else gr.leaf, gr.stem], smooth=False)
    return [o] if o else []


def fungus_shelves(rng, host, k, name="fungus", z_min=0.15):
    if k <= 0:
        return []
    mb = U.MB()
    got = 0
    for pos, nrm in U.pick_surface(host, rng, k * 6, nz_min=-0.3, z_min=z_min):
        if abs(nrm[2]) > 0.3 or got >= k:
            continue
        got += 1
        out = U.unit(np.array([nrm[0], nrm[1], 0.0]))
        side = np.cross(out, [0, 0, 1.0])
        for t in range(rng.randint(2, 4)):
            s = rng.uniform(0.07, 0.13) * (1.0 - 0.2 * t)
            c = np.array(pos) + np.array([0, 0, -t * s * 0.75]) + side * rng.uniform(-0.6, 0.6) * s + out * s * 0.1
            V, F = U.ico(2)
            V = V.copy()
            rad = np.sqrt(V[:, 0] ** 2 + V[:, 1] ** 2)
            ang = np.arctan2(V[:, 1], V[:, 0])
            loc = V[:, 0:1] * side * s + V[:, 1:2] * out * s * 0.8 + V[:, 2:3] * np.array([0, 0, 1.0]) * s * 0.2
            loc[:, 2] -= (rad ** 2) * s * 0.2
            loc += out * (np.sin(ang * 5 + rng.random() * 6) * 0.05 * s * rad)[:, None]
            mb.add(loc + c, F, cav=np.clip(rad, 0, 1).astype(np.float32), tint=rng.random())
    o = mb.obj(name, [M.fungus_mat()])
    return [o] if o else []


def small_rock(rng, mat, s, name="pebble", flat=0.7):
    return U.rock_body(rng, name, [mat], (s, s * rng.uniform(0.65, 1.0), s * rng.uniform(0.45, flat)), "round",
                       n=rng.randint(10, 16), voxel=max(0.008, s * 0.16), bevel=0.2, sink=0.15, amp=s * 0.1,
                       fine=s * 0.03, crack=0.0, n_split=0, feat=min(6.0, 0.5 / max(s, 0.05)))


def place(o, x, y, z=0.0, rz=0.0):
    co = U.get_co(o)
    if rz:
        c, s = math.cos(rz), math.sin(rz)
        co[:, :2] = co[:, :2] @ np.array([[c, s], [-s, c]])
    co += np.array([x, y, z])
    U.set_co(o, co)
    return o


def pebble_ring(rng, k, R, pal, rmin=0.04, rmax=0.09, name="pebbles"):
    """A few small stones scattered just outside radius R."""
    out = []
    if k <= 0:
        return out
    mat = M.rock_mat(pal, moss=0.15, lichen=0.3, wet=0.0)
    for i in range(k):
        a = rng.uniform(0, TAU)
        d = R * rng.uniform(0.95, 1.3)
        out.append(place(small_rock(rng, mat, rng.uniform(rmin, rmax), f"{name}{i}"), math.cos(a) * d, math.sin(a) * d))
    return out


def soil_mound(rng, R, h, x=0.0, y=0.0, col=(0.36, 0.22, 0.11), name="soil"):
    """Low dirt mound whose rim fades out (alpha), for half-buried things."""
    mat = M.soil_mat(col=col, radius=R)
    V, F, cav = U.blob(rng, (0, 0, 0), (R, R * rng.uniform(0.8, 1.0), h), sub=3, rough=0.25, freq=2.0)
    V[:, 2] = np.maximum(V[:, 2], 0.0) + 0.002
    o = U.mesh_obj(name, V, F, [mat], cav=cav)
    return place(o, x, y)


def finish(objs, limit=58000):
    objs = [o for o in objs if o is not None]
    U.clamp_ground(objs)
    U.budget(objs, limit)
    return objs


# =========================================================================== rocks
def boulder(rng, R, H, pal=None, style=None, moss=None, green=None, sink=0.12, wet=0.5, voxel=None, feat=None,
            extras=True, algae=False, wet_z=0.08, crack=None, tilt=None, strata=None, n_split=None, top_flat=None,
            lichen=None, smooth=False):
    gr = Greens()
    pal = pal or rng.choice(["fern", "fern", "warm", "cool"])
    moss = rng.uniform(0.3, 0.75) if moss is None else moss
    style = style or rng.choice(["round", "round", "round", "slab", "block"])
    feat = feat or (1.0 / max(R, 0.25)) ** 0.5
    strata = (rng.uniform(0.0, 1.0) if rng.random() < 0.5 else 0.0) if strata is None else strata
    mat = M.rock_mat(pal, moss=moss, lichen=rng.uniform(0.15, 0.6) if lichen is None else lichen, wet=wet, wet_z=wet_z,
                     algae=algae, feat=feat, strata=strata, strata_f=rng.uniform(2.5, 5.0) / max(H, 0.4))
    zf = 0.62 if style == "slab" else 0.55
    size = (R * rng.uniform(0.92, 1.12), R * rng.uniform(0.72, 0.98), H * zf)
    voxel = voxel or max(0.014, min(0.05, R * 0.045))
    crack = (0.012 + 0.02 * R) if crack is None else crack
    if smooth:
        crack *= 0.3
    o = U.rock_body(rng, "rock", [mat], size, style, n=rng.randint(18, 34) if style == "round" else rng.randint(14, 24),
                    voxel=voxel, bevel=rng.uniform(0.08, 0.16) * (1.6 if smooth else 1.0),
                    top_flat=(rng.uniform(0.0, 0.3) if style != "round" else 0.0) if top_flat is None else top_flat, sink=0.0,
                    amp=(0.04 if smooth else 0.075) * R, fine=0.01 * R ** 0.5, crack=crack, crack_scale=1.3 * feat,
                    crack_w=0.05, feat=feat, crack_cov=rng.uniform(0.15, 0.35),
                    n_split=rng.randint(1, 3) if n_split is None else n_split, split_w=0.025 + 0.012 * R,
                    strata=strata * 0.012 * R, strata_f=rng.uniform(2.0, 3.5) / max(H, 0.4))
    # tilt: boulders settle at an angle, slabs lean
    tilt = rng.uniform(0.05, 0.28) if tilt is None else tilt
    U.transform([o], Matrix.Rotation(tilt, 4, Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)).normalized()))
    U.rot_z([o], rng.uniform(0, TAU))
    co = U.get_co(o)
    z0, z1 = co[:, 2].min(), co[:, 2].max()
    co[:, 2] = (co[:, 2] - z0) / (z1 - z0) * (H * (1 + sink)) - H * sink
    co[:, :2] -= co[co[:, 2] < 0.05][:, :2].mean(axis=0) if (co[:, 2] < 0.05).any() else 0
    U.set_co(o, co)
    objs = [o]
    if extras:
        green = rng.uniform(0.2, 1.0) if green is None else green
        objs += moss_tufts(rng, o, int(moss * 8 * R), 0.09 * R ** 0.6, gr, z_min=H * 0.5, cav_max=0.75)
        if green > 0.45:
            objs += crevice_ferns(rng, o, rng.randint(1, 2), gr, L=0.2 + 0.15 * R, z_max=H * 0.5)
        objs += base_grass(rng, o, int(green * 7 * R + 1), gr, h=0.12 + 0.08 * R)
        objs += pebble_ring(rng, rng.randint(0, 3), R * 0.95, pal)
    return objs


def build_boulder_s(rng):
    return finish(boulder(rng, 0.36, 0.5))


def build_boulder_m(rng):
    return finish(boulder(rng, 0.72, 1.0))


def build_boulder_l(rng):
    return finish(boulder(rng, 1.3, 1.8, style=rng.choice(["round", "slab", "block"])))


def build_pebbles(rng):
    pal = rng.choice(["fern", "warm", "cool", "river"])
    mats = [M.rock_mat(p, moss=rng.uniform(0.0, 0.3), lichen=0.3, wet=0.0) for p in (pal, rng.choice(["fern", "warm", "cool"]))]
    objs = []
    k = rng.randint(5, 11)
    for i in range(k):
        a = rng.uniform(0, TAU)
        d = 0.45 * rng.random() ** 0.7
        s = rng.uniform(0.035, 0.11) * (1.0 if i else 1.25)
        objs.append(place(small_rock(rng, mats[i % 2], s, f"pb{i}", flat=0.6), math.cos(a) * d, math.sin(a) * d,
                          rz=rng.uniform(0, TAU)))
    gr = Greens()
    if rng.random() < 0.6:
        mb = U.MB()
        for _ in range(rng.randint(1, 3)):
            a = rng.uniform(0, TAU)
            U.grass_tuft(mb, rng, (math.cos(a) * 0.3, math.sin(a) * 0.3, 0), n=rng.randint(4, 8), h=0.12)
        objs.append(mb.obj("g", [gr.grass], smooth=False))
    return finish(objs)


def build_flat_stone(rng):
    """Riverbend stepping stone: flat cracked top ~1.2u, dark wet sides, moss on the rim."""
    gr = Greens()
    pal = rng.choice(["river", "fern", "warm"])
    mat = M.rock_mat(pal, moss=rng.uniform(0.25, 0.5), lichen=0.4, wet=0.75, wet_z=0.13, algae=True, feat=1.2,
                     strata=0.5, strata_f=10.0)
    o = U.rock_body(rng, "stone", [mat], (0.62, rng.uniform(0.45, 0.58), 0.22), "slab", n=rng.randint(16, 24),
                    voxel=0.025, bevel=0.18, top_flat=0.45, sink=0.0, amp=0.02, fine=0.006, crack=0.03,
                    crack_scale=1.6, crack_w=0.04, crack_cov=0.2, n_split=rng.randint(1, 2), split_w=0.03, feat=1.2)
    U.rot_z([o], rng.uniform(0, TAU))
    U.transform([o], Matrix.Rotation(rng.uniform(0.0, 0.06), 4, Vector((1, rng.uniform(-1, 1), 0)).normalized()))
    co = U.get_co(o)
    z0, z1 = co[:, 2].min(), co[:, 2].max()
    co[:, 2] = (co[:, 2] - z0) / (z1 - z0) * 0.4 - 0.15
    U.set_co(o, co)
    objs = [o]
    objs += moss_tufts(rng, o, rng.randint(1, 4), 0.07, gr, z_min=0.18, nz_min=0.5)
    if rng.random() < 0.5:
        objs.append(place(small_rock(rng, mat, rng.uniform(0.1, 0.16), "side"), rng.uniform(-0.6, 0.6), 0.62 * rng.choice((-1, 1))))
    return finish(objs)


def build_outcrop(rng):
    """Big stacked-block ledge, flat mossy top at ~1.5u where a raptor can stand."""
    gr = Greens()
    pal = rng.choice(["fern", "warm", "cool"])
    mats = [M.rock_mat(pal, moss=rng.uniform(0.5, 0.8), lichen=rng.uniform(0.3, 0.6), wet=0.4, feat=0.8,
                       strata=rng.uniform(0.3, 0.9), strata_f=rng.uniform(2.0, 3.0)) for _ in range(2)]
    objs = []
    top = 1.5
    # (gx, gy, half-size, top z)   front = +gx/+gy (toward the camera)
    cells = []
    for gx in (-1.25, 0.0, 1.25):
        for gy in (-0.85, 0.15, 1.0):
            front = (gx + gy) > 0.9
            back = (gx + gy) < -1.0
            ztop = top + (rng.uniform(0.35, 0.7) if back and rng.random() < 0.7 else rng.uniform(-0.06, 0.06))
            if front and rng.random() < 0.6:
                ztop = rng.uniform(0.8, 1.25)
            cells.append((gx + rng.uniform(-0.15, 0.15), gy + rng.uniform(-0.12, 0.12), ztop))
    for i, (gx, gy, zt) in enumerate(cells):
        sx, sy = rng.uniform(0.62, 0.8), rng.uniform(0.55, 0.72)
        o = U.rock_body(rng, f"blk{i}", [mats[i % 2]], (sx, sy, zt * 0.55), "block", n=rng.randint(14, 22), voxel=0.05,
                        bevel=rng.uniform(0.1, 0.16), top_flat=0.25, sink=0.0, amp=0.05, fine=0.01, crack=0.03,
                        crack_scale=1.0, crack_w=0.05, crack_cov=0.2, n_split=rng.randint(0, 2), split_w=0.04, feat=0.8,
                        strata=0.02, strata_f=2.5)
        U.rot_z([o], rng.uniform(-0.35, 0.35))
        co = U.get_co(o)
        z0, z1 = co[:, 2].min(), co[:, 2].max()
        co[:, 2] = (co[:, 2] - z0) / (z1 - z0) * (zt + 0.1) - 0.1
        U.set_co(o, co)
        objs.append(place(o, gy, gx))  # Blender X = gy, Y = gx
    # foot boulders on the visible front
    for k in range(rng.randint(2, 4)):
        a = rng.uniform(-0.2, 1.8)
        bo = boulder(rng, rng.uniform(0.3, 0.5), rng.uniform(0.4, 0.7), pal=pal, extras=False, moss=0.4)
        for o in bo:
            place(o, math.sin(a) * 1.75 + rng.uniform(-0.2, 0.2), math.cos(a) * 1.9)
        objs += bo
    rocks = list(objs)
    objs += moss_tufts(rng, rocks[rng.randrange(len(cells))], 6, 0.1, gr, z_min=1.3, cav_max=0.8)
    for _ in range(3):
        objs += crevice_ferns(rng, rocks[rng.randrange(len(cells))], 1, gr, L=0.4, z_max=1.2, z_min=0.2)
    objs += ivy_over(rng, rocks[:len(cells)], 0, gr, steps=24, leaf=0.07,
                     start_pts=[p + n * 0.02 for o in rng.sample(rocks[:len(cells)], 3)
                                for p, n in U.pick_surface(o, rng, 1, nz_min=0.8, z_min=1.3)])
    for o in rng.sample(rocks[:len(cells)], 4):
        objs += base_grass(rng, o, 2, gr, h=0.25)
    return finish(objs)


# =========================================================================== logs
def flare_fn(rng, L, at_start=True, at_end=False, lf=0.9, amp=0.6, lobes=None):
    k = lobes or rng.randint(4, 6)
    ph = rng.uniform(0, TAU)

    def f(s, th, r):
        dr = 0.0
        lobe = 0.35 + max(0.0, math.cos(k * (th - ph))) ** 3 * 1.2
        if at_start and s < lf:
            dr += r * amp * (1 - s / lf) ** 2 * lobe
        if at_end and s > L - lf:
            dr += r * amp * (1 - (L - s) / lf) ** 2 * lobe
        return dr

    return f


def log_mats(rng, moss=None):
    return [M.bark_mat(moss=rng.uniform(0.45, 0.75) if moss is None else moss, lichen=rng.uniform(0.1, 0.35)),
            M.wood_inner_mat(), M.endgrain_mat(), M.wood_inner_mat("splinter", fresh=True)]


def trunk(rng, pts, radii, ends=("cut", "broken"), m=30, bark_amp=0.045, flare=None, rref=None, depth=1.2,
          hollow_frac=0.68, mats=None, jag=0.22, name="trunk"):
    """Bark tube along pts with end treatments: none | cut | broken | hollow.
    Material slots: 0 bark, 1 rotten interior, 2 end grain, 3 fresh splinter wood."""
    pts = np.asarray(pts, float)
    rref = rref or float(np.mean(radii))
    mats = mats or log_mats(rng)
    disp = U.bark_disp(rng, rref, amp=bark_amp, flare=flare)
    t = U.tube(pts, radii, m, disp, rref)
    V = [t["V"]]
    F = list(t["F"])
    mi = [0] * len(F)
    cav = [t["cav"]]
    bk = [t["bk"]]
    n, T, N, B, s = t["n"], t["T"], t["N"], t["B"], t["s"]
    nv = [len(t["V"])]

    def addv(v, c, b):
        i0 = nv[0]
        v = np.asarray(v, float).reshape(-1, 3)
        V.append(v)
        cav.append(np.asarray(c, np.float32).reshape(-1))
        bk.append(np.asarray(b, np.float32).reshape(-1, 3))
        nv[0] += len(v)
        return i0

    allV = t["V"]
    for side, kind in ((0, ends[0]), (1, ends[1])):
        if kind == "none":
            continue
        ring_i = 0 if side == 0 else n - 1
        tdir = -T[0] if side == 0 else T[-1]
        ring = [ring_i * m + j for j in range(m)]
        if kind in ("broken", "hollow"):
            ph = rng.uniform(0, TAU)
            spikes = [(rng.random() ** 3) for _ in range(m)]
            for j in range(m):
                th = TAU * j / m
                a = jag * (0.35 * (0.5 + 0.5 * math.sin(2 * th + ph)) + 0.9 * spikes[j])
                if kind == "hollow":
                    a *= 0.6
                allV[ring[j]] = allV[ring[j]] + tdir * a
        c = pts[ring_i]
        rim = allV[ring]
        if kind == "cut":
            rr = radii[ring_i]
            k0 = addv(rim, np.full(m, 0.6), [((rim[j] - c) @ N[ring_i] / rr, (rim[j] - c) @ B[ring_i] / rr, 0) for j in range(m)])
            cc = addv(c + tdir * 0.01, [0.6], [(0, 0, 0)])
            for j in range(m):
                a, b = k0 + j, k0 + (j + 1) % m
                F.append((a, b, cc) if side == 1 else (b, a, cc))
                mi.append(2)
        elif kind == "broken":
            prev = list(ring)
            K = 3
            for k in range(1, K + 1):
                f = 1.0 - k / (K + 0.6)
                pts_k = []
                for j in range(m):
                    d = rim[j] - c
                    spike = rng.random() ** 2.5 * jag * 1.4 * (1 - 0.3 * k / K)
                    pts_k.append(c + d * f + tdir * (spike - 0.02))
                k0 = addv(pts_k, np.full(m, 0.5), np.zeros((m, 3)))
                for j in range(m):
                    a, b = prev[j], prev[(j + 1) % m]
                    q = (a, b, k0 + (j + 1) % m, k0 + j) if side == 1 else (b, a, k0 + j, k0 + (j + 1) % m)
                    F.append(q)
                    mi.append(3)
                prev = [k0 + j for j in range(m)]
            cc = addv(c + tdir * jag * 0.5, [0.5], [(0, 0, 0)])
            for j in range(m):
                a, b = prev[j], prev[(j + 1) % m]
                F.append((a, b, cc) if side == 1 else (b, a, cc))
                mi.append(3)
        elif kind == "hollow":
            idx = list(range(n)) if side == 1 else list(range(n - 1, -1, -1))
            dist = np.abs(s - s[ring_i])
            idx = [i for i in idx if dist[i] <= depth]
            idx = idx[::-1]  # from the rim inward
            inner_rings = []
            for q, i in enumerate(idx):
                ring_pts = []
                for j in range(m):
                    th = TAU * j / m
                    d = math.cos(th) * N[i] + math.sin(th) * B[i]
                    ri = radii[i] * hollow_frac * (1 + 0.08 * noise.noise(Vector((math.cos(th) * 2, math.sin(th) * 2, s[i] * 2))))
                    p = pts[i] + d * ri
                    if q == 0:
                        p = p + ((rim[j] - pts[i]) @ tdir) * tdir
                    ring_pts.append(p)
                k0 = addv(ring_pts, np.full(m, 0.3), [(math.cos(TAU * j / m) * rref, math.sin(TAU * j / m) * rref, s[i]) for j in range(m)])
                inner_rings.append(k0)
            for j in range(m):
                a, b = ring[j], ring[(j + 1) % m]
                ia, ib = inner_rings[0] + j, inner_rings[0] + (j + 1) % m
                F.append((a, b, ib, ia) if side == 1 else (b, a, ia, ib))
                mi.append(3)
            for q in range(len(inner_rings) - 1):
                r0, r1 = inner_rings[q], inner_rings[q + 1]
                for j in range(m):
                    a, b = r0 + j, r0 + (j + 1) % m
                    F.append((b, a, r1 + j, r1 + (j + 1) % m) if side == 1 else (a, b, r1 + (j + 1) % m, r1 + j))
                    mi.append(1)
            last = inner_rings[-1]
            cc = addv(pts[idx[-1]], [0.2], [(0, 0, 0)])
            for j in range(m):
                a, b = last + j, last + (j + 1) % m
                F.append((b, a, cc) if side == 1 else (a, b, cc))
                mi.append(1)
    o = U.mesh_obj(name, np.vstack(V), F, mats, mat_idx=mi, cav=np.concatenate(cav), bk=np.vstack(bk))
    return o, t


def gnarl_path(rng, p0, d0, L, curl=0.6, gravity=0.0, steps=8, ground_end=False, target=None, pull=0.0):
    p = np.asarray(p0, float)
    d = U.unit(np.asarray(d0, float))
    off = U.rvec(rng)
    pts = [p.copy()]
    for k in range(steps):
        u = (k + 1) / steps
        turn = np.array(noise.noise_vector(off + Vector((u * 2.2, 0, 0)), noise_basis=U.NB))
        if target is not None:
            d = U.unit(d + (U.unit(np.asarray(target, float)) - d) * pull)
        d = U.unit(d + turn * curl * 0.6 + np.array([0, 0, -gravity * u]))
        p = p + d * L / steps
        pts.append(p.copy())
    pts = np.array(pts)
    if ground_end:
        z0 = pts[0, 2]
        for k in range(len(pts)):
            u = k / (len(pts) - 1)
            pts[k, 2] = pts[k, 2] * (1 - u ** 1.5) + (-0.03) * u ** 1.5 if z0 > 0 else pts[k, 2]
    return U.resample(U.catmull(pts, 40), 0.04)


def root(rng, mb, p0, d0, L, r0, mat=0, curl=0.6, gravity=0.0, ground_end=False, tip=0.22, m=8, target=None, pull=0.0,
         steps=8):
    pts = gnarl_path(rng, p0, d0, L, curl, gravity, ground_end=ground_end, target=target, pull=pull, steps=steps)
    n = len(pts)
    radii = np.array([r0 * (1 - (1 - tip) * (i / (n - 1)) ** 0.9) for i in range(n)])
    U.tube_mb(mb, pts, radii, m, mat=mat, disp=U.bark_disp(rng, r0, amp=r0 * 0.3, around=9.0), rref=r0, cap_end=True)
    return pts


def root_plate(rng, mb_root, mb_soil, center, axis, R, r_trunk, n_roots=None):
    """Upturned root-ball: a clod of earth held in a fan of gnarled roots, facing `axis`."""
    axis = U.unit(np.asarray(axis, float))
    u = U.unit(np.cross(axis, [0, 0, 1.0]))
    v = np.cross(axis, u)
    if v[2] < 0:
        v = -v
    center = np.asarray(center, float)
    n_roots = n_roots or rng.randint(11, 15)
    for k in range(n_roots):
        a = TAU * k / n_roots + rng.uniform(-0.25, 0.25)
        d = math.cos(a) * u + math.sin(a) * v
        # thick roots split out of the trunk end, flare outward, then droop / curl back
        p0 = center - axis * 0.45 + d * r_trunk * 0.35
        low = d[2] < -0.25
        L = R * rng.uniform(0.9, 1.35) * (1.25 if low else 1.0)
        r0 = rng.uniform(0.12, 0.19) * min(1.0, r_trunk / 0.55)
        tgt = d * 1.0 + axis * rng.uniform(-0.1, 0.35) + np.array([0, 0, -0.9 if low else -0.25])
        pts = root(rng, mb_root, p0, U.unit(axis * 0.9 + d * 0.5), L, r0, curl=0.9, gravity=0.25 if low else 0.1,
                   ground_end=low, tip=0.3, m=10, target=tgt, pull=0.45, steps=10)
        # finer rootlets off the big roots
        for _ in range(rng.randint(1, 3)):
            i = rng.randint(len(pts) // 3, len(pts) - 2)
            root(rng, mb_root, pts[i], U.unit(d + np.array([rng.uniform(-1, 1) for _ in range(3)]) * 0.8), L * 0.4,
                 r0 * 0.3, curl=1.2, gravity=0.4, m=6, tip=0.2)
    # earth caught in the root mass: dark lumps nestled between the roots, not a pancake
    V, F, cav = U.blob(rng, center - axis * 0.1, (R * 0.32, R * 0.32, 0.3), axis, sub=3, rough=0.55, freq=2.6)
    mb_soil.add(V, F, cav=cav, tint=rng.random())
    for _ in range(rng.randint(5, 8)):
        a = rng.uniform(0, TAU)
        p = center + (math.cos(a) * u + math.sin(a) * v) * R * rng.uniform(0.25, 0.5) + axis * rng.uniform(-0.1, 0.1)
        s = rng.uniform(0.1, 0.17)
        V, F, cav = U.blob(rng, p, (s, s * 0.9, s * 0.8), axis, sub=2, rough=0.5, freq=3.0)
        mb_soil.add(V, F, cav=cav, tint=rng.random())


def log_dressing(rng, o, gr, length, moss=0.6, ivy_k=None, fungi=None, ferns=None, tufts=None, leaf=0.07, hang=0):
    objs = []
    objs += moss_tufts(rng, o, int(tufts if tufts is not None else moss * 3 * length), 0.08, gr, nz_min=0.8, z_min=0.25)
    k = ivy_k if ivy_k is not None else rng.randint(1, 2 + int(length / 2))
    if k:
        objs += ivy_over(rng, [o], k, gr, steps=24, leaf=leaf, z_min=0.25)
    if hang:
        # creepers dangling from the underside (e.g. over an arch opening)
        starts = [p + n * 0.02 for p, n in U.pick_surface(o, rng, hang * 3, nz_min=-1.0, z_min=0.9) if n[2] < -0.3][:hang]
        objs += ivy_over(rng, [o], 0, gr, steps=18, leaf=leaf * 0.9, hang=True, vine=True, start_pts=starts, density=(0.6, 1.0))
    objs += fungus_shelves(rng, o, fungi if fungi is not None else rng.randint(0, 2))
    if ferns is None:
        ferns = rng.randint(0, 3)
    objs += crevice_ferns(rng, o, ferns, gr, L=0.32, z_max=0.35, nz=(-0.6, 0.6), cav_max=1.0)
    objs += base_grass(rng, o, rng.randint(2, 6), gr, h=0.2)
    return objs


def branch_stubs(rng, mb, pts, radii, t, k, mat=0, lmin=0.3, lmax=0.7, up_only=True):
    n = len(pts)
    for _ in range(k):
        i = rng.randint(n // 6, 5 * n // 6)
        d = t["N"][i] * rng.uniform(-1, 1) + t["B"][i] * rng.uniform(-1, 1)
        if up_only:
            d = d + np.array([0, 0, 0.8])
        d = U.unit(d + t["T"][i] * rng.uniform(0.0, 0.6))
        bp = pts[i] + d * radii[i] * 0.6
        L = rng.uniform(lmin, lmax)
        bpts = gnarl_path(rng, bp, d, L, curl=0.3, steps=4)
        rr = np.linspace(radii[i] * rng.uniform(0.18, 0.28), 0.035, len(bpts))
        U.tube_mb(mb, bpts, rr, 8, mat=mat, disp=U.bark_disp(rng, rr[0], amp=0.015), cap_end=True, rref=rr[0])


def build_log_arch(rng, along="gx"):
    """Fallen trunk: upturned root-ball at one end holds it high, the crown end rests on the
    ground (variant 0) or on a broken stump (variant 1) -> a see-through opening under it."""
    v = variant_of(rng, "log_arch" if along == "gx" else "log_arch_gy", 2)
    gr = Greens()
    mats = log_mats(rng, moss=0.5)
    rootmat = M.bark_mat(moss=0.15, lichen=0.0, grey=0.1,
                         pal=((0.03, 0.02, 0.014), (0.10, 0.065, 0.04), (0.20, 0.14, 0.09), (0.30, 0.25, 0.19)))
    soilmat = M.soil_mat(col=(0.11, 0.065, 0.035), fade=False)
    r0 = rng.uniform(0.48, 0.56)
    a = 2.3
    hc = rng.uniform(1.55, 1.75)  # trunk centre height at the root plate
    if v == 0:
        ctrl = [(-a - 0.3, 0.0, r0 * 0.75), (-a * 0.35, rng.uniform(-0.2, 0.2), hc * 0.55), (a * 0.35, rng.uniform(-0.2, 0.2), hc * 0.9), (a, 0.0, hc)]
    else:
        hs = rng.uniform(1.25, 1.4)
        ctrl = [(-a - 0.4, 0.0, hs - 0.05), (-a * 0.3, rng.uniform(-0.15, 0.15), hs + (hc - hs) * 0.35), (a * 0.4, rng.uniform(-0.15, 0.15), hc * 0.97), (a, 0.0, hc)]
    pts = U.resample(U.catmull(ctrl, 60), 0.06)
    pts = gxy(pts)
    s = U.arclen(pts)
    L = s[-1]
    radii = np.array([r0 * (0.82 + 0.18 * (si / L)) * (1 + 0.05 * math.sin(si * 2.3)) for si in s])
    radii[-6:] *= np.linspace(1.0, 1.35, 6)
    o, t = trunk(rng, pts, radii, ends=("broken" if v == 0 else "hollow", "none"), m=32, bark_amp=0.05, rref=r0,
                 mats=mats, jag=0.25, depth=0.9)
    objs = [o]
    mbr, mbs = U.MB(), U.MB()
    axis = t["T"][-1]
    root_plate(rng, mbr, mbs, pts[-1], axis, R=hc * 0.95, r_trunk=radii[-1])
    mbb = U.MB()
    branch_stubs(rng, mbb, pts, radii, t, rng.randint(1, 3))
    if v == 1:
        # the broken stump propping the crown end
        sp = np.array([pts[0][0], pts[0][1], 0.0])
        sp = sp + U.unit(np.array([t["T"][0][0], t["T"][0][1], 0])) * 0.45
        spts = U.resample([sp + (0, 0, -0.1), sp + (0, 0, hs * 0.5), sp + (0, 0, hs - r0 * 0.9)], 0.06)
        sr = np.full(len(spts), r0 * 1.05)
        so, st = trunk(rng, spts, sr, ends=("none", "broken"), m=28, rref=r0, mats=mats, jag=0.3,
                       flare=flare_fn(rng, hs, True, False, lf=0.6, amp=0.6))
        objs.append(so)
        for k in range(rng.randint(3, 5)):
            aa = TAU * k / 5 + rng.uniform(-0.3, 0.3)
            d = np.array([math.cos(aa), math.sin(aa), 0.0])
            root(rng, mbr, sp + d * r0 * 0.8 + np.array([0, 0, 0.25]), d + np.array([0, 0, -0.3]), rng.uniform(0.5, 0.9),
                 0.11, gravity=0.4, ground_end=True)
    ro = mbr.obj("roots", [rootmat])
    so_ = mbs.obj("clod", [soilmat])
    bo = mbb.obj("branches", [mats[0], mats[1], mats[2], mats[3]])
    objs += [x for x in (ro, so_, bo) if x]
    objs += log_dressing(rng, o, gr, L, moss=0.8, ivy_k=rng.randint(3, 5), fungi=rng.randint(1, 3), ferns=rng.randint(1, 3),
                         hang=rng.randint(3, 5))
    objs += ivy_over(rng, [ro], 0, gr, steps=14, leaf=0.06, hang=True, vine=True,
                     start_pts=[p for p, n in U.pick_surface(ro, rng, 4, nz_min=0.3, z_min=1.0)])
    objs += crevice_ferns(rng, ro, 2, gr, L=0.4, z_max=0.6, nz=(-1, 1), cav_max=1.1)
    if along == "gy":
        U.rot_z(objs, math.pi / 2)
    return finish(objs)


def build_log_arch_gy(rng):
    return build_log_arch(rng, "gy")


def fallen_log(rng, length, r0, along="gx", name="log_fallen_gx", nvar=3):
    v = variant_of(rng, name, nvar)
    gr = Greens()
    mats = log_mats(rng)
    rootmat = M.bark_mat(moss=0.2, lichen=0.0, grey=0.1,
                         pal=((0.03, 0.02, 0.014), (0.10, 0.065, 0.04), (0.20, 0.14, 0.09), (0.30, 0.25, 0.19)))
    a = length / 2
    ctrl = [(-a + 0.0, rng.uniform(-0.15, 0.15), 0), (-a / 3, rng.uniform(-0.25, 0.25), 0), (a / 3, rng.uniform(-0.25, 0.25), 0),
            (a, rng.uniform(-0.15, 0.15), 0)]
    pts = U.resample(U.catmull(ctrl, 60), 0.07)
    s = U.arclen(pts)
    L = s[-1]
    radii = np.array([r0 * (1.1 - 0.3 * (si / L)) * (1 + 0.04 * math.sin(si * 1.9 + v)) for si in s])
    pts[:, 2] = radii * 0.82 - 0.02 * np.sin(np.pi * s / L)
    # end treatments per variant: root end at -x (flare / hollow), crown end at +x
    ends = [("none", "broken"), ("hollow", "broken"), ("cut", "hollow")][v]
    flare = flare_fn(rng, L, True, False, lf=0.7, amp=0.45) if ends[0] == "none" else None
    pts = gxy(pts)
    o, t = trunk(rng, pts, radii, ends=ends, m=30, bark_amp=0.045, rref=r0, mats=mats, flare=flare, depth=1.0, jag=0.24)
    objs = [o]
    mbr = U.MB()
    if ends[0] == "none":
        # stubby root flare on the ground at the root end
        c = pts[0]
        for k in range(rng.randint(4, 6)):
            aa = TAU * k / 5 + rng.uniform(-0.3, 0.3)
            d = np.array([0.0, -1.0, 0.0]) * 0.8 + np.array([math.cos(aa), 0.0, math.sin(aa)])
            root(rng, mbr, c + U.unit(d) * r0 * 0.6, U.unit(d) + np.array([0, -0.3, -0.2]), rng.uniform(0.4, 0.8),
                 rng.uniform(0.07, 0.12), mat=0, gravity=0.3, ground_end=True)
    branch_stubs(rng, mbr, pts, radii, t, rng.randint(1, 3))
    ro = mbr.obj("roots", [rootmat if ends[0] == "none" else mats[0]])
    if ro:
        objs.append(ro)
    objs += log_dressing(rng, o, gr, L, moss=0.7, ivy_k=rng.randint(1, 4), fungi=rng.randint(0, 3), ferns=rng.randint(1, 3))
    if along == "gy":
        U.rot_z(objs, math.pi / 2)
    return finish(objs)


def build_log_fallen_gx(rng):
    return fallen_log(rng, 6.0, rng.uniform(0.46, 0.56), "gx", "log_fallen_gx")


def build_log_fallen_gy(rng):
    return fallen_log(rng, 6.0, rng.uniform(0.46, 0.56), "gy", "log_fallen_gy")


def build_log_hollow_end(rng):
    """Short hollow log; the dark open end faces +gx (toward the lower-right of the screen)."""
    gr = Greens()
    r0 = rng.uniform(0.52, 0.62)
    L0 = rng.uniform(2.0, 2.6)
    pts = U.resample([(-L0 / 2, 0, 0), (0, rng.uniform(-0.1, 0.1), 0), (L0 / 2, 0, 0)], 0.07)
    s = U.arclen(pts)
    radii = np.array([r0 * (1 + 0.04 * math.sin(si * 2.5)) for si in s])
    pts[:, 2] = radii * 0.8
    pts = gxy(pts)
    o, t = trunk(rng, pts, radii, ends=(rng.choice(["broken", "cut"]), "hollow"), m=32, rref=r0, depth=L0 * 0.8, jag=0.2,
                 hollow_frac=0.72)
    objs = [o]
    mb = U.MB()
    branch_stubs(rng, mb, pts, radii, t, rng.randint(0, 2))
    if not mb.empty():
        objs.append(mb.obj("br", [o.data.materials[0]]))
    objs += log_dressing(rng, o, gr, L0, moss=0.8, ivy_k=rng.randint(1, 3), fungi=rng.randint(1, 2), ferns=rng.randint(1, 2))
    return finish(objs)


def build_stump(rng):
    v = variant_of(rng, "stump", 3)
    gr = Greens()
    mats = log_mats(rng)
    r0 = rng.uniform(0.36, 0.44)
    h = rng.uniform(0.6, 0.85)
    top = ["broken", "hollow", "cut"][v]
    pts = U.resample([(0, 0, -0.15), (rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), h * 0.5),
                      (rng.uniform(-0.06, 0.06), rng.uniform(-0.06, 0.06), h - (0.15 if top == "broken" else 0.0))], 0.05)
    radii = np.full(len(pts), r0)
    o, t = trunk(rng, pts, radii, ends=("none", top), m=32, rref=r0, mats=mats, jag=0.3, depth=h * 0.8,
                 flare=flare_fn(rng, h, True, False, lf=0.45, amp=0.7))
    objs = [o]
    mb = U.MB()
    for k in range(rng.randint(4, 6)):
        aa = TAU * k / 5 + rng.uniform(-0.3, 0.3)
        d = np.array([math.cos(aa), math.sin(aa), 0.0])
        root(rng, mb, d * r0 * 0.75 + np.array([0, 0, rng.uniform(0.12, 0.25)]), d + np.array([0, 0, -0.25]),
             rng.uniform(0.35, 0.7), rng.uniform(0.08, 0.13), gravity=0.4, ground_end=True)
    objs.append(mb.obj("roots", [mats[0]]))
    objs += moss_tufts(rng, o, rng.randint(1, 4), 0.08, gr, nz_min=0.75, z_min=0.3)
    objs += ivy_over(rng, [o], rng.randint(0, 2), gr, steps=16, leaf=0.065, z_min=0.3)
    objs += fungus_shelves(rng, o, rng.randint(1, 2), z_min=0.15)
    objs += crevice_ferns(rng, o, rng.randint(0, 2), gr, L=0.3, z_max=0.3, nz=(-0.6, 0.6), cav_max=1.0)
    objs += base_grass(rng, o, rng.randint(3, 6), gr, h=0.2)
    return finish(objs)


def build_root_arch(rng):
    """Gnarled roots twisting out of the ground, arching over (~1.2u) and diving back in."""
    gr = Greens()
    mat = M.bark_mat(moss=0.45, lichen=0.1, grey=0.25,
                     pal=((0.03, 0.02, 0.014), (0.12, 0.08, 0.05), (0.24, 0.17, 0.11), (0.38, 0.32, 0.25)))
    mb = U.MB()
    span = rng.uniform(1.8, 2.3)
    hgt = rng.uniform(1.0, 1.3)
    ph0 = rng.uniform(0, TAU)
    k = rng.randint(3, 5)
    for i in range(k):
        ph = ph0 + TAU * i / k
        ctrl = []
        for q in range(9):
            u = q / 8
            x = -span / 2 + span * u
            z = (hgt + rng.uniform(-0.1, 0.1)) * math.sin(math.pi * u) ** 0.8 - 0.1
            tw = 0.12 + 0.05 * i
            ctrl.append((x + rng.uniform(-0.04, 0.04), math.cos(ph + u * 5.0) * tw, z + math.sin(ph + u * 5.0) * tw))
        pts = U.resample(U.catmull(ctrl, 60), 0.04)
        n = len(pts)
        r = rng.uniform(0.08, 0.13)
        radii = np.array([r * (1.0 + 0.6 * abs(2 * (j / (n - 1)) - 1) ** 3) * (1 + 0.15 * math.sin(j * 0.4 + i)) for j in range(n)])
        U.tube_mb(mb, gxy(pts), radii, 10, disp=U.bark_disp(rng, r, amp=r * 0.3, around=9.0), rref=r, cap_end=False)
    # side rootlets
    for _ in range(rng.randint(3, 6)):
        u = rng.uniform(0.15, 0.85)
        p = np.array([-span / 2 + span * u, 0, hgt * math.sin(math.pi * u) ** 0.8 - 0.05])
        d = np.array([rng.uniform(-0.5, 0.5), rng.choice((-1, 1)), rng.uniform(-0.6, 0.2)])
        root(rng, mb, gxy(p), gxy(d), rng.uniform(0.4, 0.8), 0.04, mat=0, gravity=0.6, ground_end=True, m=6)
    o = mb.obj("roots", [mat])
    objs = [o]
    for x in (-span / 2, span / 2):
        objs.append(soil_mound(rng, 0.45, 0.12, *gxy(np.array([x, 0, 0]))[:2], col=(0.30, 0.18, 0.09)))
    objs += moss_tufts(rng, o, 4, 0.06, gr, nz_min=0.7, z_min=0.6)
    objs += ivy_over(rng, [o], 2, gr, steps=14, leaf=0.06, z_min=0.6)
    objs += crevice_ferns(rng, o, 2, gr, L=0.3, z_max=0.3, nz=(-1, 1), cav_max=1.1)
    return finish(objs)


def build_log_pile(rng):
    gr = Greens()
    mats = log_mats(rng, moss=rng.uniform(0.4, 0.7))
    objs = []
    rows = [rng.randint(2, 3), rng.randint(1, 2)]
    if rng.random() < 0.4:
        rows.append(1)
    r = rng.uniform(0.2, 0.26)
    z = r * 0.9
    for ri, cnt in enumerate(rows):
        for c in range(cnt):
            y = (c - (cnt - 1) / 2) * r * 2.02 + rng.uniform(-0.03, 0.03)
            Lh = rng.uniform(0.8, 1.15)
            x0 = rng.uniform(-0.15, 0.15)
            pts = U.resample([(x0 - Lh, y, z), (x0 + Lh, y + rng.uniform(-0.08, 0.08), z + rng.uniform(-0.03, 0.03))], 0.07)
            rr = r * rng.uniform(0.85, 1.12)
            radii = np.full(len(pts), rr)
            o, _ = trunk(rng, gxy(pts), radii, ends=(rng.choice(["cut", "cut", "broken"]), rng.choice(["cut", "cut", "hollow"])),
                         m=22, rref=rr, mats=mats, bark_amp=0.025, jag=0.1, depth=0.5)
            objs.append(o)
        z += r * 1.75
    for o in list(objs):
        objs += moss_tufts(rng, o, rng.randint(0, 2), 0.06, gr, nz_min=0.85, z_min=0.2)
    objs += fungus_shelves(rng, objs[0], rng.randint(0, 2))
    objs += ivy_over(rng, objs[-1:], rng.randint(0, 2), gr, steps=12, leaf=0.06, z_min=0.3)
    objs += base_grass(rng, objs[0], 4, gr, h=0.2)
    return finish(objs)


# =========================================================================== nest, eggs, bones
def egg_geo(rng, center, length=0.38, radius=0.145, axis=(0, 0, 1)):
    V, F = U.ico(3)
    V = V.copy()
    z = V[:, 2]
    k = 1.0 - 0.13 * z  # narrower at the top
    V[:, 0] *= radius * k
    V[:, 1] *= radius * k
    V[:, 2] = z * length / 2
    R = np.array(Vector(axis).normalized().to_track_quat("Z", "Y").to_matrix())
    V = V @ R.T + np.asarray(center, float)
    return V, F


def build_nest(rng):
    v = variant_of(rng, "nest_big", 3)
    twig = M.twig_mat()
    straw = M.straw_mat()
    mb = U.MB()
    Rc, a_h, b_v, zc = 0.74, 0.34, 0.26, 0.2
    nt = 420
    for i in range(nt):
        phi = rng.uniform(0, TAU)
        psi = rng.uniform(-0.6, math.pi + 0.3)  # mostly upper half of the rim
        L = rng.uniform(0.35, 0.8)
        dpsi = rng.uniform(-1.4, 1.4)
        lay = rng.uniform(0.95, 1.12)
        K = 7
        pts = []
        for k in range(K):
            u = k / (K - 1)
            ph = phi + u * L / Rc * rng.choice((1, 1, -1)) if k == 0 else ph_prev + (L / Rc) / (K - 1) * sgn
            if k == 0:
                sgn = 1 if rng.random() < 0.5 else -1
            ps = psi + dpsi * u
            R = Rc + a_h * lay * math.cos(ps)
            pts.append((R * math.cos(ph), R * math.sin(ph), zc + b_v * lay * math.sin(ps) + rng.uniform(-0.012, 0.012)))
            ph_prev = ph
        pts = np.array(pts)
        r = rng.uniform(0.011, 0.022)
        U.tube_mb(mb, pts, np.linspace(r, r * 0.6, K), 4, disp=None, tint=rng.random(), cap_end=False, rref=r)
    # straggling sticks poking out of the rim (silhouette)
    for i in range(34):
        phi = rng.uniform(0, TAU)
        c = np.array([Rc * math.cos(phi), Rc * math.sin(phi), zc + b_v * rng.uniform(0.2, 0.9)])
        tng = np.array([-math.sin(phi), math.cos(phi), 0.0])
        out = np.array([math.cos(phi), math.sin(phi), 0.0])
        d = U.unit(tng * rng.uniform(-1, 1) + out * rng.uniform(0.2, 0.8) + np.array([0, 0, rng.uniform(-0.2, 0.35)]))
        L = rng.uniform(0.35, 0.75)
        pts = np.array([c - d * L * 0.4, c + d * L * 0.2 + np.array([0, 0, 0.02]), c + d * L * 0.6])
        r = rng.uniform(0.01, 0.017)
        U.tube_mb(mb, U.resample(pts, 0.08), np.linspace(r, r * 0.5, len(U.resample(pts, 0.08))), 4, tint=rng.random(), cap_end=False)
    objs = [mb.obj("twigs", [twig])]
    # grassy lining bowl
    V, F, cav = U.blob(rng, (0, 0, 0.12), (Rc + 0.05, Rc + 0.05, 0.12), sub=3, rough=0.15, freq=3.0)
    objs.append(U.mesh_obj("lining", V, F, [straw], cav=cav))
    # eggs
    n_eggs = [4, 3, 2][v]
    egg_mats = [M.egg_mat(0)]
    me = U.MB()
    spots = [(-0.15, -0.12), (0.17, -0.08), (0.0, 0.18), (0.05, -0.02)]
    for k in range(n_eggs):
        x, y = spots[k]
        x += rng.uniform(-0.04, 0.04)
        y += rng.uniform(-0.04, 0.04)
        ax = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0.3, 1.6))).normalized()
        zc_e = 0.3 if k < 3 else 0.42
        V, F = egg_geo(rng, (x, y, zc_e), axis=ax, length=rng.uniform(0.36, 0.42), radius=rng.uniform(0.135, 0.155))
        me.add(V, F, tint=rng.random())
    objs.append(me.obj("eggs", egg_mats))
    gr = Greens()
    mbg = U.MB()
    for _ in range(rng.randint(3, 6)):
        a = rng.uniform(0, TAU)
        U.grass_tuft(mbg, rng, (math.cos(a) * 1.08, math.sin(a) * 1.08, 0), n=rng.randint(5, 9), h=0.25)
    objs.append(mbg.obj("grass", [gr.grass], smooth=False))
    return finish(objs)


def build_egg_single(rng):
    v = variant_of(rng, "egg_single", 3)
    mat = M.egg_mat(v)
    V, F = egg_geo(rng, (0, 0, 0.19), length=0.4, radius=0.155,
                   axis=(rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), 1.0))
    objs = [U.mesh_obj("egg", V, F, [mat], tint=np.full(len(V), rng.random()))]
    objs.append(soil_mound(rng, 0.32, 0.06, col=(0.34, 0.21, 0.10)))
    # a few twigs / grass blades at its foot
    mb = U.MB()
    for _ in range(rng.randint(4, 7)):
        a = rng.uniform(0, TAU)
        c = np.array([math.cos(a), math.sin(a), 0]) * rng.uniform(0.15, 0.26)
        d = U.unit(np.array([-math.sin(a), math.cos(a), 0]) + np.array([rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), 0]))
        L = rng.uniform(0.15, 0.3)
        pts = np.array([c - d * L / 2 + (0, 0, 0.012), c + (0, 0, 0.03), c + d * L / 2 + (0, 0, 0.012)])
        U.tube_mb(mb, pts, np.array([0.012, 0.011, 0.008]), 4, tint=rng.random(), cap_end=False)
    objs.append(mb.obj("twigs", [M.twig_mat()]))
    gr = Greens()
    mbg = U.MB()
    U.grass_tuft(mbg, rng, (rng.uniform(-0.2, 0.2), -0.22, 0), n=6, h=0.18)
    objs.append(mbg.obj("grass", [gr.grass], smooth=False))
    return finish(objs)


def bone_tube(rng, mb, pts, r0, r1, m=8, knob=True):
    n = len(pts)
    radii = np.linspace(r0, r1, n)
    if knob:
        radii[:2] *= 1.35
    U.tube_mb(mb, pts, radii, m, disp=lambda s, th, i, r: (r * 0.08 * noise.noise(Vector((math.cos(th), math.sin(th), s * 4))), 0.6),
              cap_end=True, cap_start=True)


def build_fossil_ribs(rng):
    """Half-buried ribcage: a vertebral column with arching ribs diving into the soil."""
    v = variant_of(rng, "fossil_ribs", 2)
    bone = M.bone_mat()
    gr = Greens()
    mb = U.MB()
    L = rng.uniform(1.3, 1.7)
    spine = U.resample(U.catmull([(-L / 2, 0, 0.02), (-L / 6, rng.uniform(-0.1, 0.1), 0.06), (L / 6, rng.uniform(-0.1, 0.1), 0.07),
                                  (L / 2, 0, 0.0)], 30), 0.02)
    sl = U.arclen(spine)
    # vertebrae: knobbly blobs along the spine
    nv = int(sl[-1] / 0.11)
    for k in range(nv):
        i = int(k / max(1, nv - 1) * (len(spine) - 1))
        c = spine[i]
        V, F, cav = U.blob(rng, c + np.array([0, 0, 0.02]), (0.055, 0.075, 0.05), sub=2, rough=0.25)
        mb.add(V, F, cav=cav)
        V, F, cav = U.blob(rng, c + np.array([0, 0, 0.08]), (0.02, 0.025, 0.06), sub=1, rough=0.2)
        mb.add(V, F, cav=cav)
    nr = rng.randint(6, 8)
    for k in range(nr):
        u = 0.12 + 0.76 * k / (nr - 1)
        i = int(u * (len(spine) - 1))
        c = spine[i]
        hgt = 0.62 * math.sin(math.pi * (0.25 + 0.7 * u)) * rng.uniform(0.85, 1.05)
        wid = 0.55 * math.sin(math.pi * (0.2 + 0.7 * u)) + 0.1
        for sgn in (-1, 1):
            if rng.random() < 0.15:
                continue  # missing rib
            broken = rng.random() < 0.25
            ctrl = [c + np.array([0, sgn * 0.05, 0.05]),
                    c + np.array([0.04, sgn * wid * 0.45, hgt * 0.95]),
                    c + np.array([0.08, sgn * wid * 0.9, hgt * 0.7]),
                    c + np.array([0.1, sgn * wid * 1.08, -0.06])]
            pts = U.resample(U.catmull(ctrl, 30), 0.03)
            if broken:
                pts = pts[: int(len(pts) * rng.uniform(0.45, 0.7))]
            bone_tube(rng, mb, pts, 0.034, 0.022)
    o = mb.obj("ribs", [bone])
    if v == 1:
        U.rot_z([o], 0.35)
    objs = [o, soil_mound(rng, L * 0.62, 0.08, col=(0.34, 0.21, 0.10))]
    objs += moss_tufts(rng, o, 3, 0.05, gr, nz_min=0.6, z_min=0.2)
    mbg = U.MB()
    for _ in range(rng.randint(3, 6)):
        a = rng.uniform(0, TAU)
        U.grass_tuft(mbg, rng, (math.cos(a) * 0.6, math.sin(a) * 0.5, 0), n=rng.randint(4, 8), h=0.2)
    objs.append(mbg.obj("grass", [gr.grass], smooth=False))
    if rng.random() < 0.6:
        objs += crevice_ferns(rng, o, 1, gr, L=0.3, z_max=0.2, nz=(-1, 1), cav_max=1.1)
    U.rot_z(objs, rng.uniform(-0.3, 0.3) + (0 if v == 0 else math.pi / 2))
    return finish(objs)


def build_skull(rng):
    """Small dino skull half-sunk in soil: long snout, deep orbits, fenestrae, a row of teeth."""
    v = variant_of(rng, "bone_skull", 2)
    bone = M.bone_mat()
    gr = Greens()
    V, F = U.ico(4)
    V = V.copy()
    # local frame: +y = snout, z = up. Base ellipsoid then sculpt.
    Ls = 0.42 if v == 0 else 0.5
    out = np.empty_like(V)
    cav = np.full(len(V), 0.6, np.float32)
    off = U.rvec(rng)
    sockets = [((0.12, 0.02, 0.10), 0.075, 0.05), ((-0.12, 0.02, 0.10), 0.075, 0.05),  # orbits
               ((0.10, 0.20, 0.06), 0.06, 0.035), ((-0.10, 0.20, 0.06), 0.06, 0.035),   # antorbital fenestrae
               ((0.03, Ls - 0.02, 0.07), 0.025, 0.02), ((-0.03, Ls - 0.02, 0.07), 0.025, 0.02),  # nostrils
               ((0.10, -0.12, 0.13), 0.05, 0.03), ((-0.10, -0.12, 0.13), 0.05, 0.03)]  # upper temporal
    for i, p in enumerate(V):
        x, y, z = p
        yy = y * (Ls if y > 0 else 0.2)
        taper = 1.0 - 0.55 * max(0.0, yy / Ls) ** 1.2
        xx = x * 0.17 * taper
        zz = z * 0.14 * (1.0 - 0.45 * max(0.0, yy / Ls))
        if zz < 0:
            zz *= 0.6  # flat palate
        q = np.array([xx, yy, zz + 0.1])
        q += 0.008 * np.array(noise.noise_vector(Vector(q * 12) + off, noise_basis=U.NB))
        for c, rad, depth in sockets:
            d = np.linalg.norm(q - np.array(c))
            if d < rad:
                f = (1 - d / rad) ** 1.5
                n = q - np.array([0, yy, 0.1])
                q = q - U.unit(n) * depth * f
                cav[i] = min(cav[i], 0.6 - f * 1.2)
        out[i] = q
    mb = U.MB()
    mb.add(out, F, cav=np.clip(cav, 0, 1))
    # teeth along the upper jaw
    for sgn in (-1, 1):
        for k in range(7):
            y = 0.03 + k * (Ls - 0.08) / 7
            taper = 1.0 - 0.55 * max(0.0, y / Ls) ** 1.2
            base = np.array([sgn * 0.15 * taper, y, 0.07])
            tip = base + np.array([sgn * 0.005, 0.01, -0.06 * rng.uniform(0.6, 1.1)])
            mb.add([base + (0.012, 0, 0), base + (-0.012, 0, 0), base + (0, 0.014, 0), tip], [(0, 1, 3), (1, 2, 3), (2, 0, 3)], cav=0.8)
    # lower jaw: two rami meeting at the chin
    for sgn in (-1, 1):
        pts = U.resample([(sgn * 0.14, -0.1, 0.03), (sgn * 0.12, Ls * 0.5, 0.0), (sgn * 0.03, Ls - 0.04, 0.0)], 0.03)
        bone_tube(rng, mb, pts, 0.03, 0.018, knob=False)
    if v == 1:
        for sgn in (-1, 1):
            b = np.array([sgn * 0.11, -0.02, 0.21])
            mb.add([b + (0.03, 0, 0), b + (-0.03, 0, 0), b + (0, 0.035, 0), b + (0, -0.03, 0), b + (sgn * 0.02, -0.05, 0.13)],
                   [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4)], cav=0.7)
    o = mb.obj("skull", [bone])
    # tilt and sink into the soil
    U.transform([o], Matrix.Rotation(rng.uniform(0.15, 0.4) * rng.choice((-1, 1)), 4, "Y"))
    U.transform([o], Matrix.Rotation(rng.uniform(-0.25, -0.05), 4, "X"))
    U.transform([o], Matrix.Translation((0, -Ls * 0.4, -0.05)))
    U.rot_z([o], rng.uniform(0, TAU))
    objs = [o, soil_mound(rng, 0.5, 0.07, col=(0.34, 0.21, 0.10))]
    objs += moss_tufts(rng, o, 2, 0.04, gr, nz_min=0.7, z_min=0.15)
    mbg = U.MB()
    for _ in range(rng.randint(2, 4)):
        a = rng.uniform(0, TAU)
        U.grass_tuft(mbg, rng, (math.cos(a) * 0.4, math.sin(a) * 0.4, 0), n=rng.randint(4, 7), h=0.18)
    objs.append(mbg.obj("grass", [gr.grass], smooth=False))
    return finish(objs)


# =========================================================================== riverbend structures
def column(mb, rng, cx, cy, r, h, sides=6, joint_step=None, tilt=(0.0, 0.0), broken_top=False):
    """Irregular basalt prism with rounded corners, cross-joints and a chamfered (or broken) top."""
    a0 = rng.uniform(0, TAU)
    corners = []
    for k in range(sides):
        a = a0 + TAU * k / sides + rng.uniform(-0.12, 0.12)
        rr = r * rng.uniform(0.86, 1.08)
        corners.append(np.array([math.cos(a) * rr, math.sin(a) * rr]))
    ring = []
    rc = []  # corner flag -> highlight
    for k in range(sides):
        p, q0, q1 = corners[k], corners[k - 1], corners[(k + 1) % sides]
        ring.append(p + (q0 - p) * 0.12)
        rc.append(0.7)
        ring.append(p * 0.97 + (q0 + q1) * 0.0)
        rc.append(0.85)
        ring.append(p + (q1 - p) * 0.12)
        rc.append(0.7)
        ring.append(p + (q1 - p) * 0.5)
        rc.append(0.55)
    ring = np.array(ring)
    m = len(ring)
    js = joint_step or rng.uniform(0.5, 0.9)
    joints = []
    z = rng.uniform(0.2, js)
    while z < h - 0.25:
        joints.append(z)
        z += js * rng.uniform(0.7, 1.3)
    zs = sorted(set([round(x, 3) for x in list(np.arange(-0.1, h - 0.06, 0.16)) + [j - 0.03 for j in joints] + [j for j in joints]
                     + [j + 0.03 for j in joints] + [h - 0.06]]))
    off = U.rvec(rng)
    V, cav, F = [], [], []
    for zi, z in enumerate(zs):
        jd = min([abs(z - j) for j in joints] + [1.0])
        groove = 0.88 if jd < 0.005 else 1.0
        tl = tilt[0] * z, tilt[1] * z
        for k in range(m):
            p = ring[k]
            nn = noise.noise(Vector((p[0] * 4, p[1] * 4, z * 3)) + off, noise_basis=U.NB)
            s = groove * (1 + 0.035 * nn)
            V.append((cx + p[0] * s + tl[0], cy + p[1] * s + tl[1], z))
            cav.append(0.1 if groove < 1 else rc[k] + 0.1 * nn)
    for zi in range(len(zs) - 1):
        for k in range(m):
            a, b = zi * m + k, zi * m + (k + 1) % m
            F.append((a, b, b + m, a + m))
    # top: chamfer ring + slightly domed / tilted cap (or a broken jagged one)
    base = len(V)
    tz = h
    tl = tilt[0] * h, tilt[1] * h
    slope = (rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12))
    for k in range(m):
        p = ring[k] * 0.9
        V.append((cx + p[0] + tl[0], cy + p[1] + tl[1], tz + slope[0] * p[0] + slope[1] * p[1]))
        cav.append(0.9)
    for k in range(m):
        p = ring[k] * 0.55
        dz = rng.uniform(-0.08, 0.06) if broken_top else 0.015
        V.append((cx + p[0] + tl[0], cy + p[1] + tl[1], tz + dz + slope[0] * p[0] + slope[1] * p[1]))
        cav.append(0.6)
    V.append((cx + tl[0], cy + tl[1], tz + (rng.uniform(-0.1, 0.05) if broken_top else 0.025)))
    cav.append(0.6)
    top0 = (len(zs) - 1) * m
    for k in range(m):
        k1 = (k + 1) % m
        F.append((top0 + k, top0 + k1, base + k1, base + k))
        F.append((base + k, base + k1, base + m + k1, base + m + k))
        F.append((base + m + k, base + m + k1, len(V) - 1))
    mb.add(V, F, cav=np.array(cav, np.float32), tint=rng.random())


def build_cliff(rng, along="gx", name="cliff_columns"):
    """Columnar basalt wall segment: 3u along gx, face toward +gy, ~4u tall. Tiles along gx."""
    v = variant_of(rng, name, 4)
    gr = Greens()
    mat = M.rock_mat("basalt", moss=rng.uniform(0.5, 0.7), lichen=0.25, wet=0.35, wet_z=0.25, feat=1.3, streaks=0.8,
                     crack_dark=0.5)
    mb = U.MB()
    sp = 0.5
    tops = []
    H = rng.uniform(3.8, 4.1)
    # back row (tall), mid row, front row (stepped / broken, lower)
    for row, (gy, hmin, hmax, rr) in enumerate([(-0.42, 0.88, 1.0, 0.29), (0.0, 0.7, 0.97, 0.28), (0.42, 0.18, 0.75, 0.27)]):
        shift = (row % 2) * sp / 2
        for k in range(6):
            gx = -1.5 + sp / 2 + k * sp + shift - (sp / 2 if row == 1 else 0)
            if gx > 1.55:
                continue
            frac = rng.uniform(hmin, hmax)
            if row == 2 and rng.random() < 0.35:
                continue  # gap in the front row
            h = H * frac
            tilt = (rng.uniform(-0.015, 0.015), rng.uniform(-0.02, 0.01))
            column(mb, rng, gy, gx, rr * rng.uniform(0.92, 1.08), h, sides=rng.choice((5, 6, 6, 6, 7)), tilt=tilt,
                   broken_top=(row == 2 and rng.random() < 0.5))
            tops.append((gy + tilt[0] * h, gx + tilt[1] * h, h, row))
    # fallen column chunks at the foot for some variants
    for _ in range(rng.randint(0, 2)):
        column(mb, rng, rng.uniform(0.75, 0.95), rng.uniform(-1.2, 1.2), rng.uniform(0.18, 0.25), rng.uniform(0.25, 0.6),
               broken_top=True)
    o = mb.obj("columns", [mat])
    objs = [o]
    # moss cushions on the column tops, ferns on the low steps
    mbm = U.MB()
    for (x, y, h, row) in tops:
        if rng.random() < 0.75:
            for _ in range(rng.randint(1, 3)):
                c = (x + rng.uniform(-0.12, 0.12), y + rng.uniform(-0.12, 0.12), h + 0.01)
                s = rng.uniform(0.08, 0.16)
                V, F, cav = U.blob(rng, c, (s, s * 1.2, s * 0.3), sub=2, rough=0.5, freq=4.0)
                mbm.add(V, F, cav=cav, tint=rng.random())
    objs.append(mbm.obj("topmoss", [gr.moss]))
    low = [t for t in tops if t[3] == 2 and t[2] < 2.4]
    mbf = U.MB()
    for (x, y, h, row) in rng.sample(low, min(len(low), rng.randint(1, 3))):
        U.fern_sprig(mbf, rng, (x, y, h), (0.3, 0, 1), n=rng.randint(5, 7), L=rng.uniform(0.35, 0.5))
    if not mbf.empty():
        objs.append(mbf.obj("ferns", [gr.fern], smooth=False))
    # hanging vines curtain off the lip of the tall columns
    starts = []
    for (x, y, h, row) in tops:
        if row < 2 and rng.random() < (0.55 if v % 2 == 0 else 0.35):
            starts.append((x + 0.3, y + rng.uniform(-0.15, 0.15), h - 0.02))
    objs += ivy_over(rng, [o], 0, gr, steps=int(H / 0.05 * rng.uniform(0.35, 0.6)), leaf=0.075, hang=True, vine=True,
                     start_pts=starts, density=(1.2, 2.0))
    objs += base_grass(rng, o, rng.randint(3, 6), gr, h=0.3)
    if along == "gy":
        U.rot_z(objs, math.pi / 2)
    return finish(objs)


def build_cliff_gx(rng):
    return build_cliff(rng, "gx", "cliff_columns")


def build_cliff_gy(rng):
    return build_cliff(rng, "gy", "cliff_columns_gy")


# waterfall tiers: (gx centre, top z) per step, water flows toward +gx
WF_TIERS = [(-0.9, 1.9), (-0.15, 1.25), (0.55, 0.65), (1.2, 0.2)]


def build_waterfall_rock(rng):
    """Rock lip + stepped tiers for a cascade (no water). Channel ~1u wide centred on gy=0, flow +gx."""
    gr = Greens()
    pal = rng.choice(["river", "fern"])
    mat = M.rock_mat(pal, moss=0.6, lichen=0.3, wet=0.6, wet_z=0.35, algae=True, feat=1.0, streaks=0.8)
    side_mat = M.rock_mat(pal, moss=0.75, lichen=0.4, wet=0.4, wet_z=0.2, feat=0.9, strata=0.6, strata_f=3.0)
    objs = []
    hscale = rng.uniform(0.95, 1.1)
    for i, (gx, z) in enumerate(WF_TIERS):
        z *= hscale
        o = U.rock_body(rng, f"tier{i}", [mat], (0.42, 0.62, max(0.2, z * 0.55)), "block", n=rng.randint(14, 20), voxel=0.04,
                        bevel=0.18, top_flat=0.35, sink=0.0, amp=0.03, fine=0.008, crack=0.02, crack_scale=1.2,
                        crack_w=0.04, crack_cov=0.2, n_split=1, split_w=0.03, feat=1.0)
        co = U.get_co(o)
        z0, z1 = co[:, 2].min(), co[:, 2].max()
        co[:, 2] = (co[:, 2] - z0) / (z1 - z0) * (z + 0.1) - 0.1
        # dish the tread so water would pool, lip at the downstream edge
        co[:, 2] -= 0.05 * np.exp(-((co[:, 0]) ** 2 + (co[:, 1]) ** 2) / 0.12) * (co[:, 2] > z - 0.1)
        U.set_co(o, co)
        objs.append(place(o, 0.0, gx + 0.15))
    # flanking boulders taller than the channel
    for sgn in (-1, 1):
        for i, (gx, z) in enumerate(WF_TIERS[:3]):
            hh = z * hscale + rng.uniform(0.3, 0.6)
            R = rng.uniform(0.42, 0.55)
            bo = boulder(rng, R, hh, pal=pal, style="block", extras=False, moss=0.75, wet=0.4, wet_z=0.2, strata=0.7)
            for b in bo:
                place(b, sgn * (0.75 + rng.uniform(0, 0.15)), gx + rng.uniform(-0.15, 0.15))
            objs += bo
    lip = WF_TIERS[0]
    back = boulder(rng, 0.8, lip[1] * hscale + 0.45, pal=pal, style="block", extras=False, moss=0.8, top_flat=0.3, strata=0.6)
    for b in back:
        place(b, rng.uniform(-0.1, 0.1), lip[0] - 0.75)
    objs += back
    rocks = list(objs)
    objs += crevice_ferns(rng, rocks[-1], 2, gr, L=0.4, z_min=0.6, nz=(-0.5, 1.0), cav_max=1.0)
    objs += ivy_over(rng, rocks[-3:], 0, gr, steps=20, leaf=0.07, hang=True, vine=True,
                     start_pts=[p + n * 0.02 for o in rocks[-3:] for p, n in U.pick_surface(o, rng, 1, nz_min=0.6, z_min=1.0)])
    for o in rng.sample(rocks[len(WF_TIERS):], 3):
        objs += moss_tufts(rng, o, 2, 0.08, gr, z_min=0.5)
    return finish(objs)


def build_bank_cluster(rng):
    """Water-worn rocks sitting partly in the river: dark wet band + algae line at ~0.15u."""
    gr = Greens()
    pal = rng.choice(["river", "fern", "cool"])
    wz = rng.uniform(0.14, 0.2)
    objs = []
    k = rng.randint(3, 5)
    ang = rng.uniform(0, TAU)
    for i in range(k):
        R = [0.55, 0.38, 0.3, 0.22, 0.18][i] * rng.uniform(0.85, 1.15)
        Hh = R * rng.uniform(0.9, 1.35)
        bo = boulder(rng, R, Hh, pal=pal, style="round", extras=False, moss=rng.uniform(0.25, 0.55), wet=0.85, wet_z=wz,
                     algae=True, smooth=True, n_split=rng.randint(0, 1), strata=0.0, lichen=0.25)
        a = ang + i * 2.2 + rng.uniform(-0.4, 0.4)
        d = 0 if i == 0 else 0.45 + R * 0.9 + rng.uniform(0, 0.15)
        for b in bo:
            place(b, math.cos(a) * d, math.sin(a) * d)
        objs += bo
    objs += pebble_ring(rng, rng.randint(2, 4), 0.85, pal, rmin=0.05, rmax=0.1)
    objs += moss_tufts(rng, objs[0], 3, 0.07, gr, z_min=0.35)
    mbg = U.MB()
    if rng.random() < 0.7:
        for _ in range(rng.randint(1, 3)):
            a = rng.uniform(0, TAU)
            U.grass_tuft(mbg, rng, (math.cos(a) * 0.7, math.sin(a) * 0.7, 0), n=rng.randint(6, 10), h=0.35)
        objs.append(mbg.obj("reeds", [gr.grass], smooth=False))
    return finish(objs)


# =========================================================================== registry
def _P(build, variants, r, h, kind, box, tags, margin=16, **kw):
    frame, anchor = U.frame_for(*box, margin=margin)
    return Prop(build=build, variants=variants, r=r, h=h, kind=kind, frame=frame, anchor=anchor, tags=tags, **kw)


FH = ("fern_hollow", "rocks")
RB = ("riverbend", "rocks")
BOTH = ("fern_hollow", "riverbend", "rocks")
LOG = ("fern_hollow", "riverbend", "logs")

PROPS = {
    "boulder_s": _P(build_boulder_s, 4, 0.35, 0.5, "solid", (-0.65, 0.65, -0.65, 0.65, 0.7), BOTH),
    "boulder_m": _P(build_boulder_m, 4, 0.7, 1.0, "solid", (-1.15, 1.15, -1.15, 1.15, 1.25), BOTH),
    "boulder_l": _P(build_boulder_l, 3, 1.3, 1.8, "solid", (-1.9, 1.9, -1.9, 1.9, 2.2), BOTH),
    "rock_pebbles": _P(build_pebbles, 5, 0.0, 0.15, "deco", (-0.65, 0.65, -0.65, 0.65, 0.3), BOTH, bake=True),
    "flat_stone": _P(build_flat_stone, 4, 0.6, 0.25, "deco", (-0.95, 0.95, -0.95, 0.95, 0.4), RB,
                     extra={"walkable": True, "top_z": 0.25}),
    "rock_outcrop": _P(build_outcrop, 3, 2.0, 2.2, "solid", (-2.5, 2.5, -2.2, 2.4, 2.8), BOTH,
                       extra={"top_z": 1.5, "top_r": 1.3}),
    "log_fallen_gx": _P(build_log_fallen_gx, 3, 0.55, 1.1, "solid", (-3.6, 3.6, -1.1, 1.1, 1.6), LOG,
                        extra={"capsule_len": 5.0, "axis": "gx"}),
    "log_fallen_gy": _P(build_log_fallen_gy, 3, 0.55, 1.1, "solid", (-1.1, 1.1, -3.6, 3.6, 1.6), LOG,
                        extra={"capsule_len": 5.0, "axis": "gy"}),
    "log_arch": _P(build_log_arch, 2, 0.8, 3.0, "solid", (-3.4, 4.0, -1.9, 1.9, 3.5), FH,
                   extra={"span_axis": "gx", "opening": [-1.2, 2.0], "feet": [[-2.5, 0.0], [2.4, 0.0]], "foot_r": 0.8,
                          "clear_h": 1.0}),
    "log_arch_gy": _P(build_log_arch_gy, 2, 0.8, 3.0, "solid", (-1.9, 1.9, -3.4, 4.0, 3.5), FH,
                      extra={"span_axis": "gy", "opening": [-1.2, 2.0], "feet": [[0.0, -2.5], [0.0, 2.4]], "foot_r": 0.8,
                             "clear_h": 1.0}),
    "log_hollow_end": _P(build_log_hollow_end, 2, 0.6, 1.2, "solid", (-1.8, 1.9, -1.1, 1.1, 1.6), LOG,
                         extra={"capsule_len": 1.6, "axis": "gx", "opening": "+gx"}),
    "stump": _P(build_stump, 3, 0.5, 0.9, "solid", (-1.2, 1.2, -1.2, 1.2, 1.25), LOG),
    "root_arch": _P(build_root_arch, 2, 0.35, 1.3, "solid", (-1.8, 1.8, -1.2, 1.2, 1.7), FH,
                    extra={"span_axis": "gx", "feet": [[-1.0, 0.0], [1.0, 0.0]], "foot_r": 0.35, "clear_h": 0.8}),
    "log_pile": _P(build_log_pile, 3, 0.8, 0.9, "solid", (-1.6, 1.6, -1.1, 1.1, 1.4), LOG),
    "nest_big": _P(build_nest, 3, 0.9, 0.55, "solid", (-1.4, 1.4, -1.4, 1.4, 0.9), BOTH + ("nest",)),
    "egg_single": _P(build_egg_single, 3, 0.15, 0.4, "deco", (-0.45, 0.45, -0.45, 0.45, 0.55), BOTH + ("egg",)),
    "fossil_ribs": _P(build_fossil_ribs, 2, 0.6, 0.65, "deco", (-1.2, 1.2, -1.2, 1.2, 0.9), BOTH),
    "bone_skull": _P(build_skull, 2, 0.25, 0.3, "deco", (-0.7, 0.7, -0.7, 0.7, 0.6), BOTH),
    "cliff_columns": _P(build_cliff_gx, 4, 0.6, 4.0, "solid", (-1.9, 1.9, -0.9, 1.3, 4.6), RB,
                        extra={"tile_axis": "gx", "tile_len": 3.0, "depth": 1.2, "face": "+gy"}),
    "cliff_columns_gy": _P(build_cliff_gy, 4, 0.6, 4.0, "solid", (-0.9, 1.3, -1.9, 1.9, 4.6), RB,
                           extra={"tile_axis": "gy", "tile_len": 3.0, "depth": 1.2, "face": "+gx"}),
    "waterfall_rock": _P(build_waterfall_rock, 2, 1.2, 2.4, "solid", (-2.3, 1.9, -1.6, 1.6, 2.8), RB,
                         extra={"flow": "+gx", "channel_w": 1.0, "tiers": [[gx + 0.15, z] for gx, z in WF_TIERS]}),
    "river_bank_rock_cluster": _P(build_bank_cluster, 4, 0.9, 0.8, "solid", (-1.5, 1.5, -1.5, 1.5, 1.0), RB,
                                  extra={"waterline_z": 0.17}),
}
