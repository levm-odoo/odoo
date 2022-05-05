/** @odoo-module **/

import { registerMessagingComponent } from '@mail/utils/messaging_component';

const { Component } = owl;

export class NotificationRequest extends Component {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {NotificationRequestView}
     */
    get notificationRequestView() {
        return this.props.record;
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Handle the response of the user when prompted whether push notifications
     * are granted or denied.
     *
     * @private
     * @param {string} value
     */
    _handleResponseNotificationPermission(value) {
        this.messaging.refreshIsNotificationPermissionDefault();
        if (value !== 'granted') {
            this.env.services['bus_service'].sendNotification({
                message: this.env._t("Odoo will not have the permission to send native notifications on this device."),
                title: this.env._t("Permission denied"),
            });
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClick() {
        const windowNotification = this.messaging.browser.Notification;
        const def = windowNotification && windowNotification.requestPermission();
        if (def) {
            def.then(this._handleResponseNotificationPermission.bind(this));
        }
        if (!this.messaging.device.isSmall) {
            this.messaging.messagingMenu.close();
        }
    }

}

Object.assign(NotificationRequest, {
    props: { record: Object },
    template: 'mail.NotificationRequest',
});

registerMessagingComponent(NotificationRequest);
