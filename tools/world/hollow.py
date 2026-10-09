"""Fern Hollow: terrain + authored composition. Imported by worldgen.build().

Composition (screen-relative to the start nest N=(27,35)):
  creek + waterfall BEHIND (the cliff top-left, creek flowing +gx i.e. down-right),
  raised rocky bank + raptor perch to the RIGHT of the clearing,
  fallen-log arch over the west trail on the LEFT,
  egg nest beside the east trail, stepping-stone ford north to a hidden fossil shelf.
"""
import numpy as np

from fields import *  # noqa
import worldgen as wg


def rd(R, D):
    """screen-oriented (R = right, D = down) -> game (gx, gy)"""
    return ((D + R) / 2.0, (D - R) / 2.0)


def terrain(T):
    g = T.g
    n1 = value_noise(g, 9.0, 11, 3)
    n2 = value_noise(g, 3.0, 12, 3)
    n3 = value_noise(g, 1.2, 13, 2)
    T.z += (n1 - 0.5) * 0.7 + (n2 - 0.5) * 0.2

    def blob(cx, cy, rx, ry, rot=0.0, wob=0.25):
        d = ellipse_sdf(g, cx, cy, rx, ry, rot) + (n2 - 0.5) * 2 * wob * min(rx, ry) * 0.5
        return 1 - smoothstep(-1.0, 1.0, d)

    def path(pts, width, wob=0.5):
        d, u = poly_dist(g, catmull(pts, 10))
        d = d + (n2 - 0.5) * wob
        return 1 - smoothstep(width * 0.5 - 0.6, width * 0.5 + 0.6, d)

    clearing = blob(31, 35, 9.0, 6.8, 0.5)
    path_east = path([(37, 36), (46, 37.5), (56, 34), (66, 31.5), (84, 30)], 4.2)
    path_south = path([(26, 40), (23.5, 48), (27, 58), (31, 70), (33, 84)], 3.8)
    path_creek = path([(33, 29), (36, 27.5)], 3.0)
    path_north = path([(44, 24.0), (45.5, 17), (46, 14.5)], 2.6)
    nook = blob(47.5, 40.5, 4.6, 3.8, 0.2)
    shelf = blob(46, 14.0, 4.2, 3.2, 0.3)
    dirt = np.clip(np.maximum.reduce([clearing, path_east, path_south, path_creek, path_north, nook * 0.8, shelf * 0.8]), 0, 1)

    # cliff plateau behind the creek source (waterfall)
    cliff_d = ellipse_sdf(g, 10, 12, 15.5, 11.0, -0.3) + (n2 - 0.5) * 2.2
    plateau = 1 - smoothstep(-0.5, 1.4, cliff_d)
    T.z += plateau * 2.5

    # creek (carved bed + water) flowing +gx
    creek_pts = catmull(
        [(12.5, 17.5), (17.5, 22.5), (21, 25.8), (28, 25.5), (36, 24.8), (44, 25.6), (52, 24.3), (60, 26), (70, 29), (84, 31)], 10
    )
    cd, cu = poly_dist(g, creek_pts)
    half = 2.3 + 0.9 * np.sin(cu * 9.0) * 0.5 + cu * 1.4 + 0.25 * (n2 - 0.5) * 4
    bed = smoothstep(half * 1.15, half * 0.15, cd)
    depth = (0.95 * bed + 0.12 * (n3 - 0.5)) * (1.0 + 0.5 * np.exp(-((cu - 0.08) ** 2) / 0.003))
    T.z -= depth
    wetmask = (cd < half) & (depth > 0.2)
    T.water = np.where(wetmask, np.float32(-0.18), np.nan).astype(np.float32)
    ford = (np.abs(g.X - 44.3) < 2.4) & (cd < half * 1.15)
    T.z += np.where(ford, 0.55 * bed, 0.0)
    shore = smoothstep(half * 1.9, half * 1.0, cd) * (1 - bed)
    creek_bank_open = smoothstep(half * 1.45, half * 1.0, cd)

    # raised rocky bank + raptor perch
    pd = ellipse_sdf(g, 40.5, 31.0, 4.2, 3.3, 0.6) + (n2 - 0.5) * 0.9
    perch = 1 - smoothstep(-0.2, 0.9, pd)
    bank_d = ellipse_sdf(g, 43, 30.5, 11.0, 4.2, 0.1) + (n2 - 0.5) * 1.6
    bankrise = 1 - smoothstep(-0.5, 2.0, bank_d)
    T.z += perch * 1.5 * (0.97 + 0.06 * n3) + bankrise * 0.55
    rockmask = np.maximum(1 - smoothstep(0.2, 1.9, pd), bankrise * 0.55)

    # forest bowl
    soft_open = np.clip(np.maximum(dirt, creek_bank_open * 0.9), 0, 1)
    D = np.where(soft_open > 0.5, 0.0, 1e4).astype(np.float32)
    for _ in range(2):
        for iy in range(1, g.ny):
            D[iy] = np.minimum(D[iy], D[iy - 1] + g.cell)
        for iy in range(g.ny - 2, -1, -1):
            D[iy] = np.minimum(D[iy], D[iy + 1] + g.cell)
        for ix in range(1, g.nx):
            D[:, ix] = np.minimum(D[:, ix], D[:, ix - 1] + g.cell)
        for ix in range(g.nx - 2, -1, -1):
            D[:, ix] = np.minimum(D[:, ix], D[:, ix + 1] + g.cell)
    D = (D + np.roll(D, 1, 0) + np.roll(D, -1, 0) + np.roll(D, 1, 1) + np.roll(D, -1, 1)) / 5
    forest = smoothstep(2.0, 6.5, D)
    T.z += forest * (0.45 + 0.8 * n1) * smoothstep(2.5, 12.0, D) * (1 - plateau)

    # surfaces
    T.paint("dirt", dirt)
    T.paint("moss", forest * (0.5 + 0.5 * n2) * (1 - dirt))
    T.paint("mud", shore * 0.9)
    T.paint("gravel", bed * 0.9 + shore * 0.35 * (n3 > 0.45))
    T.paint("rock", rockmask * 0.9)
    T.paint("grass", (1 - dirt) * (0.35 + 0.65 * smoothstep(0.35, 0.65, n1)) * (1 - forest * 0.55) * (1 - bed) * (1 - plateau * 0.5))
    gy_, gx_ = np.gradient(T.z, g.cell)
    slope = np.hypot(gx_, gy_)
    T.paint("rock", smoothstep(0.5, 1.1, slope), 0.95)

    T.open = np.clip(np.maximum(dirt, creek_bank_open * 0.9) * (1 - smoothstep(0.7, 1.2, slope)), 0, 1)
    T.open = np.where(T.open > 0.35, T.open, 0)
    T.open = np.where(bed > 0.8, 0.0, T.open)
    T.open = np.where(plateau > 0.2, 0.0, T.open)
    T.open = np.where(perch > 0.15, 0.0, T.open)
    T.open = np.maximum(T.open, np.where(ford, 0.9, 0.0) * (T.z < 1.2))
    T.keep = np.clip(np.maximum.reduce([clearing, path_east * 0.9, nook * 0.7]), 0, 1)
    T.D = D
    T.forest = forest
    T.perchmask = perch
    T.plateau = plateau
    T.pois = {
        "start_nest": (27.0, 35.0),
        "egg_nest": (47.5, 40.5),
        "perch": (40.5, 31.0),
        "ford": (44.3, 25.2),
        "fossil_shelf": (46.0, 14.0),
        "waterfall": (17.5, 22.5),
        "exit_east": (80, 30),
        "cave_mouth": (33, 82),
    }
    T.creek_pts = creek_pts
    T.features = [dict(kind="waterfall", x=16.2, y=21.2, w=3.2, ztop=2.35, zbot=-0.18)]


