import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import hbUtils from "@html_builder/builder/utils/utils_css";

class CoreBuilderActionPlugin extends Plugin {
    static id = "CoreBuilderAction";
    resources = {
        builder_actions: coreBuilderActions,
    };
}
registry.category("website-plugins").add(CoreBuilderActionPlugin.id, CoreBuilderActionPlugin);

const applyStyleAction = ({ editingElement, param: styleName, value, unit }) => {
    // Always reset the inline style first to not put inline style on an
    // element which already has this style through css stylesheets.
    const cssProps = hbUtils.CSS_SHORTHANDS[styleName] || [styleName];
    for (const cssProp of cssProps) {
        editingElement.style.setProperty(cssProp, "");
    }
    const customStyle = styleMap[styleName];
    if (customStyle) {
        customStyle?.apply(editingElement, value);
    } else {
        value = value + (unit ? unit : "");
        const styles = window.getComputedStyle(editingElement);
        if (!hbUtils.areCssValuesEqual(styles.getPropertyValue(styleName), value, styleName)) {
            editingElement.style.setProperty(styleName, value);
        }
    }
};

function getNumericStyle(styleName) {
    return {
        getValue: (editingElement) =>
            parseInt(getComputedStyle(editingElement).getPropertyValue(styleName)).toString(),
        apply: (editingElement, value) => {
            editingElement.style.setProperty(styleName, `${parseInt(value)}px`, "important");
        },
    };
}

const styleMap = {
    borderWidth: {
        getValue: (editingElement) =>
            parseInt(getComputedStyle(editingElement).getPropertyValue("border-width")).toString(),
        apply: (editingElement, value) => {
            const parsedValue = parseInt(value);
            const hasBorderClass = editingElement.classList.contains("border");
            if (!parsedValue || parsedValue < 0) {
                if (hasBorderClass) {
                    editingElement.classList.remove("border");
                }
            } else {
                if (!hasBorderClass) {
                    editingElement.classList.add("border");
                }
            }
            editingElement.style.setProperty("border-width", `${parsedValue}px`, "important");
        },
    },
    // todo: handle all the other styles
    padding: getNumericStyle("padding"),
};

export const coreBuilderActions = {
    classAction: {
        getPriority: ({ param: classNames = "" }) =>
            classNames?.trim().split(/\s+/).filter(Boolean).length || 0,
        isApplied: ({ editingElement, param: classNames }) => {
            if (classNames === "") {
                return true;
            }
            return classNames
                .split(" ")
                .every((className) => editingElement.classList.contains(className));
        },
        apply: ({ editingElement, param: classNames }) => {
            for (const className of classNames.split(" ")) {
                if (className !== "") {
                    editingElement.classList.add(className);
                }
            }
        },
        clean: ({ editingElement, param: classNames }) => {
            for (const className of classNames.split(" ")) {
                if (className !== "") {
                    editingElement.classList.remove(className);
                }
            }
        },
    },
    styleAction: {
        getValue: ({ editingElement, param: styleName, unit }) => {
            const customStyle = styleMap[styleName];
            if (customStyle) {
                return customStyle.getValue(editingElement);
            } else {
                let value = getComputedStyle(editingElement).getPropertyValue(styleName);
                value = value.replace(unit, "");
                if (!isNaN(value)) {
                    return parseInt(value);
                }
                return value;
            }
        },
        apply: applyStyleAction,
        clean: applyStyleAction,
        isApplied: ({ editingElement, param: styleName, value, unit }) => {
            if (!value) {
                return false;
            }
            value = value + (unit ? unit : "");
            const styles = window.getComputedStyle(editingElement);
            return hbUtils.areCssValuesEqual(styles.getPropertyValue(styleName), value, styleName);
        },
    },
    attributeAction: {
        getValue: ({ editingElement, param: attributeName }) =>
            editingElement.getAttribute(attributeName),
        isApplied: ({ editingElement, param: attributeName, value }) => {
            if (value) {
                return (
                    editingElement.hasAttribute(attributeName) &&
                    editingElement.getAttribute(attributeName) === value
                );
            } else {
                return !editingElement.hasAttribute(attributeName);
            }
        },
        apply: ({ editingElement, param: attributeName, value }) => {
            if (value) {
                editingElement.setAttribute(attributeName, value);
            } else {
                editingElement.removeAttribute(attributeName);
            }
        },
        clean: ({ editingElement, param: attributeName }) => {
            editingElement.removeAttribute(attributeName);
        },
    },
};
