/** @odoo-module */

import { random5Chars, uuidv4, qrCodeSrc, constructFullProductName } from "@point_of_sale/utils";
// FIXME POSREF - unify use of native parseFloat and web's parseFloat. We probably don't need the native version.
import { parseFloat as oParseFloat } from "@web/views/fields/parsers";
import {
    formatDate,
    formatDateTime,
    serializeDateTime,
    deserializeDate,
    deserializeDateTime,
} from "@web/core/l10n/dates";
import {
    formatFloat,
    roundDecimals as round_di,
    roundPrecision as round_pr,
    floatIsZero,
} from "@web/core/utils/numbers";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";
import { ProductConfiguratorPopup } from "@point_of_sale/app/store/product_configurator_popup/product_configurator_popup";
import { ComboConfiguratorPopup } from "./combo_configurator_popup/combo_configurator_popup";
import { ConfirmPopup } from "@point_of_sale/app/utils/confirm_popup/confirm_popup";
import { _t } from "@web/core/l10n/translation";
import { renderToElement } from "@web/core/utils/render";
import { ProductCustomAttribute } from "./models/product_custom_attribute";
import { omit } from "@web/core/utils/objects";

const { DateTime } = luxon;

/**
 * If optimization is needed, then we should implement this
 * using a Balanced Binary Tree to behave like an Object and an Array.
 * But behaving like Object (indexed by cid) might not be
 * needed. Let's see how it turns out.
 */
export class PosCollection extends Array {
    getByCID(cid) {
        return this.find((item) => item.cid == cid);
    }
    add(item) {
        this.push(item);
    }
    remove(item) {
        const index = this.findIndex((_item) => item.cid == _item.cid);
        if (index < 0) {
            return index;
        }
        this.splice(index, 1);
        return index;
    }
    reset() {
        this.length = 0;
    }
    at(index) {
        return this[index];
    }
}

let nextId = 0;
class PosModel {
    /**
     * Create an object with cid. If no cid is in the defaultObj,
     * cid is computed based on its id. Override _getCID if you
     * don't want this default calculation of cid.
     * @param {Object?} defaultObj its props copied to this instance.
     */
    constructor() {
        this.setup(...arguments);
    }
    // To be used by Model patches to patch constructor
    setup(defaultObj) {
        defaultObj = defaultObj || {};
        if (!defaultObj.cid) {
            defaultObj.cid = this._getCID(defaultObj);
        }
        Object.assign(this, defaultObj);
    }
    /**
     * Default cid getter. Used as local identity of this object.
     * @param {Object} obj
     */
    _getCID(obj) {
        if (obj.id) {
            if (typeof obj.id == "string") {
                return obj.id;
            } else if (typeof obj.id == "number") {
                return `c${obj.id}`;
            }
        }
        return `c${nextId++}`;
    }
}
export class Product extends PosModel {
    constructor(obj) {
        super(obj);
        this.parent_category_ids = [];
        let category = this.categ.parent;
        while (category) {
            this.parent_category_ids.push(category.id);
            category = category.parent;
        }
    }
    isAllowOnlyOneLot() {
        const productUnit = this.get_unit();
        return this.tracking === "lot" || !productUnit || !productUnit.is_pos_groupable;
    }
    /**
     * @returns {string}
     */
    getImageUrl() {
        return (
            (this.image_128 &&
                `/web/image?model=product.product&field=image_128&id=${this.id}&unique=${this.write_date}`) ||
            ""
        );
    }
    isTracked() {
        return (
            ["serial", "lot"].includes(this.tracking) &&
            (this.pos.picking_type.use_create_lots || this.pos.picking_type.use_existing_lots)
        );
    }
    get_unit() {
        var unit_id = this.uom_id;
        if (!unit_id) {
            return undefined;
        }
        unit_id = unit_id[0];
        if (!this.pos) {
            return undefined;
        }
        return this.pos.units_by_id[unit_id];
    }
    async _onScaleNotAvailable() {}
    get isScaleAvailable() {
        return true;
    }

    getProductPriceUnit(quantity){
        const pricelist = this.pos.getDefaultPricelist();
        return this.get_price(pricelist, quantity);
    }

    /**
     *  Collect the info about price/taxes.
     */
     getProductAmounts(quantity, priceUnit, discount, fiscalPosition){
        let taxesKey = this.taxes_key;

        // Fiscal position.
        if(fiscalPosition){
            priceUnit = this.evalPriceUnitAfterFiscalPosition(taxesKey, priceUnit, fiscalPosition)
            if(fiscalPosition.taxes_key_mapping.hasOwnProperty(taxesKey)){
                taxesKey = fiscalPosition.taxes_key_mapping[taxesKey];
            }
        }

        // Taxes computation.
        const taxesResults = this.pos.evalTaxesComputation(taxesKey, priceUnit, quantity);

        return {
            ...taxesResults,
            priceUnit: priceUnit,
            quantity: quantity,
            discount: discount,
            fiscalPosition: fiscalPosition,
            taxIds: taxesResults.taxValuesList.map(x => x.taxId),
        };
     }

    /**
     *  Collect the info to be displayed on the card representing the product.
     */
    getProductCardValues(){
        const priceMode = this.pos.config.iface_tax_included;
        const quantity = 1.0;
        const priceUnit = this.getProductPriceUnit(quantity);
        const fiscalPosition = this.pos.get_order()?.fiscal_position;
        const amounts = this.getProductAmounts(quantity, priceUnit, 0.0, fiscalPosition);
        const price = priceMode === "total" ? amounts.totalIncluded : amounts.totalExcluded;

        let displayPrice = this.env.utils.formatCurrency(price);
        if (this.to_weight) {
            displayPrice = `${displayPrice}/${this.get_unit().name}`;
        }

        return {
            ...amounts,
            record: this,
            imageUrl: this.getImageUrl(),
            displayPrice: displayPrice,
        }
    }

    async getProductInfoPopupValues(){

        function computeMargin(totalExcluded, totalCost){
            const marginPrice = totalExcluded - totalCost;
            const marginPercent = totalExcluded ? marginPrice * 100 / totalExcluded : 0;
            return {
                marginPrice: marginPrice,
                marginPercentStr: marginPercent.toFixed(2),
            }
        }

        const values = this.getProductCardValues();

        // Extra product info not available js-side.
        const productInfo = await this.pos.orm.call("product.product", "get_product_info_pos", [
            [this.id],
            1.0,
            this.pos.config.id,
        ]);

        // Display code below the product name.
        const displayCodes = [];
        if(this.default_code){
            displayCodes.push(this.default_code);
        }
        if(this.barcode){
            displayCodes.push(this.barcode);
        }
        const displayCode = displayCodes.join(" - ");

        // Margin.
        const { marginPrice, marginPercentStr } = computeMargin(values.totalExcluded, this.standard_price);

        // Order.
        const order = this.pos.get_order();
        const orderValues = order.getOrderScreenValues();
        const orderMarginValues = computeMargin(orderValues.totalExcluded, orderValues.totalCost);

        return {
            ...values,
            ...productInfo,
            displayCode: displayCode,
            marginPrice: marginPrice,
            marginPercentStr: marginPercentStr,
            orderTotalCost: orderValues.totalCost,
            orderTotalExcluded: orderValues.totalExcluded,
            orderMarginPrice: orderMarginValues.marginPrice,
            orderMarginPercentStr: orderMarginValues.marginPercentStr,
        }
    }

    async getAddProductOptions(code) {
        let price_extra = 0.0;
        let draftPackLotLines, packLotLinesToEdit, attribute_value_ids;
        let quantity = 1;
        let comboLines = [];
        let attribute_custom_values = {};

        if (code && this.pos.db.product_packaging_by_barcode[code.code]) {
            quantity = this.pos.db.product_packaging_by_barcode[code.code].qty;
        }

        if (this.attribute_line_ids.some((id) => id in this.pos.attributes_by_ptal_id)) {
            const attributes = this.attribute_line_ids
                .map((id) => this.pos.attributes_by_ptal_id[id])
                .filter((attr) => attr !== undefined);
            const { confirmed, payload } = await this.env.services.popup.add(
                ProductConfiguratorPopup,
                {
                    product: this,
                    attributes: attributes,
                    quantity: quantity,
                }
            );

            if (confirmed) {
                attribute_value_ids = payload.attribute_value_ids;
                attribute_custom_values = payload.attribute_custom_values;
                price_extra += payload.price_extra;
                quantity = payload.quantity;
            } else {
                return;
            }
        }
        if (this.combo_ids.length) {
            const { confirmed, payload } = await this.env.services.popup.add(
                ComboConfiguratorPopup,
                { product: this }
            );
            if (!confirmed) {
                return;
            }
            comboLines = payload;
        }
        // Gather lot information if required.
        if (this.isTracked()) {
            packLotLinesToEdit =
                (!this.isAllowOnlyOneLot() &&
                    this.pos.selectedOrder
                        .get_orderlines()
                        .filter((line) => !line.get_discount())
                        .find((line) => line.product.id === this.id)
                        ?.getPackLotLinesToEdit()) ||
                [];
            // if the lot information exists in the barcode, we don't need to ask it from the user.
            if (code && code.type === "lot") {
                // consider the old and new packlot lines
                const modifiedPackLotLines = Object.fromEntries(
                    packLotLinesToEdit.filter((item) => item.id).map((item) => [item.id, item.text])
                );
                const newPackLotLines = [{ lot_name: code.code }];
                draftPackLotLines = { modifiedPackLotLines, newPackLotLines };
            } else {
                draftPackLotLines = await this.pos.getEditedPackLotLines(
                    this.isAllowOnlyOneLot(),
                    packLotLinesToEdit,
                    this.display_name
                );
            }
            if (!draftPackLotLines) {
                return;
            }
        }

        // Take the weight if necessary.
        if (this.to_weight && this.pos.config.iface_electronic_scale) {
            // Show the ScaleScreen to weigh the product.
            if (this.isScaleAvailable) {
                const product = this;
                const { confirmed, payload } = await this.env.services.pos.showTempScreen(
                    "ScaleScreen",
                    {
                        product,
                    }
                );
                if (confirmed) {
                    quantity = payload.weight;
                } else {
                    // do not add the product;
                    return;
                }
            } else {
                await this._onScaleNotAvailable();
            }
        }

        return {
            draftPackLotLines,
            quantity,
            attribute_custom_values,
            price_extra,
            comboLines,
            attribute_value_ids,
        };
    }
    isPricelistItemUsable(item, date) {
        const categories = this.parent_category_ids.concat(this.categ.id);
        return (
            (!item.categ_id || categories.includes(item.categ_id[0])) &&
            (!item.date_start || deserializeDate(item.date_start) <= date) &&
            (!item.date_end || deserializeDate(item.date_end) >= date)
        );
    }
    // Port of _get_product_price on product.pricelist.
    //
    // Anything related to UOM can be ignored, the POS will always use
    // the default UOM set on the product and the user cannot change
    // it.
    //
    // Pricelist items do not have to be sorted. All
    // product.pricelist.item records are loaded with a search_read
    // and were automatically sorted based on their _order by the
    // ORM. After that they are added in this order to the pricelists.
    get_price(pricelist, quantity, price_extra = 0, recurring = false) {
        const date = DateTime.now();

        // In case of nested pricelists, it is necessary that all pricelists are made available in
        // the POS. Display a basic alert to the user in the case where there is a pricelist item
        // but we can't load the base pricelist to get the price when calling this method again.
        // As this method is also call without pricelist available in the POS, we can't just check
        // the absence of pricelist.
        if (recurring && !pricelist) {
            alert(
                _t(
                    "An error occurred when loading product prices. " +
                        "Make sure all pricelists are available in the POS."
                )
            );
        }

        const rules = !pricelist
            ? []
            : (this.applicablePricelistItems[pricelist.id] || []).filter((item) =>
                  this.isPricelistItemUsable(item, date)
              );

        let price = this.lst_price + (price_extra || 0);
        const rule = rules.find((rule) => !rule.min_quantity || quantity >= rule.min_quantity);
        if (!rule) {
            return price;
        }

        if (rule.base === "pricelist") {
            const base_pricelist = this.pos.pricelists.find(
                (pricelist) => pricelist.id === rule.base_pricelist_id[0]
            );
            if (base_pricelist) {
                price = this.get_price(base_pricelist, quantity, 0, true);
            }
        } else if (rule.base === "standard_price") {
            price = this.standard_price;
        }

        if (rule.compute_price === "fixed") {
            price = rule.fixed_price;
        } else if (rule.compute_price === "percentage") {
            price = price - price * (rule.percent_price / 100);
        } else {
            var price_limit = price;
            price -= price * (rule.price_discount / 100);
            if (rule.price_round) {
                price = round_pr(price, rule.price_round);
            }
            if (rule.price_surcharge) {
                price += rule.price_surcharge;
            }
            if (rule.price_min_margin) {
                price = Math.max(price, price_limit + rule.price_min_margin);
            }
            if (rule.price_max_margin) {
                price = Math.min(price, price_limit + rule.price_max_margin);
            }
        }

        // This return value has to be rounded with round_di before
        // being used further. Note that this cannot happen here,
        // because it would cause inconsistencies with the backend for
        // pricelist that have base == 'pricelist'.
        return price;
    }
    get_display_price({
        pricelist = this.pos.getDefaultPricelist(),
        quantity = 1,
        price = this.get_price(pricelist, quantity),
        iface_tax_included = this.pos.config.iface_tax_included,
    } = {}) {
        let taxesKey = this.taxes_key;

        // Fiscal position.
        const order = this.pos.get_order();
        if(order && order.fiscal_position){
            price = this.evalPriceUnitAfterFiscalPosition(taxesKey, price, order.fiscal_position)
            if(order.fiscal_position.taxes_key_mapping.hasOwnProperty(taxesKey)){
                taxesKey = order.fiscal_position.taxes_key_mapping[taxesKey];
            }
        }

        // Taxes computation.
        const results = this.pos.evalTaxesComputation(taxesKey, price, 1);

        if (iface_tax_included === "total") {
            return results.totalIncluded;
        } else {
            return results.totalExcluded;
        }
    }
}

