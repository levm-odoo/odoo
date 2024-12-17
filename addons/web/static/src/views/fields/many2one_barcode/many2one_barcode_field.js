import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { Many2One, useMany2OneController } from "../many2one";

export class Many2OneBarcodeField extends Component {
    static template = `web.${this.name}`;
    static components = { Many2One };
    static props = ["*"];

    setup() {
        this.controller = useMany2OneController(() => this.props);
    }
}

export const many2OneBarcodeField = {};

registry.category("fields").add("many2one_barcode", {
    component: Many2OneBarcodeField,
    displayName: _t("Many2OneBarcode"),
});
