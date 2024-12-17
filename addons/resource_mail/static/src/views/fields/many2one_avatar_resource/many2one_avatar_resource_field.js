import { Component } from "@odoo/owl";
import { AvatarCardResourcePopover } from "@resource_mail/components/avatar_card_resource/avatar_card_resource_popover";
import { usePopover } from "@web/core/popover/popover_hook";
import { registry } from "@web/core/registry";
import { extractMany2OneProps, Many2One, useMany2OneController } from "@web/views/fields/many2one";

class AvatarResource extends Component {
    static template = `resource_mail.${this.name}`;
    static props = {
        resId: { type: Number },
        resModel: { type: String },
    };

    setup() {
        this.popover = usePopover(AvatarCardResourcePopover);
    }

    openPopover(target) {
        if (this.env.isSmall || !this.props.resId) {
            return;
        }
        if (!this.popover.isOpen) {
            this.popover.open(target, {
                id: this.props.resId,
                recordModel: this.props.resModel,
            });
        }
    }
}

class Many2OneAvatarResourceField extends Component {
    static template = `resource_mail.${this.name}`;
    static components = { Many2One, AvatarResource };
    static props = ["*"];
    static defaultProps = {};

    setup() {
        this.controller = useMany2OneController(() => this.props);
    }

    get many2oneProps() {
        return this.controller.computeProps();
    }

    get resourceType() {
        return this.props.record.data.resource_type;
    }
}

registry.category("fields").add("many2one_avatar_resource", {
    component: Many2OneAvatarResourceField,
    fieldDependencies: [
        { name: "display_name", type: "char" },
        // to add in model that will use this widget for m2o field related to resource.resource record (as related field is only supported for x2m)
        { name: "resource_type", type: "selection" },
    ],
    extractProps(staticInfo, dynamicInfo) {
        return extractMany2OneProps(staticInfo, dynamicInfo);
    },
});
