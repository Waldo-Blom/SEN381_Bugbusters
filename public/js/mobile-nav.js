// Mobile navigation drawer for the shared app layout (app-layout-head/foot).
(function () {
  var sidebar = document.getElementById('app-sidebar');
  var backdrop = document.getElementById('nav-backdrop');
  var toggle = document.getElementById('nav-toggle');
  var closeBtn = document.getElementById('nav-close');

  if (!sidebar || !backdrop || !toggle) return;

  var desktop = window.matchMedia('(min-width: 1024px)');

  function isOpen() {
    return toggle.getAttribute('aria-expanded') === 'true';
  }

  function openNav() {
    sidebar.classList.remove('-translate-x-full');
    backdrop.classList.remove('hidden');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('overflow-hidden');
  }

  function closeNav() {
    sidebar.classList.add('-translate-x-full');
    backdrop.classList.add('hidden');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('overflow-hidden');
  }

  toggle.addEventListener('click', function () {
    isOpen() ? closeNav() : openNav();
  });

  if (closeBtn) closeBtn.addEventListener('click', closeNav);

  // Tap the backdrop to close
  backdrop.addEventListener('click', closeNav);

  // Following a nav link closes the drawer
  sidebar.querySelectorAll('nav a').forEach(function (link) {
    link.addEventListener('click', closeNav);
  });

  // Escape closes and returns focus to the toggle
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen()) {
      closeNav();
      toggle.focus();
    }
  });

  // If the viewport crosses into lg while open, reset state
  desktop.addEventListener('change', function (e) {
    if (e.matches) closeNav();
  });
})();
