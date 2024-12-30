/** @ts-check */

/**
 * @typedef {import("@spreadsheet").GlobalFilter} GlobalFilter
 * @typedef {import("@spreadsheet").FieldMatching} FieldMatching
 * @typedef {import("@spreadsheet").DateGlobalFilter} DateGlobalFilter
 * @typedef {import("@spreadsheet").RelationalGlobalFilter} RelationalGlobalFilter
 */

import { OdooUIPlugin } from "@spreadsheet/plugins";


export class GlobalFiltersUIPlugin extends OdooUIPlugin {

    /**
     * Handle a spreadsheet command
     *
     * @param {import("@spreadsheet").AllCommand} cmd
     */
    handle(cmd) {
        switch (cmd.type) {
            case "SET_MANY_GLOBAL_FILTER_VALUE":
                for (const filter of cmd.filters) {
                    this.dispatch("SET_GLOBAL_FILTER_VALUE", {
                        id: filter.filterId,
                        value: filter.value,
                    });
                }
                break;
        }
    }
<<<<<<< HEAD
=======

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    /**
     * @param {string} filterId
     * @param {FieldMatching} fieldMatching
     *
     * @return {Domain}
     */
    getGlobalFilterDomain(filterId, fieldMatching) {
        /** @type {GlobalFilter} */
        const filter = this.getters.getGlobalFilter(filterId);
        if (!filter) {
            return new Domain();
        }
        switch (filter.type) {
            case "date":
                return this._getDateDomain(filter, fieldMatching);
            default:
                return this._getDomain(filter, fieldMatching);
        }
    }

    /**
     * Get the current value of a global filter
     *
     * @param {string} filterId Id of the filter
     *
     * @returns {string|Array<string>|Object} value Current value to set
     */
    getGlobalFilterValue(filterId) {
        const filter = this.getters.getGlobalFilter(filterId);

        const value = filterId in this.values ? this.values[filterId].value : undefined;
        const preventDefaultValue = this.values[filterId]?.preventDefaultValue;
        if (!value && preventDefaultValue) {
            switch (filter.type) {
                case "date":
                    return undefined;
                default:
                    return this._getEmptyValue(filter.operator);
            }
        }
        if (filter.type === "date" && filter.rangeType === "from_to") {
            return value || { from: undefined, to: undefined };
        }
        if (filter.type === "date" && isEmpty(value) && filter.defaultValue) {
            return this._getValueOfCurrentPeriod(filterId);
        }
        if (
            ["in", "child_of"].includes(filter.operator) &&
            isEmpty(value) &&
            filter.defaultValue === "current_user"
        ) {
            return [user.userId];
        }
        return value || filter.defaultValue;
    }

    /**
     * @param {string} id Id of the filter
     *
     * @returns { boolean } true if the given filter is active
     */
    isGlobalFilterActive(id) {
        const { type, operator } = this.getters.getGlobalFilter(id);
        const value = this.getGlobalFilterValue(id);
        switch (type) {
            case "date":
                return (
                    value &&
                    (typeof value === "string" ||
                        value.yearOffset !== undefined ||
                        value.period ||
                        value.from ||
                        value.to)
                );
            default:
                return value && !this._isEmptyValue(operator, value);
        }
    }

    /**
     * Get the number of active global filters
     *
     * @returns {number}
     */
    getActiveFilterCount() {
        return this.getters
            .getGlobalFilters()
            .filter((filter) => this.isGlobalFilterActive(filter.id)).length;
    }

    getFilterDisplayValue(filterName) {
        const filter = this.getters.getGlobalFilterLabel(filterName);
        if (!filter) {
            throw new EvaluationError(
                _t(`Filter "%(filter_name)s" not found`, { filter_name: filterName })
            );
        }
        const value = this.getGlobalFilterValue(filter.id);
        switch (filter.type) {
            case "date": {
                if (filter.rangeType === "from_to") {
                    const locale = this.getters.getLocale();
                    const from = {
                        value: value.from ? toNumber(value.from, locale) : "",
                        format: locale.dateFormat,
                    };
                    const to = {
                        value: value.to ? toNumber(value.to, locale) : "",
                        format: locale.dateFormat,
                    };
                    return [[from], [to]];
                }
                if (value && typeof value === "string") {
                    const type = RELATIVE_DATE_RANGE_TYPES.find((type) => type.type === value);
                    if (!type) {
                        return [[{ value: "" }]];
                    }
                    return [[{ value: type.description.toString() }]];
                }
                if (!value || value.yearOffset === undefined) {
                    return [[{ value: "" }]];
                }
                const year = String(DateTime.local().year + value.yearOffset);
                const period = QUARTER_OPTIONS[value.period];
                let periodStr = period && "Q" + period.setParam.quarter; // we do not want the translated value (like T1 in French)
                // Named months aren't in QUARTER_OPTIONS
                if (!period) {
                    periodStr =
                        MONTHS[value.period] && String(MONTHS[value.period].value).padStart(2, "0");
                }
                return [[{ value: periodStr ? periodStr + "/" + year : year }]];
            }
            default:
                switch (filter.operator) {
                    case "ilike":
                        return [[{ value: value || "" }]];
                    case "in":
                    case "child_of":
                        if (!value?.length || !this.nameService) {
                            return [[{ value: "" }]];
                        }
                        if (!this.recordsDisplayName[filter.id]) {
                            const promise = this.nameService
                                .loadDisplayNames(filter.modelName, value)
                                .then((result) => {
                                    this.recordsDisplayName[filter.id] = Object.values(result);
                                });
                            this.odooDataProvider.notifyWhenPromiseResolves(promise);
                            return [[{ value: "" }]];
                        }
                        return [[{ value: this.recordsDisplayName[filter.id].join(", ") }]];
                }
        }
    }

