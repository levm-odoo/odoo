# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models


class AccountMoveSend(models.AbstractModel):
    _inherit = 'account.move.send'

    @api.model
    def _is_in_edi_applicable(self, move):
        return all([
            move.company_id.account_fiscal_country_id.code == 'IN'
            # and move._l10n_it_edi_ready_for_xml_export()
            # and move.l10n_it_edi_state != 'rejected'
        ])

    def _get_all_extra_edis(self) -> dict:
        # EXTENDS 'account'
        res = super()._get_all_extra_edis()
        res.update({
            'in_edi_send': {
                'label': _("Send for E-invoicing"),
                'is_applicable': self._is_in_edi_applicable,
                'help': _("Send the e-invoice json to the Indian Invoice Registration Portal (IRP).")
            }
        })
        return res

    # -------------------------------------------------------------------------
    # ALERTS
    # -------------------------------------------------------------------------

    def _get_alerts(self, moves, moves_data):
        # EXTENDS 'account'
        alerts = super()._get_alerts(moves, moves_data)
        if in_moves := moves.filtered(lambda m: 'in_edi_send' in moves_data[m]['extra_edis']): # or moves_data[m]['invoice_edi_format'] == 'it_edi_xml'):
            pass
            # if in_alerts := in_moves._l10n_it_edi_export_data_check():
                # alerts.update(**it_alerts)
        return alerts

    # -------------------------------------------------------------------------
    # SENDING METHODS
    # -------------------------------------------------------------------------

    def _get_invoice_extra_attachments(self, invoice):
        # EXTENDS 'account'
        return super()._get_invoice_extra_attachments(invoice) + invoice.l10n_in_edi_attachment_id

    def _call_web_service_before_invoice_pdf_render(self, invoices_data):
        # EXTENDS 'account'
        super()._call_web_service_before_invoice_pdf_render(invoices_data)
        for invoice, invoice_data in invoices_data.items():
            if 'in_edi_send' in invoice_data['extra_edis']:
                error = invoice._l10n_in_edi_send_invoice()
                if error:
                    pass # TODO: Add error handling
                    # invoice_data['error'] = {
                    #     'error_title': _("Error when sending the invoice to IRP:"),
                    #     'errors': [error],
                    # }
                if self._can_commit():
                    self._cr.commit()
