odoo.define('point_of_sale.ErrorPopup', function(require) {
    'use strict';

    const { Chrome } = require('point_of_sale.chrome');
    const { AbstractAwaitablePopup } = require('point_of_sale.AbstractAwaitablePopup');

    // formerly ErrorPopupWidget
    class ErrorPopup extends AbstractAwaitablePopup {}

    Chrome.addComponents([ErrorPopup]);

    return { ErrorPopup };
});
