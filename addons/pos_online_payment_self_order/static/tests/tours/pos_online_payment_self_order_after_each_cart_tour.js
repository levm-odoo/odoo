/** @odoo-module **/

import { registry } from "@web/core/registry";
import { PosSelf } from "@pos_self_order/../tests/utils/tour_utils";

registry.category("web_tour.tours").add("pos_online_payment_self_order_after_each_cart_tour", {
    test: true,
    steps: () => [
        // Check that the self is open
        PosSelf.check.isNotNotification(),

        PosSelf.action.clickPrimaryBtn("View Menu"),
        ...PosSelf.action.addProduct("Office Chair Black", 1),

        PosSelf.action.clickPrimaryBtn("Review"),
        PosSelf.check.isOrderline("Office Chair Black", "138.58", ""),
        PosSelf.check.isPrimaryBtn("Pay"), // Not clicked on because it would open another page, losing the tour setup.
    ],
});
