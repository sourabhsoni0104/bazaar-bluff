import './backend/env.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import {scoreBattle,chooseProposals,combineShares,validAllocation} from './rules.mjs';
import {createPool,migrate,makeStateStore} from './backend/database.mjs';
import {createJinnService} from './backend/jinnfire.mjs';
import {createAuth} from './backend/auth.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
// Run directly (npm start) this is a long-running server; on Vercel the same handler runs per request.
const isMain=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url); const dataFile=process.env.DATA_FILE||path.join(root,'state.json');
const allowedEmail=email=>!!email&&(state.allowedEmails||[]).includes(email);
const googleAuth=createAuth(process.env,{allowed:email=>store.read(s=>(s.allowedEmails||[]).includes(email))});const allowLocal=process.env.NODE_ENV!=='production'&&(process.env.ALLOW_LOCAL_ADMIN==='true'||!googleAuth.configured);
const adminPassword=process.env.ADMIN_PASSWORD;if(allowLocal&&!adminPassword)throw Error('Set ADMIN_PASSWORD in .env for local development');
const pool=createPool();if(process.env.NODE_ENV==='production'&&(!pool||!googleAuth.configured||!googleAuth.site.startsWith('https://')))throw Error('Production requires DATABASE_URL, Supabase Google Auth, and an HTTPS SITE_URL');
if(pool)await migrate(pool);
const jinn=pool?await createJinnService(pool,{eventName:process.env.JINN_EVENT_NAME||'Jinnfire Exchange'}):null;
const running=phase=>['proposal','voting','results','deployment','battle'].includes(phase);
const settings={pot:400,rounds:5,fallback:100,tie:'split',timers:{proposal:180,voting:120,results:45,deployment:180,battle:60},fields:[{name:'The Citadel',value:500},{name:'Iron Harbour',value:400},{name:'High Ridge',value:300},{name:'The Crossroads',value:200},{name:'Outpost',value:100}]};
const id=()=>randomBytes(12).toString('hex');
const newPlayer=({userId,email,name})=>({id:id(),userId,email,name:String(name||'').trim().slice(0,60)||'Player',score:0,wins:0,history:[]});
const MIN_SEATS=4,MAX_SEATS=5;
const makeTable=(i,name)=>({id:id(),name:name||`Table ${String(i+1).padStart(2,'0')}`,seats:[],proposals:[],votes:{},deployments:{},locks:{},armies:[],outcome:null,battle:null,archive:[]});
// Players are Google accounts; the organiser seats them at tables. One game clock drives every table, so rounds stay in step.
// Older saves held self-serve parties, which players and tables replace.
function normalise(s){delete s.groups;delete s.pinFailures;s.players||=[];s.tables||=[];s.game||={round:0,phase:'lobby',deadline:null,paused:false,remaining:0};s.audit||=[];s.sessions||={};return s;}
let state=normalise((process.env.IMPORT_LEGACY_STATE==='true'||process.env.NODE_ENV!=='production'&&!process.env.SUPABASE_URL)&&fs.existsSync(dataFile)?JSON.parse(fs.readFileSync(dataFile,'utf8')):{settings,audit:[],sessions:{}});
const store=await makeStateStore({pool,initial:state,file:dataFile,key:process.env.BAZAAR_STATE_KEY||'bazaar-live'});
state=await store.run(s=>{normalise(s);return structuredClone(s);});
// Persistence is committed by the request transaction, before sending its response.
function save(){}

