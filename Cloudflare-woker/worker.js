const PLAN = {
  single: { label: '1 diagnoosi', credits: 30, expiresDays: 90 },
  five:   { label: '5 diagnoosia', credits: 150, expiresDays: 180 },
  month:  { label: '30 päivän käyttö', credits: 300, expiresDays: 30 }
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);
    const url = new URL(request.url);
    try {
      if (url.pathname === '/activate') return await activate(request, env, headers);
      if (url.pathname === '/lookup') return await lookup(request, env, headers);
      if (url.pathname === '/diagnose') return await diagnose(request, env, headers);
      if (url.pathname === '/admin/create-code') return await createCode(request, env, headers);
      return json({ error: 'Not found' }, 404, headers);
    } catch (e) {
      console.error(e);
      return json({ error: 'Palvelinvirhe. Yritä uudelleen.' }, 500, headers);
    }
  }
};

function corsHeaders(origin, allowed) {
  const allow = !allowed || origin === allowed ? (origin || allowed || '*') : allowed;
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };
}
function json(data, status=200, headers={}) { return new Response(JSON.stringify(data), { status, headers }); }
function cleanCode(v='') { return String(v).trim().toUpperCase(); }
function cleanVin(v='') { return String(v).trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9*]/g,'').slice(0,17); }
function remainingText(rec){ const left=Math.max(0,rec.credits||0); const exp=rec.expiresAt?new Date(rec.expiresAt).toLocaleDateString('fi-FI'):''; return `${left} AI-vaihetta jäljellä${exp?` · voimassa ${exp} asti`:''}`; }
async function getRecord(env, code){ const rec=await env.ACCESS_CODES.get(`code:${code}`, 'json'); if(!rec) throw new UserError('Aktivointikoodia ei löytynyt.'); if(rec.disabled) throw new UserError('Aktivointikoodi ei ole käytössä.'); if(rec.expiresAt && Date.now()>rec.expiresAt) throw new UserError('Aktivointikoodi on vanhentunut.'); if((rec.credits||0)<=0) throw new UserError('Aktivointikoodin käyttömäärä on käytetty loppuun.'); return rec; }
class UserError extends Error {}

function isHighVoltageTopic(c={}, text=''){
  const hay=[c.car,c.engine,c.dtc,text].filter(Boolean).join(' ').toLowerCase();
  return /\b(hv|high[- ]?voltage|korkeajänn|ajoakku|traction battery|hybridiakku|hybrid battery|service disconnect|huoltoerotin|interlock|precharge|esilataus|kontaktori|contactor|invertteri|inverter|on[- ]?board charger|obc|dc[-/]?dc|oranssi(?:t|a)? kaapeli|eristysvika|isolation fault|p0aa[0-9a-f]|p1a[0-9a-f]{2})\b/i.test(hay);
}
function hvRedirectReply(){
  return {blocked:true,test:'Korkeajännitejärjestelmä',tool:'',how:'Autosähköapu AI ei anna korkeajännitejärjestelmän mittaus-, korjaus- tai purkuohjeita. Ota tässä asiassa suoraan yhteyttä minuun: autosahkoapu@gmail.com',expected:'',ifNormal:'',ifAbnormal:'',reason:'',caution:'Älä koske korkeajännitejärjestelmään, oransseihin HV-kaapeleihin tai HV-komponentteihin tämän verkkopalvelun ohjeiden perusteella.'};
}

async function activate(request, env, headers){
  try { const {code}=await request.json(); const c=cleanCode(code); const rec=await getRecord(env,c); return json({ok:true,label:rec.label,credits:rec.credits,expiresAt:rec.expiresAt,remainingText:remainingText(rec)},200,headers); }
  catch(e){ return json({error:e instanceof UserError?e.message:'Virheellinen pyyntö.'},400,headers); }
}

async function lookup(request, env, headers){
  const body = await request.json();
  const caseData = body.caseData || {};
  const context = await getTechnicalContext(caseData, env);
  return json({ context, sources: sourceSummary(context) }, 200, headers);
}