var orderline_id = 1;

// An orderline represent one element of the content of a customer's shopping cart.
// An orderline contains a product, its quantity, its price, discount. etc.
// An Order contains zero or more Orderlines.
export class Orderline extends PosModel {
    setup(_defaultObj, options) {
        super.setup(...arguments);
        this.pos = options.pos;
        this.order = options.order;
        this.price_type = options.price_type;
        this.uuid = this.uuid || uuidv4();

        this.price_type = options.price_type || "original";
        if (options.json) {
            try {
                this.init_from_JSON(options.json);
            } catch {
                console.error(
                    "ERROR: attempting to recover product ID",
                    options.json.product_id[0],
                    "not available in the point of sale. Correct the product or clean the browser cache."
                );
            }
            return;
        }
        this.product = options.product;
        this.tax_ids = options.tax_ids;
        this.set_product_lot(this.product);
        options.quantity ? this.set_quantity(options.quantity) : this.set_quantity(1);
        this.discount = 0;
        this.note = "";
        this.custom_attribute_value_ids = [];
        this.hasChange = false;
        this.skipChange = false;
        this.discountStr = "0";
        this.selected = false;
        this.price_extra = 0;
        this.full_product_name = "";
        this.id = orderline_id++;
        this.customerNote = this.customerNote || "";
        this.saved_quantity = 0;

        if (options.price) {
            this.set_unit_price(options.price);
        } else {
            this.set_unit_price(this.product.get_price(this.order.pricelist, this.get_quantity()));
        }
    }
    init_from_JSON(json) {
        this.product = this.pos.db.get_product_by_id(json.product_id);
        this.set_product_lot(this.product);
        this.price = json.price_unit;
        this.price_type = json.price_type;
        this.set_discount(json.discount);
        this.set_quantity(json.qty, "do not recompute unit price");
        this.attribute_value_ids = json.attribute_value_ids || [];
        this.set_price_extra(json.price_extra);
        this.custom_attribute_value_ids = json.custom_attribute_value_ids.map((attr) => {
            if (attr.length > 0) {
                attr = attr[2];
            }
            return new ProductCustomAttribute(attr);
        });
        this.set_full_product_name();
        this.id = json.server_id || json.id || orderline_id++;
        orderline_id = Math.max(this.id + 1, orderline_id);
        var pack_lot_lines = json.pack_lot_ids;
        for (var i = 0; i < pack_lot_lines.length; i++) {
            var packlotline = pack_lot_lines[i][2];
            var pack_lot_line = new Packlotline(
                { env: this.env },
                { json: { ...packlotline, order_line: this } }
            );
            this.pack_lot_lines.add(pack_lot_line);
        }
        this.tax_ids = json.tax_ids && json.tax_ids.length !== 0 ? json.tax_ids[0][2] : undefined;
        this.set_customer_note(json.customer_note);
        this.refunded_qty = json.refunded_qty;
        this.refunded_orderline_id = json.refunded_orderline_id;
        this.saved_quantity = json.qty;
        this.uuid = json.uuid;
        this.skipChange = json.skip_change;
        this.combo_line_ids = json.combo_line_ids;
        this.combo_parent_id = json.combo_parent_id;
    }
    clone() {
        var orderline = new Orderline(
            { env: this.env },
            {
                pos: this.pos,
                order: this.order,
                product: this.product,
                price: this.price,
            }
        );
        orderline.order = null;
        orderline.custom_attribute_value_ids = this.custom_attribute_value_ids;
        orderline.quantity = this.quantity;
        orderline.quantityStr = this.quantityStr;
        orderline.discount = this.discount;
        orderline.price = this.price;
        orderline.selected = false;
        orderline.price_type = this.price_type;
        orderline.customerNote = this.customerNote;
        return orderline;
    }
    getDisplayClasses() {
        return {};
    }
    getPackLotLinesToEdit(isAllowOnlyOneLot) {
        const currentPackLotLines = this.pack_lot_lines;
        let nExtraLines = Math.abs(this.quantity) - currentPackLotLines.length;
        nExtraLines = Math.ceil(nExtraLines);
        nExtraLines = nExtraLines > 0 ? nExtraLines : 1;
        const tempLines = currentPackLotLines
            .map((lotLine) => ({
                id: lotLine.cid,
                text: lotLine.lot_name,
            }))
            .concat(
                Array.from(Array(nExtraLines)).map((_) => ({
                    text: "",
                }))
            );
        return isAllowOnlyOneLot ? [tempLines[0]] : tempLines;
    }
    // What if a number different from 1 (or -1) is specified
    // to an orderline that has product tracked by lot? Lot tracking (based
    // on the current implementation) requires that 1 item per orderline is
    // allowed.
    async editPackLotLines() {
        const isAllowOnlyOneLot = this.product.isAllowOnlyOneLot();
        const editedPackLotLines = await this.pos.getEditedPackLotLines(
            isAllowOnlyOneLot,
            this.getPackLotLinesToEdit(isAllowOnlyOneLot),
            this.product.display_name
        );
        if (!editedPackLotLines) {
            return;
        }
        this.setPackLotLines(editedPackLotLines);
        this.order.select_orderline(this);
    }
    /**
     * @param { modifiedPackLotLines, newPackLotLines }
     *    @param {Object} modifiedPackLotLines key-value pair of String (the cid) & String (the new lot_name)
     *    @param {Array} newPackLotLines array of { lot_name: String }
     */
    setPackLotLines({ modifiedPackLotLines, newPackLotLines }) {
        // Set the new values for modified lot lines.
        const lotLinesToRemove = [];
        for (const lotLine of this.pack_lot_lines) {
            const modifiedLotName = modifiedPackLotLines[lotLine.cid];
            if (modifiedLotName) {
                lotLine.lot_name = modifiedLotName;
            } else {
                // We should not call lotLine.remove() here because
                // we don't want to mutate the array while looping thru it.
                lotLinesToRemove.push(lotLine);
            }
        }

        // Remove those that needed to be removed.
        for (const lotLine of lotLinesToRemove) {
            this.pack_lot_lines.remove(lotLine);
        }

        // Create new pack lot lines.
        let newPackLotLine;
        for (const newLotLine of newPackLotLines) {
            newPackLotLine = new Packlotline({ env: this.env }, { order_line: this });
            newPackLotLine.lot_name = newLotLine.lot_name;
            this.pack_lot_lines.add(newPackLotLine);
        }

        // Set the quantity of the line based on number of pack lots.
        if (!this.product.to_weight) {
            this.set_quantity_by_lot();
        }
    }
    set_product_lot(product) {
        this.has_product_lot = product.tracking !== "none";
        this.pack_lot_lines = this.has_product_lot && new PosCollection();
    }
    getNote() {
        return this.note;
    }
    setNote(note) {
        this.note = note;
    }
    setHasChange(isChange) {
        this.hasChange = isChange;
    }
    // sets a discount [0,100]%
    set_discount(discount) {
        var parsed_discount =
            typeof discount === "number"
                ? discount
                : isNaN(parseFloat(discount))
                ? 0
                : oParseFloat("" + discount);
        var disc = Math.min(Math.max(parsed_discount || 0, 0), 100);
        this.discount = disc;
        this.discountStr = "" + disc;
    }
    // returns the discount [0,100]%
    get_discount() {
        return this.discount;
    }
    get_discount_str() {
        return this.discountStr;
    }
    set_price_extra(price_extra) {
        this.price_extra = parseFloat(price_extra) || 0.0;
    }
    set_full_product_name() {
        this.full_product_name = constructFullProductName(
            this,
            this.pos.db.attribute_value_by_id,
            this.product.display_name
        );
    }
    get_price_extra() {
        return this.price_extra;
    }
    updateSavedQuantity() {
        this.saved_quantity = this.quantity;
    }
    // sets the quantity of the product. The quantity will be rounded according to the
    // product's unity of measure properties. Quantities greater than zero will not get
    // rounded to zero
    // Return true if successfully set the quantity, otherwise, return false.
    set_quantity(quantity, keep_price) {
        this.order.assert_editable();
        var quant =
            typeof quantity === "number" ? quantity : oParseFloat("" + (quantity ? quantity : 0));
        if (this.refunded_orderline_id in this.pos.toRefundLines) {
            const toRefundDetail = this.pos.toRefundLines[this.refunded_orderline_id];
            const maxQtyToRefund =
                toRefundDetail.orderline.qty - toRefundDetail.orderline.refundedQty;
            if (quant > 0) {
                this.env.services.popup.add(ErrorPopup, {
                    title: _t("Positive quantity not allowed"),
                    body: _t(
                        "Only a negative quantity is allowed for this refund line. Click on +/- to modify the quantity to be refunded."
                    ),
                });
                return false;
            } else if (quant == 0) {
                toRefundDetail.qty = 0;
            } else if (-quant <= maxQtyToRefund) {
                toRefundDetail.qty = -quant;
            } else {
                this.env.services.popup.add(ErrorPopup, {
                    title: _t("Greater than allowed"),
                    body: _t(
                        "The requested quantity to be refunded is higher than the refundable quantity of %s.",
                        this.env.utils.formatProductQty(maxQtyToRefund)
                    ),
                });
                return false;
            }
        }
        var unit = this.get_unit();
        if (unit) {
            if (unit.rounding) {
                var decimals = this.pos.dp["Product Unit of Measure"];
                var rounding = Math.max(unit.rounding, Math.pow(10, -decimals));
                this.quantity = round_pr(quant, rounding);
                this.quantityStr = formatFloat(this.quantity, {
                    digits: [69, decimals],
                });
            } else {
                this.quantity = round_pr(quant, 1);
                this.quantityStr = this.quantity.toFixed(0);
            }
        } else {
            this.quantity = quant;
            this.quantityStr = "" + this.quantity;
        }

        // just like in sale.order changing the quantity will recompute the unit price
        if (!keep_price && this.price_type === "original") {
            this.set_unit_price(
                this.product.get_price(
                    this.order.pricelist,
                    this.get_quantity(),
                    this.get_price_extra()
                )
            );
            this.order.fix_tax_included_price(this);
        }
        return true;
    }
    // return the quantity of product
    get_quantity() {
        return this.quantity;
    }
    get_quantity_str() {
        return this.quantityStr;
    }
    get_quantity_str_with_unit() {
        if (this.is_pos_groupable()) {
            return this.quantityStr + " " + this.get_unit().name;
        } else {
            return this.quantityStr;
        }
    }

