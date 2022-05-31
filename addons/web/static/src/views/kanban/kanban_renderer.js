/** @odoo-module **/

import { ColorList } from "@web/core/colorlist/colorlist";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { SimpleDialog } from "@web/core/dialog/dialog";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { registry } from "@web/core/registry";
import { useBus, useService } from "@web/core/utils/hooks";
import { sprintf, uniqueId } from "@web/core/utils/strings";
import { useSortable } from "@web/core/utils/ui";
import { url } from "@web/core/utils/urls";
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";
import { Field } from "@web/fields/field";
import { fileTypeMagicWordMap } from "@web/fields/image/image_field";
import { session } from "@web/session";
import { useViewCompiler } from "@web/views/helpers/view_compiler";
import { useBounceButton } from "@web/views/helpers/view_hook";
import { isRelational } from "@web/views/helpers/view_utils";
import { isAllowedDateField } from "@web/views/relational_model";
import { ViewButton } from "@web/views/view_button/view_button";
import { FormViewDialog } from "@web/views/view_dialogs/form_view_dialog";
import { ViewWidget } from "@web/views/view_widget";
import { KanbanAnimatedNumber } from "./kanban_animated_number";
import { KanbanColumnQuickCreate } from "./kanban_column_quick_create";
import { KanbanCompiler } from "./kanban_compiler";
import { KanbanRecordQuickCreate } from "./kanban_record_quick_create";

const { Component, markup, useState, useRef, onWillDestroy, onWillStart, onMounted } = owl;
const { COLORS } = ColorList;

const DRAGGABLE_GROUP_TYPES = ["many2one"];
const MOVABLE_RECORD_TYPES = ["char", "boolean", "integer", "selection", "many2one"];
const GLOBAL_CLICK_CANCEL_SELECTORS = ["a", ".dropdown", ".oe_kanban_action"];

const isBinSize = (value) => /^\d+(\.\d*)? [^0-9]+$/.test(value);
const isNull = (value) => [null, undefined].includes(value);

const formatters = registry.category("formatters");

class KanbanCoverImageDialog extends Component {
    setup() {
        this.id = uniqueId("o_cover_image_upload");
        this.orm = useService("orm");
        const { record, fieldName } = this.props;
        this.coverId = record && record.data[fieldName];
        this.state = useState({
            selectedAttachmentId: this.coverId,
        });
        this.fileInput = useRef("fileInput");
        onWillStart(async () => {
            this.attachments = await this.orm.searchRead(
                "ir.attachment",
                [
                    ["res_model", "=", record.resModel],
                    ["res_id", "=", record.resId],
                    ["mimetype", "ilike", "image"],
                ],
                ["id", "name"]
            );
        });
        onMounted(() => {
            if (!this.props.autoOpen && this.attachments.length === 0) {
                this.fileInput.el.click();
            }
        });
    }

    selectAttachment(attachment) {
        if (this.state.selectedAttachmentId !== attachment.id) {
            this.state.selectedAttachmentId = attachment.id;
        } else {
            this.state.selectedAttachmentId = null;
        }
    }

    removeCover() {
        this.state.selectedAttachmentId = null;
        this.setCover();
    }

    async setCover() {
        const id = this.state.selectedAttachmentId ? [this.state.selectedAttachmentId] : false;
        await this.props.record.update({ [this.props.fieldName]: id });
        await this.props.record.save();
        this.props.close();
    }
}
KanbanCoverImageDialog.template = "web.KanbanCoverImageDialog";
KanbanCoverImageDialog.components = { SimpleDialog };

