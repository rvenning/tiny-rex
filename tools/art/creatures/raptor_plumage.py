"""Feather layout for the feathered theropods (raptor, oviraptor, compy fuzz...).

All colours come from P["fpal"] (lists of (v, linear rgb) stops along a blade) and
sizes from P["fl"].  Feathers are rooted on the parametric body / thigh surfaces
and on the arm bones, each tagged with the chains that carry it when animated.
"""
import math
import random

import numpy as np

from raptor_geo import FeatherSet, rot_axis, smoothstep, unit, v3

UP = v3(0, 0, 1)
LATX = v3(1, 0, 0)


def t_of(sw, p):
    return float(np.argmin(np.linalg.norm(sw.p - np.asarray(p), axis=1)))


def t_at_arc(sw, a):
    return float(np.interp(a, sw.arc, np.arange(len(sw.p))))


def arc_of(sw, p):
    return float(sw.arc[int(t_of(sw, p))])


def tangent_dir(n, want):
    want = np.asarray(want, float)
    return unit(want - n * np.dot(want, n))


def _flip_host(host):
    if not host:
        return host
    out = []
    for h in host:
        if h[-1] in "RL" and h != "body":
            out.append(h[:-1] + {"R": "L", "L": "R"}[h[-1]])
        else:
            out.append(h)
    return tuple(out)


def mirror_add(fs, root, d, n, *a, **k):
    fs.add(root, d, n, *a, **k)
    f = lambda v: np.asarray(v, float) * np.array([-1, 1, 1])
    k = dict(k)
    k["host"] = _flip_host(k.get("host"))
    for key in ("twist", "droop", "asym"):
        if key in k:
            k[key] = -k[key]
    fs.add(f(root), f(d), f(n), *a, **k)


