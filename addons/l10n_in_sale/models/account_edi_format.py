# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api, _
from odoo.exceptions import AccessError, ValidationError


class AccountEdiFormat(models.Model):
    _inherit = "account.edi.format"

    def _check_move_configuration(self, move):
        if self.code != "in_einvoice_1_03" and not move.line_ids.sale_line_ids.order_id:
            breakpoint()
            return super()._check_move_configuration(move) 
        return False


    def _l10n_in_edi_post_invoice(self, invoice):
        res = super()._l10n_in_edi_post_invoice(invoice)
        breakpoint()
        if not res[invoice]['success']:
            error_message = self.l10n_in_edi_check_error_message(invoice)
            return {invoice: {
                    "success": False,
                    "error": error_message,
                    "blocking_level": "warning",
                }}
        return res

    def l10n_in_edi_check_error_message(self, invoice):
        error_message = []
        for line in invoice.invoice_line_ids.filtered(lambda line: line.display_type not in ('line_note', 'line_section', 'rounding')):
            if hsn_error_message := line._l10n_in_check_invalid_hsn_code():
                error_message.append(hsn_error_message)
        return error_message