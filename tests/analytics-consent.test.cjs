const assert=require('node:assert/strict');const fs=require('fs');const vm=require('node:vm');
const source=fs.readFileSync('analytics-consent.js','utf8');
function setup(saved, throws=false) {
 const storage=new Map(saved?[['asai_analytics_consent_v1',JSON.stringify(saved)]]:[]), scripts=[], cookies=[], events={};
 const yes={focus(){},getAttribute:()=> 'granted'},no={focus(){},getAttribute:()=> 'denied'},close={focus(){}};
 const panel={setAttribute(){},querySelector(selector){return selector==='.analytics-choice-close'?close:yes;},querySelectorAll(){return[yes,no]}};
 const footer={appendChild(){}}, settings={focus(){}};
 const document={referrer:'https://example.com/path?email=secret#private',head:{appendChild(e){if(e.src)scripts.push(e);}},body:{appendChild(){}},querySelector:()=>footer,createElement(type){if(type==='section')return panel;if(type==='button')return settings;return{};}};
 Object.defineProperty(document,'cookie',{get:()=> '_ga=old; _ga_BB62L9G5HX=old; asai_access_code=private',set:v=>cookies.push(v)});
 const window={addEventListener:(name,fn)=>events[name]=fn};const ctx=vm.createContext({window,document,location:{origin:'https://autosahkoapu.fi',pathname:'/',hostname:'autosahkoapu.fi'},localStorage:{getItem:k=>{if(throws)throw Error();return storage.get(k)||null;},setItem:(k,v)=>{if(throws)throw Error();storage.set(k,v);}},Date,URL});
 vm.runInContext(source,ctx);return {window,scripts,cookies,storage,panel,yes,no,settings,close,events};
}
const first=setup();assert.equal(first.scripts.length,0);assert.equal(first.panel.hidden,false);assert.equal(first.window['ga-disable-G-BB62L9G5HX'],true);
first.no.onclick();assert.equal(first.scripts.length,0);assert.equal(first.panel.hidden,true);
first.settings.onclick();assert.equal(first.panel.hidden,false);first.yes.onclick();assert.equal(first.scripts.length,1);assert.equal(first.window['ga-disable-G-BB62L9G5HX'],false);
const config=first.window.dataLayer.find(args=>args[0]==='config');assert.equal(config[1],'G-BB62L9G5HX');assert.equal(config[2].page_location,'https://autosahkoapu.fi/');assert.equal(config[2].page_referrer,'https://example.com/path');assert.equal(config[2].allow_google_signals,false);assert.equal(config[2].cookie_update,false);
const consent=first.window.dataLayer.find(args=>args[0]==='consent');assert.equal(consent[2].ad_storage,'denied');assert.equal(consent[2].ad_user_data,'denied');assert.equal(consent[2].ad_personalization,'denied');
first.no.onclick();assert.equal(first.window['ga-disable-G-BB62L9G5HX'],true);assert.ok(first.cookies.some(v=>v.startsWith('_ga=')));assert.ok(first.cookies.every(v=>!v.includes('asai_access_code')));assert.equal(first.scripts.length,1);
assert.equal(setup({version:1,choice:'granted',time:Date.now()}).scripts.length,1);
assert.equal(setup({version:1,choice:'denied',time:Date.now()}).scripts.length,0);
assert.equal(setup({version:1,choice:'granted',time:Date.now()-181*86400000}).scripts.length,0);
assert.equal(setup({version:1,choice:'granted',time:Date.now()+60000}).scripts.length,0);
assert.equal(setup(null,true).scripts.length,0);
first.events.storage({key:null});assert.equal(first.window['ga-disable-G-BB62L9G5HX'],true);
for(const file of ['index.html','Autodiagnostiikka/index.html','tietosuoja/index.html','peruuttaminen/index.html']) { const html=fs.readFileSync(file,'utf8');assert.ok(html.includes('/analytics-consent.js?v=20261008-1'));assert.ok(!html.includes('googletagmanager.com')); }
console.log('PASS: consent first, equal choices, withdrawal, cookie removal, expiry, storage failure, sanitized page URLs and advertising denied. Mock DOM only.');