    get_lot_lines() {
        return this.pack_lot_lines && this.pack_lot_lines;
    }

    get_required_number_of_lots() {
        var lots_required = 1;

        if (this.product.tracking == "serial") {
            lots_required = Math.abs(this.quantity);
        }

        return lots_required;
    }

    get_valid_lots() {
        return this.pack_lot_lines.filter((item) => {
            return item.lot_name;
        });
    }

    set_quantity_by_lot() {
        var valid_lots_quantity = this.get_valid_lots().length;
        if (this.quantity < 0) {
            valid_lots_quantity = -valid_lots_quantity;
        }
        this.set_quantity(valid_lots_quantity);
    }

    has_valid_product_lot() {
        if (!this.has_product_lot) {
            return true;
        }
        var valid_product_lot = this.get_valid_lots();
        return this.get_required_number_of_lots() === valid_product_lot.length;
    }

    // return the unit of measure of the product
    get_unit() {
        return this.product.get_unit();
    }
    // return the product of this orderline
    get_product() {
        return this.product;
    }
    get_full_product_name() {
        return this.full_product_name || this.product.display_name;
    }
    // selects or deselects this orderline
    set_selected(selected) {
        this.selected = selected;
        // this trigger also triggers the change event of the collection.
    }
    // returns true if this orderline is selected
    is_selected() {
        return this.selected;
    }
    // when we add an new orderline we want to merge it with the last line to see reduce the number of items
    // in the orderline. This returns true if it makes sense to merge the two
    can_be_merged_with(orderline) {
        var price = parseFloat(
            round_di(this.price || 0, this.pos.dp["Product Price"]).toFixed(
                this.pos.dp["Product Price"]
            )
        );
        var order_line_price = orderline
            .get_product()
            .get_price(orderline.order.pricelist, this.get_quantity());
        order_line_price = round_di(
            orderline.compute_fixed_price(order_line_price),
            this.pos.currency.decimal_places
        );
        // only orderlines of the same product can be merged
        return (
            !this.skipChange &&
            orderline.getNote() === this.getNote() &&
            this.get_product().id === orderline.get_product().id &&
            this.get_unit() &&
            this.is_pos_groupable() &&
            // don't merge discounted orderlines
            this.get_discount() === 0 &&
            floatIsZero(
                price - order_line_price - orderline.get_price_extra(),
                this.pos.currency.decimal_places
            ) &&
            !(
                this.product.tracking === "lot" &&
                (this.pos.picking_type.use_create_lots || this.pos.picking_type.use_existing_lots)
            ) &&
            this.full_product_name === orderline.full_product_name &&
            orderline.get_customer_note() === this.get_customer_note() &&
            !this.refunded_orderline_id &&
            !this.isPartOfCombo() &&
            !orderline.isPartOfCombo()
        );
    }
    is_pos_groupable() {
        return this.get_unit()?.is_pos_groupable && !this.isPartOfCombo();
    }
    merge(orderline) {
        this.order.assert_editable();
        this.set_quantity(this.get_quantity() + orderline.get_quantity());
    }

    getOrderLineAmounts(discount=this.get_discount()){
        const fiscalPosition = this.order.fiscal_position;

        const quantity = this.get_quantity();
        const unitPrice = this.get_unit_price();
        const product = this.get_product();

        const amounts = product.getProductAmounts(quantity, unitPrice, discount, fiscalPosition);

        const priceMode = this.pos.config.iface_tax_included;
        const rounding = this.pos.currency.rounding;

        const displayPriceTotal = priceMode === "total" ? amounts.totalIncluded : amounts.totalExcluded;
        const displayPriceUnit = round_pr((displayPriceTotal * (1 - discount / 100)) / (quantity || 1.0), rounding);

        return {
            ...amounts,
            displayPriceTotal: displayPriceTotal,
            displayPriceUnit: displayPriceUnit,
        }
    }

    getOrderLineScreenValues(printing=false){
        const amounts = this.getOrderLineAmounts();
        const product = this.get_product();

        const discountPolicy = this.display_discount_policy();
        let unitPriceWoDiscount = null;
        if(amounts.discountPolicy === "without_discount" && amounts.discount){
            const amountsWoDiscount = this.getOrderLineAmounts(0.0);
            unitPriceWoDiscount = amountsWoDiscount.displayPriceUnit;
        }

        let packLotIds = [];
        if (this.has_product_lot) {
            packLotIds = this.pack_lot_lines.map((item) => item.export_as_JSON());
        }

        return {
            record: this,
            ...amounts,
            displayClasses: this.getDisplayClasses(),
            quantityStr: this.get_quantity_str(),
            discountStr: this.get_discount_str(),
            unit: this.get_unit(),
            packLotIds: packLotIds,
            product: product,
            fullProductName: this.get_full_product_name(),
            priceExtra: this.get_price_extra(),
            customerNote: this.get_customer_note(),
            internalNote: this.getNote(),
        };
    }

    convertToJSON(values){
        return {
            id: this.id,
            uuid: this.uuid,
            skip_change: this.skipChange,
            qty: values.quantity,
            custom_attribute_value_ids: this.custom_attribute_value_ids.map((attr) => [0, 0, attr]),
            price_unit: values.priceUnit,
            price_subtotal: values.totalExcluded,
            price_subtotal_incl: values.totalIncluded,
            discount: values.discount,
            product_id: values.product.id,
            tax_ids: [[6, false, values.taxIds]],
            pack_lot_ids: values.packLotIds.map((item) => [0, 0, item]),
            attribute_value_ids: this.attribute_value_ids || [],
            full_product_name: values.fullProductName,
            price_extra: values.priceExtra,
            customer_note: values.customerNote,
            refunded_orderline_id: this.refunded_orderline_id,
            price_type: this.price_type,
            combo_line_ids: this.comboLines?.map((line) => line.id || line.cid),
            combo_parent_id: this.comboParent?.id || this.comboParent?.cid,
        };
    }

