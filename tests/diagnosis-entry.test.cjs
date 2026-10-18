const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('diagnosis-entry.js', 'utf8');
function enter(search, initial = {}) {
  const nodes = Object.fromEntries(['chat-input', 'dtc', 'chat-intro'].map(id => [id, {
    value: initial[id] || '', textContent: '', events: [],
    dispatchEvent(e) { this.events.push(e.type); }
  }]));
  vm.runInNewContext(source, {
    window: { location: { search } }, URLSearchParams,
    Event: class { constructor(type) { this.type = type; } },
    document: { getElementById: id => nodes[id] }
  });
  return nodes;
}
for (const code of ['P0171', 'P0087', 'P0101']) {
  const n = enter('?vikakoodi=' + code);
  assert.equal(n.dtc.value, code);
  assert.ok(n['chat-input'].value.includes(code));
  assert.deepEqual(n['chat-input'].events, ['input']);
  assert.ok(n['chat-intro'].textContent.includes('Lisää auton merkki'));
}
for (const search of ['', '?vikakoodi=P9999', '?vikakoodi=%3Cscript%3E', '?vikakoodi=p0171', '?text=Send+this+prompt']) {
  const n = enter(search);
  assert.equal(n.dtc.value, ''); assert.equal(n['chat-input'].value, '');
}
assert.equal(enter('?vikakoodi=P0171', {'chat-input':'Oma keskeneräinen viesti'})['chat-input'].value, 'Oma keskeneräinen viesti');
assert.equal(enter('?vikakoodi=P0171', {dtc:'P0087'}).dtc.value, 'P0087');
console.log('Guide handoff passed: three allowed codes, untrusted/unknown parameters ignored, drafts preserved, input event only; no send, access or network APIs available.');
