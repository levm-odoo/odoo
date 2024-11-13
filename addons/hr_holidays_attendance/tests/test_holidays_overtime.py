# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime

from odoo.tests import new_test_user
from odoo.tests.common import TransactionCase, tagged

from odoo.exceptions import AccessError, ValidationError

from freezegun import freeze_time
import time

@tagged('post_install', '-at_install', 'holidays_attendance')
class TestHolidaysOvertime(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.env['res.company'].create({
            'name': 'SweatChipChop Inc.',
        })
        cls.user = new_test_user(cls.env, login='user', groups='base.group_user', company_id=cls.company.id).with_company(cls.company)
        cls.user_manager = new_test_user(cls.env, login='manager', groups='base.group_user,hr_holidays.group_hr_holidays_user,hr_attendance.group_hr_attendance_manager', company_id=cls.company.id).with_company(cls.company)

        cls.manager = cls.env['hr.employee'].create({
            'name': 'Dominique',
            'user_id': cls.user_manager.id,
            'company_id': cls.company.id,
        })
        cls.employee = cls.env['hr.employee'].create({
            'name': 'Barnabé',
            'user_id': cls.user.id,
            'parent_id': cls.manager.id,
            'company_id': cls.company.id,
        })

        cls.leave_type_no_alloc = cls.env['hr.leave.type'].create({
            'name': 'Overtime Compensation No Allocation',
            'company_id': cls.company.id,
            'requires_allocation': 'extra_hours',
        })
        cls.leave_type_employee_allocation = cls.env['hr.leave.type'].create({
            'name': 'Overtime Compensation Employee Allocation',
            'company_id': cls.company.id,
            'requires_allocation': 'extra_hours',
            'employee_requests': 'yes',
            'allocation_validation_type': 'hr',
        })

    def new_attendance(self, check_in, check_out=False):
        return self.env['hr.attendance'].sudo().create({
            'employee_id': self.employee.id,
            'check_in': check_in,
            'check_out': check_out,
        })

    def test_deduct_button_visibility(self):
        with self.with_user('user'):
            self.assertFalse(self.user.request_overtime, 'Button should not be visible')

            self.new_attendance(check_in=datetime(2021, 1, 2, 8), check_out=datetime(2021, 1, 2, 18))
            self.assertEqual(self.user.total_overtime, 10, 'Should have 10 hours of overtime')
            self.assertTrue(self.user.request_overtime, 'Button should be visible')

    def test_check_overtime(self):
        with self.with_user('user'):
            self.assertEqual(self.user.total_overtime, 0, 'No overtime')

            with self.assertRaises(ValidationError), self.cr.savepoint():
                self.env['hr.leave'].create({
                    'name': 'no overtime',
                    'employee_id': self.employee.id,
                    'holiday_status_id': self.leave_type_no_alloc.id,
                    'request_date_from': datetime(2021, 1, 4),
                    'request_date_to': datetime(2021, 1, 4),
                    'state': 'confirm',
                })

            self.new_attendance(check_in=datetime(2021, 1, 2, 8), check_out=datetime(2021, 1, 2, 16))
            self.assertEqual(self.employee.total_overtime, 8, 'Should have 8 hours of overtime')
            leave = self.env['hr.leave'].create({
                'name': 'no overtime',
                'employee_id': self.employee.id,
                'holiday_status_id': self.leave_type_no_alloc.id,
                'request_date_from': datetime(2021, 1, 4),
                'request_date_to': datetime(2021, 1, 4),
            })

            # The employee doesn't have the right to read the overtime from the leave
            overtime = leave.sudo().overtime_id.with_user(self.user)

            # An employee cannot delete an overtime adjustment
            with self.assertRaises(AccessError), self.cr.savepoint():
                overtime.unlink()

            # ... nor change its duration
            with self.assertRaises(AccessError), self.cr.savepoint():
                overtime.duration = 8

    def test_leave_adjust_overtime(self):
        self.new_attendance(check_in=datetime(2021, 1, 2, 8), check_out=datetime(2021, 1, 2, 16))
        self.assertEqual(self.employee.total_overtime, 8, 'Should have 8 hours of overtime')

        leave = self.env['hr.leave'].create({
            'name': 'no overtime',
            'employee_id': self.employee.id,
            'holiday_status_id': self.leave_type_no_alloc.id,
            'request_date_from': datetime(2021, 1, 4),
            'request_date_to': datetime(2021, 1, 4),
        })

        self.assertTrue(leave.overtime_id.adjustment, "An adjustment overtime should be created")
        self.assertEqual(leave.overtime_id.duration, -8)

        self.assertEqual(self.employee.total_overtime, 0)

        leave.action_refuse()
        self.assertFalse(leave.overtime_id.exists(), "Overtime should be deleted")
        self.assertEqual(self.employee.total_overtime, 8)

        leave.action_reset_confirm()
        self.assertTrue(leave.overtime_id.exists(), "Overtime should be created")
        self.assertEqual(self.employee.total_overtime, 0)

        overtime = leave.overtime_id
        leave.unlink()
        self.assertFalse(overtime.exists(), "Overtime should be deleted along with the leave")
        self.assertEqual(self.employee.total_overtime, 8)

    def test_leave_check_overtime_write(self):
        self.new_attendance(check_in=datetime(2021, 1, 2, 8), check_out=datetime(2021, 1, 2, 16))
        self.new_attendance(check_in=datetime(2021, 1, 3, 8), check_out=datetime(2021, 1, 3, 16))
        self.assertEqual(self.employee.total_overtime, 16)

        leave = self.env['hr.leave'].create({
            'name': 'no overtime',
            'employee_id': self.employee.id,
            'holiday_status_id': self.leave_type_no_alloc.id,
            'request_date_from': '2021-1-4',
            'request_date_to': '2021-1-4',
        })
        self.assertEqual(self.employee.total_overtime, 8)

        leave.date_to = datetime(2021, 1, 5)
        self.assertEqual(self.employee.total_overtime, 0)
        with self.assertRaises(ValidationError), self.cr.savepoint():
            leave.date_to = datetime(2021, 1, 6)

        leave.date_to = datetime(2021, 1, 4)
        self.assertEqual(self.employee.total_overtime, 8)

    @freeze_time('2022-1-1')
    def test_leave_check_cancel(self):
        self.new_attendance(check_in=datetime(2021, 1, 2, 8), check_out=datetime(2021, 1, 2, 16))
        self.new_attendance(check_in=datetime(2021, 1, 3, 8), check_out=datetime(2021, 1, 3, 16))
        self.assertEqual(self.employee.total_overtime, 16)

        leave = self.env['hr.leave'].create({
            'name': 'no overtime',
            'employee_id': self.employee.id,
            'holiday_status_id': self.leave_type_no_alloc.id,
            'request_date_from': '2022-1-6',
            'request_date_to': '2022-1-6',
        })
        leave.with_user(self.user_manager).action_validate()
        self.assertEqual(self.employee.total_overtime, 8)

        self.assertTrue(leave.with_user(self.user).can_cancel)
        self.env['hr.holidays.cancel.leave'].with_user(self.user).with_context(default_leave_id=leave.id) \
            .new({'reason': 'Test remove holiday'}) \
            .action_cancel_leave()
        self.assertFalse(leave.overtime_id.exists())

    def test_public_leave_overtime(self):
        leave = self.env['resource.calendar.leaves'].create([{
            'name': 'Public Holiday',
            'date_from': datetime(2022, 5, 5, 6),
            'date_to': datetime(2022, 5, 5, 18),
        }])

        leave.company_id.write({
            'attendance_overtime_validation': 'no_validation',
        })
        self.assertNotEqual(leave.company_id, self.employee.company_id)
        self.manager.company_id = leave.company_id.id

        for emp in [self.employee, self.manager]:
            self.env['hr.attendance'].create({
                'employee_id': emp.id,
                'check_in': datetime(2022, 5, 5, 8),
                'check_out': datetime(2022, 5, 5, 17),
            })

        self.assertEqual(self.employee.total_overtime, 0, "Should have 0 hours of overtime as the public holiday doesn't impact his company")
        self.assertEqual(self.manager.total_overtime, 8, 'Should have 8 hours of overtime (there is one hour of lunch)')
