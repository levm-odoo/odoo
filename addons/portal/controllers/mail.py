# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from werkzeug import urls
from werkzeug.exceptions import NotFound, Forbidden

from odoo import fields, http, _
from odoo.http import request
from odoo.osv import expression
from odoo.tools import consteq, plaintext2html
from odoo.addons.mail.controllers import mail
from odoo.addons.portal.controllers.portal import CustomerPortal
from odoo.exceptions import AccessError, MissingError, UserError

from functools import reduce


def _check_special_access(res_model, res_id, token='', _hash='', pid=False):
    record = request.env[res_model].browse(res_id).sudo()
    if token:  # Token Case: token is the global one of the document
        token_field = request.env[res_model]._mail_post_token_field
        return (token and record and consteq(record[token_field], token))
    elif _hash and pid:  # Signed Token Case: hash implies token is signed by partner pid
        return consteq(_hash, record._sign_token(pid))
    else:
        raise Forbidden()


def _message_post_helper(res_model, res_id, message, token='', _hash=False, pid=False, nosubscribe=True, **kw):
    """ Generic chatter function, allowing to write on *any* object that inherits mail.thread. We
        distinguish 2 cases:
            1/ If a token is specified, all logged in users will be able to write a message regardless
            of access rights; if the user is the public user, the message will be posted under the name
            of the partner_id of the object (or the public user if there is no partner_id on the object).

            2/ If a signed token is specified (`hash`) and also a partner_id (`pid`), all post message will
            be done under the name of the partner_id (as it is signed). This should be used to avoid leaking
            token to all users.

        Required parameters
        :param string res_model: model name of the object
        :param int res_id: id of the object
        :param string message: content of the message

        Optional keywords arguments:
        :param string token: access token if the object's model uses some kind of public access
                             using tokens (usually a uuid4) to bypass access rules
        :param string hash: signed token by a partner if model uses some token field to bypass access right
                            post messages.
        :param string pid: identifier of the res.partner used to sign the hash
        :param bool nosubscribe: set False if you want the partner to be set as follower of the object when posting (default to True)

        The rest of the kwargs are passed on to message_post()
    """
    record = request.env[res_model].browse(res_id)

    # check if user can post with special token/signed token. The "else" will try to post message with the
    # current user access rights (_mail_post_access use case).
    if token or (_hash and pid):
        pid = int(pid) if pid else False
        if _check_special_access(res_model, res_id, token=token, _hash=_hash, pid=pid):
            record = record.sudo()
        else:
            raise Forbidden()

    # deduce author of message
    author_id = request.env.user.partner_id.id if request.env.user.partner_id else False

    # Token Case: author is document customer (if not logged) or itself even if user has not the access
    if token:
        if request.env.user._is_public():
            # TODO : After adding the pid and sign_token in access_url when send invoice by email, remove this line
            # TODO : Author must be Public User (to rename to 'Anonymous')
            author_id = record.partner_id.id if hasattr(record, 'partner_id') and record.partner_id.id else author_id
        else:
            if not author_id:
                raise NotFound()
    # Signed Token Case: author_id is forced
    elif _hash and pid:
        author_id = pid

    email_from = None
    if author_id and 'email_from' not in kw:
        partner = request.env['res.partner'].sudo().browse(author_id)
        email_from = partner.email_formatted if partner.email else None

    message_post_args = dict(
        body=message,
        message_type=kw.pop('message_type', "comment"),
        subtype_xmlid=kw.pop('subtype_xmlid', "mail.mt_comment"),
        author_id=author_id,
        **kw
    )

    # This is necessary as mail.message checks the presence
    # of the key to compute its default email from
    if email_from:
        message_post_args['email_from'] = email_from

    return record.with_context(mail_create_nosubscribe=nosubscribe).message_post(**message_post_args)