export class KanbanRenderer extends Component {
    setup() {
        this.dialogClose = [];
        const { arch, cards, className, xmlDoc, examples } = this.props.archInfo;
        this.cards = cards;
        this.className = className;
        this.cardTemplate = useViewCompiler(KanbanCompiler, arch, xmlDoc);
        this.state = useState({
            columnQuickCreateIsFolded:
                !this.props.list.isGrouped || this.props.list.groups.length > 0,
        });
        this.action = useService("action");
        this.dialog = useService("dialog");
        this.notification = useService("notification");
        this.colors = COLORS;
        this.exampleData = registry.category("kanban_examples").get(examples, null);
        this.ghostColumns = this.generateGhostColumns();
        // Draggable
        let dataRecordId;
        let dataGroupId;
        const rootRef = useRef("root");
        useSortable({
            isActive: () => this.canResequenceRecords,
            // Params
            ref: rootRef,
            elements: ".o_record_draggable",
            groups: () => this.props.list.isGrouped && ".o_kanban_group",
            connectGroups: () => this.canMoveRecords,
            cursor: "move",
            // Hooks
            onStart: (group, element) => {
                dataRecordId = element.dataset.id;
                if (group) {
                    dataGroupId = group.dataset.id;
                }
                element.classList.add("o_dragged");
            },
            onGroupEnter: (group) => group.classList.add("o_kanban_hover"),
            onGroupLeave: (group) => group.classList.remove("o_kanban_hover"),
            onStop: (_group, element) => element.classList.remove("o_dragged"),
            onDrop: async ({ element, previous, parent }) => {
                element.classList.remove("o_record_draggable");
                const refId = previous ? previous.dataset.id : null;
                const targetGroupId = parent && parent.dataset.id;
                await this.props.list.moveRecord(dataRecordId, dataGroupId, refId, targetGroupId);
                element.classList.add("o_record_draggable");
            },
        });
        useSortable({
            isActive: () => this.canResequenceGroups,
            // Params
            ref: rootRef,
            elements: ".o_group_draggable",
            handle: ".o_column_title",
            cursor: "move",
            // Hooks
            onStart: (_group, element) => {
                dataGroupId = element.dataset.id;
                element.classList.add("o_dragged");
            },
            onStop: (_group, element) => element.classList.remove("o_dragged"),
            onDrop: async ({ element, previous }) => {
                element.classList.remove("o_group_draggable");
                const refId = previous ? previous.dataset.id : null;
                await this.props.list.resequence(dataGroupId, refId);
                element.classList.add("o_group_draggable");
            },
        });
        useBounceButton(rootRef, (clickedEl) => {
            if (!this.props.list.count || this.props.list.model.useSampleModel) {
                return clickedEl.matches(
                    [
                        ".o_kanban_renderer",
                        ".o_kanban_group",
                        ".o_kanban_header",
                        ".o_column_quick_create",
                        ".o_view_nocontent_smiling_face",
                    ].join(", ")
                );
            }
            return false;
        });
        onWillDestroy(() => {
            this.dialogClose.forEach((close) => close());
        });

        useBus(this.env.searchModel, "focus-view", () => {
            const { model } = this.props.list;
            if (model.useSampleModel || !model.hasData()) {
                return;
            }
            // Focus first kanban card
            rootRef.el.querySelector(".o_kanban_record").focus();
        });

        useHotkey(
            "Enter",
            ({ target }) => {
                if (!target.classList.contains("o_kanban_record")) {
                    return;
                }

                // Open first link
                const firstLink = target.querySelector("a, button");
                if (firstLink && firstLink instanceof HTMLElement) {
                    firstLink.click();
                }
                return;
            },
            { area: () => rootRef.el }
        );

        const arrowsOptions = { area: () => rootRef.el, allowRepeat: true };
        useHotkey(
            "ArrowUp",
            ({ area }) => {
                if (!this.focusNextCard(area, "up")) {
                    this.env.searchModel.trigger("focus-search");
                }
            },
            arrowsOptions
        );
        useHotkey("ArrowDown", ({ area }) => this.focusNextCard(area, "down"), arrowsOptions);
        useHotkey("ArrowLeft", ({ area }) => this.focusNextCard(area, "left"), arrowsOptions);
        useHotkey("ArrowRight", ({ area }) => this.focusNextCard(area, "right"), arrowsOptions);
    }

    // ------------------------------------------------------------------------
    // Getters
    // ------------------------------------------------------------------------

    getRawValue(record, fieldName) {
        const field = record.fields[fieldName];
        const value = record.data[fieldName];
        switch (field.type) {
            case "one2many":
            case "many2many": {
                return value.count ? value.currentIds : [];
            }
            case "date":
            case "datetime": {
                return value && value.toJSDate().toDateString();
            }
            case "html": {
                return markup(value);
            }
            default: {
                return value;
            }
        }
    }

