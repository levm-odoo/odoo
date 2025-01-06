# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _


class HrLog(models.Model):
    _name = 'hr.log'
    _description = 'HR Log'

    date = fields.Date(required=True, default=fields.Date.today)
    model = fields.Char(required=True)
    record_id = fields.Integer(required=True)
    field_id = fields.Many2one('ir.model.fields')
    last_user = fields.Many2one('res.users', default=lambda self: self.env.user)
    change_reason = fields.Char()
    value_number = fields.Integer()
    value_text = fields.Text()
    value_date = fields.Date()
    value_display = fields.Text(compute='_compute_value_display')

    # _check_at_least_one_defined_value = models.Constraint(
    #     '''CHECK(
    #         (value_number IS NOT NULL)
    #         OR (value_text IS NOT NULL)
    #         OR (value_date IS NOT NULL)
    #     )''',
    #     "Constraint to ensure that at least one value is defined.",
    # )

    def _compute_value_display(self):
        for record in self:
            record.value_display = record.value_number or record.value_text or record.value_date


FIELD_TYPE_MAPPING = {
    'char': 'value_text',
    'integer': 'value_number',
    'date': 'value_date',
}

class HrLogMixin(models.AbstractModel):
    _name = 'hr.log.mixin'
    _description = 'HR Log Mixin'

    log_ids = fields.One2many('hr.log', compute='_compute_log_ids', readonly=False)

    def _compute_log_ids(self):
        # group by record
        self.log_ids = self.env['hr.log'].search([('model', '=', self._name), ('record_id', '=', self.id)])

    def _get_log_vals(self, field):
        self.ensure_one()
        res = {
            'model': self._name,
            'record_id': self.id,
            'field_id': field.id,
        }
        value_field = FIELD_TYPE_MAPPING.get(field.ttype)
        if value_field:
            res[value_field] = self[field.name]
        return res

    @api.model
    def _get_tracked_fields(self):
        # To override
        return self.env['ir.model.fields']

    def _create_logs(self):
        logs_values = []
        for record in self:
            for field in self._get_tracked_fields():
                if field.name not in self._fields:
                    continue
                logs_values.append(record._get_log_vals(field))
        self.env['hr.log'].create(logs_values)

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records._create_logs()
        return records

    def write(self, vals):
        result = super().write(vals)
        self._create_logs()
        return result
