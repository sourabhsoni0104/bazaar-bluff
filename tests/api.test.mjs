import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'bazaar-test-')),port=32000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;let proc,admin='',cookies=[];
async function call(route,data,cookie=''){let r=await fetch(base+route,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:cookie},body:data?JSON.stringify(data):undefined});let body=await r.json();return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
before(async()=>{proc=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATABASE_URL:'',SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:'',SUPABASE_ANON_KEY:'',PORT:String(port),ADMIN_PASSWORD:'integration-test-password',DATA_FILE:path.join(dir,'state.json')},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{proc.stdout.on('data',d=>{if(d.toString().includes('ready:'))resolve();});proc.on('error',reject);proc.on('exit',c=>reject(Error('server exited '+c)));});});
after(()=>{proc?.kill();rmSync(dir,{recursive:true,force:true});});
test('server validates identities, hides secrets, scores once and exports closed audit',async()=>{
let pub=await call('/api/state');assert.equal(pub.body.role,'public');assert.ok(pub.body.groups.every(g=>!g.code&&!g.mine&&!g.proposals));assert.ok(!JSON.stringify(pub.body).includes('"pin"'));
assert.equal((await call('/api/control',{action:'advance'})).status,403);
assert.equal((await call('/api/admin/login',{password:'wrong'})).status,400);
admin=(await call('/api/admin/login',{password:'integration-test-password'})).cookie;
await call('/api/control',{action:'create',count:1,size:4},admin);let g=(await call('/api/state',null,admin)).body.groups.find(g=>!g.demo);assert.ok(g.code);
for(let i=0;i<4;i++){let r=await call('/api/join',{code:g.code.toLowerCase(),name:`Test Team ${i}`,pin:'5678'});assert.equal(r.status,200);cookies.push(r.cookie);}
assert.equal((await call('/api/join',{code:g.code,name:'Fifth Team',pin:'5678'})).status,400);
assert.equal((await call('/api/entry',{values:[100,100,100,100],lock:true},cookies[0])).status,400);
await call('/api/control',{action:'advance',group:g.id},admin);
assert.equal((await call('/api/entry',{values:[99,100,100,100],lock:true},cookies[0])).status,400);
for(let c of cookies)assert.equal((await call('/api/entry',{values:[100,100,100,100],lock:true},c)).status,200);
let other=(await call('/api/state',null,cookies[1])).body.groups.find(x=>x.id===g.id);assert.ok(!other.proposals);assert.equal(other.mine.proposal[0],100);
let av=(await call('/api/state',null,admin)).body.groups.find(x=>x.id===g.id);assert.ok(!av.proposals&&!av.mine);
await call('/api/control',{action:'advance',group:g.id},admin);
let voted=(await call('/api/state',null,cookies[0])).body.groups.find(x=>x.id===g.id);assert.equal(voted.proposals.length,4);assert.ok(voted.proposals.every(p=>!p.author));assert.ok(!voted.outcome);
for(let c of cookies)await call('/api/entry',{values:[true,true,true,true],lock:true},c);
assert.equal((await call('/api/export',null,admin)).status,400);
await call('/api/control',{action:'advance',group:g.id},admin);let results=(await call('/api/state',null,cookies[0])).body.groups.find(x=>x.id===g.id);assert.equal(results.army,100);
await call('/api/control',{action:'advance',group:g.id},admin);
await call('/api/control',{action:'pause',group:g.id},admin);assert.equal((await call('/api/entry',{values:[20,20,20,20,20],lock:true},cookies[0])).status,400);await call('/api/control',{action:'pause',group:g.id},admin);
let ds=[[30,30,20,10,10],[20,20,20,20,20],[40,40,20,0,0],[10,10,30,50,0]];
for(let [i,c] of cookies.entries())await call('/api/entry',{values:ds[i],lock:true},c);
let beforeBattle=(await call('/api/state',null,cookies[1])).body.groups.find(x=>x.id===g.id);assert.ok(!beforeBattle.battle&&!beforeBattle.deployments);
await call('/api/control',{action:'advance',group:g.id},admin);let battle=(await call('/api/state',null,cookies[0])).body.groups.find(x=>x.id===g.id);assert.deepEqual(battle.battle.scores,[0,100,900,500]);assert.deepEqual(battle.teams.map(t=>t.score),[0,100,900,500]);
let exported=await call('/api/export',null,admin);assert.equal(exported.status,200);assert.ok(!exported.body.sessions);assert.ok(!JSON.stringify(exported.body).includes('"pin"'));
await call('/api/control',{action:'advance',group:g.id},admin);let next=(await call('/api/state',null,cookies[0])).body.groups.find(x=>x.id===g.id);assert.deepEqual(next.teams.map(t=>t.score),[0,100,900,500]);assert.equal(next.round,2);
assert.ok(JSON.parse(readFileSync(path.join(dir,'state.json'))).groups.some(g=>g.round===2));
});
test('40 teams on one venue IP can join, submit together and reconnect',{timeout:30000},async()=>{
await call('/api/control',{action:'create',count:10,size:4},admin);
const groups=(await call('/api/state',null,admin)).body.groups.filter(g=>!g.demo).slice(-10);
const teams=groups.flatMap((g,i)=>Array.from({length:4},(_,j)=>({group:g.id,code:g.code,name:`Venue ${i}-${j}`,pin:'2468'})));
let started=performance.now();const joined=await Promise.all(teams.map(t=>call('/api/join',t)));assert.equal(joined.filter(r=>r.status===200).length,40,JSON.stringify(joined.filter(r=>r.status!==200).map(r=>r.body)));console.log(`40 shared-IP registrations: ${Math.round(performance.now()-started)} ms`);
const connections=await Promise.all(Array.from({length:40},async()=>{const controller=new AbortController();const r=await fetch(base+'/api/events',{signal:controller.signal});assert.equal(r.status,200);const reader=r.body.getReader();await reader.read();return {controller,reader};}));
try{
for(let g of groups)await call('/api/control',{action:'advance',group:g.id},admin);
started=performance.now();const submitted=await Promise.all(joined.map(r=>call('/api/entry',{values:[100,100,100,100],lock:true},r.cookie)));assert.ok(submitted.every(r=>r.status===200));console.log(`40 simultaneous proposals with 40 SSE clients: ${Math.round(performance.now()-started)} ms`);
const states=await Promise.all(joined.map(r=>call('/api/state',null,r.cookie)));assert.ok(states.every(r=>r.body.groups.find(g=>g.teams.some(t=>t.id===r.body.teamId)).locked===4));
const rejoined=await Promise.all(teams.map(t=>call('/api/join',t)));assert.ok(rejoined.every(r=>r.status===200));const restored=await call('/api/state',null,rejoined[0].cookie);const mine=restored.body.groups.find(g=>g.teams.some(t=>t.id===restored.body.teamId));assert.equal(mine.phase,'proposal');assert.equal(mine.myLock,true);
let blocked;for(let i=0;i<11;i++)blocked=await call('/api/join',{...teams[0],pin:'9999'});assert.match(blocked.body.error,/Too many attempts/);assert.equal((await call('/api/join',teams[1])).status,200);
}finally{for(let c of connections)c.controller.abort();}
});
test('demo entry selects an unfinished table after the first demo campaign ends',async()=>{let groups=(await call('/api/state',null,admin)).body.groups.filter(g=>g.demo);await call('/api/control',{action:'end',group:groups[0].id},admin);let login=await call('/api/demo',{});let state=(await call('/api/state',null,login.cookie)).body;let group=state.groups.find(g=>g.teams.some(t=>t.id===state.teamId));assert.notEqual(group.phase,'finished');});
test('Jinnfire Exchange stays locked to players until an organiser opens it',async()=>{
let locked=await call('/api/jinn/state');assert.equal(locked.status,200);assert.deepEqual(locked.body,{enabled:false,locked:true});
assert.equal((await call('/api/jinn/join',{code:'ABCDEFGH1234'})).status,403);assert.equal((await call('/api/jinn/submit',{quantity:3})).status,403);
let player=await call('/api/demo',{});assert.equal((await call('/api/jinn/state',null,player.cookie)).body.locked,true);
assert.equal((await call('/api/control',{action:'jinnfire-access',open:true},player.cookie)).status,403);
assert.equal((await call('/api/state')).body.settings.jinnfireOpen,undefined);
assert.equal((await call('/api/control',{action:'jinnfire-access',open:true},admin)).status,200);assert.equal((await call('/api/state')).body.settings.jinnfireOpen,true);
let opened=await call('/api/jinn/state');assert.notEqual(opened.body.locked,true);
assert.equal((await call('/api/control',{action:'jinnfire-access',open:false},admin)).status,200);assert.deepEqual((await call('/api/jinn/state')).body,{enabled:false,locked:true});});
test('organisers can remove parties; players cannot',async()=>{
await call('/api/control',{action:'create',count:2,size:4},admin);let groups=(await call('/api/state',null,admin)).body.groups.filter(g=>!g.demo);let [a,b]=groups.slice(-2);
let player=await call('/api/demo',{});assert.equal((await call('/api/control',{action:'remove',group:a.id},player.cookie)).status,403);assert.equal((await call('/api/control',{action:'remove',group:a.id})).status,403);
assert.equal((await call('/api/control',{action:'remove',group:a.id},admin)).status,200);let after=(await call('/api/state',null,admin)).body.groups;assert.ok(!after.some(g=>g.id===a.id));assert.ok(after.some(g=>g.id===b.id));
await call('/api/control',{action:'create',count:1,size:4},admin);let names=(await call('/api/state',null,admin)).body.groups.map(g=>g.name);assert.equal(new Set(names).size,names.length,'party names stay unique after a removal');
assert.equal((await call('/api/control',{action:'remove',group:'missing'},admin)).status,400);});

