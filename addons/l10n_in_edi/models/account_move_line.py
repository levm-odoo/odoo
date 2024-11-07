from odoo import models

class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    def _l10n_in_is_global_discount(self):
        self.ensure_one()
        return not self.tax_ids and self.price_subtotal < 0 or False