class PortalChatter(http.Controller):

    def _portal_post_filter_params(self):
        return ['token', 'hash', 'pid']

    def _portal_post_check_attachments(self, attachment_ids, attachment_tokens):
        if len(attachment_tokens) != len(attachment_ids):
            raise UserError(_("An access token must be provided for each attachment."))
        for (attachment_id, access_token) in zip(attachment_ids, attachment_tokens):
            try:
                CustomerPortal._document_check_access(self, 'ir.attachment', attachment_id, access_token)
            except (AccessError, MissingError):
                raise UserError(_("The attachment %s does not exist or you do not have the rights to access it.", attachment_id))

    @http.route(['/mail/chatter_post'], type='json', methods=['POST'], auth='public', website=True)
    def portal_chatter_post(self, res_model, res_id, message, attachment_ids=None, attachment_tokens=None, **kw):
        """Create a new `mail.message` with the given `message` and/or `attachment_ids` and return new message values.

        The message will be associated to the record `res_id` of the model
        `res_model`. The user must have access rights on this target document or
        must provide valid identifiers through `kw`. See `_message_post_helper`.
        """
        res_id = int(res_id)

        self._portal_post_check_attachments(attachment_ids, attachment_tokens)

        if message or attachment_ids:
            result = {'default_message': message}
            # message is received in plaintext and saved in html
            if message:
                message = plaintext2html(message)
            post_values = {
                'res_model': res_model,
                'res_id': res_id,
                'message': message,
                'send_after_commit': False,
                'attachment_ids': False,  # will be added afterward
            }
            post_values.update((fname, kw.get(fname)) for fname in self._portal_post_filter_params())
            message = _message_post_helper(**post_values)
            result.update({'default_message_id': message.id})

            if attachment_ids:
                # sudo write the attachment to bypass the read access
                # verification in mail message
                record = request.env[res_model].browse(res_id)
                message_values = {'res_id': res_id, 'model': res_model}
                attachments = record._message_post_process_attachments([], attachment_ids, message_values)

                if attachments.get('attachment_ids'):
                    message.sudo().write(attachments)

                result.update({'default_attachment_ids': message.attachment_ids.sudo().read(['id', 'name', 'mimetype', 'file_size', 'access_token'])})
            return result

    @http.route('/mail/chatter_init', type='json', auth='public', website=True)
    def portal_chatter_init(self, res_model, res_id, domain=False, limit=False, **kwargs):
        is_user_public = request.env.user.has_group('base.group_public')
        message_data = self.portal_message_fetch(res_model, res_id, domain=domain, limit=limit, **kwargs)
        display_composer = False
        if kwargs.get('allow_composer'):
            display_composer = kwargs.get('token') or not is_user_public
        return {
            'grouped_messages': message_data['grouped_messages'],
            'options': {
                'message_count': message_data['message_count'],
                'attachment_ids': message_data['attachment_ids'],
                'is_user_public': is_user_public,
                'is_user_employee': request.env.user.has_group('base.group_user'),
                'is_user_publisher': request.env.user.has_group('website.group_website_publisher'),
                'display_composer': display_composer,
                'partner_id': request.env.user.partner_id.id
            }
        }

    def _prepare_portal_message_fetch_group_by_day(self, messages, message_ids):
        today = fields.Date.context_today(message_ids)
        def add_message_to_grouped_list(msg_groups, message):
            message_id = message_ids.browse(message['id'])
            message_date = message_id.date.date()
            if message_date not in msg_groups.keys():
                msg_groups[message_date] = {
                    'label': _("Today") if message_date == today else message_date.strftime("%B %-d, %Y"),
                    'date': message_date,
                    'messages': [message]
                }
            else:
                msg_groups[message_date]['messages'].append(message)
            return msg_groups
        return list(reduce(add_message_to_grouped_list, messages, {}).values())

    def _prepare_portal_message_fetch_all_attachments(self, messages, message_next_attachments_ids):
        def extract_attachments(attachments, message):
            attachments.extend(message['attachment_ids'])
            return attachments
        attachment_ids = reduce(extract_attachments, messages, [])

        IrAttachmentSudo = request.env['ir.attachment'].sudo()
        def format_attachments(attachments, message_id):
            new_attachments = message_id.attachment_ids._attachment_format()
            for attachment in new_attachments:
                if not attachment.get('access_token'):
                    attachment['access_token'] = IrAttachmentSudo.browse(attachment['id']).generate_access_token()[0]
            attachments.extend(new_attachments)
            return attachments
        attachment_ids = reduce(format_attachments, message_next_attachments_ids, attachment_ids)
        return sorted(attachment_ids, key=lambda attachment: attachment.get('id', 0), reverse=True)

    @http.route('/mail/chatter_fetch', type='json', auth='public', website=True)
    def portal_message_fetch(self, res_model, res_id, domain=False, limit=10, offset=0, **kw):
        if not domain:
            domain = []
        # Only search into website_message_ids, so apply the same domain to perform only one search
        # extract domain from the 'website_message_ids' field
        model = request.env[res_model]
        field = model._fields['website_message_ids']
        field_domain = field.get_domain_list(model)
        domain = expression.AND([domain, field_domain, [('res_id', '=', res_id)]])

        # Check access
        Message = request.env['mail.message']
        if kw.get('token'):
            access_as_sudo = _check_special_access(res_model, res_id, token=kw.get('token'))
            if not access_as_sudo:  # if token is not correct, raise Forbidden
                raise Forbidden()
            # Non-employee see only messages with not internal subtype (aka, no internal logs)
            if not request.env['res.users'].has_group('base.group_user'):
                domain = expression.AND([Message._get_search_domain_share(), domain])
            Message = request.env['mail.message'].sudo()

        message_ids = Message.search(domain, limit=limit, offset=offset, order='date desc')
        messages = message_ids.portal_message_format()
        domain_next_attachment_ids = ['&', ('attachment_ids', '!=', False), ('id', 'not in', message_ids.ids)]
        message_next_attachments_ids = Message.search(expression.AND([domain_next_attachment_ids, domain]))

        return {
            'grouped_messages': self._prepare_portal_message_fetch_group_by_day(messages, message_ids),
            'message_count': Message.search_count(domain),
            'attachment_ids': self._prepare_portal_message_fetch_all_attachments(messages, message_next_attachments_ids)
        }

    @http.route(['/mail/update_is_internal'], type='json', auth="user", website=True)
    def portal_message_update_is_internal(self, message_id, is_internal):
        message = request.env['mail.message'].browse(int(message_id))
        message.write({'is_internal': is_internal})
        return message.is_internal


