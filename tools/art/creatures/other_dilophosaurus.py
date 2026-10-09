import other_extra as X
MATERIALS=X.MATERIALS
META={k:X.CONFIG['dilophosaurus'][k] for k in ('r','length','height')}
NOSE=(0,1.88*1.05,1.36*1.05)
def build():return X.build('dilophosaurus')
def colorize(g,V,tags):return X.colorize('dilophosaurus',g,V,tags)
POSES=X.poses('dilophosaurus')
