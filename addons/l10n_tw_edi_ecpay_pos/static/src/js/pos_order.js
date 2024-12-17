import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    setup() {
        super.setup(...arguments);
        if (!this.partner_id) {
            this.update({ partner_id: this.session._default_customer_id });
        }
    },

    set_invoice_info(print_flag, l10n_tw_edi_love_code, l10n_tw_edi_carrier_type, l10n_tw_edi_carrier_number) {
        this.l10n_tw_edi_is_print = print_flag;
        this.l10n_tw_edi_love_code = l10n_tw_edi_love_code;
        this.l10n_tw_edi_carrier_type = l10n_tw_edi_carrier_type;
        this.l10n_tw_edi_carrier_number = l10n_tw_edi_carrier_number;
    },

    export_for_printing(baseUrl, headerData) {
        const result = super.export_for_printing(...arguments);
        return {
            ...result,
            'invoice_month': this.invoice_month,
            'IIS_Number': this.IIS_Number,
            'IIS_Create_Date': this.IIS_Create_Date,
            'IIS_Random_Number': this.IIS_Random_Number,
            'IIS_Tax_Amount': this.IIS_Tax_Amount,
            'l10n_tw_edi_invoice_amount': this.l10n_tw_edi_invoice_amount,
            'IIS_Identifier': this.IIS_Identifier,
            'IIS_Carrier_Type': this.IIS_Carrier_Type,
            'IIS_Carrier_Num': this.IIS_Carrier_Num,
            'IIS_Category': this.IIS_Category,
            'l10n_tw_edi_ecpay_seller_identifier': this.l10n_tw_edi_ecpay_seller_identifier,
            'PosBarCode': this.PosBarCode,
            'QRCode_Left': this.get_ecpay_qrcode(this.QRCode_Left),
            'QRCode_Right': this.get_ecpay_qrcode(this.QRCode_Right),
            'company_name': this.company.name,
            'ecpayError': this.error !== undefined,
        };
    },

    get_ecpay_qrcode(data) {
        const codeWriter = new window.ZXing.BrowserQRCodeSvgWriter();
        const qrCodeSvg = new XMLSerializer().serializeToString(codeWriter.write(data, 130, 130));
        return "data:image/svg+xml;base64,"+ window.btoa(qrCodeSvg);
    },
});
