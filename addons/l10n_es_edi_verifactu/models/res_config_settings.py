from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_es_edi_verifactu_certificate_ids = fields.One2many(related='company_id.l10n_es_edi_verifactu_certificate_ids', readonly=False)
    l10n_es_edi_verifactu_test_environment = fields.Boolean(related='company_id.l10n_es_edi_verifactu_test_environment', readonly=False)
