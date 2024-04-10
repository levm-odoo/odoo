# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models


class WebsiteMenu(models.Model):
    _inherit = "website.menu"

    def unlink(self):
        """ Override to synchronize event configuration fields with menu deletion. """
        event_updates = {}
        website_event_menus = self.env['website.event.menu'].search([('menu_id', 'in', self.ids)])
        for event_menu in website_event_menus:
            to_update = event_updates.setdefault(event_menu.event_id, list())
            for menu_type, fname in event_menu.event_id._get_menu_type_field_matching().items():
                if event_menu.menu_type == menu_type:
                    to_update.append(fname)

        # manually remove website_event_menus to call their ``unlink`` method. Otherwise
        # super unlinks at db level and skip model-specific behavior.
        website_event_menus.unlink()
        res = super(WebsiteMenu, self).unlink()

        # update events
        for event, to_update in event_updates.items():
            if to_update:
                event.write(dict((fname, False) for fname in to_update))

        return res

    @api.model
    def save(self, website_id, data):
        for menu in data['data']:
            if isinstance(menu['id'], str):
                website_event_menu = self.env['website.event.menu'].search([('menu_id.parent_id', '=', menu['parent_id'])])
                event_url = website_event_menu.event_id.website_url
                if website_event_menu and not menu['url'].startswith(event_url):
                    page_name = menu['url'].lstrip('/')
                    menu['url'] = f"{event_url}/page/{page_name}"

        return super().save(website_id, data)
