import { Plugin } from "@html_editor/plugin";
import { isColorGradient, rgbToHex } from "@html_editor/utils/color";
import { fillEmpty } from "@html_editor/utils/dom";
import { isEmptyBlock, isWhitespace } from "@html_editor/utils/dom_info";
import { closestElement, descendants } from "@html_editor/utils/dom_traversal";
import { isCSSColor } from "@web/core/utils/colors";
import { ColorSelector } from "./color_selector";
import { reactive } from "@odoo/owl";

const TEXT_CLASSES_REGEX = /\btext-[^\s]*\b/;
const BG_CLASSES_REGEX = /\bbg-[^\s]*\b/;

/**
 * Returns true if the given element has a visible color (fore- or
 * -background depending on the given mode).
 *
 * @param {Element} element
 * @param {string} mode 'color' or 'backgroundColor'
 * @returns {boolean}
 */
function hasColor(element, mode) {
    const style = element.style;
    const parent = element.parentNode;
    const classRegex = mode === "color" ? TEXT_CLASSES_REGEX : BG_CLASSES_REGEX;
    if (isColorGradient(style["background-image"])) {
        if (element.classList.contains("text-gradient")) {
            if (mode === "color") {
                return true;
            }
        } else {
            if (mode !== "color") {
                return true;
            }
        }
    }
    return (
        (style[mode] &&
            style[mode] !== "inherit" &&
            (!parent || style[mode] !== parent.style[mode])) ||
        (classRegex.test(element.className) &&
            (!parent || getComputedStyle(element)[mode] !== getComputedStyle(parent)[mode]))
    );
}

export class ColorPlugin extends Plugin {
    static name = "color";
    static dependencies = ["selection", "split", "history", "zws"];
    static resources = (p) => ({
        toolbarGroup: {
            id: "color",
            sequence: 25,
            buttons: [
                {
                    id: "forecolor",
                    Component: ColorSelector,
                    props: {
                        type: "foreground",
                        getUsedCustomColors: () => p.getUsedCustomColors("color"),
                        getSelectedColors: () => p.selectedColors,
                    },
                },
                {
                    id: "backcolor",
                    Component: ColorSelector,
                    props: {
                        type: "background",
                        getUsedCustomColors: () => p.getUsedCustomColors("background"),
                        getSelectedColors: () => p.selectedColors,
                    },
                },
            ],
        },
        onSelectionChange: p.updateSelectedColor.bind(p),
    });

    setup() {
        this.selectedColors = reactive({ font: "", background: "" });
        this.previewableApplyColor = this.shared.makePreviewableOperation((color, mode) =>
            this.applyColor(color, mode)
        );
    }

    updateSelectedColor(selection) {
        const el = closestElement(selection.startContainer);
        if (!el) {
            return;
        }
        const elStyle = getComputedStyle(el);
        const backgroundImage = elStyle.backgroundImage;
        const hasGradient = isColorGradient(backgroundImage);
        const hasTextGradientClass = el.classList.contains("text-gradient");

        this.selectedColors.color =
            hasGradient && hasTextGradientClass ? backgroundImage : rgbToHex(elStyle.color);
        this.selectedColors.background =
            hasGradient && !hasTextGradientClass
                ? backgroundImage
                : rgbToHex(elStyle.backgroundColor);
    }

    handleCommand(command, payload) {
        switch (command) {
            case "APPLY_COLOR":
                this.previewableApplyColor.commit(payload.color, payload.mode);
                this.updateSelectedColor(this.shared.getEditableSelection());
                break;
            case "COLOR_PREVIEW":
                this.previewableApplyColor.preview(payload.color, payload.mode);
                this.updateSelectedColor(this.shared.getEditableSelection());
                break;
            case "COLOR_RESET_PREVIEW":
                this.previewableApplyColor.revert();
                this.updateSelectedColor(this.shared.getEditableSelection());
                break;
            case "FORMAT_REMOVE_FORMAT":
                this.removeAllColor();
                break;
        }
    }

    removeAllColor() {
        const selectedNodeHasColor = (mode) => {
            const selectionNodes = this.shared.getSelectedNodes();
            for (const node of selectionNodes) {
                if (hasColor(closestElement(node), mode)) {
                    return true;
                }
            }
            return false;
        };
        const colorModes = ["color", "backgroundColor"];
        let someColorWasRemoved = true;
        while (someColorWasRemoved) {
            someColorWasRemoved = false;
            for (const mode of colorModes) {
                while (selectedNodeHasColor(mode)) {
                    this.applyColor("", mode);
                    someColorWasRemoved = true;
                }
            }
        }
    }

