const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('Cloudflare-woker/worker.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export default {','const worker = {').replace(/export class /g,'class ');
const scope=vm.createContext({console,Response,Request,URL,crypto});
vm.runInContext(source+'\nglobalThis.check={SYSTEM_PROMPT,buildPrompt,enrichCaseData,multimeterEvidence};',scope);
const {SYSTEM_PROMPT,buildPrompt,enrichCaseData,multimeterEvidence}=scope.check;
const initial='Ford Fiesta 1.6 TDCi vm 2011 ei lataa eikä laturin merkkivalo pala. Mitattu yleismittarilla, ei lataa.';
const history=[{role:'user',text:initial},{role:'assistant',reply:{test:'Latausjännitteen mittaus',how:'Mittaa akun navoista moottorin käydessä.'}},{role:'user',text:'12.0v'}];
assert.match(multimeterEvidence(history),/tehnyt sillä mittauksen/);
assert.equal(multimeterEvidence([{role:'assistant',reply:{how:'Onko yleismittari käytössä?'}}]),'ei erillistä vahvistusta','assistant suggestions are not user evidence');
assert.match(multimeterEvidence(history,'Minulla ei ole enää yleismittaria.'),/puuttuvan/);
assert.match(multimeterEvidence(history,'Yleismittari on rikki.'),/puuttuvan/);
const c=enrichCaseData({car:'Ford Fiesta',year:'2011',tools:['OBD / testeri']},history,'Miten mittaan sen?');
assert.match(c.multimeterAvailability,/tehnyt sillä mittauksen/);
const later=enrichCaseData(c,[],'14.0 V');assert.equal(later.multimeterAvailability,c.multimeterAvailability,'reported tool survives history truncation');
assert.match(enrichCaseData(later,[],'Minulla ei ole yleismittaria.').multimeterAvailability,/puuttuvan/);
for(const message of ['12.0v','Mitä teen sitten','Miten mittaan sen','On mittari, miten kytken sen mitattavaan kohteeseen','14.0v']){
 const p=buildPrompt(c,history,message,{});
 assert.ok(p.includes(initial));assert.ok(p.includes(message));assert.match(p,/käyttäjä on ilmoittanut yleismittarin/);
 assert.match(p,/lyhyt tulkinta ja yksi seuraava perusteltu vaihe/);assert.match(p,/kytkentäohjetta/);assert.match(p,/jännitehäviömittaus/);
}
assert.match(SYSTEM_PROMPT,/Latauspiirin pluspuolen jännitehäviömittaus/);
assert.match(SYSTEM_PROMPT,/ilman virran kulkua tai avoimessa piirissä ei varmista/);
assert.match(SYSTEM_PROMPT,/Älä väitä niiden\s+erotusta mitatuksi 2,0 V/);
assert.match(SYSTEM_PROMPT,/Akun miinusnapa, moottorin runko ja laturin runko/);
assert.match(SYSTEM_PROMPT,/palaako valo virrat kytkettynä ennen/);
console.log('Charging dialogue passed: explicit user tool evidence, correction, retained case memory and no assistant-derived availability. Prompt regressions cover progression, connection questions, voltage-drop terminology, stable reference/conditions and warning-lamp symptom. Generated model behaviour not asserted.');
