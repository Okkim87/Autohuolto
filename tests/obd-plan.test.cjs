const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const parameters=JSON.parse(fs.readFileSync('Cloudflare-woker/obd-parameters.mjs','utf8').split('export const OBD_PARAMETERS = ')[1].replace(/;\s*$/,''));
const source=fs.readFileSync('Cloudflare-woker/worker.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export default {','const worker = {').replace(/export class /g,'class ');
const scope=vm.createContext({Request,Response,URL,crypto,OBD_PARAMETERS:parameters,console});
vm.runInContext(source+'\nglobalThis.a={chooseObdRule,makeObdPlan,ObdSession};',scope);const a=scope.a;
const supported=[12,5,15,3,6,7,17,66];
assert.equal(a.chooseObdRule([],'Kylmänä käy huonosti',{test:'Kaasupolkimen asento',tool:'OBD'}).key,'throttle');
assert.equal(a.chooseObdRule([],'FlexRay jännite',{test:'Akkujännite',tool:'OBD'}).key,'outside-standard');
for(const [message,key] of [['Kylmänä kierrokset seilaavat','cold-idle'],['Onko jäähdytysnesteen lämpö kunnossa?','coolant'],['P0171 seos laiha','mixture'],['Akku ei lataudu','voltage'],['Ei vastaa kaasuun','throttle'],['Airbag vikakoodi','outside-standard'],['FlexRay jännite','outside-standard']]){
 assert.equal(a.chooseObdRule([],message,null).key,key);
 const p=a.makeObdPlan(a.chooseObdRule([],message,null),supported,null);assert.ok(p.ids.length<=6);for(const id of p.ids)assert.ok(supported.includes(id));
}
assert.equal(a.chooseObdRule([{role:'user',text:'Kylmänä seilaa'}],'Joo',null).key,'cold-idle');
assert.equal(a.chooseObdRule([{role:'user',text:'Kylmänä seilaa'}],'Onko jäähdytysnesteen lämpö kunnossa?',null).key,'coolant');
const storage=new Map();const s=new a.ObdSession({storage:{get:async k=>structuredClone(storage.get(k)),put:async(k,v)=>storage.set(k,structuredClone(v)),setAlarm:async()=>{},deleteAll:async()=>storage.clear()}});
async function call(path,body){const r=await s.fetch(new Request('https://internal'+path,{method:'POST',body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};}
(async()=>{
 const now=Date.now(),token='a'.repeat(64);await call('/create',{token,expiresAt:now+1800000,pairUntil:now+300000});
 const paired=await call('/obd/pair',{vehicle:{make:'Ford',model:'Mondeo',year:2010,engine:'2.0 bensa'},supportedIds:supported});assert.equal(paired.status,200);assert.equal(paired.data.plan.revision,1);
 assert.equal((await call('/obd/plan',{token:paired.data.token,ruleKey:'coolant'})).status,403);
 assert.equal((await call('/obd/plan',{token,ruleKey:'ATSH7E0'})).status,400);
 const plan=(await call('/obd/plan',{token,ruleKey:'coolant'})).data.plan;assert.equal(plan.revision,2);
 assert.equal((await call('/obd/plan',{token,ruleKey:'coolant'})).data.plan.revision,2,'stable plans are not repeatedly renewed');
 const result=await call('/obd/upload',{token:paired.data.token,sequence:1,sentAt:now,samplingMode:'automatic',appliedPlanRevision:2,measurements:[{id:5,status:'ok',value:75,display:'75 °C',ageMs:10}]});assert.equal(result.status,200);assert.equal(result.data.plan.revision,2);
 const read=(await call('/obd/read',{token})).data;assert.equal(read.samplingMode,'automatic');assert.equal(read.appliedPlanRevision,2);assert.equal(read.supportedIds.length,8);
 await call('/obd/plan',{token,ruleKey:'outside-standard'});assert.equal((await call('/obd/read',{token})).data.plan.ids.length,0);
 console.log('PASS: conversation focus, cold/temperature/mixture/throttle/voltage/OEM boundaries, supported intersection, roles, safe rule keys, stable revisions and device acknowledgement.');
})().catch(e=>{console.error(e);process.exitCode=1;});
