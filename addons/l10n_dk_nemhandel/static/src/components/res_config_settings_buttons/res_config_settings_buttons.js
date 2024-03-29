/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { escape } from "@web/core/utils/strings";
import { registry } from "@web/core/registry";
import { pick } from "@web/core/utils/objects";
import { useService } from "@web/core/utils/hooks";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

import { Component, markup, useState } from "@odoo/owl";

class NemhandelSettingsButtons extends Component {
    static props = {
        ...standardWidgetProps,
    };
    static template = "l10n_dk_nemhandel.ActionButtons";

    setup() {
        super.setup();
        this.dialogService = useService("dialog");
        this.notification = useService("notification");
        this.state = useState({
            isSmsButtonDisabled: this.props.record.context.disable_sms_verification || false,
            isSettingsView: this.props.record.resModel === 'res.config.settings',
        });
    }

    get proxyState() {
        return this.props.record.data.l10n_dk_nemhandel_proxy_state;
    }

    get ediMode() {
        return this.props.record.data.edi_mode || this.props.record.data.nemhandel_edi_mode;
    }

    get modeConstraint() {
        return this.props.record.data.mode_constraint;
    }

    get receiverRegistration() {
        return this.props.record.data.receiver_registration;
    }

    get createButtonLabel() {
        const modes = {
            demo: _t("Register (Demo)"),
            test: _t("Register (Test)"),
            prod: _t("Register"),
        }
        return modes[this.ediMode] || _t("Register");
    }

    get deregisterUserButtonLabel() {
        if (['not_registered', 'in_verification'].includes(this.proxyState)) {
            return _t("Discard");
        }
        return _t("Deregister");
    }

    async _callConfigMethod(methodName) {
        this.env.onClickViewButton({
            clickParams: {
                name: methodName,
                type: "object",
            },
            getResParams: () =>
                pick(this.env.model.root, "context", "evalContext", "resModel", "resId", "resIds"),
        });
    }

    showConfirmation(warning, methodName) {
        const message = _t(warning);
        const confirmMessage = _t("You will not be able to send or receive Nemhandel documents in Odoo anymore. Are you sure you want to proceed?");
        this.dialogService.add(ConfirmationDialog, {
            body: markup(
                `<div class="text-danger">${escape(message)}</div>
                <div class="text-danger">${escape(confirmMessage)}</div>`
            ),
            confirm: async () => {
                await this._callConfigMethod(methodName);
            },
            cancel: () => { },
        });
    }

    deregister() {
        if (this.ediMode === 'demo' || !['sender', 'receiver'].includes(this.proxyState)) {
            this._callConfigMethod("button_deregister_nemhandel_participant");
        } else {
            this.showConfirmation(
                "This will delete your Nemhandel registration.",
                "button_deregister_nemhandel_participant"
            )
        }
    }

    async updateDetails() {
        // avoid making users click save on the settings
        // and then clicking the update button
        // changes on both the client side and the iap side need to be saved within one method
        await this._callConfigMethod("button_update_nemhandel_user_data");
        this.notification.add(
            _t("Contact details were updated."),
            { type: "success" }
        );
    }

    async checkCode() {
        // avoid making users click save on the settings
        // and then clicking the confirm button to check the code
        await this._callConfigMethod("button_check_nemhandel_verification_code");
    }

    async sendCode() {
        await this._callConfigMethod("send_nemhandel_verification_code", true);
    }

    async createReceiver() {
        await this._callConfigMethod("button_nemhandel_receiver_registration");
    }
}

registry.category("view_widgets").add("nemhandel_settings_buttons", {
    component: NemhandelSettingsButtons,
});
