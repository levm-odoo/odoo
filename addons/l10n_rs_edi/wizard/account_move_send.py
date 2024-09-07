from odoo import _, api, fields, models, SUPERUSER_ID
from odoo.exceptions import ValidationError


class AccountMoveSend(models.TransientModel):
    _inherit = 'account.move.send'

    l10n_rs_edi_send_enable = fields.Boolean(compute="_compute_l10n_rs_edi_send_enable")
    l10n_rs_edi_send_readonly = fields.Boolean(compute="_compute_l10n_rs_edi_send_readonly")
    l10n_rs_edi_send_checkbox = fields.Boolean(
        string="eFaktura",
        compute="_compute_l10n_rs_edi_send_checkbox",
        store=True, readonly=False,
        help="Send the E-Invoice to Government via eFaktura"
        )
    l10n_rs_edi_send_cir_checkbox = fields.Boolean(
        string="Send To CIR",
        default=False,
        help="Send to Central Invoice Register(For B2G and the public sector)"
    )

    @api.depends('move_ids.l10n_rs_edi_state')
    def _compute_l10n_rs_edi_send_readonly(self):
        for wizard in self:
            wizard.l10n_rs_edi_send_readonly = all(move.l10n_rs_edi_state == 'sent' for move in wizard.move_ids)

    @api.depends('move_ids.l10n_rs_edi_is_eligible')
    def _compute_l10n_rs_edi_send_enable(self):
        for wizard in self:
            wizard.l10n_rs_edi_send_enable = any(move.l10n_rs_edi_is_eligible for move in wizard.move_ids)

    @api.depends('l10n_rs_edi_send_readonly')
    def _compute_l10n_rs_edi_send_checkbox(self):
        for wizard in self:
            wizard.l10n_rs_edi_send_checkbox = not wizard.l10n_rs_edi_send_readonly

    @api.onchange('l10n_rs_edi_send_checkbox')
    def _onchange_l10n_rs_edi_send_checkbox(self):
        if not self.l10n_rs_edi_send_checkbox:
            self.l10n_rs_edi_send_cir_checkbox = False

    def _get_wizard_values(self):
        # EXTENDS 'account'
        vals = super()._get_wizard_values()
        vals['l10n_rs_edi_send'] = self.l10n_rs_edi_send_checkbox
        return vals

    @api.model
    def _get_wizard_vals_restrict_to(self, only_options):
        # EXTENDS 'account'
        values = super()._get_wizard_vals_restrict_to(only_options)
        return {
            'l10n_rs_edi_send_checkbox': False,
            **values,
        }

    @api.model
    def _need_invoice_document(self, invoice):
        # EXTENDS 'account'
        return super()._need_invoice_document(invoice) and not invoice.l10n_rs_edi_attachment_id

    @api.model
    def _get_invoice_extra_attachments(self, invoice):
        # EXTENDS 'account'
        return super()._get_invoice_extra_attachments(invoice) + invoice.l10n_rs_edi_attachment_id

    @api.model
    def _call_web_service_after_invoice_pdf_render(self, invoices_data):
        # EXTENDS 'account'
        super()._call_web_service_after_invoice_pdf_render(invoices_data)
        for invoice, invoice_data in invoices_data.items():
            # Not all invoices may need EDI.
            if not invoice_data.get("l10n_rs_edi_send") or not invoice.l10n_rs_edi_is_eligible:
                continue
            if error := self._validate_l10n_rs_edi_required_info(invoice):
                invoice_data["error"] = {
                    "error_title": _("The following information is missing:"),
                    "errors": error,
                }
                continue
            xml, errors = self.env['account.edi.xml.ubl.rs']._export_invoice(invoice)
            if errors:
                invoice_data["error"] = {
                    "error_title": _("Errors when generating the UBL document:"),
                    "errors": errors,
                }
                continue
            else:
                invoice_data['l10n_rs_edi_attachement_values'] = invoice._l10n_rs_edi_get_attachment_values(xml)

            if error := invoice._l10n_rs_edi_send(xml, self.l10n_rs_edi_send_cir_checkbox):
                invoice_data["error"] = {
                    "error_title": _("Errors when submitting the e-invoice to eFaktura:"),
                    "errors": [error],
                }

            if self._can_commit():
                self._cr.commit()

    def _validate_l10n_rs_edi_required_info(self, invoice):
        if not invoice.company_id.l10n_rs_edi_api_key:
            return _("eFaktura API Key is missing.")

    @api.model
    def _link_invoice_documents(self, invoice, invoice_data):
        # EXTENDS 'account'
        super()._link_invoice_documents(invoice, invoice_data)
        if attachment_values := invoice_data.get('l10n_rs_edi_attachement_values'):
            self.env['ir.attachment'].with_user(SUPERUSER_ID).create(attachment_values)
            invoice.invalidate_recordset(fnames=['l10n_rs_edi_attachment_id', 'l10n_rs_edi_attachment_file'])
