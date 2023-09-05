# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from dateutil.relativedelta import relativedelta
import json
from odoo import models, fields, api, _, Command
from odoo.tools import format_date
from odoo.exceptions import UserError
from odoo.tools import date_utils
from odoo.tools.misc import formatLang

class AccruedExpenseRevenue(models.TransientModel):
    _name = 'account.accrued.orders.wizard'
    _description = 'Accrued Orders Wizard'
    _inherit = 'account.accrued.entry.mixin'
    _check_company_auto = True

    def _get_account_domain(self):
        if self.env.context.get('active_model') == 'purchase.order':
            return [('account_type', '=', 'liability_current')]
        else:
            return [('account_type', '=', 'asset_current')]

    def _get_default_company(self):
        if not self._context.get('active_model'):
            return
        orders = self.env[self._context['active_model']].browse(self._context['active_ids'])
        return orders and orders[0].company_id.id

    def _get_default_date(self):
        return date_utils.get_month(fields.Date.context_today(self))[0] - relativedelta(days=1)

    company_id = fields.Many2one('res.company', default=_get_default_company)
    journal_id = fields.Many2one(
        comodel_name='account.journal',
        compute='_compute_journal_id', store=True, readonly=False, precompute=True,
        domain="[('type', '=', 'general')]",
        required=True,
        check_company=True,
        string='Journal',
    )
    date = fields.Date(default=_get_default_date, required=True)
    reversal_date = fields.Date(
        compute="_compute_reversal_date",
        required=True,
        readonly=False,
        store=True,
        precompute=True,
    )
    amount = fields.Monetary(string='Amount', help="Specify an arbitrary value that will be accrued on a \
        default account for the entire order, regardless of the products on the different lines.")
    currency_id = fields.Many2one(related='company_id.currency_id', string='Company Currency',
        readonly=True, store=True,
        help='Utility field to express amount currency')
    account_id = fields.Many2one(
        comodel_name='account.account',
        required=True,
        string='Accrual Account',
        check_company=True,
        domain=_get_account_domain,
    )
    preview_data = fields.Text(compute='_compute_preview_data')
    display_amount = fields.Boolean(compute='_compute_display_amount')

    @api.depends('date', 'amount')
    def _compute_display_amount(self):
        single_order = len(self._context['active_ids']) == 1
        for record in self:
            preview_data = json.loads(self.preview_data)
            lines = preview_data.get('groups_vals', [])[0].get('items_vals', [])
            record.display_amount = record.amount or (single_order and not lines)

    @api.depends('date')
    def _compute_reversal_date(self):
        for record in self:
            if not record.reversal_date or record.reversal_date <= record.date:
                record.reversal_date = record.date + relativedelta(days=1)
            else:
                record.reversal_date = record.reversal_date

    @api.depends('company_id')
    def _compute_journal_id(self):
        for record in self:
            record.journal_id = self.env['account.journal'].search([
                *self.env['account.journal']._check_company_domain(record.company_id),
                ('type', '=', 'general')
            ], limit=1)

    @api.depends('date', 'journal_id', 'account_id', 'amount')
    def _compute_preview_data(self):
        for record in self:
            move_vals = record._get_move_vals()
            record.preview_data = self._get_preview_data(move_vals, record.company_id.currency_id)

    def _get_aml_vals(self, label, balance, account_id, amount_currency=None, analytic_distribution=None, order=None):
        currency_id = None
        is_purchase = self.env.context.get('active_model') == 'purchase.order'
        if not is_purchase:
            balance *= -1
            amount_currency *= -1
        if len(order) == 1 and self.company_id.currency_id != order.currency_id:
            currency_id = order.currency_id.id,

        return super()._get_aml_vals(label, balance, account_id, currency_id, amount_currency, analytic_distribution)

    def _get_move_vals(self):
        def _ellipsis(string, size):
            if len(string) > size:
                return string[0:size - 3] + '...'
            return string

        self.ensure_one()
        move_lines = []
        is_purchase = self.env.context.get('active_model') == 'purchase.order'
        orders = self.env[self._context['active_model']].with_company(self.company_id).browse(self._context['active_ids'])

        if orders.filtered(lambda o: o.company_id != self.company_id):
            raise UserError(_('Entries can only be created for a single company at a time.'))

        fnames = []
        total_balance = 0.0
        for order in orders:
            if len(orders) == 1 and self.amount and order.order_line:
                total_balance = self.amount
                order_line = order.order_line[0]
                if is_purchase:
                    account = order_line.product_id.property_account_expense_id or order_line.product_id.categ_id.property_account_expense_categ_id
                else:
                    account = order_line.product_id.property_account_income_id or order_line.product_id.categ_id.property_account_income_categ_id
                distribution = order_line.analytic_distribution if order_line.analytic_distribution else {}
                if not is_purchase and order.analytic_account_id:
                    analytic_account_id = str(order.analytic_account_id.id)
                    distribution[analytic_account_id] = distribution.get(analytic_account_id, 0) + 100.0
                values = self._get_aml_vals(_('Manual entry'), self.amount, account.id, amount_currency=0, analytic_distribution=distribution, order=order)
                move_lines.append(Command.create(values))
            else:
                other_currency = self.company_id.currency_id != order.currency_id
                rate = order.currency_id._get_rates(self.company_id, self.date).get(order.currency_id.id) if other_currency else 1.0
                # create a virtual order that will allow to recompute the qty delivered/received (and dependancies)
                # without actually writing anything on the real record (field is computed and stored)
                o = order.new(origin=order)
                if is_purchase:
                    o.order_line.with_context(accrual_entry_date=self.date)._compute_qty_received()
                    o.order_line.with_context(accrual_entry_date=self.date)._compute_qty_invoiced()
                else:
                    o.order_line.with_context(accrual_entry_date=self.date)._compute_qty_delivered()
                    o.order_line.with_context(accrual_entry_date=self.date)._compute_qty_invoiced()
                    o.order_line.with_context(accrual_entry_date=self.date)._compute_untaxed_amount_invoiced()
                    o.order_line.with_context(accrual_entry_date=self.date)._compute_qty_to_invoice()
                lines = o.order_line.filtered(
                    lambda l: l.display_type not in ['line_section', 'line_note'] and
                    fields.Float.compare(
                        l.qty_to_invoice,
                        0,
                        precision_rounding=l.product_uom.rounding,
                    ) == 1
                )
                for order_line in lines:
                    if is_purchase:
                        account = order_line.product_id.property_account_expense_id or order_line.product_id.categ_id.property_account_expense_categ_id
                        amount = self.company_id.currency_id.round(order_line.qty_to_invoice * order_line.price_unit / rate)
                        amount_currency = order_line.currency_id.round(order_line.qty_to_invoice * order_line.price_unit)
                        fnames = ['qty_to_invoice', 'qty_received', 'qty_invoiced', 'invoice_lines']
                        label = _('%s - %s; %s Billed, %s Received at %s each', order.name, _ellipsis(order_line.name, 20), order_line.qty_invoiced, order_line.qty_received, formatLang(self.env, order_line.price_unit, currency_obj=order.currency_id))
                    else:
                        account = order_line.product_id.property_account_income_id or order_line.product_id.categ_id.property_account_income_categ_id
                        amount = self.company_id.currency_id.round(order_line.untaxed_amount_to_invoice / rate)
                        amount_currency = order_line.untaxed_amount_to_invoice
                        fnames = ['qty_to_invoice', 'untaxed_amount_to_invoice', 'qty_invoiced', 'qty_delivered', 'invoice_lines']
                        label = _('%s - %s; %s Invoiced, %s Delivered at %s each', order.name, _ellipsis(order_line.name, 20), order_line.qty_invoiced, order_line.qty_delivered, formatLang(self.env, order_line.price_unit, currency_obj=order.currency_id))
                    distribution = order_line.analytic_distribution if order_line.analytic_distribution else {}
                    if not is_purchase and order.analytic_account_id:
                        analytic_account_id = str(order.analytic_account_id.id)
                        distribution[analytic_account_id] = distribution.get(analytic_account_id, 0) + 100.0
                    values = self._get_aml_vals(label, amount, account.id, amount_currency=amount_currency, analytic_distribution=distribution, order=order)
                    move_lines.append(Command.create(values))
                    total_balance += amount
                # must invalidate cache or o can mess when _create_invoices().action_post() of original order after this
                order.order_line.invalidate_model(fnames)

        if not self.company_id.currency_id.is_zero(total_balance):
            # globalized counterpart for the whole orders selection
            analytic_distribution = {}
            total = sum(order.amount_total for order in orders)
            for line in orders.order_line:
                ratio = line.price_total / total
                if not is_purchase and line.order_id.analytic_account_id:
                    account_id = str(line.order_id.analytic_account_id.id)
                    analytic_distribution.update({account_id: analytic_distribution.get(account_id, 0) +100.0*ratio})
                if not line.analytic_distribution:
                    continue
                for account_id, distribution in line.analytic_distribution.items():
                    analytic_distribution.update({account_id : analytic_distribution.get(account_id, 0) + distribution*ratio})
            values = self._get_aml_vals(_('Accrued total'), -total_balance, self.account_id.id, amount_currency=0.0, analytic_distribution=analytic_distribution, order=orders)
            move_lines.append(Command.create(values))

        move_type = _('Expense') if is_purchase else _('Revenue')
        return {
            'ref': _('Accrued %s entry as of %s', move_type, format_date(self.env, self.date)),
            'journal_id': self.journal_id.id,
            'date': self.date,
            'line_ids': move_lines,
        }

    def create_entries(self):
        if self.reversal_date <= self.date:
            raise UserError(_('Reversal date must be posterior to date.'))

        move, reverse_move = super().create_and_reverse_move()
        return {
            'name': _('Accrual Moves'),
            'type': 'ir.actions.act_window',
            'res_model': 'account.move',
            'view_mode': 'tree,form',
            'domain': [('id', 'in', (move.id, reverse_move.id))],
        }
