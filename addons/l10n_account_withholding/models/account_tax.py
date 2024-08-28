# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models


class AccountTax(models.Model):
    _inherit = 'account.tax'

    # ------------------
    # Fields declaration
    # ------------------

    l10n_account_wth_is_wth_tax = fields.Boolean(
        string="Withholding On Payment",
        help="If enabled, this tax will not affect journal entries until the registration of payment.",
        copy=False,
    )
    l10n_account_wth_sequence_id = fields.Many2one(
        string='Withholding Sequence',
        help='Label displayed on Journal Items and Payment Receipts.',
        comodel_name='ir.sequence',
        copy=False,
        check_company=True,
    )

    @api.onchange('l10n_account_wth_is_wth_tax')
    def _onchange_l10n_account_wth_is_wth_tax(self):
        """ Ensure that we don't keep cash basis enabled if it was before checking the withholding tax option. """
        if self.l10n_account_wth_is_wth_tax:
            self.tax_exigibility = 'on_invoice'
