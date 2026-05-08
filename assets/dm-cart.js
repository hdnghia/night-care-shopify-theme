/* Dropmagic Asset | Version: 1.2.3 — request queue & null guards */
const dm_subscribers = {};

const DM_ON_CHANGE_DEBOUNCE_TIMER = 200;

const DM_PUB_SUB_EVENTS = {
  cartUpdate: 'cart-update',
  quantityUpdate: 'quantity-update',
  optionValueSelectionChange: 'option-value-selection-change',
  variantChange: 'variant-change',
  cartError: 'cart-error'
};

function dm_subscribe(eventName, callback) {
  if (dm_subscribers[eventName] === undefined) {
    dm_subscribers[eventName] = [];
  }

  dm_subscribers[eventName] = [...dm_subscribers[eventName], callback];

  return function unsubscribe() {
    dm_subscribers[eventName] = dm_subscribers[eventName].filter((cb) => {
      return cb !== callback;
    });
  };
}

function dm_publish(eventName, data) {
  if (dm_subscribers[eventName]) {
    const promises = dm_subscribers[eventName].map((callback) => callback(data));
    return Promise.all(promises);
  } else {
    return Promise.resolve();
  }
}

function dm_fetchConfig(type = 'json') {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: `application/${type}`
    }
  };
}

function dm_debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// CART DRAWER
class DMCartDrawer extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('keyup', (evt) => evt.code === 'Escape' && this.close());
    this.querySelector('#DM_CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
    this.setHeaderCartIconAccessibility();
  }

  setHeaderCartIconAccessibility() {
    const cartLink = document.querySelector('#cart-icon-button') ?? document.querySelector('cart-drawer-component > button');
    if (!cartLink) return;

    cartLink.removeAttribute('on:click');
    cartLink.removeAttribute('onclick');

    cartLink.setAttribute('role', 'button');
    cartLink.setAttribute('aria-haspopup', 'dialog');
    cartLink.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.open(cartLink);
    }, true);
    cartLink.addEventListener('keydown', (event) => {
      if (event.code.toUpperCase() === 'SPACE') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.open(cartLink);
      }
    }, true);
  }

  open(triggeredBy) {
    if (triggeredBy) this.setActiveElement(triggeredBy);
    const cartDrawerNote = this.querySelector('[id^="Details-"] summary');
    if (cartDrawerNote && !cartDrawerNote.hasAttribute('role'))
      this.setSummaryAccessibility(cartDrawerNote);
    // here the animation doesn't seem to always get triggered. A timeout seem to help
    setTimeout(() => {
      this.classList.add('animate', 'active');
    });

    this.addEventListener(
      'transitionend',
      () => {
        const containerToTrapFocusOn = this.classList.contains('dm-is-empty')
          ? this.querySelector('[data-role="drawer-empty"]')
          : document.querySelector('dm-cart-drawer #DM_CartDrawer');
        const focusElement =
          this.querySelector('[data-role="drawer-inner"]') || this.querySelector('[data-role="drawer-close"]');
        dm_trapFocus(containerToTrapFocusOn, focusElement);
      },
      { once: true }
    );

    document.body.classList.add('overflow-hidden');
  }

  close() {
    this.classList.remove('active');
    dm_removeTrapFocus(this.activeElement);
    document.body.classList.remove('overflow-hidden');
  }

  setSummaryAccessibility(cartDrawerNote) {
    cartDrawerNote.setAttribute('role', 'button');
    cartDrawerNote.setAttribute('aria-expanded', 'false');

    if (cartDrawerNote.nextElementSibling.getAttribute('id')) {
      cartDrawerNote.setAttribute('aria-controls', cartDrawerNote.nextElementSibling.id);
    }

    cartDrawerNote.addEventListener('click', (event) => {
      event.currentTarget.setAttribute(
        'aria-expanded',
        !event.currentTarget.closest('details').hasAttribute('open')
      );
    });

    cartDrawerNote.parentElement.addEventListener('keyup', dm_onKeyUpEscape);
  }

  renderContents(parsedState) {
    const drawerInner = this.querySelector('[data-role="drawer-inner"]');
    drawerInner.classList.contains('dm-is-empty') && drawerInner.classList.remove('dm-is-empty');
    this.productId = parsedState.id;

    this.getSectionsToRender().forEach((section) => {
      const sectionElement = section.selector
        ? document.querySelector(section.selector)
        : document.getElementById(section.id);

      if (!sectionElement) return;
      const newSection = this.getSectionInnerHTML(
        parsedState.sections[section.section],
        section.selector
      );
      sectionElement.innerHTML = newSection;
    });

    setTimeout(() => {
      this.querySelector('#DM_CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
      // Double rAF ensures the browser paints the initial translateX(100%) state
      // before we trigger the slide-in animation
      requestAnimationFrame(() => requestAnimationFrame(() => this.open()));
    });
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector)?.innerHTML;
  }

  getSectionsToRender() {
    return [
      {
        id: 'dm-cart-drawer',
        section: 'dm-cart-drawer',
        selector: 'dm-cart-drawer #DM_CartDrawer'
      },
      {
        id: 'dm-cart-count-bubble',
        section: 'dm-cart-icon-bubble'
      }
    ];
  }

  getSectionDOM(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
  }

  setActiveElement(element) {
    this.activeElement = element;
  }
}
customElements.define('dm-cart-drawer', DMCartDrawer);

