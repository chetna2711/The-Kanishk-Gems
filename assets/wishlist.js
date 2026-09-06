(() => {
  const storageKey = 'kanishk-gems-wishlist';

  const readWishlist = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(stored) ? [...new Set(stored.filter((handle) => typeof handle === 'string' && handle))] : [];
    } catch (_) {
      return [];
    }
  };

  const writeWishlist = (items) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch (_) {
      // The storefront continues to work even if browser storage is unavailable.
    }
  };

  const updateControls = () => {
    const items = readWishlist();
    document.querySelectorAll('[data-wishlist-count]').forEach((bubble) => {
      bubble.textContent = items.length;
      bubble.hidden = items.length === 0;
    });
    document.querySelectorAll('[data-wishlist-toggle]').forEach((button) => {
      const active = items.includes(button.dataset.productHandle);
      button.classList.toggle('is-wishlisted', active);
      button.setAttribute('aria-pressed', active);
      const action = active ? 'Remove from wishlist' : 'Add to wishlist';
      button.setAttribute('aria-label', action);
      button.dataset.wishlistTooltip = action;
      button.removeAttribute('title');
      const label = button.querySelector('[data-wishlist-button-label]');
      if (label) label.textContent = active ? 'Remove from wishlist' : 'Add to wishlist';
    });
  };

  const renderWishlist = async () => {
    const container = document.querySelector('[data-wishlist-products]');
    if (!container) return;
    const items = readWishlist();
    const empty = document.querySelector('[data-wishlist-empty]');
    if (!items.length) {
      container.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    container.setAttribute('aria-busy', 'true');
    const rootUrl = container.dataset.rootUrl || '/';
    const products = await Promise.all(items.map(async (handle) => {
      try {
        const response = await fetch(`${rootUrl}products/${encodeURIComponent(handle)}.js`);
        return response.ok ? await response.json() : null;
      } catch (_) { return null; }
    }));
    const valid = products.filter(Boolean);
    if (valid.length !== items.length) writeWishlist(valid.map((product) => product.handle));
    if (!valid.length) {
      container.innerHTML = '';
      empty.hidden = false;
      container.removeAttribute('aria-busy');
      updateControls();
      return;
    }
    const heartIcon = '<svg class="icon-wishlist" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" /></svg>';
    container.innerHTML = valid.map((product) => {
      const image = product.featured_image || product.images?.[0] || '';
      const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
      const title = escapeHtml(product.title);
      const price = (product.price / 100).toLocaleString(undefined, { style: 'currency', currency: container.dataset.currency || 'INR' });
      return `<article class="card-wrapper product-card-wrapper"><div class="card card--standard card--media"><div class="card__inner ratio" style="--ratio-percent: 100%;"><div class="card__media"><a href="${product.url}" class="media media--transparent">${image ? `<img src="${image}" alt="${title}" loading="lazy" width="600" height="600">` : ''}</a></div></div><button type="button" class="product-card-wishlist" data-wishlist-toggle data-product-handle="${product.handle}" data-product-url="${product.url}" data-wishlist-tooltip="Remove from wishlist" aria-label="Remove from wishlist" aria-pressed="true">${heartIcon}</button><div class="card__content"><div class="card__information"><h2 class="card__heading h5"><a href="${product.url}" class="full-unstyled-link">${title}</a></h2><div class="card-information"><div class="price"><span class="price-item price-item--regular">${price}</span></div></div></div></div></div></article>`;
    }).join('');
    container.removeAttribute('aria-busy');
    updateControls();
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-wishlist-toggle]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = button.dataset.productHandle;
    if (!handle) return;
    const items = readWishlist();
    const next = items.includes(handle) ? items.filter((item) => item !== handle) : [...items, handle];
    writeWishlist(next);
    updateControls();
    renderWishlist();
  });

  document.addEventListener('DOMContentLoaded', () => { updateControls(); renderWishlist(); });
  window.addEventListener('storage', (event) => { if (event.key === storageKey) { updateControls(); renderWishlist(); } });
})();
