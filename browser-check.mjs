import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.BASE_URL||'http://localhost:3000';
const browser=await chromium.launch({headless:true,...process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}});
const errors=[];const open=async(viewport={width:1440,height:1000})=>{const context=await browser.newContext({viewport});return context;};
try{
// The organiser signs in once; four players sign in as local test players and the organiser seats them.
const adminContext=await open();const pass=process.env.QA_ADMIN_PASSWORD||fs.readFileSync('.env','utf8').match(/ADMIN_PASSWORD=(.+)/)[1];
assert.equal((await adminContext.request.post(base+'/api/admin/login',{data:{password:pass}})).status(),200);
const control=async data=>{const r=await adminContext.request.post(base+'/api/control',{data});assert.equal(r.status(),200,JSON.stringify(await r.json()));};
const state=async context=>(await (await context.request.get(base+'/api/state')).json());
const players=[];for(let i=0;i<4;i++){const context=await open();assert.equal((await context.request.post(base+'/api/demo',{data:{}})).status(),200);assert.equal((await context.request.post(base+'/api/profile',{data:{name:'Qa player '+(i+1),confirm:true}})).status(),200);players.push({context,id:(await state(context)).teamId});}
await control({action:'table-create',name:'Qa table'});const [table]=(await state(adminContext)).tables;for(const player of players)await control({action:'seat',player:player.id,table:table.id});
const entry=(player,values)=>player.context.request.post(base+'/api/entry',{data:{values,lock:true}});
const p=await players[0].context.newPage();p.on('pageerror',e=>errors.push(e.message));
await p.goto(base);await p.waitForSelector('.hero');await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:'desktop-preview.png',fullPage:true});
// Nothing happens until the organiser starts the round, and then it happens for every table at once.
await p.goto(base+'/team');await p.getByText('Round 1 starts for every table at the same moment').waitFor();console.log('PASS: seated player waits for the organiser');
await control({action:'start-round'});await p.getByRole('button',{name:'Equal split',exact:true}).waitFor();await p.waitForFunction(()=>document.querySelector('#announcer').textContent.startsWith('Round 1: The negotiation.'));console.log('PASS: screen readers hear the phase change');await p.getByRole('button',{name:'Equal split',exact:true}).click();await p.locator('#num-0').fill('101');await p.locator('#num-1').fill('99');await p.waitForTimeout(1400);assert.equal(await p.evaluate(()=>document.activeElement.id),'num-1');assert.equal(await p.locator('#num-1').inputValue(),'99');console.log('PASS: live updates preserve focused inputs');
// A proposal that does not add up to the pot yet still saves as a draft.
await p.waitForTimeout(800);assert.deepEqual((await state(players[0].context)).mine.entry.proposal,[100,99,100,100]);await p.locator('[data-save-note]').getByText('Draft saved').waitFor();console.log('PASS: unfinished proposal drafts save');
await p.locator('#num-1').fill('100');await p.getByRole('button',{name:'Lock in proposal'}).click();await p.getByRole('button',{name:'Unlock & edit'}).waitFor();
console.log('PASS: round started by the organiser, equal split, validated lock');
for(const player of players.slice(1))assert.equal((await entry(player,[100,100,100,100])).status(),200);
await control({action:'advance'});await p.locator('[data-vote]').first().waitFor();for(let i=0;i<4;i++){await p.locator(`[data-vote="${i}"]`).click();assert.equal(await p.evaluate(()=>document.activeElement.dataset.vote),String(i),'focus stays on the vote button after the page re-renders');}console.log('PASS: keyboard focus survives re-renders');await p.getByRole('button',{name:'Lock in votes'}).click();await p.getByRole('button',{name:'Unlock & edit'}).waitFor();
for(const player of players.slice(1))assert.equal((await entry(player,[true,true,true,true])).status(),200);
await control({action:'advance'});await p.getByText('The verdict is in.').waitFor();console.log('PASS: anonymous voting and results');
await control({action:'advance'});await p.getByRole('button',{name:'Spread evenly',exact:true}).waitFor();await p.getByRole('button',{name:'Spread evenly',exact:true}).click();await p.getByRole('button',{name:'Lock in deployment'}).click();await p.getByRole('button',{name:'Unlock & edit'}).waitFor();
await p.setViewportSize({width:360,height:800});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:'team-preview.png',fullPage:true});
await control({action:'advance'});await p.getByText('The spoils of war').waitFor();console.log('PASS: troop deployment and battle reveal at 360px');
// The round ends and waits: no table moves on until the organiser starts round 2.
await control({action:'advance'});await p.getByText('Round 1 is complete. Round 2 starts for every table when the organiser begins it.').waitFor();await p.waitForTimeout(2600);assert.equal((await state(adminContext)).game.phase,'between');
await control({action:'start-round'});await p.getByRole('button',{name:'Equal split',exact:true}).waitFor();assert.ok((await p.locator('.timer').first().textContent()).match(/\d\d:\d\d/));console.log('PASS: round 2 begins only when the organiser starts it');
await p.goto(base+'/rules');await p.getByRole('heading',{name:'How to play',exact:true}).waitFor();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await p.goto(base+'/display');await p.waitForSelector('.display-clock');assert.equal(await p.locator('input').count(),0);console.log('PASS: rules and read-only projector');
await p.goto(base+'/tables');await p.getByText('Qa table').first().waitFor();
await p.goto(base);await p.waitForSelector('.hero');await p.setViewportSize({width:390,height:844});await p.screenshot({path:'mobile-preview.png',fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
// Organiser view: the table editor is locked while round 2 runs, and opens again afterwards.
const adminPage=await adminContext.newPage();adminPage.on('pageerror',e=>errors.push(e.message));await adminPage.goto(base+'/admin');await adminPage.locator('.table-editor').waitFor();await adminPage.locator('.table-lock').waitFor();assert.ok(await adminPage.locator('[data-table-act="table-rename"]').first().isDisabled());await adminPage.screenshot({path:'admin-tables-locked.png',fullPage:true});
await control({action:'end'});await adminPage.locator('.table-lock').waitFor({state:'detached'});assert.ok(await adminPage.locator('[data-table-act="table-rename"]').first().isEnabled());
await adminPage.locator('[data-seat-remove]').first().click();await adminPage.locator('.table-unseated .seat-row').waitFor();assert.equal((await state(adminContext)).tables[0].seats.length,3);
await adminPage.locator('#table-form button').click();await adminPage.waitForFunction(()=>document.querySelectorAll('.table-editor').length===2);
await adminPage.goto(base+'/settings');await adminPage.getByText('Set the stakes.').waitFor();console.log('PASS: organiser table editor locks during a round and edits between rounds');
await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('canvas').count(),0);console.log('PASS: gameplay has no continuous canvas/WebGL renderer');assert.deepEqual(errors,[]);console.log('PASS: no browser JavaScript errors; no phone overflow');
}finally{await browser.close();}
