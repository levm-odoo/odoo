import { Component, onWillRender } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

class DynamicSelectionField extends Component {
    static template = "base_automation.DynamicSelection";
    static props = {
        ...standardFieldProps,
        placeholder: { type: String, optional: true },
        selectionField: {  type: String }
    }

    get value() {
        return this.props.record.data[this.props.name] || "";
    }

    setup() {
        onWillRender(() => {
            const selFieldValue = JSON.parse(this.props.record.data[this.props.selectionField] || "[]");
            const selectionItems = Object.fromEntries(selFieldValue.map((tuple) => [tuple[0], tuple[1]]));
            const current = {
                "": ""
            };
            const value = this.value;
            if (value && !(value in selectionItems)) {
                current[value] = value;
            }
            this.selectionItems = {...current, ...selectionItems};
        });
    }

    onSelect(ev) {
        this.props.record.update({[this.props.name]: ev.target.value})
    }
}

registry.category("fields").add("dynamic_selection", {
    component: DynamicSelectionField,
    displayName: _t("Dynamic Selection"),
    supportedTypes: ["char"],
    isEmpty: (record, fieldName) => !record.data[fieldName],
    extractProps({ attrs, options }, dynamicInfo) {
        return {
            placeholder: attrs.placeholder,
            selectionField: options.selection_field,
        };
    }
})
