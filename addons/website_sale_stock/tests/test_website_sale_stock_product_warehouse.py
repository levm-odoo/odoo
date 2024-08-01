# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import tagged

from odoo.addons.sale.tests.test_sale_product_attribute_value_config import TestSaleProductAttributeValueCommon
from odoo.addons.website_sale.tests.common import MockRequest


@tagged('post_install', '-at_install')
class TestWebsiteSaleStockProductWarehouse(TestSaleProductAttributeValueCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Run the tests in another company, so the tests do not rely on the
        # database state (eg the default company's warehouse)
        cls.company = cls.env['res.company'].create({'name': 'Company C'})
        cls.env.user.company_id = cls.company
        cls.website = cls.env['website'].create({'name': 'Website Company C'})
        cls.website.company_id = cls.company

        # Set two warehouses (one was created on company creation)
        cls.warehouse_1 = cls.env['stock.warehouse'].search([('company_id', '=', cls.company.id)])
        cls.warehouse_2 = cls.env['stock.warehouse'].create({
            'name': 'Warehouse 2',
            'code': 'WH2'
        })

        # Create two stockable products
        cls.product_A = cls.env['product.product'].create({
            'name': 'Product A',
            'allow_out_of_stock_order': False,
            'is_storable': True,
            'default_code': 'E-COM1',
        })

        cls.product_B = cls.env['product.product'].create({
            'name': 'Product B',
            'allow_out_of_stock_order': False,
            'is_storable': True,
            'default_code': 'E-COM2',
        })

        cls.test_env = cls.env['base'].with_context(
            website_id=cls.website.id,
            website_sale_stock_get_quantity=True,
        ).env

        # Add 10 Product A in WH1 and 15 Product 1 in WH2
        quants = cls.env['stock.quant'].with_context(inventory_mode=True).create([{
            'product_id': cls.product_A.id,
            'inventory_quantity': qty,
            'location_id': wh.lot_stock_id.id,
        } for wh, qty in [(cls.warehouse_1, 10.0), (cls.warehouse_2, 15.0)]])

        # Add 10 Product 2 in WH2
        quants |= cls.env['stock.quant'].with_context(inventory_mode=True).create({
            'product_id': cls.product_B.id,
            'inventory_quantity': 10.0,
            'location_id': cls.warehouse_2.lot_stock_id.id,
        })
        quants.action_apply_inventory()

    def test_get_combination_info_free_qty_when_warehouse_is_set(self):
        self.website.warehouse_id = self.warehouse_2
        test_env = self.test_env
        with MockRequest(test_env, website=self.website.with_env(test_env)):
            combination_info = self.product_A.with_env(test_env)._get_combination_info_variant()
            self.assertEqual(combination_info['free_qty'], 15)
        with MockRequest(test_env, website=self.website.with_env(test_env)):
            combination_info = self.product_B.with_env(test_env)._get_combination_info_variant()
            self.assertEqual(combination_info['free_qty'], 10)

    def test_get_combination_info_free_qty_when_no_warehouse_is_set(self):
        self.website.warehouse_id = False
        test_env = self.test_env
        with MockRequest(test_env, website=self.website.with_env(test_env)):
            combination_info = self.product_A.with_env(test_env)._get_combination_info_variant()
        self.assertEqual(combination_info['free_qty'], 25)
        with MockRequest(test_env, website=self.website.with_env(test_env)):
            combination_info = self.product_B.with_env(test_env)._get_combination_info_variant()
        self.assertEqual(combination_info['free_qty'], 10)

    def test_02_update_cart_with_multi_warehouses(self):
        """ When the user updates his cart and increases a product quantity, if
        this quantity is not available in the SO's warehouse, a warning should
        be returned and the quantity updated to its maximum. """

        so = self.env['sale.order'].create({
            'website_id': self.website.id,
            'partner_id': self.env.user.partner_id.id,
            'order_line': [(0, 0, {
                'name': self.product_A.name,
                'product_id': self.product_A.id,
                'product_uom_qty': 5,
                'price_unit': self.product_A.list_price,
            })]
        })

        with MockRequest(self.env, website=self.website, sale_order_id=so.id) as req:
            website_so = req.cart
            self.assertEqual(website_so, so)
            self.assertEqual(
                website_so.order_line.product_id.virtual_available,
                25,
                "This quantity should be based on all warehouses.",
            )

            values = so._cart_update(
                product_id=self.product_A.id, line_id=so.order_line.id, set_qty=30
            )
            self.assertTrue(values.get('warning', False))
            self.assertEqual(values.get('quantity'), 25)
