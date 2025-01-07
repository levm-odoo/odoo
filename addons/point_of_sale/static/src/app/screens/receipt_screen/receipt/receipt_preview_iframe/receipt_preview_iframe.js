import { registry } from "@web/core/registry";
import { getTemplate } from "@web/core/templates";
import { App, Component, useEffect, useRef } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";

export class ReceiptPreview extends Component {
    static template = "point_of_sale.ReceiptPreview";

    setup() {
        this.iframeRef = useRef("iframeRef");
        this.appConfig = {
            getTemplate,
        };

        useEffect(
            (value) => {
                const initialize = () => {
                    const iframeDoc = this.iframeRef.el.contentDocument;
                    const wrapwrap = iframeDoc.querySelector("#wrapwrap");
                    if (!wrapwrap) {
                        iframeDoc.open();
                        iframeDoc.write(value);
                        iframeDoc.close();
                    } else if (!this.props.record.data["write_date"]) {
                        const props = {
                            ...this.props.record.data,
                            pos_config_id: this.props.record.data["pos_config_id"][0],
                            previewMode: true,
                        };

                        const app = new App(OrderReceipt, {
                            ...this.appConfig,
                            props,
                        });
                        wrapwrap.innerHTML = "";
                        app.mount(wrapwrap);
                    }
                };
                initialize();
                return false;
            },
            () => [this.props.record.data[this.props.name]]
        );
    }
}

export const receiptPreview = {
    component: ReceiptPreview,
    displayName: _t("Wrap raw html within an iframe"),
    supportedTypes: ["text", "html"],
};

registry.category("fields").add("receipt_preview_iframe", receiptPreview);
