from io import BytesIO

from odoo import _, api, fields, models


class AccountMoveSend(models.AbstractModel):
    _inherit = 'account.move.send'

    @api.model
    def _is_tr_edi_applicable(self, move):
        return all([
            move.l10n_tr_nilvera_send_status == 'not_sent',
            move.is_invoice(include_receipts=True),
            move.country_code == 'TR',
        ])

    def _get_all_extra_edis(self) -> dict:
        # EXTENDS 'account'
        res = super()._get_all_extra_edis()
        res.update({'l10n_tr_nilvera_einvoice_xml': {'label': _("Send with Nilvera"), 'is_applicable': self._is_mx_edi_applicable}})
        return res

    # -------------------------------------------------------------------------
    # ALERTS
    # -------------------------------------------------------------------------
    def _get_alerts(self, moves, moves_data):
        # EXTENDS 'account'
        alerts = super()._get_alerts(moves, moves_data)
        if tr_moves := moves.filtered(lambda m: 'l10n_tr_nilvera_einvoice_xml' in moves_data[m]['sending_methods']):
            invalid_partners = tr_moves.partner_id.filtered(
                lambda p: p.country_code != 'TR' or not p.city or not p.state_id or not p.street
            )
            if invalid_partners:
                alerts['partner_data_missing'] = {
                    'message':  _("The following partner(s) are either not Turkish or are missing one of those fields: city, state and street."),
                    'action_text': _("View Partner(s)"),
                    'action': invalid_partners._get_records_action(name=_("Check Partner(s)")),
                }
        return alerts

    # -------------------------------------------------------------------------
    # SENDING METHODS
    # -------------------------------------------------------------------------
    def _call_web_service_before_invoice_pdf_render(self, invoices_data):
        # EXTENDS 'account'
        super()._call_web_service_before_invoice_pdf_render(invoices_data)

        for invoice, invoice_data in invoices_data.items():
            if 'l10n_tr_nilvera_einvoice_xml' in invoice_data['extra_edis']:
                attachment_values = invoice_data.get('ubl_cii_xml_attachment_values')
                xml_file = BytesIO(attachment_values.get('raw'))
                xml_file.name = attachment_values.get('name')

                if not invoice.partner_id.l10n_tr_nilvera_customer_alias_id:
                    # If no alias is saved, the user is either an E-Archive user or we haven't checked before. Check again
                    # just in case.
                    invoice.partner_id.check_nilvera_customer()
                customer_alias = invoice.partner_id.l10n_tr_nilvera_customer_alias_id.name
                if customer_alias:  # E-Invoice
                    invoice._l10n_tr_nilvera_submit_einvoice(xml_file, customer_alias)
                else:   # E-Archive
                    invoice._l10n_tr_nilvera_submit_earchive(xml_file)
