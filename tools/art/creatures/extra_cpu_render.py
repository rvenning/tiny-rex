"""Run the established creature export on a bounded CPU while terrain uses GPU."""
import importlib,runpy,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent));sys.path.insert(0,str(HERE))
import common
id=sys.argv[sys.argv.index('--id')+1]
scale=float(sys.argv[sys.argv.index('--scale')+1]) if '--scale' in sys.argv else 1
species=importlib.import_module('other_'+id)
species.META['renderScale']=scale
original=common.setup_render
def cpu_render(scene,w,h,samples=24,**kw):
    result=original(scene,w,h,samples=min(samples,16),**kw)
    scene.cycles.device='CPU'
    scene.render.threads_mode='FIXED';scene.render.threads=2
    return result
common.setup_render=cpu_render
runpy.run_path(str(HERE/'other_blend.py'),run_name='__main__')
import bpy
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/(id+'.blend')))