async function diagnose(request, env, headers){
  try {
    const body=await request.json(); const code=cleanCode(body.code); const rec=await getRecord(env,code);
    const caseData=body.caseData||{};
    const history=Array.isArray(body.history)?body.history.slice(-18):[];
    const userMessage=String(body.userMessage||body.measurementResult||'').slice(0,5000);
    const attachments=normalizeAttachments(body.attachments);
    if(isHighVoltageTopic(caseData,userMessage)){
      const reply=hvRedirectReply();
      const compactFiles=attachments.map(a=>({name:a.name,kind:a.kind}));
      const nextHistory=[...history,{role:'user',text:userMessage,attachments:compactFiles},{role:'assistant',reply}].slice(-18);
      return json({reply,history:nextHistory,access:{credits:rec.credits,remainingText:remainingText(rec)},sources:[]},200,headers);
    }
    const technicalContext = await getTechnicalContext(caseData, env);
    const prompt=buildPrompt(caseData,history,userMessage,technicalContext,attachments);
    const userContent=[{type:'input_text',text:prompt}];
    for(const a of attachments){
      if(a.kind==='image' && a.dataUrl) userContent.push({type:'input_image',image_url:a.dataUrl});
    }
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-5.6-luna',reasoning:{effort:'low'},max_output_tokens:900,input:[{role:'system',content:[{type:'input_text',text:SYSTEM_PROMPT}]},{role:'user',content:userContent}]})});
    const raw=await response.json(); if(!response.ok) { console.error('OpenAI error',raw); throw new Error('AI-palvelu ei vastannut.'); }
    const text=extractText(raw); const reply=parseReply(text);
    if(!reply.blocked){rec.credits=Math.max(0,(rec.credits||0)-1); rec.used=(rec.used||0)+1; rec.lastUsedAt=Date.now(); await env.ACCESS_CODES.put(`code:${code}`,JSON.stringify(rec));}
    const compactFiles=attachments.map(a=>({name:a.name,kind:a.kind}));
    const nextHistory=[...history,{role:'user',text:userMessage,attachments:compactFiles},{role:'assistant',reply}].slice(-18);
    return json({reply,history:nextHistory,access:{credits:rec.credits,remainingText:remainingText(rec)},sources:sourceSummary(technicalContext)},200,headers);
  } catch(e) { if(e instanceof UserError) return json({error:e.message},402,headers); console.error(e); return json({error:'AI-diagnoosi epäonnistui. Yritä uudelleen.'},500,headers); }
}

function normalizeAttachments(raw){
  if(!Array.isArray(raw)) return [];
  const out=[];
  for(const x of raw.slice(0,6)){
    const name=String(x?.name||'liite').slice(0,120);
    if(x?.kind==='image' && typeof x.dataUrl==='string' && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(x.dataUrl) && x.dataUrl.length<6_000_000){out.push({name,kind:'image',dataUrl:x.dataUrl});continue;}
    if(x?.kind==='text' && typeof x.text==='string'){out.push({name,kind:'text',text:x.text.slice(0,80000)});}
  }
  return out;
}

async function getTechnicalContext(c, env){
  const [vehicle, dtcs, obdex] = await Promise.all([
    decodeVin(c.vin, c.year),
    lookupDtcs(c.dtc, env),
    lookupObdex(c.dtc)
  ]);
  const [obdb, wal33d, obdexPids] = await Promise.all([
    lookupObdbSignals(c, vehicle),
    lookupWal33d(c.dtc, env),
    lookupObdexPids(c, obdex)
  ]);
  return { vehicle, dtcs, obdex, obdexPids, obdb, wal33d };
}

