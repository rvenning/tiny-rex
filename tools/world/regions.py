"""Connected Adventure authoring, isolated from the currently rendered Hollow.

Integration: build_connected() -> worldgen.Terrain; save() into a NEW build
directory, then render/export that directory. Existing Hollow core is copied
bit-for-bit. REGION_CONTENT is the corresponding runtime content source.
No Blender imports, public files, or existing generator files are modified.
"""
import json
import math
from collections import deque
from pathlib import Path
import numpy as np
from fields import value_noise, poly_dist, ellipse_sdf, smoothstep, catmull
from worldgen import Terrain, SURF, BAKE

BOUNDS = (-20.0, -20.0, 214.0, 150.0)
REGIONS = [
    dict(id="hollow", name="Fern Hollow", bounds=[-2,-2,66,66], nest=dict(x=27,y=35), required=0, built=True, blurb="Learn the hunt. Follow the creek."),
    dict(id="river", name="Riverbend", bounds=[66,-2,130,66], nest=dict(x=100,y=30), required=0, built=True, blurb="Read the river hunter's lunge; grow to cross the ford."),
    dict(id="marsh", name="Reed Marsh", bounds=[66,66,130,130], nest=dict(x=102,y=91), required=1, built=True, blurb="Dry islands and reed lanes let you divide the pack."),
    dict(id="dunes", name="Sunscar dunes", bounds=[130,66,194,130], nest=dict(x=153,y=102), required=2, built=True, blurb="Use rock shade and recovery windows in the open sand."),
    dict(id="ember", name="Ember Basin", bounds=[130,-2,194,66], nest=dict(x=173,y=23), required=3, built=True, blurb="Cross cooled basalt and claim the volcanic nest."),
    dict(id="caves", name="Echo Caves", bounds=[-2,66,66,130], nest=dict(x=30,y=88), required=0, built=True, blurb="Follow pools and fossils; deeper tunnels open as you grow."),
]

TRAILS = {
    # East exit remains exactly the authored Hollow exit at (80,30).
    "river": [(64,31),(80,30),(90,34),(100,30),(113,36),(108,50),(100,66)],
    "marsh": [(100,64),(96,76),(102,91),(111,98),(130,100)],
    "dunes": [(128,100),(141,104),(153,102),(170,96),(162,80),(162,64)],
    "ember": [(162,68),(159,56),(168,45),(179,36),(173,23)],
    "caves": [(33,64),(32,73),(30,88),(22,103),(37,114),(55,111),(65,112)],
}
LOOPS = {
    "river": [(91,34),(82,45),(86,57),(105,57),(113,36)],
    "marsh": [(96,76),(82,83),(84,105),(99,116),(118,110),(111,98)],
    "dunes": [(141,104),(138,117),(160,120),(184,109),(179,86),(162,80)],
    "ember": [(159,56),(143,47),(149,27),(161,13),(173,23),(189,35),(179,36)],
    "caves": [(30,88),(13,88),(12,111),(28,122),(37,114),(49,95),(30,88)],
}
GATES = [
    dict(id="river-ford", kind="growth", x=100,y=66, requiredStage=1, width=6, normal=[0,1], fromRegion="river",toRegion="marsh", name="Shallow ford", blurb="Juvenile Rex can wade the river ford."),
    dict(id="marsh-log", kind="breakable", x=130,y=100, requiredStage=2, width=6, normal=[1,0], fromRegion="marsh",toRegion="dunes",action="bite",prop="log_fallen_gy", name="Rotten log", blurb="Hunter Rex breaks the rotten log with a heavy bite."),
    dict(id="ember-basalt", kind="breakable", x=162,y=66, requiredStage=3, width=7, normal=[0,1], fromRegion="dunes",toRegion="ember",action="bite",prop="rock_outcrop", name="Fractured basalt", blurb="Apex Rex can break the fractured basalt."),
    dict(id="raptor-roots", kind="species", x=64,y=78, species="raptor", requiredStage=0, width=2, normal=[1,0], optional=True, name="Root passage", blurb="Raptor's optional shortcut joins the Marsh edge to the cave refuge."),
    dict(id="trike-rubble", kind="species", x=180,y=109, species="trike", requiredStage=0, width=3, normal=[1,0], optional=True, name="Rubble secret", blurb="Triceratops charge opens a fossil alcove, not the main road."),
]
PORTALS = [
    dict(id="cave-dunes", kind="portal", x=55,y=111, to=dict(x=140,y=116), requiredStage=2, bidirectional=True, optional=True, name="Sunscar tunnel", blurb="Hunter's inner passage joins Echo Caves to the dunes loop."),
    dict(id="cave-ember", kind="portal", x=23,y=105, to=dict(x=146,y=44), requiredStage=3, bidirectional=True, optional=True, name="Deep chamber", blurb="Apex's deep tunnel reaches cooled basalt below the basin."),
    dict(id="raptor-roots-shortcut", kind="portal", x=64,y=78, to=dict(x=28,y=57), species="raptor", requiredStage=0, bidirectional=True, optional=True, name="Root return"),
]
RIVALS = [
    dict(id="river-hunter",name="River Hunter",species="raptor",region="river",home=dict(x=96,y=26)),
    dict(id="marsh-pack",name="Reed Stalkers",species="raptor",region="marsh",home=dict(x=112,y=100),companions=[dict(x=116,y=104)],pattern="alternating-lunges"),
    dict(id="basalt-matriarch",name="Basalt Matriarch",species="gigano",region="ember",home=dict(x=179,y=36),pattern="sweep-then-recover"),
]
SPAWNS = {
    "river": [("beetle",80,32),("beetle",88,35),("dragonfly",82,45),("dragonfly",105,57),("compy",90,34),("compy",92,35),("hypsi",108,49),("oviraptor",113,37),("raptor",96,26)],
    "marsh": [("dragonfly",96,76),("dragonfly",84,105),("beetle",101,93),("compy",82,83),("hypsi",99,116),("raptor",112,100),("raptor",116,104),("oviraptor",118,110),("trike",85,90)],
    "dunes": [("compy",141,104),("compy",142,106),("hypsi",160,120),("dilo",170,96),("raptor",179,86),("trike",184,109),("beetle",153,103)],
    "ember": [("dilo",168,45),("raptor",149,27),("hypsi",161,13),("gigano",179,36),("beetle",173,24),("oviraptor",143,47)],
    "caves": [("beetle",30,89),("beetle",13,88),("compy",22,103),("dragonfly",49,95),("oviraptor",37,114),("dilo",14,113)],
}


