import { Component } from '@theme/component';

/**
 * Comparison slider component for comparing two images
 *
 * @typedef {object} ComparisonSliderRefs
 * @property {HTMLElement} mediaWrapper - The container for the images
 * @property {HTMLInputElement} slider - The range input element
 * @property {HTMLElement} afterImage - The image that gets revealed
 *
 * @extends {Component<ComparisonSliderRefs>}
 *
 * @property {string[]} requiredRefs - Required refs: 'mediaWrapper', 'slider', and 'afterImage'
 */
export class ComparisonSliderComponent extends Component {
  requiredRefs = ['mediaWrapper', 'slider', 'afterImage'];
  dragController = null;
  dragState = null;

  /**
   * Called when component is added to DOM
   */
  connectedCallback() {
    super.connectedCallback();

    const { mediaWrapper } = this.refs;

    // Get orientation from media wrapper
    this.orientation = mediaWrapper.dataset.orientation || 'horizontal';

    // Initialize the position (no automatic hint animation on scroll — user drag only)
    this.sync();
    mediaWrapper.addEventListener('pointerdown', this.handlePointerDown, { passive: true });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.refs.mediaWrapper?.removeEventListener('pointerdown', this.handlePointerDown);
    this.stopDrag();
  }

  /**
   * Sync the CSS custom property with the input value
   */
  sync() {
    const { mediaWrapper, slider } = this.refs;

    const val = (Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min));
    const compareValue = Math.round(val * 100);

    mediaWrapper.style.setProperty('--compare', String(compareValue));
  }

  /**
   * Set the slider value and update display
   * @param {number} value - Value between 0-100 (0 = all after, 100 = all before)
   */
  setValue(value) {
    const { slider } = this.refs;
    if (!slider) return;

    slider.value = String(value);
    this.sync();
  }

  handlePointerDown = (event) => {
    const { mediaWrapper } = this.refs;
    if (!mediaWrapper || this.orientation !== 'horizontal') return;

    const rect = mediaWrapper.getBoundingClientRect();
    const compare = Number(mediaWrapper.style.getPropertyValue('--compare') || this.refs.slider.value || 50);
    const handleX = rect.left + (rect.width * compare) / 100;
    const hitZone = event.pointerType === 'touch' ? 44 : 28;

    if (Math.abs(event.clientX - handleX) > hitZone) return;

    this.stopDrag();
    this.dragController = new AbortController();
    this.dragState = {
      active: false,
      pointerId: event.pointerId,
      rect,
      startX: event.clientX,
      startY: event.clientY,
    };

    mediaWrapper.setPointerCapture?.(event.pointerId);
    document.addEventListener('pointermove', this.handlePointerMove, {
      passive: false,
      signal: this.dragController.signal,
    });
    document.addEventListener('pointerup', this.handlePointerUp, { signal: this.dragController.signal });
    document.addEventListener('pointercancel', this.handlePointerUp, { signal: this.dragController.signal });
  };

  handlePointerMove = (event) => {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;

    const dx = Math.abs(event.clientX - this.dragState.startX);
    const dy = Math.abs(event.clientY - this.dragState.startY);

    if (!this.dragState.active) {
      if (dy > dx && dy > 8) {
        this.stopDrag();
        return;
      }

      if (dx <= 8) return;
      this.dragState.active = true;
    }

    event.preventDefault();
    const value = ((event.clientX - this.dragState.rect.left) / this.dragState.rect.width) * 100;
    this.setValue(Math.max(0, Math.min(100, value)));
  };

  handlePointerUp = (event) => {
    if (this.dragState && event.pointerId !== this.dragState.pointerId) return;
    this.stopDrag();
  };

  stopDrag() {
    this.refs.mediaWrapper?.releasePointerCapture?.(this.dragState?.pointerId);
    this.dragController?.abort();
    this.dragController = null;
    this.dragState = null;
  }
}

// Register the custom element
if (!customElements.get('comparison-slider-component')) {
  customElements.define('comparison-slider-component', ComparisonSliderComponent);
}
