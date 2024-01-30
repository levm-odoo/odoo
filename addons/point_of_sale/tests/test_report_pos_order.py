# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo.addons.point_of_sale.tests.common import TestPoSCommon


class TestReportPoSOrder(TestPoSCommon):

    def setUp(self):
        super(TestReportPoSOrder, self).setUp()
        self.config = self.basic_config

    def test_report_pos_order(self):

        product1 = self.create_product('Product 1', self.categ_basic, 150)

        self.open_new_session()
        session = self.pos_session

        self.env['pos.order'].create({
            'session_id': session.id,
            'lines': [(0, 0, {
                'name': "OL/0001",
                'product_id': product1.id,
                'price_unit': 150,
                'discount': 0,
                'qty': 1.0,
                'price_subtotal': 150,
                'price_subtotal_incl': 150,
            }),],
            'amount_total': 150.0,
            'amount_tax': 0.0,
            'amount_paid': 0.0,
            'amount_return': 0.0,
        })

        # PoS Orders have negative IDs to avoid conflict, so reports[0] will correspond to the newest order
        reports = self.env['report.pos.order'].sudo().search([('product_id', '=', product1.id)], order='id')

        self.assertEqual(reports[0].margin, 150)
