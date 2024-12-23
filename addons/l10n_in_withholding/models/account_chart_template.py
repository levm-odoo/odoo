from odoo import models
from odoo.addons.account.models.chart_template import template


class AccountChartTemplate(models.AbstractModel):
    _inherit = 'account.chart.template'

    @template('in_adv', 'account.account')
    def _get_in_withholding_account_account(self):
        return self._parse_csv('in_adv', 'account.account', module='l10n_in_withholding')

    @template('in_adv', 'account.tax')
    def _get_in_withholding_account_tax(self):
        tax_data = self._parse_csv('in_adv', 'account.tax', module='l10n_in_withholding')
        self._deref_account_tags('in_adv', tax_data)
        return tax_data

    @template('in_adv', 'res.company')
    def _get_in_base_res_company(self):
        return {
            self.env.company.id: {
                'l10n_in_withholding_account_id': 'p100595',
            },
        }
