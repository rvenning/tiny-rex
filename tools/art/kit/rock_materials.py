"""Procedural Cycles materials for the rocks/logs/structures kit.

All shaders read the point attributes written by rock_util (cav, tint, bk) and
use world normal Z for moss, AO for crevices, object Z for wet bases, and a
sun-facing warm / shade-facing cool tint so sprites match the golden-hour mockups.
"""
import bpy

from common import sun_vector

_count = [0]


def _name(base):
    _count[0] += 1
    return f"{base}_{_count[0]}"


def _c4(c):
    return (c[0], c[1], c[2], 1.0) if len(c) == 3 else tuple(c)


class G:
    def __init__(self, name):
        self.m = bpy.data.materials.new(_name(name))
        self.m.use_nodes = True
        self.nt = self.m.node_tree
        self.nt.nodes.clear()
        self.output = self.n("ShaderNodeOutputMaterial")
        tc = self.n("ShaderNodeTexCoord")
        geo = self.n("ShaderNodeNewGeometry")
        self.P = tc.outputs["Object"]
        self.N = geo.outputs["Normal"]
        self.pointy = geo.outputs["Pointiness"]
        sp = self.sep(self.P)
        self.Px, self.Py, self.Pz = sp
        sn = self.sep(self.N)
        self.Nz = sn[2]

    def n(self, t, **kw):
        node = self.nt.nodes.new(t)
        for k, v in kw.items():
            setattr(node, k, v)
        return node

    def set(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.nt.links.new(v, sock)
        elif isinstance(v, (tuple, list)):
            dv = sock.default_value
            if len(dv) == 4:
                sock.default_value = _c4(v)
            else:
                sock.default_value = tuple(v[:3])
        else:
            dv = sock.default_value
            if hasattr(dv, "__len__"):
                sock.default_value = (v, v, v, 1.0) if len(dv) == 4 else (v, v, v)
            else:
                sock.default_value = v

    def add_vec(self, a, b):
        n = self.n("ShaderNodeVectorMath", operation="ADD")
        self.set(n.inputs[0], a)
        self.set(n.inputs[1], b)
        return n.outputs[0]

    def mul_vec(self, a, s):
        n = self.n("ShaderNodeVectorMath", operation="SCALE")
        self.set(n.inputs[0], a)
        self.set(n.inputs["Scale"], s)
        return n.outputs[0]

    def combine(self, x, y, z):
        c = self.n("ShaderNodeCombineXYZ")
        for i, v in enumerate((x, y, z)):
            self.set(c.inputs[i], v)
        return c.outputs[0]

    def sep(self, v):
        s = self.n("ShaderNodeSeparateXYZ")
        self.set(s.inputs[0], v)
        return s.outputs[0], s.outputs[1], s.outputs[2]

    def math(self, op, a, b=0.0, clamp=False):
        n = self.n("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.set(n.inputs[0], a)
        self.set(n.inputs[1], b)
        return n.outputs[0]

    def add(self, a, b):
        return self.math("ADD", a, b)

    def mul(self, a, b, clamp=False):
        return self.math("MULTIPLY", a, b, clamp)

    def mr(self, v, a, b, c=0.0, d=1.0, interp="SMOOTHSTEP", clamp=True):
        n = self.n("ShaderNodeMapRange", interpolation_type=interp, clamp=clamp)
        for i, x in enumerate((v, a, b, c, d)):
            self.set(n.inputs[i], x)
        return n.outputs[0]

    def mix(self, fac, a, b, blend="MIX"):
        n = self.n("ShaderNodeMix", data_type="RGBA", blend_type=blend, clamp_factor=True)
        self.set(n.inputs[0], fac)
        self.set(n.inputs[6], a)
        self.set(n.inputs[7], b)
        return n.outputs[2]

    def cmul(self, a, b):
        return self.mix(1.0, a, b, "MULTIPLY")

    def noise(self, vec, scale, detail=3.0, rough=0.5, dist=0.0, typ="FBM", lac=2.0, color=False):
        n = self.n("ShaderNodeTexNoise")
        n.noise_dimensions = "3D"
        try:
            n.noise_type = typ
        except Exception:
            pass
        self.set(n.inputs["Vector"], vec)
        self.set(n.inputs["Scale"], scale)
        self.set(n.inputs["Detail"], detail)
        self.set(n.inputs["Roughness"], rough)
        self.set(n.inputs["Lacunarity"], lac)
        self.set(n.inputs["Distortion"], dist)
        return n.outputs["Color" if color else "Fac"]

    def vor(self, vec, scale, feature="F1", rand=1.0):
        n = self.n("ShaderNodeTexVoronoi")
        n.voronoi_dimensions = "3D"
        n.feature = feature
        self.set(n.inputs["Vector"], vec)
        self.set(n.inputs["Scale"], scale)
        self.set(n.inputs["Randomness"], rand)
        return n

    def mapv(self, vec, scale=(1, 1, 1), loc=(0, 0, 0)):
        n = self.n("ShaderNodeMapping")
        self.set(n.inputs["Vector"], vec)
        self.set(n.inputs["Scale"], scale)
        self.set(n.inputs["Location"], loc)
        return n.outputs[0]

    def attr(self, name, vec=False):
        n = self.n("ShaderNodeAttribute")
        n.attribute_type = "GEOMETRY"
        n.attribute_name = name
        return n.outputs["Vector" if vec else "Fac"]

    def ramp(self, fac, stops, interp="LINEAR"):
        n = self.n("ShaderNodeValToRGB")
        cr = n.color_ramp
        cr.interpolation = interp
        while len(cr.elements) < len(stops):
            cr.elements.new(0.5)
        for e, (pos, col) in zip(cr.elements, stops):
            e.position = pos
            e.color = _c4(col)
        self.set(n.inputs[0], fac)
        return n.outputs["Color"]

    def ao(self, dist=0.4, local=True):
        n = self.n("ShaderNodeAmbientOcclusion")
        n.only_local = local
        n.samples = 8
        self.set(n.inputs["Distance"], dist)
        return n.outputs["AO"]

    def bw(self, col):
        n = self.n("ShaderNodeRGBToBW")
        self.set(n.inputs[0], col)
        return n.outputs[0]

    def sunlit(self):
        """0 facing away from the sun .. 1 facing it."""
        v = sun_vector()
        n = self.n("ShaderNodeVectorMath", operation="DOT_PRODUCT")
        self.set(n.inputs[0], self.N)
        n.inputs[1].default_value = (v.x, v.y, v.z)
        return self.mr(n.outputs["Value"], -0.3, 0.9)

    def warmcool(self, col, amt=1.0):
        t = self.sunlit()
        warm = (1.0 + 0.10 * amt, 1.0 + 0.02 * amt, 1.0 - 0.10 * amt)
        cool = (1.0 - 0.10 * amt, 1.0 - 0.02 * amt, 1.0 + 0.12 * amt)
        return self.cmul(col, self.mix(t, cool, warm))

    def bump(self, height, strength=0.35, dist=0.03, normal=None):
        n = self.n("ShaderNodeBump")
        self.set(n.inputs["Strength"], strength)
        self.set(n.inputs["Distance"], dist)
        self.set(n.inputs["Height"], height)
        if normal is not None:
            self.set(n.inputs["Normal"], normal)
        return n.outputs[0]

    def principled(self, base, rough=0.85, normal=None, spec=0.35, sheen=0.0, sss=0.0, alpha=None):
        b = self.n("ShaderNodeBsdfPrincipled")
        self.set(b.inputs["Base Color"], base)
        self.set(b.inputs["Roughness"], rough)
        self.set(b.inputs["Specular IOR Level"], spec)
        if normal is not None:
            self.set(b.inputs["Normal"], normal)
        if sheen:
            b.inputs["Sheen Weight"].default_value = sheen
            b.inputs["Sheen Tint"].default_value = (0.8, 0.95, 0.6, 1)
        if sss:
            b.inputs["Subsurface Weight"].default_value = sss
            b.inputs["Subsurface Radius"].default_value = (0.3, 0.2, 0.1)
            b.inputs["Subsurface Scale"].default_value = 0.02
        if alpha is not None:
            self.set(b.inputs["Alpha"], alpha)
        return b.outputs[0]

    def out(self, shader):
        self.set(self.output.inputs["Surface"], shader)
        return self.m

    # ---- shared layers
    def moss_layer(self, base, amount, light=(0.25, 0.32, 0.055), dark=(0.05, 0.12, 0.035), scale=2.2, crevice=None,
                   extra_mask=None):
        """Moss on up-facing surfaces; returns (colour, mask, fuzz)."""
        # irregular patches: two noise octaves with a ragged threshold, biased to up-facing surfaces
        mn = self.noise(self.P, scale * 1.6, 6.0, 0.7, dist=0.3)
        mn2 = self.noise(self.P, scale * 5.0, 3.0, 0.6)
        val = self.add(self.mul(self.Nz, 0.9), self.mul(self.add(mn, -0.5), 1.6))
        val = self.add(val, self.mul(self.add(mn2, -0.5), 0.5))
        lo = 1.05 - amount * 0.8
        mm = self.mr(val, lo, lo + 0.08)
        if crevice is not None:
            # moss creeping out of cracks on faces that are not overhanging
            cm = self.mul(self.mr(crevice, 0.45, 0.15), self.mr(self.Nz, -0.15, 0.35))
            cm = self.mul(cm, self.mr(mn2, 0.35, 0.55))
            mm = self.math("MAXIMUM", mm, self.mul(cm, min(1.0, amount * 1.6)))
        if extra_mask is not None:
            mm = self.math("MAXIMUM", mm, extra_mask)
        fuzz = self.noise(self.P, 34.0, 4.0, 0.7)
        tone = self.noise(self.P, 6.0, 3.0, 0.5)
        mcol = self.mix(self.mr(self.add(tone, self.mul(fuzz, 0.35)), 0.35, 0.85), dark, light)
        mcol = self.mix(self.mr(self.Nz, 0.2, 0.9), self.cmul(mcol, (0.75, 0.9, 0.85)), mcol)
        return self.mix(mm, base, mcol), mm, fuzz

    def lichen_layer(self, base, amount, scale=15.0, cols=((0.50, 0.52, 0.40), (0.52, 0.42, 0.22))):
        v = self.vor(self.P, scale, "F1")
        spot = self.mr(v.outputs["Distance"], 0.34, 0.16)
        mask = self.mr(self.noise(self.P, 1.5, 2.0), 0.62 - amount * 0.25, 0.70 - amount * 0.25)
        l = self.mul(self.mul(spot, mask), 0.75)
        lc = self.mix(self.mr(self.noise(self.P, 0.9, 1.0), 0.45, 0.6), cols[0], cols[1])
        return self.mix(l, base, lc), l


# --------------------------------------------------------------------------- rock
ROCK_PALETTES = {
    # dark crevice tone is derived; (dark, mid, light) albedo
    "fern": ((0.12, 0.11, 0.095), (0.25, 0.235, 0.205), (0.42, 0.39, 0.33)),
    "warm": ((0.14, 0.11, 0.08), (0.28, 0.23, 0.17), (0.45, 0.39, 0.30)),
    "cool": ((0.11, 0.115, 0.115), (0.23, 0.235, 0.225), (0.39, 0.39, 0.36)),
    "river": ((0.12, 0.105, 0.085), (0.24, 0.21, 0.17), (0.39, 0.35, 0.28)),
    "basalt": ((0.075, 0.075, 0.08), (0.14, 0.135, 0.14), (0.24, 0.225, 0.21)),
    "lava": ((0.05, 0.045, 0.045), (0.10, 0.09, 0.085), (0.18, 0.15, 0.13)),
}


def rock_mat(pal="fern", moss=0.5, lichen=0.4, wet_z=0.08, wet=0.55, algae=False, feat=1.0, crack_dark=0.55,
             streaks=0.3, strata=0.0, strata_f=4.0, name="rock"):
    g = G(name)
    p = ROCK_PALETTES[pal] if isinstance(pal, str) else pal
    P = g.mapv(g.P, (feat, feat, feat))
    g.P = P
    cav = g.attr("cav")
    ao = g.ao(0.35)
    large = g.noise(P, 0.75, 4.0, 0.55)
    base = g.ramp(large, [(0.28, p[0]), (0.5, p[1]), (0.74, p[2])])
    # per-facet tone (voronoi cells read as planar facets in the painting)
    facet = g.bw(g.vor(P, 2.4, "F1").outputs["Color"])
    base = g.cmul(base, g.mr(facet, 0.0, 1.0, 0.84, 1.12, "LINEAR"))
    mott = g.noise(P, 5.0, 5.0, 0.6)
    base = g.cmul(base, g.mr(mott, 0.3, 0.7, 0.8, 1.15))
    # iron / tannin stains: big soft warm-brown patches
    stain = g.mr(g.noise(P, 1.3, 3.0, 0.6, dist=0.4), 0.52, 0.68, 0.0, 0.55)
    base = g.mix(stain, base, g.cmul(base, (1.25, 0.95, 0.65)))
    # pits / pores: tiny dark dots break up the smooth CG look
    pit = g.vor(P, 34.0, "F1")
    pm = g.mul(g.mr(pit.outputs["Distance"], 0.22, 0.08), g.mr(g.bw(pit.outputs["Color"]), 0.4, 0.6))
    base = g.mix(g.mul(pm, 0.7), base, g.cmul(base, (0.35, 0.33, 0.32)))
    # vertical rain streaks on steep sides
    st = g.noise(g.mapv(P, (5.0, 5.0, 0.5)), 2.0, 3.0, 0.5)
    stm = g.mul(g.mr(st, 0.55, 0.75), g.mr(g.Nz, 0.6, 0.2))
    base = g.mix(g.mul(stm, streaks), base, g.cmul(base, (0.62, 0.62, 0.66)))
    # edge highlight (worn rims catch the sun)
    edge = g.mr(g.pointy, 0.50, 0.58)
    base = g.mix(g.mul(edge, 0.35), base, g.cmul(base, (1.35, 1.3, 1.2)))
    # sedimentary banding: soft, wobbly, low-contrast horizontal layers
    if strata > 0:
        sz = g.add(g.Pz, g.mul(g.noise(P, 1.2, 2.0), 0.25))
        bands = g.noise(g.mapv(g.combine(0.0, 0.0, sz), (1, 1, strata_f)), 1.0, 2.0, 0.5)
        base = g.cmul(base, g.mr(bands, 0.3, 0.7, 1.0 - strata * 0.25, 1.0 + strata * 0.15))
    # crevices / cracks: cool and shaded, but soft (cracks are an accent, not a grid)
    crev = g.mr(cav, 0.1, 0.6)
    aof = g.mr(ao, 0.1, 0.95)
    occ = g.mul(g.add(g.mul(crev, crack_dark), 1.0 - crack_dark), aof)
    base = g.mix(occ, g.cmul(base, (0.34, 0.35, 0.40)), base)
    # lichen + moss (moss creeps out of the crevices and sits in ragged patches on top faces)
    base, _ = g.lichen_layer(base, lichen)
    base, mm, fuzz = g.moss_layer(base, moss, crevice=cav)
    base = g.mix(g.mul(g.mr(ao, 0.2, 0.9, 1.0, 0.0), mm), base, g.cmul(base, (0.5, 0.55, 0.5)))
    # wet base: darker, glossier, optional green algae line
    wm = g.mr(g.Pz, wet_z + 0.12, wet_z, 0.0, wet)
    base = g.mix(wm, base, g.cmul(base, (0.42, 0.45, 0.48)))
    if algae:
        band = g.mul(g.mr(g.Pz, wet_z - 0.06, wet_z), g.mr(g.Pz, wet_z + 0.14, wet_z + 0.04))
        band = g.mul(band, g.mr(g.noise(P, 4.0), 0.35, 0.6))
        base = g.mix(band, base, (0.16, 0.24, 0.06))
    base = g.warmcool(base, 1.0)
    rough = g.mr(wm, 0.0, 1.0, 0.82, 0.32, "LINEAR")
    rough = g.mix(mm, rough, 0.95)
    h = g.add(g.mul(cav, 1.0), g.mul(g.noise(P, 26.0, 3.0, 0.6), 0.25))
    h = g.add(h, g.mul(g.mul(fuzz, mm), 0.6))
    h = g.add(h, g.mul(pm, -0.35))
    nb = g.bump(h, 0.45, 0.025)
    return g.out(g.principled(base, g.bw(rough), nb, spec=0.3, sheen=0.0))


# --------------------------------------------------------------------------- wood
def bark_mat(pal=None, moss=0.5, lichen=0.35, grey=0.25, name="bark", around=8.0):
    g = G(name)
    p = pal or ((0.022, 0.015, 0.01), (0.085, 0.052, 0.032), (0.19, 0.12, 0.068), (0.30, 0.24, 0.17))
    cavg = g.attr("cav")
    bk = g.attr("bk", vec=True)
    ao = g.ao(0.3)
    # shader-side blocky plate bark in seamless bark space: voronoi plates elongated along the trunk,
    # separated by deep dark fissures, each plate with its own tone and rough surface
    q = g.mapv(bk, (around, around, around * 0.24))
    warp = g.noise(q, 0.7, 2.0, 0.5, color=True)
    qw = g.add_vec(q, g.mul_vec(warp, 0.9))
    vp = g.vor(qw, 1.0, "F1", 0.9)
    ve = g.vor(qw, 1.0, "DISTANCE_TO_EDGE", 0.9).outputs["Distance"]
    edge_n = g.noise(g.mapv(q, (3, 3, 3)), 1.0, 2.0)
    crack = g.mr(g.add(ve, g.mul(g.add(edge_n, -0.5), 0.12)), 0.02, 0.2)
    ptone = g.bw(vp.outputs["Color"])
    rough_n = g.noise(g.mapv(q, (4.0, 4.0, 4.0)), 1.0, 4.0, 0.7)
    plate = g.mul(crack, g.mr(rough_n, 0.2, 0.8, 0.75, 1.0))
    cav = g.math("MINIMUM", g.add(g.mul(cavg, 0.35), g.mul(plate, 0.75)), 1.0)
    base = g.ramp(cav, [(0.08, p[0]), (0.4, p[1]), (0.75, p[2]), (1.0, p[3])])
    base = g.cmul(base, g.mr(ptone, 0.0, 1.0, 0.72, 1.18, "LINEAR"))
    base = g.mix(g.mul(g.mr(ptone, 0.6, 0.9), 0.5), base, g.cmul(base, (1.15, 0.92, 0.75)))
    # long fibres along the trunk
    fib = g.noise(g.mapv(bk, (14.0, 14.0, 1.2)), 3.0, 4.0, 0.6)
    base = g.cmul(base, g.mr(fib, 0.3, 0.7, 0.78, 1.15))
    big = g.noise(g.P, 0.8, 3.0, 0.5)
    base = g.cmul(base, g.mr(big, 0.3, 0.7, 0.82, 1.12))
    # sun-bleached silver-grey on exposed upper ridges
    gm = g.mul(g.mul(g.mr(g.Nz, 0.1, 0.8), g.mr(cav, 0.55, 0.9)), grey)
    base = g.mix(gm, base, g.cmul(g.mix(0.5, base, (0.55, 0.52, 0.46)), (1.05, 1.03, 1.0)))
    base, _ = g.lichen_layer(base, lichen, 11.0, ((0.40, 0.46, 0.30), (0.50, 0.48, 0.36)))
    base, mm, fuzz = g.moss_layer(base, moss, scale=1.8)
    occ =g.mul(g.mr(ao, 0.1, 0.95), g.mr(cav, 0.05, 0.4, 0.45, 1.0))
    base = g.mix(occ, g.cmul(base, (0.12, 0.12, 0.14)), base)
    base = g.warmcool(base, 1.0)
    h = g.add(cav, g.mul(fib, 0.25))
    h = g.add(h, g.mul(g.mul(fuzz, mm), 0.5))
    return g.out(g.principled(base, 0.88, g.bump(h, 0.9, 0.04), spec=0.25))


def wood_inner_mat(name="wood_in", fresh=False):
    """Rotten dark interior of a hollow log (or fresh splintered wood when fresh=True)."""
    g = G(name)
    bk = g.attr("bk", vec=True)
    ao = g.ao(0.6)
    fib = g.noise(g.mapv(bk, (10.0, 10.0, 0.8)), 3.0, 5.0, 0.65)
    if fresh:
        base = g.ramp(fib, [(0.3, (0.30, 0.18, 0.09)), (0.7, (0.56, 0.40, 0.22))])
    else:
        base = g.ramp(fib, [(0.3, (0.05, 0.03, 0.018)), (0.7, (0.16, 0.095, 0.05))])
    base = g.mix(g.mr(ao, 0.1, 0.9), g.cmul(base, (0.25, 0.22, 0.22)), base)
    base = g.warmcool(base, 0.8)
    return g.out(g.principled(base, 0.92, g.bump(fib, 0.6, 0.02), spec=0.2))


def endgrain_mat(name="endgrain"):
    """Cut log end: growth rings + radial checks; bk.xy = normalised disc coords."""
    g = G(name)
    bk = g.attr("bk", vec=True)
    x, y, _ = g.sep(bk)
    r = g.math("SQRT", g.add(g.mul(x, x), g.mul(y, y)))
    wob = g.noise(bk, 3.0, 2.0)
    rr = g.add(r, g.mul(wob, 0.06))
    rings = g.math("SINE", g.mul(rr, 70.0))
    base = g.ramp(g.mr(rings, -1, 1), [(0.0, (0.36, 0.22, 0.11)), (0.6, (0.58, 0.42, 0.24)), (1.0, (0.62, 0.47, 0.28))])
    base = g.mix(g.mr(r, 0.82, 0.96), base, (0.18, 0.11, 0.06))
    cracks = g.vor(g.mapv(bk, (1, 1, 1)), 6.0, "DISTANCE_TO_EDGE").outputs["Distance"]
    base = g.mix(g.mul(g.mr(cracks, 0.03, 0.0), g.mr(r, 0.2, 0.5)), base, (0.08, 0.05, 0.03))
    grey = g.noise(g.P, 2.0, 3.0)
    base = g.mix(g.mr(grey, 0.4, 0.7, 0.0, 0.45), base, (0.42, 0.40, 0.35))
    base = g.warmcool(base, 0.8)
    return g.out(g.principled(base, 0.9, g.bump(rings, 0.15, 0.01), spec=0.2))


# --------------------------------------------------------------------------- greenery
def leaf_mat(name="leaf", light=(0.36, 0.52, 0.08), dark=(0.08, 0.26, 0.07), trans=0.35):
    g = G(name)
    t = g.attr("tint")
    col = g.mix(t, dark, light)
    col = g.cmul(col, g.mr(g.noise(g.P, 8.0), 0.3, 0.7, 0.85, 1.12))
    col = g.warmcool(col, 1.2)
    pr = g.principled(col, 0.6, spec=0.4)
    tr = g.n("ShaderNodeBsdfTranslucent")
    g.set(tr.inputs["Color"], g.cmul(col, (1.3, 1.4, 0.6)))
    mx = g.n("ShaderNodeMixShader")
    mx.inputs[0].default_value = trans
    g.set(mx.inputs[1], pr)
    g.set(mx.inputs[2], tr.outputs[0])
    return g.out(mx.outputs[0])


def moss_mat(name="moss", light=(0.25, 0.33, 0.055), dark=(0.05, 0.12, 0.03)):
    g = G(name)
    cav = g.attr("cav")
    ao = g.ao(0.2)
    fuzz = g.noise(g.P, 40.0, 4.0, 0.7)
    tone = g.noise(g.P, 7.0, 3.0)
    col = g.mix(g.mr(g.add(tone, g.mul(fuzz, 0.4)), 0.4, 0.95), dark, light)
    col = g.mix(g.mr(g.Nz, -0.2, 0.8), g.cmul(col, (0.55, 0.75, 0.75)), col)
    col = g.mix(g.mr(ao, 0.2, 0.9), g.cmul(col, (0.3, 0.38, 0.4)), col)
    col = g.cmul(col, g.mr(cav, 0.2, 0.9, 0.7, 1.05))
    col = g.warmcool(col, 1.0)
    return g.out(g.principled(col, 0.95, g.bump(fuzz, 0.9, 0.02), spec=0.2, sheen=0.5))


def soil_mat(name="soil", col=(0.36, 0.22, 0.11), fade=True, radius=1.0):
    """Dirt mound that fades out (alpha) at its rim so it melts into any ground tile."""
    g = G(name)
    n1 = g.noise(g.P, 3.0, 4.0, 0.6)
    peb = g.vor(g.P, 22.0, "F1")
    pm = g.mr(peb.outputs["Distance"], 0.25, 0.12)
    base = g.cmul(col, g.mr(n1, 0.3, 0.7, 0.75, 1.2))
    base = g.mix(g.mul(pm, 0.6), base, g.cmul(g.mix(0.5, (0.55, 0.48, 0.40), base), (1.1, 1.05, 1.0)))
    ao = g.ao(0.3)
    base = g.mix(g.mr(ao, 0.1, 0.9), g.cmul(base, (0.35, 0.3, 0.3)), base)
    base = g.warmcool(base, 1.0)
    alpha = None
    if fade:
        rx = g.mul(g.Px, 1.0 / radius)
        ry = g.mul(g.Py, 1.0 / radius)
        r = g.math("SQRT", g.add(g.mul(rx, rx), g.mul(ry, ry)))
        alpha = g.mr(g.add(r, g.mul(n1, 0.25)), 1.0, 0.72)
    sh = g.principled(base, 0.95, g.bump(g.add(n1, pm), 0.4, 0.02), spec=0.2, alpha=alpha)
    g.m.blend_method = "BLEND" if fade else "OPAQUE"
    return g.out(sh)


def fungus_mat(name="fungus"):
    g = G(name)
    cav = g.attr("cav")
    t = g.attr("tint")
    bands = g.math("SINE", g.mul(cav, 26.0))
    top = g.mix(t, (0.62, 0.36, 0.12), (0.72, 0.52, 0.24))
    col = g.mix(g.mr(bands, -1, 1, 0.0, 0.35), top, g.cmul(top, (0.6, 0.5, 0.45)))
    col = g.mix(g.mr(cav, 0.85, 0.97), col, (0.86, 0.78, 0.6))
    col = g.mix(g.mr(g.Nz, 0.0, -0.4), col, (0.80, 0.72, 0.56))
    col = g.warmcool(col, 1.0)
    return g.out(g.principled(col, 0.7, spec=0.35, sss=0.1))


# --------------------------------------------------------------------------- nest / eggs / bone
def twig_mat(name="twig"):
    g = G(name)
    t = g.attr("tint")
    bk = g.attr("bk", vec=True)
    ao = g.ao(0.25, local=True)
    col = g.ramp(t, [(0.0, (0.13, 0.08, 0.045)), (0.45, (0.33, 0.22, 0.11)), (0.8, (0.52, 0.38, 0.20)), (1.0, (0.62, 0.50, 0.30))])
    fib = g.noise(g.mapv(bk, (30, 30, 3)), 4.0, 3.0)
    col = g.cmul(col, g.mr(fib, 0.3, 0.7, 0.8, 1.15))
    col = g.mix(g.mr(ao, 0.05, 0.85), g.cmul(col, (0.15, 0.12, 0.1)), col)
    col = g.warmcool(col, 1.2)
    return g.out(g.principled(col, 0.75, g.bump(fib, 0.3, 0.01), spec=0.3))


EGG_COLOURS = [
    ((0.80, 0.72, 0.58), (0.36, 0.20, 0.10)),  # cream, brown speckle
    ((0.62, 0.74, 0.68), (0.20, 0.24, 0.16)),  # pale sea-green, olive speckle
    ((0.78, 0.58, 0.44), (0.40, 0.14, 0.08)),  # warm sand-rose, maroon speckle
]


def egg_mat(k=0, name="egg"):
    shell, spot = EGG_COLOURS[k % len(EGG_COLOURS)]
    g = G(name)
    t = g.attr("tint")
    P = g.mapv(g.P, (1, 1, 1), (0, 0, 0))
    Pj = g.add(t, 0)  # per-egg offset
    v1 = g.vor(g.mapv(P, (1, 1, 1)), 9.0, "F1")
    s1 = g.mr(g.add(v1.outputs["Distance"], g.mul(g.noise(P, 18.0, 2.0), 0.25)), 0.32, 0.22)
    s1 = g.mul(s1, g.mr(g.bw(v1.outputs["Color"]), 0.45, 0.55))
    v2 = g.vor(P, 26.0, "F1")
    s2 = g.mul(g.mr(v2.outputs["Distance"], 0.28, 0.16), g.mr(g.bw(v2.outputs["Color"]), 0.5, 0.6))
    mott = g.noise(P, 4.0, 3.0)
    col = g.cmul(shell, g.mr(mott, 0.3, 0.7, 0.88, 1.06))
    col = g.mix(g.math("MAXIMUM", s1, g.mul(s2, 0.8)), col, spot)
    col = g.mix(g.mr(g.Pz, 0.04, 0.0, 0.0, 0.5), col, g.cmul(col, (0.5, 0.45, 0.4)))
    col = g.warmcool(col, 0.8)
    _ = Pj
    return g.out(g.principled(col, 0.42, spec=0.45, sss=0.05))


def bone_mat(name="bone"):
    g = G(name)
    cav = g.attr("cav")
    ao = g.ao(0.3)
    n1 = g.noise(g.P, 4.0, 4.0)
    col = g.ramp(n1, [(0.3, (0.58, 0.50, 0.38)), (0.7, (0.78, 0.71, 0.56))])
    pores = g.vor(g.P, 40.0, "F1").outputs["Distance"]
    col = g.cmul(col, g.mr(pores, 0.05, 0.25, 0.75, 1.0))
    col = g.mix(g.mr(cav, 0.45, 0.1), col, (0.20, 0.13, 0.07))
    col = g.mix(g.mr(g.Pz, 0.15, 0.0), col, g.cmul(col, (0.55, 0.42, 0.3)))
    col = g.mix(g.mr(ao, 0.1, 0.9), g.cmul(col, (0.2, 0.17, 0.15)), col)
    base, _ = g.lichen_layer(col, 0.3, 20.0, ((0.50, 0.56, 0.36), (0.66, 0.52, 0.22)))
    base, mm, _ = g.moss_layer(base, 0.25)
    base = g.warmcool(base, 1.0)
    return g.out(g.principled(base, 0.7, g.bump(g.add(cav, g.mul(n1, 0.2)), 0.4, 0.02), spec=0.3))


def straw_mat(name="straw"):
    """Soft grassy lining inside nests."""
    g = G(name)
    n1 = g.noise(g.mapv(g.P, (40, 6, 40)), 2.0, 3.0)
    n2 = g.noise(g.mapv(g.P, (6, 40, 40)), 2.0, 3.0)
    f = g.math("MAXIMUM", n1, n2)
    col = g.ramp(f, [(0.35, (0.16, 0.10, 0.05)), (0.7, (0.42, 0.30, 0.14))])
    ao = g.ao(0.4)
    col = g.mix(g.mr(ao, 0.05, 0.9), g.cmul(col, (0.2, 0.17, 0.14)), col)
    return g.out(g.principled(col, 0.9, g.bump(f, 0.6, 0.02), spec=0.2))
