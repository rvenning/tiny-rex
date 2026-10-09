"""Small creature CUDA export; fixed two host threads while terrain renders."""
import importlib,runpy,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent));sys.path.insert(0,str(HERE))
import common
species_id=sys.argv[sys.argv.index('--id')+1]
scale=float(sys.argv[sys.argv.index('--scale')+1]) if '--scale' in sys.argv else 1
species=importlib.import_module('other_'+species_id)
species.META['renderScale']=scale
original=common.setup_render

def bounded_cuda(scene,w,h,samples=8,**kw):
    result=original(scene,w,h,samples=samples,**kw)
    import bpy
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='CUDA';prefs.get_devices()
    gpus=[d for d in prefs.devices if d.type=='CUDA']
    if not gpus:
        raise RuntimeError('CUDA creature export requested but no CUDA device is available')
    for d in prefs.devices:d.use=d.type=='CUDA'
    scene.cycles.device='GPU'
    scene.render.threads_mode='FIXED';scene.render.threads=2
    print('EXTRA_CUDA',[(d.name,d.type,d.use) for d in prefs.devices],flush=True)
    return result

common.setup_render=bounded_cuda
from extra_export import export
export(species,HERE/'other_blend.py')
import bpy
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/(species_id+'.blend')))