async function decodeVin(vinRaw, yearRaw){
  const vin=cleanVin(vinRaw);
  if(vin.length < 11) return null;
  const year = String(yearRaw||'').replace(/[^0-9]/g,'').slice(0,4);
  const url = new URL(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}`);
  url.searchParams.set('format','json');
  if(year) url.searchParams.set('modelyear',year);
  try {
    const r=await fetch(url.toString(), {headers:{'User-Agent':'AutosahkoapuAI/1.0'}});
    if(!r.ok) return {source:'NHTSA vPIC', vin, error:'VIN-palvelu ei vastannut'};
    const raw=await r.json(); const x=raw?.Results?.[0]||{};
    const value = k => String(x[k]||'').trim();
    return {
      source:'NHTSA vPIC', vin,
      make:value('Make'), model:value('Model'), modelYear:value('ModelYear'),
      trim:value('Trim'), bodyClass:value('BodyClass'), vehicleType:value('VehicleType'),
      engineCylinders:value('EngineCylinders'), displacementL:value('DisplacementL'),
      fuelType:value('FuelTypePrimary'), driveType:value('DriveType'), plantCountry:value('PlantCountry'),
      errorCode:value('ErrorCode'), errorText:value('ErrorText')
    };
  } catch(e){ console.error('vPIC',e); return {source:'NHTSA vPIC',vin,error:'VIN-haku epäonnistui'}; }
}

function parseDtcCodes(raw=''){
  const found=String(raw).toUpperCase().match(/\b[PBCU][0-9A-F]{4}\b/g)||[];
  return [...new Set(found)].slice(0,12);
}

async function lookupDtcs(raw, env){
  const codes=parseDtcCodes(raw);
  if(!codes.length) return [];
  if(!env.AUTODIAG_DB) return codes.map(code=>({code,source:'Autodiag2',available:false,note:'Autodiag2 D1 -sidonta puuttuu'}));
  const out=[];
  for(const code of codes){
    try{
      const q=`SELECT d.code, d.definition, d.description, m.name AS manufacturer, e.model AS ecu_model
               FROM ad_dtc AS d
               JOIN ad_ecu AS e ON e.id = d.ecu_id
               LEFT JOIN ad_manufacturer AS m ON m.id = e.manufacturer_id
               WHERE d.code = ?
               ORDER BY CASE WHEN m.name IS NULL THEN 1 ELSE 0 END, m.name, e.model
               LIMIT 8`;
      const rs=await env.AUTODIAG_DB.prepare(q).bind(code).all();
      if(rs?.results?.length) out.push(...rs.results.map(x=>({...x,source:'Autodiag2',available:true})));
      else out.push({code,source:'Autodiag2',available:false,note:'Koodille ei löytynyt määritelmää avoimesta tietokannasta'});
    }catch(e){
      console.error('Autodiag2 query',e);
      out.push({code,source:'Autodiag2',available:false,note:'DTC-tietokantahaku epäonnistui'});
    }
  }
  return out;
}



async function lookupObdex(raw){
  const codes=parseDtcCodes(raw);
  if(!codes.length) return [];
  try{
    const cache = caches.default;
    const req = new Request('https://foerbsnavi.github.io/obdex/generic.min.json', {headers:{'Accept':'application/json'}});
    let resp = await cache.match(req);
    if(!resp){
      const live = await fetch(req);
      if(!live.ok) throw new Error(`OBDex HTTP ${live.status}`);
      resp = new Response(live.body, live);
      resp.headers.set('Cache-Control','public, max-age=86400');
      await cache.put(req, resp.clone());
    }
    const all = await resp.json();
    const wanted = new Set(codes);
    return all.filter(x=>wanted.has(String(x.code||'').toUpperCase())).slice(0,12).map(x=>({
      source:'OBDex', code:x.code, category:x.category,
      title:x?.title?.en||'', description:x?.description?.en||'',
      affectedComponents:Array.isArray(x.affected_components)?x.affected_components.slice(0,8):[],
      commonCauses:Array.isArray(x.common_causes)?x.common_causes.slice(0,8):[],
      symptoms:Array.isArray(x.symptoms)?x.symptoms.slice(0,8):[],
      relatedCodes:Array.isArray(x.related_codes)?x.related_codes.slice(0,8):[],
      available:true
    }));
  }catch(e){ console.error('OBDex',e); return codes.map(code=>({source:'OBDex',code,available:false,note:'OBDex-haku epäonnistui'})); }
}


async function lookupObdexPids(c, obdexRows=[]){
  const rawTerms=[];
  for(const row of obdexRows||[]){
    rawTerms.push(row?.title||'', row?.description||'');
    for(const x of row?.affectedComponents||[]) rawTerms.push(typeof x==='string'?x:JSON.stringify(x));
  }
  rawTerms.push(c?.dtc||'', c?.car||'', c?.engine||'');
  const aliases={
    maf:['maf','mass air','air flow','ilmamäär'], map:['map','manifold','intake pressure'],
    fuel:['fuel','lambda','oxygen','o2','trim','seos','polttoaine'], coolant:['coolant','temperature','ect','jäähdytys'],
    throttle:['throttle','tps','kaasuläpp'], rpm:['rpm','engine speed','kierros'], speed:['vehicle speed','vss','nopeus'],
    voltage:['voltage','battery','control module voltage','jännite']
  };
  const hay=rawTerms.join(' ').toLowerCase();
  const wanted=[];
  for(const [k,words] of Object.entries(aliases)) if(words.some(w=>hay.includes(w))) wanted.push(...words,k);
  if(!wanted.length) wanted.push('rpm','engine speed','load','coolant','maf','map','fuel trim','oxygen','voltage');
  try{
    const url='https://foerbsnavi.github.io/obdex/pids/mode01.json';
    const cache=caches.default; const req=new Request(url,{headers:{'Accept':'application/json'}});
    let resp=await cache.match(req);
    if(!resp){ const live=await fetch(req); if(!live.ok) throw new Error(`OBDex PID HTTP ${live.status}`); resp=new Response(live.body,live); resp.headers.set('Cache-Control','public, max-age=86400'); await cache.put(req,resp.clone()); }
    const data=await resp.json(); const list=Array.isArray(data)?data:(data?.pids||data?.data||[]);
    const scored=[];
    for(const pid of list){
      const txt=JSON.stringify(pid).toLowerCase(); let score=0;
      for(const w of wanted) if(txt.includes(String(w).toLowerCase())) score++;
      if(score>0) scored.push({score,pid});
    }
    scored.sort((a,b)=>b.score-a.score);
    return scored.slice(0,18).map(x=>({source:'OBDex PID',available:true,...x.pid}));
  }catch(e){ console.error('OBDex PID',e); return []; }
}

function slugPart(v=''){
  return String(v).trim().replace(/&/g,'and').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function isHvSignalText(v=''){
  return /(high[- ]?voltage|\bhv\b|traction|hybrid battery|hvbatt|inverter|contactor|precharge|isolation|service disconnect)/i.test(String(v));
}
async function lookupObdbSignals(c, vehicle){
  const make=slugPart(c.car?.split(/\s+/)?.[0] || vehicle?.make || '');
  let model='';
  const car=String(c.car||'').trim();
  if(car && make){ model=slugPart(car.replace(new RegExp('^'+make.replace(/-/g,'[ -]?'),'i'),'').trim()); }
  if(!model) model=slugPart(vehicle?.model||'');
  if(!make || !model) return {source:'OBDb',available:false,note:'Merkki/malli puuttuu'};
  const repo=`${make}-${model}`;
  const urls=[
    `https://raw.githubusercontent.com/OBDb/${encodeURIComponent(repo)}/main/signalsets/v3/default.json`,
    `https://raw.githubusercontent.com/OBDb/${encodeURIComponent(repo)}/master/signalsets/v3/default.json`
  ];
  for(const url of urls){
    try{
      const r=await fetch(url,{headers:{'Accept':'application/json','User-Agent':'AutosahkoapuAI/1.0'}});
      if(!r.ok) continue;
      const data=await r.json();
      const signals=[];
      for(const cmd of data?.commands||[]){
        for(const sig of cmd?.signals||[]){
          const txt=[sig.id,sig.name,sig.description,sig.path].filter(Boolean).join(' ');
          if(isHvSignalText(txt)) continue;
          signals.push({id:sig.id||'',name:sig.name||'',description:sig.description||'',path:sig.path||'',unit:sig?.fmt?.unit||'',min:sig?.fmt?.min,max:sig?.fmt?.max,optimalMin:sig?.fmt?.omin,optimalMax:sig?.fmt?.omax,optimalValue:sig?.fmt?.oval});
          if(signals.length>=80) break;
        }
        if(signals.length>=80) break;
      }
      return {source:'OBDb',available:true,repo,license:'CC-BY-SA-4.0',signals};
    }catch(e){ console.error('OBDb',repo,e); }
  }
  return {source:'OBDb',available:false,repo,note:'Ajoneuvokohtaista OBDb-signal set -dataa ei löytynyt tällä repo-nimellä'};
}

