import { Component, onWillRender, useState } from "@odoo/owl";
import { useDateTimePicker } from "@web/core/datetime/datetime_hook";
import { areDatesEqual, deserializeDate, deserializeDateTime, today } from "@web/core/l10n/dates";
import { evaluateBooleanExpr } from "@web/core/py_js/py";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { ensureArray } from "@web/core/utils/arrays";
import { exprToBoolean } from "@web/core/utils/strings";
import { formatDate, formatDateTime } from "../formatters";
import { standardFieldProps } from "../standard_field_props";

/**
 * @typedef {luxon.DateTime} DateTime
 *
 * @typedef {import("../standard_field_props").StandardFieldProps & {
 *  endDateField?: string;
 *  maxDate?: string;
 *  minDate?: string;
 *  placeholder?: string;
 *  required?: boolean;
 *  rounding?: number;
 *  startDateField?: string;
 *  warnFuture?: boolean;
 *  showSeconds?: boolean;
 *  showTime?: boolean;
 *  minPrecision?: string;
 *  maxPrecision?: string;
 * }} DateTimeFieldProps
 *
 * @typedef {import("@web/core/datetime/datetime_picker").DateTimePickerProps} DateTimePickerProps
 */

/** @extends {Component<DateTimeFieldProps>} */
export class DateTimeField extends Component {
    static props = {
        ...standardFieldProps,
        endDateField: { type: String, optional: true },
        maxDate: { type: String, optional: true },
        minDate: { type: String, optional: true },
        alwaysRange: { type: Boolean, optional: true },
        placeholder: { type: String, optional: true },
        placeholderField: { type: String, optional: true },
        required: { type: Boolean, optional: true },
        rounding: { type: Number, optional: true },
        startDateField: { type: String, optional: true },
        warnFuture: { type: Boolean, optional: true },
        showSeconds: { type: Boolean, optional: true },
        showTime: { type: Boolean, optional: true },
        minPrecision: {
            type: String,
            optional: true,
            validate: (props) => ["days", "months", "years", "decades"].includes(props),
        },
        maxPrecision: {
            type: String,
            optional: true,
            validate: (props) => ["days", "months", "years", "decades"].includes(props),
        },
        condensed: { type: Boolean, optional: true },
    };
    static defaultProps = {
        showSeconds: true,
        showTime: true,
    };

    static template = "web.DateTimeField";

    //-------------------------------------------------------------------------
    // Getters
    //-------------------------------------------------------------------------

    get endDateField() {
        return this.relatedField ? this.props.endDateField || this.props.name : null;
    }

    get field() {
        return this.props.record.fields[this.props.name];
    }

    get relatedField() {
        return this.props.startDateField || this.props.endDateField;
    }

    get startDateField() {
        return this.props.startDateField || this.props.name;
    }

    get values() {
        return ensureArray(this.state.value);
    }

    get placeholder() {
        const dynamicPlaceholder =
            this.props.placeholderField && this.props.record.data[this.props.placeholderField];
        if (dynamicPlaceholder) {
            const { condensed, showSeconds, showTime } = this.props;
            if (
                dynamicPlaceholder.c.hour === 0 &&
                dynamicPlaceholder.c.minute === 0 &&
                dynamicPlaceholder.c.second === 0 &&
                dynamicPlaceholder.c.millisecond === 0
            ) {
                return formatDate(dynamicPlaceholder, { condensed });
            } else {
                return formatDateTime(dynamicPlaceholder, { condensed, showSeconds, showTime });
            }
        }
        return this.props.placeholder;
    }

    //-------------------------------------------------------------------------
    // Lifecycle
    //-------------------------------------------------------------------------

    setup() {
        const getPickerProps = () => {
            const value = this.getRecordValue();
            /** @type {DateTimePickerProps} */
            const pickerProps = {
                value,
                type: this.field.type,
                range: this.isRange(value),
            };
            if (this.props.maxDate) {
                pickerProps.maxDate = this.parseLimitDate(this.props.maxDate);
            }
            if (this.props.minDate) {
                pickerProps.minDate = this.parseLimitDate(this.props.minDate);
            }
            if (!isNaN(this.props.rounding)) {
                pickerProps.rounding = this.props.rounding;
            } else if (!this.props.showSeconds) {
                pickerProps.rounding = 0;
            }
            if (this.props.maxPrecision) {
                pickerProps.maxPrecision = this.props.maxPrecision;
            }
            if (this.props.minPrecision) {
                pickerProps.minPrecision = this.props.minPrecision;
            }
            return pickerProps;
        };

        const dateTimePicker = useDateTimePicker({
            target: "root",
            showSeconds: this.props.showSeconds,
            condensed: this.props.condensed,
            get pickerProps() {
                return getPickerProps();
            },
            onChange: () => {
                this.state.range = this.isRange(this.state.value);
            },
            onApply: () => {
                const toUpdate = {};
                if (Array.isArray(this.state.value)) {
                    // Value is already a range
                    [toUpdate[this.startDateField], toUpdate[this.endDateField]] = this.state.value;
                } else {
                    toUpdate[this.props.name] = this.state.value;
                }

                // If startDateField or endDateField are not set, delete unchanged fields
                for (const fieldName in toUpdate) {
                    if (areDatesEqual(toUpdate[fieldName], this.props.record.data[fieldName])) {
                        delete toUpdate[fieldName];
                    }
                }

                if (Object.keys(toUpdate).length) {
                    this.props.record.update(toUpdate);
                }
            },
        });
        // Subscribes to changes made on the picker state
        this.state = useState(dateTimePicker.state);
        this.openPicker = dateTimePicker.open;

        onWillRender(() => this.triggerIsDirty());
    }

