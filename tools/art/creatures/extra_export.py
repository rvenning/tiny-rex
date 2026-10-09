"""Avoid rendering exactly identical pose recipes, retaining every atlas key."""
import json,runpy,shutil,sys
from pathlib import Path

def export(species,script):
    full=species.POSES;aliases={};unique={}
    animated='--mode' in sys.argv and sys.argv[sys.argv.index('--mode')+1]=='anim'
    if animated and '--poses' not in sys.argv:
        for name,definition in full.items():
            identical=None
            for original,previous in unique.items():
                if definition['frames']==previous['frames'] and all(
                    definition['fn'](f)==previous['fn'](f) for f in range(definition['frames'])
                ):
                    identical=original;break
            if identical:aliases[name]=identical
            else:unique[name]=definition
        species.POSES=unique
        print('EXACT_POSE_ALIASES',aliases,flush=True)
    try:runpy.run_path(str(script),run_name='__main__')
    finally:species.POSES=full
    if not aliases:return
    checkout=Path(script).resolve().parents[3]
    out=checkout/sys.argv[sys.argv.index('--out')+1]
    manifest=out/'frames.json';data=json.loads(manifest.read_text())
    frame_lookup={'/'.join(f['key'].split('/')[1:]):f for f in data['frames']}
    for name,original in aliases.items():
        for direction in range(8):
            for frame in range(full[name]['frames']):
                source=frame_lookup[f'{original}/{direction}/{frame}']
                filename=f'{name}_{direction}_{frame}.png'
                shutil.copy2(out/source['file'],out/filename)
                data['frames'].append(dict(source,key=f'{data["meta"]["id"]}/{name}/{direction}/{frame}',file=filename))
    data['meta']['poses']={p:dict(frames=d['frames'],fps=d['fps'],loop=d['loop']) for p,d in full.items()}
    data['meta']['exactPoseAliases']=aliases
    manifest.write_text(json.dumps(data,indent=1))
    print('COMPLETE_CONTRACT',len(data['frames']),'keys',flush=True)
