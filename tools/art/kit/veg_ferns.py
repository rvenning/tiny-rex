"""Vegetation kit: frond-crowned plants - ferns, tree fern, cycad, palms, foreground fronds."""
import math

import numpy as np

from .veg_geom import TAU, Bufs
from .veg_palette import GOLDEN, finish, lerp, pick
from .veg_parts import ellipsoid, fiddlehead, frond, paddle, stems, trunk

# Sprite-scale ferns read through FEW, CHUNKY leaflets with dark gaps between them (the
# mockups' painterly herringbone); botanically dense pinnae mush into a blur at 80 px/unit.
FERN_STYLES = {
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
    """A rosette of arching fronds: young inner fronds upright, old outer ones arching low."""
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
              power=rng.uniform(1.7, 2.3), roll=rng.gauss(0, 0.15), roll_end=rng.gauss(0, 0.45), pairs=pairs,
              s0=rng.uniform(0.12, 0.2), leaf_len=ll, leaf_w=ll * st["asp"] * rng.uniform(0.9, 1.15),
              ang0=st["a0"], ang1=st["a1"], keel=st["keel"], fold=st["fold"], curl=st["curl"],
              stem_r=0.006 * L + 0.002, leaf_mat=mat, lobes=st["lobes"], prof_a=st["prof_a"], prof_b=st["prof_b"],
              r2=rng.random(), nu=7 if st["lobes"] else 5, twist=0.25)
    for _ in range(fiddleheads):
        yaw = rng.uniform(0, TAU)
        fiddlehead(bufs, rng, start=(ox + math.cos(yaw) * 0.01, oy + math.sin(yaw) * 0.01, oz + 0.01),
                   L=L * rng.uniform(0.15, 0.22), yaw=yaw, r=0.004 * L + 0.002, pitch=rng.uniform(1.3, 1.5))


