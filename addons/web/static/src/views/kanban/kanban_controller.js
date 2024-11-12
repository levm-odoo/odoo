import {
    deleteConfirmationMessage,
    ConfirmationDialog,
} from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { omit } from "@web/core/utils/objects";
import { CogMenu } from "@web/search/cog_menu/cog_menu";
import { evaluateBooleanExpr } from "@web/core/py_js/py";
import { useSetupAction } from "@web/search/action_hook";
import { ActionMenus, STATIC_ACTIONS_GROUP_NUMBER } from "@web/search/action_menus/action_menus";
import { Layout } from "@web/search/layout";
import { usePager } from "@web/search/pager_hook";
import { SearchBar } from "@web/search/search_bar/search_bar";
import { useSearchBarToggler } from "@web/search/search_bar/search_bar_toggler";
import { session } from "@web/session";
import { useModelWithSampleData } from "@web/model/model";
import { standardViewProps } from "@web/views/standard_view_props";
import { MultiRecordViewButton } from "@web/views/view_button/multi_record_view_button";
import { useViewButtons } from "@web/views/view_button/view_button_hook";
import { addFieldDependencies, extractFieldsFromArchInfo } from "@web/model/relational_model/utils";
import { KanbanRenderer } from "./kanban_renderer";
import { useProgressBar } from "./progress_bar_hook";
import { SelectionBox } from "@web/views/view_components/selection_box";

import { Component, reactive, useEffect, useRef, useState } from "@odoo/owl";

const QUICK_CREATE_FIELD_TYPES = ["char", "boolean", "many2one", "selection", "many2many"];

// -----------------------------------------------------------------------------

export class KanbanController extends Component {
    static template = `web.KanbanView`;
    static components = {
        ActionMenus,
        Layout,
        KanbanRenderer,
        MultiRecordViewButton,
        SearchBar,
        CogMenu,
        SelectionBox,
    };
    static props = {
        ...standardViewProps,
        editable: { type: Boolean, optional: true },
        forceGlobalClick: { type: Boolean, optional: true },
        onSelectionChanged: { type: Function, optional: true },
        readonly: { type: Boolean, optional: true },
        showButtons: { type: Boolean, optional: true },
        Compiler: Function,
        Model: Function,
        Renderer: Function,
        buttonTemplate: String,
        archInfo: Object,
    };

    static defaultProps = {
        createRecord: () => {},
        forceGlobalClick: false,
        selectRecord: () => {},
        showButtons: true,
    };

    setup() {
        this.actionService = useService("action");
        this.dialog = useService("dialog");
        const { Model, archInfo } = this.props;

        class KanbanSampleModel extends Model {
            setup() {
                super.setup(...arguments);
                this.initialSampleGroups = undefined;
            }

            /**
             * @override
             */
            hasData() {
                if (this.root.groups) {
                    if (!this.root.groups.length) {
                        // While we don't have any data, we want to display the column quick create and
                        // example background. Return true so that we don't get sample data instead
                        return true;
                    }
                    return this.root.groups.some((group) => group.hasData);
                }
                return super.hasData();
            }

            async load() {
                if (this.orm.isSample && this.initialSampleGroups) {
                    this.orm.setGroups(this.initialSampleGroups);
                }
                return super.load(...arguments);
            }

            async _webReadGroup() {
                const result = await super._webReadGroup(...arguments);
                if (!this.initialSampleGroups) {
                    this.initialSampleGroups = JSON.parse(JSON.stringify(result.groups));
                }
                return result;
            }

            removeSampleDataInGroups() {
                if (this.useSampleModel) {
                    for (const group of this.root.groups) {
                        const list = group.list;
                        group.count = 0;
                        list.count = 0;
                        if (list.records) {
                            list.records = [];
                        } else {
                            list.groups = [];
                        }
                    }
                }
            }
        }

        this.model = useState(
            useModelWithSampleData(KanbanSampleModel, this.modelParams, this.modelOptions)
        );
        if (archInfo.progressAttributes) {
            const { activeBars } = this.props.state || {};
            this.progressBarState = useProgressBar(
                archInfo.progressAttributes,
                this.model,
                this.progressBarAggregateFields,
                activeBars
            );
        }
        this.headerButtons = archInfo.headerButtons;

        const self = this;
        this.quickCreateState = reactive({
            get groupId() {
                return this._groupId || false;
            },
            set groupId(groupId) {
                if (self.model.useSampleModel) {
                    self.model.removeSampleDataInGroups();
                    self.model.useSampleModel = false;
                }
                this._groupId = groupId;
            },
            view: archInfo.quickCreateView,
        });

        this.rootRef = useRef("root");
        useViewButtons(this.rootRef, {
            beforeExecuteAction: this.beforeExecuteActionButton.bind(this),
            afterExecuteAction: this.afterExecuteActionButton.bind(this),
            reload: () => this.model.load(),
        });
        useSetupAction({
            rootRef: this.rootRef,
            getLocalState: () => ({
                activeBars: this.progressBarState?.activeBars,
                modelState: this.model.exportState(),
            }),
        });
        usePager(() => {
            const root = this.model.root;
            const { count, hasLimitedCount, isGrouped, limit, offset } = root;
            if (!isGrouped) {
                return {
                    offset: offset,
                    limit: limit,
                    total: count,
                    onUpdate: async ({ offset, limit }, hasNavigated) => {
                        await this.model.root.load({ offset, limit });
                        await this.onUpdatedPager();
                        if (hasNavigated) {
                            this.onPageChangeScroll();
                        }
                    },
                    updateTotal: hasLimitedCount ? () => root.fetchCount() : undefined,
                };
            }
        });
        this.searchBarToggler = useSearchBarToggler();
        const handleAltKeyDown = (ev) => {
            if (ev.key === "Alt") {
                this.rootRef.el.classList.add("o_kanban_selection_available");
            }
        };
        const handleAltKeyUp = () => {
            this.rootRef.el.classList.remove("o_kanban_selection_available");
        };
        useEffect(
            () => {
                if (this.props.onSelectionChanged) {
                    const resIds = this.model.root.selection.map((record) => record.resId);
                    this.props.onSelectionChanged(resIds);
                }
                window.addEventListener("keydown", handleAltKeyDown);
                window.addEventListener("keyup", handleAltKeyUp);
                window.addEventListener("blur", handleAltKeyUp);
                return () => {
                    window.removeEventListener("keydown", handleAltKeyDown);
                    window.removeEventListener("keyup", handleAltKeyUp);
                    window.removeEventListener("blur", handleAltKeyUp);
                };
            },
            () => [this.model.root.selection.length]
        );
        this.archiveEnabled =
            "active" in this.props.fields
                ? !this.props.fields.active.readonly
                : "x_active" in this.props.fields
                ? !this.props.fields.x_active.readonly
                : false;
    }

