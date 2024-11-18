import { rpc } from "@web/core/network/rpc";
import { debounce } from "@web/core/utils/timing";
import publicWidget from "@web/legacy/js/public/public_widget";

publicWidget.registry.websiteSaleAddress = publicWidget.Widget.extend({
    // /shop/address
    selector: '.o_wsale_address_fill',
    events: {
        'change select[name="country_id"]': '_onChangeCountry',
        'click #save_address': '_onSaveAddress',
        "change select[name='state_id']": "_onChangeState",
        'input input[name="email"]': '_onEmailInput',
    },

    /**
     * @constructor
     */
    init: function () {
        this._super.apply(this, arguments);

        this.http = this.bindService('http');

        this._changeCountry = debounce(this._changeCountry.bind(this), 500);
        this.addressForm = document.querySelector('form.checkout_autoformat');
        this.errorsDiv = document.getElementById('errors');
        this._checkEmailExists = debounce(this._checkEmailExists.bind(this), 500);
        this.emailExistsMessage = document.getElementById('email-exists-message');
        this.emailInput = this.addressForm.querySelector('input[name="email"]');
        this.addressType = this.addressForm['address_type'].value;
        this.countryCode = this.addressForm.dataset.companyCountryCode;
        this.requiredFields = this.addressForm.required_fields.value.split(',');
        this.anonymousCart = document.querySelector('input[name="is_anonymous_cart"]').value;
        this.wantInvoiceCheckbox = document.getElementById('o_want_invoice');
        this.onlyServices = document.querySelector('input[name="only_services"]').value;
    },

    /**
     * @override
     */
    start() {
        const def = this._super(...arguments);

        this.requiredFields.forEach((fname) => {
            this._markRequired(fname, true);
        })
        this._changeCountry(true);

        if(this.emailInput.value && this.emailExistsMessage && this.anonymousCart) {
            this._checkEmailExists(this.emailInput.value);
        }

        if (this.wantInvoiceCheckbox){
            this.wantInvoiceCheckbox.addEventListener(
                'change', this._toggleInvoiceFields.bind(this)
            );
        }

        return def;
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Handle email input event, check if email exists after user stops typing.
     * @private
     * @param {Event} ev
     */
    _onEmailInput(ev) {
        if (this.emailExistsMessage) {
            const email = ev.target.value.trim();
            if (email) {
                this._checkEmailExists(email);
            }
        }
    },

    /**
     * Check if the email already exists in the database and show message if it does.
     * @private
     * @param {String} email
     */
    async _checkEmailExists(email) {
        try {
            const emailExists = await rpc('/shop/check_email_exists', { email });
            this.emailExistsMessage.classList.toggle('d-none', !emailExists);
        } catch (error) {
            console.error("Error checking email existence:", error);
            this.emailExistsMessage.classList.add('d-none');
        }
    },

    /**
     * @private
     * @param {Event} ev
     */
    _onChangeCountry(ev) {
        return this._changeCountry();
    },

    /**
     * @private
     * @param {Event} ev
     */
    _onChangeState(ev) {
        return Promise.resolve();
    },

    /**
     * @private
     * @param {Event} ev
     */
    _toggleInvoiceFields(ev) {
        const wantInvoice = ev.target.checked; // Check the state of the checkbox

        // Fields to toggle
        const invoiceFields = [
            'company_name', 'vat', 'street', 'street2', 'city', 'country_id', 'state_id','zip'
        ];

        // Show/hide fields based on the checkbox state
        invoiceFields.forEach((fieldName) => {
            if (wantInvoice) {
                this._showInput(fieldName);
                this._markDisabled(fieldName, false);
            } else {
                this._markRequired(fieldName, false);
                this._clearInputField(fieldName);
                this._markDisabled(fieldName, true);
                this._hideInput(fieldName);
            }
        });
    },

    /**
     * @private
     */
    async _changeCountry(init=false) {
        const countryId = parseInt(this.addressForm.country_id.value);
        if (!countryId) {
            return;
        }
        if(
            this.onlyServices
            && this.anonymousCart
            && this.wantInvoiceCheckbox
            && !this.wantInvoiceCheckbox.checked
        ) {
            return;
        }

        const data = await rpc(
            `/shop/country_info/${parseInt(countryId)}`,
            {address_type: this.addressType},
        );

        if (data.phone_code !== 0) {
            this.addressForm.phone.placeholder = '+' + data.phone_code;
        } else {
            this.addressForm.phone.placeholder = '';
        }

        // populate states and display
        var selectStates = this.addressForm.state_id;
        if (!init || selectStates.options.length === 1) {
            // dont reload state at first loading (done in qweb)
            if (data.states.length || data.state_required) {
                // empty existing options, only keep the placeholder.
                selectStates.options.length = 1;

                // create new options and append them to the select element
                data.states.forEach((state) => {
                    let option = new Option(state[1], state[0]);
                    // Used by localizations
                    option.setAttribute('data-code', state[2]);
                    selectStates.appendChild(option);
                });
                this._showInput('state_id');
            } else {
                this._hideInput('state_id');
            }
        }

        // manage fields order / visibility
        if (data.fields) {
            if (data.zip_before_city) {
                this._getInputDiv('zip').after(this._getInputDiv('city'));
            } else {
                this._getInputDiv('zip').before(this._getInputDiv('city'));
            }

            var all_fields = ['street', 'zip', 'city'];
            all_fields.forEach((fname) => {
                if (data.fields.includes(fname)) {
                    this._showInput(fname);
                } else {
                    this._hideInput(fname);
                }
            });
        }

        const required_fields = this.addressForm.querySelectorAll(':required');
        required_fields.forEach((element) => {
            // remove requirement on previously required fields
            if (
                !data.required_fields.includes(element.name)
                && !this.requiredFields.includes(element.name)
            ) {
                this._markRequired(element.name, false);
            }
        });
        data.required_fields.forEach((fieldName) => {
            this._markRequired(fieldName, true);
        })
    },

    _shouldShowFields() {
        return (
            !this.onlyServices
            || (
                this.onlyServices
                && this.anonymousCart
                && this.wantInvoiceCheckbox
                && !this.wantInvoiceCheckbox.checked
            )
        );
    },

    _clearInputField(fieldName) {
        const input = this.addressForm[fieldName];
        if (input) {
            if (input.tagName === 'SELECT') {
                input.selectedIndex = 0; // Reset dropdown to the first option
            } else {
                input.value = ''; // Clear text inputs
            }
        }
    },

    _getInputDiv(name) {
        return this.addressForm[name].parentElement;
    },

    _getInputLabel(name) {
        const input = this.addressForm[name];
        return input?.parentElement.querySelector(`label[for='${input.id}']`);
    },

    _showInput(name) {
        // show parent div, containing label and input
        this.addressForm[name].parentElement.style.display = '';
    },

    _hideInput(name) {
        // show parent div, containing label and input
        this.addressForm[name].parentElement.style.display = 'none';
    },

    _markRequired(name, required) {
        const input = this.addressForm[name];
        if (input) {
            input.required = required;
        }
        this._getInputLabel(name)?.classList.toggle('label-optional', !required);
    },

    _markDisabled(name, disabled) {
        const input = this.addressForm[name];
        if (input) {
            input.disabled = disabled;
        }
    },

    /**
     * Disable the button, submit the form and add a spinner while the submission is ongoing
     *
     * @private
     * @param {Event} ev
     */
    async _onSaveAddress(ev) {
        if (!this.addressForm.reportValidity()) {
            return
        }

        const submitButton = ev.currentTarget;
        if (!ev.defaultPrevented && !submitButton.disabled) {
            ev.preventDefault();

            submitButton.disabled = true;
            const spinner = document.createElement('span');
            spinner.classList.add('fa', 'fa-cog', 'fa-spin');
            submitButton.appendChild(spinner);
            const formData = new FormData(this.addressForm);
            formData.delete('only_services');
            // Remove all the fields other than name, email, phone when it is only_services,
            // anonymous cart and want invoice is unchecked.
            if (
                this.onlyServices
                && this.anonymousCart
                && this.wantInvoiceCheckbox
                && !this.wantInvoiceCheckbox.checked
            ) {
                const invoiceFields = [
                    'company_name', 'vat', 'street', 'street2',
                    'city', 'country_id', 'state_id', 'zip'
                ];
                invoiceFields.forEach((field) => {
                    this._markRequired(field, false);
                    this._clearInputField(field);
                    formData.delete(field);
                });
            }
            const result = await this.http.post(
                '/shop/address/submit',
                formData,
            )
            if (result.successUrl) {
                window.location = result.successUrl;
            } else {
                // Highlight missing/invalid form values
                document.querySelectorAll('.is-invalid').forEach(element => {
                    if (!result.invalid_fields.includes(element.name)) {
                        element.classList.remove('is-invalid');
                    }
                })
                result.invalid_fields.forEach(
                    fieldName => this.addressForm[fieldName].classList.add('is-invalid')
                );

                // Display the error messages
                // NOTE: setCustomValidity is not used as we would have to reset the error msg on
                // input update, which is not worth catching for the rare cases where the
                // server-side validation will catch validation issues (now that required inputs
                // are also handled client-side)
                const newErrors = result.messages.map(message => {
                    const errorHeader = document.createElement('h5');
                    errorHeader.classList.add('text-danger');
                    errorHeader.appendChild(document.createTextNode(message));
                    return errorHeader;
                });

                this.errorsDiv.replaceChildren(...newErrors);

                // Re-enable button and remove spinner
                submitButton.disabled = false;
                spinner.remove();
            }
        }
    },

});

export default publicWidget.registry.websiteSaleAddress;
