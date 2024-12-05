# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


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

    def _can_edit_info(self):
        """ Overide this method to allow user to change address information. """
        self.ensure_one()
        return True

    def _can_be_edited_by_current_partner(self, **kwargs):
        self.ensure_one()
        commercial_partner_id = kwargs.get('parent_id', self.env.user.partner_id.commercial_partner_id.id)
        children_partner_ids = self.env['res.partner']._search([
            ('id', 'child_of', commercial_partner_id),
            ('type', 'in', ('invoice', 'delivery', 'other')),
        ])
        return self.id in children_partner_ids or self.id == commercial_partner_id

    def _get_country_id(self):
        country_sudo = self.country_id
        if not country_sudo:
            country_sudo = self.env.user.parent_id.country_id
        return country_sudo

    def _is_anonymous_customer(self):
        return not self
