from odoo import _, models

class ResPartner(models.Model):
    _inherit = 'res.partner'

    def _l10n_tr_nilvera_validate_partner_details(self):
        required_fields = {
            "street": self.street,
            "city": self.city,
            "state": self.state_id,
            "zip": self.zip,
            "country": self.country_id,
        }
        missing_fields = [field.capitalize() for field, value in required_fields.items() if not value]

        if self.country_id.code == 'TR' and not self.vat:
            missing_fields.append("TCKN/VKN")

        msg = []
        if missing_fields:
            msg.append(f"{', '.join(missing_fields)} is required")
        if self.zip and len(self.zip) != 5:
            msg.append("ZIP must be of 5 characters.")
        if msg:
            return {
                f"invalid_{self.name.replace(' ', '_')}": {
                    'message': _("%s's %s", self.name, ', '.join(msg)),
                    'action_text': _("View %s", self.name),
                    'action': self._get_records_action(name=_("View Partner"))
                }
            }
        return False

