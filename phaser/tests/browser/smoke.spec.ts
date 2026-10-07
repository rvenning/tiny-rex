import {test,expect,type Page} from '@playwright/test';
async function hatch(page:Page){await page.goto('./');await expect(page.getByRole('button',{name:'Start hatching'})).toBeVisible();await page.getByRole('button',{name:'Start hatching'}).click();await page.getByRole('button',{name:'New hatchling'}).click();await page.getByLabel('Your name').fill('Test Rex');await page.getByRole('button',{name:'Start my adventure'}).click();await expect(page.getByRole('heading',{name:'Test Rex’s valleys',exact:false})).toBeVisible()}
async function hunt(page:Page){await page.getByRole('button',{name:'Hunt 1, First Light, 0 stars',exact:true}).click();await page.getByRole('button',{name:'Let’s hunt'}).click();await expect(page.locator('#stage')).toHaveAttribute('data-state','playing')}
test.beforeEach(async({page})=>{await page.route(/googleapis|firebaseapp|gstatic/,route=>route.abort());await page.addInitScript(()=>{if(!sessionStorage.getItem('test-started')){localStorage.clear();sessionStorage.setItem('test-started','yes')}})});
test('loads real Phaser 4 and starts, pauses, resumes, restarts and quits',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await hatch(page);await hunt(page);
 await expect(page.locator('#stage canvas')).toBeVisible();await page.waitForTimeout(700);
 expect(await page.evaluate(()=> (window as any).rexDiagnostics().phaser)).toMatch(/^4\./);
 await page.getByRole('button',{name:'Pause',exact:false}).click();await expect(page.getByRole('heading',{name:'Your valley can wait.'})).toBeVisible();expect(await page.evaluate(()=>(window as any).rexDiagnostics().paused)).toBe(true);
 await page.getByRole('button',{name:'Keep hunting'}).click();await expect(page.getByRole('heading',{name:'Your valley can wait.'})).not.toBeVisible();
 await page.getByRole('button',{name:'Pause',exact:false}).click();await page.getByRole('button',{name:'Start this hunt again'}).click();await expect(page.locator('#stage')).toHaveAttribute('data-score','0');
 await page.getByRole('button',{name:'Pause',exact:false}).click();await page.getByRole('button',{name:'Back to valleys',exact:true}).click();await expect(page.getByRole('heading',{name:'Test Rex’s valleys',exact:false})).toBeVisible();expect(errors).toEqual([]);
});
test('pointer input earns a real result and unlocks the next hunt',async({page})=>{
 await hatch(page);await hunt(page);
 // Tap a serpentine route across the actual arena. No game-state mutation.
 const canvas=page.locator('#stage canvas');const box=(await canvas.boundingBox())!;
 for(let round=0;round<5;round++){
  for(const [x,y] of [[75,145],[260,145],[310,270],[50,270],[50,420],[290,420],[290,500],[70,500]]){
   if(await page.getByRole('button',{name:'Next adventure'}).isVisible())break;
   await page.mouse.click(box.x+(x+30)/420*box.width,box.y+(y+125)/740*box.height);await page.waitForTimeout(450);
  }
  if(await page.getByRole('button',{name:'Next adventure'}).isVisible())break;
 }
 await expect(page.getByRole('button',{name:'Next adventure'})).toBeVisible({timeout:10000});
 await page.getByRole('button',{name:'Back to valleys',exact:true}).click();await expect(page.getByRole('button',{name:'Hunt 2, Bigger Bites, 0 stars',exact:true})).toBeEnabled();
});
test('preferences and legacy saves survive reload',async({page})=>{
 await page.goto('./');await page.evaluate(()=>{localStorage.setItem('trex_profiles',JSON.stringify([{id:'legacy',name:'Legacy Rex',avatar:'🦖',pin:null,created:1,updated:1}]));localStorage.setItem('trex_settings',JSON.stringify({sound:false,lastProfile:'legacy'}));localStorage.setItem('trex_progress_legacy',JSON.stringify({levels:{0:{stars:3,best:900}},met:{fern:1},feastBest:20,feastTier:1,catches:5,updated:1}))});
 // Clear-on-new-document script is removed by using a second page in this context.
 await page.reload();await page.getByRole('button',{name:'Keep going as Legacy Rex'}).click();await expect(page.getByRole('heading',{name:'Legacy Rex’s valleys',exact:false})).toBeVisible();await expect(page.getByText('★ 3 / 60')).toBeVisible();await page.getByRole('button',{name:'Sound off',exact:false}).click();await page.reload();await expect(page.getByRole('button',{name:'Sound on',exact:false})).toBeVisible();
});
test('book, leaderboard and feast unlock follow saved progress',async({page})=>{
 await hatch(page);await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('trex_profiles')!)[0];localStorage.setItem('trex_progress_'+p.id,JSON.stringify({levels:Object.fromEntries([0,1,2,3,4].map(i=>[i,{stars:3,best:900}])),met:{fern:1,compy:1},feastBest:20,feastTier:1,catches:5,updated:1}))});
 await page.getByRole('button',{name:'Dino Book',exact:true}).click();await expect(page.getByRole('heading',{name:'Compsognathus'})).toBeVisible();await page.getByRole('button',{name:'Family',exact:true}).click();await expect(page.getByRole('heading',{name:'Test Rex',exact:true})).toBeVisible();await page.getByRole('button',{name:'Valleys',exact:true}).click();await page.getByRole('button',{name:'Enter the Feast'}).click();await expect(page.locator('#stage')).toHaveAttribute('data-state','playing');
});
for(const viewport of [{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1024,height:768},{width:1440,height:900}])test(`fits ${viewport.width} × ${viewport.height}`,async({page})=>{await page.setViewportSize(viewport);await hatch(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await hunt(page);const box=(await page.locator('#stage canvas').boundingBox())!;expect(box.width).toBeGreaterThan(150);expect(box.height).toBeLessThanOrEqual(viewport.height+1);await page.screenshot({path:`test-results/${test.info().project.name}-${viewport.width}x${viewport.height}.png`})});
test('production PWA controls the page and reloads offline',async({page,context})=>{await page.goto('./');await page.evaluate(async()=>{await navigator.serviceWorker.ready});await page.reload();await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);await context.setOffline(true);await page.reload();await expect(page.getByRole('button',{name:'Start hatching'})).toBeVisible();await expect(page.locator('#stage canvas')).toBeVisible();await context.setOffline(false)});
