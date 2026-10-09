import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Adventure, idleInput } from '../src/adventure/sim';
import { freshAdventure, validateAdventure, mergeAdventure } from '../src/adventure/save';
import { DISCOVERIES, GATES, OBJECTIVES, REGIONS, RIVALS, GROWTH, PORTALS, SPAWNS, regionAt } from '../src/adventure/data';
import { parseWorld, type WorldMeta } from '../src/world/world';

const openWorld = () => {
  const nx=234,ny=170,n=nx*ny,raw=new Uint8Array(n*4);raw.fill(1,0,n);
  return parseWorld({bounds:[-20,-20,214,150],cell:1,nx,ny,surf:['grass'],version:2,pois:{},features:[],props:[],water:[]} as WorldMeta,raw);
};
const make = (xp=0,rivals:string[]=[]) => { const save=freshAdventure(); save.xp.rex=xp;save.rivals=rivals;return new Adventure(openWorld(),save); };
const tick = (a:Adventure,n=1,input=idleInput()) => {for(let i=0;i<n;i++)a.update(1/60,input);};
const place = (a:Adventure,x:number,y:number,face=0) => Object.assign(a.player,{x,y,face,invuln:0,action:0,pose:'idle'});
const move = (a:Adventure,x:number,y:number,n=90) => tick(a,n,{...idleInput(),move:{x,y}});
const bite = (a:Adventure) => {tick(a,1,{...idleInput(),bite:true});tick(a,20);};

