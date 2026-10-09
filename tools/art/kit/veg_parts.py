"""Vegetation kit: plant organs (fronds, fiddleheads, blades, trunks, florets).

Each generator appends numpy geometry into a veg_geom.Bufs (material name ->
buffer).  Nothing here touches bpy, so whole plants are assembled as arrays and
turned into a handful of mesh objects at the end.
"""
import math

import numpy as np

from .veg_geom import TAU, Noise, cards, curves, frames_from_path, grid_quads, lathe, nrm, ribbon, sample, tubes


def _attr(shape, t, across, r1, r2):
    A = np.empty(shape + (4,), float)
    A[..., 0] = t
    A[..., 1] = across
    A[..., 2] = r1
    A[..., 3] = r2
    return A


def leaf_profile(u, base=0.55, bulge=3.5, tip=1.8, tip_pow=0.9):
    """Lanceolate width profile 0..1 along u in [0,1]: blunt base, widest ~1/4, pointed tip."""
    return (1 - u ** tip) ** tip_pow * (base + (1 - base) * np.minimum(1.0, u * bulge))


def leaflets(bufs, mat, B, T, S, N, side, length, width, angle, rng, *, t, r2, keel=0.0, fold=0.3, curl=0.25,
             grav=0.15, fwd=0.1, nu=5, nv=3, prof=None, lobes=0, lobe_depth=0.35, twist=0.0):
    """A batch of K leaflets attached at B (K,3) on a rib with frame T,S,N (K,3).
    side (K,) = +1/-1, angle (K,) from the rib tangent (rad), length/width (K,) units.
    t (K,) = position along the parent frond for the colour ramp."""
    K = len(B)
    if K == 0:
        return
    rs = np.random.default_rng(rng.randrange(1 << 30))
    a = angle[:, None]
    d = np.cos(a) * T + np.sin(a) * side[:, None] * S + keel * N
    d = nrm(d)
    nl = nrm(N - np.sum(N * d, -1, keepdims=True) * d)
    if twist:
        tw = (twist * side * rs.uniform(0.5, 1.0, K))[:, None]
        c0 = np.cross(nl, d)
        nl = nrm(np.cos(tw) * nl + np.sin(tw) * c0)
    c = nrm(np.cross(nl, d))
    u = np.linspace(0, 1, nu)[None, :, None]
    Lk = length[:, None, None]
    P = (B[:, None, :] + d[:, None, :] * Lk * u - nl[:, None, :] * Lk * curl * u ** 2
         + T[:, None, :] * Lk * fwd * u ** 2 + np.array([0, 0, -1.0]) * Lk * grav * u ** 2)
    uu = u[..., 0]
    w = width[:, None] * (prof(uu) if prof else leaf_profile(uu))
    if lobes:
        w = w * (1 - lobe_depth * (0.5 + 0.5 * np.cos(uu * TAU * lobes)) * (uu > 0.08))
    # frames along each leaflet (constant)
    Sx = np.broadcast_to(c[:, None, :], P.shape)
    Nx = np.broadcast_to(nl[:, None, :], P.shape)
    V, Q, v = ribbon(P, Sx, Nx, w, nv=nv, fold=fold)
    tt = np.clip(t[:, None, None] + 0.12 * uu[..., None], 0, 1)
    A = _attr(V.shape[:3], tt, np.abs(v)[None, None, :], rs.random(K)[:, None, None], r2)
    bufs[mat].add(V, Q, A)