class MailController(mail.MailController):

    @classmethod
    def _redirect_to_record(cls, model, res_id, access_token=None, **kwargs):
        """ If the current user doesn't have access to the document, but provided
        a valid access token, redirect him to the front-end view.
        If the partner_id and hash parameters are given, add those parameters to the redirect url
        to authentify the recipient in the chatter, if any.

        :param model: the model name of the record that will be visualized
        :param res_id: the id of the record
        :param access_token: token that gives access to the record
            bypassing the rights and rules restriction of the user.
        :param kwargs: Typically, it can receive a partner_id and a hash (sign_token).
            If so, those two parameters are used to authentify the recipient in the chatter, if any.
        :return:
        """
        if issubclass(type(request.env[model]), request.env.registry['portal.mixin']):
            uid = request.session.uid or request.env.ref('base.public_user').id
            record_sudo = request.env[model].sudo().browse(res_id).exists()
            try:
                record_sudo.with_user(uid).check_access_rights('read')
                record_sudo.with_user(uid).check_access_rule('read')
            except AccessError:
                if record_sudo.access_token and access_token and consteq(record_sudo.access_token, access_token):
                    record_action = record_sudo.with_context(force_website=True).get_access_action()
                    if record_action['type'] == 'ir.actions.act_url':
                        pid = kwargs.get('pid')
                        hash = kwargs.get('hash')
                        url = record_action['url']
                        if pid and hash:
                            url = urls.url_parse(url)
                            url_params = url.decode_query()
                            url_params.update([("pid", pid), ("hash", hash)])
                            url = url.replace(query=urls.url_encode(url_params)).to_url()
                        return request.redirect(url)
        return super(MailController, cls)._redirect_to_record(model, res_id, access_token=access_token)
