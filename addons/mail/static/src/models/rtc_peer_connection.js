/** @odoo-module **/

import { registerModel } from '@mail/model/model_core';
import { attr, one } from '@mail/model/model_field';

registerModel({
    name: 'RtcPeerConnection',
    identifyingFields: ['rtcSession'],
    lifecycleHooks: {
        _willDelete() {
            this.peerConnection.close();
        }
    },
    fields: {
        /**
         * Contains the browser.RTCPeerConnection instance of this RTC Session.
         * If unset, this RTC Session is not considered as connected
         */
        peerConnection: attr(),
        /**
         * The RTCDataChannel used to send notifications to the peer
         */
        notificationDataChannel: one('RtcDataChannel', {
            inverse: 'rtcPeerConnectionAsNotificationDataChannel',
            isCausal: true,
        }),
        rtcSession: one('RtcSession', {
            inverse: 'rtcPeerConnection',
            readonly: true,
            required: true,
        }),
    },
});
