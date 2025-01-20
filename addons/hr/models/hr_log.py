# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _


class HrLog(models.Model):
    _name = 'hr.log'
    _description = 'HR Log'

    date = fields.Date(string="Effective Date", required=True, default=fields.Date.today)
    user_id = fields.Many2one('res.users', string="Updated By", default=lambda self: self.env.user, readonly=True)
    model_id = fields.Many2one('ir.model', string="Model")
    record_id = fields.Many2oneReference(required=True)
    field_id = fields.Many2one('ir.model.fields', string="Field")
    change_reason = fields.Char(string="Reason", required=True)

    value_number = fields.Integer()
    value_text = fields.Char()
    value_date = fields.Date()
    value_display = fields.Text(compute='_compute_value_display', string="Value")

    def _compute_value_display(self):
        for record in self:
            record.value_display = record.value_number or record.value_text or record.value_date
