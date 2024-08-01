# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.fields import Command
from odoo.tests import tagged

from odoo.addons.sale.tests.test_sale_product_attribute_value_config import (
    TestSaleProductAttributeValueCommon,
)
from odoo.addons.website_sale.tests.common import MockRequest


@tagged('post_install', '-at_install', 'product_attribute')
class TestWebsiteSaleProductAttributeValueConfig(TestSaleProductAttributeValueCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Use the testing environment.
        cls.env['website'].get_current_website().company_id = cls.env.company
        cls.computer.company_id = cls.env.company
        cls.computer = cls.computer.with_env(cls.env)
        cls.other_currency = cls.setup_other_currency('GBP')

    def test_get_combination_info(self):
        # Setup website.
        website = self.env['website'].create({
            'name': "Test website",
            'company_id': self.env.company.id,
            'user_id': self.env.user.id,
        })

        # Setup pricelist: make sure the pricelist has a 10% discount
        self.env['product.pricelist'].search([]).action_archive()
        pricelist = self.env['product.pricelist'].create({
            'name': "test_get_combination_info",
            'currency_id': self.other_currency.id,
            'company_id': self.env.company.id,
            'item_ids': [Command.create({
                'percent_price': 10,
                'compute_price': 'percentage',
            })],
            'website_id': website.id,
        })

        # Setup product with 15% tax.
        product_template = self.computer.with_context(website_id=website.id)
        product_template.write({
            'taxes_id': [Command.set(self.company_data['default_tax_sale'].ids)],
            'company_id': self.env.company.id,
        })

        tax_ratio = 1.15
        discount_rate = 0.9
        currency_ratio = 2

        # CASE: B2B setting (default)
        with MockRequest(product_template.env, website=website, website_sale_current_pl=pricelist.id):
            combination_info = product_template._get_combination_info()
            self.assertEqual(combination_info['price'], 2222 * discount_rate * currency_ratio)
            self.assertEqual(combination_info['list_price'], 2222 * currency_ratio)
            self.assertEqual(combination_info['has_discounted_price'], True)

            # CASE: B2C setting
            website.show_line_subtotals_tax_selection = 'tax_included'

            combination_info = product_template._get_combination_info()
            self.assertEqual(combination_info['price'], 2222 * discount_rate * currency_ratio * tax_ratio)
            self.assertAlmostEqual(combination_info['list_price'], 2222 * currency_ratio * tax_ratio)
            self.assertEqual(combination_info['has_discounted_price'], True)

    def test_get_combination_info_with_fpos(self):
        # Setup product.
        product = self.env['product.template'].create({
            'name': 'Test Product',
            'list_price': 2000,
            'taxes_id': [Command.set(self.company_data['default_tax_sale'].ids)],
            'company_id': self.env.company.id,
        })

        # Setup website.
        website = self.env['website'].create({
            'name': "Test website",
            'company_id': self.env.company.id,
            'user_id': self.env.user.id,
        })

        # Setup pricelist: make sure the pricelist has a 10% discount
        self.env['product.pricelist'].search([]).action_archive()
        self.env['product.pricelist'].create({
            'name': "test_get_combination_info",
            'company_id': self.env.company.id,
            'website_id': website.id,
            'item_ids': [Command.create({
                'applied_on': "1_product",
                'base': "list_price",
                'compute_price': "fixed",
                'fixed_price': 500,
                'product_tmpl_id': product.id,
            })],
        })

        product = product.with_context(website_id=website.id)

        # Setup product attributes.
        computer_ssd_attribute_lines = self.env['product.template.attribute.line'].create({
            'product_tmpl_id': product.id,
            'attribute_id': self.ssd_attribute.id,
            'value_ids': [(6, 0, [self.ssd_256.id])],
        })
        computer_ssd_attribute_lines.product_template_value_ids[0].price_extra = 200

        # Enable tax included
        website.show_line_subtotals_tax_selection = 'tax_included'

        with MockRequest(product.env, website=website):
            combination_info = product._get_combination_info()
        self.assertEqual(combination_info['price'], 575, "500$ + 15% tax")
        self.assertEqual(combination_info['list_price'], 575, "500$ + 15% tax (2)")

        # Setup fiscal position 15% => 0%.
        us_country = self.env.ref('base.us')
        tax0 = self.env['account.tax'].create({'name': "Test tax 0", 'amount': 0})
        self.env['account.fiscal.position'].create({
            'name': "test_get_combination_info_with_fpos",
            'auto_apply': True,
            'country_id': us_country.id,
            'tax_ids': [Command.create({
                'tax_src_id': self.company_data['default_tax_sale'].id,
                'tax_dest_id': tax0.id,
            })],
        })

        # Now with fiscal position, taxes should be mapped
        self.env.user.partner_id.country_id = us_country
        with MockRequest(product.env, website=website):
            combination_info = product._get_combination_info()
        self.assertEqual(combination_info['price'], 500, "500% + 0% tax (mapped from fp 15% -> 0%)")
        self.assertEqual(combination_info['list_price'], 500, "500% + 0% tax (mapped from fp 15% -> 0%)")

        # Try same flow with tax included
        self.company_data['default_tax_sale'].price_include_override = 'tax_included'

        # Reset / Safety check
        self.env.user.partner_id.country_id = None
        with MockRequest(product.env, website=website):
            combination_info = product._get_combination_info()
        self.assertEqual(combination_info['price'], 500, "434.78$ + 15% tax")
        self.assertEqual(combination_info['list_price'], 500, "434.78$ + 15% tax (2)")

        # Now with fiscal position, taxes should be mapped
        self.env.user.partner_id.country_id = us_country.id
        with MockRequest(product.env, website=website):
            combination_info = product._get_combination_info()
        self.assertEqual(round(combination_info['price'], 2), 434.78, "434.78$ + 0% tax (mapped from fp 15% -> 0%)")
        self.assertEqual(round(combination_info['list_price'], 2), 434.78, "434.78$ + 0% tax (mapped from fp 15% -> 0%)")

        # Try same flow with tax included for apply tax
        tax0.write({'name': "Test tax 5", 'amount': 5, 'price_include_override': 'tax_included'})
        with MockRequest(product.env, website=website):
            combination_info = product._get_combination_info()
        self.assertEqual(round(combination_info['price'], 2), 456.52, "434.78$ + 5% tax (mapped from fp 15% -> 5% for BE)")
        self.assertEqual(round(combination_info['list_price'], 2), 456.52, "434.78$ + 5% tax (mapped from fp 15% -> 5% for BE)")
