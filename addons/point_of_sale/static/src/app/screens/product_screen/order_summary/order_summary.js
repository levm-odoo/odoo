import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { Component } from "@odoo/owl";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";
import { OrderWidget } from "@point_of_sale/app/components/order_widget/order_widget";
import { useService } from "@web/core/utils/hooks";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { NumberPopup } from "@point_of_sale/app/components/popups/number_popup/number_popup";
import { parseFloat } from "@web/views/fields/parsers";

export class OrderSummary extends Component {
    static template = "point_of_sale.OrderSummary";
    static components = {
        Orderline,
        OrderWidget,
    };
    static props = {};

    setup() {
        super.setup();
        this.numberBuffer = useService("number_buffer");
        this.dialog = useService("dialog");
        this.pos = usePos();

        this.numberBuffer.use({
            triggerAtInput: (...args) => this.updateSelectedOrderline(...args),
            useWithBarcode: true,
        });
    }

    get currentOrder() {
        return this.pos.getOrder();
    }

    async editPackLotLines(line) {
        const isAllowOnlyOneLot = line.product_id.isAllowOnlyOneLot();
        const editedPackLotLines = await this.pos.editLots(
            line.product_id,
            line.getPackLotLinesToEdit(isAllowOnlyOneLot)
        );

        line.editPackLotLines(editedPackLotLines);
    }

    clickLine(ev, orderline) {
        if (ev.detail === 2) {
            clearTimeout(this.singleClick);
            return;
        }
        this.numberBuffer.reset();
        if (!orderline.isSelected()) {
            this.pos.selectOrderLine(this.currentOrder, orderline);
        } else {
            this.singleClick = setTimeout(() => {
                this.pos.getOrder().uiState.selected_orderline_uuid = null;
            }, 300);
        }
    }

    async updateSelectedOrderline({ buffer, key }) {
        const order = this.pos.getOrder();
        const selectedLine = order.getSelectedOrderline();
        // This validation must not be affected by `disallowLineQuantityChange`
        if (selectedLine && selectedLine.isTipLine() && this.pos.numpadMode !== "price") {
            /**
             * You can actually type numbers from your keyboard, while a popup is shown, causing
             * the number buffer storage to be filled up with the data typed. So we force the
             * clean-up of that buffer whenever we detect this illegal action.
             */
            this.numberBuffer.reset();
            if (key === "Backspace") {
                this._setValue("remove");
            } else {
                this.dialog.add(AlertDialog, {
                    title: _t("Cannot modify a tip"),
                    body: _t("Customer tips, cannot be modified directly"),
                });
            }
            return;
        }
        if (
            selectedLine &&
            this.pos.numpadMode === "quantity" &&
            this.pos.disallowLineQuantityChange()
        ) {
            const orderlines = order.lines;
            const lastId = orderlines.length !== 0 && orderlines.at(orderlines.length - 1).uuid;
            const currentQuantity = this.pos.getOrder().getSelectedOrderline().getQuantity();

            if (selectedLine.noDecrease) {
                this.dialog.add(AlertDialog, {
                    title: _t("Invalid action"),
                    body: _t("You are not allowed to change this quantity"),
                });
                return;
            }
            const parsedInput = (buffer && parseFloat(buffer)) || 0;
            if (lastId != selectedLine.uuid) {
                this._showDecreaseQuantityPopup();
            } else if (currentQuantity < parsedInput) {
                this._setValue(buffer);
            } else if (parsedInput < currentQuantity) {
                this._showDecreaseQuantityPopup();
            }
            return;
        }
        const val = buffer === null ? "remove" : buffer;
        this._setValue(val);
        if (val == "remove") {
            this.numberBuffer.reset();
            this.pos.numpadMode = "quantity";
        }
    }

    _setValue(val) {
        const { numpadMode } = this.pos;
        let selectedLine = this.currentOrder.getSelectedOrderline();
        if (selectedLine) {
            if (numpadMode === "quantity") {
                if (selectedLine.combo_parent_id) {
                    selectedLine = selectedLine.combo_parent_id;
                }
                if (val === "remove") {
                    this.currentOrder.removeOrderline(selectedLine);
                } else {
                    const result = selectedLine.setQuantity(
                        val,
                        Boolean(selectedLine.combo_line_ids?.length)
                    );
                    for (const line of selectedLine.combo_line_ids) {
                        line.setQuantity(val, true);
                    }
                    if (result !== true) {
                        this.dialog.add(AlertDialog, result);
                        this.numberBuffer.reset();
                    }
                }
            } else if (numpadMode === "discount" && val !== "remove") {
                selectedLine.setDiscount(val);
            } else if (numpadMode === "price" && val !== "remove") {
                this.setLinePrice(selectedLine, val);
            }
        }
    }

    setLinePrice(line, price) {
        line.price_type = "manual";
        line.setUnitPrice(price);
    }

