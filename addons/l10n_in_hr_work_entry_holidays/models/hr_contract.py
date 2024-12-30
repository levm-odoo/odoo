# Part of Odoo. See LICENSE file for full copyright and licensing details.

import pytz
from collections import defaultdict
from datetime import datetime, time, timedelta

from odoo import models
from odoo.addons.resource.models.utils import datetime_to_string


class HrContract(models.Model):
    _inherit = 'hr.contract'

    def _get_contract_work_entries_values(self, date_start, date_stop):
        result = super()._get_contract_work_entries_values(date_start, date_stop)
        in_contracts = self.filtered(lambda c: c.company_id.country_id.code == 'IN')
        if not in_contracts:
            return result

        start_dt = pytz.utc.localize(date_start) if not date_start.tzinfo else date_start
        end_dt = pytz.utc.localize(date_stop) if not date_stop.tzinfo else date_stop
        employees = in_contracts.mapped('employee_id')

        leaves = self.env['hr.leave'].search([
            ('employee_id', 'in', employees.ids),
            ('state', '=', 'validate'),
            ('date_from', '<=', datetime_to_string(end_dt)),
            ('date_to', '>=', datetime_to_string(start_dt)),
            ('l10n_in_contains_sandwich_leaves', '=', True),
        ])

        leaves_by_employee = defaultdict(list)
        for leave in leaves:
            leaves_by_employee[leave.employee_id.id].append(leave)

        existing_entries = {(vals['date_start'], vals['date_stop']) for vals in result}

        for contract in in_contracts:
            employee = contract.employee_id
            employee_id = employee.id
            calendar = contract.resource_calendar_id
            resource = employee.resource_id
            tz = pytz.timezone(calendar.tz)

            attendance_intervals = list(calendar._attendance_intervals_batch(
                start_dt, end_dt, resources=resource, tz=tz
            )[resource.id])

            working_start_time_utc = attendance_intervals[0][0].astimezone(pytz.utc).time() if attendance_intervals else time(8, 0)
            attendance_dates = {interval[0].date() for interval in attendance_intervals}

            for leave in leaves_by_employee[employee_id]:
                leave_work_entry_type = leave.holiday_status_id.work_entry_type_id
                leave_start_dt = max(start_dt, leave.date_from.astimezone(tz))
                leave_end_dt = min(end_dt, leave.date_to.astimezone(tz))

                if leave.linked_sandwich_leave_id:
                    linked_leave = leave.linked_sandwich_leave_id
                    leave_start_dt = min(leave_start_dt, linked_leave.date_from.astimezone(tz)) + timedelta(days=1)
                    leave_end_dt = max(leave_end_dt, linked_leave.date_to.astimezone(tz)) + timedelta(days=-1)

                    public_holidays = self.env['hr.work.entry'].search([
                        ('date_start', '>=', datetime_to_string(leave_start_dt)),
                        ('date_stop', '<=', datetime_to_string(leave_end_dt)),
                        ('employee_id', '=', employee_id),
                        ('leave_id', '=', False),
                    ])

                    for holiday in public_holidays:
                        holiday.write({
                            'work_entry_type_id': leave_work_entry_type.id,
                            'leave_id': leave.id,
                            'name': f"{leave_work_entry_type.name + ': ' if leave_work_entry_type else ''}{employee.name}"
                        })

                leave_dates = {
                    leave_start_dt.date() + timedelta(days=i)
                        for i in range((leave_end_dt.date() - leave_start_dt.date()).days + 1)
                }

                public_holiday_dates = {h.date_start.date() for h in public_holidays} if leave.linked_sandwich_leave_id else set()

                missing_dates = leave_dates - attendance_dates - public_holiday_dates

                for missing_date in missing_dates:
                    work_entry_start = datetime.combine(missing_date, working_start_time_utc)
                    work_entry_stop = work_entry_start + timedelta(hours=calendar.hours_per_day)

                    if (work_entry_start, work_entry_stop) not in existing_entries:
                        result.append({
                            'name': f"{leave_work_entry_type.name + ': ' if leave_work_entry_type else ''}{employee.name}",
                            'date_start': work_entry_start,
                            'date_stop': work_entry_stop,
                            'work_entry_type_id': leave_work_entry_type.id,
                            'employee_id': employee_id,
                            'company_id': contract.company_id.id,
                            'state': 'draft',
                            'contract_id': contract.id,
                            'leave_id': leave.id,
                        })

        for entry in result:
            if not entry.get('leave_id'):
                entry_date = entry['date_start'].date()
                employee_id = entry['employee_id']

                for leave in leaves_by_employee.get(employee_id, []):
                    if leave.date_from.date() <= entry_date <= leave.date_to.date():
                        leave_work_entry_type = leave.holiday_status_id.work_entry_type_id
                        entry.update({
                            'work_entry_type_id': leave_work_entry_type.id,
                            'leave_id': leave.id,
                            'name': f"{leave_work_entry_type.name + ': ' if leave_work_entry_type else ''}{employees.browse(employee_id).name}"
                        })
                        break

        return result
