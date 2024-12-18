# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict
from datetime import datetime
from dateutil.rrule import rrule, DAILY
from itertools import chain
from pytz import timezone, utc

from odoo import api, fields, models
from odoo.osv import expression
from .utils import float_to_time, Intervals, timezone_datetime, WorkIntervals


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
        resources = self.mapped('resource_id')
        mapped_employees = {e.resource_id.id: e.id for e in self}
        result = {}

        # naive datetimes are made explicit in UTC
        from_datetime = timezone_datetime(from_datetime)
        to_datetime = timezone_datetime(to_datetime)

        if calendar:
            mapped_resources = {calendar: self.resource_id}
        else:
            calendar_by_resource = self._get_calendars(from_datetime)
            mapped_resources = defaultdict(lambda: self.env['resource.resource'])
            for resource in self:
                mapped_resources[calendar_by_resource[resource.id]] |= resource.resource_id

        for calendar, calendar_resources in mapped_resources.items():
            if not calendar:
                for calendar_resource in calendar_resources:
                    result[calendar_resource.id] = {'days': 0, 'hours': 0}
                continue

            # actual hours per day
            if compute_leaves:
                intervals = calendar._work_intervals_batch(from_datetime, to_datetime, calendar_resources, domain)
            else:
                intervals = calendar._attendance_intervals_batch(from_datetime, to_datetime, calendar_resources)

            for calendar_resource in calendar_resources:
                result[calendar_resource.id] = calendar._get_attendance_intervals_days_data(intervals[calendar_resource.id])

        # convert "resource: result" into "employee: result"
        return {mapped_employees[r.id]: result[r.id] for r in resources}

    def _get_leave_days_data_batch(self, from_datetime, to_datetime, calendar=None, domain=None):
        """
            By default the resource calendar is used, but it can be
            changed using the `calendar` argument.

            `domain` is used in order to recognise the leaves to take,
            None means default value ('time_type', '=', 'leave')

            Returns a dict {'days': n, 'hours': h} containing the number of leaves
            expressed as days and as hours.
        """
        resources = self.mapped('resource_id')
        mapped_employees = {e.resource_id.id: e.id for e in self}
        result = {}

        # naive datetimes are made explicit in UTC
        from_datetime = timezone_datetime(from_datetime)
        to_datetime = timezone_datetime(to_datetime)

        mapped_resources = defaultdict(lambda: self.env['resource.resource'])
        for record in self:
            mapped_resources[calendar or record.resource_calendar_id] |= record.resource_id

        for calendar, calendar_resources in mapped_resources.items():
            # compute actual hours per day
            attendances = calendar._attendance_intervals_batch(from_datetime, to_datetime, calendar_resources)
            leaves = calendar._leave_intervals_batch(from_datetime, to_datetime, calendar_resources, domain)

            for calendar_resource in calendar_resources:
                result[calendar_resource.id] = calendar._get_attendance_intervals_days_data(
                    attendances[calendar_resource.id] & leaves[calendar_resource.id]
                )

        # convert "resource: result" into "employee: result"
        return {mapped_employees[r.id]: result[r.id] for r in resources}

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
        result = {}
        records_by_calendar = defaultdict(lambda: self.env[self._name])
        for record in self:
            records_by_calendar[calendar or record.resource_calendar_id or record.company_id.resource_calendar_id] += record

        # naive datetimes are made explicit in UTC
        if not from_datetime.tzinfo:
            from_datetime = from_datetime.replace(tzinfo=utc)
        if not to_datetime.tzinfo:
            to_datetime = to_datetime.replace(tzinfo=utc)
        compute_leaves = self.env.context.get('compute_leaves', True)

        for calendar, records in records_by_calendar.items():
            resources = self.resource_id
            all_intervals = calendar._work_intervals_batch(from_datetime, to_datetime, resources, domain, compute_leaves=compute_leaves)
            for record in records:
                intervals = all_intervals[record.resource_id.id]
                record_result = defaultdict(float)
                for start, stop, _meta in intervals:
                    record_result[start.date()] += (stop - start).total_seconds() / 3600
                result[record.id] = sorted(record_result.items())
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

    def _get_attendance_intervals(self, start_dt, end_dt, domain=None, tz=None, lunch=False):
        assert start_dt.tzinfo and end_dt.tzinfo
        self.ensure_one()
        domain = domain if domain is not None else []
        all_calendar_periods = self._get_calendar_periods(start_dt, end_dt)
        all_calendars = self.env['resource.calendar']
        for calendar_periods in all_calendar_periods.values():
            for period in calendar_periods:
                all_calendars |= period[2]
        domain = expression.AND([domain, [
            ('calendar_id', 'in', all_calendars.ids),
            ('resource_id', 'in', self.ids + [False]),
            ('display_type', '=', False),
            ('day_period', '!=' if not lunch else '=', 'lunch'),
        ]])

        attendances_per_day = {
            (cal, weekday, weektype, res): atts
            for cal, weekday, weektype, res, atts
            in self.env['resource.calendar.attendance']._read_group(
                domain=domain,
                groupby=['resource_calendar_id', 'dayofweek', 'week_type', 'resource_id'],
                aggregates=['id:recordset']
            )
        }
        weekdays = set(map(lambda c, dow, wt: dow, attendances_per_day.keys()))

        # TODO not finished
        # get attendances of calendars
        # for each resource, get intervals by intersecting calendars intervals and calendar period intervals

        # Group resources per tz they will all have the same result
        resources_per_tz = defaultdict(list)
        for resource in self:
            resources_per_tz[tz or timezone(resource.tz)].append(resource)

        start = start_dt.astimezone(utc)
        end = end_dt.astimezone(utc)
        bounds_per_tz = {
            tz: (start_dt.astimezone(tz), end_dt.astimezone(tz))
            for tz in resources_per_tz
        }
        # Use the outer bounds from the requested timezones
        for low, high in bounds_per_tz.values():
            start = min(start, low.replace(tzinfo=utc))
            end = max(end, high.replace(tzinfo=utc))
        # Generate once with utc as timezone
        days = rrule(DAILY, start.date(), until=end.date(), byweekday=weekdays)
        base_result = []
        per_resource_result = defaultdict(list)
        for day in days:
            week_type = self.env['resource.calendar.attendance'].get_week_type(day)
            attendances = attendances_per_day[day.weekday() + 7 * week_type]
            for attendance in attendances:
                if (attendance.date_from and day.date() < attendance.date_from) or\
                    (attendance.date_to and attendance.date_to < day.date()):
                    continue
                day_from = datetime.combine(day, float_to_time(attendance.hour_from))
                day_to = datetime.combine(day, float_to_time(attendance.hour_to))
                if attendance.resource_id:
                    per_resource_result[attendance.resource_id].append((day_from, day_to, attendance))
                else:
                    base_result.append((day_from, day_to, attendance))

        # Copy the result localized once per necessary timezone
        # Strictly speaking comparing start_dt < time or start_dt.astimezone(tz) < time
        # should always yield the same result. however while working with dates it is easier
        # if all dates have the same format
        result_per_tz = {
            tz: [(max(bounds_per_tz[tz][0], tz.localize(val[0])),
                min(bounds_per_tz[tz][1], tz.localize(val[1])),
                val[2])
                    for val in base_result]
            for tz in resources_per_tz.keys()
        }
        result_per_resource_id = dict()
        for tz, resources in resources_per_tz.items():
            res = result_per_tz[tz]
            res_intervals = WorkIntervals(res)
            for resource in resources:
                if resource in per_resource_result:
                    resource_specific_result = [(max(bounds_per_tz[tz][0], tz.localize(val[0])), min(bounds_per_tz[tz][1], tz.localize(val[1])), val[2])
                        for val in per_resource_result[resource]]
                    result_per_resource_id[resource.id] = WorkIntervals(chain(res, resource_specific_result))
                else:
                    result_per_resource_id[resource.id] = res_intervals
        return result_per_resource_id

    def _get_leave_intervals(self, start_dt, end_dt, domain=None, tz=None):
        assert start_dt.tzinfo and end_dt.tzinfo

        if domain is None:
            domain = [('time_type', '=', 'leave')]
        # for the computation, express all datetimes in UTC
        domain = expression.AND([
            domain,
            [
                ('resource_id', 'in', [False] + self.resource_id.ids),  # public leaves don't have a resource_id
                ('date_from', '<=', end_dt),
                ('date_to', '>=', start_dt),
            ]
        ])

        # retrieve leave intervals in (start_dt, end_dt)
        result = defaultdict(lambda: [])
        tz_dates = {}
        all_leaves = self.env['resource.calendar.leaves'].search(domain)
        for leave in all_leaves:
            leave_resource = leave.resource_id
            leave_company = leave.company_id
            leave_date_from = leave.date_from
            leave_date_to = leave.date_to
            for resource in self:
                if leave_resource and leave_resource != resource.resource_id or\
                        not leave_resource and leave_company and resource.company_id != leave_company:
                    continue
                tz = tz if tz else timezone(resource.tz)
                if (tz, start_dt) in tz_dates:
                    start = tz_dates[(tz, start_dt)]
                else:
                    start = start_dt.astimezone(tz)
                    tz_dates[(tz, start_dt)] = start
                if (tz, end_dt) in tz_dates:
                    end = tz_dates[(tz, end_dt)]
                else:
                    end = end_dt.astimezone(tz)
                    tz_dates[(tz, end_dt)] = end
                dt0 = leave_date_from.astimezone(tz)
                dt1 = leave_date_to.astimezone(tz)
                result[resource].append((max(start, dt0), min(end, dt1), leave))

        return {resource: Intervals(result[resource.id]) for resource in self}

    def _get_work_intervals(self, start_dt, end_dt, domain=None, tz=None):
        attendance_intervals = self._get_attendance_intervals(start_dt, end_dt, tz=tz or self.env.context.get("employee_timezone"))
        leave_intervals = self._get_leave_intervals(start_dt, end_dt, domain, tz=tz)
        return {
            resource: (attendance_intervals[resource] - leave_intervals[resource])
            for resource in self
        }
