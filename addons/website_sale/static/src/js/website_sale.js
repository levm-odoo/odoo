import { hasTouch, isBrowserFirefox } from "@web/core/browser/feature_detection";
import { rpc } from "@web/core/network/rpc";
import publicWidget from "@web/legacy/js/public/public_widget";
import "@website/libs/zoomodoo/zoomodoo";
import VariantMixin from "@website_sale/js/sale_variant_mixin";


export const WebsiteSale = publicWidget.Widget.extend(VariantMixin, {
    selector: '.oe_website_sale',
    events: Object.assign({}, {
        'click a.js_add_cart_json': '_onChangeQuantity', // product & cart page, maybe others
        'click .a-submit': '_onClickSubmit',
        'change form.js_attributes input, form.js_attributes select': '_onChangeAttribute',  // filters on /shop page
        'submit .o_wsale_products_searchbar_form': '_onSubmitSaleSearch',
        'click #add_to_cart, .o_we_buy_now, #products_grid .o_wsale_product_btn .a-submit': '_onClickAdd',
        'mousedown .o_wsale_filmstip_wrapper': '_onMouseDown',
        'mouseleave .o_wsale_filmstip_wrapper': '_onMouseLeave',
        'mouseup .o_wsale_filmstip_wrapper': '_onMouseUp',
        'mousemove .o_wsale_filmstip_wrapper': '_onMouseMove',
        'click .o_wsale_filmstip_wrapper' : '_onClickHandler',
        'submit': '_onClickConfirmOrder',
    }),

    /**
     * @constructor
     */
    init: function () {
        this._super.apply(this, arguments);

        this.filmStripStartX = 0;
        this.filmStripIsDown = false;
        this.filmStripScrollLeft = 0;
        this.filmStripMoved = false;
    },
    /**
     * @override
     */
    start() {
        const def = this._super(...arguments);

        // This allows conditional styling for the filmstrip
        const filmstripContainer = this.el.querySelector('.o_wsale_filmstip_container');
        const filmstripContainerWidth = filmstripContainer
            ? filmstripContainer.getBoundingClientRect().width : 0;
        const filmstripWrapper = this.el.querySelector('.o_wsale_filmstip_wrapper');
        const filmstripWrapperWidth = filmstripWrapper
            ? filmstripWrapper.getBoundingClientRect().width : 0;
        const isFilmstripScrollable = filmstripWrapperWidth < filmstripContainerWidth
        if (isBrowserFirefox() || hasTouch() || isFilmstripScrollable) {
            filmstripContainer?.classList.add('o_wsale_filmstip_fancy_disabled');
        }

        return def;
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    _onMouseDown: function (ev) {
        this.filmStripIsDown = true;
        this.filmStripStartX = ev.pageX - ev.currentTarget.offsetLeft;
        this.filmStripScrollLeft = ev.currentTarget.scrollLeft;
        this.formerTarget = ev.target;
        this.filmStripMoved = false;
    },
    _onMouseLeave: function (ev) {
        if (!this.filmStripIsDown) {
            return;
        }
        ev.currentTarget.classList.remove('activeDrag');
        this.filmStripIsDown = false
    },
    _onMouseUp: function (ev) {
        this.filmStripIsDown = false;
        ev.currentTarget.classList.remove('activeDrag');
    },
    _onMouseMove: function (ev) {
        if (!this.filmStripIsDown) {
            return;
        }
        ev.preventDefault();
        ev.currentTarget.classList.add('activeDrag');
        this.filmStripMoved = true;
        const x = ev.pageX - ev.currentTarget.offsetLeft;
        const walk = (x - this.filmStripStartX) * 2;
        ev.currentTarget.scrollLeft = this.filmStripScrollLeft - walk;
    },
    _onClickHandler: function(ev) {
        if(this.filmStripMoved) {
            ev.stopPropagation();
            ev.preventDefault();
        }
    },

    /**
     * Set the checked values active.
     *
     * @private
     * @param {Array} valueSelectors Selectors
     */
    _changeAttribute: function (valueSelectors) {
        valueSelectors.forEach((selector) => {
            $(selector).removeClass("active").filter(":has(input:checked)").addClass("active");
        });
    },
    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickAdd: async function (ev) {
        ev.preventDefault();
        var def = () => {
            this._updateRootProduct((ev.currentTarget).closest('form'));
            const isBuyNow = ev.currentTarget.classList.contains('o_we_buy_now');
            const isConfigured = ev.currentTarget.parentElement.id === 'add_to_cart_wrap';
            return this.call('websiteSale', 'addToCart', this.rootProduct, {
                isBuyNow: isBuyNow,
                isConfigured: isConfigured,
            });
        };
        if ($('.js_add_cart_variants').children().length) {
            return this._getCombinationInfo(ev).then(() => {
                return !(ev.target).closest('.js_product').classList.contains('.css_not_available') ? def() : Promise.resolve();
            });
        }
        return def();
    },
    /**
     * Event handler to increase or decrease quantity from the product page.
     *
     * @private
     * @param {MouseEvent} ev
     *
     * @returns {void}
     */
    _onChangeQuantity: function (ev) {
        ev.preventDefault();

        const input = ev.currentTarget.closest('.input-group').querySelector('input');
        const min = parseFloat(input.dataset.min || 0);
        const max = parseFloat(input.dataset.max || Infinity);
        const previousQty = parseFloat(input.value || 0, 10);
        const quantity = (
            ev.currentTarget.querySelector('i').classList.contains('fa-minus') ? -1 : 1
        ) + previousQty;
        const newQty = quantity > min ? (quantity < max ? quantity : max) : min;

        if (newQty !== previousQty) {
            input.value = newQty;
            input.dispatchEvent(
                new Event('change', {bubbles: true})
            );  // Trigger `onChangeVariant` through .js_main_product
        }
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onClickSubmit: function (ev) {
        if ($(ev.currentTarget).is('#add_to_cart, #products_grid .a-submit')) {
            return;
        }
        var $aSubmit = $(ev.currentTarget);
        if (!ev.defaultPrevented && !$aSubmit.is(".disabled")) {
            ev.preventDefault();
            $aSubmit.closest('form').submit();
        }
        if ($aSubmit.hasClass('a-submit-disable')) {
            $aSubmit.addClass("disabled");
        }
        if ($aSubmit.hasClass('a-submit-loading')) {
            var loading = '<span class="fa fa-cog fa-spin"/>';
            var fa_span = $aSubmit.find('span[class*="fa"]');
            if (fa_span.length) {
                fa_span.replaceWith(loading);
            } else {
                $aSubmit.append(loading);
            }
        }
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onChangeAttribute: function (ev) {
        if (!ev.defaultPrevented) {
            ev.preventDefault();
            const productGrid = this.el.querySelector(".o_wsale_products_grid_table_wrapper");
            if (productGrid) {
                productGrid.classList.add("opacity-50");
            }
            $(ev.currentTarget).closest("form").submit();
        }
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onSubmitSaleSearch: function (ev) {
        if (!this.$('.dropdown_sorty_by').length) {
            return;
        }
        var $this = $(ev.currentTarget);
        if (!ev.defaultPrevented && !$this.is(".disabled")) {
            ev.preventDefault();
            var oldurl = $this.attr('action');
            oldurl += (oldurl.indexOf("?")===-1) ? "?" : "";
            if ($this.find('[name=noFuzzy]').val() === "true") {
                oldurl += '&noFuzzy=true';
            }
            var search = $this.find('input.search-query');
            window.location = oldurl + '&' + search.attr('name') + '=' + encodeURIComponent(search.val());
        }
    },
    /**
     * Toggles the add to cart button depending on the possibility of the
     * current combination.
     *
     * @override
     */
    _toggleDisable: function ($parent, isCombinationPossible) {
        VariantMixin._toggleDisable.apply(this, arguments);
        $parent.find("#add_to_cart").toggleClass('disabled', !isCombinationPossible);
        $parent.find(".o_we_buy_now").toggleClass('disabled', !isCombinationPossible);
    },
    /**
     * Prevent multiclicks on confirm button when the form is submitted
     *
     * @private
     */
    _onClickConfirmOrder: function () {
        // FIXME ANVFE this should only be triggered when we effectively click on that specific button no?
        // should not impact the address page at least
        const submitFormButton = $('form[name="o_wsale_confirm_order"]').find('button[type="submit"]');
        submitFormButton.attr('disabled', true);
        setTimeout(() => submitFormButton.attr('disabled', false), 5000);
    },

    // -------------------------------------
    // Utils
    // -------------------------------------

    /**
     * Update the root product during based on the form elements.
     *
     * @private
     * @param {HTMLFormElement} form - The form in which the product is.
     *
     * @returns {void}
     */
    _updateRootProduct(form) {
        const productId = parseInt(form.querySelector([
            'input[type="hidden"][name="product_id"]',
            // Variants list view
            'input[type="radio"][name="product_id"]:checked',
        ].join(','))?.value);
        const quantity = parseFloat(form.querySelector('input[name="add_qty"]')?.value);
        const isCombo = form.querySelector(
            'input[type="hidden"][name="product_type"]'
        )?.value === 'combo';
        this.rootProduct = {
            ...(productId ? {productId: productId} : {}),
            productTemplateId: parseInt(form.querySelector(
                'input[type="hidden"][name="product_template_id"]',
            ).value),
            ...(quantity ? {quantity: quantity} : {}),
            ptavs: this._getSelectedPTAV(form),
            productCustomAttributeValues: this._getCustomPTAVValues(form),
            noVariantAttributeValues: this._getSelectedNoVariantPTAV(form),
            ...(isCombo ? {isCombo: isCombo} : {}),
        };
    },

    /**
     * Return the selected stored PTAV(s) of in the provided form.
     *
     * @private
     * @param {HTMLFormElement} form - The form in which the product is.
     *
     * @returns {Number[]} - The selected stored attribute(s), as a list of
     *      `product.template.attribute.value` ids.
     */
    _getSelectedPTAV(form) {
        // Variants list view
        let combination = form.querySelector('input.js_product_change:checked')?.dataset.combination;
        if (combination) {
            return JSON.parse(combination);
        }

        const selectedPTAVElements = form.querySelectorAll([
            '.js_product input.js_variant_change:not(.no_variant):checked',
            '.js_product select.js_variant_change:not(.no_variant)'
        ].join(','));
        let selectedPTAV = [];
        for(const el of selectedPTAVElements) {
            selectedPTAV.push(parseInt(el.value));
        }
        return selectedPTAV;
    },

    /**
     * Return the custom PTAV(s) values in the provided form.
     *
     * @private
     * @param {HTMLFormElement} form - The form in which the product is.
     *
     * @returns {{id: number, value: string}[]} An array of objects where each object contains:
     *      - `custom_product_template_attribute_value_id`: The ID of the custom attribute.
     *      - `custom_value`: The value assigned to the custom attribute.
     */
    _getCustomPTAVValues(form) {
        const customPTAVsValuesElements = form.querySelectorAll('.variant_custom_value');
        let customPTAVsValues = [];
        for(const el of customPTAVsValuesElements) {
            customPTAVsValues.push({
                'custom_product_template_attribute_value_id': parseInt(
                    el.dataset.custom_product_template_attribute_value_id
                ),
                'custom_value': el.value,
            });
        }
        return customPTAVsValues;
    },

    /**
     * Return the selected non-stored PTAV(s) of the product in the provided form.
     *
     * @private
     * @param {HTMLFormElement} form - The form in which the product is.
     *
     * @returns {Number[]} - The selected non-stored attribute(s), as a list of
     *      `product.template.attribute.value` ids.
     */
    _getSelectedNoVariantPTAV(form) {
        const selectedNoVariantPTAVElements = form.querySelectorAll([
            'input.no_variant.js_variant_change:checked',
            'select.no_variant.js_variant_change',
        ].join(','));
        let selectedNoVariantPTAV = [];
        for(const el of selectedNoVariantPTAVElements) {
            selectedNoVariantPTAV.push(parseInt(el.value));
        }
        return selectedNoVariantPTAV;
    },
});

publicWidget.registry.WebsiteSale = WebsiteSale

publicWidget.registry.WebsiteSaleLayout = publicWidget.Widget.extend({
    selector: '.oe_website_sale',
    disabledInEditableMode: false,
    events: {
        'change .o_wsale_apply_layout input': '_onApplyShopLayoutChange',
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onApplyShopLayoutChange: function (ev) {
        const wysiwyg = this.options.wysiwyg;
        if (wysiwyg) {
            wysiwyg.odooEditor.observerUnactive('_onApplyShopLayoutChange');
        }
        var clickedValue = $(ev.target).val();
        var isList = clickedValue === 'list';
        if (!this.editableMode) {
            rpc('/shop/save_shop_layout_mode', {
                'layout_mode': isList ? 'list' : 'grid',
            });
        }

        const activeClasses = ev.target.parentElement.dataset.activeClasses.split(' ');
        ev.target.parentElement.querySelectorAll('.btn').forEach((btn) => {
            activeClasses.map(c => btn.classList.toggle(c));
        });

        var $grid = this.$('#products_grid');
        // Disable transition on all list elements, then switch to the new
        // layout then reenable all transitions after having forced a redraw
        // TODO should probably be improved to allow disabling transitions
        // altogether with a class/option.
        $grid.find('*').css('transition', 'none');
        $grid.toggleClass('o_wsale_layout_list', isList);
        void $grid[0].offsetWidth;
        $grid.find('*').css('transition', '');
        if (wysiwyg) {
            wysiwyg.odooEditor.observerActive('_onApplyShopLayoutChange');
        }
    },
});


export default {
    WebsiteSale: publicWidget.registry.WebsiteSale,
    WebsiteSaleLayout: publicWidget.registry.WebsiteSaleLayout,
};
