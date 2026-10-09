"""Vegetation kit: procedural Cycles materials.

All foliage shaders read the per-vertex colour attribute veg_geom.ATTR =
(t, across, r1, r2): a base->tip colour ramp, a lighter midrib, per-leaf hue
jitter, crevice AO tinted cool teal, and a Translucent BSDF mixed into the
Principled so leaves glow gold-green when the low sun is behind them.
"""
import bpy

from .veg_geom import ATTR


class G:
    """Tiny node-graph builder."""

    def __init__(self, name):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        self.m = m
        self.nt = m.node_tree
        self.nt.nodes.clear()
        self.out = self.node("ShaderNodeOutputMaterial")

    def node(self, kind, **props):
        n = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def link(self, a, b):
        self.nt.links.new(a, b)

    def set(self, sock, val):
        if hasattr(val, "is_output") or isinstance(val, bpy.types.NodeSocket):
            self.link(val, sock)
        else:
            sock.default_value = val

    def math(self, op, a, b=0.0, clamp=False):
        n = self.node("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.set(n.inputs[0], a)
        self.set(n.inputs[1], b)
        return n.outputs[0]

    def mix(self, a, b, fac, blend="MIX", clamp=True):
        n = self.node("ShaderNodeMix", data_type="RGBA", blend_type=blend, clamp_result=clamp)
        self.set(n.inputs[0], fac)
        self.set(n.inputs[6], _c4(a))
        self.set(n.inputs[7], _c4(b))
        return n.outputs[2]

    def ramp(self, fac, stops, interp="LINEAR"):
        n = self.node("ShaderNodeValToRGB")
        n.color_ramp.interpolation = interp
        els = n.color_ramp.elements
        while len(els) < len(stops):
            els.new(0.5)
        for e, (p, c) in zip(els, stops):
            e.position = p
            e.color = _c4(c)
        self.set(n.inputs[0], fac)
        return n.outputs[0]

    def attr(self):
        a = self.node("ShaderNodeAttribute", attribute_name=ATTR, attribute_type="GEOMETRY")
        s = self.node("ShaderNodeSeparateColor")
        self.link(a.outputs["Color"], s.inputs[0])
        return s.outputs[0], s.outputs[1], s.outputs[2], a.outputs["Alpha"]

    def noise(self, scale, detail=3.0, rough=0.55, coord="Object", vec=None):
        n = self.node("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        if vec is None:
            tc = self.node("ShaderNodeTexCoord")
            vec = tc.outputs[coord]
        self.link(vec, n.inputs["Vector"])
        return n.outputs["Fac"]

    def ao(self, col, dist=0.3, samples=8):
        n = self.node("ShaderNodeAmbientOcclusion", samples=samples, only_local=True)
        self.set(n.inputs["Color"], col)
        n.inputs["Distance"].default_value = dist
        return n.outputs["AO"]

    def finish(self, shader):
        self.link(shader, self.out.inputs["Surface"])
        return self.m


def _c4(c):
    if isinstance(c, (tuple, list)) and len(c) == 3:
        return (*c, 1.0)
    return c


def principled(g, col, rough=0.5, spec=0.35, normal=None, sheen=0.0, sheen_tint=(1, 1, 1)):
    p = g.node("ShaderNodeBsdfPrincipled")
    g.set(p.inputs["Base Color"], col)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Specular IOR Level"].default_value = spec
    if sheen:
        p.inputs["Sheen Weight"].default_value = sheen
        p.inputs["Sheen Tint"].default_value = _c4(sheen_tint)
    if normal is not None:
        g.link(normal, p.inputs["Normal"])
    return p.outputs[0]


def bump(g, height, strength=0.3, dist=0.02):
    b = g.node("ShaderNodeBump")
    b.inputs["Strength"].default_value = strength
    b.inputs["Distance"].default_value = dist
    g.link(height, b.inputs["Height"])
    return b.outputs[0]


SHADE = (0.20, 0.42, 0.55)  # teal multiplier applied in occluded crevices


def foliage(name, stops, trans=0.4, rough=0.42, vein=0.35, vein_col=(0.55, 0.62, 0.12), hue_jit=0.035,
            val_jit=0.55, sat_jit=0.3, ao_amt=0.5, ao_dist=0.35, glow=(1.9, 1.6, 0.35), spec=0.5, micro=0.12,
            age_col=None, age_amt=0.0, sheen=0.15, lateral=0.0, lat_skew=0.35, lat_amt=0.25, lat_col=None):
    """Leaf material. stops: colour ramp over t (base -> tip), linear RGB."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    g = G(name)
    t, across, r1, r2 = g.attr()
    col = g.ramp(t, stops)
    hsv = g.node("ShaderNodeHueSaturation")
    g.set(hsv.inputs["Hue"], g.math("ADD", g.math("MULTIPLY", g.math("SUBTRACT", r1, 0.5), hue_jit * 2), 0.5))
    g.set(hsv.inputs["Saturation"], g.math("ADD", g.math("MULTIPLY", g.math("SUBTRACT", r2, 0.5), sat_jit * 2), 1.0))
    g.set(hsv.inputs["Value"], g.math("ADD", g.math("MULTIPLY", g.math("SUBTRACT", r1, 0.5), val_jit), 1.0))
    g.set(hsv.inputs["Color"], col)
    col = hsv.outputs[0]
    if age_col is not None and age_amt > 0:
        # a few old leaves (high r2) brown / yellow toward their tips
        f = g.math("MULTIPLY", g.math("MULTIPLY", g.math("SUBTRACT", r2, 1 - age_amt, clamp=True), 1 / age_amt), t)
        col = g.mix(col, age_col, f)
    # lighter midrib / veins (across == 0)
    vf = g.math("MULTIPLY", g.math("POWER", g.math("SUBTRACT", 1.0, across, clamp=True), 8.0), vein)
    col = g.mix(col, vein_col, vf)
    if lateral:
        # parallel side veins (banana / ginger / lily pads): thin stripes across the blade
        ph = g.math("SUBTRACT", g.math("MULTIPLY", t, lateral), g.math("MULTIPLY", across, lat_skew * lateral * 0.1))
        stripe = g.math("POWER", g.math("ABSOLUTE", g.math("SINE", g.math("MULTIPLY", ph, 3.14159))), 14.0)
        col = g.mix(col, lat_col or vein_col, g.math("MULTIPLY", stripe, lat_amt))
    # soft micro variation (keeps the surface from looking plastic)
    if micro:
        nz = g.noise(55.0, detail=2.0)
        col = g.mix(col, g.math("ADD", g.math("MULTIPLY", nz, micro * 2), 1 - micro), 1.0, blend="MULTIPLY")
    # cool teal in the crevices
    occ = g.ao(col, ao_dist)
    shaded = g.mix(col, SHADE, 1.0, blend="MULTIPLY")
    col = g.mix(shaded, col, g.math("POWER", occ, 1.0 / max(ao_amt, 0.05)))
    p = principled(g, col, rough, spec, sheen=sheen, sheen_tint=(1.0, 0.9, 0.5))
    tr = g.node("ShaderNodeBsdfTranslucent")
    g.set(tr.inputs["Color"], g.mix(col, glow, 1.0, blend="MULTIPLY", clamp=False))
    mx = g.node("ShaderNodeMixShader")
    mx.inputs[0].default_value = trans
    g.link(p, mx.inputs[1])
    g.link(tr.outputs[0], mx.inputs[2])
    return g.finish(mx.outputs[0])


def bark(name, dark, light, scale=18.0, stretch=(1.0, 1.0, 0.25), moss=0.0, moss_col=(0.10, 0.20, 0.02),
         rough=0.85, bump_amt=0.5, ao_amt=0.8, ring=0.0, ring_col=None, voronoi=True):
    """Fibrous bark / trunk. Uses t (height 0..1) and across (ring phase) from the attribute."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    g = G(name)
    t, across, r1, r2 = g.attr()
    tc = g.node("ShaderNodeTexCoord")
    mp = g.node("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = stretch
    g.link(tc.outputs["Object"], mp.inputs["Vector"])
    n1 = g.noise(scale, detail=6.0, rough=0.65, vec=mp.outputs[0])
    h = n1
    if voronoi:
        vo = g.node("ShaderNodeTexVoronoi", feature="DISTANCE_TO_EDGE")
        vo.inputs["Scale"].default_value = scale * 0.6
        g.link(mp.outputs[0], vo.inputs["Vector"])
        h = g.math("ADD", g.math("MULTIPLY", n1, 0.6), g.math("MULTIPLY", g.math("POWER", vo.outputs["Distance"], 0.5), 0.6))
    col = g.ramp(h, [(0.25, dark), (0.75, light)])
    if ring:
        rc = ring_col or dark
        col = g.mix(col, rc, g.math("MULTIPLY", g.math("POWER", across, 3.0), ring))
    if moss:
        geo = g.node("ShaderNodeNewGeometry")
        sep = g.node("ShaderNodeSeparateXYZ")
        g.link(geo.outputs["Normal"], sep.inputs[0])
        mn = g.noise(6.0, detail=4.0)
        f = g.math("ADD", g.math("MULTIPLY", sep.outputs[2], 0.6), g.math("MULTIPLY", g.math("SUBTRACT", mn, 0.5), 2.2))
        f = g.math("ADD", f, g.math("MULTIPLY", g.math("SUBTRACT", 0.12, t), 0.8))
        f = g.math("MULTIPLY", g.math("SUBTRACT", f, 1.0 - moss), 4.0, clamp=True)
        mcol = g.mix(moss_col, (0.30, 0.42, 0.05), g.noise(40.0, detail=2.0))
        col = g.mix(col, mcol, f)
    occ = g.ao(col, 0.25)
    shaded = g.mix(col, SHADE, 1.0, blend="MULTIPLY")
    col = g.mix(shaded, col, g.math("POWER", occ, 1.0 / ao_amt))
    p = principled(g, col, rough, 0.25, normal=bump(g, h, bump_amt, 0.03))
    return g.finish(p)


def petal(name, stops, trans=0.45, rough=0.45, glow=(1.4, 1.1, 0.9), spec=0.35, sheen=0.3, ao_amt=0.5):
    """Flowers / florets: ramp over t, translucent, per-floret value jitter."""
    return foliage(name, stops, trans=trans, rough=rough, vein=0.0, hue_jit=0.02, val_jit=0.3, sat_jit=0.15,
                   ao_amt=ao_amt, glow=glow, spec=spec, micro=0.05, sheen=sheen)


def flat(name, stops, rough=0.6, spec=0.3, bump_scale=0.0, ao_amt=0.6, spots=None, trans=0.0):
    """Solid ramp-over-t material (mushrooms, cattail heads, stones of plants)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    g = G(name)
    t, across, r1, r2 = g.attr()
    col = g.ramp(t, stops)
    hsv = g.node("ShaderNodeHueSaturation")
    g.set(hsv.inputs["Hue"], g.math("ADD", g.math("MULTIPLY", g.math("SUBTRACT", r1, 0.5), 0.04), 0.5))
    g.set(hsv.inputs["Value"], g.math("ADD", g.math("MULTIPLY", g.math("SUBTRACT", r1, 0.5), 0.3), 1.0))
    g.set(hsv.inputs["Color"], col)
    col = hsv.outputs[0]
    nz = g.noise(30.0, detail=4.0)
    col = g.mix(col, g.math("ADD", g.math("MULTIPLY", nz, 0.3), 0.85), 1.0, blend="MULTIPLY")
    if spots is not None:
        vo = g.node("ShaderNodeTexVoronoi", feature="F1")
        vo.inputs["Scale"].default_value = spots[1]
        tc = g.node("ShaderNodeTexCoord")
        g.link(tc.outputs["Object"], vo.inputs["Vector"])
        f = g.math("LESS_THAN", vo.outputs["Distance"], spots[2])
        f = g.math("MULTIPLY", f, g.math("MULTIPLY", across, t))  # only on caps (across=1)
        col = g.mix(col, spots[0], f)
    occ = g.ao(col, 0.2)
    shaded = g.mix(col, SHADE, 1.0, blend="MULTIPLY")
    col = g.mix(shaded, col, g.math("POWER", occ, 1.0 / ao_amt))
    normal = bump(g, nz, 0.25, 0.01) if bump_scale else None
    p = principled(g, col, rough, spec, normal=normal)
    if trans:
        tr = g.node("ShaderNodeBsdfTranslucent")
        g.set(tr.inputs["Color"], col)
        mx = g.node("ShaderNodeMixShader")
        mx.inputs[0].default_value = trans
        g.link(p, mx.inputs[1])
        g.link(tr.outputs[0], mx.inputs[2])
        p = mx.outputs[0]
    return g.finish(p)
