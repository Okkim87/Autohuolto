const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('Cloudflare-woker/cancellation-worker.js', 'utf8')
  .replace('export default {', 'const worker = {')
  .replace('export class WithdrawalInbox', 'class WithdrawalInbox');
const records = new Map(), emails = [], logs = [];
let alarm, rejectMail = false, challengeOK = true;
const storage = {
  get: async key => structuredClone(records.get(key)),
  put: async (key, value) => {
    if (typeof key === 'object') { for (const [k, v] of Object.entries(key)) records.set(k, structuredClone(v)); }
    else records.set(key, structuredClone(value));
  },
  list: async ({ prefix }) => new Map([...records].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, structuredClone(value)])),
  delete: async key => records.delete(key),
  setAlarm: async value => { alarm = value; }, deleteAlarm: async () => { alarm = undefined; }
};
const scope = vm.createContext({ Request, Response, URL, TextEncoder, Date, Intl,
  console: { error: (...args) => logs.push(args) },
  fetch: async (url, options) => {
    if (url.includes('siteverify')) return Response.json({ success: challengeOK, hostname: 'autosahkoapu.fi', action: 'withdrawal' });
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers.Authorization, 'Bearer mock-api-key');
    emails.push({ key: options.headers['Idempotency-Key'], ...JSON.parse(options.body) });
    return rejectMail ? Response.json({ error: 'private-provider-error' }, { status: 429 }) : Response.json({ id: 'mock-email' });
  }
});
vm.runInContext(source + '\nglobalThis.api = worker; globalThis.Inbox = WithdrawalInbox;', scope);
const env = { ALLOWED_ORIGIN: 'https://autosahkoapu.fi', RESEND_API_KEY: 'mock-api-key', EMAIL_FROM: 'verified@example.com', TURNSTILE_SECRET: 'mock-turnstile', ADMIN_SECRET: 'mock-admin' };
const inbox = new scope.Inbox({ storage }, env);
env.WITHDRAWAL_INBOX = { idFromName: () => 'inbox', get: () => inbox };
const id = 'a1234567-1234-4234-8234-123456789012';
const body = { id, name: 'Testikuluttaja', email: 'test@example.com', order: 'Testipaketti\n7.10.2026', confirmed: true, turnstileToken: 'mock-token' };
const request = (data = body, origin = env.ALLOWED_ORIGIN) => new Request('https://test/withdraw', {
  method: 'POST', headers: { Origin: origin }, body: JSON.stringify(data)
});
const admin = (path, method = 'GET', data) => new Request(`https://test/admin/${path}`, { method, headers: { Authorization: 'Bearer mock-admin' }, ...(data ? { body: JSON.stringify(data) } : {}) });
(async () => {
  assert.equal((await scope.api.fetch(request(body, 'https://foreign.test'), env)).status, 403);
  assert.equal((await scope.api.fetch(request(), { ...env, RESEND_API_KEY: '' })).status, 503);
  assert.equal(records.size, 0);
  assert.equal((await scope.api.fetch(request({ ...body, confirmed: false }), env)).status, 400);
  challengeOK = false;
  assert.equal((await scope.api.fetch(request(), env)).status, 400);
  challengeOK = true;
  const response = await scope.api.fetch(request(), env);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.accepted, true);
  assert.equal(result.emailSent, true);
  assert.match(result.receipt, /Testipaketti/);
  assert.match(result.receipt, /Aikaleima: .*Z/);
  assert.equal(emails.length, 2);
  assert.equal(emails[0].to[0], body.email);
  assert.equal(emails[1].to[0], 'autosahkoapu@gmail.com');
  assert.equal(emails[0].text, result.receipt);
  assert.equal((await scope.api.fetch(request(), env)).status, 200);
  assert.equal(emails.length, 2, 'duplicate submission must not send more messages');
  assert.equal((await scope.api.fetch(request({ ...body, order: 'Different order' }), env)).status, 409);
  const secondId = 'b1234567-1234-4234-8234-123456789012';
  rejectMail = true;
  const delayed = await scope.api.fetch(request({ ...body, id: secondId }), env);
  assert.equal(delayed.status, 202);
  const delayedBody = await delayed.json();
  assert.equal(delayedBody.accepted, true);
  assert.equal(delayedBody.emailSent, false);
  assert.ok(records.has(`request:${secondId}`), 'failed mail must not discard a withdrawal');
  assert.ok(alarm > Date.now(), 'delayed confirmations must schedule retry');
  rejectMail = false;
  await inbox.alarm();
  assert.equal(records.get(`request:${secondId}`).emailSent, true);
  assert.equal(records.get(`request:${secondId}`).ownerNotified, true);
  const deniedAdmin = new Request('https://test/admin/requests');
  assert.equal((await scope.api.fetch(deniedAdmin, env)).status, 401);
  assert.equal((await (await scope.api.fetch(admin('requests'), env)).json()).requests.length, 2);
  assert.equal((await scope.api.fetch(admin('resolve', 'POST', { id }), env)).status, 200);
  const closed = records.get(`request:${id}`);
  assert.equal(closed.deleteAt - closed.resolvedAt, 365 * 86400000);
  const firstClose = closed.resolvedAt;
  await scope.api.fetch(admin('resolve', 'POST', { id }), env);
  assert.equal(records.get(`request:${id}`).resolvedAt, firstClose);
  records.set(`request:${id}`, { ...closed, deleteAt: Date.now() - 1 });
  await inbox.alarm();
  assert.ok(!records.has(`request:${id}`));
  assert.ok(records.has(`request:${secondId}`), 'open cases must survive closed-case cleanup');
  assert.ok(!JSON.stringify(logs).includes(body.email));
  assert.ok(!source.includes('ACCESS_CODES'));
  assert.ok(!source.includes('api.openai.com'));
  const configSource = fs.readFileSync('config.js', 'utf8');
  const configScope = vm.createContext({ window: {} });
  vm.runInContext(configSource, configScope);
  assert.equal(configScope.window.ASAI_CONFIG.salesOpen, false);
  assert.equal(configScope.window.ASAI_CONFIG.cancellationUrl, '');
  assert.equal(Object.keys(configScope.window.ASAI_CONFIG.paymentLinks).length, 0);
  assert.ok(!fs.readFileSync('script.js', 'utf8').includes('href="#hinnat"'));
  console.log('PASS: closed sales, withdrawal validation, Turnstile, email receipts, idempotency, failed-email recovery, protected administration and retention. Mock services only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
