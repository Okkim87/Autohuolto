const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),{webcrypto}=require('crypto');
let now=Date.now();class Clock extends Date{static now(){return now;}}
const parameters=JSON.parse(fs.readFileSync('Cloudflare-woker/obd-parameters.mjs','utf8').split('export const OBD_PARAMETERS = ')[1].replace(/;\s*$/,''));
const source=fs.readFileSync('Cloudflare-woker/worker.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export default {','const worker = {').replace(/export class /g,'class ');
const scope=vm.createContext({Request,Response,URL,TextEncoder,TextDecoder,Date:Clock,crypto:webcrypto,OBD_PARAMETERS:parameters,console});
vm.runInContext(source+'\nglobalThis.a={worker,AccessGate,ObdSession};',scope);
function storage(){const map=new Map();let alarm;return{get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k),deleteAll:async()=>map.clear(),setAlarm:async v=>{alarm=v;},alarm:()=>alarm,map};}
const records=new Map(),gates=new Map(),sessions=new Map();
const env={ALLOWED_ORIGIN:'https://autosahkoapu.fi',ACCESS_CODES:{get:async k=>structuredClone(records.get(k)),put:async(k,v)=>records.set(k,JSON.parse(v))}};
env.ACCESS_GATE={idFromName:id=>id,get:id=>{if(!gates.has(id))gates.set(id,new scope.a.AccessGate({storage:storage()},env));return gates.get(id);}};
env.OBD_SESSIONS={idFromName:id=>id,get:id=>{if(!sessions.has(id))sessions.set(id,new scope.a.ObdSession({storage:storage()}));return sessions.get(id);}};
async function call(path,body,origin='https://autosahkoapu.fi'){const r=await scope.a.worker.fetch(new Request('https://worker'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)}),env);return{status:r.status,data:await r.json(),cache:r.headers.get('Cache-Control')};}
const code='ASAPP-ABCD-EFGH-JKLM-NPQR',other='ASAPP-AAAA-BBBB-CCCC-DDDD',legacy='ASAI-ABCD-EFGH';
for(const key of [code,other,legacy])records.set('code:'+key,{credits:30,used:0,expiresAt:now+86400000,...(key!==legacy?{entitlement:'combined'}:{})});
(async()=>{
 assert.equal((await call('/obd/resume',{code:'BAD'})).status,400);
 assert.equal((await call('/obd/resume',{code},'https://evil.example')).status,403);
 assert.equal((await call('/obd/resume',{code})).data.connection,null);
 const created=await call('/obd/create',{code});assert.equal(created.status,200);assert.equal(created.data.shared,true);
 const pair=await call('/obd/pair',{pairCode:created.data.pairCode,vehicle:{make:'Ford',model:'Mondeo',year:2010,engine:'2.0 bensa'},supportedIds:[12,5]});assert.equal(pair.status,200);
 const resumed=await call('/obd/resume',{code});assert.equal(resumed.status,200);assert.equal(resumed.cache,'no-store');assert.equal(resumed.data.connection.token,created.data.token);
 assert.equal(resumed.data.connection.pairCode,undefined);assert.notEqual(resumed.data.connection.token,pair.data.token,'uploader token is never handed to browser');
 assert.equal((await call('/obd/resume',{code:other})).data.connection,null,'another valid code cannot discover this session');
 const old=await call('/obd/create',{code:legacy});assert.equal(old.status,200);assert.equal(old.data.shared,false);
 assert.equal((await call('/obd/resume',{code:legacy})).data.legacy,true,'possibly shared old tester codes never gain cross-browser telemetry');
 assert.equal(await gates.get(legacy).state.storage.get('obd-linked'),undefined);
 const upload=await call('/obd/upload',{sessionId:created.data.sessionId,token:pair.data.token,sequence:1,sentAt:now,measurements:[{id:12,status:'ok',value:800,display:'800 rpm',ageMs:10}]});assert.equal(upload.status,200);
 const read=await call('/obd/read',resumed.data.connection);assert.equal(read.data.status,'live');assert.equal(read.data.measurements[0].display,'800 rpm');
 const store=gates.get(code).state.storage;await store.put('app:binding',{installationHash:'a'.repeat(64),expiresAt:now+86400000});
 assert.equal(store.alarm(),created.data.expiresAt,'pointer cleanup is scheduled before the longer app license');
 now+=31000;const newer=await call('/obd/create',{code});assert.equal(newer.status,200);assert.equal((await call('/obd/read',resumed.data.connection)).status,410,'replacement revokes previous session');
 assert.equal((await call('/obd/resume',{code})).data.connection.sessionId,newer.data.sessionId);
 await call('/obd/close',{sessionId:newer.data.sessionId,token:newer.data.token});assert.equal((await call('/obd/resume',{code})).data.connection,null);
 now+=31000;const expiring=await call('/obd/create',{code});assert.equal(expiring.status,200);now=expiring.data.expiresAt;await gates.get(code).alarm();
 assert.equal(await store.get('obd-linked'),undefined);assert.ok(await store.get('app:binding'),'short pointer alarm preserves app binding');assert.equal(store.alarm(),records.get('code:'+code).expiresAt);
 assert.equal(records.get('code:'+code).credits,30,'measurement discovery never spends AI credits');
 records.get('code:'+code).disabled=true;assert.equal((await call('/obd/resume',{code})).status,400,'disabled code cannot discover a session');
 records.get('code:'+code).disabled=false;records.get('code:'+code).expiresAt=now-1;assert.equal((await call('/obd/resume',{code})).status,400,'expired code cannot discover a session');
 console.log('Shared OBD: one-code discovery, code isolation, legacy privacy, uploader/browser roles, live data, replacement/close/expiry and independent license retention passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});

