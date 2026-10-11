(() => {
  'use strict';
  const moved = ['#miten', '#oppaat', '#kehityksessa', '#tekijasta'];
  if (location.pathname === '/' && moved.includes(location.hash)) {
    location.replace('/palvelu/' + location.hash);
    return;
  }
  const button = document.querySelector('.menu-button');
  const nav = document.querySelector('.main-nav');
  if (!button || !nav) return;
  function close(returnFocus = false) {
    nav.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
    if (returnFocus) button.focus();
  }
  button.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => close()));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('open')) close(true);
  });
  document.addEventListener('click', event => {
    if (!nav.contains(event.target) && !button.contains(event.target)) close();
  });
})();
