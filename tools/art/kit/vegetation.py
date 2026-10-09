"""Tiny Rex vegetation kit, wave 1: Fern Hollow + Riverbend plants.

Procedural, numpy-built plants: real pinnate fronds (drooping rachis, two rows of
tapering folded leaflets), tree-fern / cycad / palm crowns, paddle leaves, grass
and reeds, flower plumes.  Every variant re-rolls proportions and organ counts.
Helpers: veg_geom (arrays -> meshes), veg_mat (shaders), veg_parts (organs).
Tags per prop are documented in vegetation_notes.md.
"""
import math

import numpy as np

from . import Prop
from . import veg_mat as M
from .veg_geom import TAU, Bufs
from .veg_parts import fiddlehead, frond, trunk, stems, blades, florets, disc, leaflets, _attr
from .veg_geom import curves, nrm, sample, lathe, ribbon, tubes

GOLDEN = 2.399963


def lerp(a, b, f):
    return a + (b - a) * f


# =========================================================================== materials
def materials():
    """name -> factory. Linear-RGB ramps (base -> tip)."""
    F = M.foliage
    return {
        # sword fern: deep blue-green heart, warm yellow-green sunlit tips
        "fern": lambda: F("fern", [(0.0, (0.004, 0.018, 0.014)), (0.3, (0.012, 0.075, 0.022)),
                                   (0.7, (0.07, 0.26, 0.018)), (1.0, (0.34, 0.50, 0.03))],
                          age_col=(0.30, 0.22, 0.03), age_amt=0.12),
        # cooler, bluer fern for shade / variety
        "fern_cool": lambda: F("fern_cool", [(0.0, (0.006, 0.028, 0.022)), (0.4, (0.018, 0.085, 0.040)),
                                             (0.8, (0.06, 0.22, 0.05)), (1.0, (0.20, 0.40, 0.06))]),
        # lime lady-fern
        "fern_lime": lambda: F("fern_lime", [(0.0, (0.012, 0.045, 0.015)), (0.3, (0.05, 0.16, 0.025)),
                                             (0.7, (0.15, 0.36, 0.035)), (1.0, (0.38, 0.52, 0.06))], trans=0.38),
        "fern_stem": lambda: F("fern_stem", [(0.0, (0.035, 0.022, 0.008)), (0.25, (0.03, 0.06, 0.015)),
                                             (1.0, (0.10, 0.22, 0.03))], trans=0.1, vein=0.0, micro=0.0),
        "fern_dead": lambda: F("fern_dead", [(0.0, (0.06, 0.035, 0.012)), (0.6, (0.16, 0.085, 0.02)),
                                             (1.0, (0.28, 0.16, 0.04))], trans=0.2, vein=0.1,
                               vein_col=(0.3, 0.2, 0.08)),
        "treefern": lambda: F("treefern", [(0.0, (0.010, 0.035, 0.015)), (0.3, (0.03, 0.12, 0.03)),
                                           (0.7, (0.11, 0.30, 0.035)), (1.0, (0.38, 0.52, 0.05))], trans=0.42,
                              age_col=(0.34, 0.24, 0.04), age_amt=0.1),
        "treefern_bark": lambda: M.bark("treefern_bark", (0.025, 0.014, 0.007), (0.12, 0.06, 0.022), scale=22.0,
                                        stretch=(1.0, 1.0, 0.35), moss=0.35, moss_col=(0.05, 0.13, 0.015)),
    }


def finish(bufs, rng, name):
    mats = materials()
    return bufs.objects(mats, name)


# =========================================================================== ferns
FERN_STYLES = {
    # Sprite-scale ferns read through FEW, CHUNKY leaflets with dark gaps between them (the
    # mockups' painterly herringbone); botanically dense pinnae mush into a blur at 80 px/unit.
    # pairs, leaf_len (x L), leaf aspect (half width / len), angle base/tip, keel, fold, droop scale, lobes
    "sword": dict(pairs=17, ll=0.2, asp=0.15, a0=1.2, a1=0.62, keel=0.28, fold=0.4, droop=0.95, lobes=0,
                  curl=0.25, mat="fern", prof_a=0.30, prof_b=0.85),
    "lady": dict(pairs=15, ll=0.22, asp=0.15, a0=1.15, a1=0.6, keel=0.15, fold=0.3, droop=1.1, lobes=3,
                 curl=0.30, mat="fern_lime", prof_a=0.55, prof_b=0.9),
    "boston": dict(pairs=22, ll=0.13, asp=0.17, a0=1.3, a1=0.8, keel=0.2, fold=0.35, droop=1.25, lobes=0,
                   curl=0.2, mat="fern", prof_a=0.2, prof_b=0.7),
    "cool": dict(pairs=17, ll=0.2, asp=0.15, a0=1.15, a1=0.6, keel=0.12, fold=0.45, droop=1.05, lobes=2,
                 curl=0.25, mat="fern_cool", prof_a=0.35, prof_b=0.8),
}


