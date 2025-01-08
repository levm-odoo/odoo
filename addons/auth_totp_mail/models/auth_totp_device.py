# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, models
from odoo.http import request

from collections import defaultdict


class Auth_TotpDevice(models.Model):
    _inherit = "auth_totp.device"

    def unlink(self):
        """ Notify users when trusted devices are removed from their account. """
        removed_devices_by_user = self._classify_by_user()
        for user, removed_devices in removed_devices_by_user.items():
            user._notify_security_setting_update(
                _("Security Update: Device Removed"),
                _(
                    "A trusted device has just been removed from your account: %(device_names)s",
                    device_names=', '.join([device.name for device in removed_devices])
                ),
            )

        return super().unlink()

    def _generate(self, scope, name, expiration_date):
        """ Notify users when trusted devices are added onto their account.
        We override this method instead of 'create' as those records are inserted directly into the
        database using raw SQL. """

        res = super()._generate(scope, name, expiration_date)

        message =  _(
            "A trusted device has just been added to your account: %(device_name)s",
            device_name=name,
        )
        mail_values = None
        if request:
            # if the "New Connection" email has not been sent already,
            # merge both to avoid spamming the user
            new_connection_mail_mail_id = request.session['new_connection_mail_mail_id']
            new_connection_mail = self.env['mail.mail'].browse(new_connection_mail_mail_id).sudo().exists()
            if new_connection_mail and new_connection_mail.state == 'outgoing':
                new_connection_mail.unlink()
                del request.session['new_connection_mail_mail_id']
                message =  _(
                    "A new device was used to sign in to your account and was marked as trusted: %(device_name)s",
                    device_name=name,
                )

        self.env.user._notify_security_setting_update(_("Security Update: Device Added"), message, mail_values, force_send=True)

        return res

    def _classify_by_user(self):
        devices_by_user = defaultdict(lambda: self.env['auth_totp.device'])
        for device in self:
            devices_by_user[device.user_id] |= device

        return devices_by_user
