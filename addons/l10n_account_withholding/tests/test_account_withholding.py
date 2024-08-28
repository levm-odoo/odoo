# Part of Odoo. See LICENSE file for full copyright and licensing details.
from freezegun import freeze_time

from odoo import Command
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.addons.analytic.tests.common import AnalyticCommon
from odoo.exceptions import UserError
from odoo.tests import tagged, Form


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestL10nAccountWithholdingTaxes(AccountTestInvoicingCommon, AnalyticCommon):

    def _setup_tax(self, name, amount, sequence=None, tax_type='sale', base_tag=None, tax_tag=None):
        # Copy a default tax and set it up for withholding
        tax = self.company_data['default_tax_sale'].copy({
            'name': name,
            'amount': amount,
            'type_tax_use': tax_type,
            'l10n_account_wth_is_wth_tax': True,
            'l10n_account_wth_sequence_id': sequence and sequence.id,
        })
        # Add tax grids
        tax.invoice_repartition_line_ids.filtered(lambda x: x.repartition_type == 'tax').tag_ids = tax_tag or self.env['account.account.tag'].create({
            'name': f'Tax Tag {name}',
            'applicability': 'taxes',
        })
        tax.invoice_repartition_line_ids.filtered(lambda x: x.repartition_type == 'base').tag_ids = base_tag or self.env['account.account.tag'].create({
            'name': f'Base Tag {name}',
            'applicability': 'taxes',
        })
        return tax

    def _get_tax_tag(self, tax):
        return {
            'tax': tax.invoice_repartition_line_ids.filtered(lambda x: x.repartition_type == 'tax').tag_ids.ids,
            'base': tax.invoice_repartition_line_ids.filtered(lambda x: x.repartition_type == 'base').tag_ids.ids,
        }

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Set the withholding account
        cls.company_data['company'].l10n_account_wth_tax_base_account_id = cls.env['account.account'].create({
            'code': 'WITHB',
            'name': 'Withholding Tax Base Account',
            'reconcile': True,
            'account_type': 'asset_current',
        })
        # Create a sequence to set on tax C
        cls.withholding_sequence = cls.env['ir.sequence'].create({
            'implementation': 'standard',
            'name': 'Withholding Sequence',
            'padding': 4,
            'number_increment': 1,
        })
        # Prepare two withholding taxes.
        cls.tax_sale_b = cls._setup_tax(cls, 'Withholding Tax', 1)
        cls.tax_sale_c = cls._setup_tax(cls, 'Withholding Tax 2', 2, cls.withholding_sequence)
        # Prepare one draft invoice for the tests.
        cls.invoice = cls.env['account.move'].create({
            'move_type': 'out_invoice',
            'date': '2024-01-01',
            'invoice_date': '2024-01-01',
            'partner_id': cls.partner_a.id,
            # Set the tax to False to avoid computed values.
            'invoice_line_ids': [Command.create({'product_id': cls.product_a.id, 'price_unit': 1000.0, 'tax_ids': False})],
        })
        # Set a withholding tax on product B to test later.
        cls.product_b.taxes_id = cls.tax_sale_b
        # We'll need a foreign currency
        cls.foreign_currency = cls.setup_other_currency('EUR')
        # Fiscal position
        cls.fiscal_pos_withh = cls.env['account.fiscal.position'].create({
            'name': 'fiscal_pos_withh',
            'tax_ids': ([(0, None, {'tax_src_id': cls.tax_sale_b.id, 'tax_dest_id': cls.tax_sale_c.id})]),
        })
        # Outstanding account
        cls.outstanding_account = cls.env['account.account'].create({
            'name': "Outstanding Payments",
            'code': 'OSTP420',
            'reconcile': False,  # On purpose for testing.
            'account_type': 'asset_current'
        })
        # Second tax sale account for cases where we want multiple repartition lines
        cls.tax_sale_account = cls.company_data['default_account_tax_sale'].copy()

    def _register_payment(self, create_vals=None, enable_withholding=False, with_default_line=False):
        """ Simply post the invoice, and then return a payment register wizard.
        Can optionally take create_vals if some specific fields are required on the wizard at creation, or allows to
        enable withholding tax right away.
        Also allows to create a default withholding tax line on the way.

        These options are useful to avoid repeating some basic setting up each time we don't care about the specificities
        but only about what happens after.
        """
        if self.invoice.state != 'posted':
            self.invoice.action_post()
        wizard = self.env['account.payment.register'].with_context(
            active_model='account.move.line', active_ids=self.invoice.line_ids.ids
        ).create(create_vals or {})
        if enable_withholding or with_default_line:
            wizard.l10n_account_wth_withhold_tax = True
            if with_default_line:
                wizard.l10n_account_wth_line_ids = [
                    Command.create({
                        'tax_id': self.tax_sale_b.id,
                        'name': '1',
                        'full_base_amount': 1000,
                    })
                ]
        return wizard

    def test_withholding_tax_on_payment(self):
        """
        Post the invoice, then register a payment for it.
        We do not expect default withholding lines.

        We can then add a withholding line, and register the payment, the verify the amounts.
        """
        payment_register = self._register_payment()
        # No default withholding tax on the product = no default line in the wizard, as well as the option being disabled by default.
        self.assertFalse(payment_register.l10n_account_wth_line_ids)
        self.assertFalse(payment_register.l10n_account_wth_withhold_tax)
        # We enable the withholding
        payment_register.l10n_account_wth_withhold_tax = True
        # We add a tax.
        payment_register.l10n_account_wth_line_ids = [
            Command.create({
                'tax_id': self.tax_sale_b.id,
                'name': '1',
                'full_base_amount': 1000,
            })
        ]
        # The amount on the tax line should have been computed. The net amount too.
        self.assertEqual(payment_register.l10n_account_wth_line_ids[0].amount, 1000 * 0.01)
        self.assertEqual(payment_register.l10n_account_wth_net_amount, 1000 - (1000 * 0.01))
        # The amounts are correct, we register the payment then check the entry
        action = payment_register.action_create_payments()
        payment = self.env['account.payment'].browse(action['res_id'])
        self.assertRecordValues(payment.move_id.line_ids, [
            # Receivable line:
            {'balance': 990.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': 990.0},
            # Liquidity line:
            {'balance': -1000.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': -1000.0},
            # withholding line:
            {'balance': 10.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': 10.0},
            # base lines:
            {'balance': 1000.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': 1000.0},
            {'balance': -1000.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': -1000.0},
        ])

    def test_withholding_tax_before_payment(self):
        """
        Post the invoice, then register withholding taxes.
        Afterward, register the payment separately.
        """
        payment_register = self._register_payment(with_default_line=True)
        self.assertEqual(payment_register.l10n_account_wth_net_amount, 1000 - (1000 * 0.01))
        # As we only want to register withholding taxes, we change the register payment amount to match the net amount
        payment_register.amount = 1000 * 0.01
        # Changing the amount in the wizard recomputed the withholding amount, but we want it to stay 1000
        payment_register.l10n_account_wth_line_ids[0].base_amount = 1000
        # The amount on the tax line should have been computed. The net amount too.
        self.assertEqual(payment_register.l10n_account_wth_line_ids[0].amount, 1000 * 0.01)
        self.assertEqual(payment_register.l10n_account_wth_net_amount, 0.0)
        # We register the withholding payment
        action = payment_register.action_create_payments()
        payment = self.env['account.payment'].browse(action['res_id'])
        self.assertRecordValues(payment.move_id.line_ids, [
            # Receivable line:
            {'balance': 0.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': 0.0},
            # Liquidity line:
            {'balance': -10.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': -10.0},
            # withholding line:
            {'balance': 10.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': 10.0},
            # base lines:
            {'balance': 1000.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': 1000.0},
            {'balance': -1000.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': -1000.0},
        ])
        # We then register payment a second time, only for the actual payment.
        payment_register = self._register_payment(enable_withholding=True)
        self.assertEqual(payment_register.amount, 990)  # Withholding amount is already "paid"
        action = payment_register.action_create_payments()
        payment = self.env['account.payment'].browse(action['res_id'])
        self.assertRecordValues(payment.move_id.line_ids, [
            # Receivable line:
            {'balance': 990.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': 990.0},
            # Liquidity line:
            {'balance': -990.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': -990.0},
        ])

    def test_withholding_tax_foreign_currency(self):
        """
        Test that an invoice in a foreign currency, also paid in such foreign currency, with withholding tax
        Result in the expected amounts.
        """
        self.invoice.currency_id = self.foreign_currency
        # reset so that it applies exchange rate
        self.invoice.invoice_line_ids = [Command.clear()] + [Command.create({'product_id': self.product_a.id, 'tax_ids': False})]
        self.invoice.action_post()
        payment_register = self._register_payment(with_default_line=True)
        self.assertEqual(payment_register.amount, 2000)
        # The amount on the tax line should have been computed. The net amount too.
        self.assertEqual(payment_register.l10n_account_wth_line_ids[0].base_amount, 2000)
        self.assertEqual(payment_register.l10n_account_wth_line_ids[0].amount, 2000 * 0.01)
        self.assertEqual(payment_register.l10n_account_wth_net_amount, 2000 - (2000 * 0.01))
        # The amounts are correct, we register the payment then check the entry
        action = payment_register.action_create_payments()
        payment = self.env['account.payment'].browse(action['res_id'])
        self.assertRecordValues(payment.move_id.line_ids, [
            # Receivable line:
            {'balance': 990.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': 1980.0},
            # Liquidity line:
            {'balance': -1000.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': -2000.0},
            # withholding line:
            {'balance': 10.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': 20.0},
            # base lines:
            {'balance': 1000.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': 2000.0},
            {'balance': -1000.0, 'currency_id': payment_register.currency_id.id, 'amount_currency': -2000.0},
        ])

    def test_withholding_tax_default_tax_on_product(self):
        """
        Simply test that an invoice having a product with a default withholding tax will cause
        that tax to appear on a default line in the wizard.
        """
        self.invoice.invoice_line_ids[0].product_id = self.product_b
        self.invoice.invoice_line_ids = [Command.create({'product_id': self.product_b.id, 'price_unit': 400.0, 'tax_ids': False})]
        payment_register = self._register_payment(enable_withholding=True)
        # Base amount is set by default to the sum of balances of the lines with this tax.
        self.assertEqual(payment_register.l10n_account_wth_line_ids[0].base_amount, 600.0)
        self.assertEqual(payment_register.l10n_account_wth_line_ids[0].amount, 6.0)

    def test_withholding_tax_default_tax_on_product_fiscal_position(self):
        """
        Test that when a wizard is opened from an invoice using a product having a withholding tax,
        the fiscal position is properly applied.

        The tax set on product is 1%, the mapped one is 2%
        """
        self.invoice.invoice_line_ids[0].product_id = self.product_b
        self.invoice.fiscal_position_id = self.fiscal_pos_withh
        payment_register = self._register_payment(enable_withholding=True)
        # Base amount is set by default to the sum of balances of the lines with this tax.
        self.assertEqual(payment_register.l10n_account_wth_line_ids[0].tax_id, self.tax_sale_c)

    def test_withholding_tax_cannot_edit_payment(self):
        """
        Withholding taxes detail is lost once the payment is done.
        This means that you can't expect to edit a payment after registering a withholding tax and then all work well.

        This will ensure that this cannot be done, as the expected flow is to cancel the payment and register a new one.
        """
        payment_register = self._register_payment(with_default_line=True)
        action = payment_register.action_create_payments()
        payment = self.env['account.payment'].browse(action['res_id'])
        with self.assertRaises(UserError):
            payment.amount = 1500
        payment.action_draft()
        with self.assertRaises(UserError):
            payment.amount = 1500
        payment.action_cancel()

    def test_withholding_not_payment_account_on_method_line(self):
        """ Test that when no payment account is set on the payment method line, the one from the wizard is used. """
        payment_register = self._register_payment(
            create_vals={'l10n_account_wth_outstanding_account_id': self.outstanding_account.id},
            with_default_line=True,
        )
        # Remove the account from the payment method
        payment_register.payment_method_line_id.payment_account_id = False
        # The amounts are correct, we register the payment then check the entry
        action = payment_register.action_create_payments()
        payment = self.env['account.payment'].browse(action['res_id'])
        self.assertRecordValues(payment.move_id.line_ids, [
            # Receivable line:
            {'balance': 990.0, 'account_id': self.outstanding_account.id, 'currency_id': payment_register.currency_id.id, 'amount_currency': 990.0},
            # Liquidity line:
            {'balance': -1000.0, 'account_id': payment.destination_account_id.id, 'currency_id': payment_register.currency_id.id, 'amount_currency': -1000.0},
            # withholding line:
            {'balance': 10.0, 'account_id': self.tax_sale_b.invoice_repartition_line_ids.account_id.id, 'currency_id': payment_register.currency_id.id, 'amount_currency': 10.0},
            # base lines:
            {'balance': 1000.0, 'account_id': self.company_data['company'].l10n_account_wth_tax_base_account_id.id, 'currency_id': payment_register.currency_id.id, 'amount_currency': 1000.0},
            {'balance': -1000.0, 'account_id': self.company_data['company'].l10n_account_wth_tax_base_account_id.id, 'currency_id': payment_register.currency_id.id, 'amount_currency': -1000.0},
        ])

    def test_withholding_tax_grids(self):
        """ Test that tax grids are set as expected on the lines when they exist on the taxes. """
        payment_register = self._register_payment(
            create_vals={'l10n_account_wth_outstanding_account_id': self.outstanding_account.id},
            enable_withholding=True,
        )
        # Remove the account from the payment method
        payment_register.payment_method_line_id.payment_account_id = False
        tax_b_grids = self._get_tax_tag(self.tax_sale_b)
        tax_c_grids = self._get_tax_tag(self.tax_sale_c)
        # We add two taxes.
        payment_register.l10n_account_wth_line_ids = [
            Command.create({
                'tax_id': self.tax_sale_b.id,
                'name': '1',
                'full_base_amount': 1000,
            }),
            Command.create({
                'tax_id': self.tax_sale_c.id,
                'name': '1',
                'full_base_amount': 1000,
            })
        ]
        # The amounts are correct, we register the payment then check the entry
        action = payment_register.action_create_payments()
        payment = self.env['account.payment'].browse(action['res_id'])
        self.assertRecordValues(payment.move_id.line_ids, [
            # Receivable line:
            {'balance': 970.0, 'tax_tag_ids': [], 'currency_id': payment_register.currency_id.id, 'amount_currency': 970.0},
            # Liquidity line:
            {'balance': -1000.0, 'tax_tag_ids': [], 'currency_id': payment_register.currency_id.id, 'amount_currency': -1000.0},
            # withholding line:
            {'balance': 10.0, 'tax_tag_ids': tax_b_grids['tax'], 'currency_id': payment_register.currency_id.id, 'amount_currency': 10.0},
            {'balance': 20.0, 'tax_tag_ids': tax_c_grids['tax'], 'currency_id': payment_register.currency_id.id, 'amount_currency': 20.0},
            # base lines:
            {'balance': 1000.0, 'tax_tag_ids': tax_b_grids['base'] + tax_c_grids['base'], 'currency_id': payment_register.currency_id.id, 'amount_currency': 1000.0},
            {'balance': -1000.0, 'tax_tag_ids': [], 'currency_id': payment_register.currency_id.id, 'amount_currency': -1000.0},
        ])

    def test_withholding_tax_multiple_base(self):
        """ Test two use two taxes with different base amount and ensure that the lines are correct. """
        self.product_a.taxes_id = self.tax_sale_c
        self.invoice.invoice_line_ids = [Command.create({'product_id': self.product_b.id, 'price_unit': 400.0, 'tax_ids': False})]
        payment_register = self._register_payment(enable_withholding=True)
        # Change the base amount of the second line, we also need a name as it doesn't have a sequence.
        payment_register.l10n_account_wth_line_ids[1].name = '0'
        payment_register.l10n_account_wth_line_ids[1].full_base_amount = 550
        action = payment_register.action_create_payments()
        payment = self.env['account.payment'].browse(action['res_id'])

        tax_b_grids = self._get_tax_tag(self.tax_sale_b)
        tax_c_grids = self._get_tax_tag(self.tax_sale_c)
        # We expect two base line, and one counterpart line.
        self.assertRecordValues(payment.move_id.line_ids, [
            # Receivable line:
            {'balance': 1374.5, 'tax_tag_ids': [], 'currency_id': payment_register.currency_id.id, 'amount_currency': 1374.5},
            # Liquidity line:
            {'balance': -1400.0, 'tax_tag_ids': [], 'currency_id': payment_register.currency_id.id, 'amount_currency': -1400.0},
            # withholding lines:
            {'balance': 20.0, 'tax_tag_ids': tax_c_grids['tax'], 'currency_id': payment_register.currency_id.id, 'amount_currency': 20.0},
            {'balance': 5.5, 'tax_tag_ids': tax_b_grids['tax'], 'currency_id': payment_register.currency_id.id, 'amount_currency': 5.5},
            # base lines:
            {'balance': 1000.0, 'tax_tag_ids': tax_c_grids['base'], 'currency_id': payment_register.currency_id.id, 'amount_currency': 1000.0},
            {'balance': 550.0, 'tax_tag_ids': tax_b_grids['base'], 'currency_id': payment_register.currency_id.id, 'amount_currency': 550.0},
            # Counterpart
            {'balance': -1550.0, 'tax_tag_ids': [], 'currency_id': payment_register.currency_id.id, 'amount_currency': -1550.0},
        ])

    # We need the date to be fixed for the EPD part; to the date of the invoice.
    @freeze_time('2024-01-01')
    def test_register_payment_payment_terms(self):
        """ When registering a payment with payment terms, the withholding amount should follow the terms. """
        self.product_a.taxes_id = self.tax_sale_c
        self.invoice.invoice_payment_term_id = self.env.ref('account.account_payment_term_advance_60days')
        payment_register = self._register_payment(enable_withholding=True)
        # We expect the withholding amount to, just like the payment amount, be 30% of the full amount.
        self.assertEqual(payment_register.amount, 1000 * 0.3)
        self.assertEqual(payment_register.l10n_account_wth_line_ids[0].base_amount, 1000 * 0.3)

    def test_complete_flow_in_form(self):
        """ Use a form emulator to test various use cases.
        It helps to ensure that the view is not broken, as we are working with two transient models which require invisible
        fields to work well.
        """
        self.product_a.taxes_id = self.tax_sale_c
        payment_register = self._register_payment(with_default_line=True)
        with Form(payment_register) as payment_register_form:
            # Edit manually a line.
            with payment_register_form.l10n_account_wth_line_ids.edit(1) as line_form:
                line_form.base_amount = 750
            lines = payment_register_form.l10n_account_wth_line_ids._records
            self.assertEqual(lines[1]['custom_user_amount'], 750)
            self.assertEqual(lines[1]['custom_user_currency_id'], payment_register_form.currency_id.id)
            # Change the amount
            payment_register_form.amount /= 2
            lines = payment_register_form.l10n_account_wth_line_ids._records
            self.assertEqual(lines[0]['base_amount'], 500)
            self.assertEqual(lines[1]['base_amount'], 750)
            # Change the currency
            payment_register_form.currency_id = self.foreign_currency
            lines = payment_register_form.l10n_account_wth_line_ids._records
            self.assertEqual(lines[0]['base_amount'], 1000)
            self.assertEqual(lines[1]['base_amount'], 1500)

    def test_withholding_tax_base_affected(self):
        """ Ensure that a withholding tax is affected by VAT if the setting of the taxes has been set in that direction. """
        # Add a VAT to the invoice
        self.product_b.taxes_id += self.tax_sale_c
        self.invoice.invoice_line_ids[0].product_id = self.product_b
        self.invoice.invoice_line_ids[0].tax_ids = self.tax_sale_a
        # We expect an invoice line of 200 + 30 of tax

        # Case 1: include base amount is not set.
        # We then want the withholding tax to be based on the amount VAT exclusive.
        payment_register = self._register_payment()
        self.assertEqual(payment_register.l10n_account_wth_line_ids[0].base_amount, 200.0)
        self.assertEqual(payment_register.l10n_account_wth_line_ids[0].amount, 2.0)
        self.assertEqual(payment_register.l10n_account_wth_line_ids[1].base_amount, 200.0)
        self.assertEqual(payment_register.l10n_account_wth_line_ids[1].amount, 4.0)

        # Case 2: include base amount is set.
        # We then want the withholding tax to be based on the amount VAT inclusive.
        self.tax_sale_a.include_base_amount = True
        payment_register = self._register_payment()
        self.assertEqual(payment_register.l10n_account_wth_line_ids[0].base_amount, 230.0)
        self.assertEqual(payment_register.l10n_account_wth_line_ids[0].amount, 2.3)
        self.assertEqual(payment_register.l10n_account_wth_line_ids[1].base_amount, 230.0)
        self.assertEqual(payment_register.l10n_account_wth_line_ids[1].amount, 4.6)

        # Case 3: The first withholding tax is also set to affect base amount, which should be affecting the second withholding tax.
        self.tax_sale_b.include_base_amount = True
        payment_register = self._register_payment()
        self.assertEqual(payment_register.l10n_account_wth_line_ids[0].base_amount, 230.0)
        self.assertEqual(payment_register.l10n_account_wth_line_ids[0].amount, 2.3)
        self.assertEqual(payment_register.l10n_account_wth_line_ids[1].base_amount, 232.3)
        self.assertEqual(payment_register.l10n_account_wth_line_ids[1].amount, 4.65)

    def test_withholding_tax_repartition_line(self):
        """ Ensure that a withholding tax with multiple tax repartition line triggers multiple lines in the final entry
        with correct tax tag, amount and account.
        """
        # Re-set the tax repartition lines to include two tax lines.
        self.tax_sale_b.write({
            'invoice_repartition_line_ids': [
                Command.clear(),
                Command.create({'repartition_type': 'base'}),
                Command.create({
                    'factor_percent': 60,
                    'repartition_type': 'tax',
                    'account_id': self.company_data['default_account_tax_sale'].id,
                }),
                Command.create({
                    'factor_percent': 40,
                    'repartition_type': 'tax',
                    'account_id': self.tax_sale_account.id,
                }),
            ],
            'refund_repartition_line_ids': [
                Command.clear(),
                Command.create({'repartition_type': 'base'}),
                Command.create({
                    'factor_percent': 60,
                    'repartition_type': 'tax',
                    'account_id': self.company_data['default_account_tax_sale'].id,
                }),
                Command.create({
                    'factor_percent': 40,
                    'repartition_type': 'tax',
                    'account_id': self.tax_sale_account.id,
                }),
            ],
        })
        self.invoice.invoice_line_ids[0].product_id = self.product_b
        # We then open the wizard, and expect a single withholding line (There is only one tax!)
        payment_register = self._register_payment()
        self.assertEqual(len(payment_register.l10n_account_wth_line_ids), 1)
        # Let's not forget to set the sequence
        payment_register.l10n_account_wth_line_ids[0].name = '0'
        # We create the payment, and here we expect two tax lines, one with 60% of the tax amount and one with 40% of it.
        action = payment_register.action_create_payments()
        payment = self.env['account.payment'].browse(action['res_id'])
        self.assertRecordValues(payment.move_id.line_ids, [
            # Receivable line:
            {'balance': 198.0},
            # Liquidity line:
            {'balance': -200.0},
            # withholding lines:
            {'balance': 1.2},
            {'balance': 0.8},
            # base line:
            {'balance': 200.0},
            # Counterpart:
            {'balance': -200.0},
        ])

    def test_withholding_analytic_distribution(self):
        """ Ensure that the analytic distribution set on an invoice line is correctly applied to the final entry if the
        withholding tax is set to affect analytics.
        """
        # Enable the option on the tax.
        self.tax_sale_b.analytic = True
        # Add an analytic distribution to the invoice line, as well as a product with withholding taxes.
        self.invoice.invoice_line_ids[0].product_id = self.product_b
        self.invoice.invoice_line_ids[0].analytic_distribution = {
            self.analytic_account_3.id: 50,
            self.analytic_account_4.id: 50,
        }
        payment_register = self._register_payment()
        # We expect one withholding tax line, which should hold the distribution.
        self.assertEqual(len(payment_register.l10n_account_wth_line_ids), 1)
        self.assertEqual(payment_register.l10n_account_wth_line_ids.analytic_distribution, {
            str(self.analytic_account_3.id): 50,
            str(self.analytic_account_4.id): 50,
        })
        # Let's not forget to set the sequence
        payment_register.l10n_account_wth_line_ids[0].name = '0'
        action = payment_register.action_create_payments()
        payment = self.env['account.payment'].browse(action['res_id'])
        # The analytic distribution should have been forwarder to the withholding tax line
        self.assertRecordValues(payment.move_id.line_ids, [
            # Receivable line:
            {'balance': 198.0, 'analytic_distribution': False},
            # Liquidity line:
            {'balance': -200.0, 'analytic_distribution': False},
            # withholding lines:
            {'balance': 2.0, 'analytic_distribution': {
                str(self.analytic_account_3.id): 50,
                str(self.analytic_account_4.id): 50,
            }},
            # base line:
            {'balance': 200.0, 'analytic_distribution': False},
            # Counterpart:
            {'balance': -200.0, 'analytic_distribution': False},
        ])

    def test_withholding_analytic_distribution_two_invoice_line(self):
        """ Test that two invoice line with the same product/taxes but different analytic distribution will result in two
        withholding tax lines.
        """
        # Enable the option on the tax.
        self.tax_sale_b.analytic = True
        # Add an analytic distribution to the invoice line, as well as a product with withholding taxes.
        self.invoice.invoice_line_ids[0].product_id = self.product_b
        self.invoice.invoice_line_ids[0].analytic_distribution = {
            self.analytic_account_3.id: 50,
            self.analytic_account_4.id: 50,
        }
        self.invoice.invoice_line_ids = [Command.create({'product_id': self.product_b.id, 'tax_ids': False, 'analytic_distribution': {
            self.analytic_account_3.id: 25,
            self.analytic_account_4.id: 75,
        }})]
        payment_register = self._register_payment()
        # We expect one withholding tax line, which should hold the distribution.
        self.assertEqual(len(payment_register.l10n_account_wth_line_ids), 2)
        self.assertEqual(payment_register.l10n_account_wth_line_ids[0].analytic_distribution, {
            str(self.analytic_account_3.id): 50,
            str(self.analytic_account_4.id): 50,
        })
        self.assertEqual(payment_register.l10n_account_wth_line_ids[1].analytic_distribution, {
            str(self.analytic_account_3.id): 25,
            str(self.analytic_account_4.id): 75,
        })
        # Let's not forget to set the sequence
        payment_register.l10n_account_wth_line_ids[0].name = '0'
        payment_register.l10n_account_wth_line_ids[1].name = '1'
        action = payment_register.action_create_payments()
        payment = self.env['account.payment'].browse(action['res_id'])
        # The analytic distribution should have been forwarder to the withholding tax line
        self.assertRecordValues(payment.move_id.line_ids, [
            # Receivable line:
            {'balance': 396.0, 'analytic_distribution': False},
            # Liquidity line:
            {'balance': -400.0, 'analytic_distribution': False},
            # withholding lines:
            {'balance': 2.0, 'analytic_distribution': {
                str(self.analytic_account_3.id): 50,
                str(self.analytic_account_4.id): 50,
            }},
            {'balance': 2.0, 'analytic_distribution': {
                str(self.analytic_account_3.id): 25,
                str(self.analytic_account_4.id): 75,
            }},
            # base line:
            {'balance': 400.0, 'analytic_distribution': False},
            # Counterpart:
            {'balance': -400.0, 'analytic_distribution': False},
        ])

    def test_withholding_tax_fields_on_product(self):
        """ Test the fields on the product model to ensure that withholding taxes do not affect the "standard" fields, and
        that the "all" fields contains both as expected.
        Also ensure that the all field has the default value from the "standard" field applied to them when opening a new form.
        """
        product = self._create_product(
            name='product',
        )
        purchase_withholding_tax = self._setup_tax('Withholding Tax', 1, tax_type='purchase')
        # We add a withholding tax for both sale & purchase in the 'all' fields.
        product.all_taxes_id += self.tax_sale_b
        product.all_supplier_taxes_id += purchase_withholding_tax
        self.env.invalidate_all()  # We need to invalidate the cache in order for the fields to be updated accordingly.
        # And then, we validate that the 'all' fields contains both the withholding tax and the regular tax for sale & purchase.
        # Also check that the withholding tax set in the 'all' field earlier is present in the withholding tax field as expected.
        expected_product_taxes = {
            'supplier_taxes_id': [self.company_data['default_tax_purchase'].id],
            'supplier_withholding_taxes_id': [purchase_withholding_tax.id],
            'all_supplier_taxes_id': [self.company_data['default_tax_purchase'].id, purchase_withholding_tax.id],
            'taxes_id': [self.company_data['default_tax_sale'].id],
            'withholding_taxes_id': [self.tax_sale_b.id],
            'all_taxes_id': [self.company_data['default_tax_sale'].id, self.tax_sale_b.id],
        }
        for tax, expected_ids in expected_product_taxes.items():
            self.assertEqual(product[tax].ids, expected_ids)

    def test_outstanding_account_marked_as_reconcilable(self):
        """ Ensure that an account set as outstanding account in the wizard will be marked as reconcilable if it is not yet done. """
        self._register_payment(
            create_vals={'l10n_account_wth_outstanding_account_id': self.outstanding_account.id},
            with_default_line=True,
        )
        # reconcile should have switched to true.
        self.assertTrue(self.outstanding_account.reconcile)

    def test_withholding_tax_base_name(self):
        """ Ensure that the tax base line name makes sense and contains the number of all involved taxes. """
        # There already is one line with the product_a. We add a withholding tax on it.
        self.product_a.taxes_id = self.tax_sale_c
        # Also add three lines with product_b which has another withholding tax. Two of the lines will be summed for the base, the last one will have a different base.
        self.invoice.invoice_line_ids = [
            Command.create({'product_id': self.product_b.id, 'tax_ids': False}),
            Command.create({'product_id': self.product_b.id, 'tax_ids': False}),
            Command.create({'product_id': self._create_product(name='product', withholding_taxes_id=self._setup_tax('Withholding Tax 3', 3)).id, 'price_unit': 400}),
        ]
        # 2 line, 1 with 2 repartition line 1 based
        payment_register = self._register_payment()
        # Only the first line's tax has a sequence
        payment_register.l10n_account_wth_line_ids[1].name = '1'
        payment_register.l10n_account_wth_line_ids[2].name = '2'

        action = payment_register.action_create_payments()
        payment = self.env['account.payment'].browse(action['res_id'])
        self.assertRecordValues(payment.move_id.line_ids, [
            # Receivable line:
            {'name': 'Manual Payment: INV/2024/00001', 'balance': 1824.0},
            # Liquidity line:
            {'name': 'Manual Payment: INV/2024/00001', 'balance': -1860.0},
            # withholding lines:
            {'name': 'WH Tax: 0001', 'balance': 20.0},
            {'name': 'WH Tax: 1', 'balance': 4.0},
            {'name': 'WH Tax: 2', 'balance': 12.0},
            # base line:
            {'name': 'WH Base: 0001', 'balance': 1000.0},
            {'name': 'WH Base: 1,2', 'balance': 400.0},
            # Counterpart:
            {'name': 'WH Base Counterpart', 'balance': -1400.0},
        ])

    def test_base_for_tax_grid(self):
        """ Ensure that the base line will be correct when you have two taxes of the same base amount and base tags.
        In this case, we expect to have one base line with the base amount doubled.
        """
        shared_base_tag = self.env['account.account.tag'].create({
            'name': 'Shared Base Tag',
            'applicability': 'taxes',
        })
        other_base_tag = self.env['account.account.tag'].create({
            'name': 'Other Base Tag',
            'applicability': 'taxes',
        })
        wth_tax_1 = self._setup_tax('WTH tax 1', 2, tax_type='sale', base_tag=shared_base_tag)
        wth_tax_2 = self._setup_tax('WTH tax 2', 3, tax_type='sale', base_tag=shared_base_tag | other_base_tag)
        wth_tax_3 = self._setup_tax('WTH tax 3', 3, tax_type='sale', base_tag=other_base_tag)
        # There already is one line with the product_a. We add a withholding tax on it.
        self.product_a.withholding_taxes_id = wth_tax_1
        self.product_b.withholding_taxes_id = wth_tax_2 | wth_tax_3
        # Also add three lines with product_b which has another withholding tax. Two of the lines will be summed for the base, the last one will have a different base.
        self.invoice.invoice_line_ids = [
            Command.create({'product_id': self.product_b.id, 'price_unit': 1000.0, 'tax_ids': False}),
        ]
        payment_register = self._register_payment(with_default_line=True)  # Add a default manual line with another tax
        payment_register.l10n_account_wth_line_ids[0].name = '1'
        payment_register.l10n_account_wth_line_ids[1].name = '2'
        payment_register.l10n_account_wth_line_ids[2].name = '3'
        action = payment_register.action_create_payments()
        payment = self.env['account.payment'].browse(action['res_id'])
        tax_1_grids = self._get_tax_tag(wth_tax_1)
        tax_2_grids = self._get_tax_tag(wth_tax_2)
        tax_3_grids = self._get_tax_tag(wth_tax_3)
        tax_4_grids = self._get_tax_tag(self.tax_sale_b)
        self.assertRecordValues(payment.move_id.line_ids, [
            # Receivable line:
            {'balance': 1910.0, 'tax_tag_ids': []},
            # Liquidity line:
            {'balance': -2000.0, 'tax_tag_ids': []},
            # withholding lines:
            {'balance': 20.0, 'tax_tag_ids': tax_1_grids['tax']},
            {'balance': 30.0, 'tax_tag_ids': tax_2_grids['tax']},
            {'balance': 30.0, 'tax_tag_ids': tax_3_grids['tax']},
            {'balance': 10.0, 'tax_tag_ids': tax_4_grids['tax']},
            # base lines:
            {'balance': 1000.0, 'tax_tag_ids': tax_1_grids['base'] + tax_3_grids['base'] + tax_4_grids['base']},
            {'balance': 1000.0, 'tax_tag_ids': tax_2_grids['base']},
            # Counterpart:
            {'balance': -2000.0, 'tax_tag_ids': []},
        ])