    getValue(record, fieldName) {
        const field = record.fields[fieldName];
        const value = record.data[fieldName];
        const formatter = formatters.get(field.type, (value) => value);
        return formatter(value, { field, data: record.data });
    }

    get canMoveRecords() {
        if (!this.canResequenceRecords) {
            return false;
        }
        if (!this.props.list.groupByField) {
            return true;
        }
        const { groupByField } = this.props.list;
        const { modifiers, type } = groupByField;
        return (
            !(modifiers && modifiers.readonly) &&
            (isAllowedDateField(groupByField) || MOVABLE_RECORD_TYPES.includes(type))
        );
    }

    get canResequenceGroups() {
        if (!this.props.list.isGrouped) {
            return false;
        }
        const { modifiers, type } = this.props.list.groupByField;
        return !(modifiers && modifiers.readonly) && DRAGGABLE_GROUP_TYPES.includes(type);
    }

    get canResequenceRecords() {
        if (this.props.recordsDraggable === false) {
            return false;
        }
        const { isGrouped, orderBy } = this.props.list;
        const { handleField, recordsDraggable } = this.props.archInfo;
        return (
            recordsDraggable &&
            (isGrouped || (handleField && (!orderBy[0] || orderBy[0].name === handleField)))
        );
    }

    get showNoContentHelper() {
        const { model, isGrouped, groups } = this.props.list;
        if (model.useSampleModel) {
            return true;
        }
        if (isGrouped) {
            if (!this.state.columnQuickCreateIsFolded) {
                return false;
            }
            if (groups.length === 0) {
                return true;
            }
        }
        return !model.hasData();
    }

    get read_only_mode() {
        return this.props.readonly;
    }

    /**
     * When the kanban records are grouped, the 'false' or 'undefined' group
     * must appear first.
     * @returns {any[]}
     */
    getGroupsOrRecords() {
        const { list } = this.props;
        if (list.isGrouped) {
            return list.groups
                .sort((a, b) => (a.value && !b.value ? 1 : !a.value && b.value ? -1 : 0))
                .map((group, i) => ({
                    group,
                    key: `group_key_${isNull(group.value) ? i : String(group.value)}`,
                }));
        } else {
            return list.records.map((record) => ({ record, key: record.id }));
        }
    }

    getGroupName({ groupByField, count, displayName, isFolded }) {
        let name = displayName;
        if (isNull(name)) {
            name = this.env._t("None");
        } else if (isRelational(groupByField)) {
            name = name || this.env._t("None");
        } else if (groupByField.type === "boolean") {
            name = name ? this.env._t("Yes") : this.env._t("No");
        }
        return isFolded ? `${name} (${count})` : name;
    }

    getGroupClasses(group) {
        const classes = [];
        if (this.canResequenceGroups && group.value) {
            classes.push("o_group_draggable");
        }
        if (!group.count) {
            classes.push("o_kanban_no_records");
        }
        if (group.isFolded) {
            classes.push("o_column_folded");
        }
        if (group.progressBars.length) {
            classes.push("o_kanban_has_progressbar");
            if (!group.isFolded && group.hasActiveProgressValue) {
                const progressBar = group.activeProgressBar;
                classes.push("o_kanban_group_show", `o_kanban_group_show_${progressBar.color}`);
            }
        }
        return classes.join(" ");
    }

    getGroupUnloadedCount(group) {
        const progressBar = group.activeProgressBar;
        const records = group.getAggregableRecords();
        return (progressBar ? progressBar.count : group.count) - records.length;
    }

    getRecordClasses(record, group) {
        const { model } = this.props.list;
        const classes = ["o_kanban_record"];
        if (model.hasProgressBars && group) {
            const progressBar = group.findProgressValueFromRecord(record);
            classes.push(`oe_kanban_card_${progressBar.color}`);
        }
        if (this.props.archInfo.cardColorField) {
            const value = record.data[this.props.archInfo.cardColorField];
            classes.push(this.getColorClass(value));
        }
        if (this.canResequenceRecords) {
            classes.push("o_record_draggable");
        }
        if (model.useSampleModel) {
            classes.push("o_sample_data_disabled");
        }
        return classes.join(" ");
    }

