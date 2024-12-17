import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { extractMany2OneProps, Many2One, useMany2OneController } from "@web/views/fields/many2one";
import { Avatar } from "../avatar/avatar";
import { useAssignUserCommand } from "../assign_user_command_hook";

export class Many2OneAvatarUserField extends Component {
    static template = `mail.${this.name}`;
    static components = { Avatar, Many2One };
    static props = ["*"];
    static defaultProps = {};

    setup() {
        this.controller = useMany2OneController(() => this.props);
        if (this.props.withCommand) {
            useAssignUserCommand();
        }
    }

    get relation() {
        // This getter is used by `useAssignUserCommand`...
        // @todo: remove this getter
        return this.controller.relation;
    }

    get many2oneProps() {
        return this.controller.computeProps();
    }
}

registry.category("fields").add("many2one_avatar_user", {
    component: Many2OneAvatarUserField,
    extractProps(staticInfo, dynamicInfo) {
        const props = extractMany2OneProps(staticInfo, dynamicInfo);
        props.withCommand = ["form", "list"].includes(staticInfo.viewType);
        return props;
    },
});
