import other_extra as X
MATERIALS=X.MATERIALS
META={k:X.CONFIG['gigano'][k] for k in ('r','length','height')}
NOSE=(0,1.88*1.9,1.3*1.9)
def build():return X.build('gigano')
def colorize(g,V,tags):return X.colorize('gigano',g,V,tags)
POSES=X.poses('gigano')
