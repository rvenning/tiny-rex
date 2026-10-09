"""Repair pre-rest-pose native prey sources without remeshing or rendering.
The authored rest pose is {}, so its skinning matrices are identity. Only
rigid eyes missed their rest placement in the old source-only export.
"""
import os,sys
import bpy,numpy as np
from mathutils import Matrix
HERE=os.path.dirname(os.path.abspath(__file__));sys.path.insert(0,HERE)
import prey_species
import raptor_species as RS
from raptor_geo import eye_mesh
for id in ['compy','hypsilophodon','oviraptor']:
    path=os.path.join(HERE,id+'.blend');bpy.ops.wm.open_mainfile(filepath=path)
    E=RS.SPECIES[id]['eye']
    for side,sign in [('R',1),('L',-1)]:
        center=np.asarray(E['c'],float)*np.array([sign,1,1])
        direction=np.asarray(E['dir'],float)*np.array([sign,1,1])
        _,_,R,c,r=eye_mesh(center,E['r'],direction)
        M=np.eye(4);M[:3,:3]=R*r;M[:3,3]=c
        eye=bpy.data.objects[id+'_eye'+side];eye.matrix_basis=Matrix(M.tolist())
        assert np.allclose(np.asarray(eye.matrix_basis)[:3,3],center)
        print(id,side,'canonical eye center',tuple(eye.location))
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=path,compress=True)
print('Three authored sources repaired; runtime atlases unchanged.')
