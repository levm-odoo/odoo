# Part of Odoo. See LICENSE file for full copyright and licensing details.

import hashlib
import hmac
import json
import logging
import pprint

from werkzeug.exceptions import Forbidden

from odoo import http
from odoo.exceptions import ValidationError
from odoo.http import request
from odoo.addons.payment_paymob import const


_logger = logging.getLogger(__name__)


class PaymobController(http.Controller):
    _return_url = '/payment/paymob/return'
    _webhook_url = '/payment/paymob/webhook'

    @http.route(
        _return_url, type='http', auth='public', methods=['GET'], csrf=False,
        save_session=False
    )
    def paymob_return_from_checkout(self, **data):
        """ Process the notification data sent by Paymob after redirection from checkout.

        The route is flagged with `save_session=False` to prevent Odoo from assigning a new session
        to the user if they are redirected to this route with a POST request. Indeed, as the session
        cookie is created without a `SameSite` attribute, some browsers that don't implement the
        recommended default `SameSite=Lax` behavior will not include the cookie in the redirection
        request from the payment provider to Odoo. As the redirection to the '/payment/status' page
        will satisfy any specification of the `SameSite` attribute, the session of the user will be
        retrieved and with it the transaction which will be immediately post-processed.

        :param dict data: The notification data (only `id`) and the transaction reference (`ref`)
                          embedded in the return URL
        """
        _logger.info("handling redirection from Paymob with data:\n%s", pprint.pformat(data))
        self._verify_notification_signature(data)
        request.env['payment.transaction'].sudo()._handle_notification_data('paymob', data)
        return request.redirect('/payment/status')

    @http.route(_webhook_url, type='http', auth='public', methods=['POST'], csrf=False)
    def paymob_webhook(self, **data):
        """ Process the notification data sent by Paymob to the webhook.

        :param dict data: The notification data (only `id`) and the transaction reference (`ref`)
                          embedded in the return URL
        :return: An empty string to acknowledge the notification
        :rtype: str
        """
        _logger.info("notification received from Paymob with data:\n%s", pprint.pformat(data))
        notification_data = request.httprequest.json.get('obj')
        try:
            if notification_data:
                # TODO LIEW no transaction found for webhook, response needs to be normalized
                self._verify_notification_signature(notification_data)
                request.env['payment.transaction'].sudo()._handle_notification_data(
                    'paymob', notification_data)
        except ValidationError:  # Acknowledge the notification to avoid getting spammed
            _logger.exception("unable to handle the notification data; skipping to acknowledge")
        return ''  # Acknowledge the notification

    @staticmethod
    def _verify_notification_signature(notification_data):
        """ Check that the received signature matches the expected one.

        :param dict notification_data: The notification payload containing the received signature

        :return: None
        :raise: :class:`werkzeug.exceptions.Forbidden` if the signatures don't match
        """
        try:
            # Check the integrity of the notification
            tx_sudo = request.env['payment.transaction'].sudo()._get_tx_from_notification_data(
                'paymob', notification_data
            )
        except ValidationError:
            # Warn rather than log the traceback to avoid noise when a POS payment notification
            # is received and the corresponding `payment.transaction` record is not found.
            _logger.warning("unable to find the transaction; skipping to acknowledge")
        else:
            # Retrieve the received signature from the payload
            received_signature = notification_data.get('hmac', '')
            if not received_signature:
                _logger.warning("received notification with missing signature")
                raise Forbidden()

            # Compare the received signature with the expected signature computed from the payload
            hmac_key = tx_sudo.provider_id.paymob_hmac_key
            expected_signature = PaymobController._compute_signature(notification_data, hmac_key)
            if not hmac.compare_digest(received_signature, expected_signature):
                _logger.warning("received notification with invalid signature")
                raise Forbidden()

    @staticmethod
    def _compute_signature(payload, hmac_key):
        """ Compute the signature from the payload.

        See https://developers.paymob.com/pak/manage-callback/hmac-calculation

        :param dict payload: The notification payload
        :param str hmac_key: The HMAC key of the provider handling the transaction
        :return: The computed signature
        :rtype: str
        """
        # Concatenate relevant fields used to check for signature and if not found add "false"
        signing_string = ''.join(
            [
                payload[field] if payload[field] else 'false'
                for field in const.PAYMOB_SIGNATURE_FIELDS
            ]
        ).encode('utf-8')

        # Calculate the signature using the hmac_key with SHA-512
        signed_hmac = hmac.new(hmac_key.encode("utf-8"), signing_string, hashlib.sha512)
        # Calculate the signature by encoding the result with base16
        return signed_hmac.hexdigest()
