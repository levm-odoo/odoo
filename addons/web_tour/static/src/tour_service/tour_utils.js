/** @odoo-module **/
import * as hoot from "@odoo/hoot-dom";
import { markup } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { utils } from "@web/core/ui/ui_service";

/**
 * Calls the given `func` then returns/resolves to `true`
 * if it will result to unloading of the page.
 * @param {(...args: any[]) => void} func
 * @param  {any[]} args
 * @returns {boolean | Promise<boolean>}
 */
export function callWithUnloadCheck(func, ...args) {
    let willUnload = false;
    const beforeunload = () => (willUnload = true);
    window.addEventListener("beforeunload", beforeunload);
    const result = func(...args);
    if (result instanceof Promise) {
        return result.then(() => {
            window.removeEventListener("beforeunload", beforeunload);
            return willUnload;
        });
    } else {
        window.removeEventListener("beforeunload", beforeunload);
        return willUnload;
    }
}

/**
 * @param {HTMLElement} [element]
 * @param {RunCommand} [runCommand]
 * @returns {string}
 */
export function getConsumeEventType(element, runCommand) {
    if (!element) {
        return "click";
    }
    const { classList, tagName, type } = element;
    const tag = tagName.toLowerCase();

    // Many2one
    if (classList.contains("o_field_many2one")) {
        return "autocompleteselect";
    }

    // Inputs and textareas
    if (
        tag === "textarea" ||
        (tag === "input" &&
            (!type ||
                [
                    "email",
                    "number",
                    "password",
                    "search",
                    "tel",
                    "text",
                    "url",
                    "date",
                    "range",
                ].includes(type)))
    ) {
        if (
            utils.isSmall() &&
            element.closest(".o_field_widget")?.matches(".o_field_many2one, .o_field_many2many")
        ) {
            return "click";
        }
        return "input";
    }

    // Drag & drop run command
    if (typeof runCommand === "string" && /^drag_and_drop/.test(runCommand)) {
        // this is a heuristic: the element has to be dragged and dropped but it
        // doesn't have class 'ui-draggable-handle', so we check if it has an
        // ui-sortable parent, and if so, we conclude that its event type is 'sort'
        if (element.closest(".ui-sortable")) {
            return "sort";
        }
        if (
            (/^drag_and_drop_native/.test(runCommand) && classList.contains("o_draggable")) ||
            element.closest(".o_draggable") ||
            element.draggable
        ) {
            return "pointerdown";
        }
    }

    // Default: click
    return "click";
}
/**
 * @param {HTMLElement} element
 * @returns {HTMLElement | null}
 */
export function getScrollParent(element) {
    if (!element) {
        return null;
    }
    if (element.scrollHeight > element.clientHeight) {
        return element;
    } else {
        return getScrollParent(element.parentNode);
    }
}

<<<<<<< HEAD
=======
/**
 * @param {HTMLElement} el
 * @param {string} type
 * @param {boolean} canBubbleAndBeCanceled
 * @param {PointerEventInit} [additionalParams]
 */
export const triggerPointerEvent = (el, type, canBubbleAndBeCanceled, additionalParams) => {
    const eventInit = {
        bubbles: canBubbleAndBeCanceled,
        cancelable: canBubbleAndBeCanceled,
        view: window,
        ...additionalParams,
    };

    el.dispatchEvent(new PointerEvent(type, eventInit));
    if (type.startsWith("pointer")) {
        el.dispatchEvent(new MouseEvent(type.replace("pointer", "mouse"), eventInit));
    }
};

export class RunningTourActionHelper {
    /**
     * @typedef {string|Node} Selector
     */

    constructor(anchor) {
        this.anchor = anchor;
        this.delay = 20;
    }

    /**
     * Ensures that the given {@link Selector} is checked.
     * @description
     * If it is not checked, a click is triggered on the input.
     * If the input is still not checked after the click, an error is thrown.
     *
     * @param {string|Node} selector
     * @example
     *  run: "check", //Checks the action element
     * @example
     *  run: "check input[type=checkbox]", // Checks the selector
     */
    check(selector) {
        const element = this._get_action_element(selector);
        hoot.check(element);
    }

