import { Component } from "@odoo/owl";
import {
    basicContainerBuilderComponentProps,
    useInputBuilderComponent,
    useBuilderComponent,
    useDependencyDefinition,
    BuilderComponent,
} from "./utils";

export class BuilderNumberInput extends Component {
    static template = "html_builder.BuilderNumberInput";
    static props = {
        ...basicContainerBuilderComponentProps,
        unit: { type: String, optional: true },
        id: { type: String, optional: true },
    };
    static components = { BuilderComponent };

    setup() {
        useBuilderComponent();
        const { state, onChange, onInput, isApplied, getActions } = useInputBuilderComponent();
        this.onChange = onChange;
        this.onInput = onInput;
        this.state = state;
        if (this.props.id) {
            useDependencyDefinition(this.props.id, { isActive: isApplied, getActions });
        }
    }
}