function log(actor,action,details){state.audit.push({at:new Date().toISOString(),actor,action,details});}
const streams=new Set();
let subscriber;if(pool&&isMain){subscriber=await pool.connect();await subscriber.query('listen bazaar_updates');subscriber.on('notification',()=>{for(let r of streams)r.write('data: update\n\n');});subscriber.on('error',e=>console.error('Database notifications disconnected:',e.message));}
function broadcast(){save();for(const res of streams)res.write('data: update\n\n');}
function equal(total,n){let a=Array(n).fill(Math.floor(total/n));a[n-1]+=total%n;return a;}
const player=pid=>state.players.find(p=>p.id===pid);
const tableOf=pid=>state.tables.find(t=>t.seats.includes(pid));
const editable=()=>!running(state.game.phase);
function assertEditable(){if(!editable())throw Error('Tables are locked while a round is running. Edit them between rounds.');}
function enter(phase){let g=state.game,seconds=state.settings.timers[phase];g.phase=phase;g.paused=false;g.deadline=seconds?Date.now()+seconds*1000:null;for(let t of state.tables)t.locks={};log('server','phase',{phase,round:g.round});}
// Round N starts for every table at the same moment, and only when the organiser says so.
function startRound(){let g=state.game;if(!['lobby','between'].includes(g.phase))throw Error(g.phase==='finished'?'The event is finished. Add a round to keep playing.':'A round is already running');if(g.round>=state.settings.rounds)throw Error('Every planned round has been played');if(!state.tables.length)throw Error('Create at least one table first');for(let t of state.tables)if(t.seats.length<MIN_SEATS||t.seats.length>MAX_SEATS)throw Error(`${t.name} has ${t.seats.length} player${t.seats.length===1?'':'s'}; every table needs ${MIN_SEATS} or ${MAX_SEATS} before the round can start`);g.round++;for(let t of state.tables){t.proposals=[];t.votes={};t.deployments={};t.armies=[];t.outcome=null;t.battle=null;}enter('proposal');}
function advanceGame(){let g=state.game,s=state.settings;if(!running(g.phase))throw Error('No round is running. Start the next round first.');
if(g.phase==='proposal'){for(let t of state.tables)t.proposals.sort(()=>randomInt(3)-1);enter('voting');}
else if(g.phase==='voting'){for(let t of state.tables){let counts=t.proposals.map((p,i)=>t.seats.reduce((n,pid)=>n+(t.votes[pid]?.[i]===true?1:0),0));let winners=chooseProposals(counts);t.outcome={counts,winners};t.armies=winners.length?combineShares(winners.map(w=>t.proposals[w]),t.seats.length):t.seats.map(()=>s.fallback);}enter('results');}
else if(g.phase==='results')enter('deployment');
else if(g.phase==='deployment'){for(let t of state.tables){for(let [i,pid] of t.seats.entries())if(!t.deployments[pid])t.deployments[pid]=equal(t.armies[i],5);t.battle=scoreBattle(t.seats.map(pid=>t.deployments[pid]),s.fields.map(f=>f.value),s.tie);t.seats.forEach((pid,i)=>{let p=player(pid);p.score+=t.battle.scores[i];p.wins+=t.battle.wins[i];p.history.push(t.battle.scores[i]);});t.archive.push({round:g.round,proposals:structuredClone(t.proposals),votes:structuredClone(t.votes),deployments:structuredClone(t.deployments),outcome:t.outcome,battle:t.battle});}enter('battle');}
else{g.phase=g.round>=s.rounds?'finished':'between';g.deadline=null;g.paused=false;log('server','phase',{phase:g.phase,round:g.round});}}
function identity(req){let token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('wc_session='))?.slice(11);let local=token&&Object.hasOwn(state.sessions,token)?state.sessions[token]:null;if(local?.expiresAt&&local.expiresAt<Date.now())local=null;if(req.googleAuth){if(req.googleAuth.role!=='admin'&&!allowedEmail(req.googleAuth.email))return null;return {...req.googleAuth,teamId:state.players.find(p=>p.userId===req.googleAuth.userId)?.id};}return allowLocal?local:null;}

