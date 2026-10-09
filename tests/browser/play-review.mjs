import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.route(/googleapis|firebaseapp|gstatic/,r=>r.abort());
 await page.addInitScript(()=>{localStorage.clear();localStorage.setItem('trex_profiles',JSON.stringify([{id:'controls-review',name:'Controls Rex',avatar:'x',pin:null,created:1,updated:1}]));localStorage.setItem('trex_settings',JSON.stringify({sound:false,lastProfile:'controls-review'}));});
 await page.goto('http://127.0.0.1:4177/tiny-rex/');await page.getByRole('button',{name:/Continue as Controls Rex/}).click({timeout:60000});await page.waitForFunction(()=>window.adventureDiagnostics?.()?.ready,undefined,{timeout:30000});
 const log=[];

 for(const kind of ['beetle','raptor']){
  const result=await page.evaluate(async kind=>{
   const scene=window.__rex.game.scene.getScene('Adventure'),sim=scene.sim;
   const alive=()=>sim.actors.filter(a=>a.state!=='dead'&&a.spec.id===kind);
   const target=alive().sort((a,b)=>Math.hypot(a.x-sim.player.x,a.y-sim.player.y)-Math.hypot(b.x-sim.player.x,b.y-sim.player.y))[0];
   if(!target)return {kind,missing:true};
   const held=new Set(), codes={w:87,a:65,s:83,d:68,j:74,' ':32};
   const send=(key,type)=>window.dispatchEvent(new KeyboardEvent(type,{key,code:key===' '?'Space':'Key'+key.toUpperCase(),keyCode:codes[key],which:codes[key],bubbles:true}));
   const state=()=>({x:sim.player.x,y:sim.player.y,hp:sim.player.hp,xp:sim.save.xp.rex,target:{x:target.x,y:target.y,hp:target.hp,state:target.state},objective:sim.objective,status:document.querySelector('[role=status]')?.textContent});
   const before=state(),start=performance.now(),frames=[],samples=[];let last=start,dodged=false;const states=new Set(),captures=[];
   const raf=time=>{if(time-start<6000){frames.push(time-last);last=time;requestAnimationFrame(raf);}};requestAnimationFrame(raf);
   while(performance.now()-start<24000&&target.state!=='dead'&&sim.player.hp>0){
    const p=sim.player,dx=target.x-p.x,dy=target.y-p.y,distance=Math.hypot(dx,dy),sx=dx-dy,sy=(dx+dy)*.58,want=new Set();
    if(distance>1.1){if(Math.abs(sx)>.2)want.add(sx>0?'d':'a');if(Math.abs(sy)>.2)want.add(sy>0?'s':'w');}
    if(kind==='beetle'&&distance<2.6)want.add('j');
    if(kind==='raptor'&&['windup','strike','recover'].includes(target.state)&&!states.has(target.state)){
      states.add(target.state);samples.push({event:'predator '+target.state,time:performance.now()-start,distance,...state()});
      const name='raptor-'+target.state;scene.game.events.once('postrender',()=>captures.push({name,png:scene.game.canvas.toDataURL('image/png')}));
    }
    if(kind==='raptor'&&distance<6&&target.state==='windup'&&target.t<.27&&!dodged){
      // Dodge across its committed attack lane, rather than toward its snout.
      want.clear();const px=-dy-dx,py=(-dy+dx)*.58;
      if(Math.abs(px)>.2)want.add(px>0?'d':'a');if(Math.abs(py)>.2)want.add(py>0?'s':'w');
      want.add(' ');dodged=true;
    }
    for(const key of held)if(!want.has(key)){send(key,'keyup');held.delete(key);}
    for(const key of want)if(!held.has(key)){send(key,'keydown');held.add(key);}
    if(samples.length===0||performance.now()-start-samples.at(-1).time>1000)samples.push({time:performance.now()-start,distance,...state()});
    if(dodged&&states.has("recover"))break;
    await new Promise(r=>setTimeout(r,120));
   }
   for(const key of held)send(key,'keyup');
   await new Promise(r=>setTimeout(r,60));
   const sorted=frames.slice(2).sort((a,b)=>a-b);
   return {kind,before,after:state(),dodged,samples,captures,raf:{samples:sorted.length,median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)]}};
  },kind);
  for(const capture of result.captures??[])await writeFile('.scratch/browser/'+capture.name+'.png',Buffer.from(capture.png.split(',')[1],'base64'));delete result.captures;log.push(result);await writeFile('.scratch/browser/controls-review.json',JSON.stringify(log,null,2));await page.screenshot({path:'.scratch/browser/'+(kind==='beetle'?'first-catch':'predator-dodge')+'.png'});
 }
 console.log(JSON.stringify(log.map(({samples,...r})=>r),null,2));
} finally {await browser.close();}

