import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

export class DoubleScreen extends Component {
    static template = "point_of_sale.DoubleScreen";
    static props = {
        left: Function,
        right: Function,
        leftWidth: { type: Number, optional: true },
        rightWidth: { type: Number, optional: true },
        leftProps: { type: Object, optional: true },
        rightProps: { type: Object, optional: true },
    };
    static defaultProps = {
        leftProps: {},
        rightProps: {},
    };

    setup() {
        this.pos = usePos();
        this.ui = useState(useService("ui"));
    }

    get mobileSide() {
        return this.pos.mobileSide;
    }

    get leftScreen() {
        return this.props.left;
    }

    get rightScreen() {
        return this.props.right;
    }

    get leftProps() {
        return this.props.leftProps;
    }

    get rightProps() {
        return this.props.rightProps;
    }

    get leftWidth() {
        return this.props.leftWidth ?? 100 - this.props.rightWidth ?? 25;
    }

    get rightWidth() {
        return this.props.rightWidth ?? 100 - this.props.leftWidth ?? 75;
    }

    get mobileComponent() {
        return this.mobileSide === "left" ? this.leftScreen : this.rightScreen;
    }

    get mobileProps() {
        return this.mobileSide === "left" ? this.leftProps : this.rightProps;
    }
}
