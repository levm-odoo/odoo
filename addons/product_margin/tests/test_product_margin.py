# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import Command
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestProductMargin(AccountTestInvoicingCommon):

    def test_product_margin(self):
        ''' In order to test the product_margin module '''

        supplier = self.env['res.partner'].create({'name': 'Supplier'})
        customer = self.env['res.partner'].create({'name': 'Customer'})
        ipad = self.env['product.product'].create({
            'name': 'Ipad',
            'standard_price': 500.0,
            'list_price': 750.0,
        })

        invoices = self.env['account.move'].create([
            {
                'move_type': 'in_invoice',
                'partner_id': supplier.id,
                'invoice_line_ids': [(0, 0, {'product_id': ipad.id, 'quantity': 10.0, 'price_unit': 300.0})],
            },
            {
                'move_type': 'in_invoice',
                'partner_id': supplier.id,
                'invoice_line_ids': [(0, 0, {'product_id': ipad.id, 'quantity': 4.0, 'price_unit': 450.0})],
            },
            {
                'move_type': 'out_invoice',
                'partner_id': customer.id,
                'invoice_line_ids': [(0, 0, {'product_id': ipad.id, 'quantity': 20.0, 'price_unit': 750.0})],
            },
            {
                'move_type': 'out_invoice',
                'partner_id': customer.id,
                'invoice_line_ids': [(0, 0, {'product_id': ipad.id, 'quantity': 10.0, 'price_unit': 550.0})],
            },
        ])
        invoices.invoice_date = invoices[0].date
        invoices.action_post()

        result = ipad._compute_product_margin_fields_values()

        # Sale turnover ( Quantity * Price Subtotal / Quantity)
        sale_turnover = ((20.0 * 750.00) + (10.0 * 550.00))

        # Expected sale (Total quantity * Sale price)
        sale_expected = (750.00 * 30.0)

        # Purchase total cost (Quantity * Unit price)
        purchase_total_cost = ((10.0 * 300.00) + (4.0 * 450.00))

        # Purchase normal cost ( Total quantity * Cost price)
        purchase_normal_cost = (14.0 * 500.00)

        total_margin = sale_turnover - purchase_total_cost
        expected_margin = sale_expected - purchase_normal_cost

        # Check total margin
        self.assertEqual(result[ipad.id]['total_margin'], total_margin, "Wrong Total Margin.")

        # Check expected margin
        self.assertEqual(result[ipad.id]['expected_margin'], expected_margin, "Wrong Expected Margin.")

    def test_discount_and_downpayment_debited_from_product_margin(self):
        if self.env['ir.module.module'].search([('name', '=', 'sale'), ('state', '=', 'installed')]):
            customer = self.env['res.partner'].create({'name': 'Customer'})


            sale_order = self.env['sale.order'].create({
                'partner_id': customer.id,
            })

            ipad = self.env['product.product'].create({
                'name': 'Ipad',
                'standard_price': 1000.0,
                'list_price': 1000.0,
            })

            sale_order.write({'order_line': [
                Command.create({
                    'product_id': ipad.id,
                    'tax_id': [(5, 0, 0)],
                }),]
            })

            self.env['sale.order.discount'].create({
                'sale_order_id': sale_order.id,
                'discount_percentage': 0.5,
                'discount_type': 'so_discount',
            }).action_apply_discount()
            sale_order.action_confirm()

            so_context = {
                'active_model': 'sale.order',
                'active_ids': [sale_order.id],
                'active_id': sale_order.id,
                'default_journal_id': self.company_data['default_journal_sale'].id,
            }

            downpayment = self.env['sale.advance.payment.inv'].with_context(so_context).create({
                'advance_payment_method': 'percentage',
                'amount': 50,
                'deposit_account_id': self.company_data['default_account_revenue'].id
            })
            downpayment_invoice_id = downpayment.create_invoices().get('res_id')
            downpayment_invoice = self.env['account.move'].browse(downpayment_invoice_id)
            downpayment_invoice.action_post()

            regular = self.env['sale.advance.payment.inv'].with_context(so_context).create({
                'advance_payment_method': 'delivered',
                'deposit_account_id': self.company_data['default_account_revenue'].id
            })
            regular_invoice_id = regular.create_invoices().get('res_id')
            regular_invoice = self.env['account.move'].browse(regular_invoice_id)
            regular_invoice.action_post()

            discount_product = self.company_data['company'].sale_discount_product_id
            discount_results = discount_product._compute_product_margin_fields_values()
            self.assertEqual(discount_results[discount_product.id]['turnover'], -500)
            self.assertEqual(discount_results[discount_product.id]['total_margin'], -500)

            downpayment_product = self.company_data['company'].sale_down_payment_product_id
            downpayment_results = downpayment_product._compute_product_margin_fields_values()
            self.assertEqual(downpayment_results[downpayment_product.id]['turnover'], 0)
            self.assertEqual(downpayment_results[downpayment_product.id]['total_margin'], 0)
