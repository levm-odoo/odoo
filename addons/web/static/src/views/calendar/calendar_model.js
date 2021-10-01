/** @odoo-module **/

import { parseDateTime } from "@web/core/l10n/dates";
import { localization } from "@web/core/l10n/localization";
import { registry } from "@web/core/registry";
import { KeepLast } from "@web/core/utils/concurrency";
import { Model } from "../helpers/model";

const DATE_FORMATS = {
    date: "yyyy-MM-dd",
    datetime: "yyyy-MM-dd HH:mm:ss",
};

function getFirstDayOfWeek() {
    return ![undefined, false].includes(localization.weekStart) ? localization.weekStart : 7;
}

export class CalendarModel extends Model {
    /**
     * @override
     * @param {import("./calendar_types").CalendarModelMeta} params
     * @param {Record<string, any>} services
     */
    setup(params, services) {
        /** @protected */
        this.user = services.user;

        /** @protected */
        this.keepLast = new KeepLast();

        /**
         * @protected
         * @type {import("./calendar_types").CalendarModelMeta}
         */
        this.meta = {
            ...params,
            firstDayOfWeek: getFirstDayOfWeek(),
        };

        /**
         * @protected
         * @type {import("./calendar_types").CalendarModelData}
         */
        this.data = {
            filterSections: {},
            hasCreateRight: null,
            range: this.computeRange(),
            records: {},
            unusualDays: [],
        };
    }
    /**
     * @override
     * @param {Partial<import("./calendar_types").CalendarModelMeta>} [params]
     */
    async load(params = {}) {
        Object.assign(this.meta, params);
        await this.keepLast.add(this.updateData());
        this.notify();
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    get date() {
        return this.meta.date;
    }
    get canCreate() {
        return this.meta.canCreate && this.data.hasCreateRight;
    }
    get canDelete() {
        return this.meta.canDelete;
    }
    get canEdit() {
        return this.meta.canEdit;
    }
    get eventLimit() {
        return this.meta.eventLimit;
    }
    get exportedState() {
        return this.meta;
    }
    get fieldMapping() {
        return this.meta.fieldMapping;
    }
    get fields() {
        return this.meta.fields;
    }
    get filterSections() {
        return Object.values(this.data.filterSections);
    }
    get firstDayOfWeek() {
        return this.meta.firstDayOfWeek;
    }
    get formViewId() {
        return this.meta.formViewId;
    }
    get hasAllDaySlot() {
        return (
            this.meta.fieldMapping.all_day ||
            this.meta.fields[this.meta.fieldMapping.date_start].type === "date"
        );
    }
    get hasEditDialog() {
        return this.meta.hasEditDialog;
    }
    get hasQuickCreate() {
        return this.meta.hasQuickCreate;
    }
    get isDateHidden() {
        return this.meta.isDateHidden;
    }
    get isTimeHidden() {
        return this.meta.isTimeHidden;
    }
    get popoverFields() {
        return this.meta.popoverFields;
    }
    get rangeEnd() {
        return this.data.range.end;
    }
    get rangeStart() {
        return this.data.range.start;
    }
    get records() {
        return this.data.records;
    }
    get resModel() {
        return this.meta.resModel;
    }
    get scale() {
        return this.meta.scale;
    }
    get scales() {
        return this.meta.scales;
    }
    get unusualDays() {
        return this.data.unusualDays;
    }

    //--------------------------------------------------------------------------

    /**
     * @param {string} fieldName
     * @param {any} filterValue
     */
    async createFilter(fieldName, filterValue) {
        const info = this.meta.filtersInfo[fieldName];
        if (info && info.writeFieldName && info.writeResModel) {
            const data = {
                user_id: this.user.userId,
                [info.writeFieldName]: filterValue,
            };
            if (info.filterFieldName) {
                data[info.filterFieldName] = true;
            }
            await this.orm.create(info.writeResModel, data);
            await this.load();
        }
    }
    /**
     * @param {Partial<import("./calendar_types").CalendarRecord>} record
     */
    async createRecord(record) {
        const rawRecord = this.buildRawRecord(record);
        await this.orm.create(this.meta.resModel, rawRecord);
        await this.load();
    }
    /**
     * @param {string} fieldName
     * @param {number} recordId
     */
    async unlinkFilter(fieldName, recordId) {
        const info = this.meta.filtersInfo[fieldName];
        if (info && info.writeResModel) {
            await this.orm.unlink(info.writeResModel, [recordId]);
            await this.load();
        }
    }
    /**
     * @param {number} recordId
     */
    async unlinkRecord(recordId) {
        await this.orm.unlink(this.meta.resModel, [recordId]);
        await this.load();
    }
    /**
     * @param {string} fieldName
     * @param {Record<any, boolean>} filters
     */
    async updateFilters(fieldName, filters) {
        const section = this.data.filterSections[fieldName];
        if (section) {
            for (const value in filters) {
                const active = filters[value];
                const filter = section.filters.find((filter) => filter.value == value);
                if (filter) {
                    filter.active = active;
                    const info = this.meta.filtersInfo[fieldName];
                    if (
                        filter.recordId &&
                        info &&
                        info.writeFieldName &&
                        info.writeResModel &&
                        info.filterFieldName
                    ) {
                        const data = {
                            [info.filterFieldName]: active,
                        };
                        await this.orm.write(info.writeResModel, [filter.recordId], data);
                    }
                }
            }
        }
        await this.load();
    }
    /**
     * @param {import("./calendar_types").CalendarRecord} record
     */
    async updateRecord(record) {
        const rawRecord = this.buildRawRecord(record);
        delete rawRecord.name; // name is immutable.
        await this.orm.write(this.meta.resModel, [record.id], rawRecord, {
            from_ui: true,
        });
        await this.load();
    }

    //--------------------------------------------------------------------------

    /**
     * @param {Partial<import("./calendar_types").CalendarRecord>} partialRecord
     * @returns {Record<string, any>}
     */
    buildRawRecord(partialRecord) {
        const data = {};
        data[this.meta.fieldMapping.create_name_field || "name"] = partialRecord.title;

        let start = partialRecord.start;
        let end = partialRecord.end;

        if (!end || !end.isValid) {
            // Set end date if not existing
            if (partialRecord.isAllDay) {
                end = start;
            } else {
                // in week mode or day mode, convert allday event to event
                end = start.plus({ hours: 2 });
            }
        } else if (partialRecord.isAllDay) {
            end = end.minus({ days: 1 });
        }

        if (this.meta.fieldMapping.all_day) {
            data[this.meta.fieldMapping.all_day] = partialRecord.isAllDay;
        }

        data[this.meta.fieldMapping.date_start] = start.toFormat(DATE_FORMATS.datetime);
        if (this.meta.fieldMapping.date_stop) {
            data[this.meta.fieldMapping.date_stop] = end.toFormat(DATE_FORMATS.datetime);
        }

        if (this.meta.fieldMapping.date_delay) {
            data[this.meta.fieldMapping.date_delay] = end.diff(start, "hours").hours;
        }

        return data;
    }
    /**
     * @param {import("./calendar_types").CalendarRecord} record
     * @returns {Record<string, any>}
     */
    makeContextDefaults(record) {
        const { fieldMapping, scale } = this.meta;

        const rawRecord = this.buildRawRecord(record);
        if (["month", "year"].includes(scale)) {
            rawRecord[fieldMapping.all_day] = true;
        }

        const context = {};
        const fieldNames = [
            fieldMapping.create_name_field || "name",
            fieldMapping.date_start,
            fieldMapping.date_stop,
            fieldMapping.date_delay,
            fieldMapping.all_day,
        ];
        for (const fieldName of fieldNames) {
            context[`default_${fieldName}`] = rawRecord[fieldName] || null;
        }

        return context;
    }

    //--------------------------------------------------------------------------
    // Protected
    //--------------------------------------------------------------------------

    /**
     * @protected
     */
    async updateData() {
        if (this.data.hasCreateRight === null) {
            this.data.hasCreateRight = await this.checkAccessRight("create");
        }
        this.data.range = this.computeRange();
        if (this.meta.showUnusualDays) {
            this.data.unusualDays = await this.loadUnusualDays();
        }
        this.data.filterSections = await this.loadFilters();
        this.data.records = await this.loadRecords();
    }

    //--------------------------------------------------------------------------

    /**
     * @protected
     * @returns {{start: luxon.DateTime, end: luxon.DateTime}}
     */
    computeRange() {
        let start = this.meta.date.toUTC();
        let end = this.meta.date.toUTC();

        if (this.meta.scale !== "week") {
            // startOf("week") does not depend on locale and will always give the
            // "Monday" of the week...
            start = start.startOf(this.meta.scale);
            end = end.endOf(this.meta.scale);
        }

        if (["week", "month"].includes(this.meta.scale)) {
            const weekday =
                start.weekday < this.meta.firstDayOfWeek
                    ? this.meta.firstDayOfWeek - 7
                    : this.meta.firstDayOfWeek;
            start = start.set({ weekday });
            end = start.plus({ weeks: this.meta.scale === "week" ? 1 : 6, days: -1 });
        }

        start = start.startOf("day");
        end = end.endOf("day");

        return {
            start: start,
            end: end,
        };
    }

    //--------------------------------------------------------------------------

    /**
     * @protected
     * @returns {import("@web/core/domain").DomainListRepr}
     */
    computeDomain() {
        return [...this.meta.domain, ...this.computeRangeDomain(), ...this.computeFiltersDomain()];
    }
    /**
     * @protected
     * @returns {import("@web/core/domain").DomainListRepr}
     */
    computeFiltersDomain() {
        // List authorized values for every field
        // fields with an active "all" filter are skipped
        const authorizedValues = {};
        const avoidValues = {};

        for (const [fieldName, filterSection] of Object.entries(this.data.filterSections)) {
            // Skip "all" filters because they do not affect the domain
            const filterAll = filterSection.filters.find((f) => f.type === "all");
            if (!(filterAll && filterAll.active)) {
                const filterSectionInfo = this.meta.filtersInfo[fieldName];

                // Loop over subfilters to complete authorizedValues
                for (const filter of filterSection.filters) {
                    if (filterSectionInfo.writeResModel) {
                        if (!authorizedValues[fieldName]) {
                            authorizedValues[fieldName] = [];
                        }
                        if (filter.active) {
                            authorizedValues[fieldName].push(filter.value);
                        }
                    } else {
                        if (!filter.active) {
                            if (!avoidValues[fieldName]) {
                                avoidValues[fieldName] = [];
                            }
                            avoidValues[fieldName].push(filter.value);
                        }
                    }
                }
            }
        }

        // Compute the domain
        /** @type {import("@web/core/domain").DomainListRepr} */
        const domain = [];
        for (const field in authorizedValues) {
            domain.push([field, "in", authorizedValues[field]]);
        }
        for (const field in avoidValues) {
            if (avoidValues[field].length > 0) {
                domain.push([field, "not in", avoidValues[field]]);
            }
        }
        return domain;
    }
    /**
     * @protected
     * @returns {import("@web/core/domain").DomainListRepr}
     */
    computeRangeDomain() {
        const formattedEnd = this.data.range.end.toFormat(DATE_FORMATS.datetime);
        const formattedStart = this.data.range.start.toFormat(DATE_FORMATS.datetime);

        /** @type {import("@web/core/domain").DomainListRepr} */
        const domain = [[this.meta.fieldMapping.date_start, "<=", formattedEnd]];
        if (this.meta.fieldMapping.date_stop) {
            domain.push([this.meta.fieldMapping.date_stop, ">=", formattedStart]);
        } else if (!this.meta.fieldMapping.date_delay) {
            domain.push([this.meta.fieldMapping.date_start, ">=", formattedStart]);
        }
        return domain;
    }

    //--------------------------------------------------------------------------

    /**
     * @protected
     * @param {string} type
     * @returns {Promise<boolean>}
     */
    checkAccessRight(type) {
        return this.orm.call(this.meta.resModel, "check_access_rights", [type, false]);
    }

    //--------------------------------------------------------------------------

    /**
     * @protected
     * @returns {Promise<Record<string, boolean>[]>}
     */
    fetchUnusualDays() {
        return this.orm.call(this.meta.resModel, "get_unusual_days", [
            this.data.range.start.toFormat(DATE_FORMATS.datetime),
            this.data.range.end.toFormat(DATE_FORMATS.datetime),
        ]);
    }
    /**
     * @protected
     * @returns {Promise<string[]>}
     */
    async loadUnusualDays() {
        const unusualDays = await this.fetchUnusualDays();
        return Object.entries(unusualDays)
            .filter((entry) => entry[1])
            .map((entry) => entry[0]);
    }

    //--------------------------------------------------------------------------

    /**
     * @protected
     * @returns {Promise<Record<string, any>[]>}
     */
    async fetchRecords() {
        return this.orm.searchRead(this.meta.resModel, this.computeDomain(), this.meta.fieldNames);
    }
    /**
     * @protected
     * @returns {Promise<Record<number, import("./calendar_types").CalendarRecord>>}
     */
    async loadRecords() {
        const rawRecords = await this.fetchRecords();
        /** @type {Record<number, import("./calendar_types").CalendarRecord>} */
        const records = {};
        for (const rawRecord of rawRecords) {
            records[rawRecord.id] = this.normalizeRecord(rawRecord);
        }
        return records;
    }
    /**
     * @protected
     * @param {Record<string, any>} rawRecord
     * @returns {import("./calendar_types").CalendarRecord}
     */
    normalizeRecord(rawRecord) {
        const { fields, fieldMapping, filtersInfo, scale } = this.meta;

        const startType = fields[fieldMapping.date_start].type;
        let start = parseDateTime(rawRecord[fieldMapping.date_start], {
            format: DATE_FORMATS[startType],
            timezone: false,
        });

        let end = start;
        if (fieldMapping.date_stop) {
            const endType = fields[fieldMapping.date_stop].type;
            end = parseDateTime(rawRecord[fieldMapping.date_stop], {
                format: DATE_FORMATS[endType],
                timezone: false,
            });
        }

        const duration = rawRecord[fieldMapping.date_delay] || 1;

        const isAllDay =
            startType === "date" ||
            (fieldMapping.all_day && rawRecord[fieldMapping.all_day]) ||
            false;

        if (isAllDay) {
            start = start.startOf("day");
            end = end.startOf("day");
        }
        if (!fieldMapping.date_stop && duration) {
            end = start.plus({ hours: duration });
        }
        if (isAllDay) {
            end = end.plus({ days: 1 });
        }

        let isTimeHidden =
            this.meta.isTimeHidden ||
            !(
                !(fieldMapping.all_day && rawRecord[fieldMapping.all_day]) &&
                scale === "month" &&
                startType !== "date"
            );

        let colorValue = rawRecord[fieldMapping.color];
        let colorIndex = Array.isArray(colorValue) ? colorValue[0] : colorValue;
        const filterInfo = Object.values(filtersInfo).find((info) => info.colorFieldName);
        if (filterInfo && filterInfo.colorFieldName) {
            colorValue = rawRecord[filterInfo.colorFieldName];
            colorIndex = Array.isArray(colorValue) ? colorValue[0] : colorValue;
        }

        const title = rawRecord[fieldMapping.create_name_field || "display_name"];

        return {
            id: rawRecord.id,
            title,
            isAllDay,
            start,
            end,
            duration,
            colorIndex,
            isTimeHidden,
            rawRecord,
        };
    }

    //--------------------------------------------------------------------------

    /**
     * @protected
     * @param {string} fieldName
     * @returns {boolean}
     */
    isColored(fieldName) {
        const field = this.meta.fields[fieldName];
        const colorField = this.meta.fields[this.meta.fieldMapping.color];
        return field.relation === colorField.relation;
    }
    /**
     * @protected
     * @param {string} resModel
     * @param {string[]} fieldNames
     * @returns {Promise<Record<string, any>[]>}
     */
    fetchFilters(resModel, fieldNames) {
        return this.orm.searchRead(resModel, [["user_id", "=", this.user.userId]], fieldNames);
    }
    /**
     * @protected
     * @param {string[]} fieldNames
     * @returns {Promise<Record<string, any>[]>}
     */
    fetchDynamicFilters(fieldNames) {
        return this.orm.searchRead(
            this.meta.resModel,
            [...this.meta.domain, ...this.computeRangeDomain()],
            fieldNames
        );
    }
    /**
     * @protected
     * @returns {Promise<import("./calendar_types").CalendarFilterSectionDict>}
     */
    async loadFilters() {
        /** @type {import("./calendar_types").CalendarFilterSectionDict} */
        const sections = {};
        /** @type {import("./calendar_types").CalendarFilterInfoDict} */
        const dynamicFiltersInfo = {};
        for (const [fieldName, filterInfo] of Object.entries(this.meta.filtersInfo)) {
            if (filterInfo.writeResModel) {
                sections[fieldName] = await this.loadFilterSection(fieldName, filterInfo);
            } else {
                dynamicFiltersInfo[fieldName] = filterInfo;
            }
        }
        if (Object.keys(dynamicFiltersInfo).length) {
            Object.assign(sections, await this.loadDynamicFilters(dynamicFiltersInfo));
        }
        return sections;
    }
    /**
     * @protected
     * @param {string} fieldName
     * @param {import("./calendar_types").CalendarFilterInfo} filterInfo
     * @returns {Promise<import("./calendar_types").CalendarFilterSection>}
     */
    async loadFilterSection(fieldName, filterInfo) {
        const fields = [filterInfo.writeFieldName, filterInfo.filterFieldName].filter(Boolean);

        const records = await this.fetchFilters(filterInfo.writeResModel, fields);
        const previousSection = this.data.filterSections[fieldName];
        const previousFilters = previousSection ? previousSection.filters : [];
        const filters = records.map((r) =>
            this.makeFilterRecord(
                previousFilters,
                r,
                filterInfo.writeFieldName,
                filterInfo.filterFieldName
            )
        );

        const field = this.meta.fields[fieldName];
        const isUserOrPartner = ["res.users", "res.partner"].includes(field.relation);
        if (isUserOrPartner) {
            filters.push(this.makeFilterUser(previousFilters, fieldName));
        }
        filters.push(this.makeFilterAll(previousFilters, isUserOrPartner));

        return {
            label: filterInfo.label,
            fieldName,
            filters,
            avatar: {
                field: filterInfo.avatarFieldName,
                model: filterInfo.resModel,
            },
            hasAvatar: !!filterInfo.avatarFieldName,
            write: {
                field: filterInfo.writeFieldName,
                model: filterInfo.writeResModel,
            },
            canCollapse: filters.length > 2,
            canAddFilter: !!filterInfo.writeResModel,
        };
    }
    /**
     * @protected
     * @param {import("./calendar_types").CalendarFilterInfoDict} filtersInfo
     * @returns {Promise<import("./calendar_types").CalendarFilterSectionDict>}
     */
    async loadDynamicFilters(filtersInfo) {
        const rawRecords = await this.fetchDynamicFilters(Object.keys(filtersInfo));

        /** @type {import("./calendar_types").CalendarFilterSectionDict} */
        const sections = {};
        for (const [fieldName, filterInfo] of Object.entries(filtersInfo)) {
            sections[fieldName] = await this.loadDynamicFilterSection(
                fieldName,
                filterInfo,
                rawRecords
            );
        }

        return sections;
    }
    /**
     * @protected
     * @param {string} fieldName
     * @param {import("./calendar_types").CalendarFilterInfo} filterInfo
     * @param {Record<string, any>[]} rawRecords
     * @returns {Promise<import("./calendar_types").CalendarFilterSection>}
     */
    async loadDynamicFilterSection(fieldName, filterInfo, rawRecords) {
        const field = this.meta.fields[fieldName];
        const previousSection = this.data.filterSections[fieldName];
        const previousFilters = previousSection ? previousSection.filters : [];

        const treatedValues = new Set();
        /** @type {import("./calendar_types").CalendarFilter[]} */
        const filters = [];

        for (const rawRecord of rawRecords) {
            const rawValues = ["many2many", "one2many"].includes(field.type)
                ? rawRecord[fieldName]
                : [rawRecord[fieldName]];

            for (const rawValue of rawValues) {
                const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
                if (!treatedValues.has(value)) {
                    filters.push(this.makeFilterDynamic(previousFilters, rawValue, fieldName));
                    treatedValues.add(value);
                }
            }
        }

        return {
            label: filterInfo.label,
            fieldName,
            filters,
            avatar: {
                field: filterInfo.avatarFieldName,
                model: filterInfo.resModel,
            },
            hasAvatar: !!filterInfo.avatarFieldName,
            write: {
                field: filterInfo.writeFieldName,
                model: filterInfo.writeResModel,
            },
            canCollapse: filters.length > 2,
            canAddFilter: !!filterInfo.writeResModel,
        };
    }
    /**
     * @protected
     * @param {import("./calendar_types").CalendarFilter[]} previousFilters
     * @param {any} rawValue
     * @param {string} fieldName
     * @returns {import("./calendar_types").CalendarFilter}
     */
    makeFilterDynamic(previousFilters, rawValue, fieldName) {
        const field = this.meta.fields[fieldName];
        const formatter = registry.category("formatters").get(field.type);
        const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
        const previousFilter = previousFilters.find(
            (f) => f.type === "dynamic" && f.value === value
        );
        return {
            type: "dynamic",
            recordId: null,
            value,
            label: formatter(rawValue) || this.env._t("Undefined"),
            active: previousFilter ? previousFilter.active : true,
            canRemove: false,
            colorIndex: this.isColored(fieldName) ? value : null,
            hasAvatar: !!value,
        };
    }
    /**
     * @protected
     * @param {import("./calendar_types").CalendarFilter[]} previousFilters
     * @param {Record<string, any>} record
     * @param {string} fieldName
     * @param {string} filterFieldName
     * @returns {import("./calendar_types").CalendarFilter}
     */
    makeFilterRecord(previousFilters, record, fieldName, filterFieldName) {
        const raw = record[fieldName];
        const value = Array.isArray(raw) ? raw[0] : raw;
        const previousFilter = previousFilters.find(
            (f) => f.type === "record" && f.recordId === record.id
        );
        const field = this.meta.fields[fieldName];
        const isX2Many = ["many2many", "one2many"].includes(field.type);
        const formatter = registry.category("formatters").get(isX2Many ? "many2one" : field.type);
        let active = false;
        if (previousFilter) {
            active = previousFilter.active;
        } else if (filterFieldName) {
            active = record[filterFieldName];
        }
        return {
            type: "record",
            recordId: record.id,
            value,
            label: formatter(raw),
            active,
            canRemove: true,
            colorIndex: this.isColored(fieldName) ? value : null,
            hasAvatar: !!value,
        };
    }
    /**
     * @protected
     * @param {import("./calendar_types").CalendarFilter[]} previousFilters
     * @param {string} fieldName
     * @returns {import("./calendar_types").CalendarFilter}
     */
    makeFilterUser(previousFilters, fieldName) {
        const field = this.meta.fields[fieldName];
        const userFieldName = field.relation === "res.partner" ? "partnerId" : "userId";
        const previousFilter = previousFilters.find((f) => f.type === "user");
        const value = this.user[userFieldName];
        return {
            type: "user",
            recordId: null,
            value,
            label: this.user.name,
            active: previousFilter ? previousFilter.active : true,
            canRemove: false,
            colorIndex: this.isColored(fieldName) ? value : null,
            hasAvatar: !!value,
        };
    }
    /**
     * @protected
     * @param {import("./calendar_types").CalendarFilter[]} previousFilters
     * @param {boolean} isUserOrPartner
     * @returns {import("./calendar_types").CalendarFilter}
     */
    makeFilterAll(previousFilters, isUserOrPartner) {
        const previousFilter = previousFilters.find((f) => f.type === "all");
        return {
            type: "all",
            recordId: null,
            value: "all",
            label: isUserOrPartner
                ? this.env._t("Everybody's calendars")
                : this.env._t("Everything"),
            active: previousFilter ? previousFilter.active : false,
            canRemove: false,
            colorIndex: null,
            hasAvatar: false,
        };
    }
}
CalendarModel.services = ["user"];
