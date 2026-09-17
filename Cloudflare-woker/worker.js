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
    const caseData=body.caseData||{}; const history=Array.isArray(body.history)?body.history.slice(-12):[]; const measurementResult=String(body.measurementResult||'').slice(0,3000);
    const technicalContext = await getTechnicalContext(caseData, env);
    const prompt=buildPrompt(caseData,history,measurementResult,technicalContext);
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-5.6-luna',reasoning:{effort:'low'},max_output_tokens:900,input:[{role:'system',content:[{type:'input_text',text:SYSTEM_PROMPT}]},{role:'user',content:[{type:'input_text',text:prompt}]}]})});
    const raw=await response.json(); if(!response.ok) { console.error('OpenAI error',raw); throw new Error('AI-palvelu ei vastannut.'); }
    const text=extractText(raw); const reply=parseReply(text);
    rec.credits=Math.max(0,(rec.credits||0)-1); rec.used=(rec.used||0)+1; rec.lastUsedAt=Date.now(); await env.ACCESS_CODES.put(`code:${code}`,JSON.stringify(rec));
    const nextHistory=[...history,{measurementResult,reply}].slice(-12);
    return json({reply,history:nextHistory,access:{credits:rec.credits,remainingText:remainingText(rec)},sources:sourceSummary(technicalContext)},200,headers);
  } catch(e) { if(e instanceof UserError) return json({error:e.message},402,headers); console.error(e); return json({error:'AI-diagnoosi epäonnistui. Yritä uudelleen.'},500,headers); }
}