    getGroupAggregate(group) {
        const { sumField } = this.props.list.model.progressAttributes;
        const value = group.getAggregates(sumField && sumField.name);
        const title = sumField ? sumField.string : this.env._t("Count");
        let currency = false;
        if (sumField && value && sumField.currency_field) {
            currency = session.currencies[session.company_currency_id];
        }
        return { value, currency, title };
    }

    generateGhostColumns() {
        let colNames;
        if (this.exampleData && this.exampleData.ghostColumns) {
            colNames = this.exampleData.ghostColumns;
        } else {
            colNames = [1, 2, 3, 4].map((num) => sprintf(this.env._t("Column %s"), num));
        }
        return colNames.map((colName) => ({
            name: colName,
            cards: new Array(Math.floor(Math.random() * 4) + 2),
        }));
    }

    // ------------------------------------------------------------------------
    // Permissions
    // ------------------------------------------------------------------------

    canArchiveGroup(group) {
        const { activeActions } = this.props.archInfo;
        const hasActiveField = "active" in group.fields;
        return activeActions.groupArchive && hasActiveField && !this.props.list.groupedBy("m2m");
    }

    canCreateGroup() {
        const { activeActions } = this.props.archInfo;
        return activeActions.groupCreate && this.props.list.groupedBy("m2o");
    }

    canDeleteGroup(group) {
        const { activeActions } = this.props.archInfo;
        const { groupByField } = this.props.list;
        return activeActions.groupDelete && isRelational(groupByField) && group.value;
    }

    canDeleteRecord() {
        const { activeActions } = this.props.archInfo;
        return activeActions.delete && !this.props.list.groupedBy("m2m");
    }

    canEditGroup(group) {
        const { activeActions } = this.props.archInfo;
        const { groupByField } = this.props.list;
        return activeActions.groupEdit && isRelational(groupByField) && group.value;
    }

    canEditRecord() {
        return this.props.archInfo.activeActions.edit;
    }

    // ------------------------------------------------------------------------
    // Edition methods
    // ------------------------------------------------------------------------

    quickCreate(group) {
        return this.props.list.quickCreate(group);
    }

    async validateQuickCreate(mode, group) {
        const values = group.list.quickCreateRecord.data;
        const record = await group.validateQuickCreate();
        if (record) {
            if (mode === "edit") {
                await this.props.openRecord(record, "edit");
            } else {
                await this.quickCreate(group);
            }
        } else {
            const context = { ...group.context };
            context[`default_${group.groupByField.name}`] = group.value;
            context.default_name = values.name || values.display_name;
            this.dialogClose.push(
                this.dialog.add(FormViewDialog, {
                    resModel: this.props.list.resModel,
                    context,
                    title: this.env._t("Create"),
                    onRecordSaved: (record) => {
                        group.addRecord(record, 0);
                        this.props.list.quickCreate(group);
                    },
                    onRecordDiscarded: (record) => {
                        this.props.list.quickCreate(group);
                    },
                })
            );
        }
    }

    toggleGroup(group) {
        group.toggle();
    }

    loadMore(group) {
        group.list.loadMore();
    }

    editGroup(group) {
        this.dialogClose.push(
            this.dialog.add(FormViewDialog, {
                context: group.context,
                resId: group.value,
                resModel: group.resModel,
                title: sprintf(this.env._t("Edit: %s"), group.displayName),

                onRecordSaved: async () => {
                    await this.props.list.load();
                    this.props.list.model.notify();
                },
            })
        );
    }

    archiveGroup(group) {
        this.dialog.add(ConfirmationDialog, {
            body: this.env._t(
                "Are you sure that you want to archive all the records from this column?"
            ),
            confirm: () => group.list.archive(),
            cancel: () => {},
        });
    }

    unarchiveGroup(group) {
        group.list.unarchive();
    }