function view(auth){let g=state.game,me=player(auth?.teamId),t=me&&tableOf(me.id),admin=auth?.role==='admin',reveal=['results','deployment','battle','between','finished'].includes(g.phase),done=['battle','between','finished'].includes(g.phase);let seatOf=new Map(state.tables.flatMap(t=>t.seats.map(pid=>[pid,t.id])));let seat=pid=>{let {id,name,score,wins,history}=player(pid);return {id,name,score,wins,history};};
let out={serverTime:Date.now(),settings:state.settings,role:auth?.role||'public',teamId:me?.id,user:auth?.userId?{name:auth.name,email:auth.email}:null,backend:{database:pool?(process.env.SUPABASE_URL?'Supabase Postgres':'Local PostgreSQL'):'Development file',google:googleAuth.configured,localAdmin:allowLocal,adminConfigured:googleAuth.adminCount>0,jinnfire:!!jinn},game:{round:g.round,phase:g.phase,deadline:g.deadline,paused:g.paused,remaining:g.remaining},editable:editable(),tables:state.tables.map(t=>({id:t.id,name:t.name,seats:t.seats.map(seat),locked:Object.values(t.locks).filter(Boolean).length})),players:state.players.map(({id,name,score,wins,history,email})=>({id,name,score,wins,history,table:seatOf.get(id),...admin?{email}:{}})),audit:admin?state.audit.slice(-100):undefined,allowedEmails:admin?state.allowedEmails||[]:undefined};
if(t){let slot=t.seats.indexOf(me.id),mine={table:t.id,tableName:t.name,slot,myLock:!!t.locks[me.id],entry:{proposal:t.proposals.find(p=>p.author===me.id)?.shares,votes:t.votes[me.id],deployment:t.deployments[me.id]},army:t.armies[slot]};if(g.phase==='voting'||reveal)mine.proposals=t.proposals.map(p=>({id:p.id,shares:p.shares,yours:p.author===me.id}));if(reveal){mine.outcome=t.outcome;mine.armies=t.armies;}if(done)mine.battle=t.battle;out.mine=mine;}
return out;}
const attempts=new Map();function rate(req,subject='admin'){let now=Date.now(),ip=process.env.VERCEL&&req.headers['x-real-ip']||req.socket.remoteAddress;const take=(key,limit)=>{let a=attempts.get(key);if(!a||now>a.until)a={n:0,until:now+60000};a.n++;attempts.set(key,a);if(a.n>limit)throw Error('Too many attempts. Please wait one minute.');};take(`ip:${ip}`,300);take(`${ip}:${subject}`,10);if(attempts.size>5000)for(let [k,v]of attempts)if(v.until<now)attempts.delete(k);}
function advanceDue(){let g=state.game;if(g.deadline&&!g.paused&&Date.now()>=g.deadline){advanceGame();return true;}return false;}

