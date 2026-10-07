import * as Phaser from 'phaser';
import {Art} from './painters';
import {SPECIES,WORLDS,radius,PLAYER_R} from '../game/content';
import {presentation as P} from '../game/config';
const frames=P.animationFrames;
/** Illustrations are baked at boot. Phaser owns all runtime animation/rendering. */
export function bakeTextures(scene:Phaser.Scene){
 const make=(key:string,w:number,h:number)=>{const texture=scene.textures.createCanvas(key,w,h)!;return {texture,ctx:texture.context}};
 for(const s of SPECIES){
  const r=radius(s),cell=Math.ceil(r*4+24),key='animal-'+s.id;
  const {texture,ctx}=make(key,cell*frames,cell);
  for(let f=0;f<frames;f++){ctx.save();ctx.translate(cell*f+cell/2,cell/2);Art.paintSpecies(ctx,s,r,1,f/frames*Math.PI*2,false,f/frames);ctx.restore();texture.add(String(f),0,cell*f,0,cell,cell)}texture.refresh();
  scene.anims.create({key,frames:Array.from({length:frames},(_,f)=>({key,frame:String(f)})),frameRate:10,repeat:-1});
 }
 for(let tier=1;tier<=7;tier++){
  const r=PLAYER_R[tier],cell=Math.ceil(r*4.6+24),key='rex-'+tier;
  const {texture,ctx}=make(key,cell*frames,cell);
  for(let f=0;f<frames;f++){ctx.save();ctx.translate(cell*f+cell/2,cell/2);Art.paintPlayer(ctx,{r,tier,face:1,step:f/frames*Math.PI*2,t:f/frames,chomp:0,grow:0,invuln:0,moving:1});ctx.restore();texture.add(String(f),0,cell*f,0,cell,cell)}texture.refresh();
  scene.anims.create({key,frames:Array.from({length:frames},(_,f)=>({key,frame:String(f)})),frameRate:10,repeat:-1});
 }
 for(const world of WORLDS){
  const geo={pw:840,ph:1480,px:2,offX:30,offY:125};Art.ensure(world,geo);
  for(const [suffix,canvas] of [['floor',Art._scene],['fringe',Art._overlay]] as const)scene.textures.addCanvas(world.id+'-'+suffix,canvas!);
 }
 const {texture,ctx}=make('spark',16,16);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(8,8,6,0,Math.PI*2);ctx.fill();texture.refresh();
}
