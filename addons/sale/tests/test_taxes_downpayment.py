from odoo.addons.account.tests.test_taxes_downpayment import TestTaxesDownPayment
from odoo.addons.sale.tests.common import TestTaxCommonSale
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestTaxesDownPaymentSale(TestTaxCommonSale, TestTaxesDownPayment):
    allow_inherited_tests_method = True

    def assert_sale_order_down_payment(self, sale_order, amount_type, amount, expected_values, soft_checking=False):
        if amount_type == 'percent':
            advance_payment_method = 'percentage'
            percent_amount = amount
            fixed_amount = None
        else:  # amount_type == 'fixed'
            advance_payment_method = 'fixed'
            percent_amount = None
            fixed_amount = amount
        downpayment_wizard = self.env['sale.advance.payment.inv']\
            .with_context({'active_model': sale_order._name, 'active_ids': sale_order.ids})\
            .create({
                'advance_payment_method': advance_payment_method,
                'amount': percent_amount,
                'fixed_amount': fixed_amount,
            })
        action_values = downpayment_wizard.create_invoices()
        invoice = self.env['account.move'].browse(action_values['res_id'])
        self._assert_tax_totals_summary(invoice.tax_totals, expected_values, soft_checking=soft_checking)

    def test_taxes_l10n_in_sale_orders(self):
        for document, soft_checking, amount_type, amount, expected_values in self._test_taxes_l10n_in():
            with self.subTest(amount=amount):
                sale_order = self.convert_document_to_sale_order(document)
                sale_order.action_confirm()
                self.assert_sale_order_down_payment(sale_order, amount_type, amount, expected_values, soft_checking=soft_checking)

    def test_taxes_l10n_br_sale_orders(self):
        for document, soft_checking, amount_type, amount, expected_values in self._test_taxes_l10n_br():
            with self.subTest(amount=amount):
                sale_order = self.convert_document_to_sale_order(document)
                sale_order.action_confirm()
                self.assert_sale_order_down_payment(sale_order, amount_type, amount, expected_values, soft_checking=soft_checking)

    def test_taxes_l10n_be_sale_orders(self):
        for document, soft_checking, amount_type, amount, expected_values in self._test_taxes_l10n_be():
            with self.subTest(amount=amount):
                sale_order = self.convert_document_to_sale_order(document)
                sale_order.action_confirm()
                self.assert_sale_order_down_payment(sale_order, amount_type, amount, expected_values, soft_checking=soft_checking)
