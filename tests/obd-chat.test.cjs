const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const nodes=new Map();
function node(id) { if(!nodes.has(id)) nodes.set(id,{id,hidden:false,textContent:'',value:'',handlers:{},children:[],addEventListener(event,fn){this.handlers[event]=fn;},setAttribute(key,value){this[key]=value;},replaceChildren(...items){this.children=items;}});return nodes.get(id); }
const windowHandlers={}, documentHandlers={};let poll, readPending=null, resumePending=null, closed=0, access=null, creates=0, shared=null, legacy=false, beacons=0;
const capability={sessionId:'a'.repeat(64),token:'b'.repeat(64),expiresAt:Date.now()+1800000,shared:true};
const snapshot={status:'live',vehicle:{make:'Ford',model:'Mondeo',year:2010,engine:'2.0 bensiini'},measurements:[{name:'Kierrosluku',display:'<script>123</script>',status:'ok',ageMs:200,fresh:true}]};
const context=vm.createContext({ document:{hidden:false,getElementById:node,createElement:()=>node(Math.random().toString()),querySelector:()=>node('tool'),addEventListener:(e,fn)=>documentHandlers[e]=fn},window:{addEventListener:(e,fn)=>windowHandlers[e]=fn},navigator:{clipboard:{writeText:async()=>{}}},setInterval:fn=>{poll=fn;},activeAccess:access,workerReady:()=>true,cfg:{workerUrl:'https://worker'},fetch:async()=>{beacons++;},api:async(path)=>{
  if(path==='/obd/resume')return resumePending || {connection:shared,legacy};
  if(path==='/obd/create'){creates++;return {...capability,pairCode:'ABCD-EFGH-JKLM'};}
  if(path==='/obd/read')return readPending || snapshot;
  if(path==='/obd/close')closed++;
}});
vm.runInContext(fs.readFileSync('obd-chat.js','utf8'),context);
(async()=>{
  node('obd-panel').hidden=true;node('obd-toggle').handlers.click();assert.equal(node('obd-panel').hidden,false);assert.equal(node('obd-toggle')['aria-expanded'],'true');
  await node('obd-create').handlers.click();assert.ok(node('obd-status').textContent.includes('Aktivoi ensin'));assert.equal(context.window.ASAI_OBD.session(),null);
  context.activeAccess={code:'TEST'};await node('obd-create').handlers.click();assert.equal(context.window.ASAI_OBD.session(),null);assert.ok(node('obd-status').textContent.includes('Odotetaan appia'));
  shared=capability;await poll();assert.equal(context.window.ASAI_OBD.session().token,'b'.repeat(64));assert.equal(creates,0,'external browser discovers the app session without creating a pairing code');
  windowHandlers.pagehide();assert.equal(beacons,0,'leaving the browser does not disconnect the app');
  assert.equal(node('obd-readings').children[0].textContent.includes('<script>'),true,'untrusted display is literal textContent, not HTML');
  assert.equal(node('car').value,'','vehicle is not silently replaced');node('obd-use-vehicle').handlers.click();assert.equal(node('car').value,'Ford Mondeo');assert.equal(node('engine').value,'2.0 bensiini');
  let resolve;readPending=new Promise(r=>resolve=r);const pending=poll();await node('obd-close').handlers.click();resolve(snapshot);await pending;
  assert.equal(context.window.ASAI_OBD.session(),null);assert.equal(node('obd-readings').children.length,0);assert.equal(closed,1,'close revokes browser capability session');
  readPending=null;await poll();assert.equal(context.window.ASAI_OBD.session(),null,'explicit close stops following the app');
  let resumeResolve;resumePending=new Promise(r=>resumeResolve=r);const discovering=node('obd-create').handlers.click();await node('obd-close').handlers.click();resumeResolve({connection:capability});await discovering;
  assert.equal(context.window.ASAI_OBD.session(),null,'late discovery cannot restore a closed session');resumePending=null;
  await node('obd-create').handlers.click();context.activeAccess={code:'OTHER'};assert.equal(context.window.ASAI_OBD.session(),null,'code change immediately removes AI measurement access');await poll();assert.equal(node('obd-readings').children.length,0);
  legacy=true;shared=null;await node('obd-create').handlers.click();assert.ok(node('obd-status').textContent.includes('Vanha testaajakoodi'));assert.equal(context.window.ASAI_OBD.session(),null);legacy=false;
  const native=context.window.ASAI_APP_OBD;
  assert.equal(native.start(),false,'web page alone cannot initiate native pairing');
  native.install();assert.equal(node('obd-create').hidden,true);
  assert.equal(native.start(),true);assert.equal(native.start(),false,'duplicate start rejected');
  for(let i=0;i<15;i++)await Promise.resolve();
  const pair=native.take();assert.equal(pair.pairCode,'ABCD-EFGH-JKLM');assert.equal(pair.token,undefined,'browser capability not sent to native uploader');assert.equal(native.take(),null,'one-time handoff');
  assert.equal(/id="obd-(pairing|code|copy)"/.test(fs.readFileSync('index.html','utf8')),false,'manual OBD code controls removed');
  assert.equal(context.window.ASAI_OBD.session().token,'b'.repeat(64),'browser still has AI measurement capability');
  await native.cancel();assert.equal(context.window.ASAI_OBD.session(),null);
  context.activeAccess=null;native.start();for(let i=0;i<10;i++)await Promise.resolve();assert.ok(native.take().error.includes('Aktivoi'));
  console.log('OBD UI: shared discovery, legacy instructions, activation, car confirmation, literal rendering, late-response cancellation, code changes, native one-time handoff and duplicate prevention passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
