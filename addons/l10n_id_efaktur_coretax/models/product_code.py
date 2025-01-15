from odoo import fields, models

class EfakturProductCode(models.Model):
    _name = "l10n_id_efaktur_coretax.product.code"
    _description = "Product Code for products"

    code = fields.Char()
    description = fields.Text()

    def name_get(self):
        result = []
        for record in self:
            name = record.code + " - " + record.description
            result.append((record.id, name))
        return result
