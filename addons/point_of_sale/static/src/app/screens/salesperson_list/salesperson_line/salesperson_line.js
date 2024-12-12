import { Component } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";

export class SalespersonLine extends Component {
    static template = "point_of_sale.SalespersonLine";  // Template specific to salesperson
    static components = { Dropdown, DropdownItem };
    static props = [
        "close",
        "salesperson",   // prop to hold the salesperson data
        "isSelected",    // determines if this salesperson is selected
        "isBalanceDisplayed",  // determines if balance is displayed, you can remove if not needed
        "onClickEdit",   // action when user clicks 'Edit' button
        "onClickUnselect", // action when user unselects salesperson
        "onClickSalesperson", // action when user clicks on a salesperson (selects it)
        "onClickOrders",  // action when user clicks on "Orders" for the salesperson
    ];

    setup() {
        this.ui = useService("ui");  // use the ui service for UI-related functions
    }
}
