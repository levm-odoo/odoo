/** @odoo-module */

import { Gui } from "@point_of_sale/js/Gui";
import { PosGlobalState, Order, Orderline } from "@point_of_sale/js/models";
import core from "web.core";
import Registries from "@point_of_sale/js/Registries";

var _t = core._t;

<<<<<<< HEAD
const L10nFrPosGlobalState = (PosGlobalState) =>
    class L10nFrPosGlobalState extends PosGlobalState {
        is_french_country() {
            var french_countries = ["FR", "MF", "MQ", "NC", "PF", "RE", "GF", "GP", "TF"];
            if (!this.company.country) {
                Gui.showPopup("ErrorPopup", {
                    title: _t("Missing Country"),
                    body: _.str.sprintf(
                        _t("The company %s doesn't have a country set."),
                        this.company.name
                    ),
                });
||||||| parent of 4125e42dcd6 (temp)
const L10nFrPosGlobalState = (PosGlobalState) => class L10nFrPosGlobalState extends PosGlobalState {
    is_french_country(){
      var french_countries = ['FR', 'MF', 'MQ', 'NC', 'PF', 'RE', 'GF', 'GP', 'TF'];
      if (!this.company.country) {
        Gui.showPopup("ErrorPopup", {
            'title': _t("Missing Country"),
            'body':  _.str.sprintf(_t('The company %s doesn\'t have a country set.'), this.company.name),
        });
        return false;
      }
      return _.contains(french_countries, this.company.country.code);
    }
    disallowLineQuantityChange() {
        let result = super.disallowLineQuantityChange(...arguments);
        return this.is_french_country() || result;
    }
}
Registries.Model.extend(PosGlobalState, L10nFrPosGlobalState);


const L10nFrOrder = (Order) => class L10nFrOrder extends Order {
    constructor() {
        super(...arguments);
        this.l10n_fr_hash = this.l10n_fr_hash || false;
        this.save_to_db();
    }
    export_for_printing() {
      var result = super.export_for_printing(...arguments);
      result.l10n_fr_hash = this.get_l10n_fr_hash();
      return result;
    }
    set_l10n_fr_hash (l10n_fr_hash){
      this.l10n_fr_hash = l10n_fr_hash;
    }
    get_l10n_fr_hash() {
      return this.l10n_fr_hash;
    }
    wait_for_push_order() {
      var result = super.wait_for_push_order(...arguments);
      result = Boolean(result || this.pos.is_french_country());
      return result;
    }
    destroy (option) {
        // SUGGESTION: It's probably more appropriate to apply this restriction
        // in the TicketScreen.
        if (option && option.reason == 'abandon' && this.pos.is_french_country() && this.get_orderlines().length) {
            Gui.showPopup("ErrorPopup", {
                'title': _t("Fiscal Data Module error"),
                'body':  _t("Deleting of orders is not allowed."),
            });
        } else {
            super.destroy(...arguments);
        }
    }
}
Registries.Model.extend(Order, L10nFrOrder);


const L10nFrOrderline = (Orderline) => class L10nFrOrderline extends Orderline {
    can_be_merged_with(orderline) {
        if (this.pos.is_french_country()) {
            const order = this.pos.get_order();
            const lastId = order.orderlines.last().cid;
            if ((order.orderlines._byId[lastId].product.id !== orderline.product.id || order.orderlines._byId[lastId].quantity < 0)) {
=======
const L10nFrPosGlobalState = (PosGlobalState) => class L10nFrPosGlobalState extends PosGlobalState {
    is_french_country(){
      var french_countries = ['FR', 'MF', 'MQ', 'NC', 'PF', 'RE', 'GF', 'GP', 'TF'];
      if (!this.company.country) {
        Gui.showPopup("ErrorPopup", {
            'title': _t("Missing Country"),
            'body':  _.str.sprintf(_t('The company %s doesn\'t have a country set.'), this.company.name),
        });
        return false;
      }
      return _.contains(french_countries, this.company.country.code);
    }
    disallowLineQuantityChange() {
        let result = super.disallowLineQuantityChange(...arguments);
        return this.is_french_country() || result;
    }
}
Registries.Model.extend(PosGlobalState, L10nFrPosGlobalState);


const L10nFrOrder = (Order) => class L10nFrOrder extends Order {
    constructor() {
        super(...arguments);
        this.l10n_fr_hash = this.l10n_fr_hash || false;
        this.save_to_db();
    }
    export_for_printing() {
      var result = super.export_for_printing(...arguments);
      result.l10n_fr_hash = this.get_l10n_fr_hash();
      return result;
    }
    set_l10n_fr_hash (l10n_fr_hash){
      this.l10n_fr_hash = l10n_fr_hash;
    }
    get_l10n_fr_hash() {
      return this.l10n_fr_hash;
    }
    wait_for_push_order() {
      var result = super.wait_for_push_order(...arguments);
      result = Boolean(result || this.pos.is_french_country());
      return result;
    }
    destroy (option) {
        // SUGGESTION: It's probably more appropriate to apply this restriction
        // in the TicketScreen.
        if (option && option.reason == 'abandon' && this.pos.is_french_country() && this.get_orderlines().length) {
            Gui.showPopup("ErrorPopup", {
                'title': _t("Fiscal Data Module error"),
                'body':  _t("Deleting of orders is not allowed."),
            });
        } else {
            super.destroy(...arguments);
        }
    }
}
Registries.Model.extend(Order, L10nFrOrder);


const L10nFrOrderline = (Orderline) => class L10nFrOrderline extends Orderline {
    can_be_merged_with(orderline) {
        if (this.pos.is_french_country()) {
            const order = this.pos.get_order();
            const lastOrderline = order.orderlines.at(order.orderlines.length - 1);
            if ((lastOrderline.product.id !== orderline.product.id || lastOrderline.quantity < 0)) {
>>>>>>> 4125e42dcd6 (temp)
                return false;
            }
            return _.contains(french_countries, this.company.country.code);
        }
        disallowLineQuantityChange() {
            const result = super.disallowLineQuantityChange(...arguments);
            return this.is_french_country() || result;
        }
    };
Registries.Model.extend(PosGlobalState, L10nFrPosGlobalState);

const L10nFrOrder = (Order) =>
    class L10nFrOrder extends Order {
        constructor() {
            super(...arguments);
            this.l10n_fr_hash = this.l10n_fr_hash || false;
            this.save_to_db();
        }
        export_for_printing() {
            var result = super.export_for_printing(...arguments);
            result.l10n_fr_hash = this.get_l10n_fr_hash();
            return result;
        }
        set_l10n_fr_hash(l10n_fr_hash) {
            this.l10n_fr_hash = l10n_fr_hash;
        }
        get_l10n_fr_hash() {
            return this.l10n_fr_hash;
        }
        wait_for_push_order() {
            var result = super.wait_for_push_order(...arguments);
            result = Boolean(result || this.pos.is_french_country());
            return result;
        }
        destroy(option) {
            // SUGGESTION: It's probably more appropriate to apply this restriction
            // in the TicketScreen.
            if (
                option &&
                option.reason == "abandon" &&
                this.pos.is_french_country() &&
                this.get_orderlines().length
            ) {
                Gui.showPopup("ErrorPopup", {
                    title: _t("Fiscal Data Module error"),
                    body: _t("Deleting of orders is not allowed."),
                });
            } else {
                super.destroy(...arguments);
            }
        }
    };
Registries.Model.extend(Order, L10nFrOrder);

const L10nFrOrderline = (Orderline) =>
    class L10nFrOrderline extends Orderline {
        can_be_merged_with(orderline) {
            const order = this.pos.get_order();
            const orderlines = order.orderlines;
            const lastOrderline = order.orderlines.at(orderlines.length - 1);

            if (
                this.pos.is_french_country() &&
                (lastOrderline.product.id !== orderline.product.id || lastOrderline.quantity < 0)
            ) {
                return false;
            } else {
                return super.can_be_merged_with(...arguments);
            }
        }
    };
Registries.Model.extend(Orderline, L10nFrOrderline);
