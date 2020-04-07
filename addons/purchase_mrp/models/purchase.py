# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    mrp_production_count = fields.Integer(
        "Count of MO Source",
        compute='_compute_mrp_production_count',
        groups='mrp.group_mrp_user')

    @api.depends('order_line.move_dest_ids.group_id.mrp_production_ids')
    def _compute_mrp_production_count(self):
        for purchase in self:
            purchase.mrp_production_count = len(purchase._get_production_orders())

    def action_view_mrp_productions(self):
        self.ensure_one()
        mrp_production_ids = self._get_production_orders().ids
        action = {
            'res_model': 'mrp.production',
            'type': 'ir.actions.act_window',
        }
        if len(mrp_production_ids) == 1:
            action.update({
                'view_mode': 'form',
                'res_id': mrp_production_ids[0],
            })
        else:
            action.update({
                'name': _("Manufacturing Source of %s", self.name),
                'domain': [('id', 'in', mrp_production_ids)],
                'view_mode': 'tree,form',
            })
        return action

    def _get_production_orders(self):
        return self.order_line.move_dest_ids.group_id.mrp_production_ids | self.order_line.move_ids.move_dest_ids.group_id.mrp_production_ids


class PurchaseOrderLine(models.Model):
    _inherit = 'purchase.order.line'

    production_id = fields.Many2one('mrp.production', string='Origin production order', index=True)

    @api.model
    def _prepare_purchase_order_line_from_procurement(self, product_id, product_qty, product_uom, company_id, values, po):
        res = super()._prepare_purchase_order_line_from_procurement(product_id, product_qty, product_uom, company_id, values, po)
        res['production_id'] = values['move_dest_ids'].raw_material_production_id.id if values.get('move_dest_ids') else False
        return res

    def _compute_qty_received(self):
        super(PurchaseOrderLine, self)._compute_qty_received()
        for line in self:
            if line.qty_received_method == 'stock_moves' and line.move_ids:
                kit_bom = self.env['mrp.bom']._bom_find(product=line.product_id, company_id=line.company_id.id, bom_type='phantom')
                if kit_bom:
                    moves = line.move_ids.filtered(lambda m: m.state == 'done' and not m.scrapped)
                    order_qty = line.product_uom._compute_quantity(line.product_uom_qty, kit_bom.product_uom_id)
                    filters = {
                        'incoming_moves': lambda m: m.location_id.usage == 'supplier' and (not m.origin_returned_move_id or (m.origin_returned_move_id and m.to_refund)),
                        'outgoing_moves': lambda m: m.location_id.usage != 'supplier' and m.to_refund
                    }
                    line.qty_received = moves._compute_kit_quantities(line.product_id, order_qty, kit_bom, filters)

    def _get_upstream_documents_and_responsibles(self, visited):
        return [(self.order_id, self.order_id.user_id, visited)]
