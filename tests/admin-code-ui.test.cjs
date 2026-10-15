const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const nodes=new Map();
function node(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,disabled:false,handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},replaceChildren(...children){this.children=children;}});return nodes.get(id);}
node('worker').value='https://worker.example';node('secret').value='TEST-ONLY-SECRET';node('kind').value='ai';node('plan').value='single';node('app-days').value='30';
let calls=[],fail=false,copied;
const context=vm.createContext({document:{getElementById:node,createElement:()=>node('new-'+nodes.size)},URL,navigator:{clipboard:{writeText:async value=>{copied=value;}}},window:{confirm:()=>true},fetch:async(url,options)=>{calls.push({url,options});return{ok:!fail,json:async()=>fail?{error:'denied'}:{code:'<img src=x onerror=evil()>',remainingText:'<script>bad()</script>',message:'reset done'}};}});
vm.runInContext(fs.readFileSync('admin.js','utf8'),context);
(async()=>{
 await node('create').handlers.click();assert.equal(calls.length,1);assert.equal(calls[0].url,'https://worker.example/admin/create-code');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.headers.Authorization,'Bearer TEST-ONLY-SECRET');
 assert.equal(JSON.parse(calls[0].options.body).kind,'ai');assert.equal(node('out').children[0].textContent,'<img src=x onerror=evil()>');assert.equal(node('out').children[1].textContent,'<script>bad()</script>');
 assert.equal(node('out').children[0].innerHTML,undefined,'server data is always plain text');
 node('kind').value='app';node('kind').handlers.change();assert.equal(node('ai-options').hidden,true);assert.equal(node('app-options').hidden,false);assert.equal(node('copy').hidden,true);
 node('app-days').value='7';await node('create').handlers.click();const body=JSON.parse(calls.at(-1).options.body);assert.equal(body.kind,'app');assert.equal(body.appDays,7);
 await node('copy').handlers.click();assert.equal(copied,'<img src=x onerror=evil()>');
 fail=true;await node('create').handlers.click();assert.equal(node('out').textContent,'denied');assert.equal(node('copy').hidden,true);assert.equal(node('create').disabled,false);assert.equal(node('kind').disabled,false);
 node('worker').value='http://worker.example';await node('create').handlers.click();assert.equal(calls.length,3,'HTTP never receives the admin secret');
 node('worker').value='https://worker.example/?secret=bad';await node('create').handlers.click();assert.equal(calls.length,3);
 node('worker').value='https://worker.example';fail=false;node('reset-code').value='ASAPP-ABCD-EFGH-JKLM-NPQR';await node('reset').handlers.click();assert.equal(calls.at(-1).url,'https://worker.example/admin/reset-app-device');assert.equal(node('reset-status').textContent,'reset done');
 console.log('Admin UI: AI/app request separation, HTTPS-only secret handling, safe text rendering, failed-request recovery, copying and explicit device reset passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
