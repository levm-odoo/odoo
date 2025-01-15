from odoo import fields, models

class EfakturUomCode(models.Model):
    _name = "l10n_id_efaktur_coretax.uom.code"
    _description = "UOM Code for e-Faktur statement"

    code = fields.Char()
    uom_name = fields.Char()
