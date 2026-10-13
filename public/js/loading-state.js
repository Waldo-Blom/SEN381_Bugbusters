/* eslint-env browser */
(() => {
  const progress = document.querySelector('[data-page-loading]');
  const status = document.querySelector('[data-page-loading-status]');
  let navigationStarted = false;

  const showPageLoading = () => {
    if (navigationStarted) return;
    navigationStarted = true;
    if (progress) progress.classList.remove('hidden');
    if (status) status.textContent = 'Loading page';
  };

  const loadingLabelFor = (button) => {
    if (button.dataset.loadingText) return button.dataset.loadingText;

    const label = button.textContent.trim();
    const match = label.match(/^(Submit|Save|Apply|Upload|Assign|Reassign|Approve|Reject|Close|Start|Post|Sign in|Sign out|Create|Update|Delete)(.*)$/i);
    if (!match) return 'Please wait...';

    const verb = match[1].toLowerCase();
    const progressive = {
      submit: 'Submitting',
      save: 'Saving',
      apply: 'Applying',
      upload: 'Uploading',
      assign: 'Assigning',
      reassign: 'Reassigning',
      approve: 'Approving',
      reject: 'Rejecting',
      close: 'Closing',
      start: 'Starting',
      post: 'Posting',
      'sign in': 'Signing in',
      'sign out': 'Signing out',
      create: 'Creating',
      update: 'Updating',
      delete: 'Deleting',
    };
    return `${progressive[verb]}${match[2]}...`;
  };

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;
    if (form.method.toUpperCase() === 'GET' || form.hasAttribute('data-no-loading')) return;
    if (event.submitter?.name === 'demoRole') return;

    if (form.dataset.submitting === 'true') {
      event.preventDefault();
      return;
    }
    form.dataset.submitting = 'true';

    const button = event.submitter || form.querySelector('button[type="submit"], button:not([type]), input[type="submit"]');
    if (button && !button.disabled) {
      // Disabled submit buttons are omitted from the request body. Preserve the
      // selected submitter's name and value before disabling it for feedback.
      if (button.name) {
        const preservedValue = document.createElement('input');
        preservedValue.type = 'hidden';
        preservedValue.name = button.name;
        preservedValue.value = button.value;
        form.append(preservedValue);
      }
      if (button instanceof HTMLInputElement) button.value = loadingLabelFor(button);
      else button.textContent = loadingLabelFor(button);
      button.disabled = true;
      button.classList.add('opacity-50', 'cursor-not-allowed');
    }
    showPageLoading();
  });

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;

    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin) return;
    if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash) return;
    if (destination.href === window.location.href) return;
    showPageLoading();
  });
})();
