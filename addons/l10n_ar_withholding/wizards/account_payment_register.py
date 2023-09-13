# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models, fields, api, Command, _
from odoo.exceptions import UserError


class AccountPaymentRegisterWithholding(models.TransientModel):
    _name = 'account.payment.register.withholding'
    _description = 'Payment register withholding lines'

    payment_register_id = fields.Many2one('account.payment.register', required=True, ondelete='cascade',)
    currency_id = fields.Many2one(related='payment_register_id.currency_id')
    name = fields.Char(string='Number', required=False, default='/')
    tax_id = fields.Many2one('account.tax', required=True,)
    base_amount = fields.Monetary(required=True, compute='_compute_base_amount', store=True, readonly=False)
    amount = fields.Monetary(required=True, compute='_compute_amount', store=True, readonly=False)
        
    @api.depends('tax_id', 'payment_register_id.line_ids', 'payment_register_id.amount')
    def _compute_base_amount(self):
        base_lines = self.payment_register_id.line_ids.move_id.invoice_line_ids
        supplier_recs = self.filtered(lambda x: x.payment_register_id.partner_type == 'supplier')

        for rec in supplier_recs:
            amount_total = sum(rec.payment_register_id.mapped('line_ids.move_id.amount_total'))
            factor = min(rec.payment_register_id.amount / amount_total , 1.0)
            if not rec.tax_id:
                base_amount = 0.0
            tax_base_lines = base_lines.filtered(lambda x: rec.tax_id in x.product_id.l10n_ar_supplier_withholding_taxes_ids)
            if rec.tax_id.l10n_ar_withholding_amount_type == 'untaxed_amount':
                base_amount = factor * sum(tax_base_lines.mapped('price_subtotal'))
            else:
                base_amount = factor * sum(tax_base_lines.mapped('price_total'))

            conversion_rate = rec.payment_register_id._get_conversion_rate()

            base_amount = self.payment_register_id.company_currency_id.round(base_amount * conversion_rate)
            rec.base_amount = base_amount
        # Only supplier compute base tax
        (self - supplier_recs).base_amount = 0.0



    def _tax_compute_all_helper(self):
        self.ensure_one()
        # Computes the withholding tax amount provided a base and a tax
        # It is equivalent to: amount = self.base * self.tax_id.amount / 100
        taxes_res = self.tax_id.compute_all(
            self.base_amount,
            currency=self.payment_register_id.currency_id,
            quantity=1.0,
            product=False,
            partner=False,
            is_refund=False,
        )
        tax_amount = taxes_res['taxes'][0]['amount']
        tax_account_id = taxes_res['taxes'][0]['account_id']
        tax_repartition_line_id = taxes_res['taxes'][0]['tax_repartition_line_id']
        return tax_amount, tax_account_id, tax_repartition_line_id

    @api.depends('tax_id', 'base_amount')
    def _compute_amount(self):
        for line in self:
            if not line.tax_id:
                line.amount = 0.0
            else:
                line.amount, dummy, dummy = line._tax_compute_all_helper()


