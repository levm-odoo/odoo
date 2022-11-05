/** @odoo-module **/

import { registerMessagingComponent } from '@mail/utils/messaging_component';

import { Component } from '@odoo/owl';

export class Dialog extends Component {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {Dialog}
     */
    get dialog() {
        return this.props.record;
    }

}

Object.assign(Dialog, {
    props: { record: Object },
    template: 'mail.Dialog',
});

registerMessagingComponent(Dialog);
