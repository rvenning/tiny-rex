import * as Phaser from 'phaser';
export class MenuScene extends Phaser.Scene {
 constructor(){super('Menu')}
 create(){
  this.add.image(210,370,'hollow-floor').setDisplaySize(420,740).setAlpha(.4);
  this.add.image(210,370,'hollow-fringe').setDisplaySize(420,740);
  const glow=this.add.circle(210,265,96,0xffdca0,.1);
  const hero=this.add.sprite(210,255,'rex-5','0').setScale(2.25);
  if(!this.registry.get('reducedMotion')){hero.play('rex-5');this.tweens.add({targets:hero,y:248,duration:1900,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});this.tweens.add({targets:glow,alpha:.2,scale:1.15,duration:2400,yoyo:true,repeat:-1})}
 }
}
