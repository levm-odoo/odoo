odoo.define('pos_restaurant.SplitBillScreen', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const { useState, onMounted } = owl.hooks;
    const { useListener } = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');

    class SplitBillScreen extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click-line', this.onClickLine);
            this.splitlines = useState(this._initSplitLines(this.env.pos.get_order()));
            this.newOrderLines = {};
            this.newOrder = undefined;
            this._isFinal = false;
            onMounted(() => {
                // Should create the new order outside of the constructor because
                // sequence_number of pos_session is modified. which will trigger
                // rerendering which will rerender this screen and will be infinite loop.
                const ExtenderOrder = Registries.PosModelRegistry.get(models.Order);
                this.newOrder = new ExtenderOrder(
                    {},
                    {
                        pos: this.env.pos,
                        temporary: true,
                    }
                );
                this.render();
            });
        }
        get currentOrder() {
            return this.env.pos.get_order();
        }
        get orderlines() {
            return this.currentOrder.get_orderlines();
        }
        onClickLine(event) {
            const line = event.detail;
            this._splitQuantity(line);
            this._updateNewOrder(line);
        }
        back() {
            this.showScreen('ProductScreen');
        }
        proceed() {
            if (_.isEmpty(this.splitlines))
                // Splitlines is empty
                return;

            this._isFinal = true;
            delete this.newOrder.temporary;

            if (!this._isFullPayOrder()) {
                this._setQuantityOnCurrentOrder();

                this.newOrder.set_screen_data({ name: 'PaymentScreen' });

                // for the kitchen printer we assume that everything
                // has already been sent to the kitchen before splitting
                // the bill. So we save all changes both for the old
                // order and for the new one. This is not entirely correct
                // but avoids flooding the kitchen with unnecessary orders.
                // Not sure what to do in this case.

                if (this.newOrder.saveChanges) {
                    this.currentOrder.saveChanges();
                    this.newOrder.saveChanges();
                }

                this.newOrder.set_customer_count(1);
                const newCustomerCount = this.currentOrder.get_customer_count() - 1;
                this.currentOrder.set_customer_count(newCustomerCount || 1);
                this.currentOrder.set_screen_data({ name: 'ProductScreen' });

                this.env.pos.orders.add(this.newOrder);
                this.env.pos.selectedOrder = this.newOrder;
            }
            this.showScreen('PaymentScreen');
        }
        /**
         * @param {models.Order} order
         * @returns {Object<{ quantity: number }>} splitlines
         */
        _initSplitLines(order) {
            const splitlines = {};
            for (let line of order.get_orderlines()) {
                splitlines[line.id] = { product: line.get_product().id, quantity: 0 };
            }
            return splitlines;
        }
        _splitQuantity(line) {
            const split = this.splitlines[line.id];

            let totalQuantity = 0;

            this.env.pos.get_order().get_orderlines().forEach(function(orderLine) {
                if(orderLine.get_product().id === split.product)
                    totalQuantity += orderLine.get_quantity();
            });

            if(line.get_quantity() > 0) {
                if (!line.get_unit().is_pos_groupable) {
                    if (split.quantity !== line.get_quantity()) {
                        split.quantity = line.get_quantity();
                    } else {
                        split.quantity = 0;
                    }
                } else {
                    if (split.quantity < totalQuantity) {
                        split.quantity += line.get_unit().is_pos_groupable? 1: line.get_unit().rounding;
                        if (split.quantity > line.get_quantity()) {
                            split.quantity = line.get_quantity();
                        }
                    } else {
                        split.quantity = 0;
                    }
                }
            }
        }
        _updateNewOrder(line) {
            const split = this.splitlines[line.id];
            let orderline = this.newOrderLines[line.id];
            if (split.quantity) {
                if (!orderline) {
                    orderline = line.clone();
                    this.newOrder.add_orderline(orderline);
                    this.newOrderLines[line.id] = orderline;
                }
                orderline.set_quantity(split.quantity, 'do not recompute unit price');
            } else if (orderline) {
                this.newOrder.remove_orderline(orderline);
                this.newOrderLines[line.id] = null;
            }
        }
        _isFullPayOrder() {
            let order = this.env.pos.get_order();
            let full = true;
            let splitlines = this.splitlines;
            let groupedLines = _.groupBy(order.get_orderlines(), line => line.get_product().id);

            Object.keys(groupedLines).forEach(function (lineId) {
                var maxQuantity = groupedLines[lineId].reduce(((quantity, line) => quantity + line.get_quantity()), 0);
                Object.keys(splitlines).forEach(id => {
                    let split = splitlines[id];
                    if(split.product === groupedLines[lineId][0].get_product().id)
                        maxQuantity -= split.quantity;
                });
                if(maxQuantity !== 0)
                    full = false;
            });

            return full;
        }
        _setQuantityOnCurrentOrder() {
            let order = this.env.pos.get_order();
            for (var id in this.splitlines) {
                var split = this.splitlines[id];
                var line = this.currentOrder.get_orderline(parseInt(id));

                if(!this.props.disallow) {
                    line.set_quantity(
                        line.get_quantity() - split.quantity,
                        'do not recompute unit price'
                    );
                    if (Math.abs(line.get_quantity()) < 0.00001) {
                        this.currentOrder.remove_orderline(line);
                    }
                } else {
                    if(split.quantity) {
                        let decreaseLine = line.clone();
                        decreaseLine.order = order;
                        decreaseLine.noDecrease = true;
                        decreaseLine.set_quantity(-split.quantity);
                        order.add_orderline(decreaseLine);
                    }
                }
            }
        }
    }
    SplitBillScreen.template = 'SplitBillScreen';

    Registries.Component.add(SplitBillScreen);

    return SplitBillScreen;
});
