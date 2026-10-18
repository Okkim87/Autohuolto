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
  el('refresh-installations').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    el('refresh-installations').disabled = true;
    el('installation-count').textContent = '—';
    el('installation-status').textContent = 'Lasketaan aktivoituja appiasennuksia…';
    const worker = el('worker').value, secret = el('secret').value;
    const installations = new Set(), cursors = new Set();
    let cursor = null, scanned = 0, boundCodes = 0;
    try {
      do {
        if (worker !== el('worker').value || secret !== el('secret').value) throw new Error('Yhteystiedot muuttuivat. Päivitä tilasto uudelleen.');
        const result = await api('/admin/app-installations', { cursor });
        if (worker !== el('worker').value || secret !== el('secret').value) throw new Error('Yhteystiedot muuttuivat. Päivitä tilasto uudelleen.');
        if (!Array.isArray(result.installations) || !result.installations.every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)) ||
            !Number.isInteger(result.scannedCodes) || result.scannedCodes < 0 || result.scannedCodes > 20 ||
            !Number.isInteger(result.boundCodes) || result.boundCodes < result.installations.length || result.boundCodes > result.scannedCodes ||
            (result.nextCursor !== null && (typeof result.nextCursor !== 'string' || !result.nextCursor || result.nextCursor.length > 2048))) throw new Error('Tilaston vastausta ei voitu varmistaa. Yritä uudelleen.');
        result.installations.forEach(hash => installations.add(hash));
        scanned += result.scannedCodes; boundCodes += result.boundCodes;
        cursor = result.nextCursor;
        if (cursor && (cursors.has(cursor) || cursors.size >= 1000)) throw new Error('Tilaston sivutus ei valmistunut. Yritä uudelleen.');
        if (cursor) cursors.add(cursor);
        el('installation-status').textContent = `Tarkistettu ${scanned} käyttöoikeuskoodia…`;
      } while (cursor);
      el('installation-count').textContent = String(installations.size);
      el('installation-status').textContent = `${boundCodes} voimassa olevaan appikoodiin sidottua aktivointia. Sama appiasennus lasketaan vain kerran. Päivitetty ${new Date().toLocaleString('fi-FI')}.`;
    } catch (error) {
      el('installation-count').textContent = '—';
      el('installation-status').textContent = error.message;
    } finally { installations.clear(); busy = false; el('refresh-installations').disabled = false; }
  });
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
