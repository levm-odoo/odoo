from odoo import api, fields, models, _
from odoo.exceptions import UserError


class AccountMoveSend(models.TransientModel):
    _inherit = 'account.move.send'

    l10n_es_edi_verifactu_send_enable = fields.Boolean(compute='_compute_l10n_es_edi_verifactu_send_enable')
    l10n_es_edi_verifactu_send_readonly = fields.Boolean(compute='_compute_l10n_es_edi_verifactu_send_readonly')
    l10n_es_edi_verifactu_send_checkbox = fields.Boolean(
        string="Veri*Factu",
        compute='_compute_l10n_es_edi_verifactu_send_checkbox', store=True, readonly=False,
        help="TODO:")
    l10n_es_edi_verifactu_warnings = fields.Char(compute='_compute_l10n_es_edi_verifactu_warnings')  # TODO: remove in saas-17.4

    def _get_wizard_values(self):
        # EXTENDS 'account'
        values = super()._get_wizard_values()
        values['l10n_es_edi_verifactu_send'] = self.l10n_es_edi_verifactu_send_checkbox
        return values

    @api.depends('move_ids.l10n_es_edi_verifactu_state', 'enable_ubl_cii_xml')
    def _compute_l10n_es_edi_verifactu_send_enable(self):
        """ Enable sending in case any move's Verifactur EDI can be send."""
        for wizard in self:
            wizard.l10n_es_edi_verifactu_send_enable = any(
                move.country_code == 'ES' and
                move.l10n_es_edi_verifactu_state != 'sent'  # TODO: substitution flow
                for move in wizard.move_ids
            )

    @api.depends('move_ids.l10n_es_edi_verifactu_state', 'l10n_es_edi_verifactu_send_enable')
    def _compute_l10n_es_edi_verifactu_send_readonly(self):
        """ We shouldn't allow the user to send a new request if any move is currently waiting for an answer. """
        for wizard in self:
            wizard.l10n_es_edi_verifactu_send_readonly = (
                not wizard.l10n_es_edi_verifactu_send_enable
                or 'sent' in wizard.move_ids.mapped('l10n_es_edi_verifactu_state')  # TODO:
            )

    @api.depends('l10n_es_edi_verifactu_send_readonly')
    def _compute_l10n_es_edi_verifactu_send_checkbox(self):
        for wizard in self:
            wizard.l10n_es_edi_verifactu_send_checkbox = not wizard.l10n_es_edi_verifactu_send_readonly

    @api.depends('l10n_es_edi_verifactu_send_readonly')
    def _compute_l10n_es_edi_verifactu_warnings(self):
        """ TODO: in saas-17.4: merge it with `warnings` field using `_compute_warnings`. """
        for wizard in self:
            waiting_moves = wizard.move_ids.filtered(lambda m: m.l10n_es_edi_verifactu_state == 'sent')
            wizard.l10n_es_edi_verifactu_warnings = _(
                "The following move(s) are waiting for answer from the AEAT: %s",
                ', '.join(waiting_moves.mapped('name'))
            ) if waiting_moves else False

    @api.model
    def _call_web_service_after_invoice_pdf_render(self, invoices_data):
        # EXTENDS 'account'
        super()._call_web_service_after_invoice_pdf_render(invoices_data)

        invoices_to_send = self.env['account.move'].browse([
            invoice.id for invoice, invoice_data in invoices_data.items()
            if invoice_data.get('l10n_es_edi_verifactu_send')
        ])

        if not invoices_to_send:
            return

        verifactu_info = invoices_to_send._l10n_es_edi_verifactu_send_registration()

        for invoice, record_info in verifactu_info['record_info'].items():
            errors = record_info['error']
            if errors:
                invoices_data[invoice]['error'] = errors

        # TODO: ?: needed in case no invoices_to_send
        if self._can_commit():
            self._cr.commit()

    @api.model
    def _hook_if_errors(self, moves_data, from_cron=False, allow_fallback_pdf=False):
        """ Post the error messages in the chatter for Veri*Factu moves. """
        # EXTENDS 'account'
        other_moves_data = {}
        any_error = False
        for move, move_data in moves_data.items():
            if move_data.get('l10n_es_edi_verifactu_send'):
                any_error = True
                move_data['download'] = allow_fallback_pdf  # TODO: the PDF attachment will not be generated otherwise
                error = move_data['error']

                # TODO:
                format_as_html = True
                if format_as_html:
                    move.with_context(no_new_invoice=True).message_post(body=self._format_error_html(error))
                else:
                    move.with_context(no_new_invoice=True).message_post(body=self._format_error_text(error))
            else:
                other_moves_data[move] = move_data
        # TODO:
        # if any_error:
        #     raise UserError("There was an error during the Veri*Factu flow. See the chatter of the move for more details.")
        super()._hook_if_errors(other_moves_data, from_cron=from_cron, allow_fallback_pdf=allow_fallback_pdf)