    // changes the base price of the product for this orderline
    set_unit_price(price) {
        this.order.assert_editable();
        var parsed_price = !isNaN(price)
            ? price
            : isNaN(parseFloat(price))
            ? 0
            : oParseFloat("" + price);
        this.price = round_di(parsed_price || 0, this.pos.dp["Product Price"]);
    }
    get_unit_price() {
        var digits = this.pos.dp["Product Price"];
        // round and truncate to mimic _symbol_set behavior
        return parseFloat(round_di(this.price || 0, digits).toFixed(digits));
    }
    getUnitDisplayPriceBeforeDiscount() {
        if (this.pos.config.iface_tax_included === "total") {
            return this.get_all_prices(1).priceWithTaxBeforeDiscount;
        } else {
            return this.get_all_prices(1).priceWithoutTaxBeforeDiscount;
        }
    }
    get_base_price() {
        var rounding = this.pos.currency.rounding;
        return round_pr(
            this.get_unit_price() * this.get_quantity() * (1 - this.get_discount() / 100),
            rounding
        );
    }
    get_display_price() {
        if (this.pos.config.iface_tax_included === "total") {
            return this.get_price_with_tax();
        } else {
            return this.get_price_without_tax();
        }
    }
    get_taxed_lst_unit_price() {
        const priceUnit = this.compute_fixed_price(this.get_lst_price());
        const product = this.get_product();

        let taxesKey = product.taxes_key;

        // Fiscal position.
        if(this.order.fiscal_position){
            taxesKey = this.order.fiscal_position.taxes_key_mapping[taxesKey];
        }

        const taxesData = this.pos.evalTaxesComputation(taxesKey, priceUnit, 1);
        if (this.pos.config.iface_tax_included === "total") {
            return taxesData.totalIncluded;
        } else {
            return taxesData.totalExcluded;
        }
    }
    get_price_without_tax() {
        return this.get_all_prices().priceWithoutTax;
    }
    get_price_with_tax() {
        return this.get_all_prices().priceWithTax;
    }
    get_price_with_tax_before_discount() {
        return this.get_all_prices().priceWithTaxBeforeDiscount;
    }
    get_tax() {
        return this.get_all_prices().tax;
    }
    get_applicable_taxes() {
        var i;
        // Shenaningans because we need
        // to keep the taxes ordering.
        var ptaxes_ids = this.tax_ids || this.get_product().taxes_id;
        var ptaxes_set = {};
        for (i = 0; i < ptaxes_ids.length; i++) {
            ptaxes_set[ptaxes_ids[i]] = true;
        }
        var taxes = [];
        for (i = 0; i < this.pos.taxes.length; i++) {
            if (ptaxes_set[this.pos.taxes[i].id]) {
                taxes.push(this.pos.taxes[i]);
            }
        }
        return taxes;
    }
    get_tax_details() {
        return this.get_all_prices().taxDetails;
    }
    get_taxes() {
        var taxes_ids = this.tax_ids || this.get_product().taxes_id;
        return this.pos.getTaxesByIds(taxes_ids);
    }
    /**
     * Calculate the amount of taxes of a specific Orderline, that are included in the price.
     * @returns {Number} the total amount of price included taxes
     */
    get_total_taxes_included_in_price() {
        const productTaxes = this._getProductTaxesAfterFiscalPosition();
        const taxDetails = this.get_tax_details();
        return productTaxes
            .filter((tax) => tax.price_include)
            .reduce((sum, tax) => sum + taxDetails[tax.id].amount, 0);
    }
    _map_tax_fiscal_position(tax, order = false) {
        return this.pos._map_tax_fiscal_position(tax, order);
    }
    /**
     * Calculates the taxes for a product, and converts the taxes based on the fiscal position of the order.
     *
     * @returns {Object} The calculated product taxes after filtering and fiscal position conversion.
     */
    _getProductTaxesAfterFiscalPosition() {
        const product = this.get_product();
        let taxesIds = this.tax_ids || product.taxes_id;
        taxesIds = taxesIds.filter((t) => t in this.pos.taxes_by_id);
        return this.pos.get_taxes_after_fp(taxesIds, this.order.fiscal_position);
    }
    get_all_prices(qty = this.get_quantity()) {
        const product = this.get_product();
        const priceUnit = this.get_unit_price();
        const discount = this.get_discount();
        const priceUnitAfterDiscount = priceUnit * (1.0 - discount / 100.0);

        let taxesKey = this.product.taxes_key;

        // Fiscal position.
        if(this.order.fiscal_position){
            taxesKey = this.order.fiscal_position.taxes_key_mapping[taxesKey];
        }

        const taxesData = this.pos.evalTaxesComputation(taxesKey, priceUnitAfterDiscount, qty);
        const taxesDataBeforeDiscount = this.pos.evalTaxesComputation(taxesKey, priceUnit, qty);

        // Tax details.
        const taxDetails = {};
        for(const taxValues of taxesData.taxValuesList){
            taxDetails[taxValues.taxId] = {
                amount: taxValues.taxAmount,
                base: taxValues.base,
            };
        }

        return {
            priceWithTax: taxesData.totalIncluded,
            priceWithoutTax: taxesData.totalExcluded,
            priceWithTaxBeforeDiscount: taxesDataBeforeDiscount.totalIncluded,
            priceWithoutTaxBeforeDiscount: taxesDataBeforeDiscount.totalExcluded,
            tax: taxesData.totalIncluded - taxesData.totalExcluded,
            taxDetails: taxDetails,
        };
    }
    display_discount_policy() {
        return this.order.pricelist ? this.order.pricelist.discount_policy : "with_discount";
    }
    compute_fixed_price(price) {
        return this.pos.computePriceAfterFp(price, this.get_taxes());
    }
    get_fixed_lst_price() {
        return this.compute_fixed_price(this.get_lst_price());
    }
    get_lst_price() {
        return this.product.get_price(this.pos.default_pricelist, 1, this.price_extra);
    }
    set_lst_price(price) {
        this.order.assert_editable();
        this.product.lst_price = round_di(parseFloat(price) || 0, this.pos.dp["Product Price"]);
    }
    is_last_line() {
        var order = this.pos.get_order();
        var orderlines = order.orderlines;
        var last_id = orderlines[orderlines.length - 1].cid;
        var selectedLine = order ? order.selected_orderline : null;

        return !selectedLine ? false : last_id === selectedLine.cid;
    }
    set_customer_note(note) {
        this.customerNote = note || "";
    }
    get_customer_note() {
        return this.customerNote;
    }
    get_total_cost() {
        return this.product.standard_price * this.quantity;
    }
    /**
     * Checks if the current line is a tip from a customer.
     * @returns Boolean
     */
    isTipLine() {
        const tipProduct = this.pos.config.tip_product_id;
        return tipProduct && this.product.id === tipProduct[0];
    }

    /**
     * @returns {Orderline[]} all the lines that are in the same combo tree as the given line
     * (including the given line), or just the given line if it is not part of a combo.
     */
    getAllLinesInCombo() {
        if (this.comboParent) {
            // having a `comboParent` means that we are not
            // at the root node of the combo tree.
            // Thus, we first navigate to the root
            return this.comboParent.getAllLinesInCombo();
        }
        const lines = [];
        const stack = [this];
        while (stack.length) {
            const n = stack.pop();
            lines.push(n);
            if (n.comboLines) {
                stack.push(...n.comboLines);
            }
        }
        return lines;
    }
    isPartOfCombo() {
        return Boolean(this.comboParent || this.comboLines?.length);
    }
}

export class Packlotline extends PosModel {
    setup(_defaultObj, options) {
        super.setup(...arguments);
        this.lot_name = null;
        this.order_line = options.order_line;
        if (options.json) {
            this.init_from_JSON(options.json);
            return;
        }
    }

    init_from_JSON(json) {
        this.order_line = json.order_line;
        this.set_lot_name(json.lot_name);
    }

    set_lot_name(name) {
        this.lot_name = String(name || "").trim() || null;
    }

    get_lot_name() {
        return this.lot_name;
    }

    export_as_JSON() {
        return {
            lot_name: this.get_lot_name(),
        };
    }
}

// Every Paymentline contains a cashregister and an amount of money.
export class Payment extends PosModel {
    setup(obj, options) {
        super.setup(...arguments);
        this.pos = options.pos;
        this.order = options.order;
        this.amount = 0;
        this.selected = false;
        this.cashier_receipt = "";
        this.ticket = "";
        this.payment_status = "";
        this.card_type = "";
        this.cardholder_name = "";
        this.transaction_id = "";

        if (options.json) {
            this.init_from_JSON(options.json);
            return;
        }
        this.payment_method = options.payment_method;
        if (this.payment_method === undefined) {
            throw new Error(_t("Please configure a payment method in your POS."));
        }
        this.name = this.payment_method.name;
    }
    init_from_JSON(json) {
        this.amount = json.amount;
        this.payment_method = this.pos.payment_methods_by_id[json.payment_method_id];
        this.can_be_reversed = json.can_be_reversed;
        this.name = this.payment_method.name;
        this.payment_status = json.payment_status;
        this.ticket = json.ticket;
        this.card_type = json.card_type;
        this.cardholder_name = json.cardholder_name;
        this.transaction_id = json.transaction_id;
        this.is_change = json.is_change;
    }
    //sets the amount of money on this payment line
    set_amount(value) {
        this.order.assert_editable();
        this.amount = round_di(parseFloat(value) || 0, this.pos.currency.decimal_places);
    }
    // returns the amount of money on this paymentline
    get_amount() {
        return this.amount;
    }
    get_amount_str() {
        return formatFloat(this.amount, {
            digits: [69, this.pos.currency.decimal_places],
        });
    }
    set_selected(selected) {
        if (this.selected !== selected) {
            this.selected = selected;
        }
    }
    /**
     * returns {string} payment status.
     */
    get_payment_status() {
        return this.payment_status;
    }

    /**
     * Set the new payment status.
     *
     * @param {string} value - new status.
     */
    set_payment_status(value) {
        this.payment_status = value;
    }

    /**
     * Check if paymentline is done.
     * Paymentline is done if there is no payment status or the payment status is done.
     */
    is_done() {
        return this.get_payment_status()
            ? this.get_payment_status() === "done" || this.get_payment_status() === "reversed"
            : true;
    }

    /**
     * Set info to be printed on the cashier receipt. value should
     * be compatible with both the QWeb and ESC/POS receipts.
     *
     * @param {string} value - receipt info
     */
    set_cashier_receipt(value) {
        this.cashier_receipt = value;
    }

    /**
     * Set additional info to be printed on the receipts. value should
     * be compatible with both the QWeb and ESC/POS receipts.
     *
     * @param {string} value - receipt info
     */
    set_receipt_info(value) {
        this.ticket += value;
    }

    // returns the associated cashregister
    //exports as JSON for server communication
    getPaymentScreenValues() {
        return {
            record: this,
            name: serializeDateTime(DateTime.local()),
            amount: this.get_amount(),
        };
    }

    convertToJSON(values){
        return {
            name: values.name,
            payment_method_id: this.payment_method.id,
            amount: values.amount,
            payment_status: this.payment_status,
            can_be_reversed: this.can_be_reversed,
            ticket: this.ticket,
            card_type: this.card_type,
            cardholder_name: this.cardholder_name,
            transaction_id: this.transaction_id,
        };
    }

    // If payment status is a non-empty string, then it is an electronic payment.
    // TODO: There has to be a less confusing way to distinguish simple payments
    // from electronic transactions. Perhaps use a flag?
    is_electronic() {
        return Boolean(this.get_payment_status());
    }

    async pay() {
        this.set_payment_status("waiting");
        return this.handle_payment_response(
            await this.payment_method.payment_terminal.send_payment_request(this.cid)
        );
    }
    handle_payment_response(isPaymentSuccessful) {
        if (isPaymentSuccessful) {
            this.set_payment_status("done");
            this.can_be_reversed = this.payment_method.payment_terminal.supports_reversals;
        } else {
            this.set_payment_status("retry");
        }
        return isPaymentSuccessful;
    }
}

