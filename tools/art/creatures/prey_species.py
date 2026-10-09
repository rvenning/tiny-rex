"""Authored Hollow species using a shared anatomical rig, with distinct bodies.
Compy: slender unfeathered green runner; Hypsi: ochre broad grazer with beak;
Oviraptor: short-tailed slate bird dinosaur with copper helmet and wing feathers.
"""
import copy,math
import numpy as np
import raptor_species as RS
import raptor_poses as RP
from raptor_geo import smoothstep

def lin(rgb):return RS.lin(rgb)
def no_feathers(C):return []

def colors(C,ctx,kind):
    p=C.P;pos=ctx['pos'];n=len(pos);zero=np.zeros(n)
    upper=lin(p['palette'][0]);under=lin(p['palette'][1]);dark=lin(p['palette'][2]);scale=p['anatomy_scale']
    if kind=='skin':
        dorsal=smoothstep(-.55,.20,ctx['zl'])
        col=RS.mixc(under,upper,dorsal)
        # Subtle irregular flank bands continue across muscles rather than armor plates.
        stripes=(.5+.5*np.sin(pos[:,1]*23/scale+np.sin(pos[:,2]*12/scale)))
        head=smoothstep(C.joints['nb'][1],C.joints['occ'][1],pos[:,1])
        band=(1-head)*smoothstep(.7,.92,stripes)*dorsal*.30
        col=RS.mixc(col,dark,band)
        if p['id']=='hypsilophodon':
            # Dark horny beak at a shortened blunt muzzle.
            beak=smoothstep(C.joints['sn1'][1],C.joints['snt'][1],pos[:,1])
            col=RS.mixc(col,lin((61,48,33)),beak*.9)
        elif p['id']=='oviraptor':
            beak=smoothstep(C.joints['eye'][1]+.01*scale,C.joints['snt'][1],pos[:,1])
            col=RS.mixc(col,lin((69,57,42)),beak)
            # The tall bony helmet is copper; the face remains slate and cream.
            crest=smoothstep(1.40*scale,1.53*scale,pos[:,2])*head
            col=RS.mixc(col,lin((173,94,44)),crest)
        for side in [-1,1]:
            d=np.linalg.norm(pos-np.asarray(p['eye']['c'])*[side,1,1],axis=1)
            col=RS.mixc(col,lin((32,31,23)),smoothstep(p['eye']['r']*1.5,p['eye']['r']*1.05,d))
        return col,np.ones(n)*.85,zero
    if kind=='jaw':return np.tile(under,(n,1)),np.ones(n)*.7,zero
    if kind=='arm':return np.tile(upper*.8,(n,1)),np.ones(n)*.8,zero
    raise KeyError(kind)

def profile_scale(p,factor):
    """Scale lengths only; angles, profile exponents, bone names and directions stay unitless."""
    for key in ['body','jaw']:
        p[key]=[tuple([row[0]]+[float(v)*factor for v in row[1:7]]+[row[7]]) for row in p[key]]
    p['eye']['c']=tuple(np.asarray(p['eye']['c'])*factor);p['eye']['r']*=factor
    p['nostril']=tuple(np.asarray(p['nostril'])*factor)
    for blob in p['blobs']:
        for key in ['c','r']:blob[key]=tuple(np.asarray(blob[key])*factor)
    for key in p['break_widths']:p['break_widths'][key]=tuple(np.asarray(p['break_widths'][key])*factor)
    leg=p['leg']
    for key in ['hip_x','hip_z','femur','tibia','meta','toe','ball_x','ball_y','ball_z','thigh_top_y','thigh_top_z']:leg[key]*=factor
    for profile in [leg['prof'],p['arm']['prof']]:
        for key,value in profile.items():
            if isinstance(value,(float,int)):profile[key]=value*factor
            else:profile[key]=[tuple([v*factor for v in row[:4]]+[row[4]]) for row in value]
    for toe in leg['toes'].values():
        for key in ['x','claw','claw_r']:
            if key in toe:toe[key]*=factor
        for key in ['segs','rad']:toe[key]=tuple(np.asarray(toe[key])*factor)
    arm=p['arm']
    for key in ['shoulder','elbow','wrist','knuckle']:arm[key]=tuple(np.asarray(arm[key])*factor)
    for finger in arm['fingers']:
        for key in ['rad','claw','claw_r']:finger[key]*=factor
        for key in ['segs','off']:finger[key]=tuple(np.asarray(finger[key])*factor)
    for teeth in p['teeth']:
        for key in ['y0','y1','rad','out']:teeth[key]*=factor
        teeth['len']=tuple(np.asarray(teeth['len'])*factor)
    for key in ['cov_len','ruff_len','crest_len','crest_step','cheek_len','thigh_len','wing_len0','wing_len1','tail_len0','tail_len1']:p['fl'][key]*=factor
    p['voxel']*=factor;p['spacing']*=factor;p['anatomy_scale']=factor
    return p

