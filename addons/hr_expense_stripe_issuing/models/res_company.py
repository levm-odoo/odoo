from odoo import fields, models

class ResCompany(models.Model):
    _inherit = 'res.company'

    stripe_issuing_api_key = fields.Char()
