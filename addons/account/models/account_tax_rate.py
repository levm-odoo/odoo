from odoo import models, fields
from odoo.exceptions import UserError
from odoo.tools import format_date


class AccountTaxRate(models.Model):
    _name = 'account.tax.rate'
    _description = 'Historical Tax Rate'
    _order = 'start_date desc'

    tax_id = fields.Many2one('account.tax', string='Tax', required=True)
    amount = fields.Float(required=True, digits=(16, 4), default=0.0)
    start_date = fields.Date(required=True, default='1900-01-01')

    def _for_date(self, date):
        self.tax_id.ensure_one()
        eligible_rates = self.filtered_domain([('start_date', '<=', fields.Date.to_date(date))])
        if not eligible_rates:
            raise UserError(self.env._(
                "No tax rate before %(date)s defined for tax %(name)s",
                date=format_date(self.env, date),
                name=self.tax_id.display_name,
            ))
        return max(eligible_rates, key=lambda r: r.start_date)
