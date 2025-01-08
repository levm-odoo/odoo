import { rpc } from "@web/core/network/rpc";
import { Record } from "@web/model/relational_model/record";
import { RelationalModel } from "@web/model/relational_model/relational_model";

class ProductCatalogRecord extends Record {
    setup(config, data, options = {}) {
        this.productCatalogData = data.productCatalogData;
        data = { ...data };
        delete data.productCatalogData;
        super.setup(config, data, options);
    }
}

export class ProductCatalogKanbanModel extends RelationalModel {
    static Record = ProductCatalogRecord;

    async _loadData(params) {
        // if orm have isSample field and its value set to be true then we have sample data as there is no product found for selected vendor, show sample data
        const isSample = this.orm.isSample !== undefined ? this.orm.isSample : false;
        const result = await super._loadData(...arguments);
        if (!params.isMonoRecord && !params.groupBy.length) {
            let orderLinesInfo;
            if(!isSample) {
                orderLinesInfo = await rpc("/product/catalog/order_lines_info", this._getOrderLinesInfoParams(params, result.records.map((rec) => rec.id)));
            }
            else {
                orderLinesInfo = this._getSampleOrderLineInfo()
            }

            for (const record of result.records) {
                record.productCatalogData = orderLinesInfo[record.id];
            }
            if (Object.values(orderLinesInfo).some(obj => 'last_invoice_date' in obj)){
                let prioritized_products = Object.values(result.records).filter(obj => obj.productCatalogData.last_invoice_date != false)
                let remaining_products = Object.values(result.records).filter(obj => obj.productCatalogData.last_invoice_date == false)
                result.records = Object.values(prioritized_products).sort((obj1, obj2) => {
                    return new Date(obj2.productCatalogData.last_invoice_date || 0) - new Date(obj1.productCatalogData.last_invoice_date || 0);
                });
                result.records.push(...remaining_products)
            }
        }
        return result;
    }

    _getOrderLinesInfoParams(params, productIds) {
        return {
            order_id: params.context.order_id,
            product_ids: productIds,
            res_model: params.context.product_catalog_order_model,
            child_field: params.context?.child_field,
        }
    }

    _getSampleOrderLineInfo() {
         // this function only returns data for sample view similar to rpc call ("/product/catalog/order_lines_info) made in _loadData
        const sampleOrderLineInfo = {};
        const numRecords = 10; // Number of records to generate
        for (let i = 1; i <= numRecords; i++) {
            sampleOrderLineInfo[i] = {
                quantity: Math.floor(Math.random() * 10),
                min_qty: 0,
                price: Math.floor(Math.random() * 500) + 100,
                readOnly: false,
                uom: { display_name: "Units", id: 1 }
            };
        }
        return sampleOrderLineInfo;
    }
}
