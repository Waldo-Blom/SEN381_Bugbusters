/* eslint-env browser */
(() => {
  const toggle = document.querySelector('[data-mobile-nav-toggle]');
  const menu = document.querySelector('[data-mobile-nav]');

  if (!toggle || !menu) return;

  const menuIcon = toggle.querySelector('[data-menu-icon]');
  const closeIcon = toggle.querySelector('[data-close-icon]');

  const setOpen = (open) => {
    menu.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    menuIcon?.classList.toggle('hidden', open);
    closeIcon?.classList.toggle('hidden', !open);
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
})();