    /**
     * Clears the **value** of the **{@link Selector}**.
     * @description
     * This is done using the following sequence:
     * - pressing "Control" + "A" to select the whole value;
     * - pressing "Backspace" to delete the value;
     * - (optional) triggering a "change" event by pressing "Enter".
     *
     * @param {Selector} selector
     * @example
     *  run: "clear", // Clears the value of the action element
     * @example
     *  run: "clear input#my_input", // Clears the value of the selector
     */
    clear(selector) {
        const element = this._get_action_element(selector);
        hoot.click(element);
        hoot.clear();
    }

    /**
     * Performs a click sequence on the given **{@link Selector}**
     * @description Let's see more informations about click sequence here: {@link hoot.click}
     * @param {Selector} selector
     * @example
     *  run: "click", // Click on the action element
     * @example
     *  run: "click .o_rows:first", // Click on the selector
     */
    click(selector) {
        const element = this._get_action_element(selector);
        if (this._notDisabled(element, "click") && this._notInvisible(element, "click")) {
            hoot.click(element);
        }
    }

    /**
     * Performs two click sequences on the given **{@link Selector}**.
     * @description Let's see more informations about click sequence here: {@link hoot.dblclick}
     * @param {Selector} selector
     * @example
     *  run: "dblclick", // Double click on the action element
     * @example
     *  run: "dblclick .o_rows:first", // Double click on the selector
     */
    dblclick(selector) {
        const element = this._get_action_element(selector);
        if (this._notDisabled(element, "dblclick") && this._notInvisible(element, "dblclick")) {
            hoot.dblclick(element);
        }
    }

    /**
     * Starts a drag sequence on the active element (anchor) and drop it on the given **{@link Selector}**.
     * @param {Selector} selector
     * @param {hoot.PointerOptions} options
     * @example
     *  run: "drag_and_drop .o_rows:first", // Drag the active element and drop it in the selector
     * @example
     *  async run(helpers) {
     *      await helpers.drag_and_drop(".o_rows:first", {
     *          position: {
     *              top: 40,
     *              left: 5,
     *          },
     *          relative: true,
     *      });
     *  }
     */
    async drag_and_drop(selector, options) {
        if (typeof options !== "object") {
            options = { position: "top", relative: true };
        }
        const dragEffectDelay = async () => {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            await new Promise((resolve) => setTimeout(resolve, this.delay));
        };
        const element = this.anchor;
        const { drop, moveTo } = hoot.drag(element);
        await dragEffectDelay();
        hoot.hover(element, {
            position: {
                top: 20,
                left: 20,
            },
            relative: true,
        });
        await dragEffectDelay();
        const target = await hoot.waitFor(selector, {
            visible: true,
            timeout: 500,
        });
        moveTo(target, options);
        await dragEffectDelay();
        drop();
        await dragEffectDelay();
    }

    /**
     * Edit input or textarea given by **{@link selector}**
     * @param {string} text
     * @param {Selector} selector
     * @example
     *  run: "edit Hello Mr. Doku",
     */
    edit(text, selector) {
        const element = this._get_action_element(selector);
        if (this._notInvisible(element, "edit") && this._notDisabled(element, "edit")) {
            hoot.click(element);
            hoot.edit(text);
        }
    }

    /**
     * Edit only editable wysiwyg element given by **{@link Selector}**
     * @param {string} text
     * @param {Selector} selector
     */
    editor(text, selector) {
        const element = this._get_action_element(selector);
        if (this._notInvisible(element, "wysiwyg") && this._notDisabled(element, "wysiwyg")) {
            hoot.click(element);
            this._set_range(element, "start");
            hoot.keyDown("_");
            element.textContent = text;
            hoot.manuallyDispatchProgrammaticEvent(element, "input");
            this._set_range(element, "stop");
            hoot.keyUp("_");
            hoot.manuallyDispatchProgrammaticEvent(element, "change");
        }
    }

