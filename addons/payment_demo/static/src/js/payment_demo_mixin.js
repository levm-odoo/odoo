/** @odoo-module alias=payment_demo.payment_demo_mixin **/

    import rpc from "web.rpc";

    return {

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * Simulate a feedback from a payment provider and redirect the customer to the status page.
         *
         * @override method from payment.payment_form_mixin
         * @private
         * @param {object} processingValues - The processing values of the transaction
         * @return {Promise}
         */
        _processDemoPayment: function (processingValues){
            const customerInput = document.getElementById('customer_input').value;
            const simulatedPaymentState = document.getElementById('simulated_payment_state').value;

            return rpc.query({
                route: '/payment/demo/simulate_payment',
                params: {
                    'reference': processingValues.reference,
                    'payment_details': customerInput,
                    'simulated_state': simulatedPaymentState,
                },
            }).then(() => {
                window.location = '/payment/status';
            });
        },
    }
