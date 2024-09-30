# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import http
from odoo.fields import Domain
from odoo.http import request
from odoo.addons.mail.controllers.thread import ThreadController
from odoo.addons.mail.tools.discuss import Store
from odoo.addons.portal.utils import get_portal_partner


class PortalChatter(http.Controller):

    @http.route('/mail/avatar/mail.message/<int:res_id>/author_avatar/<int:width>x<int:height>', type='http', auth='public')
    def portal_avatar(self, res_id=None, height=50, width=50, access_token=None, _hash=None, pid=None):
        """Get the avatar image in the chatter of the portal"""
        if access_token or (_hash and pid):
            message_su = request.env["mail.message"].browse(int(res_id)).exists().sudo()
            thread = ThreadController._get_thread_with_access(
                message_su.model, message_su.res_id,
                token=access_token, hash=_hash, pid=pid and int(pid)
            )
            message_su = message_su if thread else request.env["mail.message"]
        else:
            message_su = request.env.ref('web.image_placeholder').sudo()
        # in case there is no message, it creates a stream with the placeholder image
        stream = request.env['ir.binary']._get_image_stream_from(
            message_su, field_name='author_avatar', width=int(width), height=int(height),
        )
        return stream.get_response()

    @http.route("/portal/chatter_init", type="jsonrpc", auth="public", website=True)
    def portal_chatter_init(self, thread_model, thread_id, **kwargs):
        store = Store()
        thread = ThreadController._get_thread_with_access(thread_model, thread_id, **kwargs)
        partner = request.env.user.partner_id
        if thread and request.env.user._is_public():
            if portal_partner := get_portal_partner(
                thread, kwargs.get("hash"), kwargs.get("pid"), kwargs.get("token")
            ):
                partner = portal_partner
        store.add_global_values(
            store_self=Store.One(partner, ["active", "name", "user", "write_date"])
        )
        if request.env.user.has_group("website.group_website_restricted_editor"):
            store.add(partner, {"is_user_publisher": True})
        return store.get_result()
