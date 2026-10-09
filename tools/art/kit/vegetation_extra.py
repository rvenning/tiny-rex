"""Complete the authored vegetation palette with crowns and small ground dressing."""
import math
import numpy as np
from . import Prop
from .veg_geom import Bufs, lathe
from .veg_palette import finish
from .veg_ferns import build_cycad, palm_builder, build_foreground
from .veg_parts import blades, plume, paddle, petals, stems, disc, ellipsoid


def grass(rng, tall=False):
    b = Bufs()
    rs = np.random.default_rng(rng.randrange(1 << 30))
    k = 42 if tall else 55
    start = np.column_stack([rs.uniform(-0.23, 0.23, k), rs.uniform(-0.23, 0.23, k), np.zeros(k)])
    blades(b, "reed" if tall else "grass", rng, K=k, start=start,
           L=rs.uniform(0.7, 1.25, k) if tall else rs.uniform(0.18, 0.48, k),
           pitch=rs.uniform(0.9, 1.5, k), droop=rs.uniform(0.2, 0.7, k), yaw=rs.uniform(0, math.tau, k),
           width=rs.uniform(0.015, 0.027, k), fold=0.5)
    if tall:
        for _ in range(5):
            plume(b, rng, start=(rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), 0),
                  L=rng.uniform(1.1, 1.5), stem_mat="reed", flower_mat="reed_plume", yaw=rng.uniform(0, math.tau),
                  plume_frac=0.24, branch_len=0.055, floret=0.01, branches=8, density=65)
    b.clamp_ground()
    return finish(b, "reeds" if tall else "grass")


def astilbe(rng):
    b = Bufs()
    for _ in range(rng.randint(6, 9)):
        p = (rng.uniform(-0.28, 0.28), rng.uniform(-0.28, 0.28), 0)
        yaw = rng.uniform(0, math.tau)
        plume(b, rng, start=p, L=rng.uniform(0.65, 1.05), stem_mat="astilbe_stem", flower_mat="astilbe",
              yaw=yaw, droop=rng.uniform(0.05, 0.25), plume_frac=0.44, branch_len=0.11,
              floret=0.016, branches=15, density=120)
        for j in range(2):
            paddle(b, "astilbe_leaf", rng, start=(p[0], p[1], 0.12 + j * 0.12),
                   L=rng.uniform(0.22, 0.36), W=0.07, pitch=0.5, droop=0.4, yaw=yaw + j * math.pi,
                   tears=2, n=10, nv=5, fold=0.3)
    b.clamp_ground()
    return finish(b, "astilbe")


def purple(rng):
    b = Bufs()
    for _ in range(rng.randint(9, 15)):
        x, y = rng.uniform(-0.28, 0.28), rng.uniform(-0.28, 0.28)
        h = rng.uniform(0.22, 0.5)
        stems(b, "purple_stem", rng, np.array([[(x, y, 0), (x+0.025, y, h*0.5), (x, y+0.03, h)]]), 0.007)
        petals(b, "purple", rng, center=(x, y+0.03, h), normal=(0, 0, 1), n=5,
               length=0.085, width=0.05, cup=0.2)
        paddle(b, "purple_leaf", rng, start=(x, y, 0.06), L=0.18, W=0.065,
               pitch=0.4, droop=0.45, yaw=rng.uniform(0, math.tau), n=10, nv=5)
    b.clamp_ground()
    return finish(b, "purple")


def broadleaf(rng):
    b = Bufs()
    for _ in range(rng.randint(7, 11)):
        yaw = rng.uniform(0, math.tau)
        paddle(b, "banana", rng, start=(0, 0, 0.02), L=rng.uniform(0.8, 1.5), W=rng.uniform(0.16, 0.25),
               pitch=rng.uniform(0.65, 1.2), droop=rng.uniform(0.4, 1), yaw=yaw, tears=rng.randint(1, 4),
               n=24, nv=7, fold=0.22, wave=0.04)
    b.clamp_ground()
    return finish(b, "broadleaf")


def cattail(rng):
    objs = grass(rng, True)
    b = Bufs()
    for _ in range(5):
        x, y, h = rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), rng.uniform(1, 1.5)
        stems(b, "reed", rng, np.array([[(x,y,0), (x,y,h)]]), 0.009)
        ellipsoid(b, "cattail_head", rng, (x,y,h), 0.04, 0.15, sides=12, rings=10, lumps=0.04)
    return objs + finish(b, "cattail_heads")


def horsetail(rng):
    b = Bufs()
    for _ in range(9):
        x, y, h = rng.uniform(-0.22,0.22), rng.uniform(-0.22,0.22), rng.uniform(0.5,1.05)
        stems(b,"horsetail_stem",rng,np.array([[(x,y,0),(x,y,h)]]),0.014,0.009,sides=8)
        for z in np.linspace(0.13,h*0.92,6):
            k=8
            yaw=np.arange(k)*math.tau/k+rng.random()
            blades(b,"horsetail",rng,K=k,start=(x,y,z),L=0.16,width=0.005,pitch=0.35,droop=0.15,yaw=yaw,n=5)
    return finish(b,"horsetail")


