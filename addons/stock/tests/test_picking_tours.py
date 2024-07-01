# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import Command
from odoo.tests import Form, HttpCase, tagged


@tagged('-at_install', 'post_install')
class TestStockPickingTour(HttpCase):
    def setUp(self):
        self.receipt = self.env['stock.picking'].create({
            'picking_type_id': self.env.ref('stock.picking_type_in').id,
            'location_id': self.env.ref('stock.stock_location_suppliers').id,
            'location_dest_id': self.env.ref('stock.stock_location_stock').id,
        })

        return super().setUp()

    def _get_picking_url(self, picking_id):
        action = self.env["ir.actions.actions"]._for_xml_id("stock.action_picking_tree_incoming")
        return '/web#action=%s&id=%s&model=stock.picking&view_type=form' % (action['id'], picking_id)

    def test_detailed_op_no_save_1(self):
        """validate a receipt with some move without any save except the last one"""
        product_lot = self.env['product.product'].create({
            'name': 'Product Lot',
            'type': 'product',
            'tracking': 'lot',
        })
        url = self._get_picking_url(self.receipt.id)

        self.start_tour(url, 'test_detailed_op_no_save_1', login='admin', timeout=60)
        self.assertEqual(self.receipt.state, 'done')
        self.assertEqual(self.receipt.move_ids.product_uom_qty, 0)
        self.assertEqual(self.receipt.move_ids.quantity, 4)
        lot = self.env['stock.lot'].search([
            ('name', '=', 'lot1'),
            ('product_id', '=', product_lot.id),
        ])
        self.assertEqual(len(lot), 1)
        self.assertEqual(lot.product_qty, 4)

    def test_generate_serial_1(self):
        """generate some serial numbers in the detailed operation modal"""
        product_serial = self.env['product.product'].create({
            'name': 'Product Serial',
            'type': 'product',
            'tracking': 'serial',
        })
        url = self._get_picking_url(self.receipt.id)

        self.start_tour(url, 'test_generate_serial_1', login='admin', timeout=60)
        self.assertEqual(self.receipt.state, 'done')
        self.assertEqual(self.receipt.move_ids.product_uom_qty, 0)
        self.assertEqual(self.receipt.move_ids.quantity, 5)
        self.assertEqual(len(self.receipt.move_ids.move_line_ids), 5)

        serial = self.env['stock.lot'].search([
            ('name', 'ilike', 'serial_n_%'),
            ('product_id', '=', product_serial.id),
        ])
        self.assertEqual(len(serial), 5)

    def test_add_new_line(self):
        product_one, _ = self.env["product.product"].create([
            {
                'name': 'Product one',
                'type': 'product',
                'tracking': 'serial',
            },
            {
                'name': 'Product two',
                'type': 'product',
                'tracking': 'serial',
            }
        ])

        self.receipt.write({
            "move_ids": [Command.create({
                "name": "test",
                "product_uom_qty": 1,
                "product_id": product_one.id,
                "location_id": self.receipt.location_id.id,
                "location_dest_id": self.receipt.location_dest_id.id,
            })]
        })

        self.receipt.action_confirm()
        self.receipt.move_ids.move_line_ids.lot_name = "one"

        url = self._get_picking_url(self.receipt.id)
        self.start_tour(url, 'test_add_new_line', login='admin', timeout=60)

        names = self.receipt.move_ids.move_line_ids.mapped('lot_name')
        self.assertEqual(names, ["two", "one"])

    def test_edit_existing_line(self):
        self.uom_unit = self.env.ref('uom.product_uom_unit')
        product_one = self.env['product.product'].create({
            'name': 'Product one',
            'type': 'product',
            'tracking': 'serial',
        })

        self.receipt.write({
            "move_ids": [Command.create({
                "name": "test",
                "product_id": product_one.id,
                "location_id": self.receipt.location_id.id,
                "location_dest_id": self.receipt.location_dest_id.id,
                "product_uom_qty": 1,
            })]
        })

        self.receipt.action_confirm()
        self.receipt.move_ids.move_line_ids.lot_name = "one"

        url = self._get_picking_url(self.receipt.id)
        self.start_tour(url, 'test_edit_existing_line', login='admin', timeout=60)

        names = self.receipt.move_ids.move_line_ids.mapped('lot_name')
        self.assertEqual(names, ["one", "two"])

    def test_onchange_serial_lot_ids(self):
        """
        Checks that onchange behaves correctly with respect to multiple unlinks
        """
        product_serial = self.env['product.product'].create({
            'name': 'PSerial',
            'type': 'product',
            'tracking': 'serial',
            'categ_id': self.env.ref('product.product_category_all').id,
        })

        lots = self.env['stock.lot'].create([
            {
            'name': 'SN01',
            'product_id': product_serial.id,
            'company_id': self.env.company.id,
            },
            {
            'name': 'SN02',
            'product_id': product_serial.id,
            'company_id': self.env.company.id,
            },
            {
            'name': 'SN03',
            'product_id': product_serial.id,
            'company_id': self.env.company.id,
            },
        ])
        stock_location = self.env.ref('stock.stock_location_stock')
        self.env['stock.quant']._update_available_quantity(product_serial, stock_location, 1, lot_id=lots[0])
        self.env['stock.quant']._update_available_quantity(product_serial, stock_location, 1, lot_id=lots[1])
        self.env['stock.quant']._update_available_quantity(product_serial, stock_location, 1, lot_id=lots[2])
        picking = self.env['stock.picking'].create({
            'location_id': stock_location.id,
            'location_dest_id': self.ref('stock.stock_location_customers'),
            'picking_type_id': self.ref('stock.picking_type_out'),
            'move_ids': [Command.create({
                'name': product_serial.name,
                'product_id': product_serial.id,
                'product_uom_qty': 3,
                'product_uom': product_serial.uom_id.id,
                'location_id': stock_location.id,
                'location_dest_id': self.ref('stock.stock_location_customers'),
            })]
        })
        picking.action_confirm()
        with Form(picking) as picking_form:
            with picking_form.move_ids_without_package.edit(0) as move_form:
                move_form.quantity = 3.0
                move_form.lot_ids = lots
        picking = picking_form.save()

        url = self._get_picking_url(picking.id)
        self.start_tour(url, 'test_onchange_twice_lot_ids', login='admin', step_delay=100)
        self.assertRecordValues(picking.move_ids, [{"quantity": 1, "lot_ids": lots[2].ids}])
