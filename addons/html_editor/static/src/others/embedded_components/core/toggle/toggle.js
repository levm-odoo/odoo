import {
    getEditableDescendants,
    getEmbeddedProps,
    useEditableDescendants,
} from "@html_editor/others/embedded_component_utils";
import { browser } from "@web/core/browser/browser";
import { Component, useState } from "@odoo/owl";

const localStorage = browser.localStorage;
export class EmbeddedToggleComponent extends Component {
    static template = "html_editor.EmbeddedToggle";
    static props = {
        host: { type: Object },
        toggleId: { type: String },
    };

    setup() {
        useEditableDescendants(this.props.host);
        this.state = useState({
            showContent: localStorage.getItem(this.toggleStorageKey) === "true",
        });
    }

    get toggleStorageKey() {
        return `html_editor.Toggle${this.props.toggleId}.showContent`;
    }

    updateState() {
        this.state.showContent = !this.state.showContent;
        localStorage.setItem(this.toggleStorageKey, this.state.showContent);
    }
}

export const toggleEmbedding = {
    name: "toggle",
    Component: EmbeddedToggleComponent,
    getProps: (host) => ({ host, ...getEmbeddedProps(host) }),
    getEditableDescendants: getEditableDescendants,
};
