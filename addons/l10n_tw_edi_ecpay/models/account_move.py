# Part of Odoo. See LICENSE file for full copyright and licensing details.
import base64

from odoo import _, api, fields, models
from odoo.addons.l10n_tw_edi_ecpay.utils import EcPayAPI
from odoo.exceptions import UserError
from urllib.parse import urljoin


class AccountMove(models.Model):
    _inherit = "account.move"

    # ------------------
    # Fields declaration
    # ------------------

    l10n_tw_edi_file_id = fields.Many2one(
        comodel_name="ir.attachment",
        compute=lambda self: self._compute_linked_attachment_id("l10n_tw_edi_file_id", "l10n_tw_edi_file"),
        depends=["l10n_tw_edi_file"],
        copy=False,
        readonly=True,
        export_string_translation=False,
    )
    l10n_tw_edi_file = fields.Binary(
        string="Ecpay JSON File",
        copy=False,
        readonly=True,
        export_string_translation=False,
    )
    l10n_tw_edi_ecpay_invoice_id = fields.Char(string="Ecpay Invoice Number", readonly=True, copy=False)
    l10n_tw_edi_related_number = fields.Char("Related Number", compute="_compute_l10n_tw_edi_related_number",)
    # False => Not sent yet.
    l10n_tw_edi_state = fields.Selection(
        selection=[("invoiced", "Invoiced"), ("valid", "Valid"), ("invalid", "Invalid")],
        string="Invoice Status",
        copy=False,
        readonly=True,
        tracking=True,
    )
    l10n_tw_edi_love_code = fields.Char(string="Love Code", compute="_compute_is_donate", store=True, readonly=False)
    l10n_tw_edi_is_print = fields.Boolean(string="Get Printed Version", compute="_compute_is_print", store=True, readonly=False)
    l10n_tw_edi_carrier_type = fields.Selection(
        selection=[("1", "ECpay e-invoice carrier"), ("2", "Citizen Digital Certificate"), ("3", "Mobile Barcode")],
        string="Carrier Type",
        copy=False,
        compute="_compute_carrier_info",
        store=True,
        readonly=False)
    l10n_tw_edi_carrier_number = fields.Char(string="Carrier Number", compute="_compute_carrier_info", store=True, readonly=False)
    l10n_tw_edi_clearance_mark = fields.Selection(
        selection=[("1", "NOT via the customs"), ("2", "Via the customs")],
        string="Clearance Mark",
        copy=False,
    )
    l10n_tw_edi_invoice_create_date = fields.Datetime(string="Creation Date", readonly=True, copy=False)
    l10n_tw_edi_refund_state = fields.Selection(
        selection=[
            ("to be agreed", "To be agreed"),
            ("agreed", "Agreed"),
            ("disagree", "Disagree"),
        ],
        string="Refund State",
        readonly=True,
        copy=False,
    )
    l10n_tw_edi_refund_agreement_type = fields.Selection(
        [("offline", "Offline Agreement"), ("online", "Online Agreement")],
        default="offline",
        string="Refund invoice Agreement Type",
        required=True,
        copy=False,
    )
    l10n_tw_edi_origin_invoice_number_id = fields.Many2one('account.move', string="Original Invoice", readonly=True, copy=False)
    l10n_tw_edi_refund_invoice_number = fields.Char(string="Refund Invoice Number", readonly=True, copy=False)

    @api.depends("name")
    def _compute_l10n_tw_edi_related_number(self):
        for move in self:
            move.l10n_tw_edi_related_number = base64.urlsafe_b64encode(self.name.encode("utf-8")).decode()

    @api.depends('l10n_tw_edi_love_code', 'l10n_tw_edi_carrier_type')
    def _compute_is_print(self):
        for move in self:
            if move.l10n_tw_edi_love_code or (self.partner_id.vat and move.l10n_tw_edi_carrier_type in [1, 2]):
                move.l10n_tw_edi_is_print = False

    @api.depends('l10n_tw_edi_is_print', 'l10n_tw_edi_carrier_type')
    def _compute_is_donate(self):
        for move in self:
            if move.l10n_tw_edi_is_print or move.l10n_tw_edi_carrier_type or self.partner_id.vat:
                move.l10n_tw_edi_love_code = False

    @api.depends('l10n_tw_edi_is_print', 'l10n_tw_edi_love_code')
    def _compute_carrier_info(self):
        for move in self:
            if move.l10n_tw_edi_is_print or move.l10n_tw_edi_love_code:
                move.l10n_tw_edi_carrier_type = False
                move.l10n_tw_edi_carrier_number = False

    # ----------------
    # Business methods
    # ----------------

    # API methods

    def _l10n_tw_edi_calculate_tax_type(self):
        product_lines = self.invoice_line_ids.filtered(lambda line: line.display_type == 'product')
        if any(tax.amount >= 5.0 for line in product_lines for tax in line.tax_ids):
            return "1"
        elif any(tax.amount == 0.0 for line in product_lines for tax in line.tax_ids):
            return "2"
        return "3"

    def _l10n_tw_edi_prepare_item_list(self, json_data):
        item_list = []
        for line in self.invoice_line_ids.filtered(lambda line: line.display_type == 'product'):
            if len(line.tax_ids.filtered(lambda t: t.amount >= 5.0)) >= 1:
                tax_type = "1"
            elif len(line.tax_ids.filtered(lambda t: t.amount == 0.0)) >= 1:
                tax_type = "2"
            else:
                tax_type = "3"

            item_list.append(
                {
                    "ItemSeq": line.sequence,
                    "ItemName": line.product_id.name[:100],
                    "ItemCount": int(line.quantity),
                    "ItemWord": line.product_uom_id.name[:6],
                    "ItemPrice": int(line.price_total / line.quantity),
                    "ItemTaxType": tax_type,
                    "ItemAmount": int(line.price_total),
                }
            )
        json_data['Items'] = item_list

    def _l10n_tw_edi_generate_invoice_json(self):
        if not self.company_id.l10n_tw_edi_ecpay_merchant_id:
            raise UserError(_("Please fill in the ECpay API information in the Setting!"))

        json_data = {
            "MerchantID": self.company_id.l10n_tw_edi_ecpay_merchant_id,
            "RelateNumber": self.l10n_tw_edi_related_number,
            "CustomerIdentifier": self.partner_id.vat or "",
            "CustomerName": self.partner_id.name,
            "CustomerAddr": self.partner_id.contact_address,
            "CustomerEmail": self.partner_id.email or "",
            "CustomerPhone": self.partner_id.phone or "",
            "ClearanceMark": self.l10n_tw_edi_clearance_mark or "",
            "Print": str(int(self.l10n_tw_edi_is_print or self.partner_id.vat)),
            "Donation": "1" if self.l10n_tw_edi_love_code else "0",
            "LoveCode": self.l10n_tw_edi_love_code or "",
            "TaxType": self._l10n_tw_edi_calculate_tax_type(),
            "SalesAmount": int(self.amount_total),
            "InvoiceRemark": "Odoo",
            "InvType": "07",
            "vat": "0" if self._l10n_tw_edi_calculate_tax_type() == "3" else "1",
            "CarrierType": self.l10n_tw_edi_carrier_type or "",
            "CarrierNum": self.l10n_tw_edi_carrier_number if self.l10n_tw_edi_carrier_type in ["2", "3"] else "",
        }
        self._l10n_tw_edi_prepare_item_list(json_data)

        return json_data

    def _l10n_tw_edi_send(self, json_content):
        """
        Issuing an e-invoice by calling the Ecpay API and update the invoicing result in Odoo
        """
        self.ensure_one()
        # Ensure to lock the records that will be sent, to avoid risking sending them twice.
        self.env["res.company"]._with_locked_records(self)

        ecpay_api = EcPayAPI(self.company_id)
        response_data = ecpay_api.call_ecpay_api("/Issue", json_content)
        if response_data.get("RtnCode") != 1:
            return [_("Invoice '%(name)s' Error: '%(error_message)s'", name=self.name, error_message=response_data.get("RtnMsg"))]
        self.write({
            "l10n_tw_edi_ecpay_invoice_id": response_data.get("InvoiceNo"),
            "l10n_tw_edi_invoice_create_date": ecpay_api._transfer_time(response_data.get("InvoiceDate").replace("+", " ")),  # The date return from Ecpay API used "+" instead of " "
            "l10n_tw_edi_state": "invoiced",
        })
        self._message_log(
            body=_("The invoice has been successfully sent to Ecpay with Ecpay invoice number '%(invoice_number)s'.", invoice_number=response_data.get('InvoiceNo')),
        )

    def _l10n_tw_edi_update_ecpay_invoice_info(self):
        """
        Searching the e-invoice information from Ecpay API and update the invoice information in Odoo
        """
        self.ensure_one()
        # Ensure to lock the records that will be sent, to avoid risking sending them twice.
        self.env["res.company"]._with_locked_records(self)

        json_data = {
            "MerchantID": self.company_id.l10n_tw_edi_ecpay_merchant_id,
            "RelateNumber": self.l10n_tw_edi_related_number,
        }

        response_data = EcPayAPI(self.company_id).call_ecpay_api("/GetIssue", json_data)
        if response_data.get('RtnCode') != 1:
            return [_("Invoice '%(name)s' Error: '%(error_message)s'", name=self.name, error_message=response_data.get("RtnMsg"))]

        self.l10n_tw_edi_state = "valid" if response_data.get("IIS_Invalid_Status") == "0" else "invalid"

    def _l10n_tw_edi_run_invoice_invalid(self):
        """
        Cancelling the e-invoice by calling the Ecpay API and update the invoice information in Odoo
        """
        self.ensure_one()
        if not self.l10n_tw_edi_ecpay_invoice_id:
            raise UserError(_("You cannot invalidate an invoice that was not sent to Ecpay."))
        if self.l10n_tw_edi_state == "invalid":
            raise UserError(_("The invoice: '%(invoice_id)s' has already been invalidated", invoice_id=self.l10n_tw_edi_ecpay_invoice_id))

        json_data = {
            "MerchantID": self.company_id.l10n_tw_edi_ecpay_merchant_id,
            "InvoiceNo": self.l10n_tw_edi_ecpay_invoice_id,
            "InvoiceDate": self.l10n_tw_edi_invoice_create_date.strftime("%Y-%m-%d %H:%M:%S"),
            "Reason": self.name
        }

        response_data = EcPayAPI(self.company_id).call_ecpay_api("/Invalid", json_data)

        if response_data.get("RtnCode") != 1:
            raise UserError(_("Fail to invalidate invoice. Error message: '%(error_message)s'", error_message=response_data.get("RtnMsg")))

        # update the invoice information in Odoo
        self._l10n_tw_edi_update_ecpay_invoice_info()

    def l10n_tw_edi_issue_allowance(self):
        """
        Issuing an allowance by calling the Ecpay API and update the refund invoice information in Odoo
        Two methods to issue the allowance
        1. Endpoint: /Allowance
            General allowance, which requires merchants or sellers to get the agreement from the customer first (not by using ECPay's system)
            and then to send an API request to ECPay to issue an allowance.
        2. Endpoint: /AllowanceByCollegiate
            Sending an API request to ECPay and ECPay will send an e-mail notification with a link to the customer to get his/her agreement
            ONce the customer clicks the link, an allowance will be issued instantly
        """
        self.ensure_one()
        if not self.l10n_tw_edi_ecpay_invoice_id:
            raise UserError(_("You cannot refund an invoice that was not sent to Ecpay."))

        json_data = {}

        if self.l10n_tw_edi_refund_agreement_type == "online":
            if not self.partner_id.email:
                raise UserError(_("Customer email is needed for notification"))
            query_param = "/AllowanceByCollegiate"
            json_data["ReturnURL"] = urljoin(self.env["ir.config_parameter"].sudo().get_param("web.base.url"), f"/invoice/ecpay/agreed_invoice_allowance/{self.id}?access_token={self._portal_ensure_token()}")
        else:
            query_param = "/Allowance"

        if self.partner_id.email:
            json_data["AllowanceNotify"] = "E"
        elif self.partner_id.phone:
            json_data["AllowanceNotify"] = "S"
        else:
            raise UserError(_("Customer email or phone is needed for notification"))

        json_data.update({
            "MerchantID": self.company_id.l10n_tw_edi_ecpay_merchant_id,
            "InvoiceNo": self.l10n_tw_edi_ecpay_invoice_id,
            "InvoiceDate": self.l10n_tw_edi_invoice_create_date.strftime("%Y-%m-%d %H:%M:%S"),
            "NotifyMail": self.partner_id.email if self.partner_id.email else "",
            "NotifyPhone": self.partner_id.phone.replace("+", "").replace(" ", "") if self.partner_id.phone else "",
            "AllowanceAmount": int(self.amount_total),
        })
        self._l10n_tw_edi_prepare_item_list(json_data)

        response_data = EcPayAPI(self.company_id).call_ecpay_api(query_param, json_data)

        if response_data.get("RtnCode") != 1:
            raise UserError(_("Refund ecpay invoice creation fail. Error message: '%(error_message)s'", error_message=response_data.get("RtnMsg")))

        self.write({
            "l10n_tw_edi_refund_invoice_number": response_data.get("IA_Allow_No"),
            "l10n_tw_edi_refund_state": "to be agreed" if self.l10n_tw_edi_refund_agreement_type == "online" else "agreed",
        })
