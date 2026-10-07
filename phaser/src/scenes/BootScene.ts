import * as Phaser from 'phaser';
import {bakeTextures} from '../art/textures';
export class BootScene extends Phaser.Scene {
 constructor(){super('Boot')}
 create(){bakeTextures(this);this.scene.start('Menu');window.dispatchEvent(new Event('rex-ready'))}
}
