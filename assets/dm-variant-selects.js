/* Dropmagic Asset | Version: 1.5.0 */
if (!customElements.get("dm-variant-selects")) {
  customElements.define(
    "dm-variant-selects",
    class VariantSelects extends HTMLElement {
      constructor() {
        super();
        this.addEventListener("change", this.onVariantChange);
      }

      connectedCallback() {
        // Defer to ensure children are parsed before querying radios/labels
        requestAnimationFrame(() => this.initVariantLabelHighlight());
      }

      onVariantChange(event) {
        this.updateOptions();
        this.updateMasterId();
        this.updateSelectedSwatchValue(event);
        this.toggleAddButton(true, "", false);
        this.updatePickupAvailability();
        this.removeErrorMessage();
        this.updateVariantStatuses();

        if (!this.currentVariant) {
          this.toggleAddButton(true, "", true);
          this.setUnavailable();
        } else {
          this.updateMedia();
          this.updateURL();
          this.updateVariantInput();
          this.renderProductInfo();
          this.updateShareUrl();
        }
      }

      updateOptions() {
        this.options = Array.from(
          this.querySelectorAll("select, fieldset"),
          (element) => {
            if (element.tagName === "SELECT") {
              return element.value;
            }
            if (element.tagName === "FIELDSET") {
              return Array.from(element.querySelectorAll("input")).find(
                (radio) => radio.checked
              )?.value;
            }
          }
        );
      }

      initVariantLabelHighlight() {
        const root = this;

        /* helper ─────────────────────────────────────────────── */
        const applyLabelState = (label, isSelected) => {
          const selectedVariant = label.getAttribute('data-selected-variant');
          const unselectedVariant = label.getAttribute('data-unselected-variant');
          if (selectedVariant && unselectedVariant) {
            label.setAttribute('data-variant_button-variant', isSelected ? selectedVariant : unselectedVariant);
          }
        };

        /* A. First paint – use HTML checked attribute (not .checked property)
              because other scripts may reset the property before this runs */
        root.querySelectorAll('input[type="radio"]').forEach(radio => {
          const label = root.querySelector(`label[for="${radio.id}"]`);
          if (label) applyLabelState(label, radio.hasAttribute('checked'));
        });

        /* B. Listen for future changes (event delegation) */
        root.addEventListener('change', e => {
          const radio = e.target;
          if (!radio.matches('input[type="radio"]')) return;

          const fieldset = radio.closest('fieldset');
          if (!fieldset) return;

          fieldset.querySelectorAll('input[type="radio"]').forEach(r => {
            const label = fieldset.querySelector(`label[for="${r.id}"]`);
            if (label) applyLabelState(label, r.checked);
          });
        });
      }

      updateMasterId() {
        this.currentVariant = this.getVariantData().find((variant) => {
          return !variant.options
            .map((option, index) => {
              return this.options[index] === option;
            })
            .includes(false);
        });
      }

      updateSelectedSwatchValue({ target }) {
        const { name, value, tagName } = target;

        if (tagName === "SELECT" && target.selectedOptions.length) {
          const swatchValue =
            target.selectedOptions[0].dataset.optionSwatchValue;
          const selectedDropdownSwatchValue = this.querySelector(
            `[data-selected-dropdown-swatch="${name}"] > .swatch`
          );
          if (!selectedDropdownSwatchValue) return;
          if (swatchValue) {
            selectedDropdownSwatchValue.style.setProperty(
              "--swatch--background",
              swatchValue
            );
            selectedDropdownSwatchValue.classList.remove("swatch--unavailable");
          } else {
            selectedDropdownSwatchValue.style.setProperty(
              "--swatch--background",
              "unset"
            );
            selectedDropdownSwatchValue.classList.add("swatch--unavailable");
          }
        } else if (tagName === "INPUT" && target.type === "radio") {
          const selectedSwatchValue = this.querySelector(
            `[data-selected-swatch-value="${name}"]`
          );
          if (selectedSwatchValue) selectedSwatchValue.innerHTML = value;
        }
      }

      updateMedia() {
        if (!this.currentVariant || !this.currentVariant.featured_media) return;

        console.log("this.currentVariant.featured_media", this.currentVariant);

        // Update main product hero image src
        const heroImage = document.querySelector('div#product-hero-main-image > img');
        if (heroImage) {
          heroImage.src = this.currentVariant.featured_media.preview_image.src;

          // Scroll logic to ensure the image is in view
          window.setTimeout(() => {
            const activeMediaRect = heroImage.getBoundingClientRect();
            // Don't scroll if the image is already in view
            if (activeMediaRect.top > -0.5 && activeMediaRect.bottom < window.innerHeight) return;
            const top = activeMediaRect.top + window.scrollY;
            window.scrollTo({ top, behavior: 'smooth' });
          });
        }

        // Commented out the rest of the original function as per instructions
        /*
        const mediaGalleries = document.querySelectorAll(
          `[id^="MediaGallery-${this.dataset.section}"]`
        );
        mediaGalleries.forEach((mediaGallery) =>
          mediaGallery.setActiveMedia(
            `${this.dataset.section}-${this.currentVariant.featured_media.id}`,
            true
          )
        );

        const modalContent = document.querySelector(
          `#ProductModal-${this.dataset.section} .product-media-modal__content`
        );
        if (!modalContent) return;
        const newMediaModal = modalContent.querySelector(
          `[data-media-id="${this.currentVariant.featured_media.id}"]`
        );
        modalContent.prepend(newMediaModal);
        */
      }

      updateURL() {
        if (!this.currentVariant || this.dataset.updateUrl === "false") return;
        window.history.replaceState(
          {},
          "",
          `${this.dataset.url}?variant=${this.currentVariant.id}`
        );
      }

      updateShareUrl() {
        const shareButton = document.getElementById(
          `Share-${this.dataset.section}`
        );
        if (!shareButton || !shareButton.updateUrl) return;
        shareButton.updateUrl(
          `${window.shopUrl}${this.dataset.url}?variant=${this.currentVariant.id}`
        );
      }

      updateVariantInput() {
        const productForms = document.querySelectorAll(
          `#product-form-${this.dataset.section}, #product-form-installment-${this.dataset.section}, dm-product-form form`
        );
        productForms.forEach((productForm) => {
          const input = productForm.querySelector('input[name="id"]');
          input.value = this.currentVariant.id;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
      }

      updateVariantStatuses() {
        const selectedOptionOneVariants = this.variantData.filter(
          (variant) => this.querySelector(":checked").value === variant.option1
        );
        const inputWrappers = [
          ...this.querySelectorAll("fieldset"),
        ];
        inputWrappers.forEach((option, index) => {
          if (index === 0) return;
          const optionInputs = [
            ...option.querySelectorAll('input[type="radio"], option'),
          ];
          const previousOptionSelected =
            inputWrappers[index - 1].querySelector(":checked").value;
          const availableOptionInputsValue = selectedOptionOneVariants
            .filter(
              (variant) =>
                variant.available &&
                variant[`option${index}`] === previousOptionSelected
            )
            .map((variantOption) => variantOption[`option${index + 1}`]);
          this.setInputAvailability(optionInputs, availableOptionInputsValue);
        });
      }

      setInputAvailability(elementList, availableValuesList) {
        elementList.forEach((element) => {
          const value = element.getAttribute("value");
          const availableElement = availableValuesList.includes(value);

          if (element.tagName === "INPUT") {
            element.classList.toggle("disabled", !availableElement);
          } else if (element.tagName === "OPTION") {
            element.innerText = availableElement
              ? value
              : window.variantStrings?.unavailable_with_option?.replace(
                  "[value]",
                  value
                );
          }
        });
      }

      updatePickupAvailability() {
        const pickUpAvailability = document.querySelector(
          "pickup-availability"
        );
        if (!pickUpAvailability) return;

        if (this.currentVariant && this.currentVariant.available) {
          pickUpAvailability.fetchAvailability(this.currentVariant.id);
        } else {
          pickUpAvailability.removeAttribute("available");
          pickUpAvailability.innerHTML = "";
        }
      }

      removeErrorMessage() {
        const section = this.closest("section");
        if (!section) return;

        const productForm = section.querySelector("dm-product-form");
        if (productForm) productForm.handleErrorMessage();
      }

      renderProductInfo() {
        const requestedVariantId = this.currentVariant.id;
        const sectionId = this.dataset.originalSection
          ? this.dataset.originalSection
          : this.dataset.section;
        fetch(
          `${this.dataset.url}?variant=${requestedVariantId}&section_id=${
            this.dataset.originalSection
              ? this.dataset.originalSection
              : this.dataset.section
          }`
        )
          .then((response) => response.text())
          .then((responseText) => {
            if (this.currentVariant.id !== requestedVariantId) return;

            const html = new DOMParser().parseFromString(
              responseText,
              "text/html"
            );
            const destination = document.getElementById(
              `price-${this.dataset.section}`
            );
            const source = html.getElementById(
              `price-${
                this.dataset.originalSection
                  ? this.dataset.originalSection
                  : this.dataset.section
              }`
            );
            const skuSource = html.getElementById(
              `Sku-${
                this.dataset.originalSection
                  ? this.dataset.originalSection
                  : this.dataset.section
              }`
            );
            const skuDestination = document.getElementById(
              `Sku-${this.dataset.section}`
            );
            const inventorySource = html.getElementById(
              `Inventory-${
                this.dataset.originalSection
                  ? this.dataset.originalSection
                  : this.dataset.section
              }`
            );
            const inventoryDestination = document.getElementById(
              `Inventory-${this.dataset.section}`
            );

            const volumePricingSource = html.getElementById(
              `Volume-${
                this.dataset.originalSection
                  ? this.dataset.originalSection
                  : this.dataset.section
              }`
            );

            const pricePerItemDestination = document.getElementById(
              `Price-Per-Item-${this.dataset.section}`
            );
            const pricePerItemSource = html.getElementById(
              `Price-Per-Item-${
                this.dataset.originalSection
                  ? this.dataset.originalSection
                  : this.dataset.section
              }`
            );

            const volumePricingDestination = document.getElementById(
              `Volume-${this.dataset.section}`
            );
            const qtyRules = document.getElementById(
              `Quantity-Rules-${this.dataset.section}`
            );
            const volumeNote = document.getElementById(
              `Volume-Note-${this.dataset.section}`
            );

            if (volumeNote) volumeNote.classList.remove("hidden");
            if (volumePricingDestination)
              volumePricingDestination.classList.remove("hidden");
            if (qtyRules) qtyRules.classList.remove("hidden");

            if (source && destination) destination.innerHTML = source.innerHTML;
            if (inventorySource && inventoryDestination)
              inventoryDestination.innerHTML = inventorySource.innerHTML;
            if (skuSource && skuDestination) {
              skuDestination.innerHTML = skuSource.innerHTML;
              skuDestination.classList.toggle(
                "hidden",
                skuSource.classList.contains("hidden")
              );
            }

            if (volumePricingSource && volumePricingDestination) {
              volumePricingDestination.innerHTML =
                volumePricingSource.innerHTML;
            }

            if (pricePerItemSource && pricePerItemDestination) {
              pricePerItemDestination.innerHTML = pricePerItemSource.innerHTML;
              pricePerItemDestination.classList.toggle(
                "hidden",
                pricePerItemSource.classList.contains("hidden")
              );
            }

            const price = document.getElementById(
              `price-${this.dataset.section}`
            );

            if (price) price.classList.remove("hidden");

            if (inventoryDestination)
              inventoryDestination.classList.toggle(
                "hidden",
                inventorySource.innerText === ""
              );

            const addButtonUpdated = html.getElementById(
              `ProductSubmitButton-${sectionId}`
            );
            if(window.variantStrings?.soldOut){
              this.toggleAddButton(
                addButtonUpdated
                  ? addButtonUpdated.hasAttribute("disabled")
                  : true,
                window.variantStrings?.soldOut
              );
            }


            dm_publish(DM_PUB_SUB_EVENTS.variantChange, {
              data: {
                sectionId,
                html,
                variant: this.currentVariant,
              },
            });
          });
      }

      toggleAddButton(disable = true, text, modifyClass = true) {
        return; // Custom Dropmagic
        const productForm = document.getElementById(
          `product-form-${this.dataset.section}`
        );
        if (!productForm) return;
        const addButton = productForm.querySelector('[name="add"]');
        const addButtonText = productForm.querySelector('[name="add"] > span');
        if (!addButton) return;

        if (disable) {
          addButton.setAttribute("disabled", "disabled");
          if (text) addButtonText.textContent = text;
        } else {
          addButton.removeAttribute("disabled");
          addButtonText.textContent = window.variantStrings?.addToCart;
        }

        if (!modifyClass) return;
      }

      setUnavailable() {
        const button = document.getElementById(
          `product-form-${this.dataset.section}`
        );
        const addButton = button.querySelector('[name="add"]');
        const addButtonText = button.querySelector('[name="add"] > span');
        const price = document.getElementById(`price-${this.dataset.section}`);
        const inventory = document.getElementById(
          `Inventory-${this.dataset.section}`
        );
        const sku = document.getElementById(`Sku-${this.dataset.section}`);
        const pricePerItem = document.getElementById(
          `Price-Per-Item-${this.dataset.section}`
        );
        const volumeNote = document.getElementById(
          `Volume-Note-${this.dataset.section}`
        );
        const volumeTable = document.getElementById(
          `Volume-${this.dataset.section}`
        );
        const qtyRules = document.getElementById(
          `Quantity-Rules-${this.dataset.section}`
        );

        if (!addButton) return;
        if(window.variantStrings?.unavailable){
          addButtonText.textContent = window.variantStrings?.unavailable;
        }

        if (price) price.classList.add("hidden");
        if (inventory) inventory.classList.add("hidden");
        if (sku) sku.classList.add("hidden");
        if (pricePerItem) pricePerItem.classList.add("hidden");
        if (volumeNote) volumeNote.classList.add("hidden");
        if (volumeTable) volumeTable.classList.add("hidden");
        if (qtyRules) qtyRules.classList.add("hidden");
      }

      getVariantData() {
        this.variantData =
          this.variantData ||
          JSON.parse(
            this.querySelector('[type="application/json"]').textContent
          );
        return this.variantData;
      }
    }
  );
}