    deleteGroup(group) {
        this.dialog.add(ConfirmationDialog, {
            body: this.env._t("Are you sure you want to delete this column?"),
            confirm: async () => {
                await this.props.list.deleteGroups([group]);
                if (this.props.list.groups.length === 0) {
                    this.state.columnQuickCreateIsFolded = false;
                }
            },
            cancel: () => {},
        });
    }

    deleteRecord(record, group) {
        const listOrGroup = group || this.props.list;
        // WOWL TODO refactor this but how?
        if (listOrGroup.deleteRecords) {
            this.dialog.add(ConfirmationDialog, {
                body: this.env._t("Are you sure you want to delete this record?"),
                confirm: () => listOrGroup.deleteRecords([record]),
                cancel: () => {},
            });
        } else {
            // static list case
            listOrGroup.removeRecord(record);
        }
    }

    async selectColor(record, colorIndex) {
        await record.update({ [this.props.archInfo.colorField]: colorIndex });
        await record.save();
    }

    triggerAction(record, group, params) {
        const { type } = params;
        switch (type) {
            case "edit": {
                this.props.openRecord(record, "edit");
                break;
            }
            case "open": {
                this.props.openRecord(record);
                break;
            }
            case "delete": {
                this.deleteRecord(record, group);
                break;
            }
            case "action":
            case "object": {
                // TODO
                console.warn("TODO: Button clicked for record", record.id, { params });
                break;
            }
            case "set_cover": {
                const { fieldName, widget, autoOpen } = params;
                const field = this.props.list.fields[fieldName];
                if (
                    field.type === "many2one" &&
                    field.relation === "ir.attachment" &&
                    widget === "attachment_image"
                ) {
                    this.dialog.add(KanbanCoverImageDialog, { record, fieldName, autoOpen });
                    // console.warn("TODO: Update record", record.id, { fieldName, autoOpen });
                } else {
                    const warning = sprintf(
                        this.env._t(
                            `Could not set the cover image: incorrect field ("%s") is provided in the view.`
                        ),
                        fieldName
                    );
                    this.notification.add({ title: warning, type: "danger" });
                }
                break;
            }
            default: {
                this.notification.add(this.env._t("Kanban: no action for type: ") + type, {
                    type: "danger",
                });
            }
        }
    }

    // ------------------------------------------------------------------------
    // Handlers
    // ------------------------------------------------------------------------

    onGroupClick(group) {
        if (group.isFolded) {
            group.toggle();
        }
    }

    onRecordClick(record, ev) {
        if (ev.target.closest(GLOBAL_CLICK_CANCEL_SELECTORS.join(","))) {
            return;
        }
        if (this.props.archInfo.openAction) {
            this.action.doActionButton({
                name: this.props.archInfo.openAction.action,
                type: this.props.archInfo.openAction.type,
                resModel: record.resModel,
                resId: record.resId,
                resIds: record.resIds,
                context: record.context,
                onClose: async () => {
                    await record.model.root.load();
                    record.model.notify();
                },
            });
        } else {
            this.props.openRecord(record);
        }
    }

    /**
     * Focus next card in the area within the chosen direction.
     *
     * @param {HTMLElement} area
     * @param {"down"|"up"|"right"|"left"} direction
     * @returns {true?} true if the next card has been focused
     */
    focusNextCard(area, direction) {
        const { isGrouped } = this.props.list;
        const groups = isGrouped ? [...area.querySelectorAll(".o_kanban_group")] : [area];
        const cards = [...groups]
            .map((group) => [...group.querySelectorAll(".o_kanban_record")])
            .filter((group) => group.length);

        // Search current card position
        let iGroup;
        let iCard;
        for (iGroup = 0; iGroup < cards.length; iGroup++) {
            const i = cards[iGroup].indexOf(document.activeElement);
            if (i !== -1) {
                iCard = i;
                break;
            }
        }
        // Find next card to focus
        let nextCard;
        switch (direction) {
            case "down":
                nextCard = iCard < cards[iGroup].length - 1 && cards[iGroup][iCard + 1];
                break;
            case "up":
                nextCard = iCard > 0 && cards[iGroup][iCard - 1];
                break;
            case "right":
                if (isGrouped) {
                    nextCard = iGroup < cards.length - 1 && cards[iGroup + 1][0];
                } else {
                    nextCard = iCard < cards[0].length - 1 && cards[0][iCard + 1];
                }
                break;
            case "left":
                if (isGrouped) {
                    nextCard = iGroup > 0 && cards[iGroup - 1][0];
                } else {
                    nextCard = iCard > 0 && cards[0][iCard - 1];
                }
                break;
        }

        if (nextCard && nextCard instanceof HTMLElement) {
            nextCard.focus();
            return true;
        }
    }

