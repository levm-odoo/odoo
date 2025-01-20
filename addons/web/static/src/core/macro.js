import { delay } from "@web/core/utils/concurrency";
import { validate } from "@odoo/owl";
import { waitFor, waitUntil } from "@odoo/hoot-dom";

const macroSchema = {
    name: { type: String, optional: true },
    checkDelay: { type: Number, optional: true }, //Delay before checking if element is in DOM.
    stepDelay: { type: Number, optional: true }, //Wait this delay between steps
    timeout: { type: Number, optional: true },
    steps: {
        type: Array,
        element: {
            initialDelay: { type: Function, optional: true },
            action: { type: Function },
            trigger: { type: [Function, String], optional: true },
            timeout: { type: Number, optional: true },
        },
    },
    onComplete: { type: Function, optional: true },
    onStep: { type: Function, optional: true },
    onError: { type: Function, optional: true },
    onTimeout: { type: Function, optional: true },
};

/**
 * @typedef MacroStep
 * @property {string} [trigger]
 * - An action returning a "truthy" value means that the step isn't successful.
 * - Current step index won't be incremented.
 * @property {string | (el: Element, step: MacroStep) => undefined | string} [action]
 * @property {*} [*] - any payload to the step.
 *
 * @typedef MacroDescriptor
 * @property {() => Element | undefined} trigger
 * @property {() => {}} action
 */

export const ACTION_HELPERS = {
    click(el, _step) {
        el.dispatchEvent(new MouseEvent("mouseover"));
        el.dispatchEvent(new MouseEvent("mouseenter"));
        el.dispatchEvent(new MouseEvent("mousedown"));
        el.dispatchEvent(new MouseEvent("mouseup"));
        el.click();
        el.dispatchEvent(new MouseEvent("mouseout"));
        el.dispatchEvent(new MouseEvent("mouseleave"));
    },
    text(el, step) {
        // simulate an input (probably need to add keydown/keyup events)
        this.click(el, step);
        el.value = step.value;
        el.dispatchEvent(new InputEvent("input", { bubbles: true }));
        el.dispatchEvent(new InputEvent("change", { bubbles: true }));
    },
};

class TimeoutError extends Error {}

export class Macro {
    currentIndex = 0;
    isComplete = false;
    calledBack = false;
    constructor(descr) {
        try {
            validate(descr, macroSchema);
        } catch (error) {
            throw new Error(
                `Error in schema for Macro ${JSON.stringify(descr, null, 4)}\n${error.message}`
            );
        }
        Object.assign(this, descr);
        this.name = this.name || "anonymous";
        this.onComplete = this.onComplete || (() => {});
        this.onStep = this.onStep || (() => {});
        this.stepElFound = new Array(this.steps.length).fill(false);
    }

    get debounceDelay() {
        let delay = this.currentIndex === 0 ? 0 : 50;
        if (this.currentStep?.initialDelay) {
            const initialDelay = parseFloat(this.currentStep.initialDelay());
            delay = initialDelay >= 0 ? initialDelay : delay;
        }
        return delay;
    }

    async start() {
        if (this.isComplete) {
            return;
        }
        if (!this.currentStep && this.currentIndex === 0) {
            await delay(300);
            this.stop();
        }
        let proceedToAction = true;
        if (this.currentStep.trigger) {
            proceedToAction = await this.findTrigger();
        }
        if (proceedToAction) {
            this.safeCall(this.onStep, this.currentElement, this.currentStep);
            const actionResult = await this.performAction();
            if (!actionResult) {
                // If falsy action result, it means the action worked properly.
                // So we can proceed to the next step.
                this.currentIndex++;
                if (this.currentIndex >= this.steps.length) {
                    this.stop();
                }
                if (this.debounceDelay > 0) {
                    await delay(this.debounceDelay);
                }
                await this.start();
            }
        }
    }

    /**
     * Find the trigger and assess whether it can continue on performing the actions.
     * @returns {boolean}
     */
    async findTrigger() {
        const timeout = this.currentStep.timeout || this.timeout;
        if (this.isComplete) {
            return;
        }
        const trigger = this.currentStep.trigger;
        try {
            if (typeof trigger === "function") {
                this.currentElement = await waitUntil(trigger, { timeout });
            } else if (typeof trigger === "string") {
                this.currentElement = await waitFor(trigger, { visible: true, timeout });
            } else {
                throw new Error(`Trigger can only be string or function.`);
            }
        } catch (error) {
            this.stop(`Error when trying to find trigger: ${error.message}`);
        }
        return !!this.currentElement;
    }

