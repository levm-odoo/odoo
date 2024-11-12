import { Component } from "@odoo/owl";

export class SelectionBox extends Component {
    static components = {};
    static template = "web.SelectionBox";
    static props = ["*"];

    get nbSelected() {
        return this.props.selection.length;
    }

    get isDomainSelected() {
        return this.props.isDomainSelected;
    }

    get hasSelectedRecords() {
        return this.nbSelected || this.isDomainSelected;
    }

    onUnselectAll() {
        this.props.selection.forEach((record) => {
            record.toggleSelection(false);
        });
        this.props.selectDomain(false);
    }
}
