# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tools.misc import format_duration
from odoo import _, api, fields, models


class HrLeaveType(models.Model):
    _inherit = 'hr.leave.type'

    requires_allocation = fields.Selection(selection_add=[('extra_hours', 'Based on Extra Hours')], ondelete={'extra_hours': 'set default'})
    display_extra_hours = fields.Boolean(related='company_id.hr_attendance_display_overtime')
    warning_multiple_types_based_on_extra_hours = fields.Boolean(compute='_compute_warning_multiple_types_based_on_extra_hours')
    
    @api.depends('requires_allocation')
    def _compute_warning_multiple_types_based_on_extra_hours(self):
        company = self.env.company
        domain = [
            '|', ('company_id', '=', False), ('company_id', '=', company.id),
            ('requires_allocation', '=', 'extra_hours'),
            ('id', 'not in', self.ids)
        ]
        leave_types = self.env['hr.leave.type'].search_count(domain)
        self.warning_multiple_types_based_on_extra_hours = self.requires_allocation == 'extra_hours' and leave_types >= 1

    @api.depends('requires_allocation')
    @api.depends_context('request_type', 'leave', 'holiday_status_display_name', 'employee_id')
    def _compute_display_name(self):
        # Exclude hours available in allocation contexts, it might be confusing otherwise
        if not self.requested_display_name() or self._context.get('request_type', 'leave') == 'allocation':
            return super()._compute_display_name()

        employee = self.env['hr.employee'].browse(self._context.get('employee_id')).sudo()
        if employee.total_overtime <= 0:
            return super()._compute_display_name()

        overtime_leaves = self.filtered(lambda l_type: l_type.requires_allocation == 'extra_hours')
        for leave_type in overtime_leaves:
            leave_type.display_name = "%(name)s (%(count)s)" % {
                'name': leave_type.name,
                'count': _('%s hours available',
                    format_duration(employee.total_overtime)),
            }
        super(HrLeaveType, self - overtime_leaves)._compute_display_name()

    def get_allocation_data(self, employees, date=None):
        res = super().get_allocation_data(employees, date)
        deductible_time_off_types = self.env['hr.leave.type'].search([
            ('requires_allocation', '=', 'extra_hours')])
        leave_type_names = deductible_time_off_types.mapped('name')
        for employee in res:
            for leave_data in res[employee]:
                if leave_data[0] in leave_type_names:
                    leave_data[1]['virtual_remaining_leaves'] = employee.sudo().total_overtime
                    leave_data[1]['overtime_deductible'] = True
                else:
                    leave_data[1]['overtime_deductible'] = False
        return res

    def _get_days_request(self, date=None):
        res = super()._get_days_request(date)
        res[1]['overtime_deductible'] = self.requires_allocation == 'extra_hours'
        return res
