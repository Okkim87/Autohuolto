const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const nodes=new Map();
function node(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,disabled:false,handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},replaceChildren(...children){this.children=children;}});return nodes.get(id);}
node('worker').value='https://worker.example';node('secret').value='TEST-ONLY-SECRET';node('kind').value='ai';node('plan').value='single';node('app-days').value='30';
let calls=[],fail=false,copied,statPages=[];
const context=vm.createContext({document:{getElementById:node,createElement:()=>node('new-'+nodes.size)},URL,navigator:{clipboard:{writeText:async value=>{copied=value;}}},window:{confirm:()=>true},fetch:async(url,options)=>{calls.push({url,options});if(url.endsWith('/admin/app-installations'))return{ok:!fail,json:async()=>fail?{error:'denied'}:statPages.shift()};return{ok:!fail,json:async()=>fail?{error:'denied'}:{code:'<img src=x onerror=evil()>',remainingText:'<script>bad()</script>',message:'reset done'}};}});
vm.runInContext(fs.readFileSync('admin.js','utf8'),context);
(async()=>{
 await node('create').handlers.click();assert.equal(calls.length,1);assert.equal(calls[0].url,'https://worker.example/admin/create-code');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.headers.Authorization,'Bearer TEST-ONLY-SECRET');
 assert.equal(JSON.parse(calls[0].options.body).kind,'combined');assert.equal(node('out').children[0].textContent,'<img src=x onerror=evil()>');assert.equal(node('out').children[1].textContent,'<script>bad()</script>');
 assert.equal(node('out').children[0].innerHTML,undefined,'server data is always plain text');
 node('plan').value='five';await node('create').handlers.click();const body=JSON.parse(calls.at(-1).options.body);assert.equal(body.kind,'combined');assert.equal(body.plan,'five');assert.equal(body.appDays,undefined);
 await node('copy').handlers.click();assert.equal(copied,'<img src=x onerror=evil()>');
 fail=true;await node('create').handlers.click();assert.equal(node('out').textContent,'denied');assert.equal(node('copy').hidden,true);assert.equal(node('create').disabled,false);assert.equal(node('kind').disabled,false);
 node('worker').value='http://worker.example';await node('create').handlers.click();assert.equal(calls.length,3,'HTTP never receives the admin secret');
 node('worker').value='https://worker.example/?secret=bad';await node('create').handlers.click();assert.equal(calls.length,3);
 node('worker').value='https://worker.example';fail=false;node('reset-code').value='ASAPP-ABCD-EFGH-JKLM-NPQR';await node('reset').handlers.click();assert.equal(calls.at(-1).url,'https://worker.example/admin/reset-app-device');assert.equal(node('reset-status').textContent,'reset done');
 statPages=[{installations:[],scannedCodes:20,boundCodes:0,nextCursor:'page2'},{installations:['a'.repeat(64)],scannedCodes:2,boundCodes:2,nextCursor:'page3'},{installations:['a'.repeat(64),'b'.repeat(64)],scannedCodes:2,boundCodes:2,nextCursor:null}];
 await node('refresh-installations').handlers.click();assert.equal(node('installation-count').textContent,'2','deduplicate across pages and multiple app codes');assert.ok(node('installation-status').textContent.includes('4 voimassa'));assert.equal(node('refresh-installations').disabled,false);assert.equal(JSON.parse(calls.at(-1).options.body).cursor,'page3');
 fail=true;await node('refresh-installations').handlers.click();assert.equal(node('installation-count').textContent,'—');assert.equal(node('installation-status').textContent,'denied');fail=false;
 statPages=[{installations:['a'.repeat(64)],scannedCodes:1,boundCodes:1,nextCursor:'same'},{installations:[],scannedCodes:1,boundCodes:0,nextCursor:'same'}];
 await node('refresh-installations').handlers.click();assert.equal(node('installation-count').textContent,'—','never show partial counts on pagination failure');assert.ok(node('installation-status').textContent.includes('sivutus'));
 statPages=[{installations:['<script>'],scannedCodes:1,boundCodes:1,nextCursor:null}];await node('refresh-installations').handlers.click();assert.equal(node('installation-count').textContent,'—');
 statPages=[{installations:[],scannedCodes:0,boundCodes:0,nextCursor:null}];await node('refresh-installations').handlers.click();assert.equal(node('installation-count').textContent,'0','zero only after a complete successful scan');
 console.log('Admin UI: AI/app request separation, HTTPS-only secret handling, safe text rendering, failed-request recovery, copying and explicit device reset passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
