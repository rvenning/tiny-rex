"""Reproducible Tiny Rex sprite source. Run with Blender 4.5 -b -P this.py -- out-dir.
All geometry is authored here; no downloaded models. Rendered eight-view articulated rigs.
"""
import bpy, math, os, sys
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'work/art'
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 256
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'
scene.world.color = (0.2, 0.27, 0.23)

def material(name, rgb, rough=.65, noise=False):
    m = bpy.data.materials.new(name); m.diffuse_color = (*rgb, 1); m.use_nodes=True
    nodes=m.node_tree.nodes; p=nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*rgb,1); p.inputs['Roughness'].default_value=rough
    if noise:
        n=nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value=28
        b=nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value=.06; b.inputs['Distance'].default_value=.018
        m.node_tree.links.new(n.outputs['Fac'], b.inputs['Height']); m.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal'])
    return m
JADE=material('Fern jade',(.012,.19,.065),noise=True)
CREAM=material('Warm cream',(.74,.65,.37),noise=True)
AMBER=material('Golden dorsal scales',(.85,.4,.045),noise=True)
CORAL=material('Raptor coral',(.64,.14,.08),noise=True)
TEAL=material('Triceratops river teal',(.035,.31,.33),noise=True)
BLACK=material('Pupil and claws',(.015,.023,.02),.25)
EYE=material('Amber iris',(.96,.48,.015),.2)
WHITE=material('Eye glint and teeth',(.96,.91,.69),.3)
ROCK=material('Basalt',(.1,.13,.16),noise=True)
LEAF=material('Fern leaf',(.07,.24,.07),noise=True)
WOOD=material('Weathered log',(.23,.12,.045),noise=True)

def ell(name, loc, scale, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=loc)
    ob=bpy.context.object; ob.name=name; ob.scale=scale; ob.data.materials.append(mat)
    for f in ob.data.polygons: f.use_smooth=True
    if parent:
        ob.parent=parent; ob.matrix_parent_inverse=parent.matrix_world.inverted()
    return ob
def cone(name,a,b,r1,r2,mat,parent=None):
    a,b=Vector(a),Vector(b); d=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=r1,radius2=r2,depth=d.length,location=(a+b)/2)
    ob=bpy.context.object; ob.name=name; ob.rotation_euler=d.to_track_quat('Z','Y').to_euler(); ob.data.materials.append(mat)
    bevel=ob.modifiers.new('Rounded edge','BEVEL'); bevel.width=.035; bevel.segments=2
    for f in ob.data.polygons: f.use_smooth=True
    if parent: ob.parent=parent; ob.matrix_parent_inverse=parent.matrix_world.inverted()
    return ob
def pivot(name,loc,parent=None):
    ob=bpy.data.objects.new(name,None); scene.collection.objects.link(ob); ob.location=loc
    if parent: ob.parent=parent; ob.matrix_parent_inverse=parent.matrix_world.inverted()
    return ob
def clear_character():
    for ob in list(bpy.data.objects):
        if ob.name not in ['Camera','Key','Fill','Rim']: bpy.data.objects.remove(ob,do_unlink=True)

bpy.ops.object.camera_add(location=(7,7,8.2)); camera=bpy.context.object; camera.name='Camera'; scene.camera=camera
camera.data.type='ORTHO'; camera.data.ortho_scale=5.9
target=Vector((0,0,1.2)); camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
def light(name,loc,power,size):
    bpy.ops.object.light_add(type='AREA',location=loc); o=bpy.context.object; o.name=name; o.data.energy=power; o.data.shape='DISK'; o.data.size=size
    o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
light('Key',(-3,-5,8),650,5); light('Fill',(5,-2,4),130,4); light('Rim',(-2,5,6),300,4)

def fuse(objects, name, parent):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bpy.ops.object.join(); ob=bpy.context.object; ob.name=name
    remesh=ob.modifiers.new('Continuous sculpt','REMESH'); remesh.mode='VOXEL'; remesh.voxel_size=.045
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth=ob.modifiers.new('Sculpt polish','SMOOTH'); smooth.factor=1.2; smooth.iterations=6
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    for p in ob.data.polygons: p.use_smooth=True
    return ob

