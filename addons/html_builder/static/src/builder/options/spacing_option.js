import { Component } from "@odoo/owl";
import { defaultOptionComponents } from "../builder_components/defaultComponents";
import { useDomState } from "../builder_helpers";

export class SpacingOption extends Component {
    static template = "html_builder.SpacingOption";
    static components = {
        ...defaultOptionComponents,
    };
    static props = {};

    setup() {
        this.target = this.env.getEditingElement().querySelector(".o_grid_mode");
        this.targetComputedStyle = getComputedStyle(this.target);

        this.state = useDomState(() => ({
            spacingX: parseInt(this.targetComputedStyle.columnGap),
            spacingY: parseInt(this.targetComputedStyle.rowGap),
        }));
    }
    previewSpacingX(spacing) {
        this.target.style["column-gap"] = `${spacing}px`;
    }
    previewSpacingY(spacing) {
        this.target.style["row-gap"] = `${spacing}px`;
    }
    changeSpacingX(spacing) {
        this.target.style["column-gap"] = `${spacing}px`;
        this.env.editor.shared.history.addStep();
    }
    changeSpacingY(spacing) {
        this.target.style["row-gap"] = `${spacing}px`;
        this.env.editor.shared.history.addStep();
    }
}
