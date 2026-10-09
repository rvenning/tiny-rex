"""Geometry + material helpers for the feathered-theropod family (raptor, compy,
oviraptor, gallimimus, dilophosaurus).  Owned by the raptor artist.

Everything is built in CREATURE SPACE: Blender X = creature's right, +Y = forward
(the way it faces), +Z up, ground at z = 0.  Shapes are swept elliptical
(super-ellipse) cross-sections along Catmull-Rom spines; parts are unioned with a
voxel remesh and smoothed.  Feathers are real geometry: curved, tapered, folded
blades carrying per-vertex colour, so every group can have its own gradient.
"""
import math

import bmesh
import bpy
import numpy as np


# --------------------------------------------------------------------------- maths
def v3(*a):
    return np.array(a, dtype=float)


def unit(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-12)


def smoothstep(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def rot_axis(axis, ang):
    """3x3 rotation about unit axis."""
    x, y, z = unit(axis)
    c, s = math.cos(ang), math.sin(ang)
    C = 1 - c
    return np.array(
        [
            [c + x * x * C, x * y * C - z * s, x * z * C + y * s],
            [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
            [z * x * C - y * s, z * y * C + x * s, c + z * z * C],
        ]
    )


def cr_dense(ctrl, per=20):
    """Uniform Catmull-Rom through the rows of ctrl (k, d) -> dense (m, d)."""
    P = np.asarray(ctrl, float)
    if len(P) == 2:
        t = np.linspace(0, 1, per + 1)[:, None]
        return P[0] + (P[1] - P[0]) * t
    ext = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for t in np.linspace(0, 1, per, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(
                0.5
                * (
                    (2 * p1)
                    + (-p0 + p2) * t
                    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
                )
            )
    out.append(P[-1])
    return np.array(out)


def resample(dense, n):
    """Resample a dense (m, d) curve (xyz in the first 3 columns) uniformly in arc length."""
    xyz = dense[:, :3]
    seg = np.linalg.norm(np.diff(xyz, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    tgt = np.linspace(0, cum[-1], n)
    out = np.stack([np.interp(tgt, cum, dense[:, j]) for j in range(dense.shape[1])], 1)
    return out, cum[-1]


# --------------------------------------------------------------------------- sweeps
class Sweep:
    """A tube swept along a spine with super-elliptic sections.

    ctrl rows: x, y, z, rx_top, rx_bot, z_top, z_bot, n_exp
      rx_*  half width in the upper / lower half of the section
      z_*   half height above / below the spine line (along the section 'up')
      n_exp super-ellipse exponent (2 = ellipse, >2 boxier)
    side_ref: the lateral reference vector the section frame is built from.
    """

    def __init__(self, ctrl, side_ref=(1, 0, 0), spacing=0.008, nseg=32, per=24, cap=True):
        ctrl = np.asarray(ctrl, float)
        dense = cr_dense(ctrl, per)
        length = np.sum(np.linalg.norm(np.diff(dense[:, :3], axis=0), axis=1))
        n = max(6, int(length / spacing) + 1)
        self.d, self.length = resample(dense, n)
        self.d[:, 3:7] = np.maximum(self.d[:, 3:7], 0.002)
        self.p = self.d[:, :3]
        self.nseg = nseg
        self.cap = cap
        T = np.gradient(self.p, axis=0)
        self.f = unit(T)
        sref = np.asarray(side_ref, float)
        s = sref[None, :] - self.f * (self.f @ sref)[:, None]
        self.s = unit(s)
        self.u = unit(np.cross(self.s, self.f))
        self.arc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(self.p, axis=0), axis=1))])

    def section(self, i, th):
        """Local (x, z) offsets of angle(s) th at ring i (th=0 -> +side, pi/2 -> up)."""
        rxt, rxb, zt, zb, ne = self.d[i, 3:8]
        c, sn = np.cos(th), np.sin(th)
        e = 2.0 / ne
        rx = lerp(rxb, rxt, (1 + sn) / 2)
        xl = rx * np.sign(c) * np.abs(c) ** e
        zl = np.where(sn > 0, zt, zb) * np.sign(sn) * np.abs(sn) ** e
        return xl, zl

    def mean_radius(self):
        return 0.25 * (self.d[:, 3] + self.d[:, 4]) + 0.25 * (self.d[:, 5] + self.d[:, 6])

    def point(self, t, th):
        """Surface point + outward normal at fractional ring index t (0..n-1) and angle th."""
        n = len(self.p)
        t = float(np.clip(t, 0, n - 1))
        i = min(int(t), n - 2)
        a = t - i

        def at(tt, thh):
            ii = int(np.clip(round(tt), 0, n - 1)) if False else None  # noqa
            i0 = min(int(tt), n - 2)
            aa = tt - i0
            res = []
            for k in (i0, i0 + 1):
                xl, zl = self.section(k, thh)
                res.append(self.p[k] + self.s[k] * xl + self.u[k] * zl)
            return res[0] * (1 - aa) + res[1] * aa

        p = at(t, th)
        dt = 0.5
        pt = at(min(t + dt, n - 1.001), th) - at(max(t - dt, 0), th)
        pth = at(t, th + 0.02) - at(t, th - 0.02)
        nrm = unit(np.cross(pt, pth))
        # make outward: away from spine
        c = self.p[i] * (1 - a) + self.p[i + 1] * a
        if np.dot(nrm, p - c) < 0:
            nrm = -nrm
        fwd = unit(self.f[i] * (1 - a) + self.f[i + 1] * a)
        return p, nrm, fwd

    def mesh_data(self):
        n, m = len(self.p), self.nseg
        th = np.linspace(0, 2 * math.pi, m, endpoint=False)
        verts = []
        for i in range(n):
            xl, zl = self.section(i, th)
            verts.append(self.p[i][None, :] + np.outer(xl, self.s[i]) + np.outer(zl, self.u[i]))
        V = np.vstack(verts)
        F = []
        for i in range(n - 1):
            a, b = i * m, (i + 1) * m
            for j in range(m):
                j2 = (j + 1) % m
                F.append((a + j, a + j2, b + j2, b + j))
        if self.cap:
            c0 = len(V)
            V = np.vstack([V, self.p[0][None], self.p[-1][None]])
            for j in range(m):
                j2 = (j + 1) % m
                F.append((c0, j2, j))
                F.append((c0 + 1, (n - 1) * m + j, (n - 1) * m + j2))
        return V, F


def ellipsoid(center, radii, axes=None, nseg=24, nring=14):
    """Closed ellipsoid mesh data; axes = 3x3 columns (x,y,z) orientation."""
    cx = np.asarray(center, float)
    R = np.eye(3) if axes is None else np.asarray(axes, float)
    V = []
    for i in range(1, nring):
        ph = math.pi * i / nring - math.pi / 2
        for j in range(nseg):
            th = 2 * math.pi * j / nseg
            V.append([math.cos(ph) * math.cos(th), math.cos(ph) * math.sin(th), math.sin(ph)])
    V = np.array(V) * np.asarray(radii, float)
    V = np.vstack([V, [0, 0, -radii[2]], [0, 0, radii[2]]])
    V = V @ R.T + cx
    F = []
    nr = nring - 1
    for i in range(nr - 1):
        for j in range(nseg):
            j2 = (j + 1) % nseg
            F.append((i * nseg + j, i * nseg + j2, (i + 1) * nseg + j2, (i + 1) * nseg + j))
    b, t = nr * nseg, nr * nseg + 1
    for j in range(nseg):
        j2 = (j + 1) % nseg
        F.append((b, j2, j))
        F.append((t, (nr - 1) * nseg + j, (nr - 1) * nseg + j2))
    return V, F


def concat(parts):
    Vs, Fs, off = [], [], 0
    for V, F in parts:
        Vs.append(np.asarray(V, float))
        Fs.extend(tuple(i + off for i in f) for f in F)
        off += len(V)
    return np.vstack(Vs), Fs


def new_mesh_obj(name, V, F, coll=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in V], [], [tuple(f) for f in F])
    me.update()
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def shade_smooth(ob):
    me = ob.data
    me.polygons.foreach_set("use_smooth", np.ones(len(me.polygons), dtype=bool))
    me.update()


