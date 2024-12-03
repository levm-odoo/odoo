# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.uom.tests.common import UomCommon


class TestUom(UomCommon):

    def test_10_conversion(self):
        qty = self.uom_gram._compute_quantity(1020000, self.uom_kgm)
        self.assertEqual(qty, 1020, "Converted quantity does not correspond.")

        price = self.uom_gram._compute_price(2, self.uom_kgm)
        self.assertEqual(price, 2000, "Converted price does not correspond.")

        # If the conversion factor for Dozens (1/12) is not stored with sufficient precision,
        # the conversion of 1 Dozen into Units will give e.g. 12.00000000000047 Units
        # and the Unit rounding will round that up to 13.
        # This is a partial regression test for rev. 311c77bb, which is further improved
        # by rev. fa2f7b86.
        qty = self.uom_pack_of_6._compute_quantity(1, self.uom_unit)
        self.assertEqual(qty, 6.0, "Converted quantity does not correspond.")

        # Regression test for side-effect of commit 311c77bb - converting 1234 Grams
        # into Kilograms should work even if grams are rounded to 1.
        qty = self.uom_gram._compute_quantity(1234, self.uom_kgm, precision_digits=2)
        self.assertEqual(qty, 1.24, "Converted quantity does not correspond.")

    def test_20_rounding(self):
        product_uom = self.env['uom.uom'].create({
            'name': 'Score',
            'relative_factor': 20,
        })

        qty = self.uom_unit._compute_quantity(2, product_uom)
        self.assertEqual(qty, 1, "Converted quantity should be rounded up.")
