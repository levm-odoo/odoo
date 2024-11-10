from odoo import models
from odoo.addons.account.models.chart_template import template


class AccountChartTemplate(models.AbstractModel):
    _inherit = 'account.chart.template'

    @template('in', 'account.account')
    def _get_in_tds_account_account(self):
        if self.env.company.l10n_in_tds:
            return self._parse_csv('in', 'account.account', module='l10n_in_tds')

    @template('in', 'account.tax')
    def _get_in_tds_account_tax(self):
        if self.env.company.l10n_in_tds:
            tax_data = self._parse_csv('in', 'account.tax', module='l10n_in_tds')
            self._deref_account_tags('in', tax_data)
            return tax_data

    @template('in', 'res.company')
    def _get_in_base_res_company(self):
        if self.env.company.l10n_in_tds:
            return {
                self.env.company.id: {
                    'l10n_in_withholding_account_id': 'p100595',
                },
            }