// CART ITEMS
class DMCartItems extends HTMLElement {
  constructor() {
    super();

    // Request queue properties
    this.pendingUpdate = null;
    this.isProcessing = false;

    // Debounced handler for manual input typing
    const debouncedOnChange = dm_debounce((event) => {
      this.onChange(event);
    }, DM_ON_CHANGE_DEBOUNCE_TIMER);

    this.addEventListener('change', debouncedOnChange.bind(this));

    // Immediate handler for button clicks (no debounce)
    this.addEventListener('dm:qty-update', (event) => {
      this.onChange(event);
    });
  }

  // Re-query each time — cached reference goes stale after innerHTML replacement
  get lineItemStatusElement() {
    return document.querySelector('dm-cart-drawer #DM_CartDrawer-LineItemStatus');
  }

  cartUpdateUnsubscriber = undefined;

  connectedCallback() {
    this.cartUpdateUnsubscriber = dm_subscribe(DM_PUB_SUB_EVENTS.cartUpdate, (event) => {
      if (event.source === 'cart-items') {
        return;
      }
      this.onCartUpdate();
    });
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  onChange(event) {
    this.updateQuantity(
      event.target.dataset.index,
      event.target.value,
      document.activeElement.getAttribute('name')
    );
  }

  onCartUpdate() {
    fetch('/cart?section_id=main-cart-items')
      .then((response) => response.text())
      .then((responseText) => {
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        const sourceQty = html.querySelector('cart-items');
        if (sourceQty?.innerHTML) {
          this.innerHTML = sourceQty.innerHTML;
        }
      })
      .catch((e) => {
        console.error('Error updating cart items', e);
      });
  }

  getSectionsToRender() {
    return [
      {
        id: 'dm-cart-count-bubble',
        section: 'dm-cart-icon-bubble'
      }
    ];
  }

  updateQuantity(line, quantity, name) {
    // Optimistic removal: animate out immediately
    if (parseInt(quantity) === 0) {
      const item =
        this.querySelector(`#DM_CartDrawer-Item-${line}`) ||
        this.querySelector(`#CartItem-${line}`);
      if (item) {
        item.style.maxHeight = item.scrollHeight + 'px';
        item.offsetHeight; // force reflow so transition starts from current height
        item.classList.add('dm-cart-item--removing');
      }
    }

    // Coalesce updates: latest wins
    this.pendingUpdate = { line, quantity, name };
    this._processQueue();
  }

  _processQueue() {
    if (this.isProcessing || !this.pendingUpdate) return;

    this.isProcessing = true;
    const { line, quantity, name } = this.pendingUpdate;
    this.pendingUpdate = null;

    this.enableLoading(line);

    const body = JSON.stringify({
      line,
      quantity,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname
    });

    fetch(`${routes.cart_change_url}`, { ...dm_fetchConfig(), ...{ body } })
      .then((response) => response.text())
      .then((state) => {
        const parsedState = JSON.parse(state);
        const quantityElement =
          document.querySelector(`dm-cart-items #Quantity-${line}`) ||
          document.querySelector(`dm-cart-drawer #Drawer-quantity-${line}`);
        const items = document.querySelectorAll('[data-role="cart-item"]');

        if (parsedState.errors) {
          if (quantityElement) {
            quantityElement.value = quantityElement.getAttribute('value');
          }
          this.updateLiveRegions(line, parsedState.errors);
          return;
        }

        this.classList.toggle('dm-is-empty', parsedState.item_count === 0);
        const cartDrawerWrapper = document.querySelector('dm-cart-drawer');
        const cartFooter = document.getElementById('main-cart-footer');

        if (cartFooter) cartFooter.classList.toggle('dm-is-empty', parsedState.item_count === 0);
        if (cartDrawerWrapper)
          cartDrawerWrapper.classList.toggle('dm-is-empty', parsedState.item_count === 0);

        // Save scroll position before DOM replacement
        const scrollContainer = document.querySelector('[data-role="items-scroll"]');
        const savedScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

        this.getSectionsToRender().forEach((section) => {
          const elementToReplace = section.specialSelector
            ? document.querySelector(section.specialSelector)
            : document.getElementById(section.id)?.querySelector(section.selector) ||
              document.getElementById(section.id);

          if (elementToReplace) {
            const newSection = this.getSectionInnerHTML(
              parsedState.sections[section.section],
              section.selector
            );
            elementToReplace.innerHTML = newSection;
          }
        });

        // Restore scroll position after DOM replacement
        const scrollContainerAfter = document.querySelector('[data-role="items-scroll"]');
        if (scrollContainerAfter) scrollContainerAfter.scrollTop = savedScrollTop;

        const updatedValue = parsedState.items[line - 1]
          ? parsedState.items[line - 1].quantity
          : undefined;
        let message = '';
        if (
          quantityElement &&
          items.length === parsedState.items.length &&
          updatedValue !== parseInt(quantityElement.value)
        ) {
          if (typeof updatedValue === 'undefined') {
            message = window.cartStrings?.error || '';
          } else {
            message = (window.cartStrings?.quantityError || '').replace('[quantity]', updatedValue);
          }
        }
        this.updateLiveRegions(line, message);

        const lineItem =
          document.querySelector(`dm-cart-items #CartItem-${line}`) ||
          document.querySelector(`dm-cart-drawer #DM_CartDrawer-Item-${line}`);

        if (lineItem && lineItem.querySelector(`[name="${name}"]`)) {
          cartDrawerWrapper
            ? dm_trapFocus(cartDrawerWrapper, lineItem.querySelector(`[name="${name}"]`))
            : lineItem.querySelector(`[name="${name}"]`).focus();
        } else if (parsedState.item_count === 0 && cartDrawerWrapper) {
          dm_trapFocus(
            cartDrawerWrapper.querySelector('[data-role="drawer-empty"]'),
            cartDrawerWrapper.querySelector('a')
          );
        } else if (document.querySelector('dm-cart-items [data-role="cart-item"]') && cartDrawerWrapper) {
          dm_trapFocus(cartDrawerWrapper, document.querySelector('dm-cart-items [data-role="cart-item-name"]'));
        }
        dm_publish(DM_PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items' });
      })
      .catch((err) => {
        console.error('Error updating quantity', err);
        // Revert optimistic removal
        const item =
          this.querySelector(`#DM_CartDrawer-Item-${line}`) ||
          this.querySelector(`#CartItem-${line}`);
        if (item) item.classList.remove('dm-cart-item--removing');
        const errors =
          document.querySelector('dm-cart-items #cart-errors') ||
          document.querySelector('dm-cart-drawer #DM_CartDrawer-CartErrors');
        if (errors) errors.textContent = window.cartStrings?.error || '';
      })
      .finally(() => {
        this.isProcessing = false;
        if (this.pendingUpdate) {
          this._processQueue();
        } else {
          this.disableLoading(line);
        }
      });
  }

  updateLiveRegions(line, message) {
    const lineItemError =
      document.querySelector(`dm-cart-items #Line-item-error-${line}`) ||
      document.querySelector(`dm-cart-drawer #CartDrawer-LineItemError-${line}`);
    const errorText = lineItemError?.querySelector('[data-role="error-text"]');
    if (errorText) errorText.innerHTML = message;

    const statusEl = this.lineItemStatusElement;
    if (statusEl) statusEl.setAttribute('aria-hidden', true);

    const cartStatus =
      document.querySelector('dm-cart-items #cart-live-region-text') ||
      document.querySelector('dm-cart-drawer #CartDrawer-LiveRegionText');
    if (cartStatus) {
      cartStatus.setAttribute('aria-hidden', false);
      setTimeout(() => {
        cartStatus.setAttribute('aria-hidden', true);
      }, 1000);
    }
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector)?.innerHTML;
  }

  enableLoading(line) {
    const lineItem =
      this.querySelector(`#DM_CartDrawer-Item-${line}`) ||
      this.querySelector(`#CartItem-${line}`);
    if (lineItem) lineItem.classList.add('cart__items--disabled');

    const statusEl = this.lineItemStatusElement;
    if (statusEl) statusEl.setAttribute('aria-hidden', false);
  }

  disableLoading(line) {
    const lineItem =
      this.querySelector(`#DM_CartDrawer-Item-${line}`) ||
      this.querySelector(`#CartItem-${line}`);
    if (lineItem) lineItem.classList.remove('cart__items--disabled');

    const statusEl = this.lineItemStatusElement;
    if (statusEl) statusEl.setAttribute('aria-hidden', true);
  }
}

customElements.define('dm-cart-items', DMCartItems);

class DMCartDrawerItems extends DMCartItems {
  getSectionsToRender() {
    return [
      {
        id: 'DM_CartDrawer',
        section: 'dm-cart-drawer',
        selector: '[data-role="drawer-inner"]',
        specialSelector: 'dm-cart-drawer #DM_CartDrawer [data-role="drawer-inner"]'
      },
      {
        id: 'dm-cart-count-bubble',
        section: 'dm-cart-icon-bubble'
      }
    ];
  }
}

customElements.define('dm-cart-drawer-items', DMCartDrawerItems);

// CART NOTE
if (!customElements.get('dm-cart-note')) {
  customElements.define(
    'dm-cart-note',
    class DMCartNote extends HTMLElement {
      constructor() {
        super();

        this.addEventListener(
          'change',
          dm_debounce((event) => {
            const body = JSON.stringify({ note: event.target.value });
            fetch(`${routes.cart_update_url}`, {
              ...dm_fetchConfig(),
              ...{ body }
            });
          }, DM_ON_CHANGE_DEBOUNCE_TIMER)
        );
      }
    }
  );
}

// CART REMOVE BUTTON
class DMCartRemoveButton extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('click', (event) => {
      event.preventDefault();
      const cartItems = this.closest('dm-cart-items') || this.closest('dm-cart-drawer-items');
      cartItems.updateQuantity(this.dataset.index, 0);
    });
  }
}
customElements.define('dm-cart-remove-button', DMCartRemoveButton);

