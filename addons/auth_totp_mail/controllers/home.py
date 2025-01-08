import logging
import odoo.addons.auth_totp.controllers.home

from odoo import http
from odoo.exceptions import AccessDenied, UserError
from odoo.http import request

from odoo.addons.base.models.ir_mail_server import MailDeliveryException

_logger = logging.getLogger(__name__)


class Home(odoo.addons.auth_totp.controllers.home.Home):
    @http.route()
    def web_totp(self, redirect=None, **kwargs):
        response = super().web_totp(redirect=redirect, **kwargs)
        if response.status_code != 200 or response.qcontext['user']._mfa_type() != 'totp_mail':
            # In case the response from the super is a redirection
            # or the user has another TOTP method, we return the response from the call to super.
            return response
        if not request.session.get('pre_uid') or request.session.uid:
            raise AccessDenied("The user must still be in the pre-authentication phase")  # pylint: disable=missing-gettext

        # Send the email containing the code to the user inbox
        try:
            response.qcontext['user']._send_totp_mail_code()
        except (AccessDenied, UserError) as e:
            response.qcontext['error'] = str(e)
        except Exception as e:
            _logger.exception('Unable to send TOTP email')
            response.qcontext['error'] = str(e)
        return response

    def _on_totp_login_succeed(self):
        # Force the sending of the "New Connection" email when log in
        if new_connection_mail_mail_id := request.session.get('new_connection_mail_mail_id'):
            new_connection_mail = self.env['mail.mail'].browse(new_connection_mail_mail_id).sudo().exists()
            if new_connection_mail and new_connection_mail.state == 'outgoing':
                try:
                    new_connection_mail.send()
                except MailDeliveryException:
                    pass
        return super()._on_totp_login_succeed()