    get display() {
        const { controlPanel } = this.props.display;
        if (!controlPanel) {
            return this.props.display;
        }
        return {
            ...this.props.display,
            controlPanel: {
                ...controlPanel,
                layoutActions: !this.hasSelectedRecords,
            },
        };
    }

    get actionMenuItems() {
        const { actionMenus } = this.props.info;
        const staticActionItems = Object.entries(this.getStaticActionMenuItems())
            .filter(([key, item]) => item.isAvailable === undefined || item.isAvailable())
            .sort(([k1, item1], [k2, item2]) => (item1.sequence || 0) - (item2.sequence || 0))
            .map(([key, item]) =>
                Object.assign(
                    { key, groupNumber: STATIC_ACTIONS_GROUP_NUMBER },
                    omit(item, "isAvailable")
                )
            );

        return {
            action: [...staticActionItems, ...(actionMenus?.action || [])],
            print: actionMenus?.print,
        };
    }

    get actionMenuProps() {
        return {
            getActiveIds: () => this.model.root.selection.map((r) => r.resId),
            context: this.props.context,
            domain: this.props.domain,
            items: this.actionMenuItems,
            isDomainSelected: this.model.root.isDomainSelected,
            resModel: this.model.root.resModel,
            onActionExecuted: () => this.model.load(),
        };
    }

    get hasSelectedRecords() {
        return this.selectedRecords.length || this.isDomainSelected;
    }

    get selectedRecords() {
        return this.model.root.selection;
    }

    get isDomainSelected() {
        return this.model.root.isDomainSelected;
    }

    get isPageSelected() {
        const root = this.model.root;
        const nbTotal = root.isGrouped ? root.recordCount : root.count;
        return (
            root.selection.length === root.records.length &&
            (!root.isRecordCountTrustable || nbTotal > this.selectedRecords.length)
        );
    }

    async selectDomain(value) {
        await this.model.root.selectDomain(value);
    }

    get modelParams() {
        const { resModel, archInfo, limit } = this.props;
        const { activeFields, fields } = extractFieldsFromArchInfo(archInfo, this.props.fields);

        const cardColorField = archInfo.cardColorField;
        if (cardColorField) {
            addFieldDependencies(activeFields, fields, [{ name: cardColorField, type: "integer" }]);
        }

        // Remove fields aggregator unused to avoid asking them for no reason
        const aggregateFieldNames = this.progressBarAggregateFields.map((field) => field.name);
        for (const [key, value] of Object.entries(activeFields)) {
            if (!aggregateFieldNames.includes(key)) {
                value.aggregator = null;
            }
        }

        addFieldDependencies(activeFields, fields, this.progressBarAggregateFields);
        const modelConfig = this.props.state?.modelState?.config || {
            resModel,
            activeFields,
            fields,
            openGroupsByDefault: true,
        };

        return {
            config: modelConfig,
            state: this.props.state?.modelState,
            limit: archInfo.limit || limit || 40,
            groupsLimit: Number.MAX_SAFE_INTEGER, // no limit
            countLimit: archInfo.countLimit,
            defaultOrderBy: archInfo.defaultOrder,
            maxGroupByDepth: 1,
            activeIdsLimit: session.active_ids_limit,
            hooks: {
                onRecordSaved: this.onRecordSaved.bind(this),
            },
        };
    }

