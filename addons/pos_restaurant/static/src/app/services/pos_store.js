import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { ConnectionLostError } from "@web/core/network/rpc";
import { _t } from "@web/core/l10n/translation";
import { EditOrderNamePopup } from "@pos_restaurant/app/popup/edit_order_name_popup/edit_order_name_popup";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { TipScreen } from "../screens/tip_screen/tip_screen";
import { SelectionPopup } from "@point_of_sale/app/components/popups/selection_popup/selection_popup";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { customOrderChanges } from "@point_of_sale/app/models/utils/order_change";

patch(PosStore.prototype, {
    /**
     * @override
     */
    async setup() {
        this.isEditMode = false;
        this.tableSyncing = false;
        this.tableSelectorState = false;
        await super.setup(...arguments);
    },
    get idleTimeout() {
        return [
            ...super.idleTimeout,
            {
                timeout: 180000, // 3 minutes
                action: () =>
                    this.config.module_pos_restaurant &&
                    this.mainScreen.component.name !== "PaymentScreen" &&
                    this.showScreen("FloorScreen"),
            },
        ];
    },
    get firstScreen() {
        const screen = super.firstScreen;

        if (!this.config.module_pos_restaurant) {
            return screen;
        }

        return screen === "LoginScreen" ? "LoginScreen" : this.defaultScreen;
    },
    get defaultScreen() {
        if (this.config.module_pos_restaurant) {
            const screens = {
                register: "ProductScreen",
                tables: "FloorScreen",
            };
            return screens[this.config.default_screen];
        }
        return super.defaultScreen;
    },
    async onDeleteOrder(order) {
        const orderIsDeleted = await super.onDeleteOrder(...arguments);
        if (
            orderIsDeleted &&
            this.config.module_pos_restaurant &&
            this.mainScreen.component.name !== "TicketScreen"
        ) {
            this.showScreen("FloorScreen");
        }
    },
    async wsSyncTableCount(data) {
        if (data.login_number == this.session.login_number) {
            this.computeTableCount(data);
            return;
        }

        const missingTable = data["table_ids"].find(
            (tableId) => !(tableId in this.models["restaurant.table"].getAllBy("id"))
        );
        if (missingTable) {
            const response = await this.data.searchRead("restaurant.floor", [
                ["pos_config_ids", "in", this.config.id],
            ]);

            const table_ids = response.map((floor) => floor.raw.table_ids).flat();
            await this.data.read("restaurant.table", table_ids);
        }
        const tableLocalOrders = this.models["pos.order"].filter(
            (o) => data["table_ids"].includes(o.table_id?.id) && !o.finalized
        );
        const localOrderlines = tableLocalOrders
            .filter((o) => typeof o.id === "number")
            .flatMap((o) => o.lines)
            .filter((l) => typeof l.id !== "number");
        const lineIdByOrderId = localOrderlines.reduce((acc, curr) => {
            if (!acc[curr.order_id.id]) {
                acc[curr.order_id.id] = [];
            }
            acc[curr.order_id.id].push(curr.id);
            return acc;
        }, {});

        const orders = await this.data.searchRead("pos.order", [
            ["session_id", "=", this.session.id],
            ["table_id", "in", data["table_ids"]],
        ]);
        await this.data.read(
            "pos.order.line",
            orders.flatMap((o) => o.lines).map((l) => l.id),
            ["qty"]
        );
        for (const [orderId, lineIds] of Object.entries(lineIdByOrderId)) {
            const lines = this.models["pos.order.line"].readMany(lineIds);
            for (const line of lines) {
                line.update({ order_id: orderId });
            }
        }

        let isDraftOrder = false;
        for (const order of orders) {
            if (order.state !== "draft") {
                this.removePendingOrder(order);
                continue;
            } else {
                this.addPendingOrder([order.id]);
            }

            const tableId = order.table_id?.id;
            if (!tableId) {
                continue;
            }

            const draftOrder = this.models["pos.order"].find(
                (o) => o.table_id?.id === tableId && o.id !== order.id && o.state === "draft"
            );

            if (!draftOrder) {
                continue;
            }

            for (const orphanLine of draftOrder.lines) {
                const adoptingLine = order.lines.find((l) => l.canBeMergedWith(orphanLine));
                if (adoptingLine && adoptingLine.id !== orphanLine.id) {
                    adoptingLine.merge(orphanLine);
                } else if (!adoptingLine) {
                    orphanLine.update({ order_id: order });
                }
            }

            if (this.selectedOrderUuid === draftOrder.uuid) {
                this.selectedOrderUuid = order.uuid;
            }

            await this.removeOrder(draftOrder, true);
            isDraftOrder = true;
        }

        if (
            this.getOrder()?.finalized &&
            ![ReceiptScreen, TipScreen].includes([this.mainScreen.component])
        ) {
            this.addNewOrder();
        }

        if (isDraftOrder) {
            await this.syncAllOrders();
        }

        this.computeTableCount(data);
    },
    computeTableCount(data) {
        const tableIds = data?.table_ids;
        const tables = tableIds
            ? this.models["restaurant.table"].readMany(tableIds)
            : this.models["restaurant.table"].getAll();
        const orders = this.getOpenOrders();
        for (const table of tables) {
            const tableOrders = orders.filter(
                (order) => order.table_id?.id === table.id && !order.finalized
            );
            const qtyChange = tableOrders.reduce(
                (acc, order) => {
                    const quantityChange = this.getOrderChanges(false, order);
                    const quantitySkipped = this.getOrderChanges(true, order);
                    acc.changed += quantityChange.count;
                    acc.skipped += quantitySkipped.count;
                    return acc;
                },
                { changed: 0, skipped: 0 }
            );

            table.uiState.orderCount = tableOrders.length;
            table.uiState.changeCount = qtyChange.changed;
        }
    },
    get categoryCount() {
        const orderChanges = this.getOrderChanges();
        const linesChanges = orderChanges.orderlines;

        const categories = Object.values(linesChanges).reduce((acc, curr) => {
            const categories =
                this.models["product.product"].get(curr.product_id)?.product_tmpl_id
                    ?.pos_categ_ids || [];

            for (const category of categories.slice(0, 1)) {
                if (!acc[category.id]) {
                    acc[category.id] = {
                        count: curr.quantity,
                        name: category.name,
                    };
                } else {
                    acc[category.id].count += curr.quantity;
                }
            }

            return acc;
        }, {});
        const noteCount = ["general_customer_note", "internal_note"].reduce(
            (count, note) => count + (note in orderChanges ? 1 : 0),
            0
        );

        const nbNoteChange = Object.keys(orderChanges.noteUpdate).length;
        if (nbNoteChange) {
            categories["noteUpdate"] = { count: nbNoteChange, name: _t("Note") };
        }
        // Only send modeUpdate if there's already an older mode in progress.
        const currentOrder = this.getOrder();
        if (
            orderChanges.modeUpdate &&
            Object.keys(currentOrder.last_order_preparation_change.lines).length
        ) {
            const displayName = _t(currentOrder.preset_id?.name);
            categories["modeUpdate"] = { count: 1, name: displayName };
        }

        return [
            ...Object.values(categories),
            ...(noteCount > 0 ? [{ count: noteCount, name: _t("Message") }] : []),
        ];
    },
    get selectedTable() {
        return this.getOrder()?.table_id;
    },
    showScreen(screenName, props = {}, newOrder = false) {
        const order = this.getOrder();
        if (
            this.config.module_pos_restaurant &&
            this.mainScreen.component === ProductScreen &&
            order &&
            !order.isBooked
        ) {
            this.removeOrder(order);
        }
        super.showScreen(...arguments);
    },
    closeScreen() {
        if (this.config.module_pos_restaurant && !this.getOrder()) {
            return this.showScreen("FloorScreen");
        }
        return super.closeScreen(...arguments);
    },
    showDefault() {
        this.showScreen(this.defaultScreen, {}, this.defaultScreen == "ProductScreen");
    },
    addOrderIfEmpty(forceEmpty) {
        if (!this.config.module_pos_restaurant || forceEmpty) {
            return super.addOrderIfEmpty(...arguments);
        }
    },
    //@override
    async afterProcessServerData() {
        this.floorPlanStyle =
            localStorage.getItem("floorPlanStyle") || (this.ui.isSmall ? "kanban" : "default");
        if (this.config.module_pos_restaurant) {
            this.currentFloor = this.config.floor_ids?.length > 0 ? this.config.floor_ids[0] : null;
            this.bus.subscribe("SYNC_ORDERS", this.wsSyncTableCount.bind(this));
        }

        return await super.afterProcessServerData(...arguments);
    },
    //@override
    addNewOrder(data = {}) {
        const order = super.addNewOrder(...arguments);
        this.addPendingOrder([order.id]);
        return order;
    },
    createOrderIfNeeded(data) {
        if (this.config.module_pos_restaurant && !data["table_id"]) {
            let order = this.models["pos.order"].find((order) => order.isDirectSale);
            if (!order) {
                order = this.createNewOrder(data);
            }
            return order;
        }
        return super.createOrderIfNeeded(...arguments);
    },
    getSyncAllOrdersContext(orders, options = {}) {
        const context = super.getSyncAllOrdersContext(...arguments);
        context["cancel_table_notification"] = options["cancel_table_notification"] || false;
        if (this.config.module_pos_restaurant && this.selectedTable) {
            context["table_ids"] = [this.selectedTable.id];
            context["force"] = true;
        }
        return context;
    },
    async addLineToCurrentOrder(vals, opts = {}, configure = true) {
        let currentCourse;
        if (this.config.module_pos_restaurant) {
            const order = this.getOrder();
            if (!order.uiState.booked) {
                order.setBooked(true);
            }
            if (order.hasCourses()) {
                let course = order.getSelectedCourse();
                if (!course) {
                    course = order.getLastCourse();
                }
                currentCourse = course;
                order.selectCourse(course);
                vals = { ...vals, course_id: course };
            }
        }
        const result = await super.addLineToCurrentOrder(vals, opts, configure);

        if (currentCourse && result.combo_line_ids) {
            result.combo_line_ids.forEach((line) => {
                line.course_id = currentCourse;
            });
        }

        if (currentCourse) {
            this.getOrder().cleanUpCourses(currentCourse.uuid);
        }
        return result;
    },
    async getServerOrders() {
        if (this.config.module_pos_restaurant) {
            const tableIds = [].concat(
                ...this.models["restaurant.floor"].map((floor) =>
                    floor.table_ids.map((table) => table.id)
                )
            );
            await this.syncAllOrders({ table_ids: tableIds });
        }
        //Need product details from backand to UI for urbanpiper
        return await super.getServerOrders();
    },
    getDefaultSearchDetails() {
        if (this.config.module_pos_restaurant) {
            return {
                fieldName: "REFERENCE",
                searchTerm: "",
            };
        }
        return super.getDefaultSearchDetails();
    },
    async setTable(table, orderUuid = null) {
        this.loadingOrderState = true;

        let currentOrder = table
            .getOrders()
            .find((order) => (orderUuid ? order.uuid === orderUuid : !order.finalized));

        if (currentOrder) {
            this.setOrder(currentOrder);
        } else {
            const potentialsOrders = this.models["pos.order"].filter(
                (o) => !o.table_id && !o.finalized && o.lines.length === 0
            );

            if (potentialsOrders.length) {
                currentOrder = potentialsOrders[0];
                currentOrder.update({ table_id: table });
                this.selectedOrderUuid = currentOrder.uuid;
            } else {
                this.addNewOrder({ table_id: table });
            }
        }
        try {
            this.loadingOrderState = true;
            const orders = await this.syncAllOrders({ throw: true });
            const orderUuids = orders.map((order) => order.uuid);
            for (const order of table.getOrders()) {
                if (
                    !orderUuids.includes(order.uuid) &&
                    typeof order.id === "number" &&
                    order.uiState.screen_data?.value?.name !== "TipScreen"
                ) {
                    order.delete();
                }
            }
        } finally {
            this.loadingOrderState = false;
        }
    },
    editFloatingOrderName(order) {
        this.dialog.add(EditOrderNamePopup, {
            title: _t("Edit Order Name"),
            placeholder: _t("18:45 John 4P"),
            startingValue: order.floating_order_name || "",
            getPayload: async (newName) => {
                if (typeof order.id == "number") {
                    this.data.write("pos.order", [order.id], {
                        floating_order_name: newName,
                    });
                } else {
                    order.floating_order_name = newName;
                }
            },
        });
    },
    setFloatingOrder(floatingOrder) {
        if (this.getOrder()?.isFilledDirectSale) {
            this.transferOrder(this.getOrder().uuid, null, floatingOrder);
            return;
        }
        this.setOrder(floatingOrder);

        const props = {};
        const screenName = floatingOrder.getScreenData().name;
        if (screenName === "PaymentScreen") {
            props.orderUuid = floatingOrder.uuid;
        }

        this.showScreen(screenName || "ProductScreen", props);
    },
    findTable(tableNumber) {
        const find_table = (t) => t.table_number === parseInt(tableNumber);
        return (
            this.currentFloor?.table_ids.find(find_table) ||
            this.models["restaurant.table"].find(find_table)
        );
    },
    searchOrder(buffer) {
        const table = this.findTable(buffer);
        if (table) {
            this.setTableFromUi(table);
            return true;
        }
        return false;
    },
    async setTableFromUi(table, orderUuid = null) {
        try {
            if (!orderUuid && this.getOrder()?.isFilledDirectSale) {
                this.transferOrder(this.getOrder().uuid, table);
                return;
            }
            this.tableSyncing = true;
            if (table.parent_id) {
                table = table.getParent();
            }
            await this.setTable(table, orderUuid);
        } catch (e) {
            if (!(e instanceof ConnectionLostError)) {
                throw e;
            }
            // Reject error in a separate stack to display the offline popup, but continue the flow
            Promise.reject(e);
        } finally {
            this.tableSyncing = false;
            const orders = this.getTableOrders(table.id);
            if (orders.length > 0) {
                this.setOrder(orders[0]);
                const props = {};
                if (orders[0].getScreenData().name === "PaymentScreen") {
                    props.orderUuid = orders[0].uuid;
                }
                this.showScreen(orders[0].getScreenData().name, props);
            } else {
                this.addNewOrder({ table_id: table });
                this.showScreen("ProductScreen");
            }
        }
    },
    getTableOrders(tableId) {
        return this.getOpenOrders().filter((order) => order.table_id?.id === tableId);
    },
    async unsetTable() {
        try {
            await this.syncAllOrders();
        } catch (e) {
            if (!(e instanceof ConnectionLostError)) {
                throw e;
            }
            Promise.reject(e);
        }
        const order = this.getOrder();
        if (order && !order.isBooked) {
            this.removeOrder(order);
        }
    },
    getActiveOrdersOnTable(table) {
        return this.models["pos.order"].filter(
            (o) => o.table_id?.id === table.id && !o.finalized && o.lines.length
        );
    },
    tableHasOrders(table) {
        return Boolean(table.getOrder());
    },
    getTableFromElement(el) {
        return this.models["restaurant.table"].get(
            [...el.classList].find((c) => c.includes("tableId")).split("-")[1]
        );
    },
    startTransferOrder() {
        this.isOrderTransferMode = true;
        const orderUuid = this.getOrder().uuid;
        this.getOrder().setBooked(true);
        this.showScreen("FloorScreen");
        document.addEventListener(
            "click",
            async (ev) => {
                this.isOrderTransferMode = false;
                const tableElement = ev.target.closest(".table");
                if (!tableElement) {
                    return;
                }
                const table = this.getTableFromElement(tableElement);
                await this.transferOrder(orderUuid, table);
                this.setTableFromUi(table);
            },
            { once: true }
        );
    },
    prepareOrderTransfer(order, destinationTable) {
        const originalTable = order.table_id;
        this.loadingOrderState = false;
        this.alert.dismiss();

        if (destinationTable.id === originalTable?.id) {
            this.setOrder(order);
            this.setTable(destinationTable);
            return false;
        }

        if (!this.tableHasOrders(destinationTable)) {
            order.origin_table_id = originalTable?.id;
            order.table_id = destinationTable;
            this.setOrder(order);
            this.addPendingOrder([order.id]);
            return false;
        }
        return true;
    },
    async updateOrderLinesForTableChange(orderDetails, canBeMergedWithLine = false) {
        const { sourceOrder, destinationOrder } = orderDetails;
        const linesToUpdate = [];

        for (const orphanLine of sourceOrder.lines) {
            const adoptingLine = destinationOrder?.lines.find((l) => l.canBeMergedWith(orphanLine));
            if (adoptingLine && canBeMergedWithLine) {
                if (sourceOrder.last_order_preparation_change.lines[orphanLine.preparationKey]) {
                    if (
                        destinationOrder.last_order_preparation_change.lines[
                            adoptingLine.preparationKey
                        ]
                    ) {
                        destinationOrder.last_order_preparation_change.lines[
                            adoptingLine.preparationKey
                        ]["quantity"] +=
                            sourceOrder.last_order_preparation_change.lines[
                                orphanLine.preparationKey
                            ]["quantity"];
                        destinationOrder.last_order_preparation_change.lines[
                            adoptingLine.preparationKey
                        ]["transferredQty"] =
                            sourceOrder.last_order_preparation_change.lines[
                                orphanLine.preparationKey
                            ]["quantity"];
                    } else {
                        destinationOrder.last_order_preparation_change.lines[
                            adoptingLine.preparationKey
                        ] = {
                            ...sourceOrder.last_order_preparation_change.lines[
                                orphanLine.preparationKey
                            ],
                            uuid: adoptingLine.uuid,
                            transferredQty:
                                sourceOrder.last_order_preparation_change.lines[
                                    orphanLine.preparationKey
                                ]["quantity"],
                        };
                    }
                }
                adoptingLine.merge(orphanLine);
            } else {
                if (
                    sourceOrder.last_order_preparation_change.lines[orphanLine.preparationKey] &&
                    !destinationOrder.last_order_preparation_change.lines[orphanLine.preparationKey]
                ) {
                    destinationOrder.last_order_preparation_change.lines[
                        orphanLine.preparationKey
                    ] = sourceOrder.last_order_preparation_change.lines[orphanLine.preparationKey];
                    orphanLine.skip_change = true;
                }
                linesToUpdate.push(orphanLine);
            }
        }

        linesToUpdate.forEach((orderline) => {
            if (!orderline.origin_order_id) {
                orderline.origin_order_id = orderline.order_id.id;
            }
            orderline.order_id = destinationOrder;
        });

        this.setOrder(destinationOrder);
        if (destinationOrder?.id) {
            this.addPendingOrder([destinationOrder.id]);
        }
    },
    async transferOrder(orderUuid, destinationTable = null, destinationOrder = null) {
        if (!destinationTable && !destinationOrder) {
            return;
        }
        const sourceOrder = this.models["pos.order"].getBy("uuid", orderUuid);

        if (destinationTable) {
            if (!this.prepareOrderTransfer(sourceOrder, destinationTable)) {
                return;
            }
            destinationOrder = this.getActiveOrdersOnTable(destinationTable.rootTable)[0];
        }
        await this.updateOrderLinesForTableChange({ sourceOrder, destinationOrder }, true);

        sourceOrder.isTransferedOrder = true;
        await this.deleteOrders([sourceOrder]);
        if (destinationTable) {
            await this.setTable(destinationTable);
        }
    },
    async mergeTableOrders(orderUuid, destinationTable) {
        const sourceOrder = this.models["pos.order"].getBy("uuid", orderUuid);

        if (!this.prepareOrderTransfer(sourceOrder, destinationTable)) {
            return;
        }

        const destinationOrder = this.getActiveOrdersOnTable(destinationTable.rootTable)[0];
        await this.updateOrderLinesForTableChange({ sourceOrder, destinationOrder }, false);
        await this.setTable(destinationTable);
    },
    async restoreOrdersToOriginalTable(orderToExtract, mergedOrder) {
        const orderlines = mergedOrder.lines.filter((line) => line.origin_order_id);
        for (const orderline of orderlines) {
            if (
                orderline?.origin_order_id.id === orderToExtract.id ||
                orderToExtract.table_id.children.length
            ) {
                orderline.order_id = orderToExtract;
                if (orderline?.origin_order_id.id === orderToExtract.id) {
                    if (orderline.skip_change) {
                        orderline.toggleSkipChange();
                    }
                    orderline.origin_order_id = null;
                }
                if (
                    mergedOrder.last_order_preparation_change.lines[orderline.preparationKey] &&
                    !orderToExtract.last_order_preparation_change.lines[orderline.preparationKey]
                ) {
                    orderToExtract.last_order_preparation_change.lines[orderline.preparationKey] =
                        mergedOrder.last_order_preparation_change.lines[orderline.preparationKey];
                    orderline.setHasChange(true);
                    orderline.toggleSkipChange();
                    orderline.uiState.hideSkipChangeClass = true;
                }
                delete mergedOrder.last_order_preparation_change.lines[orderline.preparationKey];
            }
        }

        this.addPendingOrder([orderToExtract.id, mergedOrder.id]);
        await this.setTable(orderToExtract.table_id);
    },
    updateTables(...tables) {
        this.data.call("restaurant.table", "update_tables", [
            tables.map((t) => t.id),
            Object.fromEntries(
                tables.map((t) => [
                    t.id,
                    { ...t.serialize({ orm: true }), parent_id: t.parent_id?.id || false },
                ])
            ),
        ]);
    },
    getCustomerCount(tableId) {
        const tableOrders = this.getTableOrders(tableId).filter((order) => !order.finalized);
        return tableOrders.reduce((count, order) => count + order.getCustomerCount(), 0);
    },
    toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        if (this.isEditMode) {
            this.tableSelectorState = false;
        }
    },
    storeFloorScrollPosition(floorId, position) {
        if (!floorId) {
            return;
        }
        this.floorScrollPositions = this.floorScrollPositions || {};
        this.floorScrollPositions[floorId] = position;
    },
    getFloorScrollPositions(floorId) {
        if (!floorId || !this.floorScrollPositions) {
            return;
        }
        return this.floorScrollPositions[floorId];
    },
    shouldCreatePendingOrder(order) {
        return super.shouldCreatePendingOrder(order) || order.course_ids?.length > 0;
    },
    setOrder(order) {
        order?.ensureCourseSelection();
        super.setOrder(order);
    },
    addCourse() {
        const order = this.getOrder();

        const course = this.data.models["restaurant.order.course"].create({
            order_id: order,
            index: order.getNextCourseIndex(),
        });

        if (order.course_ids.length === 1 && order.lines.length > 0) {
            // Assign order lines to the first course
            order.lines.forEach((line) => (line.course_id = course));
            // Create a second empty course
            this.data.models["restaurant.order.course"].create({
                order_id: order,
                index: order.getNextCourseIndex(),
            });
        }
        order.recomputeOrderData(); // To ensure that courses are stored locally
        order.selectCourse(course);
        return course;
    },
    async sendOrderInPreparationUpdateLastChange(order, cancelled = false) {
        if (!cancelled) {
            const firstCourse = order.getFirstCourse();
            if (firstCourse && !firstCourse.fired) {
                firstCourse.fired = true;
                this.getOrder().deselectCourse();
            }
        }
        return super.sendOrderInPreparationUpdateLastChange(order, cancelled);
    },
    async fireCourse(course) {
        const order = this.getOrder();
        if (!order || !course || course.fired) {
            return false;
        }
        course.fired = true;
        this.addPendingOrder([order.id]);
        order.deselectCourse();
        await this.syncAllOrders();
        course = this.models["restaurant.order.course"].getBy("uuid", course.uuid);
        await this._onCourseFired(course);
        return true;
    },

    async _onCourseFired(course) {
        try {
            const changes = customOrderChanges(
                _t("Course %s fired", "" + course.index),
                course.lines
            );
            await this.printChanges(this.getOrder(), changes, false);
        } catch (e) {
            console.error("Unable to print course", e);
        }
    },

    async transferCourse() {
        const order = this.getOrder();
        if (!order) {
            return;
        }
        const selectedLine = order.getSelectedOrderline();
        const selectedCourse = order.getSelectedCourse()
            ? order.getSelectedCourse()
            : selectedLine.course_id;
        const selectionList = this.getOrder().courses.map((course) => ({
            id: course.id,
            label: course.name,
            isSelected: course.id === selectedCourse?.id,
            item: course,
        }));
        const dialogTitle = selectedLine
            ? _t('Transfer "%s" to:', selectedLine.getFullProductName())
            : _t('Transfer all products of "%s" into:', selectedCourse.name);
        const destCourse = await makeAwaitable(this.dialog, SelectionPopup, {
            title: dialogTitle,
            list: selectionList,
        });
        if (!destCourse) {
            return;
        }
        if (selectedLine) {
            selectedLine.course_id = destCourse.id;
        } else {
            const lines = [...selectedCourse.lines];
            lines.forEach((line) => {
                line.course_id = destCourse.id;
            });
        }
        order.recomputeOrderData();
    },
});
