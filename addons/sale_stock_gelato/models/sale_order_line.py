# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'


    def _action_launch_stock_rule(self, previous_product_uom_qty=False):
        gelato_lines = self.filtered(lambda l: l.product_id.gelato_product_ref)
        super(SaleOrderLine, self - gelato_lines)._action_launch_stock_rule(previous_product_uom_qty)