function session(res,auth){let token=id(),now=Date.now();for(let [k,s]of Object.entries(state.sessions))if(s.expiresAt<now)delete state.sessions[k];state.sessions[token]={...auth,expiresAt:Date.now()+604800000};res.setHeader('Set-Cookie',`wc_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${googleAuth.site.startsWith('https://')?'; Secure':''}`);return auth;}
async function body(req){if(req.parsedBody!==undefined)return req.parsedBody;let chunks=[],length=0;for await(const c of req){length+=c.length;if(length>100000)throw Error('Request too large');chunks.push(c);}let text=Buffer.concat(chunks).toString('utf8');try{return text?JSON.parse(text):{};}catch{throw Error('Invalid request body');}}
const handleRequest=async(req,res)=>{let url=new URL(req.url,'http://localhost');let auth=identity(req);const json=(o,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(o));};try{
if(url.pathname==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write('data: update\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
if(url.pathname==='/api/state')return json(view(auth));
if(req.method==='POST'&&url.pathname.startsWith('/api/')){if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw Error('Invalid origin');let b=await body(req);
if(url.pathname==='/api/admin/login'){if(!allowLocal)throw Error('Use Google sign-in for organiser access');rate(req);let a=Buffer.from(String(b.password||'')),p=Buffer.from(adminPassword);if(a.length!==p.length||!timingSafeEqual(a,p))throw Error('Incorrect organiser password');auth=session(res,{role:'admin'});save();return json({ok:true});}
if(url.pathname==='/api/logout'){let token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('wc_session='))?.slice(11);if(token)delete state.sessions[token];if(googleAuth.configured)throw Error('Use /auth/logout to sign out');res.setHeader('Set-Cookie','wc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json({ok:true});}
if(url.pathname==='/api/demo'){if(!allowLocal)throw Error('Demo entry is available in local development only');rate(req,'demo:'+id());let p=player(auth?.teamId);if(!p){p=newPlayer({name:`Test Player ${state.players.length+1}`});state.players.push(p);}auth=session(res,{role:'team',teamId:p.id,name:p.name});broadcast();return json({ok:true});}
if(url.pathname==='/api/enroll'){if(!auth?.userId||auth.role==='admin')throw Error('Sign in with Google to play');rate(req,'enroll');if(!state.players.some(p=>p.userId===auth.userId)){if(state.players.length>=1000)throw Error('The player list is full');state.players.push(newPlayer({userId:auth.userId,email:auth.email,name:auth.name}));broadcast();}return json({ok:true});}
if(url.pathname==='/api/profile'){let me=player(auth?.teamId);if(!me)throw Error('Sign in to change your display name');rate(req,'profile:'+me.id);let name=String(b.name||'').replace(/\s+/g,' ').trim();if(name.length<1||name.length>60)throw Error('Use a display name of 1–60 characters');me.name=name;log('player','profile',{player:me.id});broadcast();return json({ok:true,name});}
if(url.pathname==='/api/entry'){let me=player(auth?.teamId),t=me&&tableOf(me.id),g=state.game;if(!t)throw Error('The organiser has not seated you at a table yet');if(g.paused||!g.deadline||Date.now()>=g.deadline)throw Error('This phase is paused or closed');if(b.unlock){t.locks[me.id]=false;broadcast();return json({ok:true});}if(t.locks[me.id])throw Error('Unlock your entry before editing');let slot=t.seats.indexOf(me.id);if(g.phase==='proposal'){if(!validAllocation(b.values,state.settings.pot,true)||b.values.length!==t.seats.length)throw Error('Whole-number shares must equal the pot');let p=t.proposals.find(p=>p.author===me.id);if(p)p.shares=b.values;else t.proposals.push({id:id(),author:me.id,shares:b.values});}else if(g.phase==='voting'){if(!Array.isArray(b.values)||b.values.length!==t.proposals.length||!b.values.every(v=>typeof v==='boolean'))throw Error('Vote on every proposal');t.votes[me.id]=b.values;}else if(g.phase==='deployment'){if(!validAllocation(b.values,t.armies[slot])||b.values.length!==5)throw Error('Troops must be whole numbers within your army');t.deployments[me.id]=b.values;}else throw Error('No entries in this phase');t.locks[me.id]=!!b.lock;broadcast();return json({ok:true});}
if(url.pathname==='/api/control'){if(auth?.role!=='admin')throw Error('Organiser access required');let a=b.action,g=state.game,extra={};const pick=(list,key,what)=>{let x=list.find(x=>x.id===key);if(!x)throw Error(`${what} not found`);return x;};const tableName=name=>{name=String(name||'').trim();if(name.length<1||name.length>40)throw Error('Use a table name of 1–40 characters');return name;};
if(a==='settings'){let s=b.settings;if(!editable())throw Error('Settings lock while a round is running');if(!Number.isInteger(s.pot)||s.pot<1||s.pot>100000||!Number.isInteger(s.rounds)||s.rounds<Math.max(1,g.round)||s.rounds>100||!Number.isInteger(s.fallback)||s.fallback<0||!['split','none'].includes(s.tie))throw Error('Invalid game settings');Object.assign(state.settings,{pot:s.pot,rounds:s.rounds,fallback:s.fallback,tie:s.tie});if(g.phase==='finished'&&g.round<s.rounds)g.phase='between';}
else if(a==='add-round'){state.settings.rounds++;if(g.phase==='finished')g.phase='between';}
else if(a==='allow-emails'){let list=state.allowedEmails||=[],added=0,invalid=[];for(let e of String(b.emails||'').split(/[\s,;]+/).map(e=>e.trim().toLowerCase()).filter(Boolean)){if(e.length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)){invalid.push(e);continue;}if(!list.includes(e)){if(list.length>=5000)throw Error('The sign-in list is full (5,000 emails)');list.push(e);added++;}}list.sort();log(auth.role,'allow-emails',{added});broadcast();return json({ok:true,added,invalid:invalid.slice(0,20)});}
else if(a==='disallow-email'){let e=String(b.email||'').trim().toLowerCase();state.allowedEmails=(state.allowedEmails||[]).filter(x=>x!==e);log(auth.role,'disallow-email',{});broadcast();return json({ok:true});}
else if(a==='jinnfire-access'){if(typeof b.open!=='boolean')throw Error('Choose whether Jinnfire Exchange is open');state.settings.jinnfireOpen=b.open;log(auth.role,b.open?'jinnfire-opened':'jinnfire-closed',{});broadcast();return json({ok:true,open:b.open});}
else if(a==='start-round')startRound();
else if(a==='advance')advanceGame();
else if(a==='pause'){if(!g.deadline)throw Error('No timer is running');if(g.paused){g.deadline=Date.now()+g.remaining;g.paused=false;}else{g.remaining=Math.max(0,g.deadline-Date.now());g.paused=true;}}
else if(a==='extend'){if(!g.deadline)throw Error('No timer is running');if(g.paused)g.remaining+=60000;else g.deadline+=60000;}
else if(a==='end'){g.phase='finished';g.deadline=null;g.paused=false;}
else if(a==='table-create'){assertEditable();let n=Number(b.count||1);if(!Number.isInteger(n)||n<1||n>20||state.tables.length+n>100)throw Error('Create 1–20 tables at a time (100 at most)');let last=Math.max(0,...state.tables.map(t=>Number(t.name.match(/\d+$/)?.[0])||0));for(let i=0;i<n;i++)state.tables.push(makeTable(last+i,n===1&&b.name?tableName(b.name):undefined));}
else if(a==='table-rename'){assertEditable();let t=pick(state.tables,b.table,'Table'),name=tableName(b.name);if(state.tables.some(x=>x!==t&&x.name.toLowerCase()===name.toLowerCase()))throw Error('Another table already has that name');t.name=name;}
else if(a==='table-delete'){assertEditable();let t=pick(state.tables,b.table,'Table');state.tables=state.tables.filter(x=>x!==t);}
else if(a==='seat'){assertEditable();let p=pick(state.players,b.player,'Player'),to=b.table==null?null:pick(state.tables,b.table,'Table');if(to&&!to.seats.includes(p.id)&&to.seats.length>=MAX_SEATS)throw Error(`${to.name} is full (${MAX_SEATS} players at most)`);for(let t of state.tables)t.seats=t.seats.filter(x=>x!==p.id);if(to)to.seats.splice(Number.isInteger(b.index)?Math.max(0,Math.min(to.seats.length,b.index)):to.seats.length,0,p.id);}
else if(a==='auto-seat'){assertEditable();let left=state.players.filter(p=>!tableOf(p.id)).map(p=>p.id);if(!left.length)throw Error('Everyone is already seated');for(let i=left.length-1;i>0;i--){let j=randomInt(i+1);[left[i],left[j]]=[left[j],left[i]];}
// First bring existing short tables up to the minimum, then open new tables of four, then spread any remainder over tables that still have room.
let placed=0,put=t=>{t.seats.push(left.pop());placed++;};for(let t of state.tables)while(t.seats.length<MIN_SEATS&&left.length)put(t);
let k=Math.floor(left.length/MIN_SEATS),last=Math.max(0,...state.tables.map(t=>Number(t.name.match(/\d+$/)?.[0])||0));if(state.tables.length+k>100)throw Error('Too many tables');for(let i=0;i<k;i++){let t=makeTable(last+i);state.tables.push(t);while(t.seats.length<MIN_SEATS)put(t);}
for(let t of [...state.tables].reverse())if(left.length&&t.seats.length<MAX_SEATS)put(t);
if(!placed)throw Error(`Not enough unseated players to fill a table of ${MIN_SEATS}. Seat them by hand or add players.`);extra={seated:placed,unseated:left.length};}
else if(a==='player-rename'){assertEditable();let p=pick(state.players,b.player,'Player'),name=String(b.name||'').trim();if(name.length<1||name.length>60)throw Error('Use a name of 1–60 characters');p.name=name;}
else if(a==='player-remove'){assertEditable();let p=pick(state.players,b.player,'Player');for(let t of state.tables)t.seats=t.seats.filter(x=>x!==p.id);state.players=state.players.filter(x=>x!==p);}
else throw Error('Unknown action');
log(auth.role,a,{table:b.table,player:b.player});broadcast();return json({ok:true,...extra});}
throw Error('Unknown action');}
if(url.pathname==='/api/export'){if(auth?.role!=='admin')return json({error:'Organiser access required'},403);log('admin','export',{});save();res.setHeader('Content-Disposition','attachment; filename="war-chest-export.json"');let clean=structuredClone(state);delete clean.sessions;clean.players.forEach(p=>{delete p.userId;});if(!['lobby','battle','between','finished'].includes(state.game.phase))throw Error('Full audit export is available after rounds close');return json(clean);}
if(url.pathname.startsWith('/api/'))return json({error:'Not found'},404);
let name;try{name=url.pathname==='/'||!path.extname(url.pathname)?'index.html':decodeURIComponent(url.pathname);}catch{return json({error:'Not found'},404);}
let file=path.join(root,'public',name);if(!file.startsWith(path.join(root,'public')+path.sep)||!fs.statSync(file,{throwIfNoEntry:false})?.isFile())return json({error:'Not found'},404);let mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
}catch(e){throw e;}};
// Buffer API output until its database transaction has committed.
function bufferResponse(res){let status=200,headers={},body;return {setHeader(k,v){headers[k]=v;},getHeader(k){return headers[k]??res.getHeader(k);},writeHead(s,h={}){status=s;Object.assign(headers,h);},end(value=''){body=value;},flush(){for(let [k,v]of Object.entries(headers))res.setHeader(k,v);res.writeHead(status);res.end(body??'');}};}
function sendJson(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const securityHeaders={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Cross-Origin-Opener-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",...googleAuth.site.startsWith('https://')?{'Strict-Transport-Security':'max-age=31536000'}:{}};
// Only messages written for players are shown; anything unexpected stays in the server log.
const publicError=e=>e.code==='23505'?'This Google account is already registered':Object.getPrototypeOf(e)===Error.prototype?e.message:'Something went wrong. Please try again.';
export default async function handler(req,res){try{for(let [k,v]of Object.entries(securityHeaders))res.setHeader(k,v);let url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/auth/'))url.pathname=url.pathname.slice(4);if(await googleAuth.route(req,res,url))return;
if(!url.pathname.startsWith('/api/'))return await handleRequest(req,res);
if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return sendJson(res,{error:'Invalid origin'},403);
// A JSON content type cannot be sent cross-site without a CORS preflight, which this server never grants.
if(req.method==='POST'&&!/^application\/json\b/i.test(req.headers['content-type']||''))return sendJson(res,{error:'Send requests as JSON'},415);
if(req.method==='POST')req.parsedBody=await body(req);
if(url.pathname==='/api/events'){if(streams.size>=5000)return sendJson(res,{error:'Too many live connections'},503);res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write('data: update\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
req.googleAuth=await googleAuth.identify(req,res);
if(url.pathname.startsWith('/api/jinn/')){
 let [auth,open]=await store.read(snapshot=>{state=snapshot;return [identity(req),state.settings.jinnfireOpen===true];});let result;
 // Jinnfire is the second event: players cannot see or use it until an organiser opens it.
 if(!open&&auth?.role!=='admin')return req.method==='GET'&&url.pathname==='/api/jinn/state'?sendJson(res,{enabled:false,locked:true}):sendJson(res,{error:'Jinnfire Exchange is not open yet'},403);
 if(!jinn)return sendJson(res,{error:'The Jinnfire database is not configured',enabled:false},503);
 if(!open&&req.method==='POST'&&url.pathname==='/api/jinn/control'&&req.parsedBody.action==='start')throw Error('Open Jinnfire Exchange to players before starting a round');
 await jinn.tick();if(req.method==='GET'&&url.pathname==='/api/jinn/state')result=await jinn.view(auth);
 else if(req.method==='POST'&&url.pathname==='/api/jinn/control')result=await jinn.control(auth,req.parsedBody);
 else if(req.method==='POST'&&url.pathname==='/api/jinn/submit')result=await jinn.submit(auth,req.parsedBody.quantity);
 else if(req.method==='POST'&&url.pathname==='/api/jinn/enroll'){if(!auth||auth.role==='admin')throw Error('Sign in to play Jinnfire Exchange');rate(req,'jinn-enroll');let playerId=await jinn.enroll(auth,{allowLocal});if(!auth.userId&&auth.jinnTeamId!==playerId){let buffered=bufferResponse(res);await store.run(snapshot=>{state=snapshot;session(buffered,{...auth,role:'team',jinnTeamId:playerId});});buffered.writeHead(200,{'Content-Type':'application/json'});buffered.end(JSON.stringify({ok:true}));buffered.flush();return;}result={ok:true};}
 else return sendJson(res,{error:'Unknown Jinnfire endpoint'},404);
 for(let stream of streams)if(req.method==='POST')stream.write('data: update\n\n');return sendJson(res,result);
}
if(url.pathname==='/api/health')return sendJson(res,{ok:true,database:pool?'postgres':'development-file',googleConfigured:googleAuth.configured,adminConfigured:googleAuth.adminCount>0,jinnfire:!!jinn});
if(req.method==='GET'&&url.pathname==='/api/state'){let fresh=await store.read(snapshot=>{let g=snapshot.game;if(g.deadline&&!g.paused&&Date.now()>=g.deadline)return null;state=snapshot;return view(identity(req));});if(fresh)return sendJson(res,fresh);}
let buffered=bufferResponse(res);await store.run(async snapshot=>{state=snapshot;advanceDue();await handleRequest(req,buffered);});buffered.flush();
}catch(e){console.error('Request failed:',e.code||e.name,e.message);let message=publicError(e);if(!res.headersSent)sendJson(res,{error:message},message.includes('Organiser')?403:message.startsWith('Too many attempts')?429:400);else res.end();}}
if(isMain){const server=http.createServer(handler);
let ticking=false;setInterval(async()=>{if(ticking)return;ticking=true;try{await store.run(snapshot=>{state=snapshot;if(advanceDue())for(let r of streams)r.write('data: update\n\n');});if(jinn&&await jinn.tick())for(let r of streams)r.write('data: update\n\n');for(let r of streams)r.write(': heartbeat\n\n');}catch(e){console.error('Timer update failed:',e.message);}finally{ticking=false;}},1000);
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('War Chest ready: http://localhost:'+(process.env.PORT||3000)));
process.on('SIGTERM',()=>{for(let r of streams)r.end();server.close(async()=>{if(subscriber){await subscriber.query('unlisten *');subscriber.release();}await pool?.end();process.exit(0);});});}