def dinosaur(kind,stage):
    clear_character(); root=pivot('Root',(0,0,0)); skin=CORAL if kind=='raptor' else TEAL if kind=='trike' else JADE
    quad=kind=='trike'; mature=stage/3
    headx=1.03+.16*mature; headz=1.85+.08*mature
    body=ell('Torso',(-.18,0,1.2),(.89,.4,.58),skin,root)
    chest=ell('Chest',(.38,0,1.48),(.45,.35,.55),skin,root)
    fuse([body,chest],'Sculpted body',root)
    ell('Belly',(.03,-.02,1.08),(.68,.39,.43),CREAM,root)
    head=pivot('Neck',(0.5,0,1.5),root)
    ell('Neck',(.58,0,1.69),(.34,.31,.46),skin,head)
    skull=ell('Skull',(headx,0,headz),(.53+.08*mature,.32,.42-.06*mature),skin,head)
    snout=ell('Snout',(headx+.38+.07*mature,0,headz-.08),(.43+.18*mature,.27,.22),skin,head)
    fuse([skull,snout],'Sculpted skull',head)
    jaw=pivot('Jaw hinge',(headx-.07,0,headz-.28),head)
    ell('Lower jaw',(headx+.24,0,headz-.33),(.6+.1*mature,.285,.115),CREAM,jaw)
    for side in [-1,1]:
        y=side*.327
        ell('Eye white',(headx+.05,y,headz+.15),(.16,.061,.165),WHITE,head)
        ell('Iris',(headx+.078,y*1.16,headz+.148),(.112,.032,.119),EYE,head)
        ell('Pupil',(headx+.095,y*1.22,headz+.15),(.045,.021,.078),BLACK,head)
        ell('Glint',(headx+.065,y*1.28,headz+.198),(.029,.013,.03),WHITE,head)
        brow=ell('Brow',(headx+.02,y,headz+.3),(.23,.09,.07),skin,head); brow.rotation_euler[1]=-.13*mature
        ell('Nostril',(headx+.65,side*.29,headz+.015),(.055,.018,.035),BLACK,head)
        for i in range(5): cone('Tooth',(headx+.03+i*.16,side*.245,headz-.21),(headx+.03+i*.16,side*.245,headz-.29),.034,0,WHITE,head)
    tail=pivot('Tail hip',(-.7,0,1.28),root)
    tails=[]
    for i in range(7):
        x=-.68-i*.255
        tails.append(cone('Tail segment',(x,0,1.32-i*.025),(x-.3,0,1.28-i*.025),max(.015,.31-i*.043),max(.005,.28-i*.044),skin,tail))
    fuse(tails,'Sculpted tail',tail)
    legs=[]
    for side in [-1,1]:
        leg=pivot('Hip '+str(side),(-.35,side*.32,1),root); legs.append(leg)
        ell('Thigh',(-.4,side*.37,.91),(.34,.26,.48),skin,leg)
        cone('Shin',(-.36,side*.36,.65),(-.16,side*.36,.23),.15,.1,skin,leg)
        ell('Foot',(.02,side*.36,.15),(.35,.18,.1),skin,leg)
        for j in [-1,0,1]: cone('Toe claw',(.2,side*.36+j*.09,.15),(.4,side*.36+j*.09,.1),.054,.01,BLACK,leg)
        if not quad:
            cone('Upper arm',(.42,side*.34,1.38),(.71,side*.38,1.06),.13,.075,skin,root)
            cone('Forearm',(.71,side*.38,1.06),(.87,side*.4,1.15),.075,.06,skin,root)
            for j in range(2): cone('Finger',(.85,side*.4+j*.035,1.13),(.96,side*.4+j*.035,1.02),.035,.003,BLACK,root)
    for i in range(8):
        x=-1.45+i*.31
        ell('Dorsal scale',(x,0,1.38+(.49 if x>-.7 else 0)),(.13,.2,.085),AMBER,root)
    for side in [-1,1]:
        for i in range(7):
            x=-.78+i*.23
            stripe=ell('Amber flank scales',(x,side*.32,1.52),(.06,.07,.14),AMBER,root)
            stripe.rotation_euler[1]=-.35
    if kind=='raptor':
        for side in [-1,1]:
            for i in range(5):
                cone('Wing feather',(.45,side*.35,1.34),(.01-i*.12,side*(.62+i*.09),1.2),.08,.007,CORAL,root)
        for i in range(7): cone('Crest',(headx-.3+i*.1,0,headz+.32),(headx-.38+i*.1,0,headz+.52),.09,.003,AMBER,head)
    if quad:
        # Rebuild head silhouette and add frill/horns and weight-bearing forelegs.
        frill=ell('Frill',(.62,0,1.95),(.13,.65,.62),skin,head)
        for a in range(9):
            angle=math.pi*(a/8)
            ell('Frill studs',(.58,math.cos(angle)*.62,1.94+math.sin(angle)*.58),(.09,.08,.09),AMBER,head)
        for side in [-1,1]:
            cone('Horn',(headx-.03,side*.25,headz+.28),(headx+.67,side*.26,headz+.67),.105,.006,CREAM,head)
            leg=pivot('Front hip'+str(side),(.6,side*.32,1.1),root); legs.append(leg)
            ell('Foreleg',(.6,side*.35,.65),(.19,.2,.57),skin,leg); ell('Hoof',(.7,side*.35,.15),(.23,.19,.12),BLACK,leg)
        cone('Nose horn',(headx+.55,0,headz+.1),(headx+.77,0,headz+.42),.095,0,CREAM,head)
    return root,head,jaw,tail,legs

