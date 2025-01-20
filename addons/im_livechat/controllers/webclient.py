# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.http import request, route
from odoo.addons.mail.controllers.webclient import WebclientController
from odoo.addons.mail.tools.discuss import Store


class WebClient(WebclientController):
    @route("/web/tests/livechat", type="http", auth="user")
    def test_external_livechat(self, **kwargs):
        return request.render(
            "im_livechat.unit_embed_suite",
            {
                "server_url": request.env["ir.config_parameter"].get_base_url(),
                "session_info": {"view_info": request.env["ir.ui.view"].get_view_info()},
            },
        )

    def _process_request_for_internal_user(self, store: Store, **kwargs):
        super()._process_request_for_internal_user(store, **kwargs)
        if kwargs.get("livechat_channels"):
            store.add(request.env["im_livechat.channel"].search([]), ["are_you_inside", "name"])

    def _process_request_for_all(self, store: Store, **kwargs):
        super()._process_request_for_all(store, **kwargs)
        if channel_id := kwargs.get("init_livechat"):
            # sudo - discuss.channel: checking if operators are available is allowed.
            channel = request.env["im_livechat.channel"].sudo().browse(channel_id).exists()
            store.add_global_values(livechat_available=bool(channel.available_operator_ids))
            country_id = (
                # sudo - res.country: accessing user country is allowed.
                request.env["res.country"].sudo().search([("code", "=", code)], limit=1)
                if (code := request.geoip.country_code)
                else None
            )
            url = request.httprequest.headers.get("Referer")
            if (
                # sudo - im_livechat.channel.rule: getting channel's rule is allowed.
                matching_rule := request.env["im_livechat.channel.rule"]
                .sudo()
                .match_rule(channel_id, url, country_id)
            ):
                matching_rule = matching_rule.with_context(
                    lang=request.env["chatbot.script"]._get_chatbot_language()
                )
                store.add(matching_rule)
                store.add_global_values(livechat_rule=Store.One(matching_rule))
            if guest := request.env["mail.guest"]._get_guest_from_context():
                store.add_global_values(store_self=Store.One(guest))
