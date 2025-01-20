import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        this.onNotified("VIVA_WALLET_LATEST_RESPONSE", () => {
            const pendingLine = this.getPendingPaymentLine("viva_wallet");

            if (pendingLine) {
                pendingLine.payment_method_id.payment_terminal.handleVivaWalletStatusResponse();
            }
        });
    },

    async pay() {
        const currentOrder = this.getOrder();
        const refundedOrder = currentOrder?.lines[0]?.refunded_orderline_id?.order_id;
        const vivaWalletPaymentMethod = currentOrder.config_id.payment_method_ids.find(
            (pm) => pm.use_payment_terminal === "viva_wallet"
        );
        await super.pay();
        if (vivaWalletPaymentMethod && refundedOrder) {
            const paymentIds = refundedOrder.payment_ids.sort((a, b) => b.amount - a.amount) || [];
            // Add all the available payment lines in the refunded order if the current order amount is the same as the refunded order
            if (Math.abs(currentOrder.getTotalDue()) === refundedOrder.amount_total) {
                paymentIds.forEach((pi) => {
                    if (pi.payment_method_id) {
                        const paymentLine = currentOrder.addPaymentline(pi.payment_method_id);
                        paymentLine.setAmount(-pi.amount);
                        paymentLine.updateRefundPaymentLine(pi);
                    }
                });
            } else {
                // Add available payment lines of refunded order based on conditions.
                // Settle current order terminal based payment lines with refunded order terminal based payment lines
                const vivaWalletPaymentlines = paymentIds.filter(
                    (pi) => pi.payment_method_id.use_payment_terminal === "viva_wallet"
                );
                vivaWalletPaymentlines.forEach((pi) => {
                    const currentDue = currentOrder.getDue();
                    if (currentDue < 0) {
                        const paymentLine = currentOrder.addPaymentline(pi.payment_method_id);
                        const amountToSet = Math.min(Math.abs(currentDue), pi.amount);
                        paymentLine.setAmount(-amountToSet);
                        paymentLine.updateRefundPaymentLine(pi);
                    }
                });
                if (currentOrder.getDue() < 0) {
                    paymentIds.forEach((pi) => {
                        const currentDue = currentOrder.getDue();
                        if (
                            currentDue < 0 &&
                            pi.payment_method_id &&
                            pi.payment_method_id.use_payment_terminal !== "viva_wallet"
                        ) {
                            const amountToSet = Math.min(Math.abs(currentDue), pi.amount);
                            currentOrder
                                .addPaymentline(pi.payment_method_id)
                                .setAmount(-amountToSet);
                        }
                    });
                }
            }
        }
    },
});
