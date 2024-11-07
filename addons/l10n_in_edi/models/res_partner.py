from odoo import _, models

class ResPartner(models.Model):
    _inherit = 'res.partner'

    def _l10n_in_check_einvoice_validation(self):
        checks = {
            'partner_address_missing': {
                'fields': ('street', 'zip', 'city', 'state_id', 'country_id',),
                'message': _("Partners should have a complete address, verify their Street, City, State, Country and Zip code."),
            },
        }
        return {
            f"l10n_in_edi_{key}": {
                'message': check['message'],
                'action_text': _("View Partners"),
                'action': invalid_records._get_records_action(name=_("Check Partner Data")),
            }
            for key, check in checks.items()
            if (invalid_records := self.filtered(lambda record: any(not record[field] for field in check['fields'])))
        }