def discovery(id, region, kind, name, x, y, blurb, reward=3):
    return dict(id=id,region=region,kind=kind,name=name,x=x,y=y,blurb=blurb,reward=reward)


DISCOVERIES = [
    discovery("fossil-hollow-roots","hollow","fossil","Root-bound vertebra",28,57,"A vertebra caught beside the south trail."),
    discovery("fossil-hollow-cave","hollow","fossil","Stone fern imprint",29,63,"Leaf veins point toward the cave mouth."),
]
# Seventeen new fossil finds plus the original Ancient ribs = eighteen.
FOSSILS = {
    "river": [("river-shell","Spiral shell",82,45),("river-tooth","River hunter tooth",113,36),("river-footprint","Mudstone footprint",86,57)],
    "marsh": [("marsh-wing","Ancient wing print",82,83),("marsh-spine","Reed-bed spine",99,116),("marsh-scale","Armoured scale",118,110)],
    "dunes": [("dunes-ribs","Sun-bleached ribs",160,120),("dunes-claw","Buried claw",179,86),("dunes-frill","Frill fragment",184,109)],
    "ember": [("ember-horn","Basalt horn cast",149,27),("ember-track","Ash-bound track",161,13),("ember-jaw","Volcanic jaw",189,35)],
    "caves": [("caves-ammonite","Pool ammonite",13,88),("caves-skull","Echo skull",12,111),("caves-slab","Layered fossil slab",49,95)],
}
for region, finds in FOSSILS.items():
    for id,name,x,y in finds:
        DISCOVERIES.append(discovery("fossil-"+id,region,"fossil",name,x,y,"Study the fossil and mark this side trail."))
for r in REGIONS[1:]:
    n=r["nest"]
    DISCOVERIES.append(discovery("nest-"+r["id"],r["id"],"nest",r["name"]+" refuge",n["x"],n["y"],"Rest, bank discoveries and choose an unlocked species.",0))
    DISCOVERIES.append(discovery("forage-"+r["id"],r["id"],"forage","Refuge forage",n["x"]+2,n["y"]+1,"Healing food in the safe clearing.",0))
