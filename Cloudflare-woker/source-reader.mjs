import { getDocumentProxy } from 'unpdf';

// Download only known public publishers. Search URLs are untrusted input.
const publishers = [
  ['nxp.com','technical_publisher'], ['ti.com','technical_publisher'],
  ['bosch.com','technical_publisher'], ['bosch-mobility.com','technical_publisher'],
  ['hella.com','technical_publisher'], ['ngkntk.com','technical_publisher'],
  ['denso-am.eu','technical_publisher'], ['delphiautoparts.com','technical_publisher'],
  ['continental-automotive.com','technical_publisher'], ['bmwgroup.com','technical_publisher'],
  ['bmw.com','technical_publisher'], ['audi.com','technical_publisher'],
  ['audi-mediacenter.com','technical_publisher'], ['volkswagen-newsroom.com','technical_publisher'],
  ['fordservicecontent.com','technical_publisher'], ['motorcraftservice.com','technical_publisher'],
  ['mercedes-benz.com','technical_publisher'], ['toyota-tech.eu','technical_publisher'],
  ['talkford.com','community'], ['ross-tech.com','technical_publisher']
];
const MAX_BYTES = 512 * 1024;
const MAX_PAGES = 8;
const agent = 'AutosahkoapuSourceReader';

export function sourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.search || url.href.length > 2048) return null;
    const publisher = publishers.find(([host]) => url.hostname === host || url.hostname.endsWith('.' + host));
    if (!publisher) return null;
    url.hash = '';
    return { url: url.href, kind: publisher[1] };
  } catch { return null; }
}

async function cancel(response) { try { await response.body?.cancel(); } catch {} }
async function bytesUnderLimit(response, limit = MAX_BYTES) {
  if (Number(response.headers.get('content-length')) > limit) { await cancel(response); throw new Error('too_large'); }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return data;
}

export function robotsAllowed(text, pathname) {
  const groups = []; let group = { agents: [], rules: [] }; let hasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim(); const colon = line.indexOf(':'); if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase(), value = line.slice(colon + 1).trim();
    if (field === 'user-agent') {
      if (hasRules) { groups.push(group); group = { agents: [], rules: [] }; hasRules = false; }
      group.agents.push(value.toLowerCase());
    } else if (field === 'allow' || field === 'disallow') { group.rules.push({ field, value }); hasRules = true; }
  }
  groups.push(group);
  const specific = groups.filter(g => g.agents.includes(agent.toLowerCase()));
  const applicable = specific.length ? specific : groups.filter(g => g.agents.includes('*'));
  let winner = null;
  for (const rule of applicable.flatMap(g => g.rules)) {
    if (!rule.value) continue;
    const pattern = '^' + rule.value.split('*').map(part => part.replace(/[.+?^{}()|[\]\\]/g, '\\$&')).join('.*');
    if (!new RegExp(pattern).test(pathname)) continue;
    const length = rule.value.replace(/[*$]/g, '').length;
    if (!winner || length > winner.length || (length === winner.length && rule.field === 'allow')) winner = { length, field: rule.field };
  }
  return !winner || winner.field === 'allow';
}

async function checkRobots(url, signal, checked) {
  const target = new URL(url);
  if (!checked.has(target.origin)) {
    const response = await fetch(target.origin + '/robots.txt', { redirect: 'manual', signal, headers: { 'User-Agent': agent, Accept: 'text/plain' } });
    if (response.status === 404 || response.status === 410) { await cancel(response); checked.set(target.origin, ''); }
    else {
      if (!response.ok || !/text\/plain/i.test(response.headers.get('content-type') || '')) { await cancel(response); throw new Error('robots_unavailable'); }
      checked.set(target.origin, new TextDecoder().decode(await bytesUnderLimit(response, 32768)));
    }
  }
  if (!robotsAllowed(checked.get(target.origin), target.pathname)) throw new Error('robots_blocked');
}

