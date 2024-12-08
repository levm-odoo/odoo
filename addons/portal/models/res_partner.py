# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models

from odoo.addons.portal import const


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

    def _can_edited_by_current_customer(self, **kwargs):
        """ Return whether customer can be edited by current user's customer. """
        self.ensure_one()
        if self == self._get_current_partner(**kwargs):
            return True
        children_partner_ids = self.env['res.partner']._search([
            ('id', 'child_of', self.commercial_partner_id.id),
            ('type', 'in', ('invoice', 'delivery', 'other')),
        ])
        return self.id in children_partner_ids

    @api.model
    def _get_current_partner(self, **kwargs):
        return self.env.user.partner_id

    def _is_anonymous_customer(self):
        """ Check if customer is anonymous or not. """
        return not self and self.env.user._is_public()

    @api.model
    def _display_b2b_fields(self, country_code):
        """ This method is to check whether address form should display b2b fields. """
        return country_code in const.DISPLAY_B2B_FIELDS_COUNTRY_CODE
