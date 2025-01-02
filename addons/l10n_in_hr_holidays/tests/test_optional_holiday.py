# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import tagged, Form
from odoo.addons.hr_holidays.tests.common import TestHrHolidaysCommon

from datetime import datetime, timedelta

@tagged('post_install_l10n', 'post_install', '-at_install')
class TestOptionalHoliday(TestHrHolidaysCommon):

    def setUp(self):
        super().setUp()
        self.company.country_id = self.env.ref('base.in').id
        self.env.company = self.company
        self.env.user.tz = 'Asia/Kolkata'

        self.leave_type = self.env['hr.leave.type'].create({
            'name': 'Indian Leave Type',
            'requires_allocation': 'no',
            'time_type': 'leave',
            'request_unit': 'hour',
            'is_limited_to_optional_days': True
        })

        self.optional_holiday_1 = self.env['hr.leave.optional.holiday'].create({
            'name': 'optional holiday 1',
            'start_date': (datetime.today() + timedelta(days=1)).date()
        })

        self.optional_holiday_2 = self.env['hr.leave.optional.holiday'].create({
            'name': 'optional holiday 2',
            'start_date': (datetime.today() - timedelta(days=1)).date()
        })

    def test_optional_holiday_full_day_leave(self):
        with Form(self.env['hr.leave'].with_context(default_employee_id=self.employee_emp_id)) as leave_form:
            leave_form.holiday_status_id = self.leave_type
            leave_form.optional_day_id = self.optional_holiday_1
            self.assertEqual(leave_form.request_date_from, self.optional_holiday_1.start_date)
            self.assertEqual(leave_form.request_date_to, self.optional_holiday_1.end_date)

    def test_optional_holiday_half_day_leave(self):
        with Form(self.env['hr.leave'].with_context(default_employee_id=self.employee_hruser_id)) as leave_form:
            leave_form.holiday_status_id = self.leave_type
            leave_form.optional_day_id = self.optional_holiday_2
            leave_form.request_unit_half = True
            leave_form.request_date_from_period = 'pm'
            self.assertEqual(leave_form.request_date_from, self.optional_holiday_2.start_date)
            self.assertEqual(leave_form.request_date_to, self.optional_holiday_2.end_date)
            self.assertEqual(leave_form.request_date_from_period, 'pm')

    def test_optional_holiday_hours_leave(self):
        with Form(self.env['hr.leave'].with_context(default_employee_id=self.employee_hrmanager_id)) as leave_form:
            leave_form.holiday_status_id = self.leave_type
            leave_form.optional_day_id = self.optional_holiday_1
            leave_form.request_unit_hours = True
            leave_form.request_hour_from = 8
            leave_form.request_hour_to = 17
            self.assertEqual(leave_form.request_date_from, self.optional_holiday_1.start_date)
            self.assertEqual(leave_form.request_date_to, self.optional_holiday_1.end_date)
            self.assertEqual(leave_form.request_unit_hours, True)
            self.assertEqual(leave_form.request_hour_from, 8)
            self.assertEqual(leave_form.request_hour_to, 17)
