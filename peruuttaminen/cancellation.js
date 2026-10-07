(() => {
  const cfg = window.ASAI_CONFIG || {};
  // The form is enabled only after the independent endpoint and email service
  // have been configured and tested. The current free pilot remains usable.
  if (!cfg.cancellationUrl || !cfg.turnstileSiteKey) return;
  const section = document.getElementById('verkossa-peruuttaminen');
  const form = document.getElementById('cancellation-form');
  const review = document.getElementById('cancellation-review');
  const status = document.getElementById('cancellation-status');
  const confirm = document.getElementById('cancellation-confirm');
  let token = '', widget, submission, busy = false;
  section.hidden = false;
  const challengeScript = document.createElement('script');
  challengeScript.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  challengeScript.onload = () => {
    widget = window.turnstile.render('#cancellation-challenge', {
      sitekey: cfg.turnstileSiteKey,
      action: 'withdrawal',
      callback: value => { token = value; },
      'expired-callback': () => { token = ''; },
      'error-callback': () => { token = ''; status.textContent = 'Tarkistus epäonnistui. Yritä uudelleen tai ilmoita peruuttamisesta sähköpostitse.'; }
    });
  };
  challengeScript.onerror = () => { status.textContent = 'Verkkolomakkeen tarkistus ei latautunut. Voit ilmoittaa peruuttamisesta sähköpostitse.'; };
  document.head.appendChild(challengeScript);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const fields = new FormData(form);
    const values = Object.fromEntries(['name', 'email', 'order'].map(key => [key, String(fields.get(key) || '').trim()]));
    if (!submission || ['name', 'email', 'order'].some(key => submission[key] !== values[key])) {
      submission = { id: crypto.randomUUID(), ...values };
    }
    document.getElementById('cancellation-details').textContent = `Nimi: ${submission.name}\nSähköposti: ${submission.email}\nPeruutettava tilaus: ${submission.order}`;
    form.hidden = true;
    review.hidden = false;
    status.textContent = '';
    confirm.focus();
  });
  document.getElementById('cancellation-edit').addEventListener('click', () => {
    if (busy) return;
    review.hidden = true;
    form.hidden = false;
    form.elements.name.focus();
  });
  confirm.addEventListener('click', async () => {
    if (busy || !submission) return;
    if (!token) {
      status.textContent = 'Tee lomakkeen tarkistus ennen lähettämistä.';
      review.hidden = true;
      form.hidden = false;
      return;
    }
    busy = true;
    confirm.disabled = true;
    document.getElementById('cancellation-edit').disabled = true;
    status.textContent = 'Lähetetään peruuttamisilmoitusta…';
    try {
      const response = await fetch(cfg.cancellationUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...submission, confirmed: true, turnstileToken: token })
      });
      const result = await response.json();
      if (!response.ok || result.accepted !== true) throw new Error('not_confirmed');
      review.hidden = true;
      status.textContent = result.emailSent
        ? 'Peruuttamisilmoitus on vastaanotettu. Vastaanottovahvistus on lähetetty sähköpostitse. Maksunpalautus käsitellään erikseen.'
        : 'Peruuttamisilmoitus on vastaanotettu, mutta sähköpostivahvistuksen lähetys viivästyy. Tallenna alla oleva vastaanottokuitti. Maksunpalautus käsitellään erikseen.';
      const receipt = document.createElement('a');
      const fileUrl = URL.createObjectURL(new Blob([result.receipt], { type: 'text/plain;charset=utf-8' }));
      receipt.href = fileUrl;
      receipt.download = `peruuttamisvahvistus-${submission.id}.txt`;
      receipt.textContent = 'Tallenna peruuttamisilmoituksen vastaanottokuitti';
      status.append(document.createElement('br'), receipt);
      window.addEventListener('pagehide', () => URL.revokeObjectURL(fileUrl), { once: true });
    } catch {
      status.textContent = 'Lähetyksen vastaanottoa ei voitu varmistaa. Voit yrittää uudelleen samoilla tiedoilla tai ilmoittaa peruuttamisesta osoitteeseen autosahkoapu@gmail.com.';
      token = '';
      if (widget !== undefined) window.turnstile.reset(widget);
      review.hidden = true;
      form.hidden = false;
    } finally {
      busy = false;
      confirm.disabled = false;
      document.getElementById('cancellation-edit').disabled = false;
    }
  });
})();
