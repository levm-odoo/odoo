import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { Many2One, useMany2OneController } from "../many2one";

export class Many2OneAvatarField extends Component {
    static template = `web.${this.name}`;
    static components = { Many2One };
    static props = ["*"];
    static defaultProps = {};

    setup() {
        this.controller = useMany2OneController(() => this.props);
    }

    get many2oneProps() {
        return this.controller.computeProps();
    }
}

registry.category("fields").add("many2one_avatar", {
    component: Many2OneAvatarField,
    displayName: _t("Many2One Avatar"),
    supportedTypes: ["many2one"],
});
