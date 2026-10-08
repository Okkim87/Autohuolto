const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('Cloudflare-woker/worker.js', 'utf8')
  .replace('export default {', 'const worker = {')
  .replace(/export class /g, 'class ');
const context = vm.createContext({ console, Response, Request, URL, crypto });
vm.runInContext(source + '\n globalThis.check = { parseReply, selectIllustration, currentMeterSetupConfirmed };', context);
const { parseReply, selectIllustration, currentMeterSetupConfirmed } = context.check;
const question = { role: 'assistant', reply: { how: 'Löytyykö mittarista A/10 A -liitäntä ja onko virtamittausalue sulakkeella suojattu?' } };
const series = { blocked: false, test: 'Lepovirtamittaus', tool: 'Yleismittari', how: 'Kytke mittari sarjaan akun miinuspuolelle.', illustration: 'parasitic-current' };
assert.equal(selectIllustration(series, {}, [], 'Yleismittari löytyy'), '');
assert.equal(selectIllustration(series, {}, [question], 'löytyy'), 'parasitic-current');
assert.equal(selectIllustration(series, {}, [question], 'ei löydy'), '');
assert.equal(selectIllustration(series, {}, [question], 'en tiedä'), '');
assert.equal(currentMeterSetupConfirmed([], 'Mittarissa on 10 A liitäntä ja sulakesuojaus'), true);
assert.equal(currentMeterSetupConfirmed([], 'Mittarissa on 10 A liitäntä mutta ei sulakesuojausta'), false);
assert.equal(selectIllustration({ ...series, blocked: true }, {}, [question], 'kyllä'), '');
assert.equal(selectIllustration(series, {}, [question], 'ajoakun mittaus'), '');
assert.equal(selectIllustration({ ...series, how: 'Onko mittarissa sulake?' }, {}, [question], 'kyllä'), '');
const history = [question, { role: 'user', text: 'kyllä' }, { role: 'assistant', reply: { how: 'Jatketaan.' } }];
assert.equal(selectIllustration(series, {}, history, 'Sulake on palanut'), '');
assert.equal(selectIllustration({ ...series, tool: 'Virtapihti' }, {}, [question], 'kyllä'), '');
const voltage = { blocked: false, test: 'Akun jännitemittaus', tool: 'Yleismittari', how: 'Mittaa akun jännite V DC -asennossa.', illustration: 'battery-voltage' };
assert.equal(selectIllustration(voltage, {}, [], ''), 'battery-voltage');
assert.equal(selectIllustration({ ...voltage, tool: '', how: 'Jännite on potentiaaliero.' }, {}, [], ''), '');
const clamp = { blocked: false, test: 'Lepovirta', tool: 'DC-virtapihti', how: 'Nollaa virtapihti ja aseta leuat yhden johtimen ympärille.', illustration: 'dc-current-clamp' };
assert.equal(selectIllustration(clamp, {}, [], ''), 'dc-current-clamp');
assert.equal(selectIllustration({ ...clamp, tool: 'AC-virtapihti' }, {}, [], ''), '');
assert.equal(parseReply('{"how":"ok","illustration":"https://evil.test/image.svg"}').illustration, '');
assert.equal(parseReply('{"how":"ok"}').illustration, '');
assert.throws(() => parseReply(''));
const client = fs.readFileSync('script.js', 'utf8');
const start = client.indexOf('function measurementIllustration(');
const end = client.indexOf('// Mittausohje ja tavallinen', start);
vm.runInContext(client.slice(start, end) + '\n globalThis.render = measurementIllustration;', context);
context.esc = s => String(s).replace(/[&<>"']/g, x => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[x]));
assert.equal(context.render({ illustration: '__proto__' }), '');
assert.equal(context.render({ illustration: '<script>alert(1)</script>' }), '');
assert.equal(context.render({ illustration: 'battery-voltage', blocked: true }), '');
for (const id of ['parasitic-current', 'battery-voltage', 'dc-current-clamp']) {
  assert.match(context.render({ illustration: id }), new RegExp('/images/measurements/' + id + '\\.svg'));
  assert.ok(fs.existsSync('images/measurements/' + id + '.svg'));
}
console.log('PASS: illustration prerequisites, negative/unknown replies, HV and question blocks, matching tools, approved URLs, backward compatibility and image assets.');
