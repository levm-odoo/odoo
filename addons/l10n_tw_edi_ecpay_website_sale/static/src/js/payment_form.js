import PaymentForm from '@payment/js/payment_form';
import { _t } from '@web/core/l10n/translation';
import { rpc } from '@web/core/network/rpc';

PaymentForm.include({
    events: Object.assign({}, PaymentForm.prototype.events || {}, {
        "change #print_group": "_onChangePrintGroup",
        "change #l10n_tw_edi_carrier_type": "_onChangeCarrierType",
        "change #identifier_group": "_onChangeIdentifierGroup",
        "input #identifier": "_onInputIdentifier",
        "input #l10n_tw_edi_carrier_number": "_onInputCarrierNumber",
        "input #l10n_tw_edi_love_code": "_onInputLoveCode",
        "click #validate_carrier_number": "_onClickValidateCarrierNumber",
        "click #validate_love_code": "_onClickValidateLoveCode",
        "click #validate_tax_id": "_onClickValidateTaxID",
        "click #reenter_carrier_number": "_onClickReenterCarrierNumber",
        "click #reenter_love_code": "_onClickReenterLoveCode",
    }),

    init() {
        this._super(...arguments);
        this.showAddress = false;
        this.showLoveCode = false;
        this.showCarrierType = true;
        this.showCarrier = false;
        this.showIdentifier = false;
        this.showIdentifierData = false;
        this.validIdentifier = false;
        this.validCarrierNumber = false;
        this.validLoveCode = false;
    },

    _get_token_info() {
        const transactionRouteParts = this.el.getAttribute('data-transaction-route').split("/")
        const saleOrderId = transactionRouteParts[transactionRouteParts.length - 1]
        const accessToken = this.el.getAttribute('data-access-token')
        return [saleOrderId, accessToken]
    },

    showInvoiceItems() {
        const elementsToShow = new Map([
            ["#ecpay_invoice_love_code", this.showLoveCode],
            ["#ecpay_carrier_type_group", this.showCarrierType],
            ["#ecpay_invoice_carrier_number", this.showCarrier],
            ["#ecpay_invoice_identifier_group", this.showIdentifier],
            ["#ecpay_invoice_customer_name", this.showIdentifierData]
          ]);

        elementsToShow.forEach((isShown, selector) => {
          this.el.querySelector(selector).classList.toggle("d-none", !isShown)
        })
    },

    triggerWarning(warningId, errorId, valid) {
        this.el.querySelector(warningId).classList.toggle("d-none", valid)
        this.el.querySelector(errorId).classList.toggle("has-error", !valid)
    },

    _onChangePrintGroup(ev) {
        const printGroup = ev.target.value;
        if (printGroup === "0") {
            this.showAddress = false;
            this.showLoveCode = false;
            this.showCarrierType = true;
            this.showIdentifier = false;
        } else if (printGroup === "1") {
            this.showAddress = true;
            this.showLoveCode = false;
            this.showCarrierType = false;
            this.showIdentifier = true;
        } else {
            this.showAddress = false;
            this.showLoveCode = true;
            this.showCarrierType = false;
            this.showIdentifier = false;
        }
        this.showInvoiceItems();
    },

    _onChangeCarrierType(ev) {
        const carrierType = ev.target.value;
        if (carrierType === "2") {
            this.el.querySelector("#warning-l10n_tw_edi_carrier_number").innerHTML =
                "Correct Format: 2 capital letters following 14 digits";
            this.showCarrier = true;
        } else if (carrierType === "3") {
            this.el.querySelector("#warning-l10n_tw_edi_carrier_number").innerHTML =
                'Correct Format: "/" following 7 alphanumeric or +-. string';
            this.showCarrier = true;
        } else {
            this.showCarrier = false;
        }
        this.validCarrierNumber = false;
        this.el.querySelector("#warning-l10n_tw_edi_carrier_number").classList.remove("d-none");
        this.showInvoiceItems();
    },

    _onChangeIdentifierGroup(ev) {
        this.showIdentifierData = Boolean(parseInt(ev.target.value, 10));
        this.showInvoiceItems();
    },

    _onInputIdentifier: function (ev) {
        this.validIdentifier = false;
    },

    _onInputCarrierNumber(ev) {
        const carrierType = this.el.querySelector("#l10n_tw_edi_carrier_type").value;
        if (carrierType === "2") {
            this.el.querySelector("#warning-l10n_tw_edi_carrier_number").innerHTML =
                "Correct Format: 2 capital letters following 14 digits";
            const re = /^[A-Za-z]{2}[0-9]{14}$/;
            this.validCarrierNumber = Boolean(re.test(ev.target.value));
            this.triggerWarning(
                "#warning-l10n_tw_edi_carrier_number",
                "#ecpay_invoice_carrier_number",
                this.validCarrierNumber
            );
        } else if (carrierType === "3") {
            this.el.querySelector("#warning-l10n_tw_edi_carrier_number").innerHTML =
                "Correct Format: '/' following 7 alphanumeric or +-. string";
            const re = /^\/{1}[0-9a-zA-Z+-.]{7}$/;
            if (re.test(ev.target.value)) {
                this.el.querySelector("#validate_carrier_number").classList.remove("d-none");
                this.triggerWarning("#warning-l10n_tw_edi_carrier_number", "#ecpay_invoice_carrier_number", true);
            } else {
                this.el.querySelector("#validate_carrier_number").classList.add("d-none");
                this.triggerWarning(
                    "#warning-l10n_tw_edi_carrier_number",
                    "#ecpay_invoice_carrier_number",
                    this.validCarrierNumber
                );
            }
        } else {
            this.el.querySelector("#validate_carrier_number").classList.add("d-none");
            this.triggerWarning(
                "#warning-l10n_tw_edi_carrier_number",
                "#ecpay_invoice_carrier_number",
                this.validCarrierNumber
            );
        }
    },

    _onInputLoveCode(ev) {
        this.validLoveCode = false;
        this.el.querySelector("#warning-l10n_tw_edi_love_code").innerHTML = "Love code format is 3-7 digits";
        const re = /^([xX]{1}[0-9]{2,6}|[0-9]{3,7})$/;
        if (re.test(ev.target.value)) {
            this.el.querySelector("#validate_love_code").classList.remove("d-none");
            this.triggerWarning("#warning-l10n_tw_edi_love_code", "#ecpay_invoice_love_code", true);
        } else {
            this.el.querySelector("#validate_love_code").classList.add("d-none");
            this.triggerWarning("#warning-l10n_tw_edi_love_code", "#ecpay_invoice_love_code", this.validCarrierNumber);
        }
    },

    async _onClickValidateCarrierNumber() {
        try {
            const [saleOrderId, accessToken] = this._get_token_info()
            const result = await rpc.query({
                route: "/payment/ecpay/check_carrier_number/" + saleOrderId,
                params: {"access_token":accessToken,  "carrier_number": this.el.querySelector("#l10n_tw_edi_carrier_number").value},
            });
            if (result) {
                this.validCarrierNumber = true;
                this.triggerWarning(
                    "#warning-l10n_tw_edi_carrier_number",
                    "#ecpay_invoice_carrier_number",
                    this.validCarrierNumber
                );
                this.el.querySelector("#validate_carrier_number").classList.add("d-none");
                this.el.querySelector("#reenter_carrier_number").classList.remove("d-none");
                this.el.querySelector("#l10n_tw_edi_carrier_number").disabled = true;
            } else {
                this.el.querySelector("#warning-l10n_tw_edi_carrier_number").innerHTML = "Carrier number does not exist OR Validation failed (Please fill in the ECpay API information in the company setting!)";
                this.triggerWarning(
                    "#warning-l10n_tw_edi_carrier_number",
                    "#ecpay_invoice_carrier_number",
                    this.validCarrierNumber
                );
            }
        }
        catch (error) {
            this._displayErrorDialog(_t("ECpay error"), error.data.message);
            return;
        }
    },

    async _onClickValidateLoveCode() {
        try {
            const [saleOrderId, accessToken] = this._get_token_info()
            const result = await rpc.query({
                route: "/payment/ecpay/check_love_code/" + saleOrderId,
                params: {"access_token":accessToken, "love_code": this.el.querySelector("#l10n_tw_edi_love_code").value},
            });

            if (result) {
                this.validLoveCode = true;
                this.triggerWarning("#warning-l10n_tw_edi_love_code", "#ecpay_invoice_love_code", this.validLoveCode);
                this.el.querySelector("#validate_love_code").classList.add("d-none");
                this.el.querySelector("#reenter_love_code").classList.remove("d-none");
                this.el.querySelector("#l10n_tw_edi_love_code").disabled = true;
            } else {
                this.el.querySelector("#warning-l10n_tw_edi_love_code").innerHTML = "Love code does not exist OR Validation failed (Please fill in the ECpay API information in the company setting!)";
                this.triggerWarning("#warning-l10n_tw_edi_love_code", "#ecpay_invoice_love_code", this.validLoveCode);
            }
        }
        catch (error) {
            this._displayErrorDialog(_t("ECpay error"), error.data.message);
            return;
        }
    },

    async _onClickValidateTaxID() {
        try {
            const [saleOrderId, accessToken] = this._get_token_info()
            const result = await rpc(
                "/payment/ecpay/check_tax_id/" + saleOrderId,
                {"access_token":accessToken, "identifier": this.el.querySelector("#identifier").value},
            );
            if (result) {
                this.validIdentifier = true;
                this._displayErrorDialog(_t("Success"), _t("Tax ID is valid"));
                return;
            }
            this._displayErrorDialog(_t("Error"), _t("Tax ID is invalid"));
            return;
        }
        catch (error) {
            this._displayErrorDialog(_t("ECpay error"), error.data.message);
            return;
        }
    },

    _onClickReenterCarrierNumber() {
        this.validCarrierNumber = false;
        this.triggerWarning("#warning-l10n_tw_edi_carrier_number", "#ecpay_invoice_carrier_number", this.validCarrierNumber);
        this.el.querySelector("#validate_carrier_number").classList.remove("d-none");
        this.el.querySelector("#reenter_carrier_number").classList.add("d-none");
        this.el.querySelector("#l10n_tw_edi_carrier_number").disabled = false;
    },

    _onClickReenterLoveCode() {
        this.validLoveCode = false;
        this.triggerWarning("#warning-l10n_tw_edi_love_code", "#ecpay_invoice_love_code", this.validLoveCode);
        this.el.querySelector("#validate_love_code").classList.remove("d-none");
        this.el.querySelector("#reenter_love_code").classList.add("d-none");
        this.el.querySelector("#l10n_tw_edi_love_code").disabled = false;
    },

    validateData: function () {
        if (this.showAddress && this.showIdentifierData && !this.validIdentifier) {
            return false;
        }
        if (this.showLoveCode && !this.validLoveCode) {
            return false;
        }
        if (this.showCarrierType && this.showCarrier && !this.validCarrierNumber) {
            return false;
        }
        const data = {}

        if (this.showAddress) {
            data.printFlag = true;
            if (this.showIdentifierData) {
                data.identifier = this.el.querySelector("#identifier").value;
            }
        }
        if (this.showLoveCode) {
            data.loveCode = this.el.querySelector("#l10n_tw_edi_love_code").value;
        }
        if (this.showCarrierType) {
            data.carrierType = this.el.querySelector("#l10n_tw_edi_carrier_type").value;
            if (this.showCarrier) {
                data.carrierNumber = this.el.querySelector("#l10n_tw_edi_carrier_number").value;
            }
        }
        return data;
    },

    async _submitForm(ev) {
        const _super = this._super.bind(this);
        ev.preventDefault();
        const info = this.validateData();
        if (info) {
            try{
                const [saleOrderId, accessToken] = this._get_token_info()
                await rpc(
                    "/payment/ecpay/save_ecpay_info/" + saleOrderId,
                    {...info, "access_token":accessToken,},
                );
            }
            catch (error) {
                this._displayErrorDialog(_t("Odoo Error"), error.data.message);
                return;
            }
        } else {
            this._displayErrorDialog(_t("Error"), "Please enter correct information");
            return;
        }
        return _super(...arguments);
    },
});