DISCOVERIES += [
    discovery("tracks-river","river","tracks","Hunter tracks",90,34,"Watch the lunge before committing to the fight.",2),
    discovery("tracks-marsh","marsh","tracks","Two sets of prints",111,98,"Reed lanes let you separate the coordinated hunters.",2),
    discovery("egg-marsh","marsh","egg","Lost clutch",84,105,"Bring the clutch back to the Marsh refuge."),
    discovery("tracks-ember","ember","tracks","Territorial marks",168,45,"The matriarch sweeps a wide arc; give her room.",2),
]
OBJECTIVES = [
    dict(id="stalk-first",region="hollow",name="Quiet paws",kind="slow-hunt",target="beetle",count=3,reward=3),
    dict(id="read-river",region="river",name="Read the river hunter",kind="clean-rival",target="river-hunter",maxHits=0,reward=8),
    dict(id="reed-watch",region="river",name="Wait for a wingbeat",kind="settled-hunt",target="dragonfly",count=3,reward=5),
    dict(id="lost-clutch",region="marsh",name="The lost clutch",kind="deliver-discovery",target="egg-marsh",destination="nest-marsh",reward=8),
    dict(id="split-pack",region="marsh",name="One hunter at a time",kind="separated-rival",target="marsh-pack",reward=10),
    dict(id="hatchling-escort",region="marsh",name="A safe path home",kind="escort",to=dict(x=102,y=91),reward=8,**{'from':dict(x=82,y=83)}),
    dict(id="sunscar-flank",region="dunes",name="Shade and flank",kind="recovery-hunt",target="dilo",count=2,reward=10),
    dict(id="leave-herd",region="dunes",name="Respect the herd",kind="observe-neutral",target="trike",seconds=15,reward=5),
    dict(id="echo-trail",region="caves",name="Read the rock record",kind="regional-fossils",target="caves",count=3,reward=8),
    dict(id="basalt-mastery",region="ember",name="The clean claim",kind="clean-rival",target="basalt-matriarch",maxHits=0,reward=20),
]
REGION_CONTENT = dict(regions=REGIONS, gates=GATES, portals=PORTALS, rivals=RIVALS, discoveries=DISCOVERIES, objectives=OBJECTIVES, spawns=SPAWNS)

# All names/variant counts belong to the existing rendered prop kit.
KIT = {"fern_small":4,"fern_medium":4,"fern_large":4,"tree_fern":3,"palm_small":3,"palm_tall":3,"cycad":3,
       "grass_tuft":4,"reed_clump":3,"cattail_clump":3,"flower_red_spike":3,"flower_purple":3,"broadleaf":3,
       "horsetail":3,"clover_patch":4,"moss_clump":4,"mushroom_cluster":3,"lily_pad":3,"boulder_s":4,
       "boulder_m":4,"boulder_l":3,"rock_pebbles":5,"flat_stone":4,"rock_outcrop":3,"log_fallen_gx":3,
       "log_fallen_gy":3,"log_pile":3,"nest_big":3,"egg_single":3,"fossil_ribs":2,"bone_skull":2,
       "cliff_columns":4,"cliff_columns_gy":4,"waterfall_rock":2,"river_bank_rock_cluster":4}
SOLID_RADIUS = {"tree_fern":.25,"palm_small":.22,"palm_tall":.3,"boulder_s":.35,"boulder_m":.7,"boulder_l":1.3,
                "rock_outcrop":2,"cliff_columns":.6,"cliff_columns_gy":.6,"river_bank_rock_cluster":.9,"nest_big":.9}
PALETTES = {
    "river": ["fern_medium","fern_large","grass_tuft","reed_clump","broadleaf","flower_red_spike","river_bank_rock_cluster","boulder_s"],
    "marsh": ["reed_clump","cattail_clump","horsetail","grass_tuft","lily_pad","fern_medium","moss_clump","boulder_s"],
    "dunes": ["grass_tuft","rock_pebbles","boulder_s","boulder_m","fossil_ribs","bone_skull"],
    "ember": ["cliff_columns","boulder_m","rock_pebbles","bone_skull","grass_tuft"],
    "caves": ["boulder_m","boulder_l","rock_outcrop","mushroom_cluster","moss_clump","bone_skull","fossil_ribs"],
}


def _rect(g, bounds, feather=2):
    x0,y0,x1,y1=bounds
    d=np.minimum.reduce([g.X-x0,g.Y-y0,x1-g.X,y1-g.Y])
    return smoothstep(-feather,feather,d)


def _path(g, points, width):
    if all(np.hypot(p[0]-points[0][0],p[1]-points[0][1])<1e-6 for p in points):
        return _room(g,points[0][0],points[0][1],width/2)
    d,_=poly_dist(g,catmull(points,5))
    return 1-smoothstep(width/2-.6,width/2+.6,d)


