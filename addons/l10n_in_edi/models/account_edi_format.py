# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re
import json
import markupsafe
import logging

from collections import defaultdict
from markupsafe import Markup

from odoo import models, fields, api, _
from odoo.tools import html_escape, float_is_zero, float_compare
from odoo.exceptions import AccessError, ValidationError
from odoo.addons.iap import jsonrpc

_logger = logging.getLogger(__name__)


class AccountEdiFormat(models.Model):
    _inherit = "account.edi.format"

    def _is_enabled_by_default_on_journal(self, journal):
        self.ensure_one()
        if self.code == "in_einvoice_1_03":
            # only applicable for taxpayers turnover higher than Rs.5 crore so default on journal is False
            return False
        return super()._is_enabled_by_default_on_journal(journal)

    def _is_compatible_with_journal(self, journal):
        # OVERRIDE
        self.ensure_one()
        if self.code != 'in_einvoice_1_03':
            return super()._is_compatible_with_journal(journal)
        return journal.country_code == 'IN' and journal.type == 'sale'

    def _get_move_applicability(self, move):
        # EXTENDS account_edi
        self.ensure_one()
        if self.code != 'in_einvoice_1_03':
            return super()._get_move_applicability(move)
        is_under_gst = any(move_line_tag.id in self._get_l10n_in_gst_tags() for move_line_tag in move.line_ids.tax_tag_ids)
        if move.is_sale_document(include_receipts=True) and move.country_code == 'IN' and is_under_gst and move.l10n_in_gst_treatment in (
            "regular",
            "composition",
            "overseas",
            "special_economic_zone",
            "deemed_export",
        ):
            return {
                'post': self._l10n_in_edi_post_invoice,
                'cancel': self._l10n_in_edi_cancel_invoice,
                'edi_content': self._l10n_in_edi_xml_invoice_content,
            }

    def _needs_web_services(self):
        self.ensure_one()
        return self.code == "in_einvoice_1_03" or super()._needs_web_services()

    def _l10n_in_edi_xml_invoice_content(self, invoice):
        return json.dumps(self._l10n_in_edi_generate_invoice_json(invoice)).encode()

    def _check_move_configuration(self, move):
        if self.code != "in_einvoice_1_03":
            return super()._check_move_configuration(move)
        error_message = []
        error_message += self._l10n_in_validate_partner(move.partner_id)
        error_message += self._l10n_in_validate_partner(move.company_id.partner_id)
        if not re.match("^.{1,16}$", move.name):
            error_message.append(_("Invoice number should not be more than 16 characters"))
        all_base_tags = self._get_l10n_in_gst_tags() + self._get_l10n_in_non_taxable_tags()
        for line in move.invoice_line_ids.filtered(lambda line: line.display_type not in ('line_note', 'line_section', 'rounding') and not self._l10n_in_is_global_discount(line)):
            if line.display_type == 'product':
                if line.discount < 0:
                    error_message.append(_("Negative discount is not allowed, set in line %s", line.name))
                if hsn_error_message := line._l10n_in_check_invalid_hsn_code():
                    error_message.append(hsn_error_message)
            if not line.tax_tag_ids or not any(move_line_tag.id in all_base_tags for move_line_tag in line.tax_tag_ids):
                error_message.append(_(
                    """Set an appropriate GST tax on line "%s" (if it's zero rated or nil rated then select it also)""", line.product_id.name))
        return error_message

    def _l10n_in_edi_get_iap_buy_credits_message(self):
        url = self.env["iap.account"].get_credits_url(service_name="l10n_in_edi")
        return markupsafe.Markup("""<p><b>%s</b></p><p>%s <a href="%s">%s</a></p>""") % (
            _("You have insufficient credits to send this document!"),
            _("Please buy more credits and retry: "),
            url,
            _("Buy Credits")
        )

    def _l10n_in_edi_cancel_invoice(self, invoice):
        l10n_in_edi_response_json = invoice._get_l10n_in_edi_response_json()
        cancel_json = {
            "Irn": l10n_in_edi_response_json.get("Irn"),
            "CnlRsn": invoice.l10n_in_edi_cancel_reason,
            "CnlRem": invoice.l10n_in_edi_cancel_remarks,
        }
        response = self._l10n_in_edi_cancel(invoice.company_id, cancel_json)
        if response.get("error"):
            error = response["error"]
            error_codes = [e.get("code") for e in error]
            if "1005" in error_codes:
                # Invalid token eror then create new token and send generate request again.
                # This happen when authenticate called from another odoo instance with same credentials (like. Demo/Test)
                authenticate_response = invoice.company_id._l10n_in_edi_authenticate()
                if not authenticate_response.get("error"):
                    error = []
                    response = self._l10n_in_edi_cancel(invoice.company_id, cancel_json)
                    if response.get("error"):
                        error = response["error"]
                        error_codes = [e.get("code") for e in error]
            if "9999" in error_codes:
                response = {}
                error = []
                odoobot = self.env.ref("base.partner_root")
                invoice.message_post(author_id=odoobot.id, body=Markup(_(
                    "Somehow this invoice had been cancelled to government before." \
                    "<br/>Normally, this should not happen too often" \
                    "<br/>Just verify by logging into government website " \
                    "<a href='https://einvoice1.gst.gov.in'>here<a>."
                )))
            if "no-credit" in error_codes:
                return {invoice: {
                    "success": False,
                    "error": self._l10n_in_edi_get_iap_buy_credits_message(),
                    "blocking_level": "error",
                }}
            if error:
                error_message = "<br/>".join([html_escape("[%s] %s" % (e.get("code"), e.get("message"))) for e in error])
                return {invoice: {
                    "success": False,
                    "error": error_message,
                    "blocking_level": ("404" in error_codes) and "warning" or "error",
                }}
        if not response.get("error"):
            json_dump = json.dumps(response.get("data", {}))
            json_name = "%s_cancel_einvoice.json" % (invoice.name.replace("/", "_"))
            attachment = False
            if json_dump:
                attachment = self.env["ir.attachment"].create({
                    "name": json_name,
                    "raw": json_dump.encode(),
                    "res_model": "account.move",
                    "res_id": invoice.id,
                    "mimetype": "application/json",
                })
            return {invoice: {"success": True, "attachment": attachment}}

    def _l10n_in_validate_partner(self, partner):
        self.ensure_one()
        message = []
        if not re.match("^.{3,100}$", partner.street or ""):
            message.append(_("- Street required min 3 and max 100 characters"))
        if partner.street2 and not re.match("^.{3,100}$", partner.street2):
            message.append(_("- Street2 should be min 3 and max 100 characters"))
        if not re.match("^.{3,100}$", partner.city or ""):
            message.append(_("- City required min 3 and max 100 characters"))
        if partner.country_id.code == "IN" and not re.match("^.{3,50}$", partner.state_id.name or ""):
            message.append(_("- State required min 3 and max 50 characters"))
        if partner.country_id.code == "IN" and not re.match("^[0-9]{6,}$", partner.zip or ""):
            message.append(_("- Zip code required 6 digits"))
        if partner.phone and not re.match("^[0-9]{10,12}$",
            self.env['account.move']._l10n_in_extract_digits(partner.phone)
        ):
            message.append(_("- Mobile number should be minimum 10 or maximum 12 digits"))
        if partner.email and (
            not re.match(r"^[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+$", partner.email)
            or not re.match("^.{6,100}$", partner.email)
        ):
            message.append(_("- Email address should be valid and not more then 100 characters"))
        if message:
            message.insert(0, "%s" %(partner.display_name))
        return message
