# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class Event(models.Model):
    _inherit = "event.event"

    def action_mass_mailing_attendees(self):
        return {
            'name': 'Mass Mail Attendees',
            'type': 'ir.actions.act_window',
            'res_model': 'mailing.mailing',
            'view_mode': 'form',
            'target': 'current',
            'context': {
                'default_mailing_model_id': self.env.ref('event.model_event_registration').id,
                'default_mailing_domain': repr([('event_id', 'in', self.ids), ('state', 'not in', ['cancel', 'draft'])]),
                # keys 'force_mailing_model_id' and 'force_mailing_domain' are needed because 'default_' keys
                # are removed from context when processing a compute method with compute_sudo flag enabled
                'force_mailing_model_id': self.env['ir.model']._get_id('event.registration'),
                'force_mailing_domain': repr([('event_id', 'in', self.ids), ('state', 'not in', ['cancel', 'draft'])]),
            },
        }

    def action_invite_contacts(self):
        return {
            'name': 'Mass Mail Invitation',
            'type': 'ir.actions.act_window',
            'res_model': 'mailing.mailing',
            'view_mode': 'form',
            'target': 'current',
            'context': {'default_mailing_model_id': self.env.ref('base.model_res_partner').id},
        }
