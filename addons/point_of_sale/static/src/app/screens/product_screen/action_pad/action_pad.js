import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { Component, useState } from "@odoo/owl";
import { SelectPartnerButton } from "@point_of_sale/app/screens/product_screen/control_buttons/select_partner_button/select_partner_button";
import { useService } from "@web/core/utils/hooks";
import { BackButton } from "@point_of_sale/app/screens/product_screen/action_pad/back_button/back_button";

export class ActionpadWidget extends Component {
    static template = "point_of_sale.ActionpadWidget";
    static components = { SelectPartnerButton, BackButton };
    static props = {
        partner: { type: [Object, { value: null }], optional: true },
        onClickMore: { type: Function, optional: true },
        showActionButton: { type: Boolean, optional: true },
        showPartnerButton: { type: Boolean, optional: true },
        actions: {
            type: Array,
            element: {
                type: Object,
                shape: {
                    actionName: String,
                    actionToTrigger: Function,
                    disabled: { type: Boolean, optional: true },
                },
            },
        },
    };
    static defaultProps = {
        showActionButton: true,
        showPartnerButton: true,
    };

    setup() {
        this.pos = usePos();
        this.ui = useState(useService("ui"));
    }

    get swapButton() {
        return false;
    }
}
