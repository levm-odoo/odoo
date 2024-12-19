import paymentForm from '@payment/js/payment_form';
import { _t } from '@web/core/l10n/translation';
import { pyToJsLocale } from '@web/core/l10n/utils';
import { rpc, RPCError } from '@web/core/network/rpc';

paymentForm.include({

    mercadoPagoCheckout: undefined,
    mercadoPagoComponents: undefined,

    // #=== DOM MANIPULATION ===#

    /**
     * Prepare the inline form of Adyen for direct payment.
     *
     * @override method from payment.payment_form
     * @private
     * @param {number} providerId - The id of the selected payment option's provider.
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the selected payment option
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {string} flow - The online payment flow of the selected payment option
     * @return {void}
     */
    async _prepareInlineForm(providerId, providerCode, paymentOptionId, paymentMethodCode, flow) {
        if (providerCode !== 'mercado_pago') {
            this._super(...arguments);
            return;
        }


        // Check if instantiation of the component is needed.
        this.mercadoPagoComponents ??= {}; // Store the component of each instantiated payment method.
        if (flow === 'token') {
            return; // No component for tokens.
        } else if (this.mercadoPagoComponents[paymentOptionId]) {
            this._setPaymentFlow('direct'); // Overwrite the flow even if no re-instantiation.
            return; // Don't re-instantiate if already done for this payment method.
        }

        // Overwrite the flow of the selected payment method.
        this._setPaymentFlow('direct');

        // Extract and deserialize the inline form values.
        const radio = document.querySelector('input[name="o_payment_radio"]:checked');
        const inlineForm = this._getInlineForm(radio);
        const inlineFormValues = JSON.parse(radio.dataset['mercadoPagoInlineFormValues']);
        const mercadoPagoContainer = inlineForm.querySelector('[id="o_mercado_pago_component_container"]');
        this.mercadoPagoComponents ??= {};
        const amount = inlineFormValues['amount'];
        // const response = await rpc('/mercado_pago/create_preference', {
        //     partner_id: inlineFormValues['partner_id'],
        //     amount: amount,
        //     currency: inlineFormValues['currency'],
        //     payment_method: inlineFormValues['payment_method'],
        //     provider_id: inlineFormValues['provider'],//maybe don't need this?
        // });


        // Create the checkout object if not already done for another payment method.
            try {
                const mp = new MercadoPago('TEST-8ae53c37-e5e3-44b4-94d4-abf8dbe81689', {
                    locale: 'en-US'
                });
                const bricksBuilder = mp.bricks();
                let item = {}
                item[paymentMethodCode] = 'all'

                const settings = {
                    initialization: {
                        /*
                          "amout" is the total sum to be paid from all payment methods but Mercado Pago Wallet and Parcels without credit card which have their processing value determined on the backend via "preferenceId"
                        */
                        amount: amount,
                        // preferenceId: response,
                        payer: {
                            email: inlineFormValues['email'],
                        },
                    },
                    customization: {
                        visual: {
                            hideFormTitle: true,
                            hidePaymentButton: true,
                            defaultPaymentOption: {
                            ticketForm: true,
                        }
                        },
                        paymentMethods: {
                            ...item,
                            //bank_transfer: 'all',
                            maxInstallments: 1
                        },

                    },
                    callbacks: {
                        onReady: () => {

                        },
                        onSubmit: ({selectedPaymentMethod, formData}) => {
                            // callback when sending data button is clicked
                            return new Promise((resolve, reject) => {
                                fetch("/process_payment", {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify(formData),
                                })
                                    .then((response) => response.json())
                                    .then((response) => {
                                        // receive payment result
                                        resolve();
                                    })
                                    .catch((error) => {
                                        // manage the error answer when trying to create a payment
                                        reject();
                                    });
                            });
                        },
                        onError: (error) => {
                            // callback called to all error cases related to the Brick
                            console.error(error);
                        },
                    },
                };
                //i dont need this function at all i just need
                const brickType = paymentMethodCode === 'card' ? 'cardPayment' : 'payment';
                const method_container = `o_mercado_pago_express_checkout_container_${providerId}_${paymentOptionId}`
                const key = paymentMethodCode

                settings.paymentMethodCode = 'all'
                this.mercadoPagoCheckout = await bricksBuilder.create(
                    brickType,
                    method_container,
                    settings
                );
                //maybe I will need to unmout it?

                // Await the RPC to let it create AdyenCheckout before using it.
                // Create the Adyen Checkout SDK.
                const providerState = this._getProviderState(radio);
            } catch (error) {
                if (error instanceof RPCError) {
                    this._displayErrorDialog(
                        _t("Cannot display the payment form"), error.data.message
                    );
                    this._enableButton();
                    return;
                } else {
                    return Promise.reject(error);
                }
            }


            this.mercadoPagoComponents[paymentOptionId] = this.mercadoPagoCheckout; //i think only here the brick should be rendered

    },
    async _initiatePaymentFlow(providerCode, paymentOptionId, paymentMethodCode, flow) {
        if (providerCode !== 'mercado_pago' || flow === 'token') {
            await this._super(...arguments); // Tokens are handled by the generic flow.
            return;
        }

        // Trigger form validation and wallet collection.
        const _super = this._super.bind(this);
        try {
            await this.mercadoPagoCheckout.getFormData().then(({formData}) =>{
                console.log(formData)
            });
        } catch (error) {
            this._displayErrorDialog(_t("Incorrect payment details"), error.message);
            this._enableButton();
            return
        }
        return await _super(...arguments);
    },

    _renderPaymentBrick(brick)  {
        const settings = {
            initialization: {
                // preferenceId: "To be done, maybe use the function earlier to get methds",
                payer: {
                    firstName: "to be done",
                },
            },
            customization: {
                paymentMethods: {
                    ticket: "all",
                    bankTransfer: "all",
                    atm: "all",
                    onboarding_credits: "all",
                    maxInstallments: 1,

                },
                visual: {
                    hideFormTitle: true,
                    hidePaymentButton: true,
                },
            }
        }
        this.mercadoPagoCheckout = brick.create("payment", "o_mercado_pago_component_container", settings);
    }
});
