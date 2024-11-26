import { Component, toRaw } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { ProductCard } from "@point_of_sale/app/generic_components/product_card/product_card";

export class ProductList extends Component {
    static template = "point_of_sale.ProductList";
    static components = {
        ProductCard,
    };
    static props = {
        searchWord: String,
    };
    setup() {
        super.setup();
        this.pos = toRaw(usePos());
        this.dialog = useService("dialog");
        this.searchWord = this.props.searchWord;
    }

    getProductPrice(product) {
        return this.pos.getProductPriceFormatted(product);
    }

    getProductName(product) {
        const productTmplValIds = product.attribute_line_ids
            .map((l) => l.product_template_value_ids)
            .flat();
        return productTmplValIds.length > 1 ? product.name : product.display_name;
    }

    getProductImage(product) {
        return product.getTemplateImageUrl();
    }

    addMainProductsToDisplay(products) {
        const uniqueProductsMap = new Map();
        for (const product of products) {
            if (product.id in this.pos.mainProductVariant) {
                const mainProduct = this.pos.mainProductVariant[product.id];
                uniqueProductsMap.set(mainProduct.id, mainProduct);
            } else {
                uniqueProductsMap.set(product.id, product);
            }
        }
        return Array.from(uniqueProductsMap.values());
    }

    getProductsByCategory(category) {
        const allCategoryIds = category.getAllChildren().map((cat) => cat.id);
        const products = allCategoryIds.flatMap(
            (catId) => this.pos.models["product.product"].getBy("pos_categ_ids", catId) || []
        );
        // Remove duplicates since owl doesn't like it.
        return Array.from(new Set(products));
    }

    getProductsBySearchWord(searchWord) {
        const exactMatches = this.products.filter((product) => product.exactMatch(searchWord));

        if (exactMatches.length > 0 && searchWord.length > 2) {
            return exactMatches;
        }

        const fuzzyMatches = fuzzyLookup(unaccent(searchWord, false), this.products, (product) =>
            unaccent(product.searchString, false)
        );

        return Array.from(new Set([...exactMatches, ...fuzzyMatches]));
    }

    get products() {
        return this.pos.models["product.product"].getAll();
    }

    get productsToDisplay() {
        let list = [];
        if (this.searchWord !== "") {
            list = this.addMainProductsToDisplay(this.getProductsBySearchWord(this.searchWord));
        } else if (this.pos.selectedCategory?.id) {
            list = this.getProductsByCategory(this.pos.selectedCategory);
        } else {
            list = this.products;
        }

        if (!list || list.length === 0) {
            return [];
        }

        const excludedProductIds = [
            this.pos.config.tip_product_id?.id,
            ...this.pos.hiddenProductIds,
            ...this.pos.session._pos_special_products_ids,
        ];

        list = list
            .filter(
                (product) => !excludedProductIds.includes(product.id) && product.available_in_pos
            )
            .slice(0, 100);

        return this.searchWord !== ""
            ? list
            : list.sort((a, b) => a.display_name.localeCompare(b.display_name));
    }

    async onProductInfoClick(product) {
        const info = await reactive(this.pos).getProductInfo(product, 1);
        this.dialog.add(ProductInfoPopup, { info: info, product: product });
    }

    async addProductToOrder(product) {
        await this.pos.addLineToCurrentOrder({ product_id: product }, {});
    }
}
