# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta

from odoo import api, models, fields


class HrLeave(models.Model):
    _inherit = "hr.leave"

    l10n_in_contains_sandwich_leaves = fields.Boolean()
    is_limited_to_optional_days = fields.Boolean(related="holiday_status_id.is_limited_to_optional_days")
    optional_day_id = fields.Many2one('hr.leave.optional.holiday', string="Available Days")
    request_date_from = fields.Date('Request Start Date', compute="_compute_request_date_from_to", store=True, readonly=False)
    request_date_to = fields.Date('Request End Date', compute="_compute_request_date_from_to", store=True, readonly=False)

    def _l10n_in_apply_sandwich_rule(self, public_holidays, employee_leaves):
        self.ensure_one()
        if not self.request_date_from or not self.request_date_to:
            return
        date_from = self.request_date_from
        date_to = self.request_date_to
        total_leaves = (self.request_date_to - self.request_date_from).days + 1

        def is_non_working_day(calendar, date):
            return not calendar._works_on_date(date) or any(
                datetime.date(holiday['date_from']) <= date <= datetime.date(holiday['date_to']) for holiday in public_holidays
            )

        def count_sandwich_days(calendar, date, direction):
            current_date = date + timedelta(days=direction)
            days_count = 0
            while is_non_working_day(calendar, current_date):
                days_count += 1
                current_date += timedelta(days=direction)
            for leave in employee_leaves:
                if leave['request_date_from'] <= current_date <= leave['request_date_to']:
                    return days_count
            return 0

        calendar = self.resource_calendar_id
        total_leaves += count_sandwich_days(calendar, date_from, -1) + count_sandwich_days(calendar, date_to, 1)
        if is_non_working_day(calendar, date_from):
            total_leaves -= 1
            if is_non_working_day(calendar, date_from + timedelta(days=+1)):
                total_leaves -= 1
        if is_non_working_day(calendar, date_to):
            total_leaves -= 1
            if is_non_working_day(calendar, date_to + timedelta(days=-1)):
                total_leaves -= 1
        return total_leaves

    def _get_durations(self, check_leave_type=True, resource_calendar=None):
        result = super()._get_durations(check_leave_type, resource_calendar)
        indian_leaves = self.filtered(lambda c: c.company_id.country_id.code == 'IN')
        if not indian_leaves:
            return result

        public_holidays = self.env['resource.calendar.leaves'].search([
            ('resource_id', '=', False),
            ('company_id', 'in', indian_leaves.company_id.ids),
        ])
        leaves_by_employee = dict(self._read_group(
            domain=[
                ('id', 'not in', self.ids),
                ('employee_id', 'in', self.employee_id.ids),
                ('state', 'not in', ['cancel', 'refuse']),
                ('leave_type_request_unit', '=', 'day'),
            ],
            groupby=['employee_id'],
            aggregates=['id:recordset'],
        ))
        for leave in indian_leaves:
            if leave.holiday_status_id.l10n_in_is_sandwich_leave:
                days, hours = result[leave.id]
                updated_days = leave._l10n_in_apply_sandwich_rule(public_holidays, leaves_by_employee.get(leave.employee_id, []))
                result[leave.id] = (updated_days, hours)
                if updated_days:
                    leave.l10n_in_contains_sandwich_leaves = updated_days != days
            else:
                leave.l10n_in_contains_sandwich_leaves = False
        return result

    @api.depends('optional_day_id')
    def _compute_request_date_from_to(self):
        for leave in self:
            if leave.is_limited_to_optional_days:
                leave.request_date_from = leave.optional_day_id.start_date
                leave.request_date_to = leave.optional_day_id.end_date