    /**
     * Apply a css or class color on the current selection (wrapped in <font>).
     *
     * @param {string} color hexadecimal or bg-name/text-name class
     * @param {string} mode 'color' or 'backgroundColor'
     * @param {Element} [element]
     */
    applyColor(color, mode) {
        const selectedTds = [...this.editable.querySelectorAll("td.o_selected_td")].filter(
            (node) => closestElement(node).isContentEditable
        );
        if (selectedTds.length && mode === "backgroundColor") {
            for (const td of selectedTds) {
                this.colorElement(td, color, mode);
            }
        }

        let selection = this.shared.getEditableSelection();
        let selectionNodes;
        // Get the <font> nodes to color
        if (selection.isCollapsed) {
            let zws;
            if (
                selection.anchorNode.nodeType !== Node.TEXT_NODE &&
                selection.anchorNode.textContent !== "\u200b"
            ) {
                zws = selection.anchorNode;
            } else {
                zws = this.shared.insertAndSelectZws();
            }
            selection = this.shared.setSelection(
                {
                    anchorNode: zws,
                    anchorOffset: 0,
                },
                { normalize: false }
            );
            selectionNodes = [zws];
        } else {
            selection = this.shared.splitSelection();
            selectionNodes = this.shared
                .getSelectedNodes()
                .filter((node) => closestElement(node).isContentEditable);
            if (isEmptyBlock(selection.endContainer)) {
                selectionNodes.push(selection.endContainer, ...descendants(selection.endContainer));
            }
        }

        const selectedNodes =
            mode === "backgroundColor"
                ? selectionNodes.filter((node) => !closestElement(node, "table.o_selected_table"))
                : selectionNodes;

        const selectedFieldNodes = new Set(
            this.shared
                .getSelectedNodes()
                .map((n) => closestElement(n, "*[t-field],*[t-out],*[t-esc]"))
                .filter(Boolean)
        );

        const getFonts = (selectedNodes) => {
            return selectedNodes.flatMap((node) => {
                let font = closestElement(node, "font") || closestElement(node, "span");
                const children = font && descendants(font);
                if (
                    font &&
                    (font.nodeName === "FONT" || (font.nodeName === "SPAN" && font.style[mode]))
                ) {
                    // Partially selected <font>: split it.
                    const selectedChildren = children.filter((child) =>
                        selectedNodes.includes(child)
                    );
                    if (selectedChildren.length) {
                        font = this.shared.splitAroundUntil(selectedChildren, font);
                    } else {
                        font = [];
                    }
                } else if (
                    (node.nodeType === Node.TEXT_NODE && !isWhitespace(node)) ||
                    (node.nodeName === "BR" && isEmptyBlock(node.parentNode)) ||
                    (node.nodeType === Node.ELEMENT_NODE &&
                        ["inline", "inline-block"].includes(getComputedStyle(node).display) &&
                        !isWhitespace(node.textContent) &&
                        !node.classList.contains("btn") &&
                        !node.querySelector("font") &&
                        node.nodeName !== "A" &&
                        !(node.nodeName === "SPAN" && node.style["fontSize"]))
                ) {
                    // Node is a visible text or inline node without font nor a button:
                    // wrap it in a <font>.
                    const previous = node.previousSibling;
                    const classRegex = mode === "color" ? BG_CLASSES_REGEX : TEXT_CLASSES_REGEX;
                    if (
                        previous &&
                        previous.nodeName === "FONT" &&
                        !previous.style[mode === "color" ? "backgroundColor" : "color"] &&
                        !classRegex.test(previous.className) &&
                        selectedNodes.includes(previous.firstChild) &&
                        selectedNodes.includes(previous.lastChild)
                    ) {
                        // Directly follows a fully selected <font> that isn't
                        // colored in the other mode: append to that.
                        font = previous;
                    } else {
                        // No <font> found: insert a new one.
                        font = this.document.createElement("font");
                        node.after(font);
                    }
                    if (node.textContent) {
                        font.appendChild(node);
                    } else {
                        fillEmpty(font);
                    }
                } else {
                    font = []; // Ignore non-text or invisible text nodes.
                }
                return font;
            });
        };

        for (const fieldNode of selectedFieldNodes) {
            this.colorElement(fieldNode, color, mode);
        }

        let fonts = getFonts(selectedNodes);
        // Dirty fix as the previous call could have unconnected elements
        // because of the `splitAroundUntil`. Another call should provide he
        // correct list of fonts.
        if (!fonts.every((font) => font.isConnected)) {
            fonts = getFonts(selectedNodes);
        }

        // Color the selected <font>s and remove uncolored fonts.
        const fontsSet = new Set(fonts);
        for (const font of fontsSet) {
            this.colorElement(font, color, mode);
            if (
                !hasColor(font, "color") &&
                !hasColor(font, "backgroundColor") &&
                (!font.hasAttribute("style") || !color)
            ) {
                for (const child of [...font.childNodes]) {
                    font.parentNode.insertBefore(child, font);
                }
                font.parentNode.removeChild(font);
                fontsSet.delete(font);
            }
        }
        this.shared.setSelection(selection, { normalize: false });
    }

    getUsedCustomColors(mode) {
        const allFont = this.editable.querySelectorAll("font");
        const usedCustomColors = new Set();
        for (const font of allFont) {
            if (isCSSColor(font.style[mode])) {
                usedCustomColors.add(font.style[mode]);
            }
        }
        return usedCustomColors;
    }

    /**
     * Applies a css or class color (fore- or background-) to an element.
     * Replace the color that was already there if any.
     *
     * @param {Element} element
     * @param {string} color hexadecimal or bg-name/text-name class
     * @param {string} mode 'color' or 'backgroundColor'
     */
    colorElement(element, color, mode) {
        const newClassName = element.className
            .replace(mode === "color" ? TEXT_CLASSES_REGEX : BG_CLASSES_REGEX, "")
            .replace(/\btext-gradient\b/g, "") // cannot be combined with setting a background
            .replace(/\s+/, " ");
        element.className !== newClassName && (element.className = newClassName);
        element.style["background-image"] = "";
        if (mode === "backgroundColor") {
            element.style["background"] = "";
        }
        if (color.startsWith("text") || color.startsWith("bg-")) {
            element.style[mode] = "";
            element.classList.add(color);
        } else if (isColorGradient(color)) {
            element.style[mode] = "";
            if (mode === "color") {
                element.style["background"] = "";
                element.style["background-image"] = color;
                element.classList.add("text-gradient");
            } else {
                element.style["background-image"] = color;
            }
        } else {
            element.style[mode] = color;
        }
    }
}
