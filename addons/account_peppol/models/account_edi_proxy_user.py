# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import _, api, fields, models, modules, tools
from odoo.addons.account_edi_proxy_client.models.account_edi_proxy_user import AccountEdiProxyError
from odoo.addons.account_peppol.tools.demo_utils import handle_demo
from odoo.exceptions import UserError

from ..consts import DEFAULT_DOCUMENT_IDENTIFIERS

_logger = logging.getLogger(__name__)


class AccountEdiProxyClientUser(models.Model):
    _inherit = 'account_edi_proxy_client.user'

    peppol_verification_code = fields.Char(string='SMS verification code')
    proxy_type = fields.Selection(selection_add=[('peppol', 'PEPPOL')], ondelete={'peppol': 'cascade'})

    # -------------------------------------------------------------------------
    # HELPER METHODS
    # -------------------------------------------------------------------------

    @handle_demo
    def _make_request(self, url, params=False):
        # extends account_edi_proxy_client to update peppol_proxy_state
        # of archived users
        try:
            result = super()._make_request(url, params)
        except AccountEdiProxyError as e:
            if (
                e.code == 'no_such_user'
                and not self.active
                and not self.company_id.account_edi_proxy_client_ids.filtered(lambda u: u.proxy_type == 'peppol')
            ):
                self.company_id.write({
                    'account_peppol_proxy_state': 'not_registered',
                    'account_peppol_migration_key': False,
                })
                # commit the above changes before raising below
                if not modules.module.current_test:
                    self.env.cr.commit()
            raise AccountEdiProxyError(e.code, e.message)
        return result

    def _get_proxy_urls(self):
        urls = super()._get_proxy_urls()
        urls['peppol'] = {
            'prod': 'https://peppol.api.odoo.com',
            'test': 'https://peppol.test.odoo.com',
            'demo': 'demo',
        }
        return urls

    # -------------------------------------------------------------------------
    # CRONS
    # -------------------------------------------------------------------------

    def _cron_peppol_get_new_documents(self):
        edi_users = self.search([('company_id.account_peppol_proxy_state', '=', 'active')])
        edi_users._peppol_get_new_documents()

    def _cron_peppol_get_message_status(self):
        edi_users = self.search([('company_id.account_peppol_proxy_state', '=', 'active')])
        edi_users._peppol_get_message_status()

    def _cron_peppol_get_participant_status(self):
        edi_users = self.search([('company_id.account_peppol_proxy_state', '=', 'pending')])
        edi_users._peppol_get_participant_status()

    # -------------------------------------------------------------------------
    # BUSINESS ACTIONS
    # -------------------------------------------------------------------------

    def _get_proxy_identification(self, company, proxy_type):
        if proxy_type == 'peppol':
            if not company.peppol_eas or not company.peppol_endpoint:
                raise UserError(
                    _("Please fill in the EAS code and the Participant ID code."))
            return f'{company.peppol_eas}:{company.peppol_endpoint}'
        return super()._get_proxy_identification(company, proxy_type)

    def _peppol_get_new_documents(self):
        params = {
            'domain': {
                'direction': 'incoming',
                'errors': False,
            }
        }
        for edi_user in self:
            proxy_acks = []
            params['domain']['receiver_identifier'] = edi_user.edi_identification
            try:
                # request all messages that haven't been acknowledged
                messages = edi_user._make_request(
                    url=f"{edi_user._get_server_url()}/api/peppol/1/get_all_documents",
                    params=params,
                )
            except AccountEdiProxyError as e:
                _logger.error(
                    'Error while receiving the document from Peppol Proxy: %s', e.message)
                continue

            message_uuids = [
                message['uuid']
                for message in messages.get('messages', [])
            ]
            if not message_uuids:
                continue

            company = edi_user.company_id
            # retrieve attachments for filtered messages
            all_messages = edi_user._make_request(
                f"{edi_user._get_server_url()}/api/peppol/1/get_document",
                {'message_uuids': message_uuids},
            )

            for uuid, content in all_messages.items():
                enc_key = content["enc_key"]
                document_content = content["document"]
                filename = content["filename"] or 'attachment' # default to attachment, which should not usually happen
                partner_endpoint = content["accounting_supplier_party"]
                decoded_document = edi_user._decrypt_data(document_content, enc_key)

                journal_id = company.peppol_purchase_journal_id
                # use the first purchase journal if the Peppol journal is not set up
                # to create the move anyway
                if not journal_id:
                    journal_id = self.env['account.journal'].search([
                        *self.env['account.journal']._check_company_domain(company),
                        ('type', '=', 'purchase')
                    ], limit=1)

                attachment_vals = {
                    'name': f'{filename}.xml',
                    'raw': decoded_document,
                    'type': 'binary',
                    'mimetype': 'application/xml',
                }

                try:
                    attachment = self.env['ir.attachment'].create(attachment_vals)
                    move = journal_id\
                        .with_context(
                            default_move_type='in_invoice',
                            default_peppol_move_state=content['state'],
                            default_extract_can_show_send_button=False,
                            default_peppol_message_uuid=uuid,
                        )\
                        ._create_document_from_attachment(attachment.id)
                    if partner_endpoint:
                        move._message_log(body=_(
                            'Peppol document has been received successfully. Sender endpoint: %s', partner_endpoint))
                    else:
                        move._message_log(body=_('Peppol document has been received successfully'))
                # pylint: disable=broad-except
                except Exception:
                    # if the invoice creation fails for any reason,
                    # we want to create an empty invoice with the attachment
                    move = self.env['account.move'].create({
                        'move_type': 'in_invoice',
                        'peppol_move_state': 'done',
                        'company_id': company.id,
                        'extract_can_show_send_button': False,
                        'peppol_message_uuid': uuid,
                    })
                    attachment_vals.update({
                        'res_model': 'account.move',
                        'res_id': move.id,
                    })
                    self.env['ir.attachment'].create(attachment_vals)

                proxy_acks.append(uuid)

            if not tools.config['test_enable']:
                self.env.cr.commit()
            if proxy_acks:
                edi_user._make_request(
                    f"{edi_user._get_server_url()}/api/peppol/1/ack",
                    {'message_uuids': proxy_acks},
                )

    def _peppol_get_message_status(self):
        for edi_user in self:
            edi_user_moves = self.env['account.move'].search([
                ('peppol_move_state', '=', 'processing'),
                ('company_id', '=', edi_user.company_id.id),
            ])
            if not edi_user_moves:
                continue

            message_uuids = {move.peppol_message_uuid: move for move in edi_user_moves}
            messages_to_process = edi_user._make_request(
                f"{edi_user._get_server_url()}/api/peppol/1/get_document",
                {'message_uuids': list(message_uuids.keys())},
            )

            for uuid, content in messages_to_process.items():
                if uuid == 'error':
                    # this rare edge case can happen if the participant is not active on the proxy side
                    # in this case we can't get information about the invoices
                    edi_user_moves.peppol_move_state = 'error'
                    log_message = _("Peppol error: %s", content['message'])
                    edi_user_moves._message_log_batch(bodies=dict((move.id, log_message) for move in edi_user_moves))
                    continue

                move = message_uuids[uuid]
                if content.get('error'):
                    move.peppol_move_state = 'error'
                    move._message_log(body=_("Peppol error: %s", content['error']['message']))
                    continue

                move.peppol_move_state = content['state']
                move._message_log(body=_('Peppol status update: %s', content['state']))

            if message_uuids:
                edi_user._make_request(
                    f"{edi_user._get_server_url()}/api/peppol/1/ack",
                    {'message_uuids': list(message_uuids.keys())},
                )

    # -------------------------------------------------------------------------
    # PARTICIPANT MANAGEMENT
    # -------------------------------------------------------------------------

    def _peppol_get_participant_status(self):
        for edi_user in self:
            try:
                proxy_user = edi_user._make_request(
                    f"{edi_user._get_server_url()}/api/peppol/2/participant_status")
            except AccountEdiProxyError as e:
                _logger.error('Error while updating Peppol participant status: %s', e)
                continue

            if proxy_user['peppol_state'] in {'receiver', 'rejected', 'canceled'}:
                edi_user.company_id.account_peppol_proxy_state = proxy_user['peppol_state']

    def _peppol_get_supported_document_types(self):
        """Override this function to add supported document types as modules are installed.

        :returns: dictionary of the form: {module_name: [(document identifier, document_name)]}
        """
        return {'default': DEFAULT_DOCUMENT_IDENTIFIERS}

    @api.model
    def _peppol_auto_register_services(self, module):
        """Register new document types for all recipient users.

        This function should be run in the post init hook of any module that extends the supported
        document types.

        :param module: module name, as a string, from which support for the new document types is added.
        """
        receivers = self.search([
            ('proxy_type', '=', 'peppol'),
            ('company_id.account_peppol_proxy_state', '=', 'receiver')
        ])
        for receiver in receivers:
            additional_doctypes = self.env['account.edi.xml.ubl_20']._peppol_get_supported_document_types().get(module, [])
            try:
                receiver._peppol_create_services({
                    document_identifier: {'enabled': True}
                    for document_identifier, _document_name in additional_doctypes
                })
            except Exception as exception: # Broad exception case, so as not to block execution of the rest of the _post_init hook.
                _logger.error(
                    'Auto registration of peppol services for module: %s failed on the user: %s, with exception: %s',
                    module, receiver.edi_identification, exception,
                )
        return

    @api.model
    def _peppol_auto_deregister_services(self, unsupported_identifiers):
        """Unregister a set of document types for all recipient users.

        This function should be run in the uninstall hook of any module that extends the supported
        document types.

        :param unsupported_identifiers: list of document identifiers as strings, from which the
            support for the document types that we are unregistering was provided.
        """
        receivers = self.search([
            ('proxy_type', '=', 'peppol'),
            ('company_id.account_peppol_proxy_state', '=', 'receiver')
        ])
        for receiver in receivers:

            try:
                receiver._peppol_delete_services(unsupported_identifiers)
            except Exception as exception: # Broad exception case, so as not to block execution of the rest of the _post_init hook.
                _logger.error(
                    'Auto deregistration of peppol services for module: %s failed on the user: %s, with exception: %s',
                    module, receiver.edi_identification, exception,
                )
        return

    def _peppol_create_services(self, services=None):
        """Register services on a particular user on the IAP."""
        self.ensure_one()
        if services is None:
            return
        return self._make_request(
            f"{self._get_server_url()}/api/peppol/2/create_services",
            {'services': services},
        )

    def _peppol_get_services(self):
        """Get information from the IAP regarding the Peppol services."""
        self.ensure_one()
        return self._make_request(f"{self._get_server_url()}/api/peppol/2/get_services")

    def _peppol_update_services(self, services=None):
        """Update the IAP with information representing the available services on a user."""
        self.ensure_one()
        if services is None:
            return
        if self.company_id.account_peppol_proxy_state == 'receiver':
            return self._make_request(
                f"{self._get_server_url()}/api/peppol/2/update_services",
                {'services': services}
            )
        return {}

    def _peppol_delete_services(self, services=None):
        """Delete services from a user on the IAP"""
        self.ensure_one()
        if services is None:
            return
        if self.company_id.account_peppol_proxy_state == 'receiver':
            return self._make_request(
                f"{self._get_server_url()}/api/peppol/2/delete_services",
                {'services': services}
            )
        return {}