def clover(rng):
    b=Bufs()
    for _ in range(30):
        x,y,z=rng.uniform(-0.4,0.4),rng.uniform(-0.4,0.4),rng.uniform(0.025,0.1)
        a=rng.uniform(0,math.tau)
        stems(b,"clover_stem",rng,np.array([[(x,y,0),(x,y,z)]]),0.003)
        for j in range(3):
            aa=a+j*math.tau/3
            disc(b,"clover",rng,center=(x+math.cos(aa)*0.04,y+math.sin(aa)*0.04,z),radius=0.045,
                 n_r=3,n_a=14,lift=0.1,notch=0.18,notch_dir=aa,wave=0.03)
    return finish(b,"clover")


def moss(rng):
    b=Bufs()
    k=170
    rs=np.random.default_rng(rng.randrange(1<<30))
    start=np.column_stack([rs.uniform(-0.28,0.28,k),rs.uniform(-0.28,0.28,k),np.zeros(k)])
    blades(b,"moss",rng,K=k,start=start,L=rs.uniform(0.035,0.09,k),width=0.009,pitch=rs.uniform(0.6,1.5,k),
           droop=0.2,yaw=rs.uniform(0,math.tau,k),n=4)
    return finish(b,"moss")


def mushrooms(rng):
    b=Bufs()
    mat=rng.choice(["mush_amber","mush_red","mush_honey"])
    for _ in range(rng.randint(4,8)):
        x,y,h=rng.uniform(-0.3,0.3),rng.uniform(-0.3,0.3),rng.uniform(0.1,0.25)
        radii=np.array([0.022,0.02,0.03,0.09,0.12,0.09,0.012])*(h/0.18)
        z=np.array([0,0.08,0.13,0.135,0.15,0.2,0.22])*(h/0.18)
        V,Q=lathe(radii,z,sides=20,center=(x,y,0))
        V=V.reshape(-1,3)
        A=np.zeros((len(V),4));A[:,0]=np.repeat(np.linspace(0,1,len(radii)),20);A[:,2:]=rng.random()
        b[mat].add(V,Q,A)
    return finish(b,"mushroom_cluster")


def lily(rng):
    b=Bufs()
    for _ in range(3):
        x,y=rng.uniform(-0.25,0.25),rng.uniform(-0.25,0.25)
        disc(b,"lilypad",rng,center=(x,y,0.01),radius=rng.uniform(0.17,0.27),notch=0.35,
             notch_dir=rng.uniform(0,math.tau),lift=0.06,wave=0.035,n_r=6,n_a=30)
    petals(b,"lily_flower",rng,center=(x,y,0.055),normal=(0,0,1),n=9,length=0.1,width=0.033,cup=0.4)
    return finish(b,"lily_pad")


FH = ("fern_hollow", "jungle")
RB = ("fern_hollow", "riverbend", "jungle")
PROPS = {
    "cycad": Prop(build_cycad, 3, r=0.22, h=1.5, kind="soft", frame=(360, 300), anchor=(0.5, 0.73), tags=FH),
    "palm_small": Prop(palm_builder(False), 3, r=0.22, h=3.3, kind="solid", frame=(520, 490), anchor=(0.5, 0.83), tags=RB),
    "palm_tall": Prop(palm_builder(True), 3, r=0.3, h=5.3, kind="solid", frame=(650, 650), anchor=(0.5, 0.85), tags=RB),
    "foreground_frond": Prop(build_foreground, 4, r=0, h=2.2, kind="soft", frame=(700, 470), anchor=(0.5, 0.65), tags=FH),
    "grass_tuft": Prop(grass, 4, r=0, h=0.4, kind="deco", frame=(130, 100), anchor=(0.5, 0.7), bake=True, tags=RB),
    "reed_clump": Prop(lambda rng: grass(rng, True), 3, r=0, h=1.5, kind="soft", frame=(230, 220), anchor=(0.5, 0.83), tags=("riverbend",)),
    "flower_red_spike": Prop(astilbe, 3, r=0, h=1.0, kind="soft", frame=(220, 180), anchor=(0.5, 0.82), tags=RB),
    "flower_purple": Prop(purple, 3, r=0, h=0.5, kind="deco", frame=(160, 130), anchor=(0.5, 0.75), bake=True, tags=RB),
    "broadleaf": Prop(broadleaf,3,r=0,h=1.3,kind="soft",frame=(340,270),anchor=(0.5,0.75),tags=RB),
    "cattail_clump": Prop(cattail,3,r=0,h=1.6,kind="soft",frame=(230,230),anchor=(0.5,0.85),tags=RB),
    "horsetail": Prop(horsetail,3,r=0,h=1.0,kind="soft",frame=(210,180),anchor=(0.5,0.8),tags=RB),
    "clover_patch": Prop(clover,4,r=0,h=0.1,kind="deco",frame=(130,100),anchor=(0.5,0.55),bake=True,tags=RB),
    "moss_clump": Prop(moss,4,r=0,h=0.1,kind="deco",frame=(100,80),anchor=(0.5,0.55),bake=True,tags=RB),
    "mushroom_cluster": Prop(mushrooms,3,r=0,h=0.3,kind="deco",frame=(150,115),anchor=(0.5,0.7),bake=True,tags=RB),
    "lily_pad": Prop(lily,3,r=0,h=0.1,kind="deco",frame=(160,110),anchor=(0.5,0.6),tags=RB),
}
