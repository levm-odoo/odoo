/** @odoo-module **/

import ajax from "@web/legacy/js/core/ajax";
import core from "@web/legacy/js/services/core";
import publicWidget from "@web/legacy/js/public/public_widget";
import { ProductConfiguratorDialog } from "@sale_product_configurator/js/product_configurator_dialog/product_configurator_dialog";
import "@website_sale/js/website_sale";
import wsUtils from "@website_sale/js/website_sale_utils";

var _t = core._t;

publicWidget.registry.WebsiteSale.include({

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    _onProductReady: function () {
        if (this.isBuyNow) {
            return this._submitForm();
        }
        this.call("dialog", "add", ProductConfiguratorDialog, {
            productTemplateId: this.props.record.data.product_template_id[0],
            quantity: this.rootProduct.product_id.product_id, //ok
            currencyId: this.props.record.data.currency_id[0],
            soDate: serializeDateTime(saleOrderRecord.data.date_order),
            edit: false,
            save: async (mainProduct, optionalProducts) => {
                await this.props.record.update(mainProduct);
                this._onProductUpdate();
                for (const optionalProduct of optionalProducts) {
                    const line = await saleOrderRecord.data.order_line.addNew({
                        position: 'bottom',
                    });
                    line.update(optionalProduct);
                }
                saleOrderRecord.data.order_line.unselectRecord();
            },
            discard: () => {
                saleOrderRecord.data.order_line.removeRecord(this.props.record);
            },
        });
    },
    /**
     * Overridden to resolve _opened promise on modal
     * when stayOnPageOption is activated.
     *
     * @override
     */
    _submitForm() {
        var ret = this._super(...arguments);
        if (this.optionalProductsModal && this.stayOnPageOption) {
            ret.then(()=>{
                this.optionalProductsModal._openedResolver()
            });
        }
        return ret;
    },
    /**
     * Update web shop base form quantity
     * when quantity is updated in the optional products window
     *
     * @private
     * @param {integer} quantity
     */
    _onOptionsUpdateQuantity: function (quantity) {
        var $qtyInput = this.$form
            .find('.js_main_product input[name="add_qty"]')
            .first();

        if ($qtyInput.length) {
            $qtyInput.val(quantity).trigger('change');
        } else {
            // This handles the case when the "Select Quantity" customize show
            // is disabled, and therefore the above selector does not find an
            // element.
            // To avoid duplicating all RPC, only trigger the variant change if
            // it is not already done from the above trigger.
            this.optionalProductsModal.triggerVariantChange(this.optionalProductsModal.$el);
        }
    },

    /**
     * Submits the form with additional parameters
     * - lang
     * - product_custom_attribute_values: The products custom variant values
     *
     * @private
     * @param {Boolean} goToShop Triggers a page refresh to the url "shop/cart"
     */
    _onModalSubmit: function (goToShop) {
        const self = this;
        const $product = $('#product_detail');
        let currency;
        if ($product.length) {
            currency = $product.data('product-tracking-info')['currency'];
        } else {
            // Add to cart from /shop page
            currency = this.$('[itemprop="priceCurrency"]').first().text();
        }
        const productsTrackingInfo = [];
        this.$('.js_product.in_cart').each((i, el) => {
            productsTrackingInfo.push({
                'item_id': el.getElementsByClassName('product_id')[0].value,
                'item_name': el.getElementsByClassName('product_display_name')[0].textContent,
                'quantity': el.getElementsByClassName('js_quantity')[0].value,
                'currency': currency,
                'price': el.getElementsByClassName('oe_price')[0].getElementsByClassName('oe_currency_value')[0].textContent,
            });
        });
        if (productsTrackingInfo) {
            this.$el.trigger('add_to_cart_event', productsTrackingInfo);
        }

        this.optionalProductsModal.getAndCreateSelectedProducts()
            .then((products) => {
                const productAndOptions = JSON.stringify(products);
                ajax.post('/shop/cart/update_option', {
                    product_and_options: productAndOptions,
                    ...this._getOptionalCombinationInfoParam()
                }).then(function (quantity) {
                        if (goToShop) {
                            window.location.pathname = "/shop/cart";
                        }
                        const $quantity = $(".my_cart_quantity");
                        $quantity.parent().parent().removeClass('d-none');
                        $quantity.text(quantity).hide().fadeIn(600);
                        // find the closest div that has an img tag in it
                        const imgContainerEl = self.$form.closest('div:has(.o_wsale_product_images)');
                        wsUtils.animateClone($('header .o_wsale_my_cart').first(), imgContainerEl, 25, 40);
                        sessionStorage.setItem('website_sale_cart_quantity', quantity);
                    }).then(()=>{
                        this._getCombinationInfo($.Event('click', {target: $("#add_to_cart")}));
                    });
            });
    },
});

export default publicWidget.registry.WebsiteSaleOptions;
