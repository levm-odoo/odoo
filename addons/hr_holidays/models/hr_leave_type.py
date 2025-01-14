# Part of Odoo. See LICENSE file for full copyright and licensing details.

# Copyright (c) 2005-2006 Axelor SARL. (http://www.axelor.com)

import logging
import pytz

from collections import defaultdict
from datetime import date, datetime, time
from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError
from odoo.tools import format_date, frozendict
from odoo.tools.translate import _
from odoo.tools.float_utils import float_round

_logger = logging.getLogger(__name__)


class HrLeaveType(models.Model):
    _name = 'hr.leave.type'
    _description = "Time Off Type"
    _order = 'sequence'

    @api.model
    def _model_sorting_key(self, leave_type):
        remaining = leave_type.virtual_remaining_leaves > 0
        taken = leave_type.leaves_taken > 0
        return -1 * leave_type.sequence, leave_type.employee_requests == 'no' and remaining, leave_type.employee_requests == 'yes' and remaining, taken

    name = fields.Char('Time Off Type', required=True, translate=True)
    sequence = fields.Integer(default=100,
        help='The type with the smallest sequence is the default value in time off request')
    create_calendar_meeting = fields.Boolean(string="Display Time Off in Calendar", default=True)
    color = fields.Integer(string='Color', help="The color selected here will be used in every screen with the time off type.")
    icon_id = fields.Many2one('ir.attachment', string='Cover Image', domain="[('res_model', '=', 'hr.leave.type'), ('res_field', '=', 'icon_id')]")
    active = fields.Boolean('Active', default=True,
                            help="If the active field is set to false, it will allow you to hide the time off type without removing it.")
    show_on_dashboard = fields.Boolean(default=True, help="Non-visible allocations can still be selected when taking a leave, but will simply not be displayed on the leave dashboard.")

    # employee specific computed data
    max_leaves = fields.Float(compute='_compute_leaves', string='Maximum Allowed', search='_search_max_leaves',
        help='This value is given by the sum of all time off requests with a positive value.')
    leaves_taken = fields.Float(
        compute='_compute_leaves', string='Time off Already Taken',
        help='This value is given by the sum of all time off requests with a negative value.')
    virtual_remaining_leaves = fields.Float(
        compute='_compute_leaves', search='_search_virtual_remaining_leaves', string='Virtual Remaining Time Off',
        help='Maximum Time Off Allowed - Time Off Already Taken - Time Off Waiting Approval')

    allocation_count = fields.Integer(
        compute='_compute_allocation_count', string='Allocations')
    group_days_leave = fields.Float(
        compute='_compute_group_days_leave', string='Group Time Off')
    is_used = fields.Boolean(compute="_compute_is_used")
    company_id = fields.Many2one('res.company', string='Company',
                                 domain=lambda self: [('id', 'in', self.env.companies.ids)])
    country_id = fields.Many2one('res.country', string='Country',
                                 default=lambda self: self.env.company.country_id,
                                 compute="_compute_country_id",
                                 store=True,
                                 domain=lambda self: [('id', 'in', self.env.companies.country_id.ids)])
    country_code = fields.Char(related='country_id.code', depends=['country_id'], readonly=True)
    responsible_ids = fields.Many2many(
        'res.users', 'hr_leave_type_res_users_rel', 'hr_leave_type_id', 'res_users_id', string='Notified Time Off Officer',
        domain=lambda self: [('groups_id', 'in', self.env.ref('hr_holidays.group_hr_holidays_user').id),
                             ('share', '=', False),
                             ('company_ids', 'in', self.env.company.id)],
        help="Choose the Time Off Officers who will be notified to approve allocation or Time Off Request. If empty, nobody will be notified")
    leave_validation_type = fields.Selection([
        ('no_validation', 'No Validation'),
        ('hr', 'By Time Off Officer'),
        ('manager', "By Employee's Approver"),
        ('both', "By Employee's Approver and Time Off Officer")], default='hr', string='Time Off Validation')
    requires_allocation = fields.Selection([
        ('yes', 'Yes'),
        ('no', 'No Limit')], default="yes", required=True, string='Requires allocation',
        help="""Yes: Time off requests need to have a valid allocation.\n
              No Limit: Time Off requests can be taken without any prior allocation.""")
    employee_requests = fields.Selection([
        ('yes', 'Extra Days Requests Allowed'),
        ('no', 'Not Allowed')], default="no", required=True, string="Employee Requests",
        help="""Extra Days Requests Allowed: User can request an allocation for himself.\n
        Not Allowed: User cannot request an allocation.""")
    allocation_validation_type = fields.Selection([
        ('no_validation', 'No Validation'),
        ('hr', 'By Time Off Officer'),
        ('manager', "By Employee's Approver"),
        ('both', "By Employee's Approver and Time Off Officer")], default='hr', string='Approval',
        help="""Select the level of approval needed in case of request by employee
            #     - No validation needed: The employee's request is automatically approved.
            #     - Approved by Time Off Officer: The employee's request need to be manually approved
            #       by the Time Off Officer, Employee's Approver or both.""")

    has_valid_allocation = fields.Boolean(compute='_compute_valid', search='_search_valid', help='This indicates if it is still possible to use this type of leave')
    time_type = fields.Selection([('other', 'Worked Time'), ('leave', 'Absence')], default='leave', string="Kind of Time Off",
                                 help="The distinction between working time (ex. Attendance) and absence (ex. Training) will be used in the computation of Accrual's plan rate.")
    request_unit = fields.Selection([
        ('day', 'Day'),
        ('half_day', 'Half Day'),
        ('hour', 'Hours')], default='day', string='Take Time Off in', required=True)
    unpaid = fields.Boolean('Is Unpaid', default=False)
    include_public_holidays_in_duration = fields.Boolean('Public Holiday Included', default=False, help="Public holidays should be counted in the leave duration when applying for leaves")
    leave_notif_subtype_id = fields.Many2one('mail.message.subtype', string='Time Off Notification Subtype', default=lambda self: self.env.ref('hr_holidays.mt_leave', raise_if_not_found=False))
    allocation_notif_subtype_id = fields.Many2one('mail.message.subtype', string='Allocation Notification Subtype', default=lambda self: self.env.ref('hr_holidays.mt_leave_allocation', raise_if_not_found=False))
    support_document = fields.Boolean(string='Supporting Document')
    accruals_ids = fields.One2many('hr.leave.accrual.plan', 'time_off_type_id')
    accrual_count = fields.Float(compute="_compute_accrual_count", string="Accruals count")
    # negative time off
    allows_negative = fields.Boolean(string='Allow Negative Cap',
        help="If checked, users request can exceed the allocated days and balance can go in negative.")
    max_allowed_negative = fields.Integer(string="Maximum Excess Amount",
        help="Define the maximum level of negative days this kind of time off can reach. Value must be at least 1.")

    _check_negative = models.Constraint(
        'CHECK(NOT allows_negative OR max_allowed_negative > 0)',
        'The maximum excess amount should be greater than 0. If you want to set 0, disable the negative cap instead.'
    )

    @api.model
    def _search_valid(self, operator, value):
        """ Returns leave_type ids for which a valid allocation exists
            or that don't need an allocation
            return [('id', domain_operator, [x['id'] for x in res])]
        """

        if {'default_date_from', 'default_date_to', 'tz'} <= set(self.env.context):
            default_date_from_dt = fields.Datetime.to_datetime(self.env.context.get('default_date_from'))
            default_date_to_dt = fields.Datetime.to_datetime(self.env.context.get('default_date_to'))

            # Cast: Datetime -> Date using user's tz
            date_from = fields.Date.context_today(self, default_date_from_dt)
            date_to = fields.Date.context_today(self, default_date_to_dt)

        else:
            date_from = fields.Date.today().strftime('%Y-1-1')
            date_to = fields.Date.today().strftime('%Y-12-31')

        employee_id = self.env.context.get('default_employee_id', self.env.context.get('employee_id')) or self.env.user.employee_id.id

        if not isinstance(value, bool):
            raise ValueError('Invalid value: %s' % (value))
        if operator not in ['=', '!=']:
            raise ValueError('Invalid operator: %s' % (operator))
        # '!=' True or '=' False
        if (operator == '=') ^ value:
            new_operator = 'not in'
        # '=' True or '!=' False
        else:
            new_operator = 'in'

        leave_types = self.env['hr.leave.allocation'].search([
            ('employee_id', '=', employee_id),
            ('state', '=', 'validate'),
            ('date_from', '<=', date_to),
            '|',
            ('date_to', '>=', date_from),
            ('date_to', '=', False),
        ]).holiday_status_id

        return [('id', new_operator, leave_types.ids)]

    @api.constrains('include_public_holidays_in_duration')
    def _check_overlapping_public_holidays(self):
        # checking for the current user's company too
        companies = self.company_id | self.env.company
        public_holidays = self.env['resource.calendar.leaves'].search([
            ('resource_id', '=', False),
            ('company_id', 'in', companies.ids),
        ])

        # Define the date range for the current year
        min_datetime = fields.Datetime.to_string(datetime.now().replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0))
        max_datetime = fields.Datetime.to_string(datetime.now().replace(month=12, day=31, hour=23, minute=59, second=59))

        leaves = self.env['hr.leave'].search([
            ('holiday_status_id', 'in', self.ids),
            ('date_from', '>=', min_datetime),
            ('date_from', '<=', max_datetime),
            ('state', 'in', ('validate', 'validate1', 'confirm')),
        ])

        for leave in leaves:
            leave_from_date = leave.date_from.date()
            leave_to_date = leave.date_to.date()

            for public_holiday in public_holidays:
                public_holiday_from_date = public_holiday.date_from.date()
                public_holiday_to_date = public_holiday.date_to.date()

                if leave_from_date <= public_holiday_to_date and leave_to_date >= public_holiday_from_date:
                    raise ValidationError(_("You cannot modify the 'Public Holiday Included' setting since one or more leaves for that \
                        time off type are overlapping with public holidays, meaning that the balance of those employees would be affected by this change."))

    @api.depends('requires_allocation', 'max_leaves', 'virtual_remaining_leaves')
    def _compute_valid(self):
        date_from = self.env.context.get('default_date_from', fields.Datetime.today())
        date_to = self.env.context.get('default_date_to', fields.Datetime.today())
        employee_id = self.env.context.get('default_employee_id', self.env.context.get('employee_id', self.env.user.employee_id.id))
        for leave_type in self:
            if leave_type.requires_allocation == 'yes':
                allocations = self.env['hr.leave.allocation'].search([
                    ('holiday_status_id', '=', leave_type.id),
                    ('allocation_type', '=', 'accrual'),
                    ('employee_id', '=', employee_id),
                    ('date_from', '<=', date_from),
                    '|',
                    ('date_to', '>=', date_to),
                    ('date_to', '=', False),
                ])
                allowed_excess = leave_type.max_allowed_negative if leave_type.allows_negative else 0
                allocations = allocations.filtered(lambda alloc:
                    alloc.allocation_type == 'accrual'
                    or (alloc.max_leaves > 0 and alloc.virtual_remaining_leaves > -allowed_excess)
                )
                leave_type.has_valid_allocation = bool(allocations)
            else:
                leave_type.has_valid_allocation = True

    def _load_records_write(self, values):
        if 'requires_allocation' in values and self.requires_allocation == values['requires_allocation']:
            values.pop('requires_allocation')
        return super()._load_records_write(values)

    @api.constrains('requires_allocation')
    def check_allocation_requirement_edit_validity(self):
        if not self.env.context.get('install_mode') and self.env['hr.leave'].search_count([('holiday_status_id', 'in', self.ids)], limit=1):
            raise UserError(_("The allocation requirement of a time off type cannot be changed once leaves of that type have been taken. You should create a new time off type instead."))

    @api.depends('company_id')
    def _compute_country_id(self):
        for holiday_type in self:
            if holiday_type.company_id:
                holiday_type.country_id = holiday_type.company_id.country_id

    def _search_max_leaves(self, operator, value):
        value = float(value)
        employee = self.env['hr.employee']._get_contextual_employee()
        leaves = defaultdict(int)

        if employee:
            allocations = self.env['hr.leave.allocation'].search([
                ('employee_id', '=', employee.id),
                ('state', '=', 'validate')
            ])
            for allocation in allocations:
                leaves[allocation.holiday_status_id.id] += allocation.number_of_days
        valid_leave = []
        for leave in leaves:
            if operator == '>':
                if leaves[leave] > value:
                    valid_leave.append(leave)
            elif operator == '<':
                if leaves[leave] < value:
                    valid_leave.append(leave)
            elif operator == '=':
                if leaves[leave] == value:
                    valid_leave.append(leave)
            elif operator == '!=':
                if leaves[leave] != value:
                    valid_leave.append(leave)

        return [('id', 'in', valid_leave)]

    def _search_virtual_remaining_leaves(self, operator, value):
        value = float(value)
        leave_types = self.env['hr.leave.type'].search([])
        valid_leave_types = self.env['hr.leave.type']

        for leave_type in leave_types:
            if leave_type.requires_allocation == "yes":
                if operator == '>' and leave_type.virtual_remaining_leaves > value:
                    valid_leave_types |= leave_type
                elif operator == '<' and leave_type.virtual_remaining_leaves < value:
                    valid_leave_types |= leave_type
                elif operator == '>=' and leave_type.virtual_remaining_leaves >= value:
                    valid_leave_types |= leave_type
                elif operator == '<=' and leave_type.virtual_remaining_leaves <= value:
                    valid_leave_types |= leave_type
                elif operator == '=' and leave_type.virtual_remaining_leaves == value:
                    valid_leave_types |= leave_type
                elif operator == '!=' and leave_type.virtual_remaining_leaves != value:
                    valid_leave_types |= leave_type
            else:
                valid_leave_types |= leave_type

        return [('id', 'in', valid_leave_types.ids)]

    @api.depends_context('employee_id', 'default_employee_id', 'default_date_from')
    def _compute_leaves(self):
        employee = self.env['hr.employee']._get_contextual_employee()
        target_date = self.env.context['default_date_from'] if 'default_date_from' in self.env.context else None
        # This is a workaround to save the date value in context for next triggers
        # when context gets cleaned and 'default_' context keys gets removed
        if target_date:
            self.env.context = frozendict(self.env.context, leave_date_from=self.env.context['default_date_from'])
        else:
            target_date = self.env.context.get('leave_date_from', None)
        data_days = self.get_allocation_data(employee, target_date)[employee]
        for holiday_status in self:
            result = [item for item in data_days if item[0] == holiday_status.name]
            leave_type_tuple = result[0] if result else ('', {})
            holiday_status.max_leaves = leave_type_tuple[1].get('max_leaves', 0)
            holiday_status.leaves_taken = leave_type_tuple[1].get('leaves_taken', 0)
            holiday_status.virtual_remaining_leaves = leave_type_tuple[1].get('virtual_remaining_leaves', 0)

    def _compute_allocation_count(self):
        min_datetime = fields.Datetime.to_string(datetime.now().replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0))
        max_datetime = fields.Datetime.to_string(datetime.now().replace(month=12, day=31, hour=23, minute=59, second=59))
        domain = [
            ('holiday_status_id', 'in', self.ids),
            ('date_from', '>=', min_datetime),
            ('date_from', '<=', max_datetime),
            ('state', 'in', ('confirm', 'validate', 'validate1')),
        ]

        grouped_res = self.env['hr.leave.allocation']._read_group(
            domain,
            ['holiday_status_id'],
            ['__count'],
        )
        grouped_dict = {holiday_status.id: count for holiday_status, count in grouped_res}
        for allocation in self:
            allocation.allocation_count = grouped_dict.get(allocation.id, 0)

    def _compute_group_days_leave(self):
        min_datetime = fields.Datetime.to_string(datetime.now().replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0))
        max_datetime = fields.Datetime.to_string(datetime.now().replace(month=12, day=31, hour=23, minute=59, second=59))
        domain = [
            ('holiday_status_id', 'in', self.ids),
            ('date_from', '>=', min_datetime),
            ('date_from', '<=', max_datetime),
            ('state', 'in', ('validate', 'validate1', 'confirm')),
        ]
        grouped_res = self.env['hr.leave']._read_group(
            domain,
            ['holiday_status_id'],
            ['__count'],
        )
        grouped_dict = {holiday_status.id: count for holiday_status, count in grouped_res}
        for allocation in self:
            allocation.group_days_leave = grouped_dict.get(allocation.id, 0)

    def _compute_accrual_count(self):
        accrual_allocations = self.env['hr.leave.accrual.plan']._read_group([('time_off_type_id', 'in', self.ids)], ['time_off_type_id'], ['__count'])
        mapped_data = {time_off_type.id: count for time_off_type, count in accrual_allocations}
        for leave_type in self:
            leave_type.accrual_count = mapped_data.get(leave_type.id, 0)

    def _compute_is_used(self):
        leaves_count = self._leaves_count_by_leave_type_id()
        allocations_count = self._allocations_count_by_leave_type_id()
        for leave_type in self:
            leave_type.is_used = leaves_count.get(leave_type.id, 0) or allocations_count.get(leave_type.id, 0)

    def _leaves_count_by_leave_type_id(self):
        leave_domain = [
            ('holiday_status_id', 'in', self.ids),
        ]
        leaves_count = self.env['hr.leave']._read_group(
            leave_domain,
            ['holiday_status_id'],
            ['__count'],
        )
        return {holiday_status.id: count for holiday_status, count in leaves_count}

    def _allocations_count_by_leave_type_id(self):
        allocation_domain = [
            ('holiday_status_id', 'in', self.ids),
        ]
        allocations_count = self.env['hr.leave.allocation']._read_group(
            allocation_domain,
            ['holiday_status_id'],
            ['__count'],
        )
        return {holiday_status.id: count for holiday_status, count in allocations_count}

    @api.depends('employee_requests')
    def _compute_allocation_validation_type(self):
        for leave_type in self:
            if leave_type.employee_requests == 'no':
                leave_type.allocation_validation_type = 'hr'

    def requested_display_name(self):
        return self.env.context.get('holiday_status_display_name', True) and self.env.context.get('employee_id')

    @api.depends('requires_allocation', 'virtual_remaining_leaves', 'max_leaves', 'request_unit')
    @api.depends_context('holiday_status_display_name', 'employee_id', 'from_manager_leave_form')
    def _compute_display_name(self):
        if not self.requested_display_name():
            # leave counts is based on employee_id, would be inaccurate if not based on correct employee
            return super()._compute_display_name()
        for record in self:
            name = record.name
            if record.requires_allocation == "yes" and not self.env.context.get("from_manager_leave_form"):
                remaining_time = float_round(record.virtual_remaining_leaves, precision_digits=2) or 0.0
                maximum = float_round(record.max_leaves, precision_digits=2) or 0.0

                if record.request_unit == "hour":
                    name = _("%(name)s (%(time)g remaining out of %(maximum)g hours)", name=record.name, time=remaining_time, maximum=maximum)
                else:
                    name = _("%(name)s (%(time)g remaining out of %(maximum)g days)", name=record.name, time=remaining_time, maximum=maximum)
            record.display_name = name

    @api.model
    def _search(self, domain, offset=0, limit=None, order=None):
        """ Override _search to order the results, according to some employee.
        The order is the following

         - allocation fixed first, then allowing allocation, then free allocation
         - virtual remaining leaves (higher the better, so using reverse on sorted)

        This override is necessary because those fields are not stored and depends
        on an employee_id given in context. This sort will be done when there
        is an employee_id in context and that no other order has been given
        to the method.
        """
        employee = self.env['hr.employee']._get_contextual_employee()
        if order == self._order and employee:
            # retrieve all leaves, sort them, then apply offset and limit
            leaves = self.browse(super()._search(domain))
            leaves = leaves.sorted(key=self._model_sorting_key, reverse=True)
            leaves = leaves[offset:(offset + limit) if limit else None]
            return leaves._as_query()
        return super()._search(domain, offset, limit, order)

    def copy_data(self, default=None):
        vals_list = super().copy_data(default=default)
        return [dict(vals, name=self.env._("%s (copy)", leave_type.name)) for leave_type, vals in zip(self, vals_list)]

    def action_see_days_allocated(self):
        self.ensure_one()
        action = self.env["ir.actions.actions"]._for_xml_id("hr_holidays.hr_leave_allocation_action_all")
        action['domain'] = [
            ('holiday_status_id', 'in', self.ids),
        ]
        action['context'] = {
            'default_holiday_status_id': self.ids[0],
            'search_default_approved_state': 1,
            'search_default_year': 1,
        }
        return action

    def action_see_group_leaves(self):
        self.ensure_one()
        action = self.env["ir.actions.actions"]._for_xml_id("hr_holidays.hr_leave_action_action_approve_department")
        action['domain'] = [
            ('holiday_status_id', '=', self.ids[0]),
        ]
        action['context'] = {
            'default_holiday_status_id': self.ids[0],
        }
        return action

    def action_see_accrual_plans(self):
        self.ensure_one()
        action = self.env["ir.actions.actions"]._for_xml_id("hr_holidays.open_view_accrual_plans")
        action['domain'] = [
            ('time_off_type_id', '=', self.id),
        ]
        action['context'] = {
            'default_time_off_type_id': self.id,
        }
        return action

    # ------------------------------------------------------------
    # Leave - Allocation link methods
    # ------------------------------------------------------------

    @api.model
    def has_accrual_allocation(self):
        employee = self.env['hr.employee']._get_contextual_employee()
        if not employee:
            return False
        return bool(self.env['hr.leave.allocation'].search_count([
            ('employee_id', '=', employee.id),
            ('state', '=', 'validate'),
            ('allocation_type', '=', 'accrual'),
            '|',
            ('date_to', '>', date.today()),
            ('date_to', '=', False),
        ]))

    @api.model
    def get_allocation_data_request(self, target_date=None, hidden_allocations=True):
        domain = [
            '|',
            ('company_id', 'in', self.env.context.get('allowed_company_ids')),
            ('company_id', '=', False),
        ]
        if not hidden_allocations:
            domain.append(('show_on_dashboard', '=', True))
        leave_types = self.search(domain, order='id')
        employee = self.env['hr.employee']._get_contextual_employee()
        if employee:
            return leave_types.get_allocation_data(employee, target_date)[employee]
        return []

    def get_allocation_data(self, employees, target_date=None):
        allocation_data = defaultdict(list)
        if target_date and isinstance(target_date, str):
            target_date = datetime.fromisoformat(target_date).date()
        elif target_date and isinstance(target_date, datetime):
            target_date = target_date.date()
        elif not target_date:
            target_date = fields.Date.today()

        allocations_leaves_consumed, extra_data = employees.with_context(
            ignored_leave_ids=self.env.context.get('ignored_leave_ids')
        )._get_consumed_leaves(self, target_date)
        leave_type_requires_allocation = self.filtered(lambda lt: lt.requires_allocation == 'yes')

        for employee in employees:
            for leave_type in leave_type_requires_allocation:
                if len(allocations_leaves_consumed[employee][leave_type]) == 0:
                    continue
                lt_info = (
                    leave_type.name,
                    {
                        'remaining_leaves': 0,
                        'virtual_remaining_leaves': 0,
                        'max_leaves': 0,
                        'accrual_bonus': 0,
                        'leaves_taken': 0,
                        'virtual_leaves_taken': 0,
                        'leaves_requested': 0,
                        'leaves_approved': 0,
                        'closest_allocation_remaining': 0,
                        'closest_allocation_expire': False,
                        'holds_changes': False,
                        'total_virtual_excess': 0,
                        'virtual_excess_data': {},
                        'exceeding_duration': extra_data[employee][leave_type]['exceeding_duration'],
                        'request_unit': leave_type.request_unit,
                        'icon': leave_type.sudo().icon_id.url,
                        'allows_negative': leave_type.allows_negative,
                        'max_allowed_negative': leave_type.max_allowed_negative,
                        'employee_company': employee.company_id.id,
                    },
                    leave_type.requires_allocation,
                    leave_type.id)
                for excess_date, excess_days in extra_data[employee][leave_type]['excess_days'].items():
                    amount = excess_days['amount']
                    lt_info[1]['virtual_excess_data'].update({
                        excess_date.strftime('%Y-%m-%d'): excess_days
                    }),
                    lt_info[1]['total_virtual_excess'] += amount
                    if not leave_type.allows_negative:
                        continue
                    lt_info[1]['virtual_leaves_taken'] += amount
                    lt_info[1]['virtual_remaining_leaves'] -= amount
                    if excess_days['is_virtual']:
                        lt_info[1]['leaves_requested'] += amount
                    else:
                        lt_info[1]['leaves_approved'] += amount
                        lt_info[1]['leaves_taken'] += amount
                        lt_info[1]['remaining_leaves'] -= amount
                allocations_now = self.env['hr.leave.allocation']
                allocations_date = self.env['hr.leave.allocation']
                allocations_with_remaining_leaves = self.env['hr.leave.allocation']
                for allocation, data in allocations_leaves_consumed[employee][leave_type].items():
                    # We only need the allocation that are valid at the given date
                    if allocation:
                        today = fields.Date.today()
                        if allocation.date_from <= today and (not allocation.date_to or allocation.date_to >= today):
                            # we get each allocation available now to indicate visually if
                            # the future evaluation holds changes compared to now
                            allocations_now |= allocation
                        if allocation.date_from <= target_date and (not allocation.date_to or allocation.date_to >= target_date):
                            # we get each allocation available now to indicate visually if
                            # the future evaluation holds changes compared to now
                            allocations_date |= allocation
                        if allocation.date_from > target_date:
                            continue
                        if allocation.date_to and allocation.date_to < target_date:
                            continue
                    lt_info[1]['remaining_leaves'] += data['remaining_leaves']
                    lt_info[1]['virtual_remaining_leaves'] += data['virtual_remaining_leaves']
                    lt_info[1]['max_leaves'] += data['max_leaves']
                    lt_info[1]['accrual_bonus'] += data['accrual_bonus']
                    lt_info[1]['leaves_taken'] += data['leaves_taken']
                    lt_info[1]['virtual_leaves_taken'] += data['virtual_leaves_taken']
                    lt_info[1]['leaves_requested'] += data['virtual_leaves_taken'] - data['leaves_taken']
                    lt_info[1]['leaves_approved'] += data['leaves_taken']
                    if data['virtual_remaining_leaves'] > 0:
                        allocations_with_remaining_leaves |= allocation
                closest_expiration_date, closest_allocation_remaining = self._get_closest_expiring_leaves_date_and_count(
                                                                            allocations_with_remaining_leaves,
                                                                            allocations_leaves_consumed[employee][leave_type],
                                                                            target_date
                                                                        )
                if closest_expiration_date:
                    closest_allocation_expire = format_date(self.env, closest_expiration_date)
                    calendar = employee.resource_calendar_id\
                                or self.env.company.resource_calendar_id
                    # closest_allocation_duration corresponds to the time remaining before the allocation expires
                    calendar_attendance = calendar._work_intervals_batch(
                        datetime.combine(target_date, time.min).replace(tzinfo=pytz.UTC),
                        datetime.combine(closest_expiration_date, time.max).replace(tzinfo=pytz.UTC),
                        resources=employee.resource_id
                    )
                    closest_allocation_dict =\
                        self.env['resource.calendar']._get_attendance_intervals_days_data(
                            calendar_attendance[employee.resource_id.id])
                    if leave_type.request_unit in ['hour']:
                        closest_allocation_duration = closest_allocation_dict['hours']
                    else:
                        closest_allocation_duration = closest_allocation_dict['days']
                else:
                    closest_allocation_expire = False
                    closest_allocation_duration = False
                # the allocations are assumed to be different from today's allocations if there is any
                # accrual days granted or if there is any difference between allocations now and on the selected date
                holds_changes = (lt_info[1]['accrual_bonus'] > 0
                    or bool(allocations_date - allocations_now)
                    or bool(allocations_now - allocations_date))\
                    and target_date != fields.Date.today()
                lt_info[1].update({
                    'closest_allocation_remaining': closest_allocation_remaining,
                    'closest_allocation_expire': closest_allocation_expire,
                    'closest_allocation_duration': closest_allocation_duration,
                    'holds_changes': holds_changes,
                })
                if not self.env.context.get('from_dashboard', False) or lt_info[1]['max_leaves']:
                    allocation_data[employee].append(lt_info)
        for employee in allocation_data:
            for leave_type_data in allocation_data[employee]:
                for key, value in leave_type_data[1].items():
                    if isinstance(value, float):
                        leave_type_data[1][key] = round(value, 2)
        return allocation_data

    def _get_closest_expiring_leaves_date_and_count(self, allocations, remaining_leaves, target_date):
        # Get the expiration date and carryover date of all allocations and compute the closest expiration date
        expiration_dates_per_allocation = defaultdict(lambda: {'expiration_date': fields.Date(), 'carryover_date': fields.Date()})
        expiration_dates = list()
        for allocation in allocations:
            expiration_date = allocation.date_to

            accrual_plan_level = allocation.sudo()._get_current_accrual_plan_level_id(target_date)[0]
            carryover_policy = accrual_plan_level.action_with_unused_accruals if accrual_plan_level else False
            carryover_date = False
            if carryover_policy in ['maximum', 'lost']:
                carryover_date = allocation._get_carryover_date(target_date)
                # If carry over date == target date, then add 1 year to carry over date.
                # Rational: for example if carry over date = 01/01 this year and target date = 01/01 this year,
                # then any accrued days on 01/01 this year will have their carry over date 01/01 next year
                # and not 01/01 this year.
                if carryover_date == target_date:
                    carryover_date += relativedelta(years=1)

            expiration_dates.extend([expiration_date, carryover_date])
            expiration_dates_per_allocation[allocation]['expiration_date'] = expiration_date
            expiration_dates_per_allocation[allocation]['carryover_date'] = carryover_date

        expiration_dates = list(filter(lambda date: date is not False, expiration_dates))
        expiration_dates.sort()
        # Compute the number of expiring leaves
        for closest_expiration_date in expiration_dates:
            expiring_leaves_count = 0
            for allocation in allocations:
                expiration_date = expiration_dates_per_allocation[allocation]['expiration_date']
                carryover_date = expiration_dates_per_allocation[allocation]['carryover_date']
                if expiration_date and expiration_date == closest_expiration_date:
                    expiring_leaves_count += remaining_leaves[allocation]['virtual_remaining_leaves']
                elif carryover_date and carryover_date == closest_expiration_date:
                    accrual_plan_level = allocation.sudo()._get_current_accrual_plan_level_id(target_date)[0]
                    expiring_leaves_count += max(0, remaining_leaves[allocation]['virtual_remaining_leaves'] - accrual_plan_level.postpone_max_days)
            if expiring_leaves_count != 0:
                return closest_expiration_date, expiring_leaves_count

        # No leaves will expire
        return False, 0
