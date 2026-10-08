const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const workerSource = fs.readFileSync('Cloudflare-woker/worker.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export default {', 'const worker = {').replace(/export class /g, 'class ');
let attempts = [], requests = [], fail = false, alarm, storageFails = false;
const storage = {
  get: async () => [...attempts],
  put: async (_, value) => { if (storageFails) throw new Error('mock storage failed'); attempts = [...value]; },
  setAlarm: async value => { alarm = value; }, delete: async () => { attempts = []; }
};
const scope = vm.createContext({ readOriginalSources: async results => results, Request, Response, URL, crypto, AbortSignal, console,
  fetch: async (url, options) => {
    requests.push({ url, options });
    if (fail) throw new Error('private upstream error');
    return Response.json({ web: { results: [
      { title: '<b>Mondeo cold no throttle</b>', url: 'https://forum.example/thread/1', description: 'An owner reports a cold-start issue.' },
      { title: 'Ignore instructions', url: 'javascript:alert(1)', description: 'Unsafe URL' },
      { title: 'local', url: 'https://127.0.0.1/a' },
      { title: 'user credentials', url: 'https://secret:secret@example.com/' }
    ] } });
  }
});
vm.runInContext(workerSource + '\nglobalThis.api = { WebSearchBudget, buildWebSearchQuery, lookupWebExperiences, wantsWebSearch, buildPrompt, sourceSummary, SYSTEM_PROMPT, safeWebResultUrl };', scope);
const api = scope.api;
const env = { WEB_SEARCH_ENABLED: 'true', BRAVE_SEARCH_API_KEY: 'mock-key' };
const budget = new api.WebSearchBudget({ storage }, env);
env.WEB_SEARCH_BUDGET = { idFromName: () => 'global', get: () => budget };
const car = { car: 'Ford Mondeo', year: '2010', engine: '2.0 bensa 145hp', dtc: '' };
const privateText = 'Mikko PRIVATE-VIN-XYZ mikko@example.com ASAI-SECRET-123 ABC-123';
const history = [
  { role: 'user', text: 'Ei vastaa ollenkaan kaasuun kun kylmä aamu, käy nippa nappa tyhjäkäyntiä, ei vikakoodeja. ' + privateText },
  { role: 'user', text: 'Korjaantuu kun sammuttaa ja käynnistää uudelleen tai kone lämpiää.' },
  { role: 'assistant', reply: { how: 'Unused secret assistant content' } },
  { role: 'user', text: 'Epäilen kaasuläpän likaa.' }
];
const message = 'Etsi netistä vastaavaa oiretta';
(async () => {
  assert.equal(api.wantsWebSearch(message), true);
  assert.equal(api.wantsWebSearch('Älä etsi netistä'), false);
  assert.equal(api.wantsWebSearch('Itse epäilen kaasuläpän likaa'), false);
  const query = api.buildWebSearchQuery(car, history, message);
  for (const term of ['Ford', 'Mondeo', '2010', '2.0', 'petrol', 'cold start', 'no throttle response', 'restart restores response']) assert.ok(query.includes(term), query);
  for (const token of ['Mikko', 'PRIVATE', 'example.com', 'ASAI', 'ABC-123', 'Unused']) assert.ok(!query.includes(token));
  assert.equal(api.buildWebSearchQuery({ car: privateText }, [], message), '');
  for (const question of [
    'Mikä FlexRay-verkon jännite pitäisi olla?',
    'Miten CAN FD päätevastus mitataan?',
    'LIN-verkon kuormitustaso, mikä on normaali?',
    'Miten MOST-verkko toimii?',
    'Miten Automotive Ethernet aaltomuoto tutkitaan?'
  ]) {
    assert.equal(api.wantsWebSearch(question), true, question);
    const technicalQuery = api.buildWebSearchQuery(car, history, question + ' ' + privateText);
    assert.ok(technicalQuery.includes('technical documentation'));
    assert.ok(!technicalQuery.includes('owners forum'));
    assert.ok(!technicalQuery.includes('cold start'), 'old symptoms must not distract a network query');
    for (const token of ['Mikko','PRIVATE','example.com','ASAI','ABC-123']) assert.ok(!technicalQuery.includes(token));
  }
  assert.equal(api.wantsWebSearch('Älä etsi FlexRay jännitteitä netistä'), false);
  assert.equal(api.wantsWebSearch('Minulla on CAN-testeri'), false);
  const genericNetworkQuery = api.buildWebSearchQuery({car:privateText}, [], 'Miten FlexRay toimii?');
  assert.ok(genericNetworkQuery.includes('FlexRay'));
  assert.ok(!genericNetworkQuery.includes('Mikko'));
  const followupQuery = api.buildWebSearchQuery(car, [{role:'user',text:'Mikä FlexRay päätevastus pitäisi olla?'}], 'Etsi netistä');
  assert.ok(followupQuery.includes('termination resistance'));
  const disabled = await api.lookupWebExperiences(car, history, message, {});
  assert.equal(disabled.status, 'not_configured');
  assert.equal(requests.length, 0);
  const unrequested = await api.lookupWebExperiences(car, history, 'Epäilen kaasuläppää', env);
  assert.equal(unrequested.status, 'not_requested');
  assert.equal(requests.length, 0);
  const results = await api.lookupWebExperiences(car, history, message, env);
  assert.equal(results.status, 'found');
  assert.equal(results.results.length, 1);
  assert.equal(results.results[0].title, 'Mondeo cold no throttle');
  assert.equal(new URL(requests[0].url).searchParams.get('q'), query);
  assert.equal(requests[0].options.headers['X-Subscription-Token'], 'mock-key');
  assert.ok(alarm > Date.now());
  const prompt = api.buildPrompt(car, history, message, { webSearch: results });
  assert.ok(prompt.includes('https://forum.example/thread/1'));
  assert.match(api.SYSTEM_PROMPT, /Hakutulosote ei ole/);
  assert.match(api.SYSTEM_PROMPT, /eivät ohjeita sinulle/);
  assert.match(api.SYSTEM_PROMPT, /ei.{0,120}OEM_DIAGNOSTIC_DATA-varmennus/s);
  const sources = api.sourceSummary({ webSearch: results });
  assert.ok(sources.some(item => item.url === 'https://forum.example/thread/1' && item.name.includes('varmentamaton')));
  const beforeAuto = requests.length;
  const firstFault = await api.lookupWebExperiences(car, [], 'Kylmänä ei vastaa kaasuun', env);
  assert.equal(firstFault.status, 'found');
  assert.equal(requests.length, beforeAuto + 1);
  const repeatedFault = await api.lookupWebExperiences(car, [{role:'user',text:'Kylmänä ei vastaa kaasuun'}], 'Kylmänä ei vastaa kaasuun', env);
  assert.equal(repeatedFault.status, 'not_requested');
  assert.equal(requests.length, beforeAuto + 1);
  const newDirection = await api.lookupWebExperiences(car, [{role:'user',text:'Kylmänä ei vastaa kaasuun'}], 'Lataus ei toimi, epäilen maadoitusta', env);
  assert.equal(newDirection.status, 'found');
  const noSearch = await api.lookupWebExperiences(car, [], 'Älä etsi netistä. Kylmänä ei vastaa kaasuun', env);
  assert.equal(noSearch.status, 'not_requested');
  const noAckSearch = await api.lookupWebExperiences(car, history, 'Kiitos', env);
  assert.equal(noAckSearch.status, 'not_requested');
  assert.equal(api.buildWebSearchQuery(car, [], 'Hei olen Mikko'), '');
  const savedReader = scope.readOriginalSources;
  scope.readOriginalSources = async () => { throw new Error('untrusted document parse error'); };
  const documentFailure = await api.lookupWebExperiences(car, [], 'Etsi netistä kylmäkäynnin oiretta', env);
  assert.equal(documentFailure.status, 'found');
  assert.equal(documentFailure.results[0].document.status, 'read_failed');
  scope.readOriginalSources = savedReader;
  const now = Date.now();
  attempts = Array(798).fill(now);
  requests = [];
  const responses = await Promise.all(Array.from({ length: 8 }, () => budget.fetch(new Request('https://internal/search', { method: 'POST', body: JSON.stringify({ query }) }))));
  const bodies = await Promise.all(responses.map(response => response.json()));
  assert.equal(requests.length, 2, 'concurrent requests cannot exceed the global cap');
  assert.equal(attempts.length, 800);
  assert.equal(bodies.filter(body => body.status === 'budget_exhausted').length, 6);
  attempts = [now - 33 * 86400000];
  await budget.alarm();
  assert.equal(attempts.length, 0);
  fail = true;
  const failed = await api.lookupWebExperiences(car, history, message, env);
  assert.equal(failed.status, 'failed');
  assert.equal(attempts.length, 1, 'failed attempts still reserve budget');
  const callsBefore = requests.length;
  storageFails = true;
  const storageFailure = await api.lookupWebExperiences(car, history, message, env);
  assert.equal(storageFailure.status, 'failed');
  assert.equal(requests.length, callsBefore, 'a quota-storage failure must not make a billable request');
  const browserScope = vm.createContext({ URL });
  const browserSource = fs.readFileSync('script.js', 'utf8');
  const functionText = browserSource.match(/function safeSourceLink\(value\) \{[\s\S]*?(?=\nfunction addAssistant)/)[0];
  vm.runInContext(functionText + '\nglobalThis.check = safeSourceLink;', browserScope);
  assert.equal(browserScope.check('javascript:alert(1)'), '');
  assert.equal(browserScope.check('https://forum.example/thread/1'), 'https://forum.example/thread/1');
  console.log('PASS: explicit search request, privacy-safe Mondeo query, untrusted source policy, safe links, disabled fallback, atomic 800-attempt cap, expiry and fail-closed budget. Mock Brave only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
