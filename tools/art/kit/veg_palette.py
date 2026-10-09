"""Vegetation kit: the shared material palette (linear-RGB ramps, base -> tip).

Greens follow the mockups: deep blue-green hearts, saturated mid greens and warm
yellow-green sunlit tips; accents are crimson (astilbe / heliconia), violet and
lily white.  Materials are created lazily, so a prop only builds what it uses.
"""
from . import veg_mat as M

GOLDEN = 2.399963


def lerp(a, b, f):
    return a + (b - a) * f


def variant_index(rng, name, n):
    """Recover which variant render_props is building: it seeds Random(crc32('name:v')).
    Lets a prop guarantee that its variants cover distinct species / styles. -1 if unknown."""
    import random
    import zlib

    st = rng.getstate()
    for v in range(n):
        if random.Random(zlib.crc32(f"{name}:{v}".encode())).getstate() == st:
            return v
    return -1


def pick(rng, name, n, options):
    """Variant v gets options[v % len]; unknown seeds pick at random."""
    v = variant_index(rng, name, n)
    return options[v % len(options)] if v >= 0 else options[rng.randrange(len(options))]


def _f(name, stops, **kw):
    return lambda: M.foliage(name, stops, **kw)


def _flat(name, stops, **kw):
    return lambda: M.flat(name, stops, **kw)


def _bark(name, dark, light, **kw):
    return lambda: M.bark(name, dark, light, **kw)


DARK_STEM = [(0.0, (0.035, 0.022, 0.008)), (0.25, (0.03, 0.06, 0.015)), (1.0, (0.10, 0.22, 0.03))]

