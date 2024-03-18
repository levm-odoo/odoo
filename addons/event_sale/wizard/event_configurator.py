# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, models, fields
from odoo.exceptions import ValidationError


class EventConfigurator(models.TransientModel):
    _name = 'event.event.configurator'
    _description = 'Event Configurator'

    product_id = fields.Many2one('product.product', string="Product", readonly=True)
    event_id = fields.Many2one('event.event', string="Event")
    event_ticket_id = fields.Many2one('event.event.ticket', string="Ticket Type",
        compute="_compute_event_ticket_id", readonly=False, store=True)

    @api.constrains('event_id', 'event_ticket_id')
    def check_event_id(self):
        error_messages = []
        for record in self:
            if record.event_id.id != record.event_ticket_id.event_id.id:
                error_messages.append(
                    _('Invalid ticket choice "%(ticket_name)s" for event "%(event_name)s".'))
        if error_messages:
            raise ValidationError('\n'.join(error_messages))

    @api.depends('event_id')
    def _compute_event_ticket_id(self):
        """ Pre-select the ticket of the event selected if it is the only one """
        for configurator in self:
            event_ticket_ids = self.env['event.event.ticket'].search([
                ('event_id', '=', configurator.event_id.id),
                ('product_id', '=', configurator.product_id.id)], limit=2)
            configurator.event_ticket_id = event_ticket_ids if len(event_ticket_ids) == 1 else False
