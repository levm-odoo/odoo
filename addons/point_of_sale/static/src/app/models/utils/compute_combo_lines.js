import { roundDecimals } from "@web/core/utils/numbers";

export const computeComboLines = (
    parentProduct,
    childLineConf,
    pricelist,
    decimalPrecision,
    productTemplateAttributeValueById,
    priceUnit = false
) => {
    const combolines = [];
    childLineConf = computeComboLinesPrice(
        parentProduct,
        childLineConf,
        pricelist,
        decimalPrecision,
        productTemplateAttributeValueById,
        priceUnit
    );

    for (const conf of childLineConf) {
        const attribute_value_ids = conf.configuration?.attribute_value_ids.map(
            (id) => productTemplateAttributeValueById[id]
        );
        combolines.push({
            combo_line_id: conf.combo_line_id,
            price_unit: conf.price_unit,
            attribute_value_ids,
            attribute_custom_values: conf.configuration?.attribute_custom_values || {},
        });
    }

    return combolines;
};

export const computeComboLinesPrice = (
    parentProduct,
    childLineConf,
    pricelist,
    decimalPrecision,
    productTemplateAttributeValueById,
    priceUnit = false
) => {
    const parentLstPrice = priceUnit === false ? parentProduct.get_price(pricelist, 1) : priceUnit;
    const originalTotal = childLineConf.reduce((acc, conf) => {
        const originalPrice = conf.combo_line_id.combo_id.base_price;
        return acc + originalPrice;
    }, 0);

    let remainingTotal = parentLstPrice;
    for (const conf of childLineConf) {
        const comboLine = conf.combo_line_id;
        const combo = comboLine.combo_id;
        let priceUnit = roundDecimals(
            (combo.base_price * parentLstPrice) / originalTotal,
            decimalPrecision.find((dp) => dp.name === "Product Price").digits
        );
        remainingTotal -= priceUnit;
        if (comboLine.id == childLineConf[childLineConf.length - 1].combo_line_id.id) {
            priceUnit += remainingTotal;
        }
        const attribute_value_ids = conf.configuration?.attribute_value_ids.map(
            (id) => productTemplateAttributeValueById[id]
        );
        const attributesPriceExtra = (attribute_value_ids ?? [])
            .map((attr) => attr?.price_extra || 0)
            .reduce((acc, price) => acc + price, 0);
        const totalPriceExtra = priceUnit + attributesPriceExtra + comboLine.combo_price;
        conf.price_unit = totalPriceExtra;
    }
    return childLineConf;
};