    //-------------------------------------------------------------------------
    // Methods
    //-------------------------------------------------------------------------

    /**
     * @param {number} valueIndex
     */
    async addDate(valueIndex) {
        const values = this.values;
        values[valueIndex] = valueIndex
            ? values[0].plus({ hours: 1 })
            : values[1].minus({ hours: 1 });

        this.state.focusedDateIndex = valueIndex;
        this.state.value = values;
        this.state.range = true;

        this.openPicker(valueIndex);
    }

    /**
     * @param {number} valueIndex
     */
    getFormattedValue(valueIndex) {
        const value = this.values[valueIndex];
        const { condensed, showSeconds, showTime } = this.props;
        return value
            ? this.field.type === "date"
                ? formatDate(value, { condensed })
                : formatDateTime(value, { condensed, showSeconds, showTime })
            : "";
    }

    /**
     * @returns {DateTimePickerProps["value"]}
     */
    getRecordValue() {
        if (this.relatedField) {
            return [
                this.props.record.data[this.startDateField],
                this.props.record.data[this.endDateField],
            ];
        } else {
            return this.props.record.data[this.props.name];
        }
    }

    /**
     * @param {number} index
     */
    isDateInTheFuture(index) {
        return this.values[index] > today();
    }

    /**
     * @param {string} fieldName
     */
    isEmpty(fieldName) {
        return fieldName === this.startDateField ? !this.values[0] : !this.values[1];
    }

    /**
     * @param {DateTimePickerProps["value"]} value
     * @returns {boolean}
     */
    isRange(value) {
        if (!this.relatedField) {
            return false;
        }
        return (
            this.props.alwaysRange ||
            this.props.required ||
            ensureArray(value).filter(Boolean).length === 2
        );
    }

    /**
     * @param {string} value
     */
    parseLimitDate(value) {
        if (value === "today") {
            return value;
        }
        return this.field.type === "date" ? deserializeDate(value) : deserializeDateTime(value);
    }

    /**
     * @return {boolean}
     */
    shouldShowSeparator() {
        return (
            (this.props.alwaysRange &&
                (this.props.readonly
                    ? !this.isEmpty(this.startDateField) || !this.isEmpty(this.endDateField)
                    : true)) ||
            (this.state.range &&
                (this.props.required ||
                    (!this.isEmpty(this.startDateField) && !this.isEmpty(this.endDateField))))
        );
    }

    /**
     * The given props are used to compute the current value and compare it to
     * the state handled by the datetime hook.
     *
     * @param {boolean} [isDirty]
     */
    triggerIsDirty(isDirty) {
        this.props.record.model.bus.trigger(
            "FIELD_IS_DIRTY",
            isDirty ?? !areDatesEqual(this.getRecordValue(), this.state.value)
        );
    }

    //-------------------------------------------------------------------------
    // Handlers
    //-------------------------------------------------------------------------

    onInput() {
        this.triggerIsDirty(true);
    }
}

const START_DATE_FIELD_OPTION = "start_date_field";
const END_DATE_FIELD_OPTION = "end_date_field";

