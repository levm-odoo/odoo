/** @odoo-module **/

import { useEffect } from "@odoo/owl";

/**
 * This is used on text inputs or textareas to automatically resize it based on its
 * content each time it is updated. It takes the reference of the element as
 * parameter and some options. Do note that it may introduce mild performance issues
 * since it will force a reflow of the layout each time the element is updated.
 * Do also note that it only works with textareas that are nested as only child
 * of some parent div (like in the text_field component).
 *
 * @param {Ref} ref
 */
export function useAutoresize(ref, options = {}) {
    let resize, attach, detach;
    let active = options.enable || true;
    useEffect(el => {
        const resizeFunc = el instanceof HTMLInputElement ? resizeInput : resizeTextArea;
        attach = () => {
            resize = el ? resizeFunc.bind(null, el, options) : null;
            el?.addEventListener("input", resize);
        };
        detach = () => {
            el?.removeEventListener("input", resize);
            resize = null;
        };
        if (active) {
            attach();
        }
        return detach;
    }, () => [ref.el]);
    useEffect(() => resize?.(), () => [ref.el?.value]);
    return {
        enable: () => {
            if (!active) {
                attach?.();
                active = true;
                resize?.();
            }
        },
        disable: () => {
            if (active) {
                detach?.();
                active = false;
            }
        },
    };
}

function resizeInput(input) {
    // This mesures the maximum width of the input which can get from the flex layout.
    input.style.width = "100%";
    const maxWidth = input.clientWidth;
    // Minimum width of the input
    input.style.width = "10px";
    if (input.value === "" && input.placeholder !== "") {
        input.style.width = "auto";
        return;
    }
    if (input.scrollWidth + 5 > maxWidth) {
        input.style.width = "100%";
        return;
    }
    input.style.width = input.scrollWidth + 5 + "px";
}

function resizeTextArea(textarea, options) {
    const minimumHeight = options.minimumHeight || 0;
    let heightOffset = 0;
    const style = window.getComputedStyle(textarea);
    if (style.boxSizing === "border-box") {
        const paddingHeight = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const borderHeight = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
        heightOffset = borderHeight + paddingHeight;
    }
    const previousStyle = {
        borderTopWidth: style.borderTopWidth,
        borderBottomWidth: style.borderBottomWidth,
        padding: style.padding,
    };
    Object.assign(textarea.style, {
        height: "auto",
        borderTopWidth: 0,
        borderBottomWidth: 0,
        paddingTop: 0,
        paddingRight: style.paddingRight,
        paddingBottom: 0,
        paddingLeft: style.paddingLeft,
    });
    const height = Math.max(minimumHeight, textarea.scrollHeight + heightOffset);
    Object.assign(textarea.style, previousStyle, { height: `${height}px` });
    textarea.parentElement.style.height = `${height}px`;
}
