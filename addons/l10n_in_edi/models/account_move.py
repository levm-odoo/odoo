# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
from collections import defaultdict

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError
from odoo.tools import html_escape, float_is_zero, float_compare


class AccountMove(models.Model):
    _inherit = "account.move"

    l10n_in_edi_state = fields.Selection(
        string="E-Invoice State",
        selection=[
            # ('to_send', 'To Send'),
            # ('processing', 'Invoice is Processing'),
            ('sent', 'Sent'),
            # ('to_cancel', 'To Cancel'),
            ('cancel', 'Cancelled'),
            ('error', 'Error'),
        ],
        copy=False, tracking=True, readonly=True,
    )
    l10n_in_edi_show_send_to_e_invoice = fields.Boolean(
        compute="_compute_l10n_in_edi_show_send_to_e_invoice",
        string="Show Send to E-Invoice button on view?"
    )
    l10n_in_edi_irn = fields.Char(
        string="Invoice Reference Number(IRN)",
        readonly=True,
        copy=False,
    )
    l10n_in_edi_attachment_id = fields.Many2one(
        comodel_name='ir.attachment',
        string="Indian E-Invoice Attachment",
        compute=lambda self: self._compute_linked_attachment_id(
            'l10n_in_edi_attachment_id',
            'l10n_in_edi_attachment_file'
        ),
        depends=['l10n_in_edi_attachment_file']
    )
    l10n_in_edi_attachment_file = fields.Binary(
        string="Indian E-invoice File",
        attachment=True,
        copy=False
    )
    l10n_in_edi_cancel_reason = fields.Selection(
        selection=[
            ("1", "Duplicate"),
            ("2", "Data Entry Mistake"),
            ("3", "Order Cancelled"),
            ("4", "Others"),
        ],
        string="Cancel reason",
        copy=False
    )
    # l10n_in_edi_attachment_file = fields.Binary(copy=False, attachment=True)
    # l10n_in_edi_attachment_id = fields.Many2one(
    #     comodel_name='ir.attachment',
    #     string="IRN Attachment",
    #     compute=lambda self: self._compute_linked_attachment_id('l10n_in_edi_attachment_id', 'l10n_in_edi_attachment_file'),
    #     depends=['l10n_in_edi_attachment_file'],
    # )
    l10n_in_edi_cancel_remarks = fields.Char("Cancel remarks", copy=False)
    # l10n_in_edi_show_cancel = fields.Boolean(compute="_compute_l10n_in_edi_show_cancel", string="E-invoice(IN) is sent?")

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

    def _get_l10n_in_non_taxable_tags(self):
        return [
            self.env['ir.model.data']._xmlid_to_res_id(f'l10n_in.tax_tag_{xmlid}')
            for xmlid in (
                'exempt',
                'nil_rated',
                'non_gst_supplies'
            )
        ]

    def _compute_l10n_in_edi_show_send_to_e_invoice(self):
        for move in self:
            move.l10n_in_edi_show_send_to_e_invoice = (
                move.is_sale_document(include_receipts=True)
                and move.company_id.country_id.code == "IN"
                and move.state == "posted"
                and not move.l10n_in_edi_state
                and move.l10n_in_journal_type == 'sale'
                and move.l10n_in_gst_treatment in (
                    "regular",
                    "composition",
                    "overseas",
                    "special_economic_zone",
                    "deemed_export",
                )
            )

    def _get_l10n_in_edi_response_json(self):
        self.ensure_one()
        if self.l10n_in_edi_attachment_id:
            return json.loads(self.l10n_in_edi_attachment_id.sudo().raw.decode("utf-8"))

    def _l10n_in_edi_send_invoice(self):
        generate_json = self._l10n_in_edi_generate_invoice_json()
        response = self._l10n_in_edi_generate(generate_json)
        error = response.get('error', {})
        if error_codes := [e for e in error.get('code', {})]:
            self.l10n_in_edi_state = 'error'
            if "1005" in error_codes:
                # Invalid token eror then create new token and send generate request again.
                # This happen when authenticate called from another odoo instance with same credentials (like. Demo/Test)
                authenticate_response = invoice.company_id._l10n_in_edi_authenticate()
                if not authenticate_response.get("error"):
                    error = []
                    response = self._l10n_in_edi_generate(generate_json)
                    if response.get("error"):
                        error = response["error"]
                        error_codes = [e.get("code") for e in error]
            if "2150" in error_codes:
                # Get IRN by details in case of IRN is already generated
                # this happens when timeout from the Government portal but IRN is generated
                response = self._l10n_in_edi_get_irn_by_details({
                    "doc_type": move.move_type == "out_refund" and "CRN" or "INV",
                    "doc_num": move.name,
                    "doc_date": move.invoice_date and move.invoice_date.strftime("%d/%m/%Y") or False,
                })
                if not response.get("error"):
                    error = []
                    odoobot = self.env.ref("base.partner_root")
                    invoice.message_post(author_id=odoobot.id, body=Markup(_(
                        "Somehow this invoice had been submited to government before."
                        "<br/>Normally, this should not happen too often"
                        "<br/>Just verify value of invoice by uploade json to government website "
                        "<a href='https://einvoice1.gst.gov.in/Others/VSignedInvoice'>here<a>."
                    )))
            if "no-credit" in error_codes:
                return {self: {
                    "success": False,
                    "error": self._l10n_in_edi_get_iap_buy_credits_message(),
                    "blocking_level": "error",
                }}
            elif error:
                error_message = "<br/>".join([html_escape("[%s] %s" % (e.get("code"), e.get("message"))) for e in error])
                return {invoice: {
                    "success": False,
                    "error": error_message,
                    "blocking_level": ("404" in error_codes) and "warning" or "error",
                }}
        if not response.get("error"):
            self.l10n_in_edi_irn = response.get("data", {}).get("Irn")
            json_dump = json.dumps(response.get("data"))
            json_name = "%s_einvoice.json" % (self.name.replace("/", "_"))
            attachment = self.env["ir.attachment"].create({
                "name": json_name,
                "raw": json_dump.encode(),
                "res_model": self._name,
                "res_field": "l10n_in_edi_attachment_file",
                "res_id": self.id,
                "mimetype": "application/json",
            })
            self.l10n_in_edi_state = "sent"
            # return {invoice: {"success": True, "attachment": attachment}}

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
            "Addr1": partner.street or "",
            "Loc": partner.city or "",
            "Pin": zip_digits and int(zip_digits) or "",
            "Stcd": partner.state_id.l10n_in_tin or "",
        }
        if partner.street2:
            partner_details.update({"Addr2": partner.street2})
        if set_phone_and_email:
            if partner.email:
                partner_details.update({"Em": partner.email})
            if partner.phone:
                partner_details.update({"Ph": self.env['account.move']._l10n_in_extract_digits(partner.phone)})
        if pos_state_id:
            partner_details.update({"POS": pos_state_id.l10n_in_tin or ""})
        if set_vat:
            partner_details.update({
                "LglNm": partner.commercial_partner_id.name,
                "GSTIN": partner.vat or "URP",
            })
        else:
            partner_details.update({"Nm": partner.name or partner.commercial_partner_id.name})
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
        tax_details_by_code = self._get_l10n_in_tax_details_by_line_code(line_tax_details.get("tax_details", {}))
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
        return {
            "SlNo": str(index),
            "PrdDesc": (line.product_id.display_name or line.name).replace("\n", ""),
            "IsServc": line.product_id.type == "service" and "Y" or "N",
            "HsnCd": self._l10n_in_extract_digits(line.l10n_in_hsn_code),
            "Qty": self._l10n_in_round_value(quantity or 0.0, 3),
            "Unit": line.product_uom_id.l10n_in_code and line.product_uom_id.l10n_in_code.split("-")[0] or "OTH",
            # Unit price in company currency and tax excluded so its different then price_unit
            "UnitPrice": self._l10n_in_round_value(unit_price_in_inr, 3),
            # total amount is before discount
            "TotAmt": self._l10n_in_round_value(unit_price_in_inr * quantity),
            "Discount": self._l10n_in_round_value((unit_price_in_inr * quantity) * (line.discount / 100)),
            "AssAmt": self._l10n_in_round_value(sign * line.balance),
            "GstRt": self._l10n_in_round_value(
                tax_details_by_code.get("igst_rate", 0.00)
                or (
                    tax_details_by_code.get("cgst_rate", 0.00)
                    + tax_details_by_code.get("sgst_rate", 0.00)
                ),
                3
            ),
            "IgstAmt": self._l10n_in_round_value(tax_details_by_code.get("igst_amount", 0.00)),
            "CgstAmt": self._l10n_in_round_value(tax_details_by_code.get("cgst_amount", 0.00)),
            "SgstAmt": self._l10n_in_round_value(tax_details_by_code.get("sgst_amount", 0.00)),
            "CesRt": self._l10n_in_round_value(tax_details_by_code.get("cess_rate", 0.00), 3),
            "CesAmt": self._l10n_in_round_value(tax_details_by_code.get("cess_amount", 0.00)),
            "CesNonAdvlAmt": self._l10n_in_round_value(
                tax_details_by_code.get("cess_non_advol_amount", 0.00)
            ),
            "StateCesRt": self._l10n_in_round_value(tax_details_by_code.get("state_cess_rate_amount", 0.00), 3),
            "StateCesAmt": self._l10n_in_round_value(tax_details_by_code.get("state_cess_amount", 0.00)),
            "StateCesNonAdvlAmt": self._l10n_in_round_value(
                tax_details_by_code.get("state_cess_non_advol_amount", 0.00)
            ),
            "OthChrg": self._l10n_in_round_value(tax_details_by_code.get("other_amount", 0.00)),
            "TotItemVal": self._l10n_in_round_value((sign * line.balance) + line_tax_details.get("tax_amount", 0.00)),
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
            return "%s-%s"%(line_vals['HsnCd'], line_vals['GstRt'])

        def put_discount_on(discount_line_vals, other_line_vals):
            discount = discount_line_vals['AssAmt'] * -1
            discount_to_allow = other_line_vals['AssAmt']
            if float_compare(discount_to_allow, discount, precision_rounding=self.currency_id.rounding) < 0:
                # Update discount line, needed when discount is more then max line, in short remaining_discount is not zero
                discount_line_vals.update({
                    'AssAmt': self._l10n_in_round_value(discount_line_vals['AssAmt'] + other_line_vals['AssAmt']),
                    'IgstAmt': self._l10n_in_round_value(discount_line_vals['IgstAmt'] + other_line_vals['IgstAmt']),
                    'CgstAmt': self._l10n_in_round_value(discount_line_vals['CgstAmt'] + other_line_vals['CgstAmt']),
                    'SgstAmt': self._l10n_in_round_value(discount_line_vals['SgstAmt'] + other_line_vals['SgstAmt']),
                    'CesAmt': self._l10n_in_round_value(discount_line_vals['CesAmt'] + other_line_vals['CesAmt']),
                    'CesNonAdvlAmt': self._l10n_in_round_value(discount_line_vals['CesNonAdvlAmt'] + other_line_vals['CesNonAdvlAmt']),
                    'StateCesAmt': self._l10n_in_round_value(discount_line_vals['StateCesAmt'] + other_line_vals['StateCesAmt']),
                    'StateCesNonAdvlAmt': self._l10n_in_round_value(discount_line_vals['StateCesNonAdvlAmt'] + other_line_vals['StateCesNonAdvlAmt']),
                    'OthChrg': self._l10n_in_round_value(discount_line_vals['OthChrg'] + other_line_vals['OthChrg']),
                    'TotItemVal': self._l10n_in_round_value(discount_line_vals['TotItemVal'] + other_line_vals['TotItemVal']),
                })
                other_line_vals.update({
                    'Discount': self._l10n_in_round_value(other_line_vals['Discount'] + discount_to_allow),
                    'AssAmt': 0.00,
                    'IgstAmt': 0.00,
                    'CgstAmt': 0.00,
                    'SgstAmt': 0.00,
                    'CesAmt': 0.00,
                    'CesNonAdvlAmt': 0.00,
                    'StateCesAmt': 0.00,
                    'StateCesNonAdvlAmt': 0.00,
                    'OthChrg': 0.00,
                    'TotItemVal': 0.00,
                })
                return False
            other_line_vals.update({
                'Discount': self._l10n_in_round_value(other_line_vals['Discount'] + discount),
                'AssAmt': self._l10n_in_round_value(other_line_vals['AssAmt'] + discount_line_vals['AssAmt']),
                'IgstAmt': self._l10n_in_round_value(other_line_vals['IgstAmt'] + discount_line_vals['IgstAmt']),
                'CgstAmt': self._l10n_in_round_value(other_line_vals['CgstAmt'] + discount_line_vals['CgstAmt']),
                'SgstAmt': self._l10n_in_round_value(other_line_vals['SgstAmt'] + discount_line_vals['SgstAmt']),
                'CesAmt': self._l10n_in_round_value(other_line_vals['CesAmt'] + discount_line_vals['CesAmt']),
                'CesNonAdvlAmt': self._l10n_in_round_value(other_line_vals['CesNonAdvlAmt'] + discount_line_vals['CesNonAdvlAmt']),
                'StateCesAmt': self._l10n_in_round_value(other_line_vals['StateCesAmt'] + discount_line_vals['StateCesAmt']),
                'StateCesNonAdvlAmt': self._l10n_in_round_value(other_line_vals['StateCesNonAdvlAmt'] + discount_line_vals['StateCesNonAdvlAmt']),
                'OthChrg': self._l10n_in_round_value(other_line_vals['OthChrg'] + discount_line_vals['OthChrg']),
                'TotItemVal': self._l10n_in_round_value(other_line_vals['TotItemVal'] + discount_line_vals['TotItemVal']),
            })
            return True

        discount_lines = []
        for discount_line in json_payload['ItemList'].copy(): #to be sure to not skip in the loop:
            if discount_line['AssAmt'] < 0:
                discount_lines.append(discount_line)
                json_payload['ItemList'].remove(discount_line)
        if not discount_lines:
            return json_payload
        self.message_post(body=_("Negative lines will be decreased from positive invoice lines having the same taxes and HSN code"))

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
        tax_details_by_code = self._get_l10n_in_tax_details_by_line_code(tax_details.get("tax_details", {}))
        is_intra_state = (
            # self.fiscal_position_id
            # and (
            #     self.fiscal_position_id == self.with_company(
            #         self.company_id
            #     ).env['account.chart.template'].ref(
            #         'fiscal_position_in_intra_state',
            #         raise_if_not_found=False
            #     )
            # )
            self.l10n_in_state_id == self.company_id.state_id
        )
        is_overseas = self.l10n_in_gst_treatment == "overseas"
        line_ids = set()
        global_discount_line_ids = set()
        for line in self.invoice_line_ids:
            if line.display_type in ('line_note', 'line_section', 'rounding'):
                continue
            if line._l10n_in_is_global_discount():
                global_discount_line_ids.add(line.id)
            else:
                line_ids.add(line.id)
        MoveLines = self.env['account.move.line']
        lines = MoveLines.browse(line_ids)
        global_discount_line = MoveLines.browse(global_discount_line_ids)
        tax_details_per_record = tax_details.get("tax_details_per_record")
        sign = self.is_inbound() and -1 or 1
        rounding_amount = sum(line.balance for line in self.line_ids if line.display_type == 'rounding') * sign
        global_discount_amount = sum(line.balance for line in global_discount_line) * -sign
        json_payload = {
            "Version": "1.1",
            "TranDtls": {
                "TaxSch": "GST",
                "SupTyp": self._l10n_in_get_supply_type(tax_details_by_code.get('igst_amount')),
                "RegRev": tax_details_by_code.get("is_reverse_charge") and "Y" or "N",
                "IgstOnIntra": is_intra_state and tax_details_by_code.get("igst_amount") and "Y" or "N",
            },
            "DocDtls": {
                "Typ": (self.move_type == "out_refund" and "CRN") or (self.debit_origin_id and "DBN") or "INV",
                "No": self.name,
                "Dt": self.invoice_date.strftime("%d/%m/%Y")
            },
            "SellerDtls": self._get_l10n_in_edi_partner_details(seller_buyer.get("seller_details")),
            "BuyerDtls": self._get_l10n_in_edi_partner_details(
                seller_buyer.get("buyer_details"), pos_state_id=self.l10n_in_state_id, is_overseas=is_overseas),
            "ItemList": [
                self._get_l10n_in_edi_line_details(index, line, tax_details_per_record.get(line, {}))
                for index, line in enumerate(lines, start=1)
            ],
            "ValDtls": {
                "AssVal": self._l10n_in_round_value(tax_details.get("base_amount") + global_discount_amount),
                "CgstVal": self._l10n_in_round_value(tax_details_by_code.get("cgst_amount", 0.00)),
                "SgstVal": self._l10n_in_round_value(tax_details_by_code.get("sgst_amount", 0.00)),
                "IgstVal": self._l10n_in_round_value(tax_details_by_code.get("igst_amount", 0.00)),
                "CesVal": self._l10n_in_round_value((
                    tax_details_by_code.get("cess_amount", 0.00)
                    + tax_details_by_code.get("cess_non_advol_amount", 0.00)),
                ),
                "StCesVal": self._l10n_in_round_value((
                    tax_details_by_code.get("state_cess_amount", 0.00)
                    + tax_details_by_code.get("state_cess_non_advol_amount", 0.00)), # clean this up =p
                ),
                "Discount": self._l10n_in_round_value(global_discount_amount),
                "RndOffAmt": self._l10n_in_round_value(
                    rounding_amount),
                "TotInvVal": self._l10n_in_round_value(
                    (tax_details.get("base_amount") + tax_details.get("tax_amount") + rounding_amount)),
            },
        }
        if self.company_currency_id != self.currency_id:
            json_payload["ValDtls"].update({
                "TotInvValFc": self._l10n_in_round_value(
                    (tax_details.get("base_amount_currency") + tax_details.get("tax_amount_currency")))
            })
        if seller_buyer.get("seller_details") != seller_buyer.get("dispatch_details"):
            json_payload.update({
                "DispDtls": self._get_l10n_in_edi_partner_details(seller_buyer.get("dispatch_details"),
                    set_vat=False, set_phone_and_email=False)
            })
        if seller_buyer.get("buyer_details") != seller_buyer.get("ship_to_details"):
            json_payload.update({
                "ShipDtls": self._get_l10n_in_edi_partner_details(seller_buyer.get("ship_to_details"), is_overseas=is_overseas)
            })
        if is_overseas:
            json_payload.update({
                "ExpDtls": {
                    "RefClm": tax_details_by_code.get("igst_amount") and "Y" or "N",
                    "ForCur": self.currency_id.name,
                    "CntCode": seller_buyer.get("buyer_details").country_id.code or "",
                }
            })
            if self.l10n_in_shipping_bill_number:
                json_payload["ExpDtls"].update({
                    "ShipBNo": self.l10n_in_shipping_bill_number,
                })
            if self.l10n_in_shipping_bill_date:
                json_payload["ExpDtls"].update({
                    "ShipBDt": self.l10n_in_shipping_bill_date.strftime("%d/%m/%Y"),
                })
            if self.l10n_in_shipping_port_code_id:
                json_payload["ExpDtls"].update({
                    "Port": self.l10n_in_shipping_port_code_id.code
                })
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

    # def _l10n_in_edi_get_attachment_values(self, pdf_values=None):
    #     self.ensure_one()
    #     return {
    #         'name': f"{self.name}_einvoice.json",
    #         'type': 'binary',
    #         'mimetype': 'application/json',
    #         'company_id': self.company_id.id,
    #         'res_id': self.id,
    #         'res_model': self._name,
    #         'res_field': 'l10n_in_edi_attachment_file',
    #         'raw': json.dumps(self._l10n_in_edi_generate_invoice_json()),
    #     }

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
        company = self.company_id or self.env.company
        params.update({
            "username": company.sudo().l10n_in_edi_username,
            "gstin": company.vat,
        })
        try:
            return self.env['iap.account']._l10n_in_connect_to_server(
              self.company_id.sudo().l10n_in_edi_production_env,
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
        token = self.company_id._l10n_in_edi_get_token()
        if not token:
            return self._l10n_in_edi_no_config_response()
        params = {
            "auth_token": token,
            "json_payload": json_payload,
        }
        return self._l10n_in_edi_connect_to_server(
            url_path="/iap/l10n_in_edi/1/cancel",
            params=params
        )
