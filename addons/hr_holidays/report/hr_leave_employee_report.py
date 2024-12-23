# Part of Odoo. See LICENSE file for full copyright and licensing details.

from pytz import timezone, utc

from odoo import api, fields, models, tools


class HrLeaveEmployeeReport(models.Model):
    _name = 'hr.leave.employee.report'
    _description = 'Time Off Per Employee Summary / Report'
    _auto = False

    employee_id = fields.Many2one('hr.employee', string="Employee", readonly=True)
    leave_id = fields.Many2one('hr.leave', string="Time Off Request", readonly=True)
    month_aligned_date_from = fields.Datetime('Start Date', readonly=True)
    month_aligned_date_to = fields.Datetime('End Date', readonly=True)
    working_schedule_aligned_date_from = fields.Datetime('Test Date From', compute='_compute_working_schedule_aligned_dates', readonly=True)
    working_schedule_aligned_date_to = fields.Datetime('Test Date To', compute='_compute_working_schedule_aligned_dates', readonly=True)
    number_of_days = fields.Float(compute='_compute_number_of_days', readonly=True)

    def init(self):
        # 1. Assume a leave request that spans multiple months, for example, From 15/10 to 13/12. This query will return 3
        # records instead of 1. The records will have the following boundaries: date_from 15/10, date_to 31/10,
        # date_from 1/11 date_to 30/11 and date_from 1/12, date_to 13/12.
        # 2. The number of days for each record will be computed using _compute_number_of_days.
        # 3. To get the end of a month with HH:mm:ss set as 23:59:59 => month_start + INTERVAL '1 month' - INTERVAL '1 second'.
        #    However, Odoo the timestamps in the database is UTC. So, the timestamps are adjusted according to the timezone
        #    of the current user. For example, if the current user has EUROPE/BRUSSELS timezone, 23:59:59 becomes 00:59:59 which
        #    isn't correct. So, (`AT TIME ZONE {self.env.user.tz}` AT TIME ZONE 'UTC'):: timestamp is used to correct this.
        #    `AT TIME ZONE {self.env.user.tz}` ##sets## the timezone to that of the current user. ` AT TIME ZONE 'UTC'` will
        #    ##convert## the timezone to `UTC` so that when Odoo retrieves the timestamps and adjusts the timezone,
        #    the returned value is as expected. Finally, ::timestamp is used to remove timezone information as required by
        #    the ORM framework that the timestamps are naive.
        tools.drop_view_if_exists(self._cr, 'hr_leave_employee_report')
        self._cr.execute(f"""
            CREATE or REPLACE view hr_leave_employee_report as (
                SELECT
                    id, leave_id, employee_id,
                    CASE WHEN date_from > month THEN date_from ELSE (month AT TIME ZONE '{self.env.user.tz}' AT TIME ZONE 'UTC')::timestamp END AS month_aligned_date_from,
                    CASE WHEN date_to < (month + INTERVAL '1 month' - INTERVAL '1 second') THEN date_to
                    ELSE ((month + INTERVAL '1 month' - INTERVAL '1 second') AT TIME ZONE '{self.env.user.tz}' AT TIME ZONE 'UTC')::timestamp END AS month_aligned_date_to
                FROM (
                    SELECT
                        ROW_NUMBER() OVER(ORDER BY employee_id) AS id,
                        id AS leave_id, employee_id, date_from, date_to,
                        DATE_TRUNC('month', months_included_in_request) AS month
                    FROM hr_leave hl 
                    CROSS JOIN LATERAL GENERATE_SERIES(
                        date_from, 
                        DATE_TRUNC('month', date_to) + INTERVAL '1 month' - INTERVAL '1 second',
                        INTERVAL '1 month'
                    ) AS months_included_in_request
                    WHERE hl.employee_company_id {f"IN {tuple(self.env.companies.ids)}" if len(self.env.companies.ids) > 1 else f"= {self.env.companies.id}"}
                ) AS leave_data
            ); 
        """)

    @api.depends('month_aligned_date_from', 'month_aligned_date_to', 'leave_id', 'leave_id.resource_calendar_id')
    def _compute_working_schedule_aligned_dates(self):
        for leave in self:
            start_date = leave.month_aligned_date_from.replace(tzinfo=utc)
            end_date = leave.month_aligned_date_to.replace(tzinfo=utc)
            work_intervals = leave.leave_id.sudo().resource_calendar_id._work_intervals_batch(start_date, end_date, compute_leaves=False)[False].items()
            leave.working_schedule_aligned_date_from = work_intervals[0][0].astimezone(utc).replace(tzinfo=None)
            leave.working_schedule_aligned_date_to = work_intervals[-1][1].astimezone(utc).replace(tzinfo=None)

    @api.depends('month_aligned_date_from', 'month_aligned_date_to', 'leave_id', 'leave_id.holidays_status_id')
    def _compute_number_of_days(self):
        for leave in self:
            virtual_leave = self.env['hr.leave'].new({
                'date_from': leave.month_aligned_date_from,
                'date_to': leave.month_aligned_date_to,
                'employee_id': leave.leave_id.sudo().employee_id.id,
                'holiday_status_id': leave.leave_id.sudo().holiday_status_id.id
            })
            leave.number_of_days = virtual_leave._get_durations(additional_domain = [('holiday_id', '!=', leave.leave_id.id)])[virtual_leave.id][0]

    def action_open_record(self):
        self.ensure_one()

        return {
            'type': 'ir.actions.act_window',
            'view_mode': 'form',
            'res_id': self.leave_id.id,
            'res_model': 'hr.leave'
        }
