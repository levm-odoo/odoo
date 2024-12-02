from odoo import models, fields


class ResCompany(models.Model):
    _inherit = "res.company"

    account_production_wip_account_id = fields.Many2one('account.account', string='Production WIP Account', check_company=True)
    account_production_wip_overhead_account_id = fields.Many2one('account.account', string='Production WIP Overhead Account', check_company=True)
    cost_method = fields.Selection(
        string="Cost Method",
        selection=[
            ('standard', "Standard Price"),
            ('fifo', "First In First Out (FIFO)"),
            ('average', "Average Cost (AVCO)"),
        ],
        default='standard',
        required=True,
    )

    def action_create_am_svls(self):
        self.ensure_one()
        svls = self.env['stock.valuation.layer'].search([('company_id', '=', self.id)])
        svls._create_grouped_accounting_entries()

