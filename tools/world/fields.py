"""numpy-only field helpers for the world generator (no Blender, no scipy).

Grids are float32 arrays indexed [iy, ix]; cell centre = (x0 + (ix+.5)*cell, y0 + (iy+.5)*cell)
in GAME units (x = gx, y = gy).
"""
import numpy as np


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    return a + (b - a) * t


class Grid:
    def __init__(self, x0, y0, x1, y1, cell):
        self.x0, self.y0, self.x1, self.y1, self.cell = x0, y0, x1, y1, cell
        self.nx = int(round((x1 - x0) / cell))
        self.ny = int(round((y1 - y0) / cell))
        xs = x0 + (np.arange(self.nx) + 0.5) * cell
        ys = y0 + (np.arange(self.ny) + 0.5) * cell
        self.X, self.Y = np.meshgrid(xs.astype(np.float32), ys.astype(np.float32))

    def zeros(self, v=0.0):
        return np.full((self.ny, self.nx), v, np.float32)

    def idx(self, x, y):
        return (
            int(np.clip((y - self.y0) / self.cell, 0, self.ny - 1)),
            int(np.clip((x - self.x0) / self.cell, 0, self.nx - 1)),
        )


def value_noise(grid, scale, seed, octaves=1, persistence=0.5, lac=2.0):
    """fBm value noise sampled at the grid's X,Y; feature size ~ `scale` units. Range ~[0,1]."""
    rng = np.random.default_rng(seed)
    out = np.zeros_like(grid.X)
    amp, tot = 1.0, 0.0
    s = scale
    for _ in range(octaves):
        gx = grid.X / s
        gy = grid.Y / s
        ix = np.floor(gx).astype(np.int64)
        iy = np.floor(gy).astype(np.int64)
        fx = (gx - ix).astype(np.float32)
        fy = (gy - iy).astype(np.float32)
        fx = fx * fx * (3 - 2 * fx)
        fy = fy * fy * (3 - 2 * fy)
        n = 512
        lat = rng.random((n, n)).astype(np.float32)
        ix0, iy0 = ix % n, iy % n
        ix1, iy1 = (ix + 1) % n, (iy + 1) % n
        v = (
            lat[iy0, ix0] * (1 - fx) * (1 - fy)
            + lat[iy0, ix1] * fx * (1 - fy)
            + lat[iy1, ix0] * (1 - fx) * fy
            + lat[iy1, ix1] * fx * fy
        )
        out += v * amp
        tot += amp
        amp *= persistence
        s /= lac
    return (out / tot).astype(np.float32)


def seg_dist(X, Y, a, b):
    """distance from each cell to segment a-b, and parameter t in [0,1]"""
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy + 1e-9
    t = np.clip(((X - ax) * dx + (Y - ay) * dy) / L2, 0, 1)
    px, py = ax + t * dx, ay + t * dy
    return np.hypot(X - px, Y - py), t


def poly_dist(grid, pts):
    """distance to a polyline and arclength-fraction u in [0,1] of the nearest point"""
    pts = [tuple(p) for p in pts]
    lens = [np.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1)]
    total = sum(lens)
    best = np.full_like(grid.X, 1e9)
    u = np.zeros_like(grid.X)
    acc = 0.0
    for i in range(len(pts) - 1):
        d, t = seg_dist(grid.X, grid.Y, pts[i], pts[i + 1])
        m = d < best
        best = np.where(m, d, best)
        u = np.where(m, (acc + t * lens[i]) / total, u)
        acc += lens[i]
    return best, u


def catmull(pts, per=12):
    """Smooth a control polyline into a dense one (Catmull-Rom)."""
    P = [np.array(p, np.float64) for p in pts]
    P = [P[0]] + P + [P[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(per):
            t = k / per
            out.append(
                0.5
                * (
                    2 * p1
                    + (-p0 + p2) * t
                    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t**3
                )
            )
    out.append(P[-2])
    return [tuple(float(v) for v in p) for p in out]


def ellipse_sdf(grid, cx, cy, rx, ry, rot=0.0):
    c, s = np.cos(rot), np.sin(rot)
    dx, dy = grid.X - cx, grid.Y - cy
    u = (dx * c + dy * s) / rx
    v = (-dx * s + dy * c) / ry
    # approx signed distance in units (positive outside)
    return (np.hypot(u, v) - 1.0) * min(rx, ry)


def poisson(rng, bounds, r, mask_fn, tries=30, existing=None):
    """Bridson-like dart sampling. mask_fn(x,y)->bool acceptance. Returns list of (x,y)."""
    x0, y0, x1, y1 = bounds
    cs = r / np.sqrt(2)
    gw, gh = int((x1 - x0) / cs) + 1, int((y1 - y0) / cs) + 1
    cells = {}
    pts = []

    def near(x, y, rad):
        ix, iy = int((x - x0) / cs), int((y - y0) / cs)
        k = int(np.ceil(rad / cs))
        for j in range(iy - k, iy + k + 1):
            for i in range(ix - k, ix + k + 1):
                for q in cells.get((i, j), ()):
                    if (q[0] - x) ** 2 + (q[1] - y) ** 2 < rad * rad:
                        return True
        return False

    n = int((x1 - x0) * (y1 - y0) / (r * r) * 2.2)
    for _ in range(n):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        if not mask_fn(x, y):
            continue
        if existing and any((e[0] - x) ** 2 + (e[1] - y) ** 2 < r * r for e in existing):
            continue
        if near(x, y, r):
            continue
        cells.setdefault((int((x - x0) / cs), int((y - y0) / cs)), []).append((x, y))
        pts.append((x, y))
    return pts
