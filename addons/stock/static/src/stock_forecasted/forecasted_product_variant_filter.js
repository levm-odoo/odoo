import { _t } from "@web/core/l10n/translation";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { useService } from "@web/core/utils/hooks";
import { Component, onWillStart } from "@odoo/owl";

export class ForecastedProductVariantFilter extends Component {
    static template = "stock.ForecastedProductVariantFilter";
    static components = { Dropdown, DropdownItem };
    static props = { action: Object, setWarehouseInContext: Function, warehouses: Array };

    setup() {
        this.orm = useService("orm");
        this.context = this.props.action.context;
        this.warehouses = this.props.warehouses;
        onWillStart(this.onWillStart)
    }

    async onWillStart() {
        this.displayWarehouseFilter = (this.warehouses.length > 1);
    }

    _onSelected(id){
        this.props.setWarehouseInContext(Number(id));
    }

    get activeWarehouse() {
        let warehouseIds = null;
        if (Array.isArray(this.context.warehouse_id)) {
            warehouseIds = this.context.warehouse_id;
        } else {
            warehouseIds = [this.context.warehouse_id];
        }
        return this.warehouses[0];
    }

    get warehousesItems() {
        this.warehouses = [
            { id: 0, name: _t("All Variants")},
            ...this.warehouses,
        ]
        debugger;
        return this.warehouses.map(warehouse => ({
            id: warehouse.id,
            label: warehouse.name,
            onSelected: () => this._onSelected(warehouse.id),
        }));
    }
}
