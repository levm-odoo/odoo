# Part of Odoo. See LICENSE file for full copyright and licensing details.

import pytz
from math import modf

from datetime import datetime, time, timedelta

from odoo import _, api, Command, fields, models
from odoo.exceptions import ValidationError
from odoo.tools import format_date, format_time
from odoo.tools.float_utils import float_round


class EventSlotWeekday(models.Model):
    _name = "event.slot.weekday"
    _description = "Event Slot Weekday"
    _order = "sequence"

    name = fields.Char("Name", required=True)
    sequence = fields.Integer("Sequence", required=True)
    color = fields.Integer("Color")


class EventSlot(models.Model):
    _name = "event.slot"
    _description = "Event Slot"
    _order = "is_recurrent DESC, date, start_hour, end_hour, id"

    name = fields.Char("Name", compute="_compute_name", store="True")
    event_id = fields.Many2one("event.event", "Event", ondelete="cascade")
    start_hour = fields.Float("Starting Hour", required=True, default=8.0)
    end_hour = fields.Float("Ending Hour", required=True, default=12.0)
    start_datetime = fields.Datetime("Start Datetimes", compute="_compute_datetimes")
    end_datetime = fields.Datetime("End Datetimes", compute="_compute_datetimes")
    is_recurrent = fields.Boolean(compute="_compute_is_recurrent", store=True)
    # Punctual
    recurrent_slot_id = fields.Many2one("event.slot", "Recurrent Slot", store=True, ondelete="cascade")
    date = fields.Date("Date", compute="_compute_date", store=True, readonly=False)
    # Recurrent
    weekdays = fields.Many2many("event.slot.weekday", "Weekday", compute="_compute_weekdays", store=True, readonly=False)
    generated_slot_ids = fields.One2many("event.slot", "recurrent_slot_id")

    @api.constrains("start_hour", "end_hour")
    def _check_hours(self):
        for slot in self:
            if not (0 <= slot.start_hour <= 23.99 and 0 <= slot.end_hour <= 23.99):
                raise ValidationError(_("A slot hour must be between 0:00 and 23:59."))
            elif slot.end_hour <= slot.start_hour:
                raise ValidationError(_("A slot end hour must be later than its start hour.\n%s", slot.name))

    @api.constrains("date", "start_hour", "end_hour")
    def _check_non_recurrent(self):
        for slot in self:
            if not slot.is_recurrent and not slot.recurrent_slot_id:
                event_start = slot.event_id.date_begin
                event_end = slot.event_id.date_end
                if not (event_start <= slot.start_datetime <= event_end) or not (event_start <= slot.end_datetime <= event_end):
                    raise ValidationError(_("A slot cannot be scheduled outside of the event time range.\n%s", slot.name))

    @api.constrains("date", "weekdays")
    def _check_recurrence_type(self):
        for slot in self:
            if slot.date and slot.weekdays:
                raise ValidationError(_("A slot cannot have both a date and week day recurrences."))
            elif not slot.date and not slot.weekdays:
                raise ValidationError(_("A slot must have a date or week day recurrence."))

    @api.model_create_multi
    def create(self, vals_list):
        slots = super().create(vals_list)
        for slot in slots:
            if slot.is_recurrent:
                slot._update_generated_slots()
        return slots

    def write(self, vals):
        res = super().write(vals)
        if self.is_recurrent and any(field in ["event_id", "start_hour", "end_hour", "weekdays"] for field in vals):
            self._update_generated_slots()
        return res

    @api.depends("weekdays")
    def _compute_date(self):
        for slot in self:
            if slot.weekdays:
                slot.date = False

    @api.depends("event_id.date_tz", "date", "start_hour", "end_hour")
    def _compute_datetimes(self):
        for slot in self:
            if slot.is_recurrent:
                slot.start_datetime = False
                slot.end_datetime = False
                continue
            slot.start_datetime = slot._convert_from_event_tz_to_utc(
                datetime.combine(slot.date, EventSlot._float_to_time(slot.start_hour))
            )
            slot.end_datetime = slot._convert_from_event_tz_to_utc(
                datetime.combine(slot.date, EventSlot._float_to_time(slot.end_hour))
            )

    @api.depends("weekdays")
    def _compute_is_recurrent(self):
        for slot in self:
            slot.is_recurrent = bool(slot.weekdays)

    @api.depends("date", "weekdays", "start_hour", "end_hour")
    def _compute_name(self):
        for slot in self:
            start = format_time(self.env, EventSlot._float_to_time(slot.start_hour), time_format="short")
            end = format_time(self.env, EventSlot._float_to_time(slot.end_hour), time_format="short")
            if slot.is_recurrent:
                weekdays = " ".join(slot.weekdays.mapped("name"))
                slot.name = f"Every {weekdays}, {start} - {end}"
                continue
            date = format_date(self.env, slot.date, date_format="full")
            slot.name = f"{date}, {start} - {end}"

    @api.depends("date")
    def _compute_weekdays(self):
        for slot in self:
            if slot.date:
                slot.weekdays = False

    @staticmethod
    def _float_to_time(float_time):
        """ Convert the float to an actual datetime time. """
        fractional, integral = modf(float_time)
        return time(int(integral), int(float_round(60 * fractional, precision_digits=0)), 0)

    def _convert_from_event_tz_to_utc(self, datetime):
        event_tz = pytz.timezone(self.event_id.date_tz)
        return event_tz.localize(datetime).astimezone(pytz.UTC).replace(tzinfo=None)

    def _convert_from_utc_to_event_tz(self, datetime):
        event_tz = pytz.timezone(self.event_id.date_tz)
        return pytz.UTC.localize(datetime).astimezone(event_tz).replace(tzinfo=None)

    def _update_generated_slots(self):
        """ Updates the generated slots of the recurrent slot.
        Using the weekdays, start/end hours and the related event start and end datetimes:
        - create any missing slots
        - delete the irrelevant slots
        - update the start and/or end hours if necessary

        :param self: the recurrent slot
        """
        weekdays = self.weekdays.mapped("sequence")
        start_time = EventSlot._float_to_time(self.start_hour)
        end_time = EventSlot._float_to_time(self.end_hour)
        event_start = self._convert_from_utc_to_event_tz(self.event_id.date_begin)
        event_end = self._convert_from_utc_to_event_tz(self.event_id.date_end)

        expected_dates = []
        for i in range((event_end.date() - event_start.date()).days + 1):
            date = (event_start + timedelta(days=i)).date()
            if (
                date.weekday() in weekdays and
                event_start <= datetime.combine(date, start_time) and
                datetime.combine(date, end_time) <= event_end
            ):
                expected_dates.append(date)

        slots_to_delete = self.env['event.slot']
        existing_dates = []
        for slot in self.generated_slot_ids:
            existing_dates.append(slot.date)
            if slot.date not in expected_dates:
                slots_to_delete |= slot
                continue
            # Update slots
            if slot.start_hour != self.start_hour:
                slot.start_hour = self.start_hour
            if slot.end_hour != self.end_hour:
                slot.end_hour = self.end_hour

        # Add / Delete slots
        dates_to_add = [date for date in expected_dates if date not in existing_dates]
        if dates_to_add:
            self.generated_slot_ids = [
                Command.create({
                    'event_id': self.event_id.id,
                    'start_hour': self.start_hour,
                    'end_hour': self.end_hour,
                    'date': date,
                })
                for date in dates_to_add
            ]
        slots_to_delete.unlink()
