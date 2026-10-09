"""Authored Meganeura: segmented bronze/teal body, veined transparent wings, hovering poses."""
import argparse, json, math, os, sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent))
import bpy
from mathutils import Vector
from common import reset_scene,setup_render,setup_lighting,frame_camera,render_to,args_after_dashes


def material(name, color, metal=0, rough=0.4):
    m=bpy.data.materials.new(name);m.use_nodes=True
    nt=m.node_tree; p=nt.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value=(*color,1)
    p.inputs["Metallic"].default_value=metal;p.inputs["Roughness"].default_value=rough
    p.inputs["Coat Weight"].default_value=0.25
    tex=nt.nodes.new("ShaderNodeTexNoise");tex.inputs["Scale"].default_value=45
    bump=nt.nodes.new("ShaderNodeBump");bump.inputs["Strength"].default_value=0.17;bump.inputs["Distance"].default_value=0.007
    nt.links.new(tex.outputs["Fac"],bump.inputs["Height"]);nt.links.new(bump.outputs["Normal"],p.inputs["Normal"])
    return m


def ell(name, pos, scale, mat, parent, detail=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=detail,ring_count=12,location=pos)
    ob=bpy.context.object;ob.name=name;ob.scale=scale;ob.data.materials.append(mat);ob.parent=parent
    for face in ob.data.polygons:face.use_smooth=True
    return ob


def tube(name, pts, radius, mat, parent):
    cu=bpy.data.curves.new(name,"CURVE");cu.dimensions="3D";cu.resolution_u=2;cu.bevel_depth=radius;cu.bevel_resolution=2
    sp=cu.splines.new("POLY");sp.points.add(len(pts)-1)
    for v,p in zip(sp.points,pts):v.co=(*p,1)
    ob=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(ob);ob.data.materials.append(mat);ob.parent=parent
    return ob


def mesh(name, V, F, mat, parent):
    me=bpy.data.meshes.new(name);me.from_pydata(V,[],F);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);ob.data.materials.append(mat);ob.parent=parent
    return ob