def species(id):
    p=copy.deepcopy(RS.RAPTOR);p['id']=id;p['colors']=colors
    p['mat']={'skin':{'rough':.68,'fuzz_bump':.035,'scale_bump':.18,'sheen':.12},'eye':{'iris':(.56,.28,.028)}}
    # Remove the raised sickle claw: these animals have ordinary walking toes.
    p['leg']['toes']['d2']=copy.deepcopy(p['leg']['toes']['d4']);p['leg']['toes']['d2']['yaw']=-.28
    p['leg']['toes'].pop('d1')
    if id=='compy':
        factor=.48;p['palette']=[(112,145,65),(224,205,146),(47,81,43)]
        p['feathers']=no_feathers;p['teeth'][0]['n']=6
        p['body']=[tuple([r[0],r[1]*1.12 if r[1]<0 else r[1],r[2]]+[v*.82 for v in r[3:7]]+[r[7]]) for r in p['body']]
        p['eye']['r']=.043
        p['meta']=dict(r=.4,length=1.25,height=.48)
    elif id=='hypsilophodon':
        factor=.78;p['palette']=[(153,105,49),(222,202,146),(91,64,37)]
        p['feathers']=no_feathers;p['teeth']=[]
        rows=[]
        for r in p['body']:
            name,y,z,*rest=r
            if name in ['hip','mid','chest']:rest[:4]=[v*1.75 for v in rest[:4]]
            if name in ['occ','eye']:rest[:4]=[v*1.35 for v in rest[:4]]
            if y<0:y*=.83
            if name in ['sn1','sn2','snt','tip']:y=.73+(y-.73)*.56
            rows.append(tuple([name,y,z]+rest))
        p['body']=rows
        p['jaw']=[tuple([r[0],.73+(r[1]-.73)*.56 if r[1]>.73 else r[1],r[2]]+list(r[3:])) for r in p['jaw']]
        p['eye']['r']=.051;p['nostril']=(.029,.847,1.27)
        shoulder=np.asarray(p['arm']['shoulder'])
        for key in ['elbow','wrist','knuckle']:p['arm'][key]=tuple(shoulder+(np.asarray(p['arm'][key])-shoulder)*.60)
        p['arm']['fingers']=p['arm']['fingers'][:2]
        p['meta']=dict(r=.55,length=1.6,height=.78)
    else:
        factor=.92;p['palette']=[(54,91,101),(213,199,160),(24,49,59)]
        rows=[]
        for r in p['body']:
            name,y,z,*rest=r
            if y<0:y*=.58
            if name in ['hip','mid','chest']:rest[:4]=[v*1.45 for v in rest[:4]]
            if name in ['occ','eye']:rest[:4]=[v*1.30 for v in rest[:4]]
            if name in ['sn1','sn2','snt','tip']:
                y=.74+(y-.74)*.42;z-=.055*max(0,(y-.74)/.11)
            rows.append(tuple([name,y,z]+rest))
        p['body']=rows
        p['jaw']=[tuple([r[0],.74+(r[1]-.74)*.42 if r[1]>.74 else r[1],r[2]-.025]+list(r[3:])) for r in p['jaw']]
        p['teeth']=[];p['eye']['r']=.041;p['nostril']=(.025,.82,1.265)
        # Tall continuous parrot-like helmet instead of the Raptor feather crest.
        p['blobs']+= [dict(c=(0,.72,1.445),r=(.033,.10,.15)),dict(c=(0,.79,1.43),r=(.035,.075,.12))]
        p['fl'].update(crest_len=.012,crest_up=.2,crest_back='occ',cov_len=.09,wing_len0=.28,wing_len1=.36,tail_from='t2',tail_len0=.10,tail_len1=.17,tail_n=9)
        for key,stops in p['fpal'].items():
            base=lin((46,76,92)) if key not in ['crest','ruff'] else lin((171,96,53))
            p['fpal'][key]=[(t,base*(.65+.4*math.sin(math.pi*t))) for t,_ in stops]
        p['meta']=dict(r=.65,length=1.9,height=.92)
    return profile_scale(p,factor)

for id in ['compy','hypsilophodon','oviraptor']:
    RS.SPECIES[id]=species(id)
    RP.SPECIES_POSES[id]=['idle','run','hurt']+(['windup','bite','recover'] if id=='oviraptor' else [])

# Stride and hop distances fit each animal's own anatomy, not a full-size Raptor.
for name,original in list(RP.POSES.items()):
    def adjusted(C,f,n,original=original):
        pose=original(C,f,n);scale=C.P.get('anatomy_scale',1)
        if 'root' in pose:pose['root']=tuple(v*scale for v in pose['root'])
        for side,leg in pose.get('legs',{}).items():
            rest=np.asarray(C.sk.legs[side]['rest']['ball']);leg['ball']=list(rest+(np.asarray(leg['ball'])-rest)*scale)
        return pose
    RP.POSES[name]=adjusted
