# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from lxml import html

from odoo.addons.digest.tests.common import TestDigestCommon
from odoo.tools import mute_logger
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestAccountDigest(TestDigestCommon):

    @classmethod
    @mute_logger('odoo.models.unlink')
    def setUpClass(cls):
        super().setUpClass()
        account1 = cls.env['account.account'].search([('internal_group', '=', 'income'), ('company_id', '=', cls.company_1.id)], limit=1)
        account2 = cls.env['account.account'].search([('internal_group', '=', 'expense'), ('company_id', '=', cls.company_1.id)], limit=1)
        cls.env['account.journal'].with_company(cls.company_2).create({
            'name': 'Test Journal',
            'code': 'code',
            'type': 'general',
        })

        comp2_account, comp2_account2 = cls.env['account.account'].create([{
            'name': 'Account 1 Company 2',
            'account_type': 'expense_depreciation',
            'company_id': cls.company_2.id,
            'code': 'aaaaaa',
        }, {
            'name': 'Account 2 Company 2',
            'account_type': 'income_other',
            'company_id': cls.company_2.id,
            'code': 'bbbbbb',
        }])

        cls.env['account.move'].search([]).state = 'draft'

        moves = cls.env['account.move'].create({
            'line_ids': [
                (0, 0, {'debit': 5, 'credit': 0, 'account_id': account1.id}),
                (0, 0, {'debit': 0, 'credit': 5, 'account_id': account2.id}),
                (0, 0, {'debit': 8, 'credit': 0, 'account_id': account1.id}),
                (0, 0, {'debit': 0, 'credit': 8, 'account_id': account2.id}),
            ],
        })

        moves |= cls.env['account.move'].with_company(cls.company_2).create({
            'line_ids': [
                (0, 0, {'debit': 0, 'credit': 2, 'account_id': comp2_account.id}),
                (0, 0, {'debit': 2, 'credit': 0, 'account_id': comp2_account2.id}),
            ],
        })

        moves.state = 'posted'

    def test_kpi_account_total_revenue_value(self):
        self.assertEqual(int(self.digest_1.kpi_account_total_revenue_value), -13)
        self.assertEqual(int(self.digest_2.kpi_account_total_revenue_value), -2)
        self.assertEqual(int(self.digest_3.kpi_account_total_revenue_value), -13)

        self.digest_3.invalidate_recordset()
        self.assertEqual(
            int(self.digest_3.with_company(self.company_2).kpi_account_total_revenue_value),
            -2,
            msg='When no company is set, the KPI must be computed based on the current company',
        )

    def test_kpi_currency_follows_recipients_company_currency(self):
        # Have a recipient thats company has a different currency than the digest's company's currency
        self.user_employee_c2.name = "Employee in Company using AED currency"
        company_aed = self.env['res.company'].create({'name': 'Digest Company AED', 'currency_id': self.env.ref('base.AED').id})
        self.user_employee_c2.write({'company_ids': [(4, company_aed.id)]})

        self.user_employee_c2.company_id = company_aed
        self.digest_1.user_ids = self.user_employee_c2
        self.user_employee_c2.groups_id |= self.env.ref('account.group_account_invoice')

        # for the sake of simplicity: reduce digest kpis to revenue only
        self.digest_1.kpi_account_total_revenue = True
        self.digest_1.kpi_mail_message_total = False
        self.digest_1.kpi_res_users_connected = False

        self.env['res.currency.rate'].create({
            'name': '2025-01-03',
            'currency_id': self.digest_1.currency_id.id,
            'rate': 0.1,
            'company_id': company_aed.id,
        })

        # digest creates its mails in auto_delete mode so we need to capture
        # the formatted body during the sending process
        self.digest_1.flush_recordset()
        with self.mock_mail_gateway():
            self.digest_1.action_send()

        self.assertEqual(len(self._new_mails), 1, "A new mail.mail should have been created")
        mail = self._new_mails[0]
        # check mail.mail content
        self.assertEqual(mail.email_to, self.user_employee_c2.email_formatted)

        kpi_message_values = html.fromstring(mail.body_html).xpath('//span[contains(@class, "kpi_value") and contains(@class, "kpi_border_col")]/text()')

        self.assertEqual(
            [t.strip() for t in kpi_message_values],
            ['0د.إ', '-130د.إ', '-130د.إ'],
            "The digest should display the KPI values in the recipient's company currency"
        )
