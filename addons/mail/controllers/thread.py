# Part of Odoo. See LICENSE file for full copyright and licensing details.

from markupsafe import Markup
from werkzeug.exceptions import NotFound

from odoo import http
from odoo.http import request


class ThreadController(http.Controller):

    @http.route("/mail/thread/data/access_rights", methods=["POST"], type="json", auth="user")
    def mail_thread_data_access_rights(self, thread_data):
        """ Returns the access rights of currentuser on the given threads.

        :param thread_data: A dictionary where the key is a model name (string) and the value is a list of integers.
                            Each integer represents the ID of a record with the same model name.
                            Example: {'model_name1': [1, 2, 3], 'model_name2': [4, 5, 6]}
        :type thread_data: dict

        :return: A list of dictionaries. Each dictionary contains the keys 'id', 'model', 'hasReadAccess',
             'hasWriteAccess', and 'canPostOnReadonly'.
        :rtype: list
        """
        res = []
        for thread_model in thread_data:
            threads = request.env[thread_model].with_context(active_test=False).browse(thread_data[thread_model])
            res += [
                dict(id=thread.id, model=thread_model, **ar_data)
                for thread, ar_data in zip(threads, getattr(
                    threads,
                    "_get_mail_thread_data_access_rights",
                    lambda: [{'hasReadAccess': False, 'hasWriteAccess': False}] * len(threads)
                )())
            ]
        return res

    @http.route("/mail/thread/data", methods=["POST"], type="json", auth="user")
    def mail_thread_data(self, thread_model, thread_id, request_list):
        thread = request.env[thread_model].with_context(active_test=False).search([("id", "=", thread_id)])
        return thread._get_mail_thread_data(request_list)

    @http.route("/mail/thread/messages", methods=["POST"], type="json", auth="user")
    def mail_thread_messages(self, thread_model, thread_id, before=None, after=None, around=None, limit=30):
        domain = [
            ("res_id", "=", int(thread_id)),
            ("model", "=", thread_model),
            ("message_type", "!=", "user_notification"),
        ]
        messages = request.env["mail.message"]._message_fetch(domain, before, after, around, limit)
        if not request.env.user._is_public():
            messages.set_message_done()
        return messages.message_format()

    @http.route("/mail/partner/from_email", methods=["POST"], type="json", auth="user")
    def mail_thread_partner_from_email(self, emails, additional_values=None):
        partners = [
            {"id": partner.id, "name": partner.name, "email": partner.email}
            for partner in request.env["res.partner"]._find_or_create_from_emails(emails, additional_values)
        ]
        return partners

    @http.route("/mail/read_subscription_data", methods=["POST"], type="json", auth="user")
    def read_subscription_data(self, follower_id):
        """Computes:
        - message_subtype_data: data about document subtypes: which are
            available, which are followed if any"""
        request.env["mail.followers"].check_access_rights("read")
        follower = request.env["mail.followers"].sudo().browse(follower_id)
        follower.ensure_one()
        request.env[follower.res_model].check_access_rights("read")
        record = request.env[follower.res_model].browse(follower.res_id)
        record.check_access_rule("read")
        # find current model subtypes, add them to a dictionary
        subtypes = record._mail_get_message_subtypes()
        followed_subtypes_ids = set(follower.subtype_ids.ids)
        subtypes_list = [
            {
                "name": subtype.name,
                "res_model": subtype.res_model,
                "sequence": subtype.sequence,
                "default": subtype.default,
                "internal": subtype.internal,
                "followed": subtype.id in followed_subtypes_ids,
                "parent_model": subtype.parent_id.res_model,
                "id": subtype.id,
            }
            for subtype in subtypes
        ]
        return sorted(
            subtypes_list,
            key=lambda it: (it["parent_model"] or "", it["res_model"] or "", it["internal"], it["sequence"]),
        )

    def _get_allowed_message_post_params(self):
        return {"attachment_ids", "body", "message_type", "partner_ids", "subtype_xmlid", "parent_id"}

    @http.route("/mail/message/post", methods=["POST"], type="json", auth="public")
    def mail_message_post(self, thread_model, thread_id, post_data, context=None):
        guest = request.env["mail.guest"]._get_guest_from_request(request)
        guest.env["ir.attachment"].browse(post_data.get("attachment_ids", []))._check_attachments_access(
            post_data.get("attachment_tokens")
        )
        if context:
            request.update_context(**context)
        thread = request.env[thread_model]._get_from_request_or_raise(request, int(thread_id))
        if "body" in post_data:
            post_data["body"] = Markup(post_data["body"])  # contains HTML such as @mentions
        new_partners = []
        if "partner_emails" in post_data:
            new_partners = [record.id for record in request.env["res.partner"]._find_or_create_from_emails(
                post_data["partner_emails"], post_data.get("partner_additional_values", {})
            )]
        post_data["partner_ids"] = list(set((post_data.get("partner_ids", [])) + new_partners))
        message_data = thread.message_post(
            **{key: value for key, value in post_data.items() if key in self._get_allowed_message_post_params()}
        ).message_format()[0]
        if "temporary_id" in request.context:
            message_data["temporary_id"] = request.context["temporary_id"]
        return message_data

    @http.route("/mail/message/update_content", methods=["POST"], type="json", auth="public")
    def mail_message_update_content(self, message_id, body, attachment_ids, attachment_tokens=None, partner_ids=None):
        guest = request.env["mail.guest"]._get_guest_from_request(request)
        guest.env["ir.attachment"].browse(attachment_ids)._check_attachments_access(attachment_tokens)
        message_sudo = guest.env["mail.message"].browse(message_id).sudo().exists()
        if not message_sudo.is_current_user_or_guest_author and not guest.env.user._is_admin():
            raise NotFound()
        if not message_sudo.model or not message_sudo.res_id:
            raise NotFound()
        body = Markup(body) if body else body  # may contain HTML such as @mentions
        guest.env[message_sudo.model].browse([message_sudo.res_id])._message_update_content(
            message_sudo, body, attachment_ids=attachment_ids, partner_ids=partner_ids
        )
        return message_sudo.message_format()[0]