def _room(g,x,y,r):
    d=np.hypot(g.X-x,g.Y-y)
    return 1-smoothstep(r-.7,r+.7,d)


def add_prop(T,n,x,y,scale=1,blocking=True):
    iy,ix=T.g.idx(x,y)
    r=SOLID_RADIUS.get(n,0)*scale
    T.props.append(dict(n=n,v=int(T.rng.integers(KIT[n])),x=round(float(x),3),y=round(float(y),3),
                        z=round(float(T.z[iy,ix]),3),s=round(scale,3),b=int(n in BAKE)))
    if blocking and r: T.solids.append((float(x),float(y),r))


def apply_regions(T):
    """Add five biomes to expanded Terrain; never modify x<=64 AND y<=64."""
    g=T.g
    protect=(g.X<=64)&(g.Y<=64)
    coarse=value_noise(g,8,131,3);detail=value_noise(g,2,133,2)
    for r in REGIONS[1:]:
        id=r['id'];mask=_rect(g,r['bounds']);mask=np.where(protect,0,mask)
        trail=_path(g,TRAILS[id],5.4);loop=_path(g,LOOPS[id],4.2)
        rooms=_room(g,r['nest']['x'],r['nest']['y'],5.7)
        for p in DISCOVERIES:
            if p['region']==id: rooms=np.maximum(rooms,_room(g,p['x'],p['y'],2.4))
        for c,x,y in SPAWNS[id]: rooms=np.maximum(rooms,_room(g,x,y,3 if c in ('raptor','gigano','dilo') else 1.8))
        # Explicit spokes connect every authored site to a trail, rather than
        # creating attractive but unreachable isolated clearings.
        points=TRAILS[id]+LOOPS[id]
        for p in DISCOVERIES:
            if p['region']!=id:continue
            q=min(points,key=lambda q:(q[0]-p['x'])**2+(q[1]-p['y'])**2)
            trail=np.maximum(trail,_path(g,[q,(p['x'],p['y'])],3.8))
        for c,x,y in SPAWNS[id]:
            q=min(points,key=lambda q:(q[0]-x)**2+(q[1]-y)**2)
            trail=np.maximum(trail,_path(g,[q,(x,y)],4.4))
        safe=np.maximum.reduce([trail,loop,rooms])
        safe=_path(g,TRAILS[id],5.8)*.05+safe*.95
        base=(coarse-.5)*.52+(detail-.5)*.12
        water=g.zeros(np.nan);weights={n:g.zeros() for n in SURF}
        if id=='river':
            river,_=poly_dist(g,catmull([(64,27.5),(75,25),(84,21),(96,22),(112,28),(117,42),(107,56),(100,68)],8))
            wet=(river<3.0)&(safe<.4)
            z=base+(.7+coarse)*np.maximum(0,1-safe)*.8-np.where(wet,.8,0)
            water=np.where(wet,-.2,np.nan).astype(np.float32)
            weights['grass']=1-safe;weights['dirt']=safe;weights['gravel']=1-smoothstep(3,5,river);weights['mud']=1-smoothstep(3,4,river)
        elif id=='marsh':
            wet=(coarse<.58)&(safe<.4)
            z=base*.5-np.where(wet,.7,0)+safe*.2
            water=np.where(wet,-.15,np.nan).astype(np.float32)
            weights['mud']=(1-safe)*.7;weights['moss']=(1-safe)*.5;weights['dirt']=safe;weights['grass']=.25
        elif id=='dunes':
            dune=(np.sin(g.X*.22+g.Y*.13+coarse*2)+1)*1.1
            z=base+dune*(1-safe*.94)
            weights['sand']=1;weights['rock']=(1-safe)*smoothstep(.7,.92,coarse);weights['gravel']=safe*.35
        elif id=='ember':
            fissure,_=poly_dist(g,catmull([(140,7),(146,18),(144,33),(157,42),(177,52),(192,59)],7))
            lava=(fissure<1.25)&(safe<.35)
            z=base*.5+(1-safe)*(1.5+coarse*1.2)-lava*.7
            weights['basalt']=1;weights['ash']=safe*.6;weights['lava']=lava.astype(np.float32)
        else:
            wall=np.maximum(0,1-safe)
            z=base*.3+wall*(2.2+coarse*1.1)
            pool=(ellipse_sdf(g,46,98,3,2)<0)&(safe<.3)
            water=np.where(pool,-.1,np.nan).astype(np.float32);z-=pool*.8
            weights['rock']=1;weights['basalt']=wall*.55;weights['gravel']=safe*.7;weights['moss']=(1-safe)*.12
        # Quiet, gently sloped travel/combat surfaces; detailed higher perimeter.
        z=z*(1-safe*.86)+base*.12*safe
        T.z=T.z*(1-mask)+z*mask
        for n in SURF:T.w[n]=T.w[n]*(1-mask)+weights[n]*mask
        active=mask>.5
        T.water=np.where(active,water,T.water).astype(np.float32)
        T.open=np.where(active,safe,T.open).astype(np.float32)
        T.keep=np.where(active,np.maximum(trail,rooms),T.keep).astype(np.float32)
        T.forest=np.where(active,(1-safe) if id in ('river','marsh') else 0,T.forest).astype(np.float32)
    # Two-unit region seams are traversable, but cannot disturb Hollow's core.
    for a,b in [((63,31),(72,31)),((100,62),(100,72)),((126,100),(135,100)),((162,62),(162,72)),((33,62),(33,72))]:
        corridor=_path(g,[a,b],6);m=(corridor>.35)&~protect
        T.open=np.where(m,np.maximum(T.open,corridor),T.open)
        T.keep=np.where(m,np.maximum(T.keep,corridor),T.keep)
        T.water=np.where(m,np.nan,T.water)
        T.z=np.where(m,T.z*(1-corridor*.9),T.z)
    # A visible shallow ford, navigable in the collision export. The growth
    # gate separately prevents a hatchling entering the Marsh prematurely.
    ford=(np.abs(g.X-100)<3.4)&(np.abs(g.Y-66)<2.1)
    T.z=np.where(ford,-.15,T.z)
    T.water=np.where(ford,.05,T.water)
    T.normalise()
    return T


