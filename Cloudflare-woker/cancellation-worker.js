// Independent, initially undeployed service. No activation-code or AI bindings.
const RETENTION_MS = 365 * 86400000;
const REPLY_TO = 'autosahkoapu@gmail.com';

export default {
  async fetch(request, env) {
    const headers = responseHeaders(env);
    const origin = request.headers.get('Origin');
    if (origin && origin !== env.ALLOWED_ORIGIN) return reply({ error: 'Pyyntö ei ole sallittu.' }, 403, headers);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    const path = new URL(request.url).pathname;
    if (path !== '/withdraw' && !['/admin/requests', '/admin/resolve'].includes(path)) return reply({ error: 'Not found' }, 404, headers);
    if (path.startsWith('/admin/') && (!env.ADMIN_SECRET || request.headers.get('Authorization') !== `Bearer ${env.ADMIN_SECRET}`)) {
      return reply({ error: 'Ei oikeutta.' }, 401, headers);
    }
    if (!env.WITHDRAWAL_INBOX || !env.RESEND_API_KEY || !env.EMAIL_FROM || !env.TURNSTILE_SECRET || !env.ALLOWED_ORIGIN) {
      return reply({ error: 'Verkkoperuuttaminen ei ole vielä käytössä. Ota yhteyttä sähköpostitse: autosahkoapu@gmail.com' }, 503, headers);
    }
    try {
      return await env.WITHDRAWAL_INBOX.get(env.WITHDRAWAL_INBOX.idFromName('inbox')).fetch(request);
    } catch {
      console.error('withdrawal_request_failed');
      return reply({ error: 'Lähetyksen vastaanottoa ei voitu varmistaa. Ota tarvittaessa yhteyttä sähköpostitse.' }, 503, headers);
    }
  }
};