// An order more or less represents the content of a customer's shopping cart (the OrderLines)
// plus the associated payment information (the Paymentlines)
// there is always an active ('selected') order in the Pos, a new one is created
// automaticaly once an order is completed and sent to the server.
export class Order extends PosModel {
    setup(_defaultObj, options) {
        super.setup(...arguments);
        var self = this;
        options = options || {};

        this.locked = false;
        this.pos = options.pos;
        this.selected_orderline = undefined;
        this.selected_paymentline = undefined;
        this.screen_data = {}; // see Gui
        this.temporary = options.temporary || false;
        this.date_order = luxon.DateTime.now();
        this.to_invoice = false;
        this.orderlines = new PosCollection();
        this.paymentlines = new PosCollection();
        this.pos_session_id = this.pos.pos_session.id;
        this.cashier = this.pos.get_cashier();
        this.finalized = false; // if true, cannot be modified.
        this.shippingDate = null;
        this.firstDraft = true;
        this.combos = [];

        this.partner = null;

        this.uiState = {
            ReceiptScreen: {
                inputEmail: "",
                // if null: not yet tried to send
                // if false/true: tried sending email
                emailSuccessful: null,
                emailNotice: "",
            },
            // TODO: This should be in pos_restaurant.
            TipScreen: {
                inputTipAmount: "",
            },
        };

        if (options.json) {
            this.init_from_JSON(options.json);
            const linesById = Object.fromEntries(this.orderlines.map((l) => [l.id || l.cid, l]));
            for (const line of this.orderlines) {
                line.comboLines = line.combo_line_ids?.map((id) => linesById[id]);
                const combo_parent_id = line.combo_parent_id?.[0] || line.combo_parent_id;
                if (combo_parent_id) {
                    line.comboParent = linesById[combo_parent_id];
                }
            }
        } else {
            this.set_pricelist(this.pos.default_pricelist);
            this.sequence_number = this.pos.pos_session.sequence_number++;
            this.access_token = uuidv4(); // unique uuid used to identify the authenticity of the request from the QR code.
            this.ticketCode = this._generateTicketCode(); // 5-digits alphanum code shown on the receipt
            this.uid = this.generate_unique_id();
            this.name = _t("Order %s", this.uid);
            this.fiscal_position = this.pos.fiscal_positions.find(function (fp) {
                return fp.id === self.pos.config.default_fiscal_position_id[0];
            });
        }

        this.lastOrderPrepaChange = this.lastOrderPrepaChange || {};
    }

    getEmailItems() {
        return [_t("the receipt")].concat(this.is_to_invoice() ? [_t("the invoice")] : []);
    }

    save_to_db() {
        if (!this.temporary && !this.locked && !this.finalized) {
            this.assert_editable();
            this.pos.db.save_unpaid_order(this);
        }
    }
    /**
     * Initialize PoS order from a JSON string.
     *
     * If the order was created in another session, the sequence number should be changed so it doesn't conflict
     * with orders in the current session.
     * Else, the sequence number of the session should follow on the sequence number of the loaded order.
     *
     * @param {object} json JSON representing one PoS order.
     */
    init_from_JSON(json) {
        let partner;
        if (json.state && ["done", "invoiced", "paid"].includes(json.state)) {
            this.sequence_number = json.sequence_number;
        } else if (json.pos_session_id !== this.pos.pos_session.id) {
            this.sequence_number = this.pos.pos_session.sequence_number++;
        } else {
            this.sequence_number = json.sequence_number;
            this.pos.pos_session.sequence_number = Math.max(
                this.sequence_number + 1,
                this.pos.pos_session.sequence_number
            );
        }
        this.session_id = this.pos.pos_session.id;
        this.uid = json.uid;
        if (json.name) {
            this.name = json.name;
        } else {
            this.name = _t("Order %s", this.uid);
        }
        this.date_order = deserializeDateTime(json.date_order);
        this.server_id = json.server_id || json.id || false;
        this.user_id = json.user_id;
        this.firstDraft = false;

        if (json.fiscal_position_id) {
            var fiscal_position = this.pos.fiscal_positions.find(function (fp) {
                return fp.id === json.fiscal_position_id;
            });

            if (fiscal_position) {
                this.fiscal_position = fiscal_position;
            } else {
                this.fiscal_position_not_found = true;
                console.error("ERROR: trying to load a fiscal position not available in the pos");
            }
        }

        if (json.pricelist_id) {
            this.pricelist = this.pos.pricelists.find(function (pricelist) {
                return pricelist.id === json.pricelist_id;
            });
        } else {
            this.pricelist = this.pos.default_pricelist;
        }

        if (json.partner_id) {
            partner = this.pos.db.get_partner_by_id(json.partner_id);
            if (!partner) {
                console.error("ERROR: trying to load a partner not available in the pos");
            }
        } else {
            partner = null;
        }
        this.partner = partner;

        this.temporary = false; // FIXME
        this.to_invoice = json.to_invoice || false;
        this.shippingDate = json.shipping_date;

        var orderlines = json.lines;
        for (var i = 0; i < orderlines.length; i++) {
            var orderline = orderlines[i][2];
            if (orderline.product_id && this.pos.db.get_product_by_id(orderline.product_id)) {
                this.add_orderline(
                    new Orderline(
                        { env: this.env },
                        { pos: this.pos, order: this, json: orderline }
                    )
                );
            }
        }

        var paymentlines = json.statement_ids;
        for (i = 0; i < paymentlines.length; i++) {
            var paymentline = paymentlines[i][2];
            var newpaymentline = new Payment(
                { env: this.env },
                { pos: this.pos, order: this, json: paymentline }
            );
            this.paymentlines.add(newpaymentline);

            if (i === paymentlines.length - 1) {
                this.select_paymentline(newpaymentline);
            }
        }

        // Tag this order as 'locked' if it is already paid.
        this.locked = ["paid", "done", "invoiced"].includes(json.state);
        this.state = json.state;
        this.amount_return = json.amount_return;
        this.account_move = json.account_move;
        this.backendId = json.id;
        this.is_tipped = json.is_tipped || false;
        this.tip_amount = json.tip_amount || 0;
        this.access_token = json.access_token || "";
        this.ticketCode = json.ticket_code || "";
        this.lastOrderPrepaChange =
            json.last_order_preparation_change && JSON.parse(json.last_order_preparation_change);
        this.trackingNumber = json.tracking_number || "";
    }

    getOrderScreenValues(printing=false){
        const orderLines = this.orderlines.map(x => x.getOrderLineScreenValues(...arguments));

        const orderTaxValuesMap = {};
        let totalCost = 0.0;
        for(const line of orderLines){
            totalCost += line.totalCost;
            for(const taxValues of line.taxValuesList){
                const taxId = taxValues.taxId;

                orderTaxValuesMap[taxId] = orderTaxValuesMap[taxId] || {
                    taxAmount: 0.0,
                    base: 0.0,
                };

                orderTaxValuesMap[taxId].taxAmount += taxValues.taxAmount;
                orderTaxValuesMap[taxId].base += taxValues.base;
            }
        }

        let totalExcluded = 0.0;
        let totalTax = 0.0;
        const taxValuesList = [];
        for(const [taxId, taxValues] of Object.entries(orderTaxValuesMap)){
            const taxAmount = round_pr(taxValues.taxAmount, this.pos.currency.rounding);
            const base = round_pr(taxValues.base, this.pos.currency.rounding);
            totalExcluded += base;
            totalTax += taxAmount;
            taxValuesList.push({
                taxId: taxId,
                taxAmount: taxAmount,
                base: base,
            });
        }

        const values = {
            record: this,
            taxValuesList: taxValuesList,
            totalExcluded: totalExcluded,
            totalTax: totalTax,
            totalIncluded: totalExcluded + totalTax,
            totalCost: totalCost,
            orderLines: orderLines,

            name: this.get_name(),
            partner: this.get_partner(),
            company: this.pos.company,
            config: this.pos.config,
            userId: this.pos.user.id,
            dateOrder: serializeDateTime(this.date_order),

            roundingApplied: this.get_rounding_applied(),
            paymentLines: this.paymentlines.map(item => item.getPaymentScreenValues()),
            ticketCode: this.pos.company.point_of_sale_ticket_unique_code ? this.ticketCode : null,
            baseUrl: this.pos.base_url,
        };

        // Don't go further if it's not for the printing screen.
        if(!printing){
            return values;
        }

        // Qr-code.
        if(this.pos.company.point_of_sale_use_ticket_qr_code){
            values.qrCode = qrCodeSrc(`${this.pos.base_url}/pos/ticket/validate?access_token=${this.access_token}`);
        }

        // Receipt Header.
        Object.assign(values, {
            companyLogoSrc: `/web/image?model=res.company&amp;id=${this.pos.company.id}&amp;field=logo`,
            cashier: this.pos.get_cashier()?.name,
            header: this.pos.config.receipt_header,
            footer: this.pos.config.receipt_footer,
            shippingDate: this.shippingDate ? formatDate(DateTime.fromJSDate(new Date(this.shippingDate))) : null,
        });

        // Change.
        values.change = this.locked ? this.amount_return : this.get_change();

        // Total discount.
        values.totalDiscount = 0.0;
        const ignoredProductIds = this._get_ignored_product_ids_total_discount();
        for(const line of orderLines){
            if(ignoredProductIds.includes(line.product.id)){
                continue;
            }


        }

        return values;
    }

    export_as_JSON() {
        const values = this.getOrderScreenValues();

        var json = {
            name: values.name,
            amount_paid: this.get_total_paid() - this.get_change(),
            amount_total: values.totalIncluded,
            amount_tax: values.totalTax,
            amount_return: this.get_change(),
            lines: values.orderLines.map(item => [0, 0, item.record.convertToJSON(item)]),
            statement_ids: values.paymentLines.map(item => [0, 0, item.record.convertToJSON(item)]),
            pos_session_id: this.pos_session_id,
            pricelist_id: this.pricelist?.id || false,
            partner_id: values.partner?.id || false,
            user_id: values.userId,
            uid: this.uid,
            sequence_number: this.sequence_number,
            date_order: values.dateOrder,
            fiscal_position_id: this.fiscal_position?.id || false,
            server_id: this.server_id || false,
            to_invoice: this.to_invoice || false,
            shipping_date: this.shippingDate || false,
            is_tipped: this.is_tipped || false,
            tip_amount: this.tip_amount || 0,
            access_token: this.access_token || "",
            last_order_preparation_change: JSON.stringify(this.lastOrderPrepaChange),
            ticket_code: this.ticketCode || "",
        };
        if (!this.is_paid && this.user_id) {
            json.user_id = this.user_id;
        }
        return json;
    }

