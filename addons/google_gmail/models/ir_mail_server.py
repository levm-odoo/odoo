# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64

from odoo import _, fields, models, api
from odoo.exceptions import UserError


class IrMail_Server(models.Model):
    """Represents an SMTP server, able to send outgoing emails, with SSL and TLS capabilities."""

    _name = 'ir.mail_server'
    _inherit = ['ir.mail_server', 'google.gmail.mixin']
    _email_field = 'smtp_user'
    _server_type_field = 'smtp_authentication'

    smtp_authentication = fields.Selection(
        selection_add=[('gmail', 'Gmail OAuth Authentication')],
        ondelete={'gmail': 'set default'})

    def _compute_smtp_authentication_info(self):
        gmail_servers, normal_servers = self._split_gmail_servers()
        gmail_servers.smtp_authentication_info = _(
            'Connect your Gmail account with the OAuth Authentication process.  \n'
            'By default, only a user with a matching email address will be able to use this server. '
            'To extend its use, you should set a "mail.default.from" system parameter.')
        super(IrMail_Server, normal_servers)._compute_smtp_authentication_info()

    @api.onchange('smtp_encryption')
    def _onchange_encryption(self):
        """Do not change the SMTP configuration if it's a Gmail server
        (e.g. the port which is already set)"""
        if self.smtp_authentication != 'gmail':
            super()._onchange_encryption()

    @api.onchange('smtp_authentication')
    def _onchange_smtp_authentication_gmail(self):
        if self.smtp_authentication == 'gmail':
            self.smtp_host = 'smtp.gmail.com'
            self.smtp_encryption = 'starttls'
            self.smtp_port = 587
        else:
            self.google_gmail_token_id = False

    @api.onchange('smtp_user', 'smtp_authentication')
    def _on_change_smtp_user_gmail(self):
        """The Gmail mail servers can only be used for the user personal email address."""
        if self.smtp_authentication == 'gmail':
            self.from_filter = self.smtp_user

    @api.constrains('smtp_authentication', 'smtp_pass', 'smtp_encryption', 'from_filter', 'smtp_user')
    def _check_use_google_gmail_service(self):
        gmail_servers = self.filtered(lambda server: server.smtp_authentication == 'gmail')
        for server in gmail_servers:
            if server.smtp_pass:
                raise UserError(_(
                    'Please leave the password field empty for Gmail mail server “%s”. '
                    'The OAuth process does not require it', server.name))

            if server.smtp_encryption != 'starttls':
                raise UserError(_(
                    'Incorrect Connection Security for Gmail mail server “%s”. '
                    'Please set it to "TLS (STARTTLS)".', server.name))

            if not server.smtp_user:
                raise UserError(_(
                    'Please fill the "Username" field with your Gmail username (your email address). '
                    'This should be the same account as the one used for the Gmail OAuthentication Token.'))

    def _smtp_login(self, connection, smtp_user, smtp_password):
        if len(self) == 1 and self.smtp_authentication == 'gmail':
            if not self.google_gmail_token_id:
                raise UserError(_('Please login to your Gmail account.'))
            auth_string = self.google_gmail_token_id._generate_oauth2_string()
            oauth_param = base64.b64encode(auth_string.encode()).decode()
            connection.ehlo()
            connection.docmd('AUTH', f'XOAUTH2 {oauth_param}')
        else:
            super()._smtp_login(connection, smtp_user, smtp_password)