MATERIALS = {
    # ------------------------------------------------------------------ ferns
    "fern": _f("fern", [(0.0, (0.004, 0.018, 0.014)), (0.3, (0.012, 0.075, 0.022)), (0.7, (0.07, 0.26, 0.018)),
                        (1.0, (0.34, 0.50, 0.03))], age_col=(0.30, 0.22, 0.03), age_amt=0.12),
    "fern_cool": _f("fern_cool", [(0.0, (0.006, 0.028, 0.022)), (0.4, (0.018, 0.085, 0.040)),
                                  (0.8, (0.06, 0.22, 0.05)), (1.0, (0.20, 0.40, 0.06))]),
    "fern_lime": _f("fern_lime", [(0.0, (0.012, 0.045, 0.015)), (0.3, (0.05, 0.16, 0.025)),
                                  (0.7, (0.15, 0.36, 0.035)), (1.0, (0.38, 0.52, 0.06))], trans=0.42),
    "fern_stem": _f("fern_stem", DARK_STEM, trans=0.1, vein=0.0, micro=0.0),
    "fern_dead": _f("fern_dead", [(0.0, (0.06, 0.035, 0.012)), (0.6, (0.16, 0.085, 0.02)), (1.0, (0.28, 0.16, 0.04))],
                    trans=0.25, vein=0.1, vein_col=(0.3, 0.2, 0.08)),
    "treefern": _f("treefern", [(0.0, (0.010, 0.035, 0.015)), (0.3, (0.03, 0.12, 0.03)), (0.7, (0.11, 0.30, 0.035)),
                                (1.0, (0.38, 0.52, 0.05))], trans=0.42, age_col=(0.34, 0.24, 0.04), age_amt=0.1),
    "treefern_bark": _bark("treefern_bark", (0.022, 0.012, 0.006), (0.13, 0.06, 0.022), scale=22.0,
                           stretch=(1.0, 1.0, 0.35), moss=0.35, moss_col=(0.05, 0.13, 0.015)),
    # ------------------------------------------------------------------ cycad / palm
    "cycad": _f("cycad", [(0.0, (0.006, 0.03, 0.016)), (0.4, (0.015, 0.09, 0.03)), (0.85, (0.05, 0.20, 0.04)),
                          (1.0, (0.16, 0.32, 0.05))], trans=0.22, rough=0.28, spec=0.7, vein=0.25),
    "cycad_young": _f("cycad_young", [(0.0, (0.05, 0.10, 0.02)), (0.6, (0.22, 0.40, 0.06)), (1.0, (0.45, 0.50, 0.10))],
                      trans=0.45, rough=0.35),
    "cycad_stem": _f("cycad_stem", [(0.0, (0.05, 0.035, 0.015)), (0.3, (0.03, 0.07, 0.02)), (1.0, (0.06, 0.16, 0.03))],
                     trans=0.05, vein=0.0, micro=0.0),
    "cycad_bark": _bark("cycad_bark", (0.035, 0.025, 0.015), (0.20, 0.13, 0.06), scale=14.0, stretch=(1, 1, 1),
                        ring=0.6, ring_col=(0.28, 0.19, 0.09), moss=0.25, bump_amt=0.6),
    "cycad_cone": _flat("cycad_cone", [(0.0, (0.25, 0.10, 0.02)), (0.5, (0.55, 0.30, 0.05)), (1.0, (0.70, 0.45, 0.10))],
                        rough=0.5, bump_scale=1.0),
    "palm": _f("palm", [(0.0, (0.01, 0.045, 0.015)), (0.35, (0.04, 0.15, 0.025)), (0.75, (0.14, 0.33, 0.03)),
                        (1.0, (0.40, 0.50, 0.05))], trans=0.4, rough=0.35, spec=0.6,
               age_col=(0.42, 0.30, 0.06), age_amt=0.15),
    "palm_stem": _f("palm_stem", [(0.0, (0.10, 0.07, 0.03)), (0.3, (0.06, 0.12, 0.03)), (1.0, (0.12, 0.25, 0.04))],
                    trans=0.05, vein=0.0, micro=0.0),
    "palm_bark": _bark("palm_bark", (0.05, 0.035, 0.022), (0.24, 0.17, 0.10), scale=10.0, stretch=(1, 1, 0.5),
                       ring=0.75, ring_col=(0.03, 0.02, 0.012), moss=0.3, voronoi=False),
    "palm_boot": _bark("palm_boot", (0.04, 0.022, 0.01), (0.22, 0.13, 0.05), scale=30.0, stretch=(1, 1, 0.3)),
    "coconut": _flat("coconut", [(0.0, (0.10, 0.07, 0.02)), (0.6, (0.18, 0.22, 0.04)), (1.0, (0.30, 0.30, 0.06))],
                     rough=0.35, spec=0.5),
    # ------------------------------------------------------------------ broad leaves
    "banana": _f("banana", [(0.0, (0.03, 0.10, 0.02)), (0.5, (0.10, 0.30, 0.04)), (1.0, (0.24, 0.45, 0.05))],
                 trans=0.45, rough=0.4, lateral=40.0, lat_amt=0.18, vein=0.6, vein_col=(0.45, 0.55, 0.15),
                 age_col=(0.40, 0.30, 0.06), age_amt=0.2),
    "banana_stem": _f("banana_stem", [(0.0, (0.10, 0.08, 0.03)), (0.4, (0.10, 0.20, 0.05)), (1.0, (0.16, 0.30, 0.06))],
                      trans=0.15, vein=0.0, micro=0.3),
    "ginger": _f("ginger", [(0.0, (0.01, 0.06, 0.02)), (0.6, (0.04, 0.17, 0.04)), (1.0, (0.12, 0.30, 0.05))],
                 trans=0.35, rough=0.35, spec=0.6, lateral=22.0, lat_amt=0.15, vein=0.5),
    "ginger_stem": _f("ginger_stem", [(0.0, (0.06, 0.04, 0.02)), (0.3, (0.04, 0.12, 0.03)), (1.0, (0.08, 0.22, 0.05))],
                      trans=0.1, vein=0.0, micro=0.0),
    "heliconia": _f("heliconia", [(0.0, (0.25, 0.01, 0.005)), (0.7, (0.55, 0.02, 0.01)), (1.0, (0.75, 0.45, 0.03))],
                    trans=0.35, rough=0.3, spec=0.6, vein=0.0, sat_jit=0.1, hue_jit=0.01),
    "heli_stem": _f("heli_stem", [(0.0, (0.2, 0.02, 0.01)), (1.0, (0.35, 0.05, 0.02))], trans=0.1, vein=0.0),
    "elephant": _f("elephant", [(0.0, (0.008, 0.04, 0.02)), (0.6, (0.03, 0.14, 0.04)), (1.0, (0.08, 0.26, 0.05))],
                   trans=0.4, rough=0.45, lateral=9.0, lat_skew=1.6, lat_amt=0.35, vein=0.8,
                   vein_col=(0.30, 0.45, 0.20)),
    "elephant_stem": _f("elephant_stem", [(0.0, (0.06, 0.03, 0.04)), (0.5, (0.05, 0.12, 0.05)),
                                          (1.0, (0.10, 0.22, 0.06))], trans=0.15, vein=0.0, micro=0.0),
    # foreground: deep, rich and shaded, glowing where the sun gets through
    "fg_leaf": _f("fg_leaf", [(0.0, (0.004, 0.02, 0.012)), (0.5, (0.02, 0.10, 0.03)), (1.0, (0.10, 0.28, 0.04))],
                  trans=0.5, rough=0.4, spec=0.55, vein=0.5, vein_col=(0.25, 0.40, 0.08)),
    "fg_fern": _f("fg_fern", [(0.0, (0.004, 0.02, 0.012)), (0.4, (0.015, 0.09, 0.025)), (0.8, (0.07, 0.24, 0.03)),
                              (1.0, (0.25, 0.42, 0.04))], trans=0.5),
    "fg_stem": _f("fg_stem", DARK_STEM, trans=0.15, vein=0.0, micro=0.0),
    # ------------------------------------------------------------------ marsh
    "horsetail": _f("horsetail", [(0.0, (0.02, 0.10, 0.03)), (0.6, (0.08, 0.28, 0.05)), (1.0, (0.22, 0.42, 0.06))],
                    trans=0.3, vein=0.0),
    "horsetail_stem": _f("horsetail_stem", [(0.0, (0.03, 0.09, 0.03)), (0.5, (0.07, 0.24, 0.05)),
                                            (1.0, (0.16, 0.36, 0.06))], trans=0.2, vein=0.85,
                         vein_col=(0.02, 0.025, 0.012), micro=0.0),
    "horsetail_cone": _flat("horsetail_cone", [(0.0, (0.12, 0.08, 0.03)), (1.0, (0.35, 0.25, 0.10))], rough=0.5,
                            spots=((0.08, 0.05, 0.02), 140.0, 0.25)),
    "reed": _f("reed", [(0.0, (0.02, 0.06, 0.02)), (0.35, (0.06, 0.20, 0.04)), (0.8, (0.20, 0.38, 0.05)),
                        (1.0, (0.50, 0.48, 0.12))], trans=0.4, vein=0.3, age_col=(0.45, 0.35, 0.12), age_amt=0.2),
    "reed_dry": _f("reed_dry", [(0.0, (0.10, 0.08, 0.03)), (1.0, (0.50, 0.38, 0.15))], trans=0.3, vein=0.2,
                   vein_col=(0.6, 0.5, 0.25)),
    "reed_plume": _f("reed_plume", [(0.0, (0.10, 0.05, 0.05)), (0.6, (0.32, 0.20, 0.14)), (1.0, (0.60, 0.48, 0.30))],
                     trans=0.45, vein=0.0, micro=0.0),
    "cattail_leaf": _f("cattail_leaf", [(0.0, (0.02, 0.06, 0.03)), (0.4, (0.05, 0.18, 0.06)), (0.85, (0.16, 0.34, 0.07)),
                                        (1.0, (0.45, 0.42, 0.12))], trans=0.38, vein=0.35, age_col=(0.40, 0.30, 0.10),
                        age_amt=0.2),
    "cattail_head": _flat("cattail_head", [(0.0, (0.09, 0.035, 0.012)), (0.5, (0.17, 0.07, 0.02)),
                                           (1.0, (0.12, 0.05, 0.015))], rough=0.85, spec=0.15, bump_scale=1.0),
    # ------------------------------------------------------------------ grass
    "grass": _f("grass", [(0.0, (0.03, 0.08, 0.02)), (0.4, (0.12, 0.28, 0.04)), (0.85, (0.32, 0.45, 0.06)),
                          (1.0, (0.60, 0.55, 0.15))], trans=0.4, vein=0.2),
    "grass_gold": _f("grass_gold", [(0.0, (0.08, 0.10, 0.02)), (0.5, (0.32, 0.36, 0.06)), (1.0, (0.70, 0.55, 0.18))],
                     trans=0.45, vein=0.15),
    "grass_seed": _f("grass_seed", [(0.0, (0.30, 0.25, 0.10)), (1.0, (0.75, 0.62, 0.32))], trans=0.4, vein=0.0,
                     micro=0.0),
    # ------------------------------------------------------------------ flowers
    "astilbe": _f("astilbe", [(0.0, (0.12, 0.004, 0.012)), (0.5, (0.42, 0.012, 0.025)), (1.0, (0.85, 0.10, 0.12))],
                  trans=0.45, vein=0.0, hue_jit=0.012, sat_jit=0.1, val_jit=0.5, micro=0.0, glow=(1.6, 0.9, 0.7)),
    "astilbe_stem": _f("astilbe_stem", [(0.0, (0.06, 0.02, 0.01)), (1.0, (0.25, 0.04, 0.03))], trans=0.15, vein=0.0,
                       micro=0.0),
    "astilbe_leaf": _f("astilbe_leaf", [(0.0, (0.008, 0.03, 0.015)), (0.5, (0.03, 0.12, 0.03)),
                                        (0.85, (0.10, 0.24, 0.035)), (1.0, (0.30, 0.18, 0.05))], trans=0.35),
    "purple": _f("purple", [(0.0, (0.06, 0.02, 0.20)), (0.7, (0.20, 0.08, 0.55)), (1.0, (0.40, 0.25, 0.80))],
                 trans=0.4, vein=0.3, vein_col=(0.15, 0.05, 0.35), hue_jit=0.02, micro=0.0, glow=(1.2, 1.0, 1.4)),
    "purple_leaf": _f("purple_leaf", [(0.0, (0.01, 0.05, 0.02)), (1.0, (0.06, 0.20, 0.04))], trans=0.3),
    "purple_stem": _f("purple_stem", DARK_STEM, trans=0.1, vein=0.0, micro=0.0),
    "flower_eye": _flat("flower_eye", [(0.0, (0.55, 0.35, 0.02)), (1.0, (0.85, 0.70, 0.12))], rough=0.6),
    "clover": _f("clover", [(0.0, (0.02, 0.08, 0.03)), (0.6, (0.06, 0.22, 0.05)), (1.0, (0.18, 0.36, 0.07))],
                 trans=0.35, vein=0.3, vein_col=(0.35, 0.45, 0.25)),
    "clover_stem": _f("clover_stem", [(0.0, (0.04, 0.08, 0.02)), (1.0, (0.12, 0.25, 0.05))], trans=0.2, vein=0.0),
    "clover_flower": _f("clover_flower", [(0.0, (0.35, 0.25, 0.25)), (0.6, (0.75, 0.70, 0.62)),
                                          (1.0, (0.90, 0.85, 0.80))], trans=0.4, vein=0.0, micro=0.0),
    # ------------------------------------------------------------------ moss, fungi
    "moss": _f("moss", [(0.0, (0.03, 0.08, 0.01)), (0.5, (0.10, 0.25, 0.02)), (1.0, (0.30, 0.45, 0.04))], trans=0.3,
               rough=0.85, spec=0.15, vein=0.0, val_jit=0.5, micro=0.25, sheen=0.4),
    "moss_spore": _f("moss_spore", [(0.0, (0.15, 0.06, 0.02)), (1.0, (0.45, 0.15, 0.04))], trans=0.4, vein=0.0,
                     micro=0.0),
    "mush_amber": _flat("mush_amber", [(0.0, (0.25, 0.18, 0.10)), (0.15, (0.75, 0.68, 0.52)), (0.55, (0.70, 0.62, 0.45)),
                                       (0.62, (0.55, 0.42, 0.28)), (0.78, (0.85, 0.42, 0.08)), (1.0, (0.40, 0.14, 0.03))],
                        rough=0.35, spec=0.5, spots=((0.85, 0.78, 0.60), 60.0, 0.12)),
    "mush_red": _flat("mush_red", [(0.0, (0.25, 0.18, 0.10)), (0.15, (0.80, 0.76, 0.66)), (0.55, (0.78, 0.74, 0.62)),
                                   (0.62, (0.80, 0.72, 0.55)), (0.78, (0.75, 0.10, 0.02)), (1.0, (0.45, 0.02, 0.01))],
                      rough=0.3, spec=0.6, spots=((0.92, 0.90, 0.82), 55.0, 0.16)),
    "mush_honey": _flat("mush_honey", [(0.0, (0.15, 0.10, 0.05)), (0.15, (0.55, 0.45, 0.28)), (0.55, (0.50, 0.38, 0.20)),
                                       (0.62, (0.60, 0.48, 0.30)), (0.78, (0.65, 0.40, 0.10)), (1.0, (0.30, 0.15, 0.04))],
                        rough=0.4, spec=0.4, spots=((0.30, 0.15, 0.05), 120.0, 0.08)),
    # ------------------------------------------------------------------ water
    "lilypad": _f("lilypad", [(0.0, (0.02, 0.08, 0.02)), (0.3, (0.03, 0.14, 0.03)), (0.85, (0.08, 0.26, 0.04)),
                              (1.0, (0.30, 0.18, 0.05))], trans=0.2, rough=0.25, spec=0.7, vein=0.4,
                  vein_col=(0.20, 0.35, 0.08)),
    "lily_petal": _f("lily_petal", [(0.0, (0.05, 0.12, 0.03)), (1.0, (0.45, 0.25, 0.25))], trans=0.3, vein=0.0),
    "lily_flower": _f("lily_flower", [(0.0, (0.55, 0.55, 0.45)), (0.6, (0.85, 0.82, 0.75)), (1.0, (0.95, 0.70, 0.72))],
                      trans=0.5, vein=0.2, vein_col=(0.95, 0.9, 0.8), micro=0.0, glow=(1.2, 1.1, 0.9), sheen=0.3),
    # ------------------------------------------------------------------ vines
    "vine_leaf": _f("vine_leaf", [(0.0, (0.01, 0.05, 0.02)), (0.5, (0.04, 0.16, 0.035)), (1.0, (0.20, 0.38, 0.05))],
                    trans=0.4, rough=0.35, spec=0.55),
    "vine_stem": _f("vine_stem", [(0.0, (0.06, 0.04, 0.015)), (1.0, (0.10, 0.12, 0.03))], trans=0.05, vein=0.0,
                    micro=0.0),
}


def finish(bufs, name):
    return bufs.objects(MATERIALS, name)
