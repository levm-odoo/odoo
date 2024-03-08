import { Reactive } from "@web/core/utils/reactive";
import { ConnectionLostError, RPCError, rpc } from "@web/core/network/rpc";
import { _t } from "@web/core/l10n/translation";
import { formatCurrency as webFormatCurrency } from "@web/core/currency";
import { attributeFormatter } from "@pos_self_order/app/utils";
import { useState, markup } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { registry } from "@web/core/registry";
import { cookie } from "@web/core/browser/cookie";
import { formatDateTime } from "@web/core/l10n/dates";
import { printerService } from "@point_of_sale/app/printer/printer_service";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { HWPrinter } from "@point_of_sale/app/printer/hw_printer";
import { renderToElement } from "@web/core/utils/render";
import { TimeoutPopup } from "@pos_self_order/app/components/timeout_popup/timeout_popup";
import { getOnNotified, constructFullProductName, deduceUrl } from "@point_of_sale/utils";
import { computeComboLines } from "@point_of_sale/app/models/utils/compute_combo_lines";
import {
    getTaxesAfterFiscalPosition,
    getTaxesValues,
} from "@point_of_sale/app/models/utils/tax_utils";
import { categorySorter } from "./utils";

export class SelfOrder extends Reactive {
    constructor(...args) {
        super();
        this.ready = this.setup(...args).then(() => this);
    }

    async setup(
        env,
        { notification, router, printer, renderer, barcode, bus_service, dialog, pos_data }
    ) {
        // services
        this.notification = notification;
        this.router = router;
        this.data = pos_data;
        this.env = env;
        this.printer = printer;
        this.renderer = renderer;
        this.barcode = barcode;
        this.bus = bus_service;
        this.dialog = dialog;

        // data
        this.models = this.data.models;
        this.session = this.models["pos.session"].getFirst();
        this.config = this.models["pos.config"].getFirst();
        this.company = this.models["res.company"].getFirst();
        this.currency = this.models["res.currency"].getFirst();

        this.markupDescriptions();
        this.access_token = this.config.access_token;
        this.lastEditedProductId = null;
        this.currentProduct = 0;
        this.priceLoading = false;
        this.rpcLoading = false;
        this.paymentError = false;
        this.selectedOrderUuid = null;
        this.ordering = false;
        this.orderTakeAwayState = {};
        this.orderSubscribtion = new Set();
        this.kitchenPrinters = [];
        this.productCategories = [];
        this.currentCategory = null;
        this.productByCategIds = {};
        this.availableCategories = [];
        this.categoryList = new Set();

        this.initData();
        if (this.config.self_ordering_mode === "kiosk") {
            this.initKioskData();
        } else {
            await this.initMobileData();
        }

        this.onNotified = getOnNotified(this.bus, this.access_token);
        this.onNotified("PRODUCT_CHANGED", (payload) => {
            this.models.replaceDataByKey("uuid", payload);
        });
        if (this.config.self_ordering_mode === "kiosk") {
            this.onNotified("STATUS", ({ status }) => {
                if (status === "closed") {
                    this.pos_session = [];
                    this.ordering = false;
                } else {
                    // reload to get potential new settings
                    // more easier than RPC for now
                    window.location.reload();
                }
            });
            this.onNotified("PAYMENT_STATUS", ({ payment_result, data }) => {
                if (payment_result === "Success") {
                    this.models.replaceDataByKey("uuid", data);
                    this.router.navigate("payment_success");
                } else {
                    this.paymentError = true;
                }
            });
        }
        barcode.bus.addEventListener("barcode_scanned", (ev) => {
            if (!this.ordering) {
                this.notification.add(_t("We're currently closed"), {
                    type: "danger",
                });
                return;
            }
            const product = this.models["product.product"].filter(
                (p) => p.barcode === ev.detail.barcode
            )?.[0];
            if (!product) {
                this.notification.add(_t("Product not found"), {
                    type: "danger",
                });
                return;
            }
            if (!product.self_order_available) {
                this.notification.add(_t("Product is not available"), {
                    type: "danger",
                });
                return;
            }
            if (product.attributes.length) {
                this.router.navigate("product", { id: product.id });
                return;
            }
            this.addToCart(product, 1, "", {}, {});
            this.router.navigate("cart");
        });
    }

