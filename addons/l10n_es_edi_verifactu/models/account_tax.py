from odoo import fields, models


class AccountTax(models.Model):
    _inherit = 'account.tax'

    l10n_es_edi_verifactu_tax_type = fields.Selection([
        ('01', 'Value-Added Tax'),
        ('02', 'IPSI: Taxes on production, services and imports in Ceuta and Melilla'),
        ('03', 'IGIC: Canaries General Indirect Tax'),
        ('05', 'Other'),
    ], string='Spanish Veri*Factu Tax Type', default='01')
