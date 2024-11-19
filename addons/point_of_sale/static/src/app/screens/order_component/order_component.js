import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { Component, useState } from "@odoo/owl";
import { Numpad } from "@point_of_sale/app/components/numpad/numpad";
import { ActionpadWidget } from "@point_of_sale/app/screens/product_screen/action_pad/action_pad";
import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";

export class OrderComponent extends Component {
    static template = "point_of_sale.OrderComponent";
    static components = {
        ActionpadWidget,
        Numpad,
        ControlButtons,
        OrderSummary,
    };
    static props = {
        order: { type: [Object, { value: null }], optional: true },
        showControlButtons: Boolean,
        getNumpadButtons: Function,
        onNumpadClick: Function,
        getActionProps: Function,
        topComponent: Function,
        topProps: { type: Object, optional: true },
    };
    static defaultProps = {
        topProps: {},
    };
    static storeOnOrder = true;

    setup() {
        super.setup();
        this.ui = useState(useService("ui"));
        this.pos = usePos();
    }
}
