// Guide links can prepare a draft, but never send a message or activate access.
(() => {
  'use strict';
  const code = new URLSearchParams(window.location.search).get('vikakoodi');
  if (!['P0171', 'P0087', 'P0101'].includes(code)) return;
  const input = document.getElementById('chat-input');
  const dtc = document.getElementById('dtc');
  if (!input || !dtc || input.value.trim() || dtc.value.trim()) return;
  dtc.value = code;
  input.value = `Autossani on vikakoodi ${code}. Mistä vianetsintä kannattaa aloittaa?`;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const intro = document.getElementById('chat-intro');
  if (intro) intro.textContent = `${code} on valmiina viestiluonnoksessa. Lisää auton merkki, malli, vuosimalli, moottori ja oire. Lähetä viesti, kun tiedot ovat valmiit.`;
})();
