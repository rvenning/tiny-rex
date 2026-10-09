"""Register authored Hollow species, then run the common creature render driver."""
import os,sys
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import prey_species
import bpy
from bpy.app.handlers import persistent
if '--mode' in sys.argv and sys.argv[sys.argv.index('--mode')+1]=='poses':
    id=sys.argv[sys.argv.index('--id')+1]
    @persistent
    def save_source(scene):
        bpy.app.handlers.render_pre.remove(save_source)
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(__file__),id+'.blend'),compress=True)
    bpy.app.handlers.render_pre.append(save_source)
import raptor_render
