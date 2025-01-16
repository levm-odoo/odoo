import { Component } from "@odoo/owl";
import {
    basicContainerBuilderComponentProps,
    useInputBuilderComponent,
    useBuilderComponent,
    BuilderComponent,
} from "./utils";

export class BuilderNumberInput extends Component {
    static template = "html_builder.BuilderNumberInput";
    static props = {
        ...basicContainerBuilderComponentProps,
        default: { type: Number, optional: true },
        unit: { type: String, optional: true },
    };
    static components = { BuilderComponent };

    setup() {
        useBuilderComponent();
        const { state, onChange, onInput } = useInputBuilderComponent();
        this.onChange = (e) => {
            if (e.target.value === "") {
                e.target.value = this.props.default;
                return;
            }
            onChange(e);
        };
        this.onInput = onInput;
        this.state = state;
    }
}