    // This function send order change to printer
    // For sending changes to preparation display see sendChanges function.
    async printChanges(cancelled) {
        const orderChange = this.changesToOrder(cancelled);
        let isPrintSuccessful = true;
        const d = new Date();
        let hours = "" + d.getHours();
        hours = hours.length < 2 ? "0" + hours : hours;
        let minutes = "" + d.getMinutes();
        minutes = minutes.length < 2 ? "0" + minutes : minutes;
        for (const printer of this.pos.unwatched.printers) {
            const changes = this._getPrintingCategoriesChanges(
                printer.config.product_categories_ids,
                orderChange
            );
            if (changes["new"].length > 0 || changes["cancelled"].length > 0) {
                const printingChanges = {
                    new: changes["new"],
                    cancelled: changes["cancelled"],
                    table_name: this.pos.config.module_pos_restaurant
                        ? this.getTable().name
                        : false,
                    floor_name: this.pos.config.module_pos_restaurant
                        ? this.getTable().floor.name
                        : false,
                    name: this.name || "unknown order",
                    time: {
                        hours,
                        minutes,
                    },
                };
                const receipt = renderToElement("point_of_sale.OrderChangeReceipt", {
                    changes: printingChanges,
                });
                const result = await printer.printReceipt(receipt);
                if (!result.successful) {
                    isPrintSuccessful = false;
                }
            }
        }

        return isPrintSuccessful;
    }
    _getPrintingCategoriesChanges(categories, currentOrderChange) {
        return {
            new: currentOrderChange["new"].filter((change) =>
                this.pos.db.is_product_in_category(categories, change["product_id"])
            ),
            cancelled: currentOrderChange["cancelled"].filter((change) =>
                this.pos.db.is_product_in_category(categories, change["product_id"])
            ),
        };
    }
    /**
     * This function is called after the order has been successfully sent to the preparation tool(s).
     * In the future, this status should be separated between the different preparation tools,
     * so that if one of them returns an error, it is possible to send the information back to it
     * without impacting the other tools.
     */
    updateLastOrderChange() {
        const orderlineIdx = [];
        this.orderlines.forEach((line) => {
            if (!line.skipChange) {
                const note = line.getNote();
                const lineKey = `${line.uuid} - ${note}`;
                orderlineIdx.push(lineKey);

                if (this.lastOrderPrepaChange[lineKey]) {
                    this.lastOrderPrepaChange[lineKey]["quantity"] = line.get_quantity();
                } else {
                    this.lastOrderPrepaChange[lineKey] = {
                        attribute_value_ids: line.attribute_value_ids,
                        line_uuid: line.uuid,
                        product_id: line.get_product().id,
                        name: line.get_full_product_name(),
                        note: note,
                        quantity: line.get_quantity(),
                    };
                }
                line.setHasChange(false);
            }
        });

        // Checks whether an orderline has been deleted from the order since it
        // was last sent to the preparation tools. If so we delete it to the changes.
        for (const lineKey in this.lastOrderPrepaChange) {
            if (!this.getOrderedLine(lineKey)) {
                delete this.lastOrderPrepaChange[lineKey];
            }
        }
    }