def apply_modifiers(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def voxel_union(name, parts, voxel=0.008, smooth_iter=6, smooth_fac=0.5, decimate=None):
    """Union closed mesh parts into one watertight smooth skin."""
    V, F = concat(parts)
    ob = new_mesh_obj(name, V, F)
    m = ob.modifiers.new("rm", "REMESH")
    m.mode = "VOXEL"
    m.voxel_size = voxel
    m.adaptivity = 0.0
    if smooth_iter:
        s = ob.modifiers.new("sm", "SMOOTH")
        s.factor = smooth_fac
        s.iterations = smooth_iter
    if decimate:
        d = ob.modifiers.new("dc", "DECIMATE")
        d.ratio = decimate
    apply_modifiers(ob)
    shade_smooth(ob)
    return ob


def mesh_co(ob):
    me = ob.data
    a = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", a)
    return a.reshape(-1, 3)


def set_mesh_co(ob, co):
    me = ob.data
    me.vertices.foreach_set("co", np.ascontiguousarray(co, dtype=np.float64).ravel())
    me.update()


def set_point_color(ob, name, cols):
    me = ob.data
    if name in me.color_attributes:
        me.color_attributes.remove(me.color_attributes[name])
    ca = me.color_attributes.new(name, "FLOAT_COLOR", "POINT")
    c = np.ones((len(cols), 4))
    c[:, :3] = cols
    ca.data.foreach_set("color", c.ravel())


def set_point_float(ob, name, vals):
    me = ob.data
    if name in me.attributes:
        me.attributes.remove(me.attributes[name])
    at = me.attributes.new(name, "FLOAT", "POINT")
    at.data.foreach_set("value", np.asarray(vals, float).ravel())


# --------------------------------------------------------------------------- claws, teeth
def claw(base, direction, up, length, radius, curl=1.2, segs=8, nseg=10):
    """Curved tapered cone (claw / tooth) from base along direction, curling toward -up."""
    d = unit(direction)
    upv = unit(np.asarray(up, float) - d * np.dot(up, d))
    side = unit(np.cross(d, upv))
    pts = []
    for i in range(segs + 1):
        t = i / segs
        ang = curl * t
        # arc in the (d, -up) plane
        r = length / max(curl, 1e-3)
        if curl > 1e-3:
            off = d * r * math.sin(ang) - upv * r * (1 - math.cos(ang))
        else:
            off = d * length * t
        rad = radius * (1 - t) ** 0.9 + 0.0006
        pts.append(np.r_[np.asarray(base) + off, rad, rad, rad * 1.15, rad * 0.9, 2.0])
    pts = np.array(pts)
    # Sweep built with a fixed small spacing; side_ref = side
    sw = Sweep(pts, side_ref=side, spacing=length / 10, nseg=nseg, per=4)
    return sw.mesh_data()


# --------------------------------------------------------------------------- feathers
class FeatherSet:
    """Accumulates feather blades into one mesh with per-vertex colour/uv/random/host."""

    def __init__(self, name, rows=8):
        self.name = name
        self.rows = rows
        self.V, self.F, self.uv, self.col, self.rnd, self.fid = [], [], [], [], [], []
        self.roots = []  # (root position, host tag) per feather
        self.n = 0

    def add(self, root, direction, normal, length, width, colors, curl=0.25, fold=0.15,
            tip=1.0, twist=0.0, rnd=0.0, host=None, lift=0.0, asym=0.0, droop=0.0):
        """colors: list of (v, rgb) stops along the blade (v 0 root .. 1 tip).
        curl bends the blade toward -normal (onto the body), droop bends sideways."""
        d = unit(direction)
        nr = unit(np.asarray(normal, float) - d * np.dot(normal, d))
        if lift:
            R = rot_axis(np.cross(d, nr), lift)  # rotate blade away from surface
            d = R @ d
            nr = R @ nr
        sd = unit(np.cross(nr, d))
        if twist:
            R = rot_axis(d, twist)
            nr, sd = R @ nr, R @ sd
        rows = self.rows
        base = len(self.V)
        stops_v = np.array([c[0] for c in colors])
        stops_c = np.array([c[1] for c in colors], float)
        p = np.asarray(root, float).copy()
        cur_d, cur_n, cur_s = d.copy(), nr.copy(), sd.copy()
        step = length / rows
        for i in range(rows + 1):
            v = i / rows
            if tip >= 0.5:
                w = (1 - v) ** 0.55 * (0.45 + 0.55 * math.sin(min(1.0, v * 1.8) * math.pi / 2))
            else:
                w = max(0.0, 1 - v ** 3) ** 0.5 * (0.55 + 0.45 * math.sin(min(1.0, v * 2.5) * math.pi / 2))
            w = w * width * 0.5
            wl, wr = w * (1 - asym), w * (1 + asym)
            fz = fold * w
            V0 = p - cur_s * wl - cur_n * fz
            V1 = p + cur_n * fz * 0.4
            V2 = p + cur_s * wr - cur_n * fz
            self.V.extend([V0, V1, V2])
            self.uv.extend([(-1.0, v), (0.0, v), (1.0, v)])
            c = np.array([np.interp(v, stops_v, stops_c[:, k]) for k in range(3)])
            self.col.extend([c, c, c])
            self.rnd.extend([rnd] * 3)
            self.fid.extend([self.n] * 3)
            # advance + bend
            p = p + cur_d * step
            if curl:
                R = rot_axis(cur_s, -curl / rows)
                cur_d, cur_n = R @ cur_d, R @ cur_n
            if droop:
                R = rot_axis(cur_n, droop / rows)
                cur_d, cur_s = R @ cur_d, R @ cur_s
        for i in range(rows):
            a = base + i * 3
            b = a + 3
            self.F.append((a, a + 1, b + 1, b))
            self.F.append((a + 1, a + 2, b + 2, b + 1))
        self.roots.append((np.asarray(root, float), host))
        self.n += 1

    def build(self, coll=None):
        if not self.V:
            return None
        V = np.array(self.V)
        ob = new_mesh_obj(self.name, V, self.F, coll)
        me = ob.data
        uvl = me.uv_layers.new(name="fuv")
        li = np.empty(len(me.loops), dtype=np.int32)
        me.loops.foreach_get("vertex_index", li)
        uv = np.array(self.uv)[li]
        uvl.data.foreach_set("uv", uv.ravel())
        set_point_color(ob, "fcol", np.array(self.col))
        set_point_float(ob, "frand", np.array(self.rnd))
        shade_smooth(ob)
        self.fid_arr = np.array(self.fid)
        return ob


# --------------------------------------------------------------------------- materials
class NB:
    """Tiny node-builder."""

    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.out = self.nt.nodes.new("ShaderNodeOutputMaterial")

    def n(self, kind, **inputs):
        nd = self.nt.nodes.new(kind)
        for k, v in inputs.items():
            if k.startswith("_"):
                setattr(nd, k[1:], v)
                continue
            self.set(nd, k, v)
        return nd

    def set(self, nd, k, v):
        key = k.replace("__", " ")
        sock = nd.inputs[key] if not isinstance(key, int) else nd.inputs[key]
        if isinstance(v, bpy.types.NodeSocket):
            self.nt.links.new(v, sock)
        elif isinstance(v, bpy.types.Node):
            self.nt.links.new(v.outputs[0], sock)
        else:
            sock.default_value = v

    def link(self, a, b):
        self.nt.links.new(a, b)

    def math(self, op, *vals, clamp=False):
        nd = self.nt.nodes.new("ShaderNodeMath")
        nd.operation = op
        nd.use_clamp = clamp
        for i, v in enumerate(vals):
            if v is None:
                continue
            if isinstance(v, bpy.types.NodeSocket):
                self.nt.links.new(v, nd.inputs[i])
            elif isinstance(v, bpy.types.Node):
                self.nt.links.new(v.outputs[0], nd.inputs[i])
            else:
                nd.inputs[i].default_value = v
        return nd

    def mix(self, fac, a, b, blend="MIX"):
        nd = self.nt.nodes.new("ShaderNodeMix")
        nd.data_type = "RGBA"
        nd.blend_type = blend
        for sock, v in ((nd.inputs[0], fac), (nd.inputs[6], a), (nd.inputs[7], b)):
            if isinstance(v, bpy.types.NodeSocket):
                self.nt.links.new(v, sock)
            elif isinstance(v, bpy.types.Node):
                self.nt.links.new(v.outputs[0], sock)
            else:
                sock.default_value = v if not isinstance(v, (int, float)) or sock.type == "VALUE" else (v, v, v, 1)
        return nd

    def rgb_out(self, nd):
        return nd.outputs[2] if nd.bl_idname == "ShaderNodeMix" else nd.outputs[0]


def skin_material(name, sheen=0.5, rough=0.62, fuzz_bump=0.12, scale_bump=0.5, ao_mix=0.55, sss=0.06,
                  noise_amt=0.16, scale_cell=150.0):
    """Body skin: colour from the 'Col' point attribute with large/medium/micro variation,
    AO crevice darkening, scales where attribute 'scaly' = 1, sheen fuzz elsewhere,
    mouth interior where attribute 'mouth' = 1."""
    m = bpy.data.materials.new(name)
    b = NB(m)
    col = b.n("ShaderNodeAttribute", _attribute_name="Col")
    scaly = b.n("ShaderNodeAttribute", _attribute_name="scaly")
    rest = b.n("ShaderNodeAttribute", _attribute_name="rest")  # rest-pose coords: texture sticks to skin
    tc = rest
    tco = rest.outputs["Vector"]
    # large + medium variation
    n1 = b.n("ShaderNodeTexNoise", Scale=4.0, Detail=3.0, Roughness=0.5)
    b.link(tco, n1.inputs["Vector"])
    n2 = b.n("ShaderNodeTexNoise", Scale=22.0, Detail=4.0, Roughness=0.6)
    b.link(tco, n2.inputs["Vector"])
    v1 = b.math("MULTIPLY_ADD", n1.outputs["Fac"], noise_amt * 2, 1 - noise_amt)
    v2 = b.math("MULTIPLY_ADD", n2.outputs["Fac"], noise_amt, 1 - noise_amt / 2)
    vv = b.math("MULTIPLY", v1, v2)
    # multiply colour by value: use a vector math scale
    sc = b.n("ShaderNodeVectorMath", _operation="SCALE")
    b.link(col.outputs["Color"], sc.inputs[0])
    b.link(vv.outputs[0], sc.inputs["Scale"])
    # scales: voronoi cells darken at edges
    vor = b.n("ShaderNodeTexVoronoi", Scale=scale_cell, _feature="DISTANCE_TO_EDGE")
    b.link(tco, vor.inputs["Vector"])
    edge = b.math("MULTIPLY", vor.outputs["Distance"], 6.0, clamp=True)
    edge_dark = b.math("MULTIPLY_ADD", edge, 0.35, 0.65)
    scale_mul = b.math("MULTIPLY_ADD", scaly.outputs["Fac"], -1.0, 1.0)  # 1 - scaly
    em = b.math("MULTIPLY_ADD", edge_dark, scaly.outputs["Fac"], scale_mul)  # edge_dark*scaly + (1-scaly)
    sc2 = b.n("ShaderNodeVectorMath", _operation="SCALE")
    b.link(sc.outputs[0], sc2.inputs[0])
    b.link(em.outputs[0], sc2.inputs["Scale"])
    # ambient occlusion crevices
    ao = b.n("ShaderNodeAmbientOcclusion", Distance=0.12)
    ao.samples = 8
    aof = b.math("MULTIPLY_ADD", ao.outputs["AO"], ao_mix, 1 - ao_mix)
    sc3 = b.n("ShaderNodeVectorMath", _operation="SCALE")
    b.link(sc2.outputs[0], sc3.inputs[0])
    b.link(aof.outputs[0], sc3.inputs["Scale"])
    # bumps
    fz = b.n("ShaderNodeTexNoise", Scale=180.0, Detail=2.0)
    b.link(tco, fz.inputs["Vector"])
    hb = b.math("MULTIPLY_ADD", edge, scaly.outputs["Fac"], 0.0)
    hsum = b.math("ADD", hb, b.math("MULTIPLY", fz.outputs["Fac"], fuzz_bump))
    bump = b.n("ShaderNodeBump", Strength=scale_bump, Distance=0.004)
    b.link(hsum.outputs[0], bump.inputs["Height"])
    bs = b.n("ShaderNodeBsdfPrincipled")
    b.link(sc3.outputs[0], bs.inputs["Base Color"])
    b.set(bs, "Roughness", rough)
    b.set(bs, "Sheen Weight", sheen)
    b.set(bs, "Sheen Roughness", 0.45)
    b.set(bs, "Sheen Tint", (1.0, 0.85, 0.7, 1))
    b.set(bs, "Subsurface Weight", sss)
    b.set(bs, "Subsurface Radius", (0.02, 0.008, 0.005))
    b.set(bs, "Subsurface Scale", 0.05)
    b.link(bump.outputs["Normal"], bs.inputs["Normal"])
    b.link(bs.outputs[0], b.out.inputs["Surface"])
    return m


def feather_material(name, translucency=0.28, rough=0.55, sheen=0.4, ao_mix=0.45, edge_alpha=True, barbs=True):
    m = bpy.data.materials.new(name)
    b = NB(m)
    col = b.n("ShaderNodeAttribute", _attribute_name="fcol")
    rnd = b.n("ShaderNodeAttribute", _attribute_name="frand")
    uv = b.n("ShaderNodeUVMap", _uv_map="fuv")
    sep = b.n("ShaderNodeSeparateXYZ")
    b.link(uv.outputs[0], sep.inputs[0])
    au = b.math("ABSOLUTE", sep.outputs["X"])
    # per-feather brightness jitter
    jit = b.math("MULTIPLY_ADD", rnd.outputs["Fac"], 0.22, 0.89)
    # rachis line + darker vane edges for definition
    rach = b.math("LESS_THAN", au, 0.10)
    rmul = b.math("MULTIPLY_ADD", rach, -0.25, 1.0)
    edged = b.math("MULTIPLY_ADD", b.math("SMOOTHSTEP" if False else "POWER", au, 3.0), -0.25, 1.0)
    # barbs: diagonal wave across the vane
    wave = b.n("ShaderNodeTexWave", Scale=1.0, Distortion=0.0, Detail=0.0)
    wave.wave_type = "BANDS"
    comb = b.n("ShaderNodeCombineXYZ")
    # coordinate along barbs: v*16 + |u|*5
    bv = b.math("MULTIPLY_ADD", sep.outputs["Y"], 26.0, b.math("MULTIPLY", au, 9.0))
    b.link(bv.outputs[0], comb.inputs["X"])
    b.link(comb.outputs[0], wave.inputs["Vector"])
    bar = b.math("MULTIPLY_ADD", wave.outputs["Fac"], 0.12, 0.94)
    tot = b.math("MULTIPLY", b.math("MULTIPLY", jit, rmul), b.math("MULTIPLY", edged, bar))
    ao = b.n("ShaderNodeAmbientOcclusion", Distance=0.08)
    ao.samples = 6
    aof = b.math("MULTIPLY_ADD", ao.outputs["AO"], ao_mix, 1 - ao_mix)
    tot2 = b.math("MULTIPLY", tot, aof)
    scl = b.n("ShaderNodeVectorMath", _operation="SCALE")
    b.link(col.outputs["Color"], scl.inputs[0])
    b.link(tot2.outputs[0], scl.inputs["Scale"])
    bs = b.n("ShaderNodeBsdfPrincipled")
    b.link(scl.outputs[0], bs.inputs["Base Color"])
    b.set(bs, "Roughness", rough)
    b.set(bs, "Sheen Weight", sheen)
    b.set(bs, "Sheen Roughness", 0.4)
    if edge_alpha:
        # frayed edge: alpha fades at the vane edge, broken up by the barbs
        a0 = b.math("SUBTRACT", au, b.math("MULTIPLY", wave.outputs["Fac"], 0.18))
        alpha = b.math("SUBTRACT", 1.0, b.math("MULTIPLY", b.math("SUBTRACT", a0, 0.62), 3.2), clamp=True)
        b.link(alpha.outputs[0], bs.inputs["Alpha"])
    tr = b.n("ShaderNodeBsdfTranslucent")
    brighten = b.n("ShaderNodeVectorMath", _operation="SCALE")
    b.link(scl.outputs[0], brighten.inputs[0])
    brighten.inputs["Scale"].default_value = 1.3
    b.link(brighten.outputs[0], tr.inputs["Color"])
    mx = b.n("ShaderNodeMixShader")
    mx.inputs[0].default_value = translucency
    b.link(bs.outputs[0], mx.inputs[1])
    b.link(tr.outputs[0], mx.inputs[2])
    if edge_alpha:
        # translucent part must respect alpha too
        tp = b.n("ShaderNodeBsdfTransparent")
        mx2 = b.n("ShaderNodeMixShader")
        b.link(alpha.outputs[0], mx2.inputs[0])
        b.link(tp.outputs[0], mx2.inputs[1])
        b.link(mx.outputs[0], mx2.inputs[2])
        # principled already has alpha; avoid double: use principled alpha=1 and only mx2
        bs.inputs["Alpha"].default_value = 1.0
        for l in list(b.nt.links):
            if l.to_socket == bs.inputs["Alpha"]:
                b.nt.links.remove(l)
        b.link(mx2.outputs[0], b.out.inputs["Surface"])
    else:
        b.link(mx.outputs[0], b.out.inputs["Surface"])
    return m


def simple_material(name, color, rough=0.35, coat=0.0, sss=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    b = NB(m)
    tc = b.n("ShaderNodeTexCoord")
    nz = b.n("ShaderNodeTexNoise", Scale=60.0, Detail=2.0)
    b.link(tc.outputs["Object"], nz.inputs["Vector"])
    v = b.math("MULTIPLY_ADD", nz.outputs["Fac"], 0.3, 0.85)
    sc = b.n("ShaderNodeVectorMath", _operation="SCALE")
    sc.inputs[0].default_value = color
    b.link(v.outputs[0], sc.inputs["Scale"])
    bs = b.n("ShaderNodeBsdfPrincipled")
    b.link(sc.outputs[0], bs.inputs["Base Color"])
    b.set(bs, "Roughness", rough)
    b.set(bs, "Coat Weight", coat)
    b.set(bs, "Subsurface Weight", sss)
    b.set(bs, "Specular IOR Level", spec)
    b.link(bs.outputs[0], b.out.inputs["Surface"])
    return m


def claw_material(name, base=(0.035, 0.028, 0.026), tip=(0.30, 0.26, 0.22)):
    """Dark glossy keratin, lighter toward the tip (uses the attribute 'ctip' 0..1)."""
    m = bpy.data.materials.new(name)
    b = NB(m)
    t = b.n("ShaderNodeAttribute", _attribute_name="ctip")
    mx = b.mix(t.outputs["Fac"], (*base, 1), (*tip, 1))
    bs = b.n("ShaderNodeBsdfPrincipled")
    b.link(mx.outputs[2], bs.inputs["Base Color"])
    b.set(bs, "Roughness", 0.32)
    b.set(bs, "Coat Weight", 0.4)
    b.link(bs.outputs[0], b.out.inputs["Surface"])
    return m


def eye_material(name, iris=(0.95, 0.45, 0.02), iris_rim=(0.45, 0.10, 0.0), pupil_r=0.36, iris_r=0.80,
                 slit=1.0, ring=(0.04, 0.02, 0.015)):
    """Eye sphere material.  The eye object's local +X axis looks outward.
    Iris/pupil drawn from object coords: radial distance from the X axis."""
    m = bpy.data.materials.new(name)
    b = NB(m)
    tc = b.n("ShaderNodeTexCoord")
    sep = b.n("ShaderNodeSeparateXYZ")
    b.link(tc.outputs["Object"], sep.inputs[0])
    # radial coordinate in the YZ plane, normalised by the object's unit sphere (radius 1 local)
    yy = b.math("MULTIPLY", sep.outputs["Y"], 1.0)
    zz = b.math("MULTIPLY", sep.outputs["Z"], slit)
    r = b.math("SQRT", b.math("ADD", b.math("MULTIPLY", yy, yy), b.math("MULTIPLY", zz, zz)))
    front = b.math("GREATER_THAN", sep.outputs["X"], 0.0)
    irisf = b.math("MULTIPLY", b.math("LESS_THAN", r, iris_r), front)
    pupf = b.math("MULTIPLY", b.math("LESS_THAN", r, pupil_r), front)
    gr = b.math("SMOOTHSTEP" if False else "DIVIDE", r, iris_r)
    ic = b.mix(b.math("POWER", gr, 2.0), (*iris, 1), (*iris_rim, 1))
    c = b.mix(irisf, (*ring, 1), ic.outputs[2])
    c2 = b.mix(pupf, c.outputs[2], (0.005, 0.004, 0.004, 1))
    bs = b.n("ShaderNodeBsdfPrincipled")
    b.link(c2.outputs[2], bs.inputs["Base Color"])
    b.set(bs, "Roughness", 0.08)
    b.set(bs, "Coat Weight", 1.0)
    b.set(bs, "Coat Roughness", 0.02)
    b.set(bs, "Specular IOR Level", 0.9)
    b.link(bs.outputs[0], b.out.inputs["Surface"])
    return m


def eye_mesh(center, radius, out_dir, up=(0, 0, 1), nseg=24, nring=16):
    """Sphere whose local +X points along out_dir; returns (V, F) in creature space and the
    matrix so the material's object coords work (we bake orientation into an object)."""
    V, F = ellipsoid((0, 0, 0), (1, 1, 1), nseg=nseg, nring=nring)
    x = unit(out_dir)
    z = unit(np.asarray(up, float) - x * np.dot(up, x))
    y = np.cross(z, x)
    R = np.stack([x, y, z], 1)
    return V, F, R, np.asarray(center, float), radius