describe('Connected adventure progression',()=>{
  it('every authored actor spawns and returns to terrain that fits its body in its authored region',()=>{
    const meta=JSON.parse(readFileSync(new URL('../public/world-connected/world.json',import.meta.url),'utf8'));
    const world=parseWorld(meta,gunzipSync(readFileSync(new URL('../public/world-connected/world.bin.gz',import.meta.url))));
    const a=new Adventure(world,freshAdventure());
    const ordinary=Object.values(SPAWNS).flat().filter(([id,x,y])=>!RIVALS.some(r=>r.species===id&&[r.home,...(r.companions??[])].some(p=>p.x===x&&p.y===y))).length;
    expect(a.actors).toHaveLength(ordinary+RIVALS.reduce((n,r)=>n+1+(r.companions?.length??0),0));
    for(const actor of a.actors) { expect(world.grid.fits(actor.x,actor.y,actor.spec.r),actor.spec.id+' spawn').toBe(true);expect(world.grid.fits(actor.home.x,actor.home.y,actor.spec.r),actor.spec.id+' return home').toBe(true);if(actor.rival)expect(regionAt(actor.home)?.id).toBe(RIVALS.find(r=>r.id===actor.rival)!.region); }
    const raptor=a.actors.find(actor=>actor.sentinel)!;expect(raptor).toBeDefined();expect(Math.hypot(raptor.x-40.5,raptor.y-31)).toBeLessThan(8);
    a.actors=[raptor];place(a,37.26,34.14);tick(a,180);
    expect(raptor.state,JSON.stringify({x:raptor.x,y:raptor.y,home:raptor.home,player:a.player})).not.toBe('idle');
    expect(a.events.some(e=>e.type==='tell'&&e.actor===raptor.id)).toBe(true);
  });
  it('the first normal prey catch advances onboarding independently of optional stalking mastery',()=>{
    const a=make(),beetle=a.actors.find(actor=>actor.spec.id==='beetle')!;a.actors=[beetle];place(a,31,38);expect(a.objective).toContain('Stalk a beetle');bite(a);
    expect(beetle.state).toBe('dead');expect(a.objective).toBe('Hunt small prey to grow');expect(a.save.challenges).not.toContain('stalk-first');
    expect(validateAdventure(a.checkpoint(50)).challenges).toContain('first-hunt');
  });
  it('has six populated regions, eighteen fossils, three rival encounters and ten distinct mastery objectives',()=>{
    const a=make();
    expect(REGIONS).toHaveLength(6);expect(OBJECTIVES).toHaveLength(10);
    expect(DISCOVERIES.filter(d=>d.kind==='fossil')).toHaveLength(18);
    expect(new Set(OBJECTIVES.map(o=>o.id)).size).toBe(10);
    for(const r of REGIONS) expect(a.actors.some(actor=>actor.home.x>=r.bounds[0]&&actor.home.x<r.bounds[2]&&actor.home.y>=r.bounds[1]&&actor.home.y<r.bounds[3])).toBe(true);
    expect(a.actors.filter(actor=>actor.rival==='marsh-pack')).toHaveLength(2);
    expect(a.actors.filter(actor=>actor.home.x===96&&actor.home.y===26)).toHaveLength(1);
  });
  it('enforces the ford for hatchlings and does not allow a dash to bypass it',()=>{
    const a=make();a.actors=[];place(a,100,65.8,Math.PI/2);
    move(a,0,1);expect(a.player.y).toBeLessThan(66);
    tick(a,1,{...idleInput(),dodge:true,move:{x:0,y:1}});tick(a,30);expect(a.player.y).toBeLessThan(66);
    const juvenile=make(8);juvenile.actors=[];place(juvenile,100,65.8);move(juvenile,0,1);
    expect(juvenile.save.gates).toContain('river-ford');expect(juvenile.save.regions).toContain('marsh');
    place(juvenile,80,65.8);move(juvenile,0,1);expect(juvenile.player.y).toBeLessThan(66);
  });
  it('requires Hunter bite to clear the log and Apex bite to clear basalt, then banks both routes',()=>{
    const juvenile=make(20);juvenile.actors=[];place(juvenile,128,100);bite(juvenile);move(juvenile,1,0);
    expect(juvenile.player.x).toBeLessThan(130);expect(juvenile.save.gates).not.toContain('marsh-log');
    const hunter=make(30,['river-hunter']);hunter.actors=[];place(hunter,128,100);bite(hunter);move(hunter,1,0);
    expect(hunter.save.gates).toContain('marsh-log');expect(hunter.save.regions).toContain('dunes');
    place(hunter,162,68,-Math.PI/2);bite(hunter);move(hunter,0,-1);expect(hunter.player.y).toBeGreaterThanOrEqual(66);
    const apex=make(90,['river-hunter','marsh-pack']);apex.actors=[];place(apex,162,68,-Math.PI/2);bite(apex);move(apex,0,-1);
    expect(apex.save.gates).toContain('ember-basalt');expect(apex.save.regions).toContain('ember');
    const reloaded=new Adventure(openWorld(),apex.checkpoint(100));expect(reloaded.save.snapshot.position.y).toBeGreaterThan(-20);expect(reloaded.save.gates).toContain('ember-basalt');
  });
  it('keeps caves optional and stage-gates both tunnel directions',()=>{
    const young=make(8);young.actors=[];place(young,55,111);expect(young.interact()).toBe(false);expect(young.player.x).toBe(55);
    const hunter=make(30,['river-hunter']);hunter.actors=[];place(hunter,55,111);expect(hunter.interact()).toBe(true);expect(hunter.player.x).toBe(140);expect(hunter.region).toBe('dunes');
    expect(hunter.interact()).toBe(true);expect(hunter.player.x).toBe(55);expect(hunter.region).toBe('caves');
    place(hunter,23,105);expect(hunter.interact()).toBe(false);
  });
  it('banks discovery, delivery and fossil mastery rewards only once, including after reload and merge',()=>{
    const a=make(90,['river-hunter','marsh-pack']);a.actors=[];
    for(const d of DISCOVERIES.filter(d=>d.region==='caves'&&d.kind==='fossil')){place(a,d.x,d.y);tick(a);}
    expect(a.save.challenges).toContain('echo-trail');
    const egg=DISCOVERIES.find(d=>d.id==='egg-marsh')!;place(a,egg.x,egg.y);tick(a);expect(a.save.challenges).not.toContain('lost-clutch');
    place(a,102,91);tick(a);expect(a.save.challenges).toContain('lost-clutch');
    const before=a.save.xp.rex,saved=a.checkpoint(123);
    const b=new Adventure(openWorld(),mergeAdventure(saved,saved));b.actors=[];
    for(const d of DISCOVERIES.filter(d=>d.region==='caves'&&d.kind==='fossil')){place(b,d.x,d.y);tick(b);}
    place(b,102,91);tick(b);expect(b.save.xp.rex).toBe(before);
  });
  it('a partial pack defeat grants neither victory nor farmable growth; the whole pack is the milestone',()=>{
    const a=make(30,['river-hunter']);const pack=a.actors.filter(actor=>actor.rival==='marsh-pack');a.actors=pack;
    place(a,111,100);Object.assign(pack[0],{hp:1,state:'recover',t:9});pack[1].x=125;pack[1].y=110;
    tick(a);const before=a.save.xp.rex;bite(a);expect(pack[0].state).toBe('dead');expect(a.save.rivals).not.toContain('marsh-pack');expect(a.save.xp.rex).toBe(before);
    place(a,124,110);Object.assign(pack[1],{hp:1,state:'recover',t:9});a.biteCooldown=0;bite(a);
    expect(a.save.rivals).toContain('marsh-pack');expect(a.save.challenges).toContain('split-pack');expect(a.save.xp.rex).toBeGreaterThan(before);
  });
  it('plant regrowth timers persist so reloading cannot award repeated free grazing growth',()=>{
    const save=freshAdventure();save.species.push('trike');save.snapshot.dino='trike';
    const a=new Adventure(openWorld(),save);a.actors=[];place(a,34.5,41.5);bite(a);expect(a.save.xp.trike).toBe(2);
    const b=new Adventure(openWorld(),a.checkpoint(55));b.actors=[];bite(b);expect(b.save.xp.trike).toBe(2);
  });
  it('records clean encounters across all hits and permits a mastery rematch without repeated rival growth',()=>{
    const a=make(8),hunter=a.actors.find(actor=>actor.rival==='river-hunter')!;a.actors=[hunter];
    place(a,95,26);tick(a);a.hurt(.1,hunter);place(a,95,26);Object.assign(hunter,{hp:1,state:'recover',t:9});bite(a);
    expect(a.save.rivals).toContain('river-hunter');expect(a.save.challenges).not.toContain('read-river');
    const before=a.save.xp.rex;a.player.action=0;a.biteCooldown=0;expect(a.interact()).toBe(true);
    const rematch=a.actors.find(actor=>actor.rival==='river-hunter'&&actor.state!=='dead')!;
    Object.assign(rematch,{hp:1,state:'recover',t:9});bite(a);
    expect(a.save.challenges).toContain('read-river');expect(a.save.xp.rex-before).toBe(8);
    a.biteCooldown=0;a.player.action=0;expect(a.interact()).toBe(true);
    const again=a.actors.find(actor=>actor.rival==='river-hunter'&&actor.state!=='dead')!;Object.assign(again,{hp:1,state:'recover',t:9});const earned=a.save.xp.rex;bite(a);expect(a.save.xp.rex).toBe(earned);
  });
  it('observing peaceful herd animals earns study and mastery without hurting them',()=>{
    const a=make(90,['river-hunter','marsh-pack']);const trike=a.actors.find(actor=>actor.spec.id==='trike'&&actor.home.x===184)!;a.actors=[trike];
    place(a,178,109);Object.assign(trike,{state:'idle',t:100});tick(a,905);
    expect(a.save.studied).toContain('trike');expect(a.save.challenges).toContain('leave-herd');expect(trike.hp).toBe(trike.maxHp);
  });
  it('slow-hunt mastery requires creeping through the hunt instead of ordinary sprint kills',()=>{
    const a=make(),beetles=a.actors.filter(actor=>actor.spec.id==='beetle').slice(0,3);a.actors=[];place(a,20,20);
    for(const beetle of beetles){
      tick(a,30,{...idleInput(),move:{x:.3,y:0}});
      Object.assign(beetle,{x:a.player.x+1,y:a.player.y,hp:1,state:'feed',t:100,alert:0});a.actors=[beetle];a.biteCooldown=0;
      tick(a,1,{...idleInput(),bite:true,move:{x:.3,y:0}});tick(a,20,{...idleInput(),move:{x:.3,y:0}});
      expect(beetle.state).toBe('dead');a.actors=[];
    }
    expect(a.save.challenges).toContain('stalk-first');
  });
  it('waiting for unaware feeding dragonflies completes the River wingbeat objective',()=>{
    const a=make(8),flies=a.actors.filter(actor=>actor.spec.id==='dragonfly').slice(0,3);a.actors=[];place(a,85,50);
    for(const fly of flies){ Object.assign(fly,{x:86,y:50,hp:1,state:'feed',t:100,alert:0});a.actors=[fly];a.biteCooldown=0;a.player.action=0;bite(a);expect(fly.state).toBe('dead'); }
    expect(a.save.challenges).toContain('reed-watch');
  });
  it('the dunes recovery objective counts recovery kills, not staggered targets',()=>{
    const a=make(90,['river-hunter','marsh-pack']),dilos=a.actors.filter(actor=>actor.spec.id==='dilo').slice(0,3);a.actors=[];place(a,170,96);
    for(const [i,dilo] of dilos.entries()){
      Object.assign(dilo,{x:171,y:96,hp:1,state:i===0?'stagger':'recover',t:100});a.actors=[dilo];a.biteCooldown=0;a.player.action=0;a.player.face=0;bite(a);
      expect(dilo.state).toBe('dead');
      if(i===0)expect(a.save.mastery['sunscar-flank']).toBe(0);
    }
    expect(a.save.challenges).toContain('sunscar-flank');
  });
  it('the hatchling escort waits for its guide and completes only after walking home',()=>{
    const a=make(30,['river-hunter']);a.actors=[];place(a,82,83);tick(a);
    const hatchling=a.actors.find(actor=>actor.escort)!;expect(hatchling).toBeDefined();expect(a.save.challenges).not.toContain('hatchling-escort');
    place(a,102,91);tick(a,120);expect(hatchling.x).toBe(82);expect(a.save.challenges).not.toContain('hatchling-escort');
    for(let i=0;i<400;i++) { const angle=Math.atan2(91-hatchling.y,102-hatchling.x);place(a,hatchling.x+Math.cos(angle)*3,hatchling.y+Math.sin(angle)*3);tick(a);if(a.save.challenges.includes('hatchling-escort'))break; }
    expect(a.save.challenges).toContain('hatchling-escort');expect(Math.hypot(hatchling.x-102,hatchling.y-91)).toBeLessThan(3);
  });
  it('retains far-region saves and all four growth thresholds without a fifth stage',()=>{
    const save=freshAdventure();save.nests.push('ember');save.snapshot.nest='ember';save.snapshot.position={x:173,y:23};save.xp.rex=GROWTH[3];save.rivals=RIVALS.map(r=>r.id);
    save.gates=['Fallen log','Fractured basalt'];save.challenges=['clean-river-hunter'];
    const a=new Adventure(openWorld(),validateAdventure(save));expect(a.region).toBe('ember');expect(a.tier).toBe(3);expect(a.growth).toBeNull();expect(a.player.face).toBe(0);
    expect(a.save.gates).toEqual(expect.arrayContaining(['Fallen log','marsh-log','ember-basalt']));expect(a.save.challenges).toContain('read-river');expect(a.save.xp.rex).toBe(GROWTH[3]);
    a.save.xp.rex=90;expect(a.growth).toEqual({have:0,need:110,blocked:null});
  });
  it('growth moves a larger body out of a corridor that no longer fits it',()=>{
    const nx=48,ny=24,n=nx*ny,raw=new Uint8Array(n*4);
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const px=18+(x+.5)*.25;if((px>=19.5&&px<20.5)||px>=23)raw[y*nx+x]=1;}
    const world=parseWorld({bounds:[18,18,30,24],cell:.25,nx,ny,surf:['grass'],version:2,pois:{},features:[],props:[],water:[]} as WorldMeta,raw);
    const save=freshAdventure();save.snapshot.position={x:20,y:20};const a=new Adventure(world,save);a.actors=[];
    expect(world.grid.fits(a.player.x,a.player.y,a.radius)).toBe(true);a.save.xp.rex=8;a.pendingGrow=true;tick(a,60);
    expect(a.tier).toBe(1);expect(world.grid.fits(a.player.x,a.player.y,a.radius)).toBe(true);expect(a.player.x).toBeGreaterThan(23);
  });
  it('the actual connected collision grid provides a Rex-sized route to every refuge',()=>{
    const meta=JSON.parse(readFileSync(new URL('../public/world-connected/world.json',import.meta.url),'utf8'));
    const world=parseWorld(meta,gunzipSync(readFileSync(new URL('../public/world-connected/world.bin.gz',import.meta.url))));
    const a=new Adventure(world,{...freshAdventure(),xp:{rex:200,raptor:0,trike:0},rivals:['river-hunter','marsh-pack'],gates:GATES.filter(g=>!g.optional).map(g=>g.id)});
    const start={x:27,y:35},queue=[start],seen=new Set([`${start.x},${start.y}`]);
    const travel=(a as unknown as {canTravel:(from:{x:number,y:number},to:{x:number,y:number})=>boolean}).canTravel.bind(a);
    for(let i=0;i<queue.length;i++){
      const from=queue[i];
      for(const [dx,dy] of [[.25,0],[-.25,0],[0,.25],[0,-.25]]){
        const to={x:from.x+dx,y:from.y+dy},key=`${to.x},${to.y}`;
        if(seen.has(key)||!world.grid.fits(to.x,to.y,a.radius)||!travel(from,to))continue;
        seen.add(key);queue.push(to);
      }
      for(const portal of PORTALS){
        if(portal.requiredStage>a.tier || (portal.species && portal.species!==a.dino))continue;
        const dest=Math.hypot(from.x-portal.x,from.y-portal.y)<2.5 ? portal.to : portal.bidirectional && Math.hypot(from.x-portal.to.x,from.y-portal.to.y)<2.5 ? portal : null;
        if(!dest)continue;
        const to={x:dest.x,y:dest.y},key=`${to.x},${to.y}`;
        if(!seen.has(key)&&world.grid.fits(to.x,to.y,a.radius)){seen.add(key);queue.push(to);}
      }
    }
    for(const r of REGIONS)expect(queue.some(p=>Math.hypot(p.x-r.nest.x,p.y-r.nest.y)<3),r.name + ': portal minimum distances '+PORTALS.map(portal=>`${portal.id}=${Math.min(...queue.map(p=>Math.hypot(p.x-portal.to.x,p.y-portal.to.y))).toFixed(2)}`).join(',')).toBe(true);
  });
});