    /**
     * Calls the `step.action` expecting no return to be successful.
     */
    async performAction() {
        let actionResult;
        try {
            const action = this.currentStep.action;
            if (action in ACTION_HELPERS) {
                actionResult = ACTION_HELPERS[action](this.currentElement, this.currentStep);
            } else if (typeof action === "function") {
                actionResult = await this.safeCall(action, this.currentElement);
            }
        } catch (error) {
            this.stop(`ERROR IN ACTION: ${error.message}`);
        }
        return actionResult;
    }

    get currentStep() {
        return this.steps[this.currentIndex];
    }

    get currentElement() {
        return this.stepElFound[this.currentIndex];
    }

    set currentElement(value) {
        this.stepElFound[this.currentIndex] = value;
    }

    safeCall(fn, ...args) {
        if (this.isComplete) {
            return;
        }
        try {
            return fn(...args);
        } catch (e) {
            this.stop(e);
        }
    }

    stop(error) {
        this.isComplete = true;
        if (!this.calledBack) {
            this.calledBack = true;
            if (error) {
                if (error instanceof TimeoutError) {
                    if (typeof this.onTimeout === "function") {
                        this.onTimeout(error.message, this.currentStep, this.currentIndex);
                    } else {
                        console.error("Step timeout");
                    }
                } else {
                    if (typeof this.onError === "function") {
                        this.onError(error, this.currentStep, this.currentIndex);
                    } else {
                        console.error(error);
                    }
                }
            } else if (this.currentIndex === this.steps.length) {
                this.onComplete();
            }
        }
        return;
    }
}

export class MacroMutationObserver {
    observerOptions = {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
    };
    constructor(callback) {
        this.callback = callback;
        this.observer = new MutationObserver((mutationList, observer) => {
            callback();
            mutationList.forEach((mutationRecord) =>
                Array.from(mutationRecord.addedNodes).forEach((node) => {
                    let iframes = [];
                    if (String(node.tagName).toLowerCase() === "iframe") {
                        iframes = [node];
                    } else if (node instanceof HTMLElement) {
                        iframes = Array.from(node.querySelectorAll("iframe"));
                    }
                    iframes.forEach((iframeEl) =>
                        this.observeIframe(iframeEl, observer, () => callback())
                    );
                    this.findAllShadowRoots(node).forEach((shadowRoot) =>
                        observer.observe(shadowRoot, this.observerOptions)
                    );
                })
            );
        });
    }
    disconnect() {
        this.observer.disconnect();
    }
    findAllShadowRoots(node, shadowRoots = []) {
        if (node.shadowRoot) {
            shadowRoots.push(node.shadowRoot);
            this.findAllShadowRoots(node.shadowRoot, shadowRoots);
        }
        node.childNodes.forEach((child) => {
            this.findAllShadowRoots(child, shadowRoots);
        });
        return shadowRoots;
    }
    observe(target) {
        this.observer.observe(target, this.observerOptions);
        //When iframes already exist at "this.target" initialization
        target
            .querySelectorAll("iframe")
            .forEach((el) => this.observeIframe(el, this.observer, () => this.callback()));
        //When shadowDom already exist at "this.target" initialization
        this.findAllShadowRoots(target).forEach((shadowRoot) => {
            this.observer.observe(shadowRoot, this.observerOptions);
        });
    }
    observeIframe(iframeEl, observer, callback) {
        const observerOptions = {
            attributes: true,
            childList: true,
            subtree: true,
            characterData: true,
        };
        const observeIframeContent = () => {
            if (iframeEl.contentDocument) {
                iframeEl.contentDocument.addEventListener("load", (event) => {
                    callback();
                    observer.observe(event.target, observerOptions);
                });
                if (!iframeEl.src || iframeEl.contentDocument.readyState === "complete") {
                    callback();
                    observer.observe(iframeEl.contentDocument, observerOptions);
                }
            }
        };
        observeIframeContent();
        iframeEl.addEventListener("load", observeIframeContent);
    }
}