async function lookupWal33d(raw, env){
  const codes=parseDtcCodes(raw);
  if(!codes.length) return [];
  if(!env.OPEN_DTC_DB) return codes.map(code=>({source:'Wal33D',code,available:false,note:'Valinnainen OPEN_DTC_DB-sidonta puuttuu'}));
  const out=[];
  for(const code of codes){
    try{
      const rs=await env.OPEN_DTC_DB.prepare(`SELECT code, description, manufacturer, category FROM wal33d_dtc WHERE code = ? LIMIT 12`).bind(code).all();
      if(rs?.results?.length) out.push(...rs.results.map(x=>({...x,source:'Wal33D',available:true})));
      else out.push({source:'Wal33D',code,available:false,note:'Ei osumaa Wal33D-tietokannassa'});
    }catch(e){ console.error('Wal33D query',e); out.push({source:'Wal33D',code,available:false,note:'Wal33D-haku epäonnistui'}); }
  }
  return out;
}

function sourceSummary(ctx){
  const sources=[];
  if(ctx?.vehicle?.make || ctx?.vehicle?.model) sources.push({name:'VIN',provider:'NHTSA vPIC',ok:true,detail:[ctx.vehicle.modelYear,ctx.vehicle.make,ctx.vehicle.model].filter(Boolean).join(' ')});
  else if(ctx?.vehicle) sources.push({name:'VIN',provider:'NHTSA vPIC',ok:false,detail:ctx.vehicle.error||ctx.vehicle.errorText||'Rajallinen tulos'});
  const found=(ctx?.dtcs||[]).filter(x=>x.available);
  const missing=(ctx?.dtcs||[]).filter(x=>!x.available);
  if(found.length) sources.push({name:'DTC',provider:'Autodiag2',ok:true,detail:[...new Set(found.map(x=>x.code))].join(', ')});
  if(missing.length) sources.push({name:'DTC',provider:'Autodiag2',ok:false,detail:[...new Set(missing.map(x=>x.code))].join(', ')+' ei löytynyt'});
  const obdexFound=(ctx?.obdex||[]).filter(x=>x.available);
  if(obdexFound.length) sources.push({name:'DTC+',provider:'OBDex',ok:true,detail:[...new Set(obdexFound.map(x=>x.code))].join(', ')+' · syyt/oireet'});
  if(ctx?.obdexPids?.length) sources.push({name:'OBD-live data',provider:'OBDex',ok:true,detail:`${ctx.obdexPids.length} relevanttia geneeristä PID-parametria`});
  if(ctx?.obdb?.available) sources.push({name:'Ajoneuvodata',provider:'OBDb',ok:true,detail:`${ctx.obdb.repo} · ${ctx.obdb.signals?.length||0} signaalia`});
  else if(ctx?.obdb) sources.push({name:'Ajoneuvodata',provider:'OBDb',ok:false,detail:ctx.obdb.repo||ctx.obdb.note||'Ei osumaa'});
  const wal=(ctx?.wal33d||[]).filter(x=>x.available);
  if(wal.length) sources.push({name:'Valmistajakohtainen DTC',provider:'Wal33D',ok:true,detail:[...new Set(wal.map(x=>x.code))].join(', ')});
  return sources;
}

