# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import date, datetime

from odoo.tests import tagged, TransactionCase


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestSandwichLeaveWorkEntry(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        country_in = cls.env.ref('base.in')
        cls.company_in = cls.env['res.company'].create({
            'name': 'Indian Company',
            'country_id': country_in.id,
        })
        cls.resource_calendar_id = cls.env['resource.calendar'].create({
            'name': 'Classic 24h/week',
            'hours_per_day': 8.0,
            'company_id': cls.company_in.id,
            'tz': 'Asia/Kolkata', # UTC +05:30
            'attendance_ids': [
                (0, 0, {'name': 'Monday Morning', 'dayofweek': '0', 'hour_from': 8, 'hour_to': 12, 'day_period': 'morning'}),
                (0, 0, {'name': 'Monday Lunch', 'dayofweek': '0', 'hour_from': 12, 'hour_to': 13, 'day_period': 'lunch'}),
                (0, 0, {'name': 'Monday Afternoon', 'dayofweek': '0', 'hour_from': 13, 'hour_to': 17, 'day_period': 'afternoon'}),
                (0, 0, {'name': 'Thrusday Morning', 'dayofweek': '3', 'hour_from': 8, 'hour_to': 12, 'day_period': 'morning'}),
                (0, 0, {'name': 'Thrusday Lunch', 'dayofweek': '3', 'hour_from': 12, 'hour_to': 13, 'day_period': 'lunch'}),
                (0, 0, {'name': 'Thrusday Afternoon', 'dayofweek': '3', 'hour_from': 13, 'hour_to': 17, 'day_period': 'afternoon'}),
                (0, 0, {'name': 'Friday Morning', 'dayofweek': '4', 'hour_from': 8, 'hour_to': 12, 'day_period': 'morning'}),
                (0, 0, {'name': 'Friday Lunch', 'dayofweek': '4', 'hour_from': 12, 'hour_to': 13, 'day_period': 'lunch'}),
                (0, 0, {'name': 'Friday Afternoon', 'dayofweek': '4', 'hour_from': 13, 'hour_to': 17, 'day_period': 'afternoon'}),
            ]
        })
        cls.kohli_emp = cls.env['hr.employee'].create({
            'name': 'Virat Kohli',
            'country_id': cls.env.ref('base.in').id,
            'company_id': cls.company_in.id,
        })
        cls.kohli_contract = cls.env['hr.contract'].create({
            'date_start': date(2024, 12, 1),
            'name': 'Virat Kohli Contract',
            'company_id': cls.company_in.id,
            'employee_id': cls.kohli_emp.id,
            'wage': 100000,
            'state': 'open',
            'resource_calendar_id': cls.resource_calendar_id.id,
        })
        cls.kohli_emp.resource_calendar_id = cls.resource_calendar_id
        cls.work_entry_type_leave = cls.env['hr.work.entry.type'].create({
            'name': 'Time Off',
            'is_leave': True,
            'code': 'LEAVETEST200'
        })
        cls.leave_type = cls.env['hr.leave.type'].create({
            'name': 'Test Leave Type',
            'request_unit': 'day',
            'l10n_in_is_sandwich_leave': True,
            'requires_allocation': 'no',
            'work_entry_type_id': cls.work_entry_type_leave.id,
        })

    def check_work_entry_type_for_work_entry(self, work_entry_create_vals, work_entry_type):
        for work_entry in work_entry_create_vals:
            self.assertEqual(
                work_entry['work_entry_type_id'],
                work_entry_type.id,
                'work entry type of work entry and leave should be same'
            )

    def test_sandwich_leave_work_entry(self):
        """
        In this test case, we are verifying that if a leave is created between non-working days, it should be marked as
        sandwich leave, and work entries for those non-working days should be created.
        """
        # 1) the employee has the leave which includes the non-working day in between
        sandwich_leave = self.env['hr.leave'].create({
            'name': 'Test Leave',
            'employee_id': self.kohli_emp.id,
            'holiday_status_id': self.leave_type.id,
            'request_date_from': "2024-12-27",
            'request_date_to': "2024-12-30",
        })
        sandwich_leave.action_validate()
        self.assertEqual(sandwich_leave.state, 'validate', 'time-off should be in validate state')
        self.assertEqual(sandwich_leave.duration_display, '4 days', 'Created leave should be 4 days long')
        self.assertTrue(sandwich_leave.l10n_in_contains_sandwich_leaves, 'Created leave should be marked as sandwich leave')
        work_entry_create_vals = self.kohli_contract._get_contract_work_entries_values(
            datetime(2024, 12, 27),
            datetime(2024, 12, 30 , 23, 59, 59)
        )
        self.assertEqual(len(work_entry_create_vals), 6, 'Should have generated 6 work entries.')
        self.check_work_entry_type_for_work_entry(work_entry_create_vals, self.work_entry_type_leave)

        # 2) If an employee has already validated leave on a working day and then creates another leave on the following working day,
        #    this new leave should be included in the sandwich leave.
        test_leaves = self.env['hr.leave'].create([{
            'name': 'Test Leave 1',
            'employee_id': self.kohli_emp.id,
            'holiday_status_id': self.leave_type.id,
            'request_date_from': "2024-12-06",
            'request_date_to': "2024-12-06",
        }, {
            'name': 'Test Leave 2',
            'employee_id': self.kohli_emp.id,
            'holiday_status_id': self.leave_type.id,
            'request_date_from': "2024-12-09",
            'request_date_to': "2024-12-09",
        }])

        test_leaves.action_validate()
        self.assertEqual(test_leaves[0].state, 'validate', 'time-off should be in validate state')
        self.assertEqual(test_leaves[1].duration_display, '3 days', 'Created leave should be 3 days long')
        work_entry_create_vals = self.kohli_contract._get_contract_work_entries_values(
            datetime(2024, 12, 9),
            datetime(2024, 12, 9, 23, 59, 59)
        )
        self.assertEqual(len(work_entry_create_vals), 4, 'Should have generated 4 work entries.')
        self.assertTrue(test_leaves[1].l10n_in_contains_sandwich_leaves, 'Created leave should be marked as sandwich leave')
        self.check_work_entry_type_for_work_entry(work_entry_create_vals, test_leaves[0].holiday_status_id.work_entry_type_id)

        # 3) If an employee has already validated leave on a working day and then creates another leave
        #    spanning from a non-working day to a working day, this leave should be marked as sandwich leave
        #    and should generate work entries for the non-working days.
        test_leaves_1 = self.env['hr.leave'].create([{
            'name': 'Test Leave 1',
            'employee_id': self.kohli_emp.id,
            'holiday_status_id': self.leave_type.id,
            'request_date_from': "2024-12-16",
            'request_date_to': "2024-12-16",
        }, {
            'name': 'Test Leave 2',
            'employee_id': self.kohli_emp.id,
            'holiday_status_id': self.leave_type.id,
            'request_date_from': "2024-12-13",
            'request_date_to': "2024-12-14",
        }])
        test_leaves_1.action_validate()
        self.assertEqual(test_leaves_1[0].state, 'validate', 'time-off should be in validate state')
        self.assertEqual(test_leaves[1].duration_display, '3 days', 'Created leave should be 3 days long')
        work_entry_create_vals = self.kohli_contract._get_contract_work_entries_values(
            datetime(2024, 12, 13),
            datetime(2024, 12, 14, 23, 59, 59)
        )
        self.assertEqual(len(work_entry_create_vals), 4, 'Should have generated 4 work entries.')
        self.assertTrue(test_leaves[1].l10n_in_contains_sandwich_leaves, 'Created leave should be marked as sandwich leave')
        self.check_work_entry_type_for_work_entry(work_entry_create_vals, test_leaves[0].holiday_status_id.work_entry_type_id)

    def test_sandwich_cantain_public_holiday(self):
        """
        This test case verifies that if a leave is created between non-working days and a public holiday, it should be
        marked as sandwich leave, including the public holiday as leave, and create work entries accordingly.
        """
        self.env['resource.calendar.leaves'].create({
            'name': 'Public Holiday',
            'date_from': date(2024, 12, 27),
            'date_to': date(2024, 12, 27),
            'calendar_id': self.resource_calendar_id.id,
        })

        sandwich_leave = self.env['hr.leave'].create({
            'name': 'Test Leave',
            'employee_id': self.kohli_emp.id,
            'holiday_status_id': self.leave_type.id,
            'request_date_from': "2024-12-26",
            'request_date_to': "2024-12-30",
        })
        sandwich_leave.action_validate()
        self.assertEqual(sandwich_leave.state, 'validate', 'hr_holidays: validation should lead to validate state')
        self.assertEqual(sandwich_leave.duration_display, '5 days', 'Created leave should be 5 days long')
        work_entry_create_vals = self.kohli_contract._get_contract_work_entries_values(
            datetime(2024, 12, 26, 00, 00, 00),
            datetime(2024, 12, 30, 23, 59, 59)
        )
        self.assertEqual(len(work_entry_create_vals), 8, 'Should have generated 8 work entries.')
        self.check_work_entry_type_for_work_entry(work_entry_create_vals, self.work_entry_type_leave)

    def test_sandwich_leave_not_containing_public_holiday(self):
        self.env['resource.calendar.leaves'].create({
            'name': 'Public Holiday',
            'date_from': date(2024, 12, 20),
            'date_to': date(2024, 12, 20),
            'calendar_id': self.resource_calendar_id.id,
        })
        sandwich_leave_1 = self.env['hr.leave'].create([{
            'name': 'Test Leave',
            'employee_id': self.kohli_emp.id,
            'holiday_status_id': self.leave_type.id,
            'request_date_from': "2024-12-19",
            'request_date_to': "2024-12-19",
        }, {
            'name': 'Test Leave 1',
            'employee_id': self.kohli_emp.id,
            'holiday_status_id': self.leave_type.id,
            'request_date_from': "2024-12-23",
            'request_date_to': "2024-12-23",
        }])
        sandwich_leave_1.action_validate()
        self.assertEqual(sandwich_leave_1[0].state, 'validate', 'hr_holidays: validation should lead to validate state')
        self.assertEqual(sandwich_leave_1[1].duration_display, '4 days', 'Created leave should be 4 days long')
        self.kohli_emp.generate_work_entries(date(2024, 12, 20), date(2024, 12, 20))
        work_entry_create_vals = self.kohli_contract._get_contract_work_entries_values(
            datetime(2024, 12, 23, 00, 00, 00),
            datetime(2024, 12, 23, 23, 59, 59)
        )
        self.assertEqual(len(work_entry_create_vals), 4, 'Should have generated 8 work entries.')
        self.check_work_entry_type_for_work_entry(work_entry_create_vals, self.work_entry_type_leave)
