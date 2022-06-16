/** @odoo-module */

import { stringToOrderBy, XMLParser } from "@web/core/utils/xml";
import { Field } from "@web/fields/field";
import {
    archParseBoolean,
    getActiveActions,
    getDecoration,
    processButton,
} from "@web/views/helpers/utils";
import { Widget } from "../widgets/widget";

export class GroupListArchParser extends XMLParser {
    parse(arch, models, modelName, jsClass) {
        const fieldNodes = {};
        const buttons = [];
        let buttonId = 0;
        this.visitXML(arch, (node) => {
            if (node.tagName === "button") {
                buttons.push({
                    ...processButton(node),
                    id: buttonId++,
                });
            } else if (node.tagName === "field") {
                const fieldInfo = Field.parseFieldNode(node, models, modelName, "list", jsClass);
                fieldNodes[fieldInfo.name] = fieldInfo;
                node.setAttribute("field_id", fieldInfo.name);
            }
        });
        return { fieldNodes, buttons };
    }
}

export class ListArchParser extends XMLParser {
    parse(arch, models, modelName) {
        const xmlDoc = this.parseXML(arch);
        const fieldNodes = {};
        const columns = [];
        const fields = models[modelName];
        let buttonId = 0;
        const groupBy = {
            buttons: {},
            fields: {},
        };
        let headerButtons = [];
        const creates = [];
        const groupListArchParser = new GroupListArchParser();
        let buttonGroup;
        let handleField = null;
        let defaultOrder = stringToOrderBy(xmlDoc.getAttribute("default_order") || null);
        const treeAttr = {};
        let nextId = 0;
        const activeFields = {};
        this.visitXML(arch, (node) => {
            if (node.tagName !== "button") {
                buttonGroup = undefined;
            }
            if (node.tagName === "button") {
                const button = {
                    ...processButton(node),
                    defaultRank: "btn-link",
                    type: "button",
                    id: buttonId++,
                };
                if (buttonGroup) {
                    buttonGroup.buttons.push(button);
                } else {
                    buttonGroup = {
                        id: `column_${nextId++}`,
                        type: "button_group",
                        buttons: [button],
                        hasLabel: false,
                    };
                    columns.push(buttonGroup);
                }
            } else if (node.tagName === "field") {
                const fieldInfo = Field.parseFieldNode(node, models, modelName, "list");
                const invisible = node.getAttribute("invisible");
                fieldNodes[fieldInfo.name] = fieldInfo;
                node.setAttribute("field_id", fieldInfo.name);
                if (fieldInfo.widget === "handle") {
                    handleField = fieldInfo.name;
                }
                if (!invisible || !archParseBoolean(invisible)) {
                    const displayName = fieldInfo.FieldComponent.displayName;
                    columns.push({
                        ...fieldInfo,
                        id: `column_${nextId++}`,
                        className: node.getAttribute("class"), // for oe_edit_only and oe_read_only
                        optional: node.getAttribute("optional") || false,
                        type: "field",
                        hasLabel: !(fieldInfo.attrs.nolabel || fieldInfo.FieldComponent.noLabel),
                        label:
                            (fieldInfo.widget && displayName && displayName.toString()) ||
                            fieldInfo.string,
                    });
                }
            } else if (node.tagName === "widget") {
                const widgetInfo = Widget.parseWidgetNode(node);
                for (const [name, field] of Object.entries(widgetInfo.fieldDependencies)) {
                    activeFields[name] = {
                        name,
                        type: field.type,
                    };
                }
            } else if (node.tagName === "groupby" && node.getAttribute("name")) {
                const fieldName = node.getAttribute("name");
                const xmlSerializer = new XMLSerializer();
                const groupByArch = xmlSerializer.serializeToString(node);
                const coModelName = fields[fieldName].relation;
                const groupByArchInfo = groupListArchParser.parse(groupByArch, models, coModelName);
                groupBy.buttons[fieldName] = groupByArchInfo.buttons;
                groupBy.fields[fieldName] = {
                    activeFields: groupByArchInfo.fieldNodes,
                    fieldNodes: groupByArchInfo.fieldNodes,
                    fields: models[coModelName],
                };
                return false;
            } else if (node.tagName === "header") {
                // AAB: not sure we need to handle invisible="1" button as the usecase seems way
                // less relevant than for fields (so for buttons, relying on the modifiers logic
                // that applies later on could be enough, even if the value is always true)
                headerButtons = [...node.children]
                    .map((node) => ({
                        ...processButton(node),
                        type: "button",
                        id: buttonId++,
                    }))
                    .filter((button) => button.modifiers.invisible !== true);
                return false;
            } else if (node.tagName === "create") {
                creates.push({
                    context: node.getAttribute("context"),
                    description: node.getAttribute("string"),
                });
            } else if (["tree", "list"].includes(node.tagName)) {
                const activeActions = {
                    ...getActiveActions(xmlDoc),
                    exportXlsx: archParseBoolean(xmlDoc.getAttribute("export_xlsx"), true),
                };
                treeAttr.activeActions = activeActions;

                treeAttr.editable = activeActions.edit ? xmlDoc.getAttribute("editable") : false;
                treeAttr.multiEdit = activeActions.edit
                    ? archParseBoolean(node.getAttribute("multi_edit") || "")
                    : false;

                const limitAttr = node.getAttribute("limit");
                treeAttr.limit = limitAttr && parseInt(limitAttr, 10);

                const groupsLimitAttr = node.getAttribute("groups_limit");
                treeAttr.groupsLimit = groupsLimitAttr && parseInt(groupsLimitAttr, 10);

                treeAttr.noOpen = archParseBoolean(node.getAttribute("no_open") || "");
                treeAttr.expand = archParseBoolean(xmlDoc.getAttribute("expand") || "");
                treeAttr.decorations = getDecoration(xmlDoc);
            }
        });

        if (!defaultOrder.length && handleField) {
            defaultOrder = stringToOrderBy(handleField);
        }

        for (const [key, field] of Object.entries(fieldNodes)) {
            activeFields[key] = field; // TODO process
        }

        return {
            creates,
            handleField,
            headerButtons,
            fieldNodes,
            activeFields,
            columns,
            groupBy,
            defaultOrder,
            __rawArch: arch,
            ...treeAttr,
        };
    }
}