def frond(bufs, rng, *, start, L, pitch, droop, yaw, sweep=0.0, roll=0.0, roll_end=None, power=1.6,
          pairs=30, s0=0.15, leaf_len=0.14, leaf_w=0.025, ang0=1.25, ang1=0.55, keel=0.05, fold=0.35,
          curl=0.25, grav=0.12, fwd=0.08, stem_r=0.007, leaf_mat="fern", stem_mat="fern_stem", nu=5,
          lobes=0, lobe_depth=0.35, prof_a=0.35, prof_b=0.8, alt=0.5, r2=None, jitter=0.07, twist=0.0,
          stem_sides=3, tip_leaf=True, len_jit=0.12, prof=None, leaf_prof=None, nv=3, gaps=0.0):
    """One pinnate frond: drooping rachis + two rows of tapering leaflets."""
    r2 = rng.random() if r2 is None else r2
    n = 48
    P, T, S, N, s = curves(L, n, pitch, droop, yaw, start=start, sweep=sweep, power=power, roll=roll,
                           roll_end=roll_end)
    P, T, S, N = P[0], T[0], S[0], N[0]
    # rachis / stipe
    idx = np.linspace(0, n - 1, 14).round().astype(int)
    r = stem_r * (1 - 0.75 * s[idx]) ** 1.0
    V, Q = tubes(P[idx][None], S[idx][None], N[idx][None], r[None], sides=stem_sides)
    bufs[stem_mat].add(V, Q, _attr(V.shape[:3], s[idx][None, :, None], 0.0, rng.random(), r2))
    # leaflets
    xs = np.linspace(s0, 0.975, pairs)
    sp = (xs[1] - xs[0]) if pairs > 1 else 0.0
    rs = np.random.default_rng(rng.randrange(1 << 30))
    pos = np.concatenate([xs, np.minimum(xs + sp * alt, 0.985)])
    side = np.concatenate([np.ones(pairs), -np.ones(pairs)])
    if gaps:
        keep = rs.random(len(pos)) > gaps
        pos, side = pos[keep], side[keep]
    x = (pos - s0) / (1 - s0)
    if prof is not None:
        pr = prof(x)
    else:
        pr = x ** prof_a * (1 - x) ** prof_b
        pr = pr / (prof_a ** prof_a * prof_b ** prof_b / (prof_a + prof_b) ** (prof_a + prof_b))
    pr = np.clip(pr, 0.0, 1.2) * (1 + len_jit * rs.normal(size=len(pos)))
    K = len(pos)
    ang = ang0 + (ang1 - ang0) * x + jitter * rs.normal(size=K)
    leaflets(bufs, leaf_mat, sample(P, pos), sample(T, pos), sample(S, pos), sample(N, pos), side,
             leaf_len * np.maximum(pr, 0.12), leaf_w * np.maximum(pr, 0.25) ** 0.6, ang, rng,
             t=0.15 + 0.85 * pos, r2=r2, keel=keel, fold=fold, curl=curl, grav=grav, fwd=fwd, nu=nu, nv=nv,
             lobes=lobes, lobe_depth=lobe_depth, twist=twist, prof=leaf_prof)
    if tip_leaf:
        tl = leaf_len * 0.35
        leaflets(bufs, leaf_mat, P[-3:-2], T[-3:-2], S[-3:-2], N[-3:-2], np.ones(1), np.array([tl]),
                 np.array([leaf_w * 0.6]), np.array([0.0]), rng, t=np.array([1.0]), r2=r2, fold=fold, nu=nu, nv=nv)
    return P


def fiddlehead(bufs, rng, *, start, L, yaw, mat="fern_stem", r=0.012, pitch=1.35, curl=6.0):
    """Young uncurling frond: a crozier spiral."""
    P, T, S, N, s = curves(L, 28, pitch, curl, yaw, start=start, power=3.2)
    rr = r * (1 - 0.65 * s) * (1 + 0.6 * np.exp(-((s - 0.85) / 0.12) ** 2))
    V, Q = tubes(P, S, N, rr[None], sides=5)
    bufs[mat].add(V, Q, _attr(V.shape[:3], 0.55 + 0.45 * s[None, :, None], 0.3, rng.random(), 0.2))


def blades(bufs, mat, rng, *, K, start, L, pitch, droop, yaw, width, sweep=0.0, power=1.5, n=8, nv=3,
           fold=0.4, roll=0.0, r2=None, tip_pow=1.0, base_w=1.0, t0=0.0):
    """K grass-like blades (vectorised). Every parameter may be scalar or (K,)."""
    P, T, S, N, s = curves(L, n, pitch, droop, yaw, start=start, sweep=sweep, power=power, roll=roll)
    _, (width,) = (None, [np.broadcast_to(np.asarray(width, float), (K,))])
    prof = (1 - s ** 1.6) ** tip_pow * (base_w + (1 - base_w) * np.minimum(1, s * 4))
    w = width[:, None] * prof[None, :]
    V, Q, v = ribbon(P, S, N, w, nv=nv, fold=fold)
    rs = np.random.default_rng(rng.randrange(1 << 30))
    r2v = rs.random(K) if r2 is None else np.broadcast_to(r2, (K,))
    A = _attr(V.shape[:3], t0 + (1 - t0) * s[None, :, None], np.abs(v)[None, None, :],
              rs.random(K)[:, None, None], r2v[:, None, None])
    bufs[mat].add(V, Q, A)
    return P


