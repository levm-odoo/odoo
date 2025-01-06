from odoo import api, fields, models 


class PosPayment(models.Model):
    _inherit = "pos.payment"

    viva_wallet_session_id = fields.Char('Viva wallet session id', help='Required to fetch payment status during the refund order process')