def scatter(T):
    g, rng = T.g, np.random.default_rng(T.seed + 99)
    add = T.props
    placed = []
    BAKE = wg.BAKE

    def z_at(x, y):
        iy, ix = g.idx(x, y)
        return float(T.z[iy, ix])

    def at(arr, x, y):
        iy, ix = g.idx(x, y)
        return float(arr[iy, ix])

    def put(n, x, y, v=None, s=None, solid_r=0.0, nv=1, z=None):
        v = int(rng.integers(0, nv)) if v is None else v
        add.append(dict(n=n, v=int(v), x=round(float(x), 3), y=round(float(y), 3), z=round(z if z is not None else z_at(x, y), 3), s=round(float(s if s else 1.0), 3), b=1 if n in BAKE else 0))
        if n not in BAKE:
            placed.append((float(x), float(y), max(solid_r, 0.5)))
        if solid_r:
            T.solids.append((float(x), float(y), solid_r))

    def free(x, y, r):
        return all((px - x) ** 2 + (py - y) ** 2 > (pr + r) ** 2 * 0.55 for px, py, pr in placed)

    def dry(x, y):
        return bool(np.isnan(at(T.water, x, y)))

    # ---------------------------------------------------------------- landmarks
    put("log_arch", 23.5, 41.5, v=0)
    put("log_fallen_gy", 17.0, 40.0, v=0)
    put("log_fallen_gx", 20.5, 31.5, v=1)
    put("log_pile", 15.5, 46.5, v=0, solid_r=0.9)
    put("stump", 28.5, 44.5, v=0, solid_r=0.5)
    put("rock_outcrop", 40.5, 31.0, v=0)
    for (x, y, n, v) in [(46.5, 28.5, "boulder_l", 0), (36.5, 28.5, "boulder_m", 1), (49.5, 31.0, "boulder_m", 2), (43.0, 34.2, "boulder_s", 1)]:
        put(n, x, y, v=v, solid_r={"boulder_l": 1.2, "boulder_m": 0.7, "boulder_s": 0.35}[n])
    put("nest_big", 47.5, 40.5, v=0, solid_r=0.9)
    put("egg_single", 50.0, 41.8, v=1)
    put("waterfall_rock", 16.2, 20.8, v=0)
    for i, (x, y) in enumerate([(5, 20.5), (6.5, 24.5), (8.5, 27.5), (11.5, 28.8), (14.5, 27.0)]):
        put("cliff_columns_gy" if i < 3 else "cliff_columns", x, y, v=i % 4, solid_r=1.3)
    for i, (x, y) in enumerate([(44.2, 28.4), (44.6, 26.9), (44.0, 25.4), (44.5, 23.9), (44.3, 22.5)]):
        put("flat_stone", x, y, v=i % 4)
    for x, y in [(30.0, 27.4), (36.5, 27.3), (52.0, 26.3), (58.0, 28.0)]:
        put("river_bank_rock_cluster", x, y, v=int(rng.integers(0, 4)), solid_r=0.6)
    put("fossil_ribs", 46.2, 14.0, v=0)
    put("boulder_m", 49.5, 13.0, v=0, solid_r=0.7)

    # ---------------------------------------------------------------- clustered foliage
    def cluster(center, rad, members, jitter=1.0):
        cx, cy = center
        for (n, cnt, nv, sr, sc) in members:
            for _ in range(cnt):
                for _try in range(12):
                    x = cx + rng.normal(0, rad * 0.5 * jitter)
                    y = cy + rng.normal(0, rad * 0.5 * jitter)
                    if not dry(x, y) or at(T.open, x, y) > 0.15 or not free(x, y, 0.45):
                        continue
                    put(n, x, y, nv=nv, s=rng.uniform(*sc), solid_r=sr)
                    break

    FF = lambda: [("tree_fern", 1, 3, 0.28, (0.95, 1.15)), ("fern_large", 5, 4, 0, (0.9, 1.2)), ("fern_medium", 7, 4, 0, (0.85, 1.15)), ("flower_red_spike", 3, 3, 0, (0.9, 1.1)), ("broadleaf", 2, 3, 0, (0.9, 1.1))]
    PG = lambda: [("palm_tall", 1, 2, 0.28, (0.95, 1.1)), ("palm_small", 2, 3, 0.25, (0.9, 1.1)), ("cycad", 2, 3, 0, (0.9, 1.1)), ("fern_large", 3, 4, 0, (0.9, 1.1)), ("fern_medium", 4, 4, 0, (0.9, 1.1))]
    meadows = [(32.5, 38.0, 7.5), (45.0, 38.0, 4.5), (38.0, 30.0, 3.0)]
    for gx_ in np.arange(-18, 90, 6.5):
        for gy_ in np.arange(-18, 90, 6.5):
            cx, cy = gx_ + rng.uniform(-2.2, 2.2), gy_ + rng.uniform(-2.2, 2.2)
            if not dry(cx, cy) and at(T.forest, cx, cy) < 0.2:
                continue
            if any(np.hypot(cx - mx, cy - my) < mr for mx, my, mr in meadows):
                continue
            f = at(T.forest, cx, cy)
            if f > 0.7:
                cluster((cx, cy), 7.5, PG() if rng.random() < 0.55 else FF(), 1.0)
            elif f > 0.25 and rng.random() < 0.8:
                cluster((cx, cy), 5.0, FF(), 0.9)
    for n, r, nv in [("fern_medium", 3.1, 4), ("flower_red_spike", 4.5, 3), ("boulder_s", 8.0, 4), ("horsetail", 6.0, 3)]:
        for x, y in poisson(rng, (0, 0, 84, 70), r, lambda x, y: 0.6 < at(T.D, x, y) < 3.5 and dry(x, y) and at(T.open, x, y) < 0.1 and free(x, y, 0.6)):
            put(n, x, y, nv=nv, s=rng.uniform(0.9, 1.1), solid_r=0.35 if n == "boulder_s" else 0)
    cd, cu = poly_dist(g, T.creek_pts)

    def bank_ok(x, y):
        iy, ix = g.idx(x, y)
        return dry(x, y) and 0.4 < cd[iy, ix] < 6.5 and T.open[iy, ix] < 0.5 and free(x, y, 0.5) and not (38 < x < 50 and 21 < y < 30)

    for n, r, nv in [("reed_clump", 2.6, 4), ("cattail_clump", 4.2, 3)]:
        for x, y in poisson(rng, (4, 10, 84, 36), r, bank_ok):
            put(n, x, y, nv=nv, s=rng.uniform(0.9, 1.1))
    for _ in range(7):
        x, y = rng.normal(22.5, 2.2), rng.normal(26.6, 1.0)
        if not dry(x, y):
            put("lily_pad", x, y, nv=3, z=-0.17)

    def open_or_fringe(x, y):
        return at(T.D, x, y) < 5.5 and dry(x, y) and at(T.plateau, x, y) < 0.3

    for n, r, nv in [("grass_tuft", 1.0, 5), ("rock_pebbles", 1.6, 5), ("clover_patch", 3.0, 2), ("moss_clump", 3.2, 2), ("fern_small", 1.7, 4), ("mushroom_cluster", 6.5, 3), ("flower_purple", 4.2, 3)]:
        for x, y in poisson(rng, (-6, -6, 90, 90), r, open_or_fringe):
            k = at(T.keep, x, y)
            if k > 0.5 and rng.random() < (0.92 if n in ("fern_small", "moss_clump", "mushroom_cluster", "flower_purple") else 0.5):
                continue
            put(n, x, y, nv=nv, s=rng.uniform(0.8, 1.2))
