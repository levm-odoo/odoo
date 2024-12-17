import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { evaluateBooleanExpr } from "@web/core/py_js/py";
import { registry } from "@web/core/registry";
import { Many2One, useMany2OneController } from "../many2one";

export function m2oTupleFromData(data) {
    const id = data.id;
    let name;
    if ("display_name" in data) {
        name = data.display_name;
    } else {
        const _name = data.name;
        name = Array.isArray(_name) ? _name[1] : _name;
    }
    return [id, name];
}

export class Many2OneField extends Component {
    static template = `web.${this.name}`;
    static components = { Many2One };
    static props = ["*"];

    setup() {
        this.controller = useMany2OneController(() => this.props);
    }

    get many2oneProps() {
        return this.controller.computeProps();
    }
}

export const many2OneField = {};

registry.category("fields").add("many2one", {
    component: Many2OneField,
    displayName: _t("Many2One"),
    extractProps({ attrs, context, decorations, options, string }, dynamicInfo) {
        const hasCreatePermission = attrs.can_create ? evaluateBooleanExpr(attrs.can_create) : true;
        const hasWritePermission = attrs.can_write ? evaluateBooleanExpr(attrs.can_write) : true;
        const canCreate = options.no_create ? false : hasCreatePermission;
        return {
            canCreate,
            canCreateEdit: canCreate && !options.no_create_edit,
            canOpen: !options.no_open,
            canQuickCreate: canCreate && !options.no_quick_create,
            canScanBarcode: !!options.can_scan_barcode,
            canWrite: hasWritePermission,
            context: dynamicInfo.context,
            decorations,
            domain: dynamicInfo.domain,
            nameCreateField: options.create_name_field,
            openActionContext: context || "{}",
            placeholder: attrs.placeholder,
            string,
        };
    },
    supportedOptions: [
        {
            label: _t("Disable opening"),
            name: "no_open",
            type: "boolean",
        },
        {
            label: _t("Disable creation"),
            name: "no_create",
            type: "boolean",
            help: _t(
                "If checked, users won't be able to create records through the autocomplete dropdown at all."
            ),
        },
        {
            label: _t("Disable 'Create' option"),
            name: "no_quick_create",
            type: "boolean",
            help: _t(
                "If checked, users will not be able to create records based on the text input; they will still be able to create records via a popup form."
            ),
        },
        {
            label: _t("Disable 'Create and Edit' option"),
            name: "no_create_edit",
            type: "boolean",
            help: _t(
                "If checked, users will not be able to create records based through a popup form; they will still be able to create records based on the text input."
            ),
        },
    ],
    supportedTypes: ["many2one"],
});