def fern_plant(rng, bufs, *, L, n_fronds, style, origin=(0.0, 0.0, 0.0), spread=0.03, open_bias=0.0,
               fiddleheads=0, mat=None):
    st = FERN_STYLES[style]
    mat = mat or st["mat"]
    yaw0 = rng.uniform(0, TAU)
    opens = sorted(min(1.0, max(0.0, rng.random() * 1.1 + open_bias)) for _ in range(n_fronds))
    ox, oy, oz = origin
    for i, o in enumerate(opens):
        yaw = yaw0 + i * GOLDEN + rng.gauss(0, 0.25)
        Li = L * lerp(0.62, 1.0, o) * rng.uniform(0.88, 1.1)
        pitch = lerp(1.38, 0.62, o) + rng.gauss(0, 0.08)
        droop = (lerp(0.45, 1.3, o) + rng.gauss(0, 0.1)) * st["droop"]
        rad = spread * L * rng.uniform(0.3, 1.0)
        start = (ox + math.cos(yaw) * rad, oy + math.sin(yaw) * rad, oz + 0.015 * L)
        pairs = max(10, int(st["pairs"] * lerp(0.75, 1.0, o) * rng.uniform(0.9, 1.1)))
        ll = st["ll"] * L * rng.uniform(0.85, 1.15)
        frond(bufs, rng, start=start, L=Li, pitch=pitch, droop=droop, yaw=yaw, sweep=rng.gauss(0, 0.25),
              power=rng.uniform(1.7, 2.3),
              roll=rng.gauss(0, 0.15), roll_end=rng.gauss(0, 0.45), pairs=pairs, s0=rng.uniform(0.12, 0.2),
              leaf_len=ll, leaf_w=ll * st["asp"] * rng.uniform(0.9, 1.15), ang0=st["a0"], ang1=st["a1"],
              keel=st["keel"], fold=st["fold"], curl=st["curl"], stem_r=0.006 * L + 0.002, leaf_mat=mat,
              lobes=st["lobes"], prof_a=st["prof_a"], prof_b=st["prof_b"], r2=rng.random(),
              nu=7 if st["lobes"] else 5, twist=0.25)
    for j in range(fiddleheads):
        yaw = rng.uniform(0, TAU)
        fiddlehead(bufs, rng, start=(ox + math.cos(yaw) * 0.01, oy + math.sin(yaw) * 0.01, oz + 0.01),
                   L=L * rng.uniform(0.15, 0.22), yaw=yaw, r=0.004 * L + 0.002, pitch=rng.uniform(1.3, 1.5))


