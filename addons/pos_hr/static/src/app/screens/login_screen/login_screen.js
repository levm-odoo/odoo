import { useCashierSelector } from "@pos_hr/app/utils/select_cashier_mixin";
import { _t } from "@web/core/l10n/translation";
import { LoginScreen } from "@point_of_sale/app/screens/login_screen/login_screen";
import { patch } from "@web/core/utils/patch";
import { useAutofocus } from "@web/core/utils/hooks";
import { onWillUnmount, useExternalListener, useState } from "@odoo/owl";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

patch(LoginScreen.prototype, {
    setup() {
        super.setup(...arguments);

        this.state = useState({
            pin: "",
        });

        if (this.pos.config.module_pos_hr) {
            this.selectCashier = useCashierSelector({
                onScan: (employee) => employee && this.selectOneCashier(employee),
                exclusive: true,
            });

            useAutofocus();
            useExternalListener(window, "keypress", async (ev) => {
                if (this.pos.login && ev.key === "Enter" && this.state.pin) {
                    await this.selectCashier(this.state.pin, true);
                }
            });
        }

        onWillUnmount(() => {
            this.state.pin = "";
            this.pos.login = false;
        });
    },
    unlockRegister() {
        this.pos.login = true;
    },
    openRegister() {
        if (this.pos.config.module_pos_hr) {
            this.pos.login = true;
        } else {
            super.openRegister();
        }
    },
    async clickBack() {
        if (!this.pos.config.module_pos_hr) {
            super.clickBack();
            return;
        }

        if (this.pos.login) {
            this.state.pin = "";
            this.pos.login = false;
        } else {
            const employee = await this.selectCashier();
            if (employee && employee.user_id?.id == this.pos.user.id) {
                super.clickBack();
                return;
            } else {
                this.dialog.add(AlertDialog, {
                    title: _t("Access Denied"),
                    body: _t("You are not allowed to the Backend."),
                });
            }
        }
    },
    get backBtnName() {
        return this.pos.login && this.pos.config.module_pos_hr ? _t("Discard") : super.backBtnName;
    },
});
