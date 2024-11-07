# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging
import json
from collections import defaultdict
from markupsafe import Markup
import re

from odoo import _, api, fields, models, SUPERUSER_ID
from odoo.exceptions import AccessError, UserError
from odoo.tools import html_escape, float_is_zero, float_compare

from odoo.addons.l10n_in.models.account_invoice import EDI_CANCEL_REASON

_logger = logging.getLogger(__name__)


class AccountMove(models.Model):
    _inherit = "account.move"

    l10n_in_edi_state = fields.Selection(
        string="E-Invoice(IN) State",
        selection=[
            ('sent', 'Sent'),
            ('cancel', 'Cancelled'),
            ('error', 'Error'),
        ],
        copy=False,
        tracking=True,
        readonly=True,
    )
    l10n_in_irn_number = fields.Char(
        string="Invoice Reference Number(IRN)",
        readonly=True,
        copy=False,
        tracking=True
    )
    l10n_in_edi_attachment_id = fields.Many2one(
        comodel_name='ir.attachment',
        string="E-Invoice(IN) Attachment",
        compute=lambda self: self._compute_linked_attachment_id(
            'l10n_in_edi_attachment_id',
            'l10n_in_edi_attachment_file'
        ),
        depends=['l10n_in_edi_attachment_file']
    )
    l10n_in_edi_attachment_file = fields.Binary(
        string="E-Invoice(IN) File",
        attachment=True,
        copy=False
    )
    l10n_in_edi_cancel_reason = fields.Selection(
        selection=list(EDI_CANCEL_REASON.items()),
        string="E-Invoice(IN) Cancel Reason",
        copy=False
    )
    l10n_in_edi_cancel_remarks = fields.Char("E-Invoice(IN) Cancel Remarks", copy=False)
    l10n_in_edi_show_cancel = fields.Boolean(compute="_compute_l10n_in_edi_show_cancel", string="E-invoice(IN) is sent?")

    def _compute_l10n_in_edi_show_cancel(self):
        for move in self:
            move.l10n_in_edi_show_cancel = (
                move.is_sale_document()
                and move.l10n_in_irn_number
                and move.l10n_in_edi_state == 'sent'
            )

    def _compute_linked_attachment_id(self, attachment_field, binary_field):
        """Helper to retreive Attachment from Binary fields
        This is needed because fields.Many2one('ir.attachment') makes all
        attachments available to the user.
        """
        attachments = self.env['ir.attachment'].search([
            ('res_model', '=', self._name),
            ('res_id', 'in', self.ids),
            ('res_field', '=', binary_field)
        ])
        move_vals = {att.res_id: att for att in attachments}
        for move in self:
            move[attachment_field] = move_vals.get(move._origin.id, False)

    @api.model
    def _get_l10n_in_gst_tags(self):
        return [
            self.env['ir.model.data']._xmlid_to_res_id(f'l10n_in.tax_tag_{xmlid}')
            for xmlid in (
                'base_sgst',
                'base_cgst',
                'base_igst',
                'base_cess',
                'zero_rated'
            )
        ]

    @api.model
    def _get_l10n_in_non_taxable_tags(self):
        return [
            self.env['ir.model.data']._xmlid_to_res_id(f'l10n_in.tax_tag_{xmlid}')
            for xmlid in (
                'exempt',
                'nil_rated',
                'non_gst_supplies'
            )
        ]

    def _l10n_in_check_einvoice_eligible(self):
        self.ensure_one()
        return (
            self.country_code == 'IN'
            and self.is_sale_document(include_receipts=True)
            and self.company_id._l10n_in_edi_has_credentials()
            and self.l10n_in_journal_type == 'sale'
            and self.l10n_in_gst_treatment in (
                'regular',
                'composition',
                'overseas',
                'special_economic_zone',
                'deemed_export',
            )
        )

    def _l10n_in_edi_need_cancel_request(self):
        self.ensure_one()
        return (
            self.country_code == 'IN'
            and self.is_sale_document()
            and self.l10n_in_edi_state == 'sent'
        )

    def _need_cancel_request(self):
        # EXTENDS 'account'
        return super()._need_cancel_request() or self._l10n_in_edi_need_cancel_request()

    def _l10n_in_edi_get_iap_buy_credits_message(self):
        url = self.env["iap.account"].get_credits_url(service_name="l10n_in_edi")
        return Markup("""<p><b>%s</b></p><p>%s <a href="%s">%s</a></p>""") % (
            _("You have insufficient credits to send this document!"),
            _("Please buy more credits and retry: "),
            url,
            _("Buy Credits")
        )

    def button_request_cancel(self):
        if self._l10n_in_edi_need_cancel_request():
            return self.env['l10n.in.edi.cancel'].with_context(
                default_move_id=self.id
            )._get_records_action(name=_("Cancel E-Invoice"), target='new')
        return super().button_request_cancel()

    def _get_l10n_in_edi_response_json(self):
        self.ensure_one()
        if self.l10n_in_edi_attachment_id:
            return json.loads(self.l10n_in_edi_attachment_id.sudo().raw.decode("utf-8"))

    def _l10n_in_edi_send_invoice(self):
        generate_json = self._l10n_in_edi_generate_invoice_json()
        response = self._l10n_in_edi_generate(generate_json)
        if error := response.get('error', {}):
            error_codes = [e.get("code") for e in error]
            if '1005' in error_codes:
                # Invalid token eror then create new token and send generate request again.
                # This happen when authenticate called from another odoo instance with same credentials (like. Demo/Test)
                authenticate_response = self.company_id._l10n_in_edi_authenticate()
                if not authenticate_response.get("error"):
                    response = self._l10n_in_edi_generate(generate_json)
                    if error := response.get("error"):
                        error_codes = [e.get("code") for e in error]
            if '2150' in error_codes:
                # Get IRN by details in case of IRN is already generated
                # this happens when timeout from the Government portal but IRN is generated
                response = self._l10n_in_edi_get_irn_by_details({
                    "doc_type": (
                        (self.move_type == "out_refund" and "CRN")
                        or (self.debit_origin_id and "DBN")
                        or "INV"
                    ),
                    "doc_num": self.name,
                    "doc_date": self.invoice_date and self.invoice_date.strftime("%d/%m/%Y") or False,
                })
                if not response.get("error"):
                    error = []
                    link = Markup("<a href='%s'>%s</a>") % (
                        "https://einvoice1.gst.gov.in/Others/VSignedInvoice",
                        _("here")
                    )
                    self.message_post(
                        author_id=SUPERUSER_ID,
                        body=_(
                            "Somehow this invoice had been submited to government before."
                            "%(br)sNormally, this should not happen too often"
                            "%(br)sJust verify value of invoice by uploade json to government website %(link)s.",
                            br=Markup("<br/>"),
                            link=link
                        )
                    )
            if "no-credit" in error_codes:
                self.l10n_in_edi_state = 'error'
                return self._l10n_in_edi_get_iap_buy_credits_message()
            if error:
                self.l10n_in_edi_state = 'error'
                return "<br/>".join([html_escape("[%s] %s" % (e.get("code"), e.get("message"))) for e in error])
        data = response.get("data", {})
        json_dump = json.dumps(data)
        json_name = "%s_einvoice.json" % (self.name.replace("/", "_"))
        attachment = self.env["ir.attachment"].create({
            'name': json_name,
            'raw': json_dump.encode(),
            'res_model': self._name,
            'res_field': 'l10n_in_edi_attachment_file',
            'res_id': self.id,
            'mimetype': 'application/json',
            'company_id': self.company_id.id,
        })
        self.write({
            'l10n_in_edi_state': 'sent',
            'l10n_in_irn_number': data.get('Irn'),
        })

    def _l10n_in_edi_cancel_invoice(self):
        # l10n_in_edi_response_json = self._get_l10n_in_edi_response_json()
        cancel_json = {
            "Irn": self.l10n_in_irn_number,
            "CnlRsn": self.l10n_in_edi_cancel_reason,
            "CnlRem": self.l10n_in_edi_cancel_remarks,
        }
        response = self._l10n_in_edi_cancel(cancel_json)
        if error := response.get('error'):
            error_codes = [e.get('code') for e in error]
            if '1005' in error_codes:
                # Invalid token eror then create new token and send generate request again.
                # This happen when authenticate called from another odoo instance with same credentials (like. Demo/Test)
                authenticate_response = self.company_id._l10n_in_edi_authenticate()
                if not authenticate_response.get("error"):
                    error = []
                    response = self._l10n_in_edi_cancel(cancel_json)
                    if response.get("error"):
                        error = response["error"]
                        error_codes = [e.get("code") for e in error]
            if '9999' in error_codes:
                response = {}
                error = []
                link = Markup("<a href='%s'>%s</a>") % (
                    "https://einvoice1.gst.gov.in/Others/VSignedInvoice",
                    _("here")
                )
                self.message_post(
                    author_id=SUPERUSER_ID,
                    body=_(
                        "Somehow this invoice had been cancelled to government before."
                        "%(br)sNormally, this should not happen too often"
                        "%(br)sJust verify by logging into government website %(link)s",
                        br=Markup("<br/>"),
                        link=link
                    )
                )
            if 'no-credit' in error_codes:
                return self._l10n_in_edi_get_iap_buy_credits_message(),
            if error:
                self.message_post(
                    author_id=SUPERUSER_ID,
                    body="<br/>".join([html_escape("[%s] %s" % (e.get("code"), e.get("message"))) for e in error])
                )
                return False
        if not response.get("error"):
            json_dump = json.dumps(response.get('data', {}))
            json_name = "%s_cancel_einvoice.json" % (self.name.replace("/", "_"))
            if json_dump:
                attachment = self.env['ir.attachment'].create({
                    'name': json_name,
                    'raw': json_dump.encode(),
                    'res_model': self._name,
                    'res_id': self.id,
                    'mimetype': 'application/json',
                })
            self.message_post(author_id=SUPERUSER_ID, body=_(
                "E-Invoice has been cancelled successfully. Cancellation Reason: %(reason)s and Cancellation Remark: %(remark)s",
                reason=EDI_CANCEL_REASON[self.l10n_in_edi_cancel_reason],
                remark=self.l10n_in_edi_cancel_remarks
            ))
            self.l10n_in_edi_state = 'cancel'

    @api.model
    def _get_l10n_in_edi_partner_details(
            self,
            partner,
            set_vat=True,
            set_phone_and_email=True,
            is_overseas=False,
            pos_state_id=False
    ):
        """
            Create the dictionary based partner details
            if set_vat is true then, vat(GSTIN) and legal name(LglNm) is added
            if set_phone_and_email is true then phone and email is add
            if set_pos is true then state code from partner or passed state_id is added as POS(place of supply)
            if is_overseas is true then pin is 999999 and GSTIN(vat) is URP and Stcd is .
            if pos_state_id is passed then we use set POS
        """
        zip_digits = self._l10n_in_extract_digits(partner.zip)
        partner_details = {
            'Addr1': partner.street or '',
            'Loc': partner.city or '',
            'Pin': zip_digits and int(zip_digits) or '',
            'Stcd': partner.state_id.l10n_in_tin or '',
        }
        if partner.street2:
            partner_details['Addr2'] = partner.street2
        if set_phone_and_email:
            if partner.email:
                partner_details['Em'] = partner.email
            if partner.phone:
                partner_details['Ph'] = self._l10n_in_extract_digits(partner.phone)
        if pos_state_id:
            partner_details['POS'] = pos_state_id.l10n_in_tin or ''
        if set_vat:
            partner_details.update({
                'LglNm': partner.commercial_partner_id.name,
                'GSTIN': partner.vat or 'URP',
            })
        else:
            partner_details['Nm'] = partner.name
        # For no country I would suppose it is India, so not sure this is super right
        if is_overseas and (not partner.country_id or partner.country_id.code != 'IN'):
            partner_details.update({
                "GSTIN": "URP",
                "Pin": 999999,
                "Stcd": "96",
                "POS": "96",
            })
        return partner_details

    def _get_l10n_in_edi_line_details(self, index, line, line_tax_details):
        """
        Create the dictionary with line details
        return {
            account.move.line('1'): {....},
            account.move.line('2'): {....},
            ....
        }
        """
        sign = self.is_inbound() and -1 or 1
        tax_details_by_code = self._get_l10n_in_tax_details_by_line_code(line_tax_details['tax_details'])
        quantity = line.quantity
        full_discount_or_zero_quantity = line.discount == 100.00 or float_is_zero(quantity, 3)
        if full_discount_or_zero_quantity:
            unit_price_in_inr = line.currency_id._convert(
                line.price_unit,
                line.company_currency_id,
                line.company_id,
                line.date or fields.Date.context_today(self)
            )
        else:
            unit_price_in_inr = ((sign * line.balance) / (1 - (line.discount / 100))) / quantity

        if unit_price_in_inr < 0 and quantity < 0:
            # If unit price and quantity both is negative then
            # We set unit price and quantity as positive because
            # government does not accept negative in qty or unit price
            unit_price_in_inr = unit_price_in_inr * -1
            quantity = quantity * -1
        in_round = self._l10n_in_round_value
        return {
            'SlNo': str(index),
            'PrdDesc': (line.product_id.display_name or line.name).replace("\n", ""),
            'IsServc': line.product_id.type == 'service' and 'Y' or 'N',
            'HsnCd': self._l10n_in_extract_digits(line.l10n_in_hsn_code),
            'Qty': in_round(quantity or 0.0, 3),
            'Unit': (
                line.product_uom_id.l10n_in_code
                and line.product_uom_id.l10n_in_code.split('-')[0]
                or 'OTH'
            ),
            # Unit price in company currency and tax excluded so its different then price_unit
            'UnitPrice': in_round(unit_price_in_inr, 3),
            # total amount is before discount
            'TotAmt': in_round(unit_price_in_inr * quantity),
            'Discount': in_round((unit_price_in_inr * quantity) * (line.discount / 100)),
            'AssAmt': in_round(sign * line.balance),
            'GstRt': in_round(
                tax_details_by_code.get('igst_rate', 0.00)
                or (
                    tax_details_by_code.get('cgst_rate', 0.00)
                    + tax_details_by_code.get('sgst_rate', 0.00)
                ),
                3
            ),
            'IgstAmt': in_round(tax_details_by_code.get('igst_amount', 0.00)),
            'CgstAmt': in_round(tax_details_by_code.get('cgst_amount', 0.00)),
            'SgstAmt': in_round(tax_details_by_code.get('sgst_amount', 0.00)),
            'CesRt': in_round(tax_details_by_code.get('cess_rate', 0.00), 3),
            'CesAmt': in_round(tax_details_by_code.get('cess_amount', 0.00)),
            'CesNonAdvlAmt': in_round(
                tax_details_by_code.get('cess_non_advol_amount', 0.00)
            ),
            'StateCesRt': in_round(tax_details_by_code.get('state_cess_rate_amount', 0.00), 3),
            'StateCesAmt': in_round(tax_details_by_code.get('state_cess_amount', 0.00)),
            'StateCesNonAdvlAmt': in_round(
                tax_details_by_code.get('state_cess_non_advol_amount', 0.00)
            ),
            'OthChrg': in_round(tax_details_by_code.get('other_amount', 0.00)),
            'TotItemVal': in_round((sign * line.balance) + line_tax_details.get('tax_amount', 0.00)),
        }

    def _l10n_in_edi_generate_invoice_json_managing_negative_lines(self, json_payload):
        """Set negative lines against positive lines as discount with same HSN code and tax rate

            With negative lines

            product name | hsn code | unit price | qty | discount | total
            =============================================================
            product A    | 123456   | 1000       | 1   | 100      |  900
            product B    | 123456   | 1500       | 2   | 0        | 3000
            Discount     | 123456   | -300       | 1   | 0        | -300

            Converted to without negative lines

            product name | hsn code | unit price | qty | discount | total
            =============================================================
            product A    | 123456   | 1000       | 1   | 100      |  900
            product B    | 123456   | 1500       | 2   | 300      | 2700

            totally discounted lines are kept as 0, though
        """
        def discount_group_key(line_vals):
            return "%s-%s" % (line_vals['HsnCd'], line_vals['GstRt'])

        def put_discount_on(discount_line_vals, other_line_vals):
            discount = discount_line_vals['AssAmt'] * -1
            discount_to_allow = other_line_vals['AssAmt']
            in_round = self._l10n_in_round_value
            amount_keys = (
                'AssAmt', 'IgstAmt', 'CgstAmt', 'SgstAmt', 'CesAmt',
                'CesNonAdvlAmt', 'StateCesAmt', 'StateCesNonAdvlAmt',
                'OthChrg', 'TotItemVal'
            )
            if float_compare(discount_to_allow, discount, precision_rounding=self.currency_id.rounding) < 0:
                # Update discount line, needed when discount is more then max line, in short remaining_discount is not zero
                discount_line_vals.update({
                    key: in_round(discount_line_vals[key] + other_line_vals[key])
                    for key in amount_keys
                })
                other_line_vals['Discount'] = in_round(other_line_vals['Discount'] + discount_to_allow)
                other_line_vals.update(dict.fromkeys(amount_keys, 0.00))
                return False
            other_line_vals['Discount'] = in_round(other_line_vals['Discount'] + discount)
            other_line_vals.update({
                key: in_round(other_line_vals[key] + discount_line_vals[key])
                for key in amount_keys
            })
            return True

        discount_lines = []
        for discount_line in json_payload['ItemList'].copy(): #to be sure to not skip in the loop:
            if discount_line['AssAmt'] < 0:
                discount_lines.append(discount_line)
                json_payload['ItemList'].remove(discount_line)
        if not discount_lines:
            return json_payload
        self.message_post(
            author_id=SUPERUSER_ID,
            body=_("Negative lines will be decreased from positive invoice lines having the same taxes and HSN code")
        )

        lines_grouped_and_sorted = defaultdict(list)
        for line in sorted(json_payload['ItemList'], key=lambda i: i['AssAmt'], reverse=True):
            lines_grouped_and_sorted[discount_group_key(line)].append(line)

        for discount_line in discount_lines:
            apply_discount_on_lines = lines_grouped_and_sorted.get(discount_group_key(discount_line), [])
            for apply_discount_on in apply_discount_on_lines:
                if put_discount_on(discount_line, apply_discount_on):
                    break
        return json_payload

    def _l10n_in_edi_generate_invoice_json(self):
        self.ensure_one()
        tax_details = self._l10n_in_prepare_tax_details()
        seller_buyer = self._get_l10n_in_seller_buyer_party()
        tax_details_by_code = self._get_l10n_in_tax_details_by_line_code(tax_details['tax_details'])
        is_intra_state = self.l10n_in_state_id == self.company_id.state_id
        is_overseas = self.l10n_in_gst_treatment == "overseas"
        line_ids = []
        global_discount_line_ids = []
        for line in self.invoice_line_ids:
            if line.display_type in ('line_note', 'line_section'):
                continue
            if line._l10n_in_is_global_discount():
                global_discount_line_ids.append(line.id)
            else:
                line_ids.append(line.id)
        MoveLines = self.env['account.move.line']
        lines = MoveLines.browse(line_ids)
        global_discount_line = MoveLines.browse(global_discount_line_ids)
        tax_details_per_record = tax_details['tax_details_per_record']
        sign = self.is_inbound() and -1 or 1
        rounding_amount = sum(line.balance for line in self.line_ids if line.display_type == 'rounding') * sign
        global_discount_amount = sum(line.balance for line in global_discount_line) * -sign
        in_round = self._l10n_in_round_value
        json_payload = {
            "Version": "1.1",
            "TranDtls": {
                "TaxSch": "GST",
                "SupTyp": self._l10n_in_get_supply_type(tax_details_by_code.get('igst_amount')),
                "RegRev": tax_details_by_code.get('is_reverse_charge') and "Y" or "N",
                "IgstOnIntra": is_intra_state and tax_details_by_code.get('igst_amount') and "Y" or "N",
            },
            "DocDtls": {
                "Typ": (self.move_type == "out_refund" and "CRN") or (self.debit_origin_id and "DBN") or "INV",
                "No": self.name,
                "Dt": self.invoice_date.strftime("%d/%m/%Y")
            },
            "SellerDtls": self._get_l10n_in_edi_partner_details(seller_buyer['seller_details']),
            "BuyerDtls": self._get_l10n_in_edi_partner_details(
                seller_buyer['buyer_details'],
                pos_state_id=self.l10n_in_state_id,
                is_overseas=is_overseas
            ),
            "ItemList": [
                self._get_l10n_in_edi_line_details(
                    index,
                    line,
                    tax_details_per_record.get(line, {})
                )
                for index, line in enumerate(lines, start=1)
            ],
            "ValDtls": {
                "AssVal": in_round(tax_details['base_amount'] + global_discount_amount),
                "CgstVal": in_round(tax_details_by_code.get("cgst_amount", 0.00)),
                "SgstVal": in_round(tax_details_by_code.get("sgst_amount", 0.00)),
                "IgstVal": in_round(tax_details_by_code.get("igst_amount", 0.00)),
                "CesVal": in_round((
                    tax_details_by_code.get("cess_amount", 0.00)
                    + tax_details_by_code.get("cess_non_advol_amount", 0.00)),
                ),
                "StCesVal": in_round((
                    tax_details_by_code.get("state_cess_amount", 0.00)
                    + tax_details_by_code.get("state_cess_non_advol_amount", 0.00)), # clean this up =p
                ),
                "Discount": in_round(global_discount_amount),
                "RndOffAmt": in_round(
                    rounding_amount),
                "TotInvVal": in_round(
                    (tax_details.get("base_amount") + tax_details.get("tax_amount") + rounding_amount)),
            },
        }
        if self.company_currency_id != self.currency_id:
            json_payload["ValDtls"].update({
                "TotInvValFc": in_round(
                    (tax_details.get("base_amount_currency") + tax_details.get("tax_amount_currency")))
            })
        if seller_buyer['seller_details'] != seller_buyer['dispatch_details']:
            json_payload['DispDtls'] = self._get_l10n_in_edi_partner_details(
                seller_buyer['dispatch_details'],
                set_vat=False,
                set_phone_and_email=False
            )
        if seller_buyer['buyer_details'] != seller_buyer['ship_to_details']:
            json_payload['ShipDtls'] = self._get_l10n_in_edi_partner_details(
                seller_buyer['ship_to_details'],
                is_overseas=is_overseas
            )
        if is_overseas:
            json_payload['ExpDtls'] = {
                'RefClm': tax_details_by_code.get('igst_amount') and 'Y' or 'N',
                'ForCur': self.currency_id.name,
                'CntCode': seller_buyer['buyer_details'].country_id.code or '',
            }
            if shipping_bill_no := self.l10n_in_shipping_bill_number:
                json_payload['ExpDtls']['ShipBNo'] = shipping_bill_no
            if shipping_bill_date := self.l10n_in_shipping_bill_date:
                json_payload['ExpDtls']['ShipBDt'] = shipping_bill_date.strftime("%d/%m/%Y")
            if shipping_port_code_id := self.l10n_in_shipping_port_code_id:
                json_payload['ExpDtls']['Port'] = shipping_port_code_id.code
        return self._l10n_in_edi_generate_invoice_json_managing_negative_lines(json_payload)

    def _l10n_in_get_supply_type(self, is_igst_amount):
        if self.l10n_in_gst_treatment in ("overseas", "special_economic_zone") and is_igst_amount:
            return {
                'overseas': 'EXPWP',
                'special_economic_zone': 'SEZWP',
            }[self.l10n_in_gst_treatment]
        return {
            'deemed_export': 'DEXP',
            'overseas': 'EXPWOP',
            'special_economic_zone': 'SEZWOP',
        }.get(self.l10n_in_gst_treatment, 'B2B')

    # ================= Get Error =================
    def _l10n_in_check_einvoice_validation(self):
        alerts = {
            **self.company_id._l10n_in_check_einvoice_validation(),
            **(self.partner_id | self.partner_shipping_id)._l10n_in_check_einvoice_validation(),
            **self.invoice_line_ids._l10n_in_check_einvoice_validation(),
        }
        if invalid_records := self.filtered(lambda m: not re.match("^.{1,16}$", m.name)):
            alerts['l10n_in_edi_invalid_invoice_number'] = {
                'message': _("Invoice number should not be more than 16 characters"),
                'action_text': _("View Invoices"),
                'action': invalid_records._get_records_action(name=_("Check Invoices")),
            }
        return alerts


    #================================ API methods ===========================

    @api.model
    def _l10n_in_edi_no_config_response(self):
        return {'error': [{
            'code': '0',
            'message': _(
                "Ensure GST Number set on company setting and API are Verified."
            )}
        ]}

    def _l10n_in_edi_connect_to_server(self, url_path, params):
        company = self.company_id
        params.update({
            "username": company.sudo().l10n_in_edi_username,
            "gstin": company.vat,
        })
        try:
            return self.env['iap.account']._l10n_in_connect_to_server(
              company.sudo().l10n_in_edi_production_env,
              params,
              url_path,
              "l10n_in_edi.endpoint"
            )
        except AccessError as e:
            _logger.warning("Connection error: %s", e.args[0])
            return {
                "error": [{
                    "code": "404",
                    "message": _(
                        "Unable to connect to the online E-invoice service."
                        "The web service may be temporary down. Please try again in a moment."
                    )
                }]
            }

    def _l10n_in_edi_generate(self, json_payload):
        if not (token := self.company_id._l10n_in_edi_get_token()):
            return self._l10n_in_edi_no_config_response()
        params = {
            "auth_token": token,
            "json_payload": json_payload,
        }
        return self._l10n_in_edi_connect_to_server(url_path="/iap/l10n_in_edi/1/generate", params=params)

    def _l10n_in_edi_get_irn_by_details(self, json_payload):
        if not (token := self.company_id._l10n_in_edi_get_token()):
            return self._l10n_in_edi_no_config_response()
        params = {
            "auth_token": token,
        }
        params.update(json_payload)
        return self._l10n_in_edi_connect_to_server(
            url_path="/iap/l10n_in_edi/1/getirnbydocdetails",
            params=params,
        )

    def _l10n_in_edi_cancel(self, json_payload):
        if not (token := self.company_id._l10n_in_edi_get_token()):
            return self._l10n_in_edi_no_config_response()
        params = {
            "auth_token": token,
            "json_payload": json_payload,
        }
        return self._l10n_in_edi_connect_to_server(
            url_path="/iap/l10n_in_edi/1/cancel",
            params=params
        )
