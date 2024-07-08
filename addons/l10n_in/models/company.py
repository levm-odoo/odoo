# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models

class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_in_upi_id = fields.Char(string="UPI Id")
    l10n_in_hsn_code_digit = fields.Selection(
        selection=[
            ("4", "4 Digits"),
            ("6", "6 Digits"),
            ("8", "8 Digits"),
        ],
        string="HSN Code Digit",
        compute="_compute_l10n_in_hsn_code_digit",
        store=True,
        readonly=False,
    )
    l10n_in_pan = fields.Char(
        string="PAN",
        help="PAN enables the department to link all transactions of the person with the department.\n"
             "These transactions include taxpayments, TDS/TCS credits, returns of income/wealth/gift/FBT,"
             " specified transactions, correspondence, and so on.\n"
             "Thus, PAN acts as an identifier for the person with the tax department."
    )
    module_l10n_in_tds = fields.Boolean(string="TDS")
    module_l10n_in_tcs = fields.Boolean(string="TCS")
    l10n_in_tan = fields.Char(string="TAN", help="Tax Deduction and Collection Account Number")
    l10n_in_gst = fields.Boolean(string="GST")

    @api.depends('vat')
    def _compute_l10n_in_hsn_code_digit(self):
        for record in self:
            if record.vat:
                record.l10n_in_hsn_code_digit = "4"
            else:
                record.l10n_in_hsn_code_digit = False

    def create(self, vals):
        res = super().create(vals)
        # Update Fiscal Positions for new branch
        res._update_l10n_in_fiscal_position()
        return res

    def write(self, vals):
        res = super().write(vals)
        if (vals.get('state_id') or vals.get('country_id')) and not self.env.context.get('delay_account_group_sync'):
            # Update Fiscal Positions for companies setting up state for the first time
            self._update_l10n_in_fiscal_position()
        return res

    def _update_l10n_in_fiscal_position(self):
        companies_need_update_fp = self.filtered(lambda c: c.parent_ids[0].chart_template == 'in')
        for company in companies_need_update_fp:
            ChartTemplate = self.env['account.chart.template'].with_company(company)
            fiscal_position_data = ChartTemplate._get_in_account_fiscal_position()
            ChartTemplate._load_data({'account.fiscal.position': fiscal_position_data})
