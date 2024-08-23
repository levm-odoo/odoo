import { fields, models } from "@web/../tests/web_test_helpers";

export class ResPartner extends models.ServerModel {
    _name = "res.partner";

    out_of_office_date_end = fields.Date();

    /**
     * Overrides to add out of office to employees.
     * @override
     * @type {typeof mailModels.ResPartner["prototype"]["mail_partner_format"]}
     */
    mail_partner_format(ids) {
        const partnerFormats = super.mail_partner_format(...arguments);
        const partners = this.browse(ids);
        for (const partner of partners) {
            // Not a real field but ease the testing
            partnerFormats[partner.id].out_of_office_date_end = partner.out_of_office_date_end;
        }
        return partnerFormats;
    }
}
