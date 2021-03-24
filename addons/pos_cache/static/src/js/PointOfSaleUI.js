odoo.define('pos_cache.PointOfSaleUI', function (require) {
    'use strict';

    const PointOfSaleUI = require('point_of_sale.PointOfSaleUI');
    const session = require('web.session');
    const { Mutex } = require('web.concurrency');
    const { patch } = require('web.utils');

    const backgroundMutex = new Mutex();

    function roundUpDiv(y, x) {
        const remainder = y % x;
        return (y - remainder) / x + (remainder > 0 ? 1 : 0);
    }

    return patch(PointOfSaleUI.prototype, 'pos_cache', {
        async _afterLoadPos() {
            await this._super(...arguments);
            const totalProductsCount = await this._getTotalProductsCount();
            const nRemaining = totalProductsCount - this.env.model.getProducts(0).length;
            if (!(nRemaining > 0)) return;
            const multiple = this.env.model.searchLimit;
            const nLoops = roundUpDiv(nRemaining, multiple);
            for (let i = 1; i <= nLoops; i++) {
                this.env.actionHandler(
                    { name: 'actionLoadProducts', args: [i * multiple, (i + 1) * multiple] },
                    backgroundMutex
                );
            }
            // use different mutex when calling the action so that the ui can be used while loading the remaining products.
            this.env.actionHandler({ name: 'actionNotifyDoneLoadingProducts' }, backgroundMutex);
        },
        async _getTotalProductsCount() {
            return await this.rpc({
                model: 'pos.session',
                method: 'get_total_products_count',
                args: [[odoo.pos_session_id]],
                context: session.user_context,
            });
        },
    });
});
