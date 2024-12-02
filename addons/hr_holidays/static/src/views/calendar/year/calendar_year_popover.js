import { Dialog } from "@web/core/dialog/dialog";

import { CalendarYearPopover } from "@web/views/calendar/calendar_year/calendar_year_popover";

export class TimeOffCalendarYearPopover extends CalendarYearPopover {
    static components = { Dialog };
    static template = "web.CalendarYearPopover";
    static subTemplates = {
        ...CalendarYearPopover.subTemplates,
        body: "hr_holidays.MandatoryDayCalendarYearPopover.body",
    };

    getRecordClass(record) {
        let classes = [super.getRecordClass(record)];
        classes = classes.filter((x) => x !== 'o_event_allday')
        classes.push('o_event_dot')
        return classes.join(" ");
    }
}