    async _showDecreaseQuantityPopup() {
        this.numberBuffer.reset();
        const inputNumber = await makeAwaitable(this.dialog, NumberPopup, {
            title: _t("Set the new quantity"),
        });
        const newQuantity = inputNumber && inputNumber !== "" ? parseFloat(inputNumber) : null;
        if (newQuantity !== null) {
            const order = this.pos.getOrder();
            const selectedLine = order.getSelectedOrderline();
            const currentQuantity = selectedLine.getQuantity();
            if (newQuantity >= currentQuantity) {
                selectedLine.setQuantity(newQuantity);
                return true;
            }
            if (newQuantity >= selectedLine.saved_quantity) {
                selectedLine.setQuantity(newQuantity);
                if (newQuantity == 0) {
                    selectedLine.delete();
                }
                return true;
            }
            const newLine = selectedLine.clone();
            const decreasedQuantity = selectedLine.saved_quantity - newQuantity;
            newLine.order = order;
            newLine.setQuantity(-decreasedQuantity, true);
            selectedLine.setQuantity(selectedLine.saved_quantity);
            order.add_orderline(newLine);
            return true;
        }
        return false;
    }
<<<<<<< master
||||||| 79f688a757935f34e9dfde598f6547c998642328
    async handleDecreaseUnsavedLine(newQuantity) {
        const selectedLine = this.currentOrder.get_selected_orderline();
        const decreaseQuantity = selectedLine.get_quantity() - newQuantity;
        selectedLine.set_quantity(newQuantity);
        if (newQuantity == 0) {
            selectedLine.delete();
            this.currentOrder._unlinkOrderline(selectedLine);
        }
        return decreaseQuantity;
    }
    async handleDecreaseLine(newQuantity) {
        const selectedLine = this.currentOrder.get_selected_orderline();
        let current_saved_quantity = 0;
        for (const line of this.currentOrder.lines) {
            if (line === selectedLine) {
                current_saved_quantity += line.saved_quantity;
            } else if (
                line.product_id.id === selectedLine.product_id.id &&
                line.get_unit_price() === selectedLine.get_unit_price()
            ) {
                current_saved_quantity += line.qty;
            }
        }
        const newLine = this.getNewLine();
        const decreasedQuantity = current_saved_quantity - newQuantity;
        if (decreasedQuantity != 0) {
            newLine.set_quantity(-decreasedQuantity + newLine.get_quantity(), true);
        }
        if (newLine !== selectedLine && selectedLine.saved_quantity != 0) {
            selectedLine.set_quantity(selectedLine.saved_quantity);
        }
        return decreasedQuantity;
    }
    getNewLine() {
        const selectedLine = this.currentOrder.get_selected_orderline();
        const sign = selectedLine.get_quantity() > 0 ? 1 : -1;
        let newLine = selectedLine;
        if (selectedLine.saved_quantity != 0) {
            for (const line of selectedLine.order_id.lines) {
                if (
                    line.product_id.id === selectedLine.product_id.id &&
                    line.get_unit_price() === selectedLine.get_unit_price() &&
                    line.get_quantity() * sign < 0 &&
                    line !== selectedLine
                ) {
                    return line;
                }
            }
            const data = selectedLine.serialize();
            delete data.uuid;
            newLine = this.pos.models["pos.order.line"].create(
                {
                    ...data,
                    refunded_orderline_id: selectedLine.refunded_orderline_id,
                },
                false,
                true
            );
            newLine.set_quantity(0);
        }
        return newLine;
    }
=======
    async handleDecreaseUnsavedLine(newQuantity) {
        const selectedLine = this.currentOrder.get_selected_orderline();
        const decreaseQuantity = selectedLine.get_quantity() - newQuantity;
        selectedLine.set_quantity(newQuantity);
        if (newQuantity == 0) {
            selectedLine.delete();
        }
        return decreaseQuantity;
    }
    async handleDecreaseLine(newQuantity) {
        const selectedLine = this.currentOrder.get_selected_orderline();
        let current_saved_quantity = 0;
        for (const line of this.currentOrder.lines) {
            if (line === selectedLine) {
                current_saved_quantity += line.saved_quantity;
            } else if (
                line.product_id.id === selectedLine.product_id.id &&
                line.get_unit_price() === selectedLine.get_unit_price()
            ) {
                current_saved_quantity += line.qty;
            }
        }
        const newLine = this.getNewLine();
        const decreasedQuantity = current_saved_quantity - newQuantity;
        if (decreasedQuantity != 0) {
            newLine.set_quantity(-decreasedQuantity + newLine.get_quantity(), true);
        }
        if (newLine !== selectedLine && selectedLine.saved_quantity != 0) {
            selectedLine.set_quantity(selectedLine.saved_quantity);
        }
        return decreasedQuantity;
    }
    getNewLine() {
        const selectedLine = this.currentOrder.get_selected_orderline();
        const sign = selectedLine.get_quantity() > 0 ? 1 : -1;
        let newLine = selectedLine;
        if (selectedLine.saved_quantity != 0) {
            for (const line of selectedLine.order_id.lines) {
                if (
                    line.product_id.id === selectedLine.product_id.id &&
                    line.get_unit_price() === selectedLine.get_unit_price() &&
                    line.get_quantity() * sign < 0 &&
                    line !== selectedLine
                ) {
                    return line;
                }
            }
            const data = selectedLine.serialize();
            delete data.uuid;
            newLine = this.pos.models["pos.order.line"].create(
                {
                    ...data,
                    refunded_orderline_id: selectedLine.refunded_orderline_id,
                },
                false,
                true
            );
            newLine.set_quantity(0);
        }
        return newLine;
    }
>>>>>>> 7d64e4b78fc427cfb39cc9cc4e794a6cd246863d
}
