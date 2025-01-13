# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields


class ProductDocument(models.Model):

    _inherit = 'product.document'

    is_gelato = fields.Boolean()
