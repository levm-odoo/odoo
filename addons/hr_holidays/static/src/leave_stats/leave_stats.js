import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { useRecordObserver } from "@web/model/relational_model/utils";
import { formatFloatTime } from "@web/views/fields/formatters";
import { Component, useState, onWillStart } from "@odoo/owl";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";
import { KanbanMany2OneAvatarEmployeeField } from "@hr/views/fields/many2one_avatar_employee_field/many2one_avatar_employee_field";
const { DateTime } = luxon;

export class LeaveStatsComponent extends Component {
    static template = "hr_holidays.LeaveStatsComponent";
    static components = {
        KanbanMany2OneAvatarEmployeeField
    };
    static props = { ...standardWidgetProps};

    setup() {
        this.orm = useService("orm");

        this.state = useState({
            leaves: [],
            departmentLeaves: [],
            date: DateTime,
            department: null,
            employee: null,
            type: null,
            has_parent_department: null,
            department_name: null,
            sum_up: true,
        });
        this.date_format = {year: "numeric", month: "2-digit", day: "2-digit"};
        this.hour_format = {hour: "2-digit", minute: "2-digit"};
        this.state.date_from = this.props.record.data.date_from || DateTime.now();
        this.state.date_to = this.props.record.data.date_to || DateTime.now();
        this.state.employee = this.props.record.data.employee_id;

        onWillStart(async () => {
            await this.loadLeaves(this.state.date_from, this.state.employee);
            await this.loadDepartmentLeaves(
                this.state.date_from,
                this.state.department,
                this.state.employee
            );
        });

        useRecordObserver(async (record) => {
            const dateFrom = record.data.date_from || DateTime.now();
            const dateTo = record.data.date_to || DateTime.now();
            const dateChanged = !this.state.date_from.equals(dateFrom) || !this.state.date_to.equals(dateTo);
            const employee = record.data.employee_id;
            const department = record.data.department_id;
            const proms = [];
            if (
                dateChanged ||
                (employee && (this.state.employee && this.state.employee[0]) !== employee[0])
            ) {
                proms.push(this.loadLeaves(dateFrom, employee));
            }
            if (
                dateChanged ||
                (department &&
                    (this.state.department && this.state.department[0]) !== department[0])
            ) {
                proms.push(this.loadDepartmentLeaves(dateFrom, department, employee));
            }
            await Promise.all(proms);
            this.state.date_from = dateFrom;
            this.state.employee = employee;
            this.state.department = department;
            if (this.state.department) {
                const department_name_array = this.state.department[1].split('/');
                this.state.department_name = department_name_array.pop();
                this.state.has_parent_department = department_name_array.length > 0;
            }
        });
    }

    get thisYear() {
        return this.state.date_from.toFormat("yyyy");
    }

    async loadDepartmentLeaves(date, department, employee) {
        if (!(department && employee && date)) {
            this.state.departmentLeaves = [];
            return;
        }

        const dateFrom = date.startOf("month");
        const dateTo = date.endOf("month");

        const leaves = await this.orm.searchRead(
            "hr.leave",
            [
                ["department_id", "=", department[0]],
                ["state", "=", "validate"],
                ["date_from", "<=", dateTo],
                ["date_to", ">=", dateFrom],
            ],
            [
                "employee_id",
                "date_from",
                "date_to",
                "number_of_days",
                "number_of_hours",
                "leave_type_request_unit",
                "request_unit_hours"
            ]
        );

        this.state.departmentLeaves = this.arrangeData('employee_id', leaves)
    }

    async loadLeaves(date, employee) {
        if (!(employee && date)) {
            this.state.leaves = [];
            return;
        }

        const dateFrom = date.startOf("year");
        const dateTo = date.endOf("year");

        const leaves = await this.orm.searchRead(
            "hr.leave",
            [
                ["employee_id", "=", employee[0]],
                ["state", "=", "validate"],
                ["date_from", "<=", dateTo],
                ["date_to", ">=", dateFrom],
            ],
            [
                "holiday_status_id",
                "date_from",
                "date_to",
                "number_of_days",
                "number_of_hours",
                "leave_type_request_unit",
                "request_unit_hours"
            ],
        );
        this.state.leaves = this.arrangeData('holiday_status_id', leaves);
    }
    arrangeData(field_name, leaves) {
        const leavesGroupedByType = [];
        const record_date_from = this.props.record.data.date_from;
        const record_date_to = this.props.record.data.date_to;
        leaves.forEach((leave) => {
            const date_from = DateTime.fromSQL(leave.date_from, { zone: "utc" });
            const date_to = DateTime.fromSQL(leave.date_to, { zone: "utc" });
            const date_from_string = date_from.toLocal();
            const date_to_string = date_to.toLocal();
            if ((date_from >= record_date_from && date_from <= record_date_to) ||
                (date_to >= record_date_from && date_to <= record_date_to )) {
                leave.overlap = true
                console.log(leave.overlap)
            }

            leave.date_from = date_from_string.toLocaleString(this.date_format);
            leave.hour_from = date_from_string.toLocaleString(this.hour_format);

            leave.date_to = date_to_string.toLocaleString(this.date_format);
            leave.hour_to = date_to_string.toLocaleString(this.hour_format);

            const type_name = leave[field_name][1];
            const type_id = leave[field_name][0];
            let type_array = leavesGroupedByType.find((el) => el.id === type_id);
            if (!type_array) {
                type_array = {
                    id: type_id,
                    name: type_name,
                    leaves: [],
                    total_hours: 0,
                    total_days: 0,
                    amount_type: "hours",
                    has_overlap_leaves: false
                };
                leavesGroupedByType.push(type_array);
            }
            if (leave.leave_type_request_unit !== 'hour') {
                type_array.amount_type = "days"
            }
            if (leave.overlap) {
                type_array.has_overlap_leaves = true
            }
            type_array.leaves.push(leave);
            type_array.total_hours += Number(leave.number_of_hours);
            type_array.total_days += Number(leave.number_of_days);
            leave.number_of_hours = formatFloatTime(Number(leave.number_of_hours.toFixed(2)));
            leave.number_of_days = Number(leave.number_of_days.toFixed(2));
        })
        leavesGroupedByType.forEach((leaveGroup) => {
            leaveGroup.total_hours = Number(leaveGroup.total_hours.toFixed(2));
            leaveGroup.total_days = Number(leaveGroup.total_days.toFixed(2));
        })
        leavesGroupedByType.sort((a, b) => {
            if (b.has_overlap_leaves) {
                return 1
            }
            if (a.has_overlap_leaves) {
                return -1
            }
            return 0
        })
        return leavesGroupedByType

    }
}

export const leaveStatsComponent = {
    component: LeaveStatsComponent,
};
registry.category("view_widgets").add("hr_leave_stats", leaveStatsComponent);
