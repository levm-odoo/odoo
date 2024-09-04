import odoo
import odoo.tests


@odoo.tests.common.tagged('post_install', '-at_install')
class TestSnippets(odoo.tests.HttpCase):

    def test_01_donation(self):
        if self.env['ir.module.module']._get('payment_demo').state != 'installed':
            self.skipTest("Payment Provider: Demo module is not installed")

        demo_provider = self.env['payment.provider'].search([('code', '=', "demo")])
        demo_provider.write({'state': 'test'})

        self.start_tour("/?enable_editor=1", "donation_snippet_edition", login='admin')
