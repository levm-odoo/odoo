import { Component, markup } from "@odoo/owl";

export class ReceiptHeader extends Component {
    static template = "point_of_sale.ReceiptHeader";
    static props = {
        order: Object,
        previewMode: { type: Boolean, optional: true },
    };

    get order() {
        return this.props.order;
    }

    get partnerAddress() {
        return this.order.partner_id.pos_contact_address.split("\n");
    }

    get receiptLogoSrc() {
        const logo = this.order.config.receipt_logo;
        if (logo) {
            return "data:image/png;base64," + logo;
        }
        return this.props.previewMode
            ? `/web/image?model=pos.config&id=${this.order.config.id}&field=receipt_logo`
            : false;
    }

    get headerMarkup() {
        return markup(this.order.config.receipt_header);
    }
}
