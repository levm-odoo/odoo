/** @odoo-module **/

import {
    AccountMoveUploadKanbanController,
    AccountMoveListController,
} from "@account/components/bills_upload/bills_upload";
import { Component, onWillStart, useSubEnv } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useBus, useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import * as BarcodeScanner from "@web/webclient/barcode/barcode_scanner";


export class BillQrScan extends Component {

    static template = "book_qr_code_scan.billScanInput";
    static components = { Dialog };

    setup() {
        this.actionService = useService('action');
        this.notificationService = useService("notification");
        this.barcodeService = useService('barcode');
        this.orm = useService("orm");
        useBus(this.barcodeService.bus, "barcode_scanned", (ev) => this._onBarcodeScanned(ev));
        onWillStart(async () => {
            this.isMobileScanner = BarcodeScanner.isBarcodeScannerSupported();
        });
    }

    async openMobileScanner() {
        const barcode = await BarcodeScanner.scanBarcode(this.env);
        if (barcode) {
            this.barcodeService.bus.trigger('barcode_scanned', { barcode });
            if ('vibrate' in window.navigator) {
                window.navigator.vibrate(100);
            }
        } else {
            this.env.services.notification.add(_t("Please, Scan again!"), {
                type: 'warning'
            });
        }
    }

    async _onBarcodeScanned(ev) {
        this.env.services.ui.block();
        try {
            const res = await this.orm.call(
                "product.product", "l10n_in_get_bill_from_qr_raw", [], { qr_raw: ev?.detail?.barcode }
            );
            this.actionService.doAction(res);
            if (res?.params?.type !== 'danger') {
                return this.props.close();
            }
        } finally {
            this.env.services.ui.unblock();
        }
    }
}
registry.category('actions').add('book_qr_code_scan', BillQrScan);

export function qrBillScannerController() {
    return {
        setup() {
            super.setup();
            this.dialog = useService("dialog");
            this.orm = useService("orm");
            useSubEnv({
                openScanWizard: this.openScanWizard.bind(this),
            });
            onWillStart(async () => {
                const currentCompanyId = this.env.services.company.currentCompany.id;
                this.data = await this.orm.searchRead("res.company", [["id", "=", currentCompanyId]], ["country_code"])
                this.countryCode = this.data[0].country_code;
            });
        },
    
        openScanWizard() {
            this.dialog.add(BillQrScan);
        },

    }
}

patch(AccountMoveUploadKanbanController.prototype, qrBillScannerController());
patch(AccountMoveListController.prototype, qrBillScannerController());
