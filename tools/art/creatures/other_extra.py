"""Authored late-world creature anatomy using the signed-distance skin pipeline.

These models share only construction helpers, not Rex/Raptor/Trike meshes.
Dilophosaurus has a slender skull and paired thin crests; Giganotosaurus has
a deep elongated skull, powerful hips and a long heavy tail; Kentrosaurus is
a small-headed quadruped with alternating dorsal plates and paired tail spikes.
"""
import math
import numpy as np
import other_core as oc
from other_core import Ell,Cone,Chain,Fn

MATERIALS={
    'hide':dict(kind='skin',scale=65,scale2=28,groove=.13,bump=.38,bump_dist=.011,rough=.57,spec=.4,jitter=.045,
                groove_dark=.13,ao=.35,ao_dist=.18,wrinkle=.2,wrinkle_scale=9,sss=.04,coat=.1),
    'horn':dict(kind='skin',scale=25,bump=.2,bump_dist=.006,groove=.1,rough=.36,spec=.45,jitter=.035,ao=.25,ao_dist=.08,coat=.18),
    'crest':dict(kind='skin',scale=35,bump=.14,bump_dist=.008,rough=.46,spec=.45,jitter=.04,ao=.25,ao_dist=.08,sss=.08),
    'eye':dict(kind='skin',scale=200,bump=0,rough=.08,coat=1,spec=.8,ao=.12,ao_dist=.015),
}
CONFIG={
    'dilophosaurus':dict(scale=1.05,length=4.8,height=2.0,r=.85,base=(.26,.075,.026),belly=(.55,.35,.14),accent=(.68,.24,.04),arm=.38,headY=1.47,headZ=1.46),
    'gigano':dict(scale=1.9,length=9.2,height=3.4,r=1.7,base=(.055,.115,.15),belly=(.29,.34,.29),accent=(.35,.24,.065),arm=.18,headY=1.44,headZ=1.4),
    'kentro':dict(scale=1.05,length=4.8,height=1.7,r=.95,base=(.11,.20,.055),belly=(.38,.39,.15),accent=(.56,.20,.065),headY=1.47,headZ=.65),
}