// QUANTITY INPUT
class DmQuantityInput extends HTMLElement {
  constructor() {
    super();
    this.input = this.querySelector('input');
    this.changeEvent = new Event('change', { bubbles: true });
    this.qtyUpdateEvent = new Event('dm:qty-update', { bubbles: true });
    this.input.addEventListener('change', this.onInputChange.bind(this));
    this.querySelectorAll('button').forEach((button) =>
      button.addEventListener('click', this.onButtonClick.bind(this))
    );
  }

  quantityUpdateUnsubscriber = undefined;

  connectedCallback() {
    this.validateQtyRules();
    this.quantityUpdateUnsubscriber = dm_subscribe(
      DM_PUB_SUB_EVENTS.quantityUpdate,
      this.validateQtyRules.bind(this)
    );
  }

  disconnectedCallback() {
    if (this.quantityUpdateUnsubscriber) {
      this.quantityUpdateUnsubscriber();
    }
  }

  onInputChange(event) {
    this.validateQtyRules();
  }

  onButtonClick(event) {
    event.preventDefault();
    const previousValue = this.input.value;

    const name = event?.target?.name ?? event?.target?.parentElement?.name ?? event?.target?.parentElement?.parentElement?.name;


    if (name === 'plus') {
      if (parseInt(this.input.dataset.min) > parseInt(this.input.step) && this.input.value == 0) {
        this.input.value = this.input.dataset.min;
      } else {
        this.input.stepUp();
      }
    } else {
      this.input.stepDown();
    }

    if (previousValue !== this.input.value) this.input.dispatchEvent(this.qtyUpdateEvent);

    if (this.input.dataset.min === previousValue && name === 'minus') {
      this.input.value = parseInt(this.input.min);
    }
  }

