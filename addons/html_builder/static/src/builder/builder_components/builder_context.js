import { Component, xml } from "@odoo/owl";
import {
    basicContainerBuilderComponentProps,
    BuilderComponent,
    useBuilderComponent,
} from "./utils";

export class BuilderContext extends Component {
    static template = xml`
        <BuilderComponent dependencies="props.dependencies">
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
