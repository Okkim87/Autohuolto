(() => {
  'use strict';
  const id = 'G-BB62L9G5HX';
  const key = 'asai_analytics_consent_v1';
  const lifetime = 180 * 86400000;
  const disableKey = 'ga-disable-' + id;
  let started = false;
  let current = null;
  function readChoice() {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      return saved && saved.version === 1 && ['granted', 'denied'].includes(saved.choice) &&
        Number.isFinite(saved.time) && saved.time <= Date.now() && Date.now() - saved.time < lifetime ? saved.choice : null;
    } catch { return null; }
  }
  function clearAnalyticsCookies() {
    for (const entry of document.cookie.split(';')) {
      const name = entry.trim().split('=')[0];
      if (!/^_ga(?:_|$)/.test(name)) continue;
      const domains = ['', location.hostname, '.' + location.hostname];
      const parts = location.hostname.split('.');
      if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
      for (const domain of domains) document.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax' + (domain ? '; Domain=' + domain : '');
    }
  }
  function cleanReferrer() {
    try { const url = new URL(document.referrer); return url.origin + url.pathname; } catch { return ''; }
  }
  function startAnalytics() {
    window[disableKey] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    const consent = { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
    if (started) { window.gtag('consent', 'update', consent); return; }
    started = true;
    window.gtag('consent', 'default', consent);
    window.gtag('js', new Date());
    window.gtag('config', id, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: lifetime / 1000,
      cookie_update: false,
      page_location: location.origin + location.pathname,
      page_referrer: cleanReferrer()
    });
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.appendChild(tag);
  }
  function apply(choice) {
    current = choice;
    if (choice === 'granted') startAnalytics();
    else { window[disableKey] = true; clearAnalyticsCookies(); }
  }
  apply(readChoice());
  const style = document.createElement('style');
  style.textContent = `
    .analytics-choice{position:fixed;bottom:16px;left:16px;right:16px;z-index:10000;max-width:700px;margin:auto;padding:20px;background:#111e2e;color:#edf4fb;border:1px solid #8bd4ff;border-radius:12px;box-shadow:0 8px 30px #0009;font:16px/1.5 system-ui,sans-serif;max-height:80vh;overflow:auto}
    .analytics-choice[hidden]{display:none}.analytics-choice h2{font-size:20px;margin:0 0 10px}.analytics-choice p{margin:0 0 14px}.analytics-choice a{color:#8bd4ff}.analytics-choice-actions{display:flex;flex-wrap:wrap;gap:10px}
    .analytics-choice button,.analytics-settings{font:inherit;border:1px solid #8bd4ff;border-radius:8px;padding:10px 14px;background:#162a40;color:#edf4fb;cursor:pointer}
    .analytics-choice-actions button{flex:1;min-width:180px}.analytics-choice button:focus-visible,.analytics-settings:focus-visible{outline:3px solid #ff8a31;outline-offset:3px}
    .analytics-settings{margin:12px;font:14px system-ui,sans-serif}.analytics-choice .analytics-choice-close{margin-top:12px}
  `;
  document.head.appendChild(style);
  const panel = document.createElement('section');
  panel.className = 'analytics-choice';
  panel.setAttribute('aria-label', 'Analytiikan valinta');
  panel.innerHTML = '<h2>Sallitko kävijätilastot?</h2><p>Sallitko Google Analyticsin analytiikkaevästeet kävijätilastoihin? Palvelu toimii myös ilman niitä. <a href="/tietosuoja/">Tietosuojaseloste</a></p><div class="analytics-choice-actions"><button type="button" data-choice="granted">Hyväksy analytiikka</button><button type="button" data-choice="denied">Vain välttämättömät</button></div><button type="button" class="analytics-choice-close" hidden>Sulje muuttamatta</button><p class="analytics-choice-status" aria-live="polite"></p>';
  const close = panel.querySelector('.analytics-choice-close');
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'analytics-settings';
  settings.textContent = 'Evästeasetukset';
  settings.onclick = () => { panel.hidden = false; close.hidden = current === null; panel.querySelector('button').focus(); };
  close.onclick = () => { panel.hidden = true; settings.focus(); };
  for (const button of panel.querySelectorAll('[data-choice]')) button.onclick = () => {
    const choice = button.getAttribute('data-choice');
    try { localStorage.setItem(key, JSON.stringify({ version: 1, choice, time: Date.now() })); } catch { /* Choice applies to this page if storage is unavailable. */ }
    apply(choice);
    panel.hidden = true;
    settings.focus();
  };
  document.body.appendChild(panel);
  (document.querySelector('footer') || document.body).appendChild(settings);
  panel.hidden = current !== null;
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    apply(readChoice());
    panel.hidden = current !== null;
  });
})();