class AccountPaymentRegister(models.TransientModel):
    _inherit = 'account.payment.register'

    withholding_ids = fields.One2many(
        'account.payment.register.withholding', 'payment_register_id', string="Withholdings",
        compute='_compute_withholdings', readonly=False, store=True)
    net_amount = fields.Monetary(compute='_compute_net_amount', readonly=True,  help="Net amount after withholdings")

    @api.depends('line_ids', 'can_group_payments', 'group_payment')
    def _compute_withholdings(self):
        supplier_recs = self.filtered(lambda x: x.partner_type == 'supplier' and (not x.can_group_payments or (x.can_group_payments and x.group_payment)))        
        for rec in supplier_recs:
            taxes = rec.line_ids.move_id.invoice_line_ids.product_id.l10n_ar_supplier_withholding_taxes_ids.filtered(
                    lambda y: y.company_id == rec.company_id)
            rec.withholding_ids =[Command.clear()] + [Command.create({'tax_id': x.id}) for x in taxes]
        (self - supplier_recs).withholding_ids = False

    @api.onchange('l10n_latam_check_id')
    @api.depends('withholding_ids.amount', 'amount', 'l10n_latam_check_id')
    def _compute_net_amount(self):
        for rec in self:
            if rec.l10n_latam_check_id:
                rec.net_amount = rec.l10n_latam_check_id.amount
                base_lines = rec.line_ids.move_id.invoice_line_ids
                conversion_rate = rec._get_conversion_rate()
                amount_total = sum(rec.mapped('line_ids.move_id.amount_total'))
                amount_untaxed = sum(rec.mapped('line_ids.move_id.amount_untaxed'))
                net_amount = rec.l10n_latam_check_id.amount * conversion_rate
                for withholding in rec.withholding_ids:
                    tax_base_lines = base_lines.filtered(lambda x: withholding.tax_id in x.product_id.l10n_ar_supplier_withholding_taxes_ids)
                    if withholding.tax_id.l10n_ar_withholding_amount_type == 'untaxed_amount':
                        factor_base = sum(tax_base_lines.mapped('price_subtotal')) / amount_untaxed 
                    else:
                        factor_base = sum(tax_base_lines.mapped('price_total')) / amount_total 
                    withholding.base_amount = net_amount * factor_base 
                    withholding._compute_amount()   
                rec.amount = net_amount + sum(rec.withholding_ids.mapped('amount'))         
            else:
                rec.net_amount = rec.amount - sum(rec.withholding_ids.mapped('amount'))
        
    def _get_withholding_move_line_default_values(self):
        return {
            'partner_id': self.partner_id.id,
            'currency_id': self.currency_id.id,
        }

    def _create_payment_vals_from_wizard(self, batch_result):
        payment_vals = super()._create_payment_vals_from_wizard(batch_result)
        payment_vals['amount'] = self.net_amount
        conversion_rate = self._get_conversion_rate()
        sign = 1
        if self.partner_type == 'supplier':
            sign = -1
        for line in self.withholding_ids:
            if not line.name or line.name == '/':
                if line.tax_id.l10n_ar_withholding_sequence_id:
                    line.name = line.tax_id.l10n_ar_withholding_sequence_id.next_by_id()
                else:
                    raise UserError(_('Please enter withholding number for tax %s' % line.tax_id.name))
            dummy, account_id, tax_repartition_line_id = line._tax_compute_all_helper()
            balance = self.company_currency_id.round(line.amount * conversion_rate)
            payment_vals['write_off_line_vals'].append({
                    **self._get_withholding_move_line_default_values(),
                    'name': line.name,
                    'account_id': account_id,
                    'amount_currency': sign * line.amount,
                    'balance': sign * balance,
                    'tax_base_amount': sign * line.base_amount,
                    'tax_repartition_line_id': tax_repartition_line_id,
            })
        
        for base_amount in list(set(self.withholding_ids.mapped('base_amount'))):
            withholding_lines = self.withholding_ids.filtered(lambda x: x.base_amount == base_amount)
            nice_base_label = ','.join(withholding_lines.mapped('name'))
            account_id = self.company_id.l10n_ar_tax_base_account_id.id
            base_amount = sign * base_amount
            cc_base_amount = self.company_currency_id.round(base_amount * conversion_rate)
            payment_vals['write_off_line_vals'].append({
                **self._get_withholding_move_line_default_values(),
                'name': _('Base Ret: ') + nice_base_label,
                'tax_ids': [Command.set(withholding_lines.mapped('tax_id').ids)],
                'account_id': account_id,
                'balance': cc_base_amount,
                'amount_currency': base_amount,
            })
            payment_vals['write_off_line_vals'].append({
                **self._get_withholding_move_line_default_values(),  # Counterpart 0 operation
                'name': _('Base Ret Cont: ') + nice_base_label,
                'account_id': account_id,
                'balance': -cc_base_amount,
                'amount_currency': -base_amount,
            })

        return payment_vals
    
    def _get_conversion_rate(self):
        self.ensure_one()
        if  self.currency_id !=  self.source_currency_id:
            return self.env['res.currency']._get_conversion_rate(
                self.currency_id,
                self.source_currency_id,
                self.company_id,
                self.payment_date,
            )
        return  1.0