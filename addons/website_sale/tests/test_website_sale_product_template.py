# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime

from odoo.fields import Command
from odoo.tests import tagged

from odoo.addons.website.tools import MockRequest
from odoo.addons.website_sale.tests.common import WebsiteSaleCommon


@tagged('post_install', '-at_install')
class TestWebsiteSaleProductTemplate(WebsiteSaleCommon):

    def test_website_sale_get_configurator_display_price(self):
        self.website.show_line_subtotals_tax_selection = 'tax_included'
        tax = self.env['account.tax'].create({'name': "Test tax", 'amount': 10})
        product = self._create_product(list_price=100, tax_ids=[Command.link(tax.id)])

        env = self.env(user=self.public_user)
        with MockRequest(env, website=self.website.with_env(env)):
            configurator_price = self.env['product.template']._get_configurator_display_price(
                product_or_template=product,
                quantity=3,
                date=datetime(2000, 1, 1),
                currency=self.currency,
                pricelist=self.pricelist,
            )

        self.assertEqual(configurator_price[0], 110)
