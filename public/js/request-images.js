/* eslint-env browser */
(() => {
  const maxBytes = 5 * 1024 * 1024;
  document.querySelectorAll('[data-image-picker]').forEach((picker) => {
    const input = picker.querySelector('input[type=file]');
    const error = picker.querySelector('[role=alert]');
    const previews = picker.querySelector('[data-image-previews]');
    const form = input.closest('form');
    let urls = [];
    const confirmation = document.createElement('dialog');
    confirmation.className = 'm-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50';
    confirmation.setAttribute('aria-labelledby', 'remove-image-title');
    confirmation.innerHTML = `
      <div class="px-6 pb-6 pt-2">
        <div class="flex justify-end">
          <button type="button" data-close-dialog aria-label="Close confirmation" class="flex h-8 w-8 items-center justify-center rounded-full text-xl font-semibold leading-none text-black hover:bg-slate-100">×</button>
        </div>
        <h2 id="remove-image-title" class="mt-4 text-lg font-semibold">Remove this image?</h2>
        <p data-remove-image-message class="mt-2 break-words text-sm text-slate-600"></p>
        <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" data-keep-image class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Keep image</button>
          <button type="button" data-confirm-remove class="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700">Remove image</button>
        </div>
      </div>`;
    picker.append(confirmation);
    let confirmRemoval;
    confirmation.querySelector('[data-close-dialog]').addEventListener('click', () => confirmation.close());
    confirmation.querySelector('[data-keep-image]').addEventListener('click', () => confirmation.close());
    confirmation.querySelector('[data-confirm-remove]').addEventListener('click', () => {
      confirmation.close();
      if (confirmRemoval) confirmRemoval();
    });
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
      Array.from(input.files).forEach((file, index) => {
        const figure = document.createElement('figure');
        const img = document.createElement('img');
        const caption = document.createElement('figcaption');
        const remove = document.createElement('button');
        const url = URL.createObjectURL(file);
        urls.push(url);
        img.src = url;
        img.alt = file.name;
        img.className = 'h-32 w-full rounded-lg border border-slate-200 object-contain';
        caption.textContent = file.name;
        caption.className = 'mt-1 break-words text-xs text-slate-500';
        remove.type = 'button';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove ${file.name}`);
        remove.className = 'absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/75 text-lg font-semibold leading-none text-white hover:bg-slate-900';
        remove.addEventListener('click', () => {
          confirmation.querySelector('[data-remove-image-message]').textContent = `Are you sure you want to remove “${file.name}” from this request?`;
          confirmRemoval = () => {
            const remaining = Array.from(input.files).filter((_, fileIndex) => fileIndex !== index);
            const selection = new DataTransfer();
            remaining.forEach((remainingFile) => selection.items.add(remainingFile));
            input.files = selection.files;
            clearPreviews();
            validate();
            if (input.files.length) input.dispatchEvent(new Event('change'));
          };
          confirmation.showModal();
        });
        figure.className = 'relative';
        figure.append(img, caption, remove);
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
      const response = await fetch(`/requests/${gallery.dataset.requestId}/attachments`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
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
