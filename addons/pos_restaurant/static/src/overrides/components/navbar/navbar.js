import { Navbar } from "@point_of_sale/app/components/navbar/navbar";
import { patch } from "@web/core/utils/patch";

patch(Navbar.prototype, {
    /**
     * If no table is set to pos, which means the current main screen
     * is floor screen, then the order count should be based on all the orders.
     */

    get orderCount() {
        if (this.pos.config.module_pos_restaurant && this.pos.selectedTable) {
            return this.pos.getTableOrders(this.pos.selectedTable.id).length;
        }
        return super.orderCount;
    },
    showTabs() {
        if (this.pos.config.module_pos_restaurant) {
            return !this.pos.selectedTable;
        } else {
            return super.showTabs();
        }
    },
    onSwitchButtonClick() {
        const mode = this.pos.floorPlanStyle === "kanban" ? "default" : "kanban";
        localStorage.setItem("floorPlanStyle", mode);
        this.pos.floorPlanStyle = mode;
    },
    get showEditPlanButton() {
        return true;
    },
    onClickPlanButton() {
        this.pos.mobilePanes.FloorScreen = "right";
        this.pos.showScreen("FloorScreen", { floor: this.floor });
    },
    getBtnOffset() {
        if (this.pos.mainScreen.component.name === "FloorScreen") {
            return 0;
        }
        if (this.pos.mainScreen.component.name === "ProductScreen") {
            return this.btnSize;
        }
        if (this.pos.mainScreen.component.name === "TicketScreen") {
            return this.btnSize * 2;
        }
    },
});
