/** @odoo-module */

import { AbstractAwaitablePopup } from "@point_of_sale/js/Popups/AbstractAwaitablePopup";
import { _lt } from "@web/core/l10n/translation";
import { onMounted, useRef, useState } from "@odoo/owl";

// formerly TextInputPopupWidget
export class TextInputPopup extends AbstractAwaitablePopup {
    static template = "TextInputPopup";
    static props = {
        ...AbstractAwaitablePopup.props,
        confirmText: { type: String, optional: true },
        cancelText: { type: String, optional: true },
        title: String,
        body: { type: String, optional: true },
        startingValue: { type: String, optional: true },
        placeholder: { type: String, optional: true },
    };
    static defaultProps = {
        confirmText: _lt("Confirm"),
        cancelText: _lt("Discard"),
        body: "",
        startingValue: "",
        placeholder: "",
    };

    setup() {
        super.setup();
        this.state = useState({ inputValue: this.props.startingValue });
        this.inputRef = useRef("input");
        onMounted(this.onMounted);
    }
    onMounted() {
        this.inputRef.el.focus();
    }
    getPayload() {
        return this.state.inputValue;
    }
}