def render_character(kind,stage,preview=False):
    root,head,jaw,tail,legs=dinosaur(kind,stage)
    model=f'{kind}-{stage}'; os.makedirs(os.path.join(OUT,model),exist_ok=True)
    if '--source-only' in sys.argv:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,model+'.blend'))
        return
    if preview:
        scene.render.resolution_x=scene.render.resolution_y=768; scene.cycles.samples=64
        scene.render.filepath=os.path.join(OUT,'rex-preview.png'); bpy.ops.render.render(write_still=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'rex-source.blend'))
        return
    scene.render.resolution_x=scene.render.resolution_y=192
    scene.cycles.samples=12
    for direction in range(8):
        root.rotation_euler[2]=direction*math.pi/4
        for pose in range(8):
            phase=(pose-1)*math.pi/1.5 if 1<=pose<=3 else 0
            for i,leg in enumerate(legs): leg.rotation_euler[1]=.3*math.sin(phase+(i%2)*math.pi) if 1<=pose<=3 else 0
            root.location.z=.04*abs(math.sin(phase)) if 1<=pose<=3 else 0
            head.rotation_euler[1]=-.13 if pose==6 else .14 if pose==4 else 0
            jaw.rotation_euler[1]=.5 if pose in [4,6] else 0
            tail.rotation_euler[2]=.12*math.sin(phase)
            root.rotation_euler[1]=.13 if pose==7 else 0
            scene.render.filepath=os.path.join(OUT,model,f'{direction}-{pose}.png')
            bpy.ops.render.render(write_still=True)

def props():
    scene.render.resolution_x=scene.render.resolution_y=256; scene.cycles.samples=24
    names=['rock','fern','palm','log','nest','basalt','bone','flower']
    for name in names:
        clear_character(); camera.data.ortho_scale=4.6
        if name in ['rock','basalt']:
            for i in range(4):
                ell('Boulder',((i%2)*.7-.35,(i//2)*.6-.3,.45+i*.06),(.62,.57,.65),ROCK)
        elif name=='log':
            cone('Log',(-1.2,0,.35),(1.1,0,.35),.35,.27,WOOD)
            ell('Log end',(1.12,0,.35),(.035,.25,.25),CREAM)
            for i in range(3):cone('Branch',(-.6+i*.5,0,.4),(-.5+i*.5,.5,.9),.13,.08,WOOD)
        elif name in ['fern','palm','flower']:
            if name=='palm': cone('Trunk',(0,0,0),(.1,0,1.65),.12,.08,WOOD)
            h=1.65 if name=='palm' else .15
            for j in range(9):
                a=j*2*math.pi/9
                for i in range(4):
                    r=.25+i*.22
                    leaf=ell('Leaf',(math.cos(a)*r,math.sin(a)*r,h+.35*math.sin(i*.8)),(.45,.12,.035),LEAF)
                    leaf.rotation_euler[2]=a
                    if name=='flower' and i==3:ell('Flower',(math.cos(a)*r,math.sin(a)*r,h+.5),(.1,.1,.1),AMBER)
        elif name=='nest':
            for j in range(18):
                a=j*math.pi*2/18
                cone('Nest weave',(math.cos(a)*.78,math.sin(a)*.78,.22),(math.cos(a+.7)*.75,math.sin(a+.7)*.75,.22),.065,.055,WOOD)
            for i in range(3):ell('Egg',(-.25+i*.23,.1*(i%2),.3),(.19,.15,.26),CREAM)
        else:
            for j in range(4):
                a=j*.45-.5
                cone('Rib',(j*.35-.5,0,.12),(j*.35-.5,.65,.75),.075,.06,CREAM)
                cone('Rib',(j*.35-.5,.65,.75),(j*.35-.5,1,.45),.06,.045,CREAM)
            cone('Spine',(-.7,0,.13),(1,0,.13),.1,.1,CREAM)
        scene.render.filepath=os.path.join(OUT,f'prop-{name}.png'); bpy.ops.render.render(write_still=True)

if '--props' in sys.argv: props()
elif '--preview' in sys.argv: render_character('rex',2,True)
else:
    for stage in range(4): render_character('rex',stage)
    for kind in ['raptor','trike']: render_character(kind,2)
