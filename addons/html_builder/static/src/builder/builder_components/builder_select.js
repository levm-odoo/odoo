import { Component, EventBus, onMounted, useRef, useSubEnv } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import {
    basicContainerBuilderComponentProps,
    useVisibilityObserver,
    useApplyVisibility,
    useBuilderComponent,
    BuilderComponent,
} from "../builder_helpers";
import { useDropdownState } from "@web/core/dropdown/dropdown_hooks";
import { useBus } from "@web/core/utils/hooks";
import { useDebounced } from "@web/core/utils/timing";

export class BuilderSelect extends Component {
    static template = "html_builder.BuilderSelect";
    static props = {
        ...basicContainerBuilderComponentProps,
        slots: Object,
    };
    static components = {
        Dropdown,
        BuilderComponent,
    };

    setup() {
        const button = useRef("button");
        useBuilderComponent();
        useVisibilityObserver("content", useApplyVisibility("root"));
        this.dropdown = useDropdownState();
        const selectableItems = [];
        const setLabelDebounced = useDebounced(setLabel, 0);
        useSubEnv({
            actionBus: new EventBus(),
            BuilderSelectContext: {
                bus: new EventBus(),
                addSelectableItem: (item) => {
                    selectableItems.push(item);
                },
                removeSelectableItem: (item) => {
                    const index = selectableItems.indexOf(item);
                    if (index !== -1) {
                        selectableItems.splice(index, 1);
                    }
                },
                update: setLabelDebounced,
            },
        });
        function setLabel() {
            let item;
            let itemPriority = 0;
            for (const selectableItem of selectableItems) {
                if (selectableItem.isActive() && selectableItem.priority >= itemPriority) {
                    item = selectableItem;
                    itemPriority = selectableItem.priority;
                }
            }
            if (item) {
                button.el.innerHTML = item.getLabel();
            }
        }
        onMounted(setLabel);
        useBus(this.env.editorBus, "STEP_ADDED", (ev) => {
            if (ev.detail.isPreviewing) {
                return;
            }
            setLabel();
        });
        useBus(this.env.BuilderSelectContext.bus, "select-item", (item) => {
            this.dropdown.close();
        });
    }
}
