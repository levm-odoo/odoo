import { useState } from "@odoo/owl";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

export class InputConfirmationDialog extends ConfirmationDialog {
    static template = "mysterious_egg.InputConfirmationDialog";

    static props = {
        ...ConfirmationDialog.props,
        inputLabel: { type: String, optional: true },
        defaultValue: { type: String, optional: true },
    };

    setup() {
        super.setup();
        this.inputState = useState({
            value: this.props.defaultValue,
        });
    }

    async execButton(callback) {
        super.execButton((...args) => {
            return callback(...args, this.inputState.value);
        });
    }
}
