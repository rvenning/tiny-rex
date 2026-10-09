import other_extra as X
MATERIALS=X.MATERIALS
META={k:X.CONFIG['kentro'][k] for k in ('r','length','height')}
NOSE=(0,1.67*1.05,.63*1.05)
def build():return X.build('kentro')
def colorize(g,V,tags):return X.colorize('kentro',g,V,tags)
POSES=X.poses('kentro')
