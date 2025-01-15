from odoo import fields, models

class ProductTemplate(models.Model):
    _inherit = "product.template"

    l10n_id_product_code = fields.Many2one("l10n_id_efaktur_coretax.product.code", default=lambda self: self.env.ref('l10n_id_efaktur_coretax.product_code_000000_goods', raise_if_not_found=False))
