import { Component, useRef, useState } from "@odoo/owl";
import { scanBarcode } from "@web/core/barcode/barcode_dialog";
import { isBarcodeScannerSupported } from "@web/core/barcode/barcode_video_scanner";
import { isMobileOS } from "@web/core/browser/feature_detection";
import { makeContext } from "@web/core/context";
import { _t } from "@web/core/l10n/translation";
import { evaluateBooleanExpr } from "@web/core/py_js/py";
import { useService } from "@web/core/utils/hooks";
import { getFieldDomain } from "@web/model/relational_model/utils";
import { Many2XAutocomplete, useOpenMany2XRecord } from "./relational_utils";
import { usePopover } from "@web/core/popover/popover_hook";

///////////////////////////////////////////////////////////////////////////////
// UTILS
///////////////////////////////////////////////////////////////////////////////

export function extractMany2OneProps(staticInfo, dynamicInfo) {
    const { attrs, context, decorations, options, string } = staticInfo;

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
}

function m2oTupleFromData(data) {
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

///////////////////////////////////////////////////////////////////////////////
// HOOKS
///////////////////////////////////////////////////////////////////////////////

export function useMany2OneController(getProps) {
    const domain = (p) => getFieldDomain(p.record, p.name, p.domain);

    const linkCssClass = (p) => {
        const evalContext = p.record.evalContextWithVirtualIds;
        for (const decorationName in p.decorations) {
            if (evaluateBooleanExpr(p.decorations[decorationName], evalContext)) {
                return `text-${decorationName}`;
            }
        }
        return "";
    };

    const openActionContext = (p) => {
        const { context, name, openActionContext, record } = p;
        return makeContext(
            [openActionContext || context, record.fields[name].context],
            record.evalContext
        );
    };

    const definition = (p) => p.record.fields[p.name];

    const string = (p) => p.string || definition(p).string || "";

    const relation = (p) => definition(p).relation;

    const value = (p) => p.record.data[p.name];

    const update = (p, value) => p.record.update({ [p.name]: value });

    return {
        computeProps() {
            const p = getProps();
            return {
                canCreate: p.canCreate,
                canCreateEdit: p.canCreateEdit,
                canOpen: p.canOpen,
                canQuickCreate: p.canQuickCreate,
                canScanBarcode: p.canScanBarcode,
                canWrite: p.canWrite,
                context: p.context,
                domain: () => domain(p),
                linkCssClass: linkCssClass(p),
                nameCreateField: p.nameCreateField,
                openActionContext: () => openActionContext(p),
                placeholder: p.placeholder,
                readonly: p.readonly,
                relation: relation(p),
                string: string(p),
                update: (value) => update(p, value),
                value: value(p),
            };
        },
        get definition() {
            return definition(getProps());
        },
        get relation() {
            return relation(getProps());
        },
        get value() {
            return value(getProps());
        },
        update(value) {
            return update(getProps(), value);
        },
    };
}

///////////////////////////////////////////////////////////////////////////////
// Components
///////////////////////////////////////////////////////////////////////////////

export class Many2One extends Component {
    static template = `web.${this.name}`;
    static components = { AutoComplete: Many2XAutocomplete };
    static props = {
        canCreate: { type: Boolean, optional: true },
        canCreateEdit: { type: Boolean, optional: true },
        canOpen: { type: Boolean, optional: true },
        canQuickCreate: { type: Boolean, optional: true },
        canScanBarcode: { type: Boolean, optional: true },
        canWrite: { type: Boolean, optional: true },
        context: { type: Object, optional: true },
        domain: { type: Function, optional: true },
        dropdown: { type: Boolean, optional: true },
        id: { type: String, optional: true },
        linkCssClass: { type: String, optional: true },
        nameCreateField: { type: String, optional: true },
        openActionContext: { type: Function, optional: true },
        placeholder: { type: String, optional: true },
        readonly: { type: Boolean, optional: true },
        relation: { type: String },
        slots: { type: Object, optional: true },
        string: { type: String, optional: true },
        update: { type: Function },
        value: { type: [Array, { value: false }] },
    };
    static defaultProps = {
        canCreate: true,
        canCreateEdit: true,
        canOpen: true,
        canQuickCreate: true,
        canScanBarcode: false,
        canWrite: true,
        context: {},
        domain: [],
        dropdown: true,
        linkCssClass: "",
        nameCreateField: "name",
        placeholder: "",
        readonly: false,
        string: "",
    };

    setup() {
        this.rootRef = useRef("root");

        this.action = useService("action");
        this.notification = useService("notification");
        this.orm = useService("orm");

        this.state = useState({ isFloating: false });

        this.recordDialog = {
            open: useOpenMany2XRecord({
                activeActions: this.activeActions,
                fieldString: this.props.string,
                isToMany: false,
                onClose: () => {
                    this.input.focus();
                },
                onRecordSaved: async () => {
                    const resId = this.value?.id;
                    const fieldNames = ["display_name"];
                    // use unity read + relatedFields from Field Component
                    const records = await this.orm.read(this.props.relation, [resId], fieldNames, {
                        context: this.props.context,
                    });
                    await this.update(records[0] ? m2oTupleFromData(records[0]) : false);
                },
                onRecordDiscarded: () => {},
                resModel: this.props.relation,
            }),
        };
    }

    get activeActions() {
        return {
            create: this.props.canCreate,
            createEdit: this.props.canCreateEdit,
            write: this.props.canWrite,
        };
    }

    get autoCompleteProps() {
        return {
            activeActions: this.activeActions,
            autoSelect: true,
            context: this.props.context,
            dropdown: this.props.dropdown,
            id: this.props.id,
            fieldString: this.props.string,
            getDomain: this.props.domain,
            nameCreateField: this.props.nameCreateField,
            placeholder: this.props.placeholder,
            quickCreate: this.props.canQuickCreate ? (name) => this.quickCreate(name) : null,
            setInputFloats: (isFloating) => {
                this.state.isFloating = isFloating;
            },
            resModel: this.props.relation,
            update: (records) => {
                const idNamePair = records[0] ? m2oTupleFromData(records[0]) : false;
                return this.update(idNamePair);
            },
            value: this.displayName,
        };
    }

    get displayName() {
        const value = this.value;
        if (value) {
            if (value.display_name) {
                return value.display_name.split("\n")[0];
            } else {
                return _t("Unnamed");
            }
        } else {
            return "";
        }
    }

    get extraLines() {
        const name = this.value?.display_name;
        return name
            ? name
                  .split("\n")
                  .map((line) => line.trim())
                  .slice(1)
            : [];
    }

    get hasBarcodeButton() {
        const supported = isBarcodeScannerSupported();
        return this.props.canScanBarcode && isMobileOS() && supported && !this.hasLinkButton;
    }

    get hasLinkButton() {
        return this.props.canOpen && !!this.value && !this.state.isFloating;
    }

    get input() {
        return this.rootRef.el?.querySelector("input");
    }

    get linkHref() {
        if (!this.value) {
            return "/";
        }
        const relation = this.props.relation.includes(".")
            ? this.props.relation
            : `m-${this.props.relation}`;
        return `/odoo/${relation}/${this.value.id}`;
    }

    get value() {
        const value = this.props.value;
        return value ? { id: value[0], display_name: value[1] } : null;
    }

    async openBarcodeScanner() {
        const barcode = await scanBarcode(this.env);
        if (barcode) {
            await this.processScannedBarcode(barcode);
        } else {
            /** @type {any} */
            const message = _t("Please, scan again!");
            this.notification.add(message, { type: "warning" });
        }
    }

    openRecord(inNewWindow = false) {
        if (this.env.inDialog && !inNewWindow) {
            return this.openRecordInDialog();
        } else {
            return this.openRecordInAction(inNewWindow);
        }
    }

    async openRecordInAction(newWindow) {
        const action = await this.orm.call(
            this.props.relation,
            "get_formview_action",
            [[this.value?.id]],
            { context: this.props.openActionContext() }
        );
        await this.action.doAction(action, { newWindow });
    }

    async openRecordInDialog() {
        return this.recordDialog.open({
            resId: this.value?.id,
            context: this.props.context,
        });
    }

    async processScannedBarcode(barcode) {
        const pairs = await this.orm.call(this.props.relation, "name_search", [], {
            name: barcode,
            args: this.props.domain(),
            operator: "ilike",
            limit: 2, // If one result we set directly and if more than one we use normal flow so no need to search more
            context: this.props.context,
        });
        const validPairs = pairs.filter(([id]) => !!id);
        if (validPairs.length === 1) {
            return this.update(validPairs[0]);
        } else {
            const input = this.input;
            input.value = barcode;
            input.dispatchEvent(new Event("input"));
            if (this.env.isSmall) {
                input.dispatchEvent(new Event("barcode-search"));
            }
        }
    }

    quickCreate(name) {
        return this.update([false, name]);
    }

    update(idNamePair) {
        this.state.isFloating = false;
        return this.props.update(idNamePair);
    }
}

class KanbanMany2OneAssignPopover extends Component {
    static template = `web.${this.name}`;
    static components = { Many2One };
    static props = ["*"];
    static defaultProps = {};

    get many2oneProps() {
        return {
            ...this.props,
            canCreate: false,
            canCreateEdit: false,
            canQuickCreate: false,
            dropdown: false,
            placeholder: this.placeholder,
            readonly: false,
        };
    }

    get placeholder() {
        return _t("Search user...");
    }

    get relation() {
        return this.props.record.fields[this.props.name].relation;
    }
}

export class KanbanMany2One extends Component {
    static template = `web.${this.name}`;
    static components = {};
    static props = ["*"];
    static defaultProps = {};

    setup() {
        this.assignPopover = usePopover(KanbanMany2OneAssignPopover, {
            popoverClass: "o_m2o_tags_avatar_field_popover",
        });
    }

    get relation() {
        return this.props.record.fields[this.props.name].relation;
    }

    openAssignPopover(target) {
        this.assignPopover.open(target, this.props);
    }
}
