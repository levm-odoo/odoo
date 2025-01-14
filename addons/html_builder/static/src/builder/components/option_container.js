import { Component, useSubEnv } from "@odoo/owl";
import { defaultBuilderComponents } from "../builder_components/default_builder_components";
import { useVisibilityObserver, useApplyVisibility } from "../builder_components/utils";
import { DependencyManager } from "../plugins/dependency_manager";
import { getSnippetName } from "@html_builder/builder/utils/utils";

export class OptionsContainer extends Component {
    static template = "html_builder.OptionsContainer";
    static components = { ...defaultBuilderComponents };
    static props = {
        snippetModel: { type: Object },
        options: { type: Array },
        editingElement: true, // HTMLElement from iframe
        isRemovable: false,
    };

    setup() {
        useSubEnv({
            dependencyManager: new DependencyManager(),
            getEditingElement: () => this.props.editingElement,
            getEditingElements: () => [this.props.editingElement],
            weContext: {},
        });
        useVisibilityObserver("content", useApplyVisibility("root"));
    }

    get title() {
        return getSnippetName(this.env.getEditingElement());
    }

    // Checks if the element can be saved as a custom snippet.
    get isSavable() {
        const selector = "[data-snippet], a.btn";
        // TODO `so_submit_button_selector` ?
        const exclude = ".o_no_save, .s_donation_donate_btn, .s_website_form_send";
        const el = this.props.editingElement;
        return el.matches(selector) && !el.matches(exclude);
    }

    selectElement() {
        this.env.editor.shared["builder-options"].updateContainers(this.props.editingElement);
    }

    toggleOverlayPreview(el, show) {
        if (show) {
            this.env.editor.shared.overlayButtons.hideOverlayButtons();
            this.env.editor.shared.builderOverlay.showOverlayPreview(el);
        } else {
            this.env.editor.shared.overlayButtons.showOverlayButtons();
            this.env.editor.shared.builderOverlay.hideOverlayPreview(el);
        }
    }

    onMouseEnter() {
        this.toggleOverlayPreview(this.props.editingElement, true);
    }

    onMouseLeave() {
        this.toggleOverlayPreview(this.props.editingElement, false);
    }

    // Actions of the buttons in the title bar.
    removeElement() {
        this.env.editor.shared.remove.removeElement(this.props.editingElement);
    }

    cloneElement() {
        this.env.editor.shared.clone.cloneElement(this.props.editingElement);
    }

    async saveSnippet() {
        await this.props.snippetModel.saveSnippet(
            this.props.editingElement,
            this.env.editor.editable
        );
    }
}