def _fern_builder(L_range, n_range, styles, fiddle=(0, 0), extra_clump=0.0):
    def build(rng):
        bufs = Bufs()
        style = styles[rng.randrange(len(styles))]
        L = rng.uniform(*L_range)
        n = rng.randint(*n_range)
        fern_plant(rng, bufs, L=L, n_fronds=n, style=style, fiddleheads=rng.randint(*fiddle))
        if rng.random() < extra_clump:  # a smaller offset crown makes the clump irregular
            a = rng.uniform(0, TAU)
            d = L * rng.uniform(0.25, 0.4)
            fern_plant(rng, bufs, L=L * rng.uniform(0.5, 0.7), n_fronds=max(4, n // 2),
                       style=styles[rng.randrange(len(styles))], origin=(math.cos(a) * d, math.sin(a) * d, 0.0))
        bufs.clamp_ground()
        return finish(bufs, rng, "fern")

    return build


# =========================================================================== tree fern
def build_tree_fern(rng):
    bufs = Bufs()
    H = rng.uniform(1.55, 2.15)
    C, Tt, St, Nt = trunk(bufs, "treefern_bark", rng, height=H, r0=rng.uniform(0.13, 0.16), r1=rng.uniform(0.10, 0.13),
                          lean=rng.uniform(0.02, 0.12), lean_yaw=rng.uniform(0, TAU), bend=rng.uniform(-0.08, 0.08),
                          flare=0.55, flare_h=0.25, scales=0.18, scale_freq=(9, 7), lumps=0.12, roots=rng.randint(3, 6))
    top = C[-1]
    # old frond bases (stubs) studding the upper trunk
    ns = rng.randint(14, 22)
    zs = np.sort(np.array([rng.uniform(0.35, 0.98) for _ in range(ns)]))
    P = []
    for z in zs:
        a = rng.uniform(0, TAU)
        i = int(z * (len(C) - 1))
        base = C[i] + np.array([math.cos(a), math.sin(a), 0]) * 0.11
        tip = base + np.array([math.cos(a) * 0.09, math.sin(a) * 0.09, rng.uniform(-0.02, 0.06)])
        P.append(np.linspace(base, tip, 4))
    stems(bufs, "treefern_bark", rng, np.array(P), 0.028, 0.008, sides=5, t0=0.7, t1=0.9)
    # dead skirt
    if rng.random() < 0.7:
        for _ in range(rng.randint(2, 5)):
            yaw = rng.uniform(0, TAU)
            frond(bufs, rng, start=top - np.array([0, 0, 0.08]), L=rng.uniform(0.8, 1.2), pitch=rng.uniform(-1.2, -0.7),
                  droop=0.25, yaw=yaw, pairs=22, leaf_len=0.13, leaf_w=0.016, ang0=0.9, ang1=0.4, keel=-0.3,
                  fold=0.5, curl=0.5, grav=0.4, stem_r=0.008, leaf_mat="fern_dead", stem_mat="fern_dead", lobes=3,
                  nu=6, s0=0.1)
    # living crown
    n = rng.randint(14, 19)
    Lc = rng.uniform(1.5, 1.85)
    yaw0 = rng.uniform(0, TAU)
    opens = sorted(rng.random() for _ in range(n))
    for i, o in enumerate(opens):
        yaw = yaw0 + i * GOLDEN + rng.gauss(0, 0.2)
        frond(bufs, rng, start=top + np.array([math.cos(yaw) * 0.05, math.sin(yaw) * 0.05, 0.0]),
              L=Lc * lerp(0.7, 1.05, o), pitch=lerp(1.15, 0.4, o) + rng.gauss(0, 0.08),
              droop=lerp(0.75, 1.55, o) + rng.gauss(0, 0.1), power=2.0, yaw=yaw, sweep=rng.gauss(0, 0.15),
              roll=rng.gauss(0, 0.1), roll_end=rng.gauss(0, 0.35), pairs=rng.randint(32, 40), s0=0.1,
              leaf_len=Lc * rng.uniform(0.13, 0.16), leaf_w=Lc * 0.017, ang0=1.35, ang1=0.75, keel=0.05, fold=0.3,
              curl=0.3, grav=0.2, stem_r=0.014, leaf_mat="treefern", stem_mat="fern_stem", lobes=4, lobe_depth=0.4,
              nu=7, prof_a=0.25, prof_b=0.9, r2=rng.random(), twist=0.2)
    for _ in range(rng.randint(2, 4)):
        yaw = rng.uniform(0, TAU)
        fiddlehead(bufs, rng, start=top + np.array([math.cos(yaw) * 0.03, math.sin(yaw) * 0.03, 0.0]),
                   L=rng.uniform(0.25, 0.4), yaw=yaw, r=0.02, pitch=rng.uniform(1.25, 1.5))
    bufs.clamp_ground()
    return finish(bufs, rng, "tree_fern")


# =========================================================================== registry
PROPS = {
    "fern_small": Prop(build=_fern_builder((0.5, 0.65), (11, 16), ("sword", "lady", "boston", "cool")), variants=4,
                       r=0.0, h=0.5, kind="soft", frame=(200, 150), anchor=(0.5, 0.62), bake=True,
                       tags=("fern_hollow", "riverbend", "jungle")),
    "fern_medium": Prop(build=_fern_builder((0.9, 1.1), (16, 23), ("sword", "lady", "cool", "boston")),
                        variants=4, r=0.2, h=0.9, kind="soft", frame=(300, 230), anchor=(0.5, 0.64),
                        tags=("fern_hollow", "riverbend", "jungle")),
    "fern_large": Prop(build=_fern_builder((1.5, 1.8), (22, 30), ("sword", "lady", "cool"), (1, 3), 0.5),
                       variants=4, r=0.3, h=1.5, kind="soft", frame=(460, 340), anchor=(0.5, 0.66),
                       tags=("fern_hollow", "riverbend", "jungle")),
    "tree_fern": Prop(build=build_tree_fern, variants=3, r=0.25, h=3.0, kind="solid", frame=(420, 420),
                      anchor=(0.5, 0.8), tags=("fern_hollow", "jungle")),
}
