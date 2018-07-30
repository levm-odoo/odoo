# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging

import odoo
import odoo.tests


_logger = logging.getLogger(__name__)


@odoo.tests.tagged('post_install', '-at_install')
class TestReports(odoo.tests.TransactionCase):
    def test_reports(self):
        product1 = self.env['product.product'].create({
            'name': 'Mellohi',
            'default_code': 'C418',
            'type': 'product',
            'categ_id': self.env.ref('product.product_category_all').id,
            'tracking': 'lot',
            'barcode': 'scan_me'
        })
        lot1 = self.env['stock.production.lot'].create({
            'name': 'Volume Beta',
            'product_id': product1.id,
        })
        report = self.env.ref('stock_zebra.label_lot_template')
        target = b'\n                          \n^XA\n^FO100,50\n^A0N,44,33^FD[C418] Mellohi^FS\n^FO100,100\n^A0N,44,33^FDLN/SN: Volume Beta^FS\n^FO100,150^BY3\n^BCN,100,Y,N,N\n^FDVolume Beta^FS\n^XZ\n\n      '

        rendering, qweb_type = report.render_qweb_other(lot1.id)
        self.assertEqual(target, rendering, 'The rendering is not good')
        self.assertEqual(qweb_type, 'other', 'the report type is not good')