    //-------------------------------------------------------------------------
    // KANBAN SPECIAL FUNCTIONS
    //
    // Note: some of these are snake_cased with not-so-self-explanatory names
    // for the sake of compatibility.
    // WOWL TODO: transpile the function calls in KanbanArchParser to better
    // names
    //-------------------------------------------------------------------------

    /**
     * Returns the image URL of a given field on a record.
     *
     * @param {Object} param0
     * @param {string} [param0.model] model name
     * @param {string} [param0.field] field name
     * @param {number | [number, ...any[]]} [param0.idOrIds] id or array
     *      starting with the id of the desired record.
     * @param {string} [param0.placeholder] fallback when the image does not
     *  exist
     * @param {Object} record the record corresponding to the current card
     * @returns {string}
     */
    imageSrcFromRecordInfo({ model, field, idOrIds, placeholder }, record) {
        const id = (Array.isArray(idOrIds) ? idOrIds[0] : idOrIds) || null;
        const isCurrentRecord =
            record.resModel === model && (record.resId === id || (!record.resId && !id));
        const fieldVal = record.data[field];
        if (isCurrentRecord && fieldVal && !isBinSize(fieldVal)) {
            // Use magic-word technique for detecting image type
            const type = fileTypeMagicWordMap[fieldVal[0]];
            return `data:image/${type};base64,${fieldVal}`;
        } else if (placeholder && (!model || !field || !id || !fieldVal)) {
            // Placeholder if either the model, field, id or value is missing or null.
            return placeholder;
        } else {
            // Else: fetches the image related to the given id.
            return url("/web/image", { model, field, id });
        }
    }

    /**
     * Returns the class name of a record according to its color.
     */
    getColorClass(value) {
        return `oe_kanban_color_${this.getColorIndex(value)}`;
    }

    /**
     * Returns the index of a color determined by a given record.
     */
    getColorIndex(value) {
        if (typeof value === "number") {
            return Math.round(value) % this.colors.length;
        } else if (typeof value === "string") {
            const charCodeSum = [...value].reduce((acc, _, i) => acc + value.charCodeAt(i), 0);
            return charCodeSum % this.colors.length;
        } else {
            return 0;
        }
    }

    /**
     * Returns the proper translated name of a record color.
     */
    getColorName(value) {
        return this.colors[this.getColorIndex(value)];
    }

    /**
     * Checks if a html content is empty. If there are only formatting tags
     * with style attributes or a void content. Famous use case is
     * '<p style="..." class=".."><br></p>' added by some web editor(s).
     * Note that because the use of this method is limited, we ignore the cases
     * like there's one <img> tag in the content. In such case, even if it's the
     * actual content, we consider it empty.
     *
     * @param {string} innerHTML
     * @returns {boolean} true if no content found or if containing only formatting tags
     */
    isHtmlEmpty(innerHTML = "") {
        const div = Object.assign(document.createElement("div"), { innerHTML });
        return div.innerText.trim() === "";
    }

    tooltipAttributes(group) {
        if (!group.tooltip) {
            return {};
        }
        return {
            "data-tooltip-template": "web.KanbanGroupTooltip",
            "data-tooltip-info": JSON.stringify(group.tooltip),
        };
    }
}

KanbanRenderer.template = "web.KanbanRenderer";
KanbanRenderer.components = {
    Field,
    KanbanColumnQuickCreate,
    KanbanRecordQuickCreate,
    ViewButton,
    ViewWidget,
    KanbanAnimatedNumber,
    Dropdown,
    DropdownItem,
    KanbanCoverImageDialog,
};
