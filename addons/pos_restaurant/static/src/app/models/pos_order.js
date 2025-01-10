import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";

patch(PosOrder.prototype, {
    setup(_defaultObj, options) {
        super.setup(...arguments);
        if (this.config.module_pos_restaurant) {
            this.customer_count = this.customer_count || 1;
            if (!_defaultObj.course_ids) {
                this.course_ids = [];
            }
            this.uiState.selected_course_uuid = undefined;
        }
    },
    getCustomerCount() {
        return this.customer_count;
    },
    setCustomerCount(count) {
        this.customer_count = Math.max(count, 0);
    },
    getTable() {
        return this.table_id;
    },
    get isBooked() {
        const res = super.isBooked;
        if (this.config.module_pos_restaurant) {
            return super.isBooked || !this.isDirectSale;
        }
        return res;
    },
    amountPerGuest(numCustomers = this.customer_count) {
        if (numCustomers === 0) {
            return 0;
        }
        return this.getTotalDue() / numCustomers;
    },
    setBooked(booked) {
        this.uiState.booked = booked;
    },
    getName() {
        if (this.config.module_pos_restaurant) {
            if (this.isDirectSale) {
                return _t("Direct Sale");
            }
            if (this.getTable()) {
                const table = this.getTable();
                const child_tables = this.models["restaurant.table"].filter((t) => {
                    if (t.floor_id.id === table.floor_id.id) {
                        return table.isParent(t);
                    }
                });
                let name = "T " + table.table_number.toString();
                for (const child_table of child_tables) {
                    name += ` & ${child_table.table_number}`;
                }
                return name;
            }
        }
        return super.getName(...arguments);
    },
    get isDirectSale() {
        return Boolean(
            this.config.module_pos_restaurant &&
                !this.table_id &&
                !this.floating_order_name &&
                this.state == "draft"
        );
    },
    get isFilledDirectSale() {
        return this.isDirectSale && !this.isEmpty();
    },
    setPartner(partner) {
        if (this.config.module_pos_restaurant && this.isDirectSale) {
            this.floating_order_name = partner.name;
        }
        return super.setPartner(...arguments);
    },
    serialize(options = {}) {
        if (options.orm === true) {
            this.cleanUpCourses();
        }
        const data = super.serialize(...arguments);
        if (options.orm === true && this.lines.length) {
            if (this.hasCourses()) {
                data.restaurant_course_lines = this._getORMCourseMappings(data);
            }
        }
        return data;
    },
    _getORMCourseMappings(serializedData) {
        // Map each course uuid to its corresponding list line uuids to ensure proper assignment of new created course
        const updatedLineIds = (serializedData.lines || [])
            .filter((line) => line[0] === 1)
            .map((line) => line[1]);
        return this.lines.reduce((mapping, line) => {
            if (
                line.course_id &&
                (typeof line.id === "string" || // New line
                    typeof line.course_id.id === "string" || // New course
                    updatedLineIds.includes(line.id)) // Updated line
            ) {
                const courseUuid = line.course_id.uuid;
                mapping[courseUuid] = mapping[courseUuid] || [];
                mapping[courseUuid].push(line.uuid);
            }
            return mapping;
        }, {});
    },
    cleanUpCourses(untilCourseUUID) {
        // Removes empty new courses. If `untilCourseUUID` is specified,
        // all courses appearing after that UUID will remain untouched.
        if (!this.hasCourses()) {
            return;
        }
        let courseIndex = 1;
        const originalLength = this.courses.length;
        let keepNext = false;
        const cleanedCourses = this.courses.reduce((acc, course) => {
            if (!keepNext && course.isNew() && course.isEmpty()) {
                return acc;
            }
            if (course.uuid === untilCourseUUID) {
                keepNext = true;
            }
            if (course.isNew()) {
                course.index = courseIndex;
            } else {
                courseIndex = course.index;
            }
            acc.push(course);
            courseIndex++;
            return acc;
        }, []);

        if (cleanedCourses.length !== originalLength) {
            this.course_ids = cleanedCourses;
        }
    },
    get courses() {
        return this.course_ids.sort((a, b) => a.index - b.index);
    },
    hasCourses() {
        return this.course_ids.length > 0;
    },
    getFirstCourse() {
        return this.courses[0];
    },
    getLastCourse() {
        return this.courses.at(-1);
    },
    ensureCourseSelection() {
        if (!this.hasCourses() || this.getSelectedCourse()) {
            return;
        }
        // Select the last course
        this.selectCourse(this.getLastCourse());
    },
    deselectCourse() {
        this.selectCourse(undefined);
    },
    selectCourse(course) {
        if (course) {
            this.uiState.selected_course_uuid = course.uuid;
            this.deselectOrderline();
        } else {
            this.uiState.selected_course_uuid = undefined;
        }
    },
    getSelectedCourse() {
        if (!this.uiState.selected_course_uuid) {
            return;
        }
        return this.course_ids.find((course) => course.uuid === this.uiState.selected_course_uuid);
    },
    getNextCourseIndex() {
        return (
            this.course_ids.reduce(
                (maxIndex, course) => (course.index > maxIndex ? course.index : maxIndex),
                0
            ) + 1
        );
    },
});
