# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

# Copyright (c) 2005-2006 Axelor SARL. (http://www.axelor.com)

import datetime
import logging

from collections import defaultdict

from odoo import api, fields, models
from odoo.osv import expression
from odoo.tools import format_date
from odoo.tools.translate import _
from odoo.tools.float_utils import float_round

_logger = logging.getLogger(__name__)


class HolidaysType(models.Model):
    _name = "hr.leave.type"
    _description = "Time Off Type"
    _order = 'sequence'

    @api.model
    def _model_sorting_key(self, leave_type):
        remaining = leave_type.virtual_remaining_leaves > 0
        taken = leave_type.leaves_taken > 0
        return -1*leave_type.sequence, leave_type.employee_requests == 'no' and remaining, leave_type.employee_requests == 'yes' and remaining, taken

    name = fields.Char('Time Off Type', required=True, translate=True)
    sequence = fields.Integer(default=100,
                              help='The type with the smallest sequence is the default value in time off request')
    create_calendar_meeting = fields.Boolean(string="Display Time Off in Calendar", default=True)
    color_name = fields.Selection([
        ('red', 'Red'),
        ('blue', 'Blue'),
        ('lightgreen', 'Light Green'),
        ('lightblue', 'Light Blue'),
        ('lightyellow', 'Light Yellow'),
        ('magenta', 'Magenta'),
        ('lightcyan', 'Light Cyan'),
        ('black', 'Black'),
        ('lightpink', 'Light Pink'),
        ('brown', 'Brown'),
        ('violet', 'Violet'),
        ('lightcoral', 'Light Coral'),
        ('lightsalmon', 'Light Salmon'),
        ('lavender', 'Lavender'),
        ('wheat', 'Wheat'),
        ('ivory', 'Ivory')], string='Color in Report', required=True, default='red',
         help='This color will be used in the time off summary located in Reporting > Time off by Department.')
    color = fields.Integer(string='Color', help="The color selected here will be used in every screen with the time off type.")
    icon_id = fields.Many2one('ir.attachment', string='Cover Image', domain="[('res_model', '=', 'hr.leave.type'), ('res_field', '=', 'icon_id')]")
    active = fields.Boolean('Active', default=True,
                            help="If the active field is set to false, it will allow you to hide the time off type without removing it.")
    max_leaves = fields.Float(compute='_compute_leaves', string='Maximum Allowed', search='_search_max_leaves',
                              help='This value is given by the sum of all time off requests with a positive value.')
    leaves_taken = fields.Float(
        compute='_compute_leaves', string='Time off Already Taken',
        help='This value is given by the sum of all time off requests with a negative value.')
    remaining_leaves = fields.Float(
        compute='_compute_leaves', string='Remaining Time Off',
        help='Maximum Time Off Allowed - Time Off Already Taken')
    virtual_remaining_leaves = fields.Float(
        compute='_compute_leaves', search='_search_virtual_remaining_leaves', string='Virtual Remaining Time Off',
        help='Maximum Time Off Allowed - Time Off Already Taken - Time Off Waiting Approval')
    virtual_leaves_taken = fields.Float(
        compute='_compute_leaves', string='Virtual Time Off Already Taken',
        help='Sum of validated and non validated time off requests.')
    closest_allocation_to_expire = fields.Many2one('hr.leave.allocation', 'Allocation', compute='_compute_leaves')
    employee_accrual = fields.Boolean(compute='_compute_employee_accrual', search='_search_employee_accrual')
    allocation_count = fields.Integer(
        compute='_compute_allocation_count', string='Allocations')
    group_days_leave = fields.Float(
        compute='_compute_group_days_leave', string='Group Time Off')
    company_id = fields.Many2one('res.company', string='Company', default=lambda self: self.env.company)
    responsible_id = fields.Many2one(
        'res.users', 'Responsible Time Off Officer',
        domain=lambda self: [('groups_id', 'in', self.env.ref('hr_holidays.group_hr_holidays_user').id)],
        help="Choose the Time Off Officer who will be notified to approve allocation or Time Off request")
    leave_validation_type = fields.Selection([
        ('no_validation', 'No Validation'),
        ('hr', 'By Time Off Officer'),
        ('manager', "By Employee's Approver"),
        ('both', "By Employee's Approver and Time Off Officer")], default='hr', string='Leave Validation')
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
        ('officer', 'Approved by Time Off Officer'),
        ('no', 'No validation needed')], default='officer', string='Approval',
        compute='_compute_allocation_validation_type', store=True, readonly=False,
        help="""Select the level of approval needed in case of request by employee
        - No validation needed: The employee's request is automatically approved.
        - Approved by Time Off Officer: The employee's request need to be manually approved by the Time Off Officer.""")
    has_valid_allocation = fields.Boolean(compute='_compute_valid', search='_search_valid', help='This indicates if it is still possible to use this type of leave')
    time_type = fields.Selection([('leave', 'Time Off'), ('other', 'Other')], default='leave', string="Kind of Leave",
                                 help="Whether this should be computed as a holiday or as work time (eg: formation)")
    request_unit = fields.Selection([
        ('day', 'Day'),
        ('half_day', 'Half Day'),
        ('hour', 'Hours')], default='day', string='Take Time Off in', required=True)
    unpaid = fields.Boolean('Is Unpaid', default=False)
    leave_notif_subtype_id = fields.Many2one('mail.message.subtype', string='Time Off Notification Subtype', default=lambda self: self.env.ref('hr_holidays.mt_leave', raise_if_not_found=False))
    allocation_notif_subtype_id = fields.Many2one('mail.message.subtype', string='Allocation Notification Subtype', default=lambda self: self.env.ref('hr_holidays.mt_leave_allocation', raise_if_not_found=False))
    support_document = fields.Boolean(string='Supporting Document')
    accruals_ids = fields.One2many('hr.leave.accrual.plan', 'time_off_type_id')
    accrual_count = fields.Float(compute="_compute_accrual_count", string="Accruals count")

    additional_leaves = fields.Float(compute='_compute_additional_leaves')


    @api.model
    def _search_valid(self, operator, value):
        """ Returns leave_type ids for which a valid allocation exists
            or that don't need an allocation
            return [('id', domain_operator, [x['id'] for x in res])]
        """
        date_to = self._context.get('default_date_from') or fields.Date.today().strftime('%Y-1-1')
        date_from = self._context.get('default_date_to') or fields.Date.today().strftime('%Y-12-31')
        employee_id = self._context.get('default_employee_id', self._context.get('employee_id')) or self.env.user.employee_id.id

        if not isinstance(value, bool):
            raise ValueError('Invalid value: %s' % (value))
        if operator not in ['=', '!=']:
            raise ValueError('Invalid operator: %s' % (operator))
        new_operator = 'in' if operator == '=' else 'not in'

        query = '''
        SELECT
            holiday_status_id
        FROM
            hr_leave_allocation alloc
        WHERE
            alloc.employee_id = %s AND
            alloc.active = True AND alloc.state = 'validate' AND
            (alloc.date_to >= %s OR alloc.date_to IS NULL) AND
            alloc.date_from <= %s 
        '''

        self._cr.execute(query, (employee_id or None, date_to, date_from))

        return [('id', new_operator, [x['holiday_status_id'] for x in self._cr.dictfetchall()])]


    @api.depends('requires_allocation')
    def _compute_valid(self):
        date_to = self._context.get('default_date_to', fields.Datetime.today())
        date_from = self._context.get('default_date_from', fields.Datetime.today())
        employee_id = self._context.get('default_employee_id', self._context.get('employee_id', self.env.user.employee_id.id))
        for holiday_type in self:
            if holiday_type.requires_allocation:
                allocation = self.env['hr.leave.allocation'].search([
                    ('holiday_status_id', '=', holiday_type.id),
                    ('employee_id', '=', employee_id),
                    '|',
                    ('date_to', '>=', date_to),
                    '&',
                    ('date_to', '=', False),
                    ('date_from', '<=', date_from)])
                holiday_type.has_valid_allocation = bool(allocation)
            else:
                holiday_type.has_valid_allocation = True

    def _search_max_leaves(self, operator, value):
        value = float(value)
        employee_id = self._get_contextual_employee_id()
        leaves = defaultdict(int)

        if employee_id:
            allocations = self.env['hr.leave.allocation'].search([
                ('employee_id', '=', employee_id),
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

    def _search_employee_accrual(self, operator, value):
        employee_id = self._get_contextual_employee_id()
        employee_allocations = self.env['hr.leave.allocation'].search([
            ('employee_id', '=', employee_id),
            ('accrual_plan_id', '!=', False),
        ])

        op = 'in'
        if operator == '!=' and value or operator == '=' and not value:
            op = 'not in'
        return [('id', op, employee_allocations.holiday_status_id.ids)]

    def get_employees_days(self, employee_ids, date=None):
        result = {
            employee_id: {
                leave_type.id: {
                    'max_leaves': 0,
                    'leaves_taken': 0,
                    'remaining_leaves': 0,
                    'virtual_remaining_leaves': 0,
                    'virtual_leaves_taken': 0,
                    'closest_allocation_to_expire': False,
                } for leave_type in self
            } for employee_id in employee_ids
        }

        requests = self.env['hr.leave'].search([
            ('employee_id', 'in', employee_ids),
            ('state', 'in', ['confirm', 'validate1', 'validate']),
            ('holiday_status_id', 'in', self.ids)
        ])

        if not date:
            date = self.env.context.get('default_date_from') or fields.Date.context_today(self)
        allocations = self.env['hr.leave.allocation'].search([
            ('employee_id', 'in', employee_ids),
            ('state', 'in', ['confirm', 'validate1', 'validate']),
            ('holiday_status_id', 'in', self.ids),
            ('date_from', '<=', date),
            '|', ('date_to', '=', False),
                 ('date_to', '>=', date),
        ])

        for request in requests:
            status_dict = result[request.employee_id.id][request.holiday_status_id.id]
            if not request.holiday_allocation_id or request.holiday_allocation_id in allocations:
                status_dict['virtual_remaining_leaves'] -= (request.number_of_hours_display
                                                        if request.leave_type_request_unit == 'hour'
                                                        else request.number_of_days)
            if request.holiday_status_id.requires_allocation == 'no':
                status_dict['virtual_leaves_taken'] += (request.number_of_hours_display
                                                    if request.leave_type_request_unit == 'hour'
                                                    else request.number_of_days)
                if request.state == 'validate':
                    status_dict['leaves_taken'] += (request.number_of_hours_display
                                                if request.leave_type_request_unit == 'hour'
                                                else request.number_of_days)
                    status_dict['remaining_leaves'] -= (request.number_of_hours_display
                                                    if request.leave_type_request_unit == 'hour'
                                                    else request.number_of_days)

        allocation_closest_by_type = {}
        for holiday_status_id in self.ids:
            allocations_of_that_type = allocations.filtered(lambda a: a.holiday_status_id.id == holiday_status_id and a.date_to and a.state == 'validate')
            allocations_sorted = sorted(allocations_of_that_type, key=lambda a: a.date_to)
            allocation_closest = allocations_sorted[0] if allocations_sorted else False
            allocation_closest_by_type[holiday_status_id] = {
                'closest_allocation_to_expire': allocation_closest,
            }

        for allocation in allocations.sudo():
            status_dict = result[allocation.employee_id.id][allocation.holiday_status_id.id]
            if allocation.state == 'validate':
                status_dict['virtual_remaining_leaves'] += (allocation.number_of_hours_display
                                                        if allocation.type_request_unit == 'hour'
                                                        else allocation.number_of_days)
                if allocation.holiday_status_id.requires_allocation == 'no':
                    # note: add only validated allocation even for the virtual
                    # count; otherwise pending then refused allocation allow
                    # the employee to create more leaves than possible
                    status_dict['max_leaves'] += (allocation.number_of_hours_display
                                                if allocation.type_request_unit == 'hour'
                                                else allocation.number_of_days)
                    status_dict['remaining_leaves'] += (allocation.number_of_hours_display
                                                    if allocation.type_request_unit == 'hour'
                                                    else allocation.number_of_days)
                else:
                    remaining_leaves = allocation.max_leaves - allocation.leaves_taken
                    status_dict['max_leaves'] += allocation.max_leaves
                    status_dict['remaining_leaves'] += remaining_leaves
                    status_dict['leaves_taken'] += allocation.leaves_taken
                    status_dict['closest_allocation_to_expire'] = allocation_closest_by_type[allocation.holiday_status_id.id]['closest_allocation_to_expire']
        return result

    @api.model
    def get_days_all_request(self, date=None):
        date = fields.Date.to_date(date) if date else fields.Date.today()
        future = date > fields.Date.today()

        leave_types = self.with_context(future_accrual_date=date).search([])
        accrual_allocations = bool(leave_types.filtered('employee_accrual'))
        leave_types_filtered = leave_types.filtered(lambda x: (x.virtual_remaining_leaves > 0 or x.max_leaves or (future and x.employee_accrual)))

        return {
            'accrual_allocations': accrual_allocations,
            'accrual_date': date,
            'allocations': [x._get_days_request() for x in leave_types_filtered],
        }

    @api.depends_context('default_employee_id', 'employee_id', 'future_accrual_date')
    @api.depends('employee_accrual')
    def _compute_additional_leaves(self):
        employee_id = self._get_contextual_employee_id()
        accrual_date = fields.Date.to_date(self.env.context.get('future_accrual_date'))

        if not accrual_date or not employee_id or accrual_date <= fields.Date.today():
            self.additional_leaves = 0
            return

        with_accrual = self.filtered('employee_accrual')
        (self - with_accrual).additional_leaves = 0

        accrual_allocations = self.env['hr.leave.allocation'].search([
            ('allocation_type', '=', 'accrual'),
            ('state', '=', 'validate'),
            ('accrual_plan_id', '!=', False),
            ('employee_id', '=', employee_id),
            ('holiday_status_id', 'in', with_accrual.ids),
            '|',
                ('date_to', '=', False), ('date_to', '>', accrual_date),
            '|',
                ('nextcall', '=', False), ('nextcall', '<=', accrual_date)
        ])

        fake_allocations = self.env['hr.leave.allocation']
        for allocation in accrual_allocations:
            fake_allocations |= self.env['hr.leave.allocation'].new(origin=allocation)
        fake_allocations.sudo()._process_accrual_plans(accrual_date)

        for lt in with_accrual:
            lt.additional_leaves = float_round(sum(fake_allocations.filtered(lambda a: a.holiday_status_id.id == lt.id).mapped('number_of_days')), precision_digits=2)

    def _get_days_request(self):
        self.ensure_one()
        accrual_date = self.env.context.get('future_accrual_date', fields.Date.today())
        future_leaves = self.employee_accrual and accrual_date > fields.Date.today()

        closest_allocation_remaining = (self.closest_allocation_to_expire.max_leaves - self.closest_allocation_to_expire.leaves_taken) if self.closest_allocation_to_expire else False
        data = (self.name, {
                'remaining_leaves': ('%.2f' % self.remaining_leaves).rstrip('0').rstrip('.'),
                'virtual_remaining_leaves': ('%.2f' % self.virtual_remaining_leaves).rstrip('0').rstrip('.'),
                'max_leaves': ('%.2f' % self.max_leaves).rstrip('0').rstrip('.'),
                'leaves_taken': ('%.2f' % self.leaves_taken).rstrip('0').rstrip('.'),
                'virtual_leaves_taken': ('%.2f' % self.virtual_leaves_taken).rstrip('0').rstrip('.'),
                'leaves_requested': ('%.2f' % (self.max_leaves - self.virtual_remaining_leaves - self.leaves_taken)).rstrip('0').rstrip('.'),
                'leaves_approved': ('%.2f' % self.leaves_taken).rstrip('0').rstrip('.'),
                'closest_allocation_remaining': ('%.2f' % closest_allocation_remaining).rstrip('0').rstrip('.'),
                'closest_allocation_expire': format_date(self.env, self.closest_allocation_to_expire.date_to, date_format="MM/dd/yyyy") if self.closest_allocation_to_expire.date_to else False,
                'request_unit': self.request_unit,
                'icon': self.sudo().icon_id.url,
                'employee_accrual': self.employee_accrual,
                'future_leaves': future_leaves,
                'additional_leaves': ('%.2f' % self.additional_leaves).rstrip('0').rstrip('.'),
                }, self.requires_allocation, self.id)
        return data

    def _get_contextual_employee_id(self):
        if 'employee_id' in self._context:
            employee_id = self._context['employee_id']
        elif 'default_employee_id' in self._context:
            employee_id = self._context['default_employee_id']
        else:
            employee_id = self.env.user.employee_id.id
        return employee_id

    @api.depends_context('employee_id', 'default_employee_id')
    def _compute_leaves(self):
        data_days = {}
        employee_id = self._get_contextual_employee_id()

        if employee_id:
            data_days = (self.get_employees_days(employee_id)[employee_id[0]] if isinstance(employee_id, list) else
                         self.get_employees_days([employee_id])[employee_id])

        for holiday_status in self:
            result = data_days.get(holiday_status.id, {})
            holiday_status.max_leaves = result.get('max_leaves', 0)
            holiday_status.leaves_taken = result.get('leaves_taken', 0)
            holiday_status.remaining_leaves = result.get('remaining_leaves', 0)
            holiday_status.virtual_remaining_leaves = result.get('virtual_remaining_leaves', 0)
            holiday_status.virtual_leaves_taken = result.get('virtual_leaves_taken', 0)
            holiday_status.closest_allocation_to_expire = result.get('closest_allocation_to_expire', 0)

    @api.depends_context('employee_id', 'default_employee_id')
    def _compute_employee_accrual(self):
        allocations = self.env['hr.leave.allocation'].read_group([
                ('employee_id', '=', self._get_contextual_employee_id()),
                ('holiday_status_id', 'in', self.ids),
                ('accrual_plan_id', '!=', False),
                ('state', '=', 'validate'),
            ],
            ['holiday_status_id'], ['holiday_status_id'],
        )
        accrual_allocations = tuple(map(lambda a: a['holiday_status_id'][0], allocations))

        for leave_type in self:
            leave_type.employee_accrual = leave_type.id in accrual_allocations

    def _compute_allocation_count(self):
        min_datetime = fields.Datetime.to_string(datetime.datetime.now().replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0))
        max_datetime = fields.Datetime.to_string(datetime.datetime.now().replace(month=12, day=31, hour=23, minute=59, second=59))
        domain = [
            ('holiday_status_id', 'in', self.ids),
            ('date_from', '>=', min_datetime),
            ('date_from', '<=', max_datetime),
            ('state', 'in', ('confirm', 'validate')),
        ]

        grouped_res = self.env['hr.leave.allocation']._read_group(
            domain,
            ['holiday_status_id'],
            ['holiday_status_id'],
        )
        grouped_dict = dict((data['holiday_status_id'][0], data['holiday_status_id_count']) for data in grouped_res)
        for allocation in self:
            allocation.allocation_count = grouped_dict.get(allocation.id, 0)

    def _compute_group_days_leave(self):
        min_datetime = fields.Datetime.to_string(datetime.datetime.now().replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0))
        max_datetime = fields.Datetime.to_string(datetime.datetime.now().replace(month=12, day=31, hour=23, minute=59, second=59))
        domain = [
            ('holiday_status_id', 'in', self.ids),
            ('date_from', '>=', min_datetime),
            ('date_from', '<=', max_datetime),
            ('state', 'in', ('validate', 'validate1', 'confirm')),
        ]
        grouped_res = self.env['hr.leave']._read_group(
            domain,
            ['holiday_status_id'],
            ['holiday_status_id'],
        )
        grouped_dict = dict((data['holiday_status_id'][0], data['holiday_status_id_count']) for data in grouped_res)
        for allocation in self:
            allocation.group_days_leave = grouped_dict.get(allocation.id, 0)

    def _compute_accrual_count(self):
        accrual_allocations = self.env['hr.leave.accrual.plan']._read_group([('time_off_type_id', 'in', self.ids)], ['time_off_type_id'], ['time_off_type_id'])
        mapped_data = dict((data['time_off_type_id'][0], data['time_off_type_id_count']) for data in accrual_allocations)
        for leave_type in self:
            leave_type.accrual_count = mapped_data.get(leave_type.id, 0)

    @api.depends('employee_requests')
    def _compute_allocation_validation_type(self):
        for leave_type in self:
            leave_type.allocation_validation_type = 'no' if leave_type.employee_requests == 'no' else 'officer'

    def requested_name_get(self):
        return self._context.get('holiday_status_name_get', True) and self._context.get('employee_id')

    def name_get(self):
        if not self.requested_name_get():
            # leave counts is based on employee_id, would be inaccurate if not based on correct employee
            return super(HolidaysType, self).name_get()
        res = []
        # TODO hack-ish
        self = self.with_context(future_accrual_date=self.env.context.get('default_date_from'))
        accrual_date = self.env.context.get('future_accrual_date')
        future_accrual = accrual_date and fields.Date.to_date(accrual_date) > fields.Date.today()
        for record in self:
            name = record.name
            if record.requires_allocation == "yes" and not self.env.context.get('from_manager_leave_form'):
                remaining = record.virtual_remaining_leaves
                max_leaves = record.max_leaves
                accrual = ''
                # TODO better looking
                if future_accrual and record.employee_accrual:
                    remaining = remaining + record.additional_leaves
                    max_leaves = max_leaves + record.additional_leaves
                    accrual = _(' incl. %g accruals', record.additional_leaves)
                name = "%(name)s (%(count)s%(accrual)s)" % {
                    'name': name,
                    'count': _('%g remaining out of %g') % (
                        float_round(remaining, precision_digits=2) or 0.0,
                        float_round(max_leaves, precision_digits=2) or 0.0,
                    ) + (_(' hours') if record.request_unit == 'hour' else _(' days')),
                    'accrual': accrual,
                }
            res.append((record.id, name))
        return res

    @api.model
    def _search(self, args, offset=0, limit=None, order=None, count=False, access_rights_uid=None):
        """ Override _search to order the results, according to some employee.
        The order is the following

         - allocation fixed first, then allowing allocation, then free allocation
         - virtual remaining leaves (higher the better, so using reverse on sorted)

        This override is necessary because those fields are not stored and depends
        on an employee_id given in context. This sort will be done when there
        is an employee_id in context and that no other order has been given
        to the method.
        """
        employee_id = self._get_contextual_employee_id()
        post_sort = (not count and not order and employee_id)
        leave_ids = super(HolidaysType, self)._search(args, offset=offset, limit=(None if post_sort else limit), order=order, count=count, access_rights_uid=access_rights_uid)
        leaves = self.browse(leave_ids)
        if post_sort:
            return leaves.sorted(key=self._model_sorting_key, reverse=True).ids[:limit or None]
        return leave_ids

    def action_see_days_allocated(self):
        self.ensure_one()
        action = self.env["ir.actions.actions"]._for_xml_id("hr_holidays.hr_leave_allocation_action_all")
        date_from = fields.Datetime.to_string(
                datetime.datetime.now().replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0))
        action['domain'] = [
            ('holiday_status_id', 'in', self.ids),
        ]
        action['context'] = {
            'default_holiday_type': 'department',
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
            'search_default_need_approval_approved': 1,
            'search_default_this_year': 1,
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
