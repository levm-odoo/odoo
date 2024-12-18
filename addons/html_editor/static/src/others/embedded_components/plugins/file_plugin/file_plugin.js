import { _t } from "@web/core/l10n/translation";
import { nextLeaf } from "@html_editor/utils/dom_info";
import { isBlock } from "@html_editor/utils/blocks";
import { renderFileCard } from "./utils";
import { FileDocumentsSelector } from "./file_documents_selector";
import { DocumentPlugin } from "@html_editor/others/document_plugin";
import { closestElement } from "@html_editor/utils/dom_traversal";

/** @typedef {import("@html_editor/core/selection_plugin").Cursors} Cursors */

const fileMediaDialogTab = {
    id: "FILES",
    title: _t("Documents"),
    Component: FileDocumentsSelector,
    sequence: 15,
};

/**
 * This plugin is meant to replace the Document plugin.
 */
export class FilePlugin extends DocumentPlugin {
    static id = "file";
    static dependencies = [...super.dependencies, "embeddedComponents", "selection"];

    constructor(...args) {
        super(...args);
        // Extend resources
        this.resources = {
            ...this.resources,
            user_commands: {
                ...this.resources.user_commands,
                isAvailable: ({ anchorNode }) =>
                    !this.config.disableFile &&
                    !closestElement(anchorNode, "[data-embedded='clipboard']"),
            },
            mount_component_handlers: this.setupNewFile.bind(this),
            media_dialog_tabs_providers: () =>
                this.config.disableFile ? [] : [fileMediaDialogTab],
            selectors_for_feff_providers: () => "[data-embedded='file']",
        };
    }

    /** @override */
    renderFileBanner(attachment) {
        return renderFileCard(attachment);
    }

    setupNewFile({ name, env }) {
        if (name === "file") {
            Object.assign(env, {
                editorShared: {
                    setSelectionAfter: (host) => {
                        try {
                            const leaf = nextLeaf(host, this.editable);
                            if (!leaf) {
                                return;
                            }
                            const leafEl = isBlock(leaf) ? leaf : leaf.parentElement;
                            if (isBlock(leafEl) && leafEl.isContentEditable) {
                                this.dependencies.selection.setSelection({
                                    anchorNode: leafEl,
                                    anchorOffset: 0,
                                });
                            }
                        } catch {
                            return;
                        }
                    },
                },
            });
        }
    }
}
