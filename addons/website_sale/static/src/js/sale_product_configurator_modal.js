/** @odoo-module */

import Dialog from '@web/legacy/js/core/dialog';
import VariantMixin from '@website_sale/js/sale_variant_mixin';
import { uniqueId } from '@web/core/utils/functions';
import { rpc } from '@web/core/network/rpc';

export const OptionalProductsModal = Dialog.extend(VariantMixin, {
    events:  Object.assign({}, Dialog.prototype.events, VariantMixin.events, {
        'click a.js_add, a.js_remove': '_onAddOrRemoveOption',
        'click button.js_add_cart_json': 'onClickAddCartJSON',
        'change .in_cart input.js_quantity': '_onChangeQuantity',
        'change .js_raw_price': '_computePriceTotal'
    }),
    /**
     * Initializes the optional products modal
     *
     * @override
     * @param {Element} parent The parent container
     * @param {Object} params
     * @param {integer} params.pricelistId
     * @param {boolean} params.isWebsite If we're on a web shop page, we need some
     *   custom behavior
     * @param {string} params.okButtonText The text to apply on the "ok" button, typically
     *   "Add" for the sale order and "Proceed to checkout" on the web shop
     * @param {string} params.cancelButtonText same as "params.okButtonText" but
     *   for the cancel button
     * @param {integer} params.previousModalHeight used to configure a min height on the modal-content.
     *   This parameter is provided by the product configurator to "cover" its modal by making
     *   this one big enough. This way the user can't see multiple buttons (which can be confusing).
     * @param {Object} params.rootProduct The root product of the optional products window
     * @param {integer} params.rootProduct.product_id
     * @param {integer} params.rootProduct.quantity
     * @param {Array} params.rootProduct.variant_values
     * @param {Array} params.rootProduct.product_custom_attribute_values
     * @param {Array} params.rootProduct.no_variant_attribute_values
     */
    init: function (parent, params) {
        const self = this;

        let options = Object.assign({
            size: 'large',
            buttons: [{
                text: params.okButtonText,
                click: this._onConfirmButtonClick,
                // the o_sale_product_configurator_edit class is used for tours.
                classes: 'btn-primary o_sale_product_configurator_edit'
            }, {
                text: params.cancelButtonText,
                click: this._onCancelButtonClick
            }],
            technical: !params.isWebsite,
        }, params || {});

        this._super(parent, options);

        this.isWebsite = params.isWebsite;
        this.forceDialog = params.forceDialog;

        this.dialogClass = 'oe_advanced_configurator_modal' + (params.isWebsite ? ' oe_website_sale' : '');
        this.context = params.context;
        this.rootProduct = params.rootProduct;
        this.container = parent;
        this.pricelistId = params.pricelistId;
        this.previousModalHeight = params.previousModalHeight;
        this.mode = params.mode;
        this.dialogClass = 'oe_advanced_configurator_modal';
        this._productImageField = 'image_128';

        this._opened.then(function () {
            if (self.previousModalHeight) {
                self.el.closest('.modal-content').style.minHeight = self.previousModalHeight + 'px';
            }
        });
    },
     /**
     * @override
     */
    willStart: function () {
        const self = this;

        let getModalContent = rpc("/sale_product_configurator/show_advanced_configurator", {
            mode: self.mode,
            product_id: self.rootProduct.product_id,
            variant_values: self.rootProduct.variant_values,
            product_custom_attribute_values: self.rootProduct.product_custom_attribute_values,
            pricelist_id: self.pricelistId || false,
            add_qty: self.rootProduct.quantity,
            force_dialog: self.forceDialog,
            no_attribute: self.rootProduct.no_variant_attribute_values,
            custom_attribute: self.rootProduct.product_custom_attribute_values,
            context: Object.assign({'quantity': self.rootProduct.quantity}, this.context),
        }).then(function (modalContent) {
            // TODO-VISP : remove this
            if (modalContent) {
                var $modalContent = $(modalContent);
                $modalContent = self._postProcessContent($modalContent);
                self.$content = $modalContent;
            } else {
                self.trigger('options_empty');
                self.preventOpening = true;
            }
        });

        var parentInit = self._super.apply(self, arguments);
        return Promise.all([getModalContent, parentInit]);
    },

    /**
     * This is overridden to append the modal to the provided container (see init("parent")).
     * We need this to have the modal contained in the web shop product form.
     * The additional products data will then be contained in the form and sent on submit.
     *
     * @override
     */
    open: function (options) {
        document.querySelectorAll('.tooltip').forEach(tooltip => {
            tooltip.remove();// remove open tooltip if any to prevent them staying when modal is opened
        })

        const self = this;
        // TODO-VISP : remove this
        this.appendTo($('<div/>')).then(function () {
            if (!self.preventOpening) {
                self.$modal.find(".modal-body").replaceWith(self.$el);
                self.$modal.attr('open', true);
                self.$modal.appendTo(self.container);
                const modal = new Modal(self.$modal[0], {
                    focus: true,
                });
                modal.show();
                self._openedResolver();
            }
        });
        if (options && options.shouldFocusButtons) {
            self._onFocusControlButton();
        }

        return self;
    },
    /**
     * Will update quantity input to synchronize with previous window
     *
     * @override
     */
    start: function () {
        const def = this._super.apply(this, arguments);
        const self = this;

        const qtyInputEl = this.el.querySelector('input[name="add_qty"]');
        if (qtyInputEl) {
            qtyInputEl.value = this.rootProduct.quantity;
        }

        // set a unique id to each row for options hierarchy
        const products = this.container.querySelectorAll('tr.js_product');
        products.forEach((el) => {
            const uniqueId = self._getUniqueId(el);

            var productId = parseInt(el.querySelector('input.product_id').value, 10);
            if (productId === self.rootProduct.product_id) {
                self.rootProduct.unique_id = uniqueId;
            } else {
                el.dataset.parentUniqueId = self.rootProduct.unique_id;
            }
        });

        return def.then(function () {
            // This has to be triggered to compute the "out of stock" feature
            self._opened.then(function () {
                self.triggerVariantChange(self.el);
            });
        });
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Returns the list of selected products.
     * The root product is added on top of the list.
     *
     * @returns {Array} products
     *   {integer} product_id
     *   {integer} quantity
     *   {Array} product_custom_variant_values
     *   {Array} no_variant_attribute_values
     * @public
     */
    getAndCreateSelectedProducts: async function () {
        const self = this;
        const products = [];
        let productCustomVariantValues;
        let noVariantAttributeValues;
        for (const product of self.$modal[0].querySelectorAll('.js_product.in_cart')) {
            const item = product;
            const quantity = parseFloat(item.querySelector('input[name="add_qty"]').value.replace(',', '.') || 1);
            const parentUniqueId = item.dataset.parentUniqueId;
            const uniqueId = this._getUniqueId(item);
            productCustomVariantValues = [...item.querySelectorAll('.custom-attribute-info')].map(el => el.dataset.attributeValue) || self.getCustomVariantValues(item);
            noVariantAttributeValues = [...item.querySelectorAll('.no-attribute-info')].map(el => el.dataset.attributeValue) || self.getNoVariantAttributeValues(item);

            const productID = await self.selectOrCreateProduct(
                item,
                parseInt(item.querySelector('input.product_id').value, 10),
                parseInt(item.querySelector('input.product_template_id').value, 10),
            );
            products.push({
                'product_id': productID,
                'product_template_id': parseInt(item.querySelector('input.product_template_id').value, 10),
                'quantity': quantity,
                'parent_unique_id': parentUniqueId,
                'unique_id': uniqueId,
                'product_custom_attribute_values': parseInt(productCustomVariantValues),
                'no_variant_attribute_values': parseInt(noVariantAttributeValues)
            });
        }
        return products;
    },

    // ------------------------------------------
    // Private
    // ------------------------------------------

    /**
     * Adds the product image and updates the product description
     * based on attribute values that are either "no variant" or "custom".
     *
     * @private
     */
    _postProcessContent: function (modalContent) {
        // TODO_VISP: remove this 
        modalContent = modalContent[0];
        const productId = this.rootProduct.product_id;
        let firstImg = modalContent.querySelector('img:first-child');
        firstImg.src = "/web/image/product.product/" + productId + "/image_128";

        if (this.rootProduct &&
                (this.rootProduct.product_custom_attribute_values ||
                 this.rootProduct.no_variant_attribute_values)) {
            const productDescription = modalContent.querySelector('.main_product td.td-product_name div.text-muted.small > div:first-child');
            let updatedDescription = document.createElement('div');
            let p = document.createElement('p');
            p.textContent = productDescription.textContent;
            updatedDescription.append(p);
            this.rootProduct.product_custom_attribute_values.forEach(() => {
                if (this.custom_value) {
                    const customInput = modalContent.querySelector(".main_product [data-is_custom='True']")
                                        .closest(`[data-value_id='${this.custom_product_template_attribute_value_id.res_id}']`);
                    customInput.setAttribute('previous_custom_value', this.custom_value);
                    VariantMixin.handleCustomValues(customInput);
                }
            });

            this.rootProduct.no_variant_attribute_values.forEach( () => {
                if (this.is_custom !== 'True') {
                    let currentDescription = updatedDescription.querySelector(`div[name=ptal-${this.id}]`);
                    if (currentDescription?.length > 0) { // one row per multicheckbox
                        currentDescription.textContent += ', ' + this.attribute_value_name;
                    } else {
                        let newDiv = document.createElement('div');
                        newDiv.textContent = this.attribute_name + ': ' + this.attribute_value_name;
                        newDiv.setAttribute('name', `ptal-${this.id}`);
                        updatedDescription.appendChild(newDiv);
                    }
                }
            });
            productDescription.parentNode.replaceChild(updatedDescription, productDescription);
        }

        return modalContent;
    },

    /**
     * @private
     */
    _onConfirmButtonClick: function () {
        this.trigger('confirm');
        this.close();
    },

    /**
     * @private
     */
    _onCancelButtonClick: function () {
        this.trigger('back');
        this.close();
    },

    /**
     * Will add/remove the option, that includes:
     * - Moving it to the correct DOM section
     *   and possibly under its parent product
     * - Hiding attribute values selection and showing the quantity
     * - Creating the product if it's in "dynamic" mode (see product_attribute.create_variant)
     * - Updating the description based on custom/no_create attribute values
     * - Removing optional products if parent product is removed
     * - Computing the total price
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onAddOrRemoveOption: function (ev) {
        ev.preventDefault();
        const self = this;
        const target = ev.currentTarget;
        const modal = target.closest('.oe_advanced_configurator_modal');
        const parent = target.closest('.js_product');
        parent.querySelectorAll("a.js_add, span.js_remove").forEach(el => el.classList.toggle('d-none'));

        const productTemplateId = parent.querySelector(".product_template_id").value;
        if (target.classList.contains('js_add')) {
            self._onAddOption(modal, parent, productTemplateId);
        } else {
            self._onRemoveOption(modal, parent);
        }

        self._computePriceTotal();
    },

    /**
     * @private
     * @see _onAddOrRemoveOption
     * @param {Element} modal
     * @param {Element} parent
     * @param {integer} productTemplateId
     */
    _onAddOption: function (modal, parent, productTemplateId) {
        const self = this;
        const selectOptionsText = modal.querySelector('.o_select_options');

        let parentUniqueId = parent.dataset.parentUniqueId;
        let optionParent = modal.querySelector('tr.js_product[data-unique-id="' + parentUniqueId + '"]');

        // remove attribute values selection and update + show quantity input
        parent.querySelectorAll('.td-product_name').forEach(prodName => {
            prodName.removeAttribute("colspan");
        });
        parent.querySelectorAll('.td-qty').forEach(prodQty => {
            prodQty.classList.remove('d-none');
        });
        const productCustomVariantValues = self.getCustomVariantValues(parent);
        const noVariantAttributeValues = self.getNoVariantAttributeValues(parent);
        if (productCustomVariantValues || noVariantAttributeValues) {
            const productDescription = parent
                .querySelector('td.td-product_name div.float-start');

            let customAttributeValuesDescription = document.createElement('div');
            customAttributeValuesDescription.className = 'custom_attribute_values_description text-muted small';
            if (productCustomVariantValues.length !== 0 || noVariantAttributeValues.length !== 0) {
                const br = document.createElement('br');
                customAttributeValuesDescription.appendChild(br);;
            }

            productCustomVariantValues.forEach(() => {
                const newDiv = document.createElement('div');
                newDiv.textContent = this.attribute_value_name + ': ' + this.custom_value;
                customAttributeValuesDescription.appendChild(newDiv);
            });

            noVariantAttributeValues.forEach(() => {
                if (this.is_custom !== 'True'){
                    let currentDescription = customAttributeValuesDescription.querySelector(`div[name=ptal-${this.id}]`);
                    if (currentDescription?.length > 0) { // one row per multicheckbox
                        currentDescription.textContent += ', ' + this.attribute_value_name;
                    } else {
                        const newDiv = document.createElement('div');
                        newDiv.textContent = this.attribute_name + ': ' + this.attribute_value_name;
                        newDiv.setAttribute('name', `ptal-${this.id}`);
                        customAttributeValuesDescription.appendChild(newDiv);
                    }
                }
            });

            productDescription?.append(customAttributeValuesDescription);
        }

        // place it after its parent and its parent options
        let tmpOptionParent = optionParent;
        while (tmpOptionParent) {
            optionParent = tmpOptionParent;
            tmpOptionParent = [...modal.querySelectorAll('tr.js_product.in_cart')].filter(el => el.dataset.uniqueId === optionParent.getAttribute('data-uniqueId')).slice(-1)[0];
        }
        debugger;
        optionParent?.parentNode.insertBefore(parent, optionParent.nextSibling);
        parent.classList.add('in_cart');

        this.selectOrCreateProduct(
            parent,
            parent.querySelector('.product_id').value,
            productTemplateId,
        ).then(function (productId) {
            parent.querySelector('.product_id').value = productId;

            rpc("/sale_product_configurator/optional_product_items", {
                'product_id': productId,
                'pricelist_id': self.pricelistId || false,
            }).then(function (addedItem) {
                const lastTr = modal.querySelector('tr:last-child');
                lastTr.parentNode.insertBefore(addedItem, lastTr.nextSibling);
                const inputElement = self.el.querySelector('input[name="add_qty"]');
                const event = new Event('change');
                inputElement.dispatchEvent(event);
                self.triggerVariantChange(addedItem);

                // add a unique id to the new products
                debugger;
                const parentUniqueId = parent.getAttribute('data-uniqueId');
                const parentQty = parent.querySelector('input[name="add_qty"]').value;
                addedItem.querySelectorAll('.js_product').each(function (item) {
                    var uniqueId = self._getUniqueId(item);
                    item.dataset.uniqueId = uniqueId;
                    item.dataset.parentUniqueId = parentUniqueId;
                    item.querySelector('input[name="add_qty"]').value = parentQty;
                });

                if ([...selectOptionsText.nextElementSibling].filter(el => el.classList.contains('js_product')).length === 0) {
                    // no more optional products to select -> hide the header
                    selectOptionsText.style.display = 'none !important';
                }
            });
        });
    },

    /**
     * @private
     * @see _onAddOrRemoveOption
     * @param {Element} modal
     * @param {Element} parent
     */
    _onRemoveOption: function (modal, parent) {
        // restore attribute values selection
        const uniqueId = parent.dataset.parentUniqueId;
        const qty = modal.querySelector(`tr.js_product.in_cart[data-unique-id="${uniqueId}"]`).querySelector('input[name="add_qty"]').value;
        parent.classList.remove('in_cart');
        parent.querySelectorAll('.td-product_name').forEach(el => {
            el.setAttribute("colspan", 2);
        });
        parent.querySelectorAll('.td-qty').forEach(el => {
            el.classList.add('d-none');
        });
        parent.querySelector('input[name="add_qty"]').value = qty;
        parent.querySelector('.custom_attribute_values_description').remove();
        modal.querySelector('.o_select_options').style.display = '';

        const productUniqueId = parent.getAttribute('data-uniqueId');
        this._removeOptionOption(modal, productUniqueId);

        const lastTr = modal.querySelector('tr:last-child');
        lastTr.parentNode.insertBefore(parent, lastTr.nextSibling);
    },

    /**
     * If the removed product had optional products, remove them as well
     *
     * @private
     * @param {Element} modal
     * @param {integer} optionUniqueId The removed optional product id
     */
    _removeOptionOption: function (modal, optionUniqueId) {
        const self = this;
        modal.querySelectorAll('tr.js_product[data-parent-unique-id="' + optionUniqueId + '"]').forEach(() => {
            const uniqueId = this.dataset.uniqueId;
            this.remove();
            self._removeOptionOption(modal, uniqueId);
        });
    },
    /**
     * @override
     */
    _onChangeCombination: function (ev, parent, combination) {
        parent.querySelectorAll('.td-product_name .product-name')[0].textContent = combination.display_name;

        VariantMixin._onChangeCombination.apply(this, arguments);

        this._computePriceTotal();
    },
    /**
     * Update price total when the quantity of a product is changed
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onChangeQuantity: function (ev) {
        const product = ev.target.closest('tr.js_product');
        const qty = parseFloat(ev.currentTarget.value);

        const uniqueId = this._getUniqueId(product);
        this.el.querySelectorAll('tr.js_product:not(.in_cart)[data-parent-unique-id="' + uniqueId + '"] input[name="add_qty"]').forEach(() => {
            this.value = qty;
        });

        if (this._triggerPriceUpdateOnChangeQuantity()) {
            this.onChangeAddQuantity(ev);
        }
        if (product.classList.contains('main_product')) {
            this.rootProduct.quantity = qty;
        }
        this.trigger('update_quantity', this.rootProduct.quantity);
        this._computePriceTotal();
    },

    /**
     * When a product is added or when the quantity is changed,
     * we need to refresh the total price row
     */
    _computePriceTotal: function () {
        debugger;
        if (this.$modal[0].querySelector('.js_price_total').length) {
            let price = 0;
            this.$modal[0].querySelectorAll('.js_product.in_cart').forEach(() => {
                const quantity = parseFloat(this.el.querySelectorAll('input[name="add_qty"]')[0].value.replace(',', '.') || 1);
                price += parseFloat(this.querySelector('.js_raw_price').innerHTML) * quantity;
            });

            this.$modal[0].querySelector('.js_price_total .oe_currency_value').textContent = this._priceToStr(parseFloat(price));
        }
    },

    /**
     * Extension point for website_sale
     *
     * @private
     */
    _triggerPriceUpdateOnChangeQuantity: function () {
        return !this.isWebsite;
    },
    /**
     * Returns a unique id for `el`.
     *
     * @private
     * @param {Element} el
     * @returns {integer}
     */
    _getUniqueId: function (el) {
        if (!el.dataset.uniqueId) {
            el.dataset.uniqueId = parseInt(uniqueId(), 10);
        }
        return el.dataset.uniqueId;
    },
});
