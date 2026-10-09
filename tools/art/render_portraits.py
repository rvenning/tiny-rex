"""Canonical head portraits from the authored dinosaur meshes, not atlas thumbnails.
blender -b -P tools/art/render_portraits.py -- --id rex_0 --out .scratch/portraits
"""
import os,sys,math,argparse
import bpy
from mathutils import Vector
HERE=os.path.dirname(os.path.abspath(__file__));CREATURES=os.path.join(HERE,'creatures')
sys.path.insert(0,HERE);sys.path.insert(0,CREATURES)
import common
ap=argparse.ArgumentParser();ap.add_argument('--id',required=True);ap.add_argument('--out',required=True)
args=ap.parse_args(common.args_after_dashes());os.makedirs(args.out,exist_ok=True)
if args.id.startswith('rex_'):
    stage=int(args.id[-1]);bpy.ops.wm.open_mainfile(filepath=os.path.join(CREATURES,args.id+'.blend'))
    import rex_lib
    rex=rex_lib.Rex(stage)
    target=Vector(rex.hp(.46,0,-.04));size=rex.HL*1.42
elif args.id=='raptor':
    # Import the driver's functions without dispatching a sprite render.
    sys.argv=['blender','--','--id','raptor','--mode','source','--out',args.out]
    import raptor_render as RR
    C,P=RR.build('raptor')
    import raptor_build as RB
    import raptor_poses as RP
    RB.apply_pose(C,RB.pose_creature(C,RP.rest_pose(C)))
    RR.setup_lighting(bpy.context.scene);RR.add_bounce_ground();RR.add_fill(.25)
    target=Vector((0,.78,1.33));size=.66
elif args.id=='trike':
    import ast,types
    import other_trike as model
    # Use the existing renderer helpers without its unconditional CLI dispatch.
    source=os.path.join(CREATURES,'other_blend.py');tree=ast.parse(open(source).read(),source)
    tree.body=[statement for statement in tree.body if not (isinstance(statement,ast.Expr) and isinstance(statement.value,ast.Call) and isinstance(statement.value.func,ast.Name) and statement.value.func.id=='main')]
    helpers=types.ModuleType('portrait_other_helpers');helpers.__file__=source
    exec(compile(tree,source,'exec'),helpers.__dict__)
    full_model=model.build
    def head_model():
        creature=full_model()
        creature.groups=[g for g in creature.groups if g.name in ['body','frill','horns','beak','eyes','lids']]
        for group in creature.groups:
            if group.name=='body':group.prims=[p for p in group.prims if getattr(p,'bone','') in ['head','neck']]
        return creature
    model.build=head_model
    common.reset_scene();built=helpers.build_creature(model);helpers.to_blender(built,model);helpers.add_rig(bpy.context.scene)
    target=Vector((.25,1.18,1.13));size=2.5
else:raise ValueError('Unsupported authored mesh '+args.id)
scene=bpy.context.scene;common.setup_render(scene,240,240,samples=24,transparent=True)
# Beauty camera is intentionally lower than the world camera: the amber eye,
# snout profile and cream throat occupy the badge, rather than a top-down back.
if scene.camera:camera=scene.camera
else:
    data=bpy.data.cameras.new('Portrait camera');camera=bpy.data.objects.new('Portrait camera',data);scene.collection.objects.link(camera)
scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=size
camera.data.shift_x=0;camera.data.shift_y=0
camera.location=target+Vector((2.5 if args.id=='trike' else 1.9,3.0,.85))*size
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=os.path.join(os.path.abspath(args.out),args.id+'.png')
bpy.ops.render.render(write_still=True)
