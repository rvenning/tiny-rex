import * as Phaser from 'phaser';
import {Simulation} from '../game/simulation';
import {LEVELS,STAGE_NAME,relation} from '../game/content';
import {presentation as P,rules as R} from '../game/config';
import type {Entity,GameEvent} from '../game/types';
import type {Audio} from '../platform/audio';

export class PlayScene extends Phaser.Scene {
 sim!:Simulation;private sprites=new Map<number,Phaser.GameObjects.Sprite>();
 private names=new Map<number,Phaser.GameObjects.Text>();private rex!:Phaser.GameObjects.Sprite;
 private cues!:Phaser.GameObjects.Graphics;private bar!:Phaser.GameObjects.Rectangle;
 private stageLabel!:Phaser.GameObjects.Text;private heartLabel!:Phaser.GameObjects.Text;private scoreLabel!:Phaser.GameObjects.Text;
 private targetRing!:Phaser.GameObjects.Arc;private keys!:Record<string,Phaser.Input.Keyboard.Key>;
 private pointerId:number|null=null;private effects=0;private lastTier=0;private lastHud='';private reduced=false;
 constructor(){super('Play')}
 create(data:{level:number|null;seed?:number}){
  this.sprites.clear();this.names.clear();this.effects=0;this.lastHud='';this.pointerId=null;
  this.sim=new Simulation(data.level===null?null:LEVELS[data.level],data.seed??Date.now()>>>0);
  const world=['hollow','gulch','ridge','basin'][this.sim.level?.world??3];
  this.reduced=!!this.registry.get('reducedMotion');
  this.add.image(210,370,world+'-floor').setDisplaySize(420,740).setDepth(-100);
  this.add.image(210,370,world+'-fringe').setDisplaySize(420,740).setDepth(9000);
  this.cues=this.add.graphics().setDepth(-1);
  this.rex=this.add.sprite(0,0,'rex-'+this.sim.player.tier,'0');this.lastTier=this.sim.player.tier;
  if(!this.reduced)this.rex.play('rex-'+this.lastTier);
  this.add.rectangle(210,60,394,112,0x13291f,.94).setDepth(10000).setStrokeStyle(1,0xf4dfa4,.12);
  const text=(x:number,y:number,s:string,size:number,color='#f5ecd1')=>this.add.text(x,y,s,{fontFamily:'Trebuchet MS, sans-serif',fontSize:size,fontStyle:'bold',color}).setDepth(10001);
  text(24,18,this.sim.level?.name??'Endless Feast',20);
  this.heartLabel=text(24,50,'',19,'#ffae95');this.scoreLabel=text(388,51,'',17,'#ffdc80').setOrigin(1,0);
  this.stageLabel=text(24,79,'',13,'#d3eac7');
  this.add.rectangle(210,104,366,8,0x081711).setDepth(10001);
  this.bar=this.add.rectangle(27,104,0,8,0xf7cf6d).setOrigin(0,.5).setDepth(10002);
  this.targetRing=this.add.circle(0,0,9,0xffecb0,.15).setStrokeStyle(1,0xffecb0,.55).setDepth(-2).setVisible(false);
  this.keys=this.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,SPACE,ESC') as Record<string,Phaser.Input.Keyboard.Key>;
  const pause=()=>this.requestPause();this.input.keyboard!.on('keydown-ESC',pause);this.input.keyboard!.on('keydown-SPACE',pause);
  this.input.addPointer(2);
  const aim=(p:Phaser.Input.Pointer)=>{this.sim.target.x=Phaser.Math.Clamp(p.x-P.arenaX,0,R.width);this.sim.target.y=Phaser.Math.Clamp(p.y-P.arenaY,0,R.height);this.targetRing.setPosition(this.sim.target.x+P.arenaX,this.sim.target.y+P.arenaY).setVisible(true)};
  this.input.on('pointerdown',(p:Phaser.Input.Pointer)=>{if(this.pointerId!==null||p.y<P.arenaY||p.y>P.arenaY+R.height)return;this.pointerId=p.id;(this.registry.get('audio') as Audio).unlock();aim(p)});
  this.input.on('pointermove',(p:Phaser.Input.Pointer)=>{if(this.pointerId===p.id&&p.isDown)aim(p)});
  const release=(p:Phaser.Input.Pointer)=>{if(this.pointerId===p.id)this.pointerId=null};this.input.on('pointerup',release);this.input.on('pointerupoutside',release);
  const hidden=()=>{if(document.hidden)this.requestPause()};document.addEventListener('visibilitychange',hidden);
  const blur=()=>this.requestPause();window.addEventListener('blur',blur);
  this.events.once('shutdown',()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('blur',blur);this.input.keyboard!.off('keydown-ESC',pause);this.input.keyboard!.off('keydown-SPACE',pause)});
  this.announce(this.sim.level?.hint??'Keep eating. Hunger never stops.');this.publishState();
 }
 requestPause(){if(!this.sim.running||this.scene.isPaused())return;this.pointerId=null;this.sim.target={x:this.sim.player.x,y:this.sim.player.y};this.input.keyboard?.resetKeys();this.scene.pause();window.dispatchEvent(new Event('rex-pause'))}
 resumeRun(){this.input.keyboard?.resetKeys();this.pointerId=null;this.scene.resume()}
 private announce(text:string){document.getElementById('announcer')!.textContent=text}
 update(_time:number,delta:number){
  const dt=Math.min(.05,delta/1000),k=this.keys,p=this.sim.player;
  const dx=Number(k.RIGHT.isDown||k.D.isDown)-Number(k.LEFT.isDown||k.A.isDown),dy=Number(k.DOWN.isDown||k.S.isDown)-Number(k.UP.isDown||k.W.isDown);
  if(dx||dy){const length=Math.hypot(dx,dy);this.sim.target={x:p.x+dx/length*80,y:p.y+dy/length*80};this.targetRing.setVisible(false)}
  this.sim.update(dt);for(const event of this.sim.events)this.feedback(event);this.sim.events.length=0;
  this.drawEntities();this.drawHud();this.publishState();
 }
 private drawEntities(){
  const p=this.sim.player;this.cues.clear();
  const live=new Set<number>();
  for(const e of this.sim.entities){if(e.dead)continue;live.add(e.id);let sprite=this.sprites.get(e.id);
   if(!sprite){sprite=this.add.sprite(0,0,'animal-'+e.sp.id,'0');if(!this.reduced)sprite.play('animal-'+e.sp.id);this.sprites.set(e.id,sprite)}
   sprite.setPosition(e.x+P.arenaX,e.y+P.arenaY).setFlipX(e.face<0).setDepth(e.r*100+e.y*.01).setScale(e.beast?1.1:1);
   const distance=Math.hypot(e.x-p.x,e.y-p.y);if(distance<R.cueRange&&e.sp.kind!=='plant')this.cue(e,relation(e.sp,p.tier),1-distance/R.cueRange);
   if(e.beast){let name=this.names.get(e.id);if(!name){name=this.add.text(0,0,e.name!,{fontFamily:'Trebuchet MS',fontSize:11,fontStyle:'bold',color:'#ffe0a0',backgroundColor:'#253426',padding:{x:6,y:3}}).setOrigin(.5);this.names.set(e.id,name)}name.setPosition(e.x+P.arenaX,e.y+P.arenaY-e.r-14).setDepth(8500);name.setText(e.rest>0?e.name+' · tired':e.name!)}
  }
  for(const [id,sprite] of this.sprites)if(!live.has(id)){sprite.destroy();this.sprites.delete(id);this.names.get(id)?.destroy();this.names.delete(id)}
  if(p.tier!==this.lastTier){this.lastTier=p.tier;this.rex.setTexture('rex-'+p.tier,'0');if(!this.reduced)this.rex.play('rex-'+p.tier)}
  this.rex.setPosition(p.x+P.arenaX,p.y+P.arenaY).setFlipX(p.face<0).setDepth(p.r*100+p.y*.01+.005);
  if(p.invuln>0){this.cues.lineStyle(2,0xfaf0c3,.8);this.cues.strokeCircle(p.x+P.arenaX,p.y+P.arenaY,p.r+5)}
 }
 private cue(e:Entity,rel:string,near:number){const color=rel==='danger'?0xff725c:rel==='food'?0xffdc80:rel==='spiky'?0xbdc6dc:0xe5f1d6;this.cues.lineStyle(rel==='danger'?2.5:1.5,color,.3+near*.6);this.cues.strokeCircle(e.x+P.arenaX,e.y+P.arenaY,e.r+5);if(rel==='danger'){this.cues.fillStyle(color,.9);this.cues.fillTriangle(e.x+P.arenaX-3,e.y+P.arenaY-e.r-9,e.x+P.arenaX+3,e.y+P.arenaY-e.r-9,e.x+P.arenaX,e.y+P.arenaY-e.r-15)}}
 private drawHud(){const s=this.sim,p=s.player;const key=[s.score,s.hearts,p.tier,s.wave,Math.ceil(s.timeLeft)].join('/');this.bar.width=366*s.bellyFraction;if(key===this.lastHud)return;this.lastHud=key;this.heartLabel.setText('♥'.repeat(s.hearts)+'♡'.repeat(3-s.hearts));this.scoreLabel.setText(s.score.toLocaleString());this.stageLabel.setText(STAGE_NAME[p.tier]+'  →  '+(s.level?STAGE_NAME[s.maxTier]+(s.level.beast&&!s.beastEaten?' · catch '+s.level.beast.name:''):'Wave '+(s.wave+1)));}
 private feedback(e:GameEvent){
  const audio=this.registry.get('audio') as Audio;if(e.type==='end'){if(e.result.win)audio.play('win');this.time.delayedCall(600,()=>window.dispatchEvent(new CustomEvent('rex-end',{detail:e.result})));return}
  audio.play(e.type,this.sim.player.tier);
  if(e.type==='grow'){this.banner(STAGE_NAME[e.tier!]+'!');this.announce('Grew to '+STAGE_NAME[e.tier!]);if(!this.reduced){this.cameras.main.shake(140,.003);this.tweens.add({targets:this.rex,scaleX:1.2,scaleY:1.2,duration:180,yoyo:true,ease:'Back.easeOut'})}}
  if(e.type==='hurt'&&!this.reduced)this.cameras.main.shake(180,.005);
  if(e.type==='wave')this.banner('The valley thickens · wave '+(this.sim.wave+1));
  if(e.type==='nope')this.float(e.x,e.y,'Too spiky!','#dce3f0');
  if(e.type==='shrink')this.banner('Hungry… keep eating');
  if(e.type==='eat'){if(e.beast)this.banner(e.name+' caught!');else if(e.sp?.kind!=='plant')this.float(e.x,e.y,'+'+e.value,'#ffe29a')}
  if(!this.reduced)this.burst(e.x,e.y,e.type==='hurt'?0xffab91:e.type==='grow'?0xffdc80:0xf7efd2,e.type==='grow'?18:6);
 }
 private burst(x:number,y:number,color:number,count:number){for(let i=0;i<count&&this.effects<P.feedbackLimit;i++){this.effects++;const dot=this.add.image(x+P.arenaX,y+P.arenaY,'spark').setTint(color).setScale(.15+Math.random()*.18).setDepth(8800);const a=Math.random()*Math.PI*2,d=12+Math.random()*36;this.tweens.add({targets:dot,x:dot.x+Math.cos(a)*d,y:dot.y+Math.sin(a)*d,alpha:0,scale:0,duration:350+Math.random()*250,onComplete:()=>{dot.destroy();this.effects--}})}}
 private float(x:number,y:number,word:string,color:string){if(this.effects>=P.feedbackLimit)return;this.effects++;const label=this.add.text(x+P.arenaX,y+P.arenaY-14,word,{fontFamily:'Trebuchet MS',fontSize:14,fontStyle:'bold',color,stroke:'#293227',strokeThickness:3}).setOrigin(.5).setDepth(8900);this.tweens.add({targets:label,y:label.y-(this.reduced?0:22),alpha:0,duration:650,onComplete:()=>{label.destroy();this.effects--}})}
 private banner(word:string){const label=this.add.text(210,158,word,{fontFamily:'Trebuchet MS',fontSize:20,fontStyle:'bold',color:'#302d16',backgroundColor:'#f7d478',padding:{x:18,y:10}}).setOrigin(.5).setDepth(10003);this.tweens.add({targets:label,alpha:0,delay:1500,duration:this.reduced?0:250,onComplete:()=>label.destroy()})}
 private publishState(){const stage=document.getElementById('stage')!;stage.dataset.state=this.sim.running?'playing':'ended';stage.dataset.tier=String(this.sim.player.tier);stage.dataset.score=String(this.sim.score);stage.dataset.hearts=String(this.sim.hearts);stage.dataset.entities=String(this.sprites.size);stage.dataset.effects=String(this.effects)}
}
