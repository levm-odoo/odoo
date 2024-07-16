# Part of Odoo. See LICENSE file for full copyright and licensing details.

import requests

from datetime import timedelta
from lxml import html

from odoo import api, models, fields, tools
from odoo.tools.misc import OrderedSet
from odoo.addons.mail.tools import link_preview
from odoo.addons.mail.tools.discuss import Store
import re


class LinkPreview(models.Model):
    _name = 'mail.link.preview'
    _description = "Store link preview data"

    message_id = fields.Many2one('mail.message', string='Message', index=True, ondelete='cascade')
    is_hidden = fields.Boolean()
    source_url = fields.Char('URL', required=True)
    og_type = fields.Char('Type')
    og_title = fields.Char('Title')
    og_site_name = fields.Char('Site name')
    og_image = fields.Char('Image')
    og_description = fields.Text('Description')
    og_mimetype = fields.Char('MIME type')
    image_mimetype = fields.Char('Image MIME type')
    create_date = fields.Datetime(index=True)

    @api.model
    def _create_from_message_and_notify(self, message):
        if tools.is_html_empty(message.body):
            return self
        urls = OrderedSet(html.fromstring(message.body).xpath('//a[not(@data-oe-model)]/@href'))
        markdown_link_re = r"\[.+?\]\(\s*([^)]+)\s*\)"
        urls.update(re.findall(markdown_link_re, message.body))
        link_previews = self.env['mail.link.preview']
        requests_session = requests.Session()
        link_preview_values = []
        link_previews_by_url = {
            preview.source_url: preview for preview in message.sudo().link_preview_ids
        }
        for url in urls:
            if url in link_previews_by_url:
                preview = link_previews_by_url.pop(url)
                if not preview.is_hidden:
                    link_previews += preview
                continue
            if preview := link_preview.get_link_preview_from_url(url, requests_session):
                preview['message_id'] = message.id
                link_preview_values.append(preview)
            if len(link_preview_values) + len(link_previews) > 5:
                break
        for unused_preview in link_previews_by_url.values():
            unused_preview._unlink_and_notify()
        if link_preview_values:
            link_previews += link_previews.create(link_preview_values)
        if link_previews := link_previews.sorted(key=lambda p: list(urls).index(p.source_url)):
            self.env["bus.bus"]._sendone(
                message._bus_notification_target(),
                "mail.record/insert",
                Store(
                    "mail.message", {"id": message.id, "linkPreviews": Store.many(link_previews)}
                ).get_result(),
            )

    def _hide_and_notify(self):
        if not self:
            return True
        notifications = [
            (
                link_preview.message_id._bus_notification_target(),
                "mail.record/insert",
                Store(
                    "mail.message",
                    {
                        "id": link_preview.message_id.id,
                        "linkPreviews": Store.many(link_preview, "DELETE", only_id=True),
                    },
                ).get_result(),
            )
            for link_preview in self
        ]
        self.is_hidden = True
        self.env['bus.bus']._sendmany(notifications)

    def _unlink_and_notify(self):
        if not self:
            return True
        notifications = [
            (
                link_preview.message_id._bus_notification_target(),
                "mail.record/insert",
                Store(
                    "mail.message",
                    {
                        "id": link_preview.message_id.id,
                        "linkPreviews": Store.many(link_preview, "DELETE", only_id=True),
                    },
                ).get_result(),
            )
            for link_preview in self
        ]
        self.env['bus.bus']._sendmany(notifications)
        self.unlink()

    @api.model
    def _is_link_preview_enabled(self):
        link_preview_throttle = int(self.env['ir.config_parameter'].sudo().get_param('mail.link_preview_throttle', 99))
        return link_preview_throttle > 0

    @api.model
    def _search_or_create_from_url(self, url):
        """Return the URL preview, first from the database if available otherwise make the request."""
        lifetime = int(self.env['ir.config_parameter'].sudo().get_param('mail.mail_link_preview_lifetime_days', 3))
        preview = self.env['mail.link.preview'].search([
            ('source_url', '=', url),
            ('create_date', '>=', fields.Datetime.now() - timedelta(days=lifetime)),
        ], order='create_date DESC', limit=1)
        if not preview:
            preview_values = link_preview.get_link_preview_from_url(url)
            if not preview_values:
                return self.env["mail.link.preview"]
            preview = self.env['mail.link.preview'].create(preview_values)
        return preview

    def _to_store(self, store: Store, /):
        for preview in self:
            data = preview._read_format(
                [
                    "image_mimetype",
                    "og_description",
                    "og_image",
                    "og_mimetype",
                    "og_site_name",
                    "og_title",
                    "og_type",
                    "source_url",
                ],
                load=False,
            )[0]
            data["message"] = Store.one(preview.message_id, only_id=True)
            store.add("mail.link.preview", data)

    @api.autovacuum
    def _gc_mail_link_preview(self):
        lifetime = int(self.env['ir.config_parameter'].sudo().get_param('mail.mail_link_preview_lifetime_days', 3))
        self.env['mail.link.preview'].search([
            ('message_id', '=', False),
            ('create_date', '<', fields.Datetime.now() - timedelta(days=lifetime)),
        ], order='create_date ASC', limit=1000).unlink()
