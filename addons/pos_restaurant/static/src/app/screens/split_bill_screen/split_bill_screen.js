import { registry } from "@web/core/registry";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { useService } from "@web/core/utils/hooks";
import { Component, useState } from "@odoo/owl";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";
import { OrderWidget } from "@point_of_sale/app/components/order_widget/order_widget";

export class SplitBillScreen extends Component {
    static template = "pos_restaurant.SplitBillScreen";
    static components = { Orderline, OrderWidget };
    static props = {
        disallow: { type: Boolean, optional: true },
    };

    setup() {
        this.pos = usePos();
        this.ui = useState(useService("ui"));
        this.qtyTracker = useState({});
        this.priceTracker = useState({});
    }

    get currentOrder() {
        return this.pos.getOrder();
    }

    get orderlines() {
        return this.currentOrder.getOrderlines();
    }

    get newOrderPrice() {
        return Object.values(this.priceTracker).reduce((a, b) => a + b, 0);
    }

    getNumberOfProducts() {
        return Object.values(this.qtyTracker).reduce((a, b) => a + b, 0);
    }

    onClickLine(line) {
        const lines = line.getAllLinesInCombo();

        for (const line of lines) {
            if (!line.isPosGroupable()) {
                if (this.qtyTracker[line.uuid] === line.getQuantity()) {
                    this.qtyTracker[line.uuid] = 0;
                } else {
                    this.qtyTracker[line.uuid] = line.getQuantity();
                }
            } else if (!this.qtyTracker[line.uuid]) {
                this.qtyTracker[line.uuid] = 1;
            } else if (this.qtyTracker[line.uuid] === line.getQuantity()) {
                this.qtyTracker[line.uuid] = 0;
            } else {
                this.qtyTracker[line.uuid] += 1;
            }

            this.priceTracker[line.uuid] =
                (line.getPriceWithTax() / line.qty) * this.qtyTracker[line.uuid];
        }
    }

    _getOrderName(order) {
        return order.table_id?.table_number.toString() || order.floatingOrderName || "";
    }

    _getLatestOrderNameStartingWith(name) {
        return (
            this.pos
                .getOpenOrders()
                .map((order) => this._getOrderName(order))
                .filter((orderName) => orderName.slice(0, -1) === name)
                .sort((a, b) => a.slice(-1).localeCompare(b.slice(-1)))
                .at(-1) || name
        );
    }

    _getSplitOrderName(originalOrderName) {
        const latestOrderName = this._getLatestOrderNameStartingWith(originalOrderName);
        if (latestOrderName === originalOrderName) {
            return `${originalOrderName}B`;
        }
        const lastChar = latestOrderName[latestOrderName.length - 1];
        if (lastChar === "Z") {
            throw new Error("You cannot split the order into more than 26 parts!");
        }
        const nextChar = String.fromCharCode(lastChar.charCodeAt(0) + 1);
        return `${latestOrderName.slice(0, -1)}${nextChar}`;
    }

    // Calculates the sent quantities for both orders and adjusts for last_order_preparation_change.
    _getSentQty(ogLine, newLine, orderedQty) {
        const unorderedQty = ogLine.qty - orderedQty;

        const delta = newLine.qty - unorderedQty;
        const newQty = delta > 0 ? delta : 0;

        const res = {};
        res[ogLine.preparationKey] = {
            quantity: orderedQty - newQty,
            splitted: newQty,
        };
        res[newLine.preparationKey] = {
            quantity: newQty,
            original: newQty,
        };
        return res;
    }

    async createSplittedOrder() {
        const curOrderUuid = this.currentOrder.uuid;
        const originalOrder = this.pos.models["pos.order"].find((o) => o.uuid === curOrderUuid);
        const originalOrderName = this._getOrderName(originalOrder);
        const newOrderName = this._getSplitOrderName(originalOrderName);

        const newOrder = this.pos.createNewOrder();
        newOrder.floating_order_name = newOrderName;
        newOrder.uiState.splittedOrderUuid = curOrderUuid;
        newOrder.originalSplittedOrder = originalOrder;

        let sentQty = {};
        // Create lines for the new order
        const lineToDel = [];
        for (const line of originalOrder.lines) {
            if (this.qtyTracker[line.uuid]) {
                const data = line.serialize();
                delete data.uuid;
                const newLine = this.pos.models["pos.order.line"].create(
                    {
                        ...data,
                        qty: this.qtyTracker[line.uuid],
                        order_id: newOrder.id,
                    },
                    false,
                    true
                );

                const orderedQty =
                    originalOrder.last_order_preparation_change.lines[line.preparationKey]
                        ?.quantity || 0;
                sentQty = { ...sentQty, ...this._getSentQty(line, newLine, orderedQty) };
                if (line.getQuantity() === this.qtyTracker[line.uuid]) {
                    lineToDel.push(line);
                } else {
                    line.qty = line.getQuantity() - this.qtyTracker[line.uuid];
                }
            }
        }

        originalOrder.last_order_preparation_change.splittedLines = [];
        for (const line of lineToDel) {
            originalOrder.last_order_preparation_change.splittedLines.push(line.uuid);
            line.delete();
        }

        // for the kitchen printer we assume that everything
        // has already been sent to the kitchen before splitting
        // the bill. So we save all changes both for the old
        // order and for the new one. This is not entirely correct
        // but avoids flooding the kitchen with unnecessary orders.
        // Not sure what to do in this case.
        if (this.pos.orderPreparationCategories.size) {
            originalOrder.updateLastOrderChange();
            newOrder.updateLastOrderChange();
        }

        Object.keys(originalOrder.last_order_preparation_change.lines).forEach(
            (linePreparationKey) => {
                if (sentQty[linePreparationKey]) {
                    originalOrder.last_order_preparation_change.lines[linePreparationKey] = {
                        ...originalOrder.last_order_preparation_change.lines[linePreparationKey],
                        ...sentQty[linePreparationKey],
                    };
                }
            }
        );
        Object.keys(newOrder.last_order_preparation_change.lines).forEach((linePreparationKey) => {
            if (sentQty[linePreparationKey]) {
                newOrder.last_order_preparation_change.lines[linePreparationKey] = {
                    ...newOrder.last_order_preparation_change.lines[linePreparationKey],
                    ...sentQty[linePreparationKey],
                };
            }
        });
        this.pos.addPendingOrder([originalOrder.id, newOrder.id]);

        originalOrder.customer_count -= 1;
        originalOrder.setScreenData({ name: "ProductScreen" });
        this.pos.selectedOrderUuid = null;
        this.pos.setOrder(newOrder);
        this.back();
    }

    getLineData(line) {
        const splitQty = this.qtyTracker[line.uuid];

        if (!splitQty) {
            return line.getDisplayData();
        }

        return { ...line.getDisplayData(), qty: `${splitQty} / ${line.getQuantityStr()}` };
    }

    back() {
        this.pos.showScreen("ProductScreen");
    }
}

registry.category("pos_screens").add("SplitBillScreen", SplitBillScreen);