def raptor_feathers(C, seed=7):
    rng = random.Random(seed)
    P = C.P
    body = C.body
    J = C.joints
    pal = P["fpal"]
    F = P["fl"]
    cov = FeatherSet(P["id"] + "_fcov", rows=4)
    crest = FeatherSet(P["id"] + "_fcrest", rows=6)
    flight = FeatherSet(P["id"] + "_fflight", rows=8)
    mr = body.mean_radius()

    def jitter(c, amt=0.07):
        k = 1 + rng.uniform(-amt, amt)
        h = rng.uniform(-amt, amt) * 0.5  # slight hue push (r vs g)
        return [(v, np.clip(np.asarray(col) * k * np.array([1 + h, 1 - h, 1 - h]), 0, 1)) for v, col in c]

    # ---------------------------------------------------------------- body plumage (back, flanks, tail top)
    a_from = arc_of(body, J[F["cov_from"]])
    a_nb = arc_of(body, J["nb"])
    a_occ = arc_of(body, J["occ"])
    a = a_from
    row = 0
    while a < a_nb + 0.01:
        t = t_at_arc(body, a)
        frac = (a - a_from) / (a_nb - a_from)
        size = F["cov_len"] * (0.55 + 0.6 * math.sin(math.pi * min(1, 0.15 + frac * 1.0)))
        rad = mr[int(t)]
        dth = (size * 0.36) / max(rad, 0.02)
        th = math.radians(90) - (row % 2) * dth * 0.5
        while th > math.radians(F["cov_th_min"]):
            tt = t + rng.uniform(-1.0, 1.0)
            p, nrm, fw = body.point(tt, th)
            want = -fw - UP * 0.55 * math.cos(th) + rng.uniform(-0.15, 0.15) * np.cross(nrm, fw)
            d = tangent_dir(nrm, want)
            low = smoothstep(math.radians(20), math.radians(-12), th)
            colr = pal["cov_low"] if rng.random() < low else pal["cov"]
            ln = size * rng.uniform(0.8, 1.25)
            mirror_add(cov, p - nrm * 0.006, d, nrm, ln, ln * 0.42, jitter(colr), curl=0.45, fold=0.18,
                       tip=0.6, lift=rng.uniform(0.06, 0.2), droop=rng.uniform(-0.15, 0.15), rnd=rng.random(),
                       host=("body",))
            th -= dth * rng.uniform(0.85, 1.15)
        a += size * 0.3
        row += 1

    # ---------------------------------------------------------------- neck ruff (shaggy, pointed)
    a = a_nb - 0.03
    row = 0
    while a < a_occ + 0.015:
        t = t_at_arc(body, a)
        fr = (a - a_nb) / max(a_occ - a_nb, 1e-3)
        size = F["ruff_len"] * (0.85 + 0.35 * fr)
        rad = mr[int(t)]
        dth = (size * 0.33) / max(rad, 0.02)
        th = math.radians(88) - (row % 2) * dth * 0.5
        while th > math.radians(F["ruff_th_min"]):
            p, nrm, fw = body.point(t + rng.uniform(-1, 1), th)
            want = -fw * 0.9 - UP * 0.55
            d = tangent_dir(nrm, want)
            low = smoothstep(math.radians(0), math.radians(-30), th)
            colr = pal["cov_low"] if rng.random() < low else pal["ruff"]
            ln = size * rng.uniform(0.85, 1.2)
            mirror_add(cov, p - nrm * 0.005, d, nrm, ln, ln * 0.36, jitter(colr), curl=0.3, fold=0.22, tip=1.0,
                       lift=rng.uniform(0.2, 0.42), droop=rng.uniform(-0.2, 0.2), rnd=rng.random(), host=("body",))
            th -= dth * rng.uniform(0.85, 1.1)
        a += size * 0.28
        row += 1

    # ---------------------------------------------------------------- throat + chest fluff (soft cream)
    if "fluff" in pal:
        a_mid = arc_of(body, J["mid"])
        a = a_mid
        row = 0
        while a < a_occ - 0.02:
            t = t_at_arc(body, a)
            size = F.get("fluff_len", 0.06)
            rad = mr[int(t)]
            dth = (size * 0.45) / max(rad, 0.02)
            th = math.radians(-30) - (row % 2) * dth * 0.5
            while th > math.radians(-150):
                p, nrm, fw = body.point(t + rng.uniform(-1, 1), th)
                d = tangent_dir(nrm, -fw * 0.7 - UP * 0.7)
                ln = size * rng.uniform(0.8, 1.2)
                cov.add(p - nrm * 0.004, d, nrm, ln, ln * 0.55, jitter(pal["fluff"], 0.04), curl=0.5, fold=0.1,
                        tip=0.0, lift=rng.uniform(0.04, 0.12), rnd=rng.random(), host=("body",))
                th -= dth * rng.uniform(0.85, 1.15)
            a += size * 0.4
            row += 1

    # ---------------------------------------------------------------- crest: crown of spikes, head top -> nape
    a_front = arc_of(body, J["eye"]) + F["crest_front"]
    a_back = arc_of(body, J[F["crest_back"]])
    a = a_front
    while a > a_back:
        t = t_at_arc(body, a)
        fr = (a_front - a) / (a_front - a_back)  # 0 front .. 1 back
        peak = math.exp(-((fr - F["crest_peak"]) / 0.35) ** 2)
        ln = F["crest_len"] * (0.3 + 0.7 * peak)
        for k, dth in enumerate((0.0, 0.42)):
            for sgn in ((1,) if dth == 0 else (1, -1)):
                th = math.pi / 2 - sgn * dth
                p, nrm, fw = body.point(t, th)
                up_ang = F["crest_up"] * (1 - 0.55 * fr) - 0.2 * k + rng.uniform(-0.08, 0.08)
                d = unit(-fw * math.cos(up_ang) + UP * math.sin(up_ang) + LATX * 0.35 * sgn * (dth > 0))
                side = unit(np.cross(d, UP)) if abs(d[2]) < 0.99 else LATX
                ln_k = ln * (1.0 - 0.22 * k) * rng.uniform(0.85, 1.1)
                crest.add(p - nrm * 0.008, d, side, ln_k, ln_k * 0.22, jitter(pal["crest"], 0.08),
                          curl=0.0, fold=0.3, tip=1.0, droop=(-0.55 if sgn > 0 else 0.55) if dth else -0.5,
                          twist=0.3 * sgn * (dth > 0), rnd=rng.random(), host=("body",))
        a -= F["crest_step"] * rng.uniform(0.85, 1.15)

    # cheek tufts behind the eye / jaw corner
    for k in range(F.get("cheek_n", 4)):
        a = arc_of(body, J["occ"]) + 0.02 - k * 0.025
        t = t_at_arc(body, a)
        for th in (math.radians(30 - 6 * k), math.radians(-5 - 7 * k)):
            p, nrm, fw = body.point(t, th)
            d = tangent_dir(nrm, -fw - UP * 0.2)
            ln = F["cheek_len"] * rng.uniform(0.85, 1.15)
            mirror_add(crest, p - nrm * 0.004, d, nrm, ln, ln * 0.3, jitter(pal["ruff"]), curl=0.0, fold=0.2,
                       tip=1.0, lift=rng.uniform(0.35, 0.6), rnd=rng.random(), host=("body",))

    # ---------------------------------------------------------------- thigh "trousers"
    ts = C.thigh_sweep
    nts = len(ts.p)
    for row, tf in enumerate(np.arange(0.0, 0.97, 0.055)):
        t = tf * (nts - 1)
        ln = F["thigh_len"] * (0.75 + 0.5 * tf)
        step = math.radians(22)
        for th in np.arange(math.radians(-130), math.radians(115), step) + (row % 2) * step / 2:
            p, nrm, fw = ts.point(t + rng.uniform(-0.5, 0.5), th)
            d = tangent_dir(nrm, fw + v3(0, -0.3, 0))
            mirror_add(cov, p - nrm * 0.005, d, nrm, ln * rng.uniform(0.85, 1.2), ln * 0.45,
                       jitter(pal["thigh"]), curl=0.35, fold=0.15, tip=0.6,
                       lift=rng.uniform(0.1, 0.28) + (0.15 if tf > 0.85 else 0), rnd=rng.random(),
                       host=("body", "legR"))

    # ---------------------------------------------------------------- folded wings (forearm + hand)
    sh, el, wr = J["shoulderR"], J["elbowR"], J["wristR"]
    fing = C.fingers[len(C.fingers) // 2][-1]
    nW = F["wing_n"]
    for i in range(nW):
        u = i / (nW - 1)  # 0 elbow .. 1 hand tip
        root = el + (wr - el) * (u / 0.6) if u < 0.6 else wr + (fing - wr) * ((u - 0.6) / 0.4)
        ang = math.radians(F["wing_ang0"] + (F["wing_ang1"] - F["wing_ang0"]) * u)
        d = unit(v3(0, -math.cos(ang), -math.sin(ang)) + LATX * F.get("wing_out", 0.12))
        ln = F["wing_len0"] + (F["wing_len1"] - F["wing_len0"]) * u ** 0.8
        nrm = unit(LATX + v3(0, 0, 0.1))
        base = root + LATX * (0.012 + 0.003 * i)
        mirror_add(flight, base, d, nrm, ln * rng.uniform(0.96, 1.04), ln * 0.25, jitter(pal["wing"], 0.05),
                   curl=-0.1, fold=0.1, tip=1.0, asym=0.3, droop=0.1, rnd=rng.random(), host=("armR",))
        for r2, (lf, of) in enumerate(((0.55, 0.01), (0.32, 0.018))):
            d2 = unit(d + v3(0, 0.0, 0.12 * (r2 + 1)))
            mirror_add(flight, base + LATX * of + v3(0, 0.004, 0.012 + 0.012 * r2), d2, nrm,
                       ln * lf * rng.uniform(0.9, 1.1), ln * lf * 0.48, jitter(pal["wcov"], 0.07),
                       curl=-0.05, fold=0.12, tip=0.4, rnd=rng.random(), host=("armR",))
    # arm fluff: coverts wrapped around humerus and forearm so no bare stick shows
    for seg, (p0, p1, r0, host) in enumerate(((sh + (el - sh) * 0.15, el, 0.04, ("armR",)),
                                             (el, wr, 0.028, ("armR",)))):
        ax = unit(p1 - p0)
        ref = unit(np.cross(ax, LATX)) if abs(np.dot(ax, LATX)) < 0.95 else UP
        for i in range(7):
            u = (i + 0.5 * (seg == 1)) / 7
            c = p0 + (p1 - p0) * u
            for j in range(9):
                ang = 2 * math.pi * j / 9 + (i % 2) * math.pi / 9
                rdir = unit(math.cos(ang) * LATX + math.sin(ang) * ref)
                rdir = unit(rdir - ax * np.dot(rdir, ax))
                if np.dot(rdir, LATX) < -0.6:  # skip the side pressed against the body
                    continue
                root = c + rdir * r0 * 0.7
                d = tangent_dir(rdir, v3(0, -0.6, -0.8))
                ln = F["wing_len0"] * (0.42 if seg == 0 else 0.36) * rng.uniform(0.85, 1.15)
                mirror_add(flight, root, d, rdir, ln, ln * 0.5, jitter(pal["wcov"]), curl=0.35, fold=0.12,
                           tip=0.3, lift=rng.uniform(0.15, 0.3), rnd=rng.random(), host=host)

    # ---------------------------------------------------------------- tail plume: lateral + dorsolateral rows
    a0 = arc_of(body, J[F["tail_from"]])
    nT = F["tail_n"]
    for i in range(nT):
        u = i / (nT - 1)  # 0 = proximal .. 1 = tip
        a = a0 + (0.03 - a0) * u
        t = t_at_arc(body, a)
        ln_base = F["tail_len0"] + (F["tail_len1"] - F["tail_len0"]) * u ** 1.2
        spread = math.radians(F["tail_spread0"] + (F["tail_spread1"] - F["tail_spread0"]) * u)
        for row, (th_deg, lf, upc) in enumerate(((-8, 1.0, -0.05), (35, 0.85, 0.22), (75, 0.6, 0.35))):
            if row == 2 and u < 0.35:
                continue
            th = math.radians(th_deg)
            p, nrm, fw = body.point(t + rng.uniform(-0.5, 0.5), th)
            sp = spread * (1.0 - 0.35 * row)
            d = unit(-fw * math.cos(sp) + LATX * math.sin(sp) + UP * upc)
            nr = unit(nrm - d * np.dot(nrm, d))
            ln = ln_base * lf * rng.uniform(0.9, 1.1)
            mirror_add(flight, p - nrm * 0.006, d, nr, ln, ln * 0.24, jitter(pal["tail"], 0.06),
                       curl=0.12, fold=0.1, tip=1.0, asym=-0.15, droop=rng.uniform(-0.1, 0.1),
                       rnd=rng.random(), host=("body",))
    # terminal fan
    p_tip = body.p[0]
    fw = body.f[0]
    nt = F["tail_tip_n"]
    for k in range(nt):
        sp = math.radians(-18 + 36 * k / max(nt - 1, 1))
        d = unit(-fw * math.cos(sp) + LATX * math.sin(sp) + UP * 0.08)
        nr = unit(UP - d * np.dot(UP, d))
        ln = F["tail_len1"] * rng.uniform(1.0, 1.1)
        flight.add(p_tip + fw * 0.04 + UP * (0.002 * k), d, nr, ln, ln * 0.24, jitter(pal["tail"], 0.05),
                   curl=0.08, fold=0.1, tip=1.0, rnd=rng.random(), host=("body",))
    return [cov, crest, flight]
