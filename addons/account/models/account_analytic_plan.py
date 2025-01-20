import re

from odoo import _, fields, models, api


class AccountAnalyticApplicability(models.Model):
    _inherit = 'account.analytic.applicability'
    _description = "Analytic Plan's Applicabilities"

    business_domain = fields.Selection(
        selection_add=[
            ('invoice', 'Invoice'),
            ('bill', 'Vendor Bill'),
        ],
        ondelete={
            'invoice': 'cascade',
            'bill': 'cascade',
        },
    )
    account_prefix = fields.Char(
        string='Financial Accounts Prefixes',
        help="Prefix that defines which accounts from the financial accounting this applicability should apply on.",
    )
    product_categ_id = fields.Many2one(
        'product.category',
        string='Product Category'
    )
    display_account_prefix = fields.Boolean(
        compute='_compute_display_account_prefix',
        help='Defines if the field account prefix should be displayed'
    )
    account_prefix_placeholder = fields.Char(compute='_compute_prefix_placeholder')

    @api.depends('account_prefix', 'business_domain')
    def _compute_prefix_placeholder(self):
        for applicability in self:
            account = self.env['account.account'].search(
                [('account_type', '=', 'expense' if applicability.business_domain == 'bill' else 'income')],
                limit=1
            )

            prefix_base = account.code[:2]
            try:
                # Convert prefix_base to an integer for numerical manipulation
                prefix_num = int(prefix_base)
                account_prefixes = f"{prefix_num}, {prefix_num + 1}, {prefix_num + 2}"
                applicability.account_prefix_placeholder = _("e.g. %(prefix)s", prefix=account_prefixes)

            except ValueError:
                applicability.account_prefix_placeholder = "60, 61, 62"

    def _get_score(self, **kwargs):
        score = super(AccountAnalyticApplicability, self)._get_score(**kwargs)
        if score == -1:
            return -1
        product = self.env['product.product'].browse(kwargs.get('product'))
        account = self.env['account.account'].browse(kwargs.get('account'))
        if self.account_prefix:
            account_prefixes = tuple(re.split("[,;]", self.account_prefix.replace(" ", "")))
            if account and account.code.startswith(account_prefixes):
                score += 1
            else:
                return -1
        if self.product_categ_id:
            if product and product.categ_id == self.product_categ_id:
                score += 1
            else:
                return -1
        return score

    @api.depends('business_domain')
    def _compute_display_account_prefix(self):
        for applicability in self:
            applicability.display_account_prefix = applicability.business_domain in ('general', 'invoice', 'bill')
