import { Dialog } from "@web/core/dialog/dialog";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { Component, useState } from "@odoo/owl";
import { ProductInfoBanner } from "@point_of_sale/app/components/product_info_banner/product_info_banner";

export class ProductInfoPopup extends Component {
    static template = "point_of_sale.ProductInfoPopup";
    static components = { Dialog, ProductInfoBanner };
    static props = ["info", "productTemplate", "close"];

    setup() {
        this.pos = usePos();
        this.state = useState({
            isFavorite: this.props.productTemplate.is_favorite,
        });
    }
    searchProduct(productName) {
        this.pos.setSelectedCategory(0);
        this.pos.searchProductWord = productName;
        this.props.close();
    }
    _hasMarginsCostsAccessRights() {
        const isAccessibleToEveryUser = this.pos.config.is_margins_costs_accessible_to_every_user;
        const isCashierManager = this.pos.getCashier().role === "manager";
        const isMinimalCashier = this.pos.getCashier().role === "minimal";
        return isAccessibleToEveryUser || isCashierManager || isMinimalCashier;
    }
    editProduct() {
        this.pos.editProduct(this.props.productTemplate);
        this.props.close();
    }
    get allowProductEdition() {
        return true; // Overrided in pos_hr
    }
    toggleFavorite() {
        this.state.isFavorite = !this.state.isFavorite;
    }
    confirm() {
        if (this.state.isFavorite !== this.props.productTemplate.is_favorite) {
            this.pos.data.write("product.template", [this.props.productTemplate.id], {
                is_favorite: this.state.isFavorite,
            });
        }
        this.props.close();
    }
}
