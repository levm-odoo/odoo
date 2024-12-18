// @ts-check

import { globalFiltersFieldMatchers } from "@spreadsheet/global_filters/plugins/global_filters_core_plugin";
import { navigateTo } from "../actions/helpers";
import { helpers } from "@odoo/o-spreadsheet";
const { getNumberOfPivotFunctions } = helpers;
const uuidGenerator = new helpers.UuidGenerator();

function getUniqueLabel(label, condition) {
    let newLabel = label;
    let counter = 1;
    while (condition(newLabel)) {
        newLabel = `${label} (${counter})`;
        counter++;
    }
    return newLabel;
}

function getLabel(model, field, env, type) {
    let label = `${model} / ${field}`;
    if (getType(type) === "relation") {
        label = field;
    }
    return getUniqueLabel(label, (label) => env.model.getters.getGlobalFilterLabel(label));
}

function getType(type) {
    switch (type) {
        case "integer": //ID
        case "many2one":
        case "many2many":
        case "one2many":
            return "relation";
        case "datetime":
        case "date":
            return "date";
        default:
            return "text";
    }
}

/**
 * @param {import("@odoo/o-spreadsheet").CellPosition} position
 * @param {import("@spreadsheet").SpreadsheetChildEnv} env
 * @returns {Promise<void>}
 */
export const SEE_RECORDS_PIVOT = async (position, env) => {
    const pivotId = env.model.getters.getPivotIdFromPosition(position);
    const pivot = env.model.getters.getPivot(pivotId);
    await pivot.load();
    const { model } = pivot.definition;
    const { actionXmlId, context } = env.model.getters.getPivotCoreDefinition(pivotId);
    const pivotCell = env.model.getters.getPivotCellFromPosition(position);
    const domain = pivot.getPivotCellDomain(pivotCell.domain);
    const name = await pivot.getModelLabel();
    await navigateTo(
        env,
        actionXmlId,
        {
            type: "ir.actions.act_window",
            name,
            res_model: model,
            views: [
                [false, "list"],
                [false, "form"],
            ],
            target: "current",
            domain,
            context,
        },
        { viewType: "list" }
    );
};

/**
 * @param {import("@odoo/o-spreadsheet").CellPosition} position
 * @param {import("@spreadsheet").OdooGetters} getters
 * @returns {boolean}
 */
export const SEE_RECORDS_PIVOT_VISIBLE = (position, getters) => {
    const cell = getters.getCorrespondingFormulaCell(position);
    const evaluatedCell = getters.getEvaluatedCell(position);
    const pivotId = getters.getPivotIdFromPosition(position);
    const pivotCell = getters.getPivotCellFromPosition(position);
    return !!(
        pivotId &&
        evaluatedCell.type !== "empty" &&
        evaluatedCell.type !== "error" &&
        evaluatedCell.value !== "" &&
        pivotCell.type !== "EMPTY" &&
        cell &&
        cell.isFormula &&
        getNumberOfPivotFunctions(cell.compiledFormula.tokens) === 1 &&
        getters.getPivotCoreDefinition(pivotId).type === "ODOO" &&
        getters.getPivot(pivotId).getPivotCellDomain(pivotCell.domain)
    );
};

/**
 * Check if the cell is a pivot formula and if there is a filter matching the
 * pivot domain args.
 * e.g. =PIVOT.VALUE("1", "measure", "country_id", 1) matches a filter on
 * country_id.
 *
 * @returns {boolean}
 */
export function SET_FILTER_MATCHING_CONDITION(position, getters) {
    if (!SEE_RECORDS_PIVOT_VISIBLE(position, getters)) {
        return false;
    }

    const pivotId = getters.getPivotIdFromPosition(position);
    const pivotCell = getters.getPivotCellFromPosition(position);
    if (pivotCell.type === "EMPTY") {
        return false;
    }
    const matchingFilters = getters.getFiltersMatchingPivotArgs(pivotId, pivotCell.domain);
    return matchingFilters.length > 0 && pivotCell.type === "HEADER";
}

export function SET_FILTER_MATCHING(position, env) {
    const pivotId = env.model.getters.getPivotIdFromPosition(position);
    const domain = env.model.getters.getPivotCellFromPosition(position).domain;
    const filters = env.model.getters.getFiltersMatchingPivotArgs(pivotId, domain);
    env.model.dispatch("SET_MANY_GLOBAL_FILTER_VALUE", { filters });
}

export function ADD_PIVOT_FILTER(position, env) {
    const pivotId = env.model.getters.getPivotIdFromPosition(position);
    const domain = env.model.getters.getPivotCellFromPosition(position).domain;
    debugger;
}

export function ADD_PIVOT_FILTER_CHILDREN(env) {
    const position = env.model.getters.getActivePosition();
    const pivotId = env.model.getters.getPivotIdFromPosition(position);
    const domain = env.model.getters.getPivotCellFromPosition(position).domain;
    const pivot = env.model.getters.getPivot(pivotId);
    return domain.map((node, index) => ({
        id: `add_pivot_filter_${node.field}`,
        name: pivot.getFields()[node.field].string,
        sequence: index,
        execute: async (env) => {
            const field = node.field;
            const model = pivot.coreDefinition.model;
            const type = getType(pivot.getFields()[field].type);
            const modelName = type === "relation" ? pivot.getFields()[field].relation : undefined;
            const id = uuidGenerator.uuidv4();
            const additionalPayload = {};
            for (const [type, el] of Object.entries(globalFiltersFieldMatchers)) {
                additionalPayload[type] = {};
                for (const objectId of el.getIds()) {
                    if (el.getModel(objectId) !== model) {
                        continue;
                    }
                    additionalPayload[type][objectId] = {
                        chain: field,
                        type: pivot.getFields()[field].type,
                    };
                }
            }
            env.model.dispatch("ADD_GLOBAL_FILTER", {
                filter: {
                    id,
                    label: getLabel(model, pivot.getFields()[field].string, env, pivot.getFields()[field].type),
                    type,
                    modelName,
                    irModel: model,
                    irField: field,
                },
                ...additionalPayload,
            });
            switch (type) {
                case "text":
                    env.openSidePanel("TEXT_FILTER_SIDE_PANEL", { id });
                    break;
                case "date":
                    env.openSidePanel("DATE_FILTER_SIDE_PANEL", { id });
                    break;
                case "relation":
                    env.openSidePanel("RELATION_FILTER_SIDE_PANEL", { id });
                    break;
            }
        },
        isVisible: (env) => env.model.getters.getPivot(pivotId).isValid(),
    }));
}