def fern_builder(name, variants, L_range, n_range, styles, fiddle=(0, 0), extra_clump=0.0):
    def build(rng):
        bufs = Bufs()
        style = pick(rng, name, variants, styles)
        L = rng.uniform(*L_range)
        n = rng.randint(*n_range)
        fern_plant(rng, bufs, L=L, n_fronds=n, style=style, fiddleheads=rng.randint(*fiddle))
        if rng.random() < extra_clump:  # a smaller offset crown makes the clump irregular
            a = rng.uniform(0, TAU)
            d = L * rng.uniform(0.25, 0.4)
            fern_plant(rng, bufs, L=L * rng.uniform(0.5, 0.7), n_fronds=max(4, n // 2),
                       style=styles[rng.randrange(len(styles))], origin=(math.cos(a) * d, math.sin(a) * d, 0.0))
        bufs.clamp_ground()
        return finish(bufs, "fern")

    return build


# =========================================================================== tree fern
def stubs(bufs, mat, rng, C, n, z0, z1, r_at, length, rad=0.03, up=(-0.02, 0.07)):
    """Old leaf bases studding a trunk centre line C (n,3)."""
    P = []
    for _ in range(n):
        z = rng.uniform(z0, z1)
        a = rng.uniform(0, TAU)
        i = int(z * (len(C) - 1))
        dirn = np.array([math.cos(a), math.sin(a), 0.0])
        base = C[i] + dirn * r_at(z) * 0.85
        tip = base + dirn * length * rng.uniform(0.6, 1.3) + np.array([0, 0, rng.uniform(*up)])
        P.append(np.linspace(base, tip, 4))
    stems(bufs, mat, rng, np.array(P), rad, rad * 0.3, sides=5, t0=0.6, t1=0.95)


def build_tree_fern(rng):
    bufs = Bufs()
    H = rng.uniform(1.45, 2.0)
    r0, r1 = rng.uniform(0.16, 0.2), rng.uniform(0.13, 0.16)
    C, *_ = trunk(bufs, "treefern_bark", rng, height=H, r0=r0, r1=r1, lean=rng.uniform(0.02, 0.12),
                  lean_yaw=rng.uniform(0, TAU), bend=rng.uniform(-0.08, 0.08), flare=0.6, flare_h=0.3, scales=0.22,
                  scale_freq=(11, 8), lumps=0.18, roots=rng.randint(4, 7), sides=12, n=28)
    top = C[-1]
    # shaggy old frond bases, denser toward the crown
    stubs(bufs, "treefern_bark", rng, C, rng.randint(30, 44), 0.25, 1.0, lambda z: r0 + (r1 - r0) * z, 0.08, 0.03)
    stubs(bufs, "treefern_bark", rng, C, 14, 0.85, 1.0, lambda z: r1, 0.13, 0.035, up=(0.02, 0.1))
    # dead skirt of brown fronds hanging under the crown
    for _ in range(rng.randint(2, 6)):
        yaw = rng.uniform(0, TAU)
        frond(bufs, rng, start=top - np.array([0, 0, 0.05]) + np.array([math.cos(yaw), math.sin(yaw), 0]) * 0.1,
              L=rng.uniform(0.7, 1.1), pitch=rng.uniform(-1.35, -0.9), droop=0.15, yaw=yaw, pairs=16,
              leaf_len=0.16, leaf_w=0.024, ang0=0.7, ang1=0.35, keel=-0.4, fold=0.6, curl=0.6, grav=0.5,
              stem_r=0.01, leaf_mat="fern_dead", stem_mat="fern_dead", lobes=3, nu=6, s0=0.08, jitter=0.25)
    # living crown: a wide umbrella
    n = rng.randint(17, 23)
    Lc = rng.uniform(1.55, 1.9)
    yaw0 = rng.uniform(0, TAU)
    opens = sorted(rng.random() for _ in range(n))
    mat = rng.choice(["treefern", "treefern", "fern_lime"])
    for i, o in enumerate(opens):
        yaw = yaw0 + i * GOLDEN + rng.gauss(0, 0.2)
        frond(bufs, rng, start=top + np.array([math.cos(yaw) * 0.07, math.sin(yaw) * 0.07, 0.02]),
              L=Lc * lerp(0.65, 1.05, o), pitch=lerp(1.1, 0.3, o) + rng.gauss(0, 0.08),
              droop=lerp(0.6, 1.35, o) + rng.gauss(0, 0.1), power=2.2, yaw=yaw, sweep=rng.gauss(0, 0.15),
              roll=rng.gauss(0, 0.1), roll_end=rng.gauss(0, 0.35), pairs=rng.randint(21, 26), s0=0.1,
              leaf_len=Lc * rng.uniform(0.16, 0.19), leaf_w=Lc * 0.026, ang0=1.3, ang1=0.7, keel=0.12, fold=0.35,
              curl=0.3, grav=0.2, stem_r=0.016, leaf_mat=mat, stem_mat="fern_stem", lobes=3, lobe_depth=0.35,
              nu=7, prof_a=0.25, prof_b=0.9, r2=rng.random(), twist=0.2)
    for _ in range(rng.randint(3, 5)):
        yaw = rng.uniform(0, TAU)
        fiddlehead(bufs, rng, start=top + np.array([math.cos(yaw) * 0.04, math.sin(yaw) * 0.04, 0.0]),
                   L=rng.uniform(0.22, 0.35), yaw=yaw, r=0.016, pitch=rng.uniform(1.25, 1.5))
    bufs.clamp_ground()
    return finish(bufs, "tree_fern")


# =========================================================================== cycad
def build_cycad(rng):
    bufs = Bufs()
    H = rng.uniform(0.3, 0.75)
    r0 = rng.uniform(0.17, 0.23)
    C, *_ = trunk(bufs, "cycad_bark", rng, height=H, r0=r0, r1=r0 * rng.uniform(0.85, 1.0), lean=rng.uniform(0, 0.15),
                  lean_yaw=rng.uniform(0, TAU), flare=0.25, flare_h=0.1, scales=0.35, scale_freq=(13, 10),
                  lumps=0.06, sides=14, n=14)
    top = C[-1]
    stubs(bufs, "cycad_bark", rng, C, 22, 0.55, 1.0, lambda z: r0, 0.05, 0.035, up=(0.02, 0.06))
    n = rng.randint(14, 22)
    Lf = rng.uniform(0.85, 1.15)
    yaw0 = rng.uniform(0, TAU)
    opens = sorted(rng.random() for _ in range(n))
    flush = rng.random() < 0.5  # a flush of new pale fronds in the centre
    for i, o in enumerate(opens):
        yaw = yaw0 + i * GOLDEN + rng.gauss(0, 0.12)
        young = flush and o < 0.25
        frond(bufs, rng, start=top + np.array([math.cos(yaw), math.sin(yaw), 0]) * r0 * 0.5,
              L=Lf * lerp(0.75, 1.05, o) * (0.8 if young else 1), pitch=lerp(1.25, 0.45, o) + rng.gauss(0, 0.07),
              droop=lerp(0.15, 0.7, o) + rng.gauss(0, 0.06), power=1.4, yaw=yaw, sweep=rng.gauss(0, 0.08),
              roll=0.0, roll_end=rng.gauss(0, 0.15), pairs=rng.randint(24, 30), s0=0.2, leaf_len=Lf * 0.17,
              leaf_w=Lf * 0.011, ang0=1.05, ang1=0.75, keel=0.45, fold=0.15, curl=-0.05, grav=0.03, fwd=0.05,
              stem_r=0.012, leaf_mat="cycad_young" if young else "cycad", stem_mat="cycad_stem", prof_a=0.15,
              prof_b=0.5, r2=rng.random(), jitter=0.03, len_jit=0.05,
              leaf_prof=lambda u: (1 - u ** 2.5) * (0.6 + 0.4 * np.minimum(1, u * 5)))
    if not flush:  # golden cone in the centre
        ellipsoid(bufs, "cycad_cone", rng, top + np.array([0, 0, 0.12]), 0.08, 0.15, sides=12, rings=8, t=(0.0, 1.0),
                  lumps=0.08)
    bufs.clamp_ground()
    return finish(bufs, "cycad")


# =========================================================================== palms
def palm_builder(tall):
    def build(rng):
        bufs = Bufs()
        H = rng.uniform(4.2, 4.7) if tall else rng.uniform(2.0, 2.4)
        r0 = 0.24 if tall else 0.19
        C, *_ = trunk(bufs, "palm_bark", rng, height=H, r0=r0, r1=r0 * 0.62, lean=rng.uniform(0.04, 0.16),
                      lean_yaw=rng.uniform(0, TAU), bend=rng.uniform(0.05, 0.22), flare=0.45, flare_h=0.35,
                      rings=0.14, ring_freq=rng.uniform(5.0, 7.0), lumps=0.05, sides=12, n=40 if tall else 26,
                      roots=rng.randint(4, 8))
        top = C[-1]
        r1 = r0 * 0.62
        # leaf-base boots below the crown
        stubs(bufs, "palm_boot", rng, C, 26, 0.86, 1.0, lambda z: r1, 0.09, 0.05, up=(0.06, 0.14))
        n = rng.randint(10, 14)
        Lf = rng.uniform(2.0, 2.5) if tall else rng.uniform(1.55, 1.9)
        yaw0 = rng.uniform(0, TAU)
        opens = sorted(rng.random() for _ in range(n))
        dead = rng.randint(0, 2)
        for i, o in enumerate(opens):
            yaw = yaw0 + i * GOLDEN + rng.gauss(0, 0.15)
            is_dead = i >= n - dead
            frond(bufs, rng, start=top + np.array([math.cos(yaw), math.sin(yaw), 0]) * r1 * 0.6,
                  L=Lf * lerp(0.7, 1.05, o) * (0.85 if is_dead else 1),
                  pitch=(lerp(1.25, 0.25, o) if not is_dead else -1.1) + rng.gauss(0, 0.08),
                  droop=(lerp(0.7, 2.0, o) if not is_dead else 0.2) + rng.gauss(0, 0.1),
                  power=1.5, yaw=yaw, sweep=rng.gauss(0, 0.12), roll=0, roll_end=rng.gauss(0, 0.4),
                  pairs=rng.randint(26, 32), s0=0.12, leaf_len=Lf * rng.uniform(0.2, 0.24), leaf_w=Lf * 0.014,
                  ang0=0.95, ang1=0.45, keel=-0.25, fold=0.45, curl=0.35, grav=0.5, fwd=0.05, stem_r=0.022,
                  leaf_mat="fern_dead" if is_dead else "palm", stem_mat="palm_stem", prof_a=0.2, prof_b=0.55,
                  r2=rng.random(), jitter=0.06, twist=0.4, nu=6,
                  leaf_prof=lambda u: (1 - u ** 1.5) ** 0.8 * (0.5 + 0.5 * np.minimum(1, u * 4)))
        if rng.random() < 0.67:  # fruit cluster
            a = rng.uniform(0, TAU)
            for _ in range(rng.randint(3, 7)):
                aa = a + rng.gauss(0, 0.5)
                c = top + np.array([math.cos(aa) * r1 * 1.1, math.sin(aa) * r1 * 1.1, -rng.uniform(0.05, 0.25)])
                ellipsoid(bufs, "coconut", rng, c, 0.075, 0.085, sides=8, rings=6, t=(0, 1), lumps=0.05)
        bufs.clamp_ground()
        return finish(bufs, "palm")

    return build


# =========================================================================== foreground fronds
FG_KINDS = ["monstera", "fern", "palm", "mixed"]


def build_foreground(rng):
    """A spray of huge arching leaves meant to hang over a screen edge / corner."""
    bufs = Bufs()
    kind = pick(rng, "foreground_frond", 4, FG_KINDS)
    cam = math.atan2(1.0, 1.0)  # Blender +X+Y = toward the camera / screen bottom
    n = rng.randint(3, 6)
    for i in range(n):
        k = kind if kind != "mixed" else ["monstera", "fern", "paddle"][i % 3]
        yaw = cam + rng.uniform(-1.4, 1.4)
        L = rng.uniform(2.2, 3.1)
        pitch = rng.uniform(0.55, 1.05)
        droop = rng.uniform(1.2, 1.9)
        start = (rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), 0.0)
        if k == "monstera":
            frond(bufs, rng, start=start, L=L, pitch=pitch, droop=droop, yaw=yaw, power=1.6, roll_end=rng.gauss(0, 0.4),
                  pairs=rng.randint(7, 10), s0=0.32, leaf_len=L * 0.3, leaf_w=L * 0.05, ang0=1.15, ang1=0.45,
                  keel=0.15, fold=0.25, curl=0.15, grav=0.25, fwd=0.15, stem_r=0.03, leaf_mat="fg_leaf",
                  stem_mat="fg_stem", prof_a=0.4, prof_b=0.6, nu=7, nv=5, alt=0.15, jitter=0.05,
                  leaf_prof=lambda u: (1 - u ** 2.2) ** 0.8 * (0.8 + 0.2 * np.minimum(1, u * 3)))
        elif k == "fern":
            frond(bufs, rng, start=start, L=L, pitch=pitch, droop=droop, yaw=yaw, power=1.8, roll_end=rng.gauss(0, 0.4),
                  pairs=rng.randint(18, 22), s0=0.12, leaf_len=L * 0.17, leaf_w=L * 0.023, ang0=1.25, ang1=0.65,
                  keel=0.2, fold=0.35, curl=0.25, grav=0.15, stem_r=0.025, leaf_mat="fg_fern", stem_mat="fg_stem",
                  lobes=3, nu=7, prof_a=0.3, prof_b=0.85)
        elif k == "palm":
            frond(bufs, rng, start=start, L=L, pitch=pitch, droop=droop, yaw=yaw, power=1.5, roll_end=rng.gauss(0, 0.5),
                  pairs=rng.randint(20, 26), s0=0.15, leaf_len=L * 0.24, leaf_w=L * 0.018, ang0=1.0, ang1=0.5,
                  keel=-0.15, fold=0.45, curl=0.3, grav=0.4, stem_r=0.028, leaf_mat="fg_leaf", stem_mat="fg_stem",
                  prof_a=0.2, prof_b=0.55, nu=6, twist=0.4)
        else:
            paddle(bufs, "fg_leaf", rng, start=start, L=L * 0.85, W=L * 0.16, pitch=pitch, droop=droop, yaw=yaw,
                   n=20, nv=7, fold=0.25, wave=0.05, edge_droop=0.2, tears=rng.randint(1, 3))
    bufs.clamp_ground()
    return finish(bufs, "foreground_frond")
