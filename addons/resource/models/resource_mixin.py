# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict
from pytz import timezone, utc

from odoo import api, fields, models
from odoo.osv import expression
from .utils import get_attendance_intervals_days_data, timezone_datetime, WorkIntervals


class ResourceMixin(models.AbstractModel):
    _name = 'resource.mixin'
    _description = 'Resource Mixin'

    resource_id = fields.Many2one(
        'resource.resource', 'Resource',
        auto_join=True, index=True, ondelete='restrict', required=True)
    company_id = fields.Many2one(
        'res.company', 'Company',
        default=lambda self: self.env.company,
        index=True, related='resource_id.company_id', precompute=True, store=True, readonly=False)
    resource_calendar_id = fields.Many2one(
        'resource.calendar', 'Working Hours',
        default=lambda self: self.env.company.resource_calendar_id,
        index=True, related='resource_id.calendar_id', store=True, readonly=False)
    tz = fields.Selection(
        string='Timezone', related='resource_id.tz', readonly=False,
        help="This field is used in order to define in which timezone the resources will work.")

    @api.model_create_multi
    def create(self, vals_list):
        resources_vals_list = []
        calendar_ids = [vals['resource_calendar_id'] for vals in vals_list if vals.get('resource_calendar_id')]
        calendars_tz = {calendar.id: calendar.tz for calendar in self.env['resource.calendar'].browse(calendar_ids)}
        for vals in vals_list:
            if not vals.get('resource_id'):
                resources_vals_list.append(
                    self._prepare_resource_values(
                        vals,
                        vals.pop('tz', False) or calendars_tz.get(vals.get('resource_calendar_id'))
                    )
                )
        if resources_vals_list:
            resources = self.env['resource.resource'].create(resources_vals_list)
            resources_iter = iter(resources.ids)
            for vals in vals_list:
                if not vals.get('resource_id'):
                    vals['resource_id'] = next(resources_iter)
        return super(ResourceMixin, self.with_context(check_idempotence=True)).create(vals_list)

    def _prepare_resource_values(self, vals, tz):
        resource_vals = {'name': vals.get(self._rec_name)}
        if tz:
            resource_vals['tz'] = tz
        company_id = vals.get('company_id', self.env.company.id)
        if company_id:
            resource_vals['company_id'] = company_id
        calendar_id = vals.get('resource_calendar_id')
        if calendar_id:
            resource_vals['calendar_id'] = calendar_id
        return resource_vals

    def copy_data(self, default=None):
        default = dict(default or {})
        vals_list = super().copy_data(default=default)

        resource_default = {}
        if 'company_id' in default:
            resource_default['company_id'] = default['company_id']
        if 'resource_calendar_id' in default:
            resource_default['calendar_id'] = default['resource_calendar_id']
        resources = [record.resource_id for record in self]
        resources_to_copy = self.env['resource.resource'].concat(*resources)
        new_resources = resources_to_copy.copy(resource_default)
        for resource, vals in zip(new_resources, vals_list):
            vals['resource_id'] = resource.id
            vals['company_id'] = resource.company_id.id
            vals['resource_calendar_id'] = resource.calendar_id.id
        return vals_list

    def _get_calendars(self, date_from=None):
        return {resource.id: resource.resource_calendar_id or resource.company_id.resource_calendar_id for resource in self}

    def _get_work_days_data_batch(self, from_datetime, to_datetime, compute_leaves=True, calendar=None, domain=None):
        """
            By default the resource calendar is used, but it can be
            changed using the `calendar` argument.

            `domain` is used in order to recognise the leaves to take,
            None means default value ('time_type', '=', 'leave')

            Returns a dict {'days': n, 'hours': h} containing the
            quantity of working time expressed as days and as hours.
        """
        result = defaultdict(lambda: {'days': 0, 'hours': 0})

        # naive datetimes are made explicit in UTC
        from_datetime = timezone_datetime(from_datetime)
        to_datetime = timezone_datetime(to_datetime)

        if compute_leaves:
            intervals = self._get_work_intervals(from_datetime, to_datetime, domain)
        else:
            intervals = self._get_attendance_intervals(from_datetime, to_datetime)

        return {
            resource: get_attendance_intervals_days_data(intervals[resource])
            for resource in self
        }
        for resource in self:
            result[resource] = get_attendance_intervals_days_data(intervals[resource])

    def _get_leave_days_data_batch(self, from_datetime, to_datetime, domain=None):
        """
            By default the resource calendar is used, but it can be
            changed using the `calendar` argument.

            `domain` is used in order to recognise the leaves to take,
            None means default value ('time_type', '=', 'leave')

            Returns a dict {'days': n, 'hours': h} containing the number of leaves
            expressed as days and as hours.
        """

        # naive datetimes are made explicit in UTC
        from_datetime = timezone_datetime(from_datetime)
        to_datetime = timezone_datetime(to_datetime)

        attendances = self._get_attendance_intervals(from_datetime, to_datetime)
        leaves = self._get_leave_intervals(from_datetime, to_datetime, domain)

        return {
            resource: get_attendance_intervals_days_data(attendances[resource] & leaves[resource])
            for resource in self
        }

    def _adjust_to_calendar(self, start, end):
        resource_results = self.resource_id._adjust_to_calendar(start, end)
        # change dict keys from resources to associated records.
        return {
            record: resource_results[record.resource_id]
            for record in self
        }

    def _list_work_time_per_day(self, from_datetime, to_datetime, calendar=None, domain=None):
        """
            By default the resource calendar is used, but it can be
            changed using the `calendar` argument.

            `domain` is used in order to recognise the leaves to take,
            None means default value ('time_type', '=', 'leave')

            Returns a list of tuples (day, hours) for each day
            containing at least an attendance.
        """
        # naive datetimes are made explicit in UTC
        if not from_datetime.tzinfo:
            from_datetime = from_datetime.replace(tzinfo=utc)
        if not to_datetime.tzinfo:
            to_datetime = to_datetime.replace(tzinfo=utc)
        compute_leaves = self.env.context.get('compute_leaves', True)

        if compute_leaves:
            all_intervals = self._get_work_intervals(from_datetime, to_datetime, domain)
        else:
            all_intervals = self._get_attendance_intervals(from_datetime, to_datetime, domain)

        result = {}
        for resource in self:
            record_result = defaultdict(float)
            for start, stop, meta in all_intervals[resource]:
                record_result[start.date()] += (stop - start).total_seconds() / 3600
            result[resource.id] = sorted(record_result.items())

        return result

    def _get_calendar_periods(self, start, stop):
        """
        :param datetime start: the start of the period
        :param datetime stop: the stop of the period
        This method can be overridden in other modules where it's possible to have different resource calendars for an
        employee depending on the date.
        """
        calendar_periods_by_employee = {}
        for employee in self:
            calendar = employee.resource_calendar_id or employee.company_id.resource_calendar_id
            calendar_periods_by_employee[employee] = [(start, stop, calendar)]
        return calendar_periods_by_employee

    def _get_attendance_intervals(self, start_dt, end_dt, domain=None, tz=None, lunch=False, inverse_result=False):
        assert start_dt.tzinfo and end_dt.tzinfo

        all_calendar_periods = self._get_calendar_periods(start_dt, end_dt)
        all_calendars = self.env['resource.calendar']
        for calendar_periods in all_calendar_periods.values():
            for period in calendar_periods:
                all_calendars |= period[2]
        attendance_intervals_per_calendar = all_calendars._get_attendance_intervals(
            start_dt, end_dt, domain, tz, lunch, inverse_result)

        result_per_resource = defaultdict(WorkIntervals)
        for resource in self:
            calendar_periods = all_calendar_periods.get(resource, [])
            for calendar_period in calendar_periods:
                attendance_intervals = attendance_intervals_per_calendar.get(calendar_period[2], None)
                if not attendance_intervals:
                    continue
                result_per_resource[resource] |= attendance_intervals & WorkIntervals([calendar_period])

        return result_per_resource

    def _get_leave_intervals(self, start_dt, end_dt, domain=None, tz=None):
        intervals_per_resource = self.resource_id._get_leave_intervals(start_dt, end_dt, domain, tz)
        return {
            emp: intervals_per_resource[emp.resource_id]
            for emp in self
        }

    def _get_work_intervals(self, start_dt, end_dt, domain=None, tz=None):
        intervals_per_resource = self.resource_id._get_work_intervals(start_dt, end_dt, domain, tz)
        return {
            emp: intervals_per_resource[emp.resource_id]
            for emp in self
        }

    def _get_absence_intervals(self, start_dt, end_dt, domain=None, tz=None):
        intervals_per_resource = self.resource_id._get_absence_intervals(start_dt, end_dt, domain, tz)
        return {
            emp: intervals_per_resource[emp.resource_id]
            for emp in self
        }
