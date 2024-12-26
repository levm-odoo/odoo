# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import re
from odoo import models, fields, api, _
from odoo.exceptions import AccessError, ValidationError


class AccountEdiFormat(models.Model):
    _inherit = "account.edi.format"

    def _check_move_configuration(self, move):
        if self.code == "in_einvoice_1_03":
            if move.line_ids.sale_line_ids.order_id:
                return False
        return super()._check_move_configuration(move)


    def _l10n_in_edi_post_invoice(self, invoice):
        res = super()._l10n_in_edi_post_invoice(invoice)
        if not res[invoice]['success']:
            hsn_error_message = self.l10n_in_edi_check_error_message(invoice)
            if hsn_error_message:
                res[invoice]['error'] += ' '.join(hsn_error_message)
        return res

    def l10n_in_edi_check_error_message(self, invoice):
        error_message = []
        for line in invoice.invoice_line_ids.filtered(lambda line: line.display_type not in ('line_note', 'line_section', 'rounding')):
            if line.product_id:
                hsn_code = self._l10n_in_edi_extract_digits(line.product_id.l10n_in_hsn_code)
                if not hsn_code:
                    error_message.append(_("HSN code is not set in product %s", line.product_id.name))
                elif not re.match("^[0-9]+$", hsn_code):
                    error_message.append(_(
                        "Invalid HSN Code (%s) in product %s", hsn_code, line.product_id.name
                    ))
            else:
                error_message.append(_("product is required to get HSN code"))
        return error_message