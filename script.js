const CONTACT = {
  email: "autosahkoapu@gmail.com",
  phone: "050 556 1219"
};

const menuButton = document.querySelector('.menu-button');
const mainNav = document.querySelector('.main-nav');
menuButton?.addEventListener('click', () => {
  const open = mainNav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
});
mainNav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  mainNav.classList.remove('open');
  menuButton?.setAttribute('aria-expanded', 'false');
}));

document.getElementById('year').textContent = new Date().getFullYear();

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

const form = document.getElementById('quote-form');
const status = document.getElementById('form-status');
form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  if (CONTACT.email.includes('ESIMERKKI')) {
    status.textContent = 'Lisää oma sähköpostiosoite script.js-tiedoston CONTACT-kohtaan ennen julkaisua.';
    return;
  }
  const subject = encodeURIComponent(`Tarjouspyyntö: ${data.get('car')} ${data.get('year') || ''}`.trim());
  const body = encodeURIComponent([
    `Nimi: ${data.get('name')}`,
    `Puhelin: ${data.get('phone')}`,
    `Auto: ${data.get('car')}`,
    `Vuosimalli: ${data.get('year') || '-'}`,
    `Rekisteritunnus / moottori: ${data.get('vehicle') || '-'}`,
    '',
    'Oire tai haluttu työ:',
    data.get('message')
  ].join('\n'));
  window.location.href = `mailto:${CONTACT.email}?subject=${subject}&body=${body}`;
  status.textContent = `Sähköpostiohjelma avataan. Tarvittaessa soita: ${CONTACT.phone}`;
});
