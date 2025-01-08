import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";


export class AccrualLevel extends Component {
    static template = "hr_holidays.FloatTimeSelectionField";
    static props = {
    };

    setup() {
    }
}

export const accrualLevel = {
    component: AccrualLevel,
};

registry.category("fields").add("accrual_level", accrualLevel);
