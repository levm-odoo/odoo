/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { CustomerDisplay } from "@pos_customer_display/app/root";
import { useService } from "@web/core/utils/hooks";
import { OnlinePaymentPopup } from "@pos_online_payment/app/online_payment_popup/online_payment_popup";
import { useEffect } from "@odoo/owl";

patch(CustomerDisplay.prototype, {
    setup() {
        super.setup(...arguments);
        this.dialog = useService("dialog");
        useEffect(
            (details) => {
                if (!details?.formattedAmount) {
                    this.qrCodePopupCloser?.();
                    return;
                }
                if (this.qrCodePopupCloser) {
                    // If the popup is already open, we don't want to open a new one
                    return;
                }
                this.qrCodePopupCloser = this.dialog.add(OnlinePaymentPopup, details);
            },
            () => [this.order.onlinePaymentData]
        );
    },
});
