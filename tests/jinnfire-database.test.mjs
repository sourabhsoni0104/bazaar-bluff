import {test,before,after} from 'node:test';import assert from 'node:assert/strict';
import {createPool,migrate} from '../backend/database.mjs';import {createJinnService} from '../backend/jinnfire.mjs';
const pool=createPool(process.env.TEST_DATABASE_URL||'postgresql:///bazaar_bluff_test?host=/tmp');let game;const admin={role:'admin',email:'test-admin@example.test'};let ids=[],codes=[];
before(async()=>{await migrate(pool);game=await createJinnService(pool,{eventName:'Integration '+Date.now()});});
after(async()=>{await pool.end();});
test('real Postgres protects submissions, immutable demand, rational scoring and once-only settlement',async()=>{
for(let name of ['Alpha','Bravo','Charlie','Delta']){let t=await game.control(admin,{action:'add-team',name});ids.push(t.teamId);codes.push(t.accessCode);}
await game.control(admin,{action:'prepare',demand:30});await game.control(admin,{action:'start'});let state=await game.view(admin);assert.equal(new Date(state.round.deadline).getTime()-new Date(state.round.startedAt).getTime(),120000);
await assert.rejects(game.control(admin,{action:'set-demand',demand:25}),/locked|live/i);
for(let [i,q] of [8,10,6,9].entries())await game.submit({role:'team',jinnTeamId:ids[i]},q);
await assert.rejects(game.submit({role:'team',jinnTeamId:ids[0]},16),/0.*15/);
let other=await game.view({role:'team',jinnTeamId:ids[1]});assert.equal(other.mine.quantity,10);assert.ok(!JSON.stringify(other).includes('quantity":8'));assert.ok(!other.admin&&!other.supply&&!other.rate);
await Promise.all([game.control(admin,{action:'end',reason:'Integration test end'}),game.control(admin,{action:'end',reason:'Concurrent retry'})]);await game.control(admin,{action:'publish'});
let result=await game.view(admin);assert.equal(result.admin.settlement.supply,33);assert.equal(result.admin.settlement.rate,'7.90');assert.equal(result.admin.settlement.rows.find(t=>t.id===ids[0]).profit,'63.20');
let pub=await game.view(null);for(let list of [pub.leaderboards.round,pub.leaderboards.overall])for(let r of list)assert.deepEqual(Object.keys(r).sort(),['name','rank']);assert.ok(!pub.admin&&!pub.mine);
let privateResult=await game.view({role:'team',jinnTeamId:ids[0]});assert.equal(privateResult.mine.outcome,'Net profit');assert.equal(privateResult.mine.quantity,8);assert.ok(!('profit' in privateResult.mine));
await game.control(admin,{action:'prepare',demand:25});await game.control(admin,{action:'start'});for(let [i,q] of [8,15,15,7].entries())await game.submit({role:'team',jinnTeamId:ids[i]},q);await game.control(admin,{action:'end',reason:'Loss scenario'});await game.control(admin,{action:'publish'});let loss=await game.view(admin);assert.equal(loss.admin.settlement.rows.find(t=>t.id===ids[0]).profit,'−99.20');assert.equal(loss.admin.settlement.rows.find(t=>t.id===ids[0]).cumulative,'−36.00');
});
test('deadline expiry defaults missing entries to zero and rejects late writes',async()=>{await game.control(admin,{action:'prepare',demand:30});await game.control(admin,{action:'start'});let st=await game.view(admin);await pool.query("update game_private.jinn_rounds set deadline_at=clock_timestamp()-interval '1 second' where id=$1",[st.round.id]);await assert.rejects(game.submit({role:'team',jinnTeamId:ids[0]},5),/closed|deadline/i);await game.tick();let s=await game.view(admin);assert.equal(s.round.status,'published');assert.equal(s.admin.settlement.supply,0);assert.ok(s.admin.settlement.rows.every(r=>r.quantity===0));let r=await game.view({role:'team',jinnTeamId:ids[0]});assert.equal(r.mine.outcome,'No production');assert.ok(s.leaderboards.round.every(r=>r.rank===1));});
test('roster changes after play require confirmation and reason',async()=>{await assert.rejects(game.control(admin,{action:'rename-team',teamId:ids[0],name:'Renamed'}),/confirm/i);await assert.rejects(game.control({role:'team',jinnTeamId:ids[0]},{action:'prepare',demand:1}),/organiser/i);});