    subscribeToOrderChannel(order) {
        if (!order.access_token || this.orderSubscribtion.has(order.access_token)) {
            return;
        }

        const handleMessage = (data) => {
            let message = "";
            this.models.replaceDataByKey("uuid", data);
            const oUpdated = data["pos.order"].find((o) => o.uuid === this.selectedOrderUuid);

            if (["paid", "invoiced", "done"].includes(oUpdated?.state)) {
                message = _t("Your order has been paid");
            } else if (oUpdated?.state === "cancel") {
                message = _t("Your order has been cancelled");
            } else if (oUpdated) {
                message = _t("Your order has been updated");
            }

            if (message) {
                this.notification.add(message, {
                    type: "success",
                });
            }

            if (["paid", "invoiced", "done"].includes(oUpdated?.state)) {
                this.selectedOrderUuid = null;
                this.router.navigate("default");
            }
        };

        this.orderSubscribtion.add(order.access_token);
        const onNotified = getOnNotified(this.bus, order.access_token);
        onNotified("ORDER_STATE_CHANGED", (data) => {
            handleMessage(data);
        });
        onNotified("ORDER_CHANGED", (data) => {
            handleMessage(data);
        });
    }

    computeAvailableCategories() {
        let now = luxon.DateTime.now();
        now = now.hour + now.minute / 60;
        const prodByCategIds = this.productByCategIds;
        const availableCategories = this.productCategories
            .sort((a, b) => a.sequence - b.sequence)
            .filter((c) => prodByCategIds[c.id])
            .sort((a, b) => categorySorter(a, b, this.config.iface_start_categ_id));

        this.categoryList = new Set(availableCategories);
        this.availableCategories = availableCategories.filter((c) => {
            return now > c.hour_after && now < c.hour_until;
        });

        this.currentCategory =
            this.models["pos.category"].length > 0 ? [...this.categoryList][0] : null;
    }

    isCategoryAvailable(categId) {
        return this.availableCategories.find((c) => c.id === categId);
    }

    removeLine(line) {
        this.currentOrder.removeOrderline(line);
    }

    async addToCart(
        product,
        qty,
        customer_note,
        selectedValues = {},
        customValues = {},
        comboValues = {}
    ) {
        const values = {
            order_id: this.currentOrder,
            product_id: product,
            tax_ids: product.taxes_id[0] ? [["link", product.taxes_id[0]]] : [],
            qty: qty,
            note: customer_note || "",
            price_unit: product.lst_price,
            price_extra: 0,
        };

        if (Object.entries(selectedValues).length > 0) {
            values.attribute_value_ids = Object.values(selectedValues).map((a) => {
                const attrVal = this.models["product.template.attribute.value"].get(a);
                values.price_extra += attrVal.price_extra;
                return ["link", attrVal];
            });

            if (Object.values(customValues).length > 0) {
                values.custom_attribute_value_ids = Object.values(customValues)
                    .filter((c) => c.custom_value !== "")
                    .map((c) => ["create", c]);
            }
        }

        if (Object.entries(comboValues).length > 0) {
            const comboPrices = computeComboLines(
                product,
                comboValues,
                this.currentOrder.pricelist_id,
                this.models["decimal.precision"].getAll(),
                this.models["product.template.attribute.value"].getAllBy("id")
            );

            values.price_unit = 0;
            values.combo_id = ["link", product.combo_id];
            values.combo_line_ids = comboPrices.map((comboLine) => [
                "create",
                {
                    product_id: comboLine.combo_line_id.product_id,
                    tax_ids: comboLine.combo_line_id.product_id.taxes_id[0]
                        ? [["link", comboLine.combo_line_id.product_id.taxes_id[0]]]
                        : [],
                    combo_line_id: comboLine.combo_line_id,
                    price_unit: comboLine.price_unit,
                    order_id: this.currentOrder,
                    qty: 1,
                    attribute_value_ids: comboLine.attribute_value_ids?.map((attr) => [
                        "link",
                        attr,
                    ]),
                    custom_attribute_value_ids: Object.entries(
                        comboLine.attribute_custom_values
                    ).map(([id, cus]) => {
                        return ["create", cus];
                    }),
                },
            ]);
        }

        if (values.price_extra > 0) {
            const price = values.product_id.get_price(
                this.currentOrder.pricelist_id,
                values.qty,
                values.price_extra
            );

            values.price_unit = price;
        }

        const newLine = this.models["pos.order.line"].create(values);
        newLine.full_product_name = constructFullProductName(
            newLine,
            this.models["product.template.attribute.value"].getAllBy("id"),
            product.name
        );

        const lineToMerge = this.currentOrder.lines.find(
            (l) => l.can_be_merged_with(newLine) && l.id !== newLine.id
        );

        if (lineToMerge) {
            lineToMerge.qty += newLine.qty;
            newLine.delete();
        }
    }
    async confirmationPage(screen_mode, device, access_token = "") {
        this.router.navigate("confirmation", {
            orderAccessToken: access_token || this.currentOrder.access_token,
            screenMode: screen_mode,
        });
        if (device === "kiosk") {
            this.printKioskChanges();
        }
    }

