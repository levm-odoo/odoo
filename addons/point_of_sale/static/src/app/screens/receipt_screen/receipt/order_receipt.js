import { Component, markup } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { ReceiptHeader } from "@point_of_sale/app/screens/receipt_screen/receipt/receipt_header/receipt_header";
import { qrCodeSrc } from "@point_of_sale/utils";
import { _t } from "@web/core/l10n/translation";
import { formatCurrency } from "@web/core/currency";

export class OrderReceipt extends Component {
    static template = "point_of_sale.OrderReceipt";
    static components = {
        ReceiptHeader,
    };
    static props = {
        order: { type: Object, optional: true }, // required if not in previewMode
        basic_receipt: { type: Boolean, optional: true },
        previewMode: { type: Boolean, optional: true },
    };

    setup() {
        super.setup();
        this.previewMode = this.props.previewMode;
        if (this.previewMode || !this.props.order) {
            this.loadPreviewData();
        } else {
            this.order = this.props.order;
        }
    }

    get layout() {
        return this.order.config.receipt_layout;
    }

    get isDefaultLayout() {
        return this.layout === "light";
    }

    get header() {
        return {
            company: this.order.company,
            cashier: _t("Served by %s", this.order?.getCashierName()),
            header: this.order.config.receipt_header,
        };
    }

    get qrCode() {
        const baseUrl = this.order.session._base_url;
        return (
            !this.previewMode &&
            this.order.company.point_of_sale_use_ticket_qr_code &&
            this.order.finalized &&
            qrCodeSrc(`${baseUrl}/pos/ticket?order_uuid=${this.order.uuid}`)
        );
    }

    get footerMarkup() {
        return markup(this.order.config.receipt_footer);
    }

    get paymentLines() {
        return this.order.payment_ids.filter((p) => !p.is_change);
    }

    get bgImageUrl() {
        if (this.order.config.receipt_bg === "Demo logo") {
            return `/web/image?model=res.company&id=${this.order.company.id}&field=logo`;
        }
        const bgImage = this.order.config.receipt_bg_image;
        return bgImage ? `data:image/png;base64,${bgImage}` : false;
    }

    formatCurrency(amount) {
        if (this.previewMode) {
            return "$" + Number.parseFloat(amount).toFixed(2);
        }
        return formatCurrency(amount, this.order.currency.id);
    }

    doesAnyOrderlineHaveTaxLabel() {
        return this.order.lines.some((line) => line.taxGroupLabels);
    }

    getPortalURL() {
        return `${this.order.session._base_url}/pos/ticket`;
    }

    get receiptClasses() {
        return {
            table: `table border-dark table-borderless ${
                this.layout === "boxes" && "table-boxes table-bordered"
            }`,
            head: `${this.layout === "lined" && "border-top border-bottom border-dark"}`,
            th: `fw-bolder`,
            td: ``,
            body: ``,
        };
    }
    get headerData() {
        if (this.layout === "lined") {
            return [
                { key: "index", value: "No." },
                { key: "name", value: "Item" },
                { key: "qty", value: "Qty" },
                { key: "unit-price", value: "Price" },
                { key: "total-price", value: "Total" },
            ];
        } else if (this.layout === "boxes") {
            return [
                { key: "index", value: "No." },
                { key: "name", value: "Item" },
                { key: "total-price", value: "Total" },
            ];
        } else {
            return [
                { key: "index", value: "" },
                { key: "name", value: "" },
                { key: "total-price", value: "" },
            ];
        }
    }

    getLineInfo(line, lineIndex) {
        const lineInfo = [];
        lineInfo.push(
            this.isDefaultLayout
                ? { key: "qty", value: line.qty }
                : { key: "index", value: lineIndex + 1 }
        );
        lineInfo.push({
            key: "product-name",
            value: line.getFullProductName(),
            other: this._getOtherLineInfo(line),
        });
        if (this.layout === "lined") {
            lineInfo.push({ key: "qty", value: line.qty });
            lineInfo.push({ key: "unit-price", value: this.formatCurrency(line.unitDisplayPrice) });
        }
        lineInfo.push({ key: "product-price price", value: line.getPriceString() });
        return lineInfo;
    }

    _getOtherLineInfo(line) {
        const info = [];
        if (this.layout === "boxes") {
            info.push({
                key: "qty",
                value: `${line.qty} x ${this.formatCurrency(line.unitDisplayPrice)}`,
            });
        }
        const discount = line.getDiscountStr();
        if (discount) {
            info.push({
                key: "price-per-unit",
                value: markup(
                    `${line.allPrices.priceWithTaxBeforeDiscount} with a <em>${discount}%</em> discount`
                ),
                iclass: "fa-tag",
            });
        }
        if (line.customer_note) {
            info.push({
                key: "customer-note",
                value: line.customer_note,
                iclass: "fa-sticky-note",
            });
        }
        if (line.packLotLines) {
            line.packLotLines.forEach((lotLine) => {
                info.push({ key: "pack-lot-line", value: lotLine });
            });
        }
        return info;
    }

    getReceiptStyle() {
        const style = `font-family: ${this.order.config.receipt_font}; `;
        return style;
    }

    loadPreviewData() {
        const orderLines = [
            {
                sr_no: 1,
                getFullProductName: () => "Pizza Margherita",
                qty: 3,
                unitDisplayPrice: 11.5,
                getPriceString: () => "$34.50",
                getDiscountStr: () => false,
            },
            {
                sr_no: 2,
                getFullProductName: () => "Cheese Burger",
                qty: 5,
                unitDisplayPrice: 13.0,
                getPriceString: () => "$65.00",
                getDiscountStr: () => false,
            },
            {
                sr_no: 4,
                getFullProductName: () => "Apple Pie",
                qty: 1,
                unitDisplayPrice: 75,
                getPriceString: () => "$75.00",
                getDiscountStr: () => false,
            },
        ];
        const configData = {
            ...this.props,
            id: this.props["pos_config_id"],
            basic_receipt: false,
        };
        const taxTotals = {
            has_tax_groups: true,
            same_tax_base: true,
            order_total: "1625.00",
            order_sign: 1,
            subtotals: [
                {
                    name: "Untaxed Amount",
                    base_amount_currency: "1584.80",
                    tax_groups: [
                        {
                            id: 1,
                            group_label: false,
                            group_name: "Tax 5%",
                            base_amount_currency: "1584.80",
                            tax_amount_currency: "32.50",
                        },
                    ],
                },
            ],
        };
        const paymentLines = [
            {
                id: 1,
                is_change: false,
                getAmount: () => "1625.00",
                payment_method_id: {
                    name: "Cash",
                },
            },
        ];
        const companyData = {
            id: 1,
            partner_id: false,
            phone: "+1 555-555-5556",
            email: "info@yourcompany.com",
            website: "http://www.example.com",
            point_of_sale_ticket_portal_url_display_mode: false,
        };
        this.order = {
            getTotalDiscount: () => false,
            totalQuantity: orderLines.reduce((total, ol) => total + ol.qty, 0),
            config: configData,
            company: companyData,
            lines: orderLines,
            taxTotals: taxTotals,
            payment_ids: paymentLines,
            pos_reference: "0001-003-0004",
            formatDateOrTime: () => "04/06/2024 08:30:24",
            getCashierName: () => "Mitchell Admin",
            session: {},
        };
    }
}

registry.category("public_components").add("point_of_sale.OrderReceipt", OrderReceipt);
