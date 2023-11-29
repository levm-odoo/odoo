/** @odoo-module **/

import { visitXML } from "@web/core/utils/xml";
import { archParseBoolean } from "@web/views/utils";
import { makeSortedColumn } from "./pivot_utils";

export class PivotArchParser {
    parse(arch) {
        const archInfo = {
            activeMeasures: [], // store the defined active measures
            colGroupBys: [], // store the defined group_by used on cols
            sortedColumn: null,
            fieldAttrs: {},
            rowGroupBys: [], // store the defined group_by used on rows
            widgets: {}, // wigdets defined in the arch
        };

        visitXML(arch, (node) => {
            switch (node.tagName) {
                case "pivot": {
                    if (node.hasAttribute("disable_linking")) {
                        archInfo.disableLinking = archParseBoolean(
                            node.getAttribute("disable_linking")
                        );
                    }
                    if (node.hasAttribute("default_order")) {
                        const defaultOrder = node.getAttribute("default_order").split(" ");
                        archInfo.sortedColumn = makeSortedColumn({
                            measure: defaultOrder[0],
                            order: defaultOrder[1] ? defaultOrder[1] : "asc",
                        });
                    }
                    if (node.hasAttribute("string")) {
                        archInfo.title = node.getAttribute("string");
                    }
                    if (node.hasAttribute("display_quantity")) {
                        archInfo.displayQuantity = archParseBoolean(
                            node.getAttribute("display_quantity")
                        );
                    }
                    break;
                }
                case "field": {
                    let fieldName = node.getAttribute("name"); // exists (rng validation)

                    archInfo.fieldAttrs[fieldName] = {};
                    if (node.hasAttribute("string")) {
                        archInfo.fieldAttrs[fieldName].string = node.getAttribute("string");
                    }
                    if (
                        node.getAttribute("invisible") === "True" ||
                        node.getAttribute("invisible") === "1"
                    ) {
                        archInfo.fieldAttrs[fieldName].isInvisible = true;
                        break;
                    }

                    if (node.hasAttribute("interval")) {
                        fieldName += ":" + node.getAttribute("interval");
                    }
                    if (node.hasAttribute("widget")) {
                        archInfo.widgets[fieldName] = node.getAttribute("widget");
                    }
                    if (node.getAttribute("type") === "measure" || node.hasAttribute("operator")) {
                        archInfo.activeMeasures.push(fieldName);
                    }
                    if (node.getAttribute("type") === "col") {
                        archInfo.colGroupBys.push(fieldName);
                    }
                    if (node.getAttribute("type") === "row") {
                        archInfo.rowGroupBys.push(fieldName);
                    }
                    break;
                }
            }
        });

        return archInfo;
    }
}
