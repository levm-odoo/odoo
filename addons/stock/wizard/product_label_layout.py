# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict
from odoo import fields, models
from odoo.tools import float_compare, float_is_zero


class ProductLabelLayout(models.TransientModel):
    _inherit = 'product.label.layout'

    move_ids = fields.Many2many('stock.move')
    move_quantity = fields.Selection([
        ('move', 'Operation Quantities'),
        ('custom', 'Custom')], string="Quantity to print", required=True, default='custom')
    print_format = fields.Selection(selection_add=[
        ('zpl', 'ZPL Labels'),
        ('zplxprice', 'ZPL Labels with price')
    ], ondelete={'zpl': 'set default', 'zplxprice': 'set default'})

    def _prepare_report_data(self):
        xml_id, data = super()._prepare_report_data()

        if 'zpl' in self.print_format:
            xml_id = 'stock.label_product_product'

        quantities = defaultdict(int)
        uom_unit = self.env.ref('uom.product_uom_unit', raise_if_not_found=False)
        uom_pack_of_6 = self.env.ref('uom.product_uom_pack_6', raise_if_not_found=False)
        precision_digits = self.env['decimal.precision'].precision_get('Product Unit of Measure')
        if self.move_quantity == 'move' and self.move_ids and all(float_is_zero(ml.quantity, precision_digits=precision_digits) for ml in self.move_ids.move_line_ids):
            for move in self.move_ids:
                use_reserved = float_compare(move.quantity, 0, precision_digits=precision_digits) > 0
                useable_qty = move.quantity if use_reserved else move.product_uom_qty
                if not float_is_zero(useable_qty, precision_digits=precision_digits):
                    quantities[move.product_id.id] += useable_qty
            data['quantity_by_product'] = {p: int(q) for p, q in quantities.items()}
        elif self.move_quantity == 'move' and self.move_ids.move_line_ids:
            custom_barcodes = defaultdict(list)
            for line in self.move_ids.move_line_ids:
                if line.product_uom_id in [uom_unit, uom_pack_of_6]:
                    if (line.lot_id or line.lot_name) and int(line.quantity):
                        custom_barcodes[line.product_id.id].append((line.lot_id.name or line.lot_name, int(line.quantity)))
                        continue
                    quantities[line.product_id.id] += line.quantity
                else:
                    quantities[line.product_id.id] = 1
            # Pass only products with some quantity done to the report
            data['quantity_by_product'] = {p: int(q) for p, q in quantities.items() if q}
            data['custom_barcodes'] = custom_barcodes
        return xml_id, data
