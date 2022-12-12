/** @odoo-module */

import { ActivityCellViewContainer } from "@mail/backend_components/activity_cell_view/activity_cell_view_container";
import { Component, useState } from "@odoo/owl";
import { ColumnProgress } from "@web/views/kanban/column_progress";
import { ActivityRecord } from "./activity_record";

export class ActivityRenderer extends Component {
    setup() {
        this.activeFilter = useState({
            progressValue: {
                active: null,
            },
            activityTypeId: null,
            resIds: [],
        });
    }

    /**
     * Gets all activity resIds in the view.
     *
     * @returns filtered resIds first then the rest.
     */
    get activityResIds() {
        return [...this.props.activityResIds].sort((a) => this.activeFilter.resIds.includes(a) ? -1 : 0);
    }

    getGroupInfo(group) {
        const types = {
            planned: {
                color: "success",
                value: 0,
            },
            today: {
                color: "warning",
                value: 0,
            },
            overdue: {
                value: 0,
                color: "danger",
            },
        };
        const typeId = group[0];
        const progressValue = this.activeFilter.progressValue;
        const isColumnFiltered = this.activeFilter.activityTypeId === group[0];

        let totalCount = 0;
        for (const activities of Object.values(this.props.groupedActivities)) {
            if (typeId in activities) {
                types[activities[typeId].state].value += 1;
                totalCount++;
            }
        }

        const progressBars = [];
        for (const [value, count] of Object.entries(types)) {
            progressBars.push({
                count: count.value,
                value,
                string: this.props.fields.activity_state.selection.find((e) => e[0] === value)[1],
                color: count.color,
            });
        }

        return {
            aggregate: {
                title: group[1],
                value: isColumnFiltered ? types[progressValue.active].value : totalCount,
            },
            data: {
                count: totalCount,
                filterProgressValue: (name) => this.onSetProgressBarState(typeId, name),
                progressBars,
                progressValue,
            },
        };
    }

    getRecord(resId) {
        return this.props.records.find((r) => r.resId === resId);
    }

    onSetProgressBarState(typeId, name) {
        if (this.activeFilter.progressValue.active === name) {
            this.activeFilter.progressValue.active = null;
            this.activeFilter.activityTypeId = null;
            this.activeFilter.resIds = [];
        } else {
            this.activeFilter.progressValue.active = name;
            this.activeFilter.activityTypeId = typeId;
            this.activeFilter.resIds = Object.entries(this.props.groupedActivities)
            .filter(
                ([, resIds]) => typeId in resIds &&
                    resIds[typeId].state === name
            )
            .map(([key]) => parseInt(key));
        }
    }
}

ActivityRenderer.components = {
    ActivityRecord,
    ColumnProgress,
    ActivityCellViewContainer,
};
ActivityRenderer.props = {
    activityTypes: { type: Array },
    activityResIds: { type: Array },
    fields: { type: Object },
    records: { type: Array },
    archInfo: { type: Object },
    groupedActivities: { type: Object },
    scheduleActivity: { type: Function },
    onReloadData: { type: Function },
    onEmptyCell: { type: Function },
    onSendMailTemplate: { type: Function },
    openRecord: { type: Function },
};
ActivityRenderer.template = "mail.ActivityRenderer";
