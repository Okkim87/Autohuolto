'use strict';
(() => {
  const el = id => document.getElementById(id);
  let code = '', busy = false;
  async function api(path, body) {
    const url = new URL(el('worker').value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('Anna pelkkä Worker-osoite HTTPS-muodossa.');
    const secret = el('secret').value;
    if (!secret) throw new Error('Anna admin-salaisuus.');
    const response = await fetch(url.origin + path, { method: 'POST', redirect: 'error', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + secret }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Pyyntö epäonnistui.');
    return result;
  }
  el('create').addEventListener('click', async () => {
    if (busy) return; busy = true; el('create').disabled = true; el('kind').disabled = true; code = ''; el('copy').hidden = true; el('copy').textContent = 'Kopioi koodi';
    el('out').textContent = 'Luodaan…';
    try {
      const result = await api('/admin/create-code', { kind: 'combined', plan: el('plan').value, note: el('note').value });
      const output = document.createElement('div'); output.className = 'codeout'; output.textContent = result.code;
      const description = document.createElement('p'); description.textContent = result.remainingText;
      el('out').replaceChildren(output, description); code = result.code; el('copy').hidden = false;
    } catch (error) { el('out').textContent = error.message; }
    finally { busy = false; el('create').disabled = false; el('kind').disabled = false; }
  });
  el('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(code); el('copy').textContent = 'Kopioitu'; }
    catch { el('copy').textContent = 'Kopioi koodi tekstistä'; }
  });
  el('reset').addEventListener('click', async () => {
    if (busy) return;
    const value = el('reset-code').value.trim().toUpperCase();
    if (!/^ASAPP-(?:[A-HJ-NP-Z2-9]{4}-){3}[A-HJ-NP-Z2-9]{4}$/.test(value)) { el('reset-status').textContent = 'Anna ASAPP-appikoodi.'; return; }
    if (!window.confirm('Nollataanko tämän appikoodin laitesidonta? Seuraava aktivointi sitoo koodin uuteen asennukseen.')) return;
    busy = true; el('reset').disabled = true;
    try { el('reset-status').textContent = (await api('/admin/reset-app-device', { code: value })).message; }
    catch (error) { el('reset-status').textContent = error.message; }
    finally { busy = false; el('reset').disabled = false; }
  });
})();
