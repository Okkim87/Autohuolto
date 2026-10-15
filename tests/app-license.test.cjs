const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
let now=Date.now();class Clock extends Date{static now(){return now;}}
const source=fs.readFileSync('Cloudflare-woker/worker.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export default {','const worker = {').replace(/export class /g,'class ');
const scope=vm.createContext({Request,Response,URL,TextEncoder,Date:Clock,crypto:webcrypto,console});
vm.runInContext(source+'\nglobalThis.api={worker,AccessGate};',scope);
const records=new Map(),gates=new Map();
function storage(){const map=new Map();return{map,get:async key=>structuredClone(map.get(key)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k),setAlarm:async()=>{}};}
const env={ADMIN_SECRET:'test-admin-not-a-production-secret',ALLOWED_ORIGIN:'https://autosahkoapu.fi',ACCESS_CODES:{get:async key=>structuredClone(records.get(key)),put:async(k,v)=>records.set(k,JSON.parse(v))}};
env.ACCESS_GATE={idFromName:id=>id,get:id=>{if(!gates.has(id))gates.set(id,new scope.api.AccessGate({storage:storage()},env));return gates.get(id);}};
async function call(path,body,admin=false){const response=await scope.api.worker.fetch(new Request('https://worker'+path,{method:'POST',headers:{'Content-Type':'application/json',...(admin?{Authorization:'Bearer '+env.ADMIN_SECRET}:{})},body:JSON.stringify(body)}),env);return{status:response.status,body:await response.json(),cache:response.headers.get('Cache-Control')};}
const device='11111111-1111-4111-a111-111111111111',other='22222222-2222-4222-a222-222222222222';
(async()=>{
 assert.equal((await call('/admin/create-code',{kind:'app',appDays:30})).status,401);
 for(const appDays of [0,2,-1,'30',366])assert.equal((await call('/admin/create-code',{kind:'app',appDays},true)).status,400);
 assert.equal((await call('/admin/create-code',{kind:'bad'},true)).status,400);
 assert.equal((await call('/admin/create-code',{plan:'constructor'},true)).status,400);
 const ai=await call('/admin/create-code',{plan:'single'},true);assert.equal(ai.status,200);assert.equal(ai.body.credits,30);
 assert.equal((await call('/activate',{code:ai.body.code})).status,200,'existing AI activation stays compatible');
 const created=await call('/admin/create-code',{kind:'app',appDays:30,note:'test'},true);
 assert.equal(created.status,200);assert.match(created.body.code,/^ASAPP-(?:[A-HJ-NP-Z2-9]{4}-){3}[A-HJ-NP-Z2-9]{4}$/);assert.equal(created.body.credits,0);assert.equal(created.cache,'no-store');
 const code=created.body.code;
 assert.equal((await call('/activate',{code})).status,400,'app code never grants AI credits');
 assert.equal((await call('/app/activate',{code:ai.body.code,installationId:device})).status,400);
 assert.equal((await call('/app/activate',{code,installationId:'fake'})).status,400);
 const [first,second]=await Promise.all([call('/app/activate',{code,installationId:device}),call('/app/activate',{code,installationId:other})]);
 assert.equal(first.status,200);assert.equal(first.body.appAccess,true);assert.equal(first.body.leaseMs,900000);assert.equal(second.status,403,'simultaneous activation binds only one installation');
 assert.equal((await call('/app/activate',{code,installationId:device})).status,200,'same installation can renew without consuming AI balance');
 const binding=await gates.get(code).state.storage.get('app:binding');assert.equal(binding.installationHash.length,64);assert.equal(JSON.stringify(binding).includes(device),false);
 assert.equal((await call('/admin/reset-app-device',{code})).status,401);
 assert.equal((await call('/app/activate',{code,installationId:other})).status,403,'unauthorized reset changed nothing');
 assert.equal((await call('/admin/reset-app-device',{code},true)).status,200);
 assert.equal((await call('/app/activate',{code,installationId:other})).status,200);
 assert.equal((await call('/app/activate',{code,installationId:device})).status,403);
 records.get('code:'+code).disabled=true;
 assert.equal((await call('/app/activate',{code,installationId:other})).status,403);
 records.get('code:'+code).disabled=false;now=created.body.expiresAt-1000;
 assert.equal((await call('/app/activate',{code,installationId:other})).body.leaseMs,1000);
 now=created.body.expiresAt;assert.equal((await call('/app/activate',{code,installationId:other})).status,403);
 await gates.get(code).alarm();assert.equal(await gates.get(code).state.storage.get('app:binding'),undefined,'expired installation hash is removed by alarm');
 assert.equal(records.get('code:'+ai.body.code).credits,30);
 console.log('App licensing: admin authorization, plan separation, concurrent one-install binding, renewal, device reset, disabled/expiry, bounded lease and binding cleanup passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
