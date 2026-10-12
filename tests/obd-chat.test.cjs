const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const nodes=new Map();
function node(id) { if(!nodes.has(id)) nodes.set(id,{id,hidden:false,textContent:'',value:'',handlers:{},children:[],addEventListener(event,fn){this.handlers[event]=fn;},setAttribute(key,value){this[key]=value;},replaceChildren(...items){this.children=items;}});return nodes.get(id); }
const windowHandlers={}, documentHandlers={};let poll, readPending=null, closed=0, access=null;
const snapshot={status:'live',vehicle:{make:'Ford',model:'Mondeo',year:2010,engine:'2.0 bensiini'},measurements:[{name:'Kierrosluku',display:'<script>123</script>',status:'ok',ageMs:200,fresh:true}]};
const context=vm.createContext({ document:{hidden:false,getElementById:node,createElement:()=>node(Math.random().toString()),querySelector:()=>node('tool'),addEventListener:(e,fn)=>documentHandlers[e]=fn},window:{addEventListener:(e,fn)=>windowHandlers[e]=fn},navigator:{clipboard:{writeText:async()=>{}}},setInterval:fn=>{poll=fn;},activeAccess:access,workerReady:()=>true,cfg:{workerUrl:'https://worker'},fetch:async()=>{},api:async(path)=>{
  if(path==='/obd/create')return {sessionId:'a'.repeat(64),token:'b'.repeat(64),pairCode:'ABCD-EFGH-JKLM',expiresAt:Date.now()+1800000};
  if(path==='/obd/read')return readPending || snapshot;
  if(path==='/obd/close')closed++;
}});
vm.runInContext(fs.readFileSync('obd-chat.js','utf8'),context);
(async()=>{
  node('obd-panel').hidden=true;node('obd-toggle').handlers.click();assert.equal(node('obd-panel').hidden,false);assert.equal(node('obd-toggle')['aria-expanded'],'true');
  await node('obd-create').handlers.click();assert.ok(node('obd-status').textContent.includes('Aktivoi ensin'));assert.equal(context.window.ASAI_OBD.session(),null);
  context.activeAccess={code:'TEST'};await node('obd-create').handlers.click();assert.equal(context.window.ASAI_OBD.session().token,'b'.repeat(64));
  assert.equal(node('obd-code').textContent,'ABCD-EFGH-JKLM');assert.equal(node('obd-readings').children[0].textContent.includes('<script>'),true,'untrusted display is literal textContent, not HTML');
  assert.equal(node('car').value,'','vehicle is not silently replaced');node('obd-use-vehicle').handlers.click();assert.equal(node('car').value,'Ford Mondeo');assert.equal(node('engine').value,'2.0 bensiini');
  let resolve;readPending=new Promise(r=>resolve=r);const pending=poll();await node('obd-close').handlers.click();resolve(snapshot);await pending;
  assert.equal(context.window.ASAI_OBD.session(),null);assert.equal(node('obd-readings').children.length,0);assert.equal(closed,1,'close revokes browser capability session');
  console.log('OBD UI: explicit activation and pairing, car confirmation, safe rendering and late-response revocation passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