    filterPaymentMethods(pms) {
        //based on _load_pos_self_data_domain from pos_payment_method.py
        return this.config.self_ordering_mode === "kiosk"
            ? pms.filter((rec) => ["adyen", "stripe"].includes(rec.use_payment_terminal))
            : [];
    }

    async confirmOrder() {
        const payAfter = this.config.self_ordering_pay_after; // each, meal
        const device = this.config.self_ordering_mode; // kiosk, mobile
        const service = this.config.self_ordering_service_mode; // table, counter
        const paymentMethods = this.filterPaymentMethods(
            this.models["pos.payment.method"].getAll()
        ); // Stripe, Adyen, Online
        const order = this.currentOrder;

        // Stand number page will recall this function after the stand number is set
        if (
            service === "table" &&
            !order.takeaway &&
            device === "kiosk" &&
            !order.table_stand_number
        ) {
            this.router.navigate("stand_number");
            return;
        }

        // if the amount is 0, we don't need to go to the payment page
        // this directive works for both mode each and meal
        if (order.amount_total === 0 && order.lines.length > 0) {
<<<<<<< HEAD
            await this.sendDraftOrderToServer();
            this.router.navigate("default");
||||||| parent of a285506fd7fd (temp)
            await this.sendDraftOrderToServer();
            this.confirmationPage("order", device);
=======
            const order = await this.sendDraftOrderToServer();
            this.confirmationPage("order", device, order.access_token);
>>>>>>> a285506fd7fd (temp)
            return;
        }

        // When no payment methods redirect to confirmation page
        // the client will be able to pay at counter
        if (paymentMethods.length === 0) {
            let screenMode = "pay";

            if (Object.keys(order.changes).length > 0) {
                await this.sendDraftOrderToServer();
                screenMode = payAfter === "meal" ? "order" : "pay";
            }
            this.confirmationPage(screenMode, device);
        } else {
            // In meal mode, first time the customer validate his order, we send it to the server
            // and we redirect him to the confirmation page, the next time he validate his order
            // if the order is already saved on the server, we redirect him to the payment page
            // In each mode, we redirect the customer to the payment page directly
            if (payAfter === "meal" && Object.keys(order.changes).length > 0) {
                await this.sendDraftOrderToServer();
                this.confirmationPage("order", device);
            } else {
                this.router.navigate("payment");
            }
        }
    }