    /**
     * Fills the **{@link Selector}** with the given `value`.
     * @description This helper is intended for `<input>` and `<textarea>` elements,
     * with the exception of `"checkbox"` and `"radio"` types, which should be
     * selected using the {@link check} helper.
     * In tour, it's mainly usefull for autocomplete components.
     * @param {string} value
     * @param {Selector} selector
     */
    fill(value, selector) {
        const element = this._get_action_element(selector);
        if (this._notInvisible(element, "fill") && this._notDisabled(element, "fill")) {
            hoot.click(element);
            hoot.fill(value);
        }
    }

    /**
     * Performs a hover sequence on the given **{@link Selector}**.
     * @param {Selector} selector
     * @example
     *  run: "hover",
     */
    hover(selector) {
        const element = this._get_action_element(selector);
        if (this._notInvisible(element, "hover")) {
            hoot.hover(element);
        }
    }

    /**
     * Only for input[type="range"]
     * @param {string|number} value
     * @param {Selector} selector
     */
    range(value, selector) {
        const element = this._get_action_element(selector);
        if (this._notInvisible(element, "range") && this._notDisabled(element, "range")) {
            hoot.click(element);
            hoot.setInputRange(element, value);
        }
    }

    /**
     * Performs a keyboard event sequence.
     * @example
     *  run : "press Enter",
     */
    press(...args) {
        return hoot.press(args.flatMap((arg) => typeof arg === "string" && arg.split("+")));
    }

    /**
     * Performs a selection event sequence on **{@link Selector}**. This helper is intended
     * for `<select>` elements only.
     * @description Select the option by its value
     * @param {string} value
     * @param {Selector} selector
     * @example
     * run(helpers) => {
     *  helpers.select("Kevin17", "select#mySelect");
     * },
     * @example
     * run: "select Foden47",
     */
    select(value, selector) {
        const element = this._get_action_element(selector);
        if (this._notDisabled(element, "select") && this._notInvisible(element, "select")) {
            hoot.click(element);
            hoot.select(value, { target: element });
        }
    }

    /**
     * Performs a selection event sequence on **{@link Selector}**
     * @description Select the option by its index
     * @param {number} index starts at 0
     * @param {Selector} selector
     * @example
     *  run: "selectByIndex 2", //Select the third option
     */
    selectByIndex(index, selector) {
        const element = this._get_action_element(selector);
        if (
            this._notDisabled(element, "selectByIndex") &&
            this._notInvisible(element, "selectByIndex")
        ) {
            hoot.click(element);
            const value = hoot.queryValue(`option:eq(${index})`, { root: element });
            if (value) {
                hoot.select(value, { target: element });
                element.dispatchEvent(new Event("input"));
            }
        }
    }

    /**
     * Performs a selection event sequence on **{@link Selector}**
     * @description Select option(s) by there labels
     * @param {string|RegExp} contains
     * @param {Selector} selector
     * @example
     *  run: "selectByLabel Jeremy Doku", //Select all options where label contains Jeremy Doku
     */
    selectByLabel(contains, selector) {
        const element = this._get_action_element(selector);
        if (
            this._notDisabled(element, "selectByLabel") &&
            this._notInvisible(element, "selectByLabel")
        ) {
            hoot.click(element);
            const values = hoot.queryAllValues(`option:contains(${contains})`, { root: element });
            hoot.select(values, { target: element });
        }
    }

    _notDisabled(element, action = "proceed an action") {
        if (element.disabled) {
            console.error(`Trigger can't be disabled when you want to ${action} on it`);
            return false;
        }
        return true;
    }

    _notInvisible(element, action = "proceed an action") {
        if (!hoot.isVisible(element)) {
            console.error(`Trigger can't be inivislbe when you want to ${action} on it`);
            return false;
        }
        return true;
    }

    /**
     * Get Node for **{@link Selector}**
     * @param {Selector} selector
     * @returns {Node}
     * @default this.anchor
     */
    _get_action_element(selector) {
        if (typeof selector === "string" && selector.length) {
            const nodes = hoot.queryAll(selector);
            return nodes.find(hoot.isVisible) || nodes.at(0);
        } else if (selector instanceof Node) {
            return selector;
        }
        return this.anchor;
    }