def build(id):
    cfg=CONFIG[id];s=cfg['scale'];m=oc.Model(id);sk=m.skel;quad=id=='kentro'
    def vec(p):return np.asarray(p,float)*s
    def E(p,r,b,**kw):return Ell(vec(p),vec(r),b,**kw)
    def C(a,b,ra,rb,bone,**kw):return Cone(vec(a),vec(b),ra*s,rb*s,bone,**kw)
    def chain(p,r,bone,**kw):return Chain([vec(v) for v in p],np.array(r)*s,bone,**kw)
    def bone(n,parent,p):sk.add(n,parent,vec(p))
    bone('root',None,(0,-.15,1 if not quad else .85));bone('chest','root',(0,.42,1.05 if not quad else .88))
    bone('neck','chest',(0,.86,1.3 if not quad else .79));bone('head','neck',(0,cfg['headY']-.25,cfg['headZ']))
    bone('jaw','head',(0,cfg['headY']-.15,cfg['headZ']-.1))
    for i,p in enumerate([(0,-.8,.98),(0,-1.35,.85),(0,-1.95,.73)]):bone('tail'+str(i+1),'root' if not i else 'tail'+str(i),p)
    for side,sgn in [('R',1),('L',-1)]:
        bone('th'+side,'root',(sgn*.35,-.45,.96));bone('sh'+side,'th'+side,(sgn*.38,-.10,.51));bone('hf'+side,'sh'+side,(sgn*.39,-.40,.13))
        bone('ua'+side,'chest',(sgn*.27,.5,.95));bone('fa'+side,'ua'+side,(sgn*.39,.66,.40 if quad else .69));bone('ff'+side,'fa'+side,(sgn*.39,.81,.12 if quad else .64))
    def detail(P,D):
        n=oc.fbm(P/s,5,2,seed=21)
        ridge=np.clip((P[:,2]/s-.9)*2,0,1)*(P[:,1]/s<.7)
        return s*(n*.009-ridge*np.maximum(0,np.sin(P[:,1]/s*17))*.007)
    body=m.group('anatomy','hide',.025*s,detail=detail,smooth=2);body.falloff=.065*s
    body.add(E((0,-.14,.96 if not quad else .84),(.42 if not quad else .51,.82,.40 if not quad else .43),'root',tag='torso'),
             E((0,.48,1.08 if not quad else .87),(.34 if not quad else .42,.42,.34),'chest',k=.17*s,tag='chest'),
             E((0,.03,.76 if not quad else .65),(.34,.63,.24),'root',k=.12*s,tag='belly'),
             C((0,.65,1.18 if not quad else .8),(0,1.13,1.45 if not quad else .68),.23 if not quad else .17,.15,'neck',k=.12*s,tag='neck'),
             C((0,-.76,.99),(0,-1.35,.85),.27,.15,'tail1',k=.11*s,tag='tail'),
             C((0,-1.35,.85),(0,-1.95,.73),.15,.075,'tail2',k=.05*s,tag='tail'),
             chain([(0,-1.95,.73),(0,-2.4,.68),(0,-2.8,.59)],[.075,.045,.012],'tail3',k=.04*s,tag='tail'))
    hy,hz=cfg['headY'],cfg['headZ']
    if quad:
        body.add(E((0,1.27,.68),(.13,.23,.13),'head',k=.07*s,tag='head'),E((0,1.5,.61),(.11,.19,.10),'head',k=.06*s,tag='snout'))
    else:
        broad=id=='gigano'
        body.add(E((0,1.18,hz),(.23 if broad else .17,.26,.22 if broad else .15),'head',tag='head'),
                 E((0,1.48,hz-.06),(.18 if broad else .12,.36,.16 if broad else .10),'head',k=.07*s,tag='snout'),
                 E((0,1.78,hz-.10),(.145 if broad else .085,.14,.11 if broad else .068),'head',k=.05*s,tag='snout'))
        jaw=m.group('lower jaw','hide',.016*s,smooth=2,rigid='jaw')
        jaw.add(E((0,1.47,hz-.215 if broad else hz-.15),(.145 if broad else .092,.34,.065),'jaw',tag='jaw'),
                C((0,1.22,hz-.17),(0,1.77,hz-.17),.105 if broad else .06,.065 if broad else .035,'jaw',k=.05*s,tag='jaw'))
    for side,sgn in [('R',1),('L',-1)]:
        body.add(E((sgn*.32,-.43,.83),(.22,.39,.37),'th'+side,k=.13*s,tag='leg'),
                 C((sgn*.35,-.45,.89),(sgn*.38,-.1,.51),.16,.105,'th'+side,k=.06*s,tag='leg'),
                 C((sgn*.38,-.1,.51),(sgn*.39,-.4,.14),.095,.065,'sh'+side,k=.04*s,tag='leg'),
                 E((sgn*.39,-.34,.085),(.1,.17,.068),'hf'+side,k=.03*s,tag='foot'))
        if quad:
            body.add(C((sgn*.27,.5,.87),(sgn*.39,.66,.40),.13,.085,'ua'+side,k=.07*s,tag='leg'),
                     C((sgn*.39,.66,.4),(sgn*.39,.81,.12),.075,.061,'fa'+side,k=.03*s,tag='leg'),
                     E((sgn*.39,.85,.075),(.09,.13,.065),'ff'+side,k=.03*s,tag='foot'))
        else:
            reach=cfg['arm']
            body.add(C((sgn*.27,.5,.97),(sgn*.38,.56,.77),.07,.045,'ua'+side,k=.04*s,tag='arm'),
                     C((sgn*.38,.56,.77),(sgn*.36,.56+reach,.69),.04,.028,'fa'+side,k=.025*s,tag='arm'))
            for j in range(3 if id=='dilophosaurus' else 2):
                x=sgn*.36+(j-1)*.027
                body.add(C((x,.56+reach,.69),(x,.65+reach,.65),.018,.009,'ff'+side,k=.014*s,tag='finger'))
        for j in range(3):
            body.add(C((sgn*.39+(j-1)*.048,-.31,.075),(sgn*.39+(j-1)*.052,-.08,.045),.035,.016,'hf'+side,k=.022*s,tag='toe'))
    body.add(oc.Plane((0,0,-1),-.004*s,k=.006*s))
    horns=m.group('claws and teeth','horn',.011*s,smooth=1)
    for side,sgn in [('R',1),('L',-1)]:
        for j in range(3):horns.add(C((sgn*.39+(j-1)*.052,-.09,.047),(sgn*.39+(j-1)*.05,-.02,.025),.02,.003,'hf'+side,tag='claw'))
        if not quad:
            for j in range(3 if id=='dilophosaurus' else 2):
                x=sgn*.36+(j-1)*.027;reach=cfg['arm']
                horns.add(chain([(x,.64+reach,.66),(x,.69+reach,.64),(x,.7+reach,.61)],[.009,.007,.002],'ff'+side,n=3,tag='claw'))
            for y in np.linspace(1.3,1.76,7):
                x=sgn*(.145 if id=='gigano' else .087)
                horns.add(C((x,y,hz-.14),(x,y+.015,hz-.21),.018 if id=='gigano' else .011,.002,'head',tag='tooth'))
    eyes=m.group('expressive eyes','eye',.006*s,smooth=1,rigid='head')
    ex=.218 if id=='gigano' else .157 if not quad else .12
    ez=hz+.06 if not quad else hz+.08
    for sgn in (-1,1):
        eye_scale=1.25 if id=='gigano' else 1
        eyes.add(E((sgn*(ex-.012),1.25,ez),np.array((.043,.060,.049))*eye_scale,'head',tag='orbit'))
        eyes.add(E((sgn*ex,1.25,ez),np.array((.038,.047,.04))*eye_scale,'head',tag='eye'))
        eyes.add(E((sgn*(.145 if id=='gigano' else .079 if not quad else .095),1.72 if not quad else 1.57,hz-.065),(.012,.023,.011),'head',tag='nostril'))
        body.add(E((sgn*(ex-.01),1.245,ez+.050 if id=='gigano' else ez+.042),(.062,.083,.027) if id=='gigano' else (.049,.071,.018),'head',k=.010*s,tag='brow'),
                 E((sgn*(ex-.012),1.25,ez-.036),(.04,.059,.012),'head',k=.008*s,tag='lid'))
    if not quad:
        lips=m.group('defined mouth line','eye',.005*s,smooth=1,rigid='head')
        for sgn in (-1,1):
            factor=1.0 if id=='gigano' else .62
            lips.add(chain([(sgn*.15*factor,1.21,hz-.13),(sgn*.166*factor,1.43,hz-.148),(sgn*.132*factor,1.68,hz-.158),(sgn*.09*factor,1.79,hz-.16)],
                           [.008,.007,.006,.004],'head',n=5,tag='mouth'))
    if id=='dilophosaurus':
        crest=m.group('paired cranial fan ridges','crest',.006*s,smooth=1,rigid='head')
        for sgn in (-1,1):
            def fan(P,sgn=sgn):
                Q=P/s;y=Q[:,1];z=Q[:,2]
                top=np.interp(y,[.98,1.06,1.20,1.39,1.57,1.76,1.83],[1.57,1.78,1.92,1.87,1.75,1.61,1.54])
                top+=.008*np.sin(y*58)*oc.smoothstep(1.56,1.7,top)
                bottom=1.52+.025*np.maximum(0,1.15-y)
                x=sgn*(.084+.025*(z-1.52))
                thick=.009+.008*np.clip((top-z)/.3,0,1)
                return np.maximum.reduce([np.abs(Q[:,0]-x)-thick,.98-y,y-1.83,bottom-z,z-top])*s
            crest.add(Fn(fan,vec((sgn*.084-.04,.97,1.50)),vec((sgn*.084+.04,1.84,1.95)),'head',tag='crest'))
    if id=='gigano':
        armour=m.group('integrated dorsal hide ridges','hide',.010*s,smooth=1)
        for i,y in enumerate(np.linspace(-1.8,.56,14)):
            if y<-.8:
                z=np.interp(y,[-1.95,-1.35,-.8],[.805,1.0,1.23])
            else:
                main=.96+.4*math.sqrt(max(0,1-((y+.14)/.82)**2))
                chest=1.08+.34*math.sqrt(max(0,1-((y-.48)/.42)**2)) if y>.06 else 0
                z=max(main,chest)-.016
            armour.add(C((0,y,z),(0,y-.017,z+.035),.033,.006,'tail2' if y<-1.35 else 'tail1' if y<-.8 else 'root',tag='scute'))
    if quad:
        plates=m.group('alternating dorsal plates','crest',.014*s,smooth=1)
        for i,y in enumerate(np.linspace(-.75,.65,7)):
            x=.10*(-1 if i%2 else 1);basez=1.15;h=.39+.13*math.sin(i*math.pi/6);w=.21
            def sdf(P,x=x,y=y,h=h,w=w,z=basez):
                Q=P/s;u=(Q[:,2]-z)/h
                return np.maximum.reduce([np.abs(Q[:,0]-x)-.022,(np.abs(Q[:,1]-y)-w*np.maximum(0,1-np.abs(u*2-1)))*.6,z-Q[:,2],Q[:,2]-z-h])*s
            plates.add(Fn(sdf,vec((x-.04,y-w,basez-.02)),vec((x+.04,y+w,basez+h+.02)),'root' if y<.2 else 'chest',tag='plate'))
        spikes=m.group('paired tail and shoulder spikes','horn',.015*s,smooth=1)
        for y,z,i in [(-1.2,.9,1),(-1.65,.8,2),(-2.1,.72,3),(-2.45,.66,3)]:
            for sgn in (-1,1):spikes.add(C((sgn*.075,y,z),(sgn*.37,y-.17,z+.38),.07,.006,'tail'+str(i),tag='spike'))
        for sgn in (-1,1):spikes.add(C((sgn*.35,.3,1.07),(sgn*.84,.18,1.22),.1,.008,'chest',tag='spike'))
    return m


