# -*- coding: utf-8 -*-
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.addons.analytic.tests.common import AnalyticCommon
from odoo.tests import tagged, Form
from odoo.exceptions import UserError, ValidationError
from odoo import Command


@tagged('post_install', '-at_install')
class TestAccountAnalyticAccount(AccountTestInvoicingCommon, AnalyticCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company_data_2 = cls.setup_other_company()

        cls.cross_plan = cls.env['account.analytic.plan'].create({'name': 'Cross'})
        cls.analytic_account_5 = cls.env['account.analytic.account'].create({
            'name': 'analytic_account_5',
            'plan_id': cls.cross_plan.id,
            'company_id': False,
        })

    def create_invoice(self, partner, product, move_type='out_invoice'):
        return self.env['account.move'].create([{
            'move_type': move_type,
            'partner_id': partner.id,
            'date': '2017-01-01',
            'invoice_date': '2017-01-01',
            'invoice_line_ids': [Command.create({
                'product_id': product.id,
            })]
        }])

    def test_changing_analytic_company(self):
        """ Ensure you can't change the company of an account.analytic.account if there are analytic lines linked to
            the account
        """
        self.env['account.analytic.line'].create({
            'name': 'company specific account',
            'account_id': self.analytic_account_3.id,
            'amount': 100,
        })

        # Set a different company on the analytic account.
        with self.assertRaises(UserError), self.cr.savepoint():
            self.analytic_account_3.company_id = self.company_data_2['company']

        # Making the analytic account not company dependent is allowed.
        self.analytic_account_3.company_id = False

    def test_analytic_lines(self):
        ''' Ensures analytic lines are created when posted and are recreated when editing the account.move'''
        def get_analytic_lines():
            return self.env['account.analytic.line'].search([
                ('move_line_id', 'in', out_invoice.line_ids.ids)
            ]).sorted('amount')

        out_invoice = self.env['account.move'].create([{
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'date': '2017-01-01',
            'invoice_date': '2017-01-01',
            'invoice_line_ids': [Command.create({
                'product_id': self.product_a.id,
                'price_unit': 200.0,
                'analytic_distribution': {
                    self.analytic_account_3.id: 100,
                    self.analytic_account_4.id: 50,
                },
            })]
        }])

        out_invoice.action_post()

        # Analytic lines are created when posting the invoice
        self.assertRecordValues(get_analytic_lines(), [{
            'amount': 100,
            self.analytic_plan_2._column_name(): self.analytic_account_4.id,
            'partner_id': self.partner_a.id,
            'product_id': self.product_a.id,
        }, {
            'amount': 200,
            self.analytic_plan_2._column_name(): self.analytic_account_3.id,
            'partner_id': self.partner_a.id,
            'product_id': self.product_a.id,
        }])

        # Analytic lines are updated when a posted invoice's distribution changes
        out_invoice.invoice_line_ids.analytic_distribution = {
            self.analytic_account_3.id: 100,
            self.analytic_account_4.id: 25,
        }
        self.assertRecordValues(get_analytic_lines(), [{
            'amount': 50,
            self.analytic_plan_2._column_name(): self.analytic_account_4.id,
        }, {
            'amount': 200,
            self.analytic_plan_2._column_name(): self.analytic_account_3.id,
        }])

        # Analytic lines are deleted when resetting to draft
        out_invoice.button_draft()
        self.assertFalse(get_analytic_lines())

    def test_model_score(self):
        """Test that the models are applied correctly based on the score"""

        self.env['account.analytic.distribution.model'].create([{
            'product_id': self.product_a.id,
            'analytic_distribution': {self.analytic_account_3.id: 100}
        }, {
            'partner_id': self.partner_a.id,
            'product_id': self.product_a.id,
            'analytic_distribution': {self.analytic_account_4.id: 100}
        }])

        # Partner and product match, score 2
        invoice = self.create_invoice(self.partner_a, self.product_a)
        self.assertEqual(invoice.invoice_line_ids.analytic_distribution, {str(self.analytic_account_4.id): 100})

        # Match the partner but not the product, score 0
        invoice = self.create_invoice(self.partner_a, self.product_b)
        self.assertEqual(invoice.invoice_line_ids.analytic_distribution, False)

        # Product match, score 1
        invoice = self.create_invoice(self.partner_b, self.product_a)
        self.assertEqual(invoice.invoice_line_ids.analytic_distribution, {str(self.analytic_account_3.id): 100})

        # No rule match with the product, score 0
        invoice = self.create_invoice(self.partner_b, self.product_b)
        self.assertEqual(invoice.invoice_line_ids.analytic_distribution, False)

    def test_model_application(self):
        """Test that the distribution is recomputed if and only if it is needed when changing the partner."""
        self.env['account.analytic.distribution.model'].create([{
            'partner_id': self.partner_a.id,
            'analytic_distribution': {self.analytic_account_3.id: 100},
            'company_id': False,
        }, {
            'partner_id': self.partner_b.id,
            'analytic_distribution': {self.analytic_account_4.id: 100},
            'company_id': False,
        }])

        invoice = self.create_invoice(self.env['res.partner'], self.product_a)
        # No model is found, don't put anything
        self.assertEqual(invoice.invoice_line_ids.analytic_distribution, False)

        # A model is found, set the new values
        invoice.partner_id = self.partner_a
        self.assertEqual(invoice.invoice_line_ids.analytic_distribution, {str(self.analytic_account_3.id): 100})

        # A model is found, set the new values
        invoice.partner_id = self.partner_b
        self.assertEqual(invoice.invoice_line_ids.analytic_distribution, {str(self.analytic_account_4.id): 100})

        # No model is found, don't change previously set values
        invoice.partner_id = invoice.company_id.partner_id
        self.assertEqual(invoice.invoice_line_ids.analytic_distribution, {str(self.analytic_account_4.id): 100})

        # No model is found, don't change previously set values
        invoice.partner_id = False
        self.assertEqual(invoice.invoice_line_ids.analytic_distribution, {str(self.analytic_account_4.id): 100})

        # It manual value is not erased in form view when saving
        with Form(invoice) as invoice_form:
            invoice_form.partner_id = self.partner_a
            with invoice_form.invoice_line_ids.edit(0) as line_form:
                self.assertEqual(line_form.analytic_distribution, {str(self.analytic_account_3.id): 100})
                line_form.analytic_distribution = {self.analytic_account_4.id: 100}
        self.assertEqual(invoice.invoice_line_ids.analytic_distribution, {str(self.analytic_account_4.id): 100})

    def test_mandatory_plan_validation(self):
        invoice = self.create_invoice(self.partner_b, self.product_a)
        self.analytic_plan_2.write({
            'applicability_ids': [Command.create({
                'business_domain': 'invoice',
                'product_categ_id': self.product_a.categ_id.id,
                'applicability': 'mandatory',
            })]
        })

        # ValidationError is raised only when validate_analytic is in the context and the distribution is != 100
        with self.assertRaisesRegex(ValidationError, '100% analytic distribution.'):
            invoice.with_context({'validate_analytic': True}).action_post()

        invoice.invoice_line_ids.analytic_distribution = {self.analytic_account_4.id: 100.01}
        with self.assertRaisesRegex(ValidationError, '100% analytic distribution.'):
            invoice.with_context({'validate_analytic': True}).action_post()

        invoice.invoice_line_ids.analytic_distribution = {self.analytic_account_4.id: 99.9}
        with self.assertRaisesRegex(ValidationError, '100% analytic distribution.'):
            invoice.with_context({'validate_analytic': True}).action_post()

        invoice.invoice_line_ids.analytic_distribution = {self.analytic_account_4.id: 100}
        invoice.with_context({'validate_analytic': True}).action_post()
        self.assertEqual(invoice.state, 'posted')

        # reset and post without the validate_analytic context key
        invoice.button_draft()
        invoice.invoice_line_ids.analytic_distribution = {self.analytic_account_4.id: 0.9}
        invoice.action_post()
        self.assertEqual(invoice.state, 'posted')
<<<<<<< HEAD

    def test_cross_analytics_computing(self):

        out_invoice = self.env['account.move'].create([{
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'date': '2017-01-01',
            'invoice_date': '2017-01-01',
            'invoice_line_ids': [Command.create({
                'product_id': self.product_b.id,
                'price_unit': 200.0,
                'analytic_distribution': {
                    f'{self.analytic_account_3.id},{self.analytic_account_5.id}': 20,
                    f'{self.analytic_account_3.id},{self.analytic_account_4.id}': 80,
                },
            })]
        }])
        out_invoice.action_post()
        in_invoice = self.env['account.move'].create([{
            'move_type': 'in_invoice',
            'partner_id': self.partner_b.id,
            'date': '2017-01-01',
            'invoice_date': '2017-01-01',
            'invoice_line_ids': [
                Command.create({
                    'product_id': self.product_a.id,
                    'price_unit': 200.0,
                    'analytic_distribution': {
                        f'{self.analytic_account_3.id},{self.analytic_account_4.id}': 100,
                    },
                }),
                Command.create({
                    'product_id': self.product_a.id,
                    'price_unit': 200.0,
                    'analytic_distribution': {
                        f'{self.analytic_account_3.id},{self.analytic_account_5.id}': 50,
                        self.analytic_account_4.id: 50,
                    },
                })
            ]
        }])
        in_invoice.action_post()

        self.analytic_account_3._compute_invoice_count()
        self.assertEqual(self.analytic_account_3.invoice_count, 1)
        self.analytic_account_3._compute_vendor_bill_count()
        self.assertEqual(self.analytic_account_3.vendor_bill_count, 1)

    def test_applicability_score(self):
        """ Tests which applicability is chosen if several ones are valid """
        applicability_without_company, applicability_with_company = self.env['account.analytic.applicability'].create([
            {
                'business_domain': 'invoice',
                'product_categ_id': self.product_a.categ_id.id,
                'applicability': 'mandatory',
                'analytic_plan_id': self.analytic_plan_2.id,
                'company_id': False,
            },
            {
                'business_domain': 'invoice',
                'applicability': 'unavailable',
                'analytic_plan_id': self.analytic_plan_2.id,
                'company_id': self.env.company.id,
            },
        ])

        applicability = self.analytic_plan_2._get_applicability(business_domain='invoice', company_id=self.env.company.id, product=self.product_a.id)
        self.assertEqual(applicability, 'mandatory', "product takes precedence over company")

        # If the model that asks for a validation does not have a company_id,
        # the score shouldn't take into account the company of the applicability
        score = applicability_without_company._get_score(business_domain='invoice', product=self.product_a.id)
        self.assertEqual(score, 2)
        score = applicability_with_company._get_score(business_domain='invoice', product=self.product_a.id)
        self.assertEqual(score, 1)
||||||| parent of 486cbd0ddea4 (temp)
=======

    def test_set_anaylytic_distribution_posted_line(self):
        """
        Test that we can set the analytic distribution on the product line of a move, when the line has tax with
        repartition lines used in tax closing. Although the change can not be applied on the tax line, we should
        not raise any error.
        """
        tax = self.tax_purchase_a.copy({
            'name': 'taXXX',
            'invoice_repartition_line_ids': [
                Command.create({
                    'repartition_type': 'base',
                    'use_in_tax_closing': False,
                }),
                Command.create({
                    'repartition_type': 'tax',
                    'factor_percent': 50,
                    'use_in_tax_closing': False,
                }),
                Command.create({
                    'repartition_type': 'tax',
                    'factor_percent': 50,
                    'account_id': self.company_data['default_account_tax_purchase'].id,
                    'use_in_tax_closing': True,
                }),
            ],
            'refund_repartition_line_ids': [
                Command.create({
                    'repartition_type': 'base',
                    'use_in_tax_closing': False,
                }),
                Command.create({
                    'repartition_type': 'tax',
                    'factor_percent': 50,
                    'use_in_tax_closing': False,
                }),
                Command.create({
                    'repartition_type': 'tax',
                    'factor_percent': 50,
                    'account_id': self.company_data['default_account_tax_purchase'].id,
                    'use_in_tax_closing': True,
                }),
            ],
        })

        bill = self.create_invoice(self.partner_a, self.product_a, move_type='in_invoice')
        bill.invoice_line_ids.tax_ids = [Command.set(tax.ids)]
        bill.action_post()

        line = bill.line_ids.filtered(lambda l: l.display_type == 'product')
        line.write({'analytic_distribution': {self.analytic_account_a.id: 100}})
        self.assertEqual(line.analytic_distribution, {str(self.analytic_account_a.id): 100})
>>>>>>> 486cbd0ddea4 (temp)
