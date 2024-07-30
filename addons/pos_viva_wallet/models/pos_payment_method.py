# coding: utf-8
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging
import requests

from odoo import fields, models, api, tools, _
from odoo.exceptions import UserError, AccessError

_logger = logging.getLogger(__name__)
TIMEOUT = 10


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    # Viva Wallet
    viva_wallet_merchant_id = fields.Char(string="Merchant ID", help='Used when connecting to Viva Wallet: https://developer.vivawallet.com/getting-started/find-your-account-credentials/merchant-id-and-api-key/')
    viva_wallet_api_key = fields.Char(string="API Key", help='Used when connecting to Viva Wallet: https://developer.vivawallet.com/getting-started/find-your-account-credentials/merchant-id-and-api-key/')
    viva_wallet_client_id = fields.Char(string="Client ID", help='Used when connecting to Viva Wallet: https://developer.vivawallet.com/getting-started/find-your-account-credentials/pos-apis-credentials/#find-your-pos-apis-credentials')
    viva_wallet_client_secret = fields.Char(string="Client secret")
    viva_wallet_terminal_id = fields.Char(string="Terminal ID", help='[Terminal ID of the Viva Wallet terminal], for example: 16002169')
    viva_wallet_bearer_token = fields.Char(default='Bearer Token')
    viva_wallet_webhook_verification_key = fields.Char()
    viva_wallet_latest_response = fields.Json() # used to buffer the latest asynchronous notification from Adyen.
    viva_wallet_test_mode = fields.Boolean(string="Test mode", help="Run transactions in the test environment.")
    viva_wallet_webhook_endpoint = fields.Char(compute='_compute_viva_wallet_webhook_endpoint', readonly=True)


    def _viva_wallet_account_get_endpoint(self):
        if self.viva_wallet_test_mode:
            return 'https://demo-accounts.vivapayments.com'
        return 'https://accounts.vivapayments.com'

    def _viva_wallet_api_get_endpoint(self):
        if self.viva_wallet_test_mode:
            return 'https://demo-api.vivapayments.com'
        return 'https://api.vivapayments.com'

    def _viva_wallet_webhook_get_endpoint(self):
        if self.viva_wallet_test_mode:
            return 'https://demo.vivapayments.com'
        return 'https://www.vivapayments.com'

    def _compute_viva_wallet_webhook_endpoint(self):
        web_base_url = self.get_base_url()
        self.viva_wallet_webhook_endpoint = f"{web_base_url}/pos_viva_wallet/notification?company_id={self.company_id.id}&token={self.viva_wallet_webhook_verification_key}"

    def _is_write_forbidden(self, fields):
        # Allow the modification of these fields even if a pos_session is open
        whitelisted_fields = {'viva_wallet_bearer_token', 'viva_wallet_webhook_verification_key', 'viva_wallet_latest_response'}
        return super(PosPaymentMethod, self)._is_write_forbidden(fields - whitelisted_fields)

    def _bearer_token(self, session):
        self.ensure_one()

        data = {'grant_type': 'client_credentials'}
        auth = requests.auth.HTTPBasicAuth(self.viva_wallet_client_id, self.viva_wallet_client_secret)
        try:
            resp = session.post(f"{self._viva_wallet_account_get_endpoint()}/connect/token", auth=auth, data=data, timeout=TIMEOUT)
        except requests.exceptions.RequestException:
            _logger.exception("Failed to call viva_wallet_bearer_token endpoint")

        access_token = resp.json().get('access_token')
        if access_token:
            self.viva_wallet_bearer_token = access_token
            return {'Authorization': f"Bearer {access_token}"}
        else:
            raise UserError(_('Not receive Bearer Token'))

    def _get_verification_key(self, endpoint, viva_wallet_merchant_id, viva_wallet_api_key):
        # Get a key to configure the webhook.
        # this key need to be the response when we receive a notifiaction
        # do not execute this query in test mode
        if tools.config['test_enable']:
            return 'viva_wallet_test'

        auth = requests.auth.HTTPBasicAuth(viva_wallet_merchant_id, viva_wallet_api_key)
        try:
            resp = requests.get(f"{endpoint}/api/messages/config/token", auth=auth, timeout=TIMEOUT)
        except requests.exceptions.RequestException:
            _logger.exception('Failed to call https://%s/api/messages/config/token endpoint', endpoint)
        return resp.json().get('Key')

    def _call_viva_wallet(self, endpoint, action, data=None):
        session = get_viva_wallet_session()
        session.headers.update({'Authorization': f"Bearer {self.viva_wallet_bearer_token}"})
        endpoint = f"{self._viva_wallet_api_get_endpoint()}/ecr/v1/{endpoint}"
        try:
            resp = session.request(action, endpoint, json=data, timeout=TIMEOUT)
        except requests.exceptions.RequestException as e:
            return {'error': _("There are some issues between us and Viva Wallet, try again later.%s)", e)}

        if resp.text and resp.json().get('detail') == 'Could not validate credentials':
            session.headers.update(self._bearer_token(session))
            resp = session.request(action, endpoint, json=data, timeout=TIMEOUT)

        if resp.status_code == 200:
            if resp.text:
                return resp.json()
            return {'success': resp.status_code}
        else:
            return {'error': _("There are some issues between us and Viva Wallet, try again later. %s", resp.json().get('detail'))}

    def _retrieve_session_id(self, data_webhook):
        # Send a request to confirm the status of the sesions_id
        # Need wait to the status of sesions_id is updated setted in session headers; code 202

        MerchantTrns = data_webhook.get('MerchantTrns')
        if not MerchantTrns:
            return self._send_notification(
                {'error': _(
                    "Your transaction with Viva Wallet failed. Please try again later."
                    )}
                )
        session_id, pos_session_id = MerchantTrns.split("/")  # Split to retrieve pos_sessions_id
        endpoint = f"sessions/{session_id}"
        data = self._call_viva_wallet(endpoint, 'get')

        if data.get('success'):
            data.update({'pos_session_id': pos_session_id, 'data_webhook': data_webhook})
            self.viva_wallet_latest_response = data
            self._send_notification(data)
        else:
            self._send_notification(
                {'error': _(
                    "There are some issues between us and Viva Wallet, try again later. %s",
                    data.get('detail')
                    )}
                )

    def _send_notification(self, data):
        # Send a notification to the point of sale channel to indicate that the transaction are finish
        pos_session_sudo = self.env["pos.session"].browse(int(data.get('pos_session_id', False)))
        if pos_session_sudo:
            pos_session_sudo.config_id._notify('VIVA_WALLET_LATEST_RESPONSE', {
                'config_id': pos_session_sudo.config_id.id
            })

    def _load_pos_data_fields(self, config_id):
        data = super()._load_pos_data_fields(config_id)
        data += ['viva_wallet_terminal_id']
        return data

    def viva_wallet_send_payment_request(self, data):
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("Only 'group_pos_user' are allowed to fetch token from Viva Wallet"))

        endpoint = "transactions:sale"
        return self._call_viva_wallet(endpoint, 'post', data)

    def viva_wallet_send_payment_cancel(self, data):
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("Only 'group_pos_user' are allowed to fetch token from Viva Wallet"))

        session_id = data.get('sessionId')
        cash_register_id = data.get('cashRegisterId')
        endpoint = f"sessions/{session_id}?cashRegisterId={cash_register_id}"
        return self._call_viva_wallet(endpoint, 'delete')

    def write(self, vals):
        res = super().write(vals)
        for record in self:
            if record.use_payment_terminal == 'viva_wallet' and vals.get('viva_wallet_merchant_id') and vals.get('viva_wallet_api_key'):
                record.viva_wallet_webhook_verification_key = self._get_verification_key(
                    self._viva_wallet_webhook_get_endpoint(),
                    self.viva_wallet_merchant_id,
                    self.viva_wallet_api_key
                    )
                if not self.viva_wallet_webhook_verification_key:
                    raise UserError(_("Can't update payment method. Please check the data and update it."))
        return res


    def create(self, vals):
        records = super().create(vals)
        for record in records:
            if record.use_payment_terminal == 'viva_wallet' and record.viva_wallet_merchant_id and record.viva_wallet_api_key:
                record.viva_wallet_webhook_verification_key = record._get_verification_key(
                    record._viva_wallet_webhook_get_endpoint(),
                    record.viva_wallet_merchant_id,
                    record.viva_wallet_api_key,
                )
                if not record.viva_wallet_webhook_verification_key:
                    raise UserError(_("Can't create payment method. Please check the data and update it."))
        return records

    def get_latest_viva_wallet_status(self):
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("Only 'group_pos_user' are allowed to get latest transaction status"))

        self.ensure_one()
        latest_response = self.sudo().viva_wallet_latest_response
        return latest_response

    @api.onchange('use_payment_terminal')
    def _onchange_use_payment_terminal(self):
        super()._onchange_use_payment_terminal()
        if self.use_payment_terminal == 'viva_wallet' and not self.viva_wallet_api_key:
            existing_payment_method = self.search([('use_payment_terminal', '=', 'viva_wallet'), ('viva_wallet_api_key', '!=', False)], limit=1)
            if existing_payment_method:
                self.update({
                    'viva_wallet_merchant_id': existing_payment_method.viva_wallet_merchant_id,
                    'viva_wallet_api_key': existing_payment_method.viva_wallet_api_key,
                    'viva_wallet_client_id': existing_payment_method.viva_wallet_client_id,
                    'viva_wallet_client_secret': existing_payment_method.viva_wallet_client_secret,
                    'viva_wallet_bearer_token': existing_payment_method.viva_wallet_bearer_token,
                })

    @api.constrains('use_payment_terminal')
    def _check_viva_wallet_credentials(self):
        for record in self:
            if (record.use_payment_terminal == 'viva_wallet'
                and not all(record[f] for f in [
                    'viva_wallet_merchant_id',
                    'viva_wallet_api_key',
                    'viva_wallet_client_id',
                    'viva_wallet_client_secret',
                    'viva_wallet_terminal_id']
                )
            ):
                raise UserError(_('It is essential to provide API key for the use of viva wallet'))


def get_viva_wallet_session():
    session = requests.Session()
    session.mount('https://', requests.adapters.HTTPAdapter(max_retries=requests.adapters.Retry(
        total=6,
        backoff_factor=2,
        status_forcelist=[202, 500, 502, 503, 504],
        )))
    return session
