import json
from requests.exceptions import RequestException
from threading import Timer

from odoo import api, fields, models,  _
from odoo.exceptions import AccessDenied, UserError

from .pinelabs_pos_request import PinelabsPosRequest
MAX_RETRIES = 30
PINELABS_ERROR_CODES_MAPPING = {
    "CANNOT CANCEL AS TRANSACTION IS IN PROGRESS": [11, "The transaction is still being processed and cannot be canceled at this time"],
    "TRANSACTION NOT FOUND": [12, "No transaction was found with the provided reference ID"],
    "INVALID PLUTUS TXN REF ID": [13, "The Plutus reference ID provided is invalid."]
}


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    pinelabs_merchant = fields.Char(string='Pine Labs Merchant ID', help='A merchant id issued directly to the merchant by Pine Labs.', copy=False)
    pinelabs_store = fields.Char(string='Pine Labs Store ID', help='A store id issued directly to the merchant by Pine Labs.', copy=False)
    pinelabs_client = fields.Char(string='Pine Labs Client ID', help='A client id issued directly to the merchant by Pine Labs.', copy=False)
    pinelabs_security_token = fields.Char(string='Pine Labs Security Token', help='A security token issued directly to the merchant by Pine Labs.')
    pinelabs_allowed_payment_modes = fields.Selection(
        selection=[('all', "All"), ('card', "Card"), ('upi', "Upi")],
        string='Pine Labs Allowed Payment Modes',
        help='Accepted payment modes by Pine Labs for transactions.', copy=False)
    pinelabs_test_mode = fields.Boolean(help='test pinelabs transaction process.', copy=False)
    pinelabs_latest_response = fields.Char(copy=False) # pinelabs latest response, used to update waiting paymentline

    def _get_payment_terminal_selection(self):
        return super(PosPaymentMethod, self)._get_payment_terminal_selection() + [('pinelabs', 'Pine Labs')]

    def _is_write_forbidden(self, fields):
        # Allow the modification of pinelabs_latest_response field even if a pos_session is open
        return super(PosPaymentMethod, self)._is_write_forbidden(fields -  {'pinelabs_latest_response'})

    def pinelabs_make_payment_request(self, data):
        pinelabs = PinelabsPosRequest()
        body = pinelabs._pinelabs_request_body(payment_mode=True, payment_method=self)
        body.update({
            'Amount': data.get('amount'),
            'TransactionNumber': data.get('transactionNumber'),
            'SequenceNumber': data.get('sequenceNumber')
        })
        response = pinelabs._call_pinelabs(endpoint='UploadBilledTransaction', payload=body, payment_method=self)
        if not response.get('ResponseCode') and response.get('ResponseMessage') == "APPROVED":
            return {
                'responseCode': response.get('ResponseCode'),
                'status': response.get('ResponseMessage'),
                'plutusTransactionReferenceID': response.get('PlutusTransactionReferenceID'),
            }
        default_error_msg = _('The expected error code for the Pine Labs POS payment upload request was not included in the response.')
        error = response.get('ResponseMessage') or default_error_msg
        return {"error": error}

    def pinelabs_fetch_payment_status(self, data):
        pinelabs = PinelabsPosRequest()
        body = pinelabs._pinelabs_request_body(payment_mode=False, payment_method=self)
        body.update({'PlutusTransactionReferenceID': data.get('plutusTransactionReferenceID')})

        retry_count = 0
        def handle_error(error, plutusTransactionReferenceID, payment_method, config):
            payment_method.pinelabs_latest_response = json.dumps({"error": error})
            config._notify("PINELABS_PAYMENT_RESPONSE", {"error": error, "plutusTransactionReferenceID": plutusTransactionReferenceID})

        def get_status():
            nonlocal retry_count
            with self.pool.cursor() as cr:
                new_env = self.env(cr=cr)
                config = new_env["pos.config"].browse(data.get("config_id"))
                payment_method = new_env["pos.payment.method"].browse(data.get("payment_method_id"))
                try:
                    response = pinelabs._call_pinelabs(endpoint='GetCloudBasedTxnStatus', payload=body, payment_method=payment_method)
                    if response.get('ResponseCode') == 1001:
                        if retry_count <= MAX_RETRIES:
                            retry_count += 1
                            Timer(5, get_status).start()
                        else:
                            # We automatically cancel transactions in cases of inactivity.
                            error = _("The transaction has failed due to inactivity")
                            payment_method.pinelabs_cancel_payment_request(data)
                            handle_error(error, data.get('plutusTransactionReferenceID'), payment_method, config)
                    elif response.get('ResponseCode') == 0:
                        payment_method.pinelabs_latest_response = json.dumps({
                            "responseCode": response.get('ResponseCode'),
                            "status": response.get('ResponseMessage'),
                            "plutusTransactionReferenceID": response.get('PlutusTransactionReferenceID'),
                            "data": format_transaction_data(response.get('TransactionData'))
                        })
                        config._notify("PINELABS_PAYMENT_RESPONSE", {'responseCode': response.get('ResponseCode'), 'plutusTransactionReferenceID': response.get('PlutusTransactionReferenceID')})
                    else:
                        default_error_msg = _('The expected error code for the Pine Labs POS payment status request was not included in the response.')
                        error = PINELABS_ERROR_CODES_MAPPING.get(response.get('ResponseMessage'))[1] or response.get('ResponseMessage') or default_error_msg
                        handle_error(error, data.get('plutusTransactionReferenceID'), payment_method, config)


                except RequestException as e:
                    error = _('A request error occurred while checking Pine Labs POS payment status.')
                    handle_error(error, data.get('plutusTransactionReferenceID'), payment_method, config)

        get_status()

    def pinelabs_cancel_payment_request(self, data):
        pinelabs = PinelabsPosRequest()
        body = pinelabs._pinelabs_request_body(payment_mode=False, payment_method=self)
        body.update({
            'Amount': data.get('amount'),
            'PlutusTransactionReferenceID': data.get('plutusTransactionReferenceID'),
        })
        response = pinelabs._call_pinelabs(endpoint='CancelTransaction', payload=body, payment_method=self)
        if not response.get('ResponseCode') and response.get('ResponseMessage') == "APPROVED":
            return {
                "responseCode": response.get('ResponseCode'),
                "error": _("Pine Labs POS transaction cancelled successfully")
            }
        default_error_msg = _('The expected error code for the Pine Labs POS payment cancellation request was not included in the response.')
        errorMessage = PINELABS_ERROR_CODES_MAPPING.get(response.get('ResponseMessage'))[1] or response.get('ResponseMessage') or default_error_msg
        return {
            "responseCode": PINELABS_ERROR_CODES_MAPPING.get(response.get('ResponseMessage'))[0] or response.get('ResponseCode'),
            "errorMessage": errorMessage
        }

    @api.constrains('use_payment_terminal')
    def _check_pinelabs_terminal(self):
        if any(record.use_payment_terminal == 'pinelabs' and record.company_id.currency_id.name != 'INR' for record in self):
            raise UserError(_('This Payment Terminal is only valid for INR Currency'))

    def get_pinelabs_latest_reponse(self):
        self.ensure_one()
        if not self.env.su and not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessDenied()

        latest_response = self.sudo().pinelabs_latest_response
        latest_response = latest_response if latest_response else False
        return latest_response


def format_transaction_data(transaction_data):
    return { d['Tag']: d['Value'] for d in transaction_data }
