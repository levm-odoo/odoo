from odoo import models
from odoo.tools import float_is_zero

class RepairOrder(models.Model):
    _inherit = 'repair.order'

    def write(self, vals):
        res = super().write(vals)
        for repair in self:
            if 'under_warranty' in vals:
                repair._update_sale_order_line_price()
        return res

    def action_repair_done(self):
        super().action_repair_done()
        for sale_line in self.move_ids.sale_line_id:
            price_unit = sale_line.price_unit
            sale_line.write({'product_uom_qty': sale_line.qty_delivered, 'price_unit': price_unit})

    def _get_sale_order_values_list(self, repair):
        vals = super()._get_sale_order_values_list(repair)
        vals['warehouse_id'] = repair.picking_type_id.warehouse_id.id
        return vals

    def _get_sale_line_to_update(self):
        return self.move_ids.sale_line_id.filtered(lambda l: l.order_id.state != 'cancel' and float_is_zero(l.product_uom_qty, precision_rounding=l.product_uom.rounding))

    def _update_sale_order_line_price(self):
        for repair in self:
            add_moves = repair.move_ids.filtered(lambda m: m.repair_line_type == 'add' and m.sale_line_id)
            if repair.under_warranty:
                add_moves.sale_line_id.write({'price_unit': 0.0, 'technical_price_unit': 0.0})
            else:
                add_moves.sale_line_id._compute_price_unit()
