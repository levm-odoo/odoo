/** @ts-check */

import { serializeDate, serializeDateTime } from "@web/core/l10n/dates";
import { Domain } from "@web/core/domain";

import { CommandResult } from "@spreadsheet/o_spreadsheet/cancelled_reason";
import { RELATIVE_DATE_RANGE_TYPES } from "@spreadsheet/helpers/constants";
import { monthsOptions } from "@spreadsheet/assets_backend/constants";
import { QUARTER_OPTIONS } from "@web/search/utils/dates";

/**
 * @typedef {import("@spreadsheet").FieldMatching} FieldMatching
 */

const monthsOptionsIds = monthsOptions.map((option) => option.id);
const quarterOptionsIds = Object.values(QUARTER_OPTIONS).map((option) => option.id);

/**
 * Check if the value is valid for given filter.
 * @param {GlobalFilter | CmdGlobalFilter} filter
 * @param {any} value
 * @returns {boolean}
 */
export function checkFilterValueIsValid(filter, value) {
    if (value === undefined) {
        return true;
    }
    switch (filter.operator) {
        case undefined: // Attribute
        case "ilike":
            if (typeof value !== "string") {
                return false;
            }
            return true;
        case "in":
        case "child_of":
            if (!Array.isArray(value)) {
                return false;
            }
            return true;
        case "fixedPeriod": {
            const period = value.period;
            if (!filter.disabledPeriods || !filter.disabledPeriods.length) {
                return true;
            }
            if (filter.disabledPeriods.includes("month")) {
                return value !== "this_month" && !monthsOptionsIds.includes(period);
            }
            if (filter.disabledPeriods.includes("quarter")) {
                return value !== "this_quarter" && !quarterOptionsIds.includes(period);
            }
            return true;
        }
        case "relative": {
            const expectedValues = RELATIVE_DATE_RANGE_TYPES.map((val) => val.type);
            expectedValues.push("", "this_month", "this_quarter", "this_year"); //TODOPRO Do we really need empty value ?
            return expectedValues.includes(value);
        }
        case "from_to":
            return typeof value === "object";
    }
}

/**
 *
 * @param {Record<string, FieldMatching>} fieldMatchings
 */
export function checkFilterFieldMatching(fieldMatchings) {
    for (const fieldMatch of Object.values(fieldMatchings)) {
        if (fieldMatch.offset && (!fieldMatch.chain || !fieldMatch.type)) {
            return CommandResult.InvalidFieldMatch;
        }
    }

    return CommandResult.Success;
}

/**
 * Get a date domain relative to the current date.
 * The domain will span the amount of time specified in rangeType and end the day before the current day.
 *
 *
 * @param {Object} now current time, as luxon time
 * @param {number} offset offset to add to the date
 * @param {import("@spreadsheet").RelativePeriod} rangeType
 * @param {string} fieldName
 * @param {"date" | "datetime"} fieldType
 *
 * @returns {Domain|undefined}
 */
export function getRelativeDateDomain(now, offset, rangeType, fieldName, fieldType) {
    const startOfNextDay = now.plus({ days: 1 }).startOf("day");
    let endDate = now.endOf("day");
    let startDate = endDate;
    switch (rangeType) {
        case "year_to_date": {
            const offsetParam = { years: offset };
            startDate = now.startOf("year").plus(offsetParam);
            endDate = now.endOf("day").plus(offsetParam);
            break;
        }
        case "last_week": {
            const offsetParam = { days: 7 * offset };
            endDate = endDate.plus(offsetParam);
            startDate = startOfNextDay.minus({ days: 7 }).plus(offsetParam);
            break;
        }
        case "last_month": {
            const offsetParam = { days: 30 * offset };
            endDate = endDate.plus(offsetParam);
            startDate = startOfNextDay.minus({ days: 30 }).plus(offsetParam);
            break;
        }
        case "last_three_months": {
            const offsetParam = { days: 90 * offset };
            endDate = endDate.plus(offsetParam);
            startDate = startOfNextDay.minus({ days: 90 }).plus(offsetParam);
            break;
        }
        case "last_six_months": {
            const offsetParam = { days: 180 * offset };
            endDate = endDate.plus(offsetParam);
            startDate = startOfNextDay.minus({ days: 180 }).plus(offsetParam);
            break;
        }
        case "last_year": {
            const offsetParam = { days: 365 * offset };
            endDate = endDate.plus(offsetParam);
            startDate = startOfNextDay.minus({ days: 365 }).plus(offsetParam);
            break;
        }
        case "last_three_years": {
            const offsetParam = { days: 3 * 365 * offset };
            endDate = endDate.plus(offsetParam);
            startDate = startOfNextDay.minus({ days: 3 * 365 }).plus(offsetParam);
            break;
        }
        default:
            return undefined;
    }

    let leftBound, rightBound;
    if (fieldType === "date") {
        leftBound = serializeDate(startDate);
        rightBound = serializeDate(endDate);
    } else {
        leftBound = serializeDateTime(startDate);
        rightBound = serializeDateTime(endDate);
    }

    return new Domain(["&", [fieldName, ">=", leftBound], [fieldName, "<=", rightBound]]);
}

export function isDateOperator(operator) {
    return ["from_to", "relative", "fixedPeriod"].includes(operator);
}
