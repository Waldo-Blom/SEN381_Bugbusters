/* eslint-env browser */
document.querySelectorAll('[data-password-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    const password = document.getElementById(button.getAttribute('aria-controls'));
    if (!password) return;

    const isVisible = password.type === 'text';
    password.type = isVisible ? 'password' : 'text';
    button.textContent = isVisible ? 'Show' : 'Hide';
    button.setAttribute('aria-pressed', String(!isVisible));
    button.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
  });
});
