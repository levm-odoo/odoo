import { Editor } from "@html_editor/editor";
import { MAIN_PLUGINS } from "@html_editor/plugin_sets";
import {
    Component,
    EventBus,
    onMounted,
    onWillDestroy,
    onWillStart,
    useRef,
    useState,
    useSubEnv,
} from "@odoo/owl";
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";
import { registry } from "@web/core/registry";
import { BuilderOverlayPlugin } from "./plugins/builder_overlay/builder_overlay_plugin";
import { DropZonePlugin } from "./plugins/drop_zone_plugin";
import { BuilderOptionsPlugin } from "./plugins/builder_options_plugin";
import { HandleDirtyElementPlugin } from "./plugins/handle_dirty_element_plugin";
import { MediaWebsitePlugin } from "./plugins/media_website_plugin";
import { SetupEditorPlugin } from "./plugins/setup_editor_plugin";
import { SnippetModel } from "./snippet_model";
import { BlockTab, blockTab } from "./snippets_menu_tabs/block_tab";
import { CustomizeTab, customizeTab } from "./snippets_menu_tabs/customize_tab";
import { InvisibleElementsPanel } from "./snippets_menu_tabs/invisible_elements_panel";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { addLoadingEffect as addButtonLoadingEffect } from "@web/core/utils/ui";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { useSetupAction } from "@web/search/action_hook";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { BuilderActionsPlugin } from "./plugins/builder_actions_plugin";

const BUILDER_PLUGIN = [
    BuilderOptionsPlugin,
    BuilderActionsPlugin,
    BuilderOverlayPlugin,
    DropZonePlugin,
    MediaWebsitePlugin,
    SetupEditorPlugin,
    HandleDirtyElementPlugin,
];

// todo: Why is it called SnippetsMenu? Should we rename it to BuilderSidebar?
export class SnippetsMenu extends Component {
    static template = "html_builder.SnippetsMenu";
    static components = { BlockTab, CustomizeTab, InvisibleElementsPanel };
    static props = {
        closeEditor: { type: Function },
        snippetsName: { type: String },
        toggleMobile: { type: Function },
        overlayRef: { type: Function },
        isTranslation: { type: Boolean },
        iframeLoaded: { type: Object },
    };

    setup() {
        // const actionService = useService("action");
        this.pages = [blockTab, customizeTab];
        this.snippetsMenu = useRef("snippetsMenu");
        this.state = useState({
            canUndo: false,
            canRedo: false,
            activeTab: this.props.isTranslation ? "customize" : "blocks",
            currentOptionsContainers: undefined,
            invisibleEls: [],
        });
        useHotkey("control+z", () => this.undo());
        useHotkey("control+y", () => this.redo());
        useHotkey("control+shift+z", () => this.redo());
        this.websiteService = useService("website");
        this.orm = useService("orm");
        this.dialog = useService("dialog");
        this.ui = useService("ui");
        // TODO: modify this selector when the mobile version is implemented
        this.invisibleSelector =
            ".o_snippet_invisible, .o_snippet_mobile_invisible, .o_snippet_desktop_invisible";

        const editorBus = new EventBus();
        // TODO: maybe do a different config for the translate mode and the
        // "regular" mode.
        const websitePlugins = registry.category("website-plugins").getAll();
        this.editor = new Editor(
            {
                Plugins: [...MAIN_PLUGINS, ...BUILDER_PLUGIN, ...websitePlugins],
                onChange: () => {
                    this.state.canUndo = this.editor.shared.history.canUndo();
                    this.state.canRedo = this.editor.shared.history.canRedo();
                    this.updateInvisibleEls();
                    editorBus.trigger("UPDATE_EDITING_ELEMENT");
                    editorBus.trigger("STEP_ADDED");
                },
                resources: {
                    change_current_options_containers_listeners: (currentOptionsContainers) => {
                        this.state.currentOptionsContainers = currentOptionsContainers;
                        this.setTab("customize");
                    },
                    unsplittable_node_predicates: (node) =>
                        node.querySelector("[data-oe-translation-source-sha]"),
                },
                getRecordInfo: (editableEl) => {
                    if (!editableEl) {
                        editableEl = closestElement(
                            this.editor.shared.selection.getEditableSelection().anchorNode
                        );
                    }
                    return {
                        resModel: editableEl.dataset["oeModel"],
                        resId: editableEl.dataset["oeId"],
                        field: editableEl.dataset["oeField"],
                        type: editableEl.dataset["oeType"],
                    };
                },
                localOverlayContainers: {
                    key: this.env.localOverlayContainerKey,
                    ref: this.props.overlayRef,
                },
            },
            this.env.services
        );

        this.snippetModel = useState(
            new SnippetModel(this.env.services, {
                snippetsName: this.props.snippetsName,
            })
        );

        onWillStart(async () => {
            await this.snippetModel.load();
            // Ensure that the iframe is loaded and the editor is created before
            // instantiating the sub components that potentially need the
            // editor.
            const iframeEl = await this.props.iframeLoaded;
            this.editor.attachTo(iframeEl.contentDocument.body.querySelector("#wrapwrap"));
        });

        useSubEnv({
            editor: this.editor,
            editorBus,
        });
        // onMounted(() => {
        //     // actionService.setActionMode("fullscreen");
        // });
        onWillDestroy(() => {
            this.editor.destroy();
            // actionService.setActionMode("current");
        });

        useSetupAction({
            beforeUnload: (ev) => this.onBeforeUnload(ev),
            beforeLeave: () => this.onBeforeLeave(),
        });

        onMounted(() => {
            // TODO: onload editor
            this.updateInvisibleEls();
        });
    }

