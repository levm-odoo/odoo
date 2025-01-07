from odoo import api, models, fields


class AccountCategory(models.Model):
    _name = 'account.category'
    _description = 'Account Category'

    def _next_sequence_num(self):
        return self.env['account.category'].search([], limit=1, order='sequence DESC').sequence + 1

    name = fields.Char(required=True)
    scope = fields.Selection(
        selection=[
            ('sale', "Sales"),
            ('purchase', "Purchases"),
            ('other', "Other"),
        ],
    )
    parent_id = fields.Many2one(
        comodel_name='account.category',
    )
    sequence = fields.Integer(default=_next_sequence_num)
    account_ids = fields.One2many(
        comodel_name='account.account', inverse_name='category_id',
    )
    prefix = fields.Char(compute='_compute_prefix')


    @api.depends('account_ids')
    def _compute_prefix(self):
        for category in self:
            category.prefix = ', '.join(set(category.account_ids.mapped(lambda a: a.code[:3]))) if category.account_ids else ""