def build():
    root=bpy.data.objects.new("Meganeura",None);bpy.context.collection.objects.link(root)
    teal=material("iridescent teal thorax",(0.015,0.19,0.14),0.65,0.29)
    bronze=material("bronze abdomen",(0.29,0.15,0.025),0.5,0.38)
    gold=material("gold dorsal seams",(0.58,0.35,0.055),0.6,0.32)
    dark=material("leg chitin",(0.025,0.038,0.025),0.3,0.32)
    eye=material("compound amber eyes",(0.38,0.11,0.016),0.45,0.18)
    black=material("deep eye focus",(0.006,0.012,0.009),0.2,0.17)
    white=material("eye catchlights",(0.76,0.88,0.76),0.1,0.2)
    membrane=bpy.data.materials.new("iridescent translucent wing membrane");membrane.use_nodes=True
    nt=membrane.node_tree;nt.nodes.clear()
    p=nt.nodes.new("ShaderNodeBsdfPrincipled");p.inputs["Base Color"].default_value=(0.28,0.55,0.52,1)
    p.inputs["Metallic"].default_value=.22;p.inputs["Roughness"].default_value=.23;p.inputs["Coat Weight"].default_value=.45
    p.inputs["Thin Film Thickness"].default_value=420
    tr=nt.nodes.new("ShaderNodeBsdfTransparent");mix=nt.nodes.new("ShaderNodeMixShader");mix.inputs[0].default_value=.30
    out=nt.nodes.new("ShaderNodeOutputMaterial");nt.links.new(tr.outputs[0],mix.inputs[1]);nt.links.new(p.outputs[0],mix.inputs[2]);nt.links.new(mix.outputs[0],out.inputs[0])
    veins=material("gold green wing veins",(0.18,0.25,0.11),0.35,0.35)
    ell("thorax",(0,.10,.29),(.12,.17,.12),teal,root)
    ell("head",(0,.30,.31),(.13,.08,.09),teal,root)
    # A connected taper with separate sclerite plates gives a readable long abdomen.
    tube("abdomen core",[(0,.01,.27),(0,-.35,.25),(0,-.78,.20)],.026,dark,root)
    for i in range(9):
        u=i/8;y=-.04-i*.083;rx=.063*(1-u*.68)
        ell("abdomen plate %d"%i,(0,y,.27-u*.065),(rx,.056,rx*.72),teal if i%3==0 else bronze,root)
        tube("dorsal gold %d"%i,[(-rx*.5,y+.014,.27-u*.065+rx*.67),(0,y+.035,.27-u*.065+rx*.78),(rx*.5,y+.014,.27-u*.065+rx*.67)],.007,gold,root)
    for s in (-1,1):
        ell("compound eye",(s*.085,.323,.347),(.062,.067,.064),eye,root,24)
        ell("eye focus",(s*.098,.369,.351),(.021,.018,.029),black,root)
        ell("eye glint",(s*.095,.378,.376),(.009,.008,.009),white,root)
        tube("antenna",[(s*.035,.35,.37),(s*.045,.40,.405),(s*.067,.43,.40)],.004,dark,root)
        ell("mouth palp",(s*.023,.391,.291),(.022,.026,.013),gold,root)
        for j in range(3):
            y=.16-j*.11
            tube("articulated leg",[(s*.07,y,.24),(s*.16,y+.04,.13),(s*.21,y+.15,.085),(s*.14,y+.21,.11)],.009,dark,root)
            for k in range(3):
                tube("leg bristle",[(s*.18,y+.12+k*.025,.09),(s*.22,y+.12+k*.025,.065)],.0025,dark,root)
    wings=[]
    for s in (-1,1):
        for row in (0,1):
            hinge=bpy.data.objects.new("wing hinge",None);bpy.context.collection.objects.link(hinge);hinge.parent=root
            hinge.location=(s*.085,.12-row*.17,.30);wings.append((hinge,s,row))
            L=.80 if row==0 else .72
            def point(u,v):
                width=(.02+.13*math.sin(math.pi*u)**.65)*(1.18 if row else 1)
                sweep=-.14*u if row else .055*u
                return (s*L*u,sweep+width*v,.025*math.sin(math.pi*u)+.007*v)
            V=[point(i/20,j/4*2-1) for i in range(21) for j in range(5)]
            F=[(i*5+j,(i+1)*5+j,(i+1)*5+j+1,i*5+j+1) for i in range(20) for j in range(4)]
            mesh("four wing membrane",V,F,membrane,hinge)
            for v in (-1,-.4,.28,1):
                tube("longitudinal wing spar",[point(i/20,v) for i in range(21)],.0048 if abs(v)==1 else .003,veins,hinge)
            for i in range(2,20):
                u=i/20
                tube("cross vein",[point(u,-1),point(u+.012,-.4),point(u-.006,.28),point(u,1)],.0023,veins,hinge)
            # Pterostigma: one bronze strengthening cell near the wing tip.
            mesh("bronze wingtip stigma",[point(.77,.55),point(.89,.55),point(.89,.96),point(.77,.96)],[(0,1,2,3)],bronze,hinge)
    return root,wings


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--out",default="art-build/creatures/dragonfly");ap.add_argument("--only",default="");ap.add_argument("--samples",type=int,default=24)
    a=ap.parse_args(args_after_dashes());out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    sc=reset_scene();setup_render(sc,200,180,samples=a.samples);frame_camera(sc,200,180,(.5,.72));setup_lighting(sc)
    root,wings=build()
    poses={"hover":{"frames":6,"fps":16,"loop":True},"idle":{"frames":4,"fps":7,"loop":True},"run":{"frames":6,"fps":16,"loop":True},"hurt":{"frames":2,"fps":12,"loop":False},"dead":{"frames":1,"fps":1,"loop":False}}
    selected=a.only.split(',') if a.only else poses
    manifest=out/"frames.json";old=json.loads(manifest.read_text())["frames"] if manifest.exists() else []
    frames={f['key']:f for f in old}
    for pose in selected:
        n=poses[pose]['frames']
        for direction in range(8):
            for i in range(n):
                phase=math.tau*i/n
                root.rotation_euler=(0,0,-direction*math.pi/4);root.location.z=.055*math.sin(phase)
                if pose=='hurt':root.rotation_euler.y=(-1 if i else 1)*.2
                if pose=='dead':root.rotation_euler.y=math.pi;root.location.z=.53
                for hinge,s,row in wings:
                    angle=.24*math.sin(phase+row*.9) if pose=='idle' else .62*math.sin(phase+row*.95)
                    if pose=='dead':angle=.05
                    hinge.rotation_euler.y=-s*angle
                file=f'{pose}_{direction}_{i}.png';key=f'dragonfly/{pose}/{direction}/{i}'
                if not (out/file).exists():render_to(sc,str(out/file))
                frames[key]={'key':key,'file':file,'ax':100,'ay':130}
                manifest.write_text(json.dumps({'frames':list(frames.values()),'meta':{'id':'dragonfly','poses':poses,'r':.18,'length':1.25,'height':.4}},indent=1))
                print('RENDERED',key,flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'dragonfly.blend'))


if __name__=='__main__':main()
