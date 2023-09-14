# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, api


class ResPartner(models.Model):
    _inherit = 'res.partner'

    def _can_edit_name(self):
        """ Name can be changed more often than the VAT """
        self.ensure_one()
        return True

    def can_edit_vat(self):
        """ `vat` is a commercial field, synced between the parent (commercial
        entity) and the children. Only the commercial entity should be able to
        edit it (as in backend)."""
        self.ensure_one()
        return not self.parent_id

    @api.model
    def _get_current_persona(self):
        if partner := self.env.context.get("portal_partner"):
            return (partner, self.env["mail.guest"])
        return super()._get_current_persona()