def stems(bufs, mat, rng, P, r0, r1=None, sides=4, t0=0.0, t1=1.0, r2=0.5):
    """Tubes along arbitrary (K,n,3) paths with radius tapering r0 -> r1."""
    r1 = r0 * 0.4 if r1 is None else r1
    K, n = P.shape[:2]
    T, S, N = frames_from_path(P)
    s = np.linspace(0, 1, n)
    r = np.broadcast_to(np.asarray(r0, float).reshape(-1, 1), (K, 1)) * (1 - s) + np.broadcast_to(
        np.asarray(r1, float).reshape(-1, 1), (K, 1)) * s
    V, Q = tubes(P, S, N, r, sides=sides)
    rs = np.random.default_rng(rng.randrange(1 << 30))
    A = _attr(V.shape[:3], (t0 + (t1 - t0) * s)[None, :, None], 0.0, rs.random(K)[:, None, None], r2)
    bufs[mat].add(V, Q, A)


def trunk(bufs, mat, rng, *, height, r0, r1, lean=0.0, lean_yaw=0.0, bend=0.0, n=24, sides=10,
          flare=0.4, flare_h=0.15, rings=0.0, ring_freq=10.0, scales=0.0, scale_freq=(7, 9), lumps=0.12,
          start=(0, 0, 0), roots=0, r2=0.5):
    """Tapered trunk with base flare, optional growth rings (palm) or diamond leaf-base
    scales (cycad / tree fern), noise lumps. Returns the centre line P (n,3) and top frame."""
    s = np.linspace(0, 1, n)
    # centre line: lean grows with height, bend adds a curve
    off = (lean * s + bend * s ** 2) * height
    C = np.stack([off * math.cos(lean_yaw), off * math.sin(lean_yaw), s * height], -1) + np.asarray(start, float)
    T, S, N = frames_from_path(C[None])
    T, S, N = T[0], S[0], N[0]
    a = np.arange(sides) * TAU / sides
    r = r0 + (r1 - r0) * s ** 0.8
    r = r * (1 + flare * np.exp(-s * height / max(flare_h, 1e-3)))
    R = np.broadcast_to(r[:, None], (n, sides)).copy()
    ring_phase = np.zeros((n, sides))
    if rings:
        ph = (s * height * ring_freq) % 1.0
        ring_phase[:] = ph[:, None]
        R *= 1 + rings * (ph[:, None] - 0.5)
    if scales:
        k1, k2 = scale_freq
        z = s[:, None] * height
        pat = np.abs(np.sin(a[None, :] * k1 / 2 + z * k2 * 2)) * np.abs(np.sin(a[None, :] * k1 / 2 - z * k2 * 2))
        R *= 1 + scales * (pat - 0.3)
        ring_phase[:] = pat
    X = C[:, None, :] + R[..., None] * (np.cos(a)[None, :, None] * S[:, None, :] + np.sin(a)[None, :, None] * N[:, None, :])
    if lumps:
        nz = Noise(rng, octaves=3, freq=3.0 / max(r0, 0.05) * 0.25)
        d = nz(X.reshape(-1, 3)).reshape(n, sides)
        X = X + (d * lumps * R)[..., None] * nrm(X - C[:, None, :])
    V = X[None]
    Q = grid_quads(1, n, sides, wrap=True)
    A = _attr(V.shape[:3], s[None, :, None], ring_phase[None], rng.random(), r2)
    bufs[mat].add(V, Q, A)
    # top cap (closing fan) so nothing looks hollow from above
    top = C[-1]
    capV = np.concatenate([X[-1], top[None] + T[-1] * r[-1] * 0.3])
    ci = len(capV) - 1
    F = np.array([[i, (i + 1) % sides, ci] for i in range(sides)])
    bufs[mat].add(capV, F, _attr((len(capV),), 1.0, 0.0, 0.5, r2))
    for _ in range(roots):
        ang = rng.uniform(0, TAU)
        Lr = r0 * rng.uniform(1.6, 2.6)
        Pr, Tr, Sr, Nr, sr = curves(Lr, 8, rng.uniform(-0.3, 0.1), -0.3, ang,
                                    start=(C[0][0] + math.cos(ang) * r0 * 0.6, C[0][1] + math.sin(ang) * r0 * 0.6, r0 * 0.9),
                                    power=1.0)
        Pr[..., 2] = np.maximum(Pr[..., 2] - np.linspace(0, r0 * 0.9, 8)[None], 0.0)
        Vr, Qr = tubes(Pr, Sr, Nr, (r0 * 0.45 * (1 - 0.8 * sr))[None], sides=6)
        bufs[mat].add(Vr, Qr, _attr(Vr.shape[:3], 0.05, 0.0, rng.random(), r2))
    return C, T[-1], S[-1], N[-1]