async function getTechnicalContext(c, env){
  const [vehicle, dtcs] = await Promise.all([
    decodeVin(c.vin, c.year),
    lookupDtcs(c.dtc, env)
  ]);
  return { vehicle, dtcs };
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

function sourceSummary(ctx){
  const sources=[];
  if(ctx?.vehicle?.make || ctx?.vehicle?.model) sources.push({name:'VIN',provider:'NHTSA vPIC',ok:true,detail:[ctx.vehicle.modelYear,ctx.vehicle.make,ctx.vehicle.model].filter(Boolean).join(' ')});
  else if(ctx?.vehicle) sources.push({name:'VIN',provider:'NHTSA vPIC',ok:false,detail:ctx.vehicle.error||ctx.vehicle.errorText||'Rajallinen tulos'});
  const found=(ctx?.dtcs||[]).filter(x=>x.available);
  const missing=(ctx?.dtcs||[]).filter(x=>!x.available);
  if(found.length) sources.push({name:'DTC',provider:'Autodiag2',ok:true,detail:[...new Set(found.map(x=>x.code))].join(', ')});
  if(missing.length) sources.push({name:'DTC',provider:'Autodiag2',ok:false,detail:[...new Set(missing.map(x=>x.code))].join(', ')+' ei löytynyt'});
  return sources;
}

function extractText(raw){
  if(raw.output_text) return raw.output_text;
  for(const item of raw.output||[]) for(const c of item.content||[]) if(c.type==='output_text'&&c.text) return c.text;
  return '';
}
function parseReply(text){
  try { const a=text.indexOf('{'), b=text.lastIndexOf('}'); const obj=JSON.parse(text.slice(a,b+1)); return {test:obj.test||'Seuraava mittaus',tool:obj.tool||'',how:obj.how||'',expected:obj.expected||'',ifNormal:obj.ifNormal||'',ifAbnormal:obj.ifAbnormal||'',reason:obj.reason||'',caution:obj.caution||''}; }
  catch { return {test:'Tarkista AI-vastaus',tool:'',how:text||'Vastausta ei saatu jäsennettyä.',expected:'',ifNormal:'',ifAbnormal:'',reason:'',caution:'Älä tee vaarallista mittausta ilman osaamista.'}; }
}

const SYSTEM_PROMPT = `Olet Autosähköapu AI, kokenutta autodiagnostiikan ajattelua jäljittelevä mittausohjattu avustaja. Tärkein sääntö: älä arvaa vaihdettavaa osaa. Ohjaa yksi perusteltu seuraava mittaus kerrallaan ja odota sen tulosta ennen seuraavaa vaihetta.

Palauta AINA vain yksi JSON-objekti, ei markdownia eikä muuta tekstiä. Kentät: test, tool, how, expected, ifNormal, ifAbnormal, reason, caution.

DATALÄHDEHIERARKIA:
1) Käytä promptissa annettua varmennettua ajoneuvo- ja DTC-lähdedataa faktoina vain siinä laajuudessa kuin se on annettu.
2) NHTSA vPIC tunnistaa ajoneuvoa, mutta se EI ole korjaus- tai mittausarvotietokanta.
3) Autodiag2:n DTC-määritelmä auttaa tulkitsemaan koodia, mutta se EI todista juurisyytä eikä sisällä automaattisesti oikeita pinnejä tai mittausarvoja.
4) Mallin oma yleinen autotekninen tieto on vain päättelyn tuki. Älä esitä muistista tulevaa ajoneuvokohtaista yksityiskohtaa varmennettuna faktana.
5) Jos tarkkaa pinniä, johdinväriä, momenttia, painetta, vastusarvoa, jännitettä, aaltomuotoa tai muuta mallikohtaista vertailuarvoa EI OLE lähdedatassa, älä keksi sitä. Kirjoita expected-kenttään, että tarkka OEM-arvo on varmistettava ajoneuvokohtaisesta teknisestä lähteestä, ja tee silti turvallinen testi sellaisella tavalla, joka ei vaadi keksittyä tarkkuutta.

Säännöt:
- Käytä vain käyttäjän ilmoittamia työkaluja, ellei seuraava testi aidosti vaadi muuta työkalua; silloin kerro se caution-kentässä.
- Kuluttaja-tilassa vain matalan riskin tarkistuksia: OBD-data, silmämääräinen tarkistus, helposti saavutettavat 12 V perusmittaukset. Ei airbag/SRS-piirien mittauksia, polttoainejärjestelmän avaamista, auton alle menemistä ilman asianmukaista nostoa eikä HV-järjestelmään koskemista.
- Harrastaja-tilassa voit käyttää yleismittaria ja muita ilmoitettuja työkaluja, mutta varoita riskikohteista.
- Mekaanikko-tilassa voit ohjata ammattimittauksia, mutta korkeajännite-, SRS- ja muut turvallisuuskriittiset työt edellyttävät asianmukaista pätevyyttä ja valmistajan menettelyä.
- Priorisoi mittaukset, jotka jakavat vikapuun tehokkaasti kahtia ja vähentävät turhaa osien vaihtoa.
- Perustele lyhyesti miksi juuri tämä mittaus tehdään.
- Älä väitä diagnoosia varmaksi ilman sitä tukevaa mittaustulosta.`;

function buildPrompt(c,h,measurement,ctx){
  const past=h.map((x,i)=>`Vaihe ${i+1}: mittaustulos=${x.measurementResult||'(aloitus)'}; AI=${JSON.stringify(x.reply)}`).join('\n');
  const vehicle = ctx?.vehicle ? JSON.stringify(ctx.vehicle) : 'VIN-lähdedataa ei ole.';
  const dtcs = ctx?.dtcs?.length ? JSON.stringify(ctx.dtcs) : 'Autodiag2-lähdedataa ei ole tälle pyynnölle.';
  return `Käyttäjätaso: ${c.mode||'consumer'}\nAuto käyttäjän mukaan: ${c.car||'-'}\nVIN: ${cleanVin(c.vin)||'-'}\nVuosimalli: ${c.year||'-'}\nMoottori/käyttövoima: ${c.engine||'-'}\nVikakoodit: ${c.dtc||'-'}\nOire: ${c.symptom||'-'}\nJo tehdyt mittaukset/korjaukset: ${c.done||'-'}\nTyökalut: ${(c.tools||[]).join(', ')||'ei ilmoitettu'}\n\nVARMENNETTU ULKOINEN DATA:\nVIN / NHTSA vPIC: ${vehicle}\nDTC / Autodiag2: ${dtcs}\n\nAiemmat vaiheet:\n${past||'Ei aiempia AI-vaiheita.'}\n\nUusin mittaustulos: ${measurement||'Ei vielä mittaustulosta. Valitse ensimmäinen paras mittaus.'}\n\nAnna vain seuraava järkevä mittaus JSON-muodossa.`;
}

async function createCode(request, env, headers){
  const auth=request.headers.get('Authorization')||''; if(!env.ADMIN_SECRET || auth!==`Bearer ${env.ADMIN_SECRET}`) return json({error:'Ei oikeutta.'},401,headers);
  const {plan='single', note=''}=await request.json(); const p=PLAN[plan]; if(!p) return json({error:'Tuntematon paketti.'},400,headers);
  const code=`ASAI-${randomPart()}-${randomPart()}`; const now=Date.now(); const rec={label:p.label,plan,credits:p.credits,createdAt:now,expiresAt:now+p.expiresDays*86400000,note:String(note).slice(0,200),used:0,disabled:false};
  await env.ACCESS_CODES.put(`code:${code}`,JSON.stringify(rec)); return json({code,...rec,remainingText:remainingText(rec)},200,headers);
}
function randomPart(){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';const bytes=crypto.getRandomValues(new Uint8Array(4));for(const b of bytes)s+=a[b%a.length];return s;}
