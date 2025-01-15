import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { uniqueId } from "@web/core/utils/functions";
import { Reactive } from "@web/core/utils/reactive";
import { escape } from "@web/core/utils/strings";
import { rpc } from "@web/core/network/rpc";
import { AddSnippetDialog } from "@html_builder/builder/builder_sidebar/tabs/block_tab/add_snippet_dialog/add_snippet_dialog";
import { getContentEditableAreas } from "@html_builder/builder/utils/utils";

export class SnippetModel extends Reactive {
    constructor(services, { snippetsName, installSnippetModule, context }) {
        super();
        this.orm = services.orm;
        this.dialog = services.dialog;
        this.snippetsName = snippetsName;
        this.websiteService = services.website;
        this.installSnippetModule = installSnippetModule;
        this.context = context;

        this.snippetsByCategory = {
            snippet_groups: [],
            snippet_custom: [],
            snippet_structure: [],
            snippet_content: [],
            snippet_custom_content: [],
        };
    }

    get hasCustomGroup() {
        return !!this.snippetsByCategory.snippet_custom.length;
    }

    get snippetGroups() {
        const snippetGroups = this.snippetsByCategory.snippet_groups;
        if (this.hasCustomGroup) {
            return snippetGroups;
        }
        return snippetGroups.filter((snippet) => snippet.groupName !== "custom");
    }

    get snippetStructures() {
        return [
            ...this.snippetsByCategory.snippet_structure,
            ...this.snippetsByCategory.snippet_custom,
        ];
    }

    get snippetInnerContents() {
        return this.snippetsByCategory.snippet_content;
    }

    get hasCustomInnerContents() {
        return !!this.snippetsByCategory.snippet_custom_content.length;
    }

    get snippetCustomInnerContents() {
        return this.snippetsByCategory.snippet_custom_content;
    }

    isCustomInnerContent(customSnippet) {
        const customSnippetName = customSnippet.name.startsWith("s_button_")
            ? "s_button"
            : customSnippet.name;
        return !!this.snippetsByCategory.snippet_content.find(
            (snippet) => snippet.name === customSnippetName
        );
    }

    getSnippet(category, id) {
        return this.snippetsByCategory[category].filter((snippet) => snippet.id === id)[0];
    }

    async load() {
        const html = await this.orm.silent.call(
            "ir.ui.view",
            "render_public_asset",
            [this.snippetsName, {}],
            {
                context: {
                    rendering_bundle: true,
                    website_id: this.websiteService.currentWebsite.id,
                },
            }
        );
        const snippetsDocument = new DOMParser().parseFromString(html, "text/html");
        this.computeSnippetTemplates(snippetsDocument);
        this.setSnippetName(snippetsDocument);
    }

    computeSnippetTemplates(snippetsDocument) {
        const snippetsBody = snippetsDocument.body;
        this.snippetsByCategory = {};
        for (const snippetCategory of snippetsBody.querySelectorAll("snippets")) {
            const snippets = [];
            for (const snippetEl of snippetCategory.children) {
                const snippet = {
                    id: uniqueId(),
                    title: snippetEl.getAttribute("name"),
                    name: snippetEl.children[0].dataset.snippet,
                    thumbnailSrc: escape(snippetEl.dataset.oeThumbnail),
                    isCustom: false,
                    imagePreviewSrc: snippetEl.dataset.oImagePreview,
                };
                const moduleId = snippetEl.dataset.moduleId;
                if (moduleId) {
                    Object.assign(snippet, {
                        moduleId,
                    });
                } else {
                    Object.assign(snippet, {
                        content: snippetEl.children[0],
                        viewId: parseInt(snippetEl.dataset.oeSnippetId),
                    });
                }
                switch (snippetCategory.id) {
                    case "snippet_groups":
                        snippet.groupName = snippetEl.dataset.oSnippetGroup;
                        break;
                    case "snippet_structure":
                        snippet.groupName = snippetEl.dataset.oGroup;
                        snippet.keyWords = snippetEl.dataset.oeKeywords;
                        break;
                    case "snippet_custom":
                        snippet.groupName = "custom";
                        snippet.isCustom = true;
                        break;
                }
                snippets.push(snippet);
            }
            this.snippetsByCategory[snippetCategory.id] = snippets;
        }

        // Extract the custom inner content from the custom snippets.
        const customInnerContent = [];
        const customSnippets = this.snippetsByCategory["snippet_custom"];
        for (let i = customSnippets.length - 1; i >= 0; i--) {
            const snippet = customSnippets[i];
            if (this.isCustomInnerContent(snippet)) {
                customInnerContent.unshift(snippet);
                customSnippets.splice(i, 1);
            }
        }
        this.snippetsByCategory["snippet_custom_content"] = customInnerContent;
    }

