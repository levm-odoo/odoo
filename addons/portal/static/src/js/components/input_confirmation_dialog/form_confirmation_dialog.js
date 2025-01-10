/** @odoo-module */

import { useEffect } from "@odoo/owl";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

export class FormConfirmationDialog extends ConfirmationDialog {
    static props = {
        ...ConfirmationDialog.props,
    };
    static template = "portal.InputConfirmationDialog";

    setup() {
        super.setup();

        const onKeydown = (ev) => {
            if (ev.key && ev.key.toLowerCase() === "enter") {
                ev.preventDefault();  // Prevent default `confirm`
            }
        };

        useEffect(
            (formEl) => {
                this.formEl = formEl;
                if (this.formEl) {
                    this.formEl.addEventListener("keydown", onKeydown);
                    return () => {
                        this.formEl.removeEventListener("keydown", onKeydown);
                    };
                }
            },
            () => [this.modalRef.el?.querySelector("form")]
        );
    }

    _confirm() {
        if (this.formEl) {
            const formData = new FormData(this.formEl);
            const formValues = Object.fromEntries(formData.entries());
            this.execButton(() => this.props.confirm({ formValues }));
        }
    }
}