function decodeEntities(text) {
  const names = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (full, value) => {
    if (value[0] !== '#') return names[value.toLowerCase()] || full;
    const number = value[1].toLowerCase() === 'x' ? parseInt(value.slice(2),16) : parseInt(value.slice(1),10);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
  });
}
function plain(text) { return decodeEntities(text.replace(/<[^>]*>/g,' ')).replace(/[\x00-\x08\x0b-\x1f\x7f]/g,' ').replace(/[ \t]+/g,' ').trim(); }
function score(text, query) {
  const terms = [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(s => s.length > 2 && !['technical','documentation','owners','experiences','measurement','training','diagnosis','service'].includes(s)))];
  return terms.reduce((sum, term) => sum + (text.toLowerCase().includes(term) ? 1 : 0), 0);
}
function selectExcerpts(blocks, query) {
  return blocks.map((block, index) => ({ ...block, index, score: score(block.text, query) }))
    .filter(block => block.text.length >= 60 && block.score > 0)
    .sort((a,b) => b.score - a.score || a.index - b.index).slice(0,3)
    .map(({ locator, text }) => ({ locator, text: text.slice(0,1400), truncated: text.length > 1400 }));
}
export function extractHtml(html, query) {
  const title = plain(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').slice(0,160);
  if (/captcha|access denied|verify you are human|just a moment|sign in to continue/i.test(title)) return { status: 'access_blocked' };
  if (/<meta\b[^>]*\bcontent\s*=\s*["'][^"']*(?:noai|noarchive|nosnippet)/i.test(html)) return { status: 'publisher_restricted' };
  const cleaned = html.replace(/<(script|style|nav|footer|header|form|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
  const blocks=[]; let heading=title || 'Sivun teksti';
  for (const match of cleaned.matchAll(/<(h[1-6]|p|li|table|pre)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text=plain(match[2].replace(/<\/(?:tr|p|li)>/gi,'\n').replace(/<\/(?:td|th)>/gi,' | '));
    if (/^h/.test(match[1])) { heading=text.slice(0,160); continue; }
    if (text) blocks.push({locator:heading, text});
  }
  if (!blocks.length) blocks.push({locator:heading,text:plain(cleaned)});
  const excerpts=selectExcerpts(blocks,query);
  return { status: excerpts.length ? 'read' : 'no_relevant_text', format:'html', title, excerpts, coverage:'Valitut tekstiotteet; sivun koko sisältöä, kuvia tai kaavioita ei ole varmennettu.' };
}
export async function extractPdf(data, query, deadline = Date.now()+8000) {
  let pdf;
  try {
    pdf=await getDocumentProxy(data,{isEvalSupported:false,useSystemFonts:false,useWasm:false,disableFontFace:true,verbosity:0});
    const blocks=[]; let scanned=0;
    for (let pageNumber=1;pageNumber<=Math.min(pdf.numPages,MAX_PAGES);pageNumber++) {
      if (Date.now()>deadline) break;
      const page=await pdf.getPage(pageNumber);const content=await page.getTextContent();
      const text=content.items.filter(item=>typeof item.str==='string').map(item=>item.str + (item.hasEOL?'\n':' ')).join('').replace(/[\x00-\x08\x0b-\x1f\x7f]/g,' ');
      blocks.push({locator:'PDF-sivu '+pageNumber,text}); scanned++;page.cleanup();
    }
    const excerpts=selectExcerpts(blocks,query);
    return {status:excerpts.length?'read':'no_relevant_text',format:'pdf',pagesTotal:pdf.numPages,pagesScanned:scanned,excerpts,coverage:'Tekstipoiminta ensimmäisiltä '+scanned+' sivulta / '+pdf.numPages+'. Kuvat, kytkentäkaaviot ja taulukoiden sarakekohdistus eivät ole varmennettuja.'};
  } catch { return {status:'pdf_unreadable'}; }
  finally { try { if(pdf)await pdf.loadingTask.destroy(); } catch {} }
}

export async function readOriginalSource(item, query, checked = new Map()) {
  const target=sourceUrl(item.url); if(!target)return {status:'host_not_enabled'};
  let url=target.url;const signal=AbortSignal.timeout(8000);const deadline=Date.now()+8000;
  try {
    for(let step=0;step<=2;step++) {
      await checkRobots(url,signal,checked);
      const response=await fetch(url,{redirect:'manual',signal,headers:{'User-Agent':agent,Accept:'text/html, application/pdf, text/plain'}});
      if([301,302,303,307,308].includes(response.status)) {
        const next=sourceUrl(new URL(response.headers.get('location')||'',url).href);await cancel(response);
        if(!next||step===2)return {status:'redirect_blocked'};url=next.url;continue;
      }
      if(!response.ok){await cancel(response);return {status:'access_blocked'};}
      if(/noai|noarchive|nosnippet/i.test(response.headers.get('x-robots-tag')||'')){await cancel(response);return {status:'publisher_restricted'};}
      const type=(response.headers.get('content-type')||'').toLowerCase();
      if(!/text\/html|text\/plain|application\/pdf/.test(type)){await cancel(response);return {status:'unsupported_format'};}
      const data=await bytesUnderLimit(response);let extracted;
      if(type.includes('application/pdf'))extracted=await extractPdf(data,query,deadline);
      else if(type.includes('text/html'))extracted=extractHtml(new TextDecoder().decode(data),query);
      else {const excerpts=selectExcerpts([{locator:'Tekstitiedosto',text:new TextDecoder().decode(data)}],query);extracted={status:excerpts.length?'read':'no_relevant_text',format:'text',excerpts,coverage:'Rajattu tekstiote.'};}
      return {...extracted,url,kind:sourceUrl(url).kind,checkedAt:new Date().toISOString(),applicability:'not_verified'};
    }
    return {status:'redirect_blocked'};
  }catch(error){return {status:['too_large','robots_blocked','robots_unavailable'].includes(error.message)?error.message:'read_failed'};}
}

export async function readOriginalSources(results, query) {
  const selected=results.map((item,index)=>({item,index,target:sourceUrl(item.url)})).filter(x=>x.target)
    .sort((a,b)=>(a.target.kind==='technical_publisher'?0:1)-(b.target.kind==='technical_publisher'?0:1)||a.index-b.index).slice(0,2);
  const enriched=results.map(item=>({...item,document:{status:sourceUrl(item.url)?'not_selected':'host_not_enabled'}}));
  const checked=new Map();
  // Sequential reads bound memory and isolate PDF extraction inside the Durable Object.
  for(const entry of selected){enriched[entry.index].document=await readOriginalSource(entry.item,query,checked);}
  return enriched;
}
