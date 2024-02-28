# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.hr_expense.tests.common import TestExpenseCommon
from odoo.tests import tagged

@tagged('-at_install', 'post_install')
class TestExpenseMargin(TestExpenseCommon):

    def test_expense_reinvoice_purchase_price(self):
        # re-invoiceable products
        product_with_cost = self.product_a
        product_with_cost.write({'standard_price': 1000, 'expense_policy': 'sales_price'})
        product_with_no_cost = self.product_b
        product_with_no_cost.write({'standard_price': 0, 'expense_policy': 'sales_price'})

        # create SO line and confirm SO (with only one line)
        sale_order = self.env['sale.order'].with_context(mail_notrack=True, mail_create_nolog=True).create({
            'partner_id': self.partner_a.id,
            'partner_invoice_id': self.partner_a.id,
            'partner_shipping_id': self.partner_a.id,
            'order_line': [(0, 0, {
                'name': product_with_cost.name,
                'product_id': product_with_cost.id,
                'product_uom_qty': 2.0,
                'price_unit': 13.0,
            })],
        })

        sale_order.action_confirm()

        expense_sheet = self.env['hr.expense.sheet'].create({
            'name': 'First Expense for employee',
            'employee_id': self.expense_employee.id,
            'journal_id': self.company_data['default_journal_purchase'].id,
            'accounting_date': '2020-10-12',
            'expense_line_ids': [
                # expense with zero cost product, with 15% tax
                (0, 0, {
                    'name': 'expense_1',
                    'date': '2020-10-07',
                    'product_id': product_with_no_cost.id,
                    'unit_amount': product_with_no_cost.standard_price,
                    'total_amount': 100,
                    'tax_ids': [(6, 0, self.company_data['default_tax_purchase'].ids)],
                    'employee_id': self.expense_employee.id,
                    'sale_order_id': sale_order.id,
                }),
                # expense with zero cost product, with no tax
                (0, 0, {
                    'name': 'expense_2',
                    'date': '2020-10-07',
                    'product_id': product_with_no_cost.id,
                    'unit_amount': product_with_no_cost.standard_price,
                    'total_amount': 100,
                    'tax_ids': False,
                    'employee_id': self.expense_employee.id,
                    'sale_order_id': sale_order.id
                }),
                # expense with product with cost (1000), with 15% tax
                (0, 0, {
                    'name': 'expense_3',
                    'date': '2020-10-07',
                    'product_id': product_with_cost.id,
                    'quantity': 3,
                    'unit_amount': product_with_cost.standard_price,
                    'tax_ids': [(6, 0, self.company_data['default_tax_purchase'].ids)],
                    'employee_id': self.expense_employee.id,
                    'sale_order_id': sale_order.id
                }),
                # expense with product with cost (1000), with no tax
                (0, 0, {
                    'name': 'expense_4',
                    'date': '2020-10-07',
                    'product_id': product_with_cost.id,
                    'quantity': 5,
                    'unit_amount': product_with_cost.standard_price,
                    'tax_ids': False,
                    'employee_id': self.expense_employee.id,
                    'sale_order_id': sale_order.id
                }),
            ],
        })

        expense_sheet.approve_expense_sheets()
        expense_sheet.action_sheet_move_create()

        self.assertRecordValues(sale_order.order_line[1:], [
            # Expense lines:
            {
                'purchase_price': 86.96,
                'is_expense': True,
            },
            {
                'purchase_price': 100.0,
                'is_expense': True,
            },
            {
                'purchase_price': 869.57,
                'is_expense': True,
            },
            {
                'purchase_price': 1000.0,
                'is_expense': True,
            },
        ])
