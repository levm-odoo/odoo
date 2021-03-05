# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api


class Lead(models.Model):
    _inherit = 'crm.lead'

    event_lead_rule_id = fields.Many2one('event.lead.rule', string="Registration Rule", help="Rule that created this lead")
    event_id = fields.Many2one('event.event', string="Source Event", help="Event triggering the rule that created this lead")
    registration_ids = fields.Many2many(
        'event.registration', string="Source Registrations",
        groups='event.group_event_user',
        help="Registrations triggering the rule that created this lead")
    registration_count = fields.Integer(
        string="# Registrations", compute='_compute_registration_count',
        groups='event.group_event_user',
        help="Counter for the registrations linked to this lead")

    @api.depends('registration_ids')
    def _compute_registration_count(self):
        for record in self:
            record.registration_count = len(record.registration_ids)

    def _merge_get_fields_specific(self):
        print("keriiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii event_crm")
        fields_info = super(Lead, self)._merge_get_fields_specific()
        for vis in self.registration_ids:
            print("registration event crm......................", vis)
            # print("self.ordert............", vis.visitor_page_count)
        # add all the visitors from all lead to merge
        # fields_info['order_ids'] = [(6, 0, self.order_ids)]
        # print("orderrids info.............................", fields_info['order_ids'])
        fields_info['registration_ids'] = lambda fname, leads: [(6, 0, leads.registration_ids.ids)]
        #
        print("fields_info['registration_ids']/////////////////////", fields_info['registration_ids'])
        return fields_info