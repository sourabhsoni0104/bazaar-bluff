import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'bazaar-test-')),port=32000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;let proc,admin='';
async function call(route,data,cookie=''){let r=await fetch(base+route,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:cookie},body:data?JSON.stringify(data):undefined});let body=await r.json();return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const state=async cookie=>(await call('/api/state',null,cookie)).body;
const control=(data,cookie=admin)=>call('/api/control',data,cookie);
// Signs in a new local test player; the server creates the player record.
const newPlayer=async()=>{let r=await call('/api/demo',{});assert.equal(r.status,200);let s=await state(r.cookie);return {cookie:r.cookie,id:s.teamId};};
const seat=async(player,table,index)=>{let r=await control({action:'seat',player,table,index});assert.equal(r.status,200,JSON.stringify(r.body));};
const tables=async()=>(await state(admin)).tables;
before(async()=>{
// An older save from when players joined parties with codes: it must load without those parties.
writeFileSync(path.join(dir,'state.json'),JSON.stringify({settings:{pot:400,rounds:5,fallback:100,tie:'split',timers:{proposal:180,voting:120,results:45,deployment:180,battle:60},fields:[{name:'The Citadel',value:500},{name:'Iron Harbour',value:400},{name:'High Ridge',value:300},{name:'The Crossroads',value:200},{name:'Outpost',value:100}]},groups:[{id:'old',name:'Sector 01',code:'ABCDEFG',teams:[]}],audit:[],sessions:{}}));
proc=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATABASE_URL:'',SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:'',SUPABASE_ANON_KEY:'',PORT:String(port),ADMIN_PASSWORD:'integration-test-password',DATA_FILE:path.join(dir,'state.json')},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{proc.stdout.on('data',d=>{if(d.toString().includes('ready:'))resolve();});proc.on('error',reject);proc.on('exit',c=>reject(Error('server exited '+c)));});});
after(()=>{proc?.kill();rmSync(dir,{recursive:true,force:true});});
test('parties are gone: an older save loads empty and the join and code routes no longer exist',async()=>{
let pub=await state();assert.equal(pub.role,'public');assert.deepEqual(pub.tables,[]);assert.deepEqual(pub.players,[]);assert.equal(pub.groups,undefined);assert.equal(pub.mine,undefined);assert.equal(pub.game.phase,'lobby');
assert.equal((await call('/api/join',{code:'ABCDEFG',name:'Team',pin:'1234'})).status,400);
admin=(await call('/api/admin/login',{password:'integration-test-password'})).cookie;
assert.equal((await call('/api/codes',null,admin)).status,404);
assert.equal((await control({action:'create',count:1})).status,400);});
test('server validates identities, hides secrets, scores once and keeps each player\'s points across rounds',async()=>{
assert.equal((await call('/api/control',{action:'advance'})).status,403);
assert.equal((await call('/api/admin/login',{password:'wrong'})).status,400);
let players=[];for(let i=0;i<4;i++)players.push(await newPlayer());
assert.equal((await control({action:'table-create',name:'Alpha table'})).status,200);let [t]=await tables();assert.equal(t.name,'Alpha table');
assert.equal((await call('/api/enroll',{})).status,400,'public visitors cannot enrol');
// Not enough players for a table, and nobody is seated yet.
for(let p of players.slice(0,2))await seat(p.id,t.id);
assert.equal((await control({action:'start-round'})).status,400);
for(let p of players.slice(2))await seat(p.id,t.id);
let seated=await state(players[0].cookie);assert.equal(seated.mine.slot,0);assert.equal(seated.mine.tableName,'Alpha table');assert.ok(!JSON.stringify(seated).includes('"pin"'));
assert.equal((await call('/api/entry',{values:[100,100,100,100],lock:true},players[0].cookie)).status,400,'no entries before the round starts');
assert.equal((await control({action:'advance'})).status,400);
assert.equal((await control({action:'start-round'},players[0].cookie)).status,403);
assert.equal((await control({action:'start-round'})).status,200);
let live=await state(players[0].cookie);assert.equal(live.game.phase,'proposal');assert.equal(live.game.round,1);assert.ok(live.game.deadline);
// Tables are locked while the round runs.
for(let action of [{action:'table-create'},{action:'table-rename',table:t.id,name:'Renamed'},{action:'table-delete',table:t.id},{action:'seat',player:players[0].id,table:null},{action:'auto-seat'},{action:'player-rename',player:players[0].id,name:'Changed'},{action:'player-remove',player:players[0].id}]){let r=await control(action);assert.equal(r.status,400,action.action);assert.match(r.body.error,/locked/i);}
assert.equal((await control({action:'start-round'})).status,400,'a round is already running');
assert.equal((await control({action:'settings',settings:{pot:400,rounds:5,fallback:100,tie:'split'}})).status,400);
let cookies=players.map(p=>p.cookie);
assert.equal((await call('/api/entry',{values:[99,100,100,100],lock:true},cookies[0])).status,400);
for(let c of cookies)assert.equal((await call('/api/entry',{values:[100,100,100,100],lock:true},c)).status,200);
let other=await state(cookies[1]);assert.ok(!other.mine.proposals);assert.equal(other.mine.entry.proposal[0],100);
let av=await state(admin);assert.ok(!av.mine&&!JSON.stringify(av).includes('"proposals"'));
await control({action:'advance'});
let voted=await state(cookies[0]);assert.equal(voted.mine.proposals.length,4);assert.ok(voted.mine.proposals.every(p=>!p.author));assert.ok(!voted.mine.outcome);
for(let c of cookies)await call('/api/entry',{values:[true,true,true,true],lock:true},c);
assert.equal((await call('/api/export',null,admin)).status,400);
// Every proposal drew the same approvals, so all four pass and each player's four 100-point shares add up.
await control({action:'advance'});assert.equal((await state(cookies[0])).mine.army,400);
await control({action:'advance'});
await control({action:'pause'});assert.equal((await call('/api/entry',{values:[20,20,20,20,20],lock:true},cookies[0])).status,400);await control({action:'pause'});
let ds=[[30,30,20,10,10],[20,20,20,20,20],[40,40,20,0,0],[10,10,30,50,0]];
for(let [i,c] of cookies.entries())await call('/api/entry',{values:ds[i],lock:true},c);
let beforeBattle=await state(cookies[1]);assert.ok(!beforeBattle.mine.battle);
await control({action:'advance'});let battle=await state(cookies[0]);assert.deepEqual(battle.mine.battle.scores,[0,100,900,500]);assert.deepEqual(battle.tables[0].seats.map(s=>s.score),[0,100,900,500]);
let exported=await call('/api/export',null,admin);assert.equal(exported.status,200);assert.ok(!exported.body.sessions);assert.ok(!JSON.stringify(exported.body).includes('userId'));
// The round closes and waits for the organiser: nothing starts the next round by itself.
await control({action:'advance'});let between=await state(cookies[0]);assert.equal(between.game.phase,'between');assert.equal(between.game.deadline,null);assert.equal(between.game.round,1);assert.ok(between.mine.battle,'last round stays visible while waiting');
assert.equal((await control({action:'advance'})).status,400);assert.equal((await state(cookies[0])).game.phase,'between');
// Between rounds the organiser can reshuffle: scores belong to the player, not the seat.
assert.equal((await control({action:'table-create',name:'Beta table'})).status,200);let [a,b]=await tables();
await seat(players[2].id,b.id);await seat(players[0].id,b.id);
assert.equal((await control({action:'start-round'})).status,400,'both tables are below three players');
await seat(players[1].id,b.id);await seat(players[3].id,b.id);
assert.equal((await control({action:'start-round'})).status,400,'Alpha is empty');
await seat(players[0].id,a.id);await seat(players[1].id,a.id);await seat(players[2].id,a.id,0);
assert.equal((await control({action:'table-delete',table:b.id})).status,200);await seat(players[3].id,a.id);
let moved=await state(cookies[2]);assert.equal(moved.mine.slot,0);assert.equal(moved.players.find(p=>p.id===players[2].id).score,900);
assert.equal((await control({action:'start-round'})).status,200);let next=await state(cookies[0]);assert.equal(next.game.round,2);assert.equal(next.game.phase,'proposal');assert.equal(next.players.find(p=>p.id===players[1].id).score,100);
assert.ok(JSON.parse(readFileSync(path.join(dir,'state.json'))).game.round===2);
});
test('40 players at ten tables start each round together and can reconnect',{timeout:30000},async()=>{
// Finish the previous test's round so tables can be rebuilt.
await control({action:'end'});for(let t of await tables())await control({action:'table-delete',table:t.id});
for(let p of (await state(admin)).players)await control({action:'player-remove',player:p.id});
let players=[];let started=performance.now();for(let i=0;i<40;i++)players.push(await newPlayer());console.log(`40 sign-ins: ${Math.round(performance.now()-started)} ms`);
let before=await state(admin);assert.equal(before.players.length,40);assert.ok(before.players.every(p=>!p.table));
assert.equal((await control({action:'auto-seat'})).status,200);let laid=await tables();assert.equal(laid.length,10);assert.ok(laid.every(t=>t.seats.length===4));assert.equal((await control({action:'auto-seat'})).status,400);
assert.equal((await control({action:'add-round'})).status,200);assert.equal((await state(admin)).game.phase,'between');
const connections=await Promise.all(Array.from({length:40},async()=>{const controller=new AbortController();const r=await fetch(base+'/api/events',{signal:controller.signal});assert.equal(r.status,200);const reader=r.body.getReader();await reader.read();return {controller,reader};}));
try{
let at=Date.now();assert.equal((await control({action:'start-round'})).status,200);
let states=await Promise.all(players.map(p=>state(p.cookie)));
assert.equal(new Set(states.map(s=>s.game.deadline)).size,1,'one shared clock');assert.ok(states.every(s=>s.game.phase==='proposal'&&s.game.round===3&&s.mine.slot>=0));assert.ok(states[0].game.deadline-at<=180000+1000);
started=performance.now();const submitted=await Promise.all(players.map(p=>call('/api/entry',{values:[100,100,100,100],lock:true},p.cookie)));assert.ok(submitted.every(r=>r.status===200));console.log(`40 simultaneous proposals with 40 SSE clients: ${Math.round(performance.now()-started)} ms`);
let locked=await Promise.all(players.map(p=>state(p.cookie)));assert.ok(locked.every(r=>r.tables.find(t=>t.id===r.mine.table).locked===4&&r.mine.myLock===true));
// Every table moves to voting with a single organiser action.
await control({action:'advance'});assert.ok((await Promise.all(players.map(p=>state(p.cookie)))).every(s=>s.game.phase==='voting'&&s.mine.proposals.length===4));
}finally{for(let c of connections)c.controller.abort();}
});
test('Jinnfire Exchange stays locked to players until an organiser opens it',async()=>{
let locked=await call('/api/jinn/state');assert.equal(locked.status,200);assert.deepEqual(locked.body,{enabled:false,locked:true});
assert.equal((await call('/api/jinn/enroll',{})).status,403);assert.equal((await call('/api/jinn/join',{code:'ABCDEFGH1234'})).status,403);assert.equal((await call('/api/jinn/submit',{quantity:3})).status,403);
let player=await call('/api/demo',{});assert.equal((await call('/api/jinn/state',null,player.cookie)).body.locked,true);
assert.equal((await call('/api/control',{action:'jinnfire-access',open:true},player.cookie)).status,403);
assert.equal((await call('/api/state')).body.settings.jinnfireOpen,undefined);
assert.equal((await control({action:'jinnfire-access',open:true})).status,200);assert.equal((await call('/api/state')).body.settings.jinnfireOpen,true);
let opened=await call('/api/jinn/state');assert.notEqual(opened.body.locked,true);
assert.equal((await control({action:'jinnfire-access',open:false})).status,200);assert.deepEqual((await call('/api/jinn/state')).body,{enabled:false,locked:true});});
test('organisers manage the sign-in list; players and the public cannot see or change it',async()=>{
let r=await control({action:'allow-emails',emails:' Player.One@Example.com, not-an-email\nplayer.two@example.com;player.one@example.com'});assert.equal(r.status,200);assert.equal(r.body.added,2);assert.deepEqual(r.body.invalid,['not-an-email']);
let list=(await state(admin)).allowedEmails;assert.ok(list.includes('player.one@example.com')&&list.includes('player.two@example.com'));
assert.equal((await state()).allowedEmails,undefined);let player=await call('/api/demo',{});assert.equal((await state(player.cookie)).allowedEmails,undefined);
assert.equal((await call('/api/control',{action:'allow-emails',emails:'x@example.com'},player.cookie)).status,403);assert.equal((await call('/api/control',{action:'disallow-email',email:'player.one@example.com'})).status,403);
assert.equal((await control({action:'disallow-email',email:'PLAYER.ONE@example.com'})).status,200);assert.ok(!(await state(admin)).allowedEmails.includes('player.one@example.com'));});
test('organisers edit tables and players freely between rounds; players cannot',async()=>{
await control({action:'end'});for(let t of await tables())await control({action:'table-delete',table:t.id});
let [p,q]=[await newPlayer(),await newPlayer()];
assert.equal((await control({action:'table-create',count:2})).status,200);let [a,b]=await tables();assert.notEqual(a.name,b.name);
assert.equal((await call('/api/control',{action:'table-create'},p.cookie)).status,403);assert.equal((await call('/api/control',{action:'seat',player:p.id,table:a.id})).status,403);
assert.equal((await control({action:'table-rename',table:a.id,name:'Gold'})).status,200);assert.equal((await control({action:'table-rename',table:b.id,name:'gold'})).status,400,'names stay unique');assert.equal((await control({action:'table-rename',table:b.id,name:''})).status,400);
assert.equal((await control({action:'seat',player:'missing',table:a.id})).status,400);assert.equal((await control({action:'seat',player:p.id,table:'missing'})).status,400);
await seat(p.id,a.id);await seat(q.id,a.id,0);assert.deepEqual((await tables()).find(t=>t.id===a.id).seats.map(s=>s.id),[q.id,p.id]);
await seat(p.id,b.id);assert.deepEqual((await tables()).find(t=>t.id===a.id).seats.map(s=>s.id),[q.id]);await seat(p.id,null);assert.ok((await tables()).every(t=>!t.seats.some(s=>s.id===p.id)));
let crowd=[];for(let i=0;i<5;i++)crowd.push(await newPlayer());for(let c of crowd)await seat(c.id,b.id);let extra=await newPlayer();let full=await control({action:'seat',player:extra.id,table:b.id});assert.equal(full.status,400);assert.match(full.body.error,/full/i);
await seat(crowd[0].id,b.id,3);assert.equal((await control({action:'player-rename',player:p.id,name:'Renamed player'})).status,200);assert.equal((await state(admin)).players.find(x=>x.id===p.id).name,'Renamed player');
assert.equal((await control({action:'player-remove',player:p.id})).status,200);assert.ok(!(await state(admin)).players.some(x=>x.id===p.id));
assert.equal((await control({action:'table-delete',table:b.id})).status,200);assert.ok((await state(admin)).players.filter(x=>crowd.some(c=>c.id===x.id)).every(x=>!x.table));
let pub=await state();assert.ok(pub.players.every(x=>!('email' in x)));
});
test('tables hold four or five players, removing someone from a table only unseats them, and players pick their display name',async()=>{
await control({action:'end'});for(let t of await tables())await control({action:'table-delete',table:t.id});
for(let p of (await state(admin)).players)await control({action:'player-remove',player:p.id});
let six=[];for(let i=0;i<6;i++)six.push(await newPlayer());
// Six cannot make two tables of four, so auto-seat fills one table of five and leaves one player for the organiser to place.
let auto=await control({action:'auto-seat'});assert.equal(auto.status,200);assert.deepEqual([auto.body.seated,auto.body.unseated],[5,1]);
let [first]=await tables();assert.equal(first.seats.length,5);let left=(await state(admin)).players.find(p=>!p.table);
let full=await control({action:'seat',player:left.id,table:first.id});assert.equal(full.status,400);assert.match(full.body.error,/full/i);
assert.equal((await control({action:'auto-seat'})).status,400,'nothing to place');
let more=[];for(let i=0;i<3;i++)more.push(await newPlayer());assert.equal((await control({action:'table-create',name:'Short'})).status,200);let short=(await tables()).find(t=>t.name==='Short');
for(let p of more)await seat(p.id,short.id);
await control({action:'add-round'});let tooSmall=await control({action:'start-round'});assert.equal(tooSmall.status,400);assert.match(tooSmall.body.error,/Short has 3 players.*4 or 5/);
// The one unseated player tops up the short table instead of opening a new one.
auto=await control({action:'auto-seat'});assert.equal(auto.status,200);assert.deepEqual([auto.body.seated,auto.body.unseated],[1,0]);assert.equal((await tables()).length,2);
// Removing someone from a table leaves them on the player list (and, for real accounts, the sign-in list).
let before=(await state(admin)).allowedEmails;await seat(more[0].id,null);let after=await state(admin);
assert.ok(after.players.some(p=>p.id===more[0].id&&!p.table));assert.deepEqual(after.allowedEmails,before);assert.equal((await control({action:'start-round'})).status,400);
await seat(more[0].id,short.id);assert.equal((await control({action:'start-round'})).status,200);
// Display names: whitespace is tidied, empty and over-long names are refused, and only signed-in players can change theirs.
let me=await newPlayer();let renamed=await call('/api/profile',{name:'  Sand   Fox '},me.cookie);assert.equal(renamed.status,200);assert.equal(renamed.body.name,'Sand Fox');
assert.equal((await state(admin)).players.find(p=>p.id===me.id).name,'Sand Fox');
assert.equal((await call('/api/profile',{name:'   '},me.cookie)).status,400);assert.equal((await call('/api/profile',{name:'x'.repeat(61)},me.cookie)).status,400);
assert.equal((await call('/api/profile',{name:'Nobody'})).status,400);assert.equal((await call('/api/profile',{name:'Boss'},admin)).status,400);
});
test('the most-approved proposals pass, and tied leaders are added together',async()=>{
await control({action:'end'});for(let t of await tables())await control({action:'table-delete',table:t.id});
for(let p of (await state(admin)).players)await control({action:'player-remove',player:p.id});
let four=[];for(let i=0;i<4;i++)four.push(await newPlayer());await control({action:'table-create',name:'Tie'});let [t]=await tables();for(let p of four)await seat(p.id,t.id);
await control({action:'add-round'});assert.equal((await control({action:'start-round'})).status,200);
let shares=[[400,0,0,0],[0,400,0,0],[100,100,100,100]];for(let [i,p] of four.slice(0,3).entries())assert.equal((await call('/api/entry',{values:shares[i],lock:true},p.cookie)).status,200);
await control({action:'advance'});
// Everyone approves both 400-point proposals and rejects the even split: the two leaders tie and both pass.
for(let p of four){let s=await state(p.cookie);let votes=s.mine.proposals.map(x=>x.shares.includes(400));assert.equal((await call('/api/entry',{values:votes,lock:true},p.cookie)).status,200);}
await control({action:'advance'});let armies=[];for(let p of four){let s=await state(p.cookie);armies[s.mine.slot]=s.mine.army;assert.equal(s.mine.outcome.winners.length,2);}
assert.deepEqual(armies,[400,400,0,0]);
});
