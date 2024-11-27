import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { onMounted } from "@odoo/owl";

patch(PaymentScreen.prototype, {
    setup() {
        super.setup(...arguments);
        onMounted(async () => {
            const waitingPaymentLine = this.currentOrder.payment_ids.find(
                (paymentLine) =>
                    paymentLine.payment_method_id.use_payment_terminal === "pinelabs" &&
                    !paymentLine.is_done() &&
                    paymentLine.get_payment_status() !== "pending"
            );
            if (waitingPaymentLine) {
                await waitingPaymentLine.payment_method_id.payment_terminal._waitForPaymentToConfirm();
                this.pos.paymentTerminalInProgress = false;
            }
        });
    },
});
