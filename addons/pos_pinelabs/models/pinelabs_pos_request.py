import requests
import logging

from odoo import _
REQUEST_TIMEOUT = 10
PINELABS_AUTO_CANCEL_DURATION_MIN = 10

_logger = logging.getLogger(__name__)

class PinelabsPosRequest:

    def __init__(self, payment_method):
        self.pm = payment_method

    def _get_pinelabs_endpoint(self):
        if self.pm.pinelabs_test_mode:
            return 'https://www.plutuscloudserviceuat.in:8201/API/CloudBasedIntegration/V1/'
        return 'https://www.plutuscloudserviceuat.in:8201/API/CloudBasedIntegration/V1/' # We will update this with the production endpoint once it becomes available.

    def call_pinelabs(self, endpoint, payload):
        """ Make a request to Pine Labs POS API.

        :param str endpoint: The endpoint to be reached by the request.
        :param dict payload: The payload of the request.
        :return The JSON-formatted content of the response.
        :rtype: dict
        """
        url = f'{self._get_pinelabs_endpoint()}{endpoint}'
        try:
            response = requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
            res_json = response.json()
        except requests.exceptions.RequestException as error:
            _logger.warning('Cannot connect with Pine Labs Terminal. Error: %s', error)
            return {'errorMessage': str(error)}
        except ValueError as error:
            _logger.warning('Cannot decode response json. Error: %s', error)
            return {'errorMessage': _('Cannot decode Pine Labs Terminal response')}
        return res_json

    def pinelabs_request_body(self, payment_mode):
        request_parameters = {
            'MerchantID': self.pm.pinelabs_merchant,
            'StoreID': self.pm.pinelabs_store,
            'ClientID': self.pm.pinelabs_client,
            'SecurityToken': self.pm.pinelabs_security_token
        }
        if payment_mode:
            # Added AutoCancelDurationInMinutes set to 10 minutes for automatically cancelling transactions on the PineLabs side in case of lost transaction request data from the PoS system.
            pinelabs_auto_cancel_duration = self.pm.env['ir.config_parameter'].sudo().get_param('pos_pinelabs.payment_auto_cancel_duration', PINELABS_AUTO_CANCEL_DURATION_MIN)
            request_parameters.update({
                'AllowedPaymentMode': self._get_allowed_payment_mode(),
                'AutoCancelDurationInMinutes': pinelabs_auto_cancel_duration
            })
        return request_parameters

    def _get_allowed_payment_mode(self):
        allowed_payment_modes_mapping = {
            'all': 0,
            'card': 1,
            'upi': 10,
        }
        return allowed_payment_modes_mapping.get(self.pm.pinelabs_allowed_payment_modes)