  validateQtyRules() {
    const value = parseInt(this.input.value);
    if (this.input.min) {
      const buttonMinus = this.querySelector("[data-role='qty-btn'][name='minus']");
      buttonMinus.classList.toggle('disabled', parseInt(value) <= parseInt(this.input.min));
    }
    if (this.input.max) {
      const max = parseInt(this.input.max);
      const buttonPlus = this.querySelector("[data-role='qty-btn'][name='plus']");
      buttonPlus.classList.toggle('disabled', value >= max);
    }
  }
}

customElements.define('dm-quantity-input', DmQuantityInput);

// CART DISCOUNT
function dm_handleDiscountForm(e) {
  e.preventDefault();

  const discountInput = e.target.querySelector('[name=cart-discount-field]');
  const discountError = e.target.querySelector('[data-role="discount-error"]');
  const discountValue = discountInput.value;
  if (discountValue === undefined || discountValue.length === 0) {
    discountError.style.display = 'block';
    return;
  }
  discountError.style.display = 'none';
  const checkoutBaseUrl = '/checkout?discount=';
  const newCheckoutUrl = checkoutBaseUrl + discountValue;
  window.location.href = newCheckoutUrl;
}

function dm_handleDiscountFormChange(e) {
  const discountErrors = document.querySelectorAll('[data-role="discount-error"]');
  discountErrors.forEach((error) => {
    error.style.display = 'none';
  });
}

