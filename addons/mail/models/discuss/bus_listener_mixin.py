# Part of Odoo. See LICENSE file for full copyright and licensing details.

from markupsafe import Markup

from odoo import models
from odoo.addons.base.models.ir_sequence import _select_nextval
from odoo.addons.mail.tools.discuss import Store


class BusListenerMixin(models.AbstractModel):
    _inherit = "bus.listener.mixin"

    def _bus_send_transient_message(self, channel, content):
        """Posts a fake message in the given ``channel``, only visible for ``self`` listeners."""
        self._bus_send_store(
            Store().add_model_values(
                "mail.message",
                {
                    "author": Store.One(self.env.ref("base.partner_root"), []),
                    "body": Markup("<span class='o_mail_notification'>%s</span>") % content,
                    "id": _select_nextval(self.env.cr, "mail_message_id_seq"),
                    "is_note": True,
                    "is_transient": True,
                    "thread": Store.One(channel, [], as_thread=True),
                },
            ),
            notification_type="discuss.channel/transient_message",
        )
