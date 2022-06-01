odoo.define('sale.UpdateAllLinesMixin', function (require) {
    'use strict';

    const UpdateAllLinesMixin = {
        _onFieldChanged: function (ev) {
            if (ev && ev.data.changes) {
                const fieldName = Object.keys(ev.data.changes)[0];
                const value = ev.data.changes[fieldName];
                this.trigger_up(this._getUpdateAllLinesAction(), {fieldName: fieldName, value: value, fieldType: this._getFieldType()});
            }
            this._super.apply(this, arguments);
        },
        _getUpdateAllLinesAction: function () {
            return '';
        },
        _getFieldType: function () {
            return 'normal';
        },

    };
    return UpdateAllLinesMixin;
});
