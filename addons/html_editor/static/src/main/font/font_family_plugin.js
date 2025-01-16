import { Plugin } from "@html_editor/plugin";
import { _t } from "@web/core/l10n/translation";
import { FontFamilySelector } from "@html_editor/main/font/font_family_selector";
import { reactive } from "@odoo/owl";
import { closestElement } from "../../utils/dom_traversal";

export const fontFamilyItems = [
    { name: "Default system font", nameShort: "Default", fontFamily: false },
    { name: "Arial (sans-serif)", nameShort: "Arial", fontFamily: "Arial, sans-serif" },
    { name: "Verdana (sans-serif)", nameShort: "Verdana", fontFamily: "Verdana, sans-serif" },
    { name: "Tahoma (sans-serif)", nameShort: "Tahoma", fontFamily: "Tahoma, sans-serif" },
    {
        name: "Trebuchet MS (sans-serif)",
        nameShort: "Trebuchet",
        fontFamily: '"Trebuchet MS", sans-serif',
    },
    {
        name: "Courier New (monospace)",
        nameShort: "Courier",
        fontFamily: '"Courier New", monospace',
    },
];

export class FontFamilyPlugin extends Plugin {
    static id = "fontFamily";
    static dependencies = ["split", "selection", "dom", "format"];
    resources = {
        toolbar_items: [
            {
                id: "font-family",
                groupId: "font",
                title: _t("Font family"),
                Component: FontFamilySelector,
                props: {
                    getItems: () => fontFamilyItems,
                    getDisplay: () => this.fontFamily,
                    onSelected: (item) => {
                        this.dependencies.format.formatSelection("fontFamily", {
                            applyStyle: item.fontFamily !== false,
                            formatProps: { ...item },
                        });
                        this.fontFamily.displayName = item.nameShort;
                    },
                },
            },
        ],
        /** Handlers */
        selectionchange_handlers: this.updateCurrentFontFamily.bind(this),
        post_undo_handlers: this.updateCurrentFontFamily.bind(this),
        post_redo_handlers: this.updateCurrentFontFamily.bind(this),
    };

    setup() {
        this.fontFamily = reactive({ displayName: fontFamilyItems[0].nameShort });
    }

    updateCurrentFontFamily(ev) {
        const selelectionData = this.dependencies.selection.getSelectionData();
        if (!selelectionData.documentSelectionIsInEditable) {
            return;
        }
        const anchorElement = closestElement(selelectionData.editableSelection.anchorNode);
        const anchorElementFontFamily = anchorElement.style.fontFamily;

        if (anchorElementFontFamily) {
            for (const item of fontFamilyItems) {
                if (anchorElementFontFamily === item.fontFamily) {
                    this.fontFamily.displayName = item.nameShort;
                    return;
                }
            }
        }
        this.fontFamily.displayName = fontFamilyItems[0].nameShort;
    }
}
