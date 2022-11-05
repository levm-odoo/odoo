/** @odoo-module **/

import { registerMessagingComponent } from '@mail/utils/messaging_component';

import { Component } from '@odoo/owl';

export class PopoverManager extends Component {

    get popoverManager() {
        return this.props.record;
    }
}

Object.assign(PopoverManager, {
    props: { record: Object },
    template: 'mail.PopoverManager',
});

registerMessagingComponent(PopoverManager);
