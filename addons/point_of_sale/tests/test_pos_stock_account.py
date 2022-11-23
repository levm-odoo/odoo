# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import tools
import odoo
from odoo.addons.point_of_sale.tests.common import TestPoSCommon

@odoo.tests.tagged('post_install', '-at_install')
class TestPoSStock(TestPoSCommon):
    """ Tests for anglo saxon accounting scenario.
    """
    def setUp(self):
        super(TestPoSStock, self).setUp()

        self.config = self.basic_config
        self.product1 = self.create_product('Product 1', self.categ_anglo, 10.0, 5.0)
        self.product2 = self.create_product('Product 2', self.categ_anglo, 20.0, 10.0)
        self.product3 = self.create_product('Product 3', self.categ_basic, 30.0, 15.0)
        # start inventory with 10 items for each product
        self.adjust_inventory([self.product1, self.product2, self.product3], [10, 10, 10])

        # change cost(standard_price) of anglo products
        # then set inventory from 10 -> 15
        self.product1.write({'standard_price': 6.0})
        self.product2.write({'standard_price': 6.0})
        self.adjust_inventory([self.product1, self.product2, self.product3], [15, 15, 15])

        # change cost(standard_price) of anglo products
        # then set inventory from 15 -> 25
        self.product1.write({'standard_price': 13.0})
        self.product2.write({'standard_price': 13.0})
        self.adjust_inventory([self.product1, self.product2, self.product3], [25, 25, 25])

        self.output_account = self.categ_anglo.property_stock_account_output_categ_id
        self.expense_account = self.categ_anglo.property_account_expense_categ_id
        self.valuation_account = self.categ_anglo.property_stock_valuation_account_id

    def test_01_orders_no_invoiced(self):
        """

        Orders
        ======
        +---------+----------+-----+-------------+------------+
        | order   | product  | qty | total price | total cost |
        +---------+----------+-----+-------------+------------+
        | order 1 | product1 |  10 |       100.0 |       50.0 |  -> 10 items at cost of 5.0 is consumed, remains 5 items at 6.0 and 10 items at 13.0
        |         | product2 |  10 |       200.0 |      100.0 |  -> 10 items at cost of 10.0 is consumed, remains 5 items at 6.0 and 10 items at 13.0
        +---------+----------+-----+-------------+------------+
        | order 2 | product2 |   7 |       140.0 |       56.0 |  -> 5 items at cost of 6.0 and 2 items at cost of 13.0, remains 8 items at cost of 13.0
        |         | product3 |   7 |       210.0 |        0.0 |
        +---------+----------+-----+-------------+------------+
        | order 3 | product1 |   6 |        60.0 |       43.0 |  -> 5 items at cost of 6.0 and 1 item at cost of 13.0, remains 9 items at cost of 13.0
        |         | product2 |   6 |       120.0 |       78.0 |  -> 6 items at cost of 13.0, remains 2 items at cost of 13.0
        |         | product3 |   6 |       180.0 |        0.0 |
        +---------+----------+-----+-------------+------------+

        Expected Result
        ===============
        +---------------------+---------+
        | account             | balance |
        +---------------------+---------+
        | sale_account        | -1010.0 |
        | pos_receivable-cash |  1010.0 |
        | expense_account     |   327.0 |
        | output_account      |  -327.0 |
        +---------------------+---------+
        | Total balance       |    0.00 |
        +---------------------+---------+
        """

        def _before_closing_cb():
            # check values before closing the session
            self.assertEqual(3, self.pos_session.order_count)
            orders_total = sum(order.amount_total for order in self.pos_session.order_ids)
            self.assertAlmostEqual(orders_total, self.pos_session.total_payments_amount, msg='Total order amount should be equal to the total payment amount.')
            self.assertAlmostEqual(orders_total, 1010.0, msg='The orders\'s total amount should equal the computed.')

            # check product qty_available after syncing the order
            self.assertEqual(self.product1.qty_available, 9)
            self.assertEqual(self.product2.qty_available, 2)
            self.assertEqual(self.product3.qty_available, 12)

            # picking and stock moves should be in done state
            for order in self.pos_session.order_ids:
                self.assertEqual(order.picking_ids[0].state, 'done', 'Picking should be in done state.')
                self.assertTrue(all(state == 'done' for state in order.picking_ids[0].move_ids.mapped('state')), 'Move Lines should be in done state.')

        self._run_test({
            'payment_methods': self.cash_pm1 | self.bank_pm1,
            'orders': [
                {'pos_order_lines_ui_args': [(self.product1, 10), (self.product2, 10)], 'uid': '00100-010-0001'},
                {'pos_order_lines_ui_args': [(self.product2, 7), (self.product3, 7)], 'uid': '00100-010-0002'},
                {'pos_order_lines_ui_args': [(self.product1, 6), (self.product2, 6), (self.product3, 6)], 'uid': '00100-010-0003'},
            ],
            'before_closing_cb': _before_closing_cb,
            'journal_entries_before_closing': {},
            'journal_entries_after_closing': {
                'session_journal_entry': {
                    'line_ids': [
                        {'account_id': self.output_account.id, 'partner_id': False, 'debit': 0, 'credit': 327, 'reconciled': True},
                        {'account_id': self.sales_account.id, 'partner_id': False, 'debit': 0, 'credit': 1010.0, 'reconciled': False},
                        {'account_id': self.expense_account.id, 'partner_id': False, 'debit': 327, 'credit': 0, 'reconciled': False},
                        {'account_id': self.cash_pm1.receivable_account_id.id, 'partner_id': False, 'debit': 1010.0, 'credit': 0, 'reconciled': True},
                    ],
                },
                'cash_statement': [
                    {
                        'amount': 300,
                        'line_ids': [
                            {'account_id': self.cash_pm1.journal_id.default_account_id.id, 'partner_id': False, 'debit': 300, 'credit': 0, 'reconciled': False},
                            {'account_id': self.cash_pm1.receivable_account_id.id, 'partner_id': False, 'debit': 0, 'credit': 300, 'reconciled': True},
                        ]
                    },
                    {
                        'amount': 350,
                        'line_ids': [
                            {'account_id': self.cash_pm1.journal_id.default_account_id.id, 'partner_id': False, 'debit': 350, 'credit': 0, 'reconciled': False},
                            {'account_id': self.cash_pm1.receivable_account_id.id, 'partner_id': False, 'debit': 0, 'credit': 350, 'reconciled': True},
                        ]
                    },
                    {
                        'amount': 360,
                        'line_ids': [
                            {'account_id': self.cash_pm1.journal_id.default_account_id.id, 'partner_id': False, 'debit': 360.0, 'credit': 0, 'reconciled': False},
                            {'account_id': self.cash_pm1.receivable_account_id.id, 'partner_id': False, 'debit': 0, 'credit': 360.0, 'reconciled': True},
                        ]
                    },
                ],
                'bank_payments': [],
            },
        })

    def test_02_orders_with_invoice(self):
        """

        Orders
        ======
        Same with test_01 but order 3 is invoiced.

        Expected Result
        ===============
        +---------------------+---------+
        | account             | balance |
        +---------------------+---------+
        | sale_account        |  -650.0 |
        | pos_receivable-cash |   650.0 |
        | expense_account     |   206.0 |
        | output_account      |  -206.0 |
        +---------------------+---------+
        | Total balance       |    0.00 |
        +---------------------+---------+
        """

        def _before_closing_cb():
            # check values before closing the session
            self.assertEqual(3, self.pos_session.order_count)
            orders_total = sum(order.amount_total for order in self.pos_session.order_ids)
            self.assertAlmostEqual(orders_total, self.pos_session.total_payments_amount, msg='Total order amount should be equal to the total payment amount.')
            self.assertAlmostEqual(orders_total, 1010.0, msg='The orders\'s total amount should equal the computed.')

            # check product qty_available after syncing the order
            self.assertEqual(self.product1.qty_available, 9)
            self.assertEqual(self.product2.qty_available, 2)
            self.assertEqual(self.product3.qty_available, 12)

            # picking and stock moves should be in done state
            for order in self.pos_session.order_ids:
                self.assertEqual(order.picking_ids[0].state, 'done', 'Picking should be in done state.')
                self.assertTrue(all(state == 'done' for state in order.picking_ids[0].move_ids.mapped('state')), 'Move Lines should be in done state.')

        self._run_test({
            'payment_methods': self.cash_pm1 | self.bank_pm1,
            'orders': [
                {'pos_order_lines_ui_args': [(self.product1, 10), (self.product2, 10)], 'uid': '00100-010-0001'},
                {'pos_order_lines_ui_args': [(self.product2, 7), (self.product3, 7)], 'uid': '00100-010-0002'},
                {'pos_order_lines_ui_args': [(self.product1, 6), (self.product2, 6), (self.product3, 6)], 'is_invoiced': True, 'customer': self.customer, 'uid': '00100-010-0003'},
            ],
            'before_closing_cb': _before_closing_cb,
            'journal_entries_before_closing': {
                '00100-010-0003': {
                    'payments': [
                        {
                            'payment_method_id': self.cash_pm1,
                            'line_ids': [
                                {'account_id': self.c1_receivable.id, 'partner_id': self.customer.id, 'debit': 0, 'credit': 360.0, 'reconciled': True},
                                {'account_id': self.pos_receivable_account.id, 'partner_id': False, 'debit': 360.0, 'credit': 0, 'reconciled': False},
                            ]
                        },
                    ],
                    'cash_statement': [
                        {
                            'amount': 360,
                            'line_ids': [
                                {'account_id': self.cash_pm1.journal_id.default_account_id.id, 'partner_id': self.customer.id, 'debit': 360, 'credit': 0, 'reconciled': False},
                                {'account_id': self.c1_receivable.id, 'partner_id': self.customer.id, 'debit': 0, 'credit': 360, 'reconciled': True},
                            ]
                        },
                    ],
                },
            },
            'journal_entries_after_closing': {
                'session_journal_entry': {
                    'line_ids': [
                        {'account_id': self.output_account.id, 'partner_id': False, 'debit': 0, 'credit': 206, 'reconciled': True},
                        {'account_id': self.sales_account.id, 'partner_id': False, 'debit': 0, 'credit': 650, 'reconciled': False},
                        {'account_id': self.expense_account.id, 'partner_id': False, 'debit': 206, 'credit': 0, 'reconciled': False},
                        {'account_id': self.cash_pm1.receivable_account_id.id, 'partner_id': False, 'debit': 650, 'credit': 0, 'reconciled': True},
                    ],
                },
                'cash_statement': [
                    {
                        'amount': 300,
                        'line_ids': [
                            {'account_id': self.cash_pm1.journal_id.default_account_id.id, 'partner_id': False, 'debit': 300, 'credit': 0, 'reconciled': False},
                            {'account_id': self.cash_pm1.receivable_account_id.id, 'partner_id': False, 'debit': 0, 'credit': 300, 'reconciled': True},
                        ]
                    },
                    {
                        'amount': 350,
                        'line_ids': [
                            {'account_id': self.cash_pm1.journal_id.default_account_id.id, 'partner_id': False, 'debit': 350, 'credit': 0, 'reconciled': False},
                            {'account_id': self.cash_pm1.receivable_account_id.id, 'partner_id': False, 'debit': 0, 'credit': 350, 'reconciled': True},
                        ]
                    },
                    {
                        'amount': 360,
                        'line_ids': [
                            {'account_id': self.cash_pm1.journal_id.default_account_id.id, 'partner_id': self.customer.id, 'debit': 360, 'credit': 0, 'reconciled': False},
                            {'account_id': self.c1_receivable.id, 'partner_id': self.customer.id, 'debit': 0, 'credit': 360, 'reconciled': True},
                        ]
                    },
                ],
                'bank_payments': [],
            },
        })

    def test_03_order_product_w_owner(self):
        """
        Test order via POS a product having stock owner.
        """

        group_owner = self.env.ref('stock.group_tracking_owner')
        self.env.user.write({'groups_id': [(4, group_owner.id)]})
        self.product4 = self.create_product('Product 3', self.categ_basic, 30.0, 15.0)
        self.env['stock.quant'].with_context(inventory_mode=True).create({
            'product_id': self.product4.id,
            'inventory_quantity': 10,
            'location_id': self.stock_location_components.id,
            'owner_id': self.partner_a.id,
        }).action_apply_inventory()

        self.open_new_session()

        # create orders
        orders = []
        orders.append(self.create_ui_order_data([(self.product4, 1)]))

        # sync orders
        order = self.env['pos.order'].create_from_ui(orders)

        # check values before closing the session
        self.assertEqual(1, self.pos_session.order_count)

        # check product qty_available after syncing the order
        self.assertEqual(self.product4.qty_available, 9)

        # picking and stock moves should be in done state
        for order in self.pos_session.order_ids:
            self.assertEqual(order.picking_ids[0].state, 'done', 'Picking should be in done state.')
            self.assertTrue(all(state == 'done' for state in order.picking_ids[0].move_ids.mapped('state')), 'Move Lines should be in done state.')
            self.assertTrue(self.partner_a == order.picking_ids[0].move_ids[0].move_line_ids[0].owner_id, 'Move Lines Owner should be taken into account.')

        # close the session
        self.pos_session.action_pos_session_validate()