export const dateField = {
    component: DateTimeField,
    displayName: _t("Date"),
    supportedOptions: [
        {
            label: _t("Earliest accepted date"),
            name: "min_date",
            type: "string",
            help: _t(`ISO-formatted date (e.g. "2018-12-31") or "%s".`, "today"),
        },
        {
            label: _t("Latest accepted date"),
            name: "max_date",
            type: "string",
            help: _t(`ISO-formatted date (e.g. "2018-12-31") or "%s".`, "today"),
        },
        {
            label: _t("Warning for future dates"),
            name: "warn_future",
            type: "boolean",
            help: _t(`Displays a warning icon if the input dates are in the future.`),
        },
        {
            label: _t("Minimal precision"),
            name: "min_precision",
            type: "selection",
            help: _t(
                `Choose which minimal precision (days, months, ...) you want in the datetime picker.`
            ),
            choices: [
                { label: _t("Days"), value: "days" },
                { label: _t("Months"), value: "months" },
                { label: _t("Years"), value: "years" },
                { label: _t("Decades"), value: "decades" },
            ],
        },
        {
            label: _t("Maximal precision"),
            name: "max_precision",
            type: "selection",
            help: _t(
                `Choose which maximal precision (days, months, ...) you want in the datetime picker.`
            ),
            choices: [
                { label: _t("Days"), value: "days" },
                { label: _t("Months"), value: "months" },
                { label: _t("Years"), value: "years" },
                { label: _t("Decades"), value: "decades" },
            ],
        },
        {
            label: _t("Condensed display"),
            name: "condensed",
            type: "boolean",
            help: _t(`Set to true to display days, months (and hours) with unpadded numbers`),
        },
        {
            label: _t("Placeholder field"),
            name: "placeholder_field",
            type: "field",
            availableTypes: ["date"],
        },
    ],
    supportedTypes: ["date"],
    extractProps: ({ attrs, options }, dynamicInfo) => ({
        endDateField: options[END_DATE_FIELD_OPTION],
        maxDate: options.max_date,
        minDate: options.min_date,
        alwaysRange: exprToBoolean(options.always_range),
        placeholder: attrs.placeholder,
        placeholderField: options.placeholder_field,
        required: dynamicInfo.required,
        rounding: options.rounding && parseInt(options.rounding, 10),
        startDateField: options[START_DATE_FIELD_OPTION],
        warnFuture: exprToBoolean(options.warn_future),
        minPrecision: options.min_precision,
        maxPrecision: options.max_precision,
        condensed: options.condensed,
    }),
    fieldDependencies: ({ type, attrs, options }) => {
        const deps = [];
        if (options[START_DATE_FIELD_OPTION]) {
            deps.push({
                name: options[START_DATE_FIELD_OPTION],
                type,
                readonly: false,
                ...attrs,
            });
            if (options[END_DATE_FIELD_OPTION]) {
                console.warn(
                    `A field cannot have both ${START_DATE_FIELD_OPTION} and ${END_DATE_FIELD_OPTION} options at the same time`
                );
            }
        } else if (options[END_DATE_FIELD_OPTION]) {
            deps.push({
                name: options[END_DATE_FIELD_OPTION],
                type,
                readonly: false,
                ...attrs,
            });
        }
        return deps;
    },
};

export const dateTimeField = {
    ...dateField,
    displayName: _t("Date & Time"),
    supportedOptions: [
        ...dateField.supportedOptions,
        {
            label: _t("Time interval"),
            name: "rounding",
            type: "number",
            default: 5,
            help: _t(
                `Control the number of minutes in the time selection. E.g. set it to 15 to work in quarters.`
            ),
        },
        {
            label: _t("Show seconds"),
            name: "show_seconds",
            type: "boolean",
            default: true,
            help: _t(`Displays or hides the seconds in the datetime value.`),
        },
        {
            label: _t("Show time"),
            name: "show_time",
            type: "boolean",
            default: true,
            help: _t(`Displays or hides the time in the datetime value.`),
        },
    ],
    extractProps: ({ attrs, options }, dynamicInfo) => ({
        ...dateField.extractProps({ attrs, options }, dynamicInfo),
        showSeconds: exprToBoolean(options.show_seconds ?? true),
        showTime: exprToBoolean(options.show_time ?? true),
    }),
    supportedTypes: ["datetime"],
};

export const dateRangeField = {
    ...dateTimeField,
    displayName: _t("Date Range"),
    supportedOptions: [
        ...dateTimeField.supportedOptions,
        {
            label: _t("Start date field"),
            name: START_DATE_FIELD_OPTION,
            type: "field",
            availableTypes: ["date", "datetime"],
        },
        {
            label: _t("End date field"),
            name: END_DATE_FIELD_OPTION,
            type: "field",
            availableTypes: ["date", "datetime"],
        },
        {
            label: _t("Always range"),
            name: "always_range",
            type: "boolean",
            default: false,
            help: _t(
                `Set to true the full range input has to be display by default, even if empty.`
            ),
        },
    ],
    supportedTypes: ["date", "datetime"],
    listViewWidth: ({ type }) => (type === "datetime" ? 294 : 180),
    isValid: (record, fieldname, fieldInfo) => {
        if (fieldInfo.widget === "daterange") {
            if (
                !record.data[fieldInfo.options[END_DATE_FIELD_OPTION]] !==
                    !record.data[fieldname] &&
                evaluateBooleanExpr(
                    record.activeFields[fieldInfo.options[END_DATE_FIELD_OPTION]]?.required,
                    record.evalContextWithVirtualIds
                )
            ) {
                return false;
            }
            if (
                !record.data[fieldInfo.options[START_DATE_FIELD_OPTION]] !==
                    !record.data[fieldname] &&
                evaluateBooleanExpr(
                    record.activeFields[fieldInfo.options[START_DATE_FIELD_OPTION]]?.required,
                    record.evalContextWithVirtualIds
                )
            ) {
                return false;
            }
        }
        return !record.isFieldInvalid(fieldname);
    },
};

registry
    .category("fields")
    .add("date", dateField)
    .add("daterange", dateRangeField)
    .add("datetime", dateTimeField);
