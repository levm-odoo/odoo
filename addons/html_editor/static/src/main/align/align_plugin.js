import { Plugin } from "@html_editor/plugin";
import { closestBlock } from "@html_editor/utils/blocks";
import { isVisibleTextNode } from "@html_editor/utils/dom_info";
import { withSequence } from "@html_editor/utils/resource";
import { _t } from "@web/core/l10n/translation";
import { AlignSelector } from "./align_selector";
import { reactive } from "@odoo/owl";

const alignmentItems = [
    { mode: "left" },
    { mode: "center" },
    { mode: "right" },
    { mode: "justify" },
];

export class AlignPlugin extends Plugin {
    static id = "align";
    static dependencies = ["history", "selection"];
    resources = {
        user_commands: [
            {
                id: "alignLeft",
                title: _t("Align Left"),
                icon: "fa-align-left",
                run: () => this.align("left"),
            },
            {
                id: "alignCenter",
                title: _t("Align Center"),
                icon: "fa-align-center",
                run: () => this.align("center"),
            },
            {
                id: "alignRight",
                title: _t("Align Right"),
                icon: "fa-align-right",
                run: () => this.align("right"),
            },
            {
                id: "justify",
                title: _t("Justify"),
                icon: "fa-align-justify",
                run: () => this.align("justify"),
            },
        ],
        toolbar_groups: withSequence(29, { id: "alignment" }),
        toolbar_items: [
            {
                id: "alignment",
                groupId: "alignment",
                title: _t("Text align"),
                Component: AlignSelector,
                props: {
                    getItems: () => alignmentItems,
                    getDisplay: () => this.alignment,
                    onSelected: (item) => {
                        this.align(item.mode);
                        this.updateAlignmentParams();
                    },
                },
            },
        ],

        /** Handlers */
        selectionchange_handlers: this.updateAlignmentParams.bind(this),
        post_undo_handlers: this.updateAlignmentParams.bind(this),
        post_redo_handlers: this.updateAlignmentParams.bind(this),
    };

    setup() {
        this.alignment = reactive({ displayName: "" });
    }

    get alignmentMode() {
        const sel = this.dependencies.selection.getSelectionData().deepEditableSelection;
        const block = closestBlock(sel?.anchorNode);
        const textAlign = this.getTextAlign(block);
        return ["center", "right", "justify"].includes(textAlign) ? textAlign : "left";
    }

    align(mode) {
        const visitedBlocks = new Set();
        const traversedNode = this.dependencies.selection.getTraversedNodes();
        let isAlignmentUpdated = false;
        for (const node of traversedNode) {
            if (isVisibleTextNode(node)) {
                const block = closestBlock(node);
                if (!visitedBlocks.has(block)) {
                    const currentTextAlign = this.getTextAlign(block);
                    if (currentTextAlign !== mode && block.isContentEditable) {
                        block.style.textAlign = mode;
                        isAlignmentUpdated = true;
                    }
                    visitedBlocks.add(block);
                }
            }
        }
        if (isAlignmentUpdated) {
            this.dependencies.history.addStep();
        }
    }

    getTextAlign(block) {
        const { direction, textAlign } = getComputedStyle(block);
        if (textAlign === "start") {
            return direction === "rtl" ? "right" : "left";
        } else if (textAlign === "end") {
            return direction === "rtl" ? "left" : "right";
        }
        return textAlign;
    }

    updateAlignmentParams() {
        this.alignment.displayName = this.alignmentMode;
    }
}
