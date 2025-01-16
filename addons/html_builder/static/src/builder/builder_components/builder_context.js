import { Component, xml } from "@odoo/owl";
import {
    basicContainerBuilderComponentProps,
    BuilderComponent,
    useBuilderComponent,
} from "./utils";

export class BuilderContext extends Component {
    static template = xml`
        <BuilderComponent isVisible="props.isVisible">
            <t t-slot="default"/>
        </BuilderComponent>
    `;
    static props = {
        ...basicContainerBuilderComponentProps,
        slots: { type: Object },
    };
    static components = {
        BuilderComponent,
    };

    setup() {
        useBuilderComponent();
    }
}
