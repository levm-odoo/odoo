export const BASE_CONTAINER_CLASS = "o-paragraph";

export const SUPPORTED_BASE_CONTAINER_NAMES = ["P", "DIV"];

export class BaseContainerFactory {
    static selector;

    constructor(nodeName, document = null) {
        if (!document && window) {
            document = window.document;
        }
        this.document = document;
        // Default technical value is "P" (for tests and semantics).
        // See "baseContainer" html_field config property for the functional default.
        this.nodeName =
            nodeName && SUPPORTED_BASE_CONTAINER_NAMES.includes(nodeName) ? nodeName : "P";
        this.classSet = new Set();
        if (this.nodeName !== "P") {
            this.classSet.add(BASE_CONTAINER_CLASS);
        }
    }

    get class() {
        return [...this.classSet].join(" ");
    }

    get selector() {
        return `${this.nodeName}${this.classSet.size ? "." : ""}${[...this.classSet].join(".")}`;
    }

    get tagName() {
        return this.nodeName;
    }

    create(document = this.document) {
        if (!document && window) {
            document = window.document;
            this.document = document;
        }
        const el = document.createElement(this.nodeName);
        if (this.classSet.size) {
            el.setAttribute("class", this.class);
        }
        return el;
    }
}

BaseContainerFactory.selector = SUPPORTED_BASE_CONTAINER_NAMES.map(
    (name) => new BaseContainerFactory(name).selector
).join(",");
