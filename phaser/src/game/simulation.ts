import {FEAST,NEED,PLAYER_R,PLAYER_SPEED,radius,relation,species,value} from './content';
import {rules as R} from './config';
import {clamp} from '../art/math';
import {Random} from './random';
import type {Entity,GameEvent,Level,Player,Result} from './types';

/** Seeded rules only. Scene owns input, rendering, sound, pause and persistence. */
export class Simulation {
 readonly mode:'campaign'|'feast'; readonly rng:Random; readonly player:Player;
 entities:Entity[]=[];events:GameEvent[]=[];met:Record<string,number>={};
 elapsed=0;wave=0;hearts=3;score=0;catches=0;scares=0;valueEaten=0;beastEaten=false;
 running=true;timeLeft:number;maxTier:number;target:{x:number;y:number};result?:Result;
 private nextId=1;private respawn:Record<string,number>={};
 constructor(readonly level:Level|null,seed:number){
  this.mode=level?'campaign':'feast';this.rng=new Random(seed||1);
  const tier=level?.start??FEAST.start;this.maxTier=level?.target??FEAST.maxTier;
  this.timeLeft=level?.time??0;
  this.player={x:R.width/2,y:R.height*.66,tier,startTier:tier,belly:0,r:PLAYER_R[tier],speed:PLAYER_SPEED[tier],face:1,invuln:0,chomp:0};
  this.target={x:this.player.x,y:this.player.y};
  for(let i=0;i<this.plantWant;i++)this.spawnPlant(true);
  for(const [id,n] of this.population())for(let i=0;i<n;i++)this.spawn(id,true);
  if(level?.beast)this.spawn(level.beast.id,true,level.beast.name);
 }
 get plantWant(){return this.level?.plants??FEAST.plants}
 population():[string,number][]{
  if(this.level)return this.level.spawn;
  const counts:Record<string,number>={};const last=FEAST.waves.length-1;
  for(let w=0;w<=Math.min(this.wave,last);w++)for(const [id,n] of FEAST.waves[w])counts[id]=(counts[id]||0)+Number(n);
  if(this.wave>last)for(const id in counts)counts[id]=Math.round(counts[id]*(1+FEAST.thicken*(this.wave-last)));
  return Object.entries(counts);
 }
 private spawnPlant(initial=false){return this.spawn(this.rng.next()<.45?'berries':'fern',initial)}
 private spawn(id:string,initial=false,name?:string){
  const sp=species(id),r=radius(sp),p=this.player;
  for(let attempt=0;attempt<14;attempt++){
   const x=this.rng.range(r+6,R.width-r-6),y=this.rng.range(r+6,R.height-r-6);
   if(Math.hypot(x-p.x,y-p.y)<R.spawnClear*(initial?.8:1)+r)continue;
   const e:Entity={id:this.nextId++,sp,x,y,r,face:1,step:0,dir:this.rng.range(0,Math.PI*2),wander:0,flee:0,cooldown:0,hunt:R.huntTime,bored:0,sprint:R.beastStamina,rest:0,beast:!!name,name,dead:false};
   // Same seeded phase sequence as the authored rules, with explicit fields.
   if(sp.kind==='plant')e.step=this.rng.range(0,6.28);else{e.wander=this.rng.range(.6,2.4);e.step=this.rng.range(0,6.28);this.met[id]=1}
   this.entities.push(e);return e;
  }
 }
 update(dt:number){
  if(!this.running)return;dt=Math.min(dt,.05);this.elapsed+=dt;
  const p=this.player;p.invuln=Math.max(0,p.invuln-dt);p.chomp=Math.max(0,p.chomp-dt);
  const dx=this.target.x-p.x,dy=this.target.y-p.y,d=Math.hypot(dx,dy);
  if(d>=.6){const amount=Math.min(d*Math.min(1,dt*R.ease),p.speed*dt);p.x=clamp(p.x+dx/d*amount,p.r,R.width-p.r);p.y=clamp(p.y+dy/d*amount,p.r,R.height-p.r);if(Math.abs(dx/d*amount)>.05)p.face=dx<0?-1:1}
  for(const e of this.entities)if(!e.dead)this.move(e,dt);
  for(const e of this.entities){if(e.dead||!this.running)continue;this.collide(e)}
  if(!this.running)return;
  this.restock();
  if(this.mode==='feast')this.hunger(dt);else{
   this.timeLeft=Math.max(0,this.timeLeft-dt);
   if(this.timeLeft<=0)this.end(false,'time');
   else if(p.tier>=this.maxTier&&(!this.level?.beast||this.beastEaten))this.end(true,'grown');
  }
  // Retain live objects only: original kept every eaten entity forever.
  if(this.entities.some(e=>e.dead))this.entities=this.entities.filter(e=>!e.dead);
 }
 private move(e:Entity,dt:number){
  if(e.sp.kind==='plant')return;
  e.cooldown=Math.max(0,e.cooldown-dt);e.bored=Math.max(0,e.bored-dt);
  const p=this.player,sp=e.sp,dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy)||1;
  let ux=0,uy=0,speed=sp.speed!,engaged=true;const caution=e.beast?Math.max(.9,sp.caution!):sp.caution!;
  if(e.flee>0){e.flee-=dt;ux=-dx/d;uy=-dy/d;speed*=e.beast?1:.95}
  else if(sp.tier!>p.tier&&sp.aggression!>0&&e.bored<=0&&d<R.sense*(.7+sp.aggression!*.6)){
   ux=dx/d;uy=dy/d;speed*=.75+.25*sp.aggression!;e.hunt-=dt;
   if(e.hunt<=0){e.hunt=R.huntTime;e.bored=R.huntRest*(1+R.huntRestPerTier*Math.max(0,sp.tier!-3))}
  }else if(sp.tier!<p.tier&&caution>0&&d<(e.beast?R.beastFleeRange:R.sense*caution)+p.r){ux=-dx/d;uy=-dy/d;speed*=.7+.3*caution}
  else{engaged=false;e.wander-=dt;if(e.wander<=0){e.dir+=this.rng.range(-1.5,1.5);e.wander=this.rng.range(1.2,3.2)}ux=Math.cos(e.dir);uy=Math.sin(e.dir);speed*=.42}
  if(e.beast&&engaged){if(e.rest>0){e.rest-=dt;speed=p.speed*R.beastTired}else{speed=p.speed*R.beastSprint;e.sprint-=dt;if(e.sprint<=0){e.sprint=R.beastStamina;e.rest=R.beastRest}}}
  e.x+=ux*speed*dt;e.y+=uy*speed*dt;e.step+=speed*dt*.12;if(Math.abs(ux)>.02)e.face=ux<0?-1:1;
  if(e.x<e.r||e.x>R.width-e.r){e.x=clamp(e.x,e.r,R.width-e.r);e.dir=Math.PI-e.dir}
  if(e.y<e.r||e.y>R.height-e.r){e.y=clamp(e.y,e.r,R.height-e.r);e.dir=-e.dir}
 }
 private collide(e:Entity){
  const p=this.player,dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy)||.001,rel=relation(e.sp,p.tier);
  if(rel==='food'){if(d<p.r+e.r*.7)this.eat(e);return}
  if(rel==='danger'){
   if(d>=e.r+p.r*.55||p.invuln>0)return;
   this.hearts--;this.scares++;p.belly=Math.max(0,p.belly-Math.ceil(p.belly*R.bellyLost));p.invuln=R.invulnerability;e.flee=R.scareOff;
   this.push(e,dx,dy,d,e.r+p.r+12-d);this.events.push({type:'hurt',x:p.x,y:p.y,sp:e.sp});
   if(this.hearts<=0)this.end(false,'caught');return;
  }
  const touch=p.r+e.r*.8;if(d>=touch)return;this.push(e,dx,dy,d,touch-d+.6);
  if(e.cooldown>0)return;e.cooldown=.9;
  if(rel==='spiky')p.belly=Math.max(0,p.belly-1);
  this.events.push({type:rel==='spiky'?'nope':'bump',x:e.x,y:e.y,sp:e.sp});
 }
 private push(e:Entity,dx:number,dy:number,d:number,amount:number){e.x=clamp(e.x+dx/d*amount,e.r,R.width-e.r);e.y=clamp(e.y+dy/d*amount,e.r,R.height-e.r)}
 eat(e:Entity){
  const v=value(e.sp);e.dead=true;this.valueEaten+=v;this.catches++;this.score+=v*10;this.player.belly+=v;this.player.chomp=.22;this.met[e.sp.id]=1;
  if(e.beast)this.beastEaten=true;
  this.events.push({type:'eat',x:e.x,y:e.y,sp:e.sp,value:v,beast:e.beast,name:e.name});this.grow();
 }
 grow(){const p=this.player;while(p.tier<this.maxTier&&p.belly>=NEED[p.tier]){p.belly-=NEED[p.tier];p.tier++;p.r=PLAYER_R[p.tier];p.speed=PLAYER_SPEED[p.tier];this.score+=120;this.events.push({type:'grow',x:p.x,y:p.y,tier:p.tier})}if(p.tier>=this.maxTier)p.belly=Math.min(p.belly,NEED[this.maxTier-1])}
 private restock(){
  const count=(id:string)=>this.entities.filter(e=>!e.dead&&e.sp.id===id).length;
  if((this.respawn.plant||0)<=this.elapsed){if(count('fern')+count('berries')<this.plantWant)this.spawnPlant();this.respawn.plant=this.elapsed+this.rng.range(1.4,3.4)}
  for(const [id,n] of this.population()){if((this.respawn[id]||0)>this.elapsed||count(id)>=n)continue;this.spawn(id);this.respawn[id]=this.elapsed+this.rng.range(3,7)}
  if(this.entities.filter(e=>!e.dead&&relation(e.sp,this.player.tier)==='food').length<R.foodFloor)this.spawnPlant();
 }
 private hunger(dt:number){
  const p=this.player,w=Math.floor(this.elapsed/FEAST.waveEvery);if(w!==this.wave){this.wave=w;this.events.push({type:'wave',x:180,y:40})}
  p.belly-=NEED[Math.min(p.tier,NEED.length-1)]*(FEAST.hunger+FEAST.hungerPerWave*this.wave)*dt;
  if(p.belly<0){if(p.tier>1){p.tier--;p.r=PLAYER_R[p.tier];p.speed=PLAYER_SPEED[p.tier];p.belly=NEED[p.tier]*.6;this.events.push({type:'shrink',x:p.x,y:p.y,tier:p.tier})}else p.belly=0}
 }
 end(win:boolean,reason:string){
  if(!this.running)return this.result;this.running=false;const p=this.player;
  this.result={mode:this.mode,levelIdx:this.level?.idx??-1,win,reason,stars:win?this.hearts:0,score:this.score+(win&&this.level?200*this.hearts:0),tier:p.tier,startTier:p.startTier,hearts:Math.max(0,this.hearts),catches:this.catches,scares:this.scares,valueEaten:this.valueEaten,wave:this.wave,timeLeft:Math.round(this.timeLeft),elapsed:Math.round(this.elapsed),met:{...this.met},beast:this.level?.beast?.name??null,beastEaten:this.beastEaten};
  this.events.push({type:'end',result:this.result});return this.result;
 }
 get bellyFraction(){return this.player.tier>=this.maxTier?1:clamp(this.player.belly/NEED[this.player.tier],0,1)}
}
