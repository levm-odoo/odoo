import re
from werkzeug.urls import url_quote_plus

from odoo import _, api, fields, models


class AccountMove(models.Model):
    _inherit = 'account.move'

    l10n_es_edi_verifactu_document_ids = fields.Many2many(
        string='Veri*Factu Documents',
        comodel_name='l10n_es_edi_verifactu.document',
        copy=False,
    )
    l10n_es_edi_verifactu_state = fields.Selection(
        string='Veri*Factu Status',
        selection=[
            ('sent', 'Sent'),
            ('rejected', 'Rejected'),
            ('registered_with_errors', 'Registered with Errors'),
            ('accepted', 'Accepted'),
            ('cancelled', 'Cancelled'),
        ],
        compute='_compute_l10n_es_edi_verifactu_state',
        help="""- Sent: Successfully sent to the AEAT, waiting for validation
                - Rejected: Successfully sent to the AEAT, but it was rejected during validation
                - Registered with Errors: Registered by the AEAT, but there are issues with the sent document
                - Accepted: Registered by the AEAT without errors
                - Cancelled: Registered by the AEAT as cancelled""",
    )
    # TODO:?: compute from latest document? rather link to latest document?
    l10n_es_edi_verifactu_attachment_id = fields.Many2one(
        string='Veri*Factu Attachment',
        comodel_name='ir.attachment',
    )
    # TODO: option to enable / disable Veri*Factu / the QR code
    l10n_es_edi_verifactu_qr_code = fields.Char(
        string='Veri*Factu QR Code',
        compute='_compute_l10n_es_edi_verifactu_qr_code',
        help='This QR code is mandatory for Veri*Factu invoices.',
    )
    l10n_es_edi_verifactu_show_cancel_button = fields.Boolean(
        string='Show Veri*Factu Cancel Button',
        compute='_compute_l10n_es_edi_verifactu_show_cancel_button',
    )

    @api.depends('l10n_es_edi_verifactu_document_ids')
    def _compute_l10n_es_edi_verifactu_state(self):
        for move in self:
            relevant_documents = move.l10n_es_edi_verifactu_document_ids.filtered(lambda doc: doc.state).sorted()
            move.l10n_es_edi_verifactu_state = relevant_documents[:1].state

    @api.depends('l10n_es_edi_verifactu_state')
    def _compute_show_reset_to_draft_button(self):
        """ Disallow resetting to draft in case the corresponding billing record is already
            registerd with the AEAT or there is an ongoing registration request."""
        # EXTENDS 'account'
        super()._compute_show_reset_to_draft_button()
        # TODO: always hide if there is a verifactu state?
        for move in self:
            if move.l10n_es_edi_verifactu_state in ('sent', 'registered_with_errors', 'accepted'):
                move.show_reset_to_draft_button = False

    @api.depends('company_id.vat', 'company_id.l10n_es_edi_verifactu_endpoints')
    def _compute_l10n_es_edi_verifactu_qr_code(self):
        super()._compute_show_reset_to_draft_button()
        for move in self:
            record_vals, errors = self.env['l10n_es_edi_verifactu.xml']._export_invoice_vals(move)
            if errors:
                move.l10n_es_edi_verifactu_qr_code = False
            else:
                render_vals, errors = self.env['l10n_es_edi_verifactu.xml']._render_vals(record_vals)
                _path_get = render_vals['_path_get']
                vals = render_vals['vals']
                url = url_quote_plus(
                    f"{move.company_id.l10n_es_edi_verifactu_endpoints['QR']}?"
                    f"nif={_path_get(vals, 'RegistroAlta/IDFactura/IDEmisorFactura')}&"
                    f"numserie={_path_get(vals, 'RegistroAlta/IDFactura/NumSerieFactura')}&"
                    f"fecha={_path_get(vals, 'RegistroAlta/IDFactura/FechaExpedicionFactura')}&"
                    f"importe={_path_get(vals, 'RegistroAlta/ImporteTotal')}"
                   )
                move.l10n_es_edi_verifactu_qr_code = f'/report/barcode/?barcode_type=QR&value={url}&barLevel=M&width=180&height=180'

    @api.depends('l10n_es_edi_verifactu_state')
    def _compute_l10n_es_edi_verifactu_show_cancel_button(self):
        for move in self:
            # TODO:
            move.l10n_es_edi_verifactu_show_cancel_button = move.l10n_es_edi_verifactu_state and move.l10n_es_edi_verifactu_state != 'cancelled'

    def _l10n_es_edi_verifactu_send_registration(self):
        # TODO: maybe better in account.move.send because it uses stuff from there?

        # TODO: ?: check that posted

        # TODO:?: function to create document and XML in 1 call?
        # TODO: maybe make the XML thing a non-stored model? or add a class or sth
        previous_record_render_vals = None  # TODO: obtain previous_record_render_vals for chaining
        batch_info = self.env['l10n_es_edi_verifactu.xml']._export_records_registration_xml(
            self, previous_record_render_vals=previous_record_render_vals
        )

        skipped_records = batch_info['skipped_records']
        record_info = batch_info['record_info']

        # TODO: unlink previously rejected documents
        if batch_info['errors']:  # TODO: currently always empty
            # TODO: error message
            # TODO: just put the message in the record_info['error'] for every invoice?
            message = self.env['account.move.send']._format_error_html({
                'error_title': _("Errors during creation of the Veri*Factu document / XML."),
                'errors': batch_info['errors'],
            })
            self.with_context(no_new_invoice=True).message_post(body=message)
            return batch_info

        # TODO: should not be necessary with better error handling
        for invoice in skipped_records:
            record_info[invoice]['error'] = {
                'error_title': _("Errors during creation of the Veri*Factu document / XML."),
                'errors': record_info['errors'],
            }

        # TODO: rework for multiple moves
        moves_to_send = self - self.browse(skipped_records)
        if not moves_to_send:
            return batch_info
        document = self.env['l10n_es_edi_verifactu.document']._create_document(batch_info['xml'], moves_to_send, 'batch')

        sending_errors = document._send()
        # TODO: split errors and state by record during parsing
        # TODO: adapt the loop below to "per record" info

        for invoice in moves_to_send:
            # TODO: other document states
            if document.state in ('sending_failed', 'rejected'):
                record_info[invoice]['error'] = {
                    'error_title': _("Error(s) when sending the Veri*Factu document to the AEAT:"),
                    # 'errors': document.message_json.get('errors') or [document.message_json['status']],
                    'errors': sending_errors + [f"response: {document.response_message}"],
                }
            if document.state in ('registered_with_errors', 'accepted'):
                record_info[invoice]['error'] = None  # TODO: refactor
                # TODO: attach document to move
                # TODO: refactor
                message = None
                if document.state == 'registered_with_errors':
                    message = self.env['account.move.send']._format_error_html({
                        'error_title': _("The Veri*Factu document was registered with errors by the AEAT."),
                        'errors': sending_errors + [f"response: {document.response_message}"],
                    })
                elif document.state == 'accepted':
                    message = _("The Veri*Factu document was accepted by the AEAT.")
                else:
                    # TODO: not possible at time of writing
                    pass
                if message:
                    self.with_context(no_new_invoice=True).message_post(
                        body=message,
                        attachment_ids=document.xml_attachment_id.copy().ids,  # TODO: why copy?
                    )
                # TODO: attach attachment directly to the move too; only the most recent version though?
        return batch_info

    def _l10n_es_edi_verifactu_send_cancellation(self):
        # TODO: TODO: TODO: refactor together with _l10n_es_edi_verifactu_send_registration
        #   * changes currently:
        #       * fill in 'record_cancel' dict
        #       * post message for skipped_records case instead of relying on the account_move_send stuff doing it
        previous_record_render_vals = None  # TODO:
        batch_info = self.env['l10n_es_edi_verifactu.xml']._export_records_registration_xml(
            self, records_to_cancel=self, previous_record_render_vals=previous_record_render_vals,
        )

        skipped_records = batch_info['skipped_records']
        record_info = batch_info['record_info']

        # TODO: unlink previously rejected documents
        if batch_info['errors']:  # TODO: currently always empty
            # TODO: error message
            # TODO: just put the message in the record_info['error'] for every invoice?
            message = self.env['account.move.send']._format_error_html({
                'error_title': _("Errors during creation of the Veri*Factu document / XML."),
                'errors': batch_info['errors'],
            })
            self.with_context(no_new_invoice=True).message_post(body=message)
            return batch_info

        # TODO: should not be necessary with better error handling
        for invoice in skipped_records:
            error = {
                'error_title': _("Errors during creation of the Veri*Factu document / XML."),
                'errors': record_info[invoice]['errors'],
            }
            record_info[invoice]['error'] = error
            self.with_context(no_new_invoice=True).message_post(
                body=self.env['account.move.send']._format_error_html(error),
            )

        # TODO: rework for multiple moves
        moves_to_send = self - self.browse(skipped_records)
        document = self.env['l10n_es_edi_verifactu.document']._create_document(batch_info['xml'], moves_to_send, 'batch')

        sending_errors = document._send()
        # TODO: split errors and state by record during parsing
        # TODO: adapt the loop below to "per record" info

        for invoice in moves_to_send:
            # TODO: other document states
            if document.state in ('sending_failed', 'rejected'):
                record_info[invoice]['error'] = {
                    'error_title': _("Error(s) when sending the Veri*Factu document to the AEAT:"),
                    # 'errors': document.message_json.get('errors') or [document.message_json['status']],
                    'errors': sending_errors + [f"response: {document.response_message}"],
                }
                self.with_context(no_new_invoice=True).message_post(
                    body=self.env['account.move.send']._format_error_html(record_info[invoice]['error']),
                )
            if document.state in ('registered_with_errors', 'accepted'):
                record_info[invoice]['error'] = None  # TODO: refactor
                # TODO: attach document to move
                # TODO: refactor
                message = None
                if document.state == 'registered_with_errors':
                    message = self.env['account.move.send']._format_error_html({
                        'error_title': _("The Veri*Factu document was registered with errors by the AEAT."),
                        'errors': sending_errors + [f"response: {document.response_message}"],
                    })
                elif document.state == 'accepted':
                    message = _("The Veri*Factu document was accepted by the AEAT.")
                else:
                    # TODO: not possible at time of writing
                    pass
                if message:
                    self.with_context(no_new_invoice=True).message_post(
                        body=message,
                        attachment_ids=document.xml_attachment_id.copy().ids,  # TODO: why copy?
                    )
                # TODO: attach attachment directly to the move too; only the most recent version though?
        return batch_info

    def l10n_es_edi_verifactu_button_cancel(self):
        self._l10n_es_edi_verifactu_send_cancellation()

    def l10n_es_edi_verifactu_button_query_records(self):
        # TODO: make a non-button function (returning verifactu_info); that can be called here

        self.ensure_one()
        verifactu_info = self.env['l10n_es_edi_verifactu.xml']._export_records_query_xml(self)

        if verifactu_info['errors']:
            # TODO: error message
            message = self.env['account.move.send']._format_error_html({
                'error_title': _("Errors during creation of the Veri*Factu document."),
                'errors': verifactu_info['errors'],
            })
            self.with_context(no_new_invoice=True).message_post(body=message)
            return verifactu_info

        document = self.env['l10n_es_edi_verifactu.document']._create_document(verifactu_info['xml'], self, 'query')
        document.document_type = 'query'
        sending_errors = document._send()  # TODO: currently does nothing; errors?

        message = {
            'error_title': _("DOCUMENT STATE NOT IMPLEMENTED"),
            'errors': sending_errors + [f"response: {document.response_message}"],
        }
        if document.state in ('sending_failed', 'rejected'):
            message = self.env['account.move.send']._format_error_html({
                'error_title': _("Error(s) when sending the Veri*Factu document to the AEAT:"),
                'errors': sending_errors + [f"response: {document.response_message}"],
            })
        if document.state in ('registered_with_errors', 'accepted'):
            # TODO: attach document to move
            # TODO: refactor
            # TODO: 'registered_with_errors' should not be possible
            # TODO: make a function that handles return value of sending
            if document.state == 'registered_with_errors':
                message = self.env['account.move.send']._format_error_html({
                'error_title': _("The Veri*Factu document was registered with errors by the AEAT."),
                'errors': sending_errors + [f"response: {document.response_message}"],
            })
            elif document.state == 'accepted':
                message = _("The Veri*Factu document was accepted by the AEAT.")
        self.with_context(no_new_invoice=True).message_post(
            body=message,
            attachment_ids=document.xml_attachment_id.copy().ids,  # TODO: why copy?
        )
        # TODO: attach directly to the move too; only the most recent version though.