    /**
     * Returns the possible values a text global filter can take
     * if the values are restricted by a range of allowed values
     * @param {string} filterId
     * @returns {{value: string, formattedValue: string}[]}
     */
    getTextFilterOptions(filterId) {
        const filter = this.getters.getGlobalFilter(filterId);
        if (filter.operator !== "ilike" || !filter.rangeOfAllowedValues) {
            return [];
        }
        const additionOptions = [
            // add the current value because it might not be in the range
            // if the range cells changed in the meantime
            this.getGlobalFilterValue(filterId),
            filter.defaultValue,
        ];
        const options = this.getTextFilterOptionsFromRange(
            filter.rangeOfAllowedValues,
            additionOptions
        );
        return options;
    }

    /**
     * Returns the possible values a text global filter can take from a range
     * or any addition raw string value. Removes duplicates and empty string values.
     * @param {object} range
     * @param {string[]} additionalOptionValues
     */
    getTextFilterOptionsFromRange(range, additionalOptionValues = []) {
        const cells = this.getters.getEvaluatedCellsInZone(range.sheetId, range.zone);
        const uniqueFormattedValues = new Set();
        const uniqueValues = new Set();
        const allowedValues = cells
            .filter((cell) => !["empty", "error"].includes(cell.type) && cell.value !== "")
            .map((cell) => ({
                value: cell.value.toString(),
                formattedValue: cell.formattedValue,
            }))
            .filter((cell) => {
                if (uniqueFormattedValues.has(cell.formattedValue)) {
                    return false;
                }
                uniqueFormattedValues.add(cell.formattedValue);
                uniqueValues.add(cell.value);
                return true;
            });
        const additionalOptions = additionalOptionValues
            .map((value) => ({ value, formattedValue: value }))
            .filter((cell) => {
                if (cell.value === undefined || cell.value === "" || uniqueValues.has(cell.value)) {
                    return false;
                }
                uniqueValues.add(cell.value);
                return true;
            });
        return allowedValues.concat(additionalOptions);
    }

    // -------------------------------------------------------------------------
    // Handlers
    // -------------------------------------------------------------------------

    /**
     * Set the current value of a global filter
     *
     * @param {string} id Id of the filter
     * @param {string|Array<string>|Object} value Current value to set
     */
    _setGlobalFilterValue(id, value) {
        const filter = this.getters.getGlobalFilter(id);
        this.values[id] = {
            preventDefaultValue: false,
            value,
            rangeType: filter.type === "date" ? filter.rangeType : undefined,
        };
    }

    /**
     * Get the filter value corresponding to the current period, depending of the type of range of the filter.
     * For example if rangeType === "month", the value will be the current month of the current year.
     *
     * @param {string} filterId a global filter
     * @return {Object} filter value
     */
    _getValueOfCurrentPeriod(filterId) {
        const filter = this.getters.getGlobalFilter(filterId);
        switch (filter.defaultValue) {
            case "this_year":
                return { yearOffset: 0 };
            case "this_month": {
                const month = new Date().getMonth() + 1;
                const period = Object.entries(MONTHS).find((item) => item[1].value === month)[0];
                return { yearOffset: 0, period };
            }
            case "this_quarter": {
                const quarter = Math.floor(new Date().getMonth() / 3);
                const period = FILTER_DATE_OPTION.quarter[quarter];
                return { yearOffset: 0, period };
            }
        }
        return filter.defaultValue;
    }

    /**
     * Set the current value to empty values which functionally deactivate the filter
     *
     * @param {string} id Id of the filter
     */
    _clearGlobalFilterValue(id) {
        const filter = this.getters.getGlobalFilter(id);
        this.values[id] = {
            preventDefaultValue: true,
            value: undefined,
            rangeType: filter.type === "date" ? filter.rangeType : undefined,
        };
    }

    // -------------------------------------------------------------------------
    // Private
    // -------------------------------------------------------------------------