function extractText(raw){
  if(raw.output_text) return raw.output_text;
  for(const item of raw.output||[]) for(const c of item.content||[]) if(c.type==='output_text'&&c.text) return c.text;
  return '';
}
function parseReply(text){
  try { const a=text.indexOf('{'), b=text.lastIndexOf('}'); const obj=JSON.parse(text.slice(a,b+1)); return {blocked:obj.blocked===true,test:obj.test||'Seuraava mittaus',tool:obj.tool||'',how:obj.how||'',expected:obj.expected||'',ifNormal:obj.ifNormal||'',ifAbnormal:obj.ifAbnormal||'',reason:obj.reason||'',caution:obj.caution||''}; }
  catch { return {test:'Tarkista AI-vastaus',tool:'',how:text||'Vastausta ei saatu jäsennettyä.',expected:'',ifNormal:'',ifAbnormal:'',reason:'',caution:'Älä tee vaarallista mittausta ilman osaamista.'}; }
}

const SYSTEM_PROMPT = `Olet Autosähköapu AI, kokenutta autodiagnostiikan ajattelua jäljittelevä mittausohjattu avustaja. Tärkein sääntö: älä arvaa vaihdettavaa osaa. Ohjaa yksi perusteltu seuraava mittaus kerrallaan ja odota sen tulosta ennen seuraavaa vaihetta.

Palauta AINA vain yksi JSON-objekti, ei markdownia eikä muuta tekstiä. Kentät: blocked, test, tool, how, expected, ifNormal, ifAbnormal, reason, caution. Normaaleissa diagnooseissa blocked=false.

DATALÄHDEHIERARKIA:
1) Käytä promptissa annettua varmennettua ajoneuvo- ja DTC-lähdedataa faktoina vain siinä laajuudessa kuin se on annettu.
2) NHTSA vPIC tunnistaa ajoneuvoa, mutta se EI ole korjaus- tai mittausarvotietokanta.
3) Autodiag2:n DTC-määritelmä auttaa tulkitsemaan koodia, mutta se EI todista juurisyytä eikä sisällä automaattisesti oikeita pinnejä tai mittausarvoja.
4) OBDex voi antaa geneerisen DTC:n kuvauksen, tavallisia syitä/oireita ja geneerisiä OBD-PID-tietoja. Käsittele syyt hypoteeseina, älä diagnoosina.
5) OBDb voi sisältää ajoneuvokohtaisia OBD-signaaleja, yksiköitä, skaalausta ja joissakin tapauksissa kuvattuja vaihteluvälejä. Käytä vain promptissa annettua dataa. OBDb-data ei ole OEM-korjausohje.
6) Wal33D voi täydentää valmistajakohtaisia DTC-määritelmiä, mutta sekään ei todista juurisyytä.
7) Mallin oma yleinen autotekninen tieto on vain päättelyn tuki. Älä esitä muistista tulevaa ajoneuvokohtaista yksityiskohtaa varmennettuna faktana.
8) Jos tarkkaa pinniä, johdinväriä, momenttia, painetta, vastusarvoa, jännitettä, aaltomuotoa tai muuta mallikohtaista vertailuarvoa EI OLE lähdedatassa, älä keksi sitä. Kirjoita expected-kenttään, että tarkka OEM-arvo on varmistettava ajoneuvokohtaisesta teknisestä lähteestä, ja tee silti turvallinen testi sellaisella tavalla, joka ei vaadi keksittyä tarkkuutta.

Säännöt:
- Käytä vain käyttäjän ilmoittamia työkaluja, ellei seuraava testi aidosti vaadi muuta työkalua; silloin kerro se caution-kentässä.
- KORKEAJÄNNITE (HV) ON RAJATTU KOKONAAN TÄMÄN VERKKOPALVELUN ULKOPUOLELLE KAIKILLA KÄYTTÄJÄTASOILLA. Jos käyttäjän viesti, auton tiedot, vikakoodi, kuva tai muu liite koskee ajoakkua, HV-akkua, korkeajännitejärjestelmää, invertteriä, HV-kontaktoreita, esilatausta, huoltoerotinta, oransseja HV-kaapeleita, eristysvikaa tai muuta HV-komponenttia/työtä, älä anna mittaus-, purku-, korjaus-, jännitteettömäksi teko- tai testausohjetta. Palauta blocked=true, test="Korkeajännitejärjestelmä", how="Autosähköapu AI ei anna korkeajännitejärjestelmän mittaus-, korjaus- tai purkuohjeita. Ota tässä asiassa suoraan yhteyttä minuun: autosahkoapu@gmail.com", caution="Älä koske korkeajännitejärjestelmään tai HV-komponentteihin tämän verkkopalvelun ohjeiden perusteella." Muut kentät voivat olla tyhjiä.
- Kuluttaja-tilassa vain matalan riskin tarkistuksia: OBD-data, silmämääräinen tarkistus ja helposti saavutettavat 12 V perusmittaukset. Ei airbag/SRS-piirien mittauksia, polttoainejärjestelmän avaamista eikä auton alle menemistä ilman asianmukaista nostoa.
- Harrastaja-tilassa voit käyttää yleismittaria ja muita ilmoitettuja työkaluja, mutta varoita riskikohteista.
- Mekaanikko-tilassa voit ohjata muita ammattimittauksia, mutta HV-neuvontaa ei anneta tässä verkkopalvelussa.
- Priorisoi mittaukset, jotka jakavat vikapuun tehokkaasti kahtia ja vähentävät turhaa osien vaihtoa.
- Perustele lyhyesti miksi juuri tämä mittaus tehdään.
- Älä väitä diagnoosia varmaksi ilman sitä tukevaa mittaustulosta.`;