// HELPER FUNCTIONS
const dm_trapFocusHandlers = {};

function dm_getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll(
      "summary, a[href], button:enabled, [tabindex]:not([tabindex^='-']), [draggable], area, input:not([type=hidden]):enabled, select:enabled, textarea:enabled, object, iframe"
    )
  );
}

function dm_removeTrapFocus(elementToFocus = null) {
  document.removeEventListener('focusin', dm_trapFocusHandlers.focusin);
  document.removeEventListener('focusout', dm_trapFocusHandlers.focusout);
  document.removeEventListener('keydown', dm_trapFocusHandlers.keydown);

  if (elementToFocus) elementToFocus.focus();
}

function dm_trapFocus(container, elementToFocus = container) {
  const elements = dm_getFocusableElements(container);
  const first = elements[0];
  const last = elements[elements.length - 1];

  dm_removeTrapFocus();

  dm_trapFocusHandlers.focusin = (event) => {
    if (event.target !== container && event.target !== last && event.target !== first) return;

    document.addEventListener('keydown', dm_trapFocusHandlers.keydown);
  };

  dm_trapFocusHandlers.focusout = function () {
    document.removeEventListener('keydown', dm_trapFocusHandlers.keydown);
  };

  dm_trapFocusHandlers.keydown = function (event) {
    if (event.code.toUpperCase() !== 'TAB') return; // If not TAB key
    // On the last focusable element and tab forward, focus the first element.
    if (event.target === last && !event.shiftKey) {
      event.preventDefault();
      first.focus();
    }

    //  On the first focusable element and tab backward, focus the last element.
    if ((event.target === container || event.target === first) && event.shiftKey) {
      event.preventDefault();
      last.focus();
    }
  };

  document.addEventListener('focusout', dm_trapFocusHandlers.focusout);
  document.addEventListener('focusin', dm_trapFocusHandlers.focusin);

  elementToFocus.focus();

  if (
    elementToFocus.tagName === 'INPUT' &&
    ['search', 'text', 'email', 'url'].includes(elementToFocus.type) &&
    elementToFocus.value
  ) {
    elementToFocus.setSelectionRange(0, elementToFocus.value.length);
  }
}

function dm_onKeyUpEscape(event) {
  if (event.code.toUpperCase() !== 'ESCAPE') return;

  const openDetailsElement = event.target.closest('details[open]');
  if (!openDetailsElement) return;

  const summaryElement = openDetailsElement.querySelector('summary');
  openDetailsElement.removeAttribute('open');
  summaryElement.setAttribute('aria-expanded', false);
  summaryElement.focus();
}
