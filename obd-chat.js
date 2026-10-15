(() => {
  const el = id => document.getElementById(id);
  if (!el('obd-toggle')) return;
  let connection = null, snapshot = null, pending = false, polling = false;
  let ownerCode = null, resumeCode = null, resumeGeneration = 0;
  const status = value => { el('obd-status').textContent = value; };
  const states = { waiting: 'Odotetaan OBD-sovellusta.', live: 'Mittaukset päivittyvät.', stale: 'Mittaukset ovat vanhentuneet.', disconnected: 'Autoyhteys ei ole käynnissä.', expired: 'Mittausyhteys on päättynyt.' };
  window.ASAI_OBD = { session: () => connection && ownerCode === activeAccess?.code ? { sessionId: connection.sessionId, token: connection.token } : null };
  let nativeApp = false, nativeResult = null, nativeTurn = 0;
  // App polls this main-frame result after the user confirms sending measurements.
  // Capabilities stay in memory; the uploader receives only the one-time pairing code.
  window.ASAI_APP_OBD = {
    install() {
      nativeApp = true; el('obd-create').hidden = true;
      el('obd-instructions').textContent = 'Yhdistä autoon ja vahvista auton tiedot appissa. Paina yläpalkin Yhdistä mittaukset ja hyväksy lähetys. Erillistä OBD-koodia ei tarvita. Yhteys kestää enintään 30 minuuttia.';
    },
    start() {
      if (!nativeApp || pending) return false;
      pending = true;
      const turn = ++nativeTurn;
      nativeResult = null;
      (async () => {
        try {
          await window.ASAI_APP_READY;
          if (turn !== nativeTurn) return;
          if (!activeAccess) throw new Error('Aktivoi keskustelu saamallasi käyttöoikeuskoodilla.');
          await close(false); status('Yhdistetään appin mittauksia…');
          const code = activeAccess.code;
          const created = await api('/obd/create', { code });
          if (turn !== nativeTurn || activeAccess?.code !== code) { await api('/obd/close', created); return; }
          connection = created; ownerCode = code; el('obd-close').hidden = false;
          nativeResult = { pairCode: created.pairCode };
          status(states.waiting); await poll();
        } catch (error) { if (turn === nativeTurn) nativeResult = { error: error.message }; }
        finally { pending = false; }
      })();
      return true;
    },
    take() { const result = nativeResult; nativeResult = null; return result; },
    cancel() { nativeTurn++; nativeResult = null; return close(); }
  };
  const panel = el('obd-panel');
  function dismissPanel() {
    if (typeof panel.close === 'function') panel.close();
    panel.hidden = true;
    el('obd-toggle').setAttribute('aria-expanded', 'false');
    el('obd-toggle').focus?.();
  }
  el('obd-toggle').addEventListener('click', () => {
    if (!panel.hidden) { dismissPanel(); return; }
    panel.hidden = false;
    if (typeof panel.showModal === 'function') panel.showModal();
    el('obd-toggle').setAttribute('aria-expanded', 'true');
  });
  el('obd-dismiss').addEventListener('click', dismissPanel);
  panel.addEventListener('cancel', event => { event.preventDefault(); dismissPanel(); });
  async function close(cancelNative = true) {
    if (cancelNative !== false) { nativeTurn++; nativeResult = null; }
    resumeCode = null; resumeGeneration++; ownerCode = null;
    const old = connection; connection = null; snapshot = null;
    el('obd-readings').replaceChildren(); el('obd-vehicle').textContent = '';
    el('obd-plan-status').textContent = '';
    el('obd-close').hidden = true; el('obd-use-vehicle').hidden = true;
    status('Ei mittausyhteyttä.');
    if (old) try { await api('/obd/close', { sessionId: old.sessionId, token: old.token }); } catch {}
  }
  el('obd-close').addEventListener('click', close);
  async function findShared() {
    const code = resumeCode, turn = resumeGeneration;
    if (!code || activeAccess?.code !== code) return;
    const data = await api('/obd/resume', { code });
    if (resumeCode !== code || turn !== resumeGeneration || activeAccess?.code !== code) return;
    if (data.legacy) {
      resumeCode = null;
      status('Vanha testaajakoodi toimii edelleen keskustelussa. Yhdistä mittaukset appin sisäisessä vianetsinnässä. Uusi yhteinen ASAPP-koodi toimii myös erillisessä selaimessa.');
      return;
    }
    if (data.connection?.sessionId !== connection?.sessionId) {
      connection = data.connection || null; snapshot = null;
      el('obd-readings').replaceChildren(); el('obd-vehicle').textContent = '';
      el('obd-plan-status').textContent = ''; el('obd-use-vehicle').hidden = true;
    }
    if (connection) ownerCode = code;
    else status('Odotetaan appia. Avaa vianetsintä appissa samalla ASAPP-koodilla ja hyväksy Yhdistä mittaukset. Erillistä OBD-koodia ei tarvita.');
    el('obd-close').hidden = false;
  }
  el('obd-create').addEventListener('click', async () => {
    if (pending) return;
    if (!activeAccess) { status('Aktivoi ensin saamasi käyttöoikeuskoodi.'); return; }
    pending = true; el('obd-create').disabled = true;
    resumeCode = activeAccess.code; resumeGeneration++;
    try { await findShared(); await poll(); }
    catch (error) { status(error.message); }
    finally { pending = false; el('obd-create').disabled = false; }
  });
  el('obd-use-vehicle').addEventListener('click', () => {
    const v = snapshot?.vehicle; if (!v) return;
    el('car').value = v.make + ' ' + v.model; el('car-year').value = String(v.year); el('engine').value = v.engine;
    const tool = document.querySelector('input[name="tools"][value="obd"]'); if (tool) tool.checked = true;
    status('Auton tiedot vahvistettu keskusteluun. Lähetä oire tai kysymys.');
    dismissPanel();
  });
  async function poll() {
    if (polling || document.hidden) return;
    if ((connection && ownerCode !== activeAccess?.code) || (resumeCode && resumeCode !== activeAccess?.code)) {
      connection = null; snapshot = null; ownerCode = null; resumeCode = null; resumeGeneration++;
      el('obd-readings').replaceChildren(); el('obd-vehicle').textContent = ''; el('obd-use-vehicle').hidden = true;
      el('obd-plan-status').textContent = ''; el('obd-close').hidden = true;
      status('Käyttöoikeuskoodi vaihtui. Yhdistä mittaukset uudelleen.'); return;
    }
    polling = true;
    try { if (resumeCode && !pending) await findShared(); }
    catch (error) { polling = false; status(error.message); return; }
    if (!connection) { polling = false; return; }
    const current = connection;
    try {
      const data = await api('/obd/read', { sessionId: current.sessionId, token: current.token });
      if (connection !== current || ownerCode !== activeAccess?.code) return;
      snapshot = data; status(states[data.status] || 'Mittausyhteys ei ole käytettävissä.');
      const plan = data.plan;
      el('obd-plan-status').textContent = !plan ? (data.vehicle ? 'Automaattinen mittausvalinta vaatii sovelluksen version 0.8 tai uudemman.' : '') :
        (data.samplingMode === 'manual' ? 'Sovelluksessa on käsin tehtävä mittausvalinta. ' : data.appliedPlanRevision === plan.revision ? 'Sovellus seuraa keskustelun mittausvalintaa. ' : 'Uusi mittausvalinta odottaa sovelluksen seuraavaa päivitystä. ') +
        plan.reason + ': ' + (plan.names.length ? plan.names.join(', ') : plan.unavailableNames.length ? 'auto ei ilmoita tukea näille arvoille' : 'ei standardimittauksia valittu') +
        (plan.unavailableNames.length ? '. Auto ei ilmoita tukea: ' + plan.unavailableNames.join(', ') : '') + '.';
      el('obd-use-vehicle').hidden = !data.vehicle;
      el('obd-vehicle').textContent = data.vehicle ? 'Sovelluksessa vahvistettu auto: ' + [data.vehicle.make, data.vehicle.model, data.vehicle.year, data.vehicle.engine].join(' · ') + '. Tarkista auto ja käytä näitä tietoja ennen vianetsintää.' : '';
      const items = (data.measurements || []).map(sample => {
        const li = document.createElement('li');
        const label = sample.status === 'ambiguous' ? 'ristiriitaiset vastaukset' : sample.status !== 'ok' ? 'ei mittaustietoa' : sample.display;
        li.textContent = sample.name + ': ' + label + ' · ' + Math.floor(sample.ageMs / 1000) + ' s sitten' + (sample.fresh ? '' : ' · ei tuore mittaus');
        return li;
      });
      el('obd-readings').replaceChildren(...items);
    } catch (error) {
      if (connection !== current) return;
      snapshot = null; el('obd-readings').replaceChildren(); el('obd-use-vehicle').hidden = true;
      status('Mittauksia ei saatu: ' + error.message);
      if (Date.now() >= current.expiresAt) { connection = null; }
    } finally { polling = false; }
  }
  setInterval(poll, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  window.addEventListener('pagehide', () => {
    if (!connection || connection.shared || !workerReady()) return;
    fetch(cfg.workerUrl.replace(/\/$/, '') + '/obd/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: connection.sessionId, token: connection.token }), keepalive: true }).catch(() => {});
  });
})();
