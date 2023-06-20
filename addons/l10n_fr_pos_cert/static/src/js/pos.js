/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { Order, Orderline } from "@point_of_sale/app/store/models";
import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";
import { sprintf } from "@web/core/utils/strings";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";

patch(PosStore.prototype, "l10n_fr_pos_cert.PosStore", {
    is_french_country() {
        var french_countries = ["FR", "MF", "MQ", "NC", "PF", "RE", "GF", "GP", "TF"];
        if (!this.company.country) {
            this.env.services.popup.add(ErrorPopup, {
                title: _t("Missing Country"),
                body: sprintf(_t("The company %s doesn't have a country set."), this.company.name),
            });
            return false;
        }
        return french_countries.includes(this.company.country.code);
    },
    disallowLineQuantityChange() {
        const result = this._super(...arguments);
        return this.is_french_country() || result;
    },
});

patch(Order.prototype, "l10n_fr_pos_cert.Order", {
    setup() {
        this._super(...arguments);
        this.blockchain_inalterable_hash = this.blockchain_inalterable_hash || false;
        this.save_to_db();
    },
    export_for_printing() {
        var result = this._super(...arguments);
        result.blockchain_inalterable_hash = this.get_blockchain_inalterable_hash();
        return result;
    },
    set_blockchain_inalterable_hash(blockchain_inalterable_hash) {
        this.blockchain_inalterable_hash = blockchain_inalterable_hash;
    },
    get_blockchain_inalterable_hash() {
        return this.blockchain_inalterable_hash;
    },
    wait_for_push_order() {
        var result = this._super(...arguments);
        result = Boolean(result || this.pos.is_french_country());
        return result;
    },
    destroy(option) {
        // SUGGESTION: It's probably more appropriate to apply this restriction
        // in the TicketScreen.
        if (
            option &&
            option.reason == "abandon" &&
            this.pos.is_french_country() &&
            this.get_orderlines().length
        ) {
            this.env.services.popup.add(ErrorPopup, {
                title: _t("Fiscal Data Module error"),
                body: _t("Deleting of orders is not allowed."),
            });
        } else {
            this._super(...arguments);
        }
    },
});

patch(Orderline.prototype, "l10n_fr_pos_cert.Orderline", {
    can_be_merged_with(orderline) {
        if (!this.pos.is_french_country()) {
            return this._super(...arguments);
        }
        const order = this.pos.get_order();
        const orderlines = order.orderlines;
        const lastOrderline = order.orderlines.at(orderlines.length - 1);

        if (lastOrderline.product.id !== orderline.product.id || lastOrderline.quantity < 0) {
            return false;
        } else {
            return this._super(...arguments);
        }
    },
});
