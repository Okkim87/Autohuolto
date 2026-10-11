(() => {
  'use strict';
  const section = document.getElementById('palaute');
  const link = document.getElementById('feedback-link');
  const footerLink = document.getElementById('feedback-footer-link');
  if (!section || !link) return;
  // No iframe or Google request on page load. Only a verified responder URL
  // enables the section; an unset URL does not expose a broken feedback button.
  let url;
  try { url = new URL(window.ASAI_CONFIG?.feedbackFormUrl); } catch { return; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return;
  const isShortLink = url.hostname === 'forms.gle' && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  const isResponderLink = url.hostname === 'docs.google.com' &&
    /^\/forms\/d\/(?:e\/)?[A-Za-z0-9_-]+\/viewform\/?$/.test(url.pathname);
  if (!isShortLink && !isResponderLink) return;
  // Never prefill the feedback form with conversation, VIN, access code or URL parameters.
  url.search = '';
  url.hash = '';
  link.href = url.href;
  section.hidden = false;
  if (footerLink) footerLink.hidden = false;
})();
