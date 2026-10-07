const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('Cloudflare-woker/worker.js', 'utf8')
  .replace('export default {', 'const worker = {')
  .replace('export class AccessGate', 'class AccessGate');
let payload, fail = false, writes = 0;
const logs = [];
const secret = 'PRIVATE-VIN-CODE-CHAT';
const scope = vm.createContext({ Request, Response, URL, crypto,
  console: { error: (...args) => logs.push(args) },
  fetch: async (url, options) => {
    payload = JSON.parse(options.body);
    return fail
      ? Response.json({ error: { message: secret } }, { status: 429 })
      : Response.json({ status: 'completed', output_text: JSON.stringify({ how: 'Onko testeri?', blocked: false }) });
  }
});
vm.runInContext(source + '\ngetTechnicalContext = async () => ({}); globalThis.run = diagnose;', scope);
const env = { OPENAI_API_KEY: 'mock-key', ACCESS_CODES: {
  get: async () => ({ credits: 2 }), put: async () => { writes++; }
}};
const request = () => new Request('https://test/diagnose', { method: 'POST', body: JSON.stringify({
  code: secret, caseData: {}, history: [{ role: 'user', text: 'Aiempi havainto' }], userMessage: secret
}) });
(async () => {
  assert.equal((await scope.run(request(), env, {})).status, 200);
  assert.equal(payload.store, false);
  assert.ok(JSON.stringify(payload.input).includes('Aiempi havainto'));
  assert.equal(writes, 1);
  fail = true;
  assert.equal((await scope.run(request(), env, {})).status, 500);
  assert.equal(writes, 1);
  assert.ok(JSON.stringify(logs).includes('openai_http_error'));
  assert.ok(!JSON.stringify(logs).includes(secret));
  // Every explicit log is a fixed label, optionally a numeric HTTP status.
  const calls = [...source.matchAll(/console\.error\(([\s\S]*?)\);/g)];
  for (const call of calls) assert.match(call[1], /^'[a-z_]+'(?:, response\.status)?$/);
  assert.ok(!fs.readFileSync('index.html', 'utf8').includes('googletagmanager'));
  console.log('PASS: store=false, history, credit behavior, sensitive upstream error redaction, all explicit log sites and Analytics removal. Mock API only.');
})().catch(e => { console.error(e); process.exitCode = 1; });
