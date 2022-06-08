# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ResCompany(models.Model):
    _inherit = "res.company"

    l10n_in_edi_ewaybill_username = fields.Char("E-Waybill (IN) Username", groups="base.group_system")
    l10n_in_edi_ewaybill_password = fields.Char("E-Waybill (IN) Password", groups="base.group_system")
    l10n_in_edi_ewaybill_auth_validity = fields.Datetime("E-Waybill (IN) Valid Until", groups="account.group_system")

    def _l10n_in_edi_ewaybill_token_is_valid(self):
        self.ensure_one()
        if self.l10n_in_edi_ewaybill_auth_validity and self.l10n_in_edi_ewaybill_auth_validity > fields.Datetime.now():
            return True
        return False

    def _neutralize(self):
        super()._neutralize()
        self.flush()
        self.invalidate_cache()
        self.env.cr.execute("""UPDATE res_company SET
            l10n_in_edi_production_env = false,
            l10n_in_edi_ewaybill_username = Null,
            l10n_in_edi_ewaybill_password = Null,
            l10n_in_edi_ewaybill_auth_validity = Null
        """)