def florets(bufs, mat, rng, C, size, t=0.8, r2=0.5, aspect=1.0):
    V, F = cards(C, size, rng, aspect)
    rs = np.random.default_rng(rng.randrange(1 << 30))
    M = len(C)
    tt = np.broadcast_to(np.asarray(t, float), (M,))[:, None] * np.ones((1, 6))
    A = _attr((M, 6), tt, 0.5, rs.random(M)[:, None], r2)
    bufs[mat].add(V, F, A)


def disc(bufs, mat, rng, *, center, radius, n_r=4, n_a=24, notch=0.0, notch_dir=0.0, lift=0.0, tilt=(0, 0),
         wave=0.0, t_center=0.0, r2=0.5, normal_z=True):
    """Round leaf (lily pad / clover leaflet): polar grid, optional wedge notch, raised rim."""
    rr = np.linspace(0.0, 1.0, n_r + 1)[1:]
    a0, a1 = notch_dir + notch / 2, notch_dir + TAU - notch / 2
    a = np.linspace(a0, a1, n_a)
    R, Aa = np.meshgrid(rr, a, indexing="ij")
    rs = np.random.default_rng(rng.randrange(1 << 30))
    ph = rs.uniform(0, TAU)
    z = lift * R ** 3 + wave * R ** 2 * np.sin(Aa * 5 + ph)
    X = np.stack([R * np.cos(Aa) * radius, R * np.sin(Aa) * radius, z * radius], -1)
    X[..., 2] += X[..., 0] * tilt[0] + X[..., 1] * tilt[1]
    X = X + np.asarray(center, float)
    cV = np.asarray(center, float)[None]
    V = np.concatenate([cV, X.reshape(-1, 3)])
    Q = grid_quads(1, n_r, n_a) + 1
    F = np.concatenate([Q[:, [0, 1, 2]], Q[:, [0, 2, 3]], np.array([[0, 1 + j, 2 + j] for j in range(n_a - 1)])])
    Aattr = np.concatenate([_attr((1,), t_center, 0.0, 0.5, r2),
                            _attr((n_r * n_a,), (t_center + (1 - t_center) * R).ravel(), R.ravel(), rs.random(), r2)])
    bufs[mat].add(V, F, Aattr)
    return X


