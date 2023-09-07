/** @odoo-module **/

import { useService } from "@web/core/utils/hooks";
import { pick } from "@web/core/utils/objects";
import { RelationalModel } from "@web/model/relational_model/relational_model";
import { getFieldsSpec, makeField, makeActiveField } from "@web/model/relational_model/utils";
import { Component, xml, onWillStart, onWillUpdateProps, useState } from "@odoo/owl";
import { getFieldFromRegistry } from "./fields/field";

class StandaloneRelationalModel extends RelationalModel {
    load(params = {}) {
        if (params.values) {
            const data = params.values;
            if (params.mode) {
                this.config.mode = params.mode;
            }
            this.root = this._createRoot(this.config, data);
            return;
        }
        return super.load(params);
    }
}

export function createRecordFields(data) {
    const fields = {};
    const activeFields = {};
    for (const [fieldName, field] of Object.entries(data)) {
        fields[fieldName] = makeField(fieldName, field.type, {
            relation: field.relation,
            string: field.string,
            searchable: field.searchable,
            domain: field.domain,
        });
        activeFields[fieldName] = makeActiveField(fieldName);
        if (field.relation) {
            const widget = getFieldFromRegistry(field.type, field.widget, "form");
            if (widget.relatedFields) {
                const relatedFields = Object.fromEntries(
                    widget
                        .relatedFields({ options: field.widgetOptions || {} })
                        .map((f) => [f.name, f])
                );
                activeFields[fieldName].related = {
                    fields: relatedFields,
                    activeFields: relatedFields,
                };
            }
        }
    }
    return { fields, activeFields };
}

class _Record extends Component {
    setup() {
        this.orm = useService("orm");
        const resModel = this.props.info.resModel;
        const modelParams = {
            config: {
                resModel,
                fields: this.props.fields,
                isMonoRecord: true,
                activeFields: this.props.info.activeFields,
                resId: this.props.info.resId,
                mode: this.props.info.mode,
            },
            hooks: {
                onRecordSaved: this.props.info.onRecordSaved || (() => {}),
                onWillSaveRecord: this.props.info.onWillSaveRecord || (() => {}),
                onRecordChanged: this.props.info.onRecordChanged || (() => {}),
            },
        };
        const modelServices = Object.fromEntries(
            StandaloneRelationalModel.services.map((servName) => {
                return [servName, useService(servName)];
            })
        );
        modelServices.orm = this.orm;
        this.model = useState(new StandaloneRelationalModel(this.env, modelParams, modelServices));

        const loadWithValues = async (values) => {
            values = pick(values, ...Object.keys(modelParams.config.activeFields));
            const proms = [];
            for (const fieldName in values) {
                if (["one2many", "many2many"].includes(this.props.fields[fieldName].type)) {
                    if (values[fieldName].length && typeof values[fieldName][0] === "number") {
                        const resModel = this.props.fields[fieldName].relation;
                        const resIds = values[fieldName];
                        const activeField = modelParams.config.activeFields[fieldName];
                        if (activeField.related) {
                            const { activeFields, fields } = activeField.related;
                            const fieldSpec = getFieldsSpec(activeFields, fields, {});
                            const kwargs = {
                                context: activeField.context || {},
                                specification: fieldSpec,
                            };
                            proms.push(
                                this.orm.webRead(resModel, resIds, kwargs).then((records) => {
                                    values[fieldName] = records;
                                })
                            );
                        }
                    }
                }
                if (this.props.fields[fieldName].type === "many2one") {
                    const loadDisplayName = async (resId) => {
                        const resModel = this.props.fields[fieldName].relation;
                        const activeField = modelParams.config.activeFields[fieldName];
                        const kwargs = {
                            context: activeField.context || {},
                            specification: { display_name: {} },
                        };
                        const records = await this.orm.webRead(resModel, [resId], kwargs);
                        return records[0].display_name;
                    };
                    if (typeof values[fieldName] === "number") {
                        const prom = loadDisplayName(values[fieldName]);
                        prom.then((displayName) => {
                            values[fieldName] = {
                                id: values[fieldName],
                                display_name: displayName,
                            };
                        });
                        proms.push(prom);
                    } else if (Array.isArray(values[fieldName])) {
                        if (values[fieldName][1] === undefined) {
                            const prom = loadDisplayName(values[fieldName][0]);
                            prom.then((displayName) => {
                                values[fieldName] = {
                                    id: values[fieldName][0],
                                    display_name: displayName,
                                };
                            });
                            proms.push(prom);
                        }
                        values[fieldName] = {
                            id: values[fieldName][0],
                            display_name: values[fieldName][1],
                        };
                    }
                }
                await Promise.all(proms);
            }
            return this.model.load({ values });
        };
        onWillStart(() => {
            if (this.props.values) {
                return loadWithValues(this.props.values);
            } else {
                return this.model.load();
            }
        });
        onWillUpdateProps((nextProps) => {
            if (nextProps.values) {
                return loadWithValues(nextProps.values);
            } else if (nextProps.info.resId !== this.model.root.resId) {
                return this.model.load({ resId: nextProps.info.resId });
            }
        });
    }
}
_Record.template = xml`<t t-slot="default" record="model.root"/>`;
_Record.props = ["slots", "info", "fields", "values?"];

export class Record extends Component {
    setup() {
        if (this.props.fields) {
            this.fields = this.props.fields;
        } else {
            throw new Error("Not supported anymore");
        }
    }
}
Record.template = xml`<_Record fields="fields" slots="props.slots" values="props.values" info="props" />`;
Record.components = { _Record };
Record.props = [
    "slots",
    "resModel?",
    "activeFields?",
    "fields?",
    "resId?",
    "mode?",
    "values?",
    "onRecordChanged?",
    "onRecordSaved?",
    "onWillSaveRecord?",
];