function buildPrompt(c,h,userMessage,ctx,attachments=[]){
  const past=h.map((x,i)=>{
    if(x?.role==='user') return `Käyttäjä: ${String(x.text||'').slice(0,1800)}`;
    if(x?.role==='assistant') return `AI: ${JSON.stringify(x.reply||{}).slice(0,2500)}`;
    return `Vaihe ${i+1}: ${JSON.stringify(x).slice(0,2200)}`;
  }).join('\n');
  const vehicle = ctx?.vehicle ? JSON.stringify(ctx.vehicle) : 'VIN-lähdedataa ei ole.';
  const dtcs = ctx?.dtcs?.length ? JSON.stringify(ctx.dtcs) : 'Autodiag2-lähdedataa ei ole tälle pyynnölle.';
  const obdex = ctx?.obdex?.length ? JSON.stringify(ctx.obdex) : 'OBDex-lähdedataa ei ole tälle pyynnölle.';
  const obdexPids = ctx?.obdexPids?.length ? JSON.stringify(ctx.obdexPids) : 'OBDex PID -dataa ei löytynyt tälle tapaukselle.';
  const obdb = ctx?.obdb?.available ? JSON.stringify(ctx.obdb) : 'OBDb-ajoneuvosignaaleja ei löytynyt.';
  const wal33d = ctx?.wal33d?.length ? JSON.stringify(ctx.wal33d) : 'Wal33D-lähdedataa ei ole käytössä.';
  const textFiles=attachments.filter(a=>a.kind==='text').map(a=>`TIEDOSTO ${a.name}:\n${a.text}`).join('\n\n').slice(0,120000);
  const imageNames=attachments.filter(a=>a.kind==='image').map(a=>a.name).join(', ');
  return `Käyttäjätaso: ${c.mode||'consumer'}
Auto käyttäjän mukaan: ${c.car||'-'}
VIN: ${cleanVin(c.vin)||'-'}
Vuosimalli: ${c.year||'-'}
Moottori/käyttövoima: ${c.engine||'-'}
Vikakoodit auton tiedoissa: ${c.dtc||'-'}
Työkalut: ${(c.tools||[]).join(', ')||'ei ilmoitettu'}

VARMENNETTU ULKOINEN DATA:
VIN / NHTSA vPIC: ${vehicle}
DTC / Autodiag2: ${dtcs}
DTC / OBDex (CC0): ${obdex}
Geneeriset OBD-PIDit / OBDex (CC0): ${obdexPids}
Ajoneuvokohtaiset signaalit / OBDb (CC-BY-SA-4.0): ${obdb}
Valmistajakohtaiset DTC:t / Wal33D (MIT, jos OPEN_DTC_DB on kytketty): ${wal33d}

AIEMPI KESKUSTELU:
${past||'Ei aiempaa keskustelua.'}

KÄYTTÄJÄN UUSIN VIESTI:
${userMessage||'(ei tekstiä, tarkista liitteet)'}

LIITTEET:
Kuvat: ${imageNames||'ei kuvia'}
${textFiles||'Ei tekstimuotoista dataa.'}

Jos kuvassa tai datatiedostossa on mittaustulos, käytä sitä vain siltä osin kuin pystyt lukemaan sen luotettavasti. Älä keksi puuttuvia arvoja. Anna yksi seuraava järkevä mittaus JSON-muodossa.`;
}

async function createCode(request, env, headers){
  const auth=request.headers.get('Authorization')||''; if(!env.ADMIN_SECRET || auth!==`Bearer ${env.ADMIN_SECRET}`) return json({error:'Ei oikeutta.'},401,headers);
  const {plan='single', note=''}=await request.json(); const p=PLAN[plan]; if(!p) return json({error:'Tuntematon paketti.'},400,headers);
  const code=`ASAI-${randomPart()}-${randomPart()}`; const now=Date.now(); const rec={label:p.label,plan,credits:p.credits,createdAt:now,expiresAt:now+p.expiresDays*86400000,note:String(note).slice(0,200),used:0,disabled:false};
  await env.ACCESS_CODES.put(`code:${code}`,JSON.stringify(rec)); return json({code,...rec,remainingText:remainingText(rec)},200,headers);
}
function randomPart(){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';const bytes=crypto.getRandomValues(new Uint8Array(4));for(const b of bytes)s+=a[b%a.length];return s;}
