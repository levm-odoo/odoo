/** @odoo-module alias=event.event_steps **/

import * as core from "@web/legacy/js/services/core";

var EventAdditionalTourSteps = core.Class.extend({

    _get_website_event_steps: function () {
        return [false];
    },

});

export default EventAdditionalTourSteps;