    /**
     * Get the domain relative to a date field
     *
     * @private
     *
     * @param {DateGlobalFilter} filter
     * @param {FieldMatching} fieldMatching
     *
     * @returns {Domain}
     */
    _getDateDomain(filter, fieldMatching) {
        let granularity;
        const value = this.getGlobalFilterValue(filter.id);
        if (!value || !fieldMatching.chain) {
            return new Domain();
        }
        const field = fieldMatching.chain;
        const type = /** @type {"date" | "datetime"} */ (fieldMatching.type);
        const offset = fieldMatching.offset || 0;
        const now = DateTime.local();

        if (filter.rangeType === "from_to") {
            const serialize = type === "datetime" ? serializeDateTime : serializeDate;
            const from = value.from && serialize(DateTime.fromISO(value.from).startOf("day"));
            const to = value.to && serialize(DateTime.fromISO(value.to).endOf("day"));
            if (from && to) {
                return new Domain(["&", [field, ">=", from], [field, "<=", to]]);
            }
            if (from) {
                return new Domain([[field, ">=", from]]);
            }
            if (to) {
                return new Domain([[field, "<=", to]]);
            }
            return new Domain();
        }

        if (filter.rangeType === "relative") {
            return getRelativeDateDomain(now, offset, value, field, type);
        }
        const noPeriod = !value.period || value.period === "empty";
        const noYear = value.yearOffset === undefined;
        if (noPeriod && noYear) {
            return new Domain();
        }
        const setParam = { year: now.year };
        const yearOffset = value.yearOffset || 0;
        const plusParam = { years: yearOffset };
        if (noPeriod) {
            granularity = "year";
            plusParam.years += offset;
        } else {
            // value.period is can be "first_quarter", "second_quarter", etc. or
            // full month name (e.g. "january", "february", "march", etc.)
            granularity = value.period.endsWith("_quarter") ? "quarter" : "month";
            switch (granularity) {
                case "month":
                    setParam.month = MONTHS[value.period].value;
                    plusParam.month = offset;
                    break;
                case "quarter":
                    setParam.quarter = QUARTER_OPTIONS[value.period].setParam.quarter;
                    plusParam.quarter = offset;
                    break;
            }
        }
        return constructDateRange({
            referenceMoment: now,
            fieldName: field,
            fieldType: type,
            granularity,
            setParam,
            plusParam,
        }).domain;
    }

    _getEmptyValue(operator) {
        switch (operator) {
            case "ilike":
                return "";
            case "in":
            case "child_of":
                return [];
        }
    }

    _isEmptyValue(operator, value) {
        switch (operator) {
            case "ilike":
                return false;
            case "in":
            case "child_of":
                return value.length === 0;
        }
    }

    /**
     * Get the domain to apply to a field based on a global filter
     *
     * @private
     *
     * @param {GlobalFilter} filter
     * @param {FieldMatching} fieldMatching
     *
     * @returns {Domain}
     */
    _getDomain(filter, fieldMatching) {
        const value = this.getGlobalFilterValue(filter.id);
        if (!value || this._isEmptyValue(filter.operator, value) || !fieldMatching.chain) {
            return new Domain();
        }
        const field = fieldMatching.chain;
        return new Domain([[field, filter.operator, value]]);
    }

    /**
     * Adds all active filters (and their values) at the time of export in a dedicated sheet
     *
     * @param {Object} data
     */
    exportForExcel(data) {
        if (this.getters.getGlobalFilters().length === 0) {
            return;
        }
        this.exportSheetWithActiveFilters(data);
        data.sheets[data.sheets.length - 1] = {
            ...createEmptyExcelSheet(uuidGenerator.uuidv4(), _t("Active Filters")),
            ...data.sheets.at(-1),
        };
    }

    exportSheetWithActiveFilters(data) {
        if (this.getters.getGlobalFilters().length === 0) {
            return;
        }

        const cells = {
            A1: "Filter",
            B1: "Value",
        };
        const formats = {};
        let numberOfCols = 2; // at least 2 cols (filter title and filter value)
        let filterRowIndex = 1; // first row is the column titles
        for (const filter of this.getters.getGlobalFilters()) {
            cells[`A${filterRowIndex + 1}`] = filter.label;
            const result = this.getFilterDisplayValue(filter.label);
            for (const colIndex in result) {
                numberOfCols = Math.max(numberOfCols, Number(colIndex) + 2);
                for (const rowIndex in result[colIndex]) {
                    const cell = result[colIndex][rowIndex];
                    if (cell.value === undefined) {
                        continue;
                    }
                    const xc = toXC(Number(colIndex) + 1, Number(rowIndex) + filterRowIndex);
                    cells[xc] = cell.value.toString();
                    if (cell.format) {
                        const formatId = getItemId(cell.format, data.formats);
                        formats[xc] = formatId;
                    }
                }
            }
            filterRowIndex += result[0].length;
        }
        const styleId = getItemId({ bold: true }, data.styles);

        const sheet = {
            ...createEmptySheet(uuidGenerator.uuidv4(), _t("Active Filters")),
            cells,
            formats,
            styles: {
                A1: styleId,
                B1: styleId,
            },
            colNumber: numberOfCols,
            rowNumber: filterRowIndex,
        };
        data.sheets.push(sheet);
    }
>>>>>>> 4331b7324a6e ([REF] *spreadsheet*: add ilike operator)
}