# --------------------------------------------------------------------------- broad leaves
def paddle(bufs, mat, rng, *, start, L, W, pitch, droop, yaw, power=1.6, roll=0.0, roll_end=None, sweep=0.0,
           n=18, nv=7, prof=None, fold=0.12, cup=0.0, wave=0.0, wave_freq=5.0, edge_droop=0.15, tears=0,
           r2=None, t0=0.0, t1=1.0):
    """A broad blade (banana / ginger / elephant ear / monstera segment) along a drooping midrib.
    tears: number of edge-to-midrib slits per side (banana)."""
    P, T, S, N, s = curves(L, n, pitch, droop, yaw, start=start, sweep=sweep, power=power, roll=roll, roll_end=roll_end)
    if prof is None:
        prof = lambda u: np.sin(np.pi * np.clip(0.04 + 0.96 * u, 0, 1)) ** 0.75 * (1 - 0.25 * u)
    w = (W * prof(s))[None]
    V, Q, v = ribbon(P, S, N, w, nv=nv, fold=fold, cup=cup)
    rs = np.random.default_rng(rng.randrange(1 << 30))
    av = np.abs(v)[None, None, :, None]
    if wave:
        ph = rs.uniform(0, TAU)
        V = V + N[:, :, None, :] * (wave * W * np.sin(s * wave_freq * TAU + ph)[None, :, None, None] * av ** 2)
    if edge_droop:
        V = V + np.array([0, 0, -1.0]) * edge_droop * w[..., None, None] * av ** 2
    if tears:
        keep = np.ones(len(Q), bool)
        cols = nv - 1
        for side_cols in (range(0, cols // 2), range(cols - cols // 2, cols)):
            outer = list(side_cols)
            if side_cols.start == 0:
                outer = outer[: max(1, len(outer) - 1)]  # leave the column next to the midrib
            else:
                outer = outer[1:] or outer
            for _ in range(tears):
                i = rs.integers(2, n - 3)
                for j in outer:
                    keep[i * cols + j] = False
        Q = Q[keep]
    r2 = rs.random() if r2 is None else r2
    A = _attr(V.shape[:3], (t0 + (t1 - t0) * s)[None, :, None], np.abs(v)[None, None, :], rs.random(), r2)
    bufs[mat].add(V, Q, A)
    return P, T, S, N


def ellipsoid(bufs, mat, rng, center, rx, rz, sides=8, rings=6, t=(0.5, 0.5), across=1.0, r2=0.5, lumps=0.0, rot=None):
    th = np.linspace(0.0, np.pi, rings + 1)
    radius = rx * np.sin(th)
    z = -rz * np.cos(th)
    V, Q = lathe(radius, z, sides)
    V = V.reshape(-1, 3)
    if lumps:
        nz = Noise(rng, octaves=2, freq=1.5 / max(rx, 1e-3))
        V = V * (1 + lumps * nz(V))[:, None]
    if rot is not None:
        V = V @ np.asarray(rot).T
    V = V + np.asarray(center, float)
    tt = np.repeat(np.linspace(t[0], t[1], rings + 1), sides)
    bufs[mat].add(V, Q, _attr((len(V),), tt, across, rng.random(), r2))


def petals(bufs, mat, rng, *, center, normal, n, length, width, cup=0.3, curl=-0.2, phase=None, prof=None,
           t=0.85, r2=0.5, nu=5, nv=3, fold=-0.1, jitter=0.15):
    """A whorl of n petals around `normal` (rosette / five-petal flower / lily layer)."""
    nrml = nrm(np.asarray(normal, float))
    ref = np.array([1.0, 0, 0]) if abs(nrml[2]) > 0.9 else np.array([0, 0, 1.0])
    e1 = nrm(np.cross(ref, nrml))
    e2 = np.cross(nrml, e1)
    phase = rng.uniform(0, TAU) if phase is None else phase
    rs = np.random.default_rng(rng.randrange(1 << 30))
    a = phase + np.arange(n) * TAU / n + jitter * rs.normal(size=n) / n * TAU * 0.3
    if prof is None:
        prof = lambda u: np.sin(np.pi * (0.1 + 0.9 * u)) ** 0.55 * (0.35 + 0.65 * np.minimum(1, u * 2))
    B = np.broadcast_to(np.asarray(center, float), (n, 3))
    leaflets(bufs, mat, B, np.broadcast_to(e1, (n, 3)), np.broadcast_to(e2, (n, 3)), np.broadcast_to(nrml, (n, 3)),
             np.ones(n), np.full(n, length) * rs.uniform(0.9, 1.1, n), np.full(n, width), a, rng,
             t=np.full(n, t), r2=r2, keel=cup, fold=fold, curl=curl, grav=0.0, fwd=0.0, nu=nu, nv=nv, prof=prof)


def plume(bufs, rng, *, start, L, stem_mat, flower_mat, pitch=1.5, droop=0.3, yaw=0.0, plume_frac=0.45,
          branches=12, branch_len=0.08, branch_pitch=0.7, floret=0.012, density=90.0, stem_r=0.006, nod=0.0,
          r2=None, branch_droop=0.3):
    """Feathery flower plume (astilbe / reed panicle): stem + pyramidal branchlets of florets."""
    r2 = rng.random() if r2 is None else r2
    P, T, S, N, s = curves(L, 24, pitch, droop + nod, yaw, start=start, power=2.2)
    stems(bufs, stem_mat, rng, P, stem_r, stem_r * 0.35, sides=4, t0=0.2, t1=0.6, r2=r2)
    P = P[0]
    rs = np.random.default_rng(rng.randrange(1 << 30))
    s0 = 1 - plume_frac
    pts = []
    # florets on the main axis
    m = max(4, int(density * L * plume_frac))
    ss = rs.uniform(s0, 1.0, m)
    pts.append(sample(P, ss) + rs.normal(0, floret * 0.6, (m, 3)))
    for b in range(branches):
        sb = s0 + (1 - s0) * (b + rs.random() * 0.8) / branches
        f = (sb - s0) / (1 - s0)
        bl = branch_len * (1 - f) ** 0.8 + branch_len * 0.15
        yawb = rs.uniform(0, TAU)
        Pb, *_ = curves(bl, 6, branch_pitch * rs.uniform(0.8, 1.2), branch_droop, yawb, start=sample(P, [sb])[0], power=1.4)
        mb = max(3, int(density * bl * 1.4))
        ub = rs.uniform(0, 1, mb)
        pts.append(sample(Pb[0], ub) + rs.normal(0, floret * 0.5, (mb, 3)))
        stems(bufs, stem_mat, rng, Pb, stem_r * 0.35, stem_r * 0.2, sides=3, t0=0.6, t1=0.8, r2=r2)
    C = np.concatenate(pts)
    tz = (C[:, 2] - C[:, 2].min()) / max(np.ptp(C[:, 2]), 1e-6)
    florets(bufs, flower_mat, rng, C, floret * rs.uniform(0.7, 1.3, len(C)), t=0.45 + 0.55 * tz, r2=r2)
    return P
