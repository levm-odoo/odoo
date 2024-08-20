# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, Command, fields, models
from odoo.exceptions import UserError
from odoo.tools.float_utils import float_is_zero, float_round


class ReturnPickingLine(models.TransientModel):
    _name = "stock.return.picking.line"
    _rec_name = 'product_id'
    _description = 'Return Picking Line'

    product_id = fields.Many2one('product.product', string="Product", required=True, domain="[('id', '=', product_id)]")
    quantity = fields.Float("Quantity", digits='Product Unit of Measure', required=True)
    uom_id = fields.Many2one('uom.uom', string='Unit of Measure', related='product_id.uom_id')
    wizard_id = fields.Many2one('stock.return.picking', string="Wizard")
    move_id = fields.Many2one('stock.move', "Move")


class ReturnPicking(models.TransientModel):
    _name = 'stock.return.picking'
    _description = 'Return Picking'

    @api.model
    def default_get(self, fields):
        res = super().default_get(fields)
        if self.env.context.get('active_id') and self.env.context.get('active_model') == 'stock.picking':
            if len(self.env.context.get('active_ids', [])) > 1:
                raise UserError(_("You may only return one picking at a time."))
            picking = self.env['stock.picking'].browse(self.env.context.get('active_id'))
            if picking.exists():
                res.update({'picking_id': picking.id})
        return res

    picking_id = fields.Many2one('stock.picking')
    product_return_moves = fields.One2many('stock.return.picking.line', 'wizard_id', 'Moves', compute='_compute_moves_locations', readonly=False, store=True)
    move_dest_exists = fields.Boolean('Chained Move Exists', compute='_compute_moves_locations', store=True)
    original_location_id = fields.Many2one('stock.location', compute='_compute_moves_locations', store=True)
    parent_location_id = fields.Many2one('stock.location', compute='_compute_moves_locations', store=True)
    company_id = fields.Many2one(related='picking_id.company_id')
    location_id = fields.Many2one(
        'stock.location', 'Return Location', compute='_compute_moves_locations', readonly=False, store=True,
        domain="['|', ('id', '=', original_location_id), '|', '&', ('return_location', '=', True), ('company_id', '=', False), '&', ('return_location', '=', True), ('company_id', '=', company_id)]")

    @api.depends('picking_id')
    def _compute_moves_locations(self):
        for wizard in self:
            move_dest_exists = False
            product_return_moves = [Command.clear()]
            if wizard.picking_id and wizard.picking_id.state != 'done' and not wizard.env.context.get("create_exchange"):
                raise UserError(_("You may only return Done pickings."))
            # In case we want to set specific default values (e.g. 'to_refund'), we must fetch the
            # default values for creation.
            line_fields = list(self.env['stock.return.picking.line']._fields)
            product_return_moves_data_tmpl = self.env['stock.return.picking.line'].default_get(line_fields)
            for move in wizard.picking_id.move_ids:
                if move.state == 'cancel':
                    continue
                if move.scrapped:
                    continue
                if move.move_dest_ids:
                    move_dest_exists = True
                product_return_moves_data = dict(product_return_moves_data_tmpl)
                product_return_moves_data.update(wizard._prepare_stock_return_picking_line_vals_from_move(move))
                product_return_moves.append(Command.create(product_return_moves_data))
            if wizard.picking_id and not product_return_moves:
                raise UserError(_("No products to return (only lines in Done state and not fully returned yet can be returned)."))
            if wizard.picking_id:
                wizard.product_return_moves = product_return_moves
                wizard.move_dest_exists = move_dest_exists
                wizard.parent_location_id = wizard.picking_id.picking_type_id.warehouse_id.view_location_id.id or wizard.picking_id.location_id.location_id.id
                wizard.original_location_id = wizard.picking_id.location_id.id
                location_id = wizard.picking_id.location_id.id
                if wizard.picking_id.picking_type_id.return_picking_type_id.default_location_dest_id.return_location:
                    location_id = wizard.picking_id.picking_type_id.return_picking_type_id.default_location_dest_id.id
                wizard.location_id = wizard.picking_id.picking_type_id.default_location_return_id.id or location_id

    @api.model
    def _prepare_stock_return_picking_line_vals_from_move(self, stock_move):
        quantity = stock_move.quantity
        for move in stock_move.move_dest_ids:
            if not move.origin_returned_move_id or move.origin_returned_move_id != stock_move:
                continue
            quantity -= move.quantity
        quantity = float_round(quantity, precision_rounding=stock_move.product_id.uom_id.rounding)
        return {
            'product_id': stock_move.product_id.id,
            'quantity': quantity,
            'move_id': stock_move.id,
            'uom_id': stock_move.product_id.uom_id.id,
        }

    def _prepare_move_default_values(self, return_line, new_picking):
        vals = {
            'product_id': return_line.product_id.id,
            'product_uom_qty': return_line.quantity,
            'product_uom': return_line.product_id.uom_id.id,
            'picking_id': new_picking.id,
            'state': 'draft',
            'date': fields.Datetime.now(),
            'location_id': return_line.move_id.location_dest_id.id,
            'location_dest_id': self.location_id.id or return_line.move_id.location_id.id,
            'location_final_id': False,
            'picking_type_id': new_picking.picking_type_id.id,
            'warehouse_id': self.picking_id.picking_type_id.warehouse_id.id,
            'origin_returned_move_id': return_line.move_id.id,
            'procure_method': 'make_to_stock',
        }
        if new_picking.picking_type_id.code == 'outgoing':
            vals['partner_id'] = new_picking.partner_id.id
        return vals

    def _prepare_picking_default_values(self):
        vals = {
            'move_ids': [],
            'picking_type_id': self.picking_id.picking_type_id.return_picking_type_id.id or self.picking_id.picking_type_id.id,
            'state': 'draft',
            'return_id': self.picking_id.id,
            'origin': _("Return of %(picking_name)s", picking_name=self.picking_id.name),
        }
        # TestPickShip.test_mto_moves_return, TestPickShip.test_mto_moves_return_extra,
        # TestPickShip.test_pick_pack_ship_return, TestPickShip.test_pick_ship_return, TestPickShip.test_return_lot
        if self.picking_id.location_dest_id:
            vals['location_id'] = self.picking_id.location_dest_id.id
        if self.location_id:
            vals['location_dest_id'] = self.location_id.id
        return vals

    def _create_return(self):
        for return_move in self.product_return_moves.move_id:
            return_move.move_dest_ids.filtered(lambda m: m.state not in ('done', 'cancel'))._do_unreserve()

        # create new picking for returned products
        new_picking = self.picking_id.copy(self._prepare_picking_default_values())
        new_picking.user_id = False
        new_picking.message_post_with_source(
            'mail.message_origin_link',
            render_values={'self': new_picking, 'origin': self.picking_id},
            subtype_xmlid='mail.mt_note',
        )
        returned_lines = 0
        for return_line in self.product_return_moves:
            if not return_line.move_id:
                raise UserError(_("You have manually created product lines, please delete them to proceed."))
            if not float_is_zero(return_line.quantity, precision_rounding=return_line.uom_id.rounding):
                returned_lines += 1
                vals = self._prepare_move_default_values(return_line, new_picking)
                new_return_move = return_line.move_id.copy(vals)
                vals = {}

                # +--------------------------------------------------------------------------------------------------------+
                # |       picking_pick     <--Move Orig--    picking_pack     --Move Dest-->   picking_ship
                # |              | returned_move_ids              ↑                                  | returned_move_ids
                # |              ↓                                | return_line.move_id              ↓
                # |       return pick(Add as dest)          return toLink                    return ship(Add as orig)
                # +--------------------------------------------------------------------------------------------------------+
                move_orig_to_link = return_line.move_id.move_dest_ids.returned_move_ids
                # link to original move
                move_orig_to_link |= return_line.move_id
                # link to siblings of original move, if any
                move_orig_to_link |= return_line.move_id\
                    .move_dest_ids.filtered(lambda m: m.state not in ('cancel'))\
                    .move_orig_ids.filtered(lambda m: m.state not in ('cancel'))
                move_dest_to_link = return_line.move_id.move_orig_ids.returned_move_ids
                # link to children of originally returned moves, if any. Note that the use of
                # 'return_line.move_id.move_orig_ids.returned_move_ids.move_orig_ids.move_dest_ids'
                # instead of 'return_line.move_id.move_orig_ids.move_dest_ids' prevents linking a
                # return directly to the destination moves of its parents. However, the return of
                # the return will be linked to the destination moves.
                move_dest_to_link |= return_line.move_id.move_orig_ids.returned_move_ids\
                    .move_orig_ids.filtered(lambda m: m.state not in ('cancel'))\
                    .move_dest_ids.filtered(lambda m: m.state not in ('cancel'))
                vals['move_orig_ids'] = [Command.link(m.id) for m in move_orig_to_link]
                vals['move_dest_ids'] = [Command.link(m.id) for m in move_dest_to_link]
                new_return_move.write(vals)
        if not returned_lines:
            raise UserError(_("Please specify at least one non-zero quantity."))

        new_picking.action_confirm()
        new_picking.action_assign()
        return new_picking

    def action_create_returns(self):
        self.ensure_one()
        new_picking = self._create_return()
        return {
            'name': _('Returned Picking'),
            'view_mode': 'form',
            'res_model': 'stock.picking',
            'res_id': new_picking.id,
            'type': 'ir.actions.act_window',
            'context': self.env.context,
        }

    def _exchange_move_location(self):
        return self.picking_id.location_id.id

    def action_create_exchanges(self):
        """ Create a return for the active picking, then create a return of
        the return for the exchange picking and open it."""
        action = self.action_create_returns()
        if self.picking_id.picking_type_code == 'internal':
            new_picking_id = action['res_id']
            exchange_picking_wizard = self.env['stock.return.picking'].with_context(create_exchange=True).create({'picking_id': new_picking_id})
            exchange_picking = exchange_picking_wizard._create_return()
        else:
            exchange_picking = self.picking_id.copy({'move_ids': []})
            new_moves = []
            location = self._exchange_move_location()

            for return_line in self.product_return_moves:
                vals = {
                    'date': fields.Datetime.now(),
                    'location_id': location,
                }
                new_moves.append(return_line.move_id.copy(vals))
            exchange_picking.write({'move_ids': [Command.link(move.id) for move in new_moves]})
            exchange_picking.action_confirm()
            exchange_picking.action_assign()
        action['res_id'] = exchange_picking.id
        return action
