import { Component, EventBus, useRef, useSubEnv } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import {
    basicContainerWeWidgetProps,
    useVisibleWithContent,
    useWeComponent,
    WeComponent,
} from "../builder_helpers";
import { useDropdownState } from "@web/core/dropdown/dropdown_hooks";
import { useBus } from "@web/core/utils/hooks";

export class WeSelect extends Component {
    static template = "html_builder.WeSelect";
    static props = {
        ...basicContainerWeWidgetProps,
        slots: Object,
    };
    static components = {
        Dropdown,
        WeComponent,
    };

    setup() {
        const button = useRef("button");
        useWeComponent();
        useVisibleWithContent("root", "content");
        this.dropdown = useDropdownState();
        useSubEnv({
            actionBus: new EventBus(),
            weSelectBus: new EventBus(),
            weSetSelectLabel: (labelHtml) => {
                button.el.innerHTML = labelHtml;
            },
        });
        useBus(this.env.weSelectBus, "select-item", (item) => {
            this.dropdown.close();
        });
    }
}
