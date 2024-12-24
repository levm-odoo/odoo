# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.http import request
from odoo.addons.mail.controllers import thread
from odoo.addons.portal.utils import get_portal_partner


class ThreadController(thread.ThreadController):

    def _prepare_post_data(self, post_data, thread, **kwargs):
        post_data = super()._prepare_post_data(post_data, thread, **kwargs)
        if request.env.user._is_public():
            if partner := get_portal_partner(
                thread, kwargs.get("hash"), kwargs.get("pid"), kwargs.get("token")
            ):
                post_data["author_id"] = partner.id
        return post_data

    @classmethod
    def _can_edit_message(self, message, **access_params):
        self.ensure_one()
        if message.model and message.res_id and message.env.user._is_public():
            thread = request.env[message.model].browse(message.res_id)
            partner = get_portal_partner(
                thread,
                _hash=access_params.get('hash'), pid=access_params.get('pid'),
                token=access_params.get('token'))
            if partner and message.author_id == partner:
                return True
        return super()._can_edit_message(message, access_params=access_params)