    discard() {
        if (this.editor.shared.dirty.isEditableDirty()) {
            this.dialog.add(ConfirmationDialog, {
                body: _t(
                    "If you discard the current edits, all unsaved changes will be lost. You can cancel to return to edit mode."
                ),
                confirm: () => this.props.closeEditor(),
                cancel: () => {},
            });
        } else {
            this.props.closeEditor();
        }
    }

    async save() {
        this.isSaving = true;
        // TODO: handle the urgent save and the fail of the save operation
        const snippetMenuEl = this.snippetsMenu.el;
        // Add a loading effect on the save button and disable the other actions
        addButtonLoadingEffect(snippetMenuEl.querySelector("[data-action='save']"));
        const actionButtonEls = snippetMenuEl.querySelectorAll("[data-action]");
        for (const actionButtonEl of actionButtonEls) {
            actionButtonEl.disabled = true;
        }
        // Save the pending images and the dirty elements
        const saveProms = [...this.editor.editable.querySelectorAll(".o_dirty")].map(
            async (dirtyEl) => {
                await this.editor.shared.media.savePendingImages(dirtyEl);
                const cleanedEl = this.editor.shared.dirty.handleDirtyElement(dirtyEl);
                if (this.props.isTranslation) {
                    await this.saveTranslationElement(cleanedEl);
                } else {
                    await this.saveView(cleanedEl);
                }
            }
        );
        await Promise.all(saveProms);
        this.props.closeEditor();
    }

    setTab(tab) {
        this.state.activeTab = tab;
    }

    undo() {
        this.editor.shared.history.undo();
    }

    redo() {
        this.editor.shared.history.redo();
    }

    /**
     * Saves one (dirty) element of the page.
     *
     * @param {HTMLElement} el - the element to save.
     */
    async saveView(el) {
        const viewID = Number(el.dataset["oeId"]);
        const result = this.orm.call(
            "ir.ui.view",
            "save",
            [viewID, el.outerHTML, (!el.dataset["oeExpression"] && el.dataset["oeXpath"]) || null],
            {
                context: {
                    website_id: this.websiteService.currentWebsite.id,
                    lang: this.websiteService.currentWebsite.metadata.lang,
                    // TODO: Restore the delay translation feature once it's
                    // fixed, see commit msg for more info.
                    delay_translations: false,
                },
            }
        );
        return result;
    }
    /**
     * If the element holds a translation, saves it. Otherwise, fallback to the
     * standard saving but with the lang kept.
     *
     * @param {HTMLElement} el - the element to save.
     */
    async saveTranslationElement(el) {
        if (el.dataset["oeTranslationSourceSha"]) {
            const translations = {};
            translations[this.websiteService.currentWebsite.metadata.lang] = {
                [el.dataset["oeTranslationSourceSha"]]: el.innerHTML,
            };
            return this.orm.call(el.dataset["oeModel"], "web_update_field_translations", [
                [Number(el.dataset["oeId"])],
                el.dataset["oeField"],
                translations,
            ]);
        }
        // TODO: check what we want to modify in translate mode
        return this.saveView(el);
    }

    onBeforeUnload(event) {
        if (!this.isSaving && this.editor.shared.dirty.isEditableDirty()) {
            event.preventDefault();
            event.returnValue = "Unsaved changes";
        }
    }

    async onBeforeLeave() {
        if (this.editor.shared.dirty.isEditableDirty()) {
            let continueProcess = true;
            await new Promise((resolve) => {
                this.dialog.add(ConfirmationDialog, {
                    body: _t("If you proceed, your changes will be lost"),
                    confirmLabel: _t("Continue"),
                    confirm: () => resolve(),
                    cancel: () => {
                        continueProcess = false;
                        resolve();
                    },
                });
            });
            return continueProcess;
        }
        return true;
    }

    onMobilePreviewClick() {
        this.props.toggleMobile();
        // TODO update invisible elements panel
    }

    updateInvisibleEls() {
        this.state.invisibleEls = [
            ...this.editor.editable.querySelectorAll(this.invisibleSelector),
        ];
    }
}

registry.category("lazy_components").add("website.SnippetsMenu", SnippetsMenu);
