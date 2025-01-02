# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class HrLeaveOptionalHoliday(models.Model):
    _name = 'hr.leave.optional.holiday'
    _description = 'Optional Holidays'
    _order = 'start_date desc, end_date desc'

    name = fields.Char(required=True)
    start_date = fields.Date(required=True)
    end_date = fields.Date(compute="_compute_end_date", store=True)

    @api.model
    def default_get(self, field_list=None):
        if self.env.company.country_id.code != "IN":
            raise UserError(_('You must be logged in an Indian company to use this feature'))
        return super().default_get(field_list)

    @api.depends('name', 'start_date')
    def _compute_display_name(self):
        for record in self:
            name = record.name
            if record.start_date:
                name = f'{name} ({record.start_date})'
            record.display_name = name

    @api.depends('start_date')
    def _compute_end_date(self):
        for record in self:
            record.end_date = record.start_date