def scatter_regions(T):
    """Natural irregular clusters, with every combat lane and refuge kept clear."""
    g=T.g
    for r in REGIONS[1:]:
        id=r['id'];x0,y0,x1,y1=r['bounds'];pal=PALETTES[id]
        # Deterministic sparse candidate sampling avoids thousands of meshes
        # being baked into a single huge Blender scene. Small props bake only.
        for _ in range(750 if id in ('river','marsh') else 360):
            x,y=T.rng.uniform(x0+3,x1-3),T.rng.uniform(y0+3,y1-3)
            iy,ix=g.idx(x,y)
            if T.keep[iy,ix]>.25:continue
            wet=np.isfinite(T.water[iy,ix])
            n=str(T.rng.choice(pal))
            if wet and n not in ('lily_pad','reed_clump','cattail_clump','river_bank_rock_cluster'):continue
            if not wet and n=='lily_pad':continue
            add_prop(T,n,x,y,float(T.rng.uniform(.72,1.18)))
        nest=r['nest'];add_prop(T,'nest_big',nest['x']-3,nest['y']-2,.75)
        T.pois['nest-'+id]=dict(x=nest['x'],y=nest['y'],region=id)
    for p in DISCOVERIES:
        if p['region']=='hollow':continue
        T.pois[p['id']]=dict(x=p['x'],y=p['y'],kind=p['kind'],region=p['region'])
        if p['kind']=='fossil':add_prop(T,'fossil_ribs' if 'ribs' in p['id'] or 'spine' in p['id'] else 'bone_skull',p['x']+.9,p['y']+.7,.65,False)
    for y in (64.3,66,67.7):add_prop(T,'flat_stone',100,y,.8,False)
    # Gates are runtime blockers that can be removed. Do not permanently bake
    # their collision into Terrain.solids or opened routes will stay blocked.
    for gate in GATES:T.features.append(dict(type='gate',**gate))
    for portal in PORTALS:T.features.append(dict(type='portal',**portal))
    for r in REGIONS:T.features.append(dict(type='region',**r))
    return T


