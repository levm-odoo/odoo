from odoo import models, fields

class PosPayment(models.Model):
    _inherit = 'pos.payment'

    plutus_transaction_reference = fields.Char(
        string='Pine Labs PlutusTransactionReferenceID',
        help='Required during the refund order process: https://developer.pinelabs.com/in/instore/cloud-integration#Example-JSON-request-for-Void-ICB-on-UPI-transaction')
