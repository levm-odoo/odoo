odoo.define('point_of_sale.OfflineErrorPopup', function(require) {
    'use strict';

    const { Chrome } = require('point_of_sale.chrome');
    const { addComponents } = require('point_of_sale.PosComponent');
    const { AbstractAwaitablePopup } = require('point_of_sale.AbstractAwaitablePopup');

    /**
     * This is a special kind of error popup as it introduces
     * an option to not show it again.
     */
    class OfflineErrorPopup extends AbstractAwaitablePopup {
        dontShowAgain() {
            this.constructor.dontShow = true;
            this.cancel();
        }
    }
    OfflineErrorPopup.dontShow = false;
    OfflineErrorPopup.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        title: 'Offline Error',
        body: 'Either the server is inaccessible or browser is not connected online.',
    };

    addComponents(Chrome, [OfflineErrorPopup]);

    return { OfflineErrorPopup };
});
