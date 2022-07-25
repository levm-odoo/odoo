# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import Command
import odoo.tests


@odoo.tests.tagged('post_install_l10n', 'post_install', '-at_install')
class TestUi(odoo.tests.HttpCase):

    def test_01_account_tour(self):
        # Reset country and fiscal country, so that fields added by localizations are
        # hidden and non-required, and don't make the tour crash.
        # Also remove default taxes from the company and its accounts, to avoid inconsistencies
        # with empty fiscal country.
        self.env.company.write({
            'country_id': None, # Also resets account_fiscal_country_id
            'account_sale_tax_id': None,
            'account_purchase_tax_id': None,
        })
        account_with_taxes = self.env['account.account'].search([('tax_ids', '!=', False), ('company_id', '=', self.env.company.id)])
        account_with_taxes.write({
            'tax_ids': [Command.clear()],
        })
        # Since the company's country might have changed with COA installation,
        # must create a new Jounal with a lower sequence since journals linked
        # to the company might not be compatible anymore.
        user_type = self.env.ref('account.data_account_type_current_assets')
        account = self.env['account.account'].create({'name': 'test', 'code': 'test', 'user_type_id': user_type.id})
        self.env['account.journal'].create({
            'sequence': 0,
            'name': 'test_out_invoice_journal',
            'code': 'XXXXX',
            'type': 'sale',
            'default_account_id': account.id,
            'company_id':  self.env.company.id,
        })
        # This tour doesn't work with demo data on runbot
        all_moves = self.env['account.move'].search([('move_type', '!=', 'entry')])
        all_moves.button_draft()
        all_moves.with_context(force_delete=True).unlink()
        self.start_tour("/web", 'account_tour', login="admin")
