import { Plugin } from "@html_editor/plugin";
import { reactive } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { uniqueId } from "@web/core/utils/functions";

export class BuilderOptionsPlugin extends Plugin {
    static id = "builder-options";
    static dependencies = ["selection", "overlay"];
    resources = {
        selectionchange_handlers: this.onSelectionChange.bind(this),
        step_added_handlers: this.updateOptionContainers.bind(this),
    };

    setup() {
        // todo: use resources instead of registry
        this.builderOptions = registry.category("sidebar-element-option").getAll();
        this.builderOptions.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
        this.addDomListener(this.editable, "pointerup", (e) => {
            if (!this.dependencies.selection.getEditableSelection().isCollapsed) {
                return;
            }
            this.changeSidebarTarget(e.target);
        });

        this.currentOptionsContainers = reactive([]);
    }

    onSelectionChange(selection) {
        if (selection.editableSelection.isCollapsed) {
            // Some elements are not selectable in the editor but still can be
            // a snippet. The selection will be put in the closest selectable element.
            // Therefore if the selection is collapsed, let the pointerup event handle
            return;
        }
        let selectionNode = selection.editableSelection.commonAncestorContainer;
        if (selectionNode.nodeType === Node.TEXT_NODE) {
            selectionNode = selectionNode.parentElement;
        }
        this.changeSidebarTarget(selectionNode);
    }

    getMapOptions() {
        const map = new Map();
        for (const option of this.builderOptions) {
            const { selector } = option;
            const elements = getClosestElements(this.currentSelectedElement, selector);
            for (const element of elements) {
                if (map.has(element)) {
                    map.get(element).push(option);
                } else {
                    map.set(element, [option]);
                }
            }
        }
        return map;
    }

    changeSidebarTarget(selectedElement) {
        this.currentSelectedElement = selectedElement;
        this.updateOptionContainers();
        for (const handler of this.getResource("change_current_options_containers_listeners")) {
            handler(this.currentOptionsContainers);
        }
        return;
    }

    updateOptionContainers() {
        const map = this.getMapOptions();
        const elementsWithContainer = new Set(
            this.currentOptionsContainers.map((optionsContainer) => optionsContainer.element)
        );

        for (const optionContainer of this.currentOptionsContainers) {
            for (const option of optionContainer.options) {
                option.isVisible = optionContainer.element.matches(option.selector);
            }
        }

        const elementsToAdd = [...map.keys()].filter((el) => !elementsWithContainer.has(el));
        for (const element of elementsToAdd) {
            const options = map.get(element);
            this.currentOptionsContainers.push({
                id: uniqueId(),
                options: this.getOptions(options),
                element,
            });
        }

        const elementsToRemove = [...elementsWithContainer].filter((el) => !map.has(el));
        for (const element of elementsToRemove) {
            const index = this.currentOptionsContainers.findIndex(
                (container) => element === container.element
            );
            this.currentOptionsContainers.splice(index, 1);
        }

        if (elementsToAdd.length) {
            this.currentOptionsContainers.sort((a, b) => (b.element.contains(a.element) ? 1 : -1));
        }
    }

    getOptions(options) {
        const optionsSet = new Set(options);
        return this.builderOptions.map((option) => ({
            ...option,
            isVisible: optionsSet.has(option),
        }));
    }
}

function getClosestElements(element, selector) {
    if (!element) {
        // TODO we should remove it
        return [];
    }
    const parent = element.closest(selector);
    return parent ? [parent, ...getClosestElements(parent.parentElement, selector)] : [];
}
