import { PosPayment } from "@point_of_sale/app/models/pos_payment";
import { patch } from "@web/core/utils/patch";

patch(PosPayment.prototype, {
    setup() {
        super.setup(...arguments);
        this.tyroMerchantReceipt = null;
    },

    setTyroMerchantReceipt(value) {
        this.tyroMerchantReceipt = value;
    },

    export_for_printing() {
        const result = super.export_for_printing(...arguments);
        if (this.tyroMerchantReceipt) {
            result.ticket = this.tyroMerchantReceipt;
            this.tyroMerchantReceipt = null;
        }
        return result;
    },
});