    async deleteCustomSnippet(snippet) {
        return new Promise((resolve) => {
            const message = _t("Are you sure you want to delete the block %s?", snippet.title);
            this.dialog.add(
                ConfirmationDialog,
                {
                    body: message,
                    confirm: async () => {
                        const isInnerContent =
                            this.snippetsByCategory.snippet_custom_content.includes(snippet);
                        const snippetCustom = isInnerContent
                            ? this.snippetsByCategory.snippet_custom_content
                            : this.snippetsByCategory.snippet_custom;
                        const index = snippetCustom.findIndex((s) => s.id === snippet.id);
                        if (index > -1) {
                            snippetCustom.splice(index, 1);
                        }
                        await this.orm.call("ir.ui.view", "delete_snippet", [], {
                            view_id: snippet.viewId,
                            template_key: this.snippetsName,
                        });
                    },
                    cancel: () => {},
                    confirmLabel: _t("Yes"),
                    cancelLabel: _t("No"),
                },
                {
                    onClose: resolve,
                }
            );
        });
    }

    async renameCustomSnippet(snippet, newName) {
        if (newName === snippet.title) {
            return;
        }
        snippet.title = newName;
        await this.orm.call("ir.ui.view", "rename_snippet", [], {
            name: newName,
            view_id: snippet.viewId,
            template_key: this.snippetsName,
        });
    }

    setSnippetName(snippetsDocument) {
        // TODO: this should probably be done in py
        for (const snippetEl of snippetsDocument.body.querySelectorAll("snippets > *")) {
            snippetEl.children[0].dataset["name"] = snippetEl.getAttribute("name");
        }
    }

    /**
     * Returns the original snippet based on the given `data-snippet` attribute.
     *
     * @param {String} dataSnippet the `data-snippet` attribute of the snippet.
     * @returns
     */
    getOriginalSnippet(dataSnippet) {
        return [...this.snippetStructures, ...this.snippetInnerContents].find(
            (snippet) => snippet.name === dataSnippet
        );
    }

    /**
     * Returns the snippet thumbnail URL.
     *
     * @param {String} dataSnippet the `data-snippet` attribute of the snippet.
     * @returns
     */
    getSnippetThumbnailURL(dataSnippet) {
        const originalSnippet = this.getOriginalSnippet(dataSnippet);
        return originalSnippet.thumbnailSrc;
    }

    async replaceSnippet(snippetToReplace) {
        // Find the original snippet to open the dialog on the same group.
        const originalSnippet = this.getOriginalSnippet(snippetToReplace.dataset.snippet);
        let newSnippet;
        await new Promise((resolve) => {
            this.dialog.add(
                AddSnippetDialog,
                {
                    selectedSnippet: originalSnippet,
                    snippetModel: this,
                    selectSnippet: (selectedSnippet) => {
                        newSnippet = selectedSnippet.content.cloneNode(true);
                        snippetToReplace.replaceWith(newSnippet);
                    },
                    installModule: this.installSnippetModule,
                },
                { onClose: () => resolve() }
            );
        });
        return newSnippet;
    }

    saveSnippet(snippetEl, editable) {
        return new Promise((resolve) => {
            this.dialog.add(ConfirmationDialog, {
                body: _t(
                    "To save a snippet, we need to save all your previous modifications and reload the page."
                ),
                cancel: () => resolve(),
                confirmLabel: _t("Save and Reload"),
                confirm: async () => {
                    let snippetCopyEl = null;
                    const isButton = snippetEl.matches("a.btn");
                    const snippetKey = isButton ? "s_button" : snippetEl.dataset.snippet;
                    const thumbnailURL = this.getSnippetThumbnailURL(snippetKey);

                    if (snippetEl.matches(".s_popup")) {
                        // Do not "cleanForSave" the popup before copying the
                        // HTML, otherwise the popup will be saved invisible and
                        // therefore not visible in the "add snippet" dialog.
                        snippetCopyEl = snippetEl.cloneNode(true);
                    }

                    // TODO request_save + reload editor

                    const defaultSnippetName = isButton
                        ? _t("Custom Button")
                        : _t("Custom %s", snippetEl.dataset.name);
                    snippetCopyEl = snippetCopyEl || snippetEl.cloneNode(true);
                    snippetCopyEl.classList.add("s_custom_snippet");
                    delete snippetCopyEl.dataset.name;
                    if (isButton) {
                        snippetCopyEl.classList.remove("mb-2");
                        snippetCopyEl.classList.add("o_snippet_drop_in_only", "s_custom_button");
                    }

                    // Get editable parent TODO find proper method to get it directly
                    let editableParentEl;
                    for (const editableEl of getContentEditableAreas(editable)) {
                        if (editableEl.contains(snippetEl)) {
                            editableParentEl = editableEl;
                            break;
                        }
                    }

                    this.context["model"] = editableParentEl.dataset.oeModel;
                    this.context["field"] = editableParentEl.dataset.oeField;
                    this.context["resId"] = editableParentEl.dataset.oeId;
                    await rpc("/web/dataset/call_kw/ir.ui.view/save_snippet", {
                        model: "ir.ui.view",
                        method: "save_snippet",
                        args: [],
                        kwargs: {
                            name: defaultSnippetName,
                            arch: snippetCopyEl.outerHTML,
                            template_key: this.snippetsName,
                            snippet_key: snippetKey,
                            thumbnail_url: thumbnailURL,
                            context: this.context,
                        },
                    });
                    resolve();
                },
            });
        });
    }
}
