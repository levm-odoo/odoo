import {
    useEditableDescendants,
    useEmbeddedState,
    StateChangeManager,
    applyObjectPropertyDifference,
} from "@html_editor/others/embedded_component_utils";
import { Component, useRef, useState, xml } from "@odoo/owl";

export class Counter extends Component {
    static props = ["*"];
    static template = xml`
        <span t-ref="root" class="counter" t-on-click="increment">Counter:<t t-esc="state.value"/></span>`;

    state = useState({ value: 0 });
    ref = useRef("root");

    increment() {
        this.state.value++;
    }
}

export const EmbeddedWrapperMixin = (editableDescendantName) =>
    class extends Component {
        static props = ["*"];
        static template = xml`<t><div class="${editableDescendantName}" t-ref="${editableDescendantName}"/></t>`;

        setup() {
            useEditableDescendants(this.props.host);
        }
    };

export class EmbeddedWrapper extends Component {
    static props = ["*"];
    static template = xml`
        <t>
            <div t-if="editableDescendants.shallow" class="shallow" t-ref="shallow"/>
            <div t-if="!state.switch">
                <div class="deep" t-ref="deep"/>
            </div>
            <div t-else="">
                <div class="switched">
                    <div class="deep" t-ref="deep"/>
                </div>
            </div>
        </t>`;

    setup() {
        this.editableDescendants = useEditableDescendants(this.props.host);
        this.state = useState({
            switch: false,
        });
    }
}

export class OffsetCounter extends Component {
    static props = ["*"];
    static template = xml`
        <span class="counter" t-on-click="increment">Counter:<t t-esc="counterValue"/></span>`;

    setup() {
        this.embeddedState = useEmbeddedState(this.props.host);
        this.state = useState({
            value: 0,
        });
    }

    get counterValue() {
        return this.state.value + this.embeddedState.baseValue;
    }

    increment() {
        this.state.value++;
    }
}

export const offsetCounter = {
    name: "counter",
    Component: OffsetCounter,
    getProps: (host) => ({ host }),
    StateChangeManager,
    stateChangeManagerConfig: {
        propertyUpdater: {
            baseValue: (state, previous, next) => {
                const offset = next.baseValue - previous.baseValue;
                state.baseValue += offset;
            },
        },
    },
};

export class SavedCounter extends Component {
    static props = ["*"];
    static template = xml`
        <span class="counter" t-on-click="increment">Counter:<t t-esc="counterValue"/></span>`;

    setup() {
        this.embeddedState = useEmbeddedState(this.props.host);
    }

    get counterValue() {
        return this.embeddedState.value || 0;
    }

    increment() {
        if (!this.embeddedState.value) {
            this.embeddedState.value = 0;
        }
        this.embeddedState.value++;
    }
}

export const savedCounter = {
    name: "counter",
    Component: SavedCounter,
    getProps: (host) => ({ host }),
    StateChangeManager,
};

export class CollaborativeObject extends Component {
    static props = ["*"];
    static template = xml`
        <div class="obj"><t t-esc="collaborativeObject"/></div>`;

    setup() {
        this.embeddedState = useEmbeddedState(this.props.host);
    }

    get collaborativeObject() {
        return Object.entries(this.embeddedState.obj || {})
            .map(([key, value]) => `${key}_${value}`)
            .join(",");
    }
}

export const collaborativeObject = {
    name: "obj",
    Component: CollaborativeObject,
    getProps: (host) => ({ host }),
    StateChangeManager,
    stateChangeManagerConfig: {
        propertyUpdater: {
            obj: (state, previous, next) => {
                applyObjectPropertyDifference(state, "obj", previous.obj, next.obj);
            },
        },
    },
};

export function embedding(
    name,
    Component,
    getProps = undefined,
    { getEditableDescendants, StateChangeManager, stateChangeManagerConfig } = {}
) {
    return {
        name,
        Component,
        ...(getProps ? { getProps } : {}),
        ...arguments[3],
    };
}
