from odoo import fields, models

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    stripe_issuing_api_key = fields.Char(
        related="company_id.stripe_issuing_api_key",
        readonly=False,
    )
