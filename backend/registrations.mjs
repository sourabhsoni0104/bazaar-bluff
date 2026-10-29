// Registration allowlist: the "email" column of a Google Sheet whose sharing is "Anyone with the link can view".
// REGISTRATION_SHEET_ID stays on the server. Without it, any signed-in account may register.
let cache={at:0,emails:null};
export const registrationSheetId=()=>process.env.REGISTRATION_SHEET_ID||'';
export async function allowedToRegister(email){let id=registrationSheetId();if(!id)return true;if(!email)return false;return (await load(id)).has(email.trim().toLowerCase());}
async function load(id){if(cache.emails&&Date.now()-cache.at<60000)return cache.emails;
try{let r=await fetch(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=csv`,{signal:AbortSignal.timeout(5000)});
// A sheet that is not link-shared answers with Google's sign-in page instead of CSV.
if(!r.ok||!/text\/csv/.test(r.headers.get('content-type')||''))throw Error(`unexpected response ${r.status}`);cache={at:Date.now(),emails:parse(await r.text())};}
catch(e){console.error('Registration sheet unavailable:',e.message);if(!cache.emails)throw Error('The registration list is unavailable right now. Please try again in a moment.');}
return cache.emails;}
function parse(csv){let rows=[],row=[],cell='',quoted=false;for(let i=0;i<csv.length;i++){let c=csv[i];if(quoted){if(c==='"'&&csv[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;}
if(cell||row.length){row.push(cell);rows.push(row);}
let column=(rows[0]||[]).findIndex(h=>/^e-?mail/i.test(h.trim()));if(column<0)return new Set();
return new Set(rows.slice(1).map(r=>(r[column]||'').trim().toLowerCase()).filter(e=>e.includes('@')));}
