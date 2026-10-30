(() => {
  const primaryKey = 'hency-jewels-wishlist';
  const legacyKey = 'kanishk-gems-wishlist';

  const readWishlist = () => {
    try {
      let stored = JSON.parse(localStorage.getItem(primaryKey) || 'null');
      if (!stored) {
        stored = JSON.parse(localStorage.getItem(legacyKey) || '[]');
        if (Array.isArray(stored) && stored.length > 0) {
          localStorage.setItem(primaryKey, JSON.stringify(stored));
        }
      }
      return Array.isArray(stored) ? [...new Set(stored.filter((handle) => typeof handle === 'string' && handle))] : [];
    } catch (_) {
      return [];
    }
  };

  const writeWishlist = (items) => {
    try {
      localStorage.setItem(primaryKey, JSON.stringify(items));
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
      // The header icon intentionally has no hover tooltip. Product controls retain it.
      if (button.classList.contains('header__icon--wishlist')) {
        button.removeAttribute('data-wishlist-tooltip');
      } else {
        button.dataset.wishlistTooltip = action;
      }
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
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    container.setAttribute('aria-busy', 'true');
    const rootUrl = container.dataset.rootUrl || '/';

    const cardResults = await Promise.all(
      items.map(async (handle) => {
        try {
          const response = await fetch(`${rootUrl}products/${encodeURIComponent(handle)}?section_id=wishlist-card`);
          if (!response.ok) return null;
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const cardWrapper = doc.querySelector('.card-wrapper');
          if (!cardWrapper) return null;
          return {
            handle,
            html: `<li class="grid__item" data-wishlist-item="${handle}">${cardWrapper.outerHTML}</li>`
          };
        } catch (_) {
          return null;
        }
      })
    );

    const validResults = cardResults.filter(Boolean);
    if (validResults.length !== items.length) {
      writeWishlist(validResults.map((item) => item.handle));
    }

    if (!validResults.length) {
      container.innerHTML = '';
      if (empty) empty.hidden = false;
      container.removeAttribute('aria-busy');
      updateControls();
      return;
    }

    container.innerHTML = validResults.map((item) => item.html).join('');
    container.removeAttribute('aria-busy');
    updateControls();
  };

  document.addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-wishlist-add]');
    if (addButton) {
      event.preventDefault();
      const variantId = addButton.dataset.variantId;
      if (!variantId) return;
      addButton.disabled = true;
      const cart = document.querySelector('cart-notification, cart-drawer');
      const formData = new FormData();
      formData.append('id', variantId);
      formData.append('quantity', '1');
      if (cart) {
        formData.append('sections', cart.getSectionsToRender().map((section) => section.id));
        formData.append('sections_url', window.location.pathname);
        cart.setActiveElement?.(addButton);
      }
      fetch((window.routes && window.routes.cart_add_url) || '/cart/add.js', { method: 'POST', headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: formData })
        .then((response) => response.json())
        .then((data) => { if (!data.status && cart) cart.renderContents(data); })
        .finally(() => { addButton.disabled = false; });
      return;
    }
    const button = event.target.closest('[data-wishlist-toggle]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = button.dataset.productHandle;
    if (!handle) return;
    const items = readWishlist();
    const isRemoving = items.includes(handle);
    const next = isRemoving ? items.filter((item) => item !== handle) : [...items, handle];
    writeWishlist(next);
    updateControls();

    const wishlistGrid = document.querySelector('[data-wishlist-products]');
    if (wishlistGrid && isRemoving) {
      const itemEl = wishlistGrid.querySelector(`[data-wishlist-item="${handle}"]`);
      if (itemEl) {
        itemEl.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        itemEl.style.opacity = '0';
        itemEl.style.transform = 'scale(0.92)';
        setTimeout(() => {
          itemEl.remove();
          if (next.length === 0) {
            const empty = document.querySelector('[data-wishlist-empty]');
            if (empty) empty.hidden = false;
          }
        }, 250);
        return;
      }
    }

    if (wishlistGrid) {
      renderWishlist();
    }
  });

  document.addEventListener('DOMContentLoaded', () => { updateControls(); renderWishlist(); });
  window.addEventListener('storage', (event) => { if (event.key === primaryKey || event.key === legacyKey) { updateControls(); renderWishlist(); } });
})();
