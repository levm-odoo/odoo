#  -*- coding: utf-8 -*-
#  Part of Odoo. See LICENSE file for full copyright and licensing details.


from odoo import models, fields, api


class StockZeroQuantityCount(models.TransientModel):
    _name = 'stock.zero.quantity.count'
    _description = 'Zero Quantity Count'

    location_ids = fields.Many2many('stock.location')
    location_names = fields.Char('Locations Names', compute='_compute_location_names')
    pick_ids = fields.Many2many('stock.picking')

    @api.depends('location_ids')
    def _compute_location_names(self):
        self.location_names = ', '.join([name[name.find('/') + 1:] for name in self.location_ids.mapped('complete_name')])

    def button_confirm_zqc(self):
        pickings_to_validate = self.env.context.get('button_validate_picking_ids')
        if pickings_to_validate:
            return self.env['stock.picking'].browse(pickings_to_validate).with_context(skip_zqc=True).button_validate()
        return True

    def button_inventory(self):
        """ Prepare the inventory from ZQC action and returns it as a
        'target: new'.
        """

        inventory = self.env['stock.inventory'].create({
            'name': 'Zero Quantity Count adjustment',
            'location_ids': [(6, 0, self.location_ids.ids)],
            'start_empty': True
        })

        self.pick_ids.inventory_ids |= inventory
        res = inventory.action_start()
        res['target'] = 'new'

        # We dont want to override the generated context of the action, but we still need
        # to pass the context keys generated by the validation process
        res['context'].update(self.env.context)

        # We override the view to hide the theoretical_qty and difference_qty as they're not relevant
        # when the inventory is triggered from a ZQC
        res['views'] = [(self.env.ref('stock.stock_inventory_line_tree_zqc').id, 'tree')]
        return res