    // Useful for wysiwyg editor.
    _set_range(element, start_or_stop) {
        function _node_length(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                return node.nodeValue.length;
            } else {
                return node.childNodes.length;
            }
        }
        const selection = element.ownerDocument.getSelection();
        selection.removeAllRanges();
        const range = new Range();
        let node = element;
        let length = 0;
        if (start_or_stop === "start") {
            while (node.firstChild) {
                node = node.firstChild;
            }
        } else {
            while (node.lastChild) {
                node = node.lastChild;
            }
            length = _node_length(node);
        }
        range.setStart(node, length);
        range.setEnd(node, length);
        selection.addRange(range);
    }

    /**
     * Helper to facilitate drag and drop debugging
     */
    _showCursor() {
        const infoElement = document.createElement("div");
        function getCursor(event) {
            const x = event.clientX;
            const y = event.clientY;
            infoElement.textContent = `[ X: ${x} | Y: ${y} ]`;
            infoElement.style.top = y + 3 + "px";
            infoElement.style.left = x + 3 + "px";
        }
        if (!document.querySelector("div.o_tooltip_mouse_coordinates")) {
            infoElement.classList.add(".o_tooltip_mouse_coordinates");
            infoElement.style.backgroundColor = "red";
            infoElement.style.position = "absolute";
            infoElement.style.zIndex = 10e3;
            document.body.appendChild(infoElement);
            document.addEventListener("mousemove", (event) => {
                getCursor(event);
            });
            hoot.queryAll(":iframe").forEach((iframe) => {
                iframe.addEventListener("mousemove", (event) => {
                    getCursor(event);
                });
            });
        }
    }
}