    /**
     * @returns {{ [productKey: string]: { product_id: number, name: string, note: string, quantity: number } }}
     * This function recalculates the information to be sent to the preparation tools,
     * it uses the variable lastOrderPrepaChange which contains the last changes sent
     * to perform this calculation.
     */
    getOrderChanges(skipped = false) {
        const prepaCategoryIds = this.pos.orderPreparationCategories;
        const oldChanges = this.lastOrderPrepaChange;
        const changes = {};
        let changesCount = 0;
        let changeAbsCount = 0;

        // Compares the orderlines of the order with the last ones sent.
        // When one of them has changed, we add the change.
        for (const orderlineIdx in this.orderlines) {
            const orderline = this.orderlines[orderlineIdx];
            const product = orderline.get_product();
            const note = orderline.getNote();
            const productKey = `${product.id} - ${orderline.get_full_product_name()} - ${note}`;
            const lineKey = `${orderline.uuid} - ${note}`;
            if (
                prepaCategoryIds.size === 0 ||
                this.pos.db.any_of_is_subcategory(product.pos_categ_ids, [...prepaCategoryIds])
            ) {
                const quantity = orderline.get_quantity();
                const quantityDiff = oldChanges[lineKey]
                    ? quantity - oldChanges[lineKey].quantity
                    : quantity;

                if (quantityDiff && orderline.skipChange === skipped) {
                    changes[productKey] = {
                        name: orderline.get_full_product_name(),
                        product_id: product.id,
                        attribute_value_ids: orderline.attribute_value_ids,
                        quantity: quantityDiff,
                        note: note,
                    };
                    changesCount += quantityDiff;
                    changeAbsCount += Math.abs(quantityDiff);

                    if (!orderline.skipChange) {
                        orderline.setHasChange(true);
                    }
                } else {
                    orderline.setHasChange(false);
                }
            } else {
                orderline.setHasChange(false);
            }
        }
        // Checks whether an orderline has been deleted from the order since it
        // was last sent to the preparation tools. If so we add this to the changes.
        for (const [lineKey, lineResume] of Object.entries(this.lastOrderPrepaChange)) {
            if (!this.getOrderedLine(lineKey)) {
                const productKey = `${lineResume["product_id"]} - ${lineResume["name"]} - ${lineResume["note"]}`;
                if (!changes[productKey]) {
                    changes[productKey] = {
                        product_id: lineResume["product_id"],
                        name: lineResume["name"],
                        note: lineResume["note"],
                        attribute_value_ids: lineResume["attribute_value_ids"],
                        quantity: -lineResume["quantity"],
                    };
                } else {
                    changes[productKey]["quantity"] -= lineResume["quantity"];
                }
            }
        }

        return {
            nbrOfChanges: changeAbsCount,
            orderlines: changes,
            count: changesCount,
        };
    }
    // This function transforms the data generated by getOrderChanges into the old
    // pattern used by the printer and the display preparation. This old pattern comes from
    // the time when this logic was in pos_restaurant.
    changesToOrder(cancelled = false) {
        const toAdd = [];
        const toRemove = [];
        const changes = !cancelled
            ? Object.values(this.getOrderChanges().orderlines)
            : Object.values(this.lastOrderPrepaChange);

        for (const lineChange of changes) {
            if (lineChange["quantity"] > 0 && !cancelled) {
                toAdd.push(lineChange);
            } else {
                lineChange["quantity"] = Math.abs(lineChange["quantity"]); // we need always positive values.
                toRemove.push(lineChange);
            }
        }

        return { new: toAdd, cancelled: toRemove };
    }
    getOrderedLine(lineKey) {
        return this.orderlines.find(
            (line) =>
                line.uuid === this.lastOrderPrepaChange[lineKey]["line_uuid"] &&
                line.note === this.lastOrderPrepaChange[lineKey]["note"]
        );
    }
    hasSkippedChanges() {
        return this.orderlines.find((orderline) => orderline.skipChange) ? true : false;
    }
    hasChangesToPrint() {
        return this.getOrderChanges().count ? true : false;
    }
    async pay() {
        if (!this.orderlines.length) {
            return;
        }
        if (
            this.orderlines.some(
                (line) => line.get_product().tracking !== "none" && !line.has_valid_product_lot()
            ) &&
            (this.pos.picking_type.use_create_lots || this.pos.picking_type.use_existing_lots)
        ) {
            const { confirmed } = await this.env.services.popup.add(ConfirmPopup, {
                title: _t("Some Serial/Lot Numbers are missing"),
                body: _t(
                    "You are trying to sell products with serial/lot numbers, but some of them are not set.\nWould you like to proceed anyway?"
                ),
                confirmText: _t("Yes"),
                cancelText: _t("No"),
            });
            if (confirmed) {
                this.pos.mobile_pane = "right";
                this.env.services.pos.showScreen("PaymentScreen");
            }
        } else {
            this.pos.mobile_pane = "right";
            this.env.services.pos.showScreen("PaymentScreen");
        }
    }
    is_empty() {
        return this.orderlines.length === 0;
    }
    generate_unique_id() {
        // Generates a public identification number for the order.
        // The generated number must be unique and sequential. They are made 12 digit long
        // to fit into EAN-13 barcodes, should it be needed

        function zero_pad(num, size) {
            var s = "" + num;
            while (s.length < size) {
                s = "0" + s;
            }
            return s;
        }
        return (
            zero_pad(this.pos.pos_session.id, 5) +
            "-" +
            zero_pad(this.pos.pos_session.login_number, 3) +
            "-" +
            zero_pad(this.sequence_number, 4)
        );
    }
    updateSavedQuantity() {
        this.orderlines.forEach((line) => line.updateSavedQuantity());
    }
    get_name() {
        return this.name;
    }
    assert_editable() {
        if (this.finalized) {
            throw new Error("Finalized Order cannot be modified");
        }
    }
    /* ---- Order Lines --- */
    add_orderline(line) {
        this.assert_editable();
        if (line.order) {
            line.order._unlinkOrderline(line);
        }
        line.order = this;
        this.orderlines.add(line);
        this.select_orderline(this.get_last_orderline());
    }
    get_orderline(id) {
        var orderlines = this.orderlines;
        for (var i = 0; i < orderlines.length; i++) {
            if (orderlines[i].id === id) {
                return orderlines[i];
            }
        }
        return null;
    }
    get_orderlines() {
        return this.orderlines;
    }
    /**
     * Groups the orderlines of the specific order according to the taxes applied to them. The orderlines that have
     * the exact same combination of taxes are grouped together.
     *
     * @returns {tax_ids: Orderlines[]} contains pairs of tax_ids (in csv format) and arrays of Orderlines
     * with the corresponding tax_ids.
     * e.g. {
     *  '1,2': [Orderline_A, Orderline_B],
     *  '3': [Orderline_C],
     * }
     */
    get_orderlines_grouped_by_tax_ids() {
        const orderlines_by_tax_group = {};
        const lines = this.get_orderlines();
        for (const line of lines) {
            const tax_group = this._get_tax_group_key(line);
            if (!(tax_group in orderlines_by_tax_group)) {
                orderlines_by_tax_group[tax_group] = [];
            }
            orderlines_by_tax_group[tax_group].push(line);
        }
        return orderlines_by_tax_group;
    }
    _get_tax_group_key(line) {
        return line
            ._getProductTaxesAfterFiscalPosition()
            .map((tax) => tax.id)
            .join(",");
    }
    get_last_orderline() {
        const orderlines = this.orderlines;
        return this.orderlines.at(orderlines.length - 1);
    }
    get_tip() {
        var tip_product = this.pos.db.get_product_by_id(this.pos.config.tip_product_id[0]);
        var lines = this.get_orderlines();
        if (!tip_product) {
            return 0;
        } else {
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].get_product() === tip_product) {
                    return lines[i].get_unit_price();
                }
            }
            return 0;
        }
    }

    set_tip(tip) {
        var tip_product = this.pos.db.get_product_by_id(this.pos.config.tip_product_id[0]);
        var lines = this.get_orderlines();
        if (tip_product) {
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].get_product() === tip_product) {
                    lines[i].set_unit_price(tip);
                    lines[i].set_lst_price(tip);
                    lines[i].price_type = "automatic";
                    lines[i].order.tip_amount = tip;
                    return;
                }
            }
            return this.add_product(tip_product, {
                is_tip: true,
                quantity: 1,
                price: tip,
                lst_price: tip,
                extras: { price_type: "automatic" },
            });
        }
    }
    set_fiscal_position(fiscal_position) {
        this.fiscal_position = fiscal_position;
    }
    set_pricelist(pricelist) {
        var self = this;
        this.pricelist = pricelist;

        var lines_to_recompute = this.get_orderlines().filter(
            (line) => line.price_type === "original"
        );
        lines_to_recompute.forEach((line) => {
            line.set_unit_price(
                line.product.get_price(self.pricelist, line.get_quantity(), line.get_price_extra())
            );
            self.fix_tax_included_price(line);
        });
    }

    /**
     * Performs the basic unlinking of the `line` from the order.
     * @param {Orderline} line
     */
    _unlinkOrderline(line) {
        this.assert_editable();
        this.orderlines.remove(line);
        line.order = null;
    }

    /**
     * A wrapper around _unlinkOrderline that may potentially remove multiple orderlines.
     * In core pos, it removes the linked combo lines. In other modules, it may remove
     * other related lines, e.g. multiple reward lines in pos_loyalty module.
     * @param {Orderline} line
     * @returns {boolean} true if the line was removed, false otherwise
     */
    removeOrderline(line) {
        const linesToRemove = line.getAllLinesInCombo();
        for (const lineToRemove of linesToRemove) {
            this._unlinkOrderline(lineToRemove);
            if (lineToRemove.refunded_orderline_id in this.pos.toRefundLines) {
                delete this.pos.toRefundLines[lineToRemove.refunded_orderline_id];
            }
        }
        this.select_orderline(this.get_last_orderline());
        return true;
    }

    isFirstDraft() {
        return this.firstDraft;
    }

    fix_tax_included_price(line) {
        line.set_unit_price(line.compute_fixed_price(line.price));
    }

    _isRefundOrder() {
        if (this.orderlines.length > 0 && this.orderlines[0].refunded_orderline_id) {
            return true;
        }
        return false;
    }

    async add_product(product, options) {
        if (
            this.pos.doNotAllowRefundAndSales() &&
            this._isRefundOrder() &&
            (!options.quantity || options.quantity > 0)
        ) {
            this.pos.env.services.popup.add(ErrorPopup, {
                title: _t("Refund and Sales not allowed"),
                body: _t("It is not allowed to mix refunds and sales"),
            });
            return;
        }
        if (this._printed) {
            // when adding product with a barcode while being in receipt screen
            this.pos.removeOrder(this);
            return this.pos.add_new_order().add_product(product, options);
        }
        this.assert_editable();
        options = options || {};
        const quantity = options.quantity ? options.quantity : 1;
        const line = new Orderline(
            { env: this.env },
            { pos: this.pos, order: this, product: product, quantity: quantity }
        );
        this.fix_tax_included_price(line);

        this.set_orderline_options(line, options);
        line.set_full_product_name();
        var to_merge_orderline;
        for (var i = 0; i < this.orderlines.length; i++) {
            if (this.orderlines.at(i).can_be_merged_with(line) && options.merge !== false) {
                to_merge_orderline = this.orderlines.at(i);
            }
        }
        if (to_merge_orderline) {
            to_merge_orderline.merge(line);
            this.select_orderline(to_merge_orderline);
        } else {
            this.add_orderline(line);
            this.select_orderline(this.get_last_orderline());
        }

        if (options.draftPackLotLines) {
            this.selected_orderline.setPackLotLines(options.draftPackLotLines);
        }

        if (options.comboLines?.length) {
            await this.addComboLines(line, options);
            // Make sure the combo parent is selected.
            this.select_orderline(line);
        }
    }
    async addComboLines(comboParent, options) {
        const originalPrices = {};

        let originalTotal = 0;
        for (const comboLine of options.comboLines) {
            const product = this.pos.db.product_by_id[comboLine.product_id[0]];
            const originalPrice = this.pos.db.combo_by_id[comboLine.combo_id[0]].base_price;
            originalTotal += product.get_display_price({ price: originalPrice });

            // Keep track of the original price of each product for the subsequent for loop.
            originalPrices[product.id] = originalPrice;
        }

        const targetPrice = comboParent.product.lst_price;
        const childPriceFactor = targetPrice / originalTotal;
        for (const comboLine of options.comboLines) {
            const product = this.pos.db.product_by_id[comboLine.product_id[0]];
            const childUnitPrice = originalPrices[product.id] * childPriceFactor;
            await this.pos.addProductToCurrentOrder(product, {
                price: childUnitPrice,
                comboParent,
            });
        }

        // Adjust the price of the last combo line to make sure the total price of the combo
        // is the same as the target price.
        const childLines = this.get_orderlines().filter(
            (l) => l.comboParent?.uuid === comboParent.uuid
        );
        const totalComboPrice = childLines.reduce((acc, l) => acc + l.get_display_price(), 0);
        const diff = targetPrice - totalComboPrice;
        if (!this.env.utils.floatIsZero(diff)) {
            const lastLine = childLines[childLines.length - 1];
            lastLine.set_unit_price(lastLine.get_unit_price() + diff);
        }

        // Finally, take into account the combo price for each combo line.
        for (const comboLine of options.comboLines) {
            if (this.env.utils.floatIsZero(comboLine.combo_price)) {
                continue;
            }
            const presentLine = childLines.find((l) => l.product.id === comboLine.product_id[0]);
            if (presentLine) {
                presentLine.set_unit_price(presentLine.get_unit_price() + comboLine.combo_price);
            }
        }
    }
    set_orderline_options(orderline, options) {
        if (options.comboLines?.length) {
            options.price = 0;
            orderline.comboLines = [];
        }
        if (options.comboParent) {
            orderline.comboParent = options.comboParent;
            orderline.comboParent.comboLines.push(orderline);
        }
        if (options.quantity !== undefined) {
            orderline.set_quantity(options.quantity);
        }

        if (options.price_extra !== undefined) {
            orderline.price_extra = options.price_extra;
            orderline.set_unit_price(
                orderline.product.get_price(
                    this.pricelist,
                    orderline.get_quantity(),
                    options.price_extra
                )
            );
            this.fix_tax_included_price(orderline);
        }

        if (options.price !== undefined) {
            orderline.set_unit_price(options.price);
            this.fix_tax_included_price(orderline);
        }

        if (options.lst_price !== undefined) {
            orderline.set_lst_price(options.lst_price);
        }

        if (options.discount !== undefined) {
            orderline.set_discount(options.discount);
        }

        if (options.attribute_value_ids) {
            orderline.attribute_value_ids = options.attribute_value_ids || [];
        }

        if (
            options.attribute_custom_values &&
            Object.keys(options.attribute_custom_values).length > 0
        ) {
            const customAttributeValues = [];
            for (const [id, value] of Object.entries(options.attribute_custom_values)) {
                if (!value) {
                    continue;
                }

                customAttributeValues.push(
                    new ProductCustomAttribute({
                        custom_product_template_attribute_value_id: parseInt(id),
                        custom_value: value,
                    })
                );
            }

            orderline.custom_attribute_value_ids = customAttributeValues;
        }

        if (options.extras !== undefined) {
            for (var prop in options.extras) {
                orderline[prop] = options.extras[prop];
            }
        }
        if (options.is_tip) {
            this.is_tipped = true;
            this.tip_amount = options.price;
        }
        if (options.refunded_orderline_id) {
            orderline.refunded_orderline_id = options.refunded_orderline_id;
        }
        if (options.tax_ids) {
            orderline.tax_ids = options.tax_ids;
        }
    }
    get_selected_orderline() {
        return this.selected_orderline;
    }
    select_orderline(line) {
        if (line) {
            if (line !== this.selected_orderline) {
                // if line (new line to select) is not the same as the old
                // selected_orderline, then we set the old line to false,
                // and set the new line to true. Also, set the new line as
                // the selected_orderline.
                if (this.selected_orderline) {
                    this.selected_orderline.set_selected(false);
                }
                this.selected_orderline = line;
                this.selected_orderline.set_selected(true);
            }
        } else {
            this.selected_orderline = undefined;
        }
        this.pos.numpadMode = "quantity";
    }
    deselect_orderline() {
        if (this.selected_orderline) {
            this.selected_orderline.set_selected(false);
            this.selected_orderline = undefined;
        }
    }

    /* ---- Payment Lines --- */
    add_paymentline(payment_method) {
        this.assert_editable();
        if (this.electronic_payment_in_progress()) {
            return false;
        } else {
            var newPaymentline = new Payment(
                { env: this.env },
                { order: this, payment_method: payment_method, pos: this.pos }
            );
            this.paymentlines.add(newPaymentline);
            this.select_paymentline(newPaymentline);
            if (this.pos.config.cash_rounding) {
                this.selected_paymentline.set_amount(0);
            }
            newPaymentline.set_amount(this.get_due());

            if (payment_method.payment_terminal) {
                newPaymentline.set_payment_status("pending");
            }
            return newPaymentline;
        }
    }
    get_paymentlines() {
        return this.paymentlines;
    }
    /**
     * Retrieve the paymentline with the specified cid
     *
     * @param {String} cid
     */
    get_paymentline(cid) {
        var lines = this.get_paymentlines();
        return lines.find(function (line) {
            return line.cid === cid;
        });
    }
    remove_paymentline(line) {
        this.assert_editable();
        if (this.selected_paymentline === line) {
            this.select_paymentline(undefined);
        }
        this.paymentlines.remove(line);
    }
    clean_empty_paymentlines() {
        var lines = this.paymentlines;
        var empty = [];
        for (var i = 0; i < lines.length; i++) {
            if (!lines[i].get_amount()) {
                empty.push(lines[i]);
            }
        }
        for (i = 0; i < empty.length; i++) {
            this.remove_paymentline(empty[i]);
        }
    }
    select_paymentline(line) {
        if (line !== this.selected_paymentline) {
            if (this.selected_paymentline) {
                this.selected_paymentline.set_selected(false);
            }
            this.selected_paymentline = line;
            if (this.selected_paymentline) {
                this.selected_paymentline.set_selected(true);
            }
        }
    }
    electronic_payment_in_progress() {
        return this.get_paymentlines().some(function (pl) {
            if (pl.payment_status) {
                return !["done", "reversed"].includes(pl.payment_status);
            } else {
                return false;
            }
        });
    }
    /**
     * Stops a payment on the terminal if one is running
     */
    stop_electronic_payment() {
        var lines = this.get_paymentlines();
        var line = lines.find(function (line) {
            var status = line.get_payment_status();
            return (
                status && !["done", "reversed", "reversing", "pending", "retry"].includes(status)
            );
        });
        if (line) {
            line.set_payment_status("waitingCancel");
            line.payment_method.payment_terminal
                .send_payment_cancel(this, line.cid)
                .finally(function () {
                    line.set_payment_status("retry");
                });
        }
    }
    /* ---- Payment Status --- */
    get_subtotal() {
        return round_pr(
            this.orderlines.reduce(function (sum, orderLine) {
                return sum + orderLine.get_display_price();
            }, 0),
            this.pos.currency.rounding
        );
    }
    get_total_with_tax() {
        return this.get_total_without_tax() + this.get_total_tax();
    }
    get_total_without_tax() {
        return round_pr(
            this.orderlines.reduce(function (sum, orderLine) {
                return sum + orderLine.get_price_without_tax();
            }, 0),
            this.pos.currency.rounding
        );
    }
    _get_ignored_product_ids_total_discount() {
        return [];
    }
    get_total_discount() {
        const ignored_product_ids = this._get_ignored_product_ids_total_discount();
        return round_pr(
            this.orderlines.reduce((sum, orderLine) => {
                if (!ignored_product_ids.includes(orderLine.product.id)) {
                    sum +=
                        orderLine.getUnitDisplayPriceBeforeDiscount() *
                        (orderLine.get_discount() / 100) *
                        orderLine.get_quantity();
                    if (orderLine.display_discount_policy() === "without_discount") {
                        sum +=
                            (orderLine.get_taxed_lst_unit_price() -
                                orderLine.getUnitDisplayPriceBeforeDiscount()) *
                            orderLine.get_quantity();
                    }
                }
                return sum;
            }, 0),
            this.pos.currency.rounding
        );
    }
    get_total_tax() {
        if (this.pos.company.tax_calculation_rounding_method === "round_globally") {
            // As always, we need:
            // 1. For each tax, sum their amount across all order lines
            // 2. Round that result
            // 3. Sum all those rounded amounts
            var groupTaxes = {};
            this.orderlines.forEach(function (line) {
                var taxDetails = line.get_tax_details();
                var taxIds = Object.keys(taxDetails);
                for (var t = 0; t < taxIds.length; t++) {
                    var taxId = taxIds[t];
                    if (!(taxId in groupTaxes)) {
                        groupTaxes[taxId] = 0;
                    }
                    groupTaxes[taxId] += taxDetails[taxId].amount;
                }
            });

            var sum = 0;
            var taxIds = Object.keys(groupTaxes);
            for (var j = 0; j < taxIds.length; j++) {
                var taxAmount = groupTaxes[taxIds[j]];
                sum += round_pr(taxAmount, this.pos.currency.rounding);
            }
            return sum;
        } else {
            return round_pr(
                this.orderlines.reduce(function (sum, orderLine) {
                    return sum + orderLine.get_tax();
                }, 0),
                this.pos.currency.rounding
            );
        }
    }
    get_total_paid() {
        return round_pr(
            this.paymentlines.reduce(function (sum, paymentLine) {
                if (paymentLine.is_done()) {
                    sum += paymentLine.get_amount();
                }
                return sum;
            }, 0),
            this.pos.currency.rounding
        );
    }
    get_tax_details() {
        var details = {};
        var fulldetails = [];

        this.orderlines.forEach(function (line) {
            var ldetails = line.get_tax_details();
            for (var id in ldetails) {
                if (Object.hasOwnProperty.call(ldetails, id)) {
                    details[id] = {
                        amount: (details[id]?.amount || 0) + ldetails[id].amount,
                        base: (details[id]?.base || 0) + ldetails[id].base,
                    };
                }
            }
        });

        for (var id in details) {
            if (Object.hasOwnProperty.call(details, id)) {
                fulldetails.push({
                    amount: details[id].amount,
                    base: details[id].base,
                    tax: this.pos.taxes_by_id[id],
                    name: this.pos.taxes_by_id[id].name,
                });
            }
        }

        return fulldetails;
    }
    get_change(paymentline) {
        if (!paymentline) {
            var change =
                this.get_total_paid() - this.get_total_with_tax() - this.get_rounding_applied();
        } else {
            change = -this.get_total_with_tax();
            var lines = this.paymentlines;
            for (var i = 0; i < lines.length; i++) {
                change += lines[i].get_amount();
                if (lines[i] === paymentline) {
                    break;
                }
            }
        }
        return round_pr(Math.max(0, change), this.pos.currency.rounding);
    }
    get_due(paymentline) {
        if (!paymentline) {
            var due =
                this.get_total_with_tax() - this.get_total_paid() + this.get_rounding_applied();
        } else {
            due = this.get_total_with_tax();
            var lines = this.paymentlines;
            for (var i = 0; i < lines.length; i++) {
                if (lines[i] === paymentline) {
                    break;
                } else {
                    due -= lines[i].get_amount();
                }
            }
        }
        return round_pr(due, this.pos.currency.rounding);
    }
    get_rounding_applied() {
        if (this.pos.config.cash_rounding) {
            const only_cash = this.pos.config.only_round_cash_method;
            const paymentlines = this.get_paymentlines();
            const last_line = paymentlines ? paymentlines[paymentlines.length - 1] : false;
            const last_line_is_cash = last_line
                ? last_line.payment_method.is_cash_count == true
                : false;
            if (!only_cash || (only_cash && last_line_is_cash)) {
                var rounding_method = this.pos.cash_rounding[0].rounding_method;
                var remaining = this.get_total_with_tax() - this.get_total_paid();
                var sign = this.get_total_with_tax() > 0 ? 1.0 : -1.0;
                if (
                    ((this.get_total_with_tax() < 0 && remaining > 0) ||
                        (this.get_total_with_tax() > 0 && remaining < 0)) &&
                    rounding_method !== "HALF-UP"
                ) {
                    rounding_method = rounding_method === "UP" ? "DOWN" : "UP";
                }

                remaining *= sign;
                var total = round_pr(remaining, this.pos.cash_rounding[0].rounding);
                var rounding_applied = total - remaining;

                // because floor and ceil doesn't include decimals in calculation, we reuse the value of the half-up and adapt it.
                if (floatIsZero(rounding_applied, this.pos.currency.decimal_places)) {
                    // https://xkcd.com/217/
                    return 0;
                } else if (
                    Math.abs(this.get_total_with_tax()) < this.pos.cash_rounding[0].rounding
                ) {
                    return 0;
                } else if (rounding_method === "UP" && rounding_applied < 0 && remaining > 0) {
                    rounding_applied += this.pos.cash_rounding[0].rounding;
                } else if (rounding_method === "UP" && rounding_applied > 0 && remaining < 0) {
                    rounding_applied -= this.pos.cash_rounding[0].rounding;
                } else if (rounding_method === "DOWN" && rounding_applied > 0 && remaining > 0) {
                    rounding_applied -= this.pos.cash_rounding[0].rounding;
                } else if (rounding_method === "DOWN" && rounding_applied < 0 && remaining < 0) {
                    rounding_applied += this.pos.cash_rounding[0].rounding;
                } else if (
                    rounding_method === "HALF-UP" &&
                    rounding_applied === this.pos.cash_rounding[0].rounding / -2
                ) {
                    rounding_applied += this.pos.cash_rounding[0].rounding;
                }
                return sign * rounding_applied;
            } else {
                return 0;
            }
        }
        return 0;
    }
    has_not_valid_rounding() {
        if (
            !this.pos.config.cash_rounding ||
            this.get_total_with_tax() < this.pos.cash_rounding[0].rounding
        ) {
            return false;
        }

        const only_cash = this.pos.config.only_round_cash_method;
        var lines = this.paymentlines;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (only_cash && !line.payment_method.is_cash_count) {
                continue;
            }

            if (
                !floatIsZero(
                    line.amount - round_pr(line.amount, this.pos.cash_rounding[0].rounding),
                    6
                )
            ) {
                return line;
            }
        }
        return false;
    }
    is_paid() {
        return this.get_due() <= 0 && this.check_paymentlines_rounding();
    }
    is_paid_with_cash() {
        return !!this.paymentlines.find(function (pl) {
            return pl.payment_method.is_cash_count;
        });
    }
    check_paymentlines_rounding() {
        if (this.pos.config.cash_rounding) {
            var cash_rounding = this.pos.cash_rounding[0].rounding;
            var default_rounding = this.pos.currency.rounding;
            for (var id in this.get_paymentlines()) {
                var line = this.get_paymentlines()[id];
                var diff = round_pr(
                    round_pr(line.amount, cash_rounding) - round_pr(line.amount, default_rounding),
                    default_rounding
                );
                if (this.get_total_with_tax() < this.pos.cash_rounding[0].rounding) {
                    return true;
                }
                if (diff && line.payment_method.is_cash_count) {
                    return false;
                } else if (!this.pos.config.only_round_cash_method && diff) {
                    return false;
                }
            }
            return true;
        }
        return true;
    }
    get_total_cost() {
        return this.orderlines.reduce(function (sum, orderLine) {
            return sum + orderLine.get_total_cost();
        }, 0);
    }
    /* ---- Invoice --- */
    set_to_invoice(to_invoice) {
        this.assert_editable();
        this.to_invoice = to_invoice;
    }
    is_to_invoice() {
        return this.to_invoice;
    }
    /* ---- Partner --- */
    // the partner related to the current order.
    set_partner(partner) {
        this.assert_editable();
        this.partner = partner;
        this.updatePricelistAndFiscalPosition(partner);
    }
    get_partner() {
        return this.partner;
    }
    get_partner_name() {
        const partner = this.partner;
        return partner ? partner.name : "";
    }
    get_cardholder_name() {
        var card_payment_line = this.paymentlines.find((pl) => pl.cardholder_name);
        return card_payment_line ? card_payment_line.cardholder_name : "";
    }
    /* ---- Screen Status --- */
    // the order also stores the screen status, as the PoS supports
    // different active screens per order. This method is used to
    // store the screen status.
    set_screen_data(value) {
        this.screen_data["value"] = value;
    }
    get_current_screen_data() {
        return this.screen_data["value"] ?? { name: "ProductScreen" };
    }
    //see set_screen_data
    get_screen_data() {
        const screen = this.screen_data["value"];
        // If no screen data is saved
        //   no payment line -> product screen
        //   with payment line -> payment screen
        if (!screen) {
            if (this.get_paymentlines().length > 0) {
                return { name: "PaymentScreen" };
            }
            return { name: "ProductScreen" };
        }
        if (!this.finalized && this.get_paymentlines().length > 0) {
            return { name: "PaymentScreen" };
        }
        return screen;
    }
    wait_for_push_order() {
        return false;
    }
    updatePricelistAndFiscalPosition(newPartner) {
        let newPartnerPricelist, newPartnerFiscalPosition;
        const defaultFiscalPosition = this.pos.fiscal_positions.find(
            (position) => position.id === this.pos.config.default_fiscal_position_id[0]
        );
        if (newPartner) {
            newPartnerFiscalPosition = newPartner.property_account_position_id
                ? this.pos.fiscal_positions.find(
                      (position) => position.id === newPartner.property_account_position_id[0]
                  )
                : defaultFiscalPosition;
            newPartnerPricelist =
                this.pos.pricelists.find(
                    (pricelist) => pricelist.id === newPartner.property_product_pricelist[0]
                ) || this.pos.default_pricelist;
        } else {
            newPartnerFiscalPosition = defaultFiscalPosition;
            newPartnerPricelist = this.pos.default_pricelist;
        }
        this.set_fiscal_position(newPartnerFiscalPosition);
        this.set_pricelist(newPartnerPricelist);
    }
    /* ---- Ship later --- */
    setShippingDate(shippingDate) {
        this.shippingDate = shippingDate;
    }
    getShippingDate() {
        return this.shippingDate;
    }
    getHasRefundLines() {
        for (const line of this.get_orderlines()) {
            if (line.refunded_orderline_id) {
                return true;
            }
        }
        return false;
    }
    /**
     * Returns false if the current order is empty and has no payments.
     * @returns {boolean}
     */
    _isValidEmptyOrder() {
        if (this.get_orderlines().length == 0) {
            return this.get_paymentlines().length != 0;
        } else {
            return true;
        }
    }
    _generateTicketCode() {
        return random5Chars();
    }
}
