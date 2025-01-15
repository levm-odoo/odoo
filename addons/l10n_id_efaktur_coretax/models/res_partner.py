from odoo import fields, models

class Partner(models.Model):
    _inherit = "res.partner"

    l10n_id_kode_transaksi = fields.Selection(selection_add=[('10', '10 Penyerahan lainnya')], default='04')
    l10n_id_tku = fields.Char(default="000000")  # 0000000 means 'headquarters'

    # document selection
    l10n_id_buyer_document_type = fields.Selection([
        ('TIN', 'TIN'),
        ('NIK', 'NIK'),
        ('Passport', 'Passport'),
        ('Other', 'Others')
    ], default='TIN', string="Document Type")
    l10n_id_buyer_document_number = fields.Char(string="Document Number")  # only show if buyer doc type != 'NIK'
