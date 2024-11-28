from odoo import Command, models

class StockMove(models.Model):
    _inherit = "stock.move"

    def _clean_repair_sale_order_line(self):
        self.filtered(
                lambda m: m.repair_id and m.sale_line_id
            ).mapped('sale_line_id').write({'product_uom_qty': 0.0})
        super()._clean_repair_sale_order_line()

    def write(self, vals):
        res = super().write(vals)
        repair_moves = self.env['stock.move']
        moves_to_create_so_line = self.env['stock.move']
        for move in self:
            if not move.sale_line_id and 'sale_line_id' not in vals and move.repair_line_type == 'add':
                moves_to_create_so_line |= move
            if move.sale_line_id and ('repair_line_type' in vals or 'product_uom_qty' in vals):
                repair_moves |= move
        return res

    def copy_data(self, default=None):
        default = dict(default or {})
        vals_list = super().copy_data(default=default)
        for move, vals in zip(self, vals_list):
            if 'repair_id' in default or move.repair_id:
                vals['sale_line_id'] = False
        return vals_list

    def _create_repair_sale_order_line(self):
        res = super()._create_repair_sale_order_line
        for move in self:
            if move.sale_line_id or move.repair_line_type != 'add' or not move.repair_id.sale_order_id:
                continue
        return res

    def _get_so_line_vals(move):
        vals = super()._get_so_line_vals(move)
        vals['move_ids'] = [Command.link(move.id)]
        return vals
