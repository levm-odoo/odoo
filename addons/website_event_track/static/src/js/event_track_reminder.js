import { debounce } from "@web/core/utils/timing";
import publicWidget from "@web/legacy/js/public/public_widget";
import { _t } from "@web/core/l10n/translation";
import { renderToElement } from "@web/core/utils/render";
import { rpc } from "@web/core/network/rpc";
import { Component } from "@odoo/owl";
import { session } from "@web/session";
import { user } from "@web/core/user";

publicWidget.registry.websiteEventTrackReminder = publicWidget.Widget.extend({
    selector: '.o_wetrack_js_reminder',
    events: {
        'click .o_wetrack_js_reminder_bell': '_onReminderToggleClick',
        'click .o_form_button_cancel': '_modalEmailReminderRemove',
        'submit #o_wetrack_email_reminder_form': '_modalEmailReminderSubmit',
        'mouseover i': '_onMouseEventUpdateIcon',
        'mouseout i': '_onMouseEventUpdateIcon'
    },

    /**
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);
        this._onReminderToggleClick = debounce(this._onReminderToggleClick, 500, true);
        this.notification = this.bindService("notification");
        this.orm = this.bindService('orm');
    },

    //--------------------------------------------------------------------------
    // Handlers
    //-------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onReminderToggleClick: function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        var trackLink = ev.target;

        this.opacityManagerElement = this.el.closest('.o_we_agenda_card') ?? this.el;
        this.initialOpacity = this._getInitialOpacity();

        if (this.reminderOn === undefined) {
            this.reminderOn = trackLink.dataset.reminderOn;
        }

        var reminderOnValue = !this.reminderOn;

        var trackId = parseInt(trackLink.dataset.trackId);

        if (reminderOnValue){
            //test toggle reminder
            var self = this;
            rpc('/event/track/toggle_reminder', {
                track_id: trackId,
                set_reminder_on: true,
                save: false
            }).then((result) => {
                if (result.error && result.error === 'ignored') {
                    self.notification.add(_t('Talk already in your Favorites'), {
                        type: 'info',
                        title: _t('Error'),
                    });
                }
                else {
                    self._checkEmailReminder(trackId);
                }
            });
        }
        else {
            this._removeReminder(trackId);
        }
    },

    _addReminder: function (trackId) {
        var self = this;
        rpc('/event/track/toggle_reminder', {
            track_id: trackId,
            set_reminder_on: true,
        }).then((result) => {
            self.reminderOn = true;
            self._updateDisplay();
            Component.env.bus.trigger('open_notification_request', [
                'add_track_to_favorite',
                {
                    title: _t('Allow push notifications?'),
                    body: _t('You have to enable push notifications to get reminders for your favorite tracks.'),
                    delay: 0
                },
            ]);
        });
    },

    _getInitialOpacity: function (){
        return window.getComputedStyle(this.opacityManagerElement).getPropertyValue('opacity');
    },

    _removeReminder: function (trackId) {
        var self = this;
        rpc('/event/track/toggle_reminder', {
            track_id: trackId,
            set_reminder_on: false,
        }).then((result) => {
            self.reminderOn = false;
            self._updateDisplay();
            self.notification.add(_t('Talk removed from your Favorites'), {
                type: 'info',
            });
        });
    },

    _sendEmailReminder: async function (trackId, emailTo) {
         await rpc('/event/send_email_reminder',  {
            track_id: trackId,
            email_to: emailTo
        }).then(async (result) => {
            if (result.success || result.error == 'missing_template'){
                await this._addReminder(trackId);
                this.notification.add(
                    _t(`Track successfully added to your favorites. ${result.error != 'missing_template' ? 'Check your email to add them to your agenda.' : ''}`),
                    {
                        type: 'info',
                        className: 'o_send_email_reminder_success'
                });
            }
            else {
                this.notification.add(result.message, {type: 'danger', title: _t('Error')});
            }
        });
    },

    _modalEmailReminderRemove: function () {
        this.el.querySelector('.o_wetrack_js_modal_email_reminder').remove();
        this.opacityManagerElement.style.opacity = this.initialOpacity;
    },

    _isEmailReminderFormValid: function (data) {
        return data.track_id && !isNaN(data.track_id) && data.email.match(/.+@.+\..*/);
    },

    _modalEmailReminderSubmit: function (ev) {
        ev.preventDefault();
        var data = Object.fromEntries(new FormData(ev.target).entries());
        if (this._isEmailReminderFormValid(data)) {
            sessionStorage.setItem('website_event_track.email_reminder', data.email);
            this._sendEmailReminder(parseInt(data.track_id), data.email);
        }
        else {
            this.notification.add(_t('Invalid data'), {type: 'danger', title: _t('Error')});
        }
        this._modalEmailReminderRemove();
    },

    _checkEmailReminder: async function (trackId){
        var mustUpdateEmailReminder = sessionStorage.getItem('website_event_track.user_is_public') != session.is_public.toString();
        sessionStorage.setItem('website_event_track.user_is_public', session.is_public);

        var emailReminder = sessionStorage.getItem('website_event_track.email_reminder');

        if (!emailReminder || mustUpdateEmailReminder) {
            if (session.is_public) {
                this.opacityManagerElement.style.opacity = 1;
                this.el.append(renderToElement('website_event_track.email_reminder_modal', {'track_id': trackId}));
            }
            else {
                await this.orm.read('res.users', [user.userId], ['email']).then((u) => {
                    if (u.length === 1 && u[0].email) {
                        sessionStorage.setItem('website_event_track.email_reminder', u[0].email);
                    }
                });
            }
        }
        else {
            this._sendEmailReminder(trackId, emailReminder);
        }
    },

    _updateDisplay: function () {
        var trackLink = this.el.querySelector('i');
        if (this.reminderOn) {
            trackLink.classList.replace('fa-bell-o', 'fa-bell');
            trackLink.setAttribute('title', _t('Favorite On'));
        } else {
            trackLink.classList.replace('fa-bell', 'fa-bell-o');
            trackLink.setAttribute('title', _t('Set Favorite'));
        }
    },

   _onMouseEventUpdateIcon: function (ev) {
        const el = ev.target;
        if (el.getAttribute('title') == _t('Set Favorite')){
            if (ev.type == 'mouseover') {
                el.classList.replace('fa-bell-o', 'fa-bell');
            }
            else if (ev.type == 'mouseout') {
                el.classList.replace('fa-bell', 'fa-bell-o');
            }
        }
    },

});

export default publicWidget.registry.websiteEventTrackReminder;
