import * as Phaser from 'phaser';
import {registerSW} from 'virtual:pwa-register';
import {BootScene} from './scenes/BootScene';
import {MenuScene} from './scenes/MenuScene';
import {PlayScene} from './scenes/PlayScene';
import {presentation} from './game/config';
import {App} from './ui/app';
import './ui/style.css';

document.getElementById('stage')!.tabIndex=0;
const game=new Phaser.Game({type:Phaser.AUTO,parent:'stage',width:presentation.width,height:presentation.height,backgroundColor:'#152820',scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},input:{activePointers:3},render:{antialias:true,roundPixels:false},fps:{target:60},scene:[BootScene,MenuScene,PlayScene]});
const app=new App(game);
// Updates are offered between hunts; no automatic reload mid-run.
const update=registerSW({onNeedRefresh(){const el=document.createElement('button');el.className='update-button';el.textContent='A fresh adventure is ready · update';el.onclick=()=>{if(document.body.dataset.screen!=='playing')void update(true);else el.textContent='Finish this hunt, then tap to update'};document.body.append(el)}});
// Read-only diagnostics support smoke tests without cheating controls in production.
Object.assign(window,{rexDiagnostics:()=>({phaser:Phaser.VERSION,scene:game.scene.isActive('Play')?'Play':'Menu',paused:game.scene.isPaused('Play'),textures:game.textures.getTextureKeys().length,fps:game.loop.actualFps,savesAvailable:app.store.available})});
