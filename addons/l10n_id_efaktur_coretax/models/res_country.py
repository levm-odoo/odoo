from odoo import fields, models

class ResCountry(models.Model):
    _inherit = "res.country"

    l10n_id_efaktur_code = fields.Char()