    get currentOrder() {
<<<<<<< HEAD
        const orderAvailable = (o) => {
            const isDraft = o.state === "draft";
            const isPaid = o.state === "paid";
            const isZeroAmount = o.amount_total === 0;
            const isKiosk = this.config.self_ordering_mode === "kiosk";
||||||| parent of a285506fd7fd (temp)
        if (
            this.editedOrder &&
            (this.editedOrder.state === "draft" ||
                (this.editedOrder.state === "paid" &&
                    this.editedOrder.amount_total === 0 &&
                    this.config.self_ordering_mode === "kiosk"))
        ) {
            return this.editedOrder;
        }
        const existingOrder = this.orders.find(
            (o) =>
                o.state === "draft" ||
                (o.state === "paid" &&
                    o.amount_total === 0 &&
                    this.config.self_ordering_mode === "kiosk")
        );
        if (!existingOrder) {
            const newOrder = new Order({
                pos_config_id: this.pos_config_id,
            });
=======
        if (this.editedOrder && this.editedOrder.state === "draft") {
            return this.editedOrder;
        }
        const existingOrder = this.orders.find(
            (o) =>
                o.state === "draft" ||
                (o.state === "paid" &&
                    o.amount_total === 0 &&
                    this.config.self_ordering_mode === "kiosk")
        );
        if (!existingOrder) {
            const newOrder = new Order({
                pos_config_id: this.pos_config_id,
            });
>>>>>>> a285506fd7fd (temp)

            return isDraft || (isPaid && isZeroAmount && isKiosk);
        };

        const order = this.models["pos.order"].getBy("uuid", this.selectedOrderUuid);
        if (order && orderAvailable(order)) {
            return order;
        }

        const existingOrder = this.models["pos.order"].find((o) => orderAvailable(o));
        if (existingOrder) {
            this.selectedOrderUuid = existingOrder.uuid;
            return existingOrder;
        }

        const fiscalPosition = this.models["account.fiscal.position"].find((fp) => {
            return fp.id === this.config.default_fiscal_position_id?.id;
        });

        const newOrder = this.models["pos.order"].create({
            company_id: this.company,
            session_id: this.session,
            config_id: this.config,
            fiscal_position_id: fiscalPosition,
        });
        this.selectedOrderUuid = newOrder.uuid;

        return this.models["pos.order"].getBy("uuid", this.selectedOrderUuid);
    }

    markupDescriptions() {
        for (const product of this.models["product.product"].getAll()) {
            product.description_self_order = product.description_self_order
                ? markup(product.description_self_order)
                : "";
        }
    }

    initData() {
        this.productCategories = this.models["pos.category"].getAll();
        this.productByCategIds = this.models["product.product"].getAllBy("pos_categ_ids");
        const productWoCat = this.models["product.product"].filter(
            (p) => p.pos_categ_ids.length === 0
        );

        if (productWoCat.length) {
            this.productCategories.push({
                id: 0,
                hour_after: 0,
                hour_until: 24,
                name: _t("Uncategorised"),
            });
            this.productByCategIds["0"] = productWoCat;
        }

        this.currentLanguage = this.config.self_ordering_available_language_ids.find(
            (l) => l.code === cookie.get("frontend_lang")
        );

        if (this.config.self_ordering_default_language_id && !this.currentLanguage) {
            this.currentLanguage = this.config.self_ordering_default_language_id;
        }

        cookie.set("frontend_lang", this.currentLanguage?.code || "en_US");

        for (const printerConfig of this.models["pos.printer"].getAll()) {
            const printer = this.create_printer(printerConfig);
            if (printer) {
                printer.config = printerConfig;
                this.kitchenPrinters.push(printer);
            }
        }
    }

    create_printer(printer) {
        const url = deduceUrl(printer.proxy_ip || "");
        return new HWPrinter({ url });
    }

    _getKioskPrintingCategoriesChanges(categories) {
        return this.currentOrder.lines.filter((orderline) =>
            categories.some((categId) =>
                this.models["product.product"]
                    .get(orderline["product_id"])
                    .pos_categ_ids.map((categ) => categ.id)
                    .includes(categId)
            )
        );
    }

    async printKioskChanges() {
        const d = new Date();
        let hours = "" + d.getHours();
        hours = hours.length < 2 ? "0" + hours : hours;
        let minutes = "" + d.getMinutes();
        minutes = minutes.length < 2 ? "0" + minutes : minutes;
        for (const printer of this.kitchenPrinters) {
            const orderlines = this._getKioskPrintingCategoriesChanges(
                Object.values(printer.config.product_categories_ids)
            );
            if (orderlines) {
                const printingChanges = {
                    new: orderlines,
                    tracker: this.currentOrder.table_stand_number,
                    trackingNumber: this.currentOrder.trackingNumber || "unknown number",
                    name: this.currentOrder.pos_reference || "unknown order",
                    time: {
                        hours,
                        minutes,
                    },
                };
                const receipt = renderToElement("pos_self_order.OrderChangeReceipt", {
                    changes: printingChanges,
                });
                await printer.printReceipt(receipt);
            }
        }
    }

    initKioskData() {
        if (this.session && this.access_token) {
            this.ordering = true;
        }

        this.idleTimout = false;
        window.addEventListener("click", (event) => {
            this.idleTimout && clearTimeout(this.idleTimout);
            this.alertTimeout && clearTimeout(this.alertTimeout);
            this.timeoutPopup?.();
            this.idleTimout = setTimeout(() => {
                if (this.router.activeSlot !== "payment" && this.router.activeSlot !== "default") {
                    this.timeoutPopup = this.dialog.add(TimeoutPopup, {});
                }
            }, 1 * 1000 * 50);
            this.alertTimeout = setTimeout(() => {
                if (this.router.activeSlot !== "payment" && this.router.activeSlot !== "default") {
                    this.router.navigate("default");
                }
            }, 1 * 1000 * 60);
        });
    }

    async initMobileData() {
        if (this.config.self_ordering_mode !== "qr_code") {
            if (
                this.session &&
                this.access_token &&
                this.config.self_ordering_mode !== "consultation"
            ) {
                this.ordering = true;
            }

            if (!this.ordering) {
                return;
            }
        }
    }

    cancelOrder() {
        const lineToDelete = [];
        for (const line of this.currentOrder.lines) {
            const changes = line.changes;

            if (Object.values(changes).some((v) => v)) {
                if (line.qty <= changes.qty) {
                    lineToDelete.push(line);
                } else {
                    line.update({
                        qty: changes["qty"],
                        customer_note: changes["customer_note"],
                        attribute_value_ids: changes["attribute_value_ids"]
                            ? JSON.parse(changes["attribute_value_ids"]).map((a) => [
                                  "link",
                                  this.models["product.template.attribute.value"].get(a),
                              ])
                            : [],
                        custom_attribute_value_ids: changes["custom_attribute_value_ids"]
                            ? JSON.parse(changes["custom_attribute_value_ids"]).map((a) => [
                                  "link",
                                  this.models["product.attribute.custom.value"].get(a),
                              ])
                            : [],
                    });
                }
            }
        }

        for (const line of lineToDelete) {
            line.delete();
        }

        this.currentOrder.recomputeChanges();
        if (Math.max(this.currentOrder.lines.map((l) => l.qty)) <= 0) {
            this.router.navigate("default");
            this.currentOrder.delete();
            this.selectedOrderUuid = null;
        }
    }

    async sendDraftOrderToServer() {
        if (
            Object.keys(this.currentOrder.changes).length === 0 ||
            this.currentOrder.lines.length === 0
        ) {
            return this.currentOrder;
        }

        try {
<<<<<<< HEAD
            const data = await rpc(
                `/pos-self-order/process-order/${this.config.self_ordering_mode}`,
                {
                    order: this.currentOrder.serialize({ orm: true }),
                    access_token: this.access_token,
                    table_identifier: this.currentOrder?.table_id?.identifier || false,
                }
            );
            this.models.replaceDataByKey("uuid", data);
            for (const order of data["pos.order"]) {
                this.subscribeToOrderChannel(order);
||||||| parent of a285506fd7fd (temp)
            const rpcUrl = this.currentOrder.isAlreadySent
                ? "/pos-self-order/update-existing-order"
                : `/pos-self-order/process-new-order/${this.config.self_ordering_mode}`;

            const order = await rpc(rpcUrl, {
                order: this.currentOrder,
                access_token: this.access_token,
                table_identifier: this.table ? this.table.identifier : null,
            });

            this.editedOrder.access_token = order.access_token;
            this.updateOrdersFromServer([order], [order.access_token]);
            this.editedOrder.updateLastChanges();

            if (this.config.self_ordering_pay_after === "each") {
                this.editedOrder = null;
=======
            const rpcUrl = this.currentOrder.isAlreadySent
                ? "/pos-self-order/update-existing-order"
                : `/pos-self-order/process-new-order/${this.config.self_ordering_mode}`;

            const order = await rpc(rpcUrl, {
                order: this.currentOrder,
                access_token: this.access_token,
                table_identifier: this.table ? this.table.identifier : null,
            });

            this.editedOrder.access_token = order.access_token;
            this.updateOrdersFromServer([order], [order.access_token]);
            this.editedOrder.updateLastChanges();

            if (this.config.self_ordering_pay_after === "each" && order.amount_total > 0) {
                this.editedOrder = null;
>>>>>>> a285506fd7fd (temp)
            }

            if (this.config.self_ordering_pay_after === "each") {
                this.selectedOrderUuid = null;
            }

            this.currentOrder.recomputeChanges();
            return this.currentOrder;
        } catch (error) {
            const order = this.models["pos.order"].getBy("uuid", this.selectedOrderUuid);
            this.handleErrorNotification(error, [order.access_token]);
            return false;
        }
    }

    async getOrdersFromServer() {
        const accessTokens = this.models["pos.order"]
            .map((order) => order.access_token)
            .filter(Boolean);

        if (accessTokens.length === 0) {
            return;
        }

        try {
            const data = await rpc(`/pos-self-order/get-orders/`, {
                access_token: this.access_token,
                order_access_tokens: accessTokens,
            });
            this.models.replaceDataByKey("uuid", data);
            this.selectedOrderUuid = null;
        } catch (error) {
            this.handleErrorNotification(
                error,
                this.models["pos.order"].map((order) => order.access_token)
            );
        }
    }

    changeOrderState(access_token, state) {
        const order = this.orders.filter((o) => o.access_token === access_token);
        let message = _t("Your order status has been changed");

        if (order.length === 0) {
            this.handleErrorNotification(new Error("Warning, no order with this access_token"));
        } else if (order.length !== 1) {
            this.handleErrorNotification(
                new Error("Warning, two orders with the same access_token")
            );
        } else {
            order[0].state = state;
        }

        if (state === "paid") {
            this.selectedOrderUuid = null;
            message = _t("Your order has been paid");
        } else if (state === "cancel") {
            this.selectedOrderUuid = null;
            message = _t("Your order has been cancelled");
        }

        this.notification.add(message, {
            type: "success",
        });

        if (this.router.activeSlot !== "confirmation") {
            this.router.navigate("default");
        }
    }

    updateOrderFromServer(order) {
        this.currentOrder.updateDataFromServer(order);
    }

    isOrder() {
        if (!this.currentOrder || !this.currentOrder.lines.length) {
            this.router.navigate("default");
        }
    }

    handleErrorNotification(error, accessToken = []) {
        this.rpcLoading = false;

        let message = _t("An error has occurred");
        let cleanOrders = false;

        if (error instanceof RPCError) {
            if (error.data.name === "werkzeug.exceptions.Unauthorized") {
                message = _t("You're not authorized to perform this action");
                cleanOrders = true;
            } else if (error.data.name === "werkzeug.exceptions.NotFound") {
                message = _t("Orders not found on server");
                cleanOrders = true;
            }
        } else if (error instanceof ConnectionLostError) {
            message = _t("Connection lost, please try again later");
        }

        this.notification.add(message, {
            type: "danger",
        });

        if (accessToken && cleanOrders) {
            this.selectedOrderUuid = null;

            for (const index in this.orders) {
                if (accessToken.includes(this.orders[index].access_token)) {
                    this.orders.splice(index, 1);
                }
            }
        }
    }

    formatMonetary(price) {
        return webFormatCurrency(price, this.currency_id);
    }

    verifyCart() {
        let result = true;
        for (const line of this.currentOrder.unsentLines) {
            if (line.combo_parent_uuid) {
                continue;
            }

            const lineChanges = this.currentOrder.uiState.lineChanges[line.uuid];
            const alreadySent = lineChanges
                ? Object.values(this.currentOrder.uiState.lineChanges[line.uuid]).every((v) => !v)
                : false;

            const wrongChild = line.combo_line_ids.find((l) => !l.product_id.self_order_available);
            if (wrongChild || !line.product_id?.self_order_available) {
                if (alreadySent) {
                    line.qty = alreadySent.qty;
                    line.customer_note = alreadySent.customer_note;
                    line.selected_attributes = alreadySent.selected_attributes;
                } else {
                    line.delete();
                }
                this.notification.add(
                    _t(
                        "%s is not available anymore, it has thus been removed from your order. Please review your order and validate it again.",
                        line.full_product_name
                    ),
                    { type: "danger" }
                );
                result = false;
            }
        }

        return result;
    }

    getProductDisplayPrice(product) {
        const pricelist = this.config.pricelist_id;
        const price = product.get_price(pricelist, 1);

        let taxes = product.taxes_id;

        // Fiscal position.
        const order = this.currentOrder;
        if (order && order.fiscal_position_id) {
            taxes = getTaxesAfterFiscalPosition(taxes, order.fiscal_position_id, this.models);
        }

        // Taxes computation.
        const taxesData = getTaxesValues(
            taxes,
            price,
            1,
            product,
            this.config._product_default_values,
            this.company,
            this.currency
        );

        if (this.config.iface_tax_included === "total") {
            return taxesData.total_included;
        } else {
            return taxesData.total_excluded;
        }
    }
    getLinePrice(line) {
        return this.config.iface_tax_included ? line.price_subtotal_incl : line.price_subtotal;
    }
    getSelectedAttributes(line) {
        const attributeValues = line.attribute_value_ids;
        const customAttr = line.custom_attribute_value_ids;
        return attributeFormatter(
            this.models["product.attribute"].getAllBy("id"),
            attributeValues,
            customAttr
        );
    }
    getFullProductName(line) {
        const attrs = this.getSelectedAttributes(line);
        const attrsStr = " (" + attrs.map((a) => a.value).join(", ") + ")";
        return line.full_product_name + (attrs.length ? attrsStr : "");
    }
    showDownloadButton(order) {
        return this.config.self_ordering_mode === "mobile" && order.state === "paid";
    }
    getReceiptHeaderData() {
        // FIXME - We should extract this methods from PoS to be allowed to use it here.
        return {
            company: this.company,
            cashier: "Self-Order",
            header: this.config.receipt_header,
        };
    }
    orderExportForPrinting(order) {
        const headerData = this.getReceiptHeaderData(order);
        const baseUrl = this.session._base_url;
        return order.export_for_printing(baseUrl, headerData);
    }
    async downloadReceipt(order) {
        const link = document.createElement("a");
        const currentDate = formatDateTime(luxon.DateTime.now(), {
            format: "MM_dd_yyyy-HH_mm_ss",
        });
        const companyName = this.company.name.replaceAll(" ", "_");
        link.download = `${companyName}-${currentDate}.png`;
        const png = await this.renderer.toCanvas(
            OrderReceipt,
            {
                data: this.orderExportForPrinting(order),
                formatCurrency: this.formatMonetary,
            },
            {}
        );
        link.href = png.toDataURL().replace("data:image/jpeg;base64,", "");
        link.click();
    }
}

export const selfOrderService = {
    dependencies: [
        "notification",
        "router",
        "pos_data",
        "printer",
        "renderer",
        "barcode",
        "bus_service",
        "dialog",
    ],
    async start(env, services) {
        return new SelfOrder(env, services).ready;
    },
};

registry.category("services").add("printer", printerService);
registry.category("services").add("self_order", selfOrderService);

export function useSelfOrder() {
    return useState(useService("self_order"));
}