def colorize(id,g,V,tags):
    cfg=CONFIG[id];P=V/cfg['scale'];n=len(P);A=np.zeros((n,3));A[:,2]=1
    base=np.array(cfg['base']);belly=np.array(cfg['belly']);accent=np.array(cfg['accent'])
    if g.material=='horn':
        f=np.clip((P[:,2]-.1)/1.9,0,1);C=np.array([.68,.62,.42])[None]*(.75+.25*f[:,None]);return C,A
    if g.material=='crest':
        f=np.clip((P[:,2]-1.4)/.6,0,1);return accent[None]*(.75+.4*f[:,None])*np.ones((n,1)),A
    if g.material=='eye':
        C=np.tile((.62,.28,.02),(n,1));out=np.abs(P[:,0]);f=np.exp(-((P[:,1]-1.26)/.022)**2)
        C[f>.68]=(.005,.009,.007);C[(P[:,2]>cfg['headZ']+.083)&(P[:,1]>1.265)]=(.7,.8,.63)
        T=np.asarray(tags)
        C[np.isin(T,['nostril','mouth','orbit'])]=(.017,.013,.009)
        return C,A
    C=np.tile(base,(n,1));low=1-oc.smoothstep(.6,1.05,P[:,2]);C=C*(1-low[:,None]*.6)+belly[None]*low[:,None]*.6
    noise=oc.fbm(P,4,3,seed=47);fine=oc.fbm(P,24,2,seed=19);C*=1+noise[:,None]*.12+fine[:,None]*.035
    dorsal=oc.smoothstep(.95,1.2,P[:,2]);pattern=np.sin(P[:,1]*(12 if id=='gigano' else 7)+noise*1.6)
    bands=oc.smoothstep(-.15,.65,pattern)*dorsal*(.23 if id=='dilophosaurus' else .16 if id=='gigano' else .18)
    C=C*(1-bands[:,None])+accent[None]*bands[:,None]
    C[np.asarray(tags)=='scute']=base*.68
    if id=='gigano':
        scar=np.exp(-((P[:,1]-1.38)/.016)**2)*np.exp(-((P[:,2]-1.48)/.13)**2)
        C=C*(1-scar[:,None]*.6)+np.array([.42,.33,.20])*scar[:,None]*.6
    return np.clip(C,0,1),A


