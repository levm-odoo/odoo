export class PairSet {
    constructor() {
        this.map = new Map(); // map of [1] => Set<[2]>
    }
    add(elem1, elem2) {
        if (!this.map.has(elem1)) {
            this.map.set(elem1, new Set());
        }
        this.map.get(elem1).add(elem2);
    }
    has(elem1, elem2) {
        if (!this.map.has(elem1)) {
            return false;
        }
        return this.map.get(elem1).has(elem2);
    }
    delete(elem1, elem2) {
        if (!this.map.has(elem1)) {
            return;
        }
        const s = this.map.get(elem1);
        s.delete(elem2);
        if (!s.size) {
            this.map.delete(elem1);
        }
    }
}

import { addLoadingEffect } from "@web/core/utils/ui";

export const DEBOUNCE = 400;
export const BUTTON_HANDLER_SELECTOR =
    'a, button, input[type="submit"], input[type="button"], .btn';

/**
 * Protects a function which is to be used as a handler by preventing its
 * execution for the duration of a previous call to it (including async
 * parts of that call).
 *
 * @param {function} fct
 *      The function which is to be used as a handler. If a promise
 *      is returned, it is used to determine when the handler's action is
 *      finished. Otherwise, the return is used as jQuery uses it.
 */
export function makeAsyncHandler(fct) {
    let pending = false;
    function _isLocked() {
        return pending;
    }
    function _lock() {
        pending = true;
    }
    function _unlock() {
        pending = false;
    }
    return function () {
        if (_isLocked()) {
            // If a previous call to this handler is still pending, ignore
            // the new call.
            return;
        }

        _lock();
        const result = fct.apply(this, arguments);
        Promise.resolve(result).finally(_unlock);
        return result;
    };
}

/**
 * Creates a debounced version of a function to be used as a button click
 * handler. Also improves the handler to disable the button for the time of
 * the debounce and/or the time of the async actions it performs.
 *
 * Limitation: if two handlers are put on the same button, the button will
 * become enabled again once any handler's action finishes (multiple click
 * handlers should however not be bound to the same button).
 *
 * @param {function} fct
 *      The function which is to be used as a button click handler. If a
 *      promise is returned, it is used to determine when the button can be
 *      re-enabled. Otherwise, the return is used as jQuery uses it.
 */
export function makeButtonHandler(fct) {
    // Fallback: if the final handler is not bound to a button, at least
    // make it an async handler (also handles the case where some events
    // might ignore the disabled state of the button).
    fct = makeAsyncHandler(fct);

    return function (ev) {
        const result = fct.apply(this, arguments);

        const buttonEl = ev.target.closest(BUTTON_HANDLER_SELECTOR);
        if (!(buttonEl instanceof HTMLElement)) {
            return result;
        }

        // Disable the button for the duration of the handler's action
        // or at least for the duration of the click debounce. This makes
        // a 'real' debounce creation useless. Also, during the debouncing
        // part, the button is disabled without any visual effect.
        buttonEl.classList.add("pe-none");
        new Promise((resolve) => setTimeout(resolve, DEBOUNCE)).then(() => {
            buttonEl.classList.remove("pe-none");
            const restore = addLoadingEffect(buttonEl);
            return Promise.resolve(result).then(restore, restore);
        });

        return result;
    };
}
