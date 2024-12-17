# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo.addons.l10n_tw_edi_ecpay.tests.test_edi import L10nTWITestEdi
from odoo.tests import Form, tagged


CALL_API_METHOD = 'odoo.addons.l10n_tw_edi_ecpay.utils.EcPayAPI.call_ecpay_api'


@tagged('post_install_l10n', 'post_install', '-at_install')
class L10nTWITestEdiSaleOrder(L10nTWITestEdi):
    def test_01_so_data_forward_to_invoice(self):
        form = Form(self.env['sale.order'])
        form.partner_id = self.partner_a
        form.l10n_tw_edi_is_print = True
        form.l10n_tw_edi_love_code = "ABC123"
        form.l10n_tw_edi_carrier_type = "2"
        form.l10n_tw_edi_carrier_number = "12345678"

        with form.order_line.new() as line:
            line.name = self.product_a.name
            line.product_id = self.product_a
            line.product_uom_qty = 1

        so = form.save()
        so.action_confirm()

        inv = self.env['account.move'].create(so._prepare_invoice())

        self.assertEqual(inv.l10n_tw_edi_is_print, so.l10n_tw_edi_is_print)
        self.assertEqual(inv.l10n_tw_edi_love_code, so.l10n_tw_edi_love_code)
        self.assertEqual(inv.l10n_tw_edi_carrier_type, so.l10n_tw_edi_carrier_type)
        self.assertEqual(inv.l10n_tw_edi_carrier_number, so.l10n_tw_edi_carrier_number)