>>>>>>> 5ce529632467 ([REF] ref)
export const stepUtils = {
    _getHelpMessage(functionName, ...args) {
        return `Generated by function tour utils ${functionName}(${args.join(", ")})`;
    },

    addDebugHelp(helpMessage, step) {
        if (typeof step.debugHelp === "string") {
            step.debugHelp = step.debugHelp + "\n" + helpMessage;
        } else {
            step.debugHelp = helpMessage;
        }
        return step;
    },

    editionEnterpriseModifier(step) {
        step.edition = "enterprise";
        return step;
    },

    mobileModifier(step) {
        step.isActive = ["mobile"];
        return step;
    },

    showAppsMenuItem() {
        return {
            isActive: ["auto", "community"],
            trigger: ".o_navbar_apps_menu button",
            position: "bottom",
            run: "click",
        };
    },

    toggleHomeMenu() {
        return {
            isActive: ["enterprise"],
            trigger: ".o_main_navbar .o_menu_toggle",
            content: markup(_t("Click on the <i>Home icon</i> to navigate across apps.")),
            position: "bottom",
            run: "click",
        };
    },

    autoExpandMoreButtons(extra_trigger) {
        return {
            isActive: ["auto"],
            content: `autoExpandMoreButtons`,
            trigger: ".o-form-buttonbox",
            extra_trigger: extra_trigger,
            run: (actions) => {
                const more = hoot.queryFirst(".o-form-buttonbox .o_button_more");
                if (more) {
                    hoot.click(more);
                }
            },
        };
    },

    goBackBreadcrumbsMobile(description, ...extraTrigger) {
        return extraTrigger.map((element) => ({
            isActive: ["mobile"],
            trigger: ".o_back_button",
            extra_trigger: element,
            content: description,
            position: "bottom",
            run: "click",
            debugHelp: this._getHelpMessage(
                "goBackBreadcrumbsMobile",
                description,
                ...extraTrigger
            ),
        }));
    },

    goToAppSteps(dataMenuXmlid, description) {
        return [
            this.showAppsMenuItem(),
            {
                isActive: ["community"],
                trigger: `.o_app[data-menu-xmlid="${dataMenuXmlid}"]`,
                content: description,
                position: "right",
                run: "click",
            },
            {
                isActive: ["enterprise"],
                trigger: `.o_app[data-menu-xmlid="${dataMenuXmlid}"]`,
                content: description,
                position: "bottom",
                run: "click",
            },
        ].map((step) =>
            this.addDebugHelp(this._getHelpMessage("goToApp", dataMenuXmlid, description), step)
        );
    },

    openBurgerMenu(extraTrigger) {
        return {
            isActive: ["mobile"],
            trigger: ".o_mobile_menu_toggle",
            extra_trigger: extraTrigger,
            content: _t("Open bugger menu."),
            position: "bottom",
            run: "click",
            debugHelp: this._getHelpMessage("openBurgerMenu", extraTrigger),
        };
    },

    statusbarButtonsSteps(innerTextButton, description, extraTrigger) {
        return [
            {
                isActive: ["auto", "mobile"],
                trigger: ".o_statusbar_buttons",
                extra_trigger: extraTrigger,
                run: (actions) => {
                    const node = hoot.queryFirst(
                        ".o_statusbar_buttons .btn.dropdown-toggle:contains(Action)"
                    );
                    if (node) {
                        hoot.click(node);
                    }
                },
            },
            {
                trigger: `.o_statusbar_buttons button:enabled:contains('${innerTextButton}'), .dropdown-item button:enabled:contains('${innerTextButton}')`,
                content: description,
                position: "bottom",
                run: "click",
            },
        ].map((step) =>
            this.addDebugHelp(
                this._getHelpMessage(
                    "statusbarButtonsSteps",
                    innerTextButton,
                    description,
                    extraTrigger
                ),
                step
            )
        );
    },

    simulateEnterKeyboardInSearchModal() {
        return {
            isActive: ["mobile"],
            trigger: ".o_searchview_input",
            extra_trigger: ".dropdown-menu.o_searchview_autocomplete",
            position: "bottom",
            run: "press Enter",
            debugHelp: this._getHelpMessage("simulateEnterKeyboardInSearchModal"),
        };
    },

    mobileKanbanSearchMany2X(modalTitle, valueSearched) {
        return [
            {
                isActive: ["mobile"],
                trigger: `.o_control_panel_navigation .btn .fa-search`,
                position: "bottom",
                run: "click",
            },
            {
                isActive: ["mobile"],
                trigger: ".o_searchview_input",
                extra_trigger: `.modal:not(.o_inactive_modal) .modal-title:contains('${modalTitle}')`,
                position: "bottom",
                run: `edit ${valueSearched}`,
            },
            this.simulateEnterKeyboardInSearchModal(),
            {
                isActive: ["mobile"],
                trigger: `.o_kanban_record:contains('${valueSearched}')`,
                position: "bottom",
                run: "click",
            },
        ].map((step) =>
            this.addDebugHelp(
                this._getHelpMessage("mobileKanbanSearchMany2X", modalTitle, valueSearched),
                step
            )
        );
    },
    /**
     * Utility steps to save a form and wait for the save to complete
     *
     * @param {object} [options]
     * @param {string} [options.content]
     * @param {string} [options.extra_trigger] additional save-condition selector
     */
    saveForm(options = {}) {
        return [
            {
                isActive: ["auto"],
                content: options.content || "save form",
                trigger: ".o_form_button_save",
                extra_trigger: options.extra_trigger,
                run: "click",
            },
            {
                isActive: ["auto"],
                content: "wait for save completion",
                trigger: ".o_form_readonly, .o_form_saved",
            },
        ];
    },
    /**
     * Utility steps to cancel a form creation or edition.
     *
     * Supports creation/edition from either a form or a list view (so checks
     * for both states).
     */
    discardForm(options = {}) {
        return [
            {
                isActive: ["auto"],
                content: options.content || "exit the form",
                trigger: ".o_form_button_cancel",
                extra_trigger: options.extra_trigger,
                run: "click",
            },
            {
                isActive: ["auto"],
                content: "wait for cancellation to complete",
                trigger:
                    ".o_view_controller.o_list_view, .o_form_view > div > div > .o_form_readonly, .o_form_view > div > div > .o_form_saved",
            },
        ];
    },

    waitIframeIsReady() {
        return {
            content: "Wait until the iframe is ready",
            trigger: `:has([is-ready="true"]):iframe html`,
        };
    },
};
