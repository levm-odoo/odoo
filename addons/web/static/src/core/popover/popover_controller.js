/** @odoo-module **/

import { Component, onWillDestroy, useExternalListener, xml } from "@odoo/owl";
import { useHotkey } from "../hotkeys/hotkey_hook";
import { useChildRef } from "../utils/hooks";
import { Popover } from "./popover";
import { browser } from "../browser/browser";

export class PopoverController extends Component {
    static template = xml`
        <Popover t-props="props.popoverProps" ref="popoverRef">
            <t t-component="props.component" t-props="props.componentProps" close="props.close"/>
        </Popover>
    `;
    static components = { Popover };
    static props = {
        target: true,
        close: true,
        closeOnClickAway: {
            type: Function,
            optional: true,
        },
        closeOnHoverAway: {
            type: Boolean,
            optional: true,
        },
        closeOnEscape: {
            type: Boolean,
            optional: true,
        },
        component: true,
        componentProps: true,
        popoverProps: true,
        ref: { type: Function, optional: true },
    };

    setup() {
        if (this.props.target.isConnected) {
            this.popoverRef = useChildRef();

            if (this.props.ref) {
                this.props.ref(this.popoverRef);
            }

            useExternalListener(window, "mousedown", this.onClickAway, { capture: true });
            if (this.props.closeOnHoverAway) {
                this.closePopoverTimeout = false;
                useExternalListener(window, "mouseover", this.onHoverAway, { capture: true });
            }

            if (this.props.closeOnEscape) {
                useHotkey("escape", () => this.props.close());
            }

            const targetObserver = new MutationObserver(this.onTargetMutate.bind(this));
            targetObserver.observe(this.props.target.parentElement, { childList: true });
            onWillDestroy(() => targetObserver.disconnect());
        } else {
            this.props.close();
        }
    }

    onClickAway(ev) {
        const target = ev.composedPath()[0];
        if (
            this.props.closeOnClickAway(target) &&
            !this.props.target.contains(target) &&
            !this.popoverRef.el.contains(target)
        ) {
            this.props.close();
        }
    }

    onHoverAway(ev) {
        const target = ev.composedPath()[0];
        if (!this.props.target.contains(target) && !this.popoverRef.el.contains(target)) {
            this.closePopoverTimeout = browser.setTimeout(() => {
                this.props.close();
            }, 400);
        } else {
            browser.clearTimeout(this.closePopoverTimeout);
        }
    }

    onTargetMutate() {
        if (!this.props.target.isConnected) {
            this.props.close();
        }
    }
}
