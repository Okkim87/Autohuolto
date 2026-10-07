const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('Cloudflare-woker/worker.js', 'utf8')
  .replace('export default {', 'const worker = {')
  .replace('export class AccessGate', 'class AccessGate');
const scope = vm.createContext({ console, Response, Request, URL, crypto });
vm.runInContext(source + '\nglobalThis.check = { SYSTEM_PROMPT, buildPrompt, sourceSummary };', scope);
const { SYSTEM_PROMPT, buildPrompt } = scope.check;
const cases = [
  ['Voinko tehdä EGR-toimilaitetestin tavallisella OBD-lukijalla?', /geneerinen OBD2 ei\s+yleensä sisällä valmistajakohtaista EGR-toimilaitetestiä/i, []],
  ['Mikä CAN-ID ohjaa ajovaloja tässä autossa?', /älä arvaa ID:tä/i, []],
  ['Testerissä näkyy vain geneeriset OBD-arvot. Miten teen valmistajakohtaisen adaptaation?', /adaptaatio voi vaatia sitä tukevan testerin/i, []],
  ['Minulla on Autocom.', /Autocom ei takaa tukea/i, ['Autocom']],
  ['Minulla on vain yleismittari.', /vain samaa hypoteesia aidosti testaavana/i, ['Yleismittari']]
];
for (const [input, rule, tools] of cases) {
  const prompt = buildPrompt({ tools, car: 'BMW' }, [], input, {});
  assert.ok(prompt.includes(input));
  assert.match(SYSTEM_PROMPT + '\n' + prompt, rule);
  for (const layer of ['GENERIC_OBD', 'VEHICLE_TECHNICAL_DATA', 'OEM_DIAGNOSTIC_DATA']) {
    assert.ok(SYSTEM_PROMPT.includes(layer));
    assert.ok(prompt.includes(layer));
  }
  assert.match(prompt, /Geneerinen OBD ei korvaa OEM-toimintoa/);
}
const populated = buildPrompt({ tools: ['Autocom'] }, [], 'EGR-testi', {
  obdex: [{ available: true, code: 'P0171' }],
  obdb: { available: true, repo: 'BMW', signals: [{ name: 'EGR' }] },
  wal33d: [{ available: true, code: 'P1234' }]
});
assert.match(populated, /EI AUTOMAATTISESTI VARMENNETTUA OEM-DATAA/);
assert.match(populated, /OBDb-signaalin tai Wal33D\/Autodiag2-DTC:n löytyminen ei varmista/);
assert.match(SYSTEM_PROMPT, /kysy näkyykö kyseinen moduuli\/toiminto/);
assert.match(SYSTEM_PROMPT, /käytä nykyisen JSON-rakenteen how-kenttää/);
assert.match(SYSTEM_PROMPT, /ei korvaa suoraa testerikysymystä how-kentässä/);
assert.match(populated, /suora\s+testerikysymys myös CAN-ID-kysymyksessä/);
assert.match(SYSTEM_PROMPT, /Älä nimeä ohjainlaitetta DME\/DDE-tunnuksella/);
assert.match(populated, /Älä nimeä DME\/DDE-moduulia/);
const summary = scope.check.sourceSummary({
  obdexPids: [{ pid: '0C' }],
  obdb: { available: true, repo: 'Audi-A6', signals: [{ name: 'Steering' }] }
});
assert.equal(summary.length, 2);
assert.match(summary[0].name, /löytynyt/);
assert.match(summary[0].detail, /ei auton mittaustuloksia/);
assert.match(summary[0].detail, /käyttö tässä vastauksessa ei varmennettu/);
assert.match(summary[1].detail, /ajoneuvosoveltuvuus ja käyttö tässä vastauksessa eivät ole varmennettuja/);
assert.equal(summary[1].name.includes('Ajoneuvodata'), false);
assert.deepEqual(Object.keys(summary[1]).sort(), ['detail', 'name', 'ok', 'provider']);
assert.equal(scope.check.sourceSummary({}).length, 0);
assert.match(SYSTEM_PROMPT, /Älä oleta akun vaihtoa/);
assert.match(SYSTEM_PROMPT, /ohjausvikakoodi ei yksin sulje pois nykyistä/);
console.log('PASS: five diagnostic prompt regressions and populated-source boundaries. These tests verify prompt policy, not live model responses.');
