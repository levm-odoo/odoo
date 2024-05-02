/** @odoo-module **/

import PublicWidget from 'web.public.widget';
import { patch } from 'web.utils';
import core from 'web.core';

const _t = core._t;

patch(PublicWidget.registry.websiteSaleDelivery, 'addons/website_sale_loyalty_delivery/statis/src/js/website_sale_loyalty_delivery.js', {
    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
     _handleCarrierUpdateResult: async function (carrierInput) {
        await this._super.apply(this, arguments);
        if (this.result.new_amount_order_discounted) {
            // Update discount of the order
            $('#order_discounted').html(this.result.new_amount_order_discounted);
        }
    },
    /**
     * @override
     */
    _handleCarrierUpdateResultBadge: function (result) {
        this._super.apply(this, arguments);
        if (result.new_amount_order_discounted) {
            // We are in freeshipping, so every carrier is Free but we don't
            // want to replace error message by 'Free'
            $('#delivery_carrier .badge:not(.o_wsale_delivery_carrier_error)').text(_t('Free'));
        }
        else if (this.result.new_amount_order_discounted) {
             const cart_summary_discount_line = document.querySelector(
                '[data-reward-type="discount"]'
            );
            if (cart_summary_discount_line) {
                cart_summary_discount_line.innerHTML = this.result.new_amount_order_discounted;
            }
        }
    },
});
