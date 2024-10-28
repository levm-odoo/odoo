import { Persona } from "@mail/core/common/persona_model";
import { deserializeDateTime } from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";

const { DateTime } = luxon;

patch(Persona.prototype, {
    get outOfOfficeText() {
        if (!this.out_of_office_date_end || this.eq(this.store.odoobot)) {
            return "";
        }
        if (this.out_of_office_date_end === "public_holiday") {
            return _t("Out of office due to public holiday");
        }
        const date = deserializeDateTime(this.out_of_office_date_end);
        const fdate = date.toLocaleString(DateTime.DATE_MED);
        return _t("Back on %s", fdate);
    },
});