export class WithdrawalInbox {
  constructor(state, env) {
    this.storage = state.storage;
    this.env = env;
    this.queue = Promise.resolve();
  }
  fetch(request) {
    const task = this.queue.then(() => this.handle(request));
    this.queue = task.catch(() => {});
    return task;
  }
  alarm() {
    const task = this.queue.then(() => this.maintain());
    this.queue = task.catch(() => {});
    return task;
  }
  async handle(request) {
    const headers = responseHeaders(this.env);
    const path = new URL(request.url).pathname;
    if (path === '/admin/requests' && request.method === 'GET') {
      const records = await this.storage.list({ prefix: 'request:' });
      return reply({ requests: [...records.values()] }, 200, headers);
    }
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405, headers);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 10000) return reply({ error: 'Pyyntö on liian suuri.' }, 413, headers);
    let body;
    try { body = JSON.parse(text); } catch { return reply({ error: 'Virheellinen pyyntö.' }, 400, headers); }
    if (path === '/admin/resolve') {
      if (!validId(body.id)) return reply({ error: 'Virheellinen tunniste.' }, 400, headers);
      const record = await this.storage.get(`request:${body.id}`);
      if (!record) return reply({ error: 'Not found' }, 404, headers);
      // Closing a case does not send mail or change any customer's credits.
      if (!record.resolvedAt) record.resolvedAt = Date.now();
      record.deleteAt = record.resolvedAt + RETENTION_MS;
      await this.storage.put(`request:${body.id}`, record);
      await this.schedule();
      return reply({ resolved: true }, 200, headers);
    }
    if (!validId(body.id) || body.confirmed !== true ||
        !validText(body.name, 140) || !validText(body.order, 300) ||
        typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ||
        typeof body.turnstileToken !== 'string' || body.turnstileToken.length > 2048) {
      return reply({ error: 'Tarkista nimi, sähköposti, tilaus ja lähetyksen vahvistaminen.' }, 400, headers);
    }
    const challenge = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: this.env.TURNSTILE_SECRET, response: body.turnstileToken })
    });
    if (!challenge.ok) return reply({ error: 'Tarkistus epäonnistui. Voit ilmoittaa peruuttamisesta sähköpostitse.' }, 503, headers);
    const verification = await challenge.json();
    if (!verification.success || verification.action !== 'withdrawal' || verification.hostname !== new URL(this.env.ALLOWED_ORIGIN).hostname) {
      return reply({ error: 'Tarkistus epäonnistui. Yritä uudelleen.' }, 400, headers);
    }
    const normalized = { name: body.name.trim(), email: body.email.trim(), order: body.order.trim() };
    const key = `request:${body.id}`;
    let record = await this.storage.get(key);
    if (record && ['name', 'email', 'order'].some(field => record[field] !== normalized[field])) {
      return reply({ error: 'Ilmoituksen tunniste on jo käytössä.' }, 409, headers);
    }
    if (!record) {
      const today = new Date().toISOString().slice(0, 10);
      const quota = await this.storage.get('request-quota') || { day: today, count: 0 };
      if (quota.day !== today) { quota.day = today; quota.count = 0; }
      if (quota.count >= 40) return reply({ error: 'Verkkolomakkeen päiväkohtainen raja on saavutettu. Ilmoita peruuttamisesta sähköpostitse: autosahkoapu@gmail.com' }, 429, headers);
      quota.count++;
      record = { id: body.id, ...normalized, receivedAt: Date.now(), emailSent: false, ownerNotified: false };
      await this.storage.put({ [key]: record, 'request-quota': quota });
      // Schedule recovery before making external email calls.
      await this.schedule();
    }
    await this.notify(record);
    await this.storage.put(key, record);
    await this.schedule();
    return reply({ accepted: true, emailSent: record.emailSent, receipt: receiptText(record) }, record.emailSent ? 200 : 202, headers);
  }
  async send(to, subject, text, key) {
    const today = new Date().toISOString().slice(0, 10);
    const quota = await this.storage.get('mail-quota') || { day: today, count: 0 };
    if (quota.day !== today) { quota.day = today; quota.count = 0; }
    // 90 attempts leave room under the current Resend Free 100/day ceiling.
    if (quota.count >= 90) return false;
    quota.count++;
    await this.storage.put('mail-quota', quota);
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${this.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ from: this.env.EMAIL_FROM, to: [to], reply_to: REPLY_TO, subject, text })
      });
      return response.ok;
    } catch { return false; }
  }
  async notify(record) {
    if (!record.emailSent) record.emailSent = await this.send(record.email, 'Autosähköapu AI – peruuttamisilmoitus vastaanotettu', receiptText(record), `withdrawal-${record.id}-customer`);
    if (!record.ownerNotified) record.ownerNotified = await this.send(REPLY_TO, 'Autosähköapu AI – uusi käsiteltävä peruuttamisilmoitus', receiptText(record), `withdrawal-${record.id}-owner`);
  }
  async maintain() {
    const records = await this.storage.list({ prefix: 'request:' });
    for (const [key, record] of records) {
      if (record.deleteAt && record.deleteAt <= Date.now()) { await this.storage.delete(key); continue; }
      if (!record.emailSent || !record.ownerNotified) { await this.notify(record); await this.storage.put(key, record); }
    }
    await this.schedule();
  }
  async schedule() {
    const records = await this.storage.list({ prefix: 'request:' });
    let next = Infinity;
    for (const record of records.values()) {
      if (!record.emailSent || !record.ownerNotified) next = Math.min(next, Date.now() + 15 * 60000);
      if (record.deleteAt) next = Math.min(next, Math.max(Date.now() + 1000, record.deleteAt));
    }
    if (Number.isFinite(next)) await this.storage.setAlarm(next);
    else await this.storage.deleteAlarm();
  }
}

function validId(id) { return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }
function validText(value, max) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value); }
function receiptText(record) {
  const date = new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', dateStyle: 'short', timeStyle: 'long' }).format(new Date(record.receivedAt));
  return `Autosähköapu AI – peruuttamisilmoituksen vastaanottovahvistus\n\nIlmoituksesi on vastaanotettu.\nTunniste: ${record.id}\nVastaanotettu: ${date}\nAikaleima: ${new Date(record.receivedAt).toISOString()}\nNimi: ${record.name}\nSähköposti: ${record.email}\nPeruutettava sopimus: ${record.order}\n\nTämä vahvistaa ilmoituksen vastaanoton. Mahdollinen maksunpalautus käsitellään erikseen.\nYhteys: ${REPLY_TO}\n`;
}
function responseHeaders(env) { return { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || 'https://autosahkoapu.fi', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', Vary: 'Origin' }; }
function reply(body, status, headers) { return new Response(JSON.stringify(body), { status, headers }); }
