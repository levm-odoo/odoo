from odoo import api, fields, models, _
from odoo.tools import formatLang, float_is_zero
from odoo.exceptions import ValidationError


class PosPayment(models.Model):
    """ Used to register payments made in a pos.order.

    See `payment_ids` field of pos.order model.
    The main characteristics of pos.payment can be read from
    `payment_method_id`.
    """

    _name = "pos.payment"
    _description = "Point of Sale Payments"
    _order = "id desc"

    name = fields.Char(string='Label', readonly=True)
    pos_order_id = fields.Many2one('pos.order', string='Order', required=True, index=True)
    amount = fields.Monetary(string='Amount', required=True, currency_field='currency_id', readonly=True, help="Total amount of the payment.")
    payment_method_id = fields.Many2one('pos.payment.method', string='Payment Method', required=True)
    payment_date = fields.Datetime(string='Date', required=True, readonly=True, default=lambda self: fields.Datetime.now())
    currency_id = fields.Many2one('res.currency', string='Currency', related='pos_order_id.currency_id')
    currency_rate = fields.Float(string='Conversion Rate', related='pos_order_id.currency_rate', help='Conversion rate from company currency to order currency.')
    partner_id = fields.Many2one('res.partner', string='Customer', related='pos_order_id.partner_id')
    session_id = fields.Many2one('pos.session', string='Session', related='pos_order_id.session_id', store=True, index=True)
    company_id = fields.Many2one('res.company', string='Company', related='pos_order_id.company_id', store=True)
    card_type = fields.Char('Type of card used')
    cardholder_name = fields.Char('Cardholder Name')
    transaction_id = fields.Char('Payment Transaction ID')
    payment_status = fields.Char('Payment Status')
    ticket = fields.Char('Payment Receipt Info')
    is_change = fields.Boolean(string='Is this payment change?', default=False)
    account_move_id = fields.Many2one('account.move', index='btree_not_null')

    def name_get(self):
        res = []
        for payment in self:
            if payment.name:
                res.append((payment.id, '%s %s' % (payment.name, formatLang(self.env, payment.amount, currency_obj=payment.currency_id))))
            else:
                res.append((payment.id, formatLang(self.env, payment.amount, currency_obj=payment.currency_id)))
        return res

    @api.constrains('payment_method_id')
    def _check_payment_method_id(self):
        for payment in self:
            if payment.payment_method_id not in payment.session_id.config_id.payment_method_ids:
                raise ValidationError(_('The payment method selected is not allowed in the config of the POS session.'))

    def _export_for_ui(self, payment):
        return {
            'payment_method_id': payment.payment_method_id.id,
            'amount': payment.amount,
            'payment_status': payment.payment_status,
            'card_type': payment.card_type,
            'cardholder_name': payment.cardholder_name,
            'transaction_id': payment.transaction_id,
            'ticket': payment.ticket,
            'is_change': payment.is_change,
        }

    def export_for_ui(self):
        return self.mapped(self._export_for_ui) if self else []

    def _create_payment_moves(self, is_reverse=False):
        result = self.env['account.move']
        change_payment = self.filtered(lambda p: p.is_change and p.payment_method_id.type == 'cash')
        payment_to_change = self.filtered(lambda p: not p.is_change and p.payment_method_id.type == 'cash')[:1]
        normal_payments = (self - payment_to_change) - change_payment if change_payment else self

        # Handle normal payments
        for payment in normal_payments:
            payment_method = payment.payment_method_id
            if payment_method.type == 'pay_later' or float_is_zero(payment.amount, precision_rounding=payment.pos_order_id.currency_id.rounding):
                continue
            payment_move = payment._create_payment_move_entry(is_reverse)
            payment.write({'account_move_id': payment_move.id})
            result |= payment_move
            payment_move._post()

        # Handle change payments
        if change_payment and payment_to_change:
            result |= payment_to_change._create_payment_move_with_change(is_reverse, change_payment)

        return result

    def _create_payment_move_with_change(self, is_reverse, change_payment):
        if self.payment_method_id.type != 'pay_later' and not float_is_zero(self.amount, precision_rounding=self.pos_order_id.currency_id.rounding):
            payment_move = self._generate_payment_move(is_reverse, change_payment)
            self.write({'account_move_id': payment_move.id})
            payment_move._post()
            return payment_move

    def _create_payment_move_entry(self, is_reverse=False):
        self.ensure_one()
        return self._generate_payment_move(is_reverse)

    def _generate_payment_move(self, is_reverse, change_payment=None):
        order = self.pos_order_id
        pos_session = order.session_id
        journal = pos_session.config_id.journal_id
        pos_payment_ids = self.ids
        payment_amount = self.amount

        if change_payment:
            pos_payment_ids += change_payment.ids
            payment_amount += change_payment.amount

        payment_move = self.env['account.move'].with_context(default_journal_id=journal.id).create({
            'journal_id': journal.id,
            'date': fields.Date.context_today(order, order.date_order),
            'ref': _('Invoice payment for %s (%s) using %s') % (order.name, order.account_move.name, self.payment_method_id.name),
            'pos_payment_ids': pos_payment_ids,
        })
        amounts = pos_session._update_amounts({'amount': 0, 'amount_converted': 0}, {'amount': payment_amount}, self.payment_date)
        credit_line_values = self._prepare_credit_line_payment(payment_move)
        credit_line_vals = pos_session._credit_amounts(credit_line_values, amounts['amount'], amounts['amount_converted'])
        debit_line_values = self._prepare_debit_line_payment(payment_move, is_reverse)
        debit_line_vals = pos_session._debit_amounts(debit_line_values, amounts['amount'], amounts['amount_converted'])
        self.env['account.move.line'].with_context(check_move_validity=False).create([credit_line_vals, debit_line_vals])
        return payment_move

    def _prepare_credit_line_payment(self, payment_move):
        accounting_partner = self.env["res.partner"]._find_accounting_partner(self.partner_id)
        order = self.pos_order_id
        return {
            'account_id': accounting_partner.with_company(order.company_id).property_account_receivable_id.id,  # The field being company dependant, we need to make sure the right value is received.
            'move_id': payment_move.id,
            'partner_id': accounting_partner.id,
        }

    def _prepare_debit_line_payment(self, payment_move, is_reverse):
        accounting_partner = self.env["res.partner"]._find_accounting_partner(self.partner_id)
        order = self.pos_order_id
        is_split_transaction = self.payment_method_id.split_transactions
        if is_split_transaction and is_reverse:
            reversed_move_receivable_account_id = accounting_partner.with_company(order.company_id).property_account_receivable_id.id
        elif is_reverse:
            reversed_move_receivable_account_id = self.payment_method_id.receivable_account_id.id or self.company_id.account_default_pos_receivable_account_id.id
        else:
            reversed_move_receivable_account_id = self.company_id.account_default_pos_receivable_account_id.id
        return {
            'account_id': reversed_move_receivable_account_id,
            'move_id': payment_move.id,
            'partner_id': accounting_partner.id if is_split_transaction and is_reverse else False,
        }
