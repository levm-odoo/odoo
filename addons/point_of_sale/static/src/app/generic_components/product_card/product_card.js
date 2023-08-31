/** @odoo-module */

import { Component } from "@odoo/owl";

export class ProductCard extends Component {
    static template = "point_of_sale.ProductCard";
    static props = {
        class: { type: String, optional: true },
        name: String,
        productId: Number,
        price: String,
        imageUrl: String,
        onClick: { type: Function, optional: true },
    };
    static defaultProps = {
        onClick: () => {},
        class: "",
    };
}