    get modelOptions() {
        return {};
    }

    get progressBarAggregateFields() {
        const res = [];
        const { progressAttributes } = this.props.archInfo;
        if (progressAttributes && progressAttributes.sumField) {
            res.push(progressAttributes.sumField);
        }
        return res;
    }

    get className() {
        if (this.env.isSmall && this.model.root.isGrouped) {
            const classList = (this.props.className || "").split(" ");
            classList.push("o_action_delegate_scroll");
            return classList.join(" ");
        }
        return this.props.className;
    }

    get archiveDialogProps() {
        return {
            body: _t("Are you sure that you want to archive all the selected records?"),
            confirmLabel: _t("Archive"),
            confirm: () => {
                this.model.root.archive(true);
            },
            cancel: () => {},
        };
    }

    getStaticActionMenuItems() {
        return {
            archive: {
                isAvailable: () => this.archiveEnabled,
                sequence: 20,
                icon: "oi oi-archive",
                description: _t("Archive"),
                callback: () => {
                    this.dialogService.add(ConfirmationDialog, this.archiveDialogProps);
                },
            },
            unarchive: {
                isAvailable: () => this.archiveEnabled,
                sequence: 30,
                icon: "oi oi-unarchive",
                description: _t("Unarchive"),
                callback: () => this.model.root.unarchive(true),
            },
        };
    }

    async deleteRecord(record) {
        this.dialog.add(ConfirmationDialog, {
            title: _t("Bye-bye, record!"),
            body: deleteConfirmationMessage,
            confirm: () => this.model.root.deleteRecords([record]),
            confirmLabel: _t("Delete"),
            cancel: () => {},
            cancelLabel: _t("No, keep it"),
        });
    }

    evalViewModifier(modifier) {
        return evaluateBooleanExpr(modifier, { context: this.props.context });
    }

    async openRecord(record, { newWindow } = {}) {
        const activeIds = this.model.root.records.map((datapoint) => datapoint.resId);
        this.props.selectRecord(record.resId, { activeIds, newWindow });
    }

    async createRecord() {
        const { onCreate } = this.props.archInfo;
        const { root } = this.model;
        if (this.canQuickCreate && onCreate === "quick_create") {
            const firstGroup = root.groups.find((group) => !group.isFolded) || root.groups[0];
            if (firstGroup.isFolded) {
                await firstGroup.toggle();
            }
            this.quickCreateState.groupId = firstGroup.id;
        } else if (onCreate && onCreate !== "quick_create") {
            const options = {
                additionalContext: root.context,
                onClose: async () => {
                    await root.load();
                    this.model.useSampleModel = false;
                    this.render(true); // FIXME WOWL reactivity
                },
            };
            await this.actionService.doAction(onCreate, options);
        } else {
            await this.props.createRecord();
        }
    }

    get canCreate() {
        const { create, createGroup } = this.props.archInfo.activeActions;
        const list = this.model.root;
        if (!create) {
            return false;
        }
        if (list.isGrouped) {
            if (list.groupByField.type !== "many2one") {
                return true;
            }
            return list.groups.length || !createGroup;
        }
        return true;
    }

    get canQuickCreate() {
        const { activeActions } = this.props.archInfo;
        if (!activeActions.quickCreate) {
            return false;
        }

        const list = this.model.root;
        if (list.groups && !list.groups.length) {
            return false;
        }

        return this.isQuickCreateField(list.groupByField);
    }

    onRecordSaved(record) {
        if (this.model.root.isGrouped) {
            const group = this.model.root.groups.find((l) =>
                l.records.find((r) => r.id === record.id)
            );
            this.progressBarState?.updateCounts(group);
        }
    }

    onPageChangeScroll() {
        if (this.rootRef && this.rootRef.el) {
            if (this.env.isSmall) {
                this.rootRef.el.scrollTop = 0;
            } else {
                this.rootRef.el.querySelector(".o_content").scrollTop = 0;
            }
        }
    }

    async beforeExecuteActionButton(clickParams) {}

    async afterExecuteActionButton(clickParams) {}

    async onUpdatedPager() {}

    scrollTop() {
        this.rootRef.el.querySelector(".o_content").scrollTo({ top: 0 });
    }

    isQuickCreateField(field) {
        return field && QUICK_CREATE_FIELD_TYPES.includes(field.type);
    }
}