def build_connected(seed=7, cell=.25):
    """Copy the accepted existing world; append regions without changing it."""
    import worldgen
    old=worldgen.build(seed)
    T=Terrain(BOUNDS,cell,seed)
    if abs(old.g.cell-cell)>1e-6:raise ValueError('Use the existing .25 cell size to preserve Hollow exactly')
    T.forest=T.g.zeros()
    iy0,ix0=T.g.idx(old.g.x0,old.g.y0)
    sl=np.s_[iy0:iy0+old.g.ny,ix0:ix0+old.g.nx]
    for n in ('z','water','open','keep','forest'):getattr(T,n)[sl]=getattr(old,n)
    for n in SURF:T.w[n][sl]=old.w[n]
    T.props=[p.copy() for p in old.props if p['x']<=64 and p['y']<=64]
    T.solids=[s for s in old.solids if s[0]<=64 and s[1]<=64]
    T.pois=dict(old.pois);T.features=list(old.features);T.creek_pts=old.creek_pts
    apply_regions(T);scatter_regions(T)
    # Final exact copy protects old surfaces from any normalisation rounding.
    core=(old.g.X<=64)&(old.g.Y<=64)
    for n in ('z','water','open','keep','forest'):
        # Hollow's open/keep masks are float64; truncating them to float32
        # would subtly alter the accepted world even after copying values.
        setattr(T,n,getattr(T,n).astype(getattr(old,n).dtype,copy=False))
        v=getattr(T,n)[sl];v[core]=getattr(old,n)[core]
    for n in SURF:T.w[n][sl][core]=old.w[n][core]
    T._hollow_reference=old
    return T


def validate(T):
    """Export-equivalent geometry check, including solid radii and safe routes."""
    from worldgen import SURF
    g=T.g;gy,gx=np.gradient(T.z,g.cell);slope=np.hypot(gx,gy)
    depth=np.where(np.isfinite(T.water),T.water-T.z,0)
    walk=(T.open>.35)&(slope<=1.25)&(depth<=.55)
    for x,y,r in T.solids:walk &= (g.X-x)**2+(g.Y-y)**2 >= (r*.9)**2
    # Flood fill ignores dynamic progression gates; stage reachability is the
    # explicit adjacent-region gate graph supplied in metadata.
    start=g.idx(27,35);seen=np.zeros(walk.shape,bool);q=deque([start]);seen[start]=True
    while q:
        y,x=q.popleft()
        for yy,xx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
            if 0<=yy<g.ny and 0<=xx<g.nx and walk[yy,xx] and not seen[yy,xx]:seen[yy,xx]=True;q.append((yy,xx))
    targets={r['id']+' nest':r['nest'] for r in REGIONS}
    targets.update({p['id']:p for p in DISCOVERIES})
    targets.update({r['id']:r['home'] for r in RIVALS})
    unreachable=[]
    for name,p in targets.items():
        y,x=g.idx(p['x'],p['y']);box=seen[max(0,y-3):y+4,max(0,x-3):x+4]
        if not box.any():unreachable.append(name)
    finite=bool(np.isfinite(T.z).all() and all(np.isfinite(T.w[n]).all() for n in SURF))
    old=T._hollow_reference;iy0,ix0=g.idx(old.g.x0,old.g.y0);sl=np.s_[iy0:iy0+old.g.ny,ix0:ix0+old.g.nx];core=(old.g.X<=64)&(old.g.Y<=64)
    exact=all(np.array_equal(getattr(T,n)[sl][core],getattr(old,n)[core],equal_nan=True) for n in ('z','water','open','keep','forest'))
    exact &= all(np.array_equal(T.w[n][sl][core],old.w[n][core]) for n in SURF)
    progression={'Hatchling':['hollow','river','caves'], 'Juvenile':['hollow','river','caves','marsh'],
                 'Hunter':['hollow','river','caves','marsh','dunes'], 'Apex':[r['id'] for r in REGIONS]}
    return dict(bounds=BOUNDS,shape=list(T.z.shape),finite=finite,hollowCoreBitExact=bool(exact),reachableTargets=len(targets)-len(unreachable),totalTargets=len(targets),unreachable=unreachable,progressionGraph=progression,
                regionCount=len(REGIONS),newDiscoveries=len(DISCOVERIES),totalFossils=18,optionalObjectives=len(OBJECTIVES),props=len(T.props),walkableCells=int(walk.sum()))


if __name__=='__main__':
    import argparse,worldgen
    ap=argparse.ArgumentParser();ap.add_argument('--out',default='art-build/connected-preview');a=ap.parse_args()
    out=Path(a.out)
    # A caller cannot accidentally replace the active/public world.
    if 'public' in out.parts or out.resolve()==Path('art-build/world').resolve():raise ValueError('Use a private new preview directory')
    T=build_connected();report=validate(T);worldgen.save(T,str(out))
    (out/'region-content.json').write_text(json.dumps(REGION_CONTENT,indent=2))
    (out/'validation.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
