/* eslint-env browser */
(() => {
  const maxBytes = 5 * 1024 * 1024;
  document.querySelectorAll('[data-image-picker]').forEach((picker) => {
    const input = picker.querySelector('input[type=file]');
    const error = picker.querySelector('[role=alert]');
    const previews = picker.querySelector('[data-image-previews]');
    const form = input.closest('form');
    let urls = [];
    const clearPreviews = () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls = [];
      previews.replaceChildren();
    };
    const validate = () => {
      const files = Array.from(input.files);
      const limit = Number(picker.dataset.maxImages);
      let message = '';
      if (files.length > limit) message = `You can select ${limit} more image${limit === 1 ? '' : 's'} for this request.`;
      else if (files.some((file) => file.size > maxBytes)) message = 'Each image must be 5 MB or smaller.';
      else if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)))
        message = 'Only JPEG, PNG and WebP images are supported.';
      else if (form.hasAttribute('data-attachment-upload') && !files.length)
        message = 'Select at least one image.';
      error.textContent = message;
      input.setCustomValidity(message);
      return !message;
    };
    input.addEventListener('change', () => {
      clearPreviews();
      if (!validate()) return;
      Array.from(input.files).forEach((file) => {
        const figure = document.createElement('figure');
        const img = document.createElement('img');
        const caption = document.createElement('figcaption');
        const url = URL.createObjectURL(file);
        urls.push(url);
        img.src = url;
        img.alt = file.name;
        img.className = 'h-32 w-full rounded-lg border border-slate-200 object-contain';
        caption.textContent = file.name;
        caption.className = 'mt-1 break-words text-xs text-slate-500';
        figure.append(img, caption);
        previews.append(figure);
      });
    });
    form.addEventListener('submit', (event) => {
      if (!validate()) { event.preventDefault(); input.reportValidity(); }
    }, true);
    window.addEventListener('pagehide', clearPreviews);
  });

  document.querySelectorAll('[data-attachment-gallery]').forEach(async (gallery) => {
    const status = gallery.querySelector('[data-attachment-status]');
    try {
      const response = await fetch(`/requests/${gallery.dataset.requestId}/attachments`, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Images could not be loaded. Please reload the page.');
      const images = await response.json();
      status.textContent = images.length ? `${images.length} attached image${images.length === 1 ? '' : 's'}.` : 'No images attached yet.';
      const target = gallery.querySelector('[data-attachment-images]');
      images.forEach((image) => {
        const link = document.createElement('a');
        link.href = image.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const thumbnail = document.createElement('img');
        thumbnail.src = image.url;
        thumbnail.alt = image.name;
        thumbnail.loading = 'lazy';
        thumbnail.referrerPolicy = 'no-referrer';
        thumbnail.className = 'h-32 w-full rounded-lg border border-slate-200 object-contain';
        thumbnail.addEventListener('error', () => { thumbnail.alt = `${image.name} (unable to load image)`; });
        const name = document.createElement('span');
        name.textContent = image.name;
        name.className = 'mt-1 block break-words text-xs text-blue-600';
        link.append(thumbnail, name);
        target.append(link);
      });
      const picker = gallery.querySelector('[data-image-picker]');
      if (picker) {
        picker.dataset.maxImages = Math.max(0, 5 - images.length);
        if (images.length >= 5) gallery.querySelector('[data-attachment-upload]').hidden = true;
      }
    } catch (error) { status.textContent = error.message; }
  });
})();
