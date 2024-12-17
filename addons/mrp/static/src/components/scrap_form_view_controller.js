import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { FormController } from "@web/views/form/form_controller";
import { formView } from "@web/views/form/form_view";

class ScrapFormController extends FormController {

    setup() {
        super.setup();
        this.notification = useService("notification");
    }

    async onWillSaveRecord(record) {
        this.savingRecordId = record.resId;
        return super.onWillSaveRecord(...arguments);
    }

    async onRecordSaved(record) {
        if (record.resId !== this.savingRecordId) {
            this.notification.add(
                _t("The scrap order has successfully been registered."),
                { type: "success" }
            );
        }
        return super.onRecordSaved(...arguments);
    }
}

export const ScrapFormView = {
    ...formView,
    Controller: ScrapFormController,
};

registry.category("views").add("scrap_form", ScrapFormView);
