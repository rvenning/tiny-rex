"""Render the baked ground layer of the world in screen-aligned tiles.

  blender -b -P tools/art/render_world.py -- --world art-build/world --out art-build/world/tiles
         [--tiles 3,4;4,4] [--center 30,34 --size 1448,1086 --name test] [--samples 64] [--props]

The ground layer contains terrain, water, baked clutter and every prop SHADOW; tall props are
separate sprites placed by the game, so creatures can walk behind them.
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from common import *  # noqa: E402,F401

SURF = ["grass", "dirt", "moss", "rock", "mud", "gravel", "sand", "basalt", "lava", "ash"]
TILE = 1024


# ----------------------------------------------------------------------------- mesh
def grid_mesh(name, X, Y, Z, attrs, mask=None):
    ny, nx = Z.shape
    co = np.zeros((ny, nx, 3), np.float32)
    co[..., 0] = Y  # Blender X = gy
    co[..., 1] = X  # Blender Y = gx
    co[..., 2] = Z
    idx = np.arange(ny * nx).reshape(ny, nx)
    quads = np.stack([idx[:-1, :-1], idx[:-1, 1:], idx[1:, 1:], idx[1:, :-1]], -1).reshape(-1, 4)
    if mask is not None:
        m = mask[:-1, :-1] | mask[:-1, 1:] | mask[1:, 1:] | mask[1:, :-1]
        quads = quads[m.reshape(-1)]
    # mapping (gx,gy)->(Y,X) mirrors winding, so flip to keep normals up
    quads = quads[:, ::-1]
    mesh = bpy.data.meshes.new(name)
    mesh.vertices.add(ny * nx)
    mesh.vertices.foreach_set("co", co.reshape(-1))
    nq = len(quads)
    mesh.loops.add(nq * 4)
    mesh.polygons.add(nq)
    mesh.loops.foreach_set("vertex_index", quads.reshape(-1))
    mesh.polygons.foreach_set("loop_start", np.arange(nq, dtype=np.int32) * 4)
    mesh.polygons.foreach_set("loop_total", np.full(nq, 4, np.int32))
    mesh.update(calc_edges=True)
    mesh.polygons.foreach_set("use_smooth", np.ones(nq, bool))
    for k, a in attrs.items():
        att = mesh.attributes.new(k, "FLOAT_COLOR", "POINT")
        a4 = np.zeros((ny * nx, 4), np.float32)
        a4[:, : a.shape[-1]] = a.reshape(ny * nx, -1)
        att.data.foreach_set("color", a4.reshape(-1))
    return mesh


# ----------------------------------------------------------------------------- shader helpers
class NT:
    def __init__(self, nt):
        self.nt = nt
        self.n = 0

    def node(self, t, **kw):
        nd = self.nt.nodes.new(t)
        for k, v in kw.items():
            if k == "inputs":
                for kk, vv in v.items():
                    nd.inputs[kk].default_value = vv
            else:
                setattr(nd, k, v)
        return nd

    def link(self, a, b):
        self.nt.links.new(a, b)

    def math(self, op, a, b=None, clamp=False):
        m = self.node("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if hasattr(v, "node") or hasattr(v, "is_output"):
                self.link(v, m.inputs[i])
            else:
                m.inputs[i].default_value = v
        return m.outputs[0]

    def mix(self, fac, a, b, blend="MIX"):
        m = self.node("ShaderNodeMix", data_type="RGBA", blend_type=blend)
        for sock, v in ((m.inputs[0], fac), (m.inputs[6], a), (m.inputs[7], b)):
            if hasattr(v, "node") or hasattr(v, "is_output"):
                self.link(v, sock)
            elif isinstance(v, (tuple, list)):
                sock.default_value = (*v, 1.0) if len(v) == 3 else tuple(v)
            else:
                sock.default_value = v if sock is m.inputs[0] else (v, v, v, 1)
        return m.outputs[2]

    def ramp(self, fac, stops):
        r = self.node("ShaderNodeValToRGB")
        r.color_ramp.elements[0].position = stops[0][0]
        r.color_ramp.elements[0].color = (*stops[0][1], 1)
        r.color_ramp.elements[1].position = stops[-1][0]
        r.color_ramp.elements[1].color = (*stops[-1][1], 1)
        for p, c in stops[1:-1]:
            e = r.color_ramp.elements.new(p)
            e.color = (*c, 1)
        self.link(fac, r.inputs[0])
        return r.outputs[0]

    def noise(self, vec, scale, detail=3.0, rough=0.5, distort=0.0):
        n = self.node("ShaderNodeTexNoise", noise_dimensions="3D")
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        n.inputs["Distortion"].default_value = distort
        self.link(vec, n.inputs["Vector"])
        return n.outputs["Fac"]

    def voronoi(self, vec, scale, feature="F1", rnd=1.0):
        v = self.node("ShaderNodeTexVoronoi", voronoi_dimensions="3D", feature=feature)
        v.inputs["Scale"].default_value = scale
        v.inputs["Randomness"].default_value = rnd
        self.link(vec, v.inputs["Vector"])
        return v


def build_ground_material():
    m = bpy.data.materials.new("Ground")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    T = NT(nt)
    geo = T.node("ShaderNodeNewGeometry")
    pos = geo.outputs["Position"]
    # surface weights
    a0 = T.node("ShaderNodeAttribute", attribute_name="a0")
    a1 = T.node("ShaderNodeAttribute", attribute_name="a1")
    a2 = T.node("ShaderNodeAttribute", attribute_name="a2")
    sepA = T.node("ShaderNodeSeparateColor")
    sepB = T.node("ShaderNodeSeparateColor")
    sepC = T.node("ShaderNodeSeparateColor")
    T.link(a0.outputs["Color"], sepA.inputs[0])
    T.link(a1.outputs["Color"], sepB.inputs[0])
    T.link(a2.outputs["Color"], sepC.inputs[0])
    # (alpha of a0 not separable via SeparateColor) -> put rock in a1.r and so on
    W = {
        "grass": sepA.outputs[0],
        "dirt": sepA.outputs[1],
        "moss": sepA.outputs[2],
        "rock": sepB.outputs[0],
        "mud": sepB.outputs[1],
        "gravel": sepB.outputs[2],
        "sand": sepC.outputs[0],
        "basalt": sepC.outputs[1],
        "lava": sepC.outputs[2],
    }
    big = T.noise(pos, 0.09, 4, 0.55)
    mid = T.noise(pos, 0.55, 4, 0.55)
    fine = T.noise(pos, 3.2, 3, 0.6)
    grit = T.noise(pos, 22.0, 2, 0.5)
    micro = T.noise(pos, 60.0, 1, 0.5)
    vcr = T.voronoi(pos, 0.9, "F1")  # cells for cracks
    cr = T.node("ShaderNodeTexVoronoi", voronoi_dimensions="3D", feature="DISTANCE_TO_EDGE")
    cr.inputs["Scale"].default_value = 2.1
    T.link(pos, cr.inputs["Vector"])
    cr2 = T.node("ShaderNodeTexVoronoi", voronoi_dimensions="3D", feature="F1")
    cr2.inputs["Scale"].default_value = 7.0
    T.link(pos, cr2.inputs["Vector"])
    peb = T.node("ShaderNodeTexVoronoi", voronoi_dimensions="3D", feature="F1")
    peb.inputs["Scale"].default_value = 11.0
    T.link(pos, peb.inputs["Vector"])
    crackline = T.math("SUBTRACT", 1.0, T.math("MINIMUM", T.math("DIVIDE", cr.outputs["Distance"], 0.025), 1.0))
    crackline = T.math("MULTIPLY", crackline, T.math("MINIMUM", T.math("MAXIMUM", T.math("MULTIPLY", T.math("SUBTRACT", big, 0.42), 6.0), 0.0), 1.0))

    # colours (linear)
    dirt_a = (0.30, 0.135, 0.05)
    dirt_b = (0.52, 0.27, 0.10)
    c_dirt = T.mix(T.math("MULTIPLY", mid, 1.0), dirt_a, dirt_b)
    # large damp / dry patches and trampled lanes
    patch = T.noise(pos, 0.22, 3, 0.6)
    c_dirt = T.mix(T.math("MINIMUM", T.math("MAXIMUM", T.math("MULTIPLY", T.math("SUBTRACT", patch, 0.45), 4.0), 0.0), 1.0), c_dirt, (0.16, 0.075, 0.035))
    c_dirt = T.mix(T.math("MINIMUM", T.math("MAXIMUM", T.math("MULTIPLY", T.math("SUBTRACT", T.noise(pos, 0.35, 2, 0.5), 0.58), 4.0), 0.0), 1.0), c_dirt, (0.66, 0.42, 0.20))
    c_dirt = T.mix(T.math("MULTIPLY", crackline, 0.35), c_dirt, (0.12, 0.05, 0.02))
    # real pebbles: round voronoi cells, each with its own random tone
    pebs = T.math("SUBTRACT", 1.0, T.math("MINIMUM", T.math("DIVIDE", peb.outputs["Distance"], 0.24), 1.0))
    pebs = T.math("MULTIPLY", T.math("MINIMUM", T.math("MULTIPLY", pebs, 3.0), 1.0), T.math("MINIMUM", T.math("MAXIMUM", T.math("MULTIPLY", T.math("SUBTRACT", T.noise(pos, 0.5, 2, 0.5), 0.5), 5.0), 0.0), 1.0))
    sep_pc = T.node("ShaderNodeSeparateColor")
    T.link(peb.outputs["Color"], sep_pc.inputs[0])
    pebcol = T.mix(sep_pc.outputs[0], (0.17, 0.14, 0.12), (0.52, 0.45, 0.36))
    c_dirt = T.mix(T.math("MULTIPLY", pebs, 0.85), c_dirt, pebcol)
    c_dirt = T.mix(T.math("MULTIPLY", T.math("SUBTRACT", grit, 0.52, True), 3.5), c_dirt, (0.72, 0.5, 0.26))
    c_dirt = T.mix(T.math("MULTIPLY", T.math("SUBTRACT", micro, 0.62, True), 4.0), c_dirt, (0.10, 0.06, 0.03))
    c_grass = T.mix(mid, (0.07, 0.16, 0.025), (0.22, 0.34, 0.05))
    c_grass = T.mix(T.math("MULTIPLY", T.math("SUBTRACT", fine, 0.55, True), 3.0), c_grass, (0.38, 0.45, 0.07))
    c_moss = T.mix(mid, (0.03, 0.12, 0.025), (0.09, 0.24, 0.04))
    c_rock = T.mix(mid, (0.14, 0.12, 0.10), (0.30, 0.25, 0.19))
    c_rock = T.mix(T.math("MULTIPLY", crackline, 0.6), c_rock, (0.05, 0.04, 0.035))
    c_mud = T.mix(mid, (0.05, 0.03, 0.02), (0.11, 0.07, 0.04))
    c_grav = T.mix(peb.outputs["Position"] if False else T.math("MULTIPLY", peb.outputs["Distance"], 1.0), (0.38, 0.33, 0.26), (0.20, 0.17, 0.14))
    c_grav = T.mix(T.math("MULTIPLY", fine, 0.8), c_grav, (0.50, 0.46, 0.38))
    c_sand = T.mix(mid, (0.50, 0.36, 0.17), (0.66, 0.50, 0.26))
    c_bas = T.mix(mid, (0.025, 0.022, 0.03), (0.07, 0.06, 0.07))
    c_ash = T.mix(mid, (0.10, 0.10, 0.10), (0.2, 0.19, 0.18))
    cols = {
        "grass": c_grass, "dirt": c_dirt, "moss": c_moss, "rock": c_rock, "mud": c_mud,
        "gravel": c_grav, "sand": c_sand, "basalt": c_bas, "lava": (1, 0.3, 0.02),
    }
    # noise-perturbed weights (height-blend style) so boundaries look organic
    pert = {}
    tot = None
    for k, wsock in W.items():
        p = T.math("MULTIPLY", wsock, T.math("ADD", 0.35, T.math("MULTIPLY", T.noise(pos, 1.7 + 0.37 * len(pert), 3, 0.6), 1.3)))
        p = T.math("POWER", p, 1.6)
        pert[k] = p
        tot = p if tot is None else T.math("ADD", tot, p)
    tot = T.math("MAXIMUM", tot, 1e-4)
    base = None
    acc_w = None
    for k, c in cols.items():
        wk = T.math("DIVIDE", pert[k], tot)
        if base is None:
            base, acc_w = c if hasattr(c, "node") else T.mix(0.0, c, c), wk
        else:
            f = T.math("DIVIDE", wk, T.math("MAXIMUM", T.math("ADD", acc_w, wk), 1e-4))
            base = T.mix(f, base, c)
            acc_w = T.math("ADD", acc_w, wk)
    # soft canopy-free large-scale tonal variation (painterly)
    tone = T.mix(T.math("MULTIPLY", big, 0.7), (0.9, 0.9, 0.9), (1.18, 1.14, 1.05))
    # dappled canopy light: leaf-shaped gaps (noise x voronoi); stronger under the forest
    a3 = T.node("ShaderNodeAttribute", attribute_name="a3")
    sepD = T.node("ShaderNodeSeparateColor")
    T.link(a3.outputs["Color"], sepD.inputs[0])
    forest = sepD.outputs[0]
    dv = T.node("ShaderNodeTexVoronoi", voronoi_dimensions="3D", feature="F1")
    dv.inputs["Scale"].default_value = 0.42
    T.link(pos, dv.inputs["Vector"])
    dn = T.noise(pos, 0.5, 4, 0.6, 0.6)
    gaps = T.math("ADD", T.math("MULTIPLY", dn, 0.8), T.math("MULTIPLY", dv.outputs["Distance"], 0.45))
    shadow = T.math("MINIMUM", T.math("MAXIMUM", T.math("MULTIPLY", T.math("SUBTRACT", gaps, 0.62), 7.0), 0.0), 1.0)
    amount = T.math("MULTIPLY", shadow, T.math("ADD", 0.16, T.math("MULTIPLY", forest, 0.62)))
    dapple = T.mix(amount, (1.12, 1.05, 0.92), (0.46, 0.58, 0.78))
    tone2 = T.node("ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    tone2.inputs[0].default_value = 1.0
    T.link(tone, tone2.inputs[6])
    T.link(dapple, tone2.inputs[7])
    col = T.node("ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    col.inputs[0].default_value = 1.0
    T.link(base, col.inputs[6])
    T.link(tone2.outputs[2], col.inputs[7])
    # bump
    height = T.math("ADD", T.math("MULTIPLY", fine, 0.5), T.math("MULTIPLY", grit, 0.25))
    height = T.math("ADD", height, T.math("MULTIPLY", T.math("SUBTRACT", 1.0, T.math("MINIMUM", cr2.outputs["Distance"], 1.0)), 0.25))
    bump = T.node("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.8
    bump.inputs["Distance"].default_value = 0.10
    T.link(height, bump.inputs["Height"])
    bsdf = T.node("ShaderNodeBsdfPrincipled")
    T.link(col.outputs[2], bsdf.inputs["Base Color"])
    T.link(bump.outputs["Normal"], bsdf.inputs["Normal"])
    wet = T.math("ADD", W["mud"], T.math("MULTIPLY", W["gravel"], 0.4))
    T.link(T.math("SUBTRACT", 0.92, T.math("MULTIPLY", wet, 0.55)), bsdf.inputs["Roughness"])
    bsdf.inputs["Specular IOR Level"].default_value = 0.25
    # lava glow
    em = T.node("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1.0, 0.32, 0.03, 1)
    em.inputs["Strength"].default_value = 8.0
    mixs = T.node("ShaderNodeMixShader")
    T.link(T.math("MINIMUM", T.math("MULTIPLY", W["lava"], 2.0), 1.0), mixs.inputs[0])
    T.link(bsdf.outputs[0], mixs.inputs[1])
    T.link(em.outputs[0], mixs.inputs[2])
    out = T.node("ShaderNodeOutputMaterial")
    T.link(mixs.outputs[0], out.inputs[0])
    return m


def build_water_material():
    m = bpy.data.materials.new("Water")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    T = NT(nt)
    geo = T.node("ShaderNodeNewGeometry")
    pos = geo.outputs["Position"]
    at = T.node("ShaderNodeAttribute", attribute_name="depth")
    depth = at.outputs["Fac"]
    n1 = T.noise(pos, 1.6, 4, 0.6)
    n2 = T.noise(pos, 7.0, 2, 0.5)
    cell = T.node("ShaderNodeTexVoronoi", voronoi_dimensions="3D", feature="DISTANCE_TO_EDGE")
    cell.inputs["Scale"].default_value = 2.2
    T.link(pos, cell.inputs["Vector"])
    # flow runs along +gx = Blender +Y: stretch noise along it for streaky current
    flow = T.node("ShaderNodeMapping")
    flow.inputs["Scale"].default_value = (2.6, 0.45, 1.0)
    T.link(pos, flow.inputs["Vector"])
    streak = T.noise(flow.outputs[0], 1.8, 4, 0.65, 0.3)
    foam_n = T.noise(flow.outputs[0], 3.2, 4, 0.7, 0.2)
    shore = T.math("SUBTRACT", 1.0, T.math("MINIMUM", T.math("DIVIDE", T.math("ADD", depth, T.math("MULTIPLY", T.math("SUBTRACT", foam_n, 0.5), 0.16)), 0.13), 1.0))
    patchy = T.math("MINIMUM", T.math("MAXIMUM", T.math("MULTIPLY", T.math("SUBTRACT", foam_n, 0.46), 5.0), 0.0), 1.0)
    foam = T.math("MULTIPLY", patchy, T.math("MULTIPLY", shore, 0.95))
    foam = T.math("MAXIMUM", foam, T.math("MULTIPLY", T.math("MINIMUM", T.math("MAXIMUM", T.math("MULTIPLY", T.math("SUBTRACT", streak, 0.68), 6.0), 0.0), 1.0), 0.55))
    dd = T.math("MINIMUM", T.math("POWER", T.math("MINIMUM", depth, 1.0), 0.7), 1.0)
    col = T.ramp(dd, [(0.0, (0.30, 0.82, 0.55)), (0.35, (0.04, 0.56, 0.52)), (0.7, (0.0, 0.34, 0.42)), (1.0, (0.0, 0.2, 0.32))])
    # soft current striping in the colour, not hard caustic cells
    col = T.mix(T.math("MULTIPLY", T.math("SUBTRACT", streak, 0.5), 0.9), col, (0.22, 0.78, 0.74))
    col = T.mix(foam, col, (0.93, 0.98, 0.96))
    bump = T.node("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.08
    T.link(T.math("ADD", T.math("MULTIPLY", n1, 0.7), T.math("MULTIPLY", n2, 0.3)), bump.inputs["Height"])
    bs = T.node("ShaderNodeBsdfPrincipled")
    T.link(col, bs.inputs["Base Color"])
    bs.inputs["Roughness"].default_value = 0.08
    bs.inputs["IOR"].default_value = 1.33
    bs.inputs["Specular IOR Level"].default_value = 0.7
    T.link(bump.outputs["Normal"], bs.inputs["Normal"])
    em = T.node("ShaderNodeEmission")
    T.link(col, em.inputs["Color"])
    em.inputs["Strength"].default_value = 0.28
    add = T.node("ShaderNodeAddShader")
    T.link(bs.outputs[0], add.inputs[0])
    T.link(em.outputs[0], add.inputs[1])
    tr = T.node("ShaderNodeBsdfTransparent")
    mx = T.node("ShaderNodeMixShader")
    alpha = T.math("MAXIMUM", T.math("POWER", T.math("MINIMUM", T.math("DIVIDE", depth, 0.38), 1.0), 0.8), foam)
    alpha = T.math("MAXIMUM", alpha, 0.0)
    T.link(alpha, mx.inputs[0])
    T.link(tr.outputs[0], mx.inputs[1])
    T.link(add.outputs[0], mx.inputs[2])
    out = T.node("ShaderNodeOutputMaterial")
    T.link(mx.outputs[0], out.inputs[0])
    return m


def build_waterfall_material():
    m = bpy.data.materials.new("Waterfall")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    T = NT(nt)
    tc = T.node("ShaderNodeTexCoord")
    mp = T.node("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (26.0, 26.0, 1.3)
    T.link(tc.outputs["Generated"], mp.inputs["Vector"])
    streak = T.noise(mp.outputs[0], 1.0, 4, 0.6, 0.2)
    mp2 = T.node("ShaderNodeMapping")
    mp2.inputs["Scale"].default_value = (9.0, 9.0, 0.7)
    T.link(tc.outputs["Generated"], mp2.inputs["Vector"])
    s2 = T.noise(mp2.outputs[0], 1.0, 3, 0.5)
    sep = T.node("ShaderNodeSeparateXYZ")
    T.link(tc.outputs["Generated"], sep.inputs[0])
    z = sep.outputs["Z"]  # 0 at the bottom, 1 at the lip
    white = T.math("MINIMUM", T.math("MAXIMUM", T.math("MULTIPLY", T.math("SUBTRACT", T.math("ADD", streak, s2), 0.78), 3.2), 0.0), 1.0)
    col = T.mix(white, (0.25, 0.75, 0.78), (0.95, 0.99, 0.98))
    bs = T.node("ShaderNodeBsdfPrincipled")
    T.link(col, bs.inputs["Base Color"])
    bs.inputs["Roughness"].default_value = 0.12
    em = T.node("ShaderNodeEmission")
    T.link(col, em.inputs["Color"])
    em.inputs["Strength"].default_value = 0.45
    add = T.node("ShaderNodeAddShader")
    T.link(bs.outputs[0], add.inputs[0])
    T.link(em.outputs[0], add.inputs[1])
    tr = T.node("ShaderNodeBsdfTransparent")
    mx = T.node("ShaderNodeMixShader")
    T.link(T.math("MAXIMUM", T.math("MULTIPLY", T.math("ADD", 0.55, T.math("MULTIPLY", white, 0.45)), 1.0), 0.0), mx.inputs[0])
    T.link(tr.outputs[0], mx.inputs[1])
    T.link(add.outputs[0], mx.inputs[2])
    out = T.node("ShaderNodeOutputMaterial")
    T.link(mx.outputs[0], out.inputs[0])
    return m


def build_waterfall(sc, f):
    """A vertical ribbon from the lip down the cliff face into the pool, plus foam at its foot."""
    import bmesh

    x, y, w, zt, zb = f["x"], f["y"], f["w"], f["ztop"], f["zbot"]
    d = np.array([0.7071, 0.7071])  # the fall faces the camera (+gx,+gy)
    perp = np.array([-0.7071, 0.7071])
    nu, nv = 14, 20
    verts, faces = [], []
    for j in range(nv + 1):
        t = j / nv
        zz = zt + (zb - zt) * t
        run = 0.25 + 1.15 * t * t  # leaves the wall as it falls
        for i in range(nu + 1):
            s = (i / nu - 0.5) * w * (1.0 + 0.25 * t)
            wob = 0.06 * np.sin(i * 1.7 + j * 0.8)
            gx = x + d[0] * (run + wob) + perp[0] * s
            gy = y + d[1] * (run + wob) + perp[1] * s
            verts.append((gy, gx, zz))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            faces.append((a, a + 1, a + nu + 2, a + nu + 1))
    mesh = bpy.data.meshes.new("Fall")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new("Fall", mesh)
    sc.collection.objects.link(ob)
    ob.data.materials.append(build_waterfall_material())
    # foam at the foot: flattened white blobs
    mat = bpy.data.materials.new("Foam")
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.95, 0.98, 0.97, 1)
    b.inputs["Roughness"].default_value = 0.6
    b.inputs["Emission Color"].default_value = (0.9, 1, 0.97, 1)
    b.inputs["Emission Strength"].default_value = 0.35
    rng = np.random.default_rng(5)
    for k in range(34):
        s = rng.normal(0, w * 0.5)
        r = rng.uniform(0.18, 0.45)
        gx = x + d[0] * 1.45 + perp[0] * s + rng.normal(0, 0.35) * d[0]
        gy = y + d[1] * 1.45 + perp[1] * s + rng.normal(0, 0.35) * d[1]
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(gy, gx, zb + 0.02), segments=10, ring_count=6)
        o = bpy.context.object
        o.scale = (1.0, 1.0, 0.35)
        o.data.materials.append(mat)
    return ob


# ----------------------------------------------------------------------------- world
def load_world(wdir):
    d = np.load(os.path.join(wdir, "terrain.npz"))
    x0, y0, x1, y1, cell = [float(v) for v in d["bounds"]]
    z = d["z"].astype(np.float32)
    surf = d["surf"].astype(np.float32)
    water = d["water"].astype(np.float32)
    forest = d["forest"].astype(np.float32)
    ny, nx = z.shape
    xs = x0 + (np.arange(nx) + 0.5) * cell
    ys = y0 + (np.arange(ny) + 0.5) * cell
    X, Y = np.meshgrid(xs, ys)
    props = json.load(open(os.path.join(wdir, "props.json")))
    return dict(z=z, surf=surf, water=water, forest=forest, X=X, Y=Y, bounds=(x0, y0, x1, y1, cell), props=props)


def tile_cam_target(ox, oy, cx, cy):
    """global canvas pixel -> game ground point whose projection lands there"""
    sx, sy = ox + cx, oy + cy
    a = sx / (COS45 * PPU)  # gx - gy
    b = sy / (COS45 * PPU * SQUASH)  # gx + gy
    return ((a + b) / 2, (b - a) / 2)


def main():
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--world", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--tiles", default="")
    ap.add_argument("--center", default="")
    ap.add_argument("--size", default="1448,1086")
    ap.add_argument("--name", default="test")
    ap.add_argument("--samples", type=int, default=64)
    a = ap.parse_args(args_after_dashes())
    W = load_world(a.world)
    sc = reset_scene()
    x0, y0, x1, y1, cell = W["bounds"]
    # canvas origin (min projected pixel over the bounds corners, z range -2..14)
    corners = [proj(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (-2.0, 14.0)]
    ox = min(c[0] for c in corners)
    oy = min(c[1] for c in corners)
    os.makedirs(a.out, exist_ok=True)
    json.dump(dict(ox=ox, oy=oy, ppu=PPU, tile=TILE, w=max(c[0] for c in corners) - ox, h=max(c[1] for c in corners) - oy), open(os.path.join(a.out, "canvas.json"), "w"))
    # --- geometry
    S = {k: W["surf"][i] for i, k in enumerate(SURF)}
    a0 = np.stack([S["grass"], S["dirt"], S["moss"]], -1)
    a1 = np.stack([S["rock"], S["mud"], S["gravel"]], -1)
    a2 = np.stack([S["sand"], S["basalt"], S["lava"]], -1)
    mesh = grid_mesh("Terrain", W["X"], W["Y"], W["z"], {"a0": a0, "a1": a1, "a2": a2, "a3": W["forest"][..., None]})
    ob = bpy.data.objects.new("Terrain", mesh)
    sc.collection.objects.link(ob)
    ob.data.materials.append(build_ground_material())
    wl = W["water"]
    wet = ~np.isnan(wl)
    if wet.any():
        # dilate wet mask by 3 cells so the surface meets banks
        m = wet.copy()
        for _ in range(3):
            m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
        level = np.where(wet, wl, np.nanmean(wl)).astype(np.float32)
        depth = np.clip(level - W["z"], 0, 1.4).astype(np.float32)
        wmesh = grid_mesh("Water", W["X"], W["Y"], level + 0.0, {"depth": depth[..., None]}, mask=m)
        wob = bpy.data.objects.new("Water", wmesh)
        sc.collection.objects.link(wob)
        wob.data.materials.append(build_water_material())
    for f in W["props"].get("features", []):
        if f["kind"] == "waterfall":
            build_waterfall(sc, f)
    setup_render(sc, TILE, TILE, samples=a.samples, transparent=False)
    setup_lighting(sc)
    if a.center:
        cx, cy = [float(v) for v in a.center.split(",")]
        w, h = [int(v) for v in a.size.split(",")]
        sc.render.resolution_x, sc.render.resolution_y = w, h
        px, py = proj(cx, cy, 0)
        tx, ty = tile_cam_target(0, 0, px, py)
        make_camera(sc, target=(tx, ty, 0), ortho_width_px=w, w=w, h=h)
        render_to(sc, os.path.join(a.out, a.name + ".png"))
        return
    for tl in a.tiles.split(";"):
        if not tl:
            continue
        tx, ty = [int(v) for v in tl.split(",")]
        cx, cy = tx * TILE + TILE / 2, ty * TILE + TILE / 2
        gx, gy = tile_cam_target(ox, oy, cx, cy)
        for o in [o for o in sc.objects if o.type == "CAMERA"]:
            bpy.data.objects.remove(o)
        make_camera(sc, target=(gx, gy, 0), ortho_width_px=TILE, w=TILE, h=TILE)
        render_to(sc, os.path.join(a.out, f"t_{tx}_{ty}.png"))


main()
