import requests
import logging

from odoo import _
REQUEST_TIMEOUT = 10
PINELABS_AUTO_CANCEL_DURATION = 10

_logger = logging.getLogger(__name__)

class PinelabsPosRequest:

    def _get_pinelabs_endpoint(self, payment_method):
        if payment_method.pinelabs_test_mode:
            return 'https://www.plutuscloudserviceuat.in:8201/API/CloudBasedIntegration/V1/'
        return 'https://www.plutuscloudserviceuat.in:8201/API/CloudBasedIntegration/V1/' # We will update this with the production endpoint once it becomes available.

    def _call_pinelabs(self, endpoint, payload, payment_method):
        """ Make a request to Pine Labs POS API.

        :param str endpoint: The endpoint to be reached by the request.
        :param dict payload: The payload of the request.
        :param dict payment_method: The payment_method to get the request parameter.
        :return The JSON-formatted content of the response.
        :rtype: dict
        """
        endpoint = f'{self._get_pinelabs_endpoint(payment_method)}{endpoint}'
        try:
            response = requests.post(endpoint, json=payload, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
            res_json = response.json()
        except requests.exceptions.RequestException as error:
            _logger.warning('Cannot connect with Pine Labs Terminal. Error: %s', error)
            return {'errorMessage': str(error)}
        except ValueError as error:
            _logger.warning('Cannot decode response json. Error: %s', error)
            return {'errorMessage': _('Cannot decode Pine Labs Terminal response')}
        return res_json

    def _pinelabs_request_body(self, payment_mode, payment_method):
        request_parameters = {
            'MerchantID': payment_method.pinelabs_merchant,
            'StoreID': payment_method.pinelabs_store,
            'ClientID': payment_method.pinelabs_client,
            'SecurityToken': payment_method.pinelabs_security_token
        }
        if payment_mode:
            # Added AutoCancelDurationInMinutes set to 10 minutes for automatically cancelling transactions on the PineLabs side in case of lost transaction request data from the PoS system.
            pinelabs_auto_cancel_duration = int(payment_method.env['ir.config_parameter'].sudo().get_param('pos_pinelabs.payment_auto_cancel_duration', PINELABS_AUTO_CANCEL_DURATION))
            request_parameters.update({
                'AllowedPaymentMode': self.get_allowed_payment_mode(payment_method),
                'AutoCancelDurationInMinutes': pinelabs_auto_cancel_duration
            })
        return request_parameters

    def get_allowed_payment_mode(self, payment_method):
        allowed_payment_modes_mapping = {
            'all': 0,
            'card': 1,
            'upi': 10,
        }
        return allowed_payment_modes_mapping.get(payment_method.pinelabs_allowed_payment_modes)
