import { _t } from "@web/core/l10n/translation";
import { PaymentInterface } from "@point_of_sale/app/utils/payment/payment_interface";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { register_payment_method } from "@point_of_sale/app/services/pos_store";

export class PaymentMercadoPago extends PaymentInterface {
    async createPaymentIntent() {
        const order = this.pos.getOrder();
        const line = order.getSelectedPaymentline();
        // Build informations for creating a payment intend on Mercado Pago.
        // Data in "external_reference" are send back with the webhook notification
        const infos = {
            amount: parseInt(line.amount * 100, 10),
            additional_info: {
                external_reference: `${this.pos.config.current_session_id.id}_${line.payment_method_id.id}_${order.uuid}`,
                print_on_terminal: true,
            },
        };
        // mp_payment_intent_create will call the Mercado Pago api
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_payment_intent_create",
            [[line.payment_method_id.id], infos]
        );
    }
    async getLastStatusPaymentIntent() {
        const line = this.pos.getOrder().getSelectedPaymentline();
        // mp_payment_intent_get will call the Mercado Pago api
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_payment_intent_get",
            [[line.payment_method_id.id], this.payment_intent.id]
        );
    }

    async cancelPaymentIntent() {
        const line = this.pos.getOrder().getSelectedPaymentline();
        // mp_payment_intent_cancel will call the Mercado Pago api
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_payment_intent_cancel",
            [[line.payment_method_id.id], this.payment_intent.id]
        );
    }

<<<<<<< saas-18.1:addons/pos_mercado_pago/static/src/app/utils/payment/payment_mercado_pago.js
    async getPayment(payment_id) {
        const line = this.pos.getOrder().selected_paymentline;
||||||| 0a2c395317f285bb1a8b538dda105ccf88f2e45b:addons/pos_mercado_pago/static/src/app/payment_mercado_pago.js
    async get_payment(payment_id) {
        const line = this.pos.get_order().selected_paymentline;
=======
    async get_payment(payment_id) {
        const line = this.pos.get_order().get_selected_paymentline();
>>>>>>> b01b37cc5a84022acdb3f668dadf837babbc5a99:addons/pos_mercado_pago/static/src/app/payment_mercado_pago.js
        // mp_get_payment_status will call the Mercado Pago api
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_get_payment_status",
            [[line.payment_method_id.id], payment_id]
        );
    }

    setup() {
        super.setup(...arguments);
        this.webhook_resolver = null;
        this.payment_intent = {};
    }

    async sendPaymentRequest(cid) {
        await super.sendPaymentRequest(...arguments);
        const line = this.pos.getOrder().getSelectedPaymentline();
        try {
            // During payment creation, user can't cancel the payment intent
            line.setPaymentStatus("waitingCapture");
            // Call Mercado Pago to create a payment intent
            const payment_intent = await this.createPaymentIntent();
            if (!("id" in payment_intent)) {
                this._showMsg(payment_intent.message, "error");
                return false;
            }
            // Payment intent creation successfull, save it
            this.payment_intent = payment_intent;
            // After payment creation, make the payment intent canceling possible
            line.setPaymentStatus("waitingCard");
            // Wait for payment intent status change and return status result
            return await new Promise((resolve) => {
                this.webhook_resolver = resolve;
            });
        } catch (error) {
            this._showMsg(error, "System error");
            return false;
        }
    }

    async sendPaymentCancel(order, cid) {
        await super.sendPaymentCancel(order, cid);
        if (!("id" in this.payment_intent)) {
            return true;
        }
        const canceling_status = await this.cancelPaymentIntent();
        if ("error" in canceling_status) {
            const message =
                canceling_status.status === 409
                    ? _t("Payment has to be canceled on terminal")
                    : _t("Payment not found (canceled/finished on terminal)");
            this._showMsg(message, "info");
            return canceling_status.status !== 409;
        }
        return true;
    }

    async handleMercadoPagoWebhook() {
        const line = this.pos.getOrder().getSelectedPaymentline();
        const MAX_RETRY = 5; // Maximum number of retries for the "ON_TERMINAL" BUG
        const RETRY_DELAY = 1000; // Delay between retries in milliseconds for the "ON_TERMINAL" BUG

        const showMessageAndResolve = (messageKey, status, resolverValue) => {
            if (!resolverValue) {
                this._showMsg(messageKey, status);
            }
            line.setPaymentStatus("done");
            this.webhook_resolver?.(resolverValue);
            return resolverValue;
        };

        const handleFinishedPayment = async (paymentIntent) => {
            if (paymentIntent.state === "CANCELED") {
                return showMessageAndResolve(_t("Payment has been canceled"), "info", false);
            }
            if (["FINISHED", "PROCESSED"].includes(paymentIntent.state)) {
                const payment = await this.getPayment(paymentIntent.payment.id);
                if (payment.status === "approved") {
                    return showMessageAndResolve(_t("Payment has been processed"), "info", true);
                }
                return showMessageAndResolve(_t("Payment has been rejected"), "info", false);
            }
        };

        // No payment intent id means either that the user reload the page or
        // it is an old webhook -> trash
        if ("id" in this.payment_intent) {
            // Call Mercado Pago to get the payment intent status
            let last_status_payment_intent = await this.getLastStatusPaymentIntent();
            // Bad payment intent id, then it's an old webhook not related with the
            // current payment intent -> trash
            if (this.payment_intent.id == last_status_payment_intent.id) {
                if (
                    ["FINISHED", "PROCESSED", "CANCELED"].includes(last_status_payment_intent.state)
                ) {
                    return await handleFinishedPayment(last_status_payment_intent);
                }
                // BUG Sometimes the Mercado Pago webhook return ON_TERMINAL
                // instead of CANCELED/FINISHED when we requested a payment status
                // that was actually canceled/finished by the user on the terminal.
                // Then the strategy here is to ask Mercado Pago MAX_RETRY times the
                // payment intent status, hoping going out of this status
                if (["OPEN", "ON_TERMINAL"].includes(last_status_payment_intent.state)) {
                    return await new Promise((resolve) => {
                        let retry_cnt = 0;
                        const s = setInterval(async () => {
                            last_status_payment_intent = await this.getLastStatusPaymentIntent();
                            if (
                                ["FINISHED", "PROCESSED", "CANCELED"].includes(
                                    last_status_payment_intent.state
                                )
                            ) {
                                clearInterval(s);
                                resolve(await handleFinishedPayment(last_status_payment_intent));
                            }
                            retry_cnt += 1;
                            if (retry_cnt >= MAX_RETRY) {
                                clearInterval(s);
                                resolve(
                                    showMessageAndResolve(
                                        _t("Payment status could not be confirmed"),
                                        "error",
                                        false
                                    )
                                );
                            }
                        }, RETRY_DELAY);
                    });
                }
                // If the state does not match any of the expected values
                return showMessageAndResolve(_t("Unknown payment status"), "error", false);
            }
        }
    }

    // private methods
    _showMsg(msg, title) {
        this.env.services.dialog.add(AlertDialog, {
            title: "Mercado Pago " + title,
            body: msg,
        });
    }
}

register_payment_method("mercado_pago", PaymentMercadoPago);
