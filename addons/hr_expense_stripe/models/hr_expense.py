import logging

from odoo import api, fields, models

_logger = logging.getLogger(__name__)

class HrExpense(models.Model):
    _inherit = 'hr.expense'

    stripe_authorization_id = fields.Char('Stripe Authorization ID', readonly=True)
    stripe_transaction_id = fields.Char('Stripe Transaction ID', readonly=True)
    card_id = fields.Many2one(
        comodel_name='hr.expense.stripe.credit.card',
        string='Credit Card ID',
        readonly=True,
        groups='base.group_system',
    )
    card_number = fields.Char(related='card_id.card_number_public', readonly=True, related_sudo=True)

    def _get_default_responsible_for_approval(self):
        # EXTEND hr_expense to bypass approval for expenses created from a stripe transaction
        for expense in self:
            if expense.sudo().card_id:
                return False
        else:
            return super()._get_default_responsible_for_approval()