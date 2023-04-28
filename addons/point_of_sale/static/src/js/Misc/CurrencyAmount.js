/** @odoo-module */

import { Component } from "@odoo/owl";

export class CurrencyAmount extends Component {
    static template = "CurrencyAmount";
    static props = {
        currency: Object,
        amount: String,
    };
}
