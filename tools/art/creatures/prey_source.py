"""Save an editable native Blender scene from the authored species recipe."""
import os,sys
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
id=sys.argv[sys.argv.index('--id')+1]
sys.argv=['blender','--','--id',id,'--mode','source','--out','.scratch/prey/source']
import prey_species
import raptor_render as RR
import raptor_poses as RP
import raptor_build as RB
import bpy
C,P=RR.build(id)
# Rigid eyes and lids are authored in local coordinates; place the canonical
# rest pose before saving an editable source, just as sprite rendering does.
RB.apply_pose(C,RB.pose_creature(C,RP.rest_pose(C)))
w,h,ax,ay=RR.layout(C,RP.SPECIES_POSES[id])
RR.scene_setup(w,h,24,(ax/w,ay/h))
RR.setup_lighting(bpy.context.scene);RR.add_bounce_ground()
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(__file__),id+'.blend'),compress=True)