def pose(id,name,f,n):
    cfg=CONFIG[id];s=cfg['scale'];quad=id=='kentro';w=math.tau*f/max(n,1)
    p={'root':{'t':(0,0,.012*s*math.sin(w))},'neck':{'r':(1.5*math.sin(w),0,0)},'tail1':{'r':(0,0,2*math.sin(w))},'tail2':{'r':(0,0,3*math.sin(w-.7))},'tail3':{'r':(0,0,4*math.sin(w-1.2))}}
    if name=='run':
        p['root']={'t':(0,0,.025*s*math.cos(w*2)),'r':(0,2*math.sin(w),0)}
        for side,ph in [('R',w),('L',w+math.pi)]:
            p['th'+side]={'r':(18*math.sin(ph),0,0)};p['sh'+side]={'r':(-12*math.sin(ph),0,0)};p['hf'+side]={'r':(-6*math.sin(ph),0,0)}
            p['ua'+side]={'r':((-15 if quad else -5)*math.sin(ph),0,0)};p['fa'+side]={'r':(8*math.sin(ph),0,0)}
    elif name=='windup':
        p['neck']={'r':(-10 if quad else -12,0,2*math.sin(w))};p['head']={'r':(-12,0,0)};p['jaw']={'r':(-6 if not quad else 0,0,0)}
        p['root']={'t':(0,-.03*s,-.03*s),'r':(-3,0,0)}
    elif name in ('strike','bite','skill'):
        a=math.sin(math.pi*(f+.25)/n)
        if quad:p['tail1']={'r':(2,0,28*a)};p['tail2']={'r':(0,0,32*a)};p['tail3']={'r':(0,0,35*a)}
        else:p['neck']={'r':(-15*a,0,4*a)};p['head']={'r':(-8*a,0,0)};p['jaw']={'r':(-24*a,0,0)}
        p['root']={'t':(0,.12*s*a,0),'r':(-3*a,0,0)}
        if id=='gigano' and name in ('strike','skill'):
            p['root']['r']=(-3*a,0,-12*a)
            p['tail1']={'r':(2,0,22*a)};p['tail2']={'r':(0,0,30*a)};p['tail3']={'r':(0,0,35*a)}
    elif name=='hurt':p['root']={'t':(0,-.04*s,0),'r':(3,(-1 if f else 1)*5,0)};p['head']={'r':(8,0,7)}
    return p


def poses(id):
    defs={'idle':(4,6,True),'run':(6,12,True),'windup':(3,8,True),'strike':(4,18,False),'bite':(4,18,False),'hurt':(2,12,False),'skill':(4,14,False)}
    return {p:dict(frames=n,fps=fps,loop=loop,fn=lambda f,p=p,n=n:pose(id,p,f,n)) for p,(n,fps,loop) in defs.items()}
