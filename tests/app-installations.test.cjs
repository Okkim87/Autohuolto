const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync('Cloudflare-woker/worker.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export default {','const worker = {').replace(/export class /g,'class ');
const scope=vm.createContext({Request,Response,URL,TextEncoder,crypto:webcrypto,console});
vm.runInContext(source+'\nglobalThis.api={worker,AccessGate};',scope);
const records=new Map(),gates=new Map();let failList=false,failBinding=false,reads=0;
function storage(){const map=new Map();return{get:async key=>{if(failBinding&&key==='app:binding')throw Error('fixture');return structuredClone(map.get(key));},put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k),setAlarm:async()=>{}};}
const env={ADMIN_SECRET:'fixture-admin',ALLOWED_ORIGIN:'https://autosahkoapu.fi',ACCESS_CODES:{get:async key=>{reads++;return structuredClone(records.get(key));},put:async(k,v)=>records.set(k,JSON.parse(v)),list:async({prefix,limit,cursor})=>{if(failList)throw Error('fixture');const keys=[...records.keys()].filter(k=>k.startsWith(prefix));const start=Number(cursor||0),end=start+limit;return{keys:keys.slice(start,end).map(name=>({name})),list_complete:end>=keys.length,cursor:end>=keys.length?'':String(end)};}}};
env.ACCESS_GATE={idFromName:id=>id,get:id=>{if(!gates.has(id))gates.set(id,new scope.api.AccessGate({storage:storage()},env));return gates.get(id);}};
async function call(path,body={},admin=true){const response=await scope.api.worker.fetch(new Request('https://worker'+path,{method:'POST',headers:{'Content-Type':'application/json',...(admin?{Authorization:'Bearer '+env.ADMIN_SECRET}:{})},body:JSON.stringify(body)}),env);return{status:response.status,body:await response.json(),cache:response.headers.get('Cache-Control')};}
const code=i=>'ASAPP-AAAA-BBBB-CCCC-AAA'+'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[i];
const rec={entitlement:'combined',label:'fixture',credits:0,used:150,expiresAt:Date.now()+86400000};
const install='11111111-1111-4111-a111-111111111111',other='22222222-2222-4222-a222-222222222222';
(async()=>{
 assert.equal((await call('/admin/app-installations',{},false)).status,401);
 assert.equal((await call('/admin/app-binding',{code:code(0)},false)).status,401);assert.equal(reads,0,'unauthorized requests cannot read bindings or records');
 assert.equal((await call('/admin/app-installations',{cursor:[]})).status,400);
 assert.equal((await call('/admin/app-installations',null)).status,400);
 const empty=await call('/admin/app-installations');assert.equal(empty.cache,'no-store');assert.equal(empty.body.installations.length,0);assert.equal(empty.body.nextCursor,null);
 // An empty first page must not be confused with end-of-pagination.
 for(let i=0;i<20;i++)records.set('code:ASAI-'+i,{...rec,entitlement:undefined});
 for(let i=0;i<6;i++)records.set('code:'+code(i),{...rec,entitlement:i===1?'app':'combined'});
 assert.equal((await call('/activate',{code:code(2)})).status,400); // zero-credit browser check never binds an app
 for(const [i,id] of [[0,install],[1,install],[3,other],[4,other],[5,other]])assert.equal((await call('/app/activate',{code:code(i),installationId:id},false)).status,200);
 await call('/app/activate',{code:code(0),installationId:install},false); // lease renewal
 records.get('code:'+code(4)).disabled=true;records.get('code:'+code(5)).expiresAt=Date.now()-1;
 const first=await call('/admin/app-installations');assert.equal(first.body.installations.length,0);assert.equal(first.body.nextCursor,'20');
 const second=await call('/admin/app-installations',{cursor:first.body.nextCursor});assert.equal(second.body.scannedCodes,6);assert.equal(second.body.boundCodes,3);assert.equal(second.body.installations.length,2);assert.equal(second.body.nextCursor,null);
 assert.equal(JSON.stringify(second.body).includes(install),false);assert.equal(JSON.stringify(second.body).includes(code(0)),false);
 assert.equal((await call('/admin/reset-app-device',{code:code(3)})).status,200);
 assert.equal((await call('/admin/app-installations',{cursor:'20'})).body.installations.length,1,'reset removes the current binding, not an invented all-time history');
 failBinding=true;assert.equal((await call('/admin/app-installations',{cursor:'20'})).status,503,'binding failure is not a false zero');failBinding=false;
 failList=true;assert.equal((await call('/admin/app-installations')).status,503,'list failure is not a false zero');
 console.log('App installation stats passed: admin auth/no-store, empty/paginated lists, old/new app codes, renewals, duplicate installations, no browser-only count, expired/disabled/reset bindings excluded, failures never shown as zero.');
})().catch(e=>{console.error(e);process.exitCode=1;});
