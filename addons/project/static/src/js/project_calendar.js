odoo.define('project.ProjectCalendarView', function (require) {
"use strict";

const CalendarController = require('web.CalendarController');
const CalendarView = require('web.CalendarView');
const viewRegistry = require('web.view_registry');
const ProjectControlPanel = require("project.ProjectControlPanel");

const ProjectCalendarController = CalendarController.extend({
    _renderButtonsParameters() {
        return _.extend({}, this._super(...arguments),  {scaleDrop: true});
    },
});

const ProjectCalendarView = CalendarView.extend({
        config: _.extend({}, CalendarView.prototype.config, {
            Controller: ProjectCalendarController,
            ControlPanel: ProjectControlPanel,
        }),
    });

viewRegistry.add('project_calendar', ProjectCalendarView);
return ProjectCalendarView;
});
