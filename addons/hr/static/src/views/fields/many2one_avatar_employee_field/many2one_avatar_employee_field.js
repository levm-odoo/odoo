import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { Many2One } from "@web/views/fields/many2one";

export class Many2OneAvatarEmployeeField extends Component {
    static template = `hr.${Many2OneAvatarEmployeeField.name}`;
    static components = { Many2One };
    static props = ["*"];
    static defaultProps = {};
}

registry.category("fields").add("many2one_avatar_employee", {
    component: Many2OneAvatarEmployeeField,
});
