/** @odoo-module */
// @ts-check

import { Domain } from "@web/core/domain";
import { OdooCorePlugin } from "@spreadsheet/plugins";

export class PivotOdooCorePlugin extends OdooCorePlugin {
    handle(cmd) {
        switch (cmd.type) {
            // this command is deprecated. use UPDATE_PIVOT instead
            case "UPDATE_ODOO_PIVOT_DOMAIN":
                this.dispatch("UPDATE_PIVOT", {
                    pivotId: cmd.pivotId,
                    pivot: {
                        ...this.getters.getPivotCoreDefinition(cmd.pivotId),
                        domain: cmd.domain,
                    },
                });
                break;
        }
    }

    import(data) {
        if (data.pivots) {
            for (const id in data.pivots) {
                // Ensure that the sorted column is a measure
                // and if not, drop it.
                // This situation can happen because of a bug in a previous version
                const definition = data.pivots[id];
                const measures = definition.measures.map((field) => field.fieldName);
                if (
                    definition.sortedColumn &&
                    !measures.includes(definition.sortedColumn.measure)
                ) {
                    definition.sortedColumn = undefined;
                }
            }
        }
    }

    /**
     * Transform the domain of a pivot definition to a more readable format
     *
     * @param {Object} data
     */
    export(data) {
        if (data.pivots) {
            for (const id in data.pivots) {
                if (data.pivots[id].type === "ODOO") {
                    data.pivots[id].domain = new Domain(data.pivots[id].domain).toJson();
                }
            }
        }
    }
}
