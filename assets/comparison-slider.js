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
}

// Register the custom element
if (!customElements.get('comparison-slider-component')) {
  customElements.define('comparison-slider-component', ComparisonSliderComponent);
}